use socketioxide::SocketIo;
use std::sync::Arc;
use tokio::sync::RwLock;

pub fn setup_tailscale_serve(port: u16, global_state: Arc<RwLock<crate::state::GlobalState>>, io: SocketIo) {
    tokio::task::spawn_blocking(move || {
        use std::process::Command;
        use tracing::{info, warn, error};

        info!("🔍 [TAILSCALE] Verificando integracao com a VPN...");

        // 1. Verifica se o Tailscale está instalado e rodando
        let ts_status = Command::new("tailscale").arg("status").output();
        if ts_status.is_err() || !ts_status.unwrap().status.success() {
            warn!("⚠️ [TAILSCALE] Comando nao encontrado ou servico parado. Pulando setup.");
            return;
        }

        // 2. Verifica o status atual do "serve"
        if let Ok(output) = Command::new("tailscale").args(["serve", "status"]).output() {
            let stdout = String::from_utf8_lossy(&output.stdout);
            let port_str = format!("127.0.0.1:{}", port);
            
            // Se já está configurado para a nossa porta
            if stdout.contains(&port_str) || stdout.contains(&format!("localhost:{}", port)) {
                if let Some(url_line) = stdout.lines().find(|l| l.starts_with("https://")) {
                    let url = url_line.split_whitespace().next().unwrap_or("").to_string();
                    info!("🚀 [TAILSCALE] Proxy HTTPS ja ativo! Acesso remoto seguro em: {}", url);
                    
                    let gs = global_state.clone();
                    let io_clone = io.clone();
                    let url_clone = url.clone();
                    tokio::spawn(async move {
                        gs.write().await.tailscale_url = Some(url_clone.clone());
                        let _ = io_clone.emit("tailscaleUrl", &serde_json::json!({ "url": url_clone }));
                    });
                } else {
                    info!("🚀 [TAILSCALE] Proxy ja configurado para a porta {}.", port);
                }
                return;
            }
        }

        // 3. Se não encontrou, vamos configurar automaticamente
        info!("⚙️ [TAILSCALE] Configurando proxy reverso automatico para a porta {}...", port);
        let setup = Command::new("tailscale")
            .args(["serve", "--bg", &port.to_string()])
            .output();

        match setup {
            Ok(out) if out.status.success() => {
                // Pequeno delay para garantir que o serviço do Windows registrou a rota
                std::thread::sleep(std::time::Duration::from_millis(1000));
                
                // Checa novamente para extrair a URL gerada e exibir no log
                if let Ok(check) = Command::new("tailscale").args(["serve", "status"]).output() {
                    let stdout_check = String::from_utf8_lossy(&check.stdout);
                    if let Some(url_line) = stdout_check.lines().find(|l| l.starts_with("https://")) {
                        let url = url_line.split_whitespace().next().unwrap_or("").to_string();
                        info!("✅ [TAILSCALE] Tudo pronto! O Microfone esta liberado pelo link: {}", url);
                        
                        let gs = global_state.clone();
                        let io_clone = io.clone();
                        let url_clone = url.clone();
                        tokio::spawn(async move {
                            gs.write().await.tailscale_url = Some(url_clone.clone());
                            let _ = io_clone.emit("tailscaleUrl", &serde_json::json!({ "url": url_clone }));
                        });
                    } else {
                        info!("✅ [TAILSCALE] Proxy configurado com sucesso.");
                    }
                }
            }
            Ok(out) => {
                let err = String::from_utf8_lossy(&out.stderr);
                warn!("⚠️ [TAILSCALE] O comando falhou: {}", err.trim());
            }
            Err(e) => {
                error!("❌ [TAILSCALE] Erro ao tentar rodar o proxy: {}", e);
            }
        }
    });
}
