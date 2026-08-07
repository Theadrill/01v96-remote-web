use axum::{
    Json,
    extract::{Extension, Query, State},
    http::StatusCode,
};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use socketioxide::SocketIo;
use std::sync::Arc;
use tokio::sync::RwLock;

use crate::custom_scenes::CustomSceneManager;

/// Item de versão de um arquivo de cena customizada.
#[derive(Debug, Clone, Serialize)]
pub struct SceneVersionInfo {
    pub commit_sha: String,
    pub author: String,
    pub date: String,
    pub message: String,
}

#[derive(Deserialize)]
pub struct FileQuery {
    pub file: Option<String>,
}

/// Sanitiza o nome do arquivo evitando path traversal (.. / \ e separadores).
fn sanitize_file_name(raw: Option<String>) -> Result<String, (StatusCode, String)> {
    let file = raw.unwrap_or_default();
    if file.is_empty() || file.len() > 300 {
        return Err((StatusCode::BAD_REQUEST, "nome de arquivo inválido".into()));
    }
    if file.contains("..") || file.contains('/') || file.contains('\\') {
        return Err((
            StatusCode::BAD_REQUEST,
            "nome de arquivo inválido".into(),
        ));
    }
    Ok(file)
}

fn git_relative_path(file: &str) -> String {
    format!("data/custom_scenes/shared/{}", file)
}

/// Extrai owner/repo a partir da URL do remote git (https ou ssh).
fn parse_github_remote(url: &str) -> Option<(String, String)> {
    let url = url.trim();
    let after_host = url
        .strip_prefix("https://github.com/")
        .or_else(|| url.strip_prefix("http://github.com/"))
        .or_else(|| url.strip_prefix("git@github.com:"))?
        .trim_end_matches(".git")
        .trim_end_matches('/');
    let mut parts = after_host.split('/');
    let owner = parts.next()?.to_string();
    let repo = parts.next()?.to_string();
    if owner.is_empty() || repo.is_empty() {
        return None;
    }
    Some((owner, repo))
}

async fn get_github_remote() -> Option<(String, String)> {
    let root = crate::config::get_project_root();
    let output = tokio::process::Command::new("git")
        .args(["config", "--get", "remote.origin.url"])
        .current_dir(&root)
        .output()
        .await
        .ok()?;
    if !output.status.success() {
        return None;
    }
    let url = String::from_utf8_lossy(&output.stdout).trim().to_string();
    parse_github_remote(&url)
}

fn github_client() -> reqwest::Client {
    reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(15))
        .user_agent("01v96-remote-web/1.0")
        .build()
        .unwrap_or_else(|_| reqwest::Client::new())
}

/// GET /api/custom-scenes/history/local?file=<nome>
pub async fn history_local(
    Query(q): Query<FileQuery>,
    Extension(csm): Extension<Arc<RwLock<CustomSceneManager>>>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let file = sanitize_file_name(q.file)?;
    let rel = git_relative_path(&file);

    {
        let csm_guard = csm.read().await;
        let data_dir = csm_guard.data_dir();
        let exists = data_dir.join("shared").join(&file).exists()
            || data_dir.join("local").join(&file).exists();
        if !exists {
            return Err((
                StatusCode::NOT_FOUND,
                format!("arquivo '{}' não encontrado", file),
            ));
        }
    }

    let root = crate::config::get_project_root();
    let output = tokio::process::Command::new("git")
        .args([
            "log",
            "-n",
            "3",
            "--skip=1",
            "--format=%H%x1f%an%x1f%ad%x1f%s",
            "--date=iso-strict",
            "--",
            &rel,
        ])
        .current_dir(&root)
        .output()
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("git log falhou: {}", e)))?;

    if !output.status.success() {
        return Err((
            StatusCode::INTERNAL_SERVER_ERROR,
            String::from_utf8_lossy(&output.stderr).trim().to_string(),
        ));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut versions = Vec::new();
    for line in stdout.lines() {
        let parts: Vec<&str> = line.split('\u{1f}').collect();
        if parts.len() >= 4 {
            versions.push(SceneVersionInfo {
                commit_sha: parts[0].to_string(),
                author: parts[1].to_string(),
                date: parts[2].to_string(),
                message: parts[3].to_string(),
            });
        }
    }

    Ok(Json(json!({
        "source": "local",
        "file": file,
        "versions": versions
    })))
}

/// GET /api/custom-scenes/history/github?file=<nome>
pub async fn history_github(
    Query(q): Query<FileQuery>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let file = sanitize_file_name(q.file)?;
    let (owner, repo) = get_github_remote()
        .await
        .ok_or_else(|| (StatusCode::SERVICE_UNAVAILABLE, "remote GitHub não configurado".into()))?;

    let rel = git_relative_path(&file);
    let client = github_client();
    let encoded_path = percent_encode(&rel);
    let mut req = client.get(format!(
        "https://api.github.com/repos/{}/{}/commits?path={}&per_page=4",
        owner, repo, encoded_path
    ));
    if let Some(token) = crate::env_config::load_github_token() {
        req = req.bearer_auth(token);
    }

    let resp = req
        .send()
        .await
        .map_err(|e| (StatusCode::BAD_GATEWAY, format!("falha ao acessar GitHub: {}", e)))?;

    if !resp.status().is_success() {
        let status = resp.status().as_u16();
        return Err((
            StatusCode::BAD_GATEWAY,
            format!("GitHub respondeu com status {}", status),
        ));
    }

    let commits: Value = resp
        .json()
        .await
        .map_err(|e| (StatusCode::BAD_GATEWAY, format!("resposta inválida do GitHub: {}", e)))?;

    let arr = commits.as_array().cloned().unwrap_or_default();
    // Ignora a primeira (versão atual) e retorna as 3 anteriores
    let mut versions = Vec::new();
    for commit in arr.into_iter().skip(1).take(3) {
        let sha = commit.get("sha").and_then(|v| v.as_str()).unwrap_or("");
        let author = commit
            .pointer("/commit/author/name")
            .and_then(|v| v.as_str())
            .unwrap_or("");
        let date = commit
            .pointer("/commit/author/date")
            .and_then(|v| v.as_str())
            .unwrap_or("");
        let message = commit
            .pointer("/commit/message")
            .and_then(|v| v.as_str())
            .unwrap_or("");
        versions.push(SceneVersionInfo {
            commit_sha: sha.to_string(),
            author: author.to_string(),
            date: date.to_string(),
            message: message.trim().to_string(),
        });
    }

    Ok(Json(json!({
        "source": "github",
        "file": file,
        "versions": versions
    })))
}

fn percent_encode(input: &str) -> String {
    const HEX: &[u8; 16] = b"0123456789ABCDEF";
    let mut out = String::with_capacity(input.len());
    for b in input.bytes() {
        if b.is_ascii_alphanumeric() || matches!(b, b'-' | b'_' | b'.' | b'~') {
            out.push(b as char);
        } else if b == b'/' {
            out.push('/');
        } else if b == b' ' {
            out.push('%');
            out.push('2');
            out.push('0');
        } else {
            out.push('%');
            out.push(HEX[(b >> 4) as usize] as char);
            out.push(HEX[(b & 0x0F) as usize] as char);
        }
    }
    out
}

#[derive(Deserialize)]
pub struct RestoreBody {
    pub file: String,
    pub source: String,
    pub commit_sha: String,
}

/// POST /api/custom-scenes/restore
pub async fn restore(
    State(state): State<Arc<RwLock<crate::state::GlobalState>>>,
    Extension(csm): Extension<Arc<RwLock<CustomSceneManager>>>,
    Extension(io): Extension<SocketIo>,
    Json(body): Json<RestoreBody>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let file = sanitize_file_name(Some(body.file.clone()))?;
    let rel = git_relative_path(&file);

    if body.commit_sha.is_empty() || body.commit_sha.len() > 64 {
        return Err((StatusCode::BAD_REQUEST, "commit_sha inválido".into()));
    }

    let content = match body.source.as_str() {
        "local" => {
            let root = crate::config::get_project_root();
            let output = tokio::process::Command::new("git")
                .args(["show", &format!("{}:{}", body.commit_sha, rel)])
                .current_dir(&root)
                .output()
                .await
                .map_err(|e| {
                    (StatusCode::INTERNAL_SERVER_ERROR, format!("git show falhou: {}", e))
                })?;
            if !output.status.success() {
                let msg = String::from_utf8_lossy(&output.stderr).trim().to_string();
                return Err((StatusCode::NOT_FOUND, format!("SHA inválido: {}", msg)));
            }
            String::from_utf8_lossy(&output.stdout).to_string()
        }
        "github" => {
            let (owner, repo) = get_github_remote()
                .await
                .ok_or_else(|| {
                    (StatusCode::SERVICE_UNAVAILABLE, "remote GitHub não configurado".into())
                })?;
            let url = format!(
                "https://raw.githubusercontent.com/{}/{}/{}/{}",
                owner,
                repo,
                body.commit_sha,
                percent_encode(&rel)
            );
            let client = github_client();
            let mut req = client.get(&url);
            if let Some(token) = crate::env_config::load_github_token() {
                req = req.bearer_auth(token);
            }
            let resp = req
                .send()
                .await
                .map_err(|e| {
                    (StatusCode::BAD_GATEWAY, format!("falha ao acessar GitHub: {}", e))
                })?;
            if !resp.status().is_success() {
                let status = resp.status().as_u16();
                return Err((
                    StatusCode::BAD_GATEWAY,
                    format!("GitHub respondeu com status {}", status),
                ));
            }
            resp.text()
                .await
                .map_err(|e| (StatusCode::BAD_GATEWAY, format!("leitura falhou: {}", e)))?
        }
        _ => {
            return Err((StatusCode::BAD_REQUEST, "fonte inválida (use local ou github)".into()));
        }
    };

    if content.trim().is_empty() {
        return Err((StatusCode::BAD_REQUEST, "conteúdo vazio no commit selecionado".into()));
    }

    {
        let mut guard = csm.write().await;
        guard
            .restore_scene(&file, &content)
            .map_err(|e| (StatusCode::UNPROCESSABLE_ENTITY, e))?;
        guard.persist(true);
    }

    // Notifica todos os clientes conectados para recarregar os nomes
    crate::name_resolver::broadcast(&io, &state, &csm).await;
    let _ = io
        .emit(
            "customSceneRestored",
            &json!({ "file": file, "success": true }),
        )
        .await;

    Ok(Json(json!({ "success": true, "file": file })))
}
