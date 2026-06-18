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

    pub watchdog_normal_ms: u64,
    pub watchdog_sync_ms: u64,
    pub meter_poll_interval_ms: u64,

    #[serde(default = "default_sync_chunk_size")]
    pub sync_chunk_size: u32,
    #[serde(default = "default_sync_chunk_delay_ms")]
    pub sync_chunk_delay_ms: u64,
    #[serde(default = "default_wasm_throttle_ms")]
    pub wasm_throttle_ms: u64,

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

    #[serde(default)]
    pub remote_midi: bool,

    #[serde(default)]
    pub remote_midi_networks: Vec<String>,

    #[serde(default = "default_remote_midi_port")]
    pub remote_midi_port: u16,

    #[serde(default)]
    pub remote_midi_last_host: String,

    #[serde(default = "default_port")]
    pub port: u16,

    #[serde(default = "default_meter_opacity")]
    pub meter_opacity: f64,

    #[serde(default = "default_rta_decay_rate")]
    pub rta_decay_rate: f64,

    #[serde(default = "default_rta_peak_hold_time")]
    pub rta_peak_hold_time: u32,

    #[serde(default = "default_rta_smoothing")]
    pub rta_smoothing: u32,

    #[serde(default = "default_rta_fft_size")]
    pub rta_fft_size: u32,

    // Dados carregados dos outros JSONs
    #[serde(skip)]
    pub steps: serde_json::Value,
}

fn default_port() -> u16 {
    4000
}

fn default_sync_chunk_size() -> u32 {
    50
}

fn default_sync_chunk_delay_ms() -> u64 {
    25
}

fn default_wasm_throttle_ms() -> u64 {
    16
}

fn default_meter_opacity() -> f64 {
    1.0
}

fn default_remote_midi_port() -> u16 {
    4200
}

fn default_rta_decay_rate() -> f64 {
    0.09
}

fn default_rta_peak_hold_time() -> u32 {
    7
}

fn default_rta_smoothing() -> u32 {
    90
}

fn default_rta_fft_size() -> u32 {
    4096
}

impl AppConfig {
    pub fn save_last_remote_host(&mut self, host: &str) {
        self.remote_midi_last_host = host.to_string();
        self.save();
    }

    pub fn load() -> Self {
        // Tenta ler o arquivo config.json
        let root = get_project_root();
        let config_path = root.join("config.json");

        // Migração automática: tecnico_pass legado (config.json) → SERVER_PASSWORD (.env)
        // Só roda se o .env ainda NÃO tem SERVER_PASSWORD (preserva configuração do usuário).
        if crate::env_config::load_password().is_none()
            && let Ok(contents) = fs::read_to_string(&config_path)
            && let Ok(mut json) = serde_json::from_str::<serde_json::Value>(&contents)
        {
            let legacy_pass = json
                .get("tecnico_pass")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string());
            if let Some(pass) = legacy_pass {
                if !pass.is_empty() {
                    match crate::env_config::load_server_name() {
                        Some(name) if !name.is_empty() => {
                            if let Err(e) = crate::env_config::save_env(&name, &pass) {
                                error!("[CONFIG] Falha ao migrar tecnico_pass para .env: {}", e);
                            } else {
                                info!("[CONFIG] tecnico_pass migrado para .env (nome + senha)");
                            }
                        }
                        _ => {
                            let env_path = crate::env_config::get_env_path();
                            if let Err(e) =
                                fs::write(&env_path, format!("SERVER_PASSWORD={}\n", pass))
                            {
                                error!("[CONFIG] Falha ao migrar tecnico_pass para .env: {}", e);
                            } else {
                                info!("[CONFIG] tecnico_pass migrado para .env (apenas senha)");
                            }
                        }
                    }
                }
                if let Some(obj) = json.as_object_mut() {
                    obj.remove("tecnico_pass");
                }
                if let Ok(pretty) = serde_json::to_string_pretty(&json) {
                    if let Err(e) = fs::write(&config_path, pretty) {
                        error!(
                            "[CONFIG] Falha ao regravar config.json sem tecnico_pass: {}",
                            e
                        );
                    } else {
                        info!("[CONFIG] tecnico_pass removido do config.json");
                    }
                }
            }
        }

        let mut config = match fs::read_to_string(&config_path) {
            Ok(contents) => match serde_json::from_str::<AppConfig>(&contents) {
                Ok(c) => c,
                Err(e) => {
                    error!("❌ Erro ao parsear config.json: {}. Usando fallback.", e);
                    Self::default_config()
                }
            },
            Err(e) => {
                error!(
                    "❌ Não foi possível ler {:?}: {}. Usando fallback.",
                    config_path, e
                );
                Self::default_config()
            }
        };

        // Ler steps.json
        let steps_path = root.join("public/steps.json");
        if let Ok(contents) = fs::read_to_string(&steps_path)
            && let Ok(steps) = serde_json::from_str(&contents)
        {
            config.steps = steps;
            info!("✅ steps.json carregado.");
        }

        config
    }

    pub fn save(&self) {
        let config_path = get_project_root().join("config.json");
        match serde_json::to_string_pretty(self) {
            Ok(json_str) => {
                if let Err(e) = fs::write(&config_path, json_str) {
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
            watchdog_normal_ms: 5000,
            watchdog_sync_ms: 20000,
            meter_poll_interval_ms: 33,
            sync_chunk_size: default_sync_chunk_size(),
            sync_chunk_delay_ms: default_sync_chunk_delay_ms(),
            wasm_throttle_ms: default_wasm_throttle_ms(),
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
            remote_midi: false,
            remote_midi_networks: vec![],
            remote_midi_port: default_remote_midi_port(),
            remote_midi_last_host: "".to_string(),
            port: default_port(),
            meter_opacity: 1.0,
            rta_decay_rate: default_rta_decay_rate(),
            rta_peak_hold_time: default_rta_peak_hold_time(),
            rta_smoothing: default_rta_smoothing(),
            rta_fft_size: default_rta_fft_size(),
            steps: serde_json::Value::Null,
        }
    }
}


pub fn get_project_root() -> std::path::PathBuf {
    if let Ok(exe_path) = std::env::current_exe()
        && let Some(exe_dir) = exe_path.parent()
    {
        // Candidato 1: exe na raiz (config.json está ao lado)
        if exe_dir.join("config.json").exists() {
            return exe_dir.to_path_buf();
        }
        // Candidato 2: exe em subpastas de build (sobe até 4 níveis para achar config.json)
        let mut current = exe_dir.to_path_buf();
        for _ in 0..4 {
            if let Some(parent) = current.parent() {
                current = parent.to_path_buf();
                if current.join("config.json").exists() {
                    return current;
                }
            } else {
                break;
            }
        }
    }
    std::path::PathBuf::from("..")
}
