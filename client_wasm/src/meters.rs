use wasm_bindgen::prelude::*;

/// Motor físico dos medidores.
/// Guarda o estado (nível atual) de cada canal para poder aplicar
/// a balística (Attack instantâneo, Release suave) entre os frames.
#[wasm_bindgen]
pub struct MeterEngine {
    // Em breve: Armazenaremos o nível de pico (peak), nível atual (RMS/display) e timestamps
    // para aplicar a física de decaimento logarítmico independentemente da taxa de chegada dos dados.
    num_channels: usize,
}

#[wasm_bindgen]
impl MeterEngine {
    #[wasm_bindgen(constructor)]
    pub fn new(num_channels: usize) -> Self {
        Self { num_channels }
    }

    /// Recebe o pacote bruto de SysEx (Uint8Array no JS) e atualiza o estado interno
    #[wasm_bindgen]
    pub fn processar_pacote_sysex(&mut self, _raw_data: &[u8]) {
        // Todo: Usar as structs do midi_common para parsear _raw_data
        // e registrar os novos picos recebidos.
    }

    /// Chamado pelo JS a 60fps dentro do requestAnimationFrame.
    /// Retorna as alturas exatas de cada barra para aquele milissegundo.
    #[wasm_bindgen]
    pub fn render_frame(&mut self, _delta_time_ms: f64) -> Vec<f32> {
        // Todo: Aplicar a curva de decaimento e retornar
        // o array com as alturas para o JS desenhar.
        vec![0.0; self.num_channels]
    }
}
