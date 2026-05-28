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

        self.queue_all_params(force_names, state);
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
        let priority: u8 = 1;
        let sched = self.scheduler.clone();
        let io = self.io.clone();
        let is_syncing = self.is_syncing.clone();
        let is_fully_synced = self.is_fully_synced.clone();

        tokio::spawn(async move {
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
                    let global_id = 60 + (st * 2);
                    for c in 0..4u8 {
                        if let Some(req) = midi::protocol::build_name_request(global_id, c) {
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
                let mut out_indices: Vec<u8> = (36..=43).collect();
                out_indices.extend(44..=51);
                out_indices.push(52);
                for idx in out_indices {
                    for c in 0..8u8 {
                        if let Some(req) = midi::protocol::build_name_request(idx, c) {
                            sched.enqueue(req, priority).await;
                        }
                    }
                }
            }

            // Wait for Q0 and Q1 to drain, then finish sync
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

            is_syncing.store(false, Ordering::SeqCst);
            is_fully_synced.store(true, Ordering::SeqCst);
            info!("✅ [SyncManager] Sincronizacao concluida!");
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
