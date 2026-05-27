# Plano Detalhado de Migração do Backend para Rust (01V96 Remote)

Este documento é a referência arquitetural técnica e o **passo a passo definitivo** para a migração do servidor Node.js atual para **Rust**, focado em performance absoluta e zero stutters. Foi gerado após uma análise minuciosa de cada arquivo do código-fonte (protocolos MIDI, Schedulers, Socket.io, State Management e Configs).

**IMPORTANTE:** O projeto atual em Node continuará existindo intacto. A pasta `server_rust` será um subprojeto à parte.
**Atenção em relação ao frontend:** NÃO recrie ou duplique a pasta `public/` (o client) dentro da nova pasta `server_rust`. O servidor em Rust deverá usar a pasta `public/` original, servindo os arquivos subindo um nível de diretório (ex: lendo de `../public/`). Isso garante uma transição completamente transparente e evita duplicação de código.

---

## 1. Stack e Bibliotecas Essenciais em Rust

Para emular as funcionalidades do Node.js de forma nativa e extremamente otimizada:
*   **`tokio`**: Runtime Assíncrono (substitui a event-loop do Node).
*   **`axum` e `tower-http`**: Servidor Web veloz para substituir o Express. Servirá a pasta `../public`.
*   **`socketioxide`**: Crítica para manter compatibilidade exata com o frontend que usa `socket.io-client`. Não teremos que reescrever os clientes WS no browser.
*   **`midir`**: Para comunicação MIDI de baixo nível na USB (substitui `node-midi`).
*   **`serde` / `serde_json`**: Para leitura dinâmica de `config.json`, `names.json` e `steps.json`.

---

## 2. Fase 1: Core e Configurações (`config.js` -> `config.rs`)

O Node.js inicializa configurações do disco e carrega dados salvos. O Rust deverá fazer o mesmo com `serde`.

1.  **Ler JSONs dinamicamente**:
    *   `config.json`: (Localizado no diretório pai `../config.json` ou onde for estipulado). Lidar com as portas MIDI salvas (`inIdx`, `outIdx`) e flag `demo_mode`.
    *   `names.json`: Dicionário de canais -> nomes.
    *   `../public/steps.json`: Dicionário de calibração (`master`).
2.  **Constantes Críticas** (que devem vir do JSON com fallback):
    *   `meter_poll_interval_ms`: 41ms (Polling do Medidor).
    *   `watchdog_timeout_ms`: 5000ms.
    *   `scheduler_tick_ms`: 15ms.
    *   `name_update_char_delay_ms`: 30ms.
    *   `scene_save_delay_ms`: 500ms, `scene_recall_delay_ms`: 2000ms.

---

## 3. Fase 2: O Motor MIDI e Schedulers

Esta fase é o coração de performance. A mesa Yamaha afoga com muitos dados; a modulação estrita é obrigatória.

### 3.1 `midi-scheduler.js` -> `scheduler.rs`
1.  **Filas de Prioridade**: Implementar três filas: `Q0` (Pan/Controles críticos), `Q1` (Faders/EQs), `Q2` (Meters).
2.  **Desduplicação (Q0)**: O Rust deve parsear o buffer MIDI de entrada, extrair os bytes 4 a 8 (Section, Group, Element, Parameter, Index) e sobrepor SysEx idênticos (ex: se entraram 5 mudanças de fader do CH1 antes do tick, só a última sobrevive).
3.  **Tokio Interval (15ms)**: Uma thread de tempo roda a cada `tickMs` (default 15ms). Ela esvazia `Q0`, depois `Q1`. Se `Q0` e `Q1` tiverem itens, **ignora e descarta `Q2`** (meters).

### 3.2 `midi-assembler.js` -> `assembler.rs`
**Atenção ao driver do Windows!** O Windows fragmenta pacotes de SysEx acima de 1024 bytes (Dumps de Cena, etc).
1.  Ao receber bytes do `midir`, se a mensagem iniciar com `0xF0` mas não terminar com `0xF7`, o Rust deve guardá-la num buffer interno.
2.  Continuar a adicionar bytes das próximas chamadas MIDI no buffer até que `0xF7` chegue.
3.  Só repassar o vetor completo para o parser. Ignorar bytes aleatórios como Active Sensing (`0xFE`).

### 3.3 `protocol.js` -> `protocol.rs`
1.  **Conversores**: Implementar conversores binários exatos:
    *   `bytesToSigned` e `signedToBytes` (28-bit math mask com bit de sinal no 21º deslocamento).
    *   `bytesToFader` (7-bit shift array).
2.  **Mapeamento de Canais**:
    *   Inputs: global 0-31 -> local 0-31.
    *   Mixes/Auxiliares (global 36-43) -> local 0-7, Group `16` ou similar (depende da função).
    *   Bus (global 44-51) -> local 0-7, Group `15`.
    *   Master (global 52) -> local 0.

---

## 4. Fase 3: Gerenciamento de Estado Concorrente

### 4.1 `state-manager.js` -> `state.rs`
A árvore de estado no Node.js é complexa e mapeada rigidamente para o UI em React.
1.  **State Struct**: Deve possuir:
    *   `channels[0..39]` (Inputs + ST INs), `mixes[0..7]`, `buses[0..7]`, `master`.
    *   Cada canal possui sub-objetos estritos: `gate: { on, thresh, range, attack, hold, decay }`, `comp: { on, thresh, ratio, attack, release, gain, knee }`, `eq: { on, mode, low: {f, g, q, hpfOn}, ... }`. **Manter as exatas strings das chaves!** O Socket.io emitirá isso.
2.  **Concorrência (RwLock)**: Envolver o estado em `Arc<tokio::sync::RwLock<GlobalState>>`.

### 4.2 `scene_manager.js` -> `scene_manager.rs`
1.  Dumps `Type 0x00` (Library 1-99) e `Type 0x02` (Edit Buffer).
2.  Nome das cenas no dump inicia no índice 20 e tem 16 bytes.

---

## 5. Fase 4: O Gerenciador de Rede (Conexão e WebSockets)

### 5.1 `connection.js` -> `connection.rs`
1.  **Auto-Radar**: A thread principal deve fazer polling de 1s buscando nas portas MIDI pelo critério: contendo `"yamaha"` e `"-1"` (mesa física) ou `"monitor"` (loopMIDI).
2.  **Cooldown Crítico**: Ao conectar, aguardar **5000ms** antes de instanciar e disparar o `SyncManager` para puxar os dumps das cenas e parâmetros, garantindo que o hardware respire.
3.  **Watchdog e Meters**: Um loop a cada 41ms envia requests universais de meters (`F0 43 30 3E 7F 21 00 00 00 00 1F F7` etc) prioridade 2 para o Scheduler. Se nada voltar em 5000ms, aborta e reconecta.

### 5.2 `socket-handler.js` -> `socket_routes.rs` (Socketoxide)
1.  O Rust deve escutar as seguintes rotas Socket.io:
    *   `requestConnect`: Conexão manual web.
    *   `control`: Recebe dados do UI `(type, channel, value)`. Atualiza a RAM (RwLock) e constrói o SysEx usando o Protocolo.
    *   `setPan`: Envia SysEx via protocolo panModule.
    *   `updateName`: Recebe o nome completo, mas para o MIDI deve iterar caractere por caractere enviando com `tokio::time::sleep(30ms)` entre cada letra, usando SysEx de RENAME.
    *   `recallScene`, `saveScene`, `deleteScene`.
2.  **Mecânica de SaveScene**:
    *   Mesa só permite salvar com o nome que já está no Edit Buffer (Stage 1 - Comando de `Store: 0x20`).
    *   O Rust deve enviar `Store`, `tokio::time::sleep(500ms)`, e então enviar `Rename: 0x40` (Stage 2) com o novo nome em 16 bytes, atualizando o State interno em seguida.

---

## 6. Configuração Visual Nível Windows (Opcional, mas Recomendado)
No Node, dependíamos de VBScripts para esconder a tela preta.
No Rust, a magia está em adicionar `#![windows_subsystem = "windows"]` ao topo de `main.rs`. A aplicação rodará como um daemon nativo sem console!

Utilize a crate `tray-icon` para colocar a logo da 01V96 perto do relógio do sistema, contendo as opções "Abrir no Navegador" e "Sair".

---

## Como iniciar o código?

Inicie com a **Fase 1**. Peça para a IA:
1. Gerar o `Cargo.toml` com todas as dependências (`tokio`, `axum`, `socketoxide`, `midir`, `serde`, `tower-http`).
2. Criar a estrutura básica de módulos (`src/main.rs`, `src/config.rs`, `src/midi/mod.rs`, `src/state/mod.rs`, `src/network/mod.rs`).
3. Fazer o Axum servir a pasta `../public`.
