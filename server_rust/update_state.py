import sys
import re

with open('src/state.rs', 'r', encoding='utf-8') as f:
    content = f.read()

# 1 & 2. Add scene_manager to GlobalState and GlobalState::new
content = content.replace('pub struct GlobalState {\n    #[serde(rename = "sceneNumber")]', 'pub struct GlobalState {\n    #[serde(skip)]\n    pub scene_manager: crate::scene_manager::SceneManager,\n    #[serde(rename = "sceneNumber")]')
content = content.replace('        GlobalState {\n            scene_number: 0,', '        GlobalState {\n            scene_manager: crate::scene_manager::SceneManager::new(),\n            scene_number: 0,')

# 3. Add handle_raw_midi to GlobalState
content = content.replace('    pub fn apply_midi(&mut self, parsed: &crate::midi::protocol::ParsedMidi) {', '    pub fn handle_raw_midi(&mut self, message: &[u8]) -> bool {\n        self.scene_manager.handle_midi_data(message)\n    }\n\n    pub fn apply_midi(&mut self, parsed: &crate::midi::protocol::ParsedMidi) {')

# 4. Add paired and paired_with to ChannelState
content = content.replace('    pub patch: f64,', '    pub patch: f64,\n    pub paired: bool,\n    #[serde(rename = "pairedWith")]\n    pub paired_with: Option<usize>,')

# 5. Initialize paired and paired_with
content = content.replace('                  patch: 1.0,', '                  patch: 1.0,\n                  paired: false,\n                  paired_with: None,')

# 6. Add logic for kInputPair/kPair in apply_midi
kpair_logic = '''                  if msg_type == "kInputPair/kPair" {
                      let is_paired = *value != 0.0;
                      let partner_idx = if channel % 2 == 0 { channel + 1 } else { channel - 1 };
                      if let Some(ch) = self.channels.get_mut(channel) {
                          ch.paired = is_paired;
                          ch.paired_with = if is_paired { Some(partner_idx) } else { None };
                      }
                      if let Some(partner) = self.channels.get_mut(&partner_idx) {
                          partner.paired = is_paired;
                          partner.paired_with = if is_paired { Some(*channel) } else { None };
                      }
                  } else if msg_type == "kInputFader/kFader"'''
content = content.replace('                  if msg_type == "kInputFader/kFader"', kpair_logic)

with open('src/state.rs', 'w', encoding='utf-8') as f:
    f.write(content)
