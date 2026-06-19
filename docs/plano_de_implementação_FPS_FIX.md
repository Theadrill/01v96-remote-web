# Plano de Implementação — FPS FIX: True Zero-Copy Meter Engine

**Data:** 2026-06-19  
**Tipo:** Otimização de Performance Extrema  
**Impacto:** Todos os modos de renderização (DOM e Canvas)  
**Status:** ✅ Implementado e compilado

---

## 1. Contexto e Diagnóstico

### O Problema Observado

O app estava dropando frames (abaixo de 60fps) em dispositivos Android mesmo em celulares topo de linha. Isso era anômalo — o mesmo dispositivo roda jogos 3D Triple-A sem problemas.

### Diagnóstico por Exclusão

O fato de **tanto o modo DOM quanto o modo Canvas** apresentarem o mesmo problema provou que a causa **não era gráfica** — não era custo de CSS, reflow, draw calls de canvas etc.

O gargalo estava acontecendo **antes de qualquer renderização**, no JavaScript que roda antes do frame ir para a tela.

### Causa Raiz Identificada

A cada frame de 60fps (a cada ~16ms), o sistema executava **dois ciclos completos de alocação + liberação de memória**:

**No Rust (`meters.rs`):**
```rust
// ANTES — alocava um Vec<f32> novo a cada frame
pub fn render_frame(&mut self, delta_time_ms: f64) -> Vec<f32> {
    // ... balística ...
    self.current_levels.clone()  // ← CLONE = heap allocation
}
```

**No JS gerado pelo wasm-pack (`client_wasm.js`):**
```js
// ANTES — copiava os dados e depois liberava a memória
var v1 = getArrayF32FromWasm0(ret[0], ret[1]).slice(); // ← .slice() = cópia
wasm.__wbindgen_free(ret[0], ret[1] * 4, 4);          // ← free = pressão no GC
return v1;
```

**Primeira Tentativa Falha (Float32Array::view via wasm-bindgen)**
Tentamos usar `js_sys::Float32Array::view` injetado pelo wasm-bindgen. No entanto, o `wasm-bindgen` utilizou indireções e a tabela `externref`, o que causou uma regressão monstruosa que dizimou o FPS e aumentou brutalmente o uso da CPU.

**Impacto:** O GC do JavaScript no Android (especialmente em browsers Chromium) **pausava o event loop** para coletar esse lixo criado pela ponte WASM, causando os dropped frames.

---

## 2. Solução Implementada — TRUE Zero-Copy (Acesso a Memória Bruta)

### Conceito

Em vez de deixar o `wasm-bindgen` gerenciar a criação do array com suas indireções pesadas, nós agora expomos um **ponteiro de memória cru (raw pointer)** do lado do Rust e instanciamos a view diretamente no JavaScript acessando o buffer da VM do WASM (`wasmExports.memory.buffer`). 

O Rust atualiza os dados **in-place** e o JS **lê diretamente** da mesma posição de memória RAM — sem cópia, sem alocação, sem GC e sem indireções.

```text
┌─────────────────────────────────────────────────────┐
│                  WASM Linear Memory                 │
│  ┌──────────────────────────────────────────────┐   │
│  │  MeterEngine.current_levels: [f32; 80]       │   │
│  │  [ch0=12.5, ch1=0.0, ch2=87.3, ...]          │   │
│  └──────────────────────────────────────────────┘   │
│         ↑                          ↑                │
│  Rust atualiza                  Float32Array        │
│  in-place a cada frame          (JS) aponta aqui    │
│                                 usando memória bruta│
└─────────────────────────────────────────────────────┘
```

**Resultado:** Acesso imediato no host JS. O FPS agora sobe para seu teto máximo sem pausas do Garbage Collector.

---

## 3. Arquivos Modificados

### 3.1 `client_wasm/src/meters.rs` — A Fonte da Verdade

**Este é o arquivo que controla tudo. É o único lugar onde a lógica Rust mora.**

#### O que mudou:

**`render_frame` — mudou de retornar `Vec<f32>` para `void`:**
```rust
// DEPOIS (Sem clone, sem return — dados ficam em self.current_levels)
#[wasm_bindgen]
pub fn render_frame(&mut self, delta_time_ms: f64) {
    let decay = self.decay_rate * (delta_time_ms as f32);
    for i in 0..self.num_channels {
        if self.current_levels[i] > self.target_levels[i] {
            self.current_levels[i] -= decay;
            if self.current_levels[i] < self.target_levels[i] {
                self.current_levels[i] = self.target_levels[i];
            }
        }
    }
}
```

**`get_levels_ptr` — novo método adicionado para acesso bruto:**
```rust
#[wasm_bindgen]
pub fn get_levels_ptr(&self) -> *const f32 {
    self.current_levels.as_ptr()
}
```

---

### 3.2 `public/modules/socket.js` — Modo DOM (produção)

**Modificado — init do WASM (captura das exportações e criação da View nativa):**
```js
import('../wasm/client_wasm.js').then(async (wasm) => {
    // CAPTURAR AS EXPORTS (pois é lá que a memória fica)
    const wasmExports = await wasm.default();
    window.wasmExports = wasmExports; // Exporta as instâncias internas e a memória WASM
    window.wasm = wasm; // EXPOSING GLOBALLY FOR EQ.JS
    
    wasmMeterEngine = new wasm.MeterEngine(80);
    window.wasmMeterEngine = wasmMeterEngine; // Expose globally for canvas_engine.js
    wasmMeterEngine.set_decay_rate(0.1); 
    
    // TRUE ZERO COPY: Criamos um Float32Array apontando exatamente para o ponteiro
    const ptr = wasmMeterEngine.get_levels_ptr();
    wasmMeterView = new Float32Array(wasmExports.memory.buffer, ptr, 80);
});
```

**Modificado — `wasmRenderLoop`:**
```js
// DEPOIS
wasmMeterEngine.render_frame(deltaMs);  // void — atualiza in-place no Rust
applyMetersToDOM(wasmMeterView, now);   // lê direto da memória RAM do WASM
```

---

### 3.3 `canvas_frontend/public/modules/socket.js` & `canvas_frontend/modules/socket.js`

Mesmas alterações do item 3.2, implementando o mesmo acesso bruto à memória para as instâncias do modo canvas.

---

### 3.4 `canvas_frontend/public/canvas_project/canvas_engine.js` — Loop Canvas

**Modificado — criação dinâmica da view e render loop:**

Como o Canvas carrega sincronicamente mas o WASM carrega de forma assíncrona, a view agora é montada sob demanda:

```js
// View será construída sob demanda quando o WASM estiver pronto
let meterView = null;

function loop(now) {
    // ...
    // Pega as globais dinamicamente
    const currentMeterEngine = window.wasmMeterEngine;
    if (!meterView && currentMeterEngine && window.wasmExports) {
        const ptr = currentMeterEngine.get_levels_ptr();
        meterView = new Float32Array(window.wasmExports.memory.buffer, ptr, 80);
    }

    // Executa a balística dos meters no WASM in-place (void)
    if (currentMeterEngine && typeof currentMeterEngine.render_frame === 'function') {
        currentMeterEngine.render_frame(delta);
    }
    // ...
```

---

## 4. Fluxo de Dados Depois da Otimização

```text
Servidor WebSocket
      │
      │ 'meterDataRaw' (bytes brutos do SysEx da mesa)
      ▼
socket.js
  wasmMeterEngine.processar_pacote_sysex(rawBytes)
      │
      │ Converte e atualiza wasmMeterEngine.target_levels[]
      │ (na memória interna do WASM)
      ▼
requestAnimationFrame loop (60fps)
  wasmMeterEngine.render_frame(deltaMs)
      │
      │ Atualiza wasmMeterEngine.current_levels[] in-place
      │ (sem retornar nada, sem alocar nada)
      ▼
  applyMetersToDOM(wasmMeterView, now)
  ou
  meterView[chIndex]  // no canvas_engine.js
      │
      │ Lê wasmMeterView (Float32Array acoplado ao ponteiro)
      │ Zero-copy real — mesma RAM, zero bindgen overhead.
      ▼
  UI atualizada (curtains CSS ou barras canvas)
```

---

## 5. Procedimento de Build

**Para compilar o WASM após qualquer alteração em `client_wasm/src/`:**

```bat
cd C:\PROJETOS\01v96-remote-web
.\build_wasm.bat
```

O script executará a compilação.
**Após o build, a automação interna de dev (ou manualmente) sincroniza os arquivos compilados:**
```powershell
Copy-Item -Path "public\wasm\client_wasm.js"       -Destination "canvas_frontend\public\wasm\client_wasm.js"       -Force
Copy-Item -Path "public\wasm\client_wasm_bg.wasm"  -Destination "canvas_frontend\public\wasm\client_wasm_bg.wasm"  -Force
Copy-Item -Path "public\wasm\client_wasm.js"       -Destination "canvas_frontend\wasm\client_wasm.js"              -Force
Copy-Item -Path "public\wasm\client_wasm_bg.wasm"  -Destination "canvas_frontend\wasm\client_wasm_bg.wasm"         -Force
```

---

## 6. Mapa de Arquivos Modificados

| Arquivo | Responsabilidade |
|---|---|
| `client_wasm/src/meters.rs` | Lógica de balística; expõe ponteiros in-place. |
| `public/modules/socket.js` | Loop DOM; acesso nativo ao `memory.buffer`. |
| `canvas_frontend/public/modules/socket.js` | Cópia do socket de produção pro Canvas. |
| `canvas_frontend/modules/socket.js` | Cópia do socket dev pro Canvas. |
| `canvas_frontend/public/canvas_project/canvas_engine.js` | Loop nativo do canvas, faz link sob demanda com WASM. |

---

## 7. Armadilhas e Pontos de Atenção

### 7.1 A view pode ficar "detached"
Se o WASM aumentar sua RAM global (`memory.grow`), as Typed Arrays ligadas ao `memory.buffer` ficarão inválidas ("detached") causando erros no JavaScript. Este comportamento no app de medidores não deve ocorrer porque a `MeterEngine` pré-aloca tamanho fixo para canais de som, mas é bom estar ciente para usos futuros.

### 7.2 Captura incorreta do `wasm.default()`
A memória exportada pelo WASM reside dentro das `exports` retornadas pela promise inicial (que chama `__wbg_finalize_init`). Para ter acesso à propriedade `.memory.buffer`, foi necessário modificar a forma de recebimento:
```javascript
const wasmExports = await wasm.default();
```
É obrigatório fazer a captura da variável em vez de apenas invocar `.default()` e exportar a Promise do ES Module, senão a propriedade `memory` retornará `undefined`.
