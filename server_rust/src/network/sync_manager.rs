use crate::midi::{self, MidiScheduler};
use crate::state::GlobalState;
use socketioxide::SocketIo;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tokio::sync::RwLock;
use tracing::info;

pub struct SyncManager {
    scheduler: Arc<MidiScheduler>,
    io: SocketIo,
    is_syncing: Arc<AtomicBool>,
    is_fully_synced: Arc<AtomicBool>,
    has_synced_names: AtomicBool,
}

impl SyncManager {
    pub fn new(scheduler: Arc<MidiScheduler>, io: SocketIo) -> Self {
        Self {
            scheduler,
            io,
            is_syncing: Arc::new(AtomicBool::new(false)),
            is_fully_synced: Arc::new(AtomicBool::new(false)),
            has_synced_names: AtomicBool::new(false),
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

    pub fn fire(
        &self,
        force_names: bool,
        sync_type: &str,
        state: Arc<RwLock<GlobalState>>,
    ) {
        if self.is_syncing.swap(true, Ordering::SeqCst) {
            return;
        }

        self.is_fully_synced.store(false, Ordering::SeqCst);

        let _ = self.io.emit(
            "syncStatus",
            &serde_json::json!({ "active": true, "type": sync_type }),
        );

        let sched = self.scheduler.clone();
        let io = self.io.clone();
        let is_syncing = self.is_syncing.clone();
        let is_fully_synced = self.is_fully_synced.clone();
        let has_synced_names = self.has_synced_names.load(Ordering::SeqCst);
        let _sync_type = sync_type.to_string();

        tokio::spawn(async move {
            // Phase 1: clear scene state (short lock)
            {
                let mut state_guard = state.write().await;
                state_guard.scene_manager.scenes = vec![None; 100];
                state_guard.scene_manager.current_scene = None;
                state_guard.scene_manager.is_syncing = true;
            }

            // Phase 2: send all scene requests (no lock — allows MIDI receive loop to process responses)
            let edit_buffer = vec![
                0xF0, 0x43, 0x20, 0x7E, 0x4C, 0x4D, 0x20, 0x20, 0x38, 0x43, 0x39, 0x33, 0x6D, 0x02, 0x00, 0xF7,
            ];
            sched.enqueue(edit_buffer, 1).await;

            for i in 1u8..=99 {
                let req = vec![
                    0xF0, 0x43, 0x20, 0x7E, 0x4C, 0x4D, 0x20, 0x20, 0x38, 0x43, 0x39, 0x33, 0x6D, 0x00, i, 0xF7,
                ];
                sched.enqueue(req, 1).await;
                tokio::time::sleep(std::time::Duration::from_millis(50)).await;
            }

            // Phase 3: wait for last scene dumps to arrive (no lock)
            tracing::info!("✅ [Scene Manager] Requisicoes enviadas, aguardando dumps...");
            tokio::time::sleep(std::time::Duration::from_secs(2)).await;

            // Phase 4: finalize scenes (short lock)
            {
                let mut state_guard = state.write().await;
                let sm = &mut state_guard.scene_manager;
                sm.is_syncing = false;

                let loaded = sm.scenes.iter().filter(|s| s.is_some()).count();
                tracing::info!("✅ [Scene Manager] {} cenas carregadas.", loaded);

                if let Some(ref current) = sm.current_scene.clone() {
                    if let Some(m) = sm.scenes.iter().flatten().find(|s| s.name == current.name) {
                        sm.active_scene_index = m.index;
                        if let Some(ref mut cs) = sm.current_scene {
                            cs.index = m.index;
                        }
                    }
                }
                let _ = io.emit("scenesUpdated", &sm.get_state());
                if let Some(ref cs) = sm.current_scene {
                    let _ = io.emit("currentScene", &serde_json::json!(cs));
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

        let _ = self.io.emit(
            "syncStatus",
            &serde_json::json!({ "active": true, "type": sync_type }),
        );

        let sched = self.scheduler.clone();

        tokio::spawn(async move {
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

        tokio::spawn(async move {
            queue_all_params_inner(
                sched,
                io,
                state,
                is_syncing,
                is_fully_synced,
                force_names,
                has_synced_names,
            )
            .await;
        });
    }

    pub fn sync_names_only(&self) {
        if self.is_syncing.swap(true, Ordering::SeqCst) {
            return;
        }

        self.is_fully_synced.store(false, Ordering::SeqCst);

        let _ = self.io.emit(
            "syncStatus",
            &serde_json::json!({ "active": true, "type": "is_scene" }),
        );

        let sched = self.scheduler.clone();
        let io = self.io.clone();
        let is_syncing = self.is_syncing.clone();
        let is_fully_synced = self.is_fully_synced.clone();

        tokio::spawn(async move {
            let stop = midi::master_meter::MasterMeter::build_stop_request();
            sched.enqueue(stop, 1).await;

            for i in 0u8..32 {
                for c in 0..4u8 {
                    if let Some(req) = midi::protocol::build_name_request(i, c) {
                        sched.enqueue(req, 1).await;
                    }
                }
            }

            for st in 0..4u8 {
                let global_id = 60 + (st * 2);
                for c in 0..4u8 {
                    if let Some(req) = midi::protocol::build_name_request(global_id, c) {
                        sched.enqueue(req, 1).await;
                    }
                }
            }

            let mut out_indices: Vec<u8> = (36..=43).collect();
            out_indices.extend(44..=51);
            out_indices.push(52);
            for idx in out_indices {
                for c in 0..8u8 {
                    if let Some(req) = midi::protocol::build_name_request(idx, c) {
                        sched.enqueue(req, 1).await;
                    }
                }
            }

            loop {
                tokio::time::sleep(std::time::Duration::from_millis(50)).await;
                let st = sched.state.lock().await;
                if st.q0.is_empty() && st.q1.is_empty() {
                    break;
                }
            }

            let _ = io.emit("syncStatus", &serde_json::json!({ "active": false }));

            is_syncing.store(false, Ordering::SeqCst);
            is_fully_synced.store(true, Ordering::SeqCst);
            info!("✅ [SyncManager] Nomes sincronizados!");
        });
    }
}

async fn enqueue_req(sched: &Arc<MidiScheduler>, name: &str, channel: u8, priority: u8) {
    if let Some(req) = midi::protocol::build_request(name, channel) {
        sched.enqueue(req, priority).await;
    }
}

async fn queue_all_params_inner(
    sched: Arc<MidiScheduler>,
    io: SocketIo,
    state: Arc<RwLock<GlobalState>>,
    is_syncing: Arc<AtomicBool>,
    is_fully_synced: Arc<AtomicBool>,
    force_names: bool,
    _has_synced_names: bool,
) {
    let priority: u8 = 1;

    let stop = midi::master_meter::MasterMeter::build_stop_request();
    sched.enqueue(stop, priority).await;

    for req in midi::pan::build_pan_sync_requests() {
        sched.enqueue(req, priority).await;
    }

    enqueue_req(&sched, "kStereoFader/kFader", 0, priority).await;

    for i in 0u8..32 {
        enqueue_req(&sched, "kInputFader/kFader", i, priority).await;
        enqueue_req(&sched, "kInputChannelOn/kChannelOn", i, priority).await;
        enqueue_req(&sched, "kSetupSoloChOn/kSoloChOn", i, priority).await;
        enqueue_req(&sched, "kInputPhase/kPhase", i, priority).await;
        enqueue_req(&sched, "kInputAttenuator/kAtt", i, priority).await;

        enqueue_req(&sched, "kInputEQ/kEQOn", i, priority).await;
        enqueue_req(&sched, "kInputEQ/kEQMode", i, priority).await;
        enqueue_req(&sched, "kInputEQ/kEQHPFOn", i, priority).await;
        enqueue_req(&sched, "kInputEQ/kEQLPFOn", i, priority).await;
        for band in &["Low", "LowMid", "HiMid", "Hi"] {
            enqueue_req(&sched, &format!("kInputEQ/kEQ{}F", band), i, priority).await;
            enqueue_req(&sched, &format!("kInputEQ/kEQ{}G", band), i, priority).await;
            enqueue_req(&sched, &format!("kInputEQ/kEQ{}Q", band), i, priority).await;
        }

        for a in 1..=8 {
            enqueue_req(&sched, &format!("kInputAUX/kAUX{}Level", a), i, priority).await;
            enqueue_req(&sched, &format!("kInputAUX/kAUX{}On", a), i, priority).await;
        }

        for p in &["kGateOn", "kGateAttack", "kGateRange", "kGateHold", "kGateDecay", "kGateThreshold"] {
            enqueue_req(&sched, &format!("kInputGate/{}", p), i, priority).await;
        }

        for p in &["kCompOn", "kCompAttack", "kCompRelease", "kCompRatio", "kCompGain", "kCompKnee", "kCompThreshold"] {
            enqueue_req(&sched, &format!("kInputComp/{}", p), i, priority).await;
        }

        enqueue_req(&sched, "kChannelInput/kChannelIn", i, priority).await;
        enqueue_req(&sched, "kInputBus/kStereo", i, priority).await;
        for b in 1..=8 {
            enqueue_req(&sched, &format!("kInputBus/kBus{}", b), i, priority).await;
        }

        if i % 2 == 0 {
            enqueue_req(&sched, "kInputPair/kPair", i, priority).await;
        }

        if force_names {
            for c in 0..4u8 {
                if let Some(req) = midi::protocol::build_name_request(i, c) {
                    sched.enqueue(req, priority).await;
                }
            }
        }
    }

    for i in 32u8..40 {
        enqueue_req(&sched, "kInputFader/kFader", i, priority).await;
        enqueue_req(&sched, "kInputChannelOn/kChannelOn", i, priority).await;
    }

    if force_names {
        for st in 0..4u8 {
            let gid = 60 + (st * 2);
            for c in 0..4u8 {
                if let Some(req) = midi::protocol::build_name_request(gid, c) {
                    sched.enqueue(req, priority).await;
                }
            }
        }
    }

    for i in 0u8..8 {
        enqueue_req(&sched, "kAUXFader/kFader", i, priority).await;
        enqueue_req(&sched, "kAUXChannelOn/kChannelOn", i, priority).await;
        enqueue_req(&sched, "kAUXEQ/kEQOn", i, priority).await;
        enqueue_req(&sched, "kAUXEQ/kEQHPFOn", i, priority).await;
        enqueue_req(&sched, "kAUXEQ/kEQLPFOn", i, priority).await;
        for band in &["Low", "LowMid", "HiMid", "Hi"] {
            enqueue_req(&sched, &format!("kAUXEQ/kEQ{}F", band), i, priority).await;
            enqueue_req(&sched, &format!("kAUXEQ/kEQ{}G", band), i, priority).await;
            enqueue_req(&sched, &format!("kAUXEQ/kEQ{}Q", band), i, priority).await;
        }
        for p in &["kCompOn", "kCompAttack", "kCompRelease", "kCompRatio", "kCompGain", "kCompKnee", "kCompThreshold"] {
            enqueue_req(&sched, &format!("kAUXComp/{}", p), i, priority).await;
        }

        enqueue_req(&sched, "kBusFader/kFader", i, priority).await;
        enqueue_req(&sched, "kBusChannelOn/kChannelOn", i, priority).await;
        enqueue_req(&sched, "kBusEQ/kEQOn", i, priority).await;
        enqueue_req(&sched, "kBusEQ/kEQHPFOn", i, priority).await;
        enqueue_req(&sched, "kBusEQ/kEQLPFOn", i, priority).await;
        for band in &["Low", "LowMid", "HiMid", "Hi"] {
            enqueue_req(&sched, &format!("kBusEQ/kEQ{}F", band), i, priority).await;
            enqueue_req(&sched, &format!("kBusEQ/kEQ{}G", band), i, priority).await;
            enqueue_req(&sched, &format!("kBusEQ/kEQ{}Q", band), i, priority).await;
        }
        for p in &["kCompOn", "kCompAttack", "kCompRelease", "kCompRatio", "kCompGain", "kCompKnee", "kCompThreshold"] {
            enqueue_req(&sched, &format!("kBusComp/{}", p), i, priority).await;
        }
    }

    enqueue_req(&sched, "kStereoFader/kFader", 0, priority).await;
    enqueue_req(&sched, "kStereoChannelOn/kChannelOn", 0, priority).await;
    enqueue_req(&sched, "kStereoAttenuator/kAtt", 0, priority).await;
    enqueue_req(&sched, "kStereoEQ/kEQOn", 0, priority).await;
    for band in &["Low", "LowMid", "HiMid", "Hi"] {
        enqueue_req(&sched, &format!("kStereoEQ/kEQ{}F", band), 0, priority).await;
        enqueue_req(&sched, &format!("kStereoEQ/kEQ{}G", band), 0, priority).await;
        enqueue_req(&sched, &format!("kStereoEQ/kEQ{}Q", band), 0, priority).await;
    }
    for p in &["kCompOn", "kCompAttack", "kCompRelease", "kCompRatio", "kCompGain", "kCompKnee", "kCompThreshold"] {
        enqueue_req(&sched, &format!("kStereoComp/{}", p), 0, priority).await;
    }

    if force_names {
        let mut outs: Vec<u8> = (36..=43).collect();
        outs.extend(44..=51);
        outs.push(52);
        for idx in outs {
            for c in 0..8u8 {
                if let Some(req) = midi::protocol::build_name_request(idx, c) {
                    sched.enqueue(req, priority).await;
                }
            }
        }
    }

    loop {
        tokio::time::sleep(std::time::Duration::from_millis(50)).await;
        let st = sched.state.lock().await;
        if st.q0.is_empty() && st.q1.is_empty() {
            break;
        }
    }

    let state_guard = state.read().await;
    if let Ok(state_json) = serde_json::to_value(&*state_guard) {
        let _ = io.emit("syncStatus", &serde_json::json!({ "active": false }));
        let _ = io.emit("sync", &state_json);
    }
    drop(state_guard);

    // Save names after sync
    {
        let state_guard = state.read().await;
        crate::config::save_names_to_disk(&state_guard, 0);
    }

    is_syncing.store(false, Ordering::SeqCst);
    is_fully_synced.store(true, Ordering::SeqCst);
    info!("✅ [SyncManager] Sincronizacao concluida!");
}
