use super::protocol::{ParsedMidi, FOOTER, HEADER, MODEL_ID};

const PAN_SECTION: u8 = 0x7F;
const PAN_GROUP: u8 = 0x01;
const PAN_ELEMENT: u8 = 0x1B;
const PAN_PARAM: u8 = 0x00;
const MASTER_ELEMENT: u8 = 0x4E;
const MASTER_PARAM: u8 = 0x00;

pub fn pan_value_to_bytes(pan_value: f64) -> Vec<u8> {
    let v = pan_value.round().clamp(-63.0, 63.0) as i64;
    if v >= 0 {
        return vec![0x00, 0x00, 0x00, (v & 0x7F) as u8];
    }
    let raw = 0x10000000 + v;
    vec![
        ((raw >> 21) & 0x7F) as u8,
        ((raw >> 14) & 0x7F) as u8,
        ((raw >> 7) & 0x7F) as u8,
        (raw & 0x7F) as u8,
    ]
}

pub fn bytes_to_pan_value(bytes: &[u8]) -> f64 {
    if bytes.len() < 4 {
        return 0.0;
    }
    let raw = ((bytes[0] as i64 & 0x7F) << 21)
        | ((bytes[1] as i64 & 0x7F) << 14)
        | ((bytes[2] as i64 & 0x7F) << 7)
        | (bytes[3] as i64 & 0x7F);
    let sign_bit = 1 << 27;
    let mask = (1 << 28) - 1;
    let signed = if (raw & sign_bit) != 0 { raw - mask - 1 } else { raw };
    signed.clamp(-63, 63) as f64
}

pub fn global_channel_to_pan_index(global_channel: i64) -> Option<PanTarget> {
    if global_channel == 52 {
        return Some(PanTarget::Master);
    }
    let ch = global_channel;
    if (0..=31).contains(&ch) {
        return Some(PanTarget::Input(ch as usize));
    }
    if (60..=67).contains(&ch) {
        let st_idx = ((ch - 60) / 2) as usize;
        return Some(PanTarget::Input(0x20 + st_idx * 2));
    }
    None
}

pub enum PanTarget {
    Input(usize),
    Master,
}

pub fn build_pan_change(channel: i64, pan_value: f64) -> Option<Vec<u8>> {
    let target = global_channel_to_pan_index(channel)?;
    let bytes = pan_value_to_bytes(pan_value);
    let mut packet = Vec::with_capacity(14);
    packet.extend_from_slice(HEADER);
    packet.push(0x10);
    packet.push(MODEL_ID);

    match target {
        PanTarget::Input(ch_idx) => {
            packet.push(PAN_SECTION);
            packet.push(PAN_GROUP);
            packet.push(PAN_ELEMENT);
            packet.push(PAN_PARAM);
            packet.push(ch_idx as u8);
        }
        PanTarget::Master => {
            packet.push(PAN_SECTION);
            packet.push(PAN_GROUP);
            packet.push(MASTER_ELEMENT);
            packet.push(MASTER_PARAM);
            packet.push(0x01);
        }
    }
    packet.extend_from_slice(&bytes);
    packet.extend_from_slice(FOOTER);
    Some(packet)
}

pub fn build_pan_request(channel: i64) -> Option<Vec<u8>> {
    let target = global_channel_to_pan_index(channel)?;
    let mut packet = Vec::with_capacity(11);
    packet.extend_from_slice(HEADER);
    packet.push(0x30);
    packet.push(MODEL_ID);

    match target {
        PanTarget::Input(ch_idx) => {
            packet.push(PAN_SECTION);
            packet.push(PAN_GROUP);
            packet.push(PAN_ELEMENT);
            packet.push(PAN_PARAM);
            packet.push(ch_idx as u8);
        }
        PanTarget::Master => {
            packet.push(PAN_SECTION);
            packet.push(PAN_GROUP);
            packet.push(MASTER_ELEMENT);
            packet.push(MASTER_PARAM);
            packet.push(0x01);
        }
    }
    packet.extend_from_slice(FOOTER);
    Some(packet)
}

pub fn parse_pan_message(message: &[u8]) -> Option<ParsedMidi> {
    if message.len() != 14 {
        return None;
    }
    if message[0] != 0xF0 || message[1] != 0x43 || message[2] != 0x10 || message[3] != 0x3E {
        return None;
    }

    let sec = message[4];
    let grp = message[5];
    let elem = message[6];
    let ch_idx = message[8] as usize;
    let data = &message[9..13];
    let pan_value = bytes_to_pan_value(data);

    if sec == PAN_SECTION && grp == PAN_GROUP && elem == PAN_ELEMENT {
        let global_ch = if ch_idx <= 0x1F {
            ch_idx as i64
        } else if ch_idx >= 0x20 && ch_idx <= 0x27 {
            60 + ((ch_idx - 0x20) / 2) as i64
        } else {
            return None;
        };
        return super::protocol::cc("kPan", global_ch as usize, pan_value);
    }

    if sec == PAN_SECTION && grp == PAN_GROUP && elem == MASTER_ELEMENT && ch_idx == 1 {
        return super::protocol::cc("kPan", 52, pan_value);
    }

    None
}

pub fn build_pan_sync_requests() -> Vec<Vec<u8>> {
    let mut requests = Vec::with_capacity(37);
    for ch in 0..=31 {
        if let Some(req) = build_pan_request(ch) {
            requests.push(req);
        }
    }
    for st_global in (60..=66).step_by(2) {
        if let Some(req) = build_pan_request(st_global) {
            requests.push(req);
        }
    }
    if let Some(req) = build_pan_request(52) {
        requests.push(req);
    }
    requests
}
