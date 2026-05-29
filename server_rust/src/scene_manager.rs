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

    pub fn handle_midi_data(&mut self, message: &[u8]) -> bool {
        if message.len() <= 20 {
            return false;
        }

        if message[0] == 0xF0 && message[1] == 0x43 && message[14] == 0x6D {
            // Verifica assinatura "LM  8C93" nos bytes 6 a 13 para evitar falsos positivos
            let signature = [0x4C, 0x4D, 0x20, 0x20, 0x38, 0x43, 0x39, 0x33];
            if message[6..14] != signature {
                return false;
            }

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
