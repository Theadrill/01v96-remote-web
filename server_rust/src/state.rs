use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EqBand {
    pub f: f64,
    pub g: f64,
    pub q: f64,
    #[serde(rename = "hpfOn", skip_serializing_if = "Option::is_none")]
    pub hpf_on: Option<f64>,
    #[serde(rename = "lpfOn", skip_serializing_if = "Option::is_none")]
    pub lpf_on: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EqState {
    pub on: bool,
    pub mode: f64,
    pub low: EqBand,
    pub lowmid: EqBand,
    pub himid: EqBand,
    pub high: EqBand,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CompState {
    pub on: bool,
    pub thresh: f64,
    pub ratio: f64,
    pub attack: f64,
    pub release: f64,
    pub gain: f64,
    pub knee: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GateState {
    pub on: bool,
    pub thresh: f64,
    pub range: f64,
    pub attack: f64,
    pub hold: f64,
    pub decay: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChannelState {
    pub value: f64,
    pub on: bool,
    pub solo: bool,
    pub phase: f64,
    pub att: f64,
    pub pan: f64,
    pub patch: f64,
    #[serde(rename = "nameChars")]
    pub name_chars: Vec<String>,
    pub name: String,
    pub gate: GateState,
    pub comp: CompState,
    pub buses: Vec<bool>,
    pub stereo: bool,
    pub eq: EqState,
    pub paired: bool,
    #[serde(rename = "pairedWith")]
    pub paired_with: Option<usize>,
    #[serde(rename = "pairSource")]
    pub pair_source: Option<usize>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MixBusState {
    pub value: f64,
    pub on: bool,
    pub name: String,
    #[serde(rename = "nameChars")]
    pub name_chars: Vec<String>,
    pub comp: CompState,
    pub eq: EqState,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MasterState {
    pub value: f64,
    pub on: bool,
    pub pan: f64,
    pub name: String,
    #[serde(rename = "nameChars")]
    pub name_chars: Vec<String>,
    pub comp: CompState,
    pub eq: EqState,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GlobalState {
    #[serde(skip)]
    pub scene_manager: crate::scene_manager::SceneManager,
    #[serde(rename = "sceneNumber")]
    pub scene_number: usize,
    #[serde(rename = "sceneChars")]
    pub scene_chars: Vec<String>,
    #[serde(rename = "sceneName")]
    pub scene_name: String,
    pub channels: HashMap<usize, ChannelState>,
    pub mixes: HashMap<usize, MixBusState>,
    pub buses: HashMap<usize, MixBusState>,
    pub master: MasterState,
}

impl GlobalState {
    pub fn new() -> Self {
        let mut channels = HashMap::new();
        for i in 0..40 {
            channels.insert(
                i,
                ChannelState {
                    value: 0.0,
                    on: false,
                    solo: false,
                    phase: 0.0,
                    att: 0.0,
                    pan: 0.0,
                    patch: 1.0,
                    name_chars: vec![" ".to_string(); 4],
                    name: format!("CH {}", i + 1),
                    gate: GateState {
                        on: false,
                        thresh: -260.0,
                        range: -60.0,
                        attack: 0.0,
                        hold: 20.0,
                        decay: 50.0,
                    },
                    comp: CompState {
                        on: false,
                        thresh: -80.0,
                        ratio: 7.0,
                        attack: 30.0,
                        release: 250.0,
                        gain: 0.0,
                        knee: 2.0,
                    },
                    buses: vec![false; 8],
                    stereo: true,
                    eq: EqState {
                        on: false,
                        mode: 0.0,
                        low: EqBand {
                            f: 32.0,
                            g: 0.0,
                            q: 20.0,
                            hpf_on: Some(0.0),
                            lpf_on: None,
                        },
                        lowmid: EqBand {
                            f: 60.0,
                            g: 0.0,
                            q: 20.0,
                            hpf_on: None,
                            lpf_on: None,
                        },
                        himid: EqBand {
                            f: 84.0,
                            g: 0.0,
                            q: 20.0,
                            hpf_on: None,
                            lpf_on: None,
                        },
                        high: EqBand {
                            f: 108.0,
                            g: 0.0,
                            q: 20.0,
                            hpf_on: None,
                            lpf_on: Some(0.0),
                        },
                    },
                    paired: false,
                    paired_with: None,
                    pair_source: None,
                },
            );
        }

        let mut mixes = HashMap::new();
        let mut buses = HashMap::new();
        for i in 0..8 {
            let mix_bus_state = MixBusState {
                value: 0.0,
                on: false,
                name: format!("MIX {}", i + 1),
                name_chars: vec![" ".to_string(); 16],
                comp: CompState {
                    on: false,
                    thresh: -80.0,
                    ratio: 7.0,
                    attack: 30.0,
                    release: 250.0,
                    gain: 0.0,
                    knee: 2.0,
                },
                eq: EqState {
                    on: false,
                    mode: 0.0,
                    low: EqBand {
                        f: 32.0,
                        g: 0.0,
                        q: 20.0,
                        hpf_on: Some(0.0),
                        lpf_on: None,
                    },
                    lowmid: EqBand {
                        f: 60.0,
                        g: 0.0,
                        q: 20.0,
                        hpf_on: None,
                        lpf_on: None,
                    },
                    himid: EqBand {
                        f: 84.0,
                        g: 0.0,
                        q: 20.0,
                        hpf_on: None,
                        lpf_on: None,
                    },
                    high: EqBand {
                        f: 108.0,
                        g: 0.0,
                        q: 20.0,
                        hpf_on: None,
                        lpf_on: Some(0.0),
                    },
                },
            };
            mixes.insert(i, mix_bus_state.clone());
            let mut bus_state = mix_bus_state.clone();
            bus_state.name = format!("BUS {}", i + 1);
            buses.insert(i, bus_state);
        }

        GlobalState {
            scene_manager: crate::scene_manager::SceneManager::new(),
            scene_number: 0,
            scene_chars: vec![" ".to_string(); 16],
            scene_name: "01V96".to_string(),
            channels,
            mixes,
            buses,
            master: MasterState {
                value: 0.0,
                on: false,
                pan: 0.0,
                name: "MASTER".to_string(),
                name_chars: vec![" ".to_string(); 16],
                comp: CompState {
                    on: false,
                    thresh: -80.0,
                    ratio: 7.0,
                    attack: 30.0,
                    release: 250.0,
                    gain: 0.0,
                    knee: 2.0,
                },
                eq: EqState {
                    on: false,
                    mode: 0.0,
                    low: EqBand {
                        f: 32.0,
                        g: 0.0,
                        q: 20.0,
                        hpf_on: Some(0.0),
                        lpf_on: None,
                    },
                    lowmid: EqBand {
                        f: 60.0,
                        g: 0.0,
                        q: 20.0,
                        hpf_on: None,
                        lpf_on: None,
                    },
                    himid: EqBand {
                        f: 84.0,
                        g: 0.0,
                        q: 20.0,
                        hpf_on: None,
                        lpf_on: None,
                    },
                    high: EqBand {
                        f: 108.0,
                        g: 0.0,
                        q: 20.0,
                        hpf_on: None,
                        lpf_on: Some(0.0),
                    },
                },
            },
        }
    }
    pub fn handle_raw_midi(&mut self, message: &[u8]) -> bool {
        self.scene_manager.handle_midi_data(message)
    }

    pub fn apply_midi(&mut self, parsed: &crate::midi::protocol::ParsedMidi) {
        match parsed {
            crate::midi::protocol::ParsedMidi::ControlChange {
                msg_type,
                channel,
                value,
            } => {
                if msg_type == "kInputFader/kFader" {
                    if let Some(ch) = self.channels.get_mut(channel) {
                        ch.value = *value;
                    }
                } else if msg_type == "kInputChannelOn/kChannelOn" {
                    if let Some(ch) = self.channels.get_mut(channel) {
                        ch.on = *value > 0.0;
                    }
                } else if msg_type == "kStereoFader/kFader" {
                    self.master.value = *value;
                } else if msg_type == "kStereoChannelOn/kChannelOn" {
                    self.master.on = *value > 0.0;
                } else if msg_type == "kAUXFader/kFader" {
                    if let Some(mix) = self.mixes.get_mut(channel) {
                        mix.value = *value;
                    }
                } else if msg_type == "kAUXChannelOn/kChannelOn" {
                    if let Some(mix) = self.mixes.get_mut(channel) {
                        mix.on = *value > 0.0;
                    }
                } else if msg_type == "kBusFader/kFader" {
                    if let Some(bus) = self.buses.get_mut(channel) {
                        bus.value = *value;
                    }
                } else if msg_type == "kBusChannelOn/kChannelOn" {
                    if let Some(bus) = self.buses.get_mut(channel) {
                        bus.on = *value > 0.0;
                    }
                }
            }
            crate::midi::protocol::ParsedMidi::MeterData { .. } => {}
            crate::midi::protocol::ParsedMidi::SceneNumber(scene) => {
                self.scene_number = *scene as usize;
            }
            crate::midi::protocol::ParsedMidi::UpdateNameChar {
                channel,
                char_index,
                char,
            } => {
                if *channel < 40 {
                    if let Some(ch) = self.channels.get_mut(channel) {
                        if *char_index < ch.name_chars.len() {
                            ch.name_chars[*char_index] = char.clone();
                            ch.name = ch.name_chars.join("").trim().to_string();
                        }
                    }
                }
            }
            crate::midi::protocol::ParsedMidi::UpdateSceneChar { char_index, char } => {
                if *char_index < self.scene_chars.len() {
                    self.scene_chars[*char_index] = char.clone();
                    self.scene_name = self.scene_chars.join("").trim().to_string();
                }
            }
        }
    }
}
