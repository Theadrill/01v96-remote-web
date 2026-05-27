use serde::{Deserialize, Serialize};
use std::fs;
use tracing::{error, info};

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
    
    // Dados carregados dos outros JSONs
    #[serde(skip)]
    pub names: std::collections::HashMap<String, String>,
    #[serde(skip)]
    pub steps: serde_json::Value,
}

impl AppConfig {
    pub fn load() -> Self {
        // Tenta ler o arquivo config.json
        let config_path = "../config.json";
        let mut config = match fs::read_to_string(config_path) {
            Ok(contents) => {
                match serde_json::from_str::<AppConfig>(&contents) {
                    Ok(c) => c,
                    Err(e) => {
                        error!("❌ Erro ao parsear config.json: {}. Usando fallback.", e);
                        Self::default_config()
                    }
                }
            },
            Err(e) => {
                error!("❌ Não foi possível ler {}: {}. Usando fallback.", config_path, e);
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
            names: std::collections::HashMap::new(),
            steps: serde_json::Value::Null,
        }
    }
}
