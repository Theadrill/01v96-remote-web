use axum::{
    extract::{Path, Query},
    http::StatusCode,
    routing::{get, post},
    Json, Router,
};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::fs;
use std::path::PathBuf;
use tracing::{error, info};

use crate::config::{get_project_root, AppConfig};

#[derive(Serialize, Deserialize, Debug)]
pub struct ThemeInfo {
    pub name: String,
    pub is_default: bool,
    pub is_active: bool,
}

#[derive(Deserialize, Debug)]
pub struct SaveThemePayload {
    pub content: Option<String>,
}

#[derive(Deserialize, Debug)]
pub struct UpdateActiveThemePayload {
    pub active_theme: Option<String>,
    pub ninja_sync_themes: Option<bool>,
}

#[derive(Deserialize, Debug)]
pub struct SyncDirectionPayload {
    pub direction: String,
}

#[derive(Deserialize, Debug, Default)]
pub struct ThemeSourceQuery {
    pub source: Option<String>,
}

fn get_public_new_themes_dir() -> PathBuf {
    let root = get_project_root();
    let themes_dir = root.join("public_new").join("themes");
    if !themes_dir.exists() {
        let _ = fs::create_dir_all(&themes_dir);
    }
    themes_dir
}

fn resolve_themes_dir(source: Option<&str>) -> PathBuf {
    match source {
        Some("public_new") => get_public_new_themes_dir(),
        _ => get_themes_dir(),
    }
}

/// POST /api/themes/default/admin-save
/// Rota administrativa para editar o default.yaml protegido em public_new/themes/
async fn save_default_admin(
    body: axum::body::Bytes,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    let yaml_content = if let Ok(payload) = serde_json::from_slice::<SaveThemePayload>(&body) {
        payload.content.unwrap_or_default()
    } else {
        String::from_utf8_lossy(&body).to_string()
    };

    if yaml_content.trim().is_empty() {
        return Err((
            StatusCode::BAD_REQUEST,
            Json(json!({ "error": "Conteúdo do tema não pode ser vazio" })),
        ));
    }

    // Grava em public_new/themes/default.yaml
    let themes_dir = get_public_new_themes_dir();
    let file_path = themes_dir.join("default.yaml");

    if let Err(e) = fs::write(&file_path, &yaml_content) {
        error!("[THEMES] Erro ao salvar default admin {:?}: {}", file_path, e);
        return Err((
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": "Erro ao salvar o arquivo de tema" })),
        ));
    }

    // Também sincroniza para public/themes/default.yaml
    let public_themes_dir = get_themes_dir();
    let public_file_path = public_themes_dir.join("default.yaml");
    if let Err(e) = fs::write(&public_file_path, &yaml_content) {
        error!("[THEMES] Aviso: falha ao sincronizar default para public/themes: {}", e);
    }

    info!("[THEMES] default.yaml atualizado via admin-save");
    Ok(Json(json!({
        "success": true,
        "name": "default.yaml",
        "message": "default.yaml salvo com sucesso"
    })))
}

pub fn router() -> Router {
    Router::new()
        .route("/", get(list_themes))
        .route("/active", get(get_active_theme).post(update_active_theme))
        .route("/compare", get(compare_themes))
        .route("/sync_direction", post(set_sync_direction))
        .route("/default/admin-save", post(save_default_admin))
        .route("/{name}", get(get_theme).post(save_theme).delete(delete_theme))
}

fn get_themes_dir() -> PathBuf {
    let root = get_project_root();
    let themes_dir = root.join("public").join("themes");
    if !themes_dir.exists() {
        let _ = fs::create_dir_all(&themes_dir);
    }
    themes_dir
}

fn get_shared_themes_dir() -> PathBuf {
    let root = get_project_root();
    let shared_dir = root.join("data").join("shared").join("themes");
    if !shared_dir.exists() {
        let _ = fs::create_dir_all(&shared_dir);
    }
    shared_dir
}

fn sanitize_filename(name: &str) -> Option<String> {
    let clean = name.trim();
    if clean.is_empty() || clean.contains("..") || clean.contains('/') || clean.contains('\\') {
        return None;
    }
    let mut filename = clean.to_string();
    if !filename.ends_with(".yaml") && !filename.ends_with(".yml") {
        filename.push_str(".yaml");
    }
    Some(filename)
}

fn is_default_theme(filename: &str) -> bool {
    let lower = filename.to_lowercase();
    lower == "default" || lower == "default.yaml" || lower == "default.yml"
}

// Perform sync if Ninja Sync is enabled
fn sync_themes_if_enabled(config: &AppConfig) {
    if !config.ninja_sync_themes {
        return;
    }
    let public_dir = get_themes_dir();
    let shared_dir = get_shared_themes_dir();

    // Copy public -> shared
    if let Ok(entries) = fs::read_dir(&public_dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_file() {
                if let Some(name) = path.file_name() {
                    let dest = shared_dir.join(name);
                    if !dest.exists() {
                        let _ = fs::copy(&path, &dest);
                    }
                }
            }
        }
    }

    // Copy shared -> public
    if let Ok(entries) = fs::read_dir(&shared_dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_file() {
                if let Some(name) = path.file_name() {
                    let dest = public_dir.join(name);
                    if !dest.exists() {
                        let _ = fs::copy(&path, &dest);
                    }
                }
            }
        }
    }
}

/// GET /api/themes
async fn list_themes() -> Result<Json<Vec<ThemeInfo>>, (StatusCode, Json<Value>)> {
    let config = AppConfig::load();
    sync_themes_if_enabled(&config);

    let themes_dir = get_themes_dir();
    let mut theme_map = std::collections::BTreeMap::new();

    if let Ok(entries) = fs::read_dir(&themes_dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_file() {
                if let Some(filename_str) = path.file_name().and_then(|n| n.to_str()) {
                    if filename_str.ends_with(".yaml") || filename_str.ends_with(".yml") {
                        let is_def = is_default_theme(filename_str);
                        let is_act = filename_str == config.active_theme
                            || filename_str == format!("{}.yaml", config.active_theme)
                            || filename_str == format!("{}.yml", config.active_theme);

                        theme_map.insert(
                            filename_str.to_string(),
                            ThemeInfo {
                                name: filename_str.to_string(),
                                is_default: is_def,
                                is_active: is_act,
                            },
                        );
                    }
                }
            }
        }
    }

    // Guarantee default.yaml exists in map even if dir was empty
    if !theme_map.contains_key("default.yaml") {
        theme_map.insert(
            "default.yaml".to_string(),
            ThemeInfo {
                name: "default.yaml".to_string(),
                is_default: true,
                is_active: config.active_theme == "default.yaml" || config.active_theme == "default",
            },
        );
    }

    Ok(Json(theme_map.into_values().collect()))
}

/// GET /api/themes/active
async fn get_active_theme() -> Json<Value> {
    let config = AppConfig::load();
    let themes_dir = get_themes_dir();
    let theme_path = themes_dir.join(&config.active_theme);

    let content = if theme_path.exists() {
        fs::read_to_string(&theme_path).unwrap_or_default()
    } else {
        let default_path = themes_dir.join("default.yaml");
        fs::read_to_string(&default_path).unwrap_or_default()
    };

    Json(json!({
        "active_theme": config.active_theme,
        "ninja_sync_themes": config.ninja_sync_themes,
        "content": content
    }))
}

/// POST /api/themes/active
async fn update_active_theme(
    Json(payload): Json<UpdateActiveThemePayload>,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    let mut config = AppConfig::load();

    if let Some(theme_name) = payload.active_theme {
        if let Some(clean_name) = sanitize_filename(&theme_name) {
            config.active_theme = clean_name;
        } else {
            return Err((
                StatusCode::BAD_REQUEST,
                Json(json!({ "error": "Nome de tema inválido" })),
            ));
        }
    }

    if let Some(sync) = payload.ninja_sync_themes {
        config.ninja_sync_themes = sync;
    }

    config.save();

    if config.ninja_sync_themes {
        sync_themes_if_enabled(&config);
        crate::api::macros::enqueue_git_sync(
            vec!["data/shared/themes".to_string()],
            "auto-sync: ninja sync themes enabled".to_string(),
            3000,
        ).await;
    }

    info!(
        "[THEMES] Tema ativo atualizado para: {}, Ninja Sync: {}",
        config.active_theme, config.ninja_sync_themes
    );

    Ok(Json(json!({
        "success": true,
        "active_theme": config.active_theme,
        "ninja_sync_themes": config.ninja_sync_themes
    })))
}

/// GET /api/themes/:name
async fn get_theme(
    Path(name): Path<String>,
    Query(query): Query<ThemeSourceQuery>,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    if name == "active" {
        return Ok(get_active_theme().await);
    }

    let filename = match sanitize_filename(&name) {
        Some(f) => f,
        None => {
            return Err((
                StatusCode::BAD_REQUEST,
                Json(json!({ "error": "Nome de tema inválido" })),
            ));
        }
    };

    let themes_dir = resolve_themes_dir(query.source.as_deref());
    let file_path = themes_dir.join(&filename);

    if !file_path.exists() {
        return Err((
            StatusCode::NOT_FOUND,
            Json(json!({ "error": format!("Tema '{}' não encontrado", filename) })),
        ));
    }

    match fs::read_to_string(&file_path) {
        Ok(content) => Ok(Json(json!({
            "name": filename,
            "content": content
        }))),
        Err(e) => {
            error!("[THEMES] Erro ao ler arquivo {:?}: {}", file_path, e);
            Err((
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": "Erro ao ler arquivo de tema" })),
            ))
        }
    }
}

/// POST /api/themes/:name
async fn save_theme(
    Path(name): Path<String>,
    Query(query): Query<ThemeSourceQuery>,
    body: axum::body::Bytes,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    if name == "active" {
        return Err((
            StatusCode::BAD_REQUEST,
            Json(json!({ "error": "Use POST /api/themes/active para definir o tema ativo" })),
        ));
    }

    let filename = match sanitize_filename(&name) {
        Some(f) => f,
        None => {
            return Err((
                StatusCode::BAD_REQUEST,
                Json(json!({ "error": "Nome de tema inválido" })),
            ));
        }
    };

    // PROTEÇÃO RULE (3.5): default.yaml não pode ser alterado em public (comportamento atual).
    // Quando source=public_new, a proteção é removida para permitir edição direta.
    let is_public_new = query.source.as_deref() == Some("public_new");
    if !is_public_new && is_default_theme(&filename) {
        return Err((
            StatusCode::FORBIDDEN,
            Json(json!({ "error": "O tema default.yaml é protegido e não pode ser alterado." })),
        ));
    }

    // Body can be plain text YAML or JSON payload {"content": "..."}
    let yaml_content = if let Ok(payload) = serde_json::from_slice::<SaveThemePayload>(&body) {
        payload.content.unwrap_or_default()
    } else {
        String::from_utf8_lossy(&body).to_string()
    };

    if yaml_content.trim().is_empty() {
        return Err((
            StatusCode::BAD_REQUEST,
            Json(json!({ "error": "Conteúdo do tema não pode ser vazio" })),
        ));
    }

    let themes_dir = resolve_themes_dir(query.source.as_deref());
    let file_path = themes_dir.join(&filename);

    if let Err(e) = fs::write(&file_path, &yaml_content) {
        error!("[THEMES] Erro ao salvar arquivo {:?}: {}", file_path, e);
        return Err((
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": "Erro ao salvar o arquivo de tema" })),
        ));
    }

    let config = AppConfig::load();
    if config.ninja_sync_themes {
        let shared_path = get_shared_themes_dir().join(&filename);
        let _ = fs::write(&shared_path, &yaml_content);
        crate::api::macros::enqueue_git_sync(
            vec![format!("data/shared/themes/{}", filename)],
            format!("auto-sync: theme {}", filename),
            3000,
        ).await;
    }

    info!("[THEMES] Tema salvou com sucesso: {}", filename);
    Ok(Json(json!({
        "success": true,
        "name": filename
    })))
}

/// DELETE /api/themes/:name
async fn delete_theme(Path(name): Path<String>) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    if name == "active" {
        return Err((
            StatusCode::BAD_REQUEST,
            Json(json!({ "error": "Nome inválido para exclusão" })),
        ));
    }

    let filename = match sanitize_filename(&name) {
        Some(f) => f,
        None => {
            return Err((
                StatusCode::BAD_REQUEST,
                Json(json!({ "error": "Nome de tema inválido" })),
            ));
        }
    };

    // PROTEÇÃO RULE (3.5): default.yaml não pode ser excluído
    if is_default_theme(&filename) {
        return Err((
            StatusCode::FORBIDDEN,
            Json(json!({ "error": "O tema default.yaml é protegido e não pode ser excluído." })),
        ));
    }

    let themes_dir = get_themes_dir();
    let file_path = themes_dir.join(&filename);

    if file_path.exists() {
        if let Err(e) = fs::remove_file(&file_path) {
            error!("[THEMES] Erro ao excluir arquivo {:?}: {}", file_path, e);
            return Err((
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": "Erro ao excluir arquivo de tema" })),
            ));
        }
    }

    let mut config = AppConfig::load();
    if config.ninja_sync_themes {
        let shared_path = get_shared_themes_dir().join(&filename);
        if shared_path.exists() {
            let _ = fs::remove_file(&shared_path);
            crate::api::macros::enqueue_git_sync(
                vec![format!("data/shared/themes/{}", filename)],
                format!("auto-sync: deleted theme {}", filename),
                3000,
            ).await;
        }
    }

    // Reset to default if deleting the active theme
    if config.active_theme == filename || config.active_theme == name {
        config.active_theme = "default.yaml".to_string();
        config.save();
        info!("[THEMES] Tema ativo excluído, resetado para default.yaml");
    }

    info!("[THEMES] Tema excluído: {}", filename);
    Ok(Json(json!({
        "success": true,
        "message": format!("Tema '{}' excluído com sucesso", filename)
    })))
}

/// GET /api/themes/compare
async fn compare_themes() -> Json<Value> {
    let public_dir = get_themes_dir();
    let shared_dir = get_shared_themes_dir();

    let mut differences = Vec::new();
    let mut local_files = std::collections::HashMap::new();
    let mut shared_files = std::collections::HashMap::new();

    if let Ok(entries) = fs::read_dir(&public_dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_file() {
                if let Some(name) = path.file_name().and_then(|n| n.to_str()) {
                    if name.ends_with(".yaml") || name.ends_with(".yml") {
                        if let Ok(content) = fs::read_to_string(&path) {
                            local_files.insert(name.to_string(), content);
                        }
                    }
                }
            }
        }
    }

    if let Ok(entries) = fs::read_dir(&shared_dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_file() {
                if let Some(name) = path.file_name().and_then(|n| n.to_str()) {
                    if name.ends_with(".yaml") || name.ends_with(".yml") {
                        if let Ok(content) = fs::read_to_string(&path) {
                            shared_files.insert(name.to_string(), content);
                        }
                    }
                }
            }
        }
    }

    let mut all_keys: std::collections::HashSet<_> = local_files.keys().cloned().collect();
    all_keys.extend(shared_files.keys().cloned());

    for key in all_keys {
        match (local_files.get(&key), shared_files.get(&key)) {
            (Some(loc), Some(sha)) => {
                if loc.trim() != sha.trim() {
                    differences.push(json!({ "name": key, "status": "different" }));
                }
            }
            (Some(_), None) => {
                differences.push(json!({ "name": key, "status": "only_in_local" }));
            }
            (None, Some(_)) => {
                differences.push(json!({ "name": key, "status": "only_in_shared" }));
            }
            (None, None) => {}
        }
    }

    let identical = differences.is_empty();

    Json(json!({
        "identical": identical,
        "differences": differences,
        "local_count": local_files.len(),
        "shared_count": shared_files.len()
    }))
}

/// POST /api/themes/sync_direction
async fn set_sync_direction(
    Json(payload): Json<SyncDirectionPayload>,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    let public_dir = get_themes_dir();
    let shared_dir = get_shared_themes_dir();
    let mut config = AppConfig::load();

    if payload.direction == "upload" {
        // Copy public -> shared
        if let Ok(entries) = fs::read_dir(&public_dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.is_file() {
                    if let Some(name) = path.file_name() {
                        let dest = shared_dir.join(name);
                        let _ = fs::copy(&path, &dest);
                    }
                }
            }
        }
        config.ninja_sync_themes = true;
        config.save();

        crate::api::macros::enqueue_git_sync(
            vec!["data/shared/themes".to_string()],
            "auto-sync: uploaded local themes to shared".to_string(),
            3000,
        ).await;

        Ok(Json(json!({ "success": true, "direction": "upload", "ninja_sync_themes": true })))
    } else if payload.direction == "download" {
        // Copy shared -> public
        if let Ok(entries) = fs::read_dir(&shared_dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.is_file() {
                    if let Some(name) = path.file_name() {
                        let dest = public_dir.join(name);
                        let _ = fs::copy(&path, &dest);
                    }
                }
            }
        }
        config.ninja_sync_themes = true;
        config.save();

        Ok(Json(json!({ "success": true, "direction": "download", "ninja_sync_themes": true })))
    } else {
        Err((
            StatusCode::BAD_REQUEST,
            Json(json!({ "error": "Direção de sincronização inválida" })),
        ))
    }
}
