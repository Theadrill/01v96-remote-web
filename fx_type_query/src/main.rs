use midir::{MidiInput, MidiInputConnection, MidiOutput, MidiOutputConnection};
use serde::Deserialize;
use std::collections::HashMap;
use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::PathBuf;
use std::sync::mpsc;
use std::time::{Duration, Instant};

const LOG_PATH: &str = "log/fx_test_log.txt";
const FX_LIST_FILENAME: &str = "fx_list.json";

// Resolve caminhos relativos à RAIZ do projeto (2 pastas acima do exe em target/release/)
fn project_root() -> PathBuf {
    let mut p = std::env::current_exe()
        .ok()
        .and_then(|p| p.parent().map(|p| p.to_path_buf()))
        .unwrap_or_else(|| PathBuf::from("."));
    p.pop(); // sai de release/
    p.pop(); // sai de target/
    p
}

fn fx_list_path() -> PathBuf { project_root().join(FX_LIST_FILENAME) }
fn log_path() -> PathBuf { project_root().join(LOG_PATH) }

// ─── Yamaha 01V96 SysEx Constants ───
const HEADER: [u8; 2] = [0xF0, 0x43];
const MODEL_ID: u8 = 0x3E;
const PARAM_REQUEST: u8 = 0x30;
const PARAM_CHANGE: u8 = 0x10;

// Endereço do kEffect/kEffectType no dictionary.json
const FX_SECTION: u8 = 0x7F;
const FX_GROUP: u8 = 0x01;
const FX_ELEMENT: u8 = 0x58;
const FX_TYPE_PARAM: u8 = 0x31;

// ─── JSON structures ───
#[derive(Debug, Deserialize)]
struct FxEntry {
    id: u32,
    name: String,
    #[serde(default)]
    read_only: bool,
}

#[derive(Debug, Deserialize)]
struct FxList {
    builtin: Vec<FxEntry>,
    #[serde(default)]
    custom: Vec<FxEntry>,
}

impl FxList {
    fn load(path: &std::path::Path) -> Result<Self, String> {
        let data = fs::read_to_string(path)
            .map_err(|e| format!("Falha ao ler {}: {}", path.display(), e))?;
        serde_json::from_str(&data)
            .map_err(|e| format!("JSON inválido em {}: {}", path.display(), e))
    }

    /// Monta um mapa id→nome a partir de builtin + custom
    fn to_map(&self) -> HashMap<u32, String> {
        let mut m = HashMap::new();
        for e in &self.builtin {
            m.insert(e.id, e.name.clone());
        }
        for e in &self.custom {
            m.insert(e.id, e.name.clone());
        }
        m
    }

    /// Monta um mapa id→read_only
    fn read_only_map(&self) -> HashMap<u32, bool> {
        let mut m = HashMap::new();
        for e in &self.builtin {
            m.insert(e.id, e.read_only);
        }
        for e in &self.custom {
            m.insert(e.id, e.read_only);
        }
        m
    }
}

// ─── SysEx Builder ───
fn build_fx_type_request(slot: u8) -> Vec<u8> {
    vec![
        HEADER[0], HEADER[1],
        PARAM_REQUEST,
        MODEL_ID,
        FX_SECTION, FX_GROUP, FX_ELEMENT, FX_TYPE_PARAM,
        slot,
        0xF7,
    ]
}

// ─── Minimal MidiAssembler ───
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

// ─── Logging ───
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

fn fx_type_name(id: u32, map: &HashMap<u32, String>) -> String {
    map.get(&id)
        .cloned()
        .unwrap_or_else(|| format!("??? (id={})", id))
}

fn pause_and_exit(msg: &str) -> ! {
    eprintln!("\n{}", msg);
    eprintln!("Pressione Enter para fechar...");
    let _ = std::io::stdin().read_line(&mut String::new());
    std::process::exit(1);
}

/// Envia requests para os 4 slots e coleta respostas.
/// Retorna (responses, assembler_state)
fn query_fx_slots(
    out_conn: &mut MidiOutputConnection,
    rx: &mpsc::Receiver<Vec<u8>>,
    assembler: &mut MidiAssembler,
    fx_map: &HashMap<u32, String>,
    log: &mut fs::File,
) -> Vec<(u8, Vec<u8>)> {
    assembler.reset();

    for slot in 0u8..4 {
        let req = build_fx_type_request(slot);
        log_msg(log, &format!("→ FX{} REQUEST: {}", slot + 1, hex_bytes(&req)));
        if let Err(e) = out_conn.send(&req) {
            log_msg(log, &format!("✗ Falha ao enviar FX{}: {}", slot + 1, e));
        }
        std::thread::sleep(Duration::from_millis(100));
    }

    println!("Aguardando respostas da mesa (5 segundos)...\n");
    let deadline = Instant::now() + Duration::from_secs(5);
    let mut responses: Vec<(u8, Vec<u8>)> = Vec::new();

    while Instant::now() < deadline {
        if let Ok(raw) = rx.recv_timeout(Duration::from_millis(200)) {
            let packets = assembler.process_input(&raw);
            for pkt in packets {
                log_msg(log, &format!("← RAW: {}", hex_bytes(&pkt)));

                if pkt.len() >= 10
                    && pkt[0] == 0xF0
                    && pkt[1] == 0x43
                    && (pkt[2] & 0xF0) == PARAM_CHANGE
                    && pkt[3] == MODEL_ID
                    && pkt[4] == FX_SECTION
                    && pkt[5] == FX_GROUP
                    && pkt[6] == FX_ELEMENT
                    && pkt[7] == FX_TYPE_PARAM
                {
                    let slot = pkt[8];
                    let data = &pkt[9..pkt.len() - 1];
                    let val = decode_value(data);
                    let name = fx_type_name(val, fx_map);
                    log_msg(log, &format!(
                        "  ✔ FX{} Type: id={} ({}) | data[{}]: {} | pkt_len={}",
                        slot + 1, val, name, data.len(), hex_bytes(data), pkt.len()
                    ));
                    println!("  [FX{} RAW] pkt_len={} data[{}]: {} → id={} ({})",
                        slot + 1, pkt.len(), data.len(), hex_bytes(data), val, name);
                    responses.push((slot, pkt.clone()));
                }
            }
        }
    }

    responses
}

fn print_summary(responses: &[(u8, Vec<u8>)], fx_list: &FxList, fx_map: &HashMap<u32, String>) {
    let ro_map = fx_list.read_only_map();

    println!("\n╔══════════════════════════════════════════════════════╗");
    println!("║                 RESUMO DOS SLOTS FX                  ║");
    println!("╠══════════════════════════════════════════════════════╣");

    let mut found = [false; 4];
    for (slot, pkt) in responses {
        if (*slot as usize) < 4 {
            let data = &pkt[9..pkt.len() - 1];
            let val = decode_value(data);
            let name = fx_type_name(val, fx_map);
            let tag = match ro_map.get(&val) {
                Some(true)  => "[BUILTIN]",
                Some(false) => "[CUSTOM]",
                None        => "[UNKNOWN]",
            };
            println!("║  FX{} → id={:2} {:<25} {:<11} ║", slot + 1, val, name, tag);
            found[*slot as usize] = true;
        }
    }

    for i in 0..4 {
        if !found[i] {
            println!("║  FX{} → ⚠ SEM RESPOSTA                         ║", i + 1);
        }
    }

    println!("╚══════════════════════════════════════════════════════╝");
}

fn main() {
    println!("╔══════════════════════════════════════════╗");
    println!("║  Yamaha 01V96 — FX Type Query Script     ║");
    println!("║  Consulta o tipo do efeito em cada slot  ║");
    println!("║  Enter = repetir  |  Esc = fechar        ║");
    println!("╚══════════════════════════════════════════╝");
    println!();

    let fx_path = fx_list_path();
    let log_p = log_path();

    // ─── Garantir pasta log/ ───
    if let Some(parent) = log_p.parent() {
        if let Err(e) = fs::create_dir_all(parent) {
            pause_and_exit(&format!("Falha ao criar {}: {}", parent.display(), e));
        }
    }

    let mut log = match OpenOptions::new()
        .create(true)
        .append(true)
        .open(&log_p)
    {
        Ok(f) => f,
        Err(e) => pause_and_exit(&format!("Falha ao abrir {}: {}", log_p.display(), e)),
    };

    log_msg(&mut log, "═══════════════════════════════════════════");
    log_msg(&mut log, "Início da consulta FX Type");
    log_msg(&mut log, "═══════════════════════════════════════════");

    // ─── Listar portas MIDI ───
    let midi_in = match MidiInput::new("01v96 FX Query In") {
        Ok(m) => m,
        Err(e) => pause_and_exit(&format!("Falha ao criar MidiInput: {}", e)),
    };
    let midi_out = match MidiOutput::new("01v96 FX Query Out") {
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
        log_msg(&mut log, "ERRO: Nenhuma porta MIDI encontrada");
        return;
    }

    // Auto-detect portas
    let find_in = |ports: &[midir::MidiInputPort]| -> Option<usize> {
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

    let find_out = |ports: &[midir::MidiOutputPort]| -> Option<usize> {
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

    let in_idx = find_in(&in_ports).unwrap_or_else(|| {
        print!("\nDigite o índice da porta IN: ");
        std::io::Write::flush(&mut std::io::stdout()).ok();
        let mut buf = String::new();
        std::io::stdin().read_line(&mut buf).ok();
        buf.trim().parse().expect("Índice inválido")
    });

    let out_idx = find_out(&out_ports).unwrap_or_else(|| {
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

    // ─── Conectar ───
    let (tx, rx) = mpsc::channel::<Vec<u8>>();

    let mut out_conn: MidiOutputConnection = match midi_out
        .connect(&out_ports[out_idx], "01v96 FX Query Out")
    {
        Ok(c) => c,
        Err(e) => pause_and_exit(&format!("Falha ao conectar porta OUT: {}", e)),
    };

    let _in_conn: MidiInputConnection<()> = match midi_in
        .connect(&in_ports[in_idx], "01v96 FX Query In",
            move |_stamp, msg, _| { let _ = tx.send(msg.to_vec()); },
            (),
        )
    {
        Ok(c) => c,
        Err(e) => pause_and_exit(&format!("Falha ao conectar porta IN: {}", e)),
    };

    log_msg(&mut log, &format!("Conectado IN:[{}] OUT:[{}]", in_idx, out_idx));
    println!("\n✔ Conectado!\n");

    // ─── Loop: Enter = repetir, Esc = sair ───
    let mut assembler = MidiAssembler::new();
    let mut round = 0u32;

    loop {
        round += 1;

        // ─── Recarregar JSON a cada rodada ───
        let fx_list = match FxList::load(&fx_path) {
            Ok(l) => l,
            Err(e) => {
                eprintln!("✗ {}", e);
                log_msg(&mut log, &format!("ERRO ao carregar JSON: {}", e));
                println!("\n  [Enter] = tentar novamente  |  [Esc] = fechar");
                use std::io::Read;
                let mut buf = [0u8; 1];
                if let Ok(1) = std::io::stdin().lock().read(&mut buf) {
                    if buf[0] == 0x1B { break; }
                }
                continue;
            }
        };
        let fx_map = fx_list.to_map();
        println!("Rodada #{} — {} efeitos ({} builtin + {} custom)\n",
            round, fx_map.len(), fx_list.builtin.len(), fx_list.custom.len());

        println!("═══════════════════════════════════════════");
        println!("  Rodada #{}", round);
        println!("═══════════════════════════════════════════\n");

        let responses = query_fx_slots(&mut out_conn, &rx, &mut assembler, &fx_map, &mut log);
        print_summary(&responses, &fx_list, &fx_map);

        log_msg(&mut log, &format!("═══ Resumo rodada #{}: {} respostas ═══", round, responses.len()));
        for (slot, pkt) in &responses {
            let data = &pkt[9..pkt.len() - 1];
            let val = decode_value(data);
            let name = fx_type_name(val, &fx_map);
            log_msg(&mut log, &format!("FX{} → id={} ({})", slot + 1, val, name));
        }

        let missing: Vec<u8> = (0..4).filter(|i| !responses.iter().any(|(s, _)| *s == *i)).collect();
        if !missing.is_empty() {
            log_msg(&mut log, &format!("Sem resposta para FX slots: {:?}", missing));
        }

        println!("\n  [Enter] = repetir  |  [Esc] = fechar");

        // Lê tecla(s) sem precisar de Enter
        // No Windows, Enter gera \r\n (2 bytes num único read)
        use std::io::Read;
        let stdin = std::io::stdin();
        let mut handle = stdin.lock();
        let mut buf = [0u8; 2];
        match handle.read(&mut buf) {
            Ok(n) => {
                for i in 0..n {
                    if buf[i] == 0x1B {
                        println!("\nEncerrando...");
                        return;
                    }
                }
            }
            _ => return,
        }
    }

    log_msg(&mut log, "═══════════════════════════════════════════\n");
    println!("\nLog salvo em: {}", log_p.display());
    println!("Pressione Enter para fechar...");
    let _ = std::io::stdin().read_line(&mut String::new());
}
