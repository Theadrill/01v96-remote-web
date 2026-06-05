use socketioxide::SocketIo;
use socketioxide::extract::{Data, SocketRef};
use std::sync::Arc;
use tokio::sync::RwLock;
use tracing::info;

use crate::config::AppConfig;
use crate::custom_scenes::{ChannelId, CustomSceneManager};
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

#[derive(serde::Serialize, serde::Deserialize, Debug)]
pub struct SetupServerData {
    pub name: String,
    pub password: String,
}

fn require_setup(socket: &SocketRef) -> bool {
    if crate::env_config::is_setup_complete() {
        return true;
    }
    let status = crate::env_config::detect_env_status();
    tracing::warn!(
        "🚫 [AUTH] Comando bloqueado: setup incompleto (status={})",
        status.as_str()
    );
    let _ = socket.emit(
        "setupRequired",
        &serde_json::json!({
            "error": "Configuração inicial do servidor não foi concluída",
            "env_status": status.as_str()
        }),
    );
    false
}

pub fn register_handlers(
    io: SocketIo,
    scheduler: Arc<MidiScheduler>,
    global_state: Arc<RwLock<GlobalState>>,
    app_config: AppConfig,
    conn_mgr: Arc<ConnectionManager>,
    sync_manager: Arc<SyncManager>,
    custom_scene_manager: Arc<RwLock<CustomSceneManager>>,
) {
    let sync_manager_socket = sync_manager.clone();
    let scheduler_socket = scheduler.clone();
    let global_state_socket = global_state.clone();
    let app_config_clone = app_config.clone();
    let conn_mgr_handler = conn_mgr.clone();
    let csm_socket = custom_scene_manager.clone();
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
                        "savedConfig": config_arc,
                        "tecnicoPassword": crate::env_config::load_password(),
                        "serverName": crate::env_config::load_server_name(),
                        "envStatus": crate::env_config::detect_env_status().as_str()
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
                if !require_setup(&socket) {
                    return;
                }
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
                if !require_setup(&socket) {
                    return;
                }
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
                if !require_setup(&socket) {
                    return;
                }
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
        let csm_scene = csm_socket.clone();
        socket.on(
            "recallScene",
            move |socket: SocketRef, data: Data<serde_json::Value>| async move {
                if !require_setup(&socket) {
                    return;
                }
                if let Some(index) = data.get("index").and_then(|v| v.as_u64()) {
                    tracing::info!("SCENE Comando recebido: RECALL Cena {}", index);
                    let sysex = vec![
                        0xF0, 0x43, 0x10, 0x3E, 0x7F, 0x10, 0x00, 0x00, index as u8, 0x02, 0x00,
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

                    // --- Custom Scene: enqueue name application ---
                    {
                        let mut csm = csm_scene.write().await;
                        let token = csm.prepare_op();
                        let csm_clone = csm_scene.clone();
                        let io_clone = io_scene.clone();
                        let state_clone = state_scene.clone();
                        let sched_clone = scheduler_scene.clone();
                        let _mesa_nome = csm.mesa_nome().to_string();
                        let _data_dir = csm.data_dir().to_path_buf();
                        drop(csm);

                        tokio::spawn(async move {
                            tokio::select! {
                                _ = tokio::time::sleep(std::time::Duration::from_secs(1)) => {}
                                _ = token.cancelled() => {
                                    tracing::info!("aplicação de nomes cancelada (nova cena)");
                                    return;
                                }
                            }

                            let (scene_opt, current_names) = {
                                let state = state_clone.read().await;
                                let scene_number = state.scene_manager.active_scene_index;
                                let scene_name = state
                                    .scene_manager
                                    .current_scene
                                    .as_ref()
                                    .map(|s| s.name.clone())
                                    .unwrap_or_default();
                                let names = collect_current_names(&state);
                                drop(state);

                                let mut csm = csm_clone.write().await;
                                (
                                    csm.find_scene_for_physical(scene_number, &scene_name),
                                    names,
                                )
                            };

                            let scene = match scene_opt {
                                Some(s) => {
                                    tracing::info!("[CUSTOM] recallScene: custom scene '{}' (id={}) encontrada com {} canais", s.scene_name, s.scene_id, s.channels.len());
                                    s
                                }
                                None => {
                                    tracing::info!("[CUSTOM] recallScene: nenhuma custom scene para esta cena física");
                                    let _ = io_clone
                                        .emit(
                                            "customSceneLoaded",
                                            &serde_json::json!({ "active": false }),
                                        )
                                        .await;
                                    return;
                                }
                            };

                            let mut applied = 0u32;
                            let mut skipped = 0u32;
                            for (channel_id, entry) in &scene.channels {
                                if token.is_cancelled() {
                                    return;
                                }

                                let global_ch = channel_id.to_global_channel();
                                let current_short = current_names
                                    .get(channel_id)
                                    .map(|n| crate::custom_scenes::to_short_name(n))
                                    .unwrap_or_default();

                                if current_short == entry.short {
                                    skipped += 1;
                                    continue;
                                }

                                tracing::info!("[CUSTOM] recallScene: ch{} '{}' -> '{}' (cur='{}')", global_ch, current_short, entry.short, current_short);
                                let short_bytes: Vec<u8> = entry.short.bytes().take(4).collect();
                                for (ci, &byte) in short_bytes.iter().enumerate() {
                                    if token.is_cancelled() {
                                        return;
                                    }
                                    if let Some(req) =
                                        crate::midi::protocol::build_name_change(
                                            global_ch, ci as u8, byte,
                                        )
                                    {
                                        sched_clone.enqueue(req, 1).await;
                                    }
                                    if ci < short_bytes.len() - 1 {
                                        tokio::select! {
                                            _ = tokio::time::sleep(std::time::Duration::from_millis(30)) => {}
                                            _ = token.cancelled() => { return; }
                                        }
                                    }
                                }
                                applied += 1;
                            }
                            tracing::info!("[CUSTOM] recallScene: aplicados={}, ignorados={}", applied, skipped);

                            let channels_arr: Vec<serde_json::Value> = scene
                                .channels
                                .iter()
                                .map(|(ch_id, entry)| {
                                    serde_json::json!({
                                        "ch": ch_id.to_global_channel(),
                                        "name": entry.name,
                                        "short": entry.short
                                    })
                                })
                                .collect();

                            let _ = io_clone
                                .emit(
                                    "customSceneLoaded",
                                    &serde_json::json!({
                                        "active": true,
                                        "scene_name": scene.scene_name,
                                        "scene_id": scene.scene_id,
                                        "channels": channels_arr,
                                    }),
                                )
                                .await;
                        });
                    }

                    tokio::time::sleep(std::time::Duration::from_millis(1200)).await;

                    conn_mgr_scene.fire_params_only(false, "is_scene");
                }
            },
        );

        // --- SAVE CUSTOM NAME ---
        let csm_save = csm_socket.clone();
        let state_save_name = global_state_socket.clone();
        let io_save_name = io.clone();
        let sched_save_name = scheduler_socket.clone();
        socket.on(
            "saveCustomName",
            move |socket: SocketRef, data: Data<serde_json::Value>| async move {
                if !require_setup(&socket) {
                    return;
                }
                let channel = data.get("channel").and_then(|v| v.as_u64()).unwrap_or(0) as u8;
                let name = data
                    .get("name")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string();
                let normalized = crate::custom_scenes::normalize_name(&name);
                tracing::info!("[CUSTOM] saveCustomName: ch={}, raw='{}', normalized='{}'", channel, name, normalized);

                let (scene_number, scene_name, mesa_nome, _data_dir) = {
                    let state = state_save_name.read().await;
                    let sn = state.scene_manager.active_scene_index;
                    let sname = state
                        .scene_manager
                        .current_scene
                        .as_ref()
                        .map(|s| s.name.clone())
                        .unwrap_or_default();
                    drop(state);
                    let csm = csm_save.read().await;
                    (
                        sn,
                        sname.clone(),
                        csm.mesa_nome().to_string(),
                        csm.data_dir().to_path_buf(),
                    )
                };

                let base_name = if let Some(pos) = scene_name.find(" - ") {
                    scene_name[pos + 3..].to_string()
                } else {
                    scene_name.clone()
                };

                if base_name.is_empty() {
                    let _ = socket.emit(
                        "saveNameResult",
                        &serde_json::json!({ "success": false, "error": "cena física não identificada" }),
                    );
                    return;
                }

                let filename = format!("custom_names_scene-{}-{}.json", base_name, mesa_nome);

                let channel_id = match channel {
                    0..=31 => ChannelId::Input(channel + 1),
                    60..=67 => ChannelId::StIn(channel - 27),
                    52 => ChannelId::Master,
                    _ => {
                        let _ = socket.emit(
                            "saveNameResult",
                            &serde_json::json!({ "success": false, "error": "canal inválido" }),
                        );
                        return;
                    }
                };

                let csm_clone_save = csm_save.clone();
                let io_save_event = io_save_name.clone();
                let sched_save = sched_save_name.clone();
                let state_clone_save = state_save_name.clone();
                let short = crate::custom_scenes::to_short_name(&normalized);

                {
                    let mut csm = csm_clone_save.write().await;
                    let token = csm.prepare_op();
                    let csm_op = csm_clone_save.clone();
                    let _io_op = io_save_event.clone();
                    let sched_op = sched_save.clone();
                    let state_op = state_clone_save.clone();
                    let fname = filename.clone();
                    let ch_id = channel_id.clone();
                    let norm_name = normalized.clone();
                    drop(csm);

                    tokio::spawn(async move {
                        {
                            let mut mgr = csm_op.write().await;
                            if mgr.get_scene(&fname).is_none() {
                                let state_guard = state_op.read().await;
                                let channels = collect_current_channels_as_entries(&state_guard);
                                drop(state_guard);
                                mgr.create_scene(&fname, &base_name, scene_number, channels);
                            }
                            mgr.upsert_channel(&fname, ch_id, &norm_name);
                            mgr.ensure_registry_entry(&scene_name, scene_number, &fname);
                            mgr.mark_dirty(&fname);
                            mgr.persist();
                        }

                        let current_name = {
                            let state_guard = state_op.read().await;
                            get_channel_short_name(&state_guard, channel)
                        };
                        drop(state_op);

                        if current_name.as_deref() != Some(&short) {
                            let short_bytes: Vec<u8> = short.bytes().take(4).collect();
                            for (ci, &byte) in short_bytes.iter().enumerate() {
                                if token.is_cancelled() {
                                    return;
                                }
                                if let Some(req) = crate::midi::protocol::build_name_change(
                                    channel, ci as u8, byte,
                                ) {
                                    sched_op.enqueue(req, 1).await;
                                }
                                if ci < short_bytes.len() - 1 {
                                    tokio::time::sleep(std::time::Duration::from_millis(30)).await;
                                }
                            }
                        }
                    });
                }

                let _ = io_save_name
                    .emit(
                        "updateName",
                        &serde_json::json!({
                            "channel": channel,
                            "name": normalized
                        }),
                    )
                    .await;

                let _ = socket.emit(
                    "saveNameResult",
                    &serde_json::json!({ "success": true }),
                );
            },
        );

        // --- REMOVE CUSTOM NAME ---
        let csm_remove = csm_socket.clone();
        let state_remove_name = global_state_socket.clone();
        let io_remove_name = io.clone();
        socket.on(
            "removeCustomName",
            move |socket: SocketRef, data: Data<serde_json::Value>| async move {
                if !require_setup(&socket) {
                    return;
                }
                let channel = data.get("channel").and_then(|v| v.as_u64()).unwrap_or(0) as u8;

                let (mesa_nome, scene_name) = {
                    let csm = csm_remove.read().await;
                    let mesa = csm.mesa_nome().to_string();
                    drop(csm);
                    let state = state_remove_name.read().await;
                    let sname = state
                        .scene_manager
                        .current_scene
                        .as_ref()
                        .map(|s| s.name.clone())
                        .unwrap_or_default();
                    (mesa, sname)
                };

                let base_name = if let Some(pos) = scene_name.find(" - ") {
                    scene_name[pos + 3..].to_string()
                } else {
                    scene_name
                };

                if base_name.is_empty() {
                    return;
                }

                let filename = format!("custom_names_scene-{}-{}.json", base_name, mesa_nome);
                let channel_id = match channel {
                    0..=31 => ChannelId::Input(channel + 1),
                    60..=67 => ChannelId::StIn(channel - 27),
                    52 => ChannelId::Master,
                    _ => return,
                };

                let deleted = {
                    let mut csm = csm_remove.write().await;
                    csm.remove_channel(&filename, &channel_id)
                };

                if deleted {
                    let state = state_remove_name.read().await;
                    let original_4 = get_channel_short_name(&state, channel)
                        .unwrap_or_else(|| "    ".to_string());
                    drop(state);

                    let _ = io_remove_name
                        .emit(
                            "updateName",
                            &serde_json::json!({
                                "channel": channel,
                                "name": original_4.trim()
                            }),
                        )
                        .await;
                } else {
                    let mut csm = csm_remove.write().await;
                    csm.persist();
                }
            },
        );

        // --- RENAME CUSTOM SCENE FILE ---
        let csm_rename_file = csm_socket.clone();
        socket.on(
            "renameCustomSceneFile",
            move |socket: SocketRef, data: Data<serde_json::Value>| async move {
                if !require_setup(&socket) {
                    return;
                }
                let old_file = data
                    .get("old_file")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string();
                let new_name = data
                    .get("new_name")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string();

                if old_file.is_empty() || new_name.is_empty() {
                    return;
                }

                {
                    let mut csm = csm_rename_file.write().await;
                    match csm.rename_custom_scene(&old_file, &new_name) {
                        Ok(_) => {
                            tracing::info!("[CUSTOM] Successfully renamed scene file {} to {}", old_file, new_name);
                            // emit updated list
                            let list = csm.list_scenes();
                            let _ = socket.emit(
                                "customScenesList",
                                &serde_json::json!({ "scenes": list }),
                            );
                        }
                        Err(e) => {
                            tracing::error!("[CUSTOM] Failed to rename scene file: {}", e);
                            let _ = socket.emit(
                                "customSceneRenameError",
                                &serde_json::json!({ "error": e }),
                            );
                        }
                    }
                }
            },
        );

        // --- LIST CUSTOM SCENES ---
        let csm_list = csm_socket.clone();
        socket.on(
            "listCustomScenes",
            move |socket: SocketRef| async move {
                tracing::info!("[CUSTOM] listCustomScenes HANDLER EXECUTING");
                let (scenes, mesa_nome) = {
                    let csm = csm_list.read().await;
                    let list = csm.list_scenes();
                    let m_nome = csm.mesa_nome().to_string();
                    tracing::info!("[CUSTOM] listCustomScenes: {} scene(s) in registry", list.len());
                    for s in &list {
                        tracing::info!("[CUSTOM]   scene: physical_scene={:?}, physical_id={}, file={:?}", s.physical_scene, s.physical_id, s.file);
                    }
                    (list, m_nome)
                };
                let _ = socket.emit(
                    "customScenesList",
                    &serde_json::json!({ "scenes": scenes, "mesa_nome": mesa_nome }),
                );
            },
        );

        // --- ASSIGN CUSTOM SCENE ---
        let csm_assign = csm_socket.clone();
        socket.on(
            "assignCustomScene",
            move |socket: SocketRef, data: Data<serde_json::Value>| async move {
                if !require_setup(&socket) {
                    return;
                }
                let file = data
                    .get("file")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string();
                let physical_id = data.get("physical_id").and_then(|v| v.as_u64()).unwrap_or(0) as u8;
                let physical_scene = data
                    .get("physical_scene")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string();

                if file.is_empty() {
                    return;
                }

                {
                    let mut csm = csm_assign.write().await;
                    csm.ensure_registry_entry(&physical_scene, physical_id, &file);
                    csm.persist();
                }

                let _ = socket.emit(
                    "assignResult",
                    &serde_json::json!({ "success": true }),
                );
            },
        );

        // --- GET ACTIVE CUSTOM CHANNELS ---
        let csm_active = csm_socket.clone();
        let state_active = global_state_socket.clone();
        socket.on(
            "getActiveCustomChannels",
            move |socket: SocketRef| async move {
                tracing::info!("[CUSTOM] getActiveCustomChannels HANDLER EXECUTING");
                let (scene_number, scene_name) = {
                    let state = state_active.read().await;
                    let sn = state.scene_manager.active_scene_index;
                    let sname = state
                        .scene_manager
                        .current_scene
                        .as_ref()
                        .map(|s| s.name.clone())
                        .unwrap_or_default();
                    (sn, sname)
                };
                let base_name = if let Some(pos) = scene_name.find(" - ") {
                    scene_name[pos + 3..].to_string()
                } else {
                    scene_name.clone()
                };
                tracing::info!(
                    "[CUSTOM] getActiveCustomChannels: scene={}, name='{}', base='{}'",
                    scene_number, scene_name, base_name
                );
                if base_name.is_empty() {
                    tracing::info!("[CUSTOM] getActiveCustomChannels: base_name vazio, active=false");
                    let _ = socket.emit("activeCustomChannels", &serde_json::json!({ "active": false }));
                    return;
                }
                let mesa_nome = {
                    let csm = csm_active.read().await;
                    csm.mesa_nome().to_string()
                };
                let filename = format!("custom_names_scene-{}-{}.json", base_name, mesa_nome);
                tracing::info!("[CUSTOM] getActiveCustomChannels: filename='{}'", filename);
                let channels = {
                    let mut csm = csm_active.write().await;
                    match csm.get_scene(&filename) {
                        Some(scene) => {
                            let count = scene.channels.len();
                            let arr: Vec<serde_json::Value> = scene.channels.iter().map(|(ch_id, entry)| {
                                serde_json::json!({
                                    "ch": ch_id.to_global_channel(),
                                    "name": entry.name,
                                    "short": entry.short
                                })
                            }).collect();
                            tracing::info!("[CUSTOM] getActiveCustomChannels: cena encontrada com {} canais", count);
                            arr
                        }
                        None => {
                            tracing::info!("[CUSTOM] getActiveCustomChannels: arquivo '{}' nao encontrado", filename);
                            Vec::new()
                        }
                    }
                };
                if channels.is_empty() {
                    let _ = socket.emit("activeCustomChannels", &serde_json::json!({ "active": false }));
                } else {
                    let _ = socket.emit("activeCustomChannels", &serde_json::json!({
                        "active": true,
                        "channels": channels,
                    }));
                }
            },
        );

        // --- PREVIEW CUSTOM SCENE ---
        let csm_preview = csm_socket.clone();
        let state_preview = global_state_socket.clone();
        socket.on(
            "previewCustomScene",
            move |socket: SocketRef, data: Data<serde_json::Value>| async move {
                let file = data
                    .get("file")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string();
                if file.is_empty() {
                    return;
                }
                tracing::info!("[CUSTOM] previewCustomScene: file='{}'", file);
                let scene_opt = {
                    let mut csm = csm_preview.write().await;
                    csm.get_scene(&file).cloned()
                };
                if scene_opt.is_none() {
                    tracing::info!("[CUSTOM] previewCustomScene: cena '{}' nao encontrada", file);
                }
                let mesa_entries = {
                    let state = state_preview.read().await;
                    collect_current_channels_as_entries(&state)
                };
                let channels = match scene_opt {
                    Some(scene) => {
                        let mut result = Vec::new();
                        let scene_ch_ids: std::collections::HashSet<_> =
                            scene.channels.keys().cloned().collect();
                        for (ch_id, entry) in &scene.channels {
                            let global_ch = ch_id.to_global_channel();
                            let mesa_name = mesa_entries
                                .get(ch_id)
                                .map(|m| m.name.clone())
                                .unwrap_or_default();
                            result.push(serde_json::json!({
                                "ch": global_ch,
                                "name": entry.name,
                                "short": entry.short,
                                "mesa_name": mesa_name,
                            }));
                        }
                        for (ch_id, mesa_entry) in &mesa_entries {
                            if !scene_ch_ids.contains(ch_id) {
                                let global_ch = ch_id.to_global_channel();
                                result.push(serde_json::json!({
                                    "ch": global_ch,
                                    "name": "",
                                    "short": "",
                                    "mesa_name": mesa_entry.name,
                                }));
                            }
                        }
                        result
                    }
                    None => Vec::new(),
                };
                
                // Sort by channel index so they are in sequential order
                let mut channels = channels;
                channels.sort_by_key(|v| v.get("ch").and_then(|c| c.as_u64()).unwrap_or(0));

                let _ = socket.emit(
                    "previewResult",
                    &serde_json::json!({ "channels": channels }),
                );
            },
        );

        // --- SAVE SCENE ---
        let scheduler_save = scheduler_socket.clone();
        let state_save = global_state_socket.clone();
        let io_save = io.clone();
        let csm_save = csm_socket.clone();
        socket.on(
            "saveScene",
            move |socket: SocketRef, data: Data<serde_json::Value>| async move {
                if !require_setup(&socket) {
                    return;
                }
                if let Some(index) = data.get("index").and_then(|v| v.as_u64()) {
                    let index = index as u8;
                    tracing::info!("SCENE Comando recebido: SALVAR Cena {}", index);
                    let t_start = std::time::Instant::now();

                    let store_sysex = vec![
                        0xF0, 0x43, 0x10, 0x3E, 0x7F, 0x10, 0x20, 0x00, index, 0x02, 0x00, 0xF7,
                    ];
                    scheduler_save.enqueue(store_sysex, 1).await;
                    tracing::info!("[TIMING] store enqueue: {:?}", t_start.elapsed());

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
                        tracing::info!("[TIMING] after 500ms sleep: {:?}", t_start.elapsed());

                        let mut rename_sysex =
                            vec![0xF0, 0x43, 0x10, 0x3E, 0x7F, 0x10, 0x40, 0x00, index];
                        rename_sysex.extend_from_slice(target_name_padded.as_bytes());
                        rename_sysex.push(0xF7);
                        scheduler_save.enqueue(rename_sysex, 1).await;
                        tracing::info!("[TIMING] rename enqueue: {:?}", t_start.elapsed());

                        tokio::time::sleep(std::time::Duration::from_millis(700)).await;
                        tracing::info!("[TIMING] after 700ms sleep: {:?}", t_start.elapsed());
                    } else {
                        tracing::info!("[TIMING] nome nao mudou, sem delays: {:?}", t_start.elapsed());
                    }

                    // Update state and emit events only after MIDI commands completed
                    {
                        let mut state = state_save.write().await;
                        state.scene_manager.scenes[index as usize] =
                            Some(crate::scene_manager::SceneData {
                                index,
                                name: target_name.clone(),
                            });
                        state.scene_manager.set_active_scene(index);
                        let _ =
                            io_save.emit("currentScene", &state.scene_manager.current_scene);
                        let _ = io_save.emit("scenesUpdated", &state.scene_manager.get_state());
                    }
                    
                    // Update Custom Scenes Registry to reflect the new physical scene name
                    {
                        let mut csm = csm_save.write().await;
                        if csm.update_physical_scene_name(index, &target_name) {
                            let list = csm.list_scenes();
                            let m_nome = csm.mesa_nome().to_string();
                            let _ = io_save.emit("customScenesList", &serde_json::json!({ "scenes": list, "mesa_nome": m_nome }));
                        }
                    }
                    let _ = socket.emit(
                        "saveSceneResult",
                        &serde_json::json!({
                            "success": true,
                            "index": index,
                            "scene_name": target_name
                        }),
                    );
                    tracing::info!("SCENE Cena {} salva com sucesso (total: {:?})", index, t_start.elapsed());
                }
            },
        );

        // --- DELETE SCENE ---
        let scheduler_delete = scheduler_socket.clone();
        let state_delete = global_state_socket.clone();
        let io_delete = io.clone();
        socket.on(
            "deleteScene",
            move |socket: SocketRef, data: Data<serde_json::Value>| async move {
                if !require_setup(&socket) {
                    return;
                }
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
            move |socket: SocketRef, data: Data<serde_json::Value>| async move {
                if !require_setup(&socket) {
                    return;
                }
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
            move |socket: SocketRef, data: Data<serde_json::Value>| async move {
                if !require_setup(&socket) {
                    return;
                }
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
            move |socket: SocketRef, _data: Data<serde_json::Value>| async move {
                if !require_setup(&socket) {
                    return;
                }
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
            move |socket: SocketRef, data: Data<serde_json::Value>| async move {
                if !require_setup(&socket) {
                    return;
                }
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
            move |socket: SocketRef, data: Data<serde_json::Value>| async move {
                if !require_setup(&socket) {
                    return;
                }
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
            move |socket: SocketRef, data: Data<serde_json::Value>| async move {
                if !require_setup(&socket) {
                    return;
                }
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
            move |socket: SocketRef, _data: Data<serde_json::Value>| async move {
                if !require_setup(&socket) {
                    return;
                }
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
            move |socket: SocketRef, _data: Data<serde_json::Value>| async move {
                if !require_setup(&socket) {
                    return;
                }
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
            move |socket: SocketRef, data: Data<Vec<u8>>| async move {
                if !require_setup(&socket) {
                    return;
                }
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

        // --- DISCONNECT ---
        socket.on("disconnect", |socket: SocketRef| async move {
            info!("Cliente desconectado: {}", socket.id);
        });

        // --- CHECK SETUP STATUS ---
        socket.on(
            "checkSetupStatus",
            move |socket: SocketRef, _data: Data<serde_json::Value>| async move {
                let status = crate::env_config::detect_env_status();
                let _ = socket.emit(
                    "setupStatus",
                    &serde_json::json!({
                        "env_status": status.as_str(),
                        "complete": status.is_complete(),
                        "server_name": crate::env_config::load_server_name(),
                        "tecnico_password_present": crate::env_config::load_password().is_some()
                    }),
                );
            },
        );

        // --- GET SERVER NAME ---
        socket.on(
            "getServerName",
            move |socket: SocketRef, _data: Data<serde_json::Value>| async move {
                let _ = socket.emit(
                    "serverName",
                    &serde_json::json!({
                        "server_name": crate::env_config::load_server_name()
                    }),
                );
            },
        );

        // --- RENAME SERVER ---
        // Não chama require_setup: o renameServer é justamente a operação que
        // completa o setup quando só falta o nome (envStatus == missing_name).
        let io_rename = io.clone();
        let csm_rename = csm_socket.clone();
        socket.on(
            "renameServer",
            move |socket: SocketRef, data: Data<serde_json::Value>| async move {
                let new_name = match data.get("new_name").and_then(|v| v.as_str()) {
                    Some(n) => n.trim().to_string(),
                    None => {
                        let _ = socket.emit(
                            "renameResult",
                            &serde_json::json!({ "success": false, "error": "new_name ausente" }),
                        );
                        return;
                    }
                };
                if let Err(e) = crate::env_config::validate_server_name(&new_name) {
                    let _ = socket.emit(
                        "renameResult",
                        &serde_json::json!({ "success": false, "error": e }),
                    );
                    return;
                }
                let current_pass = match crate::env_config::load_password() {
                    Some(p) => p,
                    None => {
                        let _ = socket.emit(
                            "renameResult",
                            &serde_json::json!({
                                "success": false,
                                "error": "Senha TÉCNICO não está configurada"
                            }),
                        );
                        return;
                    }
                };
                let old_name = {
                    let csm = csm_rename.read().await;
                    csm.mesa_nome().to_string()
                };
                if let Err(e) = crate::env_config::save_env(&new_name, &current_pass) {
                    let _ = socket.emit(
                        "renameResult",
                        &serde_json::json!({ "success": false, "error": e }),
                    );
                    return;
                }
                if old_name != new_name {
                    let mut csm = csm_rename.write().await;
                    if let Err(e) = csm.rename_mesa(&old_name, &new_name) {
                        tracing::error!("[RENAME] Erro ao renomear custom scenes: {}", e);
                    }
                }
                info!("✏️ [RENAME] Servidor renomeado para: {}", new_name);
                let _ = io_rename.emit(
                    "serverRenamed",
                    &serde_json::json!({ "server_name": new_name }),
                );
                let _ = socket.emit(
                    "renameResult",
                    &serde_json::json!({
                        "success": true,
                        "server_name": new_name
                    }),
                );
            },
        );

        // --- RESET CONFIG ---
        let io_reset = io.clone();
        socket.on(
            "resetConfig",
            move |socket: SocketRef, _data: Data<serde_json::Value>| async move {
                match crate::env_config::delete_env() {
                    Ok(_) => {
                        info!("🗑️ [RESET] .env deletado — configuração resetada");
                        let _ = io_reset.emit("configReset", &serde_json::json!({}));
                        let _ = socket.emit(
                            "resetResult",
                            &serde_json::json!({ "success": true }),
                        );
                    }
                    Err(e) => {
                        let _ = socket.emit(
                            "resetResult",
                            &serde_json::json!({ "success": false, "error": e }),
                        );
                    }
                }
            },
        );

        // --- SETUP SERVER (cria/atualiza .env) ---
        let io_setup = io.clone();
        socket.on(
            "setupServer",
            move |socket: SocketRef, data: Data<SetupServerData>| async move {
                let name = data.name.trim();
                let password = data.password.trim();

                if let Err(e) = crate::env_config::validate_server_name(name) {
                    let _ = socket.emit(
                        "setupResult",
                        &serde_json::json!({ "success": false, "field": "name", "error": e }),
                    );
                    return;
                }
                if let Err(e) = crate::env_config::validate_password(password) {
                    let _ = socket.emit(
                        "setupResult",
                        &serde_json::json!({ "success": false, "field": "password", "error": e }),
                    );
                    return;
                }

                match crate::env_config::save_env(name, password) {
                    Ok(_) => {
                        info!("✅ [SETUP] Servidor cadastrado: name={}", name);
                        let _ = io_setup.emit(
                            "setupCompleted",
                            &serde_json::json!({
                                "env_status": "complete",
                                "server_name": name
                            }),
                        );
                        let _ = socket.emit(
                            "setupResult",
                            &serde_json::json!({
                                "success": true,
                                "env_status": "complete",
                                "server_name": name,
                                "password": password
                            }),
                        );
                    }
                    Err(e) => {
                        let _ = socket.emit(
                            "setupResult",
                            &serde_json::json!({ "success": false, "field": "global", "error": e }),
                        );
                    }
                }
            },
        );
    });
}

// ===========================================================================
// Helper functions for custom scenes (module level)
// ===========================================================================

fn collect_current_names(
    state: &crate::state::GlobalState,
) -> std::collections::HashMap<ChannelId, String> {
    let mut names = std::collections::HashMap::new();

    for (global_ch, ch_state) in &state.channels {
        if *global_ch <= 31 {
            if let Ok(cid) = ChannelId::try_from(format!("{}", global_ch + 1).as_str()) {
                names.insert(cid, ch_state.name.clone());
            }
        }
    }

    for (global_ch, ch_state) in &state.channels {
        if (32..=39).contains(global_ch) {
            let json_id = *global_ch - 32 + 33;
            if let Ok(cid) = ChannelId::try_from(format!("{}", json_id).as_str()) {
                names.insert(cid, ch_state.name.clone());
            }
        }
    }

    names.insert(ChannelId::Master, state.master.name.clone());
    names
}

fn collect_current_channels_as_entries(
    state: &crate::state::GlobalState,
) -> std::collections::HashMap<ChannelId, crate::custom_scenes::ChannelNameEntry> {
    let mut entries = std::collections::HashMap::new();

    for (global_ch, ch_state) in &state.channels {
        if *global_ch <= 31 {
            if let Ok(cid) = ChannelId::try_from(format!("{}", global_ch + 1).as_str()) {
                let short = crate::custom_scenes::to_short_name(&ch_state.name);
                entries.insert(
                    cid,
                    crate::custom_scenes::ChannelNameEntry {
                        name: ch_state.name.clone(),
                        short,
                    },
                );
            }
        }
    }

    for (global_ch, ch_state) in &state.channels {
        if (32..=39).contains(global_ch) {
            let json_id = *global_ch - 32 + 33;
            if let Ok(cid) = ChannelId::try_from(format!("{}", json_id).as_str()) {
                let short = crate::custom_scenes::to_short_name(&ch_state.name);
                entries.insert(
                    cid,
                    crate::custom_scenes::ChannelNameEntry {
                        name: ch_state.name.clone(),
                        short,
                    },
                );
            }
        }
    }

    let master_short = crate::custom_scenes::to_short_name(&state.master.name);
    entries.insert(
        ChannelId::Master,
        crate::custom_scenes::ChannelNameEntry {
            name: state.master.name.clone(),
            short: master_short,
        },
    );

    entries
}

fn get_channel_short_name(state: &crate::state::GlobalState, channel: u8) -> Option<String> {
    let name = match channel {
        0..=31 => state.channels.get(&(channel as usize)).map(|c| c.name.clone()),
        60..=67 => state
            .channels
            .get(&(32 + (channel - 60) as usize))
            .map(|c| c.name.clone()),
        52 => Some(state.master.name.clone()),
        _ => None,
    };
    name.map(|n| {
        let s: String = n
            .chars()
            .filter(|c| c.is_ascii_alphanumeric())
            .take(4)
            .collect();
        format!("{: <4}", s.to_uppercase())
    })
}
