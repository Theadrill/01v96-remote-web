# Plano de Features

Guia de implementação passo a passo para agentes de IA.

---

## Feature 1: Cenas de Nomes Customizados

Permite criar e vincular cenas de nomes customizados (até 10 caracteres) às
cenas físicas da mesa (limite de 4 caracteres), com sincronização via Ninja
Sync e comparação inteligente para minimizar tráfego MIDI.

| Local           | Limite         | Exemplo      |
|-----------------|----------------|--------------|
| Mesa (hardware) | 4 caracteres   | `MAUR`       |
| App (interface) | 10 caracteres  | `MAURICIO`   |

### Estrutura de dados

#### Registro central: `custom_names_scenes-{nome_da_mesa}.json`

```json
{
  "mesa_nome": "igreja-central",
  "scenes": [
    {
      "physical_scene": "carlos",
      "physical_id": 8,
      "file": "custom_names_scene-carlos-igreja-central.json"
    }
  ]
}
```

| Campo                      | Tipo   | Descrição                              |
|----------------------------|--------|----------------------------------------|
| `mesa_nome`                | string | Nome do servidor (vindo do `.env`)     |
| `scenes[].physical_scene`  | string | Nome da cena física na mesa            |
| `scenes[].physical_id`     | number | ID da cena na mesa (1-99)              |
| `scenes[].file`            | string | Arquivo JSON com os nomes customizados |

#### Cena individual: `custom_names_scene-{nome}-{nome_da_mesa}.json`

```json
{
  "scene_name": "carlos",
  "scene_id": 8,
  "description": "",
  "channels": {
    "1":  { "name": "MAURICIO", "short": "MAUR" },
    "2":  { "name": "VIOLAO",   "short": "VIOL" },
    "32": { "name": "BATERIA",  "short": "BATE" },
    "33": { "name": "ST IN 1",  "short": "ST1 " },
    "35": { "name": "ST IN 2",  "short": "ST2 " },
    "37": { "name": "ST IN 3",  "short": "ST3 " },
    "39": { "name": "ST IN 4",  "short": "ST4 " },
    "master": { "name": "MASTER", "short": "MAST" }
  }
}
```

| Chave      | Cobertura                 |
|------------|---------------------------|
| `1` a `32` | Canais mono (inputs 1-32) |
| `33`       | ST IN 1 L                 |
| `34`       | ST IN 1 R                 |
| `35`       | ST IN 2 L                 |
| `36`       | ST IN 2 R                 |
| `37`       | ST IN 3 L                 |
| `38`       | ST IN 3 R                 |
| `39`       | ST IN 4 L                 |
| `40`       | ST IN 4 R                 |
| `master`   | Canal master              |

> O JSON usa índice baseado em 1 (canal 1 = primeiro canal físico). A mesa
> usa índice baseado em zero. Conversão: `json_id = mesa_channel + 1`.

#### Cena default: `custom_names_scene-default-{nome_da_mesa}.json`

Mesmo formato da cena individual. Atua como fallback: qualquer cena física
sem custom scene própria herda os nomes da default.

---

### ✅ Passo 1: Módulo Rust de custom scenes (COMPLETO)

**Onde:** `server_rust/src/custom_scenes.rs` (novo arquivo)

Módulo responsável por todas as operações de leitura, escrita e
sincronização dos arquivos JSON de custom scenes. Deve conter:

**O que foi feito:**
- Criado `server_rust/src/custom_scenes.rs` com 490 linhas contendo todos os tipos e funções
- `ChannelId` com `Input(u8)`, `StIn(u8)`, `Master` — serializa como string via `Display`/`FromStr`
- `CustomSceneRegistry`, `CustomScene`, `ChannelNameEntry`, `CachedScene`, `CustomSceneManager`, `CustomSceneOpQueue`
- `load_all`, `get_scene` (com mtime cache invalidation), `find_scene_for_physical`, `ensure_registry_entry`, `upsert_channel`, `remove_channel`, `list_scenes`, `persist` (atômico .tmp→.json), `enqueue_op` (CancellationToken)
- `normalize_name` (NFD + remove accents + alphanumeric only + trim 10)
- `to_short_name` (4 chars + right-pad with spaces)
- `save_json_atomic` (escreve .tmp, rename atômico)
- Adicionadas dependências `tokio-util` e `unicode-normalization` ao `Cargo.toml`
- Adicionado `mod custom_scenes` em `main.rs`, inicializado `CustomSceneManager` em `Arc<RwLock<>>`, criado diretório `data/custom_scenes/` no startup
- 8 testes unitários passando (ChannelId, normalize, to_short_name, remove_channel, registry, global_channel)

1. **`enum ChannelId`** — chave tipada para identificar canais no JSON.
   ```rust
   #[derive(Debug, Clone, Hash, Eq, PartialEq, Serialize, Deserialize)]
   #[serde(rename_all = "snake_case")]
   pub enum ChannelId {
       Input(u8),  // 1..=32
       StIn(u8),   // 33..=40
       Master,
   }
   ```
   - Implementar `TryFrom<&str>` / `FromStr` para converter de string JSON
     (`"1"` → `Input(1)`, `"master"` → `Master`).
   - Implementar `Display` para serializar de volta (`Input(1)` → `"1"`,
     `Master` → `"master"`).
   - **Validar ranges**: `Input(1..=32)`, `StIn(33..=40)`.
   - Rejeitar `0`, `41+`, strings vazias, `"mastr"` (typo).

2. **`struct CustomSceneRegistry`** — representa `custom_names_scenes-{nome}.json`
   - Campos: `mesa_nome: String`, `scenes: Vec<SceneEntry>`
   - `SceneEntry`: `physical_scene: String`, `physical_id: u8`,
     `file: String`

3. **`struct CustomScene`** — representa `custom_names_scene-{nome}-{mesa}.json`
   - Campos: `scene_name: String`, `scene_id: u8`,
     `channels: HashMap<ChannelId, ChannelNameEntry>` (usar `ChannelId`, não `String`)
   - `ChannelNameEntry`: `name: String`, `short: String`

4. **`struct CachedScene`** — wrapper para detecção de stale cache.
   ```rust
   struct CachedScene {
       scene: CustomScene,
       mtime: std::time::SystemTime,  // para detectar mudanças externas (Git pull)
   }
   ```

5. **`struct CustomSceneManager`** — gerencia cache + fila de operações + persistência.
   ```rust
   pub struct CustomSceneManager {
       registry: CustomSceneRegistry,
       cache: HashMap<String, CachedScene>,  // filename -> cached scene
       data_dir: PathBuf,
       mesa_nome: String,
       dirty_files: HashSet<String>,  // arquivos que precisam persistir
       operation_queue: CustomSceneOpQueue,
   }
   ```

6. **`struct CustomSceneOpQueue`** — fila serializada com CancellationToken.
   ```rust
   struct CustomSceneOpQueue {
       current_token: tokio_util::sync::CancellationToken,
       is_running: bool,
   }
   ```

7. **`fn CustomSceneManager::load_all(data_dir: &Path, mesa_nome: &str) -> Self`**
   - **Antes de tudo**: varre `data_dir` por arquivos `.tmp` e os remove
     (órfãos de crashes anteriores).
   - Carrega `custom_names_scenes-{mesa_nome}.json` do disco.
   - Para cada entrada no registro, carrega o JSON da cena e guarda em cache
     com `mtime` do arquivo.
   - Se não existir registro, retorna manager vazio.

8. **`fn get_scene(&mut self, filename: &str) -> Option<&CustomScene>`**
   - Verifica se o `mtime` atual do arquivo difere do `mtime` em cache.
   - Se mudou (Git pull externo), recarrega do disco e atualiza cache.
   - Retorna referência à cena em cache.

9. **`fn find_scene_for_physical(&mut self, physical_id: u8, physical_scene: &str) -> Option<&CustomScene>`**
   - Ordem de busca (primeiro match vence):
     1. `physical_id` no registro → carrega via `get_scene(file)`.
     2. `physical_scene` no registro → carrega via `get_scene(file)`.
     3. Tenta `custom_names_scene-default-{mesa_nome}.json`.
     4. Nenhum encontrado: retorna `None`.

10. **`fn ensure_registry_entry(&mut self, physical_scene: &str, physical_id: u8, file: &str)`**
    - Se já existe entrada com mesmo `physical_id`, atualiza `file`.
    - Senão, adiciona nova entrada.
    - Marca registro como dirty.

11. **`fn upsert_channel(&mut self, filename: &str, channel_id: ChannelId, name: &str)`**
    - Carrega ou cria `CustomScene` para `filename`.
    - Calcula `short = to_short_name(name)` — **derivado, nunca recebido do frontend**.
    - Atualiza `channels[channel_id] = ChannelNameEntry { name, short }`.
    - Marca arquivo como dirty.

12. **`fn remove_channel(&mut self, filename: &str, channel_id: &ChannelId) -> bool`**
    - Remove `channels[channel_id]` da cena.
    - Se `channels` ficar vazio:
      a. Deleta o arquivo JSON do disco.
      b. **Remove a `SceneEntry` correspondente do registro**.
      c. Marca registro como dirty.
      d. Remove do cache.
      e. Retorna `true`.
    - Senão: marca arquivo como dirty, retorna `false`.

13. **`fn list_scenes(&self) -> Vec<SceneEntry>`**
    - Retorna cópia das entradas do registro para o frontend.

14. **`fn persist(&mut self)` (chamado com debounce)**
    - Para cada arquivo dirty:
      a. Serializa para JSON via `serde_json::to_string_pretty`.
      b. Escreve em `{filename}.tmp`.
      c. Renomeia `.tmp` → `.json` (operação atômica no OS).
    - Se registro dirty: salva `custom_names_scenes-{mesa_nome}.json` com mesmo
      padrão atômico.

15. **`fn enqueue_op<F, Fut>(&self, op: F) where F: FnOnce(CancellationToken) -> Fut`**
    - Cancela o token da operação anterior.
    - Cria novo `CancellationToken`.
    - Spawna task com a nova operação e o novo token.

16. **`fn normalize_name(input: &str) -> String`**
    ```rust
    pub fn normalize_name(input: &str) -> String {
        input
            .to_uppercase()                    // 1. Maiúsculo primeiro
            .chars()
            .map(|c| remove_accent(c))         // 2. Remove acentos
            .filter(|c| c.is_ascii_alphanumeric() || *c == ' ')
            .take(10)                          // 3. Trunca em 10 chars
            .collect::<String>()
            .trim()
            .to_string()
    }
    ```
    - Usar crate `unicode-normalization` para NFD + strip combining marks.

17. **`fn to_short_name(name: &str) -> String`**
    ```rust
    pub fn to_short_name(name: &str) -> String {
        let normalized: String = name
            .chars()
            .filter(|c| c.is_ascii_alphanumeric())
            .take(4)
            .collect();
        format!("{: <4}", normalized.to_uppercase())  // padding à direita
    }
    ```
    - Garante **exatamente 4 bytes** (`name.len()` deve ser 4).
    - Ex: `"AX"` → `"AX  "`, `"MAURICIO"` → `"MAUR"`.

18. **`fn save_json_atomic(path: &Path, data: &impl Serialize)`**
    - Escreve em `path.with_extension("json.tmp")`.
    - Renomeia `.json.tmp` → `.json`.
    - Se `rename` falhar, o `.json` original permanece intacto.

**Verificação:** Teste unitário para cada função pública, incluindo:
- `normalize_name` com acentos, emojis, strings vazias
- `to_short_name` com nomes curtos ("AX" → "AX  ") e longos
- `ChannelId` com valores válidos e inválidos
- `remove_channel` com e sem deleção de arquivo
- `save_json_atomic` simulando crash no meio da escrita
- `get_scene` com mtime alterado (simular Git pull)

---

### ✅ Passo 2: Integração com troca de cena da mesa (COMPLETO)

**Onde:**
- `server_rust/src/socket_handlers.rs` (handler `recallScene` existente)
- `server_rust/src/midi_receiver.rs` (detecção de `PhysicalSceneRecall`)
- `server_rust/src/custom_scenes.rs` (operação na fila)

**O que foi feito:**
- No handler `recallScene` em `socket_handlers.rs`, após o delay de 2s existente e antes do `fire_params_only`, foi inserida uma task `tokio::spawn` que:
  1. Aguarda 2s com `CancellationToken` (select)
  2. Dá lock curto no `GlobalState` para ler `scene_number` e `scene_name`
  3. Dá lock curto no `CustomSceneManager` para buscar `find_scene_for_physical` + coletar `current_names`
  4. Libera todos os locks
  5. Itera sobre `scene.channels`, compara `current_short` com `entry.short`, envia MIDI só dos divergentes (30ms entre bytes)
  6. Emite `customSceneLoaded` com `{ active, scene_name, scene_id, channels }`
- Caso não encontre custom scene: emite `{ active: false }` sem alterar nada
- `midi_receiver.rs` não foi modificado (a detecção via socket é suficiente por enquanto)
- `CustomSceneManager` vive em `Arc<RwLock<>>` separado do `GlobalState` — sem interferência com faders/mutes/sync

**IMPORTANTE:** O `CustomSceneManager` vive em `Arc<RwLock<CustomSceneManager>>`
**separado** do `GlobalState`. Isso evita bloquear faders/mutes durante a
aplicação de nomes.

Quando o servidor detecta que uma cena física foi carregada:

1. Em vez de executar diretamente, **enfileira uma operação** via
   `CustomSceneManager::enqueue_op()`:

   ```rust
   // Conceitual — no handler recallScene ou midi_receiver:
   custom_scene_manager.enqueue_op(|cancel_token| async move {
       // 1. Aguarda 2s (tempo do dump MIDI)
       tokio::select! {
           _ = tokio::time::sleep(Duration::from_secs(2)) => {}
           _ = cancel_token.cancelled() => {
               tracing::info!("⏹️ Aplicação de nomes cancelada (nova cena)");
               return;
           }
       }

       // 2. Snapshot: locks curtos, copia só o necessário
       let mesa_nome = {
           let csm = custom_scene_manager.read().await;
           csm.mesa_nome.clone()
       };

       let (scene_option, current_names) = {
           let state = global_state.read().await;
           let scene_number = state.scene_number;
           let scene_name = state.scene_name.clone();
           // Coletar nomes atuais da mesa (ChannelId -> String)
           let names = collect_current_names(&state);
           drop(state);  // ← lock do GlobalState liberado aqui

           let mut csm = custom_scene_manager.write().await;
           let scene = csm.find_scene_for_physical(
               scene_number as u8,
               &scene_name,
           ).cloned();
           (scene, names)
       };  // ← lock do CustomSceneManager liberado aqui

       // 3. A partir daqui, NENHUM lock está retido
       let scene = match scene_option {
           Some(s) => s,
           None => {
               // Emitir evento: nenhuma custom scene ativa
               let _ = io.emit("customSceneLoaded", &serde_json::json!({
                   "active": false
               })).await;
               return;
           }
       };

       // 4. Comparar nomes e enviar MIDI apenas dos divergentes
       for (channel_id, entry) in &scene.channels {
           if cancel_token.is_cancelled() { return; }

           // Converter ChannelId para channel global da mesa
           let global_ch = channel_id.to_global_channel();

           // Comparar com nome atual na mesa
           let current_short = current_names.get(channel_id)
               .map(|n| to_short_name(n))
               .unwrap_or_default();

           if current_short == entry.short {
               continue;  // já está igual, pula
           }

           // Enviar os 4 bytes do short para a mesa
           let short_bytes: Vec<u8> = entry.short.bytes().take(4).collect();
           for (ci, &byte) in short_bytes.iter().enumerate() {
               if cancel_token.is_cancelled() { return; }

               if let Some(req) = midi::protocol::build_name_change(
                   global_ch, ci as u8, byte
               ) {
                   scheduler.enqueue(req, 1).await;
               }

               if ci < short_bytes.len() - 1 {
                   tokio::select! {
                       _ = tokio::time::sleep(Duration::from_millis(30)) => {}
                       _ = cancel_token.cancelled() => { return; }
                   }
               }
           }
       }

       // 5. Emitir evento de sucesso
       let _ = io.emit("customSceneLoaded", &serde_json::json!({
           "active": true,
           "scene_name": scene.scene_name,
           "scene_id": scene.scene_id,
       })).await;
   });
   ```

2. Casos de borda:
   - Canal do JSON não encontrado no `current_names`: pula (não altera).
   - JSON mal formatado: `get_scene` retorna `None`, loga erro.
   - `short` SEMPRE tem exatamente 4 bytes (garantido por `to_short_name`).
   - `physical_id` é a chave principal de matching; `physical_scene` é
     fallback.
   - Se token for cancelado durante o loop de 30ms, interrompe
     imediatamente sem enviar comandos parciais.

3. **Onde detectar a troca de cena:**
   - No handler `recallScene` (`socket_handlers.rs`): após o delay de 2s
     existente e antes do `fire_params_only`, enfileirar a operação.
   - No `midi_receiver.rs`: ao receber `PhysicalSceneRecall`, enfileirar
     a operação.
   - **Proteger com dedup**: se ambas as fontes detectarem a mesma cena,
     a segunda operação apenas cancela a primeira (que já está fazendo
     a coisa certa) — é um cancelamento inócuo.

**Verificação:**
- Trocar cena na mesa → nomes customizados aplicados (só os que mudaram).
- Trocar cena 2x rápido → a primeira aplicação é cancelada (log mostra
  `"⏹️ Aplicação de nomes cancelada"`), só a segunda roda.
- Logs mostram quais canais foram alterados e quais foram pulados.

---

### ✅ Passo 3: Salvamento de nome customizado (COMPLETO)

**Onde:** `server_rust/src/socket_handlers.rs` — handlers
`"saveCustomName"` e `"removeCustomName"`

**O que foi feito:**
- Handler `saveCustomName`: recebe `{ channel, name }`, valida, normaliza, deriva `short` server-side, upsert no JSON via `upsert_channel`, envia MIDI se short difere do atual, emite `updateName` (broadcast) e `saveNameResult` (ack)
- Handler `removeCustomName`: recebe `{ channel }`, remove do JSON, se channels ficar vazio deleta arquivo + entrada do registro, emite `updateName` com nome original de 4 chars
- Handler `listCustomScenes`: retorna lista de cenas do registro
- Handler `assignCustomScene`: associa custom scene a cena física via `ensure_registry_entry`
- Funções auxiliares: `collect_current_names`, `collect_current_channels_as_entries`, `get_channel_short_name`
- `saveSceneResult` agora inclui `scene_name` para o frontend saber qual cena foi salva
- `updateName` emitido para todos os clientes com o `name` completo (não só 4 chars)
- Criação automática de custom scene com snapshot dos nomes atuais se arquivo não existe
- Persistência atômica (`persist()` chamada após upsert)

**IMPORTANTE:** O `short` é **sempre derivado** de `name` pelo backend via
`to_short_name()`. O frontend **não envia** `short`.

**Dados recebidos do frontend:**
```json
{
  "channel": 2,
  "name": "MAURICIO"
  // NOTA: short NÃO é enviado — é derivado no backend
}
```

**Handler (`saveCustomName`):**

1. Lê `sceneName` e `sceneNumber` do `GlobalState` (lock curto de leitura).
2. Extrai o nome base da cena:
   - Se `sceneName` contém `" - "`, usa o texto após o primeiro `" - "`.
   - Senão, usa o nome completo.
3. Determina `filename`:
   `custom_names_scene-{nome_base}-{SERVER_NAME}.json`.
4. Se `.env` não tem `SERVER_NAME`, retorna erro (Feature 2 necessária).
5. Converte `channel` recebido (base-0 da mesa) para `ChannelId`
   (base-1 do JSON):
   - `0..=31` → `Input(ch + 1)`
   - `32..=39` (ST IN local) → `StIn(60 + (ch - 32) + 1)` (global + 1)
   - `52` → `Master`
6. Calcula `short = to_short_name(&data.name)` — **sempre derivado, nunca
   vindo do frontend**.
7. **Enfileira operação** via `enqueue_op`:

   ```rust
   custom_scene_manager.enqueue_op(|cancel_token| async move {
       // Snapshot: lock curto em cada cofre
       let (scene_number, scene_name) = {
           let state = global_state.read().await;
           (state.scene_number, state.scene_name.clone())
       };

       // Atualizar ou criar CustomScene
       {
           let mut csm = custom_scene_manager.write().await;
           // Se arquivo não existe, criar com snapshot dos nomes atuais
           if csm.get_scene(&filename).is_none() {
               let state = global_state.read().await;
               let channels = collect_current_channels_as_entries(&state);
               csm.create_scene(&filename, &scene_name, scene_number as u8, channels);
           }

           // upsert com short derivado
           csm.upsert_channel(&filename, channel_id, &data.name);
           csm.ensure_registry_entry(&scene_name, scene_number as u8, &filename);
       }  // lock do CSM liberado aqui

       // Se short != nome atual na mesa, enviar MIDI
       let current_name = {
           let state = global_state.read().await;
           get_channel_short_name(&state, data.channel)
       };
       drop(global_state);  // lock liberado

       if current_name.as_deref() != Some(&short) {
           let short_bytes: Vec<u8> = short.bytes().take(4).collect();
           for (ci, &byte) in short_bytes.iter().enumerate() {
               if cancel_token.is_cancelled() { return; }
               if let Some(req) = midi::protocol::build_name_change(
                   data.channel as u8, ci as u8, byte
               ) {
                   scheduler.enqueue(req, 1).await;
               }
               if ci < short_bytes.len() - 1 {
                   tokio::time::sleep(Duration::from_millis(30)).await;
               }
           }
       }

       // Persistência com debounce
       let mut csm = custom_scene_manager.write().await;
       csm.mark_dirty(&filename);
       // O debounce de persist é feito externamente (timer separado)
   });
   ```

8. Emite `"updateName"` para todos os clientes com o `name` completo.

**Handler (`removeCustomName`):**
- Recebe `{ channel: 2 }`.
- Remove o canal da custom scene atual.
- Se `channels` ficar vazio: deleta o JSON + remove entrada do registro.
- Emite `"updateName"` com o nome original de 4 chars (volta ao padrão).

**Verificação:**
- Editar nome com checkbox marcada → JSON criado/atualizado na pasta
  `data/custom_scenes/`.
- `short` é sempre derivado de `name` — testar com `"MAURICIO"` → `short = "MAUR"`.
- Remover último canal → JSON deletado + registro limpo.

---

### ✅ Passo 4: Frontend — Modal de edição de nome (COMPLETO)

**Onde:** `public/index.html`, `public/modules/sidebar.js`, `public/modules/socket.js`

**O que foi feito:**
- **`index.html`**: adicionado ao `#nameEditorModal`:
  - Checkbox "Criar nome customizado" com `onchange="toggleCustomNameEditor()"`
  - Preview `#namePreview` com duas linhas: "App: XX" (azul) / "Mesa: XX" (laranja)
  - Botão "Remover nome customizado" (`#btnRemoveCustomName`)
- **`sidebar.js`**: adicionadas funções:
  - `normalizeNameEditor(str)` — NFD + remove combining marks + `[^A-Za-z0-9 ]` + toUpperCase
  - `updateNamePreview()` — atualiza preview em tempo real
  - `toggleCustomNameEditor()` — alterna maxlength 4↔10, trunca se desmarcar, mostra/esconde preview
  - `removeCustomName()` — emite `removeCustomName`, limpa `activeCustomSceneChannels` local
  - `openNameEditor()` modificado: verifica `window.activeCustomSceneChannels[ch]`, seta checkbox/removeBtn/preview
  - `saveChannelName()` modificado: checkbox OFF→`updateName` (4 chars legado), ON→`saveCustomName` (10 chars)
  - Input listener: validação em tempo real (remove acentos/símbolos na digitação), atualiza preview
- **`socket.js`**: adicionados listeners:
  - `customSceneLoaded`: armazena `window.activeCustomSceneChannels` (mapa ch→{name, short})
  - `saveNameResult`: overlay de sucesso/erro
- **`socket_handlers.rs`**: `customSceneLoaded` agora inclui `channels` array com `{ch, name, short}`

Extenda o fluxo existente de edição de nome. Atualmente, ao clicar no nome
do canal, o sistema já está preparado para edição. Adicione:

1. **Checkbox "Criar nome customizado":**
   - Renderizada abaixo do input de nome no modal de edição.
   - Desmarcada por padrão.
   - Ao marcar:
     - O atributo `maxlength` do input muda de 4 para 10.
     - O preview em tempo real aparece abaixo do input:
       ```
       <div id="namePreview">
         <span>App: MAURICIO</span>
         <span>Mesa: MAUR</span>
       </div>
       ```
     - Aplica validação em tempo real:
       - Remove acentos automaticamente (`normalize_name` no frontend,
         espelhando a lógica do Rust).
       - Remove símbolos especiais.
       - Borda do input fica vermelha se houver caracteres inválidos.
   - Ao desmarcar:
     - Se o nome atual tem > 4 chars, trunca para 4.
     - `maxlength` volta a 4.
     - Preview some.

2. **Preview em tempo real:**
   - Evento `oninput` no campo de nome.
   - Linha "App" mostra o nome normalizado (até 10 chars).
   - Linha "Mesa" mostra os 4 primeiros caracteres, maiúsculo, com espaços
     se necessário.

3. **Botão "Remover nome customizado":**
   - Visível apenas se o canal atual já tem uma entrada na custom scene
     da cena física ativa.
   - Ao clicar, emite `"removeCustomName"` para o servidor com
     `{ channel: id }`.
   - O servidor remove a chave do JSON. Se o JSON ficar vazio, deleta o
     arquivo e remove do registro.

4. **Fluxo de salvamento:**
   - Se checkbox desmarcada: fluxo legado (`updateName`).
   - Se checkbox marcada: emite `"saveCustomName"` com `channel` e `name`
     (normalizado, até 10 chars).
   - **NOTA:** `short` NÃO é enviado. O backend deriva `short` de `name`
     automaticamente via `to_short_name()`.

5. **Handler `"removeCustomName"`:**
   - Botão "Remover nome customizado" visível apenas se o canal atual
     tem entrada na custom scene ativa.
   - Emite `{ channel: id }`.
   - Backend remove a chave do JSON. Se ficar vazio, deleta arquivo + limpa
     registro.

**Verificação:**
- Digitar "MÚSICA!" → App mostra "MUSICA", Mesa mostra "MUSI".
- Desmarcar checkbox com nome "MAURICIO" → input trunca para "MAUR".
- Salvar com checkbox desmarcada → nome de 4 chars vai para a mesa (fluxo
  legado).
- Salvar com checkbox marcada → arquivo JSON criado/atualizado, nome de 4
  chars enviado para a mesa (short derivado do name).
- Remover nome customizado → voltes para o nome de 4 chars padrão da mesa.

---

### ✅ Passo 5: Frontend — Tela de gerenciamento (COMPLETO)

**Onde:** `public/modules/custom_scenes.js` (novo), `public/index.html`, `public/modules/sidebar.js`

**O que foi feito:**
- **`custom_scenes.js`** (novo, 160 linhas): lógica completa de gerenciamento:
  - `showCustomScenes()`: abre modal, emite `listCustomScenes`
  - `renderCustomScenesList()`: renderiza cartões com nome, arquivo, status de atribuição
  - `openAssignScene()`: abre modal de atribuição com radio buttons das cenas físicas (de `scenesLibrary`)
  - `confirmAssignScene()`: emite `assignCustomScene` com `{ file, physical_id, physical_scene }`
  - `openSceneDetails()`: abre tabela de comparação, emite `previewCustomScene`
  - `getChannelLabel()`: converte channel global (0-31, 60-67, 52) para label "CH 1", "ST IN 1L", "MASTER"
  - Escuta `customScenesList`, `previewResult`, `assignResult`
- **`index.html`**: 3 novos modais:
  - `customScenesModal`: lista de cenas customizadas com botões ATRIBUIR/DETALHES
  - `assignSceneModal`: seletor de cena física via radio buttons
  - `sceneDetailsModal`: tabela de comparação Canal | Nome Customizado | Nome na Mesa (linhas divergentes em amarelo)
  - Botão "NOMES CUSTOMIZADOS" na seção de cenas do config modal (ao lado de SALVAR/CARREGAR CENA)
- **`sidebar.js`**: removido botão "CENAS" do dock (agora fica no config modal)
- **`socket_handlers.rs`**: novo handler `previewCustomScene` — carrega cena do disco + `GlobalState` (locks sequenciais), retorna `{ channels: [{ ch, name, short, mesa_name }] }`, incluindo canais da cena + canais da mesa sem entrada
- **`socket_handlers.rs`**: novo handler `getActiveCustomChannels` — retorna canais customizados da cena física ativa (para popular `activeCustomSceneChannels` após reconnect/save)
- **`socket.js`**: novo listener `activeCustomChannels` — popula `window.activeCustomSceneChannels`; `requestActiveCustomChannels()` chamado após `currentScene` e `saveSceneResult`

Nova tela acessível pelo menu principal. Exibe a lista de custom scenes e
permite atribuí-las a cenas físicas.

1. **Lista de cenas:**
   - Emite `"listCustomScenes"` para o servidor.
   - Servidor retorna `{ scenes: [{ name, file, physical_scene, physical_id, modified }] }`.
   - Exibe cada cena com: nome, cena física vinculada (se houver), data de
     modificação.

2. **Modal de atribuição:**
   - Ao clicar em uma custom scene, abre modal.
   - Mostra lista de cenas físicas detectadas na mesa (obtidas do
     `SceneManager`).
   - O usuário seleciona uma (radio button, seleção única).
   - Botões **Confirmar** e **Cancelar**.
   - Ao confirmar, emite `"assignCustomScene"` com
     `{ file, physical_id, physical_scene }`.

3. **Handler `"assignCustomScene"` no servidor:**
   - Carrega o registro, chama `ensure_registry_entry(...)`, salva.
   - Responde com `{ success: true }`.

4. **Tabela de comparação (dentro do modal de detalhes):**
   - Ao clicar em "Ver detalhes" em uma custom scene, abre sub-modal com
     tabela de 3 colunas: Canal | Nome Customizado | Nome Atual na Mesa.
   - Linhas com nomes divergentes: fundo amarelo.
   - Dados obtidos via evento `"previewCustomScene"` — o servidor carrega a
     cena e retorna `{ channels: { "1": { name, short, mesa_name }, ... } }`
     com o nome atual de cada canal lido do `GlobalState`.

**Verificação:** Listar cenas, atribuir uma a uma cena física, ver detalhes
com tabela de comparação, confirmar que a atribuição persiste após reload.

---

### ✅ Passo 6: Backend — Renomeação de servidor (COMPLETO)

**Onde:**
- `server_rust/src/socket_handlers.rs` — handler `"renameServer"`
- `server_rust/src/custom_scenes.rs` — método `CustomSceneManager::rename_mesa()`

Handler que propaga a renomeação do servidor para todos os arquivos de
custom scenes:

1. Recebe `{ old_name: "casa-antiga", new_name: "casa-nova" }`.
2. Valida `new_name` (mesmas regras de 2.3.3).
3. Chama `CustomSceneManager::rename_mesa(old_name, new_name)` que faz:

   ```rust
   pub async fn rename_mesa(&mut self, old_name: &str, new_name: &str) -> Result<(), String> {
       // 1. Carrega registro antigo
       let old_registry_path = self.data_dir.join(format!("custom_names_scenes-{}.json", old_name));
       let registry: CustomSceneRegistry = load_json(&old_registry_path)?;

       // 2. Para cada scene, renomeia o arquivo
       let mut new_registry = CustomSceneRegistry {
           mesa_nome: new_name.to_string(),
           scenes: Vec::with_capacity(registry.scenes.len()),
       };

       for entry in &registry.scenes {
           // Novo nome do arquivo: substitui {old_name} por {new_name}
           let new_file = entry.file.replace(old_name, new_name);
           let old_path = self.data_dir.join(&entry.file);
           let new_path = self.data_dir.join(&new_file);

           // Renomeia (move) o arquivo
           fs::rename(&old_path, &new_path).map_err(|e| format!("Erro ao renomear {}: {}", entry.file, e))?;

           new_registry.scenes.push(SceneEntry {
               physical_scene: entry.physical_scene.clone(),
               physical_id: entry.physical_id,
               file: new_file,
           });
       }

       // 3. Default scene
       let old_default = self.data_dir.join(format!("custom_names_scene-default-{}.json", old_name));
       let new_default = self.data_dir.join(format!("custom_names_scene-default-{}.json", new_name));
       if old_default.exists() {
           fs::rename(&old_default, &new_default)?;
       }

       // 4. Salva novo registro
       let new_registry_path = self.data_dir.join(format!("custom_names_scenes-{}.json", new_name));
       save_json_atomic(&new_registry_path, &new_registry)?;

       // 5. Remove registro antigo
       fs::remove_file(&old_registry_path)?;

       // 6. Atualiza cache em RAM
       self.registry = new_registry;
       self.mesa_nome = new_name.to_string();
       // Invalidar cache (nomes de arquivo mudaram)
       self.cache.clear();

       // 7. Persiste
       self.persist();
       
       Ok(())
   }
   ```

4. Atualiza o `.env` com `SERVER_NAME={new_name}` (já existente).

**Verificação:** Renomear servidor, verificar que todos os arquivos foram
renomeados e o registro atualizado.

---

### ✅ Passo 7: Integração Ninja Sync + Cache Invalidation (COMPLETO)

**Onde:**
- `server_rust/src/network/sync_manager.rs` ou módulo existente de Git sync
- `server_rust/src/api/macros.rs` — função `enqueue_git_sync`
- `server_rust/src/custom_scenes.rs` — `get_scene` (mtime check)

**IMPORTANTE:** O Git sync do projeto é **fire-and-forget** (dispara
commit/push e termina). Não há callback de "pull concluído". Por isso, o
cache não pode depender de notificação — ele usa **verificação lazy via
mtime**.

1. **Git push:** após qualquer `upsert_channel`, `remove_channel`, ou
   `persist`, agenda um commit e push:
   - Use debounce de 5 segundos (acumula múltiplas alterações em um único
     commit).
   - Mensagem de commit: `"custom_scenes: update {filename}"`.
   - Reutilizar `enqueue_git_sync` existente em `api/macros.rs`.

2. **Git pull: detecção de mudanças externas (stale cache):**
   - O `CustomSceneManager::get_scene(filename)` **sempre** compara o
     `mtime` atual do arquivo com o `mtime` armazenado em cache.
   - Se o `mtime` mudou (outro computador fez push, este servidor fez pull
     manual): recarrega o JSON do disco e atualiza o cache.
   - Isso funciona **sem listener de pull** — a detecção é sob demanda,
     na primeira consulta após a mudança.

   ```rust
   pub fn get_scene(&mut self, filename: &str) -> Option<&CustomScene> {
       let cached = self.cache.get(filename)?;
       let path = self.data_dir.join(filename);

       // Verificar mtime atual vs cache
       let current_mtime = fs::metadata(&path).ok()?.modified().ok()?;
       if current_mtime != cached.mtime {
           // Stale! Recarregar do disco
           tracing::info!("🔄 Cache stale para {}, recarregando do disco...", filename);
           match load_scene_inner(&path) {
               Ok(scene) => {
                   self.cache.insert(filename.to_string(), CachedScene {
                       scene,
                       mtime: current_mtime,
                   });
               }
               Err(e) => {
                   tracing::error!("Erro ao recarregar {}: {}", filename, e);
                   return None;
               }
           }
       }

       self.cache.get(filename).map(|c| &c.scene)
   }
   ```

3. **No boot do servidor:**
   - Após o pull Git inicial (já existente), o `CustomSceneManager::load_all`
     já carrega tudo com mtimes corretos.
   - **Não precisa** recarregar após o pull — a verificação lazy cuida disso
     na primeira consulta.

**Verificação:**
- Criar uma custom scene → após 5s, Git push é executado (ver log).
- Em outro dispositivo, fazer pull manual → no servidor, acessar a cena
  → log mostra "Cache stale, recarregando".
- Arquivos `.tmp` não são commitados (adicionar ao `.gitignore`).

---

### Passo 8: Frontend — Indicador visual de custom scene ativa

**Onde:** `public/modules/custom_scenes.js` e sidebar/header HTML

Quando uma custom scene está carregada (evento `"customSceneLoaded"`),
exiba um indicador visual (ícone, badge ou texto) na interface.

> **IMPORTANTE:** O local exato do indicador **deve ser perguntado ao
> usuário** antes da implementação. Esta é a última etapa — implemente
> somente após receber a resposta do usuário sobre o posicionamento.

**Verificação:** Carregar uma custom scene, verificar que o indicador
aparece. Trocar para uma cena sem custom scene, verificar que o indicador
some.

---

## Feature 2: Atribuição de Nome ao Servidor/Mesa

Sistema de cadastro que identifica unicamente cada servidor/mesa. O nome e a
senha ficam no `.env` e são usados para vincular configurações (como custom
scenes) a uma mesa específica.

### Passo 1: Backend — Detecção e validação do `.env`

**Onde:** `server_rust/src/config.rs` (estender módulo existente)

1. **`fn detect_env_status() -> EnvStatus`:**
   - Retorna enum: `Complete`, `MissingPassword`, `MissingName`,
     `MissingBoth`, `NotFound`.
   - `NotFound`: arquivo `.env` não existe na raiz do projeto.
   - `MissingPassword`: arquivo existe mas `SERVER_PASSWORD` está ausente
     ou vazio.
   - `MissingName`: arquivo existe mas `SERVER_NAME` está ausente ou vazio.
   - `MissingBoth`: ambos ausentes.
   - `Complete`: tudo presente.

2. **`fn validate_server_name(name: &str) -> Result<(), String>`:**
   - Mínimo 3, máximo 30 caracteres.
   - Apenas letras minúsculas, números e hífen.
   - Sem espaços, acentos ou símbolos.

3. **`fn validate_password(password: &str) -> Result<(), String>`:**
   - Exatamente 4 dígitos numéricos (0-9).

4. **`fn save_env(name: &str, password: &str)`:**
   - Cria ou atualiza o `.env` com `SERVER_NAME={name}` e
     `SERVER_PASSWORD={password}`.

5. **`fn load_server_name() -> Option<String>`:**
   - Lê `SERVER_NAME` do `.env`.

6. **`fn load_password() -> Option<String>`:**
   - Lê `SERVER_PASSWORD` do `.env`.

**Verificação:** Testar cada cenário de `detect_env_status` com `.env`
presente, ausente, e com campos faltando.

---

### Passo 2: Backend — Bloqueio de acesso ao modo Técnico

**Onde:** `server_rust/src/main.rs` ou `server_rust/src/socket_handlers.rs`

Na conexão do cliente, após a splash screen:

1. O frontend emite `"checkSetupStatus"` ao conectar.
2. O servidor responde com `{ env_status: "complete" | "missing_password" | "missing_name" | "missing_both" | "not_found" }`.
3. O servidor armazena o status em memória.
4. Qualquer evento que exija modo Técnico (`control`, `setPan`, etc.) é
   rejeitado com erro se o status não for `"complete"`.

**Verificação:** Remover o `.env`, conectar, verificar que comandos de
controle são rejeitados.

---

### Passo 3: Frontend — Tela de cadastro

**Onde:** `public/index.html` e `public/modules/setup.js` (novo)

Tela exibida na splash screen após clicar em **TÉCNICO** quando o cadastro
é necessário.

1. **Estrutura HTML:**
   - Container centralizado com título "CONFIGURAÇÃO INICIAL DO SERVIDOR".
   - Campo de texto para nome do servidor.
   - Campo de senha (type="password", 4 dígitos).
   - Campo de confirmação de senha.
   - Botão **CONTINUAR**.

2. **Comportamento do campo de nome:**
   - Placeholder inicial: `ex: mesa-do-joao` (texto cinza).
   - Ao clicar no input, o placeholder é removido e o campo fica em branco.
   - Se o usuário não digitar nada e clicar em **CONTINUAR**, o sistema
     exibe erro `"Digite um nome para o servidor"`, foca no input, e não
     avança.
   - O campo é obrigatório.

3. **Comportamento do campo de senha:**
   - `maxlength="4"`, `inputmode="numeric"`, `pattern="[0-9]{4}"`.
   - Confirmação deve ser idêntica.

4. **Validação no frontend (antes de enviar):**
   - Nome do servidor: mesma validação do backend (mínimo 3, máximo 30,
     letras minúsculas, números, hífen).
   - Senha: exatamente 4 dígitos.
   - Confirmação igual à senha.

5. **Envio:**
   - Emite `"setupServer"` com `{ name, password }`.
   - Servidor valida, salva o `.env`, responde `{ success: true }`.
   - Frontend redireciona para a tela principal de mixagem.
   - Se falhar, exibe mensagem de erro.

6. **Cadastro parcial:**
   - Se o `.env` já existe mas falta algum campo (ex: senha definida mas
     sem nome), a tela mostra apenas o campo faltante.
   - Campos já preenchidos aparecem como texto somente leitura.

**Verificação:** Apagar `.env`, abrir app, clicar em TÉCNICO, preencher
formulário, confirmar que `.env` foi criado e a tela principal abre.
Testar também com dados inválidos e campos faltantes.

---

### Passo 4: Frontend — Exibição do nome na sidebar

**Onde:** `public/modules/sidebar.js` e `public/index.html`

1. Ao carregar a interface, emita `"getServerName"` para obter o
   `SERVER_NAME` do `.env.
2. Substitua o texto **01V96** na sidebar pelo `SERVER_NAME`.
3. Se `SERVER_NAME` não existir, mantenha **01V96**.

**Verificação:** Com `.env` definido, a sidebar mostra o nome do servidor.
Sem `.env`, mostra "01V96".

---

### Passo 5: Frontend + Backend — Configurações e reset

**Onde:** `public/modules/settings.js` (estender ou criar) e
`server_rust/src/socket_handlers.rs`

1. **Tela de configurações:**
   - Adicione seção "Servidor" com:
     - Campo para editar `SERVER_NAME`.
     - Botão **Resetar configuração**.

2. **Handler `"renameServer"` no backend:**
   - Já descrito no Passo 6 da Feature 1 (renomeação propaga para custom
     scenes).
   - Se não houver custom scenes, apenas atualiza o `.env`.

3. **Handler `"resetConfig"` no backend:**
   - Apaga o arquivo `.env`.
   - Emite `"configReset"` para o frontend.
   - Frontend redireciona para a splash screen.

**Verificação:** Alterar nome nas configurações, verificar `.env`
atualizado. Clicar em reset, verificar que `.env` foi removido e splash
screen reaparece.

---

### Passo 6: Segurança

1. Adicione `.env` ao `.gitignore` do projeto.
2. O `SERVER_NAME` pode ser versionado (não contém senha).

**Verificação:** `git status` não mostra `.env` como arquivo modificado.
