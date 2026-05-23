# Plano de Implementação — MIDI Bridge over Network

## 1. Objetivo

Substituir a dependência de MIDI nativo (`node-midi` / ALSA sequencer) por um **endpoint de rede genérico** que receba e envie mensagens SysEx, permitindo que o servidor rode em ambientes sem suporte a MIDI físico (Android/Termux, containers, etc.) enquanto se comunica com uma mesa Yamaha 01V96 através de um bridge externo na rede.

## 2. Arquitetura Atual (a ser modificada)

```
Mesa Yamaha 01V96 (USB)
       ↕ SysEx
node-midi (ALSA/winmm/CoreMIDI)
       ↕
MidiAssembler → MidiHandler → StateManager → Socket.IO (web clients)
       ↕
MidiScheduler → node-midi → Mesa
```

## 3. Arquitetura Futura

```
[Bridge externo]
  Mesa 01V96 USB → App bridge (Windows/Linux/Android)
                      ↕ (SysEx serializado)
                   Network (TCP/UDP/WebSocket)
                           ↕
[Este servidor]
  NetworkListener (WebSocket Server / UDP / TCP)
       ↕
  MidiAssembler → MidiHandler → StateManager → Socket.IO (web clients)
       ↕
  MidiScheduler → NetworkListener → Mesa (via bridge)
```

## 4. Abordagem — Driver MIDI Abstrato

Criar uma **camada de abstração de transporte MIDI** que implemente a mesma interface que `midi-engine.js` expõe atualmente:

```js
interface MidiTransport {
  onMessage(callback: (sysEx: number[]) => void): void
  send(sysEx: number[]): boolean
  isConnected(): boolean
  getAvailablePorts(): { inputs: [], outputs: [] }
}
```

Dois drivers concretos:
- **`NativeMidiTransport`**: o atual `node-midi` (ALSA/winmm)
- **`NetworkMidiTransport`**: o novo driver de rede

O `server.js` escolhe o driver com base em config ou detecção de plataforma.

## 5. Estratégia de Implementação (Passo a Passo)

### Passo 1 — Abstrair a interface (`src/midi/midi-transport.js`)

- Definir a classe base/interface `MidiTransport`
- Refatorar `midi-engine.js` para usar um `MidiTransport` injetado
- Garantir que `MidiScheduler`, `MidiAssembler` e o resto do pipeline não precisem ser alterados (eles já trabalham com arrays de bytes)

### Passo 2 — Implementar `NetworkMidiTransport` (`src/midi/network-transport.js`)

Suportar múltiplos protocolos de transporte, configuráveis:

#### 2a. WebSocket Server (recomendado)
- Servidor WebSocket na porta 9000 (configurável)
- Bridge conecta como cliente WebSocket
- Formato: mensagens binárias ou JSON com array de bytes
- Vantagem: funciona em qualquer rede, inclusive browsers, fácil depuração

#### 2b. UDP Socket
- Escuta porta 9001 (configurável)
- SysEx enviado como datagramas
- Perda de pacotes tolerada pelo scheduler (re-request em caso de falha)
- Vantagem: baixa latência, ideal para LAN

#### 2c. TCP Socket
- Escuta porta 9002 (configurável)
- Conexão persistente com o bridge
- Vantagem: delivery garantido, sem perda

### Passo 3 — Configuração

Em `config.json`:

```json
{
  "midi_transport": "network",
  "network_listener": {
    "protocol": "websocket",
    "port": 9000,
    "host": "0.0.0.0"
  }
}
```

Opções de `protocol`: `"websocket"`, `"udp"`, `"tcp"`, `"native"`

### Passo 4 — Formato da Mensagem na Rede

Cada mensagem SysEx é transmitida como um frame simples:

**WebSocket (binário)**:
```
[0xF0, 0x43, 0x10, 0x3E, ... , 0xF7]  (raw bytes)
```

**WebSocket (texto/JSON)**:
```json
{"sysex": [240, 67, 16, 62, 127, 1, 28, 0, 0, 0, 0, 0, 127, 247]}
```

**UDP/TCP**:
```
[length: 2 bytes big-endian] [sysEx bytes...]
```

### Passo 5 — Bridge Externo (contraparte)

Documentar o protocolo para que qualquer cliente possa implementar o bridge:

- **Bridge Windows** (recomendado inicial): pequeno app Node.js ou Python que:
  1. Abre porta MIDI da Yamaha via `node-midi`/`python-rtmidi`
  2. Conecta ao WebSocket do servidor
  3. Encaminha todo tráfego recebido da mesa → WebSocket
  4. Encaminha todo tráfego recebido do WebSocket → mesa
- **Bridge Android**: app Java/Kotlin que usa USB MIDI (android.media.midi) e conecta ao WebSocket
- **Bridge Linux**: via `aseqnet`, `rtpmidi` ou script similar

## 6. Arquivos a Modificar / Criar

| Arquivo | Ação |
|---|---|
| `src/midi/midi-transport.js` | **CRIAR** — classe base/interface do transporte |
| `src/midi/network-transport.js` | **CRIAR** — NetworkMidiTransport (WebSocket + UDP + TCP) |
| `src/midi/midi-engine.js` | **MODIFICAR** — usar MidiTransport injetado |
| `src/core/config.js` | **MODIFICAR** — carregar config de transporte |
| `server.js` | **MODIFICAR** — instanciar driver correto no boot |
| `config.json` | **MODIFICAR** — adicionar seção `midi_transport` |
| `docs/ARCHITECTURE_REFACTOR_PLAN.md` | **ATUALIZAR** — incluir novo diagrama |
| `package.json` | **MODIFICAR** — adicionar `ws` (WebSocket server) |

## 7. Dependências

- `ws` — servidor WebSocket para Node.js (já compatível com Termux/proot)
- Nativas `dgram` (UDP) e `net` (TCP) já são built-in do Node.js

## 8. Teste

1. Modo demo continua funcionando sem alterações
2. Com `midi_transport: "network"` e sem bridge conectado, servidor inicializa mas aguarda conexão
3. Bridge de teste simulado via script Node.js que gera SysEx sintéticos (reaproveitar `meter_dummy.js`)
4. Teste real com bridge Windows apontando para a Yamaha física na rede

## 9. Observações

- O `MidiScheduler` envia e re-enfileira mensagens independente do transporte — ele não precisa saber se o destino é USB ou rede
- A latência adicional da rede (~1-5ms LAN) é irrelevante comparada ao polling de 41ms dos meters
- O watchdog de conexão (`connection.js`) deve monitorar também o transporte de rede, não apenas o MIDI físico
- Todo o estado, caching e lógica de negócio permanece inalterado — é puramente uma troca de driver na base da pirâmide
