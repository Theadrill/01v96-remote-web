use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SceneData {
    pub index: u8,
    pub name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SceneManagerState {
    #[serde(rename = "currentScene")]
    pub current_scene: Option<SceneData>,
    pub scenes: Vec<SceneData>,
}

#[derive(Debug, Clone, Default)]
pub struct SceneManager {
    pub scenes: Vec<Option<SceneData>>,
    pub current_scene: Option<SceneData>,
    pub active_scene_index: u8,
    pub is_syncing: bool,
}

impl SceneManager {
    pub fn new() -> Self {
        Self {
            scenes: vec![None; 100],
            current_scene: None,
            active_scene_index: 0,
            is_syncing: false,
        }
    }

    pub fn build_bulk_request(&self, req_type: u8, index: u8) -> Vec<u8> {
        vec![
            0xF0, 0x43, 0x20, 0x7E, 0x4C, 0x4D, 0x20, 0x20, 0x38, 0x43, 0x39, 0x33, 0x6D, req_type,
            index, 0xF7,
        ]
    }

    pub async fn fetch_scenes(
        &mut self,
        scheduler: &std::sync::Arc<crate::midi::MidiScheduler>,
        io: &socketioxide::SocketIo,
    ) {
        if self.is_syncing {
            return;
        }
        self.is_syncing = true;
        self.scenes = vec![None; 100];
        self.current_scene = None;

        tracing::info!("📚 [Scene Manager] Iniciando sincronizacao da Biblioteca de Cenas...");

        let edit_buffer = self.build_bulk_request(0x02, 0);
        scheduler.enqueue(edit_buffer, 1).await;

        for i in 1u8..=99 {
            let req = self.build_bulk_request(0x00, i);
            scheduler.enqueue(req, 1).await;
            tokio::time::sleep(std::time::Duration::from_millis(50)).await;
        }

        tracing::info!("✅ [Scene Manager] Requisicoes enviadas, aguardando dumps...");
        tokio::time::sleep(std::time::Duration::from_secs(2)).await;

        self.is_syncing = false;

        let loaded = self.scenes.iter().filter(|s| s.is_some()).count();
        tracing::info!(
            "✅ [Scene Manager] Sincronizacao concluida! {} cenas carregadas.",
            loaded
        );

        if let Some(ref current) = self.current_scene.clone() {
            let match_found = self
                .scenes
                .iter()
                .flatten()
                .find(|s| s.name == current.name);
            if let Some(m) = match_found {
                self.active_scene_index = m.index;
                if let Some(ref mut cs) = self.current_scene {
                    cs.index = m.index;
                }
                tracing::info!(
                    "🎯 [Scene Manager] Indice inferido: {} para '{}'",
                    m.index,
                    current.name
                );
            }
        }

        let _ = io.emit("scenesUpdated", &self.get_state());
        if let Some(ref cs) = self.current_scene {
            let _ = io.emit("currentScene", &serde_json::json!(cs));
        }
    }

    pub fn handle_midi_data(&mut self, message: &[u8]) -> bool {
        if message.len() <= 20 {
            return false;
        }

        if message[0] == 0xF0 && message[1] == 0x43 && message[14] == 0x6D {
            let req_type = message[15];
            let index = message[16];

            if (req_type == 0x00 || req_type == 0x02) && message.len() > 21 {
                let mut name = String::new();
                for i in 0..16 {
                    if 20 + i < message.len() {
                        let c = message[20 + i];
                        if c >= 32 && c <= 126 {
                            name.push(c as char);
                        } else if c != 0 {
                            name.push(' ');
                        }
                    }
                }
                let name = name.trim().to_uppercase();

                if req_type == 0x02 {
                    let scene_data = SceneData {
                        index: self.active_scene_index,
                        name: name.clone(),
                    };
                    self.current_scene = Some(scene_data);
                } else if (index as usize) < self.scenes.len() {
                    self.scenes[index as usize] = Some(SceneData {
                        index,
                        name,
                    });
                }
                return true;
            }
        }
        false
    }

    pub fn get_state(&self) -> SceneManagerState {
        let scenes = self.scenes.iter().filter_map(|s| s.clone()).collect();
        SceneManagerState {
            current_scene: self.current_scene.clone(),
            scenes,
        }
    }

    pub fn set_active_scene(&mut self, index: u8) {
        self.active_scene_index = index;
        if let Some(ref mut cs) = self.current_scene {
            cs.index = index;
            if (index as usize) < self.scenes.len() {
                if let Some(ref s) = self.scenes[index as usize] {
                    cs.name = s.name.clone();
                }
            }
        }
    }
}
