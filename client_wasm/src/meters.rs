use wasm_bindgen::prelude::*;
use midi_common::assembler::MidiAssembler;

/// Motor físico dos medidores.
/// Guarda o estado (nível atual) de cada canal para poder aplicar
/// a balística (Attack instantâneo, Release suave) entre os frames.
#[wasm_bindgen]
pub struct MeterEngine {
    num_channels: usize,
    current_levels: Vec<f32>,
    target_levels: Vec<f32>,
    current_raw_steps: Vec<u8>,
    decay_rate: f32, // O quanto a barra cai por milissegundo
    assembler: MidiAssembler,
    input_calibration: Vec<f32>,
    master_calibration: Vec<f32>,
}

#[wasm_bindgen]
impl MeterEngine {
    #[wasm_bindgen(constructor)]
    pub fn new(num_channels: usize) -> Self {
        Self {
            num_channels,
            current_levels: vec![0.0; num_channels],
            target_levels: vec![0.0; num_channels],
            current_raw_steps: vec![0; num_channels],
            decay_rate: 0.003, // Queda suave padrão
            assembler: MidiAssembler::new(),
            input_calibration: vec![0.0; 33],
            master_calibration: vec![0.0; 33],
        }
    }

    /// Recebe as tabelas de calibração pre-calculadas do JS (0 a 32 steps)
    #[wasm_bindgen]
    pub fn set_calibration_tables(&mut self, inputs: &[f32], master: &[f32]) {
        if inputs.len() >= 33 {
            self.input_calibration.copy_from_slice(&inputs[..33]);
        }
        if master.len() >= 33 {
            self.master_calibration.copy_from_slice(&master[..33]);
        }
    }

    #[wasm_bindgen]
    pub fn get_raw_step(&self, ch: usize) -> u8 {
        if ch < self.num_channels {
            self.current_raw_steps[ch]
        } else {
            0
        }
    }

    /// Permite ao JS configurar o tempo de queda
    #[wasm_bindgen]
    pub fn set_decay_rate(&mut self, rate: f32) {
        self.decay_rate = rate;
    }

    /// Atualiza os valores "alvo" de onde o medidor deve chegar.
    /// Se o novo valor for maior que o atual (Attack), ele sobe instantaneamente.
    #[wasm_bindgen]
    pub fn update_targets(&mut self, targets: &[f32]) {
        for (i, &t) in targets.iter().enumerate() {
            if i < self.num_channels {
                self.target_levels[i] = t;
                // Attack é instantâneo (peak hold manual simplificado)
                if t > self.current_levels[i] {
                    self.current_levels[i] = t;
                }
            }
        }
    }

    /// Extrai níveis de um pacote SysEx bruto, alimentado via stream/websockets.
    #[wasm_bindgen]
    pub fn processar_pacote_sysex(&mut self, raw_data: &[u8]) {
        let messages = self.assembler.process_input(raw_data);
        for msg in messages {
            self.parse_meter_message(&msg);
        }
    }

    fn parse_meter_message(&mut self, message: &[u8]) {
        if message.len() < 8 {
            return;
        }

        if (message[2] & 0xF0) != 0x10 {
            return;
        }

        let section = message[4];
        let group = message[5];
        let element = message[6];
        let _parameter = message[7];
        let channel = message[8] as usize;

        let is_master_meter = message.len() == 14 && section == 13 && group == 33 && element == 4;
        let is_universal_meter = message.len() > 20
            && (section == 13 || section == 26 || section == 127)
            && (group == 33 || group == 32 || group == 82);

        if is_master_meter || is_universal_meter {
            let data_start = 9;
            let data_bytes_available = (message.len() - 1).saturating_sub(data_start);
            let num_channels = data_bytes_available / 2;

            if is_master_meter {
                // Simplificacao temporaria. Na Yamaha, 32 eh o master.
                let step = message[9].min(32) as usize;
                let val = self.master_calibration[step];
                self.set_target(32, val);
                if 32 < self.num_channels {
                    self.current_raw_steps[32] = step as u8;
                }
                return;
            }

            for i in 0..num_channels {
                let idx = data_start + (i * 2);
                let step = message[idx].min(32) as usize;
                let val = self.input_calibration[step];

                let mut target_ch = None;
                if group == 33 && element == 1 {
                    let ch = 42 + channel + i;
                    if (42..=49).contains(&ch) { target_ch = Some(ch); }
                } else if group == 33 && element == 2 {
                    let ch = 34 + channel + i;
                    if (34..=41).contains(&ch) { target_ch = Some(ch); }
                } else if group == 33 && element == 0 && _parameter == 0 && channel == 32 {
                    let ch = 60 + i;
                    if (60..=67).contains(&ch) { target_ch = Some(ch); }
                } else if group == 33 && element == 0 && _parameter == 5 && channel == 32 {
                    let ch = 68 + i;
                    if (68..=75).contains(&ch) { target_ch = Some(ch); }
                } else {
                    let base_ch = match group {
                        33 => channel,
                        32 => 32 + channel,
                        82 => 32 + channel,
                        _ => channel,
                    };
                    target_ch = Some(base_ch + i);
                }

                if let Some(ch) = target_ch {
                    // Protege contra mapeamentos que excedam o num_channels (ex: 72 no index.html)
                    if ch < self.num_channels {
                        self.set_target(ch, val);
                        self.current_raw_steps[ch] = step as u8;
                    }
                }
            }
        }
    }

    fn set_target(&mut self, ch: usize, t: f32) {
        if ch < self.num_channels {
            self.target_levels[ch] = t;
            if t > self.current_levels[ch] {
                self.current_levels[ch] = t;
            }
        }
    }

    /// Chamado pelo JS a 60fps dentro do requestAnimationFrame.
    /// Retorna as alturas exatas de cada barra para aquele milissegundo.
    #[wasm_bindgen]
    pub fn render_frame(&mut self, delta_time_ms: f64) -> Vec<f32> {
        let decay = self.decay_rate * (delta_time_ms as f32);
        for i in 0..self.num_channels {
            // Se o nível atual for maior que o alvo, aplique o Release (queda)
            if self.current_levels[i] > self.target_levels[i] {
                self.current_levels[i] -= decay;
                // Não deixa cair abaixo do alvo
                if self.current_levels[i] < self.target_levels[i] {
                    self.current_levels[i] = self.target_levels[i];
                }
            }
        }
        self.current_levels.clone()
    }
}
