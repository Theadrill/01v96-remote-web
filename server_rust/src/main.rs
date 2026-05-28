mod api;
mod config;
pub mod dmx;
mod midi;
mod network;
mod scene_manager;
mod state;

use axum::Router;
use socketioxide::SocketIo;
use std::sync::Arc;
use tokio::sync::RwLock;
use tracing::info;

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

mod tray;
fn main() -> Result<(), Box<dyn std::error::Error>> {
    let tray_app = tray::TrayApp::new(4000)?;
    std::thread::spawn(move || {
        let rt = tokio::runtime::Runtime::new().unwrap();
        let _ = rt.block_on(async_main());
    });
    tray_app.run_message_loop();
    Ok(())
}

async fn async_main() -> Result<(), Box<dyn std::error::Error>> {
    tracing_subscriber::fmt::init();

    let global_state = Arc::new(RwLock::new(state::GlobalState::new()));

    let app_config = config::AppConfig::load();
    info!(
        "🎧 Configuracoes carregadas: MIDI In: {}, MIDI Out: {}",
        app_config.in_idx, app_config.out_idx
    );

    {
        let mut state = global_state.write().await;
        state.inject_names(&app_config.names);
    }

    let master_meter = Arc::new(RwLock::new(midi::master_meter::MasterMeter::new()));
    {
        let mut mm = master_meter.write().await;
        if let Some(steps) = app_config.steps.get("master") {
            mm.set_steps(steps);
        }
    }

    let sync_counter = Arc::new(midi::SyncCounter::new());

    let (midi_out_tx, mut midi_out_rx) = tokio::sync::mpsc::channel::<Vec<u8>>(100);
    let scheduler = Arc::new(midi::MidiScheduler::new(
        app_config.scheduler_tick_ms,
        midi_out_tx,
    ));
    scheduler.start().await;

    let (midi_in_tx, mut midi_in_rx) = tokio::sync::mpsc::channel::<Vec<u8>>(256);

    let engine = Arc::new(tokio::sync::Mutex::new(midi::MidiEngine::new()));

    // Forwarder: scheduler output -> engine
    let engine_fwd = engine.clone();
    tokio::spawn(async move {
        while let Some(msg) = midi_out_rx.recv().await {
            engine_fwd.lock().await.send(&msg);
        }
    });

    let (layer, io) = SocketIo::new_layer();

    let sync_manager = Arc::new(network::SyncManager::new(scheduler.clone(), io.clone()));
    let sync_manager_socket = sync_manager.clone();

    let conn_mgr = network::ConnectionManager::new(
        app_config.clone(),
        io.clone(),
        scheduler.clone(),
        global_state.clone(),
        sync_counter.clone(),
        sync_manager,
        engine.clone(),
        midi_in_tx.clone(),
    );

    if app_config.demo_mode {
        info!("ℹ️ [DEMO] Modo Demo ativo — MIDI real desabilitado, usando simulacao.");
        // Emit connected state for demo mode
        conn_mgr.emit_connection_state();

        let demo_io = io.clone();
        tokio::spawn(async move {
            use tokio::time::{interval, Duration};
            use rand::RngExt;

            let phases: Vec<f64>; let phases2: Vec<f64>; let speeds: Vec<f64>;
            {
                let mut rng = rand::rng();
                phases = (0..32).map(|_| rng.random_range(0.0..std::f64::consts::PI * 2.0)).collect();
                phases2 = (0..32).map(|_| rng.random_range(0.0..std::f64::consts::PI * 2.0)).collect();
                speeds = (0..32).map(|_| 0.8 + rng.random_range(0.0..4.0)).collect();
            }
            let bases: [f64; 32] = [
                26.0, 24.0, 22.0, 23.0, 25.0, 23.0, 21.0, 20.0, 26.0, 24.0, 19.0, 18.0, 20.0, 21.0, 17.0, 18.0,
                22.0, 19.0, 20.0, 18.0, 18.0, 20.0, 17.0, 21.0, 22.0, 19.0, 20.0, 18.0, 16.0, 21.0, 19.0, 17.0,
            ];

            let mut t: f64 = 0.0;
            let mut energy: f64 = 0.9;
            let mut energy_target: f64 = 0.9;
            let mut ticker = interval(Duration::from_millis(33));
            let mut meter_buffer: Vec<f64> = vec![0.0; 64];
            let mut last_emit_time = std::time::Instant::now();

            info!("🚀 [DEMO] Simulacao de Meters iniciada (32ch + Master @ 30fps)");

            loop {
                ticker.tick().await;
                t += 0.15;

                {
                    let mut rng = rand::rng();
                    if rng.random::<f64>() < 0.008 {
                        energy_target = 0.7 + rng.random_range(0.0..0.3);
                    }
                    energy += (energy_target - energy) * 0.03;

                    for i in 0..32 {
                        let s = speeds[i];
                        let w1 = (t * s + phases[i]).sin();
                        let w2 = (t * s * 2.3 + phases2[i]).sin() * 0.35;
                        let w3 = (t * s * 0.4 + phases[i] * 0.7).sin() * 0.25;
                        let noise = (rng.random::<f64>() - 0.5) * 3.0;
                        let level = (bases[i] * energy) + ((w1 + w2 + w3) * 9.0 * energy) + noise;
                        meter_buffer[i] = (level.min(31.0).max(0.0)).round();
                    }

                    let mw = (t * 0.9).sin() * 2.5 + (t * 1.7).sin() * 2.0;
                    let master_level = (26.0 * energy + mw + (rng.random::<f64>() - 0.5) * 2.0)
                        .min(31.0).max(0.0);
                    meter_buffer[32] = master_level.round();
                }

                let now = std::time::Instant::now();
                if now.duration_since(last_emit_time).as_millis() >= 30 {
                    if let Err(e) = demo_io.emit("meterData", &meter_buffer[..33]).await {
                        tracing::error!("Erro ao emitir meterData: {:?}", e);
                    }
                    last_emit_time = now;
                }
            }
        });
    } else {
        info!("ℹ️ [INFO] Modo Demo desativado. Buscando porta MIDI...");

        let (inputs, outputs) = midi::MidiEngine::get_available_ports();
        let search_monitor = app_config.loopmidi_monitor;

        info!("📋 Portas MIDI de entrada disponiveis:");
        for (id, name) in &inputs {
            info!("   IN [{}] = {}", id, name);
        }
        info!("📋 Portas MIDI de saida disponiveis:");
        for (id, name) in &outputs {
            info!("   OUT [{}] = {}", id, name);
        }

        let criteria = if search_monitor { "monitor" } else { "yamaha" };

        let find_port = |ports: &[(usize, String)]| -> Option<usize> {
            for (idx, name) in ports {
                let lower = name.to_lowercase();
                if search_monitor {
                    if lower.contains("monitor") { return Some(*idx); }
                } else {
                    if lower.contains("yamaha") && lower.contains("-1") { return Some(*idx); }
                }
            }
            None
        };

        let found_in = find_port(&inputs);
        let found_out = find_port(&outputs);

        if found_in.is_none() || found_out.is_none() {
            tracing::warn!(
                "⚠️ Nenhuma porta com \"{}\" encontrada. Iniciando radar automatico...",
                criteria
            );
        } else {
            let in_idx = found_in.unwrap();
            let out_idx = found_out.unwrap();
            conn_mgr
                .try_boot_connect(in_idx, out_idx)
                .await;
        }

        let boot_delay = app_config.boot_delay_ms;
        let conn_mgr_radar = conn_mgr.clone();
        tokio::spawn(async move {
            tokio::time::sleep(std::time::Duration::from_millis(boot_delay)).await;
            conn_mgr_radar.iniciar_busca_automatica();
        });
    }

    // DMX boot
    if app_config.sistema_iluminacao {
        let root_dir = std::env::current_dir()
            .unwrap()
            .parent()
            .unwrap()
            .to_string_lossy()
            .to_string();
        let dmx_delay = app_config.dmx_boot_delay_ms;
        tokio::spawn(async move {
            tokio::time::sleep(std::time::Duration::from_millis(dmx_delay)).await;
            dmx::start_dmx_app(false, &root_dir);
        });
    }

    let io_clone = io.clone();
    let state_arc_in = global_state.clone();
    let sync_counter_in = sync_counter.clone();
    let conn_mgr_recv = conn_mgr.clone();
    tokio::spawn(async move {
            let mut assembler = midi::MidiAssembler::new();
            while let Some(msg) = midi_in_rx.recv().await {
                conn_mgr_recv.reset_activity();
                let packets = assembler.process_input(&msg);
                for packet in packets {
                    if sync_counter_in.should_ignore() {
                        continue;
                    }
                    // Process state and collect emissions to send after releasing lock
                    let mut emission: Option<(&str, serde_json::Value)> = None;
                    let mut meter_emission: Option<Vec<u8>> = None;
                    let mut scenes_emission: Option<serde_json::Value> = None;
                    let mut current_scene_emission: Option<serde_json::Value> = None;

                    {
                        let mut state = state_arc_in.write().await;

                        if state.handle_raw_midi(&packet) {
                            scenes_emission = Some(serde_json::to_value(state.scene_manager.get_state()).unwrap_or_default());
                            current_scene_emission = state.scene_manager.current_scene.as_ref()
                                .and_then(|cs| serde_json::to_value(cs).ok());
                        } else if let Some(parsed) = midi::protocol::parse_message(&packet) {
                            state.apply_midi(&parsed);

                            match parsed {
                                midi::protocol::ParsedMidi::MeterData { levels, .. } => {
                                    let mut buf = vec![0u8; 40];
                                    for (ch, val) in levels.iter() {
                                        if *ch < 40 { buf[*ch] = *val; }
                                    }
                                    meter_emission = Some(buf);
                                }
                                midi::protocol::ParsedMidi::ControlChange { msg_type, channel, value } => {
                                    emission = Some(("update", serde_json::json!({
                                        "type": msg_type,
                                        "channel": channel,
                                        "value": value
                                    })));
                                }
                                _ => {}
                            }
                        }
                    } // state lock released here

                    if let Some(v) = scenes_emission {
                        let _ = io_clone.emit("scenesUpdated", &v).await;
                    }
                    if let Some(v) = current_scene_emission {
                        let _ = io_clone.emit("currentScene", &v).await;
                    }
                    if let Some((event, data)) = emission {
                        let _ = io_clone.emit(event, &data).await;
                    }
                    if let Some(buf) = meter_emission {
                        let _ = io_clone.emit("meterData", &buf).await;
                    }
                }
            }
    });

    // Configura os handlers basicos
    let scheduler_socket = scheduler.clone();
    let global_state_api = global_state.clone();
    let global_state_socket = global_state.clone();
    let app_config_clone = app_config.clone();
    let conn_mgr_handler = conn_mgr.clone();
    io.clone().ns(
        "/",
        move |socket: socketioxide::extract::SocketRef| async move {
            info!("Cliente web conectado: {}", socket.id);

            let state_arc_connect = global_state_socket.clone();
            let config_arc = app_config_clone.clone();
            let socket_initial = socket.clone();
            let conn_mgr_connect = conn_mgr_handler.clone();
            tokio::spawn(async move {
                let current_state = state_arc_connect.read().await;
                if let Ok(state_json) = serde_json::to_value(&*current_state) {
                    socket_initial.emit("sync", &state_json).ok();

                    let (inputs, outputs) = midi::MidiEngine::get_available_ports();
                    let inputs_json: Vec<serde_json::Value> = inputs
                        .into_iter()
                        .map(|(id, name)| serde_json::json!({ "id": id, "name": name }))
                        .collect();
                    let outputs_json: Vec<serde_json::Value> = outputs
                        .into_iter()
                        .map(|(id, name)| serde_json::json!({ "id": id, "name": name }))
                        .collect();
                    socket_initial
                        .emit(
                            "portsList",
                            &serde_json::json!({
                                "available": {
                                    "inputs": inputs_json,
                                    "outputs": outputs_json
                                },
                                "savedConfig": config_arc
                            }),
                        )
                        .ok();

                    socket_initial
                        .emit("scenesUpdated", &current_state.scene_manager.get_state())
                        .ok();

                    socket_initial
                        .emit(
                            "syncStatus",
                            &serde_json::json!({ "active": conn_mgr_connect.is_connected() && !conn_mgr_connect.is_fully_synced() }),
                        )
                        .ok();

                    socket_initial
                        .emit(
                            "connectionState",
                            &serde_json::json!({
                                "connected": conn_mgr_connect.is_connected(),
                                "demo_mode": config_arc.demo_mode
                            }),
                        )
                        .ok();
                }
            });

            let scheduler_control = scheduler_socket.clone();
            let state_arc_control = global_state_socket.clone();
            socket.on(
                "control",
                move |socket: socketioxide::extract::SocketRef,
                      data: socketioxide::extract::Data<ControlData>| async move {
                    info!("Controle recebido: {:?}", *data);
                    
                    // Atualiza o estado interno
                    {
                        let mut state = state_arc_control.write().await;
                        let parsed = crate::midi::protocol::ParsedMidi::ControlChange {
                            msg_type: data.msg_type.clone(),
                            channel: data.channel as usize,
                            value: data.value,
                        };
                        state.apply_midi(&parsed);
                    }

                    // Broadcast para TODOS os clientes (incluindo o enviador) para macros funcionarem corretamente
                    if let Ok(val) = serde_json::to_value(&*data) {
                        socket.emit("update", &val).ok();
                        socket.broadcast().emit("update", &val).await.ok();
                    }

                    let is_binary = data.msg_type.contains("On") || data.msg_type.contains("Solo");
                    let mut converter = if is_binary {
                        midi::protocol::Converter::On
                    } else {
                        midi::protocol::Converter::Fader
                    };

                    let lower_type = data.msg_type.to_lowercase();
                    if lower_type.contains("att")
                        || (data.msg_type.contains("EQ/") && data.msg_type.ends_with('G'))
                        || data.msg_type.contains("Gain")
                        || data.msg_type.contains("Threshold")
                        || data.msg_type.contains("Range")
                    {
                        converter = midi::protocol::Converter::Signed;
                    }

                    if let Some(sysex) = midi::protocol::build_change(
                        &data.msg_type,
                        data.channel as u8,
                        data.value,
                        converter,
                    ) {
                        scheduler_control.enqueue(sysex, 1).await;
                    }
                },
            );

            let scheduler_pan = scheduler_socket.clone();
            let state_pan = global_state_socket.clone();
            socket.on(
                "setPan",
                move |socket: socketioxide::extract::SocketRef,
                      data: socketioxide::extract::Data<PanData>| async move {
                    info!("Pan recebido: CH={} Val={}", data.channel, data.value);

                    // Update state
                    {
                        let mut state = state_pan.write().await;
                        let parsed = midi::protocol::ParsedMidi::ControlChange {
                            msg_type: "kPan".to_string(),
                            channel: data.channel as usize,
                            value: data.value,
                        };
                        state.apply_midi(&parsed);
                    }

                    // Broadcast to all clients (matching Node.js format)
                    let update = serde_json::json!({
                        "type": "kPan",
                        "channel": data.channel,
                        "value": data.value
                    });
                    socket.emit("update", &update).ok();
                    socket.broadcast().emit("update", &update).await.ok();

                    // Send to mesa via pan module
                    if let Some(sysex) =
                        midi::pan::build_pan_change(data.channel as i64, data.value)
                    {
                        scheduler_pan.enqueue(sysex, 1).await;
                    }
                },
            );

            // --- PAREAMENTO DE CANAIS (stereo link) ---
            let scheduler_pair = scheduler_socket.clone();
            let state_pair = global_state_socket.clone();
            socket.on(
                "pairChannel",
                move |_socket: socketioxide::extract::SocketRef,
                      data: socketioxide::extract::Data<serde_json::Value>| async move {
                    let action = data.get("action").and_then(|v| v.as_str()).unwrap_or("");
                    let ch_a = data.get("chA").and_then(|v| v.as_u64()).unwrap_or(0) as u8;
                    let ch_b = data.get("chB").and_then(|v| v.as_u64()).unwrap_or(0) as u8;
                    let source_ch = data.get("sourceCh").and_then(|v| v.as_u64()).unwrap_or(0) as u8;

                    match action {
                        "pair" => {
                            let (aux, state) = midi::pair::build_pair(ch_a, ch_b, source_ch);
                            scheduler_pair.enqueue(aux, 1).await;
                            scheduler_pair.enqueue(state, 1).await;
                            let mut s = state_pair.write().await;
                            let p = midi::protocol::ParsedMidi::ControlChange {
                                msg_type: "kInputPair/kPair".to_string(),
                                channel: ch_a as usize, value: 1.0,
                            };
                            s.apply_midi(&p);
                        }
                        "unpair" => {
                            let state = midi::pair::build_unpair(ch_a, ch_b);
                            scheduler_pair.enqueue(state, 1).await;
                            let mut s = state_pair.write().await;
                            let p = midi::protocol::ParsedMidi::ControlChange {
                                msg_type: "kInputPair/kPair".to_string(),
                                channel: ch_a as usize, value: 0.0,
                            };
                            s.apply_midi(&p);
                        }
                        "reset" => {
                            let (aux, state) = midi::pair::build_reset(ch_a, ch_b);
                            scheduler_pair.enqueue(aux, 1).await;
                            scheduler_pair.enqueue(state, 1).await;
                            let mut s = state_pair.write().await;
                            let p = midi::protocol::ParsedMidi::ControlChange {
                                msg_type: "kInputPair/kPair".to_string(),
                                channel: ch_a as usize, value: 1.0,
                            };
                            s.apply_midi(&p);
                        }
                        _ => {}
                    }
                },
            );

            let state_dyn = global_state_socket.clone();
            socket.on(
                "requestDynamics",
                move |socket: socketioxide::extract::SocketRef,
                      data: socketioxide::extract::Data<serde_json::Value>| async move {
                    if let Some(ch) = data.get("channel").and_then(|v| v.as_u64()) {
                        let ch = ch as usize;
                        let state = state_dyn.read().await;
                        let ch_state = if ch <= 31 {
                            state.channels.get(&ch)
                        } else if (60..=67).contains(&ch) {
                            state.channels.get(&(32 + (ch - 60) / 2))
                        } else {
                            None
                        };
                        if let Some(cs) = ch_state {
                            let _ = socket.emit("dynamicsState", &serde_json::json!({
                                "channel": ch,
                                "gate": cs.gate,
                                "comp": cs.comp
                            }));
                        }
                    }
                },
            );

            let scheduler_eq = scheduler_socket.clone();
            socket.on(
                "requestEqAtt",
                move |_socket: socketioxide::extract::SocketRef,
                      data: socketioxide::extract::Data<serde_json::Value>| async move {
                    if let Some(ch) = data.get("channel").and_then(|v| v.as_u64()) {
                        if let Some(sysex) =
                            midi::protocol::build_request("kInputAttenuator/kAtt", ch as u8)
                        {
                            scheduler_eq.enqueue(sysex, 2).await;
                        }
                    }
                },
            );

            let scheduler_scene = scheduler_socket.clone();
            let state_scene = global_state_socket.clone();
            let conn_mgr_scene = conn_mgr_handler.clone();
            let io_scene = io.clone();
            socket.on(
                "recallScene",
                move |_socket: socketioxide::extract::SocketRef,
                      data: socketioxide::extract::Data<serde_json::Value>| async move {
                    if let Some(index) = data.get("index").and_then(|v| v.as_u64()) {
                        tracing::info!("SCENE Comando recebido: RECALL Cena {}", index);
                        let sysex = vec![
                            0xF0, 0x43, 0x10, 0x3E, 0x7F, 0x10, 0x00, 0x00, index as u8, 0x02, 0x00, 0xF7,
                        ];
                        scheduler_scene.enqueue(sysex, 1).await;

                        {
                            let mut state = state_scene.write().await;
                            state.scene_manager.set_active_scene(index as u8);
                        }

                        tokio::time::sleep(std::time::Duration::from_millis(2000)).await;

                        {
                            let state = state_scene.read().await;
                            let _ = io_scene.emit("scenesUpdated", &state.scene_manager.get_state());
                            if let Some(ref cs) = state.scene_manager.current_scene {
                                let _ = io_scene.emit("currentScene", &serde_json::json!(cs));
                            }
                        }

                        tokio::time::sleep(std::time::Duration::from_millis(1200)).await;

                        conn_mgr_scene.trigger_sync(false, "is_scene");
                    }
                },
            );

            let scheduler_save = scheduler_socket.clone();
            let state_save = global_state_socket.clone();
            let io_save = io.clone();
            socket.on(
                "saveScene",
                move |_socket: socketioxide::extract::SocketRef,
                      data: socketioxide::extract::Data<serde_json::Value>| async move {
                    if let Some(index) = data.get("index").and_then(|v| v.as_u64()) {
                        let index = index as u8;
                        let store_sysex = vec![
                            0xF0, 0x43, 0x10, 0x3E, 0x7F, 0x10, 0x20, 0x00, index, 0x02, 0x00, 0xF7,
                        ];
                        scheduler_save.enqueue(store_sysex, 1).await;

                        let original_name = {
                            let state = state_save.read().await;
                            state.scene_manager.scenes[index as usize]
                                .as_ref()
                                .map(|s| s.name.clone())
                                .unwrap_or_default()
                        };

                        let target_name = data
                            .get("newName")
                            .and_then(|v| v.as_str())
                            .map(|n| n.trim().to_uppercase())
                            .unwrap_or(original_name.clone())
                            .chars()
                            .take(16)
                            .collect::<String>();
                        let target_name_padded = format!("{: <16}", target_name);

                        if target_name_padded.trim().to_uppercase() != original_name.trim().to_uppercase() {
                            tokio::time::sleep(std::time::Duration::from_millis(500)).await;

                            let mut rename_sysex = vec![
                                0xF0, 0x43, 0x10, 0x3E, 0x7F, 0x10, 0x40, 0x00, index,
                            ];
                            rename_sysex.extend_from_slice(target_name_padded.as_bytes());
                            rename_sysex.push(0xF7);
                            scheduler_save.enqueue(rename_sysex, 1).await;

                            {
                                let mut state = state_save.write().await;
                                state.scene_manager.scenes[index as usize] =
                                    Some(crate::scene_manager::SceneData {
                                        index,
                                        name: target_name,
                                    });
                                state.scene_manager.set_active_scene(index);
                                let _ = io_save.emit(
                                    "currentScene",
                                    &state.scene_manager.current_scene,
                                );
                                let _ = io_save.emit(
                                    "scenesUpdated",
                                    &state.scene_manager.get_state(),
                                );
                            }

                            tokio::time::sleep(std::time::Duration::from_millis(700)).await;
                        }

                        // Re-emit scenes state for consistency
                        {
                            let state = state_save.read().await;
                            let _ = io_save.emit("currentScene", &state.scene_manager.current_scene);
                            let _ = io_save.emit("scenesUpdated", &state.scene_manager.get_state());
                        }
                    }
                },
            );

            // --- DELETE SCENE ---
            let scheduler_delete = scheduler_socket.clone();
            let state_delete = global_state_socket.clone();
            let io_delete = io.clone();
            socket.on(
                "deleteScene",
                move |_socket: socketioxide::extract::SocketRef,
                      data: socketioxide::extract::Data<serde_json::Value>| async move {
                    if let Some(index) = data.get("index").and_then(|v| v.as_u64()) {
                        let delete_sysex = vec![
                            0xF0, 0x43, 0x10, 0x3E, 0x7F, 0x10, 0x60, 0x00, index as u8, 0xF7,
                        ];
                        scheduler_delete.enqueue(delete_sysex, 1).await;

                        let mut state = state_delete.write().await;
                        state.scene_manager.scenes[index as usize] = None;
                        let _ = io_delete.emit("scenesUpdated", &state.scene_manager.get_state());
                    }
                },
            );

            // --- REQUEST CONNECT ---
            let conn_mgr_rcon = conn_mgr_handler.clone();
            let state_rcon = global_state_socket.clone();
            socket.on(
                "requestConnect",
                move |socket: socketioxide::extract::SocketRef,
                      data: socketioxide::extract::Data<serde_json::Value>| async move {
                    let in_idx = data.get("inIdx").and_then(|v| v.as_u64()).unwrap_or(0) as usize;
                    let out_idx = data.get("outIdx").and_then(|v| v.as_u64()).unwrap_or(0) as usize;

                    if conn_mgr_rcon.is_connected() {
                        let state = state_rcon.read().await;
                        let _ = socket.emit("sync", &serde_json::to_value(&*state).unwrap_or_default());
                        let _ = socket.emit("scenesUpdated", &state.scene_manager.get_state());
                        let _ = socket.emit("connectResult", &serde_json::json!({ "success": true }));
                        return;
                    }

                    conn_mgr_rcon.executar_conexao(in_idx, out_idx).await;
                    let _ = socket.emit("connectResult", &serde_json::json!({ "success": true }));
                },
            );

            // --- UPDATE NAME ---
            let state_name = global_state_socket.clone();
            let io_name = io.clone();
            socket.on(
                "updateName",
                move |_socket: socketioxide::extract::SocketRef,
                      data: socketioxide::extract::Data<serde_json::Value>| async move {
                    let channel = data.get("channel").and_then(|v| v.as_u64()).unwrap_or(0) as usize;
                    let name = data.get("name").and_then(|v| v.as_str()).unwrap_or("").to_string();
                    let limited = if name.len() > 4 { name[..4].to_string() } else { name };
                    let padded = format!("{: <4}", limited);
                    let chars: Vec<String> = padded.chars().map(|c| c.to_string()).collect();

                    {
                        let mut state = state_name.write().await;
                        if channel <= 31 {
                            if let Some(ch) = state.channels.get_mut(&channel) {
                                ch.name = limited.clone();
                                ch.name_chars = chars.clone();
                            }
                        } else if (60..=67).contains(&channel) {
                            let local = 32 + (channel - 60) / 2;
                            if let Some(ch) = state.channels.get_mut(&local) {
                                ch.name = limited.clone();
                                if ch.name_chars.len() < 4 { ch.name_chars.resize(4, " ".to_string()); }
                                for (i, c) in chars.iter().take(4).enumerate() {
                                    ch.name_chars[i] = c.clone();
                                }
                            }
                        } else if (36..=43).contains(&channel) {
                            let local = channel - 36;
                            if let Some(m) = state.mixes.get_mut(&local) {
                                m.name = limited.clone();
                                m.name_chars = chars.clone();
                            }
                        } else if (44..=51).contains(&channel) {
                            let local = channel - 44;
                            if let Some(b) = state.buses.get_mut(&local) {
                                b.name = limited.clone();
                                b.name_chars = chars.clone();
                            }
                        } else if channel == 52 {
                            state.master.name = limited.clone();
                            state.master.name_chars = chars;
                        }
                    }

                    let _ = io_name.emit("updateName", &serde_json::json!({
                        "channel": channel,
                        "name": limited
                    }));
                },
            );

            // --- FORCE SYNC ---
            let conn_mgr_fsync = conn_mgr_handler.clone();
            socket.on(
                "forceSync",
                move |_socket: socketioxide::extract::SocketRef,
                      _data: socketioxide::extract::Data<serde_json::Value>| async move {
                    conn_mgr_fsync.trigger_sync(true, "is_scene");
                },
            );

            // --- REFRESH NAMES ---
            let conn_mgr_rname = conn_mgr_handler.clone();
            socket.on(
                "refreshNames",
                move |_socket: socketioxide::extract::SocketRef,
                      _data: socketioxide::extract::Data<serde_json::Value>| async move {
                    conn_mgr_rname.sync_names();
                },
            );

            // --- SYNC NAMES ONLY ---
            let sync_mgr_names = sync_manager_socket.clone();
            socket.on(
                "syncNamesOnly",
                move |_socket: socketioxide::extract::SocketRef,
                      _data: socketioxide::extract::Data<serde_json::Value>| async move {
                    sync_mgr_names.sync_names_only();
                },
            );

            // --- TOGGLE DEMO ---
            let conn_mgr_demo = conn_mgr_handler.clone();
            socket.on(
                "toggleDemo",
                move |_socket: socketioxide::extract::SocketRef,
                      data: socketioxide::extract::Data<serde_json::Value>| async move {
                    if let Some(enabled) = data.get("enabled").and_then(|v| v.as_bool()) {
                        if enabled {
                            conn_mgr_demo.enable_demo();
                        } else {
                            conn_mgr_demo.disable_demo();
                            conn_mgr_demo.iniciar_busca_automatica();
                        }
                    }
                },
            );

            // --- UPDATE METER CONFIG ---
            socket.on(
                "updateMeterConfig",
                move |_socket: socketioxide::extract::SocketRef,
                      data: socketioxide::extract::Data<serde_json::Value>| async move {
                    if let Some(opacity) = data.get("opacity").and_then(|v| v.as_f64()) {
                        tracing::info!("updateMeterConfig: opacity={} (config save pendente)", opacity);
                    }
                },
            );

            // --- UPDATE OPEN BROWSER ---
            socket.on(
                "updateOpenBrowser",
                move |_socket: socketioxide::extract::SocketRef,
                      data: socketioxide::extract::Data<serde_json::Value>| async move {
                    if let Some(enabled) = data.get("enabled").and_then(|v| v.as_bool()) {
                        tracing::info!("updateOpenBrowser: {} (config save pendente)", enabled);
                    }
                },
            );

            // --- RESTART SERVER ---
            socket.on(
                "restartServer",
                move |_socket: socketioxide::extract::SocketRef,
                      _data: socketioxide::extract::Data<serde_json::Value>| async move {
                    info!("🔄 Reiniciando servidor...");
                    if let Ok(exe) = std::env::current_exe() {
                        if let Err(e) = std::process::Command::new(exe).spawn() {
                            tracing::error!("Falha ao reiniciar: {}", e);
                        }
                    }
                    std::process::exit(0);
                },
            );

            // --- RESET DMX ---
            socket.on(
                "resetDmx",
                move |_socket: socketioxide::extract::SocketRef,
                      _data: socketioxide::extract::Data<serde_json::Value>| async move {
                    let root = std::env::current_dir()
                        .unwrap()
                        .parent()
                        .unwrap()
                        .to_string_lossy()
                        .to_string();
                    dmx::reset_dmx_system(root);
                },
            );

            // --- SYSEX RAW INJECTOR ---
            let scheduler_sysex = scheduler_socket.clone();
            socket.on(
                "sysex",
                move |_socket: socketioxide::extract::SocketRef,
                      data: socketioxide::extract::Data<Vec<u8>>| async move {
                    scheduler_sysex.enqueue(data.0, 1).await;
                },
            );

            // --- SYNC PAN ---
            let scheduler_syncpan = scheduler_socket.clone();
            socket.on(
                "syncPan",
                move |_socket: socketioxide::extract::SocketRef,
                      _data: socketioxide::extract::Data<serde_json::Value>| async move {
                    let requests = midi::pan::build_pan_sync_requests();
                    for req in requests {
                        scheduler_syncpan.enqueue(req, 1).await;
                    }
                },
            );

            socket.on(
                "disconnect",
                |socket: socketioxide::extract::SocketRef| async move {
                    info!("Cliente desconectado: {}", socket.id);
                },
            );
        },
    );

    // Cria a rota Axum que serve os arquivos estaticos de `../public`
    // e inclui a camada do Socket.IO
    let app = Router::new()
        .nest("/api", api::macros::router(global_state_api.clone()))
        .fallback_service(tower_http::services::ServeDir::new("../public"))
        .layer(layer);

    let port = app_config.port;
    let listener = tokio::net::TcpListener::bind(format!("0.0.0.0:{}", port)).await?;

    info!(
        "🎧 Servidor estatico e WebSocket rodando em http://localhost:{}",
        port
    );

    if app_config.open_browser_startup {
        let url = format!("http://localhost:{}", port);
        tokio::spawn(async move {
            tokio::time::sleep(std::time::Duration::from_secs(1)).await;
            let _ = std::process::Command::new("cmd")
                .args(&["/C", "start", &url])
                .spawn();
        });
    }

    axum::serve(listener, app).await?;

    Ok(())
}


