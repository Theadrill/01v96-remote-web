mod config;
mod midi;
mod state;

use axum::Router;
use socketioxide::SocketIo;
use tower_http::services::ServeDir;
use tracing::info;
use std::sync::Arc;
use tokio::sync::RwLock;

#[derive(serde::Serialize, serde::Deserialize, Debug)]
struct ControlData {
    #[serde(rename = "type")]
    msg_type: String,
    channel: usize,
    value: f64,
}

#[derive(serde::Serialize, serde::Deserialize, Debug)]
struct PanData {
    channel: usize,
    value: f64,
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    // Inicializa o logger
    tracing_subscriber::fmt::init();

    // Estado global da mesa
    let global_state = Arc::new(RwLock::new(state::GlobalState::new()));

    // Carrega configurações dinâmicas
    let app_config = config::AppConfig::load();
    info!("🎧 Configurações carregadas: MIDI In: {}, MIDI Out: {}", app_config.in_idx, app_config.out_idx);

    // Inicializa Engine e Scheduler MIDI
    let (midi_out_tx, mut midi_out_rx) = tokio::sync::mpsc::channel::<Vec<u8>>(100);
    let scheduler = Arc::new(midi::MidiScheduler::new(app_config.scheduler_tick_ms, midi_out_tx));
    scheduler.start().await;
    
    // Fila para receber dados do MIDI (Midi Engine)
    let (midi_in_tx, mut midi_in_rx) = tokio::sync::mpsc::channel::<Vec<u8>>(100);
    
    // Spawn da Engine MIDI (Consumer da fila do Scheduler)
    let in_idx = app_config.in_idx;
    let out_idx = app_config.out_idx;
    tokio::spawn(async move {
        let mut engine = midi::MidiEngine::new();
        if let Err(e) = engine.connect_ports(in_idx, out_idx, midi_in_tx) {
            tracing::error!("Erro ao conectar portas MIDI: {}", e);
        }
        
        while let Some(msg) = midi_out_rx.recv().await {
            engine.send(&msg);
        }
    });

    // Spawn para ler mensagens MIDI vindas da mesa e atualizar o estado (Mock por enquanto)
        let (layer, io) = SocketIo::new_layer();

    let io_clone = io.clone();
    let state_arc_in = global_state.clone();
    tokio::spawn(async move {
        let mut assembler = midi::MidiAssembler::new();
        while let Some(msg) = midi_in_rx.recv().await {
            let packets = assembler.process_input(&msg);
            for packet in packets {
                if let Some(parsed) = midi::protocol::parse_message(&packet) {
                    let mut state = state_arc_in.write().await;
                    state.apply_midi(&parsed);
                    
                    match parsed {
                        midi::protocol::ParsedMidi::MeterData { levels, .. } => {
                            let mut meter_buffer = vec![0; 40];
                            for (ch, val) in levels.iter() {
                                if *ch < 40 {
                                    meter_buffer[*ch] = *val;
                                }
                            }
                            let _ = io_clone.emit("meterData", &meter_buffer);
                        }
                        midi::protocol::ParsedMidi::ControlChange { ref msg_type, channel, value } => {
                            let json = serde_json::json!({
                                "type": msg_type,
                                "channel": channel,
                                "value": value
                            });
                            let _ = io_clone.emit("update", &json);
                        }
                        _ => {}
                    }
                }
            }
        }
    });

    // Configura os handlers básicos
    let scheduler_socket = scheduler.clone();
    io.ns("/", move |socket: socketioxide::extract::SocketRef| async move {
        info!("Cliente web conectado: {}", socket.id);
        
        let state_arc_connect = global_state.clone();
        let config_arc = app_config.clone();
        socket.on("requestConnect", move |socket: socketioxide::extract::SocketRef, _data: socketioxide::extract::Data<serde_json::Value>| async move {
            let state_arc = state_arc_connect.clone();
            let app_config_inner = config_arc.clone();
            tokio::spawn(async move {
                let current_state = state_arc.read().await;
                if let Ok(state_json) = serde_json::to_value(&*current_state) {
                    let response = serde_json::json!({
                        "success": true,
                        "state": state_json,
                        "savedConfig": app_config_inner,
                        "available": {
                            "inputs": [],
                            "outputs": []
                        }
                    });
                    if let Err(e) = socket.emit("connectResult", &response) {
                        tracing::error!("Erro ao enviar connectResult: {}", e);
                    }
                }
            });
        });

        let scheduler_control = scheduler_socket.clone();
        socket.on("control", move |socket: socketioxide::extract::SocketRef, data: socketioxide::extract::Data<ControlData>| async move {
            info!("Controle recebido: {:?}", *data);
            // Broadcast para os outros clientes UI
            if let Ok(val) = serde_json::to_value(&*data) {
                socket.broadcast().emit("update", &val).await.ok();
            }

            let is_binary = data.msg_type.contains("On") || data.msg_type.contains("Solo");
            let mut converter = if is_binary { midi::protocol::Converter::On } else { midi::protocol::Converter::Fader };

            let lower_type = data.msg_type.to_lowercase();
            if lower_type.contains("att") || (data.msg_type.contains("EQ/") && data.msg_type.ends_with('G')) ||
               data.msg_type.contains("Gain") || data.msg_type.contains("Threshold") || data.msg_type.contains("Range") {
                converter = midi::protocol::Converter::Signed;
            }

            if let Some(sysex) = midi::protocol::build_change(&data.msg_type, data.channel as u8, data.value, converter) {
                scheduler_control.enqueue(sysex, 1).await;
            }
        });

        let scheduler_pan = scheduler_socket.clone();
        socket.on("setPan", move |socket: socketioxide::extract::SocketRef, data: socketioxide::extract::Data<PanData>| async move {
            info!("Pan recebido: {:?}", *data);
            if let Ok(val) = serde_json::to_value(&*data) {
                socket.broadcast().emit("updatePan", &val).await.ok();
            }
            if let Some(sysex) = midi::protocol::build_change("kInputPan/kPan", data.channel as u8, data.value, midi::protocol::Converter::Fader) {
                scheduler_pan.enqueue(sysex, 1).await;
            }
        });

        let scheduler_dyn = scheduler_socket.clone();
        socket.on("requestDynamics", move |_socket: socketioxide::extract::SocketRef, data: socketioxide::extract::Data<serde_json::Value>| async move {
            if let Some(ch) = data.get("channel").and_then(|v| v.as_u64()) {
                if let Some(sysex) = midi::protocol::build_request("kInputDyn1/kDynOn", ch as u8) {
                    scheduler_dyn.enqueue(sysex, 2).await;
                }
            }
        });

        let scheduler_eq = scheduler_socket.clone();
        socket.on("requestEqAtt", move |_socket: socketioxide::extract::SocketRef, data: socketioxide::extract::Data<serde_json::Value>| async move {
            if let Some(ch) = data.get("channel").and_then(|v| v.as_u64()) {
                if let Some(sysex) = midi::protocol::build_request("kInputAttenuator/kAtt", ch as u8) {
                    scheduler_eq.enqueue(sysex, 2).await;
                }
            }
        });

        socket.on("disconnect", |socket: socketioxide::extract::SocketRef| async move {
            info!("Cliente desconectado: {}", socket.id);
        });
    });

    // Cria a rota Axum que serve os arquivos estáticos de `../public`
    // e inclui a camada do Socket.IO
    let app = Router::new()
        .route("/api/macros/hosts", axum::routing::get(macros_hosts_handler))
        .route("/api/macros", axum::routing::get(macros_handler))
        .route("/api/macros/slots", axum::routing::get(macros_slots_handler))
        .fallback_service(ServeDir::new("../public"))
        .layer(layer);

    // TODO: Ler config.json para pegar a porta, mas para teste vamos usar 3001
    // (O NodeJS original deve estar na 3000)
    let port = 3001;
    let listener = tokio::net::TcpListener::bind(format!("0.0.0.0:{}", port)).await?;
    
    info!("🎧 Servidor estático e WebSocket rodando em http://localhost:{}", port);

    axum::serve(listener, app).await?;

    Ok(())
}

async fn macros_hosts_handler() -> axum::Json<serde_json::Value> {
    axum::Json(serde_json::json!([]))
}

async fn macros_handler() -> axum::Json<serde_json::Value> {
    axum::Json(serde_json::json!({}))
}

async fn macros_slots_handler() -> axum::Json<serde_json::Value> {
    axum::Json(serde_json::json!([]))
}
