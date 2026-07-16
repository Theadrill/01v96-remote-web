use midir::{MidiInput, MidiInputConnection, MidiOutput, MidiOutputConnection};
use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::PathBuf;
use std::sync::mpsc;
use std::time::{Duration, Instant};

const LOG_PATH: &str = "log/fx_output_test_log.txt";

fn project_root() -> PathBuf {
    let mut p = std::env::current_exe()
        .ok()
        .and_then(|p| p.parent().map(|p| p.to_path_buf()))
        .unwrap_or_else(|| PathBuf::from("."));
    p.pop();
    p.pop();
    p
}

fn log_path() -> PathBuf { project_root().join(LOG_PATH) }

const HEADER: [u8; 2] = [0xF0, 0x43];
const MODEL_ID: u8 = 0x3E;
const PARAM_REQUEST: u8 = 0x30;
const PARAM_CHANGE: u8 = 0x10;

const FX_SECTION: u8 = 0x0D;
const FX_GROUP: u8 = 0x02;

struct MidiAssembler {
    buffer: Vec<u8>,
    in_sysex: bool,
}

impl MidiAssembler {
    fn new() -> Self {
        Self { buffer: Vec::new(), in_sysex: false }
    }

    fn process_input(&mut self, raw: &[u8]) -> Vec<Vec<u8>> {
        let mut out = Vec::new();
        for &b in raw {
            if b == 0xF0 {
                self.buffer.clear();
                self.buffer.push(0xF0);
                self.in_sysex = true;
                continue;
            }
            if !self.in_sysex { continue; }
            if b == 0xFE || b == 0xFD || b == 0xF8 { continue; }
            self.buffer.push(b);
            if b == 0xF7 {
                out.push(std::mem::take(&mut self.buffer));
                self.in_sysex = false;
            }
        }
        out
    }

    fn reset(&mut self) {
        self.buffer.clear();
        self.in_sysex = false;
    }
}

fn log_msg(log: &mut fs::File, msg: &str) {
    let ts = format!("[{:?}] ", Instant::now().elapsed());
    let line = format!("{}{}\n", ts, msg);
    print!("{}", line);
    let _ = log.write_all(line.as_bytes());
    let _ = log.flush();
}

fn hex_bytes(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{:02X}", b)).collect::<Vec<_>>().join(" ")
}

fn decode_value(data: &[u8]) -> u32 {
    let mut val: u32 = 0;
    for &d in data {
        val = (val << 7) | (d as u32);
    }
    val
}

fn is_fx_slot(val: u32) -> bool {
    matches!(val, 121..=140)
}

fn fx_output_slot_label(val: u32) -> String {
    match val {
        0 => "OFF".into(),
        1 => "BUS1".into(),
        2 => "BUS2".into(),
        3 => "BUS3".into(),
        4 => "BUS4".into(),
        5 => "BUS5".into(),
        6 => "BUS6".into(),
        7 => "BUS7".into(),
        8 => "BUS8".into(),
        9 => "ST L".into(),
        10 => "ST R".into(),
        11 => "MATRIX1".into(),
        12 => "MATRIX2".into(),
        13 => "MATRIX3".into(),
        14 => "MATRIX4".into(),
        15 => "MATRIX5".into(),
        16 => "MATRIX6".into(),
        17 => "MATRIX7".into(),
        18 => "MATRIX8".into(),
        121 => "FX1 Out1".into(),
        122 => "FX1 Out2".into(),
        129 => "FX2 Out1".into(),
        130 => "FX2 Out2".into(),
        137 => "FX3 Out1".into(),
        138 => "FX3 Out2".into(),
        139 => "FX4 Out1".into(),
        140 => "FX4 Out2".into(),
        _ => format!("?{}", val),
    }
}

fn dest_label(element: u8, channel: u8) -> String {
    match element {
        1 => {
            if channel < 32 {
                format!("CH{}", channel + 1)
            } else if channel < 40 {
                let stereo_idx = channel - 32;
                let stin_num = stereo_idx / 2 + 1;
                let lr = if stereo_idx % 2 == 0 { "L" } else { "R" };
                format!("STIN{}{}", stin_num, lr)
            } else {
                format!("EL1_{}", channel)
            }
        }
        2 => format!("INSCH{}", channel + 1),
        3 => format!("FX_IN_{}", channel),
        7 => format!("INSBUS{}", channel + 1),
        8 => format!("INSAUX{}", channel + 1),
        10 => {
            if channel == 0 { "MASTER L".into() }
            else if channel == 1 { "MASTER R".into() }
            else { format!("EL10_{}", channel) }
        }
        _ => format!("EL{}_{}", element, channel),
    }
}

fn build_output_patch_request(element: u8, param: u8, channel: u8) -> Vec<u8> {
    vec![
        HEADER[0], HEADER[1],
        PARAM_REQUEST, MODEL_ID,
        FX_SECTION, FX_GROUP, element,
        param,
        channel,
        0xF7,
    ]
}

fn is_response_for(pkt: &[u8], element: u8, param: u8, channel: u8) -> bool {
    pkt.len() >= 10
        && pkt[0] == 0xF0
        && pkt[1] == 0x43
        && (pkt[2] & 0xF0) == PARAM_CHANGE
        && pkt[3] == MODEL_ID
        && pkt[4] == FX_SECTION
        && pkt[5] == FX_GROUP
        && pkt[6] == element
        && pkt[7] == param
        && pkt[8] == channel
}

fn pause_and_exit(msg: &str) -> ! {
    eprintln!("\n{}", msg);
    eprintln!("Pressione Enter para fechar...");
    let _ = std::io::stdin().read_line(&mut String::new());
    std::process::exit(1);
}

struct QueryTarget {
    element: u8,
    param: u8,
    channel: u8,
}

fn main() {
    println!("╔══════════════════════════════════════════════╗");
    println!("║  01V96 — FX Output Patch Query               ║");
    println!("║  Lê destinos do output patch (destination-    ║");
    println!("║  indexed). Element 1=CH/STIN, 2=INSCH,       ║");
    println!("║  3=FX_IN, 7=INSBUS                           ║");
    println!("║  Enter = repetir  |  Esc = fechar            ║");
    println!("╚══════════════════════════════════════════════╝\n");

    let log_p = log_path();
    if let Some(parent) = log_p.parent() {
        if let Err(e) = fs::create_dir_all(parent) {
            pause_and_exit(&format!("Falha ao criar {}: {}", parent.display(), e));
        }
    }
    let mut log = match OpenOptions::new().create(true).append(true).open(&log_p) {
        Ok(f) => f,
        Err(e) => pause_and_exit(&format!("Falha ao abrir {}: {}", log_p.display(), e)),
    };

    log_msg(&mut log, "═══════════════════════════════════════════");
    log_msg(&mut log, "FX Output Patch Query — início");
    log_msg(&mut log, "═══════════════════════════════════════════");

    let midi_in = match MidiInput::new("01V96 FX OutPatch In") {
        Ok(m) => m,
        Err(e) => pause_and_exit(&format!("Falha ao criar MidiInput: {}", e)),
    };
    let midi_out = match MidiOutput::new("01V96 FX OutPatch Out") {
        Ok(m) => m,
        Err(e) => pause_and_exit(&format!("Falha ao criar MidiOutput: {}", e)),
    };

    let in_ports = midi_in.ports();
    let out_ports = midi_out.ports();

    println!("── Portas MIDI de Entrada ──");
    for (i, p) in in_ports.iter().enumerate() {
        let name = midi_in.port_name(p).unwrap_or("?".into());
        println!("  [{}] {}", i, name);
    }
    println!("\n── Portas MIDI de Saída ──");
    for (i, p) in out_ports.iter().enumerate() {
        let name = midi_out.port_name(p).unwrap_or("?".into());
        println!("  [{}] {}", i, name);
    }

    if in_ports.is_empty() || out_ports.is_empty() {
        eprintln!("\n✗ Nenhuma porta MIDI encontrada!");
        return;
    }

    let find_port_in = |ports: &[midir::MidiInputPort]| -> Option<usize> {
        for (i, p) in ports.iter().enumerate() {
            let name = midi_in.port_name(p).unwrap_or_default().to_lowercase();
            if name.contains("yamaha") { return Some(i); }
        }
        for (i, p) in ports.iter().enumerate() {
            let name = midi_in.port_name(p).unwrap_or_default().to_lowercase();
            if name.contains("loop") { return Some(i); }
        }
        None
    };

    let find_port_out = |ports: &[midir::MidiOutputPort]| -> Option<usize> {
        for (i, p) in ports.iter().enumerate() {
            let name = midi_out.port_name(p).unwrap_or_default().to_lowercase();
            if name.contains("yamaha") { return Some(i); }
        }
        for (i, p) in ports.iter().enumerate() {
            let name = midi_out.port_name(p).unwrap_or_default().to_lowercase();
            if name.contains("loop") { return Some(i); }
        }
        None
    };

    let in_idx = find_port_in(&in_ports).unwrap_or_else(|| {
        print!("\nDigite o índice da porta IN: ");
        std::io::Write::flush(&mut std::io::stdout()).ok();
        let mut buf = String::new();
        std::io::stdin().read_line(&mut buf).ok();
        buf.trim().parse().expect("Índice inválido")
    });

    let out_idx = find_port_out(&out_ports).unwrap_or_else(|| {
        print!("Digite o índice da porta OUT: ");
        std::io::Write::flush(&mut std::io::stdout()).ok();
        let mut buf = String::new();
        std::io::stdin().read_line(&mut buf).ok();
        buf.trim().parse().expect("Índice inválido")
    });

    {
        let name_in = midi_in.port_name(&in_ports[in_idx]).unwrap_or("?".into());
        let name_out = midi_out.port_name(&out_ports[out_idx]).unwrap_or("?".into());
        println!("\n▶ Porta IN:  [{}] {}", in_idx, name_in);
        println!("▶ Porta OUT: [{}] {}", out_idx, name_out);
    }

    let (tx, rx) = mpsc::channel::<Vec<u8>>();

    let mut out_conn: MidiOutputConnection = match midi_out
        .connect(&out_ports[out_idx], "01V96 FX OutPatch Out")
    {
        Ok(c) => c,
        Err(e) => pause_and_exit(&format!("Falha ao conectar OUT: {}", e)),
    };

    let _in_conn: MidiInputConnection<()> = match midi_in
        .connect(&in_ports[in_idx], "01V96 FX OutPatch In",
            move |_stamp, msg, _| { let _ = tx.send(msg.to_vec()); },
            (),
        )
    {
        Ok(c) => c,
        Err(e) => pause_and_exit(&format!("Falha ao conectar IN: {}", e)),
    };

    log_msg(&mut log, &format!("Conectado IN:[{}] OUT:[{}]", in_idx, out_idx));
    println!("\n✔ Conectado!\n");

    let targets: Vec<QueryTarget> = vec![
        // Element 1: CH1-32 (channels 0-31) + STIN1-8 (channels 32-39)
        (1..=39u8).map(|ch| QueryTarget { element: 1, param: 0, channel: ch }).collect::<Vec<_>>(),
        // Element 2: INSCH1-32 (channels 0-31)
        (0..=31u8).map(|ch| QueryTarget { element: 2, param: 0, channel: ch }).collect::<Vec<_>>(),
        // Element 7: INSBUS1-8 (channels 0-7)
        (0..=7u8).map(|ch| QueryTarget { element: 7, param: 0, channel: ch }).collect::<Vec<_>>(),
        // Element 10: Master L/R (channels 0-1)
        vec![QueryTarget { element: 10, param: 0, channel: 0 },
             QueryTarget { element: 10, param: 0, channel: 1 }],
    ].into_iter().flatten().collect();

    let mut assembler = MidiAssembler::new();
    let mut round = 0u32;

    loop {
        round += 1;
        assembler.reset();

        println!("═══════════════════════════════════════════");
        println!("  Rodada #{}", round);
        println!("═══════════════════════════════════════════\n");

        log_msg(&mut log, &format!("── Rodada #{} ──", round));

        let mut results: Vec<(u8, u8, u8, u32, String)> = Vec::new();
        let mut responded = 0u32;

        for t in &targets {
            let req = build_output_patch_request(t.element, t.param, t.channel);
            if let Err(e) = out_conn.send(&req) {
                log_msg(&mut log, &format!("✗ EL{} P{} CH{}: {}", t.element, t.param, t.channel, e));
                continue;
            }

            let deadline = Instant::now() + Duration::from_millis(1500);
            let mut found = false;
            while Instant::now() < deadline && !found {
                if let Ok(raw) = rx.recv_timeout(Duration::from_millis(200)) {
                    let packets = assembler.process_input(&raw);
                    for pkt in packets {
                        if !is_response_for(&pkt, t.element, t.param, t.channel) { continue; }
                        let data = &pkt[9..pkt.len() - 1];
                        let val = decode_value(data);
                        let label = fx_output_slot_label(val);
                        let dest = dest_label(t.element, t.channel);

                        if val != 0 && is_fx_slot(val) {
                            log_msg(&mut log, &format!(
                                "← [{}] = {} RAW: {}",
                                dest, label, hex_bytes(&pkt)
                            ));
                            println!("  {} = {}", dest, label);
                            results.push((t.element, t.param, t.channel, val, dest.clone()));
                        }
                        responded += 1;
                        found = true;
                    }
                }
            }
            if !found {
                log_msg(&mut log, &format!("  ✗ [{}] sem resposta",
                    dest_label(t.element, t.channel)));
            }
        }

        println!("\n╔══════════════════════════════════════════╗");
        println!("║       FX OUTPUT PATCH — DESTINOS         ║");
        println!("╠══════════════════════════════════════════╣");

        if results.is_empty() {
            println!("║  Nenhum destino conectado (tudo OFF)     ║");
        } else {
            for (_el, _p, _ch, val, dest) in &results {
                println!("║  {:<12} = {:<24} ║", dest, fx_output_slot_label(*val));
            }
        }

        println!("╠══════════════════════════════════════════╣");
        println!("║  Respostas recebidas: {:<19}║", format!("{}/{}", responded, targets.len()));
        println!("╚══════════════════════════════════════════╝");

        log_msg(&mut log, &format!(
            "Resumo: {}/{} respondidos, {} com valor != 0",
            responded, targets.len(), results.len()
        ));

        println!("\n  [Enter] = repetir  |  [Esc] = fechar");

        use std::io::Read;
        let stdin = std::io::stdin();
        let mut handle = stdin.lock();
        let mut buf = [0u8; 2];
        match handle.read(&mut buf) {
            Ok(n) => {
                for i in 0..n {
                    if buf[i] == 0x1B {
                        println!("\nEncerrando...");
                        log_msg(&mut log, "Fim");
                        return;
                    }
                }
            }
            _ => return,
        }
    }
}
