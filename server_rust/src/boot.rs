use socketioxide::SocketIo;
use std::sync::Arc;
use tracing::info;

use crate::config::AppConfig;
use crate::network::ConnectionManager;

pub async fn initialize_midi(
    app_config: &AppConfig,
    conn_mgr: &Arc<ConnectionManager>,
    io: SocketIo,
) {
    if app_config.demo_mode {
        info!("ℹ️ [DEMO] Modo Demo ativo — MIDI real desabilitado, usando simulacao.");
        // Emit connected state for demo mode
        conn_mgr.emit_connection_state();
        crate::midi::meter_dummy::start_meter_simulation(io.clone());
    } else {
        info!("ℹ️ [INFO] Modo Demo desativado. Buscando porta MIDI...");

        let (inputs, outputs) = crate::midi::MidiEngine::get_available_ports();
        let search_monitor = app_config.loopmidi_monitor;

        info!("📋 Portas MIDI de entrada disponiveis:");
        for (id, name) in &inputs {
            info!("   IN [{}] = {}", id, name);
        }
        info!("📋 Portas MIDI de saida disponiveis:");
        for (id, name) in &outputs {
            info!("   OUT [{}] = {}", id, name);
        }

        let criteria = if search_monitor { "monitor" } else { "yamaha" };

        let find_port = |ports: &[(usize, String)]| -> Option<usize> {
            for (idx, name) in ports {
                let lower = name.to_lowercase();
                if search_monitor {
                    if lower.contains("monitor") {
                        return Some(*idx);
                    }
                } else {
                    if lower.contains("yamaha") && lower.contains("-1") {
                        return Some(*idx);
                    }
                }
            }
            None
        };

        let found_in = find_port(&inputs);
        let found_out = find_port(&outputs);

        if found_in.is_none() || found_out.is_none() {
            tracing::warn!(
                "⚠️ Nenhuma porta com \"{}\" encontrada. Iniciando radar automatico...",
                criteria
            );
        } else {
            let in_idx = found_in.unwrap();
            let out_idx = found_out.unwrap();
            // Delay para garantir que portas MIDI foram liberadas pelo processo anterior (restart)
            tokio::time::sleep(std::time::Duration::from_millis(1000)).await;
            conn_mgr.try_boot_connect(in_idx, out_idx).await;
        }

        let boot_delay = app_config.boot_delay_ms;
        let conn_mgr_radar = conn_mgr.clone();
        tokio::spawn(async move {
            tokio::time::sleep(std::time::Duration::from_millis(boot_delay)).await;
            conn_mgr_radar.iniciar_busca_automatica();
        });
    }
}

pub fn initialize_dmx(app_config: &AppConfig) {
    if app_config.sistema_iluminacao {
        let root_dir = std::env::current_dir()
            .unwrap()
            .parent()
            .unwrap()
            .to_string_lossy()
            .to_string();
        let dmx_delay = app_config.dmx_boot_delay_ms;
        tokio::spawn(async move {
            tokio::time::sleep(std::time::Duration::from_millis(dmx_delay)).await;
            crate::dmx::start_dmx_app(false, &root_dir);
        });
    }
}
