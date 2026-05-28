use crate::config::AppConfig;
use crate::midi::{self, MidiEngine, MidiScheduler, SyncCounter};
use crate::network::SyncManager;
use crate::state::GlobalState;
use socketioxide::SocketIo;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tokio::sync::{mpsc, RwLock};
use tracing::{error, info, warn};

pub struct ConnectionManager {
    config: AppConfig,
    io: SocketIo,
    scheduler: Arc<MidiScheduler>,
    state: Arc<RwLock<GlobalState>>,
    sync_counter: Arc<SyncCounter>,
    sync_manager: Arc<SyncManager>,
    engine: Arc<tokio::sync::Mutex<MidiEngine>>,
    midi_in_tx: mpsc::Sender<Vec<u8>>,
    is_connected: Arc<AtomicBool>,
    is_fully_synced: Arc<AtomicBool>,
    last_activity: Arc<std::sync::Mutex<u64>>,
    busca_handle: Arc<std::sync::Mutex<Option<tokio::task::JoinHandle<()>>>>,
    meter_handle: Arc<std::sync::Mutex<Option<tokio::task::JoinHandle<()>>>>,
}

impl ConnectionManager {
    pub fn new(
        config: AppConfig,
        io: SocketIo,
        scheduler: Arc<MidiScheduler>,
        state: Arc<RwLock<GlobalState>>,
        sync_counter: Arc<SyncCounter>,
        sync_manager: Arc<SyncManager>,
        engine: Arc<tokio::sync::Mutex<MidiEngine>>,
        midi_in_tx: mpsc::Sender<Vec<u8>>,
    ) -> Arc<Self> {
        Arc::new(Self {
            config,
            io,
            scheduler,
            state,
            sync_counter,
            sync_manager,
            engine,
            midi_in_tx,
            is_connected: Arc::new(AtomicBool::new(false)),
            is_fully_synced: Arc::new(AtomicBool::new(false)),
            last_activity: Arc::new(std::sync::Mutex::new(0)),
            busca_handle: Arc::new(std::sync::Mutex::new(None)),
            meter_handle: Arc::new(std::sync::Mutex::new(None)),
        })
    }

    pub fn is_connected(&self) -> bool {
        self.is_connected.load(Ordering::SeqCst)
    }

    pub fn emit_connection_state(&self) {
        let connected = self.is_connected.load(Ordering::SeqCst);
        let io = self.io.clone();
        let demo = self.config.demo_mode;
        tokio::spawn(async move {
            let _ = io.emit(
                "connectionState",
                &serde_json::json!({ "connected": connected, "demo_mode": demo }),
            );
        });
    }

    pub async fn try_boot_connect(
        self: &Arc<Self>,
        in_idx: usize,
        out_idx: usize,
    ) {
        let (inputs, outputs) = MidiEngine::get_available_ports();

        let validate = |name: &str| -> bool {
            let lower = name.to_lowercase();
            if self.config.loopmidi_monitor {
                lower.contains("monitor")
            } else {
                lower.contains("yamaha") && lower.contains("-1")
            }
        };

        let in_name = inputs.iter().find(|(i, _)| *i == in_idx).map(|(_, n)| n.clone()).unwrap_or_default();
        let out_name = outputs.iter().find(|(i, _)| *i == out_idx).map(|(_, n)| n.clone()).unwrap_or_default();

        if !validate(&in_name) || !validate(&out_name) {
            warn!("🚫 Conexao bloqueada no boot: porta nao atende criterios");
            return;
        }

        info!(
            "🎯 {} encontrada no boot: IN[{}]=\"{}\"  OUT[{}]=\"{}\"",
            if self.config.loopmidi_monitor { "loopMIDI" } else { "Yamaha 01V96" },
            in_idx, in_name, out_idx, out_name
        );

        self.executar_conexao(in_idx, out_idx).await;
    }

    pub fn iniciar_busca_automatica(self: &Arc<Self>) {
        if self.is_connected() {
            return;
        }

        let this = self.clone();
        let handle = tokio::spawn(async move {
            let mut interval = tokio::time::interval(std::time::Duration::from_secs(1));
            loop {
                interval.tick().await;
                if this.is_connected() {
                    break;
                }

                let (inputs, outputs) = MidiEngine::get_available_ports();

                let find_port = |ports: &[(usize, String)]| -> Option<(usize, String)> {
                    for (idx, name) in ports {
                        let lower = name.to_lowercase();
                        let m = if this.config.loopmidi_monitor {
                            lower.contains("monitor")
                        } else {
                            lower.contains("yamaha") && lower.contains("-1")
                        };
                        if m { return Some((*idx, name.clone())); }
                    }
                    None
                };

                if let (Some((in_idx, in_name)), Some((out_idx, out_name))) = (find_port(&inputs), find_port(&outputs)) {
                    info!(
                        "🎯 {} encontrada: IN[{}]=\"{}\"  OUT[{}]=\"{}\"",
                        if this.config.loopmidi_monitor { "loopMIDI" } else { "Yamaha 01V96" },
                        in_idx, in_name, out_idx, out_name
                    );
                    this.executar_conexao(in_idx, out_idx).await;
                }
            }
        });

        if let Ok(mut guard) = self.busca_handle.lock() {
            if let Some(old) = guard.take() { old.abort(); }
            *guard = Some(handle);
        }
    }

    pub fn parar_busca(&self) {
        if let Ok(mut guard) = self.busca_handle.lock() {
            if let Some(h) = guard.take() { h.abort(); }
        }
    }

    pub fn iniciar_meter_loop(self: &Arc<Self>) {
        {
            if let Ok(mut last) = self.last_activity.lock() {
                *last = Self::now_ms();
            }
        }

        let this = self.clone();
        let interval_ms = self.config.meter_poll_interval_ms;
        let watchdog_timeout = self.config.watchdog_timeout_ms;

        let handle = tokio::spawn(async move {
            let mut interval = tokio::time::interval(std::time::Duration::from_millis(interval_ms));
            loop {
                interval.tick().await;

                if !this.is_connected() { break; }

                {
                    let expired = {
                        let last = this.last_activity.lock().unwrap();
                        Self::now_ms() - *last > watchdog_timeout
                    };
                    if expired {
                        warn!("⚠️ Watchdog: Timeout de conexao. Mesa parou de responder.");
                        this.handle_disconnection(true).await;
                        break;
                    }
                }

                if !this.is_fully_synced.load(Ordering::SeqCst) { continue; }

                this.scheduler.enqueue(midi::master_meter::MasterMeter::build_request(), 2).await;
                this.scheduler.enqueue(vec![240, 67, 48, 62, 127, 33, 0, 0, 0, 0, 31, 247], 2).await;
                this.scheduler.enqueue(vec![240, 67, 48, 62, 127, 32, 0, 0, 0, 0, 31, 247], 2).await;
                this.scheduler.enqueue(vec![240, 67, 48, 62, 26, 33, 0, 0, 0, 0, 31, 247], 2).await;
                this.scheduler.enqueue(vec![240, 67, 48, 62, 13, 33, 0, 0, 0, 0, 31, 247], 2).await;
                this.scheduler.enqueue(vec![240, 67, 48, 62, 13, 32, 0, 0, 0, 0, 31, 247], 2).await;
            }
        });

        if let Ok(mut guard) = self.meter_handle.lock() {
            if let Some(old) = guard.take() { old.abort(); }
            *guard = Some(handle);
        }
    }

    pub async fn executar_conexao(
        self: &Arc<Self>,
        in_idx: usize,
        out_idx: usize,
    ) {
        let (inputs, outputs) = MidiEngine::get_available_ports();

        let validate = |name: &str| -> bool {
            let lower = name.to_lowercase();
            if self.config.loopmidi_monitor { lower.contains("monitor") }
            else { lower.contains("yamaha") && lower.contains("-1") }
        };

        let in_name = inputs.iter().find(|(i,_)| *i==in_idx).map(|(_,n)| n.clone()).unwrap_or_default();
        let out_name = outputs.iter().find(|(i,_)| *i==out_idx).map(|(_,n)| n.clone()).unwrap_or_default();

        if !validate(&in_name) || !validate(&out_name) {
            warn!("🚫 Conexao bloqueada: porta nao atende criterios");
            return;
        }

        if self.is_connected() { return; }

        {
            let mut engine = self.engine.lock().await;
            let tx = self.midi_in_tx.clone();
            match engine.connect_ports(in_idx, out_idx, tx) {
                Ok(name) => info!("✅ Conexao MIDI estabelecida: {}", name),
                Err(e) => { error!("Erro ao conectar MIDI: {}", e); self.handle_disconnection(false).await; return; }
            }
        }

        self.is_connected.store(true, Ordering::SeqCst);
        self.emit_connection_state();

        info!("⏳ Cooldown de 5s antes da sincronia...");
        tokio::time::sleep(std::time::Duration::from_secs(5)).await;

        if !self.is_connected() { return; }

        self.is_fully_synced.store(false, Ordering::SeqCst);
        info!("🔄 Iniciando sincronia completa...");
        self.sync_manager.fire(true, "normal", self.state.clone());

        self.iniciar_meter_loop();
    }

    pub async fn handle_disconnection(self: &Arc<Self>, retry: bool) {
        if !self.is_connected.swap(false, Ordering::SeqCst) && retry { return; }

        let stop = midi::master_meter::MasterMeter::build_stop_request();
        self.scheduler.enqueue(stop, 0).await;

        self.parar_busca();
        if let Ok(mut guard) = self.meter_handle.lock() {
            if let Some(h) = guard.take() { h.abort(); }
        }

        self.sync_counter.reset();
        self.emit_connection_state();

        if retry {
            info!("❌ Conexao perdida. Tentando reconectar...");
            self.iniciar_busca_automatica();
        }
    }

    pub fn reset_activity(&self) {
        if let Ok(mut last) = self.last_activity.lock() {
            *last = Self::now_ms();
        }
    }

    pub fn trigger_sync(&self, force_names: bool, sync_type: &str) {
        self.is_fully_synced.store(false, Ordering::SeqCst);
        self.sync_manager.fire(force_names, sync_type, self.state.clone());
    }

    pub fn sync_names(&self) {
        self.is_fully_synced.store(false, Ordering::SeqCst);
        self.sync_manager.sync_names_only();
    }

    fn now_ms() -> u64 {
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis() as u64
    }
}
