use std::fs;
use std::sync::Arc;
use std::time::Duration;
use tokio::net::TcpListener;
use tokio::sync::{mpsc, Mutex};
use tracing::{error, info, warn, Level};
use tracing_subscriber::FmtSubscriber;
use midir::{MidiInput, MidiOutput, MidiInputConnection, MidiOutputConnection};
use midi_common::framing::{read_frame, write_frame, is_heartbeat, HEARTBEAT_MAGIC, HEARTBEAT_INTERVAL};
use midi_common::assembler::MidiAssembler;

#[derive(serde::Deserialize, Clone)]
struct MiniConfig {
    #[serde(rename = "inIdx", default)]
    in_idx: Option<usize>,
    #[serde(rename = "outIdx", default)]
    out_idx: Option<usize>,
    #[serde(rename = "loopmidi-monitor", default)]
    loopmidi_monitor: bool,
    #[serde(rename = "remote_midi_port", default = "default_port")]
    remote_midi_port: u16,
    #[serde(rename = "disable_systray", default)]
    disable_systray: bool,
}

fn default_port() -> u16 {
    4200
}

struct MidiConnectionState {
    _in_conn: MidiInputConnection<()>,
    out_conn: MidiOutputConnection,
}

mod tray;

fn main() -> Result<(), Box<dyn std::error::Error>> {
    // 1. Inicializar tracing logs no console
    let subscriber = FmtSubscriber::builder()
        .with_max_level(Level::INFO)
        .finish();
    let _ = tracing::subscriber::set_global_default(subscriber);

    info!("🚀 Inicializando Remote MIDI Server...");

    // 2. Ler config.json
    let config_path = "../config.json";
    let config: MiniConfig = match fs::read_to_string(config_path) {
        Ok(contents) => serde_json::from_str(&contents).unwrap_or_else(|e| {
            warn!("⚠️ Erro ao parsear config.json: {}. Usando defaults.", e);
            serde_json::from_str("{}").unwrap()
        }),
        Err(e) => {
            warn!("⚠️ Não foi possível ler {}: {}. Usando defaults.", config_path, e);
            serde_json::from_str("{}").unwrap()
        }
    };

    let (shutdown_tx, shutdown_rx) = tokio::sync::oneshot::channel::<()>();

    let tray_app = if !config.disable_systray {
        match tray::TrayApp::new() {
            Ok(app) => {
                *app.shutdown_tx.lock().unwrap() = Some(shutdown_tx);
                Some(app)
            }
            Err(e) => {
                error!("❌ Erro ao criar TrayApp: {}", e);
                None
            }
        }
    } else {
        None
    };

    if tray_app.is_some() {
        let config_clone = config.clone();
        std::thread::spawn(move || {
            let rt = tokio::runtime::Runtime::new().unwrap();
            let _ = rt.block_on(async_main(config_clone, shutdown_rx));
        });
        tray_app.unwrap().run_message_loop();
    } else {
        let rt = tokio::runtime::Runtime::new().unwrap();
        let _ = rt.block_on(async_main(config, shutdown_rx));
    }

    Ok(())
}

async fn async_main(config: MiniConfig, mut shutdown_rx: tokio::sync::oneshot::Receiver<()>) -> Result<(), Box<dyn std::error::Error>> {
    // Canal central de recebimento MIDI da mesa
    let (midi_from_mesa_tx, mut midi_from_mesa_rx) = mpsc::channel::<Vec<u8>>(4096);

    // 3. Loop de conexão MIDI física
    info!("🔍 Buscando dispositivo MIDI...");
    let midi_resources = loop {
        match try_connect_midi(&config, midi_from_mesa_tx.clone()).await {
            Ok(res) => {
                info!("✅ MIDI conectado com sucesso.");
                break res;
            }
            Err(e) => {
                error!("❌ Erro ao conectar MIDI: {}. Tentando novamente em 1s...", e);
                tokio::time::sleep(Duration::from_secs(1)).await;
            }
        }
    };

    let out_conn_shared = Arc::new(Mutex::new(midi_resources.out_conn));

    // Despachante central de mensagens recebidas da mesa para o cliente ativo
    let active_client_tx: Arc<Mutex<Option<mpsc::Sender<Vec<u8>>>>> = Arc::new(Mutex::new(None));
    let active_client_tx_for_dispatcher = active_client_tx.clone();

    tokio::spawn(async move {
        while let Some(msg) = midi_from_mesa_rx.recv().await {
            let guard = active_client_tx_for_dispatcher.lock().await;
            if let Some(ref tx) = *guard {
                let _ = tx.try_send(msg);
            }
        }
    });

    // 4. Iniciar escuta TCP na porta configurada
    let addr = format!("0.0.0.0:{}", config.remote_midi_port);
    let listener = TcpListener::bind(&addr).await?;
    info!("🎛️ Remote MIDI Server ouvindo em TCP {}", addr);

    // Cancelador de sessão ativa
    let active_cancel_tx: Arc<Mutex<Option<(std::net::SocketAddr, mpsc::Sender<()>)>>> = Arc::new(Mutex::new(None));

    loop {
        let (stream, peer_addr) = tokio::select! {
            res = listener.accept() => {
                match res {
                    Ok(conn) => conn,
                    Err(e) => {
                        error!("❌ Erro ao aceitar conexão TCP: {}", e);
                        continue;
                    }
                }
            }
            _ = &mut shutdown_rx => {
                info!("🔁 Shutdown graceful recebido no Mini Servidor MIDI — liberando portas e reiniciando...");
                break;
            }
        };

        info!("📡 Conexão recebida de: {}", peer_addr);

        // Se já existe um cliente ativo, envia sinal de cancelamento para ele encerrar
        {
            let mut cancel_guard = active_cancel_tx.lock().await;
            if let Some((old_addr, tx)) = cancel_guard.take() {
                info!("📡 Encerrando sessão anterior ({}) para aceitar a nova conexão de {}...", old_addr, peer_addr);
                let _ = tx.send(()).await;
                // Cooldown curto para a sessão anterior liberar recursos
                tokio::time::sleep(Duration::from_millis(200)).await;
            }
        }

        // Criar canal de cancelamento para esta nova sessão
        let (cancel_tx, mut cancel_rx) = mpsc::channel::<()>(1);
        {
            let mut cancel_guard = active_cancel_tx.lock().await;
            *cancel_guard = Some((peer_addr, cancel_tx));
        }

        let out_conn_clone = out_conn_shared.clone();
        let active_client_tx_clone = active_client_tx.clone();
        let active_cancel_tx_clone = active_cancel_tx.clone();

        let (client_tx, mut client_rx) = mpsc::channel::<Vec<u8>>(4096);
        {
            let mut guard = active_client_tx.lock().await;
            *guard = Some(client_tx);
        }

        tokio::spawn(async move {
            info!("⚡ Sessão iniciada para {}", peer_addr);
            
            let (mut rx, mut tx) = stream.into_split();

            // Task 1: TCP TX (Mesa -> Client + Heartbeat)
            let peer_addr_str = peer_addr.to_string();
            let tx_handle = tokio::spawn(async move {
                let mut heartbeat_interval = tokio::time::interval(HEARTBEAT_INTERVAL);
                loop {
                    tokio::select! {
                        msg = client_rx.recv() => {
                            match msg {
                                Some(data) => {
                                    if let Err(e) = write_frame(&mut tx, &data).await {
                                        error!("❌ Erro ao enviar frame MIDI para {}: {}", peer_addr_str, e);
                                        break;
                                    }
                                }
                                None => break,
                            }
                        }
                        _ = heartbeat_interval.tick() => {
                            if let Err(e) = write_frame(&mut tx, &HEARTBEAT_MAGIC).await {
                                error!("❌ Erro ao enviar heartbeat para {}: {}", peer_addr_str, e);
                                break;
                            }
                        }
                    }
                }
                let _ = tokio::io::AsyncWriteExt::shutdown(&mut tx).await;
            });

            // Task 2: TCP RX (Client -> Mesa)
            let out_conn_rx = out_conn_clone.clone();
            let peer_addr_str2 = peer_addr.to_string();
            let rx_handle = tokio::spawn(async move {
                loop {
                    match read_frame(&mut rx).await {
                        Ok(data) => {
                            if is_heartbeat(&data) {
                                continue;
                            }
                            let mut guard = out_conn_rx.lock().await;
                            if let Err(e) = guard.send(&data) {
                                error!("❌ Erro ao enviar MIDI físico para a mesa: {}", e);
                            }
                        }
                        Err(e) => {
                            warn!("⚠️ Conexão TCP com {} encerrada: {}", peer_addr_str2, e);
                            break;
                        }
                    }
                }
            });

            // Aguarda qualquer uma das tasks falhar ou sinal de cancelamento
            tokio::select! {
                _ = tx_handle => {}
                _ = rx_handle => {}
                _ = cancel_rx.recv() => {
                    info!("📡 Conexão com {} cancelada por nova conexão entrante.", peer_addr);
                }
            }

            // Limpa o sender dinâmico
            let mut sender_guard = active_client_tx_clone.lock().await;
            *sender_guard = None;

            info!("🔌 Conexão encerrada com {}", peer_addr);

            // Remove o cancelador ativo se ainda for o desta sessão
            let mut cancel_guard = active_cancel_tx_clone.lock().await;
            if let Some((ref addr, _)) = *cancel_guard {
                if *addr == peer_addr {
                    *cancel_guard = None;
                }
            }
        });
    }

    // Ao sair do loop accept, reinicia
    let _ = std::process::Command::new(std::env::current_exe().unwrap()).spawn();
    std::process::exit(0);
}

async fn try_connect_midi(config: &MiniConfig, midi_from_mesa_tx: mpsc::Sender<Vec<u8>>) -> Result<MidiConnectionState, String> {
    let loopmidi = config.loopmidi_monitor;

    // Critério de validação
    let validate = |name: &str| -> bool {
        let lower = name.to_lowercase();
        if loopmidi {
            lower.contains("monitor")
        } else {
            lower.contains("yamaha") && lower.contains("-1")
        }
    };

    // Caso in_idx e out_idx estejam especificados na config, tenta primeiro com eles
    if let (Some(in_idx), Some(out_idx)) = (config.in_idx, config.out_idx) {
        let midi_in = MidiInput::new("01v96 Mini Server In").map_err(|e| e.to_string())?;
        let midi_out = MidiOutput::new("01v96 Mini Server Out").map_err(|e| e.to_string())?;
        
        let in_ports = midi_in.ports();
        let out_ports = midi_out.ports();

        if in_idx < in_ports.len() && out_idx < out_ports.len() {
            let in_name = midi_in.port_name(&in_ports[in_idx]).unwrap_or_default();
            let out_name = midi_out.port_name(&out_ports[out_idx]).unwrap_or_default();

            if validate(&in_name) && validate(&out_name) {
                info!("🎯 Encontrado via config.json: IN[{}]=\"{}\"  OUT[{}]=\"{}\"", in_idx, in_name, out_idx, out_name);
                return establish_midi(midi_in, midi_out, in_idx, out_idx, midi_from_mesa_tx).await;
            }
        }
    }

    // Fallback: scanner automático
    let midi_in = MidiInput::new("01v96 Mini Server In").map_err(|e| e.to_string())?;
    let midi_out = MidiOutput::new("01v96 Mini Server Out").map_err(|e| e.to_string())?;

    let in_ports = midi_in.ports();
    let out_ports = midi_out.ports();

    let mut found_in = None;
    let mut found_out = None;

    for (i, p) in in_ports.iter().enumerate() {
        if let Ok(name) = midi_in.port_name(p) {
            if validate(&name) {
                found_in = Some((i, name));
                break;
            }
        }
    }

    for (i, p) in out_ports.iter().enumerate() {
        if let Ok(name) = midi_out.port_name(p) {
            if validate(&name) {
                found_out = Some((i, name));
                break;
            }
        }
    }

    if let (Some((in_idx, in_name)), Some((out_idx, out_name))) = (found_in, found_out) {
        info!("🎯 Scanner automático encontrou: IN[{}]=\"{}\"  OUT[{}]=\"{}\"", in_idx, in_name, out_idx, out_name);
        establish_midi(midi_in, midi_out, in_idx, out_idx, midi_from_mesa_tx).await
    } else {
        Err("Mesa Yamaha ou loopMIDI monitor não encontrado.".to_string())
    }
}

async fn establish_midi(
    midi_in: MidiInput,
    midi_out: MidiOutput,
    in_idx: usize,
    out_idx: usize,
    midi_from_mesa_tx: mpsc::Sender<Vec<u8>>,
) -> Result<MidiConnectionState, String> {
    let in_ports = midi_in.ports();
    let out_ports = midi_out.ports();

    let assembler = Arc::new(std::sync::Mutex::new(MidiAssembler::new()));

    let in_conn = midi_in.connect(
        &in_ports[in_idx],
        "01v96 Input Connection",
        move |_stamp, message, _| {
            let mut ass = assembler.lock().unwrap();
            let complete_messages = ass.process_input(message);
            drop(ass);
            for msg in complete_messages {
                let _ = midi_from_mesa_tx.try_send(msg);
            }
        },
        (),
    ).map_err(|e| e.to_string())?;

    let out_conn = midi_out.connect(
        &out_ports[out_idx],
        "01v96 Output Connection"
    ).map_err(|e| e.to_string())?;

    Ok(MidiConnectionState {
        _in_conn: in_conn,
        out_conn,
    })
}
