pub fn build_aux_msg(reset_flag: u8, source_ch: u8, target_ch: u8) -> Vec<u8> {
    vec![
        0xF0, 0x43, 0x10, 0x3E, 0x7F, 0x11, reset_flag, 0x00, source_ch, 0x00, target_ch, 0xF7,
    ]
}

pub fn build_state_msg(ch_byte: u8, state: u8) -> Vec<u8> {
    vec![
        0xF0, 0x43, 0x10, 0x3E, 0x7F, 0x01, 0x18, 0x00, ch_byte, 0x00, 0x00, 0x00, state, 0xF7,
    ]
}

fn get_ch_byte(ch_a: u8, ch_b: u8) -> u8 {
    ch_a.min(ch_b)
}

pub fn build_pair(ch_a: u8, ch_b: u8, source_ch: u8) -> (Vec<u8>, Vec<u8>) {
    let target_ch = if source_ch == ch_a { ch_b } else { ch_a };
    let ch_byte = get_ch_byte(ch_a, ch_b);
    (
        build_aux_msg(0x00, source_ch, target_ch),
        build_state_msg(ch_byte, 0x01),
    )
}

pub fn build_unpair(ch_a: u8, ch_b: u8) -> Vec<u8> {
    let ch_byte = get_ch_byte(ch_a, ch_b);
    build_state_msg(ch_byte, 0x00)
}

pub fn build_reset(ch_a: u8, ch_b: u8) -> (Vec<u8>, Vec<u8>) {
    let ch_byte = get_ch_byte(ch_a, ch_b);
    (
        build_aux_msg(0x01, ch_a, ch_b),
        build_state_msg(ch_byte, 0x01),
    )
}
