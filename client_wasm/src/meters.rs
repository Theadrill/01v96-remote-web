use wasm_bindgen::prelude::*;

/// Motor físico dos medidores.
/// Guarda o estado (nível atual) de cada canal para poder aplicar
/// a balística (Attack instantâneo, Release suave) entre os frames.
#[wasm_bindgen]
pub struct MeterEngine {
    num_channels: usize,
    current_levels: Vec<f32>,
    target_levels: Vec<f32>,
    decay_rate: f32, // O quanto a barra cai por milissegundo
}

#[wasm_bindgen]
impl MeterEngine {
    #[wasm_bindgen(constructor)]
    pub fn new(num_channels: usize) -> Self {
        Self {
            num_channels,
            current_levels: vec![0.0; num_channels],
            target_levels: vec![0.0; num_channels],
            decay_rate: 0.003, // Queda suave padrão
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

    /// Extrai níveis de um pacote SysEx bruto (simplificação temporária).
    /// Depois integraremos com o midi_common verdadeiro.
    #[wasm_bindgen]
    pub fn processar_pacote_sysex(&mut self, raw_data: &[u8]) {
        // Exemplo: assumindo que cada byte é um canal normalizado (0-127)
        // Isso será substituído pela extração real baseada no protocolo da 01v96
        for (i, &byte) in raw_data.iter().enumerate() {
            if i < self.num_channels {
                let t = (byte as f32) / 127.0;
                self.target_levels[i] = t;
                if t > self.current_levels[i] {
                    self.current_levels[i] = t;
                }
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
