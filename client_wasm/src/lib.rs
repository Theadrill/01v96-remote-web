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
