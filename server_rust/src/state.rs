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
pub struct InsertState {
    pub on: bool,
    pub position: f64,
    pub patch_in: f64,
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
    pub insert: InsertState,
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
    #[serde(rename = "aux1")]
    pub aux1: f64,
    #[serde(rename = "aux1On")]
    pub aux1_on: bool,
    #[serde(rename = "aux2")]
    pub aux2: f64,
    #[serde(rename = "aux2On")]
    pub aux2_on: bool,
    #[serde(rename = "aux3")]
    pub aux3: f64,
    #[serde(rename = "aux3On")]
    pub aux3_on: bool,
    #[serde(rename = "aux4")]
    pub aux4: f64,
    #[serde(rename = "aux4On")]
    pub aux4_on: bool,
    #[serde(rename = "aux5")]
    pub aux5: f64,
    #[serde(rename = "aux5On")]
    pub aux5_on: bool,
    #[serde(rename = "aux6")]
    pub aux6: f64,
    #[serde(rename = "aux6On")]
    pub aux6_on: bool,
    #[serde(rename = "aux7")]
    pub aux7: f64,
    #[serde(rename = "aux7On")]
    pub aux7_on: bool,
    #[serde(rename = "aux8")]
    pub aux8: f64,
    #[serde(rename = "aux8On")]
    pub aux8_on: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MixBusState {
    pub value: f64,
    pub on: bool,
    pub solo: bool,
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
    pub solo: bool,
    pub att: f64,
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
    #[serde(rename = "outPatchesOmni")]
    pub out_patches_omni: HashMap<usize, f64>,
    #[serde(rename = "outPatchesAdat")]
    pub out_patches_adat: HashMap<usize, f64>,
    #[serde(rename = "outPatchesFx")]
    pub out_patches_fx: HashMap<usize, f64>,
    #[serde(rename = "outPatchesSlot")]
    pub out_patches_slot: HashMap<usize, f64>,
    #[serde(rename = "outPatches2tr")]
    pub out_patches_2tr: HashMap<usize, f64>,
    #[serde(rename = "tailscaleUrl")]
    pub tailscale_url: Option<String>,
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
                    insert: InsertState {
                        on: false,
                        position: 0.0,
                        patch_in: 0.0,
                    },
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
                    aux1: 0.0,
                    aux1_on: false,
                    aux2: 0.0,
                    aux2_on: false,
                    aux3: 0.0,
                    aux3_on: false,
                    aux4: 0.0,
                    aux4_on: false,
                    aux5: 0.0,
                    aux5_on: false,
                    aux6: 0.0,
                    aux6_on: false,
                    aux7: 0.0,
                    aux7_on: false,
                    aux8: 0.0,
                    aux8_on: false,
                },
            );
        }

        let mut mixes = HashMap::new();
        let mut buses = HashMap::new();
        for i in 0..8 {
            let mix_bus_state = MixBusState {
                value: 0.0,
                on: false,
                solo: false,
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
                solo: false,
                att: 0.0,
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
            out_patches_omni: HashMap::new(),
            out_patches_adat: HashMap::new(),
            out_patches_fx: HashMap::new(),
            out_patches_slot: HashMap::new(),
            out_patches_2tr: HashMap::new(),
            tailscale_url: None,
        }
    }
    pub fn handle_raw_midi(&mut self, message: &[u8]) -> bool {
        self.scene_manager.handle_midi_data(message)
    }

    pub fn inject_names(&mut self, names: &std::collections::HashMap<String, String>) {
        for (key, name) in names {
            if let Ok(idx) = key.parse::<usize>() {
                let limited = if name.len() > 16 { &name[..16] } else { name };
                let padded = format!("{: <16}", limited);
                let chars: Vec<String> = padded.chars().take(16).map(|c| c.to_string()).collect();

                if idx <= 31 {
                    if let Some(ch) = self.channels.get_mut(&idx) {
                        ch.name = limited.to_string();
                        if ch.name_chars.len() < 4 {
                            ch.name_chars.resize(4, " ".to_string());
                        }
                        for (i, c) in chars.iter().take(4).enumerate() {
                            ch.name_chars[i] = c.clone();
                        }
                    }
                } else if (60..=67).contains(&idx) {
                    let local = 32 + (idx - 60);
                    if let Some(ch) = self.channels.get_mut(&local) {
                        ch.name = limited.to_string();
                        if ch.name_chars.len() < 4 {
                            ch.name_chars.resize(4, " ".to_string());
                        }
                        for (i, c) in chars.iter().take(4).enumerate() {
                            ch.name_chars[i] = c.clone();
                        }
                    }
                } else if (36..=43).contains(&idx) {
                    let local = idx - 36;
                    if let Some(m) = self.mixes.get_mut(&local) {
                        m.name = limited.to_string();
                        m.name_chars = chars;
                    }
                } else if (44..=51).contains(&idx) {
                    let local = idx - 44;
                    if let Some(b) = self.buses.get_mut(&local) {
                        b.name = limited.to_string();
                        b.name_chars = chars;
                    }
                } else if idx == 52 {
                    self.master.name = limited.to_string();
                    self.master.name_chars = chars;
                }
            }
        }
        tracing::info!("✅ [NAMES] {} nomes injetados no GlobalState.", names.len());
    }

    pub fn apply_midi(&mut self, parsed: &crate::midi::protocol::ParsedMidi) {
        match parsed {
            crate::midi::protocol::ParsedMidi::ControlChange {
                msg_type,
                channel,
                value,
            } => {
                let mt = msg_type.as_str();
                let v = *value;
                let cv = v > 0.0;

                // Diagnostic for first few messages
                static CC_COUNT: std::sync::atomic::AtomicUsize =
                    std::sync::atomic::AtomicUsize::new(0);
                let cc = CC_COUNT.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
                if cc < 50 {
                    tracing::info!(
                        "🔧 [apply_midi] CC#{}: type={}, ch={}, value={}",
                        cc,
                        mt,
                        channel,
                        v
                    );
                }

                // --- Faders / On ---
                let local_ch = if (60..=67).contains(channel) {
                    32 + (channel - 60)
                } else {
                    *channel
                };

                if mt == "kInputFader/kFader" {
                    if let Some(ch) = self.channels.get_mut(&local_ch) {
                        ch.value = v;
                    }
                } else if mt == "kInputChannelOn/kChannelOn" {
                    if let Some(ch) = self.channels.get_mut(&local_ch) {
                        ch.on = cv;
                    }
                } else if mt == "kStereoFader/kFader" {
                    self.master.value = v;
                } else if mt == "kStereoChannelOn/kChannelOn" {
                    self.master.on = cv;
                } else if mt == "kAUXFader/kFader" {
                    if let Some(mix) = self.mixes.get_mut(channel) {
                        mix.value = v;
                    }
                } else if mt == "kAUXChannelOn/kChannelOn" {
                    if let Some(mix) = self.mixes.get_mut(channel) {
                        mix.on = cv;
                    }
                } else if mt == "kBusFader/kFader" {
                    if let Some(bus) = self.buses.get_mut(channel) {
                        bus.value = v;
                    }
                } else if mt == "kBusChannelOn/kChannelOn" {
                    if let Some(bus) = self.buses.get_mut(channel) {
                        bus.on = cv;
                    }
                // --- Solo / Phase / Att / Patch ---
                } else if mt == "kSetupSoloChOn/kSoloChOn" {
                    if let Some(ch) = self.channels.get_mut(&local_ch) {
                        ch.solo = cv;
                    } else if (40..=47).contains(&local_ch) {
                        if let Some(m) = self.mixes.get_mut(&(local_ch - 40)) {
                            m.solo = cv;
                        }
                    } else if (48..=55).contains(&local_ch) {
                        if let Some(b) = self.buses.get_mut(&(local_ch - 48)) {
                            b.solo = cv;
                        }
                    }
                } else if mt == "kInputPhase/kPhase" {
                    if let Some(ch) = self.channels.get_mut(channel) {
                        ch.phase = v;
                    }
                } else if mt == "kInputAttenuator/kAtt"
                    || mt == "kStereoAttenuator/kAtt"
                    || mt == "kBusAttenuator/kAtt"
                    || mt == "kAUXAttenuator/kAtt"
                    || mt == "kMatrixAttenuator/kAtt"
                {
                    if let Some(s) = self.get_target_for_mt(mt, *channel) {
                        s.set_att(v);
                    }
                } else if mt == "kInputInsert/kInsertOn" {
                    if let Some(ch) = self.channels.get_mut(channel) {
                        ch.insert.on = cv;
                    }
                } else if mt == "kInputInsert/kInsertLocInsert" {
                    if let Some(ch) = self.channels.get_mut(channel) {
                        ch.insert.position = v;
                    }
                } else if mt == "kChannelInsertIn/kInsertIn" {
                    if let Some(ch) = self.channels.get_mut(channel) {
                        ch.insert.patch_in = v;
                    }
                } else if mt == "kOutputPatch/kOmni" {
                    self.out_patches_omni.insert(*channel, v);
                } else if mt == "kOutputPatch/kAdat" {
                    self.out_patches_adat.insert(*channel, v);
                } else if mt == "kOutputPatch/kFx" {
                    self.out_patches_fx.insert(*channel, v);
                } else if mt == "kOutputPatch/kSlot" {
                    self.out_patches_slot.insert(*channel, v);
                } else if mt == "kOutputPatch/k2tr" {
                    self.out_patches_2tr.insert(*channel, v);
                } else if mt == "kChannelInput/kChannelIn" {
                    if let Some(ch) = self.channels.get_mut(channel) {
                        ch.patch = v;
                    }
                // --- Pan ---
                } else if mt == "kPan" {
                    if let Some(s) = self.get_target_for_mt(mt, *channel) {
                        s.set_pan(v);
                    }
                // --- Pair ---
                } else if mt == "kInputPair/kPair" {
                    if let Some(ch) = self.channels.get_mut(channel) {
                        let is_paired = cv;
                        let partner_idx = if channel % 2 == 0 {
                            channel + 1
                        } else {
                            channel - 1
                        };
                        ch.paired = is_paired;
                        ch.paired_with = if is_paired { Some(partner_idx) } else { None };
                        ch.pair_source = if is_paired {
                            Some((*channel).min(partner_idx))
                        } else {
                            None
                        };
                    }
                    let partner_idx = if channel % 2 == 0 {
                        channel + 1
                    } else {
                        channel - 1
                    };
                    if let Some(partner) = self.channels.get_mut(&partner_idx) {
                        partner.paired = cv;
                        partner.paired_with = if cv { Some(*channel) } else { None };
                        partner.pair_source = if cv {
                            Some((*channel).min(partner_idx))
                        } else {
                            None
                        };
                    }
                // --- Bus Assign ---
                } else if mt == "kInputBus/kStereo" {
                    if let Some(ch) = self.channels.get_mut(channel) {
                        ch.stereo = cv;
                    }
                } else if mt.starts_with("kInputBus/kBus") {
                    if let Ok(bus_num) = mt.replace("kInputBus/kBus", "").parse::<usize>()
                        && (1..=8).contains(&bus_num)
                        && let Some(ch) = self.channels.get_mut(channel)
                    {
                        ch.buses[bus_num - 1] = cv;
                    }
                // --- AUX Sends ---
                } else if mt.starts_with("kInputAUX/") {
                    let target_ch_idx = if *channel <= 31 {
                        Some(*channel)
                    } else if (60..=67).contains(channel) {
                        Some(32 + (channel - 60))
                    } else {
                        None
                    };
                    if let Some(ch_idx) = target_ch_idx
                        && let Some(ch) = self.channels.get_mut(&ch_idx)
                    {
                        if mt.ends_with("Level") {
                            if let Some(aux_num_str) = mt
                                .strip_prefix("kInputAUX/kAUX")
                                .and_then(|s| s.strip_suffix("Level"))
                                && let Ok(aux_num) = aux_num_str.parse::<usize>()
                            {
                                match aux_num {
                                    1 => ch.aux1 = v,
                                    2 => ch.aux2 = v,
                                    3 => ch.aux3 = v,
                                    4 => ch.aux4 = v,
                                    5 => ch.aux5 = v,
                                    6 => ch.aux6 = v,
                                    7 => ch.aux7 = v,
                                    8 => ch.aux8 = v,
                                    _ => {}
                                }
                            }
                        } else if mt.ends_with("On")
                            && let Some(aux_num_str) = mt
                                .strip_prefix("kInputAUX/kAUX")
                                .and_then(|s| s.strip_suffix("On"))
                            && let Ok(aux_num) = aux_num_str.parse::<usize>()
                        {
                            match aux_num {
                                1 => ch.aux1_on = cv,
                                2 => ch.aux2_on = cv,
                                3 => ch.aux3_on = cv,
                                4 => ch.aux4_on = cv,
                                5 => ch.aux5_on = cv,
                                6 => ch.aux6_on = cv,
                                7 => ch.aux7_on = cv,
                                8 => ch.aux8_on = cv,
                                _ => {}
                            }
                        }
                    }
                // --- EQ ---
                } else if mt.contains("EQ/") {
                    self.apply_eq(mt, *channel, v);
                // --- Gate ---
                } else if mt.contains("Gate/") {
                    if let Some(s) = self.get_target_for_mt(mt, *channel)
                        && let Some(gate) = s.gate_mut()
                    {
                        let parts: Vec<&str> = mt.splitn(2, "Gate/").collect();
                        if parts.len() == 2 {
                            match parts[1] {
                                "kGateOn" => gate.on = cv,
                                "kGateThreshold" => gate.thresh = v,
                                "kGateAttack" => gate.attack = v,
                                "kGateRange" => gate.range = v,
                                "kGateHold" => gate.hold = v,
                                "kGateDecay" => gate.decay = v,
                                _ => {}
                            }
                        }
                    }
                // --- Comp ---
                } else if mt.contains("Comp/")
                    && let Some(s) = self.get_target_for_mt(mt, *channel)
                {
                    s.apply_comp(mt, v);
                }
            }
            crate::midi::protocol::ParsedMidi::MeterData { .. } => {}
            crate::midi::protocol::ParsedMidi::SceneNumber(scene) => {
                self.scene_number = *scene as usize;
                self.scene_manager.set_active_scene(*scene);
            }
            crate::midi::protocol::ParsedMidi::UpdateNameChar {
                channel,
                char_index,
                char,
            } => {
                self.apply_name_char(*channel, *char_index, char);
            }
            crate::midi::protocol::ParsedMidi::UpdateSceneChar { char_index, char } => {
                if *char_index < self.scene_chars.len() {
                    self.scene_chars[*char_index] = char.clone();
                    self.scene_name = self.scene_chars.join("").trim().to_string();
                    if let Some(ref mut cs) = self.scene_manager.current_scene {
                        cs.name = self.scene_name.clone();
                    }
                }
            }
            crate::midi::protocol::ParsedMidi::PhysicalSceneRecall(idx) => {
                self.scene_number = *idx as usize;
                self.scene_manager.set_active_scene(*idx);
            }
            crate::midi::protocol::ParsedMidi::PhysicalSceneStore(idx) => {
                self.scene_manager.set_active_scene(*idx);
            }
        }
    }

    fn get_target_for_mt(&mut self, mt: &str, channel: usize) -> Option<&mut dyn ChannelLike> {
        if mt.starts_with("kInput") || mt == "kPan" {
            if channel <= 31 {
                return self
                    .channels
                    .get_mut(&channel)
                    .map(|c| c as &mut dyn ChannelLike);
            } else if (60..=67).contains(&channel) {
                let local = 32 + (channel - 60);
                return self
                    .channels
                    .get_mut(&local)
                    .map(|c| c as &mut dyn ChannelLike);
            }
        } else if mt.starts_with("kAUX") {
            let local = if (36..=43).contains(&channel) {
                channel - 36
            } else {
                channel
            };
            return self
                .mixes
                .get_mut(&local)
                .map(|c| c as &mut dyn ChannelLike);
        } else if mt.starts_with("kBus") {
            let local = if (44..=51).contains(&channel) {
                channel - 44
            } else {
                channel
            };
            return self
                .buses
                .get_mut(&local)
                .map(|c| c as &mut dyn ChannelLike);
        } else if mt.starts_with("kStereo") {
            return Some(&mut self.master as &mut dyn ChannelLike);
        }
        None
    }

    fn apply_name_char(&mut self, channel: usize, char_index: usize, char: &str) {
        if channel <= 31 {
            if let Some(ch) = self.channels.get_mut(&channel)
                && char_index < ch.name_chars.len()
            {
                ch.name_chars[char_index] = char.to_string();
                ch.name = ch.name_chars.join("").trim().to_string();
            }
        } else if (60..=67).contains(&channel) {
            let local = 32 + (channel - 60);
            if let Some(ch) = self.channels.get_mut(&local) {
                if ch.name_chars.len() < 4 {
                    ch.name_chars.resize(4, " ".to_string());
                }
                if char_index < ch.name_chars.len() {
                    ch.name_chars[char_index] = char.to_string();
                    ch.name = ch.name_chars.join("").trim().to_string();
                }
            }
        } else if (36..=43).contains(&channel) {
            let local = channel - 36;
            if let Some(m) = self.mixes.get_mut(&local)
                && char_index < m.name_chars.len()
            {
                m.name_chars[char_index] = char.to_string();
                m.name = m.name_chars.join("").trim().to_string();
            }
        } else if (44..=51).contains(&channel) {
            let local = channel - 44;
            if let Some(b) = self.buses.get_mut(&local)
                && char_index < b.name_chars.len()
            {
                b.name_chars[char_index] = char.to_string();
                b.name = b.name_chars.join("").trim().to_string();
            }
        } else if channel == 52 && char_index < self.master.name_chars.len() {
            self.master.name_chars[char_index] = char.to_string();
            self.master.name = self.master.name_chars.join("").trim().to_string();
        }
    }

    fn apply_eq(&mut self, mt: &str, channel: usize, value: f64) {
        let parts: Vec<&str> = mt.splitn(2, "EQ/").collect();
        if parts.len() < 2 {
            return;
        }
        let key = parts[1];
        let eq_keys = [
            "kEQMode",
            "kEQLowQ",
            "kEQLowF",
            "kEQLowG",
            "kEQHPFOn",
            "kEQLowMidQ",
            "kEQLowMidF",
            "kEQLowMidG",
            "kEQHiMidQ",
            "kEQHiMidF",
            "kEQHiMidG",
            "kEQHiQ",
            "kEQHiF",
            "kEQHiG",
            "kEQOn",
        ];

        if let Some(s) = self.get_target_for_mt(mt, channel) {
            if key == "kEQLPFOn" {
                s.eq_mut().high.lpf_on = Some(value);
            } else if let Some(idx) = eq_keys.iter().position(|&k| k == key) {
                match idx {
                    0 => s.eq_mut().mode = value,
                    1 => s.eq_mut().low.q = value,
                    2 => s.eq_mut().low.f = value,
                    3 => s.eq_mut().low.g = value,
                    4 => s.eq_mut().low.hpf_on = Some(value),
                    5 => s.eq_mut().lowmid.q = value,
                    6 => s.eq_mut().lowmid.f = value,
                    7 => s.eq_mut().lowmid.g = value,
                    8 => s.eq_mut().himid.q = value,
                    9 => s.eq_mut().himid.f = value,
                    10 => s.eq_mut().himid.g = value,
                    11 => s.eq_mut().high.q = value,
                    12 => s.eq_mut().high.f = value,
                    13 => s.eq_mut().high.g = value,
                    14 => s.eq_mut().on = value > 0.0,
                    _ => {}
                }
            }
        }
    }
}

trait ChannelLike {
    fn set_att(&mut self, v: f64);
    fn set_pan(&mut self, v: f64);
    fn apply_comp(&mut self, mt: &str, v: f64);
    fn eq_mut(&mut self) -> &mut EqState;
    fn gate_mut(&mut self) -> Option<&mut GateState> {
        None
    }
}

impl ChannelLike for ChannelState {
    fn set_att(&mut self, v: f64) {
        self.att = v;
    }
    fn set_pan(&mut self, v: f64) {
        self.pan = v;
    }
    fn apply_comp(&mut self, mt: &str, v: f64) {
        apply_comp_fields(&mut self.comp, mt, v);
    }
    fn eq_mut(&mut self) -> &mut EqState {
        &mut self.eq
    }
    fn gate_mut(&mut self) -> Option<&mut GateState> {
        Some(&mut self.gate)
    }
}

impl ChannelLike for MixBusState {
    fn set_att(&mut self, _v: f64) {}
    fn set_pan(&mut self, _v: f64) {}
    fn apply_comp(&mut self, mt: &str, v: f64) {
        apply_comp_fields(&mut self.comp, mt, v);
    }
    fn eq_mut(&mut self) -> &mut EqState {
        &mut self.eq
    }
}

impl ChannelLike for MasterState {
    fn set_att(&mut self, v: f64) {
        self.att = v;
    }
    fn set_pan(&mut self, v: f64) {
        self.pan = v;
    }
    fn apply_comp(&mut self, mt: &str, v: f64) {
        apply_comp_fields(&mut self.comp, mt, v);
    }
    fn eq_mut(&mut self) -> &mut EqState {
        &mut self.eq
    }
}

fn apply_comp_fields(comp: &mut CompState, mt: &str, value: f64) {
    let parts: Vec<&str> = mt.splitn(2, "Comp/").collect();
    if parts.len() < 2 {
        return;
    }
    match parts[1] {
        "kCompOn" => comp.on = value > 0.0,
        "kCompThreshold" => comp.thresh = value,
        "kCompRatio" => comp.ratio = value,
        "kCompAttack" => comp.attack = value,
        "kCompRelease" => comp.release = value,
        "kCompGain" => comp.gain = value,
        "kCompKnee" => comp.knee = value,
        _ => {}
    }
}
