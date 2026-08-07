use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use tracing::{error, info, warn};

use crate::config::get_project_root;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum EnvStatus {
    Complete,
    MissingPassword,
    MissingName,
    MissingBoth,
    NotFound,
}

impl EnvStatus {
    pub fn as_str(&self) -> &'static str {
        match self {
            EnvStatus::Complete => "complete",
            EnvStatus::MissingPassword => "missing_password",
            EnvStatus::MissingName => "missing_name",
            EnvStatus::MissingBoth => "missing_both",
            EnvStatus::NotFound => "not_found",
        }
    }

    #[allow(dead_code)]
    pub fn is_complete(&self) -> bool {
        matches!(self, EnvStatus::Complete)
    }
}

pub fn is_setup_complete() -> bool {
    detect_env_status().is_complete()
}

pub fn get_env_path() -> PathBuf {
    if let Ok(p) = std::env::var("01V96_ENV_PATH_OVERRIDE") {
        return PathBuf::from(p);
    }
    get_project_root().join(".env")
}

fn load_env_map_from(path: &Path) -> HashMap<String, String> {
    let mut map = HashMap::new();
    if !path.exists() {
        return map;
    }
    match fs::read_to_string(path) {
        Ok(contents) => {
            for line in contents.lines() {
                let trimmed = line.trim();
                if trimmed.is_empty() || trimmed.starts_with('#') {
                    continue;
                }
                if let Some((k, v)) = trimmed.split_once('=') {
                    let key = k.trim().to_string();
                    let value = v.trim().to_string();
                    map.insert(key, value);
                }
            }
        }
        Err(e) => {
            error!("[ENV] Erro ao ler .env em {:?}: {}", path, e);
        }
    }
    map
}

pub fn load_env_map() -> HashMap<String, String> {
    load_env_map_from(&get_env_path())
}

pub fn detect_env_status() -> EnvStatus {
    let path = get_env_path();
    if !path.exists() {
        return EnvStatus::NotFound;
    }
    let map = load_env_map_from(&path);
    let name_present = map
        .get("SERVER_NAME")
        .map(|v| !v.is_empty())
        .unwrap_or(false);
    let pass_present = map
        .get("SERVER_PASSWORD")
        .map(|v| !v.is_empty())
        .unwrap_or(false);
    match (name_present, pass_present) {
        (true, true) => EnvStatus::Complete,
        (false, true) => EnvStatus::MissingName,
        (true, false) => EnvStatus::MissingPassword,
        (false, false) => EnvStatus::MissingBoth,
    }
}

pub fn validate_server_name(name: &str) -> Result<(), String> {
    if name.len() < 3 {
        return Err("Nome deve ter no mínimo 3 caracteres".to_string());
    }
    if name.len() > 30 {
        return Err("Nome deve ter no máximo 30 caracteres".to_string());
    }
    if !name
        .chars()
        .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-')
    {
        return Err("Use apenas letras minúsculas, números e hífen".to_string());
    }
    Ok(())
}

pub fn validate_password(password: &str) -> Result<(), String> {
    if password.len() != 4 {
        return Err("Senha deve ter exatamente 4 dígitos".to_string());
    }
    if !password.chars().all(|c| c.is_ascii_digit()) {
        return Err("Senha deve conter apenas dígitos numéricos".to_string());
    }
    Ok(())
}

fn write_env_map_to(path: &Path, map: &HashMap<String, String>) -> Result<(), String> {
    let mut content = String::new();
    if let Some(name) = map.get("SERVER_NAME") {
        content.push_str(&format!("SERVER_NAME={}\n", name));
    }
    if let Some(pass) = map.get("SERVER_PASSWORD") {
        content.push_str(&format!("SERVER_PASSWORD={}\n", pass));
    }
    fs::write(path, content).map_err(|e| format!("Erro ao salvar .env: {}", e))?;
    info!("[ENV] .env salvo em {:?}", path);
    Ok(())
}

pub fn save_env(name: &str, password: &str) -> Result<(), String> {
    validate_server_name(name)?;
    validate_password(password)?;
    let path = get_env_path();
    let mut map = HashMap::new();
    map.insert("SERVER_NAME".to_string(), name.to_string());
    map.insert("SERVER_PASSWORD".to_string(), password.to_string());
    write_env_map_to(&path, &map)
}

#[allow(dead_code)]
pub fn save_env_partial(name: Option<&str>, password: Option<&str>) -> Result<(), String> {
    if let Some(n) = name {
        validate_server_name(n)?;
    }
    if let Some(p) = password {
        validate_password(p)?;
    }
    let path = get_env_path();
    let mut map = load_env_map_from(&path);
    if let Some(n) = name {
        map.insert("SERVER_NAME".to_string(), n.to_string());
    }
    if let Some(p) = password {
        map.insert("SERVER_PASSWORD".to_string(), p.to_string());
    }
    write_env_map_to(&path, &map)
}

pub fn load_server_name() -> Option<String> {
    let map = load_env_map();
    map.get("SERVER_NAME").filter(|v| !v.is_empty()).cloned()
}

pub fn load_password() -> Option<String> {
    let map = load_env_map();
    map.get("SERVER_PASSWORD")
        .filter(|v| !v.is_empty())
        .cloned()
}

pub fn load_github_token() -> Option<String> {
    if let Ok(v) = std::env::var("GITHUB_TOKEN")
        && !v.is_empty()
    {
        return Some(v);
    }
    let map = load_env_map();
    map.get("GITHUB_TOKEN")
        .filter(|v| !v.is_empty())
        .cloned()
}

#[allow(dead_code)]
pub fn delete_env() -> Result<(), String> {
    let path = get_env_path();
    if !path.exists() {
        warn!(
            "[ENV] delete_env chamado mas arquivo não existe: {:?}",
            path
        );
        return Ok(());
    }
    fs::remove_file(&path).map_err(|e| format!("Erro ao deletar .env: {}", e))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::env;
    use std::sync::Mutex;

    static ENV_PATH_LOCK: Mutex<()> = Mutex::new(());

    fn with_temp_env<F: FnOnce(&Path)>(content: Option<&str>, test: F) {
        let _guard = ENV_PATH_LOCK.lock().unwrap_or_else(|p| p.into_inner());
        let tmp = env::temp_dir().join(format!(
            "env_config_test_{}_{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|d| d.as_nanos())
                .unwrap_or(0)
        ));
        fs::create_dir_all(&tmp).unwrap();
        let env_path = tmp.join(".env");
        if let Some(c) = content {
            fs::write(&env_path, c).unwrap();
        }
        let prev = env::var("01V96_ENV_PATH_OVERRIDE").ok();
        unsafe {
            env::set_var("01V96_ENV_PATH_OVERRIDE", &env_path);
        }
        test(&env_path);
        unsafe {
            match prev {
                Some(v) => env::set_var("01V96_ENV_PATH_OVERRIDE", v),
                None => env::remove_var("01V96_ENV_PATH_OVERRIDE"),
            }
        }
        let _ = fs::remove_dir_all(&tmp);
    }

    #[test]
    fn test_validate_server_name_ok() {
        assert!(validate_server_name("abc").is_ok());
        assert!(validate_server_name("mesa-do-joao").is_ok());
        assert!(validate_server_name("a1b2c3").is_ok());
        assert!(validate_server_name(&"x".repeat(30)).is_ok());
    }

    #[test]
    fn test_validate_server_name_too_short() {
        assert!(validate_server_name("").is_err());
        assert!(validate_server_name("ab").is_err());
    }

    #[test]
    fn test_validate_server_name_too_long() {
        assert!(validate_server_name(&"a".repeat(31)).is_err());
    }

    #[test]
    fn test_validate_server_name_invalid_chars() {
        assert!(validate_server_name("Mesa do João").is_err());
        assert!(validate_server_name("mesa_joao").is_err());
        assert!(validate_server_name("MESA").is_err());
        assert!(validate_server_name("mesaça").is_err());
        assert!(validate_server_name("mesa@1").is_err());
    }

    #[test]
    fn test_validate_password_ok() {
        assert!(validate_password("0000").is_ok());
        assert!(validate_password("1234").is_ok());
        assert!(validate_password("9999").is_ok());
    }

    #[test]
    fn test_validate_password_wrong_length() {
        assert!(validate_password("").is_err());
        assert!(validate_password("123").is_err());
        assert!(validate_password("12345").is_err());
    }

    #[test]
    fn test_validate_password_non_digit() {
        assert!(validate_password("abcd").is_err());
        assert!(validate_password("12a4").is_err());
        assert!(validate_password("-1 4").is_err());
    }

    #[test]
    fn test_detect_status_not_found() {
        with_temp_env(None, |_| {
            assert_eq!(detect_env_status(), EnvStatus::NotFound);
        });
    }

    #[test]
    fn test_detect_status_complete() {
        with_temp_env(Some("SERVER_NAME=mesa-x\nSERVER_PASSWORD=1234\n"), |_| {
            assert_eq!(detect_env_status(), EnvStatus::Complete);
        });
    }

    #[test]
    fn test_detect_status_missing_name() {
        with_temp_env(Some("SERVER_PASSWORD=1234\n"), |_| {
            assert_eq!(detect_env_status(), EnvStatus::MissingName);
        });
    }

    #[test]
    fn test_detect_status_missing_password() {
        with_temp_env(Some("SERVER_NAME=mesa-x\n"), |_| {
            assert_eq!(detect_env_status(), EnvStatus::MissingPassword);
        });
    }

    #[test]
    fn test_detect_status_missing_both() {
        with_temp_env(Some("# nada aqui\n"), |_| {
            assert_eq!(detect_env_status(), EnvStatus::MissingBoth);
        });
    }

    #[test]
    fn test_load_env_map_skips_comments_and_blanks() {
        with_temp_env(
            Some("# comentário\n\nSERVER_NAME=abc\n  # outro\nSERVER_PASSWORD=1234\n"),
            |_| {
                let m = load_env_map();
                assert_eq!(m.get("SERVER_NAME"), Some(&"abc".to_string()));
                assert_eq!(m.get("SERVER_PASSWORD"), Some(&"1234".to_string()));
            },
        );
    }

    #[test]
    fn test_save_and_load() {
        with_temp_env(None, |_| {
            assert!(save_env("mesa-teste", "4321").is_ok());
            assert_eq!(load_server_name(), Some("mesa-teste".to_string()));
            assert_eq!(load_password(), Some("4321".to_string()));
            assert_eq!(detect_env_status(), EnvStatus::Complete);
        });
    }

    #[test]
    fn test_save_validates() {
        with_temp_env(None, |_| {
            assert!(save_env("ab", "4321").is_err());
            assert!(save_env("mesa", "12a4").is_err());
            assert!(!get_env_path().exists());
        });
    }

    #[test]
    fn test_save_env_partial_updates_only_provided() {
        with_temp_env(Some("SERVER_NAME=antigo\nSERVER_PASSWORD=1111\n"), |_| {
            save_env_partial(Some("novo"), None).unwrap();
            assert_eq!(load_server_name(), Some("novo".to_string()));
            assert_eq!(load_password(), Some("1111".to_string()));

            save_env_partial(None, Some("2222")).unwrap();
            assert_eq!(load_server_name(), Some("novo".to_string()));
            assert_eq!(load_password(), Some("2222".to_string()));
        });
    }

    #[test]
    fn test_delete_env() {
        with_temp_env(Some("SERVER_NAME=x\nSERVER_PASSWORD=1234\n"), |path| {
            assert!(path.exists());
            assert!(delete_env().is_ok());
            assert!(!path.exists());
            assert!(delete_env().is_ok());
        });
    }

    #[test]
    fn test_load_empty_values_treated_as_missing() {
        with_temp_env(Some("SERVER_NAME=\nSERVER_PASSWORD=1234\n"), |_| {
            assert_eq!(detect_env_status(), EnvStatus::MissingName);
            assert_eq!(load_server_name(), None);
        });
    }

    #[test]
    fn test_status_as_str() {
        assert_eq!(EnvStatus::Complete.as_str(), "complete");
        assert_eq!(EnvStatus::MissingPassword.as_str(), "missing_password");
        assert_eq!(EnvStatus::MissingName.as_str(), "missing_name");
        assert_eq!(EnvStatus::MissingBoth.as_str(), "missing_both");
        assert_eq!(EnvStatus::NotFound.as_str(), "not_found");
    }
}
