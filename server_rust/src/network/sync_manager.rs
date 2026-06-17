use crate::custom_scenes::CustomSceneManager;
use crate::midi::{self, MidiScheduler};
use crate::state::GlobalState;
use socketioxide::SocketIo;
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use tokio::sync::RwLock;
use tracing::info;

pub struct SyncManager {
    scheduler: Arc<MidiScheduler>,
    io: SocketIo,
    is_syncing: Arc<AtomicBool>,
    is_fully_synced: Arc<AtomicBool>,
    has_synced_names: AtomicBool,
    csm: Arc<RwLock<CustomSceneManager>>,
    chunk_size: u32,
    chunk_delay_ms: u64,
}

impl SyncManager {
    pub fn new(scheduler: Arc<MidiScheduler>, io: SocketIo, csm: Arc<RwLock<CustomSceneManager>>, chunk_size: u32, chunk_delay_ms: u64) -> Self {
        Self {
            scheduler,
            io,
            is_syncing: Arc::new(AtomicBool::new(false)),
            is_fully_synced: Arc::new(AtomicBool::new(false)),
            has_synced_names: AtomicBool::new(false),
            csm,
            chunk_size,
            chunk_delay_ms,
        }
    }

    pub fn is_busy(&self) -> bool {
        self.is_syncing.load(Ordering::SeqCst)
    }

    pub fn is_ready(&self) -> bool {
        self.is_fully_synced.load(Ordering::SeqCst)
    }

    pub fn reset(&self) {
        self.has_synced_names.store(false, Ordering::SeqCst);
    }

    pub fn fire(&self, force_names: bool, sync_type: &str, state: Arc<RwLock<GlobalState>>) {
        if self.is_syncing.swap(true, Ordering::SeqCst) {
            return;
        }

        self.is_fully_synced.store(false, Ordering::SeqCst);

        let sched = self.scheduler.clone();
        let io = self.io.clone();
        let is_syncing = self.is_syncing.clone();
        let is_fully_synced = self.is_fully_synced.clone();
        let has_synced_names = self.has_synced_names.load(Ordering::SeqCst);
        let _sync_type = sync_type.to_string();
        let csm = self.csm.clone();
        let chunk_size = self.chunk_size;
        let chunk_delay_ms = self.chunk_delay_ms;

        tokio::spawn(async move {
            tracing::info!("🔄 [SyncManager] Task de sync iniciada");
            let _ = io
                .emit(
                    "syncStatus",
                    &serde_json::json!({ "active": true, "type": _sync_type }),
                )
                .await;

            // Phase 1: clear scene state (short lock, with timeout)
            {
                match tokio::time::timeout(std::time::Duration::from_secs(3), state.write()).await {
                    Ok(mut state_guard) => {
                        state_guard.scene_manager.scenes = vec![None; 100];
                        state_guard.scene_manager.current_scene = None;
                        state_guard.scene_manager.is_syncing = true;
                        state_guard.scene_number = 0;
                    }
                    Err(_) => {
                        tracing::warn!(
                            "⚠️ [SyncManager] Timeout ao adquirir write lock para Phase 1 — continuando sem limpar cenas"
                        );
                    }
                }
            }

            // Phase 2: send all scene requests (no lock — allows MIDI receive loop to process responses)
            let edit_buffer = vec![
                0xF0, 0x43, 0x20, 0x7E, 0x4C, 0x4D, 0x20, 0x20, 0x38, 0x43, 0x39, 0x33, 0x6D, 0x02,
                0x00, 0xF7,
            ];
            sched.enqueue(edit_buffer, 1).await;

            let scene_id_req1 = vec![0xF0, 0x43, 0x30, 0x3E, 127, 1, 0, 0, 0, 0xF7];
            sched.enqueue(scene_id_req1, 1).await;

            let scene_id_req2 = vec![0xF0, 0x43, 0x30, 0x3E, 13, 4, 10, 0, 0, 0xF7];
            sched.enqueue(scene_id_req2, 1).await;

            for i in 1u8..=99 {
                let req = vec![
                    0xF0, 0x43, 0x20, 0x7E, 0x4C, 0x4D, 0x20, 0x20, 0x38, 0x43, 0x39, 0x33, 0x6D,
                    0x00, i, 0xF7,
                ];
                sched.enqueue(req, 1).await;
                if i % 10 == 0 {
                    tracing::info!("⏳ [Scene Manager] Progresso: {}/100...", i);
                    let _ = io.emit("syncStatus", &serde_json::json!({
                        "active": true,
                        "type": "scenes",
                        "progress": i,
                        "total": 100
                    })).await;
                }
                tokio::time::sleep(std::time::Duration::from_millis(50)).await;
            }

            // Phase 3: wait for last scene dumps to arrive (no lock)
            tracing::info!("✅ [Scene Manager] Requisicoes enviadas, aguardando dumps...");
            tokio::time::sleep(std::time::Duration::from_secs(2)).await;

            // Phase 4: finalize scenes (short lock)
            {
                let mut state_guard = state.write().await;
                let current_scene_num = state_guard.scene_number;

                let sm = &mut state_guard.scene_manager;
                sm.is_syncing = false;

                let loaded = sm.scenes.iter().filter(|s| s.is_some()).count();
                tracing::info!("✅ [Scene Manager] {} cenas carregadas.", loaded);

                if current_scene_num > 0 {
                    let adjusted_id = (current_scene_num - 1) as u8;
                    sm.active_scene_index = adjusted_id;
                    if let Some(ref mut cs) = sm.current_scene {
                        cs.index = adjusted_id;
                    }
                } else if let Some(ref current) = sm.current_scene.clone()
                    && let Some(m) = sm.scenes.iter().flatten().find(|s| s.name == current.name)
                {
                    sm.active_scene_index = m.index;
                    if let Some(ref mut cs) = sm.current_scene {
                        cs.index = m.index;
                    }
                }
                let _ = io.emit("scenesUpdated", &sm.get_state()).await;
                if let Some(ref cs) = sm.current_scene {
                    let _ = io.emit("currentScene", &serde_json::json!(cs)).await;
                }
            }

            // Phase 5: queue all params
            queue_all_params_inner(
                sched,
                io,
                state,
                is_syncing,
                is_fully_synced,
                force_names,
                has_synced_names,
                csm,
                chunk_size,
                chunk_delay_ms,
            )
            .await;
        });
    }

    pub fn fire_params_only(
        &self,
        force_names: bool,
        sync_type: &str,
        state: Arc<RwLock<GlobalState>>,
    ) {
        if self.is_syncing.swap(true, Ordering::SeqCst) {
            return;
        }

        self.is_fully_synced.store(false, Ordering::SeqCst);

        let sched = self.scheduler.clone();
        let io = self.io.clone();
        let _sync_type = sync_type.to_string();

        tokio::spawn(async move {
            let _ = io
                .emit(
                    "syncStatus",
                    &serde_json::json!({ "active": true, "type": _sync_type }),
                )
                .await;

            for _ in 0..64 {
                let stop = midi::master_meter::MasterMeter::build_stop_request();
                sched.enqueue(stop, 1).await;
            }

            for i in 0u8..4 {
                if let Some(req) = midi::protocol::build_request("kInputFader/kFader", i) {
                    sched.enqueue(req, 1).await;
                }
                if let Some(req) = midi::protocol::build_request("kInputChannelOn/kChannelOn", i) {
                    sched.enqueue(req, 1).await;
                }
            }

            for i in 60u8..=67 {
                if let Some(req) = midi::protocol::build_request("kInputFader/kFader", i) {
                    sched.enqueue(req, 1).await;
                }
                if let Some(req) = midi::protocol::build_request("kInputChannelOn/kChannelOn", i) {
                    sched.enqueue(req, 1).await;
                }
            }
        });

        self.queue_all_params(force_names, state);
    }

    fn queue_all_params(&self, force_names: bool, state: Arc<RwLock<GlobalState>>) {
        let sched = self.scheduler.clone();
        let io = self.io.clone();
        let is_syncing = self.is_syncing.clone();
        let is_fully_synced = self.is_fully_synced.clone();
        let has_synced_names = self.has_synced_names.load(Ordering::SeqCst);
        let csm = self.csm.clone();
        let chunk_size = self.chunk_size;
        let chunk_delay_ms = self.chunk_delay_ms;

        tokio::spawn(async move {
            queue_all_params_inner(
                sched,
                io,
                state,
                is_syncing,
                is_fully_synced,
                force_names,
                has_synced_names,
                csm,
                chunk_size,
                chunk_delay_ms,
            )
            .await;
        });
    }

    pub fn sync_names_only(&self) {
        if self.is_syncing.swap(true, Ordering::SeqCst) {
            return;
        }

        self.is_fully_synced.store(false, Ordering::SeqCst);

        let sched = self.scheduler.clone();
        let io = self.io.clone();
        let is_syncing = self.is_syncing.clone();
        let is_fully_synced = self.is_fully_synced.clone();

        tokio::spawn(async move {
            let _ = io
                .emit(
                    "syncStatus",
                    &serde_json::json!({ "active": true, "type": "is_scene" }),
                )
                .await;

            let mut requests: Vec<Vec<u8>> = Vec::new();
            requests.push(midi::master_meter::MasterMeter::build_stop_request());

            for i in 0u8..32 {
                for c in 0..4u8 {
                    if let Some(req) = midi::protocol::build_name_request(i, c) {
                        requests.push(req);
                    }
                }
            }
            for st in 0..4u8 {
                let gid = 60 + (st * 2);
                for c in 0..4u8 {
                    if let Some(req) = midi::protocol::build_name_request(gid, c) {
                        requests.push(req);
                    }
                }
            }
            let mut outs: Vec<u8> = (36..=43).collect();
            outs.extend(44..=51);
            outs.push(52);
            for idx in outs {
                for c in 0..8u8 {
                    if let Some(req) = midi::protocol::build_name_request(idx, c) {
                        requests.push(req);
                    }
                }
            }

            sched.enqueue_batch(requests, 1).await;

            let mut last_log = 0u32;
            loop {
                tokio::time::sleep(std::time::Duration::from_millis(500)).await;
                let st = sched.state.lock().await;
                let remaining = st.q0.len() + st.q1.len();
                if remaining == 0 {
                    break;
                }
                if last_log != remaining as u32 {
                    tracing::info!("⏳ [SyncNames] Aguardando {} requests...", remaining);
                    last_log = remaining as u32;
                }
            }

            let _ = io
                .emit("syncStatus", &serde_json::json!({ "active": false }))
                .await;

            is_syncing.store(false, Ordering::SeqCst);
            is_fully_synced.store(true, Ordering::SeqCst);
            info!("✅ [SyncManager] Nomes sincronizados!");
        });
    }
}

fn push_req(requests: &mut Vec<Vec<u8>>, name: &str, channel: u8) {
    if let Some(req) = midi::protocol::build_request(name, channel) {
        requests.push(req);
    }
}

fn get_physical_short(state: &GlobalState, global_ch: u8) -> String {
    let name = if global_ch < 32 {
        state.channels.get(&(global_ch as usize)).map(|c| c.name.clone()).unwrap_or_default()
    } else if (60..=67).contains(&global_ch) {
        let st_idx = (global_ch - 60) / 2;
        let local = 32 + st_idx;
        state.channels.get(&(local as usize)).map(|c| c.name.clone()).unwrap_or_default()
    } else if (36..=43).contains(&global_ch) {
        let local = global_ch - 36;
        state.mixes.get(&(local as usize)).map(|m| m.name.clone()).unwrap_or_default()
    } else if (44..=51).contains(&global_ch) {
        let local = global_ch - 44;
        state.buses.get(&(local as usize)).map(|b| b.name.clone()).unwrap_or_default()
    } else if global_ch == 52 {
        state.master.name.clone()
    } else {
        String::new()
    };
    crate::custom_scenes::to_short_name(&name)
}

async fn queue_all_params_inner(
    sched: Arc<MidiScheduler>,
    io: SocketIo,
    state: Arc<RwLock<GlobalState>>,
    is_syncing: Arc<AtomicBool>,
    is_fully_synced: Arc<AtomicBool>,
    force_names: bool,
    _has_synced_names: bool,
    csm: Arc<RwLock<CustomSceneManager>>,
    chunk_size: u32,
    chunk_delay_ms: u64,
) {
    let mut pending_corrections: Vec<Vec<u8>> = Vec::new();

    let mut requests: Vec<Vec<u8>> = Vec::with_capacity(700);

    requests.push(midi::master_meter::MasterMeter::build_stop_request());
    requests.extend(midi::pan::build_pan_sync_requests());
    push_req(&mut requests, "kStereoFader/kFader", 0);

    for st in 0..4u8 {
        push_req(&mut requests, "kSTInFader/kFader", st);
        push_req(&mut requests, "kSTInChannelOn/kChannelOn", st);
        push_req(&mut requests, "kSetupSoloChOn/kSoloChOn", st + 32);
        push_req(&mut requests, "kSTInAttenuator/kAtt", st);
        push_req(&mut requests, "kSTInEQ/kEQOn", st);
        push_req(&mut requests, "kChannelInput/kChannelIn", st + 32);

        for band in &["Low", "LowMid", "HiMid", "Hi"] {
            push_req(&mut requests, &format!("kSTInEQ/kEQ{}F", band), st);
            push_req(&mut requests, &format!("kSTInEQ/kEQ{}G", band), st);
            push_req(&mut requests, &format!("kSTInEQ/kEQ{}Q", band), st);
        }
        for a in 1..=8 {
            push_req(&mut requests, &format!("kSTInAUX/kAUX{}Level", a), st);
            push_req(&mut requests, &format!("kSTInAUX/kAUX{}On", a), st);
        }
        push_req(&mut requests, "kSTInBus/kStereo", st);
        for b in 1..=8 {
            push_req(&mut requests, &format!("kSTInBus/kBus{}", b), st);
        }
        if st % 2 == 0 {
            push_req(&mut requests, "kSTInPair/kPair", st);
        }
        if force_names {
            let gid = 60 + (st * 2);
            for c in 0..4u8 {
                if let Some(req) = midi::protocol::build_name_request(gid, c) {
                    requests.push(req);
                }
            }
        }
    }

    for i in 0u8..32 {
        push_req(&mut requests, "kInputFader/kFader", i);
        push_req(&mut requests, "kInputChannelOn/kChannelOn", i);
        push_req(&mut requests, "kSetupSoloChOn/kSoloChOn", i);
        push_req(&mut requests, "kInputPhase/kPhase", i);
        push_req(&mut requests, "kInputAttenuator/kAtt", i);
        push_req(&mut requests, "kInputEQ/kEQOn", i);
        push_req(&mut requests, "kInputEQ/kEQMode", i);
        push_req(&mut requests, "kInputEQ/kEQHPFOn", i);
        push_req(&mut requests, "kInputEQ/kEQLPFOn", i);
        for band in &["Low", "LowMid", "HiMid", "Hi"] {
            push_req(&mut requests, &format!("kInputEQ/kEQ{}F", band), i);
            push_req(&mut requests, &format!("kInputEQ/kEQ{}G", band), i);
            push_req(&mut requests, &format!("kInputEQ/kEQ{}Q", band), i);
        }
        for a in 1..=8 {
            push_req(&mut requests, &format!("kInputAUX/kAUX{}Level", a), i);
            push_req(&mut requests, &format!("kInputAUX/kAUX{}On", a), i);
        }
        for p in &[
            "kGateOn",
            "kGateAttack",
            "kGateRange",
            "kGateHold",
            "kGateDecay",
            "kGateThreshold",
        ] {
            push_req(&mut requests, &format!("kInputGate/{}", p), i);
        }
        for p in &[
            "kCompOn",
            "kCompAttack",
            "kCompRelease",
            "kCompRatio",
            "kCompGain",
            "kCompKnee",
            "kCompThreshold",
        ] {
            push_req(&mut requests, &format!("kInputComp/{}", p), i);
        }
        push_req(&mut requests, "kChannelInput/kChannelIn", i);
        push_req(&mut requests, "kChannelInsertIn/kInsertIn", i);
        push_req(&mut requests, "kInputBus/kStereo", i);
        for b in 1..=8 {
            push_req(&mut requests, &format!("kInputBus/kBus{}", b), i);
        }
        if i % 2 == 0 {
            push_req(&mut requests, "kInputPair/kPair", i);
        }
        if force_names {
            for c in 0..4u8 {
                if let Some(req) = midi::protocol::build_name_request(i, c) {
                    requests.push(req);
                }
            }
        }
    }

    for i in 32u8..40 {
        push_req(&mut requests, "kInputFader/kFader", i);
        push_req(&mut requests, "kInputChannelOn/kChannelOn", i);
        push_req(&mut requests, "kInputAttenuator/kAtt", i);
        push_req(&mut requests, "kInputEQ/kEQOn", i);
        push_req(&mut requests, "kChannelInput/kChannelIn", i);
        for band in &["Low", "LowMid", "HiMid", "Hi"] {
            push_req(&mut requests, &format!("kInputEQ/kEQ{}F", band), i);
            push_req(&mut requests, &format!("kInputEQ/kEQ{}G", band), i);
            push_req(&mut requests, &format!("kInputEQ/kEQ{}Q", band), i);
        }
    }

    for i in 0u8..8 {
        push_req(&mut requests, "kAUXFader/kFader", i);
        push_req(&mut requests, "kAUXChannelOn/kChannelOn", i);
        push_req(&mut requests, "kSetupSoloChOn/kSoloChOn", 40 + i);
        push_req(&mut requests, "kAUXEQ/kEQOn", i);
        push_req(&mut requests, "kAUXEQ/kEQHPFOn", i);
        push_req(&mut requests, "kAUXEQ/kEQLPFOn", i);
        for band in &["Low", "LowMid", "HiMid", "Hi"] {
            push_req(&mut requests, &format!("kAUXEQ/kEQ{}F", band), i);
            push_req(&mut requests, &format!("kAUXEQ/kEQ{}G", band), i);
            push_req(&mut requests, &format!("kAUXEQ/kEQ{}Q", band), i);
        }
        for p in &[
            "kCompOn",
            "kCompAttack",
            "kCompRelease",
            "kCompRatio",
            "kCompGain",
            "kCompKnee",
            "kCompThreshold",
        ] {
            push_req(&mut requests, &format!("kAUXComp/{}", p), i);
        }
        push_req(&mut requests, "kBusFader/kFader", i);
        push_req(&mut requests, "kBusChannelOn/kChannelOn", i);
        push_req(&mut requests, "kSetupSoloChOn/kSoloChOn", 48 + i);
        push_req(&mut requests, "kBusEQ/kEQOn", i);
        push_req(&mut requests, "kBusEQ/kEQHPFOn", i);
        push_req(&mut requests, "kBusEQ/kEQLPFOn", i);
        for band in &["Low", "LowMid", "HiMid", "Hi"] {
            push_req(&mut requests, &format!("kBusEQ/kEQ{}F", band), i);
            push_req(&mut requests, &format!("kBusEQ/kEQ{}G", band), i);
            push_req(&mut requests, &format!("kBusEQ/kEQ{}Q", band), i);
        }
        for p in &[
            "kCompOn",
            "kCompAttack",
            "kCompRelease",
            "kCompRatio",
            "kCompGain",
            "kCompKnee",
            "kCompThreshold",
        ] {
            push_req(&mut requests, &format!("kBusComp/{}", p), i);
        }
    }

    push_req(&mut requests, "kStereoFader/kFader", 0);
    push_req(&mut requests, "kStereoChannelOn/kChannelOn", 0);
    push_req(&mut requests, "kStereoAttenuator/kAtt", 0);
    push_req(&mut requests, "kStereoEQ/kEQOn", 0);
    for band in &["Low", "LowMid", "HiMid", "Hi"] {
        push_req(&mut requests, &format!("kStereoEQ/kEQ{}F", band), 0);
        push_req(&mut requests, &format!("kStereoEQ/kEQ{}G", band), 0);
        push_req(&mut requests, &format!("kStereoEQ/kEQ{}Q", band), 0);
    }
    for p in &[
        "kCompOn",
        "kCompAttack",
        "kCompRelease",
        "kCompRatio",
        "kCompGain",
        "kCompKnee",
        "kCompThreshold",
    ] {
        push_req(&mut requests, &format!("kStereoComp/{}", p), 0);
    }

    // Output Patches
    for i in 0..4u8 {
        push_req(&mut requests, "kOutputPatch/kOmni", i);
    }
    for i in 0..8u8 {
        push_req(&mut requests, "kOutputPatch/kAdat", i);
    }
    for i in 0..16u8 {
        push_req(&mut requests, "kOutputPatch/kSlot", i);
    }
    for i in 0..8u8 {
        push_req(&mut requests, "kOutputPatch/kFx", i);
    }
    for i in 0..2u8 {
        push_req(&mut requests, "kOutputPatch/k2tr", i);
    }

    if force_names {
        let mut outs: Vec<u8> = (36..=43).collect();
        outs.extend(44..=51);
        outs.push(52);
        for idx in outs {
            for c in 0..8u8 {
                if let Some(req) = midi::protocol::build_name_request(idx, c) {
                    requests.push(req);
                }
            }
        }
    }

    info!(
        "📦 [Sync] {} requests preparados. Enfileirando em lote...",
        requests.len()
    );
    info!("📦 [Sync] Primeiros 5 requests:");
    for (i, req) in requests.iter().take(5).enumerate() {
        let hex: String = req
            .iter()
            .map(|b| format!("{:02X}", b))
            .collect::<Vec<_>>()
            .join(" ");
        info!("📦 [Sync]   [{}] {} bytes: {}", i, req.len(), hex);
    }
    // Diagnostic: CH1 fader + on
    if let Some(req) = midi::protocol::build_request("kInputFader/kFader", 0) {
        let hex: String = req
            .iter()
            .map(|b| format!("{:02X}", b))
            .collect::<Vec<_>>()
            .join(" ");
        info!("📦 [Sync] CH1 fader request: {} bytes: {}", req.len(), hex);
    }
    if let Some(req) = midi::protocol::build_request("kInputChannelOn/kChannelOn", 0) {
        let hex: String = req
            .iter()
            .map(|b| format!("{:02X}", b))
            .collect::<Vec<_>>()
            .join(" ");
        info!("📦 [Sync] CH1 on request: {} bytes: {}", req.len(), hex);
    }

    let total_reqs = requests.len();
    
    // Batch enqueue — em blocos (chunks) com delay, para não saturar o buffer da mesa
    let chunk_size = chunk_size as usize;
    let mut sent = 0;
    for chunk in requests.chunks(chunk_size) {
        sched.enqueue_batch(chunk.to_vec(), 1).await;
        sent += chunk.len();
        
        let st = sched.state.lock().await;
        let remaining_in_queue = st.q0.len() + st.q1.len();
        let not_yet_enqueued = total_reqs.saturating_sub(sent);
        let total_remaining = remaining_in_queue + not_yet_enqueued;
        let current_progress = total_reqs.saturating_sub(total_remaining);

        let _ = io.emit("syncStatus", &serde_json::json!({
            "active": true,
            "type": "channels",
            "progress": current_progress,
            "total": total_reqs
        })).await;

        tokio::time::sleep(std::time::Duration::from_millis(chunk_delay_ms)).await;
    }

    // Wait for Q0+Q1 to drain
    let mut last_log = 0u32;
    loop {
        tokio::time::sleep(std::time::Duration::from_millis(200)).await;
        let st = sched.state.lock().await;
        let remaining = st.q0.len() + st.q1.len();
        if remaining == 0 {
            let _ = io.emit("syncStatus", &serde_json::json!({
                "active": true,
                "type": "channels",
                "progress": total_reqs,
                "total": total_reqs
            })).await;
            break;
        }
        if last_log != remaining as u32 {
            tracing::info!("⏳ [Sync] Aguardando {} requests na fila...", remaining);
            last_log = remaining as u32;
            
            let current_progress = total_reqs.saturating_sub(remaining);
            let _ = io.emit("syncStatus", &serde_json::json!({
                "active": true,
                "type": "channels",
                "progress": current_progress,
                "total": total_reqs
            })).await;
        }
    }

    // Wait a bit more for last responses to arrive
    tokio::time::sleep(std::time::Duration::from_secs(3)).await;

    // Send pending name corrections now that the massive sync is over
    if force_names {
        let resolved = crate::name_resolver::resolve_all(&state, &csm).await;
        let state_guard = state.read().await;
        for r in &resolved {
            if r.source != crate::name_resolver::NameSource::Physical {
                let physical_short = get_physical_short(&state_guard, r.ch);
                if physical_short != r.short {
                    tracing::info!("🔄 [SyncNames] Corrigindo nome na mesa para CH {}: de '{}' para '{}' (será enviado após o sync principal)", r.ch, physical_short, r.short);
                    let bytes: Vec<u8> = r.short.bytes().take(4).collect();
                    for (ci, &code) in bytes.iter().enumerate() {
                        for req in crate::midi::protocol::build_name_change(r.ch as u8, ci as u8, code) {
                            pending_corrections.push(req);
                        }
                    }
                }
            }
        }
    }

        if !pending_corrections.is_empty() {
            tracing::info!("🔄 [SyncNames] Enviando {} pacotes de correção de nomes para a mesa em background...", pending_corrections.len());
            let sched_clone = sched.clone();
            tokio::spawn(async move {
                for (ci, req) in pending_corrections.into_iter().enumerate() {
                    sched_clone.enqueue(req, 1).await;
                    // A mesa (01V96) requer um pequeno delay entre comandos de nome para não engasgar.
                    // Cada caractere gera 2 pacotes (um pro short e um pro long se houver, ou 2 pro short/long).
                    // Vamos dar um sleep a cada 2 pacotes para garantir o pacing de ~30ms por char.
                    if ci % 2 == 1 {
                        tokio::time::sleep(std::time::Duration::from_millis(30)).await;
                    }
                }
                tracing::info!("✅ [SyncNames] Envio de correções de nomes concluído.");
            });
        }

    // Garante que scene_number e scene_name reflitam o scene_manager (fonte canônica)
    // antes de emitir o sync. O fire_params_only não re-lê dados de cena, então
    // o scene_number vindo do MIDI kSceneNumber pode estar defasado.
    {
        let mut state_guard = state.write().await;
        state_guard.scene_number = state_guard.scene_manager.active_scene_index as usize;
        if let Some(ref cs) = state_guard.scene_manager.current_scene.clone() {
            state_guard.scene_name = cs.name.clone();
        }
    }

    let state_guard = state.read().await;
    if let Ok(state_json) = serde_json::to_value(&*state_guard) {
        let json_str = serde_json::to_string(&*state_guard).unwrap_or_default();
        // Diagnostic: log channel 1 & 2 state
        if let Some(ch) = state_guard.channels.get(&0) {
            tracing::info!(
                "🔍 [SYNC-FINAL] CH1: fader={}, on={}, solo={}, pan={}, att={}, eq.on={}, paired={}, paired_with={:?}, pair_source={:?}",
                ch.value,
                ch.on,
                ch.solo,
                ch.pan,
                ch.att,
                ch.eq.on,
                ch.paired,
                ch.paired_with,
                ch.pair_source
            );
        }
        if let Some(ch) = state_guard.channels.get(&1) {
            tracing::info!(
                "🔍 [SYNC-FINAL] CH2: paired={}, paired_with={:?}, pair_source={:?}",
                ch.paired,
                ch.paired_with,
                ch.pair_source
            );
        }
        tracing::info!(
            "🔍 [SYNC-FINAL] JSON size: {} bytes, channels count: {}",
            json_str.len(),
            state_guard.channels.len()
        );

        // DROP state_guard BEFORE any await!
        // Tokio RwLock doesn't allow a new read lock if a writer is waiting,
        // which causes deadlock when broadcast calls resolve_all()
        drop(state_guard);

        let _ = io
            .emit("syncStatus", &serde_json::json!({ "active": false }))
            .await;

        // Emite nomes resolvidos (Global > Custom > Físico) antes do sync
        // para eliminar qualquer flicker no frontend
        crate::name_resolver::broadcast(&io, &state, &csm).await;

        let _ = io.emit("sync", &state_json).await;
    } else {
        drop(state_guard);
    }


    is_syncing.store(false, Ordering::SeqCst);
    is_fully_synced.store(true, Ordering::SeqCst);
    info!("✅ [SyncManager] Sincronizacao concluida!");
}
