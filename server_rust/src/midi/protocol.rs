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
