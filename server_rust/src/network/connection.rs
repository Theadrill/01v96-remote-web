use crate::config::AppConfig;
use crate::midi::{self, MidiEngine, MidiScheduler, SyncCounter};
use crate::network::SyncManager;
use crate::state::GlobalState;
use socketioxide::SocketIo;
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use tokio::sync::{RwLock, mpsc};
use tracing::{error, info, warn};

pub struct ConnectionManager {
    config: AppConfig,
    io: SocketIo,
    scheduler: Arc<MidiScheduler>,
    state: Arc<RwLock<GlobalState>>,
    sync_counter: Arc<SyncCounter>,
    sync_manager: Arc<SyncManager>,
    engine: Option<Arc<tokio::sync::Mutex<MidiEngine>>>,
    remote_client: Option<Arc<midi::RemoteClient>>,
    midi_in_tx: mpsc::Sender<Vec<u8>>,
    is_connected: Arc<AtomicBool>,
    is_fully_synced: Arc<AtomicBool>,
    last_activity: Arc<std::sync::Mutex<u64>>,
    busca_handle: Arc<std::sync::Mutex<Option<tokio::task::JoinHandle<()>>>>,
    meter_handle: Arc<std::sync::Mutex<Option<tokio::task::JoinHandle<()>>>>,
    demo_handle: Arc<std::sync::Mutex<Option<tokio::task::JoinHandle<()>>>>,
    pub active_views: Arc<std::sync::Mutex<std::collections::HashMap<String, String>>>,
}

impl ConnectionManager {
    pub fn new(
        config: AppConfig,
        io: SocketIo,
        scheduler: Arc<MidiScheduler>,
        state: Arc<RwLock<GlobalState>>,
        sync_counter: Arc<SyncCounter>,
        sync_manager: Arc<SyncManager>,
        engine: Option<Arc<tokio::sync::Mutex<MidiEngine>>>,
        remote_client: Option<Arc<midi::RemoteClient>>,
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
            remote_client,
            midi_in_tx,
            is_connected: Arc::new(AtomicBool::new(false)),
            is_fully_synced: Arc::new(AtomicBool::new(false)),
            last_activity: Arc::new(std::sync::Mutex::new(0)),
            busca_handle: Arc::new(std::sync::Mutex::new(None)),
            meter_handle: Arc::new(std::sync::Mutex::new(None)),
            demo_handle: Arc::new(std::sync::Mutex::new(None)),
            active_views: Arc::new(std::sync::Mutex::new(std::collections::HashMap::new())),
        })
    }

    pub fn is_connected(&self) -> bool {
        if self.config.remote_midi {
            if let Some(ref client) = self.remote_client {
                client.is_connected()
            } else {
                false
            }
        } else {
            self.is_connected.load(Ordering::SeqCst)
        }
    }

    pub fn is_fully_synced(&self) -> bool {
        self.sync_manager.is_ready() || self.is_fully_synced.load(Ordering::SeqCst)
    }

    pub fn is_syncing(&self) -> bool {
        self.is_connected() && self.sync_manager.is_busy()
    }

    pub fn emit_connection_state(&self) {
        let connected = self.is_connected();
        let io = self.io.clone();
        let demo = self.config.demo_mode;
        tokio::spawn(async move {
            let _ = io
                .emit(
                    "connectionState",
                    &serde_json::json!({ "connected": connected, "demo_mode": demo }),
                )
                .await;
        });
    }

    pub async fn try_boot_connect(self: &Arc<Self>, in_idx: usize, out_idx: usize) {
        if self.config.remote_midi {
            info!("🌐 Remoto MIDI ativo. Inicializando monitor de conexão de rede.");
            self.iniciar_busca_automatica();
            return;
        }

        let (inputs, outputs) = MidiEngine::get_available_ports();

        let validate = |name: &str| -> bool {
            let lower = name.to_lowercase();
            if self.config.loopmidi_monitor {
                lower.contains("monitor")
            } else {
                lower.contains("yamaha") && lower.contains("-1")
            }
        };

        let in_name = inputs
            .iter()
            .find(|(i, _)| *i == in_idx)
            .map(|(_, n)| n.clone())
            .unwrap_or_default();
        let out_name = outputs
            .iter()
            .find(|(i, _)| *i == out_idx)
            .map(|(_, n)| n.clone())
            .unwrap_or_default();

        if !validate(&in_name) || !validate(&out_name) {
            warn!("🚫 Conexao bloqueada no boot: porta nao atende criterios");
            return;
        }

        info!(
            "🎯 {} encontrada no boot: IN[{}]=\"{}\"  OUT[{}]=\"{}\"",
            if self.config.loopmidi_monitor {
                "loopMIDI"
            } else {
                "Yamaha 01V96"
            },
            in_idx,
            in_name,
            out_idx,
            out_name
        );

        self.executar_conexao(in_idx, out_idx).await;
    }

    pub fn iniciar_busca_automatica(self: &Arc<Self>) {
        if self.config.remote_midi {
            self.iniciar_monitor_conexao_remota();
            return;
        }

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
                        if m {
                            return Some((*idx, name.clone()));
                        }
                    }
                    None
                };

                if let (Some((in_idx, in_name)), Some((out_idx, out_name))) =
                    (find_port(&inputs), find_port(&outputs))
                {
                    info!(
                        "🎯 {} encontrada: IN[{}]=\"{}\"  OUT[{}]=\"{}\"",
                        if this.config.loopmidi_monitor {
                            "loopMIDI"
                        } else {
                            "Yamaha 01V96"
                        },
                        in_idx,
                        in_name,
                        out_idx,
                        out_name
                    );
                    this.executar_conexao(in_idx, out_idx).await;
                }
            }
        });

        if let Ok(mut guard) = self.busca_handle.lock() {
            if let Some(old) = guard.take() {
                old.abort();
            }
            *guard = Some(handle);
        }
    }

    pub fn iniciar_monitor_conexao_remota(self: &Arc<Self>) {
        let this = self.clone();
        let handle = tokio::spawn(async move {
            let mut last_state = false;
            let mut interval = tokio::time::interval(std::time::Duration::from_millis(500));
            loop {
                interval.tick().await;
                let current_state = this.is_connected();
                if current_state != last_state {
                    last_state = current_state;
                    if current_state {
                        info!("🌐 [Conexão Remota] Status alterado para CONECTADO.");
                        this.is_connected.store(true, Ordering::SeqCst);
                        this.emit_connection_state();

                        info!("⏳ [Conexão Remota] Cooldown de 5s antes de sincronizar...");
                        tokio::time::sleep(std::time::Duration::from_secs(5)).await;

                        if !this.is_connected() {
                            last_state = false;
                            this.is_connected.store(false, Ordering::SeqCst);
                            this.emit_connection_state();
                            continue;
                        }

                        this.is_fully_synced.store(false, Ordering::SeqCst);
                        info!("🔄 [Conexão Remota] Iniciando sincronia completa...");
                        this.sync_manager.reset();
                        this.sync_manager.fire(true, "normal", this.state.clone());
                        this.iniciar_meter_loop();
                    } else {
                        info!("🌐 [Conexão Remota] Status alterado para DESCONECTADO.");
                        this.handle_disconnection(false).await;
                    }
                }
            }
        });

        if let Ok(mut guard) = self.busca_handle.lock() {
            if let Some(old) = guard.take() {
                old.abort();
            }
            *guard = Some(handle);
        }
    }

    pub fn parar_busca(&self) {
        if let Ok(mut guard) = self.busca_handle.lock()
            && let Some(h) = guard.take()
        {
            h.abort();
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

                if !this.is_connected() {
                    break;
                }

                if !this.config.remote_midi {
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

                let synced = this.sync_manager.is_ready();
                if !synced {
                    continue;
                }

                let (needs_ins, needs_outs) = {
                    let views = this.active_views.lock().unwrap();
                    let mut i = false;
                    let mut o = false;
                    if views.is_empty() {
                        i = true; // Default to INS if no clients connected
                    } else {
                        for v in views.values() {
                            if v == "ins" { i = true; }
                            if v == "outs" || v == "techMix" { o = true; }
                        }
                    }
                    (i, o)
                };

                this.scheduler
                    .enqueue(midi::master_meter::MasterMeter::build_request(), 2)
                    .await;
                this.scheduler
                    .enqueue(vec![240, 67, 48, 62, 127, 33, 0, 0, 0, 0, 32, 247], 2)
                    .await;
                this.scheduler
                    .enqueue(vec![240, 67, 48, 62, 127, 32, 0, 0, 0, 0, 32, 247], 2)
                    .await;
                this.scheduler
                    .enqueue(vec![240, 67, 48, 62, 26, 33, 0, 0, 0, 0, 32, 247], 2)
                    .await;

                if needs_ins && !needs_outs {
                    // Only INS clients
                    this.scheduler
                        .enqueue(vec![240, 67, 48, 62, 13, 33, 0, 0, 0, 0, 32, 247], 2)
                        .await;
                    this.scheduler
                        .enqueue(vec![240, 67, 48, 62, 13, 32, 0, 0, 0, 0, 32, 247], 2)
                        .await;
                } else if needs_outs && !needs_ins {
                    // Only OUTS clients
                    // We still request INS (13, 33, 0) if we want? Actually, ST IN is in 13, 32. Let's just request the necessary blocks.
                    this.scheduler
                        .enqueue(vec![240, 67, 48, 62, 13, 33, 0, 0, 0, 0, 32, 247], 2) // Some functionality might expect basic channels
                        .await;
                    this.scheduler
                        .enqueue(vec![240, 67, 48, 62, 13, 32, 0, 0, 0, 0, 32, 247], 2) // ST IN and FX
                        .await;
                    this.scheduler
                        .enqueue(vec![240, 67, 48, 62, 13, 33, 1, 0, 0, 0, 16, 247], 2) // Bus
                        .await;
                    this.scheduler
                        .enqueue(vec![240, 67, 48, 62, 13, 33, 2, 0, 0, 0, 16, 247], 2) // Aux
                        .await;
                } else if needs_ins && needs_outs {
                    // Both INS and OUTS clients
                    this.scheduler
                        .enqueue(vec![240, 67, 48, 62, 13, 33, 0, 0, 0, 0, 32, 247], 2)
                        .await;
                    this.scheduler
                        .enqueue(vec![240, 67, 48, 62, 13, 32, 0, 0, 0, 0, 32, 247], 2)
                        .await;
                    this.scheduler
                        .enqueue(vec![240, 67, 48, 62, 13, 33, 1, 0, 0, 0, 16, 247], 2)
                        .await;
                    this.scheduler
                        .enqueue(vec![240, 67, 48, 62, 13, 33, 2, 0, 0, 0, 16, 247], 2)
                        .await;
                }
            }
        });

        if let Ok(mut guard) = self.meter_handle.lock() {
            if let Some(old) = guard.take() {
                old.abort();
            }
            *guard = Some(handle);
        }
    }

    pub async fn executar_conexao(self: &Arc<Self>, in_idx: usize, out_idx: usize) {
        let (inputs, outputs) = MidiEngine::get_available_ports();

        let validate = |name: &str| -> bool {
            let lower = name.to_lowercase();
            if self.config.loopmidi_monitor {
                lower.contains("monitor")
            } else {
                lower.contains("yamaha") && lower.contains("-1")
            }
        };

        let in_name = inputs
            .iter()
            .find(|(i, _)| *i == in_idx)
            .map(|(_, n)| n.clone())
            .unwrap_or_default();
        let out_name = outputs
            .iter()
            .find(|(i, _)| *i == out_idx)
            .map(|(_, n)| n.clone())
            .unwrap_or_default();

        if !validate(&in_name) || !validate(&out_name) {
            warn!("🚫 Conexao bloqueada: porta nao atende criterios");
            return;
        }

        if self.is_connected() {
            return;
        }

        if let Some(ref engine) = self.engine {
            let mut engine_guard = engine.lock().await;
            let tx = self.midi_in_tx.clone();
            match engine_guard.connect_ports(in_idx, out_idx, tx) {
                Ok(name) => info!("✅ Conexao MIDI estabelecida: {}", name),
                Err(e) => {
                    error!("Erro ao conectar MIDI: {}", e);
                    self.handle_disconnection(false).await;
                    return;
                }
            }
        }

        self.is_connected.store(true, Ordering::SeqCst);
        self.emit_connection_state();

        info!("⏳ Cooldown de 5s antes da sincronia...");
        tokio::time::sleep(std::time::Duration::from_secs(5)).await;

        if !self.is_connected() {
            return;
        }

        // Aguarda o MIDI reader processar o backlog acumulado durante o cooldown
        tokio::time::sleep(std::time::Duration::from_millis(500)).await;

        self.is_fully_synced.store(false, Ordering::SeqCst);
        info!("🔄 Iniciando sincronia completa...");
        self.sync_manager.reset();
        self.sync_manager.fire(true, "normal", self.state.clone());

        self.iniciar_meter_loop();
    }

    pub async fn handle_disconnection(self: &Arc<Self>, retry: bool) {
        if !self.is_connected.swap(false, Ordering::SeqCst) && retry {
            return;
        }

        let stop = midi::master_meter::MasterMeter::build_stop_request();
        self.scheduler.enqueue(stop, 0).await;
        self.scheduler.clear(None).await;

        self.parar_busca();
        if let Ok(mut guard) = self.meter_handle.lock()
            && let Some(h) = guard.take()
        {
            h.abort();
        }

        self.sync_counter.reset();
        self.emit_connection_state();

        if self.config.remote_midi {
            info!("🌐 [Conexão Remota] Reiniciando monitor de conexão...");
            self.iniciar_monitor_conexao_remota();
        } else if retry {
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
        self.sync_manager
            .fire(force_names, sync_type, self.state.clone());
    }

    pub fn sync_names(&self) {
        self.is_fully_synced.store(false, Ordering::SeqCst);
        self.sync_manager.sync_names_only();
    }

    pub fn fire_params_only(&self, force_names: bool, sync_type: &str) {
        self.is_fully_synced.store(false, Ordering::SeqCst);
        self.sync_manager
            .fire_params_only(force_names, sync_type, self.state.clone());
    }

    pub fn enable_demo(self: &Arc<Self>) {
        self.is_connected.store(true, Ordering::SeqCst);
        self.is_fully_synced.store(true, Ordering::SeqCst);
        self.emit_connection_state();

        let handle = crate::midi::meter_dummy::start_meter_simulation(self.io.clone());

        if let Ok(mut guard) = self.demo_handle.lock() {
            if let Some(old) = guard.take() {
                old.abort();
            }
            *guard = Some(handle);
        }
    }

    pub fn disable_demo(self: &Arc<Self>) {
        self.is_connected.store(false, Ordering::SeqCst);
        if let Ok(mut guard) = self.demo_handle.lock()
            && let Some(h) = guard.take()
        {
            h.abort();
        }
        self.emit_connection_state();
    }

    fn now_ms() -> u64 {
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis() as u64
    }
}
