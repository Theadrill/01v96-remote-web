# 🏗️ Plano de Refatoração: Arquitetura Modular de Macros (Manifest-Driven Plugin System)

## 1. Visão Geral e Objetivo

Este plano estabelece a nova **Arquitetura Modular de Macros (Padrão Enterprise / Manifest-Driven)** para o projeto **01V96 Remote Web**. Inspirada em ecossistemas como **VS Code Extensions, Figma Plugins e OBS Studio**, a arquitetura migra de scripts JS soltos para **pacotes modulares isolados**, onde cada macro reside em sua própria pasta contendo um manifesto declarativo (`manifest.json`) e seu ponto de entrada (`main.js`).

Além disso, este plano:
1. Expande e formaliza o contrato **`MixerAPI` (`core.js`)** incluindo ciclo de vida (`onDelete`, `onInit`).
2. Introduz o sistema de **Pads Dinâmicos (`dyn_status` com letreiro animado *CSS Marquee* e cores reativas)**.
3. Reformula a **Biblioteca de Scripts (Modal de Seleção de Macros)** para exibir cards ricos com Nome Real, Descrição, Badges de Versão e Cores.
4. Implementa suporte a **Slot Único (`singleSlot: true`)** para evitar duplicação indevida de macros de escopo global.
5. Implementa a **Política Defensiva de Mod Ausente (*Missing Macro State*)** para garantir que a remoção ou erro temporário de um mod nunca apague as configurações salvas do operador.
6. Implementa o **CSS Cleaner & Auto-Scoper** no `core.js` para sanitizar e blindar a aplicação contra conflitos de estilos.

---

## 2. Estrutura de Diretórios Padronizada

Todas as macros devem seguir rigorosamente a estrutura de diretórios em `public/modules/macros/`:

```text
public/modules/macros/
├── core.js                           ← Contrato formal de isolamento, CSS Cleaner e API
├── macros.js                         ← Engine de renderização de slots, presets e orquestração
├── hosts.json                        ← Mapeamento de hosts/IPs para detecção de presets
│
├── lumikit/                          ← Macro Modular Lumikit
│   ├── manifest.json                 ← Metadados declarativos
│   └── main.js                       ← Ponto de entrada e lógica
│
├── channel_toggler/                  ← Macro Modular Channel Toggler Simples
│   ├── manifest.json                 ← Metadados declarativos
│   └── main.js                       ← Ponto de entrada e lógica
│
└── smart_channel_toggler/            ← [Futura] Macro Modular Smart Channel Toggler
    ├── manifest.json                 ← Metadados declarativos
    ├── main.js                       ← Ponto de entrada e lógica
    └── style.css                     ← Estilos encapsulados
```

---

## 3. Especificação do Manifesto (`manifest.json`)

Cada pasta de macro deve conter um arquivo `manifest.json` na raiz da sua subpasta:

```json
{
  "id": "smart_channel_toggler",
  "name": "Smart Toggler",
  "version": "1.0.0",
  "author": "Theadrill",
  "description": "Corte inteligente de canais com proteção de guardiões",
  "entry": "main.js",
  "color": "#6a1b9a",
  "icon": "shield",
  "style": "style.css",
  "singleSlot": true
}
```

### 3.1. Campos do Manifesto:
* `id` *(string, obrigatório)*: Identificador único em snake_case (deve coincidir com o nome da pasta).
* `name` *(string, obrigatório)*: Nome de exibição amigável para a interface (ex: `"Lumikit DMX"`, `"Smart Toggler"`).
* `version` *(string, obrigatório)*: Versão semântica (ex: `1.0.0`).
* `author` *(string, opcional)*: Autor ou mantenedor do mod.
* `description` *(string, opcional)*: Descrição clara da funcionalidade exibida na Biblioteca de Scripts.
* `entry` *(string, obrigatório)*: Arquivo de entrada relativo à pasta da macro (padrão: `main.js`).
* `color` *(string, opcional)*: Cor padrão recomendada em HEX para o pad.
* `icon` *(string, opcional)*: Ícone padrão ou identificador visual.
* `style` *(string|null, opcional)*: Arquivo CSS específico da macro a ser injetado e sanitizado (ex: `style.css`).
* `singleSlot` *(boolean, opcional, default: false)*: Quando `true`, impede que o operador adicione múltiplos pads da mesma macro no grid, exibindo um toast explicativo.

---

## 4. Biblioteca de Scripts (Modal de Seleção de Macros)

### 4.1. Cards Ricos de Apresentação:
```text
┌──────────────────────────────────────────────────────────────────┐
│  🟢 LUMIKIT DMX                                          v1.0.0  │
│  Disparo de cenas de iluminação via protocolo UDP Lumikit        │
└──────────────────────────────────────────────────────────────────┘
┌──────────────────────────────────────────────────────────────────┐
│  🟣 SMART TOGGLER                                  [1 Slot] v1.0 │
│  Corte inteligente de canais com proteção de guardiões           │
└──────────────────────────────────────────────────────────────────┘
```

### 4.2. Regra de Atribuição e Verificação `singleSlot`:
Ao selecionar uma macro da biblioteca (`selectMacroFromLibrary`):
1. Se `manifest.singleSlot === true`:
   * O core verifica se já existe outro slot em `assignedMacros` com `scriptId === manifest.id` (exceto o próprio slot atual se estiver apenas reconfigurando).
   * Se já existir, emite um aviso em tela: *"Esta macro já está atribuída a outro slot e só permite uma instância por vez."* e cancela a atribuição duplicada.
2. Caso contrário:
   * Atribui `scriptId: manifest.id`, inicializa o nome do botão com `manifest.name` e a cor padrão `manifest.color` (caso ainda não tenha cor definida).
   * Carrega dinamicamente o script `main.js` e executa o **CSS Cleaner** para o arquivo `manifest.style`.

---

## 5. CSS Cleaner & Auto-Scoper no `core.js`

Para garantir isolamento absoluto e evitar que regras de estilo de mods quebrem a interface principal:

### 5.1. Mecanismo de Funcionamento:
Quando um mod define `"style": "style.css"`, o `core.js` executa a função `MixerAPI.styles.loadScopedCSS(modId, url)`:

1. **Download do CSS Bruto**: O core baixa o conteúdo de `modules/macros/${modId}/${styleFile}` via `fetch`.
2. **Sanitização de Seletores Perigosos (Blacklist)**:
   * Descarta automaticamente qualquer regra que selecione tags raízes globais (`body`, `html`, `:root`, `*`, `main`) ou componentes críticos do mixer (`.channel-strip`, `.fader`, `.meter`, `.desk-db-scale`, `.topbar`, `.bottombar`).
3. **Auto-Scoping com Namespace (`.mod-<id>`)**:
   * Para os seletores permitidos, caso o seletor não comece com `.mod-${modId}`, o cleaner prefixa automaticamente:
     * Entrada: `.guardian-grid { display: grid; }`
     * Saída: `.mod-smart_channel_toggler .guardian-grid { display: grid; }`
4. **Injeção Segura no DOM**:
   * O CSS resultante é injetado em uma tag `<style id="style-macro-${modId}">` no `<head>`.
5. **Limpeza**: Ao descarregar/deletar a macro, o estilo correspondente pode ser removido do DOM.

---

## 6. Política Defensiva de Mod Ausente (*Missing Macro State*)

Para proteger as edições e configurações do operador contra perdas acidentais causadas por remoções temporárias de pasta ou erros de digitação:

### 6.1. Regras de Não-Destruição
* Se um slot estiver configurado com um `scriptId` que não consta em `availableScripts`, o sistema **NUNCA** deve deletar o slot de `assignedMacros` e **NUNCA** deve sobrescrever o arquivo de perfil.
* As configurações personalizadas do slot (nomes, cores, configs específicas) continuam preservadas intactas no JSON.

### 6.2. Renderização Visual do Pad Ausente (*Disabled / Missing*)
* **Fundo**: Escurecido/desbotado (`#181818`) com opacidade reduzida (`opacity: 0.65`), mantendo a borda padrão do slot.
* **Título**: Exibe o nome customizado salvo no preset (ex: `CORTE BANDA`).
* **Subtítulo**: Exibe o identificador original do mod salvo no preset (`slotData.scriptId.toUpperCase()`, ex: `SMART_CHANNEL_TOGGLER`).
* **`dyn_status`**: Exibe o badge em tom de alerta: **`MACRO AUSENTE`**.
* **Clique**: Desabilitado para execução (não gera erros no console).
* **Auto-Recuperação**: Assim que a pasta for restaurada ou o erro de manifesto corrigido, o pad volta a funcionar automaticamente sem que o operador precise reconfigurar nada.

---

## 7. Refatoração e Expansão do `core.js` (`window.MixerAPI`)

O `core.js` passa a ser a **única ponte de comunicação e isolamento** autorizada entre as macros e a aplicação:

```javascript
window.MixerAPI = {
    // 🎚️ 1. CONTROLE DIRETO DA MESA
    mixer: {
        setFader: (ch, val) => { ... },
        toggleOn: (ch, state) => { ... },
        sendRawSysEx: (bytes) => { ... }
    },

    // 📊 2. ESTADO E CONSULTAS DO HARDWARE
    state: {
        getChannel: (ch) => typeof getChannelStateById === 'function' ? getChannelStateById(ch) : window.channelStates?.[ch],
        isPaired: (ch) => {
            const st = window.channelStates?.[ch];
            return st?.paired || false;
        },
        getPairPartner: (ch) => {
            const id = parseInt(ch);
            return (id % 2 === 0) ? id + 1 : id - 1;
        },
        getCurrentScene: () => window.currentSceneId || 0,
        getDeskName: () => window.deskName || '01V96'
    },

    // 🎨 3. MANIPULAÇÃO DINÂMICA DE UI (PADS DE MACRO)
    ui: {
        setSlotStatus: (slotIndex, text, options = {}) => {
            if (window.setMacroSlotStatus) {
                window.setMacroSlotStatus(slotIndex, text, options);
            }
        },
        setDynamicColor: (slotIndex, color) => {
            if (window.setMacroDynamicColor) {
                window.setMacroDynamicColor(slotIndex, color);
            }
        },
        resetDynamicSlot: (slotIndex) => {
            if (window.resetMacroDynamicSlot) {
                window.resetMacroDynamicSlot(slotIndex);
            }
        }
    },

    // 🧹 4. GERENCIAMENTO DE ESTILOS COM CSS CLEANER
    styles: {
        loadScopedCSS: async (modId, cssPath) => {
            // Baixa, sanitiza seletores globais e prefixa com .mod-${modId}
        },
        removeScopedCSS: (modId) => {
            const el = document.getElementById(`style-macro-${modId}`);
            if (el) el.remove();
        }
    },

    // 💾 5. ARMAZENAMENTO E PERSISTÊNCIA DE MODS
    storage: {
        getModConfig: async (modId) => {
            const preset = window.MixerAPI.utils.getPreset();
            const res = await fetch(`/api/macros/config/${encodeURIComponent(modId)}?preset=${encodeURIComponent(preset)}`);
            return res.json();
        },
        saveModConfig: async (modId, data, syncShared = false) => {
            const preset = window.MixerAPI.utils.getPreset();
            const res = await fetch(`/api/macros/config/${encodeURIComponent(modId)}?preset=${encodeURIComponent(preset)}&syncShared=${syncShared}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });
            return res.json();
        }
    },

    // 🌐 6. COMUNICAÇÃO EXTERNA
    network: {
        fetch: async (url, options = {}) => { ... },
        udpSend: async (host, port, data) => { ... }
    },

    // 🛠️ 7. UTILITÁRIOS
    utils: {
        rawToDb: (val) => window.rawToDb ? window.rawToDb(val) : val,
        dbToRaw: (db) => window.dbToRaw ? window.dbToRaw(db) : db,
        getPreset: () => window.getCurrentMacroPreset ? window.getCurrentMacroPreset() : 'default'
    },

    // 📝 8. REGISTRO FORMAL & CICLO DE VIDA
    registerMacro: (id, definition) => {
        // definition: { name, color, execute, onConfigure, onSave, onClear, onDelete }
        window.registerMacro(id, definition);
    }
};
```

---

## 8. Sistema de Pads Dinâmicos (`dyn_status` & Cores no `macros.js`)

### 8.1. Estrutura Visual do Pad
Cada um dos 12 pads no grid passa a conter 3 camadas visuais:
1. **Título Principal**: Nome da macro configurado no slot (ex: `CORTE BANDA`).
2. **Subtítulo / Nome do Mod**: Nome do mod lido do manifesto (ex: `SMART TOGGLER`) ou o identificador original salvo no preset (`slotData.scriptId.toUpperCase()`).
3. **`dyn_status` (Badge Dinâmico)**:
   * **Letreiro Animado (*CSS Marquee / Ticker*)**: Quando o texto do status ultrapassar a largura interna do pad, ativa a classe de rolagem horizontal contínua sem quebra de linha.
   * **Contraste Automático**: Calcula a luminância da cor de fundo (se fundo claro $\rightarrow$ texto `#111`; se fundo escuro $\rightarrow$ texto `#fff`).
   * **Sobrescrita Temporária de Cor**: Permite que uma macro aplique uma cor temporária (ex: vermelho quando ativo) sem apagar a cor estática base definida pelo usuário no perfil.

---

## 9. Atualização do Backend Rust (`server_rust/src/api/macros.rs`)

### 9.1. Endpoint de Descoberta: `GET /api/macros`
* O scanner no Rust lê o diretório `public/modules/macros/`.
* Para cada subdiretório encontrado:
  * Procura pelo arquivo `manifest.json`.
  * Se existir e for um JSON válido, deserializa os campos (`id`, `name`, `version`, `author`, `description`, `entry`, `color`, `icon`, `style`, `singleSlot`).
* Retorna um array JSON com todos os manifestos válidos.

---

## 10. Plano de Execução e Migração

### Etapa 1: Backend Rust
- [ ] Atualizar `list_macros()` em `server_rust/src/api/macros.rs` para ler os arquivos `manifest.json` de cada subpasta e retornar a lista de manifestos com suporte a `singleSlot`.

### Etapa 2: Core & Engine de Macros (Frontend)
- [ ] Atualizar `public/modules/macros/core.js` com a nova API completa (`state`, `ui`, `storage`, `styles.loadScopedCSS` com CSS Cleaner, etc.).
- [ ] Atualizar `public/modules/macros.js` para:
  - Consumir o array de manifestos retornado por `GET /api/macros`.
  - Atualizar `openLibrary(index)` para desenhar cards com Nome Real, Descrição, Badges e Cores.
  - Implementar a validação de `singleSlot` ao selecionar macro da biblioteca.
  - Executar o hook `onDelete(slotIndex)` ao limpar/remover um slot pelo menu de contexto.
  - Implementar o comportamento defensivo **Mod Ausente (*Missing Macro State*)** exibindo o nome original no subtítulo e `MACRO AUSENTE` no `dyn_status`, sem alterar borda e sem deletar slots do perfil.
  - Carregar scripts dinâmicos a partir de `modules/macros/${id}/${entry}` e injetar estilos sanitizados via `MixerAPI.styles.loadScopedCSS`.
  - Implementar as funções de manipulação de `dyn_status` e `setDynamicColor` com animação marquee e contraste automático.

### Etapa 3: Migração das Macros Existentes
- [ ] Criar pasta `public/modules/macros/lumikit/`:
  - Mover `lumikit.js` $\rightarrow$ `lumikit/main.js`.
  - Criar `lumikit/manifest.json`.
- [ ] Criar pasta `public/modules/macros/channel_toggler/`:
  - Mover `channel_toggler.js` $\rightarrow$ `channel_toggler/main.js`.
  - Criar `channel_toggler/manifest.json`.
- [ ] Remover arquivos soltos antigos (`lumikit.js`, `channel_toggler.js`) da raiz de `public/modules/macros/`.

### Etapa 4: Validação
- [ ] Validar compilação Rust (`cargo check`).
- [ ] Validar arquivos JavaScript (`node --check`).
- [ ] Testar abertura da interface, modal de seleção da biblioteca de macros com os novos cards, simulação de mod ausente sem perda de dados, validação de `singleSlot`, teste do CSS Cleaner com injeção de seletores globais bloqueados, carregamento dos presets e execução das macros Lumikit e Toggler.
