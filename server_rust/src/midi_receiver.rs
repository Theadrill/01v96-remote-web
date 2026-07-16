use socketioxide::SocketIo;
use std::sync::Arc;
use tokio::sync::RwLock;
use tokio::sync::mpsc;

use crate::midi::MidiScheduler;
use crate::midi::SyncCounter;
use crate::midi::master_meter::MasterMeter;
use crate::network::ConnectionManager;
use crate::state::GlobalState;

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
                let mut should_broadcast_names = false;
                let mut should_requery_fx = false;

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
                                        if let Some(m_level) = mm.parse(&packet) {
                                            let mut buf = meter_buffer_emit.lock().unwrap();
                                            buf[32] = m_level as f64;
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
                                    tracing::info!(
                                        "📡 [UPDATE] #{uc}: type={}, ch={}, val={}",
                                        msg_type,
                                        channel,
                                        value
                                    );
                                }
                                emission = Some((
                                    "update",
                                    serde_json::json!({
                                        "type": msg_type,
                                        "channel": channel,
                                        "value": value
                                    }),
                                ));
                                if msg_type == "kEffectInput/kEffectIn" {
                                    fx_inputs_emission = Some(
                                        serde_json::to_value(&state.fx_inputs).unwrap_or_default(),
                                    );
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
                            _ => {}
                        }
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
                        should_requery_fx = true;
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

                // Re-query FX types when mixer sends a notification
                if should_requery_fx {
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
                }
            }
        }
    });
}
