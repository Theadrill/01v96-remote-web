use lazy_static::lazy_static;
use std::collections::HashMap;

lazy_static! {
    pub static ref COMMAND_BYTES: HashMap<String, [u8; 4]> = {
        let json_str = include_str!("dictionary.json");
        serde_json::from_str(json_str).expect("Failed to parse dictionary.json")
    };
}

pub const HEADER: &[u8] = &[240, 67]; // F0 43
pub const MODEL_ID: u8 = 62;          // 3E
pub const FOOTER: &[u8] = &[247];     // F7

pub enum Converter {
    Fader,
    Signed,
    Signed14,
    On,
    DynOn,
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
        Converter::Signed14 => {
            let mut v = value.round() as i64;
            if v < 0 {
                v += 0x4000;
            }
            vec![((v >> 7) & 0x7F) as u8, (v & 0x7F) as u8]
        }
        Converter::On => {
            let is_on = value > 0.0;
            vec![0, 0, 0, if is_on { 1 } else { 0 }]
        }
        Converter::DynOn => {
            let is_on = value > 0.0;
            vec![0, 0, 0, if is_on { 0 } else { 1 }]
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
    let mut val: i64 = 0;
    for &b in bytes {
        val = (val << 7) | (b as i64);
    }
    let num_bits = bytes.len() * 7;
    let sign_bit = 1 << (num_bits - 1);
    let mask = (1 << num_bits) - 1;
    if (val & sign_bit) != 0 {
        val -= mask + 1;
    }
    val
}

pub fn bytes_to_on(bytes: &[u8]) -> bool {
    *bytes.last().unwrap_or(&0) != 0
}

pub fn bytes_to_dyn_on(bytes: &[u8]) -> bool {
    *bytes.last().unwrap_or(&1) == 0
}

pub fn build_change(command_name: &str, channel: u8, value: f64, converter: Converter) -> Option<Vec<u8>> {
    let coords = COMMAND_BYTES.get(command_name)?;
    let mut packet = Vec::with_capacity(16);
    packet.extend_from_slice(HEADER);
    packet.push(0x10); // Parameter Change
    packet.push(MODEL_ID);
    
    packet.push(coords[0]);
    packet.push(coords[1]);
    packet.push(coords[2]);
    packet.push(coords[3] + channel);

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
    
    packet.push(coords[0]);
    packet.push(coords[1]);
    packet.push(coords[2]);
    packet.push(coords[3] + channel);
    
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
        
        // Test DynOn (inverted logic)
        assert_eq!(convert_to_bytes(1.0, &Converter::DynOn), vec![0, 0, 0, 0]);
        assert_eq!(convert_to_bytes(0.0, &Converter::DynOn), vec![0, 0, 0, 1]);
    }
}
#[derive(Debug, Clone, serde::Serialize)]
pub enum ParsedMidi {
    ControlChange { msg_type: String, channel: usize, value: f64 },
    MeterData { is_master: bool, group: u8, levels: std::collections::HashMap<usize, u8> },
    SceneNumber(u8),
    UpdateNameChar { channel: usize, char_index: usize, char: String },
    UpdateSceneChar { char_index: usize, char: String },
}

pub fn parse_message(message: &[u8]) -> Option<ParsedMidi> {
    if message.len() < 8 { return None; }
    
    // Ignora se não for uma mensagem de dados/mudança (0x1n).
    if (message[2] & 0xF0) != 0x10 { return None; }

    let group = message[5];
    let element = message[6];
    let parameter = message[7];
    let channel = message[8] as usize;

    let is_master_meter = message.len() == 14 && message[4] == 13 && message[5] == 33 && message[6] == 4;
    let is_universal_meter = message.len() > 20 && (message[4] == 13 || message[4] == 26 || message[4] == 127) && (group == 33 || group == 32 || group == 82);

    if is_master_meter || is_universal_meter {
        let mut levels = std::collections::HashMap::new();
        let data_start = 9;
        let is_master = message[6] == 4;
        let data_bytes_available = (message.len() - 1).saturating_sub(data_start);
        let num_channels = data_bytes_available / 2;

        for i in 0..num_channels {
            let idx = data_start + (i * 2);
            levels.insert(channel + i, message[idx]);
        }
        return Some(ParsedMidi::MeterData { is_master, group, levels });
    }

    if message[4] == 13 && message[5] == 127 { return None; }

    let data_bytes = &message[9..message.len()-1];
    
    if message[4] == 13 || message[4] == 127 || message[4] == 26 || message[4] == 1 {
        // Nomes de canais
        if [4, 15, 16, 18, 23].contains(&element) && parameter >= 4 && parameter <= 19 {
            let char_index = (parameter - 4) as usize;
            let char_code = *data_bytes.last().unwrap_or(&32);
            let char_str = String::from_utf8_lossy(&[char_code]).to_string();
            
            let mut channel_index = channel;
            if element == 4 { channel_index = channel; }
            else if element == 23 { channel_index = 60 + (channel * 2); }
            else if element == 16 { channel_index = 36 + channel; }
            else if element == 15 { channel_index = 44 + channel; }
            else if element == 18 { channel_index = 52; }
            
            if message[4] != 13 || group != 2 { return None; }
            return Some(ParsedMidi::UpdateNameChar { channel: channel_index, char_index, char: char_str });
        }
        
        // Faders / On / Solo / Name / Attenuator etc
        let mut final_ch = channel;
        if channel >= 32 && channel <= 39 { final_ch = 60 + (channel - 32); }
        
        if element == 28 { return Some(ParsedMidi::ControlChange { msg_type: "kInputFader/kFader".to_string(), channel: final_ch, value: bytes_to_fader(data_bytes) as f64 }); }
        if element == 26 { return Some(ParsedMidi::ControlChange { msg_type: "kInputChannelOn/kChannelOn".to_string(), channel: final_ch, value: if bytes_to_on(data_bytes) { 1.0 } else { 0.0 } }); }
        
        // Mix (AUX) Master Faders / ON
        if element == 57 { return Some(ParsedMidi::ControlChange { msg_type: "kAUXFader/kFader".to_string(), channel, value: bytes_to_fader(data_bytes) as f64 }); }
        if element == 54 { return Some(ParsedMidi::ControlChange { msg_type: "kAUXChannelOn/kChannelOn".to_string(), channel, value: if bytes_to_on(data_bytes) { 1.0 } else { 0.0 } }); }
        
        // Bus Master Faders / ON
        if element == 43 { return Some(ParsedMidi::ControlChange { msg_type: "kBusFader/kFader".to_string(), channel, value: bytes_to_fader(data_bytes) as f64 }); }
        if element == 41 { return Some(ParsedMidi::ControlChange { msg_type: "kBusChannelOn/kChannelOn".to_string(), channel, value: if bytes_to_on(data_bytes) { 1.0 } else { 0.0 } }); }
        
        // Master (Stereo) Fader e ON
        if element == 79 && parameter == 0 { return Some(ParsedMidi::ControlChange { msg_type: "kStereoFader/kFader".to_string(), channel: 0, value: bytes_to_fader(data_bytes) as f64 }); }
        if element == 77 && parameter == 0 { return Some(ParsedMidi::ControlChange { msg_type: "kStereoChannelOn/kChannelOn".to_string(), channel: 0, value: if bytes_to_on(data_bytes) { 1.0 } else { 0.0 } }); }
    }
    
    None
}
