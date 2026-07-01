# Plano de Implementação: Monitoramento de Áudio (Ouvir Áudio)

Este documento detalha a arquitetura e as regras de implementação para adicionar streaming de áudio do servidor para o frontend, permitindo que o operador ouça o que está sendo capturado pelo microfone do servidor (conectado à saída de monitor/auxiliar da mesa 01V96).

---

## 1. Visão Geral do Fluxo

### 1.1 Conceito

Um novo botão "Ouvir áudio" é adicionado à interface. Ao clicar, abre um modal com opções de configuração e início do streaming. O áudio é capturado pelo mesmo pipeline do RTA (cpal no servidor), mas em vez de apenas calcular FFT, também envia chunks de áudio (PCM raw ou comprimido via Opus) para o frontend reproduzir.

### 1.2 Estados possíveis

| Estado | Descrição |
|---|---|
| **IDLE** | Nenhuma captura de áudio rodando para monitoramento |
| **ACTIVE_PCM** | Monitoramento ativo, enviando PCM raw |
| **ACTIVE_OPUS** | Monitoramento ativo, enviando Opus comprimido |
| **STOPPING** | Desligamento em andamento (aguardando confirmação de parada) |

### 1.3 Relação com o RTA (compartilhamento de pipeline)

O monitoramento **não** abre uma segunda captura cpal se o RTA já estiver capturando do dispositivo do servidor. Em vez disso, ele "espia" o mesmo buffer de áudio que o RTA já está processando.

| Cenário RTA | Ação ao ativar monitoramento |
|---|---|
| **RTA = ON, device = SERVIDOR** | Reaproveita o cpal já rodando. Anexa um buffer acumulador paralelo para áudio |
| **RTA = ON, device = LOCAL** | Abre um NOVO cpal no servidor (stream independente) |
| **RTA = OFF** | Abre um cpal no servidor (apenas para monitoramento) |

---

## 2. Estrutura de Dados

### 2.1 config.json (novas chaves)

```json
{
  "monitoring_buffer_size": 960,
  "monitoring_format": "pcm"
}
```

| Chave | Tipo | Padrão | Descrição |
|---|---|---|---|
| `monitoring_buffer_size` | int | 960 | Samples por chunk de áudio. Valores típicos: 480 (10ms), 960 (20ms), 1920 (40ms). Valores menores = menor latência, maior bandwidth |
| `monitoring_format` | string | `"pcm"` | `"pcm"` para PCM raw F32, `"opus"` para Opus comprimido |

- Lido **toda vez que uma captura inicia**
- Se não existir ou for inválido → usar valor padrão (960 / `"pcm"`) e escrever no json para manter config correta salva para que o valor, no caso de inválido, nao volte a dar problema.
- Editado pelo modal → salvo imediatamente no config.json + aplicado em tempo real

### 2.2 Config (Rust) — monitoramento

```rust
pub struct MonitoringConfig {
    pub buffer_size: usize,   // samples por chunk
    pub format: MonitoringFormat,
}

pub enum MonitoringFormat {
    Pcm,   // PCM raw F32, sem compressão
    Opus,  // Opus comprimido via opus-rs
}
```

Adicionar estes campos ao struct `RtaConfig` existente (ou criar struct separada `MonitoringConfig` referenciada por `AppState`).

---

## 3. Implementação no Servidor (Rust)

### 3.1 Dependências

**Cargo.toml — server_rust:**

```toml
opus-rs = "0.1"     # Pure Rust Opus encoder (restsend)
```

- `opus-rs` é pure Rust, sem dependência C, compila em qualquer plataforma
- Benchmarks mostram performance igual ou superior ao C libopus

### 3.2 rta_manager.rs — modificações

O `RtaManager` já gerencia o ciclo de vida do cpal. As modificações devem:

#### 3.2.1 Acumulador duplo no callback

O callback do cpal (`move |data: &[f32], _| { }`) deve gerenciar **dois** buffers acumuladores independentes:

```
cpal callback(data: &[f32])
  │
  ├── fft_buffer += data
  │   └── fft_buffer.len() >= config.fft_size (ex: 4096)
  │       → FFT → rtaData (existente)
  │       → fft_buffer.drain(0..fft_size)
  │
  └── [SE monitoring ativo]
      audio_buffer += data
      └── audio_buffer.len() >= monitoring_config.buffer_size
          ├── monitoring_config.format == Pcm
          │   → tx.try_send(MonitoringPacket::Pcm(audio_buffer.drain(..)))
          └── monitoring_config.format == Opus
              → opus_rs::Encoder::encode(&audio_buffer, ...)
              → tx.try_send(MonitoringPacket::Opus(packet_bytes))
              → audio_buffer.clear()
```

**Regras importantes:**

- `fft_buffer` e `audio_buffer` são `Vec<f32>` independentes, cada um com seu threshold
- O buffer de áudio **não** interfere no buffer do FFT — cada um acumula separadamente
- `monitoring_buffer_size` **não** precisa ser múltiplo do chunk que o cpal entrega
- Se `monitoring_format` mudar durante a execução (usuário trocou PURO ↔ COMPRIMIDO):
  1. Descartar `audio_buffer` atual
  2. Resetar contagem
  3. Se Opus → criar novo `Encoder`
  4. Se PCM → simplesmente enviar raw daí em diante
- `opus_rs::Encoder` deve ser criado com: sample rate do dispositivo, mono, `Application::Audio` (música) ou `Application::Voip` (fala — menor latência)

#### 3.2.2 Canal de comunicação

Usar um segundo `tokio::sync::mpsc` paralelo ao do FFT:

```rust
let (monitoring_tx, monitoring_rx) = tokio::sync::mpsc::channel::<MonitoringMessage>(256);
```

Os tipos de mensagem:

```rust
enum MonitoringMessage {
    Pcm(Vec<f32>),           // Chunk de áudio PCM raw
    Opus(Vec<u8>),           // Chunk de áudio Opus comprimido
    Config(MonitoringConfig), // Mudança de configuração em tempo real
    Stop,                     // Sinal para parar o monitoring
}
```

#### 3.2.3 Tokio task de forwarding (nova)

Criar uma task tokio que lê de `monitoring_rx` e emite via Socket.IO:

```rust
tokio::spawn(async move {
    while let Some(msg) = monitoring_rx.recv().await {
        match msg {
            MonitoringMessage::Pcm(data) => {
                let _ = io.emit("rtaAudio", ("pcm", &data));
            }
            MonitoringMessage::Opus(data) => {
                let _ = io.emit("rtaAudio", ("opus", &data));
            }
            MonitoringMessage::Stop => break,
            _ => {}
        }
    }
});
```

### 3.3 socket_handlers.rs — novos eventos

Adicionar handlers para:

| Evento | Payload | Ação |
|---|---|---|
| `rtaAudioControl` | `{ action: "start", deviceName: string\|null, format: "pcm"\|"opus", bufferSize: number }` | Inicia monitoramento |
| `rtaAudioControl` | `{ action: "stop" }` | Para monitoramento |
| `rtaAudioControl` | `{ action: "reconfig", format: "pcm"\|"opus", bufferSize: number }` | Altera config ao vivo |
| `rtaAudioControl` | `{ action: "getStatus" }` | Retorna status atual via `rtaAudioStatus` |
| `rtaAudioHeartbeat` | (sem payload) | Heartbeat a cada 2s para watchdog |

| Resposta (server → client) | Payload | Quando |
|---|---|---|
| `rtaAudioStatus` | `{ active: bool, format: string, bufferSize: number, sampleRate: number }` | Em resposta a `getStatus` ou quando estado muda |
| `rtaAudioControl` | `{ status: "started"\|"stopped"\|"reconfigured" }` | Confirmação de ação |
| `rtaAudioError` | `{ error: string }` | Erro ao iniciar/processar áudio |

### 3.4 Lógica de decisão no handler `start`

```rust
fn handle_start_monitoring(device_name, format, buffer_size, state) {
    if state.rta_active && state.rta_device == device_name {
        // REAPROVEITAR: o cpal já está rodando
        // Anexar monitoring_buffer ao RtaManager existente
        state.rta_manager.attach_monitoring(format, buffer_size);
    } else {
        // INICIAR NOVO: abrir cpal no servidor
        state.rta_manager.start_monitoring(device_name, format, buffer_size);
    }
}
```

### 3.5 Watchdog

Reaproveitar o mesmo padrão do watchdog do RTA:
- Cliente envia `rtaAudioHeartbeat` a cada 2s
- Servidor checa a cada 1s; se sem heartbeat por 5s → para monitoramento automaticamente
- Emite `rtaAudioControl { status: "stopped" }` ao parar

---

## 4. Implementação no Cliente (Frontend)

### 4.1 Modal "Ouvir Áudio"

Criar no HTML (`public/index.html`) um modal:

```html
<div class="modal-overlay styled-monitoringModal" id="monitoringModal">
  <div class="modal-content">
    <p class="config-modal-title">Monitoramento de Áudio</p>

    <!-- Dispositivo (label somente leitura, vindo do RTA ou selecionado) -->
    <p>Dispositivo: <span id="monitoringDeviceDisplay">---</span></p>

    <!-- Formato: dois botões de toggle -->
    <div>
      <button class="btn-format" data-format="pcm">PURO</button>
      <button class="btn-format" data-format="opus">COMPRIMIDO</button>
    </div>

    <!-- Buffer size (input numérico) -->
    <div>
      <label>Buffers (samples):</label>
      <input type="number" id="monitoringBufferSize" min="120" max="3840" step="120" />
      <p class="helper-text">Valores menores = menos latência, maior uso de rede</p>
    </div>

    <!-- Botão de ação -->
    <div class="modal-actions">
      <button id="monitoringActionBtn">ATIVAR</button>
      <button class="btn-close" onclick="fecharModalMonitoramento()">CANCELAR</button>
    </div>
  </div>
</div>
```

#### 4.1.1 Comportamento do modal

- Se **já ativo** → botão de ação mostra "DESATIVAR" (e desativa o monitoring ao clicar)
- Se **inativo** → botão mostra "ATIVAR" (e inicia)
- Os botões de formato (PURO / COMPRIMIDO) devem refletir o formato atual salvo no `monitoring_format` do config
- Ao trocar o formato **enquanto ativo** → deve chamar `reconfig` no servidor, que troca o encoding ao vivo

#### 4.1.2 Modal, ler dados iniciais

Ao abrir o modal:

1. Buscar `monitoring_device` do localStorage (default: string vazia → servidor escolhe o padrão)
2. Buscar `monitoring_format` e `monitoring_buffer_size` do config (via última resposta de `portsList` ou do `rtaConfig`)
3. Se RTA estiver ativo e device = servidor → exibir "Microfone do Servidor (compartilhado com RTA)"
4. Se não → exibir "Microfone do Servidor"
5. Ao trocar `buffer_size` e confirmar:
   - Salvar no config.json via socket `updateMonitoringConfig`
   - Se monitoring ativo → enviar `reconfig` com novo `bufferSize`
   - Se inativo → apenas atualizar o config, surtirá efeito na próxima ativação

### 4.2 Player de Áudio

#### 4.2.1 AudioContext + Estrutura de Reprodução

Criar no `rta.js` (ou novo módulo `monitoring.js`) um sistema de player:

**Para PCM raw:**

```javascript
class PcmPlayer {
    constructor(sampleRate) {
        this.context = new AudioContext({ sampleRate });
        this.ringBuffer = [];  // ou AudioBuffer circular
        this.isPlaying = false;
    }

    feedPcm(chunk) {
        // chunk: Float32Array (amostras PCM)
        // 1. Criar AudioBuffer com o chunk
        // 2. Agendar para tocar via AudioBufferSourceNode
        // 3. Gerenciar fila para evitar underrun/overrun
    }

    start() { /* resume AudioContext */ }
    stop() { /* close AudioContext, limpar buffers */ }
}
```

**Estratégia de playback (sem AudioWorklet):**

Usar `AudioBufferSourceNode` encadeados com `onended`:
1. Manter `AudioContext` único e compartilhado com o RTA (se existir)
2. Para cada chunk recebido, criar um `AudioBuffer`, preencher com os samples, criar `AudioBufferSourceNode` agendado no tempo correto
3. Controlar latência mantendo fila de 2-3 chunks pré-agendados
   - Se a fila ficar vazia → pausa momentânea (underrun)
   - Se a fila crescer demais → descartar chunks mais velhos (overrun)
4. Ao fechar, chamar `context.close()`

**Para Opus (via WebCodecs):**

```javascript
class OpusPlayer {
    constructor(sampleRate) {
        this.context = new AudioContext({ sampleRate });
        this.decoder = new AudioDecoder({
            output: (frame) => this.onFrame(frame),
            error: (e) => console.error('Opus decode error', e)
        });
        this.decoder.configure({
            codec: 'opus',
            sampleRate: sampleRate,
            numberOfChannels: 1
        });
        this.timestamp = 0;
    }

    feedOpus(packet) {
        // packet: Uint8Array (Opus packet)
        const chunk = new EncodedAudioChunk({
            type: 'key',
            timestamp: this.timestamp,
            duration: this.frameDurationMicros,
            data: packet
        });
        this.decoder.decode(chunk);
        this.timestamp += this.frameDurationMicros;
    }

    onFrame(frame) {
        // frame: AudioData
        // Converter para AudioBuffer e agendar playback
        // (mesma lógica do PcmPlayer)
    }
}
```

**Fallback para navegadores sem WebCodecs:**

Usar o módulo WASM existente (`client_wasm`) para decodificar Opus:

1. Adicionar `opus-rs` como dependência do `client_wasm`
2. Expor função `decodeOpus(packet: &[u8]) -> Vec<f32>` via wasm-bindgen
3. No JS: se `window.AudioDecoder` não existir → usar fallback WASM
4. O restante do pipeline (playback via AudioBufferSourceNode) é idêntico

#### 4.2.2 Evento `rtaAudio` handler

No `socket.js` ou `rta.js`:

```javascript
socket.on('rtaAudio', ({ format, data }) => {
    if (!window.audioPlayer) return;

    if (format === 'pcm') {
        // data: Float32Array (vem automaticamente com socket.io binary)
        window.audioPlayer.feedPcm(data);
    } else if (format === 'opus') {
        // data: Uint8Array (Opus packet)
        window.audioPlayer.feedOpus(data);
    }
});
```

### 4.3 UI: Botão "Ouvir Áudio"

Adicionar no HTML ou no módulo apropriado (ex: dentro do modal do RTA, ou na dock de botões da sidebar).

#### 4.3.1 Localização sugerida

O botão deve ficar acessível mas não poluir a interface. Sugestões:

1. **Dentro do modal RTA** — como uma seção adicional "Monitoramento" no final
2. **Na dock de botões** (renderDock) — como um botão extra quando em modo `main`
3. **Como um botão na sidebar** (semelhante ao MACROS)

### 4.4 Persistência (localStorage)

| Chave | Descrição |
|---|---|
| `monitoring_device` | Nome do último dispositivo de áudio do servidor selecionado |
| `monitoring_format` | Último formato escolhido (`"pcm"` ou `"opus"`) |
| `monitoring_buffer_size` | Último buffer size escolhido |

---

## 5. Troca de Formato ao Vivo

Quando o usuário clica no botão de formato **enquanto o monitoring já está ativo**:

1. **Frontend:** Envia `rtaAudioControl { action: "reconfig", format: "opus", bufferSize: 960 }`
2. **Servidor:** No handler:
   - Se `format` mudou → se for Opus, criar novo `Encoder`; se for PCM, apenas mudar flag
   - Se `bufferSize` mudou → descartar `audio_buffer` atual, zerar contagem
   - Aplicar nova config imediatamente no próximo chunk do cpal
3. **Servidor:** Envia `rtaAudioControl { status: "reconfigured" }` como confirmação
4. **Frontend:** Ao receber confirmação → troca o player (ou reconfigure o decoder)
5. **AudioContext** não precisa ser recriado — apenas o decoder muda

**Cuidado:** enquanto a transição ocorre, pode haver perda de áudio de ~1-2 chunks (~20-40ms). Aceitável para monitoração.

---

## 6. Tabela de Arquivos Modificados

| Arquivo | Tipo | O que fazer |
|---|---|---|
| `server_rust/Cargo.toml` | Rust | Adicionar `opus-rs = "0.1"` |
| `server_rust/src/rta_manager.rs` | Rust | Adicionar buffer paralelo de áudio, encoder Opus, canal mpsc de monitoring |
| `server_rust/src/socket_handlers.rs` | Rust | Adicionar handlers `rtaAudioControl`, `rtaAudioHeartbeat`, emitir `rtaAudio` |
| `server_rust/src/config.rs` | Rust | Adicionar `monitoring_buffer_size`, `monitoring_format` ao config |
| `public/index.html` | HTML | Adicionar modal `monitoringModal` com seletor de formato + buffer size |
| `public/modules/rta.js` | JS | Adicionar `PcmPlayer` e/ou `OpusPlayer`, handler `rtaAudio`, heartbeat |
| `public/modules/sidebar.js` | JS | Adicionar botão "Ouvir áudio" no dock |
| `public/modules/socket.js` | JS | Adicionar handler `rtaAudio`, `rtaAudioStatus`, `rtaAudioError` |
| `public/modules/eq.js` | JS | Adicionar referência ao modal de monitoring (opcional, se o botão ficar no EQ) |
| `client_wasm/Cargo.toml` | Rust (WASM) | _Opcional_: adicionar `opus-rs` como fallback de decode |
| `client_wasm/src/lib.rs` | Rust (WASM) | _Opcional_: expor `decodeOpus()` para fallback |

---

## 7. Fluxo Completo (Exemplo)

```
1. Usuário clica "Ouvir áudio" na dock
2. Modal abre:
   - Dispositivo: "Microfone do Servidor (compartilhado com RTA)" (RTA já capturando)
   - Formato: PURO (selecionado)
   - Buffer: 960 (input numérico)
3. Usuário clica ATIVAR
4. Frontend → Server: rtaAudioControl { action: "start", format: "pcm", bufferSize: 960 }
5. Servidor detecta: RTA ativo + device = servidor → espia buffer existente
6. Servidor anexa monitoring_buffer ao callback do cpal
7. A cada 960 samples, servidor envia: rtaAudio ("pcm", Float32Array)
8. Frontend recebe → PcmPlayer.feedPcm(data) → agenda AudioBufferSourceNode
9. Áudio começa a tocar nos alto-falantes/fone

10. Usuário troca formato para COMPRIMIDO (sem desativar)
11. Frontend → Server: rtaAudioControl { action: "reconfig", format: "opus", bufferSize: 960 }
12. Servidor: descarta audio_buffer, cria OpusEncoder, começa a enviar pacotes Opus
13. Frontend: troca PcmPlayer por OpusPlayer (ou reconfigure)
14. Áudio continua tocando com ~5s de gap (o OpusPlayer faz o decode)

15. Usuário fecha modal ou clica DESATIVAR
16. Frontend → Server: rtaAudioControl { action: "stop" }
17. Servidor: remove monitoring_buffer, para de enviar rtaAudio
18. Se RTA ainda estiver ativo → cpal continua rodando (RTA ainda precisa)
19. Se RTA não estiver ativo → para captura cpal
20. Frontend: close() no AudioContext, limpa buffers
```

---

## 8. Observações Finais

- **Latência PCM:** esperada ~30-60ms (cpal buffer + WebSocket + scheduler AudioContext). Aceitável para monitoração
- **Latência Opus:** +20ms de encoding + decode. Total ~50-80ms
- **Bandwidth PCM:** 48kHz mono F32 = ~192 KB/s. Em LAN, irrelevante
- **Bandwidth Opus:** 32 kbps = ~4 KB/s. Ideal para acesso remoto
- **opus-rs** é pure Rust e compila sem C toolchain — usar features default
- O watchdog (5s sem heartbeat) protege contra o usuário fechar o navegador e esquecer o monitoring ligado
- O fallback WASM para decode Opus (`client_wasm`) é opcional e pode ser implementado numa segunda fase
