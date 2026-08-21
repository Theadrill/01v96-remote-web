use axum::{
    Json,
    extract::State,
    http::StatusCode,
    response::IntoResponse,
};
use serde_json::{Value, json};
use std::sync::Arc;
use tokio::sync::RwLock;
use crate::SHUTDOWN_TX;

pub fn router(state: Arc<RwLock<crate::state::GlobalState>>) -> axum::Router {
    axum::Router::new()
        .route("/network-info", axum::routing::get(get_network_info))
        .route("/log", axum::routing::get(get_log))
        .route("/restart", axum::routing::post(restart_server))
        .with_state(state)
}

fn is_lan_ipv4(ip: std::net::Ipv4Addr) -> bool {
    let o = ip.octets();
    match o[0] {
        10 => true,
        192 => o[1] == 168,
        172 => (16..=31).contains(&o[1]),
        _ => false,
    }
}

fn classify_lan_interface(iface_name: &str) -> (String, &'static str) {
    let lower = iface_name.to_lowercase();
    if lower.contains("wi-fi")
        || lower.contains("wifi")
        || lower.contains("wireless")
        || lower.contains("wlan")
        || lower.starts_with("wl")
    {
        ("Rede Local (Wi-Fi)".to_string(), "lan_wifi")
    } else if lower.contains("ethernet")
        || lower.contains("cabo")
        || lower.contains("eth")
        || lower.starts_with("enp")
        || lower.starts_with("eno")
        || lower.starts_with("ens")
    {
        ("Rede Local (Cabo)".to_string(), "lan_ethernet")
    } else {
        ("Rede Local".to_string(), "lan")
    }
}

async fn get_network_info(
    State(state): State<Arc<RwLock<crate::state::GlobalState>>>,
) -> Json<Value> {
    let hostname = gethostname::gethostname().to_string_lossy().to_string();
    let port = crate::config::AppConfig::load().port;

    let mut interfaces = Vec::new();
    let mut lan_ips: Vec<(String, String, &'static str)> = Vec::new();
    let mut seen_ips = std::collections::HashSet::new();

    if let Ok(ifas) = local_ip_address::list_afinet_netifas() {
        for (iface, ip) in ifas {
            if !ip.is_ipv4() {
                continue;
            }
            let ip_str = ip.to_string();
            let is_loopback = ip.is_loopback();

            interfaces.push(json!({
                "name": iface,
                "ip": ip_str,
                "type": "ipv4",
                "loopback": is_loopback,
            }));

            if let std::net::IpAddr::V4(v4) = ip {
                if !is_loopback && is_lan_ipv4(v4) && seen_ips.insert(ip_str.clone()) {
                    let (label, category) = classify_lan_interface(&iface);
                    lan_ips.push((ip_str, label, category));
                }
            }
        }
    }

    // Se houver múltiplas interfaces do mesmo tipo (ex: dois cabos ou dois wifis), podemos numerá-las se necessário,
    // mas se tiver exatamente cabo e wifi, lan_ips já conterá ambos devidamente rotulados.
    // Ordena para que Cabo venha antes de Wi-Fi, ou mantenha a ordem estável
    lan_ips.sort_by(|a, b| {
        let rank = |cat: &str| match cat {
            "lan_ethernet" => 0,
            "lan_wifi" => 1,
            _ => 2,
        };
        rank(a.2).cmp(&rank(b.2))
    });

    let lan_ipv4 = lan_ips.first().map(|(ip, _, _)| ip.clone());

    let mut ts_hostname: Option<String> = None;
    let mut ts_ip: Option<String> = None;

    if let Ok(output) = std::process::Command::new("tailscale")
        .args(["status", "--json"])
        .output()
    {
        if output.status.success()
            && let Ok(status_json) = serde_json::from_slice::<Value>(&output.stdout)
            && let Some(self_obj) = status_json.get("Self")
        {
            if let Some(name) = self_obj.get("HostName").and_then(|v| v.as_str())
                && !name.is_empty()
            {
                ts_hostname = Some(name.to_string());
            }
            if ts_hostname.is_none()
                && let Some(dns) = self_obj.get("DNSName").and_then(|v| v.as_str())
            {
                if let Some(first_part) = dns.split('.').next()
                    && !first_part.is_empty()
                {
                    ts_hostname = Some(first_part.to_string());
                }
            }
            if let Some(ips) = self_obj
                .get("TailscaleIPs")
                .and_then(|v| v.as_array())
            {
                for ip_val in ips {
                    if let Some(ip_str) = ip_val.as_str()
                        && ip_str.starts_with("100.")
                    {
                        ts_ip = Some(ip_str.to_string());
                        break;
                    }
                }
            }
        }
    }

    let tailscale_url = state.read().await.tailscale_url.clone();

    let mut urls = Vec::new();
    for (ip, label, category) in &lan_ips {
        urls.push(json!({
            "label": label,
            "url": format!("http://{}:{}", ip, port),
            "category": category,
        }));
    }
    if let Some(ts_host) = &ts_hostname {
        urls.push(json!({
            "label": "Tailscale (HTTP)",
            "url": format!("http://{}:{}", ts_host, port),
            "category": "tailscale_magicdns",
        }));
    }
    if let Some(ip) = &ts_ip {
        urls.push(json!({
            "label": "Tailscale IP",
            "url": format!("http://{}:{}", ip, port),
            "category": "tailscale_ip",
        }));
    }
    if let Some(ts_url) = &tailscale_url {
        urls.push(json!({
            "label": "Tailscale HTTPS",
            "url": ts_url,
            "category": "tailscale_https",
        }));
    }
    urls.push(json!({
        "label": "Localhost",
        "url": format!("http://localhost:{}", port),
        "category": "localhost",
    }));

    Json(json!({
        "hostname": hostname,
        "port": port,
        "tailscale_url": tailscale_url,
        "local_ipv4": lan_ipv4,
        "tailscale_hostname": ts_hostname,
        "tailscale_ip": ts_ip,
        "interfaces": interfaces,
        "urls": urls,
    }))
}

async fn get_log() -> Result<String, (StatusCode, String)> {
    let log_path = crate::config::get_project_root().join("log").join("server_rust_log.txt");
    match tokio::fs::read_to_string(log_path).await {
        Ok(content) => Ok(content),
        Err(e) => Err((StatusCode::INTERNAL_SERVER_ERROR, format!("Failed to read log: {}", e))),
    }
}

async fn restart_server() -> Result<impl IntoResponse, (StatusCode, String)> {
    let mut lock = SHUTDOWN_TX.lock().await;
    if let Some(tx) = lock.take() {
        // Send shutdown signal
        let _ = tx.send(()).await;
        Ok(Json(json!({ "success": true, "message": "Server restart initiated" })))
    } else {
        Err((StatusCode::INTERNAL_SERVER_ERROR, "Shutdown sender not found".to_string()))
    }
}