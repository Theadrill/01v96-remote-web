use axum::{
    Json,
    extract::{Path, Query, State},
    response::IntoResponse,
};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use std::collections::{HashMap, HashSet};
use std::path::{Path as StdPath, PathBuf};
use std::sync::Arc;
use tokio::sync::{Mutex, RwLock};

// Git Sync state
lazy_static::lazy_static! {
    static ref GIT_SYNC_STATE: Arc<Mutex<GitSyncState>> = Arc::new(Mutex::new(GitSyncState {
        queue: HashSet::new(),
        message: None,
        task: None,
    }));
}

struct GitSyncState {
    queue: HashSet<String>,
    message: Option<String>,
    task: Option<tokio::task::JoinHandle<()>>,
}

async fn trigger_git_sync() {
    let mut state = GIT_SYNC_STATE.lock().await;
    if state.queue.is_empty() {
        return;
    }

    let files: Vec<String> = state.queue.drain().collect();
    let msg = state
        .message
        .take()
        .unwrap_or_else(|| "auto-sync: profiles updated".to_string());

    tokio::spawn(async move {
        let root_dir = std::env::current_dir()
            .unwrap()
            .parent()
            .unwrap()
            .to_path_buf();
        let hostname = gethostname::gethostname().to_string_lossy().to_string();
        let commit_msg = format!("{} from {}", msg, hostname);
        let escaped_msg = commit_msg.replace("\"", "\\\"");

        let files_str = files
            .iter()
            .map(|f| format!("\"{}\"", f.replace("\\", "/")))
            .collect::<Vec<_>>()
            .join(" ");

        let cmd = format!(
            "git add {} && (git commit -m \"{}\" || echo \"Nothing to commit\") && git pull --rebase --autostash && git push",
            files_str, escaped_msg
        );

        println!("ðŸš€ [NINJA SYNC] Iniciando sync: {}", commit_msg);

        #[cfg(target_os = "windows")]
        let mut child = tokio::process::Command::new("cmd")
            .arg("/C")
            .arg(&cmd)
            .current_dir(&root_dir)
            .spawn()
            .expect("Falha ao rodar git");

        #[cfg(not(target_os = "windows"))]
        let mut child = tokio::process::Command::new("sh")
            .arg("-c")
            .arg(&cmd)
            .current_dir(&root_dir)
            .spawn()
            .expect("Falha ao rodar git");

        if let Ok(status) = child.wait().await {
            if status.success() {
                println!("ðŸŒ [NINJA SYNC] GitHub Atualizado com Sucesso!");
            } else {
                eprintln!("âŒ [NINJA SYNC] Falha no comando Git! Status: {}", status);
            }
        }
    });
}

async fn enqueue_git_sync(files: Vec<String>, message: String, delay_ms: u64) {
    let mut state = GIT_SYNC_STATE.lock().await;
    for f in files {
        state.queue.insert(f);
    }
    state.message = Some(message);

    if let Some(task) = state.task.take() {
        task.abort();
    }

    state.task = Some(tokio::spawn(async move {
        tokio::time::sleep(tokio::time::Duration::from_millis(delay_ms)).await;
        trigger_git_sync().await;
    }));
}

pub fn router(state: Arc<RwLock<crate::state::GlobalState>>) -> axum::Router {
    axum::Router::new()
        .route("/names", axum::routing::get(get_names))
        .route("/macros", axum::routing::get(list_macros))
        .route("/macros/hosts", axum::routing::get(get_hosts))
        .route(
            "/macros/slots",
            axum::routing::get(get_slots)
                .post(save_slots)
                .delete(delete_slots),
        )
        .route("/macros/swap", axum::routing::post(swap_slots))
        .route(
            "/macros/sync",
            axum::routing::post(sync_preset).delete(delete_preset),
        )
        .route(
            "/macros/config/{mod_id}",
            axum::routing::get(get_mod_config).post(save_mod_config),
        )
        .route("/macros/proxy/http", axum::routing::post(proxy_http))
        .route("/macros/proxy/udp", axum::routing::post(proxy_udp))
        .with_state(state)
}

fn root_dir() -> PathBuf {
    // Para simplificar, assumimos que o server_rust e public estao lado a lado (em 01v96-remote-web)
    PathBuf::from("..")
}

async fn list_macros() -> Json<Value> {
    let mut macros = Vec::new();
    let dir = root_dir().join("public").join("modules").join("macros");
    if let Ok(entries) = std::fs::read_dir(dir) {
        for entry in entries.flatten() {
            if let Ok(file_type) = entry.file_type() {
                if file_type.is_file() {
                    let file_name = entry.file_name().to_string_lossy().to_string();
                    if file_name.ends_with(".js")
                        && !file_name.ends_with(".server.js")
                        && file_name != "core.js"
                        && file_name != "macros.js"
                    {
                        macros.push(file_name.replace(".js", ""));
                    }
                }
            }
        }
    }
    Json(json!(macros))
}

async fn get_names(
    State(state): State<Arc<RwLock<crate::state::GlobalState>>>,
) -> Json<serde_json::Value> {
    let s = state.read().await;
    let mut names = serde_json::Map::new();

    for i in 0..32 {
        if let Some(ch) = s.channels.get(&i) {
            names.insert(i.to_string(), Value::String(ch.name.clone()));
        }
    }
    for i in 0..8 {
        if let Some(mix) = s.mixes.get(&i) {
            names.insert((36 + i).to_string(), Value::String(mix.name.clone()));
        }
    }
    for i in 0..8 {
        if let Some(bus) = s.buses.get(&i) {
            names.insert((44 + i).to_string(), Value::String(bus.name.clone()));
        }
    }
    names.insert("52".to_string(), Value::String(s.master.name.clone()));

    Json(Value::Object(names))
}

async fn get_hosts() -> Json<Value> {
    let hosts_path = root_dir().join("public/modules/macros/hosts.json");
    if hosts_path.exists() {
        if let Ok(content) = std::fs::read_to_string(hosts_path) {
            if let Ok(json) = serde_json::from_str(&content) {
                return Json(json);
            }
        }
    }
    Json(json!([
        { "match": "192.168.15.99", "preset": "pcmaria" },
        { "match": "pcfavela", "preset": "pcfavela" }
    ]))
}

#[derive(Deserialize)]
struct PresetQuery {
    preset: Option<String>,
    #[serde(rename = "syncShared")]
    sync_shared: Option<String>,
}

async fn get_slots(Query(q): Query<PresetQuery>) -> Json<Value> {
    let macros_dir = root_dir().join("public/modules/macros/profiles");
    let local_dir = macros_dir.join("local");
    let shared_dir = macros_dir.join("shared");

    if let Some(preset) = q.preset {
        let local_path = local_dir.join(format!("profile_{}.json", preset));
        let shared_path = shared_dir.join(format!("profile_{}.json", preset));

        if local_path.exists() {
            if let Ok(c) = std::fs::read_to_string(&local_path) {
                if let Ok(v) = serde_json::from_str(&c) {
                    return Json(v);
                }
            }
        }
        if shared_path.exists() {
            if let Ok(c) = std::fs::read_to_string(&shared_path) {
                if let Ok(v) = serde_json::from_str(&c) {
                    return Json(v);
                }
            }
        }
        Json(json!({}))
    } else {
        let mut profiles = HashMap::new();
        let mut scan = |dir: &StdPath| {
            if dir.exists() {
                if let Ok(entries) = std::fs::read_dir(dir) {
                    for entry in entries.flatten() {
                        if let Ok(name) = entry.file_name().into_string() {
                            if name.starts_with("profile_") && name.ends_with(".json") {
                                let p = name.replace("profile_", "").replace(".json", "");
                                profiles.insert(p, true);
                            }
                        }
                    }
                }
            }
        };
        scan(&shared_dir);
        scan(&local_dir);
        if profiles.is_empty() {
            profiles.insert("default".to_string(), true);
        }
        Json(json!(profiles))
    }
}

async fn save_slots(Query(q): Query<PresetQuery>, Json(body): Json<Value>) -> Json<Value> {
    let preset = q.preset.unwrap_or_else(|| "default".to_string());
    let sync_shared = q.sync_shared.as_deref() == Some("true");
    let macros_dir = root_dir().join("public/modules/macros/profiles");
    let local_path = macros_dir
        .join("local")
        .join(format!("profile_{}.json", preset));
    let shared_path = macros_dir
        .join("shared")
        .join(format!("profile_{}.json", preset));

    if let Ok(content) = serde_json::to_string_pretty(&body) {
        if let Some(p) = local_path.parent() {
            let _ = std::fs::create_dir_all(p);
        }
        let _ = std::fs::write(&local_path, &content);

        if sync_shared {
            if let Some(p) = shared_path.parent() {
                let _ = std::fs::create_dir_all(p);
            }
            let _ = std::fs::write(&shared_path, &content);
            if let Ok(rel) = shared_path.strip_prefix(root_dir()) {
                let rel_str = rel.to_string_lossy().to_string();
                enqueue_git_sync(
                    vec![rel_str],
                    format!("auto-sync: profile '{}' updated", preset),
                    10000,
                )
                .await;
            }
        }
        Json(json!({ "success": true, "preset": preset, "synced": sync_shared }))
    } else {
        Json(json!({ "error": "Erro ao salvar perfil" }))
    }
}

async fn delete_slots(Query(q): Query<PresetQuery>) -> Json<Value> {
    let preset = q.preset.unwrap_or_default();
    if preset.is_empty() || preset == "default" {
        return Json(json!({ "error": "Preset invalido ou protegido" }));
    }
    let local_path = root_dir().join(format!(
        "public/modules/macros/profiles/local/profile_{}.json",
        preset
    ));
    let shared_path = root_dir().join(format!(
        "public/modules/macros/profiles/shared/profile_{}.json",
        preset
    ));

    let _ = std::fs::remove_file(local_path);
    let _ = std::fs::remove_file(shared_path);

    Json(json!({ "success": true, "deleted": preset }))
}

#[derive(Deserialize)]
struct SwapQuery {
    preset: Option<String>,
}

#[derive(Deserialize)]
struct SwapBody {
    from: serde_json::Value,
    to: serde_json::Value,
}

async fn swap_slots(Query(q): Query<SwapQuery>, Json(body): Json<SwapBody>) -> Json<Value> {
    let preset = q.preset.unwrap_or_else(|| "default".to_string());

    let from_index = body
        .from
        .as_str()
        .unwrap_or_default()
        .parse::<usize>()
        .unwrap_or_else(|_| body.from.as_u64().unwrap_or(0) as usize);
    let to_index = body
        .to
        .as_str()
        .unwrap_or_default()
        .parse::<usize>()
        .unwrap_or_else(|_| body.to.as_u64().unwrap_or(0) as usize);

    let macros_dir = root_dir().join("public/modules/macros/profiles");

    let handle_swap = |dir: PathBuf| {
        let p_path = dir.join(format!("profile_{}.json", preset));
        if p_path.exists() {
            if let Ok(content) = std::fs::read_to_string(&p_path) {
                if let Ok(Value::Array(mut config)) = serde_json::from_str(&content) {
                    // ... array unhandled
                } else if let Ok(Value::Object(mut config)) = serde_json::from_str(&content) {
                    let from_key = from_index.to_string();
                    let to_key = to_index.to_string();
                    let t_from = config.remove(&from_key);
                    let t_to = config.remove(&to_key);

                    if let Some(t_to_val) = t_to {
                        config.insert(from_key, t_to_val);
                    }
                    if let Some(t_from_val) = t_from {
                        config.insert(to_key, t_from_val);
                    }

                    let _ = std::fs::write(&p_path, serde_json::to_string_pretty(&config).unwrap());
                }
            }
        }
    };

    handle_swap(macros_dir.join("local"));
    handle_swap(macros_dir.join("shared"));

    let shared_path = macros_dir
        .join("shared")
        .join(format!("profile_{}.json", preset));
    if shared_path.exists() {
        if let Ok(rel) = shared_path.strip_prefix(root_dir()) {
            let rel_str = rel.to_string_lossy().to_string();
            enqueue_git_sync(
                vec![rel_str],
                format!("auto-sync: slots swapped in '{}'", preset),
                10000,
            )
            .await;
        }
    }

    Json(json!({ "success": true }))
}

async fn sync_preset(Query(q): Query<PresetQuery>) -> Json<Value> {
    let preset = match q.preset {
        Some(p) => p,
        None => return Json(json!({ "error": "Preset faltando" })),
    };

    let shared_dir = root_dir().join("public/modules/macros/profiles/shared");
    if !shared_dir.exists() {
        return Json(json!({ "error": "Nenhum arquivo compartilhado encontrado" }));
    }

    let mut files = vec![];
    if let Ok(entries) = std::fs::read_dir(&shared_dir) {
        for entry in entries.flatten() {
            if let Ok(name) = entry.file_name().into_string() {
                if name.contains(&format!("_{}.json", preset))
                    || name == format!("profile_{}.json", preset)
                {
                    files.push(name);
                }
            }
        }
    }

    if files.is_empty() {
        return Json(json!({ "error": "Nenhum arquivo correspondente ao preset compartilhado" }));
    }

    let mut queued = vec![];
    for f in &files {
        let full = shared_dir.join(f);
        if let Ok(rel) = full.strip_prefix(root_dir()) {
            queued.push(rel.to_string_lossy().to_string());
        }
    }

    enqueue_git_sync(
        queued.clone(),
        format!("auto-sync: manual full sync for '{}'", preset),
        500,
    )
    .await;

    Json(json!({ "success": true, "queued": files }))
}

async fn delete_preset(Query(q): Query<PresetQuery>) -> Json<Value> {
    let preset = match q.preset {
        Some(p) => p,
        None => return Json(json!({ "error": "Preset faltando" })),
    };

    let shared_dir = root_dir().join("public/modules/macros/profiles/shared");
    if !shared_dir.exists() {
        return Json(json!({ "error": "Nenhum arquivo compartilhado encontrado" }));
    }

    let mut files = vec![];
    if let Ok(entries) = std::fs::read_dir(&shared_dir) {
        for entry in entries.flatten() {
            if let Ok(name) = entry.file_name().into_string() {
                if name.contains(&format!("_{}.json", preset))
                    || name == format!("profile_{}.json", preset)
                {
                    files.push(name);
                }
            }
        }
    }

    if files.is_empty() {
        return Json(json!({ "error": "Nenhum arquivo correspondente ao preset compartilhado" }));
    }

    let mut deleted = vec![];
    let mut queued = vec![];

    for f in files {
        let full = shared_dir.join(&f);
        if full.exists() {
            let _ = std::fs::remove_file(&full);
            deleted.push(f);
            if let Ok(rel) = full.strip_prefix(root_dir()) {
                queued.push(rel.to_string_lossy().to_string());
            }
        }
    }

    enqueue_git_sync(
        queued,
        format!("cloud-sync: profile '{}' removed from cloud", preset),
        500,
    )
    .await;

    Json(json!({ "success": true, "deleted": deleted }))
}

async fn get_mod_config(Path(mod_id): Path<String>, Query(q): Query<PresetQuery>) -> Json<Value> {
    let preset = q.preset.unwrap_or_else(|| "default".to_string());
    let filename = if preset == "default" {
        format!("{}.json", mod_id)
    } else {
        format!("{}_{}.json", mod_id, preset)
    };
    let macros_dir = root_dir().join("public/modules/macros/profiles");

    let local_path = macros_dir.join("local").join(&filename);
    let shared_path = macros_dir.join("shared").join(&filename);

    if local_path.exists() {
        if let Ok(c) = std::fs::read_to_string(local_path) {
            if let Ok(v) = serde_json::from_str(&c) {
                return Json(v);
            }
        }
    }
    if shared_path.exists() {
        if let Ok(c) = std::fs::read_to_string(shared_path) {
            if let Ok(v) = serde_json::from_str(&c) {
                return Json(v);
            }
        }
    }
    Json(json!({}))
}

async fn save_mod_config(
    Path(mod_id): Path<String>,
    Query(q): Query<PresetQuery>,
    Json(body): Json<Value>,
) -> Json<Value> {
    let preset = q.preset.unwrap_or_else(|| "default".to_string());
    let sync_shared = q.sync_shared.as_deref() == Some("true");
    let filename = if preset == "default" {
        format!("{}.json", mod_id)
    } else {
        format!("{}_{}.json", mod_id, preset)
    };
    let macros_dir = root_dir().join("public/modules/macros/profiles");

    let local_path = macros_dir.join("local").join(&filename);
    let shared_path = macros_dir.join("shared").join(&filename);

    if let Ok(content) = serde_json::to_string_pretty(&body) {
        if let Some(p) = local_path.parent() {
            let _ = std::fs::create_dir_all(p);
        }
        let _ = std::fs::write(&local_path, &content);

        if sync_shared {
            if let Some(p) = shared_path.parent() {
                let _ = std::fs::create_dir_all(p);
            }
            let _ = std::fs::write(&shared_path, &content);
            if let Ok(rel) = shared_path.strip_prefix(root_dir()) {
                let rel_str = rel.to_string_lossy().to_string();
                enqueue_git_sync(
                    vec![rel_str],
                    format!(
                        "auto-sync: mod config '{}' for '{}' updated",
                        mod_id, preset
                    ),
                    10000,
                )
                .await;
            }
        }

        Json(json!({ "success": true, "mod": mod_id, "preset": preset, "synced": sync_shared }))
    } else {
        Json(json!({ "error": "Erro ao salvar config do mod" }))
    }
}

#[derive(Deserialize)]
struct ProxyHttpReq {
    url: String,
    options: Option<serde_json::Value>,
}

async fn proxy_http(Json(req): Json<ProxyHttpReq>) -> Json<Value> {
    if req.url.starts_with("file://") {
        return Json(json!({ "error": "Acesso a arquivos locais negado" }));
    }

    let client = reqwest::Client::new();
    let mut request = client.request(reqwest::Method::GET, &req.url);

    if let Some(opt) = req.options {
        if let Some(m) = opt.get("method").and_then(|m| m.as_str()) {
            if let Ok(meth) = reqwest::Method::from_bytes(m.as_bytes()) {
                request = client.request(meth, &req.url);
            }
        }
        if let Some(headers) = opt.get("headers").and_then(|h| h.as_object()) {
            for (k, v) in headers {
                if let Some(v_str) = v.as_str() {
                    request = request.header(k, v_str);
                }
            }
        }
        if let Some(body) = opt.get("body").and_then(|b| b.as_str()) {
            request = request.body(body.to_string());
        } else if let Some(body) = opt.get("body") {
            request = request.body(body.to_string());
        }
    }

    match request.send().await {
        Ok(resp) => {
            let status = resp.status().as_u16();
            let raw_data = resp.text().await.unwrap_or_default();
            let data: Value = serde_json::from_str(&raw_data).unwrap_or(Value::String(raw_data));
            Json(json!({ "status": status, "data": data }))
        }
        Err(e) => Json(json!({ "error": e.to_string() })),
    }
}

#[derive(Deserialize)]
struct ProxyUdpReq {
    host: String,
    port: u16,
    data: Value,
}

async fn proxy_udp(Json(req): Json<ProxyUdpReq>) -> Json<Value> {
    let msg = if let Some(s) = req.data.as_str() {
        s.to_string()
    } else {
        req.data.to_string()
    };

    match tokio::net::UdpSocket::bind("0.0.0.0:0").await {
        Ok(socket) => {
            match socket
                .send_to(msg.as_bytes(), (&req.host as &str, req.port))
                .await
            {
                Ok(_) => Json(json!({ "success": true })),
                Err(e) => Json(json!({ "error": e.to_string() })),
            }
        }
        Err(e) => Json(json!({ "error": e.to_string() })),
    }
}

