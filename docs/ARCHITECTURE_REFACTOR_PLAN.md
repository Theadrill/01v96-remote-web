# 🏗️ Plano Diretor de Refatoração Arquitetural — 01v96-Bridge

> **Documento de referência única para qualquer IA/desenvolvedor implementar a refatoração do zero.**  
> Leia este documento inteiro antes de tocar em qualquer arquivo.

---

## 📌 O Problema

O `server.js` é um **God Object** com +1.100 linhas. Ele mistura:
- Leitura bruta de MIDI (bytes crus da porta USB)
- Parser e lógica de protocolo Yamaha
- Express HTTP + WebSockets (Socket.io)
- Git sync automático
- Gerenciamento de estado da mesa
- Timers de meter (41ms)

**Consequência técnica:** o cabo USB-MIDI da 01V96 tem buffer limitado. Quando recebemos dumps de cenas e meters ao mesmo tempo, os bytes se misturam, corrompendo mensagens SysEx e causando valores errados no sync (ex: posição de fader do Canal 1 vai para o Canal 2).

---

## 🎯 A Solução Escolhida

**Monolito Modular com Motor Híbrido** — explicitamente **não** Clean Architecture pura.

A razão: precisamos de controle cirúrgico sobre o timing e a ordem de envio MIDI. Clean Architecture adicionaria camadas de abstração que atrapalhariam esse controle fino. A solução é modular, mas procedural dentro de cada módulo.

---

## 🗺️ Diagrama do Sistema Final

```
[Mesa Yamaha 01V96]
       |
       | bytes crus (fragmentados, com ruído 0xFE/0xFD/0xF8)
       ↓
[MidiAssembler]  ← src/midi-assembler.js
   Monta SysEx completo F0...F7
   Descarta Active Sensing e Clock bytes
       |
       | SysEx completo e limpo
       ↓
[protocol.parseIncoming()]  ← src/protocol.js  (NÃO MEXER)
   Traduz bytes para objeto { type, channel, value }
       |
       ↓
[handleMIDIData()]  ← server.js
   Roteia para stateManager, sceneManager, io.emit
       |
       ↓
[stateManager]  ← src/state-manager.js  (NÃO MEXER)
[io.emit('update')]  → Clientes Web

──────────────────────────────────────────────

[Clientes Web / Socket.io]
       |
       | comandos de controle (faders, botões, etc)
       ↓
[midiEngine.send(sysex, priority)]  ← src/midi-engine.js
       |
       ↓
[MidiScheduler]  ← src/midi-scheduler.js
   3 filas com prioridade rígida
       |
       | 1 pacote por tick (5ms)
       ↓
[Mesa Yamaha 01V96]
```

---

## 📁 Estrutura de Arquivos Final Esperada

```
server.js                        ← Coordenador (O seu "God Object" original)
src/
  midi-assembler.js              ← FASE 1: Criar do zero (Coração da segurança de entrada)
  midi-engine.js                 ← Refatorar (Se não existir, extraia a lógica de midi.Input/Output do server.js para aqui)
  midi-scheduler.js              ← FASE 2: Criar do zero (Substitui qualquer lógica de envio direto)
  sync-manager.js                ← FASE 3A: Criar do zero (Extraia a lógica de loops de sync do server.js)
  api/
    macros.js                    ← FASE 3B: Criar do zero (Extraia todos os endpoints /api/macros do server.js)

### 📦 Módulos de Lógica (Devem existir ou ser extraídos)
Se os arquivos abaixo não existirem no seu commit, extraia a lógica correspondente do `server.js`:
- **protocol.js**: Toda a lógica de montagem/parsing de Hexadecimal/SysEx.
- **state-manager.js**: Onde fica a variável `state = { channels: ... }`.
- **scene_manager.js**: Lógica de `fetchScenes` e biblioteca de cenas.
- **master-meter.js**: Lógica de parsing do comando 0x21 da Yamaha.
- **property-map.js / dictionary.js**: Mapas de endereços da mesa.

```

> **ATENÇÃO:** `src/midi-pipeline.js` é um arquivo legado que deve ser **deletado** ao final. Antes de deletar, confirme com `grep -r "midi-pipeline" .` que não é importado em lugar nenhum.

---

## 🛠️ Regras Absolutas (Não Violar)

1. **Mapeamento de Lógica**: Se você (IA) verificar que uma lógica (ex: Sync, Names, API) ainda está dentro do `server.js`, sua missão é **extrair** para o módulo correspondente em `src/`.
2. **Não toque no Protocolo**: Não mude a conversão de bytes em `protocol.js` ou os endereços em `dictionary.js` a menos que seja para corrigir bugs de mapeamento.
3. **Toda escrita MIDI deve passar pelo `midiEngine.send(msg, priority)`**. Nunca use `output.sendMessage()` fora do `midi-engine.js`.
4. **Respeite os Singletons**: Arquivos como `state-manager.js` e `scene_manager.js` devem exportar uma instância única (ex: `module.exports = new SceneManager()`).
5. **Fases Estritas**: Execute uma fase, teste e valide antes de passar para a próxima.


---

## 🛠️ Fase 1 — O Escudo Anti-Colisão (`src/midi-assembler.js`)

### Objetivo
Impedir que bytes fragmentados ou corrompidos do cabo USB entrem no `protocol.js`. A porta MIDI entrega mensagens em pedaços, e a Yamaha 01V96 injeta bytes de ruído (Active Sensing `0xFE`, Clock `0xF8`, `0xFD`) no meio do fluxo.

### Arquivo a Criar: `src/midi-assembler.js`

```js
const IGNORED_BYTES = new Set([0xFE, 0xFD, 0xF8]);

class MidiAssembler {
  constructor(callback) {
    this.buffer = [];
    this.callback = callback;
    this.inSysEx = false;
  }

  processInput(rawBytesArray) {
    for (const byte of rawBytesArray) {
      if (byte === 0xF0) {
        this.buffer = [0xF0];
        this.inSysEx = true;
        continue;
      }

      if (!this.inSysEx) continue;

      if (IGNORED_BYTES.has(byte)) continue; // Descarta Active Sensing e Clock

      this.buffer.push(byte);

      if (byte === 0xF7) {
        const completeMessage = [...this.buffer];
        this.buffer = [];
        this.inSysEx = false;
        if (this.callback) {
          this.callback(completeMessage);
        }
      }
    }
  }

  reset() {
    this.buffer = [];
    this.inSysEx = false;
  }
}

module.exports = MidiAssembler;
```

### Integração no `src/midi-engine.js`

O `midi-engine.js` deve instanciar o `MidiAssembler` no `connectPorts()` e substituir o `input.on('message', ...)` antigo:

```js
const MidiAssembler = require('./midi-assembler');

// Dentro de connectPorts():
assembler = new MidiAssembler((completeSysEx) => {
    if (messageCallback) {
        messageCallback({ type: 'HEARTBEAT' }); // atualiza watchdog
        const translated = protocol.parseIncoming(completeSysEx);
        if (translated) {
            messageCallback(translated, completeSysEx);
        } else {
            messageCallback({ type: 'RAW_MIDI' }, completeSysEx);
        }
    }
});

input.on('message', (delta, message) => {
    assembler.processInput(Array.from(message));
});
```

**Resultado:** O `handleMIDIData()` no `server.js` nunca mais vê bytes fragmentados.

---

## 🛠️ Fase 2 — O Despachador Tático (`src/midi-scheduler.js`)

### Objetivo
Assumir controle **absoluto e exclusivo** de todo envio MIDI. Ninguém mais chama métodos de envio diretos. Tudo passa pela fila de prioridades.

### As 3 Filas e suas Regras

| Fila | Priority | O que vai aqui | Regra especial |
|------|----------|----------------|----------------|
| `q0` | 0 | Ações do usuário (faders, botões, sysex manual) | **Coalescência**: substitui pacote com mesmo endereço em vez de acumular |
| `q1` | 1 | Sync bulk / pedidos de parâmetro em startup | Bloqueia q2 enquanto houver itens |
| `q2` | 2 | Meters (polling de telemetria) | **Drop silencioso** se q0 ou q1 não estiverem vazias |

### Arquivo a Criar: `src/midi-scheduler.js`

```js
class MidiScheduler {
    constructor(midiEngine) {
        this.midiEngine = midiEngine;
        this.q0 = [];
        this.q1 = [];
        this.q2 = [];
        this.interval = null;
        this.tickMs = 5; // 5ms intencional — não aumentar (explica abaixo)
        this.isRunning = false;
        this.totalProcessed = 0;
        this.onQ1Empty = null;
        this._q1WasProcessing = false;
    }

    enqueue(bytesArray, priority) {
        if (!bytesArray || bytesArray.length === 0) return false;

        switch (priority) {
            case 0: return this._enqueueP0(bytesArray);
            case 1: return this._enqueueP1(bytesArray);
            case 2: return this._enqueueP2(bytesArray);
            default: return false;
        }
    }

    _enqueueP0(bytes) {
        // Coalescência: se já existe pacote com mesmo endereço, substitui
        const addr = this._extractAddress(bytes);
        if (addr) {
            const idx = this.q0.findIndex(item => this._extractAddress(item) === addr);
            if (idx !== -1) {
                this.q0[idx] = bytes;
                return true;
            }
        }
        this.q0.push(bytes);
        return true;
    }

    _enqueueP1(bytes) {
        this.q1.push(bytes);
        return true;
    }

    _enqueueP2(bytes) {
        // Drop silencioso se q0 ou q1 tiverem algo
        if (this.q0.length > 0 || this.q1.length > 0) {
            return false;
        }
        this.q2.push(bytes);
        return true;
    }

    _extractAddress(bytes) {
        // Extrai endereço de SysEx Yamaha: device + bytes 4-6
        if (bytes.length >= 6 && bytes[0] === 0xF0 && bytes[1] === 0x43) {
            const dev = bytes[3] & 0x0F;
            const addr = bytes.slice(4, 7);
            return `${dev}-${addr.map(b => b.toString(16)).join('-')}`;
        }
        return null;
    }

    start() {
        if (this.isRunning) return;
        this.isRunning = true;
        this.interval = setInterval(() => this._tick(), this.tickMs);
    }

    stop() {
        if (this.interval) {
            clearInterval(this.interval);
            this.interval = null;
        }
        this.isRunning = false;
    }

    _tick() {
        let packet = null;

        if (this.q0.length > 0) {
            packet = this.q0.shift();
            // IMPORTANTE: NÃO seta _q1WasProcessing aqui
        } else if (this.q1.length > 0) {
            packet = this.q1.shift();
            this._q1WasProcessing = true; // ← APENAS quando consome q1
        } else if (this.q2.length > 0) {
            packet = this.q2.shift();
            // IMPORTANTE: NÃO seta _q1WasProcessing aqui
        }

        if (packet) {
            this.midiEngine.send(packet);
            this.totalProcessed++;
        } else {
            // Fila vazia: verifica se devemos disparar callback de conclusão de q1
            if (this._q1WasProcessing && this.onQ1Empty) {
                this.onQ1Empty();
                this._q1WasProcessing = false;
            }
        }
    }

    clear(priority) {
        switch (priority) {
            case 0: this.q0 = []; break;
            case 1: this.q1 = []; break;
            case 2: this.q2 = []; break;
            default:
                this.q0 = [];
                this.q1 = [];
                this.q2 = [];
        }
    }

    getStats() {
        return {
            q0: this.q0.length,
            q1: this.q1.length,
            q2: this.q2.length,
            totalProcessed: this.totalProcessed,
            isRunning: this.isRunning
        };
    }
}

module.exports = MidiScheduler;
```

### ⚠️ Por que `tickMs = 5ms` e não 15-20ms como em planejamentos anteriores

O plano original sugeria 15-20ms, mas em prática isso tornava o sync de 32 canais + EQ + Dynamics extremamente lento (vários minutos). O `midi-pipeline.js` legado usava 41ms e era inaceitável. Com 5ms, enviamos 1 pacote a cada 5ms e a mesa suporta bem esse ritmo. **Não aumentar o tickMs.**

### Integração no `src/midi-engine.js`

```js
const MidiScheduler = require('./midi-scheduler');

// Dentro de connectPorts():
if (!scheduler) {
    scheduler = new MidiScheduler({ send: (msg) => sendDirect(msg) });
    scheduler.start();
}

// Função send() pública:
function send(msg, priority = 0) {
    if (scheduler && scheduler.isRunning) {
        return scheduler.enqueue(msg, priority);
    }
    return sendDirect(msg); // fallback se scheduler não iniciou
}

function getScheduler() {
    return scheduler;
}
```

### Integração no `server.js` (loop de meters)

O loop de meters que fica disparando a cada 41ms deve continuar existindo no `server.js`, mas agora chamando `midiEngine.send(pacote, 2)` — priority 2. O scheduler descartará automaticamente os meters enquanto houver sync (q1) ou ação do usuário (q0) em andamento:

```js
global.meterInterval = setInterval(() => {
    if (!isConnected) return;
    // Watchdog de inatividade...
    if (syncManager && !syncManager.isReady) return;

    midiEngine.send(masterMeter.buildRequest(), 2);       // priority 2 = meter
    midiEngine.send([...sysex_ch_meters...], 2);
}, 41);
```

---

## 🛠️ Fase 3A — Orquestrador de Sync (`src/sync-manager.js`)

### Objetivo
Extrair toda a lógica de sincronização bulk do `server.js` para uma classe dedicada. O `server.js` passa a chamar apenas `syncManager.fire()`.

### Arquivo a Criar: `src/sync-manager.js`

```js
const protocol = require('./protocol');
const stateManager = require('./state-manager');
const masterMeter = require('./master-meter');

class SyncManager {
    constructor(scheduler, io, sceneManager) {
        this.scheduler = scheduler;
        this.io = io;
        this.sceneManager = sceneManager;
        this.isSyncing = false;
        this.isFullySynced = true;
        this.hasSyncedNamesThisSession = false;
        this.onSyncComplete = null;
    }

    // fire(targetSocket, forceNames)
    // targetSocket: socket específico para receber o estado ao final (opcional)
    // forceNames: força re-sincronização de nomes mesmo que já feito nesta sessão
    fire(targetSocket = null, forceNames = false) {
        if (this.isSyncing) return;

        this.isSyncing = true;
        this.isFullySynced = false;

        if (this.io) {
            this.io.emit('syncStatus', true);
        }

        this._queueAllParams(forceNames, targetSocket);
    }

    _queueAllParams(forceNames, targetSocket) {
        const priority = 1;

        // Para os meters antes do sync
        this.scheduler.enqueue(masterMeter.buildStopRequest(), priority);

        // Fader e On do Stereo Master
        this.scheduler.enqueue(protocol.buildRequest('kStereoFader/kFader', 0), priority);

        // 32 Canais de Input
        for (let i = 0; i < 32; i++) {
            this.scheduler.enqueue(protocol.buildRequest('kInputFader/kFader', i), priority);
            this.scheduler.enqueue(protocol.buildRequest('kInputChannelOn/kChannelOn', i), priority);
            this.scheduler.enqueue(protocol.buildRequest('kSetupSoloChOn/kSoloChOn', i), priority);
            this.scheduler.enqueue(protocol.buildRequest('kInputPhase/kPhase', i), priority);
            this.scheduler.enqueue(protocol.buildRequest('kInputAttenuator/kAtt', i), priority);

            // EQ
            this.scheduler.enqueue(protocol.buildRequest('kInputEQ/kEQOn', i), priority);
            this.scheduler.enqueue(protocol.buildRequest('kInputEQ/kEQMode', i), priority);
            this.scheduler.enqueue(protocol.buildRequest('kInputEQ/kEQHPFOn', i), priority);
            this.scheduler.enqueue(protocol.buildRequest('kInputEQ/kEQLPFOn', i), priority);
            ['Low', 'LowMid', 'HiMid', 'Hi'].forEach(b => {
                this.scheduler.enqueue(protocol.buildRequest(`kInputEQ/kEQ${b}F`, i), priority);
                this.scheduler.enqueue(protocol.buildRequest(`kInputEQ/kEQ${b}G`, i), priority);
                this.scheduler.enqueue(protocol.buildRequest(`kInputEQ/kEQ${b}Q`, i), priority);
            });

            // AUX Sends (8 bandas)
            for (let a = 1; a <= 8; a++) {
                this.scheduler.enqueue(protocol.buildRequest(`kInputAUX/kAUX${a}Level`, i), priority);
                this.scheduler.enqueue(protocol.buildRequest(`kInputAUX/kAUX${a}On`, i), priority);
            }

            // Gate
            ['kGateOn', 'kGateAttack', 'kGateRange', 'kGateHold', 'kGateDecay', 'kGateThreshold'].forEach(p => {
                this.scheduler.enqueue(protocol.buildRequest(`kInputGate/${p}`, i), priority);
            });

            // Comp
            ['kCompOn', 'kCompAttack', 'kCompRelease', 'kCompRatio', 'kCompGain', 'kCompKnee', 'kCompThreshold'].forEach(p => {
                this.scheduler.enqueue(protocol.buildRequest(`kInputComp/${p}`, i), priority);
            });

            // Patch e Bus Assignments
            this.scheduler.enqueue(protocol.buildRequest('kChannelInput/kChannelIn', i), priority);
            this.scheduler.enqueue(protocol.buildRequest('kInputBus/kStereo', i), priority);
            for (let b = 1; b <= 8; b++) {
                this.scheduler.enqueue(protocol.buildRequest(`kInputBus/kBus${b}`, i), priority);
            }
        }

        // AUX Masters e Bus Masters (8 cada)
        for (let i = 0; i < 8; i++) {
            this.scheduler.enqueue(protocol.buildRequest('kAUXFader/kFader', i), priority);
            this.scheduler.enqueue(protocol.buildRequest('kAUXChannelOn/kChannelOn', i), priority);
            this.scheduler.enqueue(protocol.buildRequest('kBusFader/kFader', i), priority);
            this.scheduler.enqueue(protocol.buildRequest('kBusChannelOn/kChannelOn', i), priority);
        }

        // Stereo Master completo
        this.scheduler.enqueue(protocol.buildRequest('kStereoFader/kFader', 0), priority);
        this.scheduler.enqueue(protocol.buildRequest('kStereoChannelOn/kChannelOn', 0), priority);
        this.scheduler.enqueue(protocol.buildRequest('kStereoAttenuator/kAtt', 0), priority);
        this.scheduler.enqueue(protocol.buildRequest('kStereoEQ/kEQOn', 0), priority);
        ['Low', 'LowMid', 'HiMid', 'Hi'].forEach(b => {
            this.scheduler.enqueue(protocol.buildRequest(`kStereoEQ/kEQ${b}F`, 0), priority);
            this.scheduler.enqueue(protocol.buildRequest(`kStereoEQ/kEQ${b}G`, 0), priority);
            this.scheduler.enqueue(protocol.buildRequest(`kStereoEQ/kEQ${b}Q`, 0), priority);
        });
        ['kCompOn', 'kCompAttack', 'kCompRelease', 'kCompRatio', 'kCompGain', 'kCompKnee', 'kCompThreshold'].forEach(p => {
            this.scheduler.enqueue(protocol.buildRequest(`kStereoComp/${p}`, 0), priority);
        });

        // Nomes de canais (apenas na primeira sync da sessão, ou se forceNames=true)
        if (forceNames || !this.hasSyncedNamesThisSession) {
            for (let i = 0; i < 32; i++) {
                for (let c = 0; c < 4; c++) {
                    this.scheduler.enqueue(protocol.buildNameRequest(i, c), priority);
                }
            }
            // Outputs: AUX 36-43, Bus 44-51, Master 52
            const outIndices = [];
            for (let i = 36; i <= 43; i++) outIndices.push(i);
            for (let i = 44; i <= 51; i++) outIndices.push(i);
            outIndices.push(52);
            for (const idx of outIndices) {
                for (let c = 0; c < 8; c++) {
                    this.scheduler.enqueue(protocol.buildNameRequest(idx, c), priority);
                }
            }
        }

        this.hasSyncedNamesThisSession = true;

        // Registra callback para quando a q1 esvaziar
        const self = this;
        this.scheduler.onQ1Empty = function () {
            self._onQueueEmpty(targetSocket);
        };
    }

    _onQueueEmpty(targetSocket) {
        this.isSyncing = false;
        this.isFullySynced = true;

        if (this.io) {
            this.io.emit('syncStatus', false);
            this.io.emit('sync', stateManager.getState());
        }

        if (targetSocket && typeof targetSocket.emit === 'function') {
            targetSocket.emit('sync', stateManager.getState());
        }

        console.log('✅ [SyncManager] Sincronização concluída!');

        if (this.onSyncComplete) {
            this.onSyncComplete();
        }
    }

    // Sync apenas de nomes (para o evento 'refreshNames' do socket)
    syncNamesOnly() {
        if (this.isSyncing) return;

        this.isSyncing = true;
        this.isFullySynced = false;

        this.scheduler.enqueue(masterMeter.buildStopRequest(), 1);

        for (let i = 0; i < 32; i++) {
            for (let c = 0; c < 4; c++) {
                this.scheduler.enqueue(protocol.buildNameRequest(i, c), 1);
            }
        }

        const outIndices = [];
        for (let i = 36; i <= 43; i++) outIndices.push(i);
        for (let i = 44; i <= 51; i++) outIndices.push(i);
        outIndices.push(52);
        for (const idx of outIndices) {
            for (let c = 0; c < 8; c++) {
                this.scheduler.enqueue(protocol.buildNameRequest(idx, c), 1);
            }
        }

        const self = this;
        this.scheduler.onQ1Empty = function () {
            self.isSyncing = false;
            self.isFullySynced = true;
            if (self.io) {
                self.io.emit('sync', stateManager.getState());
            }
            console.log('✅ [SyncManager] Nomes sincronizados!');
        };
    }

    get isBusy() { return this.isSyncing; }
    get isReady() { return this.isFullySynced; }

    reset() {
        this.hasSyncedNamesThisSession = false;
    }
}

module.exports = SyncManager;
```

### Como instanciar no `server.js`

```js
const SyncManager = require('./src/sync-manager');

// Dentro de executarConexao(), após midiEngine.connectPorts():
syncManager = new SyncManager(midiEngine.getScheduler(), io, sceneManager);

// No evento de conexão estabelecida:
setTimeout(async () => {
    if (isConnected) {
        await sceneManager.fetchScenes(midiEngine);
        syncManager.fire(targetSocket);
    }
}, 5000);
```

---

## 🛠️ Fase 3B — Router de Macros (`src/api/macros.js`)

### Objetivo
Extrair todos os endpoints `/api/macros/*` e a lógica de Git sync do `server.js`.

### Arquivo a Criar: `src/api/macros.js`

```js
const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const os = require('os');
const { exec } = require('child_process');

// Raiz do projeto (dois níveis acima de src/api/)
const ROOT_DIR = path.join(__dirname, '..', '..');

// --- GIT SYNC ---
let gitSyncTimer = null;
let gitSyncQueue = new Set();

function triggerGitSync() {
    if (gitSyncQueue.size === 0) return;
    const filesToSync = Array.from(gitSyncQueue).join(' ');
    const hostname = os.hostname();
    const cmd = `git add ${filesToSync} && git commit -m "auto-sync: profiles updated from ${hostname}" && git pull --rebase --autostash && git push`;
    exec(cmd, { cwd: ROOT_DIR }, (error, stdout, stderr) => {
        gitSyncQueue.clear();
        if (error) {
            console.error(`❌ [NINJA SYNC] Erro: ${error.message}`);
            return;
        }
        console.log(`✅ [NINJA SYNC] GitHub Atualizado com Sucesso!`);
    });
}

// --- ENDPOINTS ---

router.get('/macros/hosts', (req, res) => {
    const hostsPath = path.join(ROOT_DIR, 'public/modules/macros', 'hosts.json');
    if (fs.existsSync(hostsPath)) {
        res.json(JSON.parse(fs.readFileSync(hostsPath, 'utf8')));
    } else {
        res.json([
            { match: '192.168.15.99', preset: 'pcmaria' },
            { match: 'pcfavela', preset: 'pcfavela' }
        ]);
    }
});

router.get('/macros', (req, res) => {
    const macrosDir = path.join(ROOT_DIR, 'public/modules/macros');
    if (!fs.existsSync(macrosDir)) fs.mkdirSync(macrosDir, { recursive: true });
    fs.readdir(macrosDir, (err, files) => {
        if (err) return res.status(500).json({ error: 'Erro ao listar mods' });
        const jsFiles = files
            .filter(f => f.endsWith('.js') && !f.includes('.server.js') && f !== 'core.js' && f !== 'macros.js')
            .map(f => f.replace('.js', ''));
        res.json(jsFiles);
    });
});

router.get('/macros/slots', (req, res) => {
    const preset = req.query.preset;
    const macrosDir = path.join(ROOT_DIR, 'public/modules/macros/profiles');
    const localDir = path.join(macrosDir, 'local');
    const sharedDir = path.join(macrosDir, 'shared');

    if (preset) {
        const localPath = path.join(localDir, `profile_${preset}.json`);
        const sharedPath = path.join(sharedDir, `profile_${preset}.json`);
        if (fs.existsSync(localPath)) return res.json(JSON.parse(fs.readFileSync(localPath, 'utf8')));
        if (fs.existsSync(sharedPath)) return res.json(JSON.parse(fs.readFileSync(sharedPath, 'utf8')));
        return res.json({});
    } else {
        const profiles = {};
        const scan = (dir) => {
            if (fs.existsSync(dir)) {
                fs.readdirSync(dir).forEach(f => {
                    if (f.startsWith('profile_') && f.endsWith('.json')) {
                        profiles[f.replace('profile_', '').replace('.json', '')] = true;
                    }
                });
            }
        };
        scan(sharedDir);
        scan(localDir);
        if (Object.keys(profiles).length === 0) profiles['default'] = true;
        res.json(profiles);
    }
});

router.post('/macros/slots', express.json(), (req, res) => {
    const preset = req.query.preset || 'default';
    const syncShared = req.query.syncShared === 'true';
    const macrosDir = path.join(ROOT_DIR, 'public/modules/macros/profiles');
    const localPath = path.join(macrosDir, 'local', `profile_${preset}.json`);
    const sharedPath = path.join(macrosDir, 'shared', `profile_${preset}.json`);

    try {
        const content = JSON.stringify(req.body, null, 2);
        if (!fs.existsSync(path.dirname(localPath))) fs.mkdirSync(path.dirname(localPath), { recursive: true });
        fs.writeFileSync(localPath, content);

        if (syncShared) {
            if (!fs.existsSync(path.dirname(sharedPath))) fs.mkdirSync(path.dirname(sharedPath), { recursive: true });
            fs.writeFileSync(sharedPath, content);
            const relativeSharedPath = path.relative(ROOT_DIR, sharedPath);
            gitSyncQueue.add(relativeSharedPath);
            if (gitSyncTimer) clearTimeout(gitSyncTimer);
            gitSyncTimer = setTimeout(triggerGitSync, 10000);
        }
        res.json({ success: true, preset, synced: syncShared });
    } catch (e) {
        res.status(500).json({ error: 'Erro ao salvar perfil' });
    }
});

router.post('/macros/swap', express.json(), (req, res) => {
    const preset = req.query.preset || 'default';
    const fromIndex = parseInt(req.body.from);
    const toIndex = parseInt(req.body.to);
    const macrosDir = path.join(ROOT_DIR, 'public/modules/macros/profiles');

    const handleSwap = (dir) => {
        const pPath = path.join(dir, `profile_${preset}.json`);
        if (fs.existsSync(pPath)) {
            try {
                let config = JSON.parse(fs.readFileSync(pPath, 'utf8'));
                const tFrom = config[fromIndex];
                const tTo = config[toIndex];
                delete config[fromIndex]; delete config[toIndex];
                if (tTo) config[fromIndex] = tTo;
                if (tFrom) config[toIndex] = tFrom;
                fs.writeFileSync(pPath, JSON.stringify(config, null, 2));
            } catch (e) {}
        }
    };

    handleSwap(path.join(macrosDir, 'local'));
    handleSwap(path.join(macrosDir, 'shared'));

    const sharedPath = path.join(macrosDir, 'shared', `profile_${preset}.json`);
    if (fs.existsSync(sharedPath)) {
        const relativeSharedPath = path.relative(ROOT_DIR, sharedPath);
        gitSyncQueue.add(relativeSharedPath);
        if (gitSyncTimer) clearTimeout(gitSyncTimer);
        gitSyncTimer = setTimeout(triggerGitSync, 10000);
    }

    res.json({ success: true });
});

router.delete('/macros/slots', (req, res) => {
    const preset = req.query.preset;
    if (!preset || preset === 'default') return res.status(400).json({ error: 'Preset inválido ou protegido' });

    const localPath = path.join(ROOT_DIR, 'public/modules/macros/profiles/local', `profile_${preset}.json`);
    const sharedPath = path.join(ROOT_DIR, 'public/modules/macros/profiles/shared', `profile_${preset}.json`);

    try {
        if (fs.existsSync(localPath)) fs.unlinkSync(localPath);
        if (fs.existsSync(sharedPath)) fs.unlinkSync(sharedPath);
        res.json({ success: true, deleted: preset });
    } catch (e) {
        res.status(500).json({ error: 'Erro ao deletar perfil' });
    }
});

router.get('/macros/config/:modId', (req, res) => {
    const preset = req.query.preset || 'default';
    const modId = req.params.modId;
    const filename = preset === 'default' ? `${modId}.json` : `${modId}_${preset}.json`;
    const macrosDir = path.join(ROOT_DIR, 'public/modules/macros/profiles');
    const localPath = path.join(macrosDir, 'local', filename);
    const sharedPath = path.join(macrosDir, 'shared', filename);

    if (fs.existsSync(localPath)) return res.json(JSON.parse(fs.readFileSync(localPath, 'utf8')));
    if (fs.existsSync(sharedPath)) return res.json(JSON.parse(fs.readFileSync(sharedPath, 'utf8')));
    res.json({});
});

router.post('/macros/config/:modId', express.json(), (req, res) => {
    const preset = req.query.preset || 'default';
    const modId = req.params.modId;
    const syncShared = req.query.syncShared === 'true';
    const filename = preset === 'default' ? `${modId}.json` : `${modId}_${preset}.json`;
    const macrosDir = path.join(ROOT_DIR, 'public/modules/macros/profiles');
    const localPath = path.join(macrosDir, 'local', filename);
    const sharedPath = path.join(macrosDir, 'shared', filename);

    try {
        const content = JSON.stringify(req.body, null, 2);
        if (!fs.existsSync(path.dirname(localPath))) fs.mkdirSync(path.dirname(localPath), { recursive: true });
        fs.writeFileSync(localPath, content);

        if (syncShared) {
            if (!fs.existsSync(path.dirname(sharedPath))) fs.mkdirSync(path.dirname(sharedPath), { recursive: true });
            fs.writeFileSync(sharedPath, content);
            const relativeSharedPath = path.relative(ROOT_DIR, sharedPath);
            gitSyncQueue.add(relativeSharedPath);
            if (gitSyncTimer) clearTimeout(gitSyncTimer);
            gitSyncTimer = setTimeout(triggerGitSync, 10000);
        }
        res.json({ success: true, mod: modId, preset, synced: syncShared });
    } catch (e) {
        res.status(500).json({ error: 'Erro ao salvar config do mod' });
    }
});

router.post('/macros/proxy/http', express.json(), async (req, res) => {
    const { url, options } = req.body;
    if (!url) return res.status(400).json({ error: 'URL inválida' });
    if (url.startsWith('file://')) return res.status(403).json({ error: 'Acesso a arquivos locais negado' });

    try {
        const response = await fetch(url, options);
        let rawData = await response.text();
        let data;
        try { data = JSON.parse(rawData); } catch (e) { data = rawData; }
        res.json({ status: response.status, data });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

router.post('/macros/proxy/udp', express.json(), (req, res) => {
    const dgram = require('dgram');
    const { host, port, data } = req.body;
    if (!host || !port || !data) return res.status(400).json({ error: 'Dados UDP incompletos' });

    const client = dgram.createSocket('udp4');
    const message = Buffer.from(typeof data === 'string' ? data : JSON.stringify(data));

    client.send(message, port, host, (err) => {
        client.close();
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
    });
});

module.exports = router;
```

### Como integrar no `server.js`

Substituir todos os endpoints `/api/macros*` e as variáveis `gitSyncTimer`, `gitSyncQueue`, `triggerGitSync` por:

```js
const macroRoutes = require('./src/api/macros');
app.use('/api', macroRoutes);
```

---

## 🗑️ Fase 3C — Deletar `midi-pipeline.js`

1. Rodar: `grep -r "midi-pipeline" .` na raiz do projeto
2. Se não houver nenhum `require`, deletar `src/midi-pipeline.js`

---

## 📋 Checklist de Implementação

Execute **na ordem**. Não avance se o item anterior tiver bug.

- [ ] **1.** Criar `src/midi-assembler.js` (código acima)
- [ ] **2.** Integrar `MidiAssembler` no `src/midi-engine.js` (`connectPorts` + `input.on`)
- [ ] **3.** Testar: conectar à mesa, verificar que SysEx chegam completos no `handleMIDIData`
- [ ] **4.** Criar `src/midi-scheduler.js` (código acima, atenção ao `_tick()`)
- [ ] **5.** Integrar `MidiScheduler` no `src/midi-engine.js` (`send()` + `getScheduler()`)
- [ ] **6.** Alterar o loop de meters no `server.js` para usar `midiEngine.send(pacote, 2)`
- [ ] **7.** Testar: mover fader → meters devem parar de piscar na tela (scheduler suprimindo prio 2)
- [ ] **8.** Criar `src/sync-manager.js` (código acima)
- [ ] **9.** Instanciar `SyncManager` no `executarConexao()` do `server.js`
- [ ] **10.** Remover toda lógica de sync inline do `server.js` (substituída pelo SyncManager)
- [ ] **11.** Testar: startup com conexão → sync completo de 32 canais sem pular canal 0
- [ ] **12.** Criar `src/api/macros.js` (código acima)
- [ ] **13.** Substituir todos os endpoints `/api/macros*` no `server.js` por `app.use('/api', macroRoutes)`
- [ ] **14.** Testar: todas as rotas de macros funcionando
- [ ] **15.** Confirmar com grep e deletar `src/midi-pipeline.js`
