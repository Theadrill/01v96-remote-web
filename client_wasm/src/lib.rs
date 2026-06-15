mod meters;

use wasm_bindgen::prelude::*;

// Esta função é chamada assim que o WASM é instanciado
#[wasm_bindgen(start)]
pub fn main() -> Result<(), JsValue> {
    // Configuração inicial, se necessário (ex: panic hook)
    Ok(())
}

// Uma função simples de teste para garantir que o WASM está funcionando
#[wasm_bindgen]
pub fn ping() -> String {
    "WASM está rodando!".to_string()
}

use std::collections::HashMap;

#[derive(Clone)]
pub struct PendingEvent {
    pub msg_type: String,
    pub channel: i32,
    pub value: f64,
}

#[wasm_bindgen]
pub struct MidiDispatcher {
    throttle_ms: f64,
    last_sent: HashMap<String, f64>,
    pending: HashMap<String, PendingEvent>,
}

#[wasm_bindgen]
impl MidiDispatcher {
    #[wasm_bindgen(constructor)]
    pub fn new(throttle_ms: f64) -> Self {
        Self {
            throttle_ms,
            last_sent: HashMap::new(),
            pending: HashMap::new(),
        }
    }

    #[wasm_bindgen]
    pub fn set_throttle(&mut self, throttle_ms: f64) {
        self.throttle_ms = throttle_ms;
    }

    /// Retorna `true` se o evento deve ser enviado imediatamente (não foi throttled).
    /// Caso contrário, o evento é retido para envio posterior e retorna `false`.
    #[wasm_bindgen]
    pub fn push_event(&mut self, msg_type: &str, channel: i32, value: f64, now_ms: f64) -> bool {
        let key = format!("{}:{}", msg_type, channel);
        if let Some(&last) = self.last_sent.get(&key) {
            if now_ms - last < self.throttle_ms {
                self.pending.insert(key, PendingEvent {
                    msg_type: msg_type.to_string(),
                    channel,
                    value
                });
                return false;
            }
        }
        self.last_sent.insert(key.clone(), now_ms);
        self.pending.remove(&key);
        true
    }

    /// Retorna os eventos pendentes que já podem ser enviados, no formato "type:channel:value"
    #[wasm_bindgen]
    pub fn tick(&mut self, now_ms: f64) -> Vec<String> {
        let mut to_send = Vec::new();
        let mut result = Vec::new();

        for (key, _event) in self.pending.iter() {
            let last = self.last_sent.get(key).copied().unwrap_or(0.0);
            if now_ms - last >= self.throttle_ms {
                to_send.push(key.clone());
            }
        }

        for key in to_send {
            if let Some(event) = self.pending.remove(&key) {
                self.last_sent.insert(key, now_ms);
                // Retorna empacotado como string simples para facilitar o JS
                let encoded = format!("{}:{}:{}", event.msg_type, event.channel, event.value);
                result.push(encoded);
            }
        }

        result
    }
}

use rustfft::{num_complex::Complex, FftPlanner};
use std::sync::Arc;
use rustfft::Fft;

#[wasm_bindgen]
pub struct WasmRta {
    fft: Arc<dyn Fft<f32>>,
}

#[wasm_bindgen]
impl WasmRta {
    #[wasm_bindgen(constructor)]
    pub fn new() -> Self {
        let mut planner = FftPlanner::<f32>::new();
        let fft = planner.plan_fft_forward(4096);
        Self { fft }
    }

    #[wasm_bindgen]
    pub fn process_audio(&self, input: &[f32]) -> js_sys::Float32Array {
        let len = input.len().min(4096);
        let mut buffer: Vec<Complex<f32>> = input[..len]
            .iter()
            .enumerate()
            .map(|(i, &v)| {
                // Hanning window
                let window = 0.5 * (1.0 - (2.0 * std::f32::consts::PI * i as f32 / (len as f32 - 1.0)).cos());
                Complex { re: v * window, im: 0.0 }
            })
            .collect();
            
        while buffer.len() < 4096 {
            buffer.push(Complex { re: 0.0, im: 0.0 });
        }

        self.fft.process(&mut buffer);

        let magnitudes: Vec<f32> = buffer.iter()
            .take(2048)
            .map(|c| c.norm())
            .collect();

        js_sys::Float32Array::from(magnitudes.as_slice())
    }
}
