use lazy_static::lazy_static;
use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};

/// Set to true while FX output patch queries are in flight.
/// Distinguishes element 1 responses between input patch (kChannelInput) and
/// output patch (FxOutputUpdate) since both use the same MIDI address.
static OUTPUT_PATCH_ACTIVE: AtomicBool = AtomicBool::new(false);

pub fn set_output_patch_active(active: bool) {
    OUTPUT_PATCH_ACTIVE.store(active, Ordering::SeqCst);
}

pub fn is_output_patch_active() -> bool {
    OUTPUT_PATCH_ACTIVE.load(Ordering::SeqCst)
}

/// Signal sent by midi_receiver to the FX sync pipeline after each MIDI response
/// is processed and stored in state. Allows the pipeline to advance one request
/// at a time (flag-based coordination instead of fixed sleep timers).
#[derive(Debug)]
pub enum FxSyncAck {
    /// A kEffectInput/kEffectIn response was received for the given slot and lr.
    Input { slot: u8, lr: u8 },
    /// A FxOutputUpdate response was received for the given element and channel.
    Output { element: u8, channel: u8 },
}

lazy_static! {
    pub static ref COMMAND_BYTES: HashMap<String, [u8; 4]> = {
        let json_str = include_str!("dictionary.json");
        serde_json::from_str(json_str).expect("Failed to parse dictionary.json")
    };
}

pub const HEADER: &[u8] = &[240, 67]; // F0 43
pub const MODEL_ID: u8 = 62; // 3E
pub const FOOTER: &[u8] = &[247]; // F7

pub enum Converter {
    Fader,
    Signed,
    On,
}

pub fn convert_to_bytes(value: f64, converter: &Converter) -> Vec<u8> {
    match converter {
        Converter::Fader => {
            let v = value as i64;
            vec![0, 0, ((v >> 7) & 0x07) as u8, (v & 0x7F) as u8]
        }
        Converter::Signed => {
            let mut v = value.round() as i64;
            if v < 0 {
                v += 0x10000000;
            }
            vec![
                ((v >> 21) & 0x7F) as u8,
                ((v >> 14) & 0x7F) as u8,
                ((v >> 7) & 0x7F) as u8,
                (v & 0x7F) as u8,
            ]
        }
        Converter::On => {
            let is_on = value > 0.0;
            vec![0, 0, 0, if is_on { 1 } else { 0 }]
        }
    }
}

pub fn bytes_to_fader(bytes: &[u8]) -> i64 {
    let mut val: i64 = 0;
    for &b in bytes {
        val = (val << 7) | (b as i64);
    }
    val
}

pub fn bytes_to_signed(bytes: &[u8]) -> i64 {
    if bytes.is_empty() || bytes.len() > 8 {
        return bytes_to_fader(bytes);
    }
    let mut val: i64 = 0;
    for &b in bytes {
        val = (val << 7) | (b as i64);
    }
    let num_bits = bytes.len() * 7;
    if num_bits == 0 || num_bits >= 64 {
        return val;
    }
    let sign_bit = 1i64 << (num_bits - 1);
    let mask = (1i64 << num_bits).wrapping_sub(1);
    if (val & sign_bit) != 0 {
        val -= mask + 1;
    }
    val
}

pub fn bytes_to_on(bytes: &[u8]) -> bool {
    *bytes.last().unwrap_or(&0) != 0
}

pub fn build_change(
    command_name: &str,
    channel: u8,
    value: f64,
    converter: Converter,
) -> Option<Vec<u8>> {
    let coords = COMMAND_BYTES.get(command_name)?;
    let mut packet = Vec::with_capacity(16);
    packet.extend_from_slice(HEADER);
    packet.push(0x10); // Parameter Change
    packet.push(MODEL_ID);

    if command_name == "kOutputPatch/kSlot" {
        packet.push(coords[0]);
        packet.push(coords[1]);
        packet.push(coords[2]);
        packet.push(channel); // MSB (port index)
        packet.push(0); // LSB (Slot=0)
    } else if command_name == "kOutputPatch/kAdat" {
        packet.push(coords[0]);
        packet.push(coords[1]);
        packet.push(coords[2]);
        packet.push(channel); // MSB (port index)
        packet.push(1); // LSB (Adat=1)
    } else if command_name == "kOutputPatch/kFx" {
        packet.push(coords[0]);
        packet.push(coords[1]);
        packet.push(coords[2]);
        packet.push(channel / 4); // MSB (0=L, 1=R)
        packet.push(channel % 4); // LSB (0..3 for FX1..4)
    } else if command_name == "kOutputPatch/kOmni"
        || command_name == "kOutputPatch/k2tr"
    {
        packet.push(coords[0]);
        packet.push(coords[1]);
        packet.push(coords[2]);
        packet.push(0); // MSB
        packet.push(channel); // LSB (port index)
    } else {
        packet.push(coords[0]);
        packet.push(coords[1]);

        let mut element = coords[2];
        let mut final_channel = channel;

        if command_name == "kSetupSoloChOn/kSoloChOn" {
            if (40..=47).contains(&channel) {
                element = 47; // 2F (Output Solo)
                final_channel = channel - 32; // 40 -> 8 (Mix 1)
            } else if (48..=55).contains(&channel) {
                element = 47; // 2F (Output Solo)
                final_channel = channel - 48; // 48 -> 0 (Bus 1)
            } else if (60..=67).contains(&channel) {
                final_channel = 32 + (channel - 60);
            }
        } else {
            if command_name.starts_with("kAUX") && (36..=43).contains(&channel) {
                final_channel = channel - 36;
            } else if command_name.starts_with("kBus") && (44..=51).contains(&channel) {
                final_channel = channel - 44;
            } else if command_name.starts_with("kStereo") && channel == 52 {
                final_channel = 0;
            } else if command_name.starts_with("kInput") && (60..=67).contains(&channel) {
                final_channel = 32 + (channel - 60);
            }
        }

        packet.push(element);
        packet.push(coords[3]);
        packet.push(final_channel);
    }

    let data_bytes = convert_to_bytes(value, &converter);
    packet.extend_from_slice(&data_bytes);

    packet.extend_from_slice(FOOTER);
    Some(packet)
}

pub fn build_request(command_name: &str, channel: u8) -> Option<Vec<u8>> {
    let coords = COMMAND_BYTES.get(command_name)?;
    let mut packet = Vec::with_capacity(16);
    packet.extend_from_slice(HEADER);
    packet.push(0x30); // Parameter Request
    packet.push(MODEL_ID);

    if command_name == "kOutputPatch/kSlot" {
        packet.push(coords[0]);
        packet.push(coords[1]);
        packet.push(coords[2]);
        packet.push(channel); // MSB is port index
        let _ = coords[3]; // unused LSB definition from dictionary
    } else if command_name == "kOutputPatch/kAdat" {
        packet.push(coords[0]);
        packet.push(coords[1]);
        packet.push(coords[2]);
        packet.push(channel); // MSB is port index
        let _ = coords[3]; // unused LSB definition from dictionary
    } else if command_name == "kOutputPatch/kFx" {
        packet.push(coords[0]);
        packet.push(coords[1]);
        packet.push(coords[2]);
        packet.push(channel / 4); // MSB (0=L, 1=R)
    } else {
        packet.push(coords[0]);
        packet.push(coords[1]);
        packet.push(coords[2]);
        packet.push(coords[3]);
    }

    let mut final_channel = channel;
    if command_name == "kOutputPatch/kSlot" {
        final_channel = 0;
    } else if command_name == "kOutputPatch/kAdat" {
        final_channel = 1;
    } else if command_name == "kOutputPatch/kFx" {
        final_channel = channel % 4;
    }

    // Map channels universally
    if (command_name.starts_with("kInput") || command_name == "kSetupSoloChOn/kSoloChOn")
        && (60..=67).contains(&channel)
    {
        final_channel = 32 + (channel - 60);
    } else if command_name.starts_with("kAUX") && (36..=43).contains(&channel) {
        final_channel = channel - 36;
    } else if command_name.starts_with("kBus") && (44..=51).contains(&channel) {
        final_channel = channel - 44;
    } else if command_name.starts_with("kStereo") && channel == 52 {
        final_channel = 0;
    }
    packet.push(final_channel);

    packet.extend_from_slice(FOOTER);
    Some(packet)
}

pub fn build_fx_type_request(slot: u8) -> Option<Vec<u8>> {
    if slot > 3 {
        return None;
    }
    let mut packet = vec![
        HEADER[0], HEADER[1], // F0 43
        0x30,                  // Parameter Request
        MODEL_ID,              // 3E
        127,                   // Section (kEffect = 0x7F)
        1,                     // Group (0x01)
        88,                    // Element (0x58)
        49,                    // Parameter (kEffectType = 0x31)
        slot,                  // Slot index (0-3)
    ];
    packet.extend_from_slice(FOOTER);
    Some(packet)
}

pub fn build_fx_param_request(slot: u8, param: u8) -> Option<Vec<u8>> {
    if slot > 3 {
        return None;
    }
    let mut packet = vec![
        HEADER[0], HEADER[1], // F0 43
        0x30,                  // Parameter Request
        MODEL_ID,              // 3E
        127,                   // Section (kEffect = 0x7F)
        1,                     // Group (0x01)
        88,                    // Element (0x58)
        param,                 // Parameter index
        slot,                  // Slot index (0-3)
    ];
    packet.extend_from_slice(FOOTER);
    Some(packet)
}

pub fn build_fx_param_change(slot: u8, param: u8, value: f64) -> Option<Vec<u8>> {
    if slot > 3 {
        return None;
    }
    let mut packet = vec![
        HEADER[0], HEADER[1], // F0 43
        0x10,                  // Parameter Change
        MODEL_ID,              // 3E
        127,                   // Section (kEffect = 0x7F)
        1,                     // Group (0x01)
        88,                    // Element (0x58)
        param,                 // Parameter index
        slot,                  // Slot index (0-3)
    ];
    let val_bytes = convert_to_bytes(value, &Converter::Fader);
    packet.extend_from_slice(&val_bytes);
    packet.extend_from_slice(FOOTER);
    Some(packet)
}




pub fn build_fx_output_request(element: u8, channel: u8) -> Option<Vec<u8>> {
    if ![1, 2, 7, 8, 10].contains(&element) {
        return None;
    }
    let max_ch = match element {
        1 => 39,
        2 => 31,
        7 => 7,
        8 => 7,
        10 => 1,
        _ => return None,
    };
    if channel > max_ch {
        return None;
    }
    let mut packet = vec![
        HEADER[0], HEADER[1], // F0 43
        0x30,                  // Parameter Request
        MODEL_ID,              // 3E
        13,                    // Section
        2,                     // Group
        element,               // Element (1=CH/STIN, 2=INSCH, 7=INSBUS, 10=MASTER)
        0,                     // Param (always 0)
        channel,               // Channel (port within element)
    ];
    packet.extend_from_slice(FOOTER);
    Some(packet)
}

pub fn build_fx_input_request(slot: u8, lr: u8) -> Option<Vec<u8>> {
    if slot > 3 || lr > 1 {
        return None;
    }
    let mut packet = vec![
        HEADER[0], HEADER[1], // F0 43
        0x30,                  // Parameter Request
        MODEL_ID,              // 3E
        13,                    // Section
        2,                     // Group
        3,                     // Element (FX Input)
        lr,                    // Param MSB (0=L, 1=R)
        slot,                  // Param LSB (slot 0-3)
    ];
    packet.extend_from_slice(FOOTER);
    Some(packet)
}

/// Build a Parameter Change packet to set the FX input source.
/// slot: 0-3 (FX1..FX4), lr: 0=L / 1=R, source_id: value from the FX_IN lookup table.
/// Packet: F0 43 10 3E 0D 02 03 [lr] [slot] [d0 d1 d2 d3] F7
pub fn build_fx_input_change(slot: u8, lr: u8, source_id: u32) -> Option<Vec<u8>> {
    if slot > 3 || lr > 1 {
        return None;
    }
    // source_id is a plain unsigned value — encode as 4×7bit SysEx bytes
    let d0 = ((source_id >> 21) & 0x7F) as u8;
    let d1 = ((source_id >> 14) & 0x7F) as u8;
    let d2 = ((source_id >> 7) & 0x7F) as u8;
    let d3 = (source_id & 0x7F) as u8;
    let mut packet = vec![
        HEADER[0], HEADER[1], // F0 43
        0x10,                  // Parameter Change
        MODEL_ID,              // 3E
        13,                    // Section
        2,                     // Group
        3,                     // Element (FX input)
        lr,                    // Param (0=L, 1=R)
        slot,                  // Channel (FX slot 0-3)
        d0, d1, d2, d3,
    ];
    packet.extend_from_slice(FOOTER);
    Some(packet)
}

/// Build a Parameter Change packet to set an FX output destination.
/// element: 1=CH/STIN, 2=INSCH, 7=INSBUS, 8=INSAUX, 10=MASTER
/// dest_channel: port index within the element
/// fx_slot_val: the FX output slot value (121=FX1Out1, 122=FX1Out2, 129=FX2Out1, etc.)
///              Use 0 to clear (route NONE).
/// Packet: F0 43 10 3E 0D 02 [element] 00 [dest_channel] [d0 d1 d2 d3] F7
pub fn build_fx_output_change(mut element: u8, dest_channel: u8, fx_slot_val: u32) -> Option<Vec<u8>> {
    // We map UI elements to console elements:
    // element=15 -> ADAT (element 5, MSB=ch, LSB=1)
    // element=5  -> SLOT (element 5, MSB=ch, LSB=0)
    // element=6  -> OMNI (element 6, MSB=0, LSB=ch)
    // element=12 -> 2TR (element 12, MSB=0, LSB=ch)
    
    let mut param = 0; // MSB
    let mut ch = dest_channel; // LSB
    
    if element == 15 {
        element = 5;
        param = dest_channel;
        ch = 1;
    } else if element == 5 {
        param = dest_channel;
        ch = 0;
    } else if element == 6 || element == 12 {
        param = 0;
        ch = dest_channel;
    } else if ![1, 2, 7, 8, 10].contains(&element) {
        return None;
    }

    let d0 = ((fx_slot_val >> 21) & 0x7F) as u8;
    let d1 = ((fx_slot_val >> 14) & 0x7F) as u8;
    let d2 = ((fx_slot_val >> 7) & 0x7F) as u8;
    let d3 = (fx_slot_val & 0x7F) as u8;
    let mut packet = vec![
        HEADER[0], HEADER[1], // F0 43
        0x10,                  // Parameter Change
        MODEL_ID,              // 3E
        13,                    // Section
        2,                     // Group
        element,               // Element (dest type)
        param,                 // Param (MSB)
        ch,                    // Channel (LSB)
        d0, d1, d2, d3,
    ];
    packet.extend_from_slice(FOOTER);
    Some(packet)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_conversions() {
        // Test Fader conversion (0..1023 -> bytes)
        let bytes = convert_to_bytes(500.0, &Converter::Fader);
        assert_eq!(bytes, vec![0, 0, 3, 116]); // 500 = (3 << 7) + 116
        assert_eq!(bytes_to_fader(&bytes), 500);

        // Test Signed (like EQ Gain -24.0 -> bytes)
        let bytes_signed = convert_to_bytes(-24.0, &Converter::Signed);
        assert_eq!(bytes_to_signed(&bytes_signed), -24);

        // Test On
        assert_eq!(convert_to_bytes(1.0, &Converter::On), vec![0, 0, 0, 1]);
        assert_eq!(convert_to_bytes(0.0, &Converter::On), vec![0, 0, 0, 0]);
        assert_eq!(bytes_to_on(&[0, 0, 0, 1]), true);
    }
}
#[derive(Debug, Clone, serde::Serialize)]
pub enum ParsedMidi {
    ControlChange {
        msg_type: String,
        channel: usize,
        value: f64,
    },
    MeterData {
        is_master: bool,
        group: u8,
        levels: std::collections::HashMap<usize, u8>,
    },
    SceneNumber(u8),
    UpdateNameChar {
        channel: usize,
        char_index: usize,
        char: String,
    },
    UpdateSceneChar {
        char_index: usize,
        char: String,
    },
    PhysicalSceneRecall(u8),
    PhysicalSceneStore(u8),
    FxTypeUpdate {
        slot: usize,
        fx_type_id: u32,
    },
    FxParamUpdate {
        slot: usize,
        param: usize,
        value: f64,
    },
    FxOutputUpdate {
        element: usize,
        channel: usize,
        value: f64,
    },
    /// FX Recall de preset detectado na mesa com indicação do slot (0..3) e do preset (1..N)
    FxLibraryRecall {
        slot: usize,
        preset: u8,
    },
}

pub fn parse_message(message: &[u8]) -> Option<ParsedMidi> {
    if message.len() < 8 {
        return None;
    }

    if (message[2] & 0xF0) != 0x10 {
        return None;
    }

    // --- PHYSICAL SCENE RECALL / STORE & FX PRESET RECALL ---
    if message.len() >= 12 && message[3] == 0x3E && message[4] == 0x7F && message[5] == 0x10 {
        let action = message[6];
        let scene_or_preset = message[8];
        if action == 0x00 {
            return Some(ParsedMidi::PhysicalSceneRecall(scene_or_preset));
        } else if action == 0x20 {
            return Some(ParsedMidi::PhysicalSceneStore(scene_or_preset));
        } else if action == 0x04 {
            // FX Library Recall (Action 0x04):
            // message[8] = preset number
            // message[10] = slot index (0=FX1, 1=FX2, 2=FX3, 3=FX4)
            let slot = (message[10] & 0x03) as usize;
            return Some(ParsedMidi::FxLibraryRecall {
                slot,
                preset: scene_or_preset,
            });
        }
    }

    // --- FX RECALL COMMIT (Section 127, Group 80 / 0x50) ---
    if message.len() >= 12 && message[3] == 0x3E && message[4] == 0x7F && message[5] == 0x50 {
        let action = message[6];
        if action == 0x04 {
            let preset = message[8];
            let slot = (message[10] & 0x03) as usize;
            return Some(ParsedMidi::FxLibraryRecall { slot, preset });
        }
    }

    // --- PRIORITY 0: PAN ---
    if let Some(pan) = super::pan::parse_pan_message(message) {
        return Some(pan);
    }

    let section = message[4];
    let group = message[5];
    let element = message[6];
    let parameter = message[7];
    let channel = message[8] as usize;

    // --- METER DATA ---
    let is_master_meter = message.len() == 14 && section == 13 && group == 33 && element == 4;
    let is_universal_meter = message.len() > 20
        && (section == 13 || section == 26 || section == 127)
        && (group == 33 || group == 32 || group == 82);

    if is_master_meter || is_universal_meter {
        let mut levels = std::collections::HashMap::new();
        let data_start = 9;
        let is_master = element == 4;
        let data_bytes_available = (message.len() - 1).saturating_sub(data_start);
        let num_channels = data_bytes_available / 2;

        for i in 0..num_channels {
            let idx = data_start + (i * 2);
            let val = message[idx];

            if group == 33 && element == 1 {
                // Element 1 is Bus. Bus 1 is at i=0.
                let target_ch = 42 + channel + i;
                if (42..=49).contains(&target_ch) {
                    levels.insert(target_ch, val);
                }
            } else if group == 33 && element == 2 {
                // Element 2 is Aux. Aux 1 is at i=0.
                let target_ch = 34 + channel + i;
                if (34..=41).contains(&target_ch) {
                    levels.insert(target_ch, val);
                }
            } else if group == 33 && element == 0 && parameter == 0 && channel == 32 {
                // ST IN 1-4 L/R (channel 32 = 0x20)
                let target_ch = 60 + i;
                if (60..=67).contains(&target_ch) {
                    levels.insert(target_ch, val);
                }
            } else if group == 33 && element == 0 && parameter == 5 && channel == 32 {
                // FX Returns 1-4 L/R
                let target_ch = 68 + i;
                if (68..=75).contains(&target_ch) {
                    levels.insert(target_ch, val);
                }
            } else {
                let base_ch = match group {
                    33 => channel,      // Input CH 1-32
                    32 => 32 + channel, // Should not be used
                    82 => 32 + channel, // Stereo Master
                    _ => channel,
                };
                levels.insert(base_ch + i, val);
            }
        }
        return Some(ParsedMidi::MeterData {
            is_master,
            group,
            levels,
        });
    }

    if section == 13 && group == 127 {
        return None;
    }

    let data_bytes = &message[9..message.len() - 1];

    if section == 13 || section == 127 || section == 26 || section == 1 {
        // --- NAMES ---
        if [4, 15, 16, 18, 23].contains(&element) && (4..=19).contains(&parameter) {
            let char_index = (parameter - 4) as usize;
            let char_code = *data_bytes.last().unwrap_or(&32);
            let char_str = String::from_utf8_lossy(&[char_code]).to_string();

            let mut channel_index = channel;
            if element == 4 {
                channel_index = channel;
            } else if element == 23 {
                channel_index = 60 + (channel * 2);
            } else if element == 16 {
                channel_index = 36 + channel;
            } else if element == 15 {
                channel_index = 44 + channel;
            } else if element == 18 {
                channel_index = 52;
            }

            if section != 13 || group != 2 {
                return None;
            }
            return Some(ParsedMidi::UpdateNameChar {
                channel: channel_index,
                char_index,
                char: char_str,
            });
        }

        // --- EQ PARSING (elements: 32=InputEQ, 33=InputEQ, 46=BusEQ group=1, 60=AUXEQ, 82=StereoEQ) ---
        let eq_map: std::collections::HashMap<u8, &str> = [
            (32, "kInput"),
            (33, "kInput"),
            (46, "kBus"),
            (60, "kAUX"),
            (82, "kStereo"),
        ]
        .into_iter()
        .collect();

        if eq_map.contains_key(&element) && parameter <= 15 && group == 1 {
            let eq_keys = [
                "kEQMode",    // 0
                "kEQLowQ",    // 1
                "kEQLowF",    // 2
                "kEQLowG",    // 3
                "kEQHPFOn",   // 4
                "kEQLowMidQ", // 5
                "kEQLowMidF", // 6
                "kEQLowMidG", // 7
                "kEQHiMidQ",  // 8
                "kEQHiMidF",  // 9
                "kEQHiMidG",  // 10
                "kEQHiQ",     // 11
                "kEQHiF",     // 12
                "kEQHiG",     // 13
                "kEQLPFOn",   // 14
                "kEQOn",      // 15
            ];
            let key = eq_keys[parameter as usize];
            let prefix = eq_map[&element];
            let value = if key.ends_with('G') {
                bytes_to_signed(data_bytes) as f64
            } else {
                bytes_to_fader(data_bytes) as f64
            };

            let global_ch: usize = match prefix {
                "kAUX" => 36 + channel,
                "kBus" => 44 + channel,
                "kStereo" => 52,
                _ => {
                    if (32..=39).contains(&channel) {
                        60 + (channel - 32)
                    } else {
                        channel
                    }
                }
            };

            return Some(ParsedMidi::ControlChange {
                msg_type: format!("{}EQ/{}", prefix, key),
                channel: global_ch,
                value,
            });
        }

        // --- GATE PARSING (element 30) ---
        if element == 30 {
            let gate_keys = [
                "kGateOn",
                "kGateLink",
                "kGateKeyIn",
                "kGateKeyAUX",
                "kGateKeyCh",
                "kGateType",
                "kGateAttack",
                "kGateRange",
                "kGateHold",
                "kGateDecay",
                "kGateThreshold",
            ];
            if (parameter as usize) < gate_keys.len() {
                let key = gate_keys[parameter as usize];
                let value = if key == "kGateThreshold" || key == "kGateRange" {
                    bytes_to_signed(data_bytes) as f64
                } else if key == "kGateOn" || key == "kGateLink" {
                    if bytes_to_on(data_bytes) {
                        1.0
                    } else {
                        0.0
                    }
                } else {
                    bytes_to_fader(data_bytes) as f64
                };
                return Some(ParsedMidi::ControlChange {
                    msg_type: format!("kInputGate/{}", key),
                    channel,
                    value,
                });
            }
        }

        // --- COMP PARSING (elements: 31=Input, 45=Bus, 59=AUX, 71=Matrix, 81=Stereo) ---
        let comp_map: std::collections::HashMap<u8, &str> = [
            (31, "kInput"),
            (45, "kBus"),
            (59, "kAUX"),
            (71, "kMatrix"),
            (81, "kStereo"),
        ]
        .into_iter()
        .collect();

        if comp_map.contains_key(&element) {
            let comp_keys = [
                "kCompLocComp",
                "kCompOn",
                "kCompLink",
                "kCompType",
                "kCompAttack",
                "kCompRelease",
                "kCompRatio",
                "kCompGain",
                "kCompKnee",
                "kCompThreshold",
            ];
            if (parameter as usize) < comp_keys.len() {
                let key = comp_keys[parameter as usize];
                let prefix = comp_map[&element];
                let value = if key == "kCompThreshold" {
                    bytes_to_signed(data_bytes) as f64
                } else if key == "kCompOn" || key == "kCompLink" {
                    if bytes_to_on(data_bytes) {
                        1.0
                    } else {
                        0.0
                    }
                } else {
                    bytes_to_fader(data_bytes) as f64
                };

                let global_ch = match prefix {
                    "kAUX" => 36 + channel,
                    "kBus" => 44 + channel,
                    "kMatrix" => 52 + channel,
                    "kStereo" => 0,
                    _ => channel,
                };

                return Some(ParsedMidi::ControlChange {
                    msg_type: format!("{}Comp/{}", prefix, key),
                    channel: global_ch,
                    value,
                });
            }
        }

        // --- BUS ASSIGN (element 34) ---
        if element == 34 {
            if parameter == 0 {
                return Some(ParsedMidi::ControlChange {
                    msg_type: "kInputBus/kStereo".to_string(),
                    channel,
                    value: if bytes_to_on(data_bytes) { 1.0 } else { 0.0 },
                });
            }
            if (3..=10).contains(&parameter) {
                return Some(ParsedMidi::ControlChange {
                    msg_type: format!("kInputBus/kBus{}", parameter - 2),
                    channel,
                    value: if bytes_to_on(data_bytes) { 1.0 } else { 0.0 },
                });
            }
        }

        // --- FX TYPE & PARAMS (Section 127, Group 1, Element 88) ---
        // Special format: address has an extra slot-index byte after the 4-byte address
        if section == 127 && group == 1 && element == 88 {
            let slot = channel; // message[8] is actually the slot index (0-3)
            if parameter == 49 {
                let fx_type_id = bytes_to_fader(data_bytes) as u32;
                return Some(ParsedMidi::FxTypeUpdate { slot, fx_type_id });
            } else {
                let val = bytes_to_fader(data_bytes) as f64;
                return Some(ParsedMidi::FxParamUpdate {
                    slot,
                    param: parameter as usize,
                    value: val,
                });
            }
        }

        // --- SCENE (Section 127, Group 1) ---
        if section == 127 && group == 1 {
            if element == 0 && parameter == 0 {
                let val = *data_bytes.last().unwrap_or(&0);
                return Some(ParsedMidi::SceneNumber(val));
            }
            if element == 1 && parameter <= 15 {
                let char_code = *data_bytes.last().unwrap_or(&32);
                let char_str = String::from_utf8_lossy(&[char_code]).to_string();
                return Some(ParsedMidi::UpdateSceneChar {
                    char_index: parameter as usize,
                    char: char_str,
                });
            }
        }

        // --- SCENE NUMBER (Section 13 fallback) ---
        if section == 13 && group == 4 && element == 10 && parameter == 0 {
            let val = *data_bytes.last().unwrap_or(&0);
            return Some(ParsedMidi::SceneNumber(val));
        }

        // --- ST IN channel remap for faders/on ---
        let mut final_ch = channel;
        if (32..=39).contains(&channel) {
            final_ch = 60 + (channel - 32);
        }

        // Input Faders / On / Attenuator
        if element == 28 {
            return cc(
                "kInputFader/kFader",
                final_ch,
                bytes_to_fader(data_bytes) as f64,
            );
        }
        if element == 26 {
            return cc(
                "kInputChannelOn/kChannelOn",
                final_ch,
                if bytes_to_on(data_bytes) { 1.0 } else { 0.0 },
            );
        }
        if element == 29 {
            return cc(
                "kInputAttenuator/kAtt",
                final_ch,
                bytes_to_signed(data_bytes) as f64,
            );
        }

        // Bus Attenuator
        if element == 44 {
            return cc(
                "kBusAttenuator/kAtt",
                channel,
                bytes_to_signed(data_bytes) as f64,
            );
        }

        // AUX Attenuator
        if element == 58 {
            return cc(
                "kAUXAttenuator/kAtt",
                channel,
                bytes_to_signed(data_bytes) as f64,
            );
        }

        // Matrix Attenuator
        if element == 70 {
            return cc(
                "kMatrixAttenuator/kAtt",
                channel,
                bytes_to_signed(data_bytes) as f64,
            );
        }

        // Stereo (Master) Attenuator
        if element == 80 && parameter == 0 {
            return cc(
                "kStereoAttenuator/kAtt",
                0,
                bytes_to_signed(data_bytes) as f64,
            );
        }

        // Mix (AUX) Master Faders / ON
        if element == 57 {
            return cc(
                "kAUXFader/kFader",
                channel,
                bytes_to_fader(data_bytes) as f64,
            );
        }
        if element == 54 {
            return cc(
                "kAUXChannelOn/kChannelOn",
                channel,
                if bytes_to_on(data_bytes) { 1.0 } else { 0.0 },
            );
        }

        // Bus Master Faders / ON
        if element == 43 {
            return cc(
                "kBusFader/kFader",
                channel,
                bytes_to_fader(data_bytes) as f64,
            );
        }
        if element == 41 {
            return cc(
                "kBusChannelOn/kChannelOn",
                channel,
                if bytes_to_on(data_bytes) { 1.0 } else { 0.0 },
            );
        }

        // Master (Stereo) Fader / ON
        if element == 79 && parameter == 0 {
            return cc("kStereoFader/kFader", 0, bytes_to_fader(data_bytes) as f64);
        }
        if element == 77 && parameter == 0 {
            return cc(
                "kStereoChannelOn/kChannelOn",
                0,
                if bytes_to_on(data_bytes) { 1.0 } else { 0.0 },
            );
        }

        // --- AUX SENDS (element 35) ---
        if element == 35 {
            let aux_idx = (parameter / 3) + 1;
            let offset = parameter % 3;
            if offset == 0 {
                return cc(
                    &format!("kInputAUX/kAUX{}On", aux_idx),
                    channel,
                    if bytes_to_on(data_bytes) { 1.0 } else { 0.0 },
                );
            }
            if offset == 2 {
                return cc(
                    &format!("kInputAUX/kAUX{}Level", aux_idx),
                    channel,
                    bytes_to_fader(data_bytes) as f64,
                );
            }
        }

        // --- SOLO (group 3, element 46=Input, 47=Output) ---
        if group == 3 {
            if element == 46 {
                let mut mapped_ch = channel;
                if (32..=39).contains(&channel) {
                    mapped_ch = 60 + (channel - 32);
                }
                return cc(
                    "kSetupSoloChOn/kSoloChOn",
                    mapped_ch,
                    if bytes_to_on(data_bytes) { 1.0 } else { 0.0 },
                );
            } else if element == 47 {
                let mut mapped_ch = channel;
                if (0..=7).contains(&channel) {
                    mapped_ch = channel + 48; // Bus 1..8
                } else if (8..=15).contains(&channel) {
                    mapped_ch = channel + 32; // Mix 1..8 (8 + 32 = 40)
                }
                return cc(
                    "kSetupSoloChOn/kSoloChOn",
                    mapped_ch,
                    if bytes_to_on(data_bytes) { 1.0 } else { 0.0 },
                );
            }
        }

        // --- PATCH (section 13, group 2) ---
        if section == 13 && group == 2 {
            let val = bytes_to_fader(data_bytes) as f64;
            let param_msb = parameter as usize;
            let param_lsb = channel; // Remember, in parse_message, `parameter` is message[7] and `channel` is message[8] as usize

            if element == 1 {
                // kChannelIn: MSB=0, LSB=chIdx
                if param_msb == 0 {
                    if is_output_patch_active() {
                        return Some(ParsedMidi::FxOutputUpdate {
                            element: element as usize,
                            channel: param_lsb,
                            value: val,
                        });
                    }
                    return cc("kChannelInput/kChannelIn", param_lsb, val);
                }
            } else if element == 2 {
                // kInsertIn: MSB=0, LSB=chIdx
                if param_msb == 0 {
                    if is_output_patch_active() {
                        return Some(ParsedMidi::FxOutputUpdate {
                            element: element as usize,
                            channel: param_lsb,
                            value: val,
                        });
                    }
                    println!(
                        "DEBUG kInsertIn: param_lsb={} val={} bytes={:?}",
                        param_lsb, val, data_bytes
                    );
                    return cc("kChannelInsertIn/kInsertIn", param_lsb, val);
                }
            } else if element == 3 {
                if param_msb <= 1 && param_lsb <= 3 {
                    // kEffectInput: param_msb=LR(0=L,1=R), param_lsb=slot(0-3)
                    let idx = param_lsb * 2 + param_msb;
                    return cc("kEffectInput/kEffectIn", idx, val);
                } else if param_msb == 0 {
                    // kOutputPatch/kFx: param_msb=0, param_lsb=port(0-7)
                    return cc("kOutputPatch/kFx", param_lsb, val);
                }
            } else if element == 5 {
                // Element 5 can be SLOT (LSB=0) or ADAT (LSB=1)
                // For these, MSB is the port index!
                if param_lsb == 0 {
                    return cc("kOutputPatch/kSlot", param_msb, val);
                } else if param_lsb == 1 {
                    return cc("kOutputPatch/kAdat", param_msb, val);
                }
            } else if element == 6 {
                // kOmni: MSB=0, LSB=0..3
                if param_msb == 0 {
                    return cc("kOutputPatch/kOmni", param_lsb, val);
                }
            } else if element == 12 {
                // k2tr: MSB=0, LSB=0..1
                if param_msb == 0 {
                    return cc("kOutputPatch/k2tr", param_lsb, val);
                }
            } else if [1, 2, 7, 8, 10].contains(&element) && param_msb == 0 {
                // FX output patch: each destination has a value telling which FX output slot connects
                return Some(ParsedMidi::FxOutputUpdate {
                    element: element as usize,
                    channel: param_lsb,
                    value: val,
                });
            }
        }

        // --- PAIR ---
        // Input pair: element 24, parameter 0
        if element == 24 && parameter == 0 {
            let val = *data_bytes.last().unwrap_or(&0);
            return cc("kInputPair/kPair", channel, val as f64);
        }
        // Bus pair: element 39, parameter 0 (section 127, group 1)
        if element == 39 && parameter == 0 {
            let val = *data_bytes.last().unwrap_or(&0);
            return cc("kBusPair/kPair", channel, val as f64);
        }
        // AUX/Mix pair: element 52, parameter 0 (section 127, group 1)
        if element == 52 && parameter == 0 {
            let val = *data_bytes.last().unwrap_or(&0);
            return cc("kAUXPair/kPair", channel, val as f64);
        }

        // --- INSERT ON / LOCATION (element 25) ---
        if element == 25 {
            let val = *data_bytes.last().unwrap_or(&0) as f64;
            if parameter == 0 {
                return cc("kInputInsert/kInsertOn", channel, val);
            } else if parameter == 2 {
                return cc("kInputInsert/kInsertLocInsert", channel, val);
            }
        }

        // --- BUS INSERT ON / LOCATION (element 40) ---
        if element == 40 {
            let val = *data_bytes.last().unwrap_or(&0) as f64;
            if parameter == 0 {
                return cc("kBusInsert/kInsertOn", channel, val);
            } else if parameter == 2 {
                return cc("kBusInsert/kInsertLocInsert", channel, val);
            }
        }

        // --- BUS TO STEREO (element 50) ---
        if element == 50 {
            let val = *data_bytes.last().unwrap_or(&0) as f64;
            if parameter == 0 {
                return cc("kBusToStereo/kBusToStereoOn", channel, val);
            }
        }
    }

    None
}

pub fn cc(msg_type: &str, channel: usize, value: f64) -> Option<ParsedMidi> {
    Some(ParsedMidi::ControlChange {
        msg_type: msg_type.to_string(),
        channel,
        value,
    })
}

pub fn build_name_request(channel: u8, char_index: u8) -> Option<Vec<u8>> {
    let (element, local_ch) = name_channel_mapping(channel);
    let parameter = 4 + char_index;
    let mut packet = vec![
        HEADER[0], HEADER[1], 0x30, MODEL_ID, 13, 2, element, parameter, local_ch,
    ];
    packet.extend_from_slice(FOOTER);
    Some(packet)
}

pub fn build_name_change(channel: u8, char_index: u8, char_code: u8) -> Vec<Vec<u8>> {
    let (element, local_ch) = name_channel_mapping(channel);
    let mut packets = Vec::with_capacity(2);

    // Short Name
    let mut packet_short = vec![
        HEADER[0], HEADER[1], 0x10, MODEL_ID, 13, 2, element, char_index, local_ch, 0, 0, 0,
        char_code,
    ];
    packet_short.extend_from_slice(FOOTER);
    packets.push(packet_short);

    // Long Name
    let mut packet_long = vec![
        HEADER[0],
        HEADER[1],
        0x10,
        MODEL_ID,
        13,
        2,
        element,
        4 + char_index,
        local_ch,
        0,
        0,
        0,
        char_code,
    ];
    packet_long.extend_from_slice(FOOTER);
    packets.push(packet_long);

    packets
}

fn name_channel_mapping(channel: u8) -> (u8, u8) {
    if (60..=67).contains(&channel) {
        (23, (channel - 60) / 2)
    } else if (36..=43).contains(&channel) {
        (16, channel - 36)
    } else if (44..=51).contains(&channel) {
        (15, channel - 44)
    } else if channel == 52 {
        (18, 0)
    } else {
        (4, channel)
    }
}
