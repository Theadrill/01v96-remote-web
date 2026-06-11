# Feature: Nomes Globais (Global Names)

Permite definir nomes customizados (até 10 caracteres) para canais específicos
que **persistem independentemente da cena** carregada na mesa. Nomes globais
têm **prioridade máxima** sobre nomes de cenas customizadas e nomes físicos.

## Conceito

| Prioridade | Tipo                | Escopo         | Persistência                  |
|------------|---------------------|----------------|-------------------------------|
| 1 (maior)  | **Nome Global**     | Global (mesa)  | `global-names-{mesa}.json`    |
| 2          | Nome Custom Scene   | Por cena       | `custom_names_scene-*.json`   |
| 3 (menor)  | Nome Físico (mesa)  | Por cena       | Na própria mesa (MIDI dump)   |

### Comportamento

- Se um canal possui **nome global**, este **sempre** será exibido no frontend,
  independente da cena física carregada.
- Ao aplicar uma custom scene na mesa, os nomes globais **não são sobrescritos**
  na exibição — eles mantêm prioridade.
- MIDI: ao salvar um nome global, se o `short` (4 chars) for diferente do que
  está na mesa, envia os comandos MIDI para atualizar. Isso garante que o nome
  global também apareça no visor da mesa.
- Ao trocar de cena física, o backend **re-aplica os nomes globais por cima**
  dos nomes da custom scene, se o short global divergir do que está na mesa.

---

## Estrutura de Dados

### Arquivo: `data/custom_scenes/{local,shared}/global-names-{mesa_nome}.json`

```json
{
  "mesa_nome": "mesa-favela",
  "channels": {
    "1":  { "name": "MAURICIO", "short": "MAUR" },
    "10": { "name": "BUMBO",     "short": "BUMB" },
    "master": { "name": "MASTER", "short": "MAST" }
  }
}
```

Reusa `ChannelNameEntry` e `ChannelId` já existentes em `custom_scenes.rs`.

---

## Plano de Implementação

### Passo 1: Backend — Modelo e Persistência (`custom_scenes.rs`)

Adicionar ao `CustomSceneManager`:

1. **`global_names_path(&self) -> PathBuf`**
   - Retorna `{data_dir}/local/global-names-{mesa_nome}.json`

2. **`global_names: HashMap<ChannelId, ChannelNameEntry>`** (novo campo no struct)
   - Cache dos nomes globais em memória.
   - Inicializar vazio em `load_all()`.

3. **`fn load_global_names(&mut self)`**
   - Lê `global-names-{mesa_nome}.json` do disco.
   - Popula `self.global_names`.

4. **`fn save_global_names(&mut self, sync_shared: bool)`**
   - Serializa `self.global_names` em `global-names-{mesa_nome}.json`.
   - Usa `save_json_atomic()` (mesmo padrão).
   - Se `sync_shared`, copia para `shared/`.

5. **`fn upsert_global_name(&mut self, channel_id: ChannelId, name: &str)`**
   - Normaliza nome via `normalize_name()`.
   - Deriva `short` via `to_short_name()`.
   - Insere/atualiza em `self.global_names`.
   - Marca dirty.

6. **`fn remove_global_name(&mut self, channel_id: &ChannelId) -> bool`**
   - Remove de `self.global_names`.
   - Marca dirty.
   - Se ficar vazio, o arquivo permanece (diferente de custom scenes que deleta o arquivo).

7. **`fn get_global_names(&self) -> &HashMap<ChannelId, ChannelNameEntry>`**
   - Retorna referência para o cache.

8. **`fn rename_mesa_global_names(&mut self, old_name: &str, new_name: &str)`**
   - Renomeia `global-names-{old_name}.json` para `global-names-{new_name}.json`.
   - Atualiza `mesa_nome` internamente.

**Campos novos no `CustomSceneManager`:**
```rust
pub struct CustomSceneManager {
    // ... campos existentes ...
    global_names: HashMap<ChannelId, ChannelNameEntry>,
    global_names_dirty: bool,
}
```

**Chamar `load_global_names()` ao final de `load_all()`.**

---

### Passo 2: Backend — Handlers Socket (`socket_handlers.rs`)

Adicionar novos handlers.

#### Handler: `getGlobalNames`

```
Evento: socket.emit('getGlobalNames')
Resposta: socket.on('globalNamesLoaded', { channels: [{ch, name, short}] })
```

- Lock curto no `CustomSceneManager`.
- Itera `global_names`, converte para array de `{ ch, name, short }`.
- Emite `globalNamesLoaded`.

#### Handler: `saveGlobalName`

```
Evento: socket.emit('saveGlobalName', { channel, name, syncShared })
Resposta: socket.on('saveNameResult', { success })
         socket.on('updateName', { channel, name })
```

- Similar a `saveCustomName`, mas:
  - Usa `mgr.upsert_global_name()` em vez de `upsert_channel()`.
  - Sempre aplica na cena atual (o global name sobrescreve o custom scene name na UI).
  - Envia MIDI se short difere do nome atual da mesa.
  - Emite `globalNamesLoaded` (broadcast) com a lista atualizada.
  - Emite `updateName` (broadcast).

#### Handler: `removeGlobalName`

```
Evento: socket.emit('removeGlobalName', { channel, syncShared })
Resposta: socket.on('globalNamesLoaded', { channels: [...] })
         socket.on('updateName', { channel, name: nome_fisico_ou_custom })
```

- Remove de `global_names`.
- Re-aplica o nome que estava antes (físico ou custom scene) via MIDI se necessário.
- Emite `globalNamesLoaded` com lista atualizada.
- Emite `updateName` com o nome que deve aparecer agora (buscando fallback: custom scene → físico).

#### Modificar: `getActiveCustomChannels`

- Após carregar os canais da custom scene, **mesclar** os nomes globais por cima.
- Ou: emitir ambos separadamente e deixar o frontend fazer a mesclagem.
- **Decisão:** Emitir `activeCustomChannels` normalmente + `globalNamesLoaded` separadamente.
  O frontend faz a mesclagem na hora de exibir.

#### Modificar: `recallScene` / `ensureCurrentCustomScene` / Aplicação de Custom Scene

- Após aplicar os nomes da custom scene na mesa, **re-aplicar os nomes globais**
  por cima, para garantir que o visor da mesa mostre o nome global correto.
- Alterar o fluxo de `apply_custom_scene_names` para:
  1. Aplica nomes da custom scene (já existe).
  2. Aplica nomes globais que divergem (novo).
  3. Emite `customSceneLoaded` + `globalNamesLoaded`.

#### Modificar: `renameServer`

- Adicionar chamada a `rename_global_names_file()` para renomear o arquivo
  `global-names-{old}.json` → `global-names-{new}.json`.

---

### Passo 3: Frontend — Modal de Edição de Nome (`index.html`)

Adicionar nova checkbox no modal `#nameEditorModal`, entre a checkbox
"Criar nome customizado" e o `#namePreview`:

```html
<label id="lblGlobalName"
    style="display:flex; align-items:center; justify-content:center; gap:8px; margin-bottom:15px; cursor:pointer; font-size:13px; color:#aaa;">
    <input type="checkbox" id="chkGlobalName" onchange="toggleGlobalNameEditor()">
    Nome customizado GLOBAL
</label>
```

**Requisitos:**
- `#chkGlobalName` e `#chkCustomName` são **mutuamente exclusivos**:
  - Marcar `chkGlobalName` → desmarca `chkCustomName` (se estiver marcado).
  - Marcar `chkCustomName` → desmarca `chkGlobalName` (se estiver marcado).
- Ambos compartilham o mesmo `#inputChName` e `#namePreview`.
- O `maxlength` do input e a lógica de preview são idênticos (10 chars para ambos).
- O texto do preview deve indicar se é global ou custom:
  - Global: "Global: MAURICIO" / "Mesa: MAUR"
  - Custom: "App: MAURICIO" / "Mesa: MAUR"

---

### Passo 4: Frontend — Controle do Editor (`sidebar.js`)

#### `openNameEditor()`

Alterar para detectar se o canal tem nome global:

```javascript
const hasGlobalName = !!(window.globalNames && window.globalNames[ch]);
const hasCustomName = !!(window.customNamesEnabled && window.activeCustomSceneChannels && window.activeCustomSceneChannels[ch]);

document.getElementById('chkGlobalName').checked = hasGlobalName;
document.getElementById('chkCustomName').checked = hasCustomName && !hasGlobalName;
```

- Se `hasGlobalName`: input mostra o nome global, checkbox global checked.
- Se `hasCustomName` e não global: input mostra o custom name, checkbox custom checked.
- Se nenhum: input mostra o nome físico, ambos unchecked.

#### `window.toggleGlobalNameEditor()`

```javascript
window.toggleGlobalNameEditor = function () {
    const cbCustom = document.getElementById('chkCustomName');
    const cbGlobal = document.getElementById('chkGlobalName');
    
    if (cbGlobal.checked) {
        cbCustom.checked = false;  // mutuamente exclusivo
        // Ativa preview (10 chars)
        document.getElementById('inputChName').setAttribute('maxlength', '10');
        updateNamePreview();
        document.getElementById('namePreview').style.display = 'block';
    } else {
        // Se nenhum checked, volta para 4 chars
        if (!cbCustom.checked) {
            const input = document.getElementById('inputChName');
            if (input.value.length > 4) input.value = input.value.substring(0, 4);
            input.setAttribute('maxlength', '4');
            document.getElementById('namePreview').style.display = 'none';
        }
    }
};
```

- Marcar global → desmarca custom, ativa preview.
- Desmarcar global → se custom não estiver marcado, volta para 4 chars.

#### Modificar `toggleCustomNameEditor()`

Adicionar: se `chkCustomName` for marcado, desmarcar `chkGlobalName`.

#### `saveChannelName()`

Alterar a lógica de salvamento:

```javascript
const isCustom = document.getElementById('chkCustomName').checked;
const isGlobal = document.getElementById('chkGlobalName').checked;

if (isGlobal) {
    newName = normalizeNameEditor(newName).substring(0, 10);
    socket.emit('saveGlobalName', { channel: ch, name: newName, syncShared: window.customScenesSyncEnabled });
    // atualizar window.globalNames localmente
    if (!window.globalNames) window.globalNames = {};
    window.globalNames[ch] = { name: newName, short: newName.substring(0, 4).padEnd(4) };
    if (typeof window.updateNameUI === 'function') {
        window.updateNameUI(ch, newName);
    }
} else if (isCustom) {
    // lógica existente
} else {
    // lógica existente (updateName)
}
```

#### `removeGlobalName()`

```javascript
window.removeGlobalName = function () {
    const ch = activeConfigChannel;
    if (ch === null) return;
    socket.emit('removeGlobalName', { channel: ch, syncShared: window.customScenesSyncEnabled });
    if (window.globalNames) {
        delete window.globalNames[ch];
    }
    // Fecha modal
    document.getElementById('nameEditorModal').style.display = 'none';
};
```

**Botão "Remover nome customizado"** deve mostrar o label correto:
- Se global: "Remover nome global"
- Se custom scene: "Remover nome customizado"
- Adaptar `#btnRemoveCustomName` para ser contexto-sensitivo ou criar `#btnRemoveGlobalName`.

---

### Passo 5: Frontend — Socket Listeners (`socket.js`)

#### Novo listener: `globalNamesLoaded`

```javascript
socket.on('globalNamesLoaded', (data) => {
    if (data && data.channels) {
        window.globalNames = {};
        for (const entry of data.channels) {
            window.globalNames[entry.ch] = { name: entry.name, short: entry.short };
            if (typeof window.updateNameUI === 'function') {
                window.updateNameUI(entry.ch, entry.name);
            }
        }
    } else {
        window.globalNames = null;
    }
});
```

- Após qualquer `sync`, `activeCustomChannels`, `customSceneLoaded`, solicitar
  `getGlobalNames` para garantir consistência.

#### Adicionar chamada `requestGlobalNames()`:

```javascript
function requestGlobalNames() {
    if (typeof socket !== 'undefined' && socket.connected) {
        socket.emit('getGlobalNames');
    }
}
```

- Chamar no `connect`, após `sync`, após `customSceneLoaded`, após `activeCustomChannels`.

---

### Passo 6: Frontend — Prioridade na Exibição (`globals.js` + `channel_strip.js`)

#### `updateNameUI()` em `globals.js`

**Mudança na prioridade:**

```javascript
window.updateNameUI = function(channel, name) {
    let displayName;
    
    // 1. Nome Global (prioridade máxima)
    if (window.globalNames && window.globalNames[channel]) {
        displayName = window.globalNames[channel].name;
    }
    // 2. Nome Custom Scene (se habilitado e ativo)
    else if (window.customNamesEnabled && window.activeCustomSceneChannels && window.activeCustomSceneChannels[channel]) {
        displayName = window.activeCustomSceneChannels[channel].name;
    }
    // 3. Nome Físico (default)
    else {
        displayName = name !== undefined ? name.substring(0, 4) : defaultShortName;
    }
    
    // ... resto da função (atualizar DOM) ...
};
```

#### `channel_strip.js` — `createDesktopChannelStrip()`

Mesma lógica de prioridade: verificar `window.globalNames` primeiro.

---

### Passo 7: Frontend — Variáveis Globais (`globals.js`)

Adicionar:

```javascript
window.globalNames = null;      // { [globalCh]: { name, short } } ou null
```

---

### Passo 8: Sincronização e Renomeio de Servidor

#### Server Rename (`socket_handlers.rs:renameServer`)

Adicionar ao fluxo de `renameServer`:
1. Renomear `global-names-{old}.json` → `global-names-{new}.json`.
2. Atualizar `mesa_nome` dentro do JSON.
3. Emitir `globalNamesLoaded` vazio (para forçar recarregamento).

#### Git Sync (`persist()` em `custom_scenes.rs`)

Se `sync_shared`:
- Salvar `global-names-{mesa}.json` também em `shared/`.
- Adicionar ao `synced_files` para commit automático.

---

## Resumo de Arquivos que Precisam Ser Modificados

| Arquivo | Ação |
|---------|------|
| `server_rust/src/custom_scenes.rs` | Adicionar `global_names` HashMap, métodos de load/save/upsert/remove |
| `server_rust/src/socket_handlers.rs` | Add handlers `getGlobalNames`, `saveGlobalName`, `removeGlobalName`. Modificar `recallScene`, `ensureCurrentCustomScene`, `renameServer` |
| `public/index.html` | Adicionar checkbox e label "Nome customizado GLOBAL" no modal |
| `public/modules/globals.js` | Adicionar `window.globalNames`. Modificar `updateNameUI()` prioridade |
| `public/modules/socket.js` | Adicionar listener `globalNamesLoaded`. Adicionar `requestGlobalNames()` |
| `public/modules/sidebar.js` | `openNameEditor()` detectar global. `saveChannelName()` emitir `saveGlobalName`. `toggleGlobalNameEditor()`. `removeGlobalName()` |
| `public/modules/channel_strip.js` | Adicionar verificação de `window.globalNames` na renderização |

## Casos de Borda

1. **Mesa renomeada**: Arquivo `global-names-{old}.json` deve ser renomeado para `global-names-{new}.json` e `mesa_nome` atualizado internamente.
2. **Global name removido**: Deve mostrar o nome da custom scene (se ativa) ou o nome físico.
3. **Sync de arquivos**: `global-names-{mesa}.json` compartilhado via Git.
4. **MIDI collision**: Se custom scene e global name tentarem enviar MIDI para o mesmo canal, o global name vence (executa por último).
5. **Concorrência**: Usar `prepare_op()` + `CancellationToken` como já feito para custom scenes.
6. **Arquivo corrompido**: `load_global_names()` deve ser resiliente — se falhar, logar erro e iniciar com HashMap vazio.
