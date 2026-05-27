use serde::{Deserialize, Serialize};
use std::fs;
use std::sync::Arc;
use tokio::sync::Mutex;
use tracing::{error, info};

static SAVE_NAMES_TIMER: std::sync::LazyLock<Arc<Mutex<Option<tokio::task::JoinHandle<()>>>>> =
    std::sync::LazyLock::new(|| Arc::new(Mutex::new(None)));

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AppConfig {
    #[serde(rename = "inIdx")]
    pub in_idx: usize,

    #[serde(rename = "outIdx")]
    pub out_idx: usize,

    #[serde(rename = "loopmidi-monitor")]
    pub loopmidi_monitor: bool,

    pub open_browser_startup: bool,
    pub demo_mode: bool,
    pub lumikit_ips: Vec<String>,

    pub meter_fps_desktop: u32,
    pub meter_fps_mobile: u32,

    pub watchdog_timeout_ms: u64,
    pub meter_poll_interval_ms: u64,
    pub name_save_debounce_ms: u64,
    pub scene_recall_delay_ms: u64,
    pub scene_save_delay_ms: u64,
    pub scene_resync_delay_ms: u64,
    pub name_update_char_delay_ms: u64,
    pub scheduler_tick_ms: u64,
    pub boot_delay_ms: u64,
    pub dmx_boot_delay_ms: u64,

    pub sistema_iluminacao: bool,
    pub disable_systray: bool,

    #[serde(default = "default_tecnico_pass")]
    pub tecnico_pass: String,

    #[serde(default = "default_port")]
    pub port: u16,

    #[serde(default = "default_meter_opacity")]
    pub meter_opacity: f64,

    // Dados carregados dos outros JSONs
    #[serde(skip)]
    pub names: std::collections::HashMap<String, String>,
    #[serde(skip)]
    pub steps: serde_json::Value,
}

fn default_tecnico_pass() -> String {
    "2107".to_string()
}

fn default_port() -> u16 {
    4000
}

fn default_meter_opacity() -> f64 {
    1.0
}

impl AppConfig {
    pub fn load() -> Self {
        // Tenta ler o arquivo config.json
        let config_path = "../config.json";
        let mut config = match fs::read_to_string(config_path) {
            Ok(contents) => match serde_json::from_str::<AppConfig>(&contents) {
                Ok(c) => c,
                Err(e) => {
                    error!("❌ Erro ao parsear config.json: {}. Usando fallback.", e);
                    Self::default_config()
                }
            },
            Err(e) => {
                error!(
                    "❌ Não foi possível ler {}: {}. Usando fallback.",
                    config_path, e
                );
                Self::default_config()
            }
        };

        // Ler names.json
        if let Ok(contents) = fs::read_to_string("../names.json") {
            if let Ok(names) = serde_json::from_str(&contents) {
                config.names = names;
                info!("✅ names.json carregado.");
            }
        }

        // Ler steps.json
        if let Ok(contents) = fs::read_to_string("../public/steps.json") {
            if let Ok(steps) = serde_json::from_str(&contents) {
                config.steps = steps;
                info!("✅ steps.json carregado.");
            }
        }

        config
    }

    pub fn save(&self) {
        let config_path = "../config.json";
        match serde_json::to_string_pretty(self) {
            Ok(json_str) => {
                if let Err(e) = fs::write(config_path, json_str) {
                    error!("❌ [CONFIG] Erro ao salvar config.json: {}", e);
                } else {
                    info!("💾 [CONFIG] config.json salvo com sucesso.");
                }
            }
            Err(e) => {
                error!("❌ [CONFIG] Erro ao serializar config: {}", e);
            }
        }
    }

    fn default_config() -> Self {
        AppConfig {
            in_idx: 0,
            out_idx: 1,
            loopmidi_monitor: false,
            open_browser_startup: false,
            demo_mode: false,
            lumikit_ips: vec![],
            meter_fps_desktop: 30,
            meter_fps_mobile: 30,
            watchdog_timeout_ms: 5000,
            meter_poll_interval_ms: 33,
            name_save_debounce_ms: 1000,
            scene_recall_delay_ms: 2000,
            scene_save_delay_ms: 500,
            scene_resync_delay_ms: 700,
            name_update_char_delay_ms: 60,
            scheduler_tick_ms: 8,
            boot_delay_ms: 1500,
            dmx_boot_delay_ms: 3000,
            sistema_iluminacao: false,
            disable_systray: false,
            tecnico_pass: default_tecnico_pass(),
            port: default_port(),
            meter_opacity: 1.0,
            names: std::collections::HashMap::new(),
            steps: serde_json::Value::Null,
        }
    }
}

pub fn save_names_to_disk(state: &crate::state::GlobalState, debounce_ms: u64) {
    let state_snapshot = state.clone();
    let timer_lock = SAVE_NAMES_TIMER.clone();

    tokio::spawn(async move {
        let mut guard = timer_lock.lock().await;
        if let Some(handle) = guard.take() {
            handle.abort();
        }
        *guard = Some(tokio::spawn(async move {
            tokio::time::sleep(std::time::Duration::from_millis(debounce_ms)).await;

            let mut names: std::collections::HashMap<String, String> = std::collections::HashMap::new();
            for i in 0..32 {
                if let Some(ch) = state_snapshot.channels.get(&i) {
                    names.insert(i.to_string(), ch.name.clone());
                }
            }
            for st_idx in 0..4 {
                let global_id = 60 + st_idx * 2;
                let local_idx = 32 + st_idx;
                if let Some(ch) = state_snapshot.channels.get(&local_idx) {
                    names.insert(global_id.to_string(), ch.name.clone());
                }
            }
            for (i, m) in &state_snapshot.mixes {
                names.insert((36 + i).to_string(), m.name.clone());
            }
            for (i, b) in &state_snapshot.buses {
                names.insert((44 + i).to_string(), b.name.clone());
            }
            names.insert("52".to_string(), state_snapshot.master.name.clone());

            let names_path = "../names.json";
            match serde_json::to_string_pretty(&names) {
                Ok(json_str) => {
                    if let Err(e) = fs::write(names_path, json_str) {
                        error!("❌ [NAMES] Erro ao salvar names.json: {}", e);
                    }
                }
                Err(e) => error!("❌ [NAMES] Erro ao serializar nomes: {}", e),
            }
        }));
    });
}
