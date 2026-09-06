use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use tokio::sync::mpsc;

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

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct InsertState {
    pub on: bool,
    pub position: f64,
    pub patch_in: f64,
    #[serde(default)]
    pub patch_in_r: f64,
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
    #[serde(rename = "aux1Pre")]
    pub aux1_pre: bool,
    #[serde(rename = "aux2Pre")]
    pub aux2_pre: bool,
    #[serde(rename = "aux3Pre")]
    pub aux3_pre: bool,
    #[serde(rename = "aux4Pre")]
    pub aux4_pre: bool,
    #[serde(rename = "aux5Pre")]
    pub aux5_pre: bool,
    #[serde(rename = "aux6Pre")]
    pub aux6_pre: bool,
    #[serde(rename = "aux7Pre")]
    pub aux7_pre: bool,
    #[serde(rename = "aux8Pre")]
    pub aux8_pre: bool,
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
    pub paired: bool,
    #[serde(rename = "pairedWith")]
    pub paired_with: Option<usize>,
    #[serde(rename = "pairSource")]
    pub pair_source: Option<usize>,
    pub insert: InsertState,
    pub stereo: bool,
    #[serde(rename = "auxTypeMode")]
    pub mode: u8,
    #[serde(rename = "auxGlobal")]
    pub global: u8,
    #[serde(rename = "auxSendPrePoint")]
    pub pre_point: u8,
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
    #[serde(default)]
    pub insert: InsertState,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FxTypeState {
    pub id: u32,
    pub name: String,
    pub bypass: bool,
    pub mix: f64,
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
    #[serde(rename = "fxTypes")]
    pub fx_types: HashMap<usize, FxTypeState>,
    #[serde(rename = "fxParams")]
    pub fx_params: HashMap<usize, HashMap<usize, f64>>,
    #[serde(rename = "fxInputs")]
    pub fx_inputs: HashMap<usize, f64>,
    #[serde(rename = "tailscaleUrl")]
    pub tailscale_url: Option<String>,
    #[serde(rename = "globalMeterPosMaster")]
    pub global_meter_pos_master: String,
    #[serde(rename = "globalMeterPosChannels")]
    pub global_meter_pos_channels: String,
    /// HashSet thread-safe contendo os IDs dos canais travados (ex: "CH1", "MASTER", "MIX1", "BUS1")
    #[serde(skip)]
    pub locked_channels: std::sync::Arc<std::sync::RwLock<std::collections::HashSet<String>>>,
    /// Sender half of the FX sync pipeline ack channel (UnboundedSender — never drops signals).
    /// Installed by SyncManager before starting the FX sync task; set to None when done.
    /// midi_receiver calls send() here after processing each FX Input/Output MIDI response.
    #[serde(skip)]
    pub fx_sync_ack_tx: Option<mpsc::UnboundedSender<crate::midi::protocol::FxSyncAck>>,
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
                        patch_in_r: 0.0,
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
                    aux1_pre: true,
                    aux2_pre: true,
                    aux3_pre: true,
                    aux4_pre: true,
                    aux5_pre: true,
                    aux6_pre: true,
                    aux7_pre: true,
                    aux8_pre: true,
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
                paired: false,
                paired_with: None,
                pair_source: None,
                insert: InsertState { on: false, position: 0.0, patch_in: 0.0, patch_in_r: 0.0 },
                stereo: false,
                mode: 1,
                global: 1,
                pre_point: 0,
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
                insert: InsertState {
                    on: false,
                    position: 0.0,
                    patch_in: 0.0,
                    patch_in_r: 0.0,
                },
            },
            out_patches_omni: HashMap::new(),
            out_patches_adat: HashMap::new(),
            out_patches_fx: HashMap::new(),
            out_patches_slot: HashMap::new(),
            out_patches_2tr: HashMap::new(),
            fx_types: {
                let mut fx = HashMap::new();
                for i in 0..4 {
                    fx.insert(
                        i,
                        FxTypeState {
                            id: 0,
                            name: "Reverb Hall".to_string(),
                            bypass: false,
                            mix: 100.0,
                        },
                    );
                }
                fx
            },
            fx_inputs: HashMap::new(),
            fx_params: {
                let mut map = HashMap::new();
                for i in 0..4 {
                    map.insert(i, HashMap::new());
                }
                map
            },
            tailscale_url: None,
            global_meter_pos_master: "pre".to_string(),
            global_meter_pos_channels: "pre".to_string(),
            locked_channels: std::sync::Arc::new(std::sync::RwLock::new(std::collections::HashSet::new())),
            fx_sync_ack_tx: None,
        }
    }

    /// PROJEÇÃO PURA — não é estado. Computa FX output routes varrendo os 5 campos SSOT.
    /// Retorna: { destKey: slotVal } onde destKey = element*100 + channel, slotVal ∈ {121..140}
    pub fn get_fx_outputs(&self) -> std::collections::HashMap<usize, f64> {
        let mut routes = std::collections::HashMap::new();

        // Element 1: channels[0..39].patch
        for (&ch_idx, ch_state) in &self.channels {
            if ch_idx < 40 {
                let patch_rounded = ch_state.patch.round() as u32;
                if (121..=140).contains(&patch_rounded) {
                    let key = 1 * 100 + ch_idx;
                    routes.insert(key, ch_state.patch);
                }
            }
        }

        // Element 2: channels[0..31].insert.patch_in
        for (&ch_idx, ch_state) in &self.channels {
            if ch_idx < 32 {
                let patch_rounded = ch_state.insert.patch_in.round() as u32;
                if (121..=140).contains(&patch_rounded) {
                    let key = 2 * 100 + ch_idx;
                    routes.insert(key, ch_state.insert.patch_in);
                }
            }
        }

        // Element 7: buses[0..7].insert.patch_in
        for (&bus_idx, bus_state) in &self.buses {
            if bus_idx < 8 {
                let patch_rounded = bus_state.insert.patch_in.round() as u32;
                if (121..=140).contains(&patch_rounded) {
                    let key = 7 * 100 + bus_idx;
                    routes.insert(key, bus_state.insert.patch_in);
                }
            }
        }

        // Element 8: mixes[0..7].insert.patch_in
        for (&mix_idx, mix_state) in &self.mixes {
            if mix_idx < 8 {
                let patch_rounded = mix_state.insert.patch_in.round() as u32;
                if (121..=140).contains(&patch_rounded) {
                    let key = 8 * 100 + mix_idx;
                    routes.insert(key, mix_state.insert.patch_in);
                }
            }
        }

        // Element 10: master.insert (ch 0 = L, ch 1 = R)
        let master_l_rounded = self.master.insert.patch_in.round() as u32;
        if (121..=140).contains(&master_l_rounded) {
            let key = 10 * 100 + 0;
            routes.insert(key, self.master.insert.patch_in);
        }
        let master_r_rounded = self.master.insert.patch_in_r.round() as u32;
        if (121..=140).contains(&master_r_rounded) {
            let key = 10 * 100 + 1;
            routes.insert(key, self.master.insert.patch_in_r);
        }

        routes
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
                } else if mt == "kBusInsert/kInsertOn" {
                    let local = if (44..=51).contains(channel) { *channel - 44 } else { *channel };
                    if let Some(bus) = self.buses.get_mut(&local) {
                        bus.insert.on = cv;
                    }
                } else if mt == "kBusInsert/kInsertLocInsert" {
                    let local = if (44..=51).contains(channel) { *channel - 44 } else { *channel };
                    if let Some(bus) = self.buses.get_mut(&local) {
                        bus.insert.position = v;
                    }
                } else if mt == "kBusToStereo/kBusToStereoOn" {
                    let local = if (44..=51).contains(channel) { *channel - 44 } else { *channel };
                    if let Some(bus) = self.buses.get_mut(&local) {
                        bus.stereo = cv;
                    }
                } else if mt == "kBusInsertInput/kBusInsertIn" {
                    let local = if (44..=51).contains(channel) { *channel - 44 } else { *channel };
                    if let Some(bus) = self.buses.get_mut(&local) {
                        bus.insert.patch_in = v;
                    }
                } else if mt == "kStereoInsert/kInsertOn" {
                    self.master.insert.on = cv;
                } else if mt == "kStereoInsert/kInsertLocInsert" {
                    self.master.insert.position = v;
                } else if mt == "kStereoInsertInput/kStereoInsertIn" {
                    if *channel == 0 {
                        self.master.insert.patch_in = v;
                    } else if *channel == 1 {
                        self.master.insert.patch_in_r = v;
                    }
                } else if mt == "kAUXType/kAUXTypeIndex" {
                    if let Some(mix) = self.mixes.get_mut(channel) {
                        mix.mode = v as u8;
                    }
                } else if mt == "kAuxSendPrePoint/kPrePoint" {
                    for i in 0..8 {
                        if let Some(mix) = self.mixes.get_mut(&i) {
                            mix.pre_point = v as u8;
                        }
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
                } else if mt == "kEffectInput/kEffectIn" {
                    self.fx_inputs.insert(*channel, v);
                    // Manter paridade com o mapa de output patches (porta 0..7 -> source_id),
                    // pois o modal de Insert busca o INSERT OUT neste mapa.
                    self.out_patches_fx.insert(*channel, v);
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
                } else if mt == "kAUXPair/kPair" {
                    if let Some(mix) = self.mixes.get_mut(channel) {
                        let is_paired = cv;
                        let partner_idx = if channel % 2 == 0 {
                            channel + 1
                        } else {
                            channel - 1
                        };
                        mix.paired = is_paired;
                        mix.paired_with = if is_paired { Some(partner_idx) } else { None };
                        mix.pair_source = if is_paired {
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
                    if let Some(partner) = self.mixes.get_mut(&partner_idx) {
                        partner.paired = cv;
                        partner.paired_with = if cv { Some(*channel) } else { None };
                        partner.pair_source = if cv {
                            Some((*channel).min(partner_idx))
                        } else {
                            None
                        };
                    }
                } else if mt == "kBusPair/kPair" {
                    if let Some(bus) = self.buses.get_mut(channel) {
                        let is_paired = cv;
                        let partner_idx = if channel % 2 == 0 {
                            channel + 1
                        } else {
                            channel - 1
                        };
                        bus.paired = is_paired;
                        bus.paired_with = if is_paired { Some(partner_idx) } else { None };
                        bus.pair_source = if is_paired {
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
                    if let Some(partner) = self.buses.get_mut(&partner_idx) {
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
                    } else if (32..=39).contains(channel) {
                        Some(*channel)
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
                        } else if mt.ends_with("Pre")
                            && let Some(aux_num_str) = mt
                                .strip_prefix("kInputAUX/kAUX")
                                .and_then(|s| s.strip_suffix("Pre"))
                            && let Ok(aux_num) = aux_num_str.parse::<usize>()
                        {
                            match aux_num {
                                1 => ch.aux1_pre = v > 0.5,
                                2 => ch.aux2_pre = v > 0.5,
                                3 => ch.aux3_pre = v > 0.5,
                                4 => ch.aux4_pre = v > 0.5,
                                5 => ch.aux5_pre = v > 0.5,
                                6 => ch.aux6_pre = v > 0.5,
                                7 => ch.aux7_pre = v > 0.5,
                                8 => ch.aux8_pre = v > 0.5,
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
            crate::midi::protocol::ParsedMidi::GrMeter { .. } => {}
            crate::midi::protocol::ParsedMidi::FxMeterData { .. } => {}
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
            crate::midi::protocol::ParsedMidi::FxTypeUpdate { slot, fx_type_id } => {
                if *slot < 4 {
                    let name = crate::midi::fx_list::resolve_fx_name(*fx_type_id);
                    let entry = self.fx_types.entry(*slot).or_insert_with(|| FxTypeState {
                        id: 0,
                        name: "Unknown".to_string(),
                        bypass: false,
                        mix: 100.0,
                    });
                    if entry.id != *fx_type_id {
                        entry.id = *fx_type_id;
                        entry.name = name;
                        if let Some(params_map) = self.fx_params.get_mut(slot) {
                            params_map.clear();
                        }
                    }
                }
            }
            crate::midi::protocol::ParsedMidi::FxParamUpdate { slot, param, value } => {
                if *slot < 4 {
                    let entry = self.fx_params.entry(*slot).or_default();
                    entry.insert(*param, *value);
                    if *param == 48 {
                        if let Some(fx) = self.fx_types.get_mut(slot) {
                            fx.mix = *value;
                        }
                    } else if *param == 52 {
                        if let Some(fx) = self.fx_types.get_mut(slot) {
                            fx.bypass = *value > 0.0;
                        }
                    }
                }
            }
            crate::midi::protocol::ParsedMidi::FxOutputUpdate {
                element,
                channel,
                value,
            } => {
                // ✅ SSOT PURA: escreve diretamente nos campos autoritativos.
                // Não existe mais self.fx_outputs para atualizar.
                let rounded = (*value).round() as u32;
                let is_fx = (121..=140).contains(&rounded);

                if *element == 1 {
                    // SSOT #1: channels[ch].patch
                    if let Some(ch) = self.channels.get_mut(channel) {
                        if is_fx {
                            ch.patch = *value;
                        }
                    }
                } else if *element == 2 {
                    // SSOT #2: channels[ch].insert.patch_in
                    if let Some(ch) = self.channels.get_mut(channel) {
                        if is_fx {
                            ch.insert.patch_in = *value;
                        }
                    }
                } else if *element == 7 {
                    // SSOT #3: buses[ch].insert.patch_in
                    if let Some(bus) = self.buses.get_mut(channel) {
                        if is_fx {
                            bus.insert.patch_in = *value;
                        }
                    }
                } else if *element == 8 {
                    // SSOT #4: mixes[ch].insert.patch_in
                    if let Some(aux) = self.mixes.get_mut(channel) {
                        if is_fx {
                            aux.insert.patch_in = *value;
                        }
                    }
                } else if *element == 10 {
                    // SSOT #5: master.insert (ch 0 = L, ch 1 = R)
                    if is_fx {
                        if *channel == 0 {
                            self.master.insert.patch_in = *value;
                        } else if *channel == 1 {
                            self.master.insert.patch_in_r = *value;
                        }
                    }
                }
            }
            crate::midi::protocol::ParsedMidi::FxLibraryRecall { slot, preset } => {
                // Preset recall: o numero do preset nao corresponde ao ID real
                // do algoritmo no DSP (ex: Preset 44 -> algoritmo 49). O ID real
                // sera consultado via request do parametro 0x31 (Effect Type)
                // disparado no midi_receiver. Ate la, invalida o cache de params.
                if *slot < 4 {
                    if let Some(params_map) = self.fx_params.get_mut(slot) {
                        params_map.clear();
                    }
                    let _ = preset;
                }
            }
            crate::midi::protocol::ParsedMidi::GlobalMeterPosition { target, mode } => {
                if target == "master" {
                    self.global_meter_pos_master = mode.clone();
                } else if target == "channels" {
                    self.global_meter_pos_channels = mode.clone();
                }
            }
        }
    }

    fn get_target_for_mt(&mut self, mt: &str, channel: usize) -> Option<&mut dyn ChannelLike> {
        if mt.starts_with("kInput") || mt == "kPan" {
            if channel == 52 {
                return Some(&mut self.master as &mut dyn ChannelLike);
            }
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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::midi::protocol::ParsedMidi;

    #[test]
    fn test_get_fx_outputs_and_master_insert() {
        let mut state = GlobalState::new();
        // Default: no FX routes
        assert!(state.get_fx_outputs().is_empty());

        // Channel 0 patch set to FX1-1 (121)
        state.channels.get_mut(&0).unwrap().patch = 121.0;
        // Channel 1 patch set to physical AD 3 (3)
        state.channels.get_mut(&1).unwrap().patch = 3.0;
        // Channel 4 insert patch_in set to FX2-1 (129)
        state.channels.get_mut(&4).unwrap().insert.patch_in = 129.0;
        // Bus 0 insert patch_in set to FX3-1 (137)
        state.buses.get_mut(&0).unwrap().insert.patch_in = 137.0;
        // Mix 1 insert patch_in set to FX4-1 (139)
        state.mixes.get_mut(&1).unwrap().insert.patch_in = 139.0;
        // Master insert patch_in set to FX1-2 (122) on Left, FX4-2 (140) on Right
        state.master.insert.patch_in = 122.0;
        state.master.insert.patch_in_r = 140.0;

        let routes = state.get_fx_outputs();
        assert_eq!(routes.get(&100), Some(&121.0)); // Element 1 (CH1)
        assert_eq!(routes.get(&101), None);         // AD 3 is not FX
        assert_eq!(routes.get(&204), Some(&129.0)); // Element 2 (INS CH5)
        assert_eq!(routes.get(&700), Some(&137.0)); // Element 7 (INS BUS1)
        assert_eq!(routes.get(&801), Some(&139.0)); // Element 8 (INS AUX2)
        assert_eq!(routes.get(&1000), Some(&122.0)); // Element 10 ch 0 (Master Insert L)
        assert_eq!(routes.get(&1001), Some(&140.0)); // Element 10 ch 1 (Master Insert R)
        assert_eq!(routes.len(), 6);
    }

    #[test]
    fn test_fx_output_to_channel_patch() {
        let mut state = GlobalState::new();
        state.channels.get_mut(&0).unwrap().patch = 1.0; // AD 1

        // FxOutputUpdate with FX value (121.0) writes to channels[0].patch
        let midi = ParsedMidi::FxOutputUpdate {
            element: 1,
            channel: 0,
            value: 121.0,
        };
        state.apply_midi(&midi);
        assert_eq!(state.channels.get(&0).unwrap().patch, 121.0);
    }

    #[test]
    fn test_fx_output_element_10_master_insert() {
        let mut state = GlobalState::new();
        assert_eq!(state.master.insert.patch_in, 0.0);
        assert_eq!(state.master.insert.patch_in_r, 0.0);

        // FxOutputUpdate with element 10, channel 0, value 139.0 (FX4 OUT1 / L)
        let midi_l = ParsedMidi::FxOutputUpdate {
            element: 10,
            channel: 0,
            value: 139.0,
        };
        state.apply_midi(&midi_l);
        assert_eq!(state.master.insert.patch_in, 139.0);

        // FxOutputUpdate with element 10, channel 1, value 140.0 (FX4 OUT2 / R)
        // MUST NOT overwrite channel 0!
        let midi_r = ParsedMidi::FxOutputUpdate {
            element: 10,
            channel: 1,
            value: 140.0,
        };
        state.apply_midi(&midi_r);
        assert_eq!(state.master.insert.patch_in, 139.0);
        assert_eq!(state.master.insert.patch_in_r, 140.0);

        // get_fx_outputs() must project both: 1000 -> 139.0 and 1001 -> 140.0
        let routes = state.get_fx_outputs();
        assert_eq!(routes.get(&1000), Some(&139.0));
        assert_eq!(routes.get(&1001), Some(&140.0));
    }

    #[test]
    fn test_fx_output_non_fx_ignored() {
        let mut state = GlobalState::new();
        state.channels.get_mut(&0).unwrap().patch = 1.0; // AD 1

        // FxOutputUpdate with non-FX value (3.0 = AD 3 or 0 = NONE) is ignored
        let midi_none = ParsedMidi::FxOutputUpdate {
            element: 1,
            channel: 0,
            value: 0.0,
        };
        state.apply_midi(&midi_none);
        assert_eq!(state.channels.get(&0).unwrap().patch, 1.0);

        let midi_phys = ParsedMidi::FxOutputUpdate {
            element: 1,
            channel: 0,
            value: 3.0,
        };
        state.apply_midi(&midi_phys);
        assert_eq!(state.channels.get(&0).unwrap().patch, 1.0);
    }

    #[test]
    fn test_channel_input_writes_patch() {
        let mut state = GlobalState::new();
        let midi = ParsedMidi::ControlChange {
            msg_type: "kChannelInput/kChannelIn".to_string(),
            channel: 0,
            value: 121.0,
        };
        state.apply_midi(&midi);
        assert_eq!(state.channels.get(&0).unwrap().patch, 121.0);
    }

    #[test]
    fn test_master_insert_midi_handlers() {
        let mut state = GlobalState::new();
        assert!(!state.master.insert.on);
        assert_eq!(state.master.insert.position, 0.0);
        assert_eq!(state.master.insert.patch_in, 0.0);
        assert_eq!(state.master.insert.patch_in_r, 0.0);

        state.apply_midi(&ParsedMidi::ControlChange {
            msg_type: "kStereoInsert/kInsertOn".to_string(),
            channel: 0,
            value: 1.0,
        });
        assert!(state.master.insert.on);

        state.apply_midi(&ParsedMidi::ControlChange {
            msg_type: "kStereoInsert/kInsertLocInsert".to_string(),
            channel: 0,
            value: 2.0,
        });
        assert_eq!(state.master.insert.position, 2.0);

        // Ch 0 -> patch_in (L)
        state.apply_midi(&ParsedMidi::ControlChange {
            msg_type: "kStereoInsertInput/kStereoInsertIn".to_string(),
            channel: 0,
            value: 121.0,
        });
        assert_eq!(state.master.insert.patch_in, 121.0);

        // Ch 1 -> patch_in_r (R)
        state.apply_midi(&ParsedMidi::ControlChange {
            msg_type: "kStereoInsertInput/kStereoInsertIn".to_string(),
            channel: 1,
            value: 122.0,
        });
        assert_eq!(state.master.insert.patch_in, 121.0);
        assert_eq!(state.master.insert.patch_in_r, 122.0);
    }
}
