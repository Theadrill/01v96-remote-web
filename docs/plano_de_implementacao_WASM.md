# Plano de Implementação WASM (Foco Inicial: Meters)

Este documento serve como o guia definitivo e plano de implementação para a adoção gradual de WebAssembly (WASM) no projeto **01v96-remote-web**. O objetivo principal é aliviar o processamento do servidor, entregar visualizações a 60 FPS fluídas no cliente e reaproveitar código Rust (como o `midi_common`) direto no navegador do usuário.

A migração será feita em fases. A **Fase 1** focará exclusivamente nos medidores (Meters).

---

## 1. Análise do Cenário Atual (Meters)

Com base no "pente fino" do código atual, o fluxo dos Meters funciona da seguinte forma:

1. **Backend (`server_rust/src/midi_receiver.rs` e `network/connection.rs`):**
   - O servidor fica pedindo os meters da 01v96 (`MasterMeter::build_request()`).
   - O servidor recebe os bytes da Yamaha, analisa e acumula em um `meter_buffer`.
   - O servidor **controla o FPS** (`meter_fps_mobile`, `meter_fps_desktop`) para não estrangular a rede, e emite o evento `meterData` via WebSocket.
2. **Frontend (`public/modules/socket.js`, `steps.js`, etc.):**
   - O JavaScript escuta o evento `meterData`.
   - Lê os bytes brutos ou os arrays e aplica a conversão física (calibração baseada no arquivo `steps.js`, que mapeia de onde o som sai de fato).
   - O JS injeta o valor em variáveis CSS (`--meter-opacity` e alturas do `.dyn-meter-fill`), fazendo a interface atualizar de forma engasgada se o ping estiver alto ou o FPS do servidor estiver muito baixo.

---

## 2. A Nova Arquitetura com WASM

O objetivo do WASM não é desenhar na tela (o Canvas/CSS é mais rápido pra isso), mas sim **calcular a física dos meters** e fazer a interpolação, permitindo que a tela rode a 60 FPS lisos independentemente do lag da rede.

### O fluxo passará a ser:
1. O backend (`server_rust`) recebe o SysEx massivo da mesa e repassa o **pacote bruto** imediatamente pelo WebSocket (zero processamento no servidor).
2. O JavaScript recebe o pacote bruto e joga direto para a função `wasm.processar_meters(bytes)`.
3. O WASM analisa os bytes usando as structs do `midi_common`.
4. O WASM aplica a balística: "Se o pacote chegou atrasado, onde a barra deveria estar caindo agora?" (Attack, Release, Peak Hold).
5. O WASM devolve um `Float32Array` limpo pro JavaScript.
6. O JS pega o array e renderiza usando `requestAnimationFrame` na tela.

---

## 3. Plano de Execução (Passo a Passo)

### Passo 1: Preparação do Workspace Rust
- O projeto já possui um workspace no `Cargo.toml`.
- Criaremos um novo pacote chamado `client_wasm`: `cargo new --lib client_wasm`.
- Adicionaremos o `client_wasm` aos `members` do workspace raiz.
- Configuraremos o `client_wasm/Cargo.toml` para usar `wasm-bindgen` e o tipo `cdylib` (necessário para gerar bibliotecas C dinâmicas pro WASM).

### Passo 2: O Crate `client_wasm`

> [!TIP]
> **Refatoração do `midi_common` Concluída!**
> A dependência `tokio` foi movida para uma feature `network` (ativada por padrão) no `midi_common/Cargo.toml`. Agora, o pacote `client_wasm` importa o `midi_common` com `default-features = false`, permitindo compilação WASM nativa perfeitamente usando as structs compartilhadas.

- **Implementação Física:** Desenvolver a struct `MeterEngine` no Rust que guarda o estado anterior do medidor e calcula a física de queda logarítmica (release) baseada no tempo passado.

### Passo 3: Compilação e Tooling (`wasm-pack`)
- Vamos adicionar um script de desenvolvimento local que roda `wasm-pack build client_wasm --target web --out-dir ../public/wasm` toda vez que o Rust for alterado.
- Adicionar configurações otimizadas no `Cargo.toml` para diminuir o tamanho do WASM (aplicando as skills de Rust):
  ```toml
  [profile.release]
  lto = true
  opt-level = 'z' # Otimiza para tamanho
  ```

### 🚧 Passo 4: Integração Frontend (JS) - **CONCLUÍDO**

- No arquivo `socket.js`, utilizar o `import('./wasm/client_wasm.js')` dinâmico para inicializar o WASM no carregamento.
- Desviar a escuta do WebSocket no `socket.js` para não desenhar diretamente o medidor, mas sim alimentar o motor WASM usando `update_targets(wasmTargetLevels)`.
- Criar o loop de renderização nativo `requestAnimationFrame` dissociado do rate do websocket, garantindo interpolação (decay rate) nativa a 60fps no frontend.

---

### 🚧 Passo 5: Passthrough de SysEx e Desacoplamento do Backend (Planejamento)

Para alcançar o objetivo de **zero processamento no servidor**, o fluxo de envio e cálculo da balística precisa ser migrado para leitura de SysEx cru:

1. **WASM (`client_wasm/src/meters.rs`)**:
   - Adicionar estado interno para `input_calibration` e `master_calibration`.
   - Criar `set_calibration_tables(&[f32], &[f32])` exportada pro JS.
   - Atualizar `parse_meter_message` para mapear os bytes de step originais da Yamaha (0-32) DIRETAMENTE para porcentagens usando as tabelas injetadas.
2. **Frontend (`socket.js`)**:
   - No carregamento, invocar `wasm.set_calibration_tables()` injetando os arrays calculados dinamicamente via `calibrateStep()`.
   - Modificar/Criar o listener para o novo evento `socket.on('meterDataRaw')`.
   - Jogar a `Uint8Array` recebida direto em `wasm.processar_pacote_sysex()`.
3. **Backend (`server_rust/src/midi_receiver.rs`)**:
   - Identificar os pacotes de Meter no momento em que chegam na porta MIDI e enviá-los imediatamente via WebSocket com a tag `meterDataRaw`.
   - Omitir o cálculo massivo e throttling da thread do NodeJS/Rust antigo assim que confirmarmos o funcionamento, ou emitir em paralelo para não quebrar setups velhos.

---

## 4. Status Atual (Progresso)

**O que já foi concluído (Preparação Inicial do Módulo):**
- [x] Criação deste documento de planejamento em `docs/`.
- [x] Inclusão do `client_wasm` nos `members` do workspace no `Cargo.toml` raiz.
- [x] Criação do pacote `client_wasm` com seu próprio `Cargo.toml`, configurado para `cdylib` e importando a dependência `midi_common`.
- [x] Criação do arquivo `client_wasm/src/lib.rs` com a estrutura base e anotações `#[wasm_bindgen]`.
- [x] Criação do arquivo `client_wasm/src/meters.rs` contendo o esqueleto da `MeterEngine` (motor físico) e métodos `processar_pacote_sysex` e `render_frame`.
- [x] Compilação do projeto WASM finalizada (`client_wasm_bg.wasm` e `client_wasm.js`).
- [x] **Integração Frontend:** Instanciação do `MeterEngine` via WASM e injeção do rendering 60fps usando `requestAnimationFrame`.

> [!WARNING]
> **REVISÃO DO USUÁRIO:** O Passo 5 acima detalha como migraremos o WASM para digerir SysEx puro direto da mesa de som, com o `server_rust` funcionando como uma ponte invisível sem overhead. Você aprova a arquitetura do Passo 5 para continuarmos a execução?
