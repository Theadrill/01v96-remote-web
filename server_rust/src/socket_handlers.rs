use socketioxide::SocketIo;
use socketioxide::extract::{Data, SocketRef};
use std::sync::Arc;
use tokio::sync::RwLock;
use tracing::info;

use crate::config::AppConfig;
use crate::midi::MidiScheduler;
use crate::network::{ConnectionManager, SyncManager};
use crate::state::GlobalState;

#[derive(serde::Serialize, serde::Deserialize, Debug)]
pub struct ControlData {
    #[serde(rename = "type")]
    pub msg_type: String,
    pub channel: usize,
    pub value: f64,
}

#[derive(serde::Serialize, serde::Deserialize, Debug)]
pub struct PanData {
    pub channel: usize,
    pub value: f64,
}

pub fn register_handlers(
    io: SocketIo,
    scheduler: Arc<MidiScheduler>,
    global_state: Arc<RwLock<GlobalState>>,
    app_config: AppConfig,
    conn_mgr: Arc<ConnectionManager>,
    sync_manager: Arc<SyncManager>,
) {
    let sync_manager_socket = sync_manager.clone();
    let scheduler_socket = scheduler.clone();
    let global_state_socket = global_state.clone();
    let app_config_clone = app_config.clone();
    let conn_mgr_handler = conn_mgr.clone();
    let io_for_ns = io.clone();

    io.ns("/", move |socket: SocketRef| async move {
        let io = io_for_ns.clone();
        info!("Cliente web conectado: {}", socket.id);

        let state_arc_connect = global_state_socket.clone();
        let config_arc = app_config_clone.clone();
        let socket_initial = socket.clone();
        let conn_mgr_connect = conn_mgr_handler.clone();
        tokio::spawn(async move {
            let current_state = state_arc_connect.read().await;
            let is_syncing = conn_mgr_connect.is_syncing();
            if !is_syncing {
                if let Ok(state_json) = serde_json::to_value(&*current_state) {
                    socket_initial.emit("sync", &state_json).ok();
                }
            }

            let (inputs, outputs) = crate::midi::MidiEngine::get_available_ports();
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
                    &serde_json::json!({ "active": conn_mgr_connect.is_syncing() }),
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
        });

        let scheduler_control = scheduler_socket.clone();
        let state_arc_control = global_state_socket.clone();
        socket.on(
            "control",
            move |socket: SocketRef, data: Data<ControlData>| async move {
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
                    crate::midi::protocol::Converter::On
                } else {
                    crate::midi::protocol::Converter::Fader
                };

                let lower_type = data.msg_type.to_lowercase();
                if lower_type.contains("att")
                    || (data.msg_type.contains("EQ/") && data.msg_type.ends_with('G'))
                    || data.msg_type.contains("Gain")
                    || data.msg_type.contains("Threshold")
                    || data.msg_type.contains("Range")
                {
                    converter = crate::midi::protocol::Converter::Signed;
                }

                if let Some(sysex) = crate::midi::protocol::build_change(
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
            move |socket: SocketRef, data: Data<PanData>| async move {
                info!("Pan recebido: CH={} Val={}", data.channel, data.value);

                // Update state
                {
                    let mut state = state_pan.write().await;
                    let parsed = crate::midi::protocol::ParsedMidi::ControlChange {
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
                    crate::midi::pan::build_pan_change(data.channel as i64, data.value)
                {
                    scheduler_pan.enqueue(sysex, 1).await;
                }
            },
        );

        // --- PAREAMENTO DE CANAIS (stereo link) ---
        let scheduler_pair = scheduler_socket.clone();
        let state_pair = global_state_socket.clone();
        let io_pair = io.clone();
        socket.on(
            "pairChannel",
            move |socket: SocketRef, data: Data<serde_json::Value>| async move {
                let action = data.get("action").and_then(|v| v.as_str()).unwrap_or("");
                let ch_a = data.get("chA").and_then(|v| v.as_u64()).unwrap_or(0) as u8;
                let ch_b = data.get("chB").and_then(|v| v.as_u64()).unwrap_or(0) as u8;
                let source_ch = data.get("sourceCh").and_then(|v| v.as_u64()).unwrap_or(0) as u8;

                let (paired_value, should_broadcast) = match action {
                    "pair" => {
                        let (aux, state) = crate::midi::pair::build_pair(ch_a, ch_b, source_ch);
                        scheduler_pair.enqueue(aux, 1).await;
                        scheduler_pair.enqueue(state, 1).await;
                        let mut s = state_pair.write().await;
                        let p = crate::midi::protocol::ParsedMidi::ControlChange {
                            msg_type: "kInputPair/kPair".to_string(),
                            channel: ch_a as usize,
                            value: 1.0,
                        };
                        s.apply_midi(&p);
                        (1.0f64, true)
                    }
                    "unpair" => {
                        let state = crate::midi::pair::build_unpair(ch_a, ch_b);
                        scheduler_pair.enqueue(state, 1).await;
                        let mut s = state_pair.write().await;
                        let p = crate::midi::protocol::ParsedMidi::ControlChange {
                            msg_type: "kInputPair/kPair".to_string(),
                            channel: ch_a as usize,
                            value: 0.0,
                        };
                        s.apply_midi(&p);
                        (0.0f64, true)
                    }
                    "reset" => {
                        let (aux, state) = crate::midi::pair::build_reset(ch_a, ch_b);
                        scheduler_pair.enqueue(aux, 1).await;
                        scheduler_pair.enqueue(state, 1).await;
                        let mut s = state_pair.write().await;
                        let p = crate::midi::protocol::ParsedMidi::ControlChange {
                            msg_type: "kInputPair/kPair".to_string(),
                            channel: ch_a as usize,
                            value: 1.0,
                        };
                        s.apply_midi(&p);
                        (1.0f64, true)
                    }
                    _ => (0.0f64, false),
                };

                // Broadcast kInputPair/kPair para todos os clientes (ch_a e ch_b)
                if should_broadcast {
                    let update_a = serde_json::json!({
                        "type": "kInputPair/kPair",
                        "channel": ch_a,
                        "value": paired_value
                    });
                    let update_b = serde_json::json!({
                        "type": "kInputPair/kPair",
                        "channel": ch_b,
                        "value": paired_value
                    });
                    socket.emit("update", &update_a).ok();
                    socket.broadcast().emit("update", &update_a).await.ok();
                    socket.emit("update", &update_b).ok();
                    socket.broadcast().emit("update", &update_b).await.ok();

                    // Também emite pelo io global para clientes que possam não estar no mesmo namespace
                    let _ = io_pair.emit("update", &update_a).await;
                    let _ = io_pair.emit("update", &update_b).await;
                }
            },
        );

        let state_dyn = global_state_socket.clone();
        socket.on(
            "requestDynamics",
            move |socket: SocketRef, data: Data<serde_json::Value>| async move {
                if let Some(ch) = data.get("channel").and_then(|v| v.as_u64()) {
                    let ch = ch as usize;
                    let state = state_dyn.read().await;
                    let ch_state = if ch <= 31 {
                        state.channels.get(&ch)
                    } else if (60..=67).contains(&ch) {
                        state.channels.get(&(32 + (ch - 60)))
                    } else {
                        None
                    };
                    if let Some(cs) = ch_state {
                        let _ = socket.emit(
                            "dynamicsState",
                            &serde_json::json!({
                                "channel": ch,
                                "gate": cs.gate,
                                "comp": cs.comp
                            }),
                        );
                    }
                }
            },
        );

        let scheduler_eq = scheduler_socket.clone();
        socket.on(
            "requestEqAtt",
            move |_socket: SocketRef, data: Data<serde_json::Value>| async move {
                if let Some(ch) = data.get("channel").and_then(|v| v.as_u64()) {
                    if let Some(sysex) =
                        crate::midi::protocol::build_request("kInputAttenuator/kAtt", ch as u8)
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
            move |_socket: SocketRef, data: Data<serde_json::Value>| async move {
                if let Some(index) = data.get("index").and_then(|v| v.as_u64()) {
                    tracing::info!("SCENE Comando recebido: RECALL Cena {}", index);
                    let sysex = vec![
                        0xF0,
                        0x43,
                        0x10,
                        0x3E,
                        0x7F,
                        0x10,
                        0x00,
                        0x00,
                        index as u8,
                        0x02,
                        0x00,
                        0xF7,
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

                    conn_mgr_scene.fire_params_only(false, "is_scene");
                }
            },
        );

        let scheduler_save = scheduler_socket.clone();
        let state_save = global_state_socket.clone();
        let io_save = io.clone();
        socket.on(
            "saveScene",
            move |_socket: SocketRef, data: Data<serde_json::Value>| async move {
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

                    if target_name_padded.trim().to_uppercase()
                        != original_name.trim().to_uppercase()
                    {
                        tokio::time::sleep(std::time::Duration::from_millis(500)).await;

                        let mut rename_sysex =
                            vec![0xF0, 0x43, 0x10, 0x3E, 0x7F, 0x10, 0x40, 0x00, index];
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
                            let _ =
                                io_save.emit("currentScene", &state.scene_manager.current_scene);
                            let _ = io_save.emit("scenesUpdated", &state.scene_manager.get_state());
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
            move |_socket: SocketRef, data: Data<serde_json::Value>| async move {
                if let Some(index) = data.get("index").and_then(|v| v.as_u64()) {
                    let delete_sysex = vec![
                        0xF0,
                        0x43,
                        0x10,
                        0x3E,
                        0x7F,
                        0x10,
                        0x60,
                        0x00,
                        index as u8,
                        0xF7,
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
            move |socket: SocketRef, data: Data<serde_json::Value>| async move {
                let in_idx = data.get("inIdx").and_then(|v| v.as_u64()).unwrap_or(0) as usize;
                let out_idx = data.get("outIdx").and_then(|v| v.as_u64()).unwrap_or(0) as usize;

                if conn_mgr_rcon.is_connected() {
                    // Sempre emite o estado atual (parcial ou completo).
                    // Se o sync MIDI ainda está em andamento, o SyncManager emitirá
                    // outro sync completo quando terminar — sobrescrevendo este.
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
        let sched_name = scheduler_socket.clone();
        socket.on(
            "updateName",
            move |_socket: SocketRef, data: Data<serde_json::Value>| async move {
                let channel = data.get("channel").and_then(|v| v.as_u64()).unwrap_or(0) as usize;
                let name = data
                    .get("name")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string();
                let limited = if name.len() > 4 {
                    name[..4].to_string()
                } else {
                    name
                };
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
                        let local = 32 + (channel - 60);
                        if let Some(ch) = state.channels.get_mut(&local) {
                            ch.name = limited.clone();
                            if ch.name_chars.len() < 4 {
                                ch.name_chars.resize(4, " ".to_string());
                            }
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

                let _ = io_name.emit(
                    "updateName",
                    &serde_json::json!({
                        "channel": channel,
                        "name": limited.clone()
                    }),
                );

                // MIDI write-back: send each char to the mesa with 30ms spacing
                let padded_bytes: Vec<u8> = padded.bytes().take(4).collect();
                for (ci, &code) in padded_bytes.iter().enumerate() {
                    if let Some(req) =
                        crate::midi::protocol::build_name_change(channel as u8, ci as u8, code)
                    {
                        sched_name.enqueue(req, 1).await;
                    }
                    if ci < padded_bytes.len() - 1 {
                        tokio::time::sleep(std::time::Duration::from_millis(30)).await;
                    }
                }
                // Request confirmation
                for ci in 0..4u8 {
                    if let Some(req) = crate::midi::protocol::build_name_request(channel as u8, ci)
                    {
                        sched_name.enqueue(req, 1).await;
                    }
                }

                // Save names to disk after debounce
                {
                    let state = state_name.read().await;
                    crate::config::save_names_to_disk(&state, 1000);
                }
            },
        );

        // --- FORCE SYNC ---
        let conn_mgr_fsync = conn_mgr_handler.clone();
        socket.on(
            "forceSync",
            move |_socket: SocketRef, _data: Data<serde_json::Value>| async move {
                conn_mgr_fsync.trigger_sync(true, "is_scene");
            },
        );

        // --- REFRESH NAMES ---
        let conn_mgr_rname = conn_mgr_handler.clone();
        socket.on(
            "refreshNames",
            move |_socket: SocketRef, _data: Data<serde_json::Value>| async move {
                conn_mgr_rname.sync_names();
            },
        );

        // --- SYNC NAMES ONLY ---
        let sync_mgr_names = sync_manager_socket.clone();
        socket.on(
            "syncNamesOnly",
            move |_socket: SocketRef, _data: Data<serde_json::Value>| async move {
                sync_mgr_names.sync_names_only();
            },
        );

        // --- TOGGLE DEMO ---
        let conn_mgr_demo = conn_mgr_handler.clone();
        socket.on(
            "toggleDemo",
            move |_socket: SocketRef, data: Data<serde_json::Value>| async move {
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
            move |_socket: SocketRef, data: Data<serde_json::Value>| async move {
                if let Some(opacity) = data.get("opacity").and_then(|v| v.as_f64()) {
                    let mut config = crate::config::AppConfig::load();
                    config.meter_opacity = opacity;
                    config.save();
                }
            },
        );

        // --- UPDATE OPEN BROWSER ---
        socket.on(
            "updateOpenBrowser",
            move |_socket: SocketRef, data: Data<serde_json::Value>| async move {
                if let Some(enabled) = data.get("enabled").and_then(|v| v.as_bool()) {
                    let mut config = crate::config::AppConfig::load();
                    config.open_browser_startup = enabled;
                    config.save();
                }
            },
        );

        // --- RESTART SERVER ---
        socket.on(
            "restartServer",
            move |_socket: SocketRef, _data: Data<serde_json::Value>| async move {
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
            move |_socket: SocketRef, _data: Data<serde_json::Value>| async move {
                let root = std::env::current_dir()
                    .unwrap()
                    .parent()
                    .unwrap()
                    .to_string_lossy()
                    .to_string();
                crate::dmx::reset_dmx_system(root);
            },
        );

        // --- SYSEX RAW INJECTOR ---
        let scheduler_sysex = scheduler_socket.clone();
        socket.on(
            "sysex",
            move |_socket: SocketRef, data: Data<Vec<u8>>| async move {
                scheduler_sysex.enqueue(data.0, 1).await;
            },
        );

        // --- SYNC PAN ---
        let scheduler_syncpan = scheduler_socket.clone();
        socket.on(
            "syncPan",
            move |_socket: SocketRef, _data: Data<serde_json::Value>| async move {
                let requests = crate::midi::pan::build_pan_sync_requests();
                for req in requests {
                    scheduler_syncpan.enqueue(req, 1).await;
                }
            },
        );

        socket.on("disconnect", |socket: SocketRef| async move {
            info!("Cliente desconectado: {}", socket.id);
        });
    });
}
