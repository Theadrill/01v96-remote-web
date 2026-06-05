use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::{Path, PathBuf};
use std::time::SystemTime;

use serde::{Deserialize, Serialize};
use tokio_util::sync::CancellationToken;

#[derive(Debug, Clone, Hash, Eq, PartialEq)]
pub enum ChannelId {
    Input(u8),
    StIn(u8),
    Master,
}

impl Serialize for ChannelId {
    fn serialize<S: serde::Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        self.to_string().serialize(serializer)
    }
}

impl<'de> Deserialize<'de> for ChannelId {
    fn deserialize<D: serde::Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        let s = String::deserialize(deserializer)?;
        ChannelId::try_from(s.as_str()).map_err(serde::de::Error::custom)
    }
}

impl std::fmt::Display for ChannelId {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            ChannelId::Input(n) | ChannelId::StIn(n) => write!(f, "{}", n),
            ChannelId::Master => write!(f, "master"),
        }
    }
}

impl std::str::FromStr for ChannelId {
    type Err = String;
    fn from_str(s: &str) -> Result<Self, Self::Err> {
        ChannelId::try_from(s)
    }
}

impl TryFrom<&str> for ChannelId {
    type Error = String;
    fn try_from(s: &str) -> Result<Self, Self::Error> {
        if s == "master" {
            return Ok(ChannelId::Master);
        }
        let n: u8 = s
            .parse()
            .map_err(|_| format!("invalid channel id '{}'", s))?;
        match n {
            1..=32 => Ok(ChannelId::Input(n)),
            33..=40 => Ok(ChannelId::StIn(n)),
            _ => Err(format!("channel {} out of range (1-40 or master)", n)),
        }
    }
}

impl ChannelId {
    pub fn to_global_channel(&self) -> u8 {
        match self {
            ChannelId::Input(n) => n - 1,
            ChannelId::StIn(n) => n + 27,
            ChannelId::Master => 52,
        }
    }

    pub fn from_global_channel(ch: u8) -> Option<Self> {
        match ch {
            0..=31 => Some(ChannelId::Input(ch + 1)),
            60..=67 => Some(ChannelId::StIn(ch - 27)),
            52 => Some(ChannelId::Master),
            _ => None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChannelNameEntry {
    pub name: String,
    pub short: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SceneEntry {
    #[serde(default)]
    pub custom_name: Option<String>,
    pub physical_scene: String,
    pub physical_id: u8,
    pub file: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CustomSceneRegistry {
    pub mesa_nome: String,
    pub scenes: Vec<SceneEntry>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CustomScene {
    pub scene_name: String,
    pub scene_id: u8,
    pub channels: HashMap<ChannelId, ChannelNameEntry>,
}

#[derive(Debug, Clone)]
struct CachedScene {
    scene: CustomScene,
    mtime: SystemTime,
}

struct CustomSceneOpQueue {
    current_token: Option<CancellationToken>,
}

impl CustomSceneOpQueue {
    fn new() -> Self {
        Self {
            current_token: None,
        }
    }

    fn cancel_current(&mut self) {
        if let Some(token) = self.current_token.take() {
            token.cancel();
        }
    }

    fn new_token(&mut self) -> CancellationToken {
        self.cancel_current();
        let token = CancellationToken::new();
        self.current_token = Some(token.clone());
        token
    }
}

pub struct CustomSceneManager {
    registry: CustomSceneRegistry,
    cache: HashMap<String, CachedScene>,
    data_dir: PathBuf,
    mesa_nome: String,
    dirty_files: HashSet<String>,
    registry_dirty: bool,
    operation_queue: CustomSceneOpQueue,
}

impl CustomSceneManager {
    pub fn load_all(data_dir: &Path, mesa_nome: &str) -> Self {
        if let Ok(entries) = fs::read_dir(data_dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.extension().and_then(|e| e.to_str()) == Some("tmp") {
                    let _ = fs::remove_file(&path);
                }
            }
        }

        let local_dir = data_dir.join("local");
        let shared_dir = data_dir.join("shared");

        let _ = fs::create_dir_all(&local_dir);
        let _ = fs::create_dir_all(&shared_dir);

        let registry_path = local_dir.join(format!("custom_names_scenes-{}.json", mesa_nome));
        tracing::info!(
            "[CUSTOM] load_all: mesa_nome={}, registry_path={:?}",
            mesa_nome,
            registry_path
        );
        let registry: CustomSceneRegistry = match fs::read_to_string(&registry_path) {
            Ok(content) => {
                tracing::info!(
                    "[CUSTOM] registry file found ({} bytes), parsing...",
                    content.len()
                );
                serde_json::from_str(&content).unwrap_or_else(|e| {
                    tracing::error!("[CUSTOM] failed to parse registry: {}", e);
                    CustomSceneRegistry {
                        mesa_nome: mesa_nome.to_string(),
                        scenes: Vec::new(),
                    }
                })
            }
            Err(e) => {
                tracing::warn!("[CUSTOM] registry file not found or unreadable: {}", e);
                CustomSceneRegistry {
                    mesa_nome: mesa_nome.to_string(),
                    scenes: Vec::new(),
                }
            }
        };

        tracing::info!(
            "[CUSTOM] registry loaded with {} scene(s)",
            registry.scenes.len()
        );

        let mut cache = HashMap::new();
        for entry in &registry.scenes {
            let mut path = local_dir.join(&entry.file);
            if !path.exists() {
                path = shared_dir.join(&entry.file);
            }
            tracing::info!("[CUSTOM] loading scene file: {:?}", path);
            if let Ok((scene, mtime)) = load_scene_inner(&path) {
                tracing::info!(
                    "[CUSTOM] scene '{}' loaded successfully ({} channels)",
                    entry.file,
                    scene.channels.len()
                );
                cache.insert(entry.file.clone(), CachedScene { scene, mtime });
            } else {
                tracing::warn!("[CUSTOM] failed to load scene file: {:?}", path);
            }
        }

        Self {
            mesa_nome: mesa_nome.to_string(),
            data_dir: data_dir.to_path_buf(),
            registry,
            cache,
            dirty_files: HashSet::new(),
            registry_dirty: false,
            operation_queue: CustomSceneOpQueue::new(),
        }
    }

    pub fn get_scene(&mut self, filename: &str) -> Option<&CustomScene> {
        let cached = self.cache.get(filename)?;
        let mut path = self.data_dir.join("local").join(filename);
        if !path.exists() {
            path = self.data_dir.join("shared").join(filename);
        }

        let current_mtime = fs::metadata(&path).ok()?.modified().ok()?;
        if current_mtime != cached.mtime {
            tracing::info!("cache stale for {}, reloading from disk...", filename);
            match load_scene_inner(&path) {
                Ok((scene, mtime)) => {
                    self.cache
                        .insert(filename.to_string(), CachedScene { scene, mtime });
                }
                Err(e) => {
                    tracing::error!("failed to reload {}: {}", filename, e);
                    return None;
                }
            }
        }

        self.cache.get(filename).map(|c| &c.scene)
    }

    pub fn find_scene_for_physical(
        &mut self,
        physical_id: u8,
        physical_scene: &str,
    ) -> Option<CustomScene> {
        let files: Vec<String> = self
            .registry
            .scenes
            .iter()
            .filter(|e| e.physical_id == physical_id || e.physical_scene == physical_scene)
            .map(|e| e.file.clone())
            .collect();

        for file in &files {
            if let Some(scene) = self.get_scene(file) {
                return Some(scene.clone());
            }
        }

        let default_file = format!("custom_names_scene-default-{}.json", self.mesa_nome);
        self.get_scene(&default_file).cloned()
    }

    pub fn update_physical_scene_name(
        &mut self,
        physical_id: u8,
        new_name: &str,
        sync_shared: bool,
    ) -> bool {
        let mut updated = false;
        for entry in &mut self.registry.scenes {
            if entry.physical_id == physical_id && entry.physical_scene != new_name {
                entry.physical_scene = new_name.to_string();
                updated = true;
            }
        }
        if updated {
            self.registry_dirty = true;
            self.persist(sync_shared);
        }
        updated
    }

    pub fn ensure_registry_entry(&mut self, physical_scene: &str, physical_id: u8, filename: &str) {
        if !self.registry.scenes.iter().any(|e| e.file == filename) {
            // Attempt to extract a default custom name from the filename if we don't have one
            let mut extracted_name = filename.to_string();
            if let Some(stripped) = extracted_name.strip_prefix("custom_names_scene-") {
                extracted_name = stripped.to_string();
            }
            let suffix = format!("-{}.json", self.mesa_nome);
            if let Some(stripped) = extracted_name.strip_suffix(&suffix) {
                extracted_name = stripped.to_string();
            }

            self.registry.scenes.push(SceneEntry {
                custom_name: Some(extracted_name),
                physical_scene: physical_scene.to_string(),
                physical_id,
                file: filename.to_string(),
            });
            self.registry_dirty = true;
        }
    }

    pub fn upsert_channel(&mut self, filename: &str, channel_id: ChannelId, name: &str) {
        let normalized = normalize_name(name);
        let short = to_short_name(&normalized);

        if let Some(cached) = self.cache.get_mut(filename) {
            cached.scene.channels.insert(
                channel_id,
                ChannelNameEntry {
                    name: normalized,
                    short,
                },
            );
        }
        self.dirty_files.insert(filename.to_string());
    }

    pub fn remove_channel(&mut self, filename: &str, channel_id: &ChannelId) -> bool {
        let empty = if let Some(cached) = self.cache.get_mut(filename) {
            cached.scene.channels.remove(channel_id);
            cached.scene.channels.is_empty()
        } else {
            return false;
        };

        if empty {
            let local_path = self.data_dir.join("local").join(filename);
            let shared_path = self.data_dir.join("shared").join(filename);
            let _ = fs::remove_file(&local_path);
            let _ = fs::remove_file(&shared_path);
            self.registry.scenes.retain(|e| e.file != filename);
            self.cache.remove(filename);
            self.registry_dirty = true;
            return true;
        }

        self.dirty_files.insert(filename.to_string());
        false
    }

    pub fn list_scenes(&self) -> Vec<SceneEntry> {
        self.registry.scenes.clone()
    }

    pub fn rename_custom_scene(
        &mut self,
        old_file: &str,
        new_scene_name: &str,
        sync_shared: bool,
    ) -> Result<(), String> {
        let entry = self
            .registry
            .scenes
            .iter_mut()
            .find(|e| e.file == old_file)
            .ok_or("Scene not found in registry")?;

        let safe_name = new_scene_name.replace(|c: char| !c.is_alphanumeric() && c != '-', "_");
        let new_file = format!("custom_names_scene-{}-{}.json", safe_name, self.mesa_nome);

        if old_file == new_file {
            return Ok(());
        }

        let old_local = self.data_dir.join("local").join(old_file);
        let new_local = self.data_dir.join("local").join(&new_file);
        let old_shared = self.data_dir.join("shared").join(old_file);
        let new_shared = self.data_dir.join("shared").join(&new_file);

        if new_local.exists() || new_shared.exists() {
            return Err("A scene with this name already exists".to_string());
        }

        if old_local.exists() {
            std::fs::rename(&old_local, &new_local)
                .map_err(|e| format!("Failed to rename local file: {}", e))?;
        }
        if old_shared.exists() {
            std::fs::rename(&old_shared, &new_shared)
                .map_err(|e| format!("Failed to rename shared file: {}", e))?;
        }

        if let Some(mut cached) = self.cache.remove(old_file) {
            cached.scene.scene_name = new_scene_name.to_string();
            self.cache.insert(new_file.clone(), cached);
            self.dirty_files.insert(new_file.clone());
        }

        entry.file = new_file;
        entry.custom_name = Some(new_scene_name.to_string());
        self.registry_dirty = true;
        self.persist(sync_shared);

        Ok(())
    }

    pub fn persist(&mut self, sync_shared: bool) {
        let mut synced_files = Vec::new();

        let local_dir = self.data_dir.join("local");
        let shared_dir = self.data_dir.join("shared");

        for file in self.dirty_files.drain() {
            if let Some(cached) = self.cache.get(&file) {
                let local_path = local_dir.join(&file);
                save_json_atomic(&local_path, &cached.scene);
                if sync_shared {
                    let shared_path = shared_dir.join(&file);
                    save_json_atomic(&shared_path, &cached.scene);
                    synced_files.push(format!("data/custom_scenes/shared/{}", file));
                }
            }
        }

        if self.registry_dirty {
            let file = format!("custom_names_scenes-{}.json", self.mesa_nome);
            let local_path = local_dir.join(&file);
            save_json_atomic(&local_path, &self.registry);
            self.registry_dirty = false;
            if sync_shared {
                let shared_path = shared_dir.join(&file);
                save_json_atomic(&shared_path, &self.registry);
                synced_files.push(format!("data/custom_scenes/shared/{}", file));
            }
        }

        if sync_shared && !synced_files.is_empty() {
            let msg = if synced_files.len() == 1 {
                format!("auto-sync: custom scene {} updated", synced_files[0])
            } else {
                "auto-sync: multiple custom scenes updated".to_string()
            };
            tokio::spawn(async move {
                crate::api::macros::enqueue_git_sync(synced_files, msg, 5000).await;
            });
        }
    }

    pub fn mark_dirty(&mut self, filename: &str) {
        self.dirty_files.insert(filename.to_string());
    }

    pub fn create_scene(
        &mut self,
        filename: &str,
        scene_name: &str,
        scene_id: u8,
        channels: HashMap<ChannelId, ChannelNameEntry>,
    ) {
        let scene = CustomScene {
            scene_name: scene_name.to_string(),
            scene_id,
            channels,
        };
        self.cache.insert(
            filename.to_string(),
            CachedScene {
                scene,
                mtime: SystemTime::now(),
            },
        );
        self.dirty_files.insert(filename.to_string());
    }

    pub fn prepare_op(&mut self) -> CancellationToken {
        self.operation_queue.cancel_current();
        self.operation_queue.new_token()
    }

    pub fn rename_mesa(
        &mut self,
        old_name: &str,
        new_name: &str,
        sync_shared: bool,
    ) -> Result<(), String> {
        let old_registry_path = self
            .data_dir
            .join("local")
            .join(format!("custom_names_scenes-{}.json", old_name));
        let registry_content = fs::read_to_string(&old_registry_path)
            .map_err(|e| format!("failed to read old registry: {}", e))?;
        let registry: CustomSceneRegistry = serde_json::from_str(&registry_content)
            .map_err(|e| format!("failed to parse old registry: {}", e))?;

        let mut new_registry = CustomSceneRegistry {
            mesa_nome: new_name.to_string(),
            scenes: Vec::with_capacity(registry.scenes.len()),
        };

        for entry in &registry.scenes {
            let new_file = entry.file.replace(old_name, new_name);
            let old_local = self.data_dir.join("local").join(&entry.file);
            let new_local = self.data_dir.join("local").join(&new_file);
            let old_shared = self.data_dir.join("shared").join(&entry.file);
            let new_shared = self.data_dir.join("shared").join(&new_file);

            if old_local.exists() {
                fs::rename(&old_local, &new_local).ok();
            }
            if old_shared.exists() {
                fs::rename(&old_shared, &new_shared).ok();
            }

            new_registry.scenes.push(SceneEntry {
                custom_name: entry.custom_name.clone(),
                physical_scene: entry.physical_scene.clone(),
                physical_id: entry.physical_id,
                file: new_file,
            });
        }

        let old_default_local = self
            .data_dir
            .join("local")
            .join(format!("custom_names_scene-default-{}.json", old_name));
        let new_default_local = self
            .data_dir
            .join("local")
            .join(format!("custom_names_scene-default-{}.json", new_name));
        if old_default_local.exists() {
            fs::rename(&old_default_local, &new_default_local).ok();
        }

        let old_default_shared = self
            .data_dir
            .join("shared")
            .join(format!("custom_names_scene-default-{}.json", old_name));
        let new_default_shared = self
            .data_dir
            .join("shared")
            .join(format!("custom_names_scene-default-{}.json", new_name));
        if old_default_shared.exists() {
            fs::rename(&old_default_shared, &new_default_shared).ok();
        }

        let new_registry_path_local = self
            .data_dir
            .join("local")
            .join(format!("custom_names_scenes-{}.json", new_name));
        save_json_atomic(&new_registry_path_local, &new_registry);
        if sync_shared {
            let new_registry_path_shared = self
                .data_dir
                .join("shared")
                .join(format!("custom_names_scenes-{}.json", new_name));
            save_json_atomic(&new_registry_path_shared, &new_registry);
        }

        let _ = fs::remove_file(&old_registry_path);
        let old_registry_path_shared = self
            .data_dir
            .join("shared")
            .join(format!("custom_names_scenes-{}.json", old_name));
        let _ = fs::remove_file(&old_registry_path_shared);

        self.registry = new_registry;
        self.mesa_nome = new_name.to_string();
        self.cache.clear();

        self.persist(sync_shared);

        let new_name_clone = new_name.to_string();
        if sync_shared {
            tokio::spawn(async move {
                crate::api::macros::enqueue_git_sync(
                    vec!["data/custom_scenes/shared/custom_names_scene*.json".to_string()],
                    format!("auto-sync: mesa renamed to '{}'", new_name_clone),
                    5000,
                )
                .await;
            });
        }

        Ok(())
    }

    pub fn mesa_nome(&self) -> &str {
        &self.mesa_nome
    }

    pub fn data_dir(&self) -> &Path {
        &self.data_dir
    }

    pub fn registry(&self) -> &CustomSceneRegistry {
        &self.registry
    }
}

fn remove_accent(c: char) -> char {
    use unicode_normalization::UnicodeNormalization;
    c.nfd().next().unwrap_or(c)
}

pub fn normalize_name(input: &str) -> String {
    input
        .to_uppercase()
        .chars()
        .map(remove_accent)
        .filter(|c| c.is_ascii_alphanumeric() || *c == ' ')
        .take(10)
        .collect::<String>()
        .trim()
        .to_string()
}

pub fn to_short_name(name: &str) -> String {
    let normalized: String = name
        .chars()
        .filter(|c| c.is_ascii_alphanumeric())
        .take(4)
        .collect();
    format!("{: <4}", normalized.to_uppercase())
}

pub fn save_json_atomic(path: &Path, data: &impl Serialize) {
    let tmp_path = path.with_extension("json.tmp");
    match serde_json::to_string_pretty(data) {
        Ok(json) => {
            if let Err(e) = fs::write(&tmp_path, &json) {
                tracing::error!("failed to write temp file {:?}: {}", tmp_path, e);
                return;
            }
            if let Err(e) = fs::rename(&tmp_path, path) {
                tracing::error!("failed to rename {:?} -> {:?}: {}", tmp_path, path, e);
            }
        }
        Err(e) => {
            tracing::error!("failed to serialize: {}", e);
        }
    }
}

fn load_scene_inner(path: &Path) -> Result<(CustomScene, SystemTime), String> {
    let content = fs::read_to_string(path)
        .map_err(|e| format!("failed to read {}: {}", path.display(), e))?;
    let scene: CustomScene = serde_json::from_str(&content)
        .map_err(|e| format!("failed to parse {}: {}", path.display(), e))?;
    let mtime = fs::metadata(path)
        .and_then(|m| m.modified())
        .map_err(|e| format!("failed to get mtime: {}", e))?;
    Ok((scene, mtime))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_normalize_name_with_accents() {
        assert_eq!(normalize_name("MAURÍCIO!"), "MAURICIO");
        assert_eq!(normalize_name("violão"), "VIOLAO");
        assert_eq!(normalize_name("CORAÇÃO"), "CORACAO");
        assert_eq!(normalize_name(""), "");
        assert_eq!(normalize_name("   "), "");
        assert_eq!(normalize_name("a".repeat(20).as_str()), "A".repeat(10));
    }

    #[test]
    fn test_to_short_name() {
        assert_eq!(to_short_name("AX"), "AX  ");
        assert_eq!(to_short_name("MAURICIO"), "MAUR");
        assert_eq!(to_short_name("IO"), "IO  ");
        assert_eq!(to_short_name("ABCDEFGH"), "ABCD");
    }

    #[test]
    fn test_channel_id_valid() {
        let c1: ChannelId = "1".parse().unwrap();
        assert_eq!(c1, ChannelId::Input(1));
        assert_eq!(c1.to_global_channel(), 0);

        let c32: ChannelId = "32".parse().unwrap();
        assert_eq!(c32, ChannelId::Input(32));
        assert_eq!(c32.to_global_channel(), 31);

        let st33: ChannelId = "33".parse().unwrap();
        assert_eq!(st33, ChannelId::StIn(33));
        assert_eq!(st33.to_global_channel(), 60);

        let st40: ChannelId = "40".parse().unwrap();
        assert_eq!(st40, ChannelId::StIn(40));
        assert_eq!(st40.to_global_channel(), 67);

        let master: ChannelId = "master".parse().unwrap();
        assert_eq!(master, ChannelId::Master);
        assert_eq!(master.to_global_channel(), 52);
    }

    #[test]
    fn test_channel_id_invalid() {
        assert!("0".parse::<ChannelId>().is_err());
        assert!("41".parse::<ChannelId>().is_err());
        assert!("mastr".parse::<ChannelId>().is_err());
        assert!("abc".parse::<ChannelId>().is_err());
        assert!("".parse::<ChannelId>().is_err());
    }

    #[test]
    fn test_from_global_channel() {
        assert_eq!(ChannelId::from_global_channel(0), Some(ChannelId::Input(1)));
        assert_eq!(
            ChannelId::from_global_channel(31),
            Some(ChannelId::Input(32))
        );
        assert_eq!(
            ChannelId::from_global_channel(60),
            Some(ChannelId::StIn(33))
        );
        assert_eq!(
            ChannelId::from_global_channel(67),
            Some(ChannelId::StIn(40))
        );
        assert_eq!(ChannelId::from_global_channel(52), Some(ChannelId::Master));
        assert_eq!(ChannelId::from_global_channel(99), None);
    }

    #[test]
    fn test_channel_id_serialize_roundtrip() {
        let mut channels = HashMap::new();
        channels.insert(
            ChannelId::Input(1),
            ChannelNameEntry {
                name: "TEST".to_string(),
                short: "TEST".to_string(),
            },
        );
        channels.insert(
            ChannelId::Master,
            ChannelNameEntry {
                name: "MASTER".to_string(),
                short: "MAST".to_string(),
            },
        );

        let json = serde_json::to_string_pretty(&channels).unwrap();
        let deserialized: HashMap<ChannelId, ChannelNameEntry> =
            serde_json::from_str(&json).unwrap();

        assert_eq!(deserialized.len(), 2);
        assert_eq!(deserialized[&ChannelId::Input(1)].name, "TEST");
        assert_eq!(deserialized[&ChannelId::Master].name, "MASTER");
    }

    #[test]
    fn test_registry_entry_management() {
        let dir = std::env::temp_dir().join("test_registry_entry");
        let _ = fs::create_dir_all(&dir);

        let mut manager = CustomSceneManager::load_all(&dir, "test-mesa");
        manager.ensure_registry_entry("cena-1", 1, "scene-1.json");
        assert_eq!(manager.registry.scenes.len(), 1);
        assert_eq!(manager.registry.scenes[0].physical_id, 1);
        assert!(manager.registry_dirty);

        manager.ensure_registry_entry("cena-1-updated", 1, "scene-1-updated.json");
        assert_eq!(manager.registry.scenes.len(), 1);
        assert_eq!(manager.registry.scenes[0].file, "scene-1-updated.json");

        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn test_remove_channel_with_deletion() {
        let dir = std::env::temp_dir().join("test_remove_channel");
        let _ = fs::create_dir_all(&dir);

        let mut manager = CustomSceneManager::load_all(&dir, "test-mesa");
        let filename = "test-scene.json";

        let mut channels = HashMap::new();
        channels.insert(
            ChannelId::Input(1),
            ChannelNameEntry {
                name: "TEST".to_string(),
                short: "TEST".to_string(),
            },
        );
        manager.create_scene(filename, "test-scene", 1, channels);
        manager.persist();

        assert!(dir.join(filename).exists());

        let deleted = manager.remove_channel(filename, &ChannelId::Input(1));
        assert!(deleted);
        assert!(!manager.cache.contains_key(filename));
        assert!(manager.registry.scenes.iter().all(|e| e.file != filename));
        assert!(!dir.join(filename).exists());

        let _ = fs::remove_dir_all(&dir);
    }
}
