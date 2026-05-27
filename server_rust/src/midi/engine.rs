use midir::{MidiInput, MidiInputConnection, MidiOutput, MidiOutputConnection};
use std::sync::Arc;
use tokio::sync::{Mutex, mpsc};
use tracing::{error, info};

use super::assembler::MidiAssembler;

pub struct MidiEngine {
    input_conn: Option<MidiInputConnection<()>>,
    output_conn: Option<MidiOutputConnection>,
    pub current_in_idx: i32,
    pub current_out_idx: i32,
}

impl MidiEngine {
    pub fn new() -> Self {
        Self {
            input_conn: None,
            output_conn: None,
            current_in_idx: -1,
            current_out_idx: -1,
        }
    }

    pub fn get_available_ports() -> (Vec<(usize, String)>, Vec<(usize, String)>) {
        let mut inputs = Vec::new();
        let mut outputs = Vec::new();

        if let Ok(midi_in) = MidiInput::new("01v96 Remote In") {
            for (i, port) in midi_in.ports().iter().enumerate() {
                if let Ok(name) = midi_in.port_name(port) {
                    inputs.push((i, name));
                }
            }
        } else {
            error!("Não foi possível inicializar MidiInput.");
        }

        if let Ok(midi_out) = MidiOutput::new("01v96 Remote Out") {
            for (i, port) in midi_out.ports().iter().enumerate() {
                if let Ok(name) = midi_out.port_name(port) {
                    outputs.push((i, name));
                }
            }
        } else {
            error!("Não foi possível inicializar MidiOutput.");
        }

        (inputs, outputs)
    }

    pub fn connect_ports(
        &mut self,
        in_idx: usize,
        out_idx: usize,
        tx_incoming: mpsc::Sender<Vec<u8>>,
    ) -> Result<String, String> {
        if self.current_in_idx == in_idx as i32 && self.current_out_idx == out_idx as i32 {
            info!("Portas já conectadas ({}, {}). Ignorando re-conexão.", in_idx, out_idx);
            return Ok("Already connected".to_string());
        }

        // Limpa conexões antigas
        self.input_conn = None;
        self.output_conn = None;

        let midi_in = MidiInput::new("01v96 Remote In").map_err(|e| e.to_string())?;
        let midi_out = MidiOutput::new("01v96 Remote Out").map_err(|e| e.to_string())?;

        let in_ports = midi_in.ports();
        let out_ports = midi_out.ports();

        if in_idx >= in_ports.len() {
            return Err(format!("Porta de entrada inválida: {}", in_idx));
        }
        if out_idx >= out_ports.len() {
            return Err(format!("Porta de saída inválida: {}", out_idx));
        }

        let in_port_name = midi_in.port_name(&in_ports[in_idx]).unwrap_or_default();
        let _out_port_name = midi_out.port_name(&out_ports[out_idx]).unwrap_or_default();

        let mut assembler = MidiAssembler::new();
        
        let in_conn = midi_in
            .connect(
                &in_ports[in_idx],
                "01v96 Input",
                move |_stamp, message, _| {
                    // Ignora _stamp, a engine do Windows nativo no midir pode ignorar SysEx
                    // No Rust/midir, a leitura de SysEx já vem pronta em alguns casos, mas
                    // usamos o assembler pra garantir.
                    let complete_messages = assembler.process_input(message);
                    for msg in complete_messages {
                        let tx = tx_incoming.clone();
                        // Send via channel to the async runtime without blocking MIDI thread
                        tokio::spawn(async move {
                            if let Err(e) = tx.send(msg).await {
                                error!("Erro ao enviar mensagem MIDI para processamento: {}", e);
                            }
                        });
                    }
                },
                (),
            )
            .map_err(|e| e.to_string())?;

        let out_conn = midi_out
            .connect(&out_ports[out_idx], "01v96 Output")
            .map_err(|e| e.to_string())?;

        self.input_conn = Some(in_conn);
        self.output_conn = Some(out_conn);
        self.current_in_idx = in_idx as i32;
        self.current_out_idx = out_idx as i32;

        info!("MIDI conectado: IN={}, OUT={}", in_idx, out_idx);

        Ok(in_port_name)
    }

    pub fn send(&mut self, message: &[u8]) {
        if let Some(out) = &mut self.output_conn {
            if let Err(e) = out.send(message) {
                error!("Erro ao enviar mensagem MIDI: {}", e);
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_engine_initialization() {
        let engine = MidiEngine::new();
        assert_eq!(engine.current_in_idx, -1);
        assert_eq!(engine.current_out_idx, -1);
    }
}
