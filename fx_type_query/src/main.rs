use midir::{MidiInput, MidiInputConnection, MidiOutput, MidiOutputConnection};
use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::PathBuf;
use std::sync::mpsc;
use std::time::{Duration, Instant};

const LOG_PATH: &str = "log/fx_input_test_log.txt";

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

const FX_INPUT_SECTION: u8 = 0x0D;
const FX_INPUT_GROUP: u8 = 0x02;
const FX_INPUT_ELEMENT: u8 = 0x03;

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

fn fx_input_label(val: u32) -> String {
    match val {
        0   => "OFF".into(),
        // Aux Send 1-8 (1-8) — confirmado: id=1 = Aux 1
        1..=8 => format!("AUX{}", val),
        // Channel inserts (13-44) — confirmado: id=14 = Insert CH2
        13..=44 => format!("INS CH{}", val - 12),
        // Insert Bus 1-4 (109-112) — confirmado via mixer
        109 => "INS BUS1".into(),
        110 => "INS BUS2".into(),
        111 => "INS BUS3".into(),
        112 => "INS BUS4".into(),
        // Insert Return L/R (113-116)
        113 => "INS RET1 L".into(),
        114 => "INS RET1 R".into(),
        115 => "INS RET2 L".into(),
        116 => "INS RET2 R".into(),
        // Aux Send 1-8 (117-124) — confirmado: id=117 = Insert Aux 1
        117 => "INS AUX1".into(),
        118 => "INS AUX2".into(),
        119 => "INS AUX3".into(),
        120 => "INS AUX4".into(),
        121 => "INS AUX5".into(),
        122 => "INS AUX6".into(),
        123 => "INS AUX7".into(),
        124 => "INS AUX8".into(),
        // Insert ST-L / ST-R — confirmado via mixer (master L/R)
        137 => "INS ST-L".into(),
        138 => "INS ST-R".into(),
        _ => format!("??? (id={})", val),
    }
}

fn build_fx_input_request(slot: u8, lr: u8) -> Vec<u8> {
    vec![
        HEADER[0], HEADER[1],
        PARAM_REQUEST, MODEL_ID,
        FX_INPUT_SECTION, FX_INPUT_GROUP, FX_INPUT_ELEMENT,
        lr,
        slot,
        0xF7,
    ]
}

fn is_fx_input_response(pkt: &[u8]) -> bool {
    pkt.len() >= 10
        && pkt[0] == 0xF0
        && pkt[1] == 0x43
        && (pkt[2] & 0xF0) == PARAM_CHANGE
        && pkt[3] == MODEL_ID
        && pkt[4] == FX_INPUT_SECTION
        && pkt[5] == FX_INPUT_GROUP
        && pkt[6] == FX_INPUT_ELEMENT
}

fn pause_and_exit(msg: &str) -> ! {
    eprintln!("\n{}", msg);
    eprintln!("Pressione Enter para fechar...");
    let _ = std::io::stdin().read_line(&mut String::new());
    std::process::exit(1);
}

fn main() {
    println!("╔══════════════════════════════════════════════╗");
    println!("║  01V96 — FX Input Query (apenas inputs)     ║");
    println!("║  Consulta origem dos 4 FX (L/R cada)        ║");
    println!("║  Enter = repetir  |  Esc = fechar           ║");
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
    log_msg(&mut log, "FX Input Query — início");
    log_msg(&mut log, "═══════════════════════════════════════════");

    let midi_in = match MidiInput::new("01V96 FX Input In") {
        Ok(m) => m,
        Err(e) => pause_and_exit(&format!("Falha ao criar MidiInput: {}", e)),
    };
    let midi_out = match MidiOutput::new("01V96 FX Input Out") {
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

    // Auto-detect: prefer "yamaha" (directa na mesa), depois "loop"
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
        .connect(&out_ports[out_idx], "01V96 FX Input Out")
    {
        Ok(c) => c,
        Err(e) => pause_and_exit(&format!("Falha ao conectar OUT: {}", e)),
    };

    let _in_conn: MidiInputConnection<()> = match midi_in
        .connect(&in_ports[in_idx], "01V96 FX Input In",
            move |_stamp, msg, _| { let _ = tx.send(msg.to_vec()); },
            (),
        )
    {
        Ok(c) => c,
        Err(e) => pause_and_exit(&format!("Falha ao conectar IN: {}", e)),
    };

    log_msg(&mut log, &format!("Conectado IN:[{}] OUT:[{}]", in_idx, out_idx));
    println!("\n✔ Conectado!\n");

    let mut assembler = MidiAssembler::new();
    let mut round = 0u32;

    loop {
        round += 1;
        assembler.reset();

        println!("═══════════════════════════════════════════");
        println!("  Rodada #{}", round);
        println!("═══════════════════════════════════════════\n");

        log_msg(&mut log, &format!("── Rodada #{} ──", round));

        // Enviar 1 query por vez, aguardar resposta antes da próxima
        let mut responses: Vec<(u8, u8, u32, Vec<u8>)> = Vec::new();
        let mut total_received = 0u32;

        for slot in 0u8..4 {
            for lr in 0u8..2 {
                let lr_label = if lr == 0 { "L" } else { "R" };
                let req = build_fx_input_request(slot, lr);
                log_msg(&mut log, &format!("→ FX{} {} REQ: {}", slot + 1, lr_label, hex_bytes(&req)));
                if let Err(e) = out_conn.send(&req) {
                    log_msg(&mut log, &format!("✗ Falha FX{} {}: {}", slot + 1, lr_label, e));
                    continue;
                }

                // Aguardar até 2s por esta resposta específica
                let deadline = Instant::now() + Duration::from_secs(2);
                let mut found = false;
                while Instant::now() < deadline && !found {
                    if let Ok(raw) = rx.recv_timeout(Duration::from_millis(200)) {
                        let packets = assembler.process_input(&raw);
                        for pkt in packets {
                            if !is_fx_input_response(&pkt) {
                                continue;
                            }
                            total_received += 1;
                            let r_slot = pkt[8];
                            let r_lr = pkt[7];
                            if r_slot == slot && r_lr == lr {
                                let data = &pkt[9..pkt.len() - 1];
                                let val = decode_value(data);
                                let label = fx_input_label(val);
                                log_msg(&mut log, &format!(
                                    "← FX{} {} = {} (id={}) RAW: {}",
                                    slot + 1, lr_label, label, val, hex_bytes(&pkt)
                                ));
                                println!("  FX{} Input {} = {} (id={})",
                                    slot + 1, lr_label, label, val);
                                responses.push((slot, lr, val, pkt.clone()));
                                found = true;
                            }
                        }
                    }
                }
                if !found {
                    log_msg(&mut log, &format!("  ✗ FX{} {} — sem resposta", slot + 1, lr_label));
                    println!("  FX{} Input {} = ⚠ SEM RESPOSTA", slot + 1, lr_label);
                }
            }
        }

        // Resumo
        println!("\n╔══════════════════════════════════════════╗");
        println!("║         RESUMO — FX INPUTS               ║");
        println!("╠══════════════════════════════════════════╣");

        let mut found = [[false; 2]; 4];
        for (slot, lr, _val, _) in &responses {
            let s = *slot as usize;
            let l = *lr as usize;
            if s < 4 && l < 2 {
                found[s][l] = true;
            }
        }

        for slot in 0..4u8 {
            for lr in 0..2u8 {
                let lr_label = if lr == 0 { "L" } else { "R" };
                if let Some((_, _, val, _)) = responses.iter().find(|(s, l, _, _)| *s == slot && *l == lr) {
                    println!("║  FX{} In {} = {:<26} ║", slot + 1, lr_label, fx_input_label(*val));
                } else {
                    println!("║  FX{} In {} = ⚠ SEM RESPOSTA                ║", slot + 1, lr_label);
                }
            }
        }

        println!("╠══════════════════════════════════════════╣");
        println!("║  Respostas recebidas: {:<19}║", format!("{}/8", responses.len()));
        println!("║  Total Sysex ignorados: {:<16}║", "???");
        println!("╚══════════════════════════════════════════╝");

        log_msg(&mut log, &format!(
            "Resumo: {}/8 respostas, {} total packets filtrados",
            responses.len(), total_received
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
