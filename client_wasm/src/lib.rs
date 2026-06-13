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
