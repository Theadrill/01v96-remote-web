use socketioxide::SocketIo;
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use tokio::sync::RwLock;
use tokio::sync::mpsc;

use crate::midi::MidiScheduler;
use crate::midi::SyncCounter;
use crate::midi::master_meter::MasterMeter;
use crate::network::ConnectionManager;
use crate::state::GlobalState;

/// Set to true while the FX output re-query task is alive (spawned and looping).
static FX_OUTPUT_REQUERY_TASK_ACTIVE: AtomicBool = AtomicBool::new(false);
/// Set to true when a notification arrives while a re-query cycle is already in progress.
/// The task will check this after each cycle and chain another if needed.
static FX_OUTPUT_REQUERY_PENDING: AtomicBool = AtomicBool::new(false);

pub fn start_rx_loop(
    mut midi_in_rx: mpsc::Receiver<Vec<u8>>,
    io: SocketIo,
    global_state: Arc<RwLock<GlobalState>>,
    sync_counter: Arc<SyncCounter>,
    conn_mgr: Arc<ConnectionManager>,
    master_meter: Arc<RwLock<MasterMeter>>,
    csm: Arc<RwLock<crate::custom_scenes::CustomSceneManager>>,
    meter_fps: u32,
    is_remote_midi: bool,
    scheduler: Arc<MidiScheduler>,
) {
    let io_clone = io.clone();
    let state_arc_in = global_state.clone();
    let sync_counter_in = sync_counter.clone();
    let conn_mgr_recv = conn_mgr.clone();
    let master_meter_recv = master_meter.clone();
    let recv_count = Arc::new(std::sync::atomic::AtomicUsize::new(0));
    let parsed_count = Arc::new(std::sync::atomic::AtomicUsize::new(0));
    let recv_count_log = recv_count.clone();
    let parsed_count_log = parsed_count.clone();
    let csm_clone = csm.clone();
    let fx_requery_last = Arc::new(std::sync::Mutex::new(std::time::Instant::now() - std::time::Duration::from_secs(10)));

    // Meter buffer + FPS throttle (like Node.js)
    let meter_buffer: Arc<std::sync::Mutex<Vec<f64>>> =
        Arc::new(std::sync::Mutex::new(vec![0.0; 72]));
    let last_meter_emit: Arc<std::sync::Mutex<std::time::Instant>> =
        Arc::new(std::sync::Mutex::new(std::time::Instant::now()));
    let meter_buffer_emit = meter_buffer.clone();
    let last_meter_emit_clone = last_meter_emit.clone();

    tokio::spawn(async move {
        let report_interval = tokio::time::interval(std::time::Duration::from_secs(5));
        tokio::pin!(report_interval);
        loop {
            tokio::select! {
                _ = report_interval.tick() => {
                    let r = recv_count_log.swap(0, std::sync::atomic::Ordering::SeqCst);
                    let _p = parsed_count_log.swap(0, std::sync::atomic::Ordering::SeqCst);
                    if r > 0 {
                        // tracing::info!("📥 [RX] +{} msgs recebidos na fila, +{} parseados", r, p);
                    }
                }
            }
        }
    });

    tokio::spawn(async move {
        let mut assembler = crate::midi::MidiAssembler::new();
        while let Some(msg) = midi_in_rx.recv().await {
            // Verifica sinal especial de FLUSH disparado pelo ConnectionManager
            if msg.len() == 3 && msg[0] == 0xFF && msg[1] == 0xFE && msg[2] == 0xFD {
                tracing::info!("🧹 [RX] Sinal de FLUSH recebido. Esvaziando pacotes órfãos da fila...");
                let mut dropped = 0;
                while let Ok(_) = midi_in_rx.try_recv() {
                    dropped += 1;
                }
                tracing::info!("🧹 [RX] {} pacotes órfãos descartados com sucesso.", dropped);
                continue;
            }

            recv_count.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
            conn_mgr_recv.reset_activity();
            let packets = if is_remote_midi {
                vec![msg]
            } else {
                assembler.process_input(&msg)
            };
            for packet in packets {
                if sync_counter_in.should_ignore() {
                    continue;
                }
                // Process state and collect emissions to send after releasing lock
                let mut emission: Option<(&str, serde_json::Value)> = None;
                let mut meter_emission: Option<Vec<u8>> = None;
                let mut meter_raw_emission: Option<Vec<u8>> = None;
                let mut scenes_emission = None;
                let mut current_scene_emission = None;
                let mut fx_types_emission: Option<serde_json::Value> = None;
                let mut fx_inputs_emission: Option<serde_json::Value> = None;
                let mut fx_outputs_emission: Option<serde_json::Value> = None;
                let mut should_broadcast_names = false;

                // Detect mixer notifications BEFORE the parser runs.
                // The parser misclassifies FX output patch notifications (section=13, group=2,
                // element=1) as kChannelInput because it shares the same MIDI address as input
                // patch. Detecting at raw packet level and continuing skips the parser entirely.

                if packet.len() >= 9
                    && (packet[2] & 0xF0) == 0x10
                    && packet[4] == 127
                    && packet[5] == 0x50
                {
                    tracing::warn!(
                        "🔔 [FX] Notification detected: pkt={}",
                        packet.iter().map(|b| format!("{:02X}", b)).collect::<Vec<_>>().join(" ")
                    );
                    let sched = scheduler.clone();
                    let last_clone = fx_requery_last.clone();
                    tokio::spawn(async move {
                        {
                            let mut last = last_clone.lock().unwrap();
                            let now = std::time::Instant::now();
                            if now.duration_since(*last).as_millis() < 1000 {
                                return;
                            }
                            *last = now;
                        }
                        tokio::time::sleep(std::time::Duration::from_millis(500)).await;
                        tracing::info!("🔄 [FX] Re-querying FX types after notification...");
                        for i in 0..4u8 {
                            if let Some(req) = crate::midi::protocol::build_fx_type_request(i) {
                                tracing::info!("🔄 [FX] Sending FX type query for slot {}", i);
                                sched.enqueue(req, 0).await;
                                tokio::time::sleep(std::time::Duration::from_millis(300)).await;
                            }
                        }
                    });
                    continue;
                }
                if packet.len() >= 9
                    && (packet[2] & 0xF0) == 0x10
                    && packet[4] == 13
                    && packet[5] == 2
                    && [1u8, 2, 7, 8, 10].contains(&packet[6])
                    && packet[7] == 0
                    && conn_mgr_recv.is_fully_synced()
                    && !crate::midi::protocol::is_output_patch_active()
                {
                    if !FX_OUTPUT_REQUERY_TASK_ACTIVE.swap(true, Ordering::SeqCst) {
                        // ── First notification → send immediate single request + spawn looping task ──
                        // Set flag so the parser treats the response as FxOutputUpdate
                        crate::midi::protocol::set_output_patch_active(true);
                        // Send just THIS element/channel so the UI updates almost instantly
                        if let Some(req) = crate::midi::protocol::build_fx_output_request(packet[6], packet[8]) {
                            scheduler.enqueue(req, 0).await;
                        }
                        let sched = scheduler.clone();
                        let state_clone = state_arc_in.clone();
                        let io_clone_requery = io_clone.clone();
                        tokio::spawn(async move {
                            // Debounce: wait for rapid changes to coalesce
                            tokio::time::sleep(std::time::Duration::from_millis(500)).await;

                            if !FX_OUTPUT_REQUERY_PENDING.swap(false, Ordering::SeqCst) {
                                // No other notifications during debounce → single request already handled it
                                // Brief extra wait so the single response definitely arrives before clearing flag
                                tokio::time::sleep(std::time::Duration::from_millis(300)).await;
                                crate::midi::protocol::set_output_patch_active(false);
                                tracing::info!("🔄 [FX OUT] Single request sufficed, no pending notifications");
                            } else {
                                loop {
                                    tracing::info!("🔄 [FX OUT] Re-querying FX outputs...");
                                    crate::midi::protocol::set_output_patch_active(true);
                                    let destinations: &[(u8, u8)] = &[
                                        (1, 40),
                                        (2, 32),
                                        (7, 8),
                                        (8, 8),
                                        (10, 2),
                                    ];
                                    for &(element, count) in destinations {
                                        for ch in 0u8..count {
                                            if let Some(req) = crate::midi::protocol::build_fx_output_request(element, ch) {
                                                sched.enqueue(req, 0).await;
                                                tokio::time::sleep(std::time::Duration::from_millis(30)).await;
                                            }
                                        }
                                    }
                                    tokio::time::sleep(std::time::Duration::from_secs(3)).await;
                                    crate::midi::protocol::set_output_patch_active(false);
                                    let state = state_clone.read().await;
                                    let fx_out_json = serde_json::to_value(&state.fx_outputs).unwrap_or_default();
                                    drop(state);
                                    let _ = io_clone_requery.emit("fxOutputsUpdate", &fx_out_json).await;

                                    // DEBUG: log all FX output routes after re-query
                                    let state2 = state_clone.read().await;
                                    tracing::info!("🔍 [FX OUT DEBUG] === FX Output Mapping After Re-query ===");
                                    tracing::info!("🔍 [FX OUT DEBUG] Total fx_outputs entries: {}", state2.fx_outputs.len());
                                    for fx_val in [121u64, 122, 129, 130, 137, 138, 139, 140] {
                                        let fx_name = match fx_val {
                                            121 => "FX1 Out1",
                                            122 => "FX1 Out2",
                                            129 => "FX2 Out1",
                                            130 => "FX2 Out2",
                                            137 => "FX3 Out1",
                                            138 => "FX3 Out2",
                                            139 => "FX4 Out1",
                                            140 => "FX4 Out2",
                                            _ => "???",
                                        };
                                        let mut destinations: Vec<String> = Vec::new();
                                        for (key, val) in state2.fx_outputs.iter() {
                                            if val.round() as u64 == fx_val {
                                                destinations.push(format!("{} (el={}, ch={})", key, key / 100, key % 100));
                                            }
                                        }
                                        tracing::info!("🔍 [FX OUT DEBUG]   {} (val={}): {}",
                                            fx_name,
                                            fx_val,
                                            if destinations.is_empty() {
                                                "NOT ROUTED".to_string()
                                            } else {
                                                destinations.join(", ")
                                            },
                                        );
                                    }
                                    drop(state2);

                                    // Check if notifications arrived during this cycle
                                    if !FX_OUTPUT_REQUERY_PENDING.swap(false, Ordering::SeqCst) {
                                        tracing::info!("🔄 [FX OUT] Re-query queue drained, no pending notifications");
                                        break;
                                    }
                                    tracing::info!("🔄 [FX OUT] Pending notification found, chaining another re-query...");
                                    tokio::time::sleep(std::time::Duration::from_millis(200)).await;
                                }
                            }
                            FX_OUTPUT_REQUERY_TASK_ACTIVE.store(false, Ordering::SeqCst);
                        });
                    } else {
                        // ── Task already running → queue notification ──
                        FX_OUTPUT_REQUERY_PENDING.store(true, Ordering::SeqCst);
                        tracing::warn!(
                            "🔔 [FX OUT] Notification queued (re-query in progress): pkt={}",
                            packet.iter().map(|b| format!("{:02X}", b)).collect::<Vec<_>>().join(" ")
                        );
                    }
                    continue;
                } else if packet.len() >= 9
                    && (packet[2] & 0xF0) == 0x10
                    && packet[4] == 127
                    && packet[5] == 0x50
                {
                    // Mixer notification: section=127, group=0x50 — FX slot changed
                    tracing::warn!(
                        "🔔 [FX] Notification detected: pkt={}",
                        packet.iter().map(|b| format!("{:02X}", b)).collect::<Vec<_>>().join(" ")
                    );
                    let sched = scheduler.clone();
                    let last_clone = fx_requery_last.clone();
                    tokio::spawn(async move {
                        {
                            let mut last = last_clone.lock().unwrap();
                            let now = std::time::Instant::now();
                            if now.duration_since(*last).as_millis() < 1000 {
                                return;
                            }
                            *last = now;
                        }

                        tokio::time::sleep(std::time::Duration::from_millis(500)).await;
                        tracing::info!("🔄 [FX] Re-querying FX types after notification...");
                        for i in 0..4u8 {
                            if let Some(req) = crate::midi::protocol::build_fx_type_request(i) {
                                tracing::info!("🔄 [FX] Sending FX type query for slot {}", i);
                                sched.enqueue(req, 0).await;
                                tokio::time::sleep(std::time::Duration::from_millis(300)).await;
                            }
                        }
                    });
                    continue;
                }

                {
                    let mut state = state_arc_in.write().await;

                    if state.handle_raw_midi(&packet) {
                        scenes_emission = Some(
                            serde_json::to_value(state.scene_manager.get_state())
                                .unwrap_or_default(),
                        );
                        current_scene_emission = state
                            .scene_manager
                            .current_scene
                            .as_ref()
                            .and_then(|cs| serde_json::to_value(cs).ok());
                    } else if let Some(parsed) = crate::midi::protocol::parse_message(&packet) {
                        parsed_count.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
                        state.apply_midi(&parsed);

                        match parsed {
                            crate::midi::protocol::ParsedMidi::MeterData {
                                levels,
                                is_master,
                                ..
                            } => {
                                meter_raw_emission = Some(packet.clone());
                                {
                                    if is_master {
                                        let mm = master_meter_recv.read().await;
                                        if let Some((m_left, m_right)) = mm.parse(&packet) {
                                            let mut buf = meter_buffer_emit.lock().unwrap();
                                            buf[32] = m_left as f64;
                                            buf[33] = m_right as f64;
                                        }
                                    } else {
                                        let mut buf = meter_buffer_emit.lock().unwrap();
                                        for (ch, val) in levels.iter() {
                                            if *ch < 72 {
                                                buf[*ch] = (*val as f64).min(32.0);
                                            }
                                        }
                                    }
                                }
                                if conn_mgr_recv.is_fully_synced() {
                                    let mut last = last_meter_emit_clone.lock().unwrap();
                                    let now = std::time::Instant::now();
                                    let throttle_ms = if meter_fps > 0 {
                                        1000 / meter_fps as u64
                                    } else {
                                        33
                                    };
                                    if now.duration_since(*last).as_millis() >= throttle_ms as u128
                                    {
                                        let buf = meter_buffer_emit.lock().unwrap().clone();
                                        meter_emission =
                                            Some(buf.into_iter().map(|v| v as u8).collect());
                                        *last = now;
                                    }
                                }
                            }
                            crate::midi::protocol::ParsedMidi::ControlChange {
                                msg_type,
                                channel,
                                value,
                            } => {
                                static UPDATE_COUNT: std::sync::atomic::AtomicUsize =
                                    std::sync::atomic::AtomicUsize::new(0);
                                let uc =
                                    UPDATE_COUNT.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
                                if uc < 20 || uc.is_multiple_of(200) {
                                    tracing::debug!(
                                        "📡 [UPDATE] #{uc}: type={}, ch={}, val={}",
                                        msg_type,
                                        channel,
                                        value
                                    );
                                }
                                // Só emite 'update' para os clientes após o sync completo.
                                // Durante o sync inicial, ~700 respostas MIDI chegam da mesa —
                                // emiti-las individualmente causaria flicker na UI e sobrecarga
                                // desnecessária. O sync final envia um 'sync' completo de qualquer forma.
                                if conn_mgr_recv.is_fully_synced() {
                                    emission = Some((
                                        "update",
                                        serde_json::json!({
                                            "type": msg_type,
                                            "channel": channel,
                                            "value": value
                                        }),
                                    ));
                                }
                                if msg_type == "kEffectInput/kEffectIn" {
                                    fx_inputs_emission = Some(
                                        serde_json::to_value(&state.fx_inputs).unwrap_or_default(),
                                    );
                                    // Signal the FX sync pipeline: this input slot response arrived.
                                    // channel = idx = slot*2 + lr (as encoded by the parser)
                                    let ack_slot = (channel / 2) as u8;
                                    let ack_lr   = (channel % 2) as u8;
                                    if let Some(tx) = &state.fx_sync_ack_tx {
                                        let _ = tx.send(crate::midi::protocol::FxSyncAck::Input {
                                            slot: ack_slot,
                                            lr:   ack_lr,
                                        });
                                    }
                                }
                            }
                            crate::midi::protocol::ParsedMidi::PhysicalSceneRecall(idx) => {
                                tracing::info!("🎹 [FÍSICO] Cena {} foi CARREGADA na mesa!", idx);
                                conn_mgr_recv.trigger_sync(true, "is_scene");
                            }
                            crate::midi::protocol::ParsedMidi::PhysicalSceneStore(idx) => {
                                tracing::info!("🎹 [FÍSICO] Cena {} foi SALVA na mesa!", idx);
                                state.scene_manager.set_active_scene(idx);
                                scenes_emission = Some(
                                    serde_json::to_value(state.scene_manager.get_state())
                                        .unwrap_or_default(),
                                );
                                current_scene_emission = state
                                    .scene_manager
                                    .current_scene
                                    .as_ref()
                                    .and_then(|cs| serde_json::to_value(cs).ok());
                            }
                            crate::midi::protocol::ParsedMidi::UpdateNameChar { char_index, .. } => {
                                if char_index == 3 {
                                    should_broadcast_names = true;
                                }
                            }
                            crate::midi::protocol::ParsedMidi::UpdateSceneChar { char_index, .. } => {
                                if char_index == 15 {
                                    scenes_emission = Some(
                                        serde_json::to_value(state.scene_manager.get_state())
                                            .unwrap_or_default(),
                                    );
                                    current_scene_emission = state
                                        .scene_manager
                                        .current_scene
                                        .as_ref()
                                        .and_then(|cs| serde_json::to_value(cs).ok());
                                }
                            }
                            crate::midi::protocol::ParsedMidi::FxTypeUpdate { slot, fx_type_id } => {
                                tracing::info!(
                                    "🎵 [FX] Slot {} → id={} name={}",
                                    slot,
                                    fx_type_id,
                                    crate::midi::fx_list::resolve_fx_name(fx_type_id)
                                );
                                fx_types_emission = Some(
                                    serde_json::to_value(&state.fx_types).unwrap_or_default(),
                                );
                            }
                            crate::midi::protocol::ParsedMidi::FxParamUpdate { slot, param, value } => {
                                tracing::info!(
                                    "🎵 [FX PARAM] Slot {} param={:#04X} ({}) val={}",
                                    slot,
                                    param,
                                    param,
                                    value
                                );
                                let _ = io_clone.emit(
                                    "fxParamUpdate",
                                    &serde_json::json!({
                                        "slot": slot,
                                        "param": param,
                                        "value": value
                                    }),
                                ).await;
                                if param == 48 || param == 52 {
                                    fx_types_emission = Some(
                                        serde_json::to_value(&state.fx_types).unwrap_or_default(),
                                    );
                                }
                            }
                            crate::midi::protocol::ParsedMidi::FxOutputUpdate { element, channel, value } => {
                                tracing::info!(
                                    "🎵 [FX OUT] element={} ch={} val={}",
                                    element,
                                    channel,
                                    value
                                );
                                if conn_mgr_recv.is_fully_synced() {
                                    fx_outputs_emission = Some(
                                        serde_json::to_value(&state.fx_outputs).unwrap_or_default(),
                                    );
                                }
                                // Signal the FX sync pipeline: this output slot response arrived.
                                if let Some(tx) = &state.fx_sync_ack_tx {
                                    let _ = tx.send(crate::midi::protocol::FxSyncAck::Output {
                                        element: element as u8,
                                        channel: channel as u8,
                                    });
                                }
                            }
                            crate::midi::protocol::ParsedMidi::FxLibraryRecall { slot, preset } => {
                                if conn_mgr_recv.is_fully_synced() {
                                    tracing::info!("🔄 [FX RECALL] Recall de preset de efeitos executado no Slot {} (Preset {})!", slot + 1, preset);
                                    fx_types_emission = Some(serde_json::to_value(&state.fx_types).unwrap_or_default());
                                    let _ = io_clone.emit("fxLibraryRecall", &serde_json::json!({ "slot": slot, "preset": preset })).await;
                                }
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
                if let Some(v) = fx_types_emission {
                    let _ = io_clone.emit("fxTypesUpdate", &v).await;
                }
                if let Some(v) = fx_inputs_emission {
                    let _ = io_clone.emit("fxInputsUpdate", &v).await;
                }
                if let Some(v) = fx_outputs_emission {
                    let _ = io_clone.emit("fxOutputsUpdate", &v).await;
                }
                if should_broadcast_names {
                    crate::name_resolver::broadcast(&io_clone, &state_arc_in, &csm_clone).await;
                }
                if let Some((event, data)) = emission {
                    let _ = io_clone.emit(event, &data).await;
                }
                if let Some(buf) = meter_emission {
                    static METER_COUNT: std::sync::atomic::AtomicUsize =
                        std::sync::atomic::AtomicUsize::new(0);
                    let c = METER_COUNT.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
                    if c < 5 || c.is_multiple_of(100) {
                        // tracing::info!("📡 emit meterData #{} ({} bytes)", c, buf.len());
                    }
                    let _ = io_clone.emit("meterData", &buf).await;
                }
                if let Some(raw_buf) = meter_raw_emission {
                    let _ = io_clone.emit("meterDataRaw", &raw_buf).await;
                }
            }
        }
    });
}
