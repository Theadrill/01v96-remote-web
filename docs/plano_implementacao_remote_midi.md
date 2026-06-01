# Plano de Implementação — Remote MIDI (v3 — Final)

> **REGRA ZERO — Ambiente Rust Portátil**
>
> O ambiente Rust nesta máquina está em **`D:\RustDev\`** (SSD limitado). **Antes de qualquer `cargo run`, `cargo build`, ou `cargo test`**, o modelo DEVE:
>
> 1. Verificar se `D:\RustDev\` existe
> 2. **Se existir** → setar as variáveis de ambiente antes de rodar cargo:
>    ```powershell
>    $env:RUSTUP_HOME = "D:\RustDev\.rustup"
>    $env:CARGO_HOME = "D:\RustDev\.cargo"
>    $env:PATH = "D:\RustDev\.cargo\bin;$env:PATH"
>    ```
>    Ou rodar via bat: `D:\RustDev\iniciar_rust.bat` (que abre cmd com ambiente configurado)
> 3. **Se NÃO existir** → rodar `cargo run` normalmente (ambiente padrão do sistema)
>
> **Nunca rodar cargo sem essas variáveis configuradas quando `D:\RustDev\` existir.**

---

## Visão Geral

**Dois executáveis independentes** + **um crate compartilhado**:

| Componente | Pasta | Papel |
|---|---|---|
| **midi_common** | `midi_common/` | Lib crate com `MidiAssembler` + helpers de framing TCP. Referenciado por ambos via `path`. |
| **Remote MIDI Server** | `remote_midi_server/` | Mini server headless. Mesa USB ↔ TCP:4200. |
| **Server Rust** (existente) | `server_rust/` | Quando `remote_midi: true`, busca mesa via TCP na rede. |

```
  PC da Mesa                                    PC do Técnico
┌─────────────────────────┐          ┌──────────────────────────────────┐
│ 🎛️ Yamaha 01V96 (USB)   │          │  server_rust                     │
│     ↕                   │          │  remote_midi: true               │
│ remote_midi_server      │◄────────►│  :4000 HTTP/WS                   │
│ :4200 TCP               │  TCP     │     ↕                            │
└─────────────────────────┘          │  🌐 Browser (WebSocket)          │
                                     └──────────────────────────────────┘

  Compartilhado: midi_common/ (assembler + framing)
  Referenciado por ambos via path dependency
```

---

## Configuração no config.json

```jsonc
{
  // ... campos existentes inalterados ...

  "remote_midi": false,             // Quando true, server_rust busca mesa via TCP
  "remote_midi_networks": [         // Hosts onde o mini server pode estar
    "pcmaria",
    "pcfavela",
    "192.168.15.50"
  ],
  "remote_midi_port": 4200,         // Porta TCP do mini server
  "remote_midi_last_host": ""       // Auto-preenchido — último host conectado
}
```

---

## Protocolo TCP

### Framing

```
┌──────────┬──────────────────────┐
│ 4 bytes  │  N bytes             │
│ len (LE) │  payload (raw MIDI)  │
└──────────┴──────────────────────┘
```

- `len`: `u32` little-endian
- `payload`: bytes MIDI crus
- Bidirecional

### Heartbeat

- Frame especial: `[0xFF, 0xFE, 0x00]` (não é MIDI válido)
- Mini server envia a cada **3s**
- `server_rust` monitora — timeout de **10s** → desconecta → reconecta

### Gestão de 1 Client com reconexão

O mini server aceita **1 conexão TCP** por vez, mas trata reconexões de forma inteligente:

```
Quando nova conexão chega:
  Se NÃO há conexão ativa → aceitar
  Se HÁ conexão ativa:
    Tentar enviar heartbeat na conexão atual
    Se falhar (write error) → conexão antiga está morta → dropar, aceitar nova
    Se sucesso → conexão antiga está viva → rejeitar nova (close imediato)
```

Isso garante que:
- Se o Client cair e reconectar rapidamente, o mini server aceita (a conexão antiga está morta)
- Se alguém tentar conectar um segundo Client enquanto o primeiro está ativo, é rejeitado

---

## Fases de Implementação

---

### FASE 1 — Configuração [CONCLUÍDO]

*Status: Concluído com sucesso. O config.json e o server_rust/src/config.rs foram atualizados com os campos remote_midi, remote_midi_networks, remote_midi_port e remote_midi_last_host.*

#### [MODIFY] `config.json`

```diff
  "disable_systray": false,
+ "remote_midi": false,
+ "remote_midi_networks": [],
+ "remote_midi_port": 4200,
+ "remote_midi_last_host": ""
}
```

#### [MODIFY] `server_rust/src/config.rs`

Novos campos na struct `AppConfig`:

```rust
#[serde(default)]
pub remote_midi: bool,

#[serde(default)]
pub remote_midi_networks: Vec<String>,

#[serde(default = "default_remote_midi_port")]
pub remote_midi_port: u16,

#[serde(default)]
pub remote_midi_last_host: String,
```

Default:

```rust
fn default_remote_midi_port() -> u16 { 4200 }
```

Adicionar ao `default_config()`. Adicionar método:

```rust
pub fn save_last_remote_host(&mut self, host: &str) {
    self.remote_midi_last_host = host.to_string();
    self.save();
}
```

---

### FASE 2 — Crate compartilhado `midi_common/` [CONCLUÍDO]

*Status: Concluído com sucesso. A pasta midi_common contendo Cargo.toml, lib.rs, framing.rs, e assembler.rs foi criada e configurada como dependência local no server_rust, que foi atualizado para re-exportar o assembler de lá.*

#### [NEW] Estrutura

```
midi_common/
├── Cargo.toml
└── src/
    ├── lib.rs
    ├── assembler.rs    ← movido de server_rust/src/midi/assembler.rs
    └── framing.rs      ← novo: write_frame / read_frame / constantes
```

#### [NEW] `midi_common/Cargo.toml`

```toml
[package]
name = "midi_common"
version = "0.1.0"
edition = "2024"

[dependencies]
tokio = { version = "1.52.3", features = ["io-util", "net"] }
```

#### [NEW] `midi_common/src/lib.rs`

```rust
pub mod assembler;
pub mod framing;
```

#### [MOVE] assembler.rs → midi_common/

Mover `server_rust/src/midi/assembler.rs` para `midi_common/src/assembler.rs`.

#### [MODIFY] `server_rust/Cargo.toml`

Adicionar path dependency:

```diff
+ midi_common = { path = "../midi_common" }
```

#### [MODIFY] `server_rust/src/midi/mod.rs`

Remover `pub mod assembler` local. Re-exportar do crate compartilhado:

```diff
- pub mod assembler;
+ pub use midi_common::assembler;

+ pub mod remote_client;
```

E ajustar o re-export:

```diff
- pub use assembler::MidiAssembler;
+ pub use midi_common::assembler::MidiAssembler;
```

#### [NEW] `midi_common/src/framing.rs`

Helpers compartilhados por ambos os executáveis:

```rust
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpStream;
use std::io;
use std::time::Duration;

pub const HEARTBEAT_INTERVAL: Duration = Duration::from_secs(3);
pub const HEARTBEAT_TIMEOUT: Duration = Duration::from_secs(10);
pub const HEARTBEAT_MAGIC: [u8; 3] = [0xFF, 0xFE, 0x00];

pub fn is_heartbeat(data: &[u8]) -> bool {
    data == HEARTBEAT_MAGIC
}

/// Escreve um frame: [4 bytes len LE] + [payload]
pub async fn write_frame(stream: &mut TcpStream, data: &[u8]) -> io::Result<()> {
    let len = data.len() as u32;
    stream.write_all(&len.to_le_bytes()).await?;
    stream.write_all(data).await?;
    stream.flush().await
}

/// Lê um frame: [4 bytes len LE] + [payload]
pub async fn read_frame(stream: &mut TcpStream) -> io::Result<Vec<u8>> {
    let mut len_buf = [0u8; 4];
    stream.read_exact(&mut len_buf).await?;
    let len = u32::from_le_bytes(len_buf) as usize;
    if len > 65536 {
        return Err(io::Error::new(io::ErrorKind::InvalidData, "frame too large"));
    }
    let mut buf = vec![0u8; len];
    stream.read_exact(&mut buf).await?;
    Ok(buf)
}
```

---

### FASE 3 — Mini Server (`remote_midi_server/`) [CONCLUÍDO]

*Status: Concluído com sucesso. O executável remote_midi_server foi criado com Cargo.toml e src/main.rs. A lógica de leitura de portas MIDI, loop de scanner automático, tratamento inteligente de conexão única com verificação de heartbeat ativa e escoamento do buffer acumulado foi totalmente implementada e testada com sucesso.*

#### [NEW] Estrutura

```
remote_midi_server/
├── Cargo.toml
└── src/
    └── main.rs
```

#### [NEW] `remote_midi_server/Cargo.toml`

```toml
[package]
name = "remote_midi_server"
version = "0.1.0"
edition = "2024"

[dependencies]
midi_common = { path = "../midi_common" }
midir = "0.11.0"
tokio = { version = "1.52.3", features = ["full"] }
serde = { version = "1.0.228", features = ["derive"] }
serde_json = "1.0.150"
tracing = "0.1.44"
tracing-subscriber = "0.3.23"
```

#### [NEW] `remote_midi_server/src/main.rs`

Responsabilidades e fluxo:

```
#[tokio::main]
async fn main():

  1. tracing_subscriber::init()

  2. Ler ../config.json (apenas campos necessários: inIdx, outIdx,
     loopmidi-monitor, remote_midi_port)

  3. Scan portas MIDI:
     - Busca "yamaha" + "-1" (ou "monitor" se loopmidi-monitor)
     - Se não encontrar → loop de busca a cada 1s (como server_rust)

  4. Abrir portas MIDI USB (midir):
     - Input com callback → mpsc::Sender<Vec<u8>> (midi_from_mesa_tx)
     - Output para enviar dados à mesa (midi_to_mesa)

  5. TcpListener::bind("0.0.0.0:{port}")
     info!("🎛️ Remote MIDI Server ativo na porta {port}")

  6. Loop principal:
     a. listener.accept() → (stream, addr)
        info!("📡 Client conectado: {addr}")

     b. Verificar se há conexão ativa:
        - Se sim → testar com heartbeat
        - Se conexão antiga morta → dropar, aceitar nova
        - Se conexão antiga viva → rejeitar nova

     c. Spawn 3 tasks (com JoinSet ou select!):

        Task MESA→CLIENT (TX):
          loop:
            msg = midi_from_mesa_rx.recv()
            // Reassembly via MidiAssembler (do midi_common)
            write_frame(&mut stream, &msg)

        Task CLIENT→MESA (RX):
          loop:
            frame = read_frame(&mut stream)
            if is_heartbeat → ignorar
            midi_to_mesa.send(&frame)

        Task HEARTBEAT:
          loop:
            sleep(3s)
            write_frame(&mut stream, &HEARTBEAT_MAGIC)

     d. Quando qualquer task falha → cleanup, voltar a (a)
        info!("❌ Client desconectado: {addr}")
```

---

### FASE 4 — Client TCP no `server_rust` [CONCLUÍDO]

*Status: Concluído com sucesso. A struct RemoteClient no src/midi/remote_client.rs foi criada com tratamento assíncrono de escrita e leitura de frames, timeout de heartbeat de 10s no Tokio para detectar conexões congeladas e loop de reconexão prioritária. O enum MidiOutput foi introduzido em src/midi/engine.rs e o MidiScheduler foi modificado para utilizar MidiOutput no lugar de MidiEngine direto, adaptando também as rotinas de teste correspondentes.*

#### [NEW] `server_rust/src/midi/remote_client.rs`

```rust
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use tokio::sync::mpsc;
use tokio::net::TcpStream;
use midi_common::framing::{self, read_frame, write_frame, is_heartbeat};

pub struct RemoteClient {
    config: crate::config::AppConfig,
    midi_in_tx: mpsc::Sender<Vec<u8>>,       // dados da mesa → state do server
    midi_out_rx: Arc<tokio::sync::Mutex<mpsc::Receiver<Vec<u8>>>>,  // scheduler → mesa
    midi_out_tx: mpsc::Sender<Vec<u8>>,       // exposto para o MidiOutput::Remote
    connected: Arc<AtomicBool>,
}

impl RemoteClient {
    pub fn new(config: AppConfig, midi_in_tx: mpsc::Sender<Vec<u8>>) -> Self {
        let (midi_out_tx, midi_out_rx) = mpsc::channel(4096);
        Self { config, midi_in_tx, midi_out_tx, midi_out_rx: Arc::new(...), connected: ... }
    }

    /// Envia MIDI via TCP (chamado pelo MidiOutput::Remote no scheduler)
    pub fn send(&self, data: &[u8]) {
        let _ = self.midi_out_tx.try_send(data.to_vec());
    }

    pub fn is_connected(&self) -> bool {
        self.connected.load(Ordering::SeqCst)
    }

    /// Inicia conexão em background com reconexão automática
    pub fn start(self: &Arc<Self>) {
        let this = self.clone();
        tokio::spawn(async move {
            loop {
                match this.try_connect().await {
                    Ok(stream) => {
                        this.connected.store(true, Ordering::SeqCst);
                        this.run_bridge(stream).await;
                        // Bridge encerrou → desconectado
                        this.connected.store(false, Ordering::SeqCst);
                    }
                    Err(_) => {
                        tokio::time::sleep(Duration::from_secs(2)).await;
                    }
                }
            }
        });
    }

    async fn try_connect(&self) -> Result<TcpStream, Error> {
        let port = self.config.remote_midi_port;

        // 1. Tenta último host conhecido
        if !self.config.remote_midi_last_host.is_empty() {
            let addr = format!("{}:{}", self.config.remote_midi_last_host, port);
            if let Ok(stream) = timeout(3s, TcpStream::connect(&addr)).await {
                info!("🔗 Reconectado ao último host: {}", addr);
                return Ok(stream);
            }
        }

        // 2. Percorre lista de hosts
        for host in &self.config.remote_midi_networks {
            let addr = format!("{}:{}", host, port);
            if let Ok(Ok(stream)) = timeout(3s, TcpStream::connect(&addr)).await {
                info!("🔗 Conectado a: {}", addr);
                // Salva como último host
                let mut cfg = AppConfig::load();
                cfg.save_last_remote_host(host);
                return Ok(stream);
            }
        }

        Err("nenhum host disponível")
    }

    async fn run_bridge(&self, mut stream: TcpStream) {
        // Split TCP stream
        // Task RX: read_frame → midi_in_tx (filtra heartbeats)
        // Task TX: midi_out_rx → write_frame
        // Task HB monitor: se nenhum frame em 10s → return (desconecta)
        // select! nas 3 tasks — quando qualquer uma falha, retorna
    }
}
```

#### [MODIFY] `server_rust/src/midi/engine.rs`

Adicionar enum para abstrair envio:

```rust
pub enum MidiOutput {
    Local(Arc<tokio::sync::Mutex<MidiEngine>>),
    Remote(Arc<super::remote_client::RemoteClient>),
}

impl MidiOutput {
    pub async fn send(&self, data: &[u8]) {
        match self {
            MidiOutput::Local(engine) => engine.lock().await.send(data),
            MidiOutput::Remote(client) => client.send(data),
        }
    }
}
```

#### [MODIFY] `server_rust/src/midi/scheduler.rs`

```diff
 pub struct MidiScheduler {
     pub state: Arc<Mutex<SchedulerState>>,
-    engine: Arc<Mutex<super::MidiEngine>>,
+    output: super::engine::MidiOutput,
     sync_counter: Arc<super::SyncCounter>,
 }
```

Construtor aceita `MidiOutput`:

```diff
- pub fn new(tick_ms: u64, engine: Arc<Mutex<MidiEngine>>, ...) -> Self {
+ pub fn new(tick_ms: u64, output: MidiOutput, ...) -> Self {
```

No tick loop:

```diff
-  engine.lock().await.send(&p);
+  output.send(&p).await;
```

#### [MODIFY] `server_rust/src/midi/mod.rs`

```diff
+ pub mod remote_client;
  pub use midi_common::assembler;
  pub use midi_common::assembler::MidiAssembler;
```

---

### FASE 5 — Integrar no boot do `main.rs` [CONCLUÍDO]

*Status: Concluído com sucesso. A inicialização no src/main.rs foi modificada para verificar se remote_midi está ativo, criando o canal midi_in_tx/rx no topo, instanciando condicionalmente o RemoteClient ou o MidiEngine, configurando o MidiOutput apropriado e repassando-o para o scheduler. Além disso, o loop de escuta de mensagens MIDI foi otimizado para pular o MidiAssembler quando operando em rede (uma vez que o Mini Server já entrega os pacotes prontos).*

#### [MODIFY] `server_rust/src/main.rs`

**Mudança no construtor do Scheduler** (linha ~68):

```rust
// Determinar o MidiOutput baseado no modo
let midi_output = if app_config.remote_midi {
    let remote_client = Arc::new(midi::remote_client::RemoteClient::new(
        app_config.clone(),
        midi_in_tx.clone(),
    ));
    midi::engine::MidiOutput::Remote(remote_client.clone())
} else {
    midi::engine::MidiOutput::Local(engine.clone())
};

let scheduler = Arc::new(midi::MidiScheduler::new(
    app_config.scheduler_tick_ms,
    midi_output,
    sync_counter.clone(),
));
```

**Mudança no boot MIDI** (linha ~768, no bloco `else` do `demo_mode`):

```rust
if app_config.remote_midi {
    // === MODO REMOTE ===
    info!("🌐 [REMOTE] Modo Remote MIDI ativo. Buscando mesa via rede...");

    // O RemoteClient já foi criado acima — iniciar conexão em background
    if let midi::engine::MidiOutput::Remote(ref client) = midi_output {
        let client_ref = client.clone();
        let conn_mgr_remote = conn_mgr.clone();
        tokio::spawn(async move {
            // Espera conectar
            loop {
                if client_ref.is_connected() { break; }
                tokio::time::sleep(Duration::from_millis(500)).await;
            }
            // Sinaliza conexão e inicia sync
            conn_mgr_remote.on_remote_connected().await;
        });
    }
} else if app_config.demo_mode {
    // ... demo mode (inalterado) ...
} else {
    // ... modo normal USB (inalterado) ...
}
```

---

### FASE 6 — Script de inicialização [CONCLUÍDO]

*Status: Concluído com sucesso. Criamos o script INICIAR_REMOTE_MIDI.bat na raiz do projeto. O script detecta automaticamente se o ambiente Rust customizado D:\RustDev está disponível, executa o iniciar_rust.bat para configurar o path, e inicia o Mini Servidor compilado de forma limpa.*

#### [NEW] `INICIAR_REMOTE_MIDI.bat`

```batch
@echo off
cd /d "%~dp0remote_midi_server"
cargo run --release
pause
```

---

## Resumo de Arquivos

### Novos (7 arquivos)

| Arquivo | Descrição |
|---------|-----------|
| 🆕 `midi_common/Cargo.toml` | Crate compartilhado — dependências mínimas |
| 🆕 `midi_common/src/lib.rs` | Exports: assembler + framing |
| 🆕 `midi_common/src/framing.rs` | `write_frame`, `read_frame`, heartbeat, constantes |
| 🆕 `remote_midi_server/Cargo.toml` | Mini server — midir + tokio + midi_common |
| 🆕 `remote_midi_server/src/main.rs` | Bridge USB MIDI ↔ TCP:4200 |
| 🆕 `server_rust/src/midi/remote_client.rs` | Client TCP com reconexão inteligente |
| 🆕 `INICIAR_REMOTE_MIDI.bat` | Script para rodar o mini server |

### Movidos (1 arquivo)

| De | Para | Nota |
|----|------|------|
| `server_rust/src/midi/assembler.rs` | `midi_common/src/assembler.rs` | Conteúdo idêntico, só muda de lugar |

### Modificados (6 arquivos)

| Arquivo | O que muda |
|---------|-----------|
| ✏️ `config.json` | +4 campos remote_midi |
| ✏️ `server_rust/Cargo.toml` | +`midi_common = { path = "../midi_common" }` |
| ✏️ `server_rust/src/config.rs` | +4 campos na struct + defaults |
| ✏️ `server_rust/src/midi/engine.rs` | +enum `MidiOutput` |
| ✏️ `server_rust/src/midi/scheduler.rs` | Usa `MidiOutput` ao invés de `MidiEngine` direto |
| ✏️ `server_rust/src/midi/mod.rs` | Remove assembler local, re-exporta de midi_common, adiciona remote_client |
| ✏️ `server_rust/src/main.rs` | Branch boot: remote vs demo vs normal |

### Não tocados

Todo o frontend, `connection.rs`, `sync_manager.rs`, `protocol.rs`, `state.rs`.

---

## Ordem de Execução

```
Fase 1: config.json + config.rs
  ├──► Fase 2: midi_common/ (mover assembler + framing)
  │      ├──► Fase 3: remote_midi_server/ (mini server)
  │      └──► Fase 4: remote_client + MidiOutput (client no server_rust)
  │             │
  └────────────►├──► Fase 5: main.rs boot branch
                       └──► Fase 6: INICIAR_REMOTE_MIDI.bat
                              └──► Verificação
```

---

## Verificação

### Teste 1 — Local (mesma máquina)

```
Terminal 1: cd remote_midi_server && cargo run
  → "🎛️ Remote MIDI Server ativo na porta 4200"

Terminal 2: (config.json: remote_midi=true, networks=["127.0.0.1"])
  cd server_rust && cargo run
  → "🌐 [REMOTE] Conectado a 127.0.0.1:4200"
  → Browser em localhost:4000 funciona normalmente
```

### Teste 2 — Reconexão

```
1. Fechar Terminal 1 (Ctrl+C no mini server)
2. Terminal 2 detecta em ~10s, entra em loop de busca
3. Reabrir Terminal 1
4. Terminal 2 reconecta via remote_midi_last_host (sem scan completo)
```

### Teste 3 — Cross-machine

```
PC-A (mesa USB): cargo run no remote_midi_server
PC-B (remoto): config.json com networks=["PC-A"], cargo run no server_rust
Browser no PC-B controla mesa no PC-A
```
