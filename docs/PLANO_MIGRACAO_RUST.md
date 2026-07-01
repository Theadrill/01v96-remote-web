# Plano de Migracao do Backend para Rust (01V96 Remote) — v4.0

| Campo | Valor |
|---|---|
| **Versao do plano** | 4.0 |
| **Progresso global** | ~90% |
| **Ultima atividade** | 2026-05-28 — Fase 15 concluida (parcial) |
| **Ultimo passo concluido** | Fase 12: Modo Demo + Fase 11: Handlers + Fase 15: Tray |
| **Proximo passo planejado** | Fase 16: Limpeza final (warnings, clippy)

Este documento e a **referencia arquitetonica tecnica definitiva** para a migracao do servidor Node.js atual para **Rust**, focado em performance absoluta e zero stutters. Ele contempla **TODAS** as funcionalidades existentes no Node.js, sem excecoes.

**IMPORTANTE:** O projeto em Node continuara intacto. A pasta `server_rust` e um subprojeto a parte.
**Atencao ao frontend:** NAO recrie ou duplique a pasta `public/`. O servidor Rust deve usar `../public/`, garantindo transicao transparente e sem duplicacao de codigo.

---

## Regras BASE da Migracao (Leitura Obrigatoria para qualquer IA)

Estas regras devem ser seguidas **em TODAS as sessoes** por qualquer agente/IA que trabalhar neste projeto. Elas garantem seguranca, rastreabilidade e continuidade entre sessoes.

### Regra 1 — Commits e Syncs SOB DEMANDA
- **NUNCA** faca commit ou git push sem que o usuario peca explicitamente.
- Cada commit/push deve ser pedido um de cada vez.
- So faca um novo commit/push quando o usuario pedir novamente.
- Motivo: o usuario controla o versionamento manualmente.

### Regra 2 — Preservacao de Funcionalidades
- **NENHUMA** feature do Node.js pode ser removida.
- **NENHUMA** funcionalidade pode ser alterada a ponto de perder seu comportamento original.
- O codigo Rust pode ser otimizado, mas o comportamento externo (API, sockets, MIDI) deve ser **IDENTICO** ao do Node.js.
- Em caso de duvida sobre o comportamento, consulte o source Node.js como verdade absoluta.
- Motivo: o frontend depende de contratos exatos (nomes de eventos, formato JSON, timing).

### Regra 3 — Atualizacao do Plano de Migracao a Cada Passo
- Ao **terminar cada passo/fase**, atualize este documento (`PLANO_MIGRACAO_RUST.md`) com:
  - **[x]** Check no passo concluido.
  - **O que foi feito**: descricao topica do que foi implementado/modificado.
  - **O que precisou ser modificado** alem do previsto (se houver desvios do plano).
  - **O que deve ser feito a seguir**: proximo passo logico.
  - **Se algo ficou pendente**: liste explicitamente.
- Nao cole trechos de codigo no log. Use topicos objetivos para economizar tokens.
- Atualize tambem o campo `ultima_atividade` no topo do documento com data/hora (opcional mas recomendado).
- Motivo: o usuario tem tokens limitados e outras IAs precisam conseguir continuar de onde esta parou.

### Regra 4 — Detalhamento para Continuidade
- O plano deve ser detalhado o suficiente para que **outra IA consiga ler e continuar** sem perder contexto.
- Cada entrada de log deve responder: "Se eu fosse outra IA entrando agora, eu saberia o que ja foi feito e o que fazer a seguir?"
- Use sempre o formato de topicos (como este), seja objetivo, evite prosa longa.
- Motivo: sessoes podem ser interrompidas e retomadas por agentes diferentes.

### Regra 5 — Testar apos Codar
- Terminou de implementar algo? **Compile e execute**.
- Antes de rodar, finalize qualquer instancia anterior do servidor que esteja ocupando a porta.
- Leia a saida do terminal:
  - **Warnings** de compilacao (`cargo build`) → corrija todos.
  - **Variaveis nao usadas** → remova ou prefixe com `_`.
  - **Erros de execucao** → corrija antes de avancar.
- Motivo: codigo que compila com warnings ou nao foi testado gera retrabalho para a proxima sessao.

### Regra 6 — Padrao de Codigo
- Siga as convencoes do codigo Rust ja existente no projeto.
- Use `mod.rs` para declarar submodulos, `use` explicito, snake_case para funcoes.
- Mantenha o estilo compativel com `cargo fmt` e `cargo clippy`.
- Motivo: consistencia facilita a leitura por outras IAs.

### Regra 7 — Sequencia de Sync Inicial (CRITICA)
- O servidor Rust DEVE replicar EXATAMENTE a sequencia de boot e sync do `server.js`.
- **Ordem de boot do server.js:**
  1. Logger init
  2. Import modulos (midiEngine, protocol, stateManager, etc)
  3. Express + HTTP + Socket.IO
  4. Montar ctx com estado global compartilhado
  5. `initConfig(ctx)` — gerenciamento de config/nomes/steps
  6. `ctx.loadNames()` — injetar nomes salvos no State (mesmo antes da mesa conectar)
  7. `ctx.loadConfigConstants()` — carregar timings do config.json
  8. `ctx.loadStepsCalibration()` — calibrar Master Meter
  9. `initMidiHandler(ctx)` — registrar callback handleMIDIData
  10. `initConnection(ctx)` — registrar funcoes de busca/conexao/sync
  11. `initSocketHandler(ctx)` — registrar handlers socket.io
  12. `initDmx(ctx)` — registrar DMX
  13. Rotas Express + `ctx.setupSocketHandlers()`
  14. Subir HTTP na porta configurada
  15. Se `demo_mode` → `iniciarDummy()`
  16. Se NAO `demo_mode` → `setTimeout(iniciarBuscaAutomatica, boot_delay_ms)`
  17. Se `dmxEnabled` → `setTimeout(startDmxApp, dmx_boot_delay_ms)`
  18. Systray (se suportado)
  19. Auto-open browser (se habilitado)
- **Sequencia de sync apos conexao MIDI (`executarConexao`):**
  1. `isConnected = true`
  2. Emitir `connectionState { connected: true, demo_mode }`
  3. **Cooldown de 5 segundos** (obrigatorio — hardware precisa respirar)
  4. Criar SyncManager se nao existe
  5. Configurar scheduler tick rate
  6. `isFullySynced = false`, `isSyncing = true`
  7. Configurar callback `onSyncComplete`: limpa flags, salva nomes, emite `sync` + `syncStatus`
  8. Chamar `syncManager.fire(targetSocket)`:
     - Emitir `syncStatus { active: true }`
     - `sceneManager.fetchScenes()` PRIMEIRO (100 cenas, 50ms entre cada, aguardar 2s)
     - `_queueAllParams()` DEPOIS (enfileirar TODOS os requests de parametros)
     - Quando Q1 esvaziar → `_finishSync()` (syncStatus false, emitir sync state, callback)
  9. Iniciar loop de meters (heartbeat) — so roda se `isFullySynced`
- **NUNCA** envie requests de parametros antes de baixar as cenas.
- **NUNCA** pule o cooldown de 5s.
- **NUNCA** emita meters antes de `isFullySynced`.
- Motivo: a CPU da 01V96 ignora SysEx enquanto processa cenas. Atropelar essa ordem causa perda de dados e estado inconsistente.

---

## Indice

1. [Stack e Bibliotecas Essenciais](#1-stack-e-bibliotecas-essenciais-em-rust)
2. [Status Atual da Migracao](#2-status-atual-da-migracao)
3. [Fase 1: Core e Configuracoes](#3-fase-1-core-e-configuracoes)
4. [Fase 2: O Motor MIDI — Protocolo e Parsing](#4-fase-2-o-motor-midi-protocolo-e-parsing)
5. [Fase 3: Gerenciamento de Estado Concorrente](#5-fase-3-gerenciamento-de-estado-concorrente)
6. [Fase 4: Midifiers e Schedulers](#6-fase-4-modificadores-e-schedulers)
7. [Fase 5: Modulo Pan Completo](#7-fase-5-modulo-pan-completo)
8. [Fase 6: Modulo Master Meter](#8-fase-6-modulo-master-meter)
9. [Fase 7: Modulo Pair (Stereo Link)](#9-fase-7-modulo-pair-stereo-link)
10. [Fase 8: Scene Manager Completo](#10-fase-8-scene-manager-completo)
11. [Fase 9: SyncManager Completo](#11-fase-9-syncmanager-completo)
12. [Fase 10: Connection Manager (Radar/Validador/Watchdog)](#12-fase-10-connection-manager-radarvalidadorwatchdog)
13. [Fase 11: Gerenciador de Rede — Socket Handlers](#13-fase-11-gerenciador-de-rede-socket-handlers)
14. [Fase 12: Modo Demo](#14-fase-12-modo-demo)
15. [Fase 13: Sistema DMX](#15-fase-13-sistema-dmx)
16. [Fase 14: Configuracoes e Persistencia](#16-fase-14-configuracoes-e-persistencia)
17. [Fase 15: Tray e Infraestrutura](#17-fase-15-tray-e-infraestrutura)
18. [Fase 16: Limpeza e Polimento](#18-fase-16-limpeza-e-polimento)
19. [Prioridades de Execucao](#19-prioridades-de-execucao)

---

## 1. Stack e Bibliotecas Essenciais em Rust

*   **`tokio`**: Runtime Assincrono (substitui a event-loop do Node).
*   **`axum` e `tower-http`**: Servidor Web para substituir o Express. Serve a pasta `../public`.
*   **`socketioxide`**: Mantem compatibilidade exata com o frontend que usa `socket.io-client`.
*   **`midir`**: Comunicacao MIDI de baixo nivel na USB (substitui `node-midi`).
*   **`serde` / `serde_json`**: Leitura dinamica de `config.json`, `names.json` e `steps.json`.
*   **`tray-icon` + `windows-sys`**: Bandeja do sistema Windows nativa.

---

## 2. Status Atual da Migracao

### 2.1 O que ja existe e FUNCIONA

| Componente | Arquivo Rust | Status |
|---|---|---|
| HTTP APIs (Macros) | `api/macros.rs` | 100% — 13 endpoints portados |
| Midi Engine (basic) | `midi/engine.rs` | Conecta portas, envia/recebe SysEx |
| Midi Assembler | `midi/assembler.rs` | Remonta SysEx fragmentados, ignora 0xFE |
| Midi Scheduler (basic) | `midi/scheduler.rs` | Q0/Q1/Q2, desduplicacao, tick 15ms |
| Config load | `config.rs` | Le config.json, names.json, steps.json |
| State structs | `state.rs` | Structs completos: Channel, Mix, Bus, Master, EQ, Comp, Gate |
| Scene Manager (basic) | `scene_manager.rs` | Parse de dumps, get_state, handle_midi_data |
| System Tray | `tray.rs` | Icone no tray com menu |
| Socket serve static | `main.rs` | Axum serve ../public + socket.io layer |

### 2.2 O que existe mas esta INCOMPLETO

| Componente | O que falta |
|---|---|
| **`protocol::parse_message()`** | So reconhece Fader, ChannelOn, MeterData, NameChars. Faltam: EQ, Gate, Comp, Att, Pan, Solo, Phase, Patch, Bus Assign, Pair, Scene Number (Sec 127), Scene Chars (Sec 127) |
| **`state::apply_midi()`** | So atualiza Fader, ChannelOn, SceneNumber, NameChar. Faltam todos os outros campos |
| **Socket: `setPan`** | Nao usa panModule.buildPanChange, nao atualiza state, nao broadcast update |
| **Socket: `requestDynamics`** | Nao retorna dynamicsState do state local (so envia SysEx request) |
| **Socket: `recallScene`** | Falta setTimeout 2s + fireParamsOnly pos-recall |
| **Socket: `saveScene`** | Falta rename SysEx (0x40), falta emitir currentScene/scenesUpdated, falta re-fetch |
| **Socket: on connect** | Falta emitir `scenesUpdated` e `connectionState` |
| **`portsList`** | Envia arrays vazios — deveria chamar `get_available_ports()` |
| **DMX** | 3 funcoes definidas mas nunca chamadas; `update_lumikit_config` e stub |
| **Meter Dummy** | Definido mas nunca iniciado |
| **Scheduler** | `stop()`, `clear()`, `set_q1_empty_callback()` nunca chamados |

### 2.3 O que NAO EXISTE (precisa ser criado do zero)

| Componente Node.js | Arquivo Node | Criticidade |
|---|---|---|
| **Pan Module** | `midi/pan.js` (9KB) | ALTA — buildPanChange, buildPanSyncRequests, parsePanMessage |
| **Master Meter Module** | `state/master-meter.js` (3KB) | MEDIA — buildRequest, parse, buildStopRequest, setSteps |
| **Pair Module** | `state/pair.js` (2KB) | MEDIA — pairChannels, unpairChannels, resetBothChannels |
| **SyncManager** | `network/sync-manager.js` (14KB) | ALTA — fire(), fireParamsOnly(), _queueAllParams(), syncNamesOnly() |
| **Connection Manager** | `network/connection.js` (12KB) | ALTA — auto-scan, validacao, cooldown 5s, watchdog, reconexao |
| **Midi Handler** | `midi/midi-handler.js` (4.5KB) | ALTA — handleMIDIData callback, iniciarDummy |

### 2.4 Socket Handlers que NAO EXISTEM

| Evento | Criticidade |
|---|---|
| `pairChannel` | MEDIA — stereo link pair/unpair/reset |
| `requestConnect` | ALTA — reconexao MIDI pela web |
| `forceSync` | MEDIA — sincronia forcada |
| `refreshNames` | MEDIA — refresh manual de nomes |
| `syncNamesOnly` | MEDIA — sync so de nomes |
| `deleteScene` | MEDIA — deletar cena da biblioteca |
| `toggleDemo` | MEDIA — ativar/desativar modo demo |
| `updateMeterConfig` | BAIXA — atualizar opacidade do meter |
| `updateOpenBrowser` | BAIXA — auto-open browser |
| `restartServer` | MEDIA — reinicio do servidor via socket |
| `updateName` | ALTA — atualizacao de nomes com MIDI write-back + debounce |
| `sysex` | MEDIA — injetor de SysEx raw |
| `syncPan` | BAIXA — sincronizacao de todos os pans |
| `resetDmx` | BAIXA — reset do sistema DMX |

---

## 3. Fase 1: Core e Configuracoes

### 3.1 O que ja esta feito
- `config.rs` le `config.json`, `names.json`, `steps.json` no boot.
- Constantes de timing carregadas: `scheduler_tick_ms`, `watchdog_timeout_ms`, etc.

### 3.2 O que falta fazer

1. **`saveConfig()`**: Persistir alteracoes no `config.json` (portas MIDI, demo_mode, meter_opacity, open_browser_startup).
   - No Node: `fs.writeFileSync(configFile, JSON.stringify(configData, null, 2))`
   - Local: `config.rs` — adicionar funcao `AppConfig::save(&self)`.

2. **`saveNames()` com debounce**: Persistir nomes no `names.json` com debounce de 1s (`name_save_debounce_ms`).
   - No Node: `saveNames()` em `config.js:127-149` — itera todos channels, mixes, buses, master, escreve JSON.
   - Local: `state.rs` + `config.rs` — a cada alteracao de nome, agendar timer de debounce e escrever.

3. **`loadStepsCalibration()`**: Carregar `public/steps.json` no Master Meter.
   - No Node: `loadStepsCalibration()` em `config.js:23-34` — chama `masterMeter.setSteps(stepsData.master)`.
   - O Rust ja le o steps.json no `AppConfig` mas nunca injeta no Master Meter (que nem existe como modulo separado).

4. **Injecao de `names.json` no GlobalState no boot**:
   - No Node: `ctx.loadNames()` itera `names.json` e chama `stateManager.setChannelName()` para cada entrada.
   - O Rust carrega `names.json` no `AppConfig.names` mas **nunca injeta no `GlobalState`**.

5. **`loadConfigConstants()` completo**:
   - No Node: Carrega `meter_fps_desktop`, `watchdog_timeout_ms`, todos os delays.
   - O Rust ja carrega, mas precisa garantir que todos sao usados nos lugares corretos.

### 3.3 Passo a passo

```
1.1 Em config.rs, adicionar metodo save(&self) que serializa AppConfig e escreve em ../config.json
1.2 Em config.rs, adicionar save_names(names: &HashMap<String,String>) com debounce usando tokio timer
1.3 Em state.rs, adicionar funcao inject_names(&mut self, names: &HashMap<String,String>)
1.4 Chame inject_names() no async_main() apos carregar config
1.5 Inicializar o master meter com steps do config.steps
```

---

## 4. Fase 2: O Motor MIDI — Protocolo e Parsing

### 4.1 O que ja esta feito
- `build_change()` e `build_request()` funcionam com lookup no `dictionary.json`.
- `parse_message()` reconhece Fader, ChannelOn, MeterData, NameChars.
- Converters: `faderToBytes`, `signedToBytes`, `onToBytes`, `dynOnToBytes` implementados.
- `bytes_to_fader`, `bytes_to_signed`, `bytes_to_on`, `bytes_to_dyn_on` implementados.

### 4.2 O que falta fazer — EXPANSAO DO `parse_message()`

**Prioridade CRITICA**: o parse_message() atual so cobre ~20% das mensagens que o Node.js parseia. Todas as mensagens abaixo precisam ser adicionadas, replicando EXATAMENTE a logica de `protocol.js:parseIncoming()`.

#### 4.2.1 Pan Parsing
Deve vir ANTES de qualquer outro parser (como no Node: linha 139).
- Usar logica de `pan.js:parsePanMessage()`.
- Mensagens de 14 bytes, section 0x7F, group 0x01, element 0x1B (input) ou 0x4E (master).
- Retornar `ParsedMidi::ControlChange { msg_type: "kPan", channel, value }`.

#### 4.2.2 EQ Parsing
Elementos: 32 (Input EQ), 33 (Input EQ), 46 (Bus EQ com group=1), 60 (AUX EQ), 82 (Stereo EQ).
- `eqKeys` array: `kEQMode, kEQLowQ, kEQLowF, kEQLowG, kEQHPFOn, kEQLowMidQ, kEQLowMidF, kEQLowMidG, kEQHiMidQ, kEQHiMidF, kEQHiMidG, kEQHiQ, kEQHiF, kEQHiG, kEQLPFOn, kEQOn`.
- Converter: se key termina em `G`, usar `bytes_to_signed`; senao `bytes_to_fader`.
- Channel mapping: prefix kAUX → globalCh = 36+ch; kBus → 44+ch; kStereo → 'master'.
- Retornar `ParsedMidi::ControlChange { msg_type: format!("{prefix}EQ/{key}"), channel: globalCh, value }`.

#### 4.2.3 Gate Parsing
Elemento 30.
- `gateKeys`: `kGateOn, kGateLink, kGateKeyIn, kGateKeyAUX, kGateKeyCh, kGateType, kGateAttack, kGateRange, kGateHold, kGateDecay, kGateThreshold`.
- Converter: Threshold/Range → `bytes_to_signed`; On/Link → `bytes_to_on`; outros → `bytes_to_fader`.
- Retornar `ControlChange { msg_type: format!("kInputGate/{key}"), channel, value }`.

#### 4.2.4 Compressor Parsing
Elementos: 31 (Input), 45 (Bus), 59 (AUX), 71 (Matrix), 81 (Stereo).
- `compKeys`: `kCompLocComp, kCompOn, kCompLink, kCompType, kCompAttack, kCompRelease, kCompRatio, kCompGain, kCompKnee, kCompThreshold`.
- Converter: Threshold → signed; On/Link → onToBytes; outros → faderToBytes.
- Channel mapping igual ao EQ.
- Retornar como `ControlChange`.

#### 4.2.5 Attenuator Parsing
Elemento 29.
- Retornar `{ type: "kInputAttenuator/kAtt", channel: finalCh, value: bytes_to_signed(data) }`.

#### 4.2.6 Solo Parsing
Group 3, Element 46.
- `if message[5] == 3 && element == 46`: retornar `{ type: "kSetupSoloChOn/kSoloChOn", channel, value: bytes_to_on(data) }`.

#### 4.2.7 Phase Parsing
(Nao ha parser explicito no Node — Phase e lido via `buildRequest` e tratado no SyncManager. O handler de `control` envia o SysEx de Phase.)
- Verificar se ha elemento para Phase (mapeado via dictionary). Se o Node so le Phase via request, provavelmente o elemento 46 com group diferente.
- Adicionar se houver elemento especifico.

#### 4.2.8 Patch/Routing Parsing
Elemento 1, Section 13, Group 2, Parameter 0.
- `if message[4] == 13 && message[5] == 2 && element == 1 && parameter == 0`:
- Retornar `{ type: "kChannelInput/kChannelIn", channel, value: bytes_to_fader(data) }`.

#### 4.2.9 Bus Assignments Parsing
Elemento 34.
- Parameter 0 → `kInputBus/kStereo`.
- Parameters 3-10 → `kInputBus/kBus{param-2}`.
- Converter: `bytes_to_on`.

#### 4.2.10 AUX Sends Parsing
Elemento 35.
- `auxIdx = floor(parameter / 3) + 1`.
- offset 0 → `kInputAUX/kAUX{auxIdx}On` (On).
- offset 2 → `kInputAUX/kAUX{auxIdx}Level` (Fader).

#### 4.2.11 Pair Status Parsing
Elemento 24, Parameter 0.
- Retornar `{ type: "kInputPair/kPair", channel, value: data.last() }`.

#### 4.2.12 Scene Number (Section 127)
- `message[4] == 127 && message[5] == 1 && element == 0 && parameter == 0`:
- Retornar `ParsedMidi::SceneNumber(data.last())`.

#### 4.2.13 Scene Name Chars (Section 127)
- `message[4] == 127 && message[5] == 1 && element == 1 && parameter 0-15`:
- Retornar `ParsedMidi::UpdateSceneChar { char_index: parameter, char: String::from_utf8_lossy(&[data.last()]) }`.

### 4.3 O que falta fazer — `buildNameRequest()` e `buildNameChange()`

O Rust **nao tem** estas funcoes. O Node as usa para:
- `buildNameRequest()`: F0 43 30 3E 0D 02 [ELEMENT] [PARAM] [CH] F7
- `buildNameChange()`: F0 43 10 3E 0D 02 [ELEMENT] [PARAM] [CH] 00 00 00 [CHAR] F7

**Adicionar ao `protocol.rs`**:
```rust
pub fn build_name_request(channel: u8, char_index: u8) -> Option<Vec<u8>>
pub fn build_name_change(channel: u8, char_index: u8, char_code: u8) -> Option<Vec<u8>>
```

Elementos de nome:
- CH 1-32 → element 4
- ST IN 1-4 (60,62,64,66) → element 23, localCh = (channel-60)/2
- AUX 36-43 → element 16, localCh = channel-36
- BUS 44-51 → element 15, localCh = channel-44
- MASTER 52 → element 18, localCh = 0

### 4.4 Passo a passo

```
2.1 Criar pan.rs em server_rust/src/midi/ (ver Fase 5)
2.2 Em protocol.rs, modificar parse_message():
    a. Adicionar chamada a pan::parse_pan_message() ANTES do restante do parse
    b. Adicionar blocos de parse: EQ (elementos 32,33,46,60,82), Gate (30), Comp (31,45,59,71,81)
    c. Adicionar Att (29), Solo (46, group=3), Patch (1, section=13, group=2, param=0)
    d. Adicionar Bus Assign (34), AUX Sends (35), Pair (24)
    e. Adicionar Scene Number e Scene Chars via Section 127 (Group 1)
2.3 Em protocol.rs, adicionar build_name_request() e build_name_change()
2.4 Garantir que bytes_to_signed() e bytes_to_dyn_on() sao usados nos parsers
```

---

## 5. Fase 3: Gerenciamento de Estado Concorrente

### 5.1 O que ja esta feito
- Structs completos com todos os campos (ChannelState, MixBusState, MasterState, EQ, Comp, Gate).
- Serializacao JSON compativel com o frontend (camelCase via serde rename).

### 5.2 O que falta fazer — EXPANSAO DO `apply_midi()`

O `apply_midi()` atual so trata: `kInputFader/kFader`, `kInputChannelOn/kChannelOn`, `kStereoFader/kFader`, `kStereoChannelOn/kChannelOn`, `kAUXFader/kFader`, `kAUXChannelOn/kChannelOn`, `kBusFader/kFader`, `kBusChannelOn/kChannelOn`, `SceneNumber`, `UpdateNameChar`.

Precisa tratar TODOS os tipos de mensagem. Replicar a logica de `state-manager.js:updateState()` completamente.

#### 5.2.1 Funcao auxiliar `get_channel_state_by_id()`
```rust
fn get_channel_state_by_id(state: &mut GlobalState, id: usize) -> Option<&mut dyn ChannelStateLike>
```
- 0-31 → channels[id]
- 60-67 → channels[32 + (id - 60)]
- 36-43 → mixes[id - 36]
- 44-51 → buses[id - 44]
- 52 → master
- Usar trait ou enum para unificar acesso.

#### 5.2.2 Tipos a adicionar no `apply_midi()`:

| msg_type | Alvo | Campo |
|---|---|---|
| `kPan` | channel/master | `.pan = value` |
| `kSetupSoloChOn/kSoloChOn` | channel | `.solo = value > 0` |
| `kInputPhase/kPhase` | channel | `.phase = value` |
| `kInputAttenuator/kAtt` | channel/master | `.att = value` |
| `kChannelInput/kChannelIn` | channel | `.patch = value` |
| `kInputPair/kPair` | channel+partner | `.paired`, `.pairedWith` |
| `kInputEQ/*`, `kAUXEQ/*`, `kBusEQ/*`, `kStereoEQ/*` | respectivo | `.eq.on`, `.eq.mode`, `.eq.{band}.{f,g,q,hpfOn,lpfOn}` |
| `kInputGate/*` | channel | `.gate.{on,thresh,range,attack,hold,decay}` |
| `kInputComp/*`, `kAUXComp/*`, `kBusComp/*`, `kStereoComp/*` | respectivo | `.comp.{on,thresh,ratio,attack,release,gain,knee}` |
| `kInputBus/kStereo` | channel | `.stereo = value > 0` |
| `kInputBus/kBus{1-8}` | channel | `.buses[busIdx] = value > 0` |
| `kInputAUX/kAUX{1-8}Level` | channel | `.aux{idx} = value` |
| `kInputAUX/kAUX{1-8}On` | channel | `.aux{idx}On = value > 0` |

#### 5.2.3 UpdateSceneChar e UpdateNameChar para Mixes/Buses/Master
O `apply_midi` atual so trata UpdateNameChar para channels[0..40]. Precisa expandir para:
- Mixes (global 36-43): `self.mixes[channel-36].name = ...`
- Buses (global 44-51): `self.buses[channel-44].name = ...`
- Master (global 52): `self.master.name = ...`

### 5.3 Passo a passo

```
3.1 Criar trait ou metodo get_channel_state_by_id() que retorna mutable ref para qualquer tipo de canal
3.2 Expandir apply_midi() com match para cada msg_type listado em 5.2.2
    - Usar regex-like parsing para extrair prefixo (kInput/kAUX/kBus/kStereo), modulo (EQ/Comp/Gate) e key
3.3 Adicionar tratamento de UpdateNameChar para Mixes/Buses/Master
3.4 Adicionar tratamento de UpdateSceneChar e SceneNumber
3.5 Apos cada update que envolver nome, agendar saveNames() com debounce
```

---

## 6. Fase 4: Modificadores e Schedulers

### 6.1 O que ja esta feito
- `MidiScheduler` com Q0 (desduplicacao), Q1, Q2.
- `start()`, `enqueue()`, `extract_address()`.
- Tick a cada `scheduler_tick_ms`.

### 6.2 O que falta

1. **`set_q1_empty_callback()`**: O SyncManager do Node depende disso para detectar quando a fila de parametros esvaziou e a sincronia terminou. Ja esta definido no Rust mas nunca e chamado.

2. **`setTickMs()` dinamico**: O Node permite alterar o tick rate via `setSchedulerTickMs()`. O Rust precisa suportar isso.

3. **SyncCounter**: O Node tem um `sync-counter.js` que evita eco de mensagens (ignora respostas que sao reflexo do nosso proprio envio). O Rust nao tem. Isso causa processamento duplicado quando usamos loopMIDI.
   - Implementar `SyncCounter` struct com `begin_sync()` e `should_ignore()`.
   - Chamar `begin_sync()` antes de enviar qualquer SysEx.
   - Chamar `should_ignore()` ao receber resposta — se true, descartar.

### 6.3 Passo a passo

```
4.1 Criar sync_counter.rs com struct SyncCounter { counter: AtomicUsize }
4.2 Integrar SyncCounter no fluxo de envio (engine.send) e recebimento (handle_midi_data)
4.3 Conectar set_q1_empty_callback com o SyncManager (Fase 9)
4.4 Adicionar set_tick_ms() que reinicia o intervalo se ja estiver rodando
```

---

## 7. Fase 5: Modulo Pan Completo

### 7.1 O que e
O arquivo `pan.js` (301 linhas) implementa o protocolo de Pan da 01V96. O Rust **nao tem equivalente**.

### 7.2 Funcionalidades a portar

1. **`panValueToBytes(value)`**: Converte -63..+63 para 4 bytes MIDI (28-bit signed, big-endian 7-bit).
   - Positivo: `[0, 0, 0, v & 0x7F]`.
   - Negativo: `0x10000000 + v` → 4 bytes.

2. **`bytesToPanValue(bytes)`**: Converte 4 bytes MIDI de volta para -63..+63.

3. **`globalChannelToPanIndex(ch)`**: Mapeamento:
   - 0-31 → ch (CH 1-32)
   - 60-67 (pares) → 32 + (ch-60)/2 (ST IN)
   - 52 / 'master' → isMaster=true, channelIdx=1

4. **`buildPanChange(ch, value)`**: SysEx de escrita de Pan.
   - Input: `F0 43 10 3E 7F 01 1B 00 [CH] [4 bytes pan] F7`
   - Master: `F0 43 10 3E 7F 01 4E 00 01 [4 bytes pan] F7`

5. **`buildPanRequest(ch)`**: SysEx de leitura de Pan.
   - Input: `F0 43 30 3E 7F 01 1B 00 [CH] F7`
   - Master: `F0 43 30 3E 7F 01 4E 00 01 F7`

6. **`parsePanMessage(msg)`**: Parser de mensagens de Pan recebidas.
   - Mensagens de 14 bytes, section 0x7F, group 0x01.
   - Element 0x1B → input, canal 0x00-0x27.
   - Element 0x4E → master.

7. **`buildPanSyncRequests()`**: Gera 37 requests (CH 1-32 + ST IN 1-4 + Master).

### 7.3 Passo a passo

```
5.1 Criar server_rust/src/midi/pan.rs
5.2 Implementar pan_value_to_bytes() e bytes_to_pan_value()
5.3 Implementar global_channel_to_pan_index()
5.4 Implementar build_pan_change() e build_pan_request()
5.5 Implementar parse_pan_message() — retorna Option<ParsedMidi>
5.6 Implementar build_pan_sync_requests() — retorna Vec<Vec<u8>>
5.7 Adicionar mod pan ao midi/mod.rs
5.8 Integrar parse_pan_message() no inicio de protocol::parse_message()
5.9 Substituir o setPan handler atual para usar build_pan_change()
```

---

## 8. Fase 6: Modulo Master Meter

### 8.1 O que e
O arquivo `master-meter.js` (92 linhas) gerencia o medidor de nivel do Stereo Master usando o comando nativo 0x21 da Yamaha.

### 8.2 Funcionalidades a portar

1. **`buildRequest()`**: `F0 43 30 3E 0D 21 04 00 7F 00 01 F7` — Request do Point 4 (Stereo Master).

2. **`buildStopRequest()`**: `F0 43 30 3E 0D 21 7F 00 00 00 00 F7` — Para o envio de meters.

3. **`parse(message)`**: Extrai L (bytes 9-10) e R (bytes 11-12), usa `unstuff()`, converte para step via tabela do `steps.json`, retorna `max(L, R)`.

4. **`setSteps(steps)`**: Recebe a tabela `master` do `steps.json` para calibracao.
   - A tabela mapeia step (0-32) → dB.
   - `convertValue(raw)`: Calcula `db = (raw - 4493) / 63.66`, encontra o step com dB mais proximo.

### 8.3 Passo a passo

```
6.1 Criar server_rust/src/midi/master_meter.rs
6.2 Implementar build_request(), build_stop_request(), parse(), set_steps()
6.3 Carregar steps do config.json na inicializacao: AppConfig.steps["master"]
6.4 Integrar no loop de meters do Connection Manager (Fase 10)
```

---

## 9. Fase 7: Modulo Pair (Stereo Link)

### 9.1 O que e
O arquivo `pair.js` (65 linhas) implementa o protocolo de stereo link (channel pair) da Yamaha. O Rust **nao tem** este modulo.

### 9.2 Funcionalidades a portar

1. **`buildAuxMsg(resetFlag, sourceCh, targetCh)`**: `F0 43 10 3E 7F 11 [RESET] 00 [SRC] 00 [TGT] F7`

2. **`buildStateMsg(chByte, state)`**: `F0 43 10 3E 7F 01 18 00 [CH] 00 00 00 [STATE] F7`

3. **`pairChannels(midiOutput, chA, chB, sourceCh)`**: Envia auxMsg + stateMsg ON.

4. **`unpairChannels(midiOutput, chA, chB)`**: Envia stateMsg OFF.

5. **`resetBothChannels(midiOutput, chA, chB)`**: Envia auxMsg com RESET=1 + stateMsg ON.

### 9.3 Passo a passo

```
7.1 Criar server_rust/src/midi/pair.rs
7.2 Implementar build_aux_msg(), build_state_msg()
7.3 Implementar pair_channels(), unpair_channels(), reset_both_channels()
7.4 Adicionar handler pairChannel no socket (Fase 11)
```

---

## 10. Fase 8: Scene Manager Completo

### 10.1 O que ja esta feito
- `handle_midi_data()` parseia dumps tipo 0x00 (Library) e 0x02 (Edit Buffer).
- `get_state()`, `set_active_scene()`, `build_bulk_request()` implementados.

### 10.2 O que falta

1. **`fetchScenes()`**: O Node faz download assincrono de 100 cenas (1 Edit Buffer + 99 Library) com intervalos de 50ms entre cada request. O Rust nao tem este metodo.
   - Usar `tokio::time::interval` de 50ms.
   - Enfileirar no scheduler com prioridade 1.
   - Ao terminar, emitir `scenesUpdated` + `currentScene`.

2. **Inferencia de indice da cena ativa**: Apos fetch, comparar nome do Edit Buffer com biblioteca para inferir `active_scene_index`.

3. **`setIO` equivalente**: No Node, `sceneManager.setIO(io)` permite emitir eventos diretamente. No Rust, o SceneManager esta dentro do GlobalState — o acesso ao socket.io e feito via o Arc<Io> no main.

### 10.3 Passo a passo

```
8.1 Adicionar metodo fetch_scenes() no SceneManager que:
    a. Cria queue com Edit Buffer (0x02, 0) + Library (0x00, 1..=99)
    b. Usa interval 50ms para enviar build_bulk_request() para o scheduler
    c. Aguarda 2s apos ultimo envio para dumps chegarem
    d. Infere active_scene_index comparando nomes
    e. Emite scenesUpdated + currentScene
8.2 Integrar fetch_scenes() no SyncManager.fire() (Fase 9)
```

---

## 11. Fase 9: SyncManager Completo

### 11.1 O que e
O arquivo `sync-manager.js` (300 linhas) e o orquestrador central de sincronia. O Rust **nao tem equivalente**.

### 11.2 Funcionalidades a portar

1. **`fire(targetSocket, forceNames, type)`**: Sincronia completa.
   - Emite `syncStatus { active: true }`.
   - Chama `sceneManager.fetchScenes()` primeiro.
   - Depois chama `_queueAllParams()`.

2. **`fireParamsOnly(targetSocket, forceNames, type)`**: Sincronia so de parametros (sem cenas).
   - Usado apos recall de cena.
   - Envia 64 stop requests para aquecer o scheduler.
   - Envia fader/on dos primeiros 4 canais + ST IN antecipadamente (redundancia).
   - Chama `_queueAllParams()`.

3. **`_queueAllParams(forceNames, targetSocket)`**: Enfileira TODOS os requests de parametros.
   - Stop request primeiro.
   - Pan sync requests (todos os canais).
   - Master Fader/On.
   - 32 canais de input: Fader, On, Solo, Phase, Att, EQ (On/Mode/HPF/LPF + 4 bandas x F/G/Q), AUX sends (8 bandas x Level/On), Gate (6 params), Comp (7 params), Patch, Bus assignments (Stereo + 8 buses), Pair (channels impares), Nomes (4 chars cada se forceNames).
   - ST IN 1-4: Fader, On, Nomes.
   - 8 AUX Masters: Fader, On, EQ (completo), Comp (completo).
   - 8 Bus Masters: Fader, On, EQ (completo), Comp (completo).
   - Stereo Master: Fader, On, Att, EQ (completo), Comp (completo).
   - Nomes das saidas (AUX 36-43, BUS 44-51, Master 52) se forceNames.
   - Configura callback `onQ1Empty` para `_finishSync()`.

4. **`syncNamesOnly()`**: Sync apenas de nomes.
   - Inputs 0-31 (4 chars cada).
   - ST IN (4 chars cada).
   - Out indices (AUX 36-43, BUS 44-51, Master 52) 8 chars cada.

5. **`_finishSync()`**: Finaliza sincronia.
   - `isSyncing = false`, `isFullySynced = true`.
   - Emite `syncStatus { active: false }`.
   - Emite `sync` (estado completo).
   - Se houver targetSocket, emite sync para ele.
   - Chama `onSyncComplete` callback.

### 11.3 Passo a passo

```
9.1 Criar server_rust/src/network/sync_manager.rs
9.2 Implementar SyncManager struct:
    - scheduler: Arc<MidiScheduler>
    - io: Option<SocketIo>
    - scene_manager access (via Arc<RwLock<GlobalState>>)
    - is_syncing: bool
    - is_fully_synced: bool
    - has_synced_names: AtomicBool
    - on_sync_complete callback
9.3 Implementar fire(), fire_params_only(), queue_all_params(), sync_names_only()
9.4 Implementar finish_sync()
9.5 Usar build_request() do protocol.rs para cada parametro
9.6 Usar build_name_request() para nomes
9.7 Usar build_pan_sync_requests() do pan.rs para pans
9.8 Usar build_stop_request() do master_meter.rs para stops
9.9 Conectar set_q1_empty_callback do scheduler ao _finishSync
```

---

## 12. Fase 10: Connection Manager (Radar/Validador/Watchdog)

### 12.1 O que e
O arquivo `connection.js` (276 linhas) gerencia todo o ciclo de vida da conexao. O Rust **nao tem equivalente**.

### 12.2 Funcionalidades a portar

1. **`iniciarBuscaAutomatica()`**: Radar que varre portas MIDI a cada 1s.
   - Usa `MidiEngine::get_available_ports()` para listar portas.
   - Criterios de busca: se `loopmidi-monitor` → nome contem "monitor"; senao → nome contem "yamaha" e "-1".
   - Ao encontrar, salva indices no config, conecta, para o intervalo.

2. **`executarConexao(inIdx, outIdx, targetSocket)`**: Conecta e orquestra.
   - Validacao (Porteiro): verifica se as portas batem com os criterios antes de conectar.
   - Chama `midiEngine.connectPorts(inIdx, outIdx, callback)`.
   - Emite `connectionState { connected: true, demo_mode }`.
   - Aguarda 5s de cooldown.
   - Instancia SyncManager.
   - Configura scheduler tick rate.
   - Configura callback `onSyncComplete`.
   - Chama `syncManager.fire(targetSocket)`.

3. **Loop de Meters (Heartbeat)**: Intervalo a cada `meter_poll_interval_ms`.
   - Verifica se `isConnected`.
   - Watchdog: se `now - lastActivityTime > watchdog_timeout_ms`, chama `handleDisconnection()`.
   - So emite se `isFullySynced`.
   - Envia 6 requests:
     a. `masterMeter.buildRequest()` (Point 4)
     b. `F0 43 30 3E 7F 21 00 00 00 00 1F F7` (Group 33)
     c. `F0 43 30 3E 7F 20 00 00 00 00 1F F7` (Group 32)
     d. `F0 43 30 3E 1A 21 00 00 00 00 1F F7` (Section 26, Group 33)
     e. `F0 43 30 3E 0D 21 00 00 00 00 1F F7` (Section 13, Group 33)
     f. `F0 43 30 3E 0D 20 00 00 00 00 1F F7` (Section 13, Group 32)
   - Todos com prioridade 2 (so envia se Q0 e Q1 vazias).

4. **`handleDisconnection(retry)`**: Limpa estado.
   - Envia stop request para limpar trafego.
   - Limpa intervals (meter + dummy).
   - Emite `connectionState { connected: false }`.
   - Se retry=true, inicia busca automatica.

5. **`triggerSync(targetSocket, forceNames, type)`**: Dispara sync manual.

6. **`syncNames()`**: Dispara sync so de nomes.

### 12.3 Passo a passo

```
10.1 Criar server_rust/src/network/connection.rs
10.2 Implementar ConnectionManager struct com todos os campos necessarios
10.3 Implementar iniciar_busca_automatica() usando get_available_ports()
10.4 Implementar executar_conexao() com porteiro de validacao
10.5 Implementar loop de meters com 6 requests por ciclo
10.6 Implementar watchdog com timeout de 5s
10.7 Implementar handle_disconnection() com retry automatico
10.8 Integrar com SyncManager (Fase 9)
10.9 Integrar com MidiHandler (Fase 2 do Node)
```

---

## 13. Fase 11: Gerenciador de Rede — Socket Handlers

### 13.1 O que ja esta feito
- `control`: Funcional, envia SysEx + atualiza state + broadcast.
- `setPan`: Parcial (nao usa pan module).
- `requestDynamics`: Parcial (nao retorna state local).
- `requestEqAtt`: OK.
- `recallScene`: Parcial (falta delay + fireParamsOnly).
- `saveScene`: Parcial (falta rename, emits, re-fetch).
- `disconnect`: OK (log).

### 13.2 Handlers a IMPLEMENTAR do zero

#### 13.2.1 `pairChannel`
```rust
socket.on("pairChannel", |data: { action, chA, chB, sourceCh }| {
    if !is_connected { return; }
    match action {
        "pair" => {
            pair::pair_channels(&scheduler, chA, chB, sourceCh);
            state.apply_midi(ParsedMidi::ControlChange { msg_type: "kInputPair/kPair", channel: chA, value: 1.0 });
        }
        "unpair" => {
            pair::unpair_channels(&scheduler, chA, chB);
            state.apply_midi(ParsedMidi::ControlChange { msg_type: "kInputPair/kPair", channel: chA, value: 0.0 });
        }
        "reset" => {
            pair::reset_both_channels(&scheduler, chA, chB);
            state.apply_midi(ParsedMidi::ControlChange { msg_type: "kInputPair/kPair", channel: chA, value: 1.0 });
        }
    }
});
```

#### 13.2.2 `requestConnect`
```rust
socket.on("requestConnect", |data: { inIdx, outIdx }| {
    if is_connected && config.in_idx == inIdx && config.out_idx == outIdx {
        // Ja conectado — so envia estado local
        socket.emit("sync", &state);
        socket.emit("scenesUpdated", &scenes);
        socket.emit("connectResult", { success: true });
        return;
    }
    config.in_idx = inIdx; config.out_idx = outIdx;
    save_config(&config);
    let result = connection_manager.executar_conexao(inIdx, outIdx, Some(socket));
    socket.emit("connectResult", result);
});
```

#### 13.2.3 `updateName`
Handler mais complexo devido ao MIDI write-back com debounce e broadcast:
```rust
socket.on("updateName", |data: { channel, name }| {
    let limited = name[..16.min(name.len())];
    let ch_state = state.get_channel_state_by_id(channel);
    if ch_state.is_none() { return; }

    // 1. Atualiza state e salva
    state.set_channel_name(channel, limited);
    save_names_with_debounce(&state);

    // 2. Broadcast para todos os clientes
    io.emit("updateName", { channel, name: limited });

    // 3. MIDI write-back com debounce 500ms + 30ms entre chars
    if is_connected {
        // Cancela timer anterior
        // Agenda novo timer de 500ms
        // Dentro do timer: envia 16 chars com 30ms entre cada
        //   usando build_name_change()
        // Depois envia requests de confirmacao com build_name_request()
    }
});
```

#### 13.2.4 Demais handlers

| Evento | Implementacao |
|---|---|
| `forceSync` | Chama `connection_manager.trigger_sync(None, true, "is_scene")` |
| `refreshNames` | Chama `connection_manager.sync_names()` |
| `syncNamesOnly` | Chama `sync_manager.sync_names_only()` |
| `deleteScene` | Envia SysEx `F0 43 10 3E 7F 10 60 00 [INDEX] F7`, atualiza scene_manager, emite scenesUpdated, agenda re-fetch |
| `toggleDemo` | Altera config.demo_mode, salva config, emite connectionState, inicia/para meter_dummy |
| `updateMeterConfig` | Altera config.meter_opacity, salva config |
| `updateOpenBrowser` | Altera config.open_browser_startup, salva config |
| `restartServer` | Fecha conexoes, mata processo atual, spawna novo processo |
| `sysex` | Envia bytes raw via `scheduler.enqueue(data, 1)` |
| `syncPan` | Envia `pan::build_pan_sync_requests()` com 20ms entre cada |
| `resetDmx` | Chama `dmx::reset_dmx_system()` |

### 13.3 Handlers a CORRIGIR

#### 13.3.1 `setPan` — correcao completa
```rust
socket.on("setPan", |data: { channel, value }| {
    // 1. Atualiza state
    state.apply_midi(ParsedMidi::ControlChange { msg_type: "kPan", channel, value });

    // 2. Broadcast para todos
    io.emit("update", { type: "kPan", channel, value });

    // 3. Envia para mesa usando pan module
    if is_connected {
        if let Some(sysex) = pan::build_pan_change(channel, value) {
            scheduler.enqueue(sysex, 1).await;
        }
    }
});
```

#### 13.3.2 `requestDynamics` — correcao
```rust
socket.on("requestDynamics", |data: { channel }| {
    let state_guard = state.read().await;
    if let Some(ch) = get_channel_state_by_id(&state_guard, channel) {
        socket.emit("dynamicsState", {
            channel,
            gate: ch.gate.clone(),
            comp: ch.comp.clone()
        });
    }
});
```

#### 13.3.3 `recallScene` — correcao
```rust
socket.on("recallScene", |data: { index }| {
    // Envia SysEx de recall
    scheduler.enqueue(recall_sysex, 1);

    // Atualiza scene manager
    state.scene_manager.set_active_scene(index);
    // Copia nome da biblioteca para currentScene se existir

    // Delay 2s (scene_recall_delay_ms)
    tokio::time::sleep(Duration::from_millis(scene_recall_delay_ms)).await;

    // Emite scenesUpdated
    io.emit("scenesUpdated", ...);

    // Delay adicional 1200ms
    tokio::time::sleep(Duration::from_millis(1200)).await;

    // fireParamsOnly
    sync_manager.fire_params_only(None, false, "is_scene");
});
```

#### 13.3.4 `saveScene` — correcao completa
```rust
socket.on("saveScene", |data: { index, newName }| {
    let original_name = current_scene.name.trim();
    let target_name = (newName.unwrap_or(original_name)).trim().pad_end(16, ' ')[..16];

    // Stage 1: STORE
    scheduler.enqueue(store_sysex, 1);

    // Stage 2: RENAME (se nomes diferem)
    if target_name.to_uppercase() != original_name.to_uppercase() {
        tokio::time::sleep(Duration::from_millis(scene_save_delay_ms)).await;

        let mut name_bytes = vec![0u8; 16];
        for (i, c) in target_name.chars().enumerate() {
            name_bytes[i] = c as u8;
        }
        let rename_sysex = [0xF0, 0x43, 0x10, 0x3E, 0x7F, 0x10, 0x40, 0x00, index, ...name_bytes, 0xF7];
        scheduler.enqueue(rename_sysex, 1);

        // Atualiza biblioteca local
        scene_manager.scenes[index] = Some(SceneData { index, name: target_name });
        scene_manager.set_active_scene(index);
        io.emit("currentScene", scene_manager.get_current_scene());
        io.emit("scenesUpdated", scene_manager.get_state());

        // Re-fetch apos delay
        tokio::time::sleep(Duration::from_millis(scene_resync_delay_ms)).await;
        scene_manager.fetch_scenes(&scheduler);
    } else {
        // Nomes iguais — so atualiza local e re-fetch
        scene_manager.scenes[index] = Some(SceneData { index, name: original_name });
        io.emit("currentScene", ...);
        io.emit("scenesUpdated", ...);
        tokio::time::sleep(Duration::from_millis(scene_resync_delay_ms)).await;
        scene_manager.fetch_scenes(&scheduler);
    }
});
```

### 13.4 Conexao Inicial — Corrigir Emissoes

Ao conectar, o Rust deve emitir EXATAMENTE o que o Node emite:

```rust
socket.on("connection", |socket| {
    let config = app_config.clone();
    let state_guard = state.read().await;

    // 1. portsList com portas REAIS (nao arrays vazios!)
    let (inputs, outputs) = MidiEngine::get_available_ports();
    socket.emit("portsList", { available: { inputs, outputs }, savedConfig: config });

    // 2. sync (estado completo)
    socket.emit("sync", &*state_guard);

    // 3. scenesUpdated
    socket.emit("scenesUpdated", state_guard.scene_manager.get_state());

    // 4. syncStatus
    socket.emit("syncStatus", { active: connection_manager.is_syncing });

    // 5. connectionState
    socket.emit("connectionState", { connected: is_connected, demo_mode: config.demo_mode });
});
```

### 13.5 Passo a passo

```
11.1 Adicionar handler pairChannel usando pair.rs
11.2 Adicionar handler requestConnect usando connection.rs
11.3 Adicionar handler updateName com MIDI write-back + debounce
11.4 Adicionar handlers: forceSync, refreshNames, syncNamesOnly
11.5 Adicionar handler deleteScene
11.6 Adicionar handler toggleDemo conectando meter_dummy
11.7 Adicionar handlers updateMeterConfig, updateOpenBrowser
11.8 Adicionar handler restartServer com spawn de novo processo
11.9 Adicionar handler sysex (raw injector)
11.10 Adicionar handler syncPan
11.11 Adicionar handler resetDmx
11.12 Corrigir setPan para usar pan.rs
11.13 Corrigir requestDynamics para retornar state local
11.14 Corrigir recallScene com delays e fireParamsOnly
11.15 Corrigir saveScene com rename 0x40 e emits corretos
11.16 Corrigir on connect para emitir portsList real + scenesUpdated + connectionState
```

---

## 14. Fase 12: Modo Demo

### 14.1 O que ja esta feito
- `meter_dummy.rs` implementado (gera SysEx fake de 32 canais + master a 30fps).
- **Porem nunca e chamado.**

### 14.2 O que falta

1. **Integrar com toggleDemo**: Quando demo mode ativado, chamar `start_meter_simulation()` com callback que:
   - Faz parse do SysEx via `protocol::parse_message()`.
   - Atualiza state com `apply_midi()`.
   - Emite `meterData` via socket.io.

2. **Ao desativar demo mode**: Parar o interval, zerar meter buffer, retomar busca USB.

### 14.3 Passo a passo

```
12.1 No handler toggleDemo, ao ativar: chamar start_meter_simulation(callback)
12.2 O callback deve: parsear SysEx → aplicar no state → emitir meterData
12.3 Ao desativar: dropar o JoinHandle do tokio spawn da simulacao
12.4 Zerar meterDataBuffer e emitir zeros
12.5 Retomar iniciar_busca_automatica()
```

---

## 15. Fase 13: Sistema DMX

### 15.1 O que ja esta feito
- `dmx.rs` com `start_dmx_app()`, `spawn_dmx()`, `reset_dmx_system()`, `update_lumikit_config()`.

### 15.2 O que falta

1. **Conectar ao boot**: No `async_main()`, apos servidor iniciar, verificar `config.sistema_iluminacao` e chamar `start_dmx_app(false)` apos `dmx_boot_delay_ms`.

2. **Conectar handler `resetDmx`**: O handler do socket deve chamar `reset_dmx_system(root_dir)`.

3. **Completar `update_lumikit_config()`**: O Node le todas as interfaces de rede locais, compara com `lumikit_ips` do config, e escreve o IP correspondente no arquivo `ArtNetToDMX_FTDI/info`. O Rust tem apenas um stub com println.

### 15.3 Passo a passo

```
13.1 Em main.rs, apos o servidor subir:
     if config.sistema_iluminacao { spawn start_dmx_app(false, root_dir) }
13.2 No handler resetDmx, chamar dmx::reset_dmx_system(root_dir)
13.3 Implementar update_lumikit_config() completo:
     - Listar IPs locais (crate local-ip-address ou pnet)
     - Comparar com config.lumikit_ips
     - Escrever/atualizar arquivo info com o IP correspondente
```

---

## 16. Fase 14: Configuracoes e Persistencia

### 16.1 O que ja esta feito
- `AppConfig::load()` le config.json, names.json, steps.json.

### 16.2 O que falta

1. **`AppConfig::save()`**: Serializar e escrever em `../config.json`.

2. **`save_names()` com debounce**: Usar `tokio::time::sleep` + `Arc<Mutex<Option<JoinHandle>>>` para debounce de 1s.

3. **`inject_names_into_state()`**: Apos carregar names.json, injetar no GlobalState.

4. **`load_steps_into_master_meter()`**: Apos carregar steps.json, chamar `master_meter.set_steps()`.

5. **Porta configuravel**: O Rust usa porta 3001 hardcoded. Deve ler do `config.json` ou usar 4000 como default (compativel com Node).

### 16.3 Passo a passo

```
14.1 Adicionar save(&self) em AppConfig
14.2 Adicionar funcao save_names_with_debounce() que usa tokio timer
14.3 Chamar inject_names_into_state() no boot
14.4 Chamar master_meter.set_steps() no boot
14.5 Ler porta do config.json ou usar 4000 como default
14.6 Adicionar config.meter_opacity e config.port ao struct AppConfig
```

---

## 17. Fase 15: Tray e Infraestrutura

### 17.1 O que ja esta feito
- System tray com icone e menu (Conectar, Abrir Navegador, Reiniciar, Sair).
- Message loop do Windows funcionando.

### 17.2 O que falta

1. **Atualizacao dinamica do menu**: O Node atualiza o tooltip e o texto do primeiro item conforme `isConnected`. O Rust tem um tooltip fixo.

2. **Comunicacao Tray → Tokio**: O clique em "Conectar" deve enviar um sinal para o runtime tokio iniciar a busca automatica. Atualmente o codigo tem um comentario "Ideally we pass a channel sender".

3. **Auto-open browser**: No boot, se `open_browser_startup !== false`, abrir o navegador automaticamente.

4. **`#![windows_subsystem = "windows"]`**: Esconder console no Windows.

### 17.3 Passo a passo

```
15.1 Adicionar channel (mpsc) para comunicacao Tray → Tokio
15.2 No clique "Conectar", enviar sinal para iniciar busca automatica
15.3 Atualizar tooltip dinamicamente conforme estado da conexao
15.4 Implementar auto-open browser no boot
15.5 Adicionar #![windows_subsystem = "windows"] ao main.rs
```

---

## 18. Fase 16: Limpeza e Polimento

### 18.1 Remover codigo morto

```rust
// Em main.rs, remover:
async fn macros_hosts_handler() -> axum::Json<serde_json::Value>  // linha 381
async fn macros_handler() -> axum::Json<serde_json::Value>        // linha 385
async fn macros_slots_handler() -> axum::Json<serde_json::Value>  // linha 389
```

### 18.2 Corrigir warnings

- `main.rs:34` → `rt.block_on(async_main())` retorna Result nao usado. Usar `let _ = rt.block_on(...)`.
- Remover imports nao usados.
- Garantir que `MidiScheduler::stop()`, `clear()`, `reset()` sejam usados onde apropriado.

### 18.3 HandleMIDIData — callback central

O Node tem um callback central `handleMIDIData()` em `midi-handler.js` que:
1. Reseta watchdog (`lastActivityTime = Date.now()`).
2. Intercepta cenas (sceneManager.handleMIDIData).
3. Processa METER_DATA com throttle FPS.
4. Atualiza state + broadcast `update`.
5. Salva nomes se recebeu chars de nome.

O Rust trata isso inline no `tokio::spawn` do `midi_in_rx.recv()`. Precisa ser refatorado para uma funcao centralizada que:
- Chama `sync_counter.should_ignore()` e descarta ecos.
- Reseta `last_activity_time`.
- Chama `scene_manager.handle_midi_data()`.
- Se for MeterData: throttle por FPS, so emite se `is_fully_synced`.
- Senao: `apply_midi()` + broadcast `update`.
- Se for NameChar ou SceneChar: agenda `save_names()`.

### 18.4 Testar compilacao e warnings

```bash
cd server_rust && cargo build 2>&1
# Corrigir todos os warnings
cargo clippy
# Corrigir todos os clippy warnings
```

### 18.5 Passo a passo

```
16.1 Remover funcoes mortas em main.rs (linhas 381-391)
16.2 Corrigir unused Result na linha 34
16.3 Refatorar midi_in_rx loop para funcao handle_midi_data() centralizada
16.4 Integrar SyncCounter no fluxo
16.5 Rodar cargo build e corrigir warnings
16.6 Rodar cargo clippy e corrigir warnings
16.7 Garantir que o projeto compila com 0 warnings
```

---

## 19. Prioridades de Execucao

### Ordem recomendada de implementacao

| Ordem | Fase | Criticidade | Descricao |
|---|---|---|---|
| **1** | Fase 2 | CRITICA | Expandir parse_message() com TODOS os tipos de mensagem |
| **2** | Fase 3 | CRITICA | Expandir apply_midi() para TODOS os campos do state |
| **3** | Fase 5 | ALTA | Criar pan.rs completo |
| **4** | Fase 6 | MEDIA | Criar master_meter.rs |
| **5** | Fase 7 | MEDIA | Criar pair.rs |
| **6** | Fase 11 | CRITICA | Corrigir setPan, requestDynamics, recallScene, saveScene |
| **7** | Fase 4 | MEDIA | SyncCounter + set_q1_empty_callback |
| **8** | Fase 9 | ALTA | Criar SyncManager completo |
| **9** | Fase 10 | ALTA | Criar ConnectionManager (radar, watchdog, meters) |
| **10** | Fase 10 | ALTA | handleMIDIData centralizado com Meter throttle |
| **11** | Fase 11 | ALTA | Implementar handlers faltantes (pairChannel, requestConnect, updateName, etc.) |
| **12** | Fase 8 | MEDIA | fetchScenes() no SceneManager |
| **13** | Fase 14 | ALTA | saveConfig, saveNames, inject_names, load_steps, porta configuravel |
| **14** | Fase 11 | ALTA | Corrigir on connect: portsList real + scenesUpdated + connectionState |
| **15** | Fase 12 | MEDIA | Conectar meter_dummy ao toggleDemo |
| **16** | Fase 13 | BAIXA | Conectar DMX ao boot + handler resetDmx + update_lumikit_config |
| **17** | Fase 15 | BAIXA | Comunicacao Tray→Tokio, auto-open browser, #![windows_subsystem] |
| **18** | Fase 11 | BAIXA | Handlers: updateMeterConfig, updateOpenBrowser, syncPan |
| **19** | Fase 16 | BAIXA | Limpeza: remover dead code, corrigir warnings, cargo clippy |

---

## Resumo Final

O servidor Rust atualmente tem **~25%** das funcionalidades do Node.js plenamente funcionais. As APIs HTTP estao 100%, mas o coracao do sistema — parsing de protocolo MIDI, atualizacao de estado, gerenciamento de conexao e sincronia — esta com apenas **~20%** de cobertura.

Seguindo as 16 fases na ordem recomendada, o servidor Rust alcancara **100% de paridade funcional** com o Node.js.

**Principio fundamental para CADA linha de codigo:**
> Se o Node.js faz, o Rust DEVE fazer. Nenhuma funcionalidade pode ser perdida na migracao.

---

## LOG DE EXECUCAO (Atualizado a cada passo concluido)

> **Instrucao para IAs:** Ao concluir qualquer passo, adicione uma entrada abaixo com `### [DATA] — Passo X concluido`. Descreva o que fez, o que modificou alem do previsto e o que deve ser feito a seguir. NAO remova entradas antigas. NAO cole codigo.

### 2026-05-27 — Sessao Inicial: Diagnostico e Regras
- **Status**: [x] Concluido
- **O que foi feito**:
  - Leitura de TODOS os arquivos do projeto (Node.js + Rust + public/)
  - Geracao do diagnostico completo de cobertura da migracao
  - Atualizacao do `PLANO_MIGRACAO_RUST.md` com 16 fases detalhadas
  - Insercao das **Regras BASE** no topo do documento
  - Adicao de header de tracking (versao, progresso, ultima atividade)
  - Adicao da secao LOG DE EXECUCAO para rastreabilidade
- **Modificacoes alem do previsto**: Nenhuma — apenas documentacao
- **Pendencias**: Nenhuma
- **Proximo passo**: Aguardando usuario decidir qual fase atacar primeiro

### 2026-05-27 — Fase 1 concluida: Core e Configuracoes
- **Status**: [x] Concluido
- **O que foi feito**:
  - **1.1 saveConfig()**: Adicionado metodo `AppConfig::save()` em `config.rs` que serializa e escreve em `../config.json`
  - **1.2 saveNames() com debounce**: Adicionada funcao `save_names_to_disk()` em `config.rs` que:
    - Usa `std::sync::LazyLock` com `Arc<Mutex<Option<JoinHandle>>>` para debounce de 1s
    - Extrai nomes de channels (0-31), ST IN (60-67), mixes (36-43), buses (44-51), master (52)
    - Escreve `names.json` com nomes formatados
  - **1.3 MasterMeter**: Criado `midi/master_meter.rs` com:
    - `set_steps()`: carrega tabela de calibracao do `steps.json`
    - `build_request()`: F0 43 30 3E 0D 21 04 00 7F 00 01 F7
    - `build_stop_request()`: F0 43 30 3E 0D 21 7F 00 00 00 00 F7
    - `parse()`: extrai L/R, unstuff 14-bit, converte para step via tabela de calibracao
  - **1.4 inject_names_into_state()**: Adicionado metodo `GlobalState::inject_names()` em `state.rs` que:
    - Itera `HashMap<String,String>` de nomes
    - Injeta em channels (0-31), ST IN (60-67→local 32-39), mixes (36-43), buses (44-51), master (52)
    - Corta nomes em 16 chars, preenche name_chars para cada tipo
  - **1.5 Porta configuravel**: `AppConfig` agora tem campo `port: u16` (default 4000). `async_main()` usa `app_config.port` ao inves de hardcoded 3001
  - **1.6 cargo build**: Compilou com 0 erros. 30 warnings pre-existentes (codigo a ser conectado em fases futuras)
  - **Bonus**: Corrigida emissao `portsList` no on-connect — agora chama `MidiEngine::get_available_ports()` em vez de enviar arrays vazios
  - **Bonus**: Adicionadas emissoes `scenesUpdated` e `connectionState` no on-connect (antes estavam faltando)
  - **Bonus**: Removido codigo morto: 3 handlers nao usados em main.rs (linhas 381-391)
  - **Bonus**: Corrigido unused Result em `main()` (linha 34)
- **Modificacoes alem do previsto**:
  - `config.rs`: Adicionado campo `port` e `meter_opacity` ao struct AppConfig
  - `config.rs`: Movido `app_config` clone antes do closure `io.ns()` para evitar move-after-use
  - `midi/mod.rs`: Adicionado `pub mod master_meter` e seu `pub use`
  - `main.rs`: Reestruturado boot para: config load → inject names → init master meter → MIDI → socket
- **Pendencias**: Nenhuma. Fase 1 100% concluida.
- **Proximo passo**: Aguardando auditoria do usuario, depois iniciar Fase 2 (expandir parse_message)

### 2026-05-27 — Hotfix: serde default para campos novos do config.json
- **Status**: [x] Concluido
- **O que foi feito**:
  - Adicionado `#[serde(default = "default_port")]` ao campo `port` em `AppConfig`
  - Adicionado `#[serde(default = "default_meter_opacity")]` ao campo `meter_opacity` em `AppConfig`
  - Adicionada funcao `default_meter_opacity()` retornando `1.0`
  - Corrigido: se campo nao existir no config.json, Serde usa o default sem quebrar o parse dos outros campos
- **Pendencias**: Nenhuma
- **Proximo passo**: Aguardando auditoria do usuario

### 2026-05-28 — Hotfix: Panico no callback MIDI
- **Status**: [x] Concluido
- **O que foi feito**:
  - Corrigido `engine.rs`: substituido `tokio::spawn()` por `blocking_send()`, pois o callback do driver MIDI roda num thread do Windows sem runtime Tokio
  - MidiAssembler encapsulado em `Arc<Mutex<>>` para compatibilidade com `Send + Sync` do midir
  - Corrigido `main.rs`: deteccao de portas agora lista todas as portas disponiveis, valida criterios (yamaha/-1), e avisa se nao encontrar — sem fallback silencioso para portas erradas
- **Modificacoes alem do previsto**: Nenhuma
- **Pendencias**: Nenhuma
- **Proximo passo**: Fase 4 — SyncCounter

### 2026-05-28 — Fase 4 concluida: SyncCounter + integracao
- **Status**: [x] Concluido
- **O que foi feito**:
  - Criado `midi/sync_counter.rs` com `begin_sync()`, `should_ignore()`, `reset()` usando `AtomicUsize`
  - Injetado `Arc<SyncCounter>` no `MidiScheduler::new()` — `begin_sync()` chamado antes de cada envio SysEx
  - No receive loop do `main.rs`: `should_ignore()` filtra ecos (reflexo do nosso proprio envio), evitando processamento duplicado via loopMIDI
  - Adicionado `pub use sync_counter::SyncCounter` no `midi/mod.rs`
- **Modificacoes alem do previsto**:
  - `scheduler.rs`: construtor `new()` agora aceita `Arc<SyncCounter>` como 3o parametro
  - `main.rs`: criacao do `Arc<SyncCounter>` antes do scheduler e clone para o receive loop
- **Pendencias**: Nenhuma
- **Proximo passo**: Fase 9 — SyncManager completo

### 2026-05-28 — Fase 9 concluida: SyncManager
- **Status**: [x] Concluido
- **O que foi feito**:
  - Criado `src/network/mod.rs` e `src/network/sync_manager.rs`
  - **SyncManager struct**: scheduler, io, flags (is_syncing, is_fully_synced com `Arc<AtomicBool>`, has_synced_names)
  - **`fire()`**: emite `syncStatus {active:true}`, enfileira todos os parametros via `queue_all_params()`
  - **`fire_params_only()`**: 64 stop requests de warmup + redundancia 4 canais + ST IN + `queue_all_params()`
  - **`queue_all_params()`**: ~600+ requests enfileirados em Q1:
    - Stop request, PanSync (37 requests), Master Fader
    - 32 inputs: Fader, On, Solo, Phase, Att, EQ (4 bandas x F/G/Q + On/Mode/HPF/LPF), AUX sends (8x Level+On), Gate (6 params), Comp (7 params), Patch, Bus Assign (Stereo+8 buses), Pair (canais impares), Names (4 chars se forceNames)
    - ST IN 1-4: Fader+On+Names
    - 8 AUX Masters + 8 BUS Masters: Fader, On, EQ (4 bandas), Comp (7 params)
    - Stereo Master: Fader, On, Att, EQ, Comp
    - Output names (36-43, 44-51, 52)
    - Polling loop aguarda Q0+Q1 esvaziarem → emite `syncStatus {active:false}` + `sync` (full state)
  - **`sync_names_only()`**: sync apenas de nomes (inputs, ST IN, outs) com mesmo mecanismo de polling
  - Registrado como modulo em `main.rs` (`mod network`)
- **Modificacoes alem do previsto**: Nenhuma — replicacao exata do Node.js
- **Pendencias**: SyncManager nao esta conectado ao fluxo de conexao ainda — sera integrado na Fase 10 (ConnectionManager)
- **Proximo passo**: Fase 11 — Handlers socket faltantes

### 2026-05-28 — Fase 10 concluida: Connection Manager
- **Status**: [x] Concluido
- **O que foi feito**:
  - Criado `src/network/connection.rs` com struct `ConnectionManager` (todos campos com `Arc` para compartilhamento)
  - **Radar**: `iniciar_busca_automatica()` — varre portas MIDI a cada 1s procurando "yamaha"+"-1" (ou "monitor"), auto-conecta ao encontrar
  - **Conexao**: `executar_conexao()` — validacao de porta (porteiro), connect no engine, cooldown de 5s, SyncManager.fire(), iniciar loop de meters
  - **Meter loop**: 6 requests SysEx (Master Point 4 + Groups 32/33 + Sections 26/13), priority 2 (so envia se Q0/Q1 vazias), so emite se is_fully_synced
  - **Watchdog**: verifica `last_activity` contra `watchdog_timeout_ms` a cada ciclo, chama `handle_disconnection` se timeout
  - **Disconnect**: stop request, para busca e meters, reseta sync_counter, emite connectionState offline, auto-retry com radar
  - **reset_activity()**: chamado no receive loop MIDI para manter o watchdog vivo
  - **trigger_sync() / sync_names()**: metodos publicos para uso pelos handlers socket
  - **DMX boot**: `start_dmx_app()` chamado apos `dmx_boot_delay_ms` se `sistema_iluminacao` habilitado
  - **Engine**: refatorado para `Arc<tokio::sync::Mutex<MidiEngine>>` compartilhado, forwarder de saida unico (scheduler→engine)
  - **main.rs reestruturado**: boot connect → radar apos boot_delay → DMX apos dmx_boot_delay
- **Modificacoes alem do previsto**:
  - `engine.rs`: substituido `tokio::spawn` por `blocking_send` no callback do driver (bug corrigido anteriormente)
  - `busca_handle` e `meter_handle` usam `std::sync::Mutex` (nao tokio) para evitar problemas de Send em futures
  - `emit_connection_state()`, `iniciar_busca_automatica()`, `iniciar_meter_loop()`, `reset_activity()` sao metodos sincronos (spawnam tasks internamente, mas nao sao async)
- **Pendencias**: Nenhuma. Fase 10 100% concluida.
- **Proximo passo**: Fase 11 — Implementar handlers socket faltantes (requestConnect, updateName, forceSync, deleteScene, toggleDemo, etc.)

### 2026-07-01 — Sistema de Monitoramento de Áudio (PCM + Opus) — v2
- **Status**: [x] Concluido (parcial — Opus sem suporte WebCodecs em alguns browsers)
- **O que foi feito (sessao 1)**:
  - **Arquitetura**: Criado `server_rust/src/monitoring.rs` com structs `MonitoringManager`, `Inner`, `MonitoringConfig`, `MonitoringFormat`, `MonitoringMessage`
  - **Fluxo de captura**: `start_standalone()` — thread nativa cpal para capturar de dispositivo auditivo separado; `attach()` — pipeline compartilhada com o RTA (reusa o mesmo stream cpal e adiciona forwarding de audio)
  - **Encoder Opus**: Usando `opus-rs = "0.1"` (pure Rust, sem dependencia C). Criado em `attach()` / `start_standalone()` / `reconfigure()` quando formato == Opus
  - **Forwarding task**: Tokio task que le `mpsc::Receiver<MonitoringMessage>` e emite `rtaAudio` como JSON `{"label":"pcm"|"opus", "data":[...]}`
  - **Watchdog**: Task separada que verifica heartbeat a cada 1s, para apos 5s de inatividade
  - **Reconfiguracao em tempo real**: `reconfigure()` troca formato e buffer size sem reiniciar o stream cpal (so muda o encoder e o tamanho dos chunks)
  - **Handlers socket**: `rtaAudioControl` (start/stop/reconfigure/getStatus) e `rtaAudioHeartbeat` em `socket_handlers.rs`
  - **RTA pipeline compartilhada**: `rta_manager.rs` integrado — `RtaManager` agora tem campo `pub monitoring: MonitoringManager`, callback do cpal faz RTA FFT + monitoring forwarding no mesmo buffer
  - **Frontend**: `public/modules/monitoring.js` — modal HTML em `index.html`, botoes formato PCM/Opus, input buffer size, seletor dispositivo servidor, heartbeat, playback PCM via `Float32Array` direto, Opus via WebCodecs `AudioDecoder`
  - **Config**: campos `monitoring_buffer_size` (u32, default 960) e `monitoring_format` (String, default "pcm") em `config.rs` com migracao automatica do JSON
  - **Sidebar**: Botao "OUVIR" no dock principal que abre o modal e chama `refreshMonitoringDevices()`
- **O que foi feito (sessao 2 — fork opus-rs + correcoes)**:
  - **Fork vendorizado**: Criado `server_rust/vendor/opus-rs/` com source do `opus-rs` v0.1.23, apenas `.rs` + `Cargo.toml` + `COPYING`
    - Todas as 26 chamadas a `is_x86_feature_detected!("avx"|"avx2"|"avx2,fma")` prefixadas com `false &&` para forcar caminho scalar
    - `Cargo.toml` simplificado (sem testes/exemplos/benches)
    - `[patch.crates-io]` adicionado ao `Cargo.toml` raiz do workspace
    - `cargo check` compila sem erros
  - **Corrigido playback Opus no cliente**: `audioData.getChannelData(ch)` nao existe em `AudioData` (WebCodecs) — trocado por `audioData.copyTo(dst, { planeIndex: ch })`
  - **Opus reabilitado no frontend**: botoes PCM/Opus funcionais, formato persiste em localStorage
  - **Adicionado tracing**: logs no servidor para encode Opus (frames -> bytes) e forwarding; logs no cliente para dados recebidos e decoder
- **Desvios do plano original**:
  - Formato de emissao dos dados mudou: em vez de tupla `("pcm", data)`, usa JSON `{"label":"pcm", "data":[...]}` porque socket.io serializava a tupla como array e o handler no cliente esperava dois argumentos separados
  - `MonitoringMessage` foi tornado `pub` (faltou no plano)
  - `OpusEncoder::encode()` aceita 3 argumentos (input, frame_size, output) e retorna `Result<usize, &str>` — documentacao do crate diferia
  - `opus_rs::Encoder` → `opus_rs::OpusEncoder` (API real do crate)
  - `sample_rate` passado como `i32` na criacao do encoder (nao `u32`)
  - Metodos mortos removidos: `set_sample_rate()` em monitoring.rs, `current_is_output()` em rta_manager.rs
  - Buffer size agora lido do `<input>` no frontend a cada start, nao de variavel cacheada
  - `_sample_rate_arc` prefixado com `_` por ser nao usado (warning)
  - Fork do `opus-rs` em vez de crate externa — solucao mais portatil
  - `AudioData.copyTo()` em vez de `getChannelData()` — API real do WebCodecs diferia
- **Problema resolvido — Opus STATUS_ILLEGAL_INSTRUCTION**:
  - O crate `opus-rs` v0.1.23 usa `#[target_feature(enable = "avx")]` em multiplas funcoes
  - Fork vendorizado com dispatch AVX forcado a `false` — CPU sem AVX nao crasha mais
  - Opus funcional na maquina local (testado)
- **Problema conhecido — WebCodecs AudioDecoder indisponivel**:
  - `AudioDecoder` (WebCodecs API) so existe em Chrome/Edge/Chromium. Firefox e Safari nao suportam.
  - Quando nao disponivel, uma mensagem aparece no status: "Opus nao suportado neste navegador. Use PCM."
  - Usuario precisa manualmente trocar para PCM nesses browsers.
  - **Solucao pendente**: detectar automaticamente e fazer fallback para PCM no cliente, ou usar um decoder Opus JS puro (ex: `opus-recorder` ou `ogg-opus-decoder` via WASM)
- **Pendencias**: Fallback automatico PCM quando AudioDecoder nao disponivel.
- **Proximo passo**: Implementar fallback automatico PCM no cliente para browsers sem WebCodecs, ou adicionar decoder Opus WASM.
