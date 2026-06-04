# 🦀 Auditoria de Memória — server_rust

**Data**: 04/06/2026
**Escopo**: Crate `server_rust` (principal), `midi_common`, `remote_midi_server`
**Base**: Rust Best Practices (179 regras, categorias `mem-`, `own-`, `perf-`, `anti-`)
**Objetivo**: Este relatório detalha cada problema de memória identificado com instruções precisas para que outra IA ou desenvolvedor possa implementar as correções sem ambiguidade.

---

## Convenções Nestas Instruções

- Cada issue lista o **arquivo**, **linha(s)** e **regra violada**
- O código **ATUAL** é mostrado em blocos
- O código **CORRIGIDO** é mostrado em blocos
- Dicas de implementação aparecem em blocos separados
- Issues são ordenadas por severidade: CRÍTICA > ALTA > MÉDIA > BAIXA

---

## 🔴 ISSUES CRÍTICAS (4)

---

### #1 — `name_chars: Vec<String>` armazena chars individuais como String heap-alocada

**Regras**: `mem-box-large-variant`, `mem-compact-string`, `mem-smaller-integers`
**Arquivos**:
- `server_rust/src/state.rs:56`, `107`, `121`, `133`
- `server_rust/src/socket_handlers.rs:549-550`, `574`, `580`, `584`
- `server_rust/src/midi_receiver.rs` (não usa, mas o tipo propaga)

**Problema**:

```rust
// state.rs:56 — ChannelState
pub name_chars: Vec<String>,     // Cada elemento é um char como String!
pub name: String,                // name é join() de name_chars — duplicado!

// state.rs:107 — MixBusState
pub name_chars: Vec<String>,     // 16 elementos

// state.rs:121 — MasterState
pub name_chars: Vec<String>,     // 16 elementos

// state.rs:133 — GlobalState
pub scene_chars: Vec<String>,    // 16 elementos
```

Cada `String` em Rust são 24 bytes (ptr + capacity + len) **mais** uma alocação heap para o conteúdo. Para 40 canais × 4 chars + 8 mixes × 16 + 8 buses × 16 + 1 master × 16 + 16 scene_chars = **408 alocações heap** só para armazenar chars individuais, quando o dado nunca passa de 1 caractere ASCII.

Além disso, `name` e `name_chars` armazenam **a mesma informação** redundantemente — `name` é sempre derivado de `name_chars.join("").trim().to_string()`.

**Solução**: Substituir `Vec<String>` por `String` e remover `name_chars` onde redundante, OU usar `Vec<char>` (char é stack-only, 4 bytes cada, sem heap).

**Opção A (recomendada)**: Usar apenas `name: String` e acessar chars via `.chars()` quando precisar de chars individuais. Remover `name_chars` completamente.

**Opção B**: Usar `Vec<char>` em vez de `Vec<String>`.

```rust
// state.rs — CORRIGIDO (Opção A)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChannelState {
    // ... outros campos ...
    #[serde(rename = "nameChars")]
    pub name_chars: Vec<String>,  // ← REMOVER este campo
    pub name: String,             // ← MANTER este, é suficiente
    // ...
}
```

**Dependências**: Afeta:
- `state.rs:351-397` (`inject_names`) — constrói name_chars
- `state.rs:648-689` (`apply_name_char`) — acessa/modifica name_chars
- `socket_handlers.rs:549-585` (`updateName`) — escreve name_chars
- `config.rs:229-271` (`save_names_to_disk`) — só usa `name`
- `serde` serialization — a UI espera `nameChars` no JSON

**⚠️ ATENÇÃO**: A UI (JavaScript) consome `nameChars` como array de strings. Se remover o campo, o emissor `sync`/`update` precisará **reconstruir** `nameChars` no front-end a partir de `name`, OU manter `name_chars` como `Vec<char>` (serializado como array de números, não strings).

**Solução de menor risco**: Mudar para `Vec<char>` (cada char = 4 bytes, sem heap, sem mudar a serialização pois `serde serializa char como string de 1 char`).

```rust
// state.rs — CORRIGIDO (Opção B — menor risco)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChannelState {
    // ...
    #[serde(rename = "nameChars")]
    pub name_chars: Vec<char>,    // 4 bytes cada, sem heap
    pub name: String,
    // ...
}
```

E mudar as alocações:

```rust
// ANTES: vec![" ".to_string(); 4]
// DEPOIS:
name_chars: vec![' '; 4],

// ANTES: padded.chars().map(|c| c.to_string()).collect()
// DEPOIS:
let chars: Vec<char> = padded.chars().collect();

// ANTES: ch.name_chars[i] = c.clone();
// DEPOIS:
ch.name_chars[i] = c;

// ANTES: ch.name_chars[char_index] = char.to_string();
// DEPOIS:
ch.name_chars[char_index] = char.as_str().chars().next().unwrap_or(' ');
// ou melhor: receber char em vez de String em ParsedMidi::UpdateNameChar
```

---

### #2 — `GlobalState` clonado integralmente em toda salvada de nomes

**Regras**: `own-clone-explicit`, `anti-clone-excessive`, `own-borrow-over-clone`
**Arquivo**: `server_rust/src/config.rs:229-231`

**Problema**:

```rust
pub fn save_names_to_disk(state: &crate::state::GlobalState, debounce_ms: u64) {
    let state_snapshot = state.clone();  // ← CLONE GIGANTESCO
    // ...
    tokio::spawn(async move {
        // ... usa state_snapshot depois de debounce ...
        for i in 0..32 {
            if let Some(ch) = state_snapshot.channels.get(&i) {
                names.insert(i.to_string(), ch.name.clone());
            }
        }
        // ...
    });
}
```

`GlobalState` contém 40 `ChannelState` (cada um com `EqState` de 4 bandas, `CompState`, `GateState`, 8 aux, `Vec<bool>` de 8 buses, `name: String`, `name_chars: Vec<String>`...) + 8 `MixBusState` + 8 `MixBusState` (buses) + `MasterState` + `SceneManager` (100 `Option<SceneData>`). Estimativa: **>50KB por clone**. Chamado em todo `updateName`.

**Solução**: Extrair apenas os dados necessários antes de entrar no `tokio::spawn`, em vez de clonar o estado inteiro.

```rust
// config.rs — CORRIGIDO
pub fn save_names_to_disk(state: &crate::state::GlobalState, debounce_ms: u64) {
    // Extrair apenas os nomes necessários (HashMap<String, String>)
    let mut names: std::collections::HashMap<String, String> = std::collections::HashMap::new();
    for i in 0..32 {
        if let Some(ch) = state.channels.get(&i) {
            names.insert(i.to_string(), ch.name.clone());
        }
    }
    for st_idx in 0..4 {
        let global_id = 60 + st_idx * 2;
        let local_idx = 32 + st_idx;
        if let Some(ch) = state.channels.get(&local_idx) {
            names.insert(global_id.to_string(), ch.name.clone());
        }
    }
    for (i, m) in &state.mixes {
        names.insert((36 + i).to_string(), m.name.clone());
    }
    for (i, b) in &state.buses {
        names.insert((44 + i).to_string(), b.name.clone());
    }
    names.insert("52".to_string(), state.master.name.clone());

    // Agora clonar só o HashMap de nomes (~2KB em vez de ~50KB)
    let timer_lock = SAVE_NAMES_TIMER.clone();

    tokio::spawn(async move {
        let mut guard = timer_lock.lock().await;
        if let Some(handle) = guard.take() {
            handle.abort();
        }
        *guard = Some(tokio::spawn(async move {
            tokio::time::sleep(std::time::Duration::from_millis(debounce_ms)).await;
            let names_path = get_project_root().join("names.json");
            match serde_json::to_string_pretty(&names) {
                Ok(json_str) => {
                    if let Err(e) = fs::write(&names_path, json_str) {
                        error!("❌ [NAMES] Erro ao salvar names.json: {}", e);
                    }
                }
                Err(e) => error!("❌ [NAMES] Erro ao serializar nomes: {}", e),
            }
        }));
    });
}
```

---

### #3 — `meter_buffer` Vec<f64> clonado inteiro a cada tick de meter (até 30fps)

**Regras**: `mem-reuse-collections`, `anti-clone-excessive`, `perf-iter-over-index`
**Arquivo**: `server_rust/src/midi_receiver.rs:32-36`, `:124`

**Problema**:

```rust
// midi_receiver.rs:32-36 — buffer alocado como Vec
let meter_buffer: Arc<std::sync::Mutex<Vec<f64>>> =
    Arc::new(std::sync::Mutex::new(vec![0.0; 64]));

// midi_receiver.rs:124 — DENTRO do loop de recepção, a cada meterData:
let buf = meter_buffer_emit.lock().unwrap().clone();  // ← clone 64×f64
meter_emission = Some(buf.into_iter().map(|v| v as u8).collect());
```

A cada pacote de meter (até 30 pacotes/segundo), o buffer de 64 `f64` (512 bytes) é clonado e depois mapeado para `Vec<u8>`. Duas alocações por tick.

**Solução**: (a) usar array fixo `[f64; 64]` em vez de `Vec<f64>`, (b) mapear direto sem clone.

```rust
// midi_receiver.rs — CORRIGIDO
// ANTES:
let meter_buffer: Arc<std::sync::Mutex<Vec<f64>>> =
    Arc::new(std::sync::Mutex::new(vec![0.0; 64]));

// DEPOIS — array fixo sem heap:
let meter_buffer: Arc<std::sync::Mutex<[f64; 64]>> =
    Arc::new(std::sync::Mutex::new([0.0; 64]));
```

E no loop:

```rust
// ANTES:
let buf = meter_buffer_emit.lock().unwrap().clone();
meter_emission = Some(buf.into_iter().map(|v| v as u8).collect());

// DEPOIS — ler sem clone, mapear in-place:
let mut meter_emission: Option<Vec<u8>> = None;
// ... dentro do if de throttle:
{
    let buf = meter_buffer_emit.lock().unwrap();
    meter_emission = Some(buf.iter().map(|&v| v as u8).collect());
}
// mutex lock é dropado aqui, sem clone
```

---

### #4 — Duplicação redundante `name` + `name_chars` (mesmo dado armazenado duas vezes)

**Regras**: `mem-box-large-variant`, `mem-avoid-format`
**Arquivos**: `server_rust/src/state.rs:56-57`, `:107-108`, `:120-121`, `:133-134`

**Problema**:

```rust
// state.rs
pub struct ChannelState {
    pub name_chars: Vec<String>,  // Ex: ["C", "H", " ", "1"]
    pub name: String,             // Ex: "CH 1"  ← join de name_chars!
}
```

Toda vez que `name_chars` é modificado, `name` é recalculado via `name_chars.join("").trim().to_string()` (ver `state.rs:620`, `:653`, `:664`, `:672`, `:680`, `:686`). Os dois campos estão sempre sincronizados. Um é derivado do outro.

**Solução**: Definir **um** como fonte da verdade e derivar o outro sob demanda.

```rust
// state.rs — CORRIGIDO (manter name_chars como fonte, calcular name sob demanda)
pub struct ChannelState {
    #[serde(rename = "nameChars")]
    pub name_chars: Vec<char>,     // Fonte da verdade
    #[serde(skip_serializing)]     // Não serializar — UI usa nameChars
    #[serde(default)]
    pub name: String,              // Cache, ou calcular sob demanda
}
```

OU, melhor ainda:

```rust
// Só name, sem name_chars:
pub struct ChannelState {
    pub name: String,
}
// Para obter chars: name.chars().collect::<Vec<_>>()
// Para setar char: name.replace_range(i..i+1, &char)
```

**⚠️ Impacto na UI**: A UI espera `nameChars` como array de strings. Se remover, adaptar o front-end ou reconstruir na serialização.

---

## 🟡 ISSUES DE ALTA SEVERIDADE (6)

---

### #5 — `ParsedMidi::MeterData` com `HashMap<usize, u8>` dentro de enum grande

**Regras**: `mem-box-large-variant`
**Arquivo**: `server_rust/src/midi/protocol.rs:168-191`

**Problema**:

```rust
#[derive(Debug, Clone, serde::Serialize)]
pub enum ParsedMidi {
    ControlChange { msg_type: String, channel: usize, value: f64 },
    MeterData {
        is_master: bool,
        group: u8,
        levels: std::collections::HashMap<usize, u8>,  // até 64 entries
    },
    UpdateNameChar { channel: usize, char_index: usize, char: String },
    // ...
}
```

O enum `ParsedMidi` tem o tamanho da **maior** variante. `MeterData` contém um `HashMap` (48 bytes) + potencialmente até 64 entries no heap. `ControlChange` tem `String` (24 bytes) + `usize` + `f64`. O enum inteiro provavelmente tem ~56-64 bytes de stack, mas o `HashMap` dentro de `MeterData` está sempre heap-alocado.

Variantes menores como `SceneNumber(u8)` desperdiçam espaço.

**Solução**: Boxar a variante `MeterData`:

```rust
pub enum ParsedMidi {
    ControlChange { msg_type: String, channel: usize, value: f64 },
    MeterData(Box<MeterPayload>),
    SceneNumber(u8),
    UpdateNameChar { channel: usize, char_index: usize, char: String },
    UpdateSceneChar { char_index: usize, char: String },
    PhysicalSceneRecall(u8),
    PhysicalSceneStore(u8),
}

pub struct MeterPayload {
    pub is_master: bool,
    pub group: u8,
    pub levels: std::collections::HashMap<usize, u8>,
}
```

Isso reduz o tamanho do enum de ~56 bytes para ~16 bytes (apenas o ponteiro do Box).

**Impacto**: Afeta todos os `match parsed { ... ParsedMidi::MeterData { ... } => ... }` — adicionar um nível de indireção.

---

### #6 — `sync_names_only` constrói Vec<Vec<u8>> sem capacidade inicial

**Regras**: `mem-with-capacity`
**Arquivo**: `server_rust/src/network/sync_manager.rs:246`

**Problema**:

```rust
pub fn sync_names_only(&self) {
    // ...
    let mut requests: Vec<Vec<u8>> = Vec::new();  // ← sem capacity!
    // 32 canais × 4 chars + 4 ST × 4 + 8 mixes × 8 + 8 buses × 8 + 1 master × 8
    // = ~280 requests
    requests.push(midi::master_meter::MasterMeter::build_stop_request());
    for i in 0u8..32 {
        for c in 0..4u8 {
            if let Some(req) = midi::protocol::build_name_request(i, c) {
                requests.push(req);
            }
        }
    }
    // ... mais 76 requests ...
    sched.enqueue_batch(requests, 1).await;
```

Sem `with_capacity`, o `Vec` começa com capacity 0 e dobra de tamanho ~8 vezes (0→1→2→4→8→16→32→64→128→256→512), causando realocações e cópias.

**Solução**:

```rust
let mut requests: Vec<Vec<u8>> = Vec::with_capacity(300); // número exato ou aproximado
```

Calcular o número exato:

```rust
// 32 canais × 4 chars = 128
// 4 ST × 4 chars = 16
// 8 mixes × 8 chars = 64
// 8 buses × 8 chars = 64
// 1 master × 8 chars = 8
// +1 stop request
let total = 1 + 128 + 16 + 64 + 64 + 8; // = 281
let mut requests: Vec<Vec<u8>> = Vec::with_capacity(total);
```

---

### #7 — `format!()` aloca String por request no hot path de sync

**Regras**: `mem-avoid-format`, `anti-format-hot-path`, `perf-iter-lazy`
**Arquivo**: `server_rust/src/network/sync_manager.rs:334-390`

**Problema**: A função `queue_all_params_inner` tem um loop que gera **centenas** de `String` via `format!()`:

```rust
for band in &["Low", "LowMid", "HiMid", "Hi"] {
    push_req(&mut requests, &format!("kInputEQ/kEQ{}F", band), i);  // ← alloc
    push_req(&mut requests, &format!("kInputEQ/kEQ{}G", band), i);  // ← alloc
    push_req(&mut requests, &format!("kInputEQ/kEQ{}Q", band), i);  // ← alloc
}
for a in 1..=8 {
    push_req(&mut requests, &format!("kInputAUX/kAUX{}Level", a), i); // ← alloc
    push_req(&mut requests, &format!("kInputAUX/kAUX{}On", a), i);    // ← alloc
}
```

Isso roda para 32 canais + 8 ST + 8 mixes + 8 buses + 1 master = ~57 iterações. Cada `format!()` aloca uma nova `String`. Total: **centenas de alocações** por sync.

**Solução**: Usar lookup arrays estáticos.

```rust
// sync_manager.rs — CORRIGIDO
// Tabelas estáticas de nomes de parâmetros (zero alloc em runtime)
const EQ_BAND_SUFFIXES: [&str; 12] = [
    "kEQLowF", "kEQLowG", "kEQLowQ",
    "kEQLowMidF", "kEQLowMidG", "kEQLowMidQ",
    "kEQHiMidF", "kEQHiMidG", "kEQHiMidQ",
    "kEQHiF", "kEQHiG", "kEQHiQ",
];

const AUX_PARAMS: [&str; 16] = [
    "kAUX1Level", "kAUX1On",
    "kAUX2Level", "kAUX2On",
    // ... até 8
];

// Uso:
for param in &EQ_BAND_SUFFIXES {
    push_req(&mut requests, &format_args!("kInputEQ/{}", param), i);
}
```

**Alternativa**: Se `push_req` aceitasse `Cow<'_, str>`, daria para usar `Cow::Borrowed` para parâmetros fixos.

---

### #8 — `String::from_utf8_lossy(&[c]).to_string()` para char único

**Regras**: `mem-avoid-format`, `own-copy-small`
**Arquivo**: `server_rust/src/midi/protocol.rs:267`

**Problema**:

```rust
let char_code = *data_bytes.last().unwrap_or(&32);
let char_str = String::from_utf8_lossy(&[char_code]).to_string();  // ← alloc
```

Isso cria um `Cow<str>` via `from_utf8_lossy` (que aloca se for inválido UTF-8 — raro para chars ASCII) e depois `.to_string()` que aloca outra `String`. Chamado para **cada caractere de nome** recebido da mesa (dezenas por sync).

**Solução**:

```rust
// protocol.rs — CORRIGIDO
let char_code = *data_bytes.last().unwrap_or(&32);
let char_str = (char_code as char).to_string();  // 1 alocação, sem validação extra
```

---

### #9 — HashMap<usize, T> para índices densos 0..39

**Regras**: `mem-boxed-slice`, `mem-assert-type-size`
**Arquivo**: `server_rust/src/state.rs:136-138`

**Problema**:

```rust
pub channels: HashMap<usize, ChannelState>,  // keys: 0..39 (40 dense indices)
pub mixes: HashMap<usize, MixBusState>,       // keys: 0..7 (8 dense indices)
pub buses: HashMap<usize, MixBusState>,       // keys: 0..7 (8 dense indices)
```

`HashMap` tem overhead por entrada: ~32-48 bytes para a tabela hash + 24 bytes para `(key, value)` + padding. Para 40 canais, isso é ~2-3KB extra comparado a `Vec` ou array.

Além disso, `HashMap` nunca é redimensionado após a construção — os índices são fixos.

**Solução**: Usar `Vec<Option<ChannelState>>` ou `[Option<ChannelState>; 40]`:

```rust
// state.rs — CORRIGIDO
pub channels: [Option<ChannelState>; 40],  // zero overhead, melhor cache locality
pub mixes: [Option<MixBusState>; 8],
pub buses: [Option<MixBusState>; 8],
```

**Dependências**: Afeta **todos** os acessos a `self.channels.get(&idx)` → `self.channels[idx]`. Isso está espalhado por:
- `state.rs` (~40 acessos)
- `socket_handlers.rs`
- `config.rs`
- `sync_manager.rs`
- `midi_receiver.rs`

**Estratégia de migração**: Mudar para `Vec<ChannelState>` (não `Option`) já que todos os 40 canais são sempre preenchidos. Mixes e buses também.

```rust
pub channels: Vec<ChannelState>,   // sempre 40 elementos
pub mixes: Vec<MixBusState>,       // sempre 8
pub buses: Vec<MixBusState>,       // sempre 8
```

E substituir `channels.get(&idx)` por `channels.get(idx)`.

---

### #10 — `serde_json::to_value` serializa GlobalState completo repetidamente

**Regras**: `perf-collect-once`, `perf-iter-lazy`
**Arquivos**:
- `server_rust/src/socket_handlers.rs:78`
- `server_rust/src/network/sync_manager.rs:535`

**Problema**:

```rust
// socket_handlers.rs:78 — a cada conexão de cliente
let current_state = state_arc_connect.read().await;
if let Ok(state_json) = serde_json::to_value(&*current_state) {
    socket_initial.emit("sync", &state_json).ok();
}

// sync_manager.rs:535 — ao final de cada sync
let state_guard = state.read().await;
if let Ok(state_json) = serde_json::to_value(&*state_guard) {
    let _ = io.emit("sync", &state_json).await;
}
```

`serde_json::to_value` serializa todo o `GlobalState` em um `serde_json::Value` (árvore DOM-like, heap pesada). Cada sync ou conexão nova faz isso. Clientes múltiplos = serializações múltiplas.

**Solução**:
1. **Para sync**: serializar uma vez e broadcast para todos
2. **Cache de serialização**: usar `Arc<RwLock<Option<serde_json::Value>>>` que é invalidado quando `GlobalState` muda

```rust
// sync_manager.rs — CORRIGIDO
let state_guard = state.read().await;
if let Ok(state_json) = serde_json::to_value(&*state_guard) {
    // Broadcast em vez de emit individual
    let _ = io.emit("sync", &state_json).await;
}
```

---

## 🟠 ISSUES DE MÉDIA SEVERIDADE (6)

---

### #11 — Filas do scheduler (`q0`, `q1`, `q2`) sem limite de crescimento

**Regras**: `mem-reuse-collections`, `async-bounded-channel`
**Arquivo**: `server_rust/src/midi/scheduler.rs:6-8`

**Problema**:

```rust
pub struct SchedulerState {
    pub q0: Vec<Vec<u8>>,  // ← sem limite!
    pub q1: Vec<Vec<u8>>,  // ← sem limite!
    pub q2: Vec<Vec<u8>>,  // ← sem limite!
}
```

Se a saída MIDI falha ou fica mais lenta que a entrada, essas filas crescem sem limites. Durante sync, ~700 mensagens de ~16 bytes cada entram na fila (~11KB). Se o output falhar completamente, isso cresce até OOM.

**Solução**: Adicionar limite máximo com descarte (backpressure).

```rust
// scheduler.rs — CORRIGIDO
const MAX_QUEUE_SIZE: usize = 10_000;
pub const MAX_QUEUE_BYTES: usize = 1_000_000; // ~1MB

pub async fn enqueue(&self, bytes: Vec<u8>, priority: u8) -> bool {
    let mut state = self.state.lock().await;
    let total_size: usize = state.q0.len() + state.q1.len() + state.q2.len();
    if total_size >= MAX_QUEUE_SIZE {
        tracing::warn!("⚠️ [Scheduler] Fila cheia ({total_size} itens). Descartando mensagem.");
        return false;
    }
    // ... lógica existente ...
}
```

---

### #12 — `SceneManager::scenes` usa Vec com tamanho fixo 100

**Regras**: `mem-boxed-slice`
**Arquivo**: `server_rust/src/scene_manager.rs:18`

**Problema**:

```rust
pub scenes: Vec<Option<SceneData>>,  // criado com vec![None; 100]
```

`Vec` com tamanho fixo (nunca redimensionado após init) ainda carrega overhead de `capacity` e `len`. Um `Box<[Option<SceneData>; 100]>` ou `[Option<SceneData>; 100]` seria semanticamente mais correto e mais leve (24 bytes a menos).

```rust
// scene_manager.rs — CORRIGIDO
pub scenes: Box<[Option<SceneData>; 100]>,

impl SceneManager {
    pub fn new() -> Self {
        Self {
            scenes: Box::new([const { None::<SceneData> }; 100]),
            // ...
        }
    }
}
```

Para construir um array de 100 `None` sem `Default`:

```rust
// Ou usar Default, já que Option<T>: Default = None
pub scenes: [Option<SceneData>; 100],

impl Default for SceneManager {
    fn default() -> Self {
        Self {
            scenes: [const { None::<SceneData> }; 100],  // precisa const generic ou array::from_fn
            // ...
        }
    }
}
```

---

### #13 — `COMMAND_BYTES` usa `HashMap<String, [u8; 4]>`

**Regras**: `type-no-stringly`, `mem-avoid-format`
**Arquivo**: `server_rust/src/midi/protocol.rs:5-9`

**Problema**:

```rust
lazy_static! {
    pub static ref COMMAND_BYTES: HashMap<String, [u8; 4]> = {
        let json_str = include_str!("dictionary.json");
        serde_json::from_str(json_str).expect("Failed to parse dictionary.json")
    };
}
```

As chaves são `String` heap-alocadas. Cada lookup (`COMMAND_BYTES.get(command_name)`) precisa hashear a `String`. Isso é feito em `build_change` e `build_request` para cada comando.

**Solução**: Usar `HashMap<&'static str, [u8; 4]>` se o JSON puder ser convertido para chaves estáticas, ou usar `phf` (perfect hash function) para lookup em tempo de compilação.

```rust
// protocol.rs — CORRIGIDO (com phf)
use phf::phf_map;

pub static COMMAND_BYTES: phf::Map<&'static str, [u8; 4]> = phf_map! {
    "kInputFader/kFader" => [0x00, 0x00, 0x00, 0x00],
    // ... todas as entradas do dictionary.json ...
};
```

**Alternativa**: Manter o JSON mas mudar a chave para `&'static str`:

```rust
lazy_static! {
    pub static ref COMMAND_BYTES: HashMap<&'static str, [u8; 4]> = {
        // Carregar e converter String -> &'static str via Box::leak
        // (menos ideal pois vaza memória, mas é uma vez na inicialização)
    };
}
```

---

### #14 — `Arc<Mutex<Option<JoinHandle>>>` redundante em ConnectionManager

**Regras**: `own-arc-shared` (aplicação incorreta)
**Arquivo**: `server_rust/src/network/connection.rs:24-26`

**Problema**:

```rust
busca_handle: Arc<std::sync::Mutex<Option<tokio::task::JoinHandle<()>>>>,
meter_handle: Arc<std::sync::Mutex<Option<tokio::task::JoinHandle<()>>>>,
demo_handle: Arc<std::sync::Mutex<Option<tokio::task::JoinHandle<()>>>>,
```

`ConnectionManager` já está envolto em `Arc<Self>` (ver `::new()` retorna `Arc<Self>`). O `Arc` extra em cada handle é desnecessário — o `Mutex` já dentro do `Arc<Self>` garante acesso seguro.

**Solução**: Remover o `Arc` de cada handle:

```rust
pub struct ConnectionManager {
    // ...
    busca_handle: std::sync::Mutex<Option<tokio::task::JoinHandle<()>>>,
    meter_handle: std::sync::Mutex<Option<tokio::task::JoinHandle<()>>>,
    demo_handle: std::sync::Mutex<Option<tokio::task::JoinHandle<()>>>,
}
```

Ajustar acessos: `self.busca_handle.lock()` em vez de `self.busca_handle.lock().unwrap()` (se já usa `if let Ok(guard) = ...`).

---

### #15 — `format!("{:02X}", b)` para cada byte em logs de sync

**Regras**: `mem-avoid-format`
**Arquivo**: `server_rust/src/network/sync_manager.rs:488-510`

**Problema**:

```rust
let hex: String = req
    .iter()
    .map(|b| format!("{:02X}", b))   // ← cada byte vira String individual
    .collect::<Vec<_>>()
    .join(" ");
```

Isso aloca uma `String` por byte da mensagem. Mensagens MIDI têm ~12-16 bytes, e isso é feito para 5+ mensagens toda vez que um sync roda. São dezenas de alocações pequenas só para log.

**Solução**: Escrever direto em uma `String` pré-alocada:

```rust
fn bytes_to_hex(bytes: &[u8]) -> String {
    let mut hex = String::with_capacity(bytes.len() * 3);
    for (i, b) in bytes.iter().enumerate() {
        if i > 0 {
            hex.push(' ');
        }
        hex.push_str(&format!("{:02X}", b));
    }
    hex
}
```

Ou usar crate `hex` se disponível. Melhor ainda, usar `tracing::field::debug` que formata hex sem alocar:

```rust
info!("📦 [Sync]   [{}] {} bytes: {:02X?}", i, req.len(), req);
```

`{:02X?}` com `Debug` formata o slice como hex sem alocação extra.

---

### #16 — `AppConfig.clone()` múltiplas vezes no `main.rs`

**Regras**: `own-borrow-over-clone`, `own-arc-shared`
**Arquivo**: `server_rust/src/main.rs:70, 98, 114`

**Problema**:

```rust
let client = Arc::new(midi::RemoteClient::new(
    app_config.clone(),   // ← clone #1
    midi_in_tx.clone(),
));
// ...
let conn_mgr = network::ConnectionManager::new(
    app_config.clone(),   // ← clone #2
    // ...
);
socket_handlers::register_handlers(
    // ...
    app_config.clone(),   // ← clone #3
    // ...
);
```

`AppConfig` contém `Vec<String>`, `HashMap<String, String>`, `serde_json::Value` — não é trivial. Três clones = três alocações profundas.

**Solução**: Envolver `AppConfig` em `Arc`:

```rust
let app_config = Arc::new(config::AppConfig::load());
```

E mudar as assinaturas para aceitar `Arc<AppConfig>` em vez de `AppConfig`. Onde mutabilidade é necessária (ex: `save_last_remote_host`), usar `Arc<RwLock<AppConfig>>` ou `Arc<Mutex<AppConfig>>`.

---

## 🔵 ISSUES DE BAIXA SEVERIDADE (4)

---

### #17 — Código morto: `server_rust/src/midi/assembler.rs` duplicado de `midi_common`

**Regras**: `proj-flat-small`, `proj-mod-by-feature`
**Arquivos**:
- `server_rust/src/midi/assembler.rs` (79 linhas)
- `midi_common/src/assembler.rs` (78 linhas)

Ambos são **idênticos**. O `server_rust/src/midi/mod.rs:11` já reexporta de `midi_common`:

```rust
pub use midi_common::assembler::MidiAssembler;
```

O arquivo `server_rust/src/midi/assembler.rs` nunca é usado (não tem `pub mod assembler;` em `mod.rs` — note que `mod.rs` não lista `assembler`).

**Solução**: Remover `server_rust/src/midi/assembler.rs`.

---

### #18 — `mixes.insert(i, mix_bus_state.clone())` cria clone desnecessário

**Regras**: `anti-clone-excessive`
**Arquivo**: `server_rust/src/state.rs:282-285`

**Problema**:

```rust
for i in 0..8 {
    let mix_bus_state = MixBusState { /* ... */ };
    mixes.insert(i, mix_bus_state.clone());  // ← clone #1
    let mut bus_state = mix_bus_state.clone(); // ← clone #2
    bus_state.name = format!("BUS {}", i + 1);
    buses.insert(i, bus_state);
}
```

`MixBusState` contém `EqState` (4 × `EqBand` com `Option<f64>`, `String`), `CompState` (7 × `f64`), `name: String`, `name_chars: Vec<String>`. Dois clones = duas cópias completas desnecessárias.

**Solução**: Construir diretamente:

```rust
for i in 0..8 {
    let mix_name = format!("MIX {}", i + 1);
    let bus_name = format!("BUS {}", i + 1);
    mixes.insert(i, MixBusState {
        name: mix_name,
        name_chars: vec![' '; 16],
        // ... resto igual ...
    });
    buses.insert(i, MixBusState {
        name: bus_name,
        name_chars: vec![' '; 16],
        // ... resto igual ...
    });
}
```

---

### #19 — `process::exit(0)` vaza recursos em restart

**Regras**: `proj-lib-main-split` (violação indireta)
**Arquivos**: `server_rust/src/main.rs:196`, `:716`

```rust
std::process::exit(0);
```

`process::exit` pula todos os `Drop` implementations. Conexões TCP, MIDI, `TrayIcon`, tasks tokio — nada é limpo. No Windows, o sistema operacional fecha os handles, mas não há garantia de flush de I/O.

**Solução**: Para restart, usar `std::mem::forget` + spawn + `tokio::spawn` + `tokio::signal::ctrl_c`, ou simplesmente aceitar (já documentado nos comentários). Se for mitigar, registrar handlers de shutdown que limpam recursos antes do `exit`.

---

### #20 — `ChannelState` serializa `name_chars` e `name` como dois campos separados no JSON

**Regras**: `mem-avoid-format` (indireto — mais largura de banda que memória)
**Arquivo**: `server_rust/src/state.rs:55-57`

No JSON enviado ao cliente via WebSocket, cada canal envia:

```json
{
  "nameChars": ["C", "H", " ", "1"],
  "name": "CH 1"
}
```

Isso dobra o tráfego de WebSocket para dados de nome. 40 canais + 8 mixes + 8 buses + 1 master = 57 instâncias, cada uma com ~50-100 bytes extras = ~3-6KB a mais por sync. Com sync frequente, isso se acumula.

**Solução**: Serializar apenas `name` no JSON e reconstruir `nameChars` no front-end, ou vice-versa.

```rust
// state.rs — CORRIGIDO (serializar apenas name)
#[serde(skip_serializing_if = "Vec::is_empty")]
pub name_chars: Vec<String>,  // não enviar no JSON
pub name: String,
```

No front-end, ao receber `name`, split em chars:

```javascript
// channel_strip.js
channel.nameChars = channel.name.split('').map(c => c === ' ' ? ' ' : c);
```

---

## 📋 Sumário para Implementação

| # | Severidade | O quê | Arquivo(s) | Esforço | Risco |
|---|-----------|-------|-----------|---------|-------|
| 1 | 🔴 | `Vec<String>` → `Vec<char>` em name_chars | `state.rs`, `socket_handlers.rs` | 3h | Médio (serialização) |
| 2 | 🔴 | Remover clone de `GlobalState` em `save_names_to_disk` | `config.rs` | 1h | Baixo |
| 3 | 🔴 | `meter_buffer` sem clone, array fixo | `midi_receiver.rs` | 30min | Baixo |
| 4 | 🔴 | Remover duplicação `name`/`name_chars` | `state.rs` | 2h | Médio (front-end) |
| 5 | 🟡 | Box `ParsedMidi::MeterData` | `protocol.rs` | 1h | Baixo |
| 6 | 🟡 | `with_capacity` em `sync_names_only` | `sync_manager.rs` | 10min | Baixo |
| 7 | 🟡 | Eliminar `format!()` em hot path de sync | `sync_manager.rs` | 2h | Baixo |
| 8 | 🟡 | `from_utf8_lossy` → `(c as char).to_string()` | `protocol.rs` | 10min | Baixo |
| 9 | 🟡 | `HashMap<usize,T>` → `Vec<T>` para canais | `state.rs`, +30 arquivos | 4h | Alto (mudança generalizada) |
| 10 | 🟡 | Evitar serialização redundante de `GlobalState` | `socket_handlers.rs`, `sync_manager.rs` | 1h | Médio |
| 11 | 🟠 | Limitar tamanho das filas do scheduler | `scheduler.rs` | 30min | Baixo |
| 12 | 🟠 | `Vec` → `Box<[_; 100]>` em SceneManager | `scene_manager.rs` | 30min | Baixo |
| 13 | 🟠 | `HashMap<String>` → `phf_map` ou `&'static str` | `protocol.rs` | 2h | Médio (dictionary.json) |
| 14 | 🟠 | Remover `Arc` redundante dos handles | `connection.rs` | 30min | Baixo |
| 15 | 🟠 | `format!("{:02X}")` → `{:02X?}` em logs | `sync_manager.rs` | 15min | Baixo |
| 16 | 🟠 | `AppConfig.clone()` → `Arc<AppConfig>` | `main.rs` | 1h | Médio |
| 17 | 🔵 | Remover `midi/assembler.rs` duplicado | `midi/assembler.rs` | 5min | Baixo |
| 18 | 🔵 | Evitar clone em `GlobalState::new()` | `state.rs` | 30min | Baixo |
| 19 | 🔵 | Mitigar `process::exit(0)` | `main.rs` | 1h | Baixo |
| 20 | 🔵 | Serializar só `name` ou só `name_chars` | `state.rs` | 1h | Médio (front-end) |

**Total estimado**: ~22h de implementação
**Ordem recomendada**: #3 → #6 → #8 → #11 → #17 → #14 → #2 → #5 → #1 → #4 → #7 → #10 → #9 → #13 → #16 → #12 → #15 → #18 → #20 → #19
