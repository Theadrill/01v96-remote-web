# Auditoria de Migração: Node.js → Rust

## Resumo Executivo

A migração das **APIs HTTP (macros)** está **~95% completa**. Porém, a migração dos **Socket.IO event handlers** e da **lógica de orquestração** está **~40% completa**. Há muitas funções definidas no Rust que nunca são chamadas, e muitos handlers do Node.js que não existem no Rust.

---

## 1. Socket.IO Event Handlers

### ✅ Portados e Funcionais

| Evento | Node.js | Rust | Status |
|---|---|---|---|
| `control` | [socket-handler.js:430](file:///c:/PROJETOS/01v96-remote-web/src/network/socket-handler.js#L430) | [main.rs:164](file:///c:/PROJETOS/01v96-remote-web/server_rust/src/main.rs#L164) | ✅ OK (corrigido com state update + self-emit) |
| `setPan` | [socket-handler.js:396](file:///c:/PROJETOS/01v96-remote-web/src/network/socket-handler.js#L396) | [main.rs:216](file:///c:/PROJETOS/01v96-remote-web/server_rust/src/main.rs#L216) | ⚠️ Parcial — não atualiza state, não envia MIDI correto (usa `kInputPan/kPan` ao invés de usar `panModule.buildPanChange`) |
| `requestDynamics` | [socket-handler.js:364](file:///c:/PROJETOS/01v96-remote-web/src/network/socket-handler.js#L364) | [main.rs:237](file:///c:/PROJETOS/01v96-remote-web/server_rust/src/main.rs#L237) | ⚠️ Parcial — no Node.js, retorna `dynamicsState` com dados do state. No Rust, apenas envia SysEx request |
| `requestEqAtt` | [socket-handler.js:379](file:///c:/PROJETOS/01v96-remote-web/src/network/socket-handler.js#L379) | [main.rs:251](file:///c:/PROJETOS/01v96-remote-web/server_rust/src/main.rs#L251) | ✅ OK |
| `recallScene` | [socket-handler.js:91](file:///c:/PROJETOS/01v96-remote-web/src/network/socket-handler.js#L91) | [main.rs:268](file:///c:/PROJETOS/01v96-remote-web/server_rust/src/main.rs#L268) | ⚠️ Parcial — falta o `setTimeout` de 2s + `fireParamsOnly` para sync pós-recall |
| `saveScene` | [socket-handler.js:136](file:///c:/PROJETOS/01v96-remote-web/src/network/socket-handler.js#L136) | [main.rs:298](file:///c:/PROJETOS/01v96-remote-web/server_rust/src/main.rs#L298) | ⚠️ Parcial — falta rename SysEx (byte 0x40), falta emitir `scenesUpdated` e `currentScene` |
| `disconnect` | Implícito | [main.rs:350](file:///c:/PROJETOS/01v96-remote-web/server_rust/src/main.rs#L350) | ✅ OK (log) |
| Conexão (on connect) | [socket-handler.js:26-33](file:///c:/PROJETOS/01v96-remote-web/src/network/socket-handler.js#L26) | [main.rs:140-160](file:///c:/PROJETOS/01v96-remote-web/server_rust/src/main.rs#L140) | ⚠️ Parcial — falta `scenesUpdated` e `connectionState` |

### ❌ NÃO Portados (FALTANDO)

| Evento | Arquivo Node.js | Criticidade | Descrição |
|---|---|---|---|
| `pairChannel` | [socket-handler.js:36-53](file:///c:/PROJETOS/01v96-remote-web/src/network/socket-handler.js#L36) | 🟡 Média | Pareamento de canais (stereo link) — pair/unpair/reset |
| `requestConnect` | [socket-handler.js:56-73](file:///c:/PROJETOS/01v96-remote-web/src/network/socket-handler.js#L56) | 🔴 Alta | Re-conexão MIDI pela web (selecionar portas e conectar) |
| `forceSync` | [socket-handler.js:76-78](file:///c:/PROJETOS/01v96-remote-web/src/network/socket-handler.js#L76) | 🟡 Média | Sincronia forçada |
| `refreshNames` | [socket-handler.js:80-83](file:///c:/PROJETOS/01v96-remote-web/src/network/socket-handler.js#L80) | 🟡 Média | Atualização manual de nomes |
| `syncNamesOnly` | [socket-handler.js:85-88](file:///c:/PROJETOS/01v96-remote-web/src/network/socket-handler.js#L85) | 🟡 Média | Sincronia apenas de nomes |
| `deleteScene` | [socket-handler.js:233-257](file:///c:/PROJETOS/01v96-remote-web/src/network/socket-handler.js#L233) | 🟡 Média | Deletar cena da biblioteca |
| `toggleDemo` | [socket-handler.js:260-296](file:///c:/PROJETOS/01v96-remote-web/src/network/socket-handler.js#L260) | 🟡 Média | Ativar/desativar modo demo |
| `updateMeterConfig` | [socket-handler.js:299-303](file:///c:/PROJETOS/01v96-remote-web/src/network/socket-handler.js#L299) | 🟢 Baixa | Atualizar opacidade do meter |
| `updateOpenBrowser` | [socket-handler.js:305-309](file:///c:/PROJETOS/01v96-remote-web/src/network/socket-handler.js#L305) | 🟢 Baixa | Ativar/desativar auto-open browser |
| `restartServer` | [socket-handler.js:311-316](file:///c:/PROJETOS/01v96-remote-web/src/network/socket-handler.js#L311) | 🟡 Média | Reinício do servidor via Socket |
| `updateName` | [socket-handler.js:319-361](file:///c:/PROJETOS/01v96-remote-web/src/network/socket-handler.js#L319) | 🔴 Alta | Atualização de nomes de canais (inclui broadcast + MIDI sync + debounce) |
| `sysex` | [socket-handler.js:388-392](file:///c:/PROJETOS/01v96-remote-web/src/network/socket-handler.js#L388) | 🟡 Média | Injetor de SysEx raw |
| `syncPan` | [socket-handler.js:419-427](file:///c:/PROJETOS/01v96-remote-web/src/network/socket-handler.js#L419) | 🟢 Baixa | Sincronização de todos os pans |
| `resetDmx` | [socket-handler.js:464-467](file:///c:/PROJETOS/01v96-remote-web/src/network/socket-handler.js#L464) | 🟢 Baixa | Reset do sistema DMX |

---

## 2. Lógica de Orquestração (connection.js + midi-handler.js)

### ❌ NÃO Portados

| Feature | Arquivo Node.js | Criticidade | Descrição |
|---|---|---|---|
| **Busca automática USB** | [connection.js:20-97](file:///c:/PROJETOS/01v96-remote-web/src/network/connection.js#L20) | 🔴 Alta | Radar que varre portas MIDI a cada 1s procurando Yamaha/loopMIDI |
| **Porteiro de validação** | [connection.js:102-216](file:///c:/PROJETOS/01v96-remote-web/src/network/connection.js#L102) | 🔴 Alta | Valida que a porta é realmente uma Yamaha antes de conectar |
| **Cooldown de 5s + SyncManager** | [connection.js:147-173](file:///c:/PROJETOS/01v96-remote-web/src/network/connection.js#L147) | 🔴 Alta | SyncManager completo (scenes + params + names) |
| **Loop de meters (heartbeat)** | [connection.js:178-212](file:///c:/PROJETOS/01v96-remote-web/src/network/connection.js#L178) | 🔴 Alta | Polling nativo dos meters da mesa (6 requests por ciclo) |
| **Watchdog de timeout** | [connection.js:185-189](file:///c:/PROJETOS/01v96-remote-web/src/network/connection.js#L185) | 🟡 Média | Detecta quando mesa parou de responder (timeout 5s) |
| **Reconexão automática** | [connection.js:221-243](file:///c:/PROJETOS/01v96-remote-web/src/network/connection.js#L221) | 🟡 Média | handleDisconnection + retry |
| **handleMIDIData callback** | [midi-handler.js:18-85](file:///c:/PROJETOS/01v96-remote-web/src/midi/midi-handler.js#L18) | 🔴 Alta | Watchdog reset, scene interception, meter throttle por FPS, updateState + broadcast |
| **Modo Demo (iniciarDummy)** | [midi-handler.js:89-101](file:///c:/PROJETOS/01v96-remote-web/src/midi/midi-handler.js#L89) | 🟡 Média | Simulação de SysEx via meter_dummy |
| **SyncManager completo** | [sync-manager.js](file:///c:/PROJETOS/01v96-remote-web/src/network/sync-manager.js) (13KB) | 🔴 Alta | Orquestra download de cenas → params → nomes da mesa |
| **MasterMeter (parse + request)** | [master-meter.js](file:///c:/PROJETOS/01v96-remote-web/src/state/master-meter.js) (3KB) | 🟡 Média | Parse e building de requests do Master Meter |
| **Pair module** | [pair.js](file:///c:/PROJETOS/01v96-remote-web/src/state/pair.js) (2KB) | 🟡 Média | Stereo link pair/unpair/reset |

---

## 3. State Fields (state.rs) — Definidos mas NUNCA Atualizados

> [!WARNING]
> Quase todos os campos de estado (EQ, Dynamics, Pan, Solo, Phase, Patch, etc.) são definidos no struct mas **nunca recebem valores do MIDI**. O `parse_message()` em protocol.rs só parseia Faders e On/Off.

| Campo | Tipo | Status |
|---|---|---|
| `channels[].solo` | bool | ❌ Nunca atualizado |
| `channels[].phase` | bool | ❌ Nunca atualizado |
| `channels[].att` (attenuator) | f64 | ❌ Nunca atualizado |
| `channels[].pan` | f64 | ❌ Nunca atualizado (nem pelo handler `setPan`) |
| `channels[].patch` | u8 | ❌ Nunca atualizado |
| `channels[].gate.*` (all fields) | GateState | ❌ Nunca atualizado |
| `channels[].comp.*` (all fields) | CompState | ❌ Nunca atualizado |
| `channels[].buses[]` (assignments) | Vec<bool> | ❌ Nunca atualizado |
| `channels[].stereo` | bool | ❌ Nunca atualizado |
| `channels[].eq.*` (all EQ bands) | EqState | ❌ Nunca atualizado |
| `channels[].paired*` | bool/Option | ❌ Nunca atualizado |
| `mixes[].name*` | String | ❌ Nunca atualizado do MIDI |
| `mixes[].comp.*`, `eq.*` | Comp/EqState | ❌ Nunca atualizado |
| `buses[].name*` | String | ❌ Nunca atualizado do MIDI |
| `buses[].comp.*`, `eq.*` | Comp/EqState | ❌ Nunca atualizado |
| `master.pan` | f64 | ❌ Nunca atualizado |
| `master.comp.*`, `eq.*` | Comp/EqState | ❌ Nunca atualizado |
| `master.name*` | String | ❌ Nunca atualizado do MIDI |

> No Node.js, **todos** esses campos são atualizados pelo `stateManager.updateState(midiData)` que processa o objeto retornado por `protocol.parseIncoming()`. No Rust, o `parse_message()` só reconhece Fader + ChannelOn para Input/AUX/Bus/Master.

---

## 4. Config e Persistência

| Feature | Node.js | Rust | Status |
|---|---|---|---|
| `loadConfig()` | [config.js:79-90](file:///c:/PROJETOS/01v96-remote-web/src/core/config.js#L79) | [config.rs](file:///c:/PROJETOS/01v96-remote-web/server_rust/src/config.rs) | ✅ OK |
| `saveConfig()` | [config.js:92-96](file:///c:/PROJETOS/01v96-remote-web/src/core/config.js#L92) | ❌ | ❌ Falta |
| `loadNames()` | [config.js:100-123](file:///c:/PROJETOS/01v96-remote-web/src/core/config.js#L100) | [config.rs](file:///c:/PROJETOS/01v96-remote-web/server_rust/src/config.rs) | ✅ OK (no boot) |
| `saveNames()` (debounced) | [config.js:127-149](file:///c:/PROJETOS/01v96-remote-web/src/core/config.js#L127) | ❌ | ❌ Falta — nomes alterados não são persistidos |
| `loadStepsCalibration()` | [config.js:23-34](file:///c:/PROJETOS/01v96-remote-web/src/core/config.js#L23) | ❌ | ❌ Falta — master meter sem calibração |
| `loadConfigConstants()` | [config.js:52-76](file:///c:/PROJETOS/01v96-remote-web/src/core/config.js#L52) | ⚠️ Parcial | Apenas `scheduler_tick_ms` e portas são lidos |

---

## 4. API HTTP (Macros)

| Rota | Node.js | Rust | Status |
|---|---|---|---|
| `GET /api/names` | ✅ | ✅ | ✅ OK |
| `GET /api/macros` | ✅ | ✅ | ✅ OK |
| `GET /api/macros/hosts` | ✅ | ✅ | ✅ OK |
| `GET /api/macros/slots` | ✅ | ✅ | ✅ OK |
| `POST /api/macros/slots` | ✅ | ✅ | ✅ OK |
| `DELETE /api/macros/slots` | ✅ | ✅ | ✅ OK |
| `POST /api/macros/swap` | ✅ | ✅ | ✅ OK |
| `POST /api/macros/sync` | ✅ | ✅ | ✅ OK |
| `DELETE /api/macros/sync` | ✅ | ✅ | ✅ OK |
| `GET /api/macros/config/:modId` | ✅ | ✅ | ✅ OK |
| `POST /api/macros/config/:modId` | ✅ | ✅ | ✅ OK |
| `POST /api/macros/proxy/http` | ✅ | ✅ | ✅ OK |
| `POST /api/macros/proxy/udp` | ✅ | ✅ | ✅ OK |

> **APIs HTTP: 100% portadas** ✅

---

## 6. Código Morto no Rust (Definido mas NUNCA chamado)

> [!WARNING]
> 16 funções/itens definidos mas nunca chamados. Cada um representa uma feature que foi parcialmente portada mas nunca conectada.

| Item | Arquivo | Descrição |
|---|---|---|
| `macros_hosts_handler()` | [main.rs:381](file:///c:/PROJETOS/01v96-remote-web/server_rust/src/main.rs#L381) | Handler antigo, nunca usado (substituído por `api::macros`) |
| `macros_handler()` | [main.rs:385](file:///c:/PROJETOS/01v96-remote-web/server_rust/src/main.rs#L385) | Idem |
| `macros_slots_handler()` | [main.rs:389](file:///c:/PROJETOS/01v96-remote-web/server_rust/src/main.rs#L389) | Idem |
| `MidiAssembler::reset()` | assembler.rs | Nunca chamado |
| `MidiEngine::get_available_ports()` | engine.rs | Definido mas não usado (deveria popular portsList no connect) |
| `bytes_to_signed()` | protocol.rs | Parsing de bytes assinados — deveria ser usado no `parse_message` |
| `bytes_to_dyn_on()` | protocol.rs | Parsing de dynamics on/off |
| `ParsedMidi::SceneNumber` | protocol.rs | Variant definida mas nunca construída no parse |
| `ParsedMidi::UpdateSceneChar` | protocol.rs:172 | Idem |
| `Converter::Signed14` | protocol.rs:18 | Nunca usado |
| `Converter::DynOn` | protocol.rs:20 | Nunca usado |
| `MidiScheduler::stop()` | scheduler.rs:153 | Nunca chamado |
| `MidiScheduler::clear()` | scheduler.rs:158 | Nunca chamado |
| `MidiScheduler::set_q1_empty_callback()` | scheduler.rs:44 | Nunca chamado (importante para SyncManager) |
| `start_meter_simulation()` | meter_dummy.rs | Nunca chamado (modo demo não funciona) |
| `dmx::start_dmx_app()` | dmx.rs | DMX app launcher nunca chamado |
| `dmx::spawn_dmx()` | dmx.rs | Chamado só de start_dmx_app que nunca é chamado |
| `dmx::reset_dmx_system()` | dmx.rs | Reset DMX nunca chamado |
| `SceneManager::is_syncing` | scene_manager.rs:21 | Campo nunca lido |
| `SceneManager::build_bulk_request()` | scene_manager.rs | Método nunca chamado (cenas nunca são solicitadas da mesa) |
| `update_lumikit_config()` | dmx.rs | Stub vazio, nunca chamado |
| `MidiScheduler::stop()` | scheduler.rs | Nunca chamado |
| `MidiScheduler::clear()` | scheduler.rs | Nunca chamado |
| `MidiScheduler::set_q1_empty_callback()` | scheduler.rs | Importante para SyncManager, nunca chamado |

---

## 7. Emissões na Conexão Inicial

### Node.js envia ao conectar:
1. `portsList` (com portas MIDI disponíveis + config salva)
2. `sync` (estado completo)
3. `scenesUpdated` (cenas)
4. `syncStatus` (flag de sincronização)
5. `connectionState` (connected + demo_mode)

### Rust envia ao conectar:
1. ✅ `sync` (estado) 
2. ⚠️ `portsList` (portas **hardcoded vazio** em vez de usar `get_available_ports()`)
3. ✅ `syncStatus` (hardcoded false)
4. ❌ `scenesUpdated` — **FALTANDO**
5. ❌ `connectionState` — **FALTANDO**

> [!IMPORTANT]
> O `portsList` deveria chamar `MidiEngine::get_available_ports()` para popular a lista real de portas MIDI. Atualmente envia arrays vazios.

---

## 8. Módulos Node.js vs Rust

| Módulo Node.js | Arquivo | Equivalente Rust | Status |
|---|---|---|---|
| `state-manager.js` (12KB) | [state-manager.js](file:///c:/PROJETOS/01v96-remote-web/src/state/state-manager.js) | [state.rs](file:///c:/PROJETOS/01v96-remote-web/server_rust/src/state.rs) | ⚠️ Parcial — `updateState` muito simplificado vs Node |
| `protocol.js` (16KB) | [protocol.js](file:///c:/PROJETOS/01v96-remote-web/src/midi/protocol.js) | [protocol.rs](file:///c:/PROJETOS/01v96-remote-web/server_rust/src/midi/protocol.rs) | ⚠️ Parcial — `parseIncoming` muito simplificado |
| `midi-engine.js` (5KB) | [midi-engine.js](file:///c:/PROJETOS/01v96-remote-web/src/midi/midi-engine.js) | [engine.rs](file:///c:/PROJETOS/01v96-remote-web/server_rust/src/midi/engine.rs) | ✅ Básico funcional |
| `midi-scheduler.js` (5KB) | [midi-scheduler.js](file:///c:/PROJETOS/01v96-remote-web/src/midi/midi-scheduler.js) | [scheduler.rs](file:///c:/PROJETOS/01v96-remote-web/server_rust/src/midi/scheduler.rs) | ⚠️ Parcial — `stop`, `clear`, `set_q1_empty_callback` nunca usados |
| `midi-assembler.js` (1KB) | [midi-assembler.js](file:///c:/PROJETOS/01v96-remote-web/src/midi/midi-assembler.js) | [assembler.rs](file:///c:/PROJETOS/01v96-remote-web/server_rust/src/midi/assembler.rs) | ✅ OK |
| `scene_manager.js` (7KB) | [scene_manager.js](file:///c:/PROJETOS/01v96-remote-web/src/state/scene_manager.js) | [scene_manager.rs](file:///c:/PROJETOS/01v96-remote-web/server_rust/src/scene_manager.rs) | ⚠️ Parcial — `build_bulk_request` nunca usado, `fetchScenes` não implementado |
| `pan.js` (9KB) | [pan.js](file:///c:/PROJETOS/01v96-remote-web/src/midi/pan.js) | Nenhum equivalente | ❌ Não portado (buildPanChange, buildPanSyncRequests, parsePan) |
| `meter_dummy.js` (3KB) | [meter_dummy.js](file:///c:/PROJETOS/01v96-remote-web/src/state/meter_dummy.js) | [meter_dummy.rs](file:///c:/PROJETOS/01v96-remote-web/server_rust/src/midi/meter_dummy.rs) | ❌ Nunca chamado |
| `master-meter.js` (3KB) | [master-meter.js](file:///c:/PROJETOS/01v96-remote-web/src/state/master-meter.js) | Nenhum equivalente | ❌ Não portado |
| `pair.js` (2KB) | [pair.js](file:///c:/PROJETOS/01v96-remote-web/src/state/pair.js) | [stereo_link.rs](file:///c:/PROJETOS/01v96-remote-web/server_rust/src/stereo_link.rs) | ❌ Definido mas nunca conectado (sem `pairChannel` handler) |
| `sync-manager.js` (14KB) | [sync-manager.js](file:///c:/PROJETOS/01v96-remote-web/src/network/sync-manager.js) | Nenhum equivalente | ❌ Não portado |
| `connection.js` (12KB) | [connection.js](file:///c:/PROJETOS/01v96-remote-web/src/network/connection.js) | Nenhum equivalente | ❌ Não portado |
| `config.js` (7KB) | [config.js](file:///c:/PROJETOS/01v96-remote-web/src/core/config.js) | [config.rs](file:///c:/PROJETOS/01v96-remote-web/server_rust/src/config.rs) | ⚠️ Parcial — loadConfig ok, saveConfig/saveNames faltando |
| `dictionary.js` (167KB) | [dictionary.js](file:///c:/PROJETOS/01v96-remote-web/src/midi/dictionary.js) | Embutido em protocol.rs | ⚠️ Verificar cobertura |
| `property-map.js` (2KB) | [property-map.js](file:///c:/PROJETOS/01v96-remote-web/src/midi/property-map.js) | Embutido em protocol.rs | ⚠️ Verificar cobertura |
| `systray.js` (4KB) | [systray.js](file:///c:/PROJETOS/01v96-remote-web/src/utils/systray.js) | [tray.rs](file:///c:/PROJETOS/01v96-remote-web/server_rust/src/tray.rs) | ✅ OK |
| `logger.js` (2KB) | [logger.js](file:///c:/PROJETOS/01v96-remote-web/src/utils/logger.js) | `tracing` crate | ✅ OK (diferente abordagem) |
| `platform.js` (2KB) | [platform.js](file:///c:/PROJETOS/01v96-remote-web/src/utils/platform.js) | N/A (Windows-only) | ✅ OK |
| `dmx.js` (8KB) | [dmx.js](file:///c:/PROJETOS/01v96-remote-web/src/dmx/dmx.js) | [dmx.rs](file:///c:/PROJETOS/01v96-remote-web/server_rust/src/dmx.rs) | ⚠️ Parcial — definido mas `update_lumikit_config` com param não usado |

---

## 9. Protocol Parse Gaps (protocol.rs)

> [!CAUTION]
> O `parse_message()` no Rust só reconhece **4 tipos de mensagem** de entrada: Fader, ChannelOn, MeterData, e NameChars. O Node.js parseia **dezenas de tipos** via dictionary lookup.

| Tipo de Mensagem | Node.js `parseIncoming()` | Rust `parse_message()` | Status |
|---|---|---|---|
| Fader (Input/AUX/Bus/Master) | ✅ | ✅ | ✅ OK |
| ChannelOn (Input/AUX/Bus/Master) | ✅ | ✅ | ✅ OK |
| MeterData (channels + master) | ✅ | ✅ | ✅ OK |
| Name Chars | ✅ | ✅ | ✅ OK |
| EQ Frequency/Gain/Q | ✅ | ❌ | ❌ Não parseado |
| HPF/LPF on/off | ✅ | ❌ | ❌ Não parseado |
| Gate (thresh/range/attack/hold/decay) | ✅ | ❌ | ❌ Não parseado |
| Comp (thresh/ratio/attack/release/gain/knee) | ✅ | ❌ | ❌ Não parseado |
| Attenuator | ✅ | ❌ | ❌ Não parseado |
| Pan | ✅ (via pan.js) | ❌ | ❌ Não parseado |
| Solo | ✅ | ❌ | ❌ Não parseado |
| Phase | ✅ | ❌ | ❌ Não parseado |
| Patch/routing | ✅ | ❌ | ❌ Não parseado |
| Bus assignments | ✅ | ❌ | ❌ Não parseado |
| Stereo link status | ✅ | ❌ | ❌ Não parseado |
| Scene number | ✅ | ❌ (variant exists, never constructed) | ❌ Não parseado |
| Scene name chars | ✅ | ❌ (variant exists, never constructed) | ❌ Não parseado |

---

## 10. Problemas Adicionais

### `stereo_link.rs` NÃO EXISTE
- Diferente do que se esperava, o arquivo `stereo_link.rs` **não existe** no diretório do Rust. Não há `mod stereo_link` em nenhum lugar.

### Porta diferente
- Node.js: porta **4000** (config)  
- Rust: porta **3001** (hardcoded) — veja [main.rs:368](file:///c:/PROJETOS/01v96-remote-web/server_rust/src/main.rs#L368)

### `saveScene` incompleto
- Node.js: Compara nomes, faz RENAME SysEx (0x40), emite `currentScene`, `scenesUpdated`, e faz re-fetch  
- Rust: Apenas envia STORE SysEx (0x20) e tenta montar rename mas com bytes errados (0x00 ao invés de 0x40)

### `requestDynamics` incompleto
- Node.js: Responde imediatamente com `dynamicsState` do state local (gate + comp)
- Rust: Apenas envia SysEx request para a mesa (não responde ao cliente diretamente)

### Dead functions em `main.rs`
- Linhas 381-391: `macros_hosts_handler`, `macros_handler`, `macros_slots_handler` — código morto, pode ser removido

### Unused `Result`
- Linha 34: `rt.block_on(async_main())` — deveria ser `let _ = rt.block_on(...)`

---

## 11. Prioridades de Ação

### 🔴 Prioridade CRÍTICA (sistema fundamentalmente incompleto)
1. **Expandir `parse_message()` no protocol.rs** — parsear EQ, Dynamics, Att, Pan, Solo, Phase, Patch, Scene Number
2. **Expandir `apply_midi()` no state.rs** — atualizar TODOS os campos do state com base no parse expandido
3. **Socket `updateName`** — sem isso, não dá para renomear canais pelo celular (inclui MIDI write-back + debounce)
4. **Socket `requestConnect`** — sem isso, não dá para reconectar portas MIDI pela web
5. **Conexão inicial: emitir `scenesUpdated` e `connectionState`**
6. **`saveNames()` com debounce** — nomes alterados são perdidos ao reiniciar
7. **`saveConfig()`** — configurações alteradas não são salvas
8. **Carregar `names.json` no GlobalState no boot** — config carrega mas nunca injeta no state
9. **Usar portas MIDI reais no `portsList`** — chamar `get_available_ports()` em vez de enviar arrays vazios

### 🟡 Prioridade Média
10. Socket `deleteScene`
11. Socket `pairChannel` (stereo link) — criar `stereo_link.rs`
12. Socket `toggleDemo` — conectar `start_meter_simulation()`
13. Socket `restartServer` (via socket, não via tray)
14. Socket `sysex` (raw injetor)
15. Socket `forceSync`, `refreshNames`, `syncNamesOnly`
16. Usar `configConstants` carregados (FPS throttle, watchdog, delays)
17. Remover dead code (`macros_*_handler`, imports não usados)
18. `saveScene` completo com RENAME SysEx (0x40) + emissões corretas
19. `requestDynamics` retornar `dynamicsState` do state local

### 🟢 Prioridade Baixa
20. Socket `updateMeterConfig`, `updateOpenBrowser`
21. Socket `syncPan`
22. Socket `resetDmx` — conectar `dmx.rs`
23. Porta configurável (atualmente hardcoded 3001)
24. Auto-open browser no boot
25. Implementar SyncManager completo (download scenes + params + names da mesa)
