# Plano de Implementação: Navegação por Layers

## 1. Visão Geral

Adicionar à **tela principal** (CH 1–32) a possibilidade de dividir os 32 faders em duas camadas (Layer 1–16 e Layer 17–32), controladas por um toggle em uma nova seção do modal de Configurações e por dois botões na sidebar (visíveis apenas quando o toggle está ON).

A feature é **puramente client-side** (filtro de renderização visual). Nenhuma alteração no servidor Rust, WASM, ou estado `channelStates` é necessária. As demais telas (`outs`, `channelConfig`, `techMix`, `musician`) continuam renderizando os 32 canais (quando aplicável) sem nenhuma alteração.

---

## 2. Contexto do Projeto (Estrutura Relevante)

### Stack
- Front-end: JavaScript vanilla modular em `public/modules/*.js`
- HTML: monolítico em `public/index.html` (todas as modais)
- Estado global: `public/modules/globals.js` (variáveis `channelStates`, `mixesState`, `masterState`, `NUM_CHANNELS = 32`)
- Renderização principal: `initUI()` em `public/modules/channel_strip.js:651`
- Sidebar (botões dock): `renderDock(mode)` em `public/modules/sidebar.js:716`
- Mobile menu (portrait): `renderMobileMenu(mode)` em `public/modules/sidebar.js:1062`
- Modal de Configurações: `#configModal` em `public/index.html:216-346`
- CSS: `public/style.css`
- Servidor (Rust): nenhuma alteração necessária (não recebe nem envia nada de "layer")

### Constantes/IDs Importantes
- `NUM_CHANNELS = 32` em `globals.js:5`
- Canais 0-15 (Layer 1), canais 16-31 (Layer 2)
- `container` (faders) = `document.getElementById('faders-container')` em `globals.js:57`
- `buttonDock` = `<div id="buttonDock">` em `index.html:180`
- `mobileMenuList` = `<div id="mobileMenuList">` em `index.html:1198`

### Padrão de Toggles Existente
Os toggles do `#configModal` seguem o padrão:
1. HTML: `<label class="switch"><input id="toggleXxx" onchange="toggleXxx(this.checked)" type="checkbox" /><span class="slider"></span></label>`
2. JS: função `window.toggleXxx = function(enabled) { localStorage.setItem('chave', enabled); /* aplica estado */ }`
3. Estado inicial lido em `DOMContentLoaded` e atribuído a `checkbox.checked = saved`.

Exemplos de referência:
- `toggleFpsMeter` em `fps_meter.js:46` e checkbox `#toggleFpsMeter` em `index.html:275`
- `toggleMacrosPanel` em `sidebar.js:674` e checkbox `#toggleMacrosEnable` em `index.html:285`
- `toggleEqFlatSkipHpfLpf` em `socket.js` e checkbox em `index.html:296`

### Pontos Críticos de Renderização dos 32 Canais (apenas `channel_strip.js`)
A função `initUI()` faz **5 loops distintos** pelos 32 canais. **Todos** devem ser gated pela regra "se está na tela principal E a feature está ON, respeitar o filtro de layer":

1. **Linha 722** — loop que monta o HTML dos faders (`createChannelStrip(i, false)`)
2. **Linha 783** — loop que atualiza o estado visual (`updateUI(i, ...)`) e o nome do canal (`name${i}`)
3. **Linha 814** — loop que atualiza `updatePanIndicator(i, ...)` no desktop
4. **Linha 846** — outra iteração (verificar e.g. se há `renderXxx(i)` para canais)
5. **Linha 930** — outra iteração

> **Importante**: o `if (outsMode && !musicianMode && !technicianMixMode)` na linha 711 já separa o caso da tela principal do caso MIX/BUS. Toda a lógica de layer deve ficar **dentro do ramo `else` (linhas 721 em diante)**.

---

## 3. Requisitos Funcionais

### 3.1 Modal de Configurações — Nova Seção "NAVEGAÇÃO"

Criar uma nova `<div class="config-section">` **dentro de `#configModal`**, posicionada após a seção "Equalizador" (linha 291 do `index.html`) e antes da seção "Servidor" (linha 302), com:

- Header: `NAVEGAÇÃO` (mesmo padrão `.config-section-header`)
- Linha abaixo com layout idêntico ao do toggle de Macros (linhas 281-289):
  - Span à esquerda com texto `Navegação por LAYERS`
  - Toggle à direita (`.switch` + `.slider`) com id `toggleLayerNav` e `onchange="toggleLayerNav(this.checked)"`
- Estado inicial: OFF (preservar comportamento atual para todos os usuários existentes)

### 3.2 Comportamento dos Botões na Sidebar (apenas `dockMode === 'main'`)

Quando o toggle `toggleLayerNav` estiver **ON**, dois novos botões devem aparecer no topo do array `buttons` em `renderDock()` para o `case 'main':` (linha 724 de `sidebar.js`):

- **Layer 1-16** — label `1-16`, action `setLayer(0)`, classe `dock-layer` (estilo a definir)
- **Layer 17-32** — label `17-32`, action `setLayer(16)`, classe `dock-layer`

O botão da layer ativa deve receber a classe `active-tab` (visual destacado). Quando o toggle for desligado, esses botões desaparecem e o array volta ao original.

A mesma lógica deve ser replicada no `renderMobileMenu()` (`sidebar.js:1073-1078`) para o `case 'main'`, com `cls: 'menu-btn-solid-blue'` no ativo.

### 3.3 Renderização Condicionada por Layer

Quando a feature estiver **ON** e o usuário estiver na tela principal, **apenas os 16 faders da layer ativa** são renderizados/atualizados.

Estado a armazenar:
- Variável global: `let activeLayerStart = 0;` // 0 = CH 1-16, 16 = CH 17-32
- Função `window.setLayer(start) { activeLayerStart = start; initUI(); /* ou re-render específico */ }`

---

## 4. Passo a Passo de Implementação

### Passo 1 — Adicionar estado global (`public/modules/globals.js`)

1.1. Adicionar, próximo à linha 6, junto às outras declarações globais:
```
let layerNavEnabled = false;
let activeLayerStart = 0; // 0 = CH 1-16, 16 = CH 17-32
```

1.2. Ler valor persistido do `localStorage` (chave sugerida: `01v96_layer_nav`):
```
try { layerNavEnabled = localStorage.getItem('01v96_layer_nav') === 'true'; } catch(e) {}
```

> **Justificativa**: outros toggles similares (`mixer_layout`, `custom_names_enabled`) já seguem este padrão de inicialização no topo do `globals.js`.

### Passo 2 — Adicionar toggle no HTML (`public/index.html`)

2.1. Inserir nova `<div class="config-section">` **após a linha 300** (final da seção "Equalizador") e **antes da linha 301** (início da seção "Servidor"). Conteúdo:

```html
<div class="config-section">
    <p class="config-section-header">Navegação</p>
    <div class="inline-style-14">
        <span class="inline-style-15">Navegação por LAYERS</span>
        <label class="switch">
            <input id="toggleLayerNav" onchange="toggleLayerNav(this.checked)" type="checkbox" />
            <span class="slider"></span>
        </label>
    </div>
</div>
```

2.2. Reutilizar as classes existentes `inline-style-14` / `inline-style-15` / `switch` / `slider` — **não criar CSS novo**, é o mesmo padrão dos toggles de FPS, Macros e EQ Flat.

### Passo 3 — Criar função de toggle (`public/modules/sidebar.js` ou novo módulo)

3.1. Em `sidebar.js` (próximo a `toggleMacrosPanel`, linha 674), adicionar:

```js
window.toggleLayerNav = function (enabled) {
    try { localStorage.setItem('01v96_layer_nav', enabled ? 'true' : 'false'); } catch (e) {}
    layerNavEnabled = enabled;
    // Reset para layer 1-16 sempre que reativar (UX mais previsível)
    activeLayerStart = 0;
    if (typeof initUI === 'function') initUI();
};
```

3.2. No `DOMContentLoaded` listener já existente em `sidebar.js:702` (ou em novo listener ao lado), sincronizar o estado do checkbox ao abrir o modal:

```js
const toggleLayer = document.getElementById('toggleLayerNav');
if (toggleLayer) toggleLayer.checked = layerNavEnabled;
```

> **Alternativa**: usar o mesmo `MutationObserver` do `configModal` que já existe em `sidebar.js:707-713` — é o local mais limpo, pois já cuida do `updateMacrosState`.

### Passo 4 — Função de troca de layer

4.1. Adicionar a função `setLayer` em `sidebar.js` (próximo à função `setLayoutMode`, linha 159):

```js
function setLayer(start) {
    activeLayerStart = start; // 0 ou 16
    if (typeof initUI === 'function') initUI();
    // Opcional: se houver função dedicada de re-render do dock, chamá-la aqui também
    if (typeof renderDock === 'function') renderDock('main');
    if (typeof renderMobileMenu === 'function' && !document.getElementById('mobileMenuModal').classList.contains('active')) {
        renderMobileMenu('main');
    }
}
window.setLayer = setLayer;
```

### Passo 5 — Adicionar botões na sidebar (`public/modules/sidebar.js`)

5.1. Em `renderDock()`, no `case 'main':` (linha 724), **após o push do botão CONFIG** e **antes do push do MIX/BUS**, injetar condicionalmente:

```js
case 'main': {
    buttons.push({ label: 'CONFIG', action: "document.getElementById('configModal').style.display='flex'", cls: 'dock-config' });

    // === INÍCIO: Navegação por LAYERS ===
    if (typeof layerNavEnabled !== 'undefined' && layerNavEnabled) {
        buttons.push({ label: '1-16',  action: 'setLayer(0)',  cls: 'dock-layer' + (activeLayerStart === 0  ? ' active-tab' : '') });
        buttons.push({ label: '17-32', action: 'setLayer(16)', cls: 'dock-layer' + (activeLayerStart === 16 ? ' active-tab' : '') });
    }
    // === FIM: Navegação por LAYERS ===

    const isOutsOn = typeof window.outsMode !== 'undefined' && outsMode;
    buttons.push({ label: isOutsOn ? 'SAIR' : 'MIX/BUS', action: 'toggleOuts()', id: 'dockBtnOuts', cls: 'dock-outs' });
    // ... (resto inalterado)
}
```

5.2. Em `renderMobileMenu()` no `case 'main':` (linha 1073), injetar a mesma condicional:

```js
case 'main':
    buttonsConfig = [
        { label: 'Configurações do App', isConfig: true, action: "document.getElementById('configModal').style.display='flex';" },
    ];
    if (typeof layerNavEnabled !== 'undefined' && layerNavEnabled) {
        buttonsConfig.push({ label: 'LAYER 1-16',  cls: activeLayerStart === 0  ? 'menu-btn-solid-blue' : '', action: "if(typeof setLayer === 'function') setLayer(0);"  });
        buttonsConfig.push({ label: 'LAYER 17-32', cls: activeLayerStart === 16 ? 'menu-btn-solid-blue' : '', action: "if(typeof setLayer === 'function') setLayer(16);" });
    }
    buttonsConfig.push({ label: 'MIX / BUS', cls: 'menu-btn-solid-green', action: "if(typeof toggleOuts === 'function') { toggleOuts(); }" });
    break;
```

### Passo 6 — Gate da renderização dos 32 canais (`public/modules/channel_strip.js`)

**Regra geral**: criar uma função utilitária interna para iterar apenas os índices da layer ativa quando `layerNavEnabled && dockMode === 'main'`, e usar essa função em todos os loops.

6.1. Adicionar helper próximo a `initUI()` (linha 651):

```js
function getVisibleChannelIndices() {
    // Aplica filtro de layer APENAS na tela principal (main).
    // Em outs/techMix/musician/channelConfig: sempre retorna 0..31.
    if (!layerNavEnabled) {
        const all = [];
        for (let i = 0; i < NUM_CHANNELS; i++) all.push(i);
        return all;
    }
    // Detectar se estamos na tela principal:
    const isMain = !musicianMode && !outsMode && !technicianMixMode && activeConfigChannel === null;
    if (!isMain) {
        const all = [];
        for (let i = 0; i < NUM_CHANNELS; i++) all.push(i);
        return all;
    }
    const range = [];
    for (let i = activeLayerStart; i < activeLayerStart + 16 && i < NUM_CHANNELS; i++) range.push(i);
    return range;
}
```

6.2. **Linha 722** — substituir o loop de renderização:
```js
// ANTES:
// for (let i = 0; i < NUM_CHANNELS; i++) { ... html += createChannelStrip(i, false); }

// DEPOIS:
for (const i of getVisibleChannelIndices()) {
    const state = channelStates[i];
    if (state && state.paired && i % 2 !== 0) continue;
    html += createChannelStrip(i, false);
}
```

6.3. **Linha 783** — substituir o loop de atualização visual:
```js
for (const i of getVisibleChannelIndices()) {
    const state = channelStates[i];
    if (!state) continue;
    if (musicianMode || technicianMixMode) {
        updateUI(i, state[`aux${activeMix}`] || 0, state[`aux${activeMix}On`] || false, undefined);
    } else {
        updateUI(i, state.value, state.on, state.solo);
    }
    const nameEl = document.getElementById(`name${i}`);
    if (nameEl) {
        let dName = `CH ${i + 1}`;
        const globalId = i;
        if (window.resolvedNames && window.resolvedNames[globalId]) {
            dName = window.resolvedNames[globalId].name;
        }
        nameEl.innerText = dName;
    }
}
```

6.4. **Linha 814** — substituir o loop de `updatePanIndicator`:
```js
if (layoutMode === 'desktop') {
    for (const i of getVisibleChannelIndices()) {
        const s = channelStates[i];
        if (s && s.pan !== undefined) updatePanIndicator(i, s.pan);
    }
    // ST IN (60-67) — NÃO filtrar (não fazem parte da layer 1-16 / 17-32)
    for (let stGlobal = 60; stGlobal <= 67; stGlobal++) {
        const s = channelStates[32 + (stGlobal - 60)];
        if (s && s.pan !== undefined) updatePanIndicator(stGlobal, s.pan);
    }
    if (masterState.pan !== undefined) updatePanIndicator('master', masterState.pan);
}
```

6.5. **Linhas 846 e 930** — auditar essas duas ocorrências de `for (let i = 0; i < NUM_CHANNELS; i++)` e aplicar o mesmo filtro se elas também iterarem sobre os 32 faders (provavelmente iteram para `resetFaderCache`, `renderNames`, ou similar — ler contexto antes de aplicar).

> **Atenção**: NÃO filtrar loops em outros arquivos (`auxs_sends.js`, `macro_fader.js`, `volume_geral.js`, `macros/channel_toggler.js`) — eles operam sobre dados/estado, não sobre renderização da tela principal.

### Passo 7 — Estilo visual dos botões de layer (opcional, em `public/style.css`)

7.1. Adicionar classes para o visual dos botões `dock-layer` (apenas para destaque da layer ativa). A classe `active-tab` já é aplicada quando ativo, então basta garantir que `.dock-layer.active-tab` tenha visual distinto. Procurar a regra `.active-tab` existente no CSS e verificar se ela já é suficiente; se não for, adicionar:

```css
.dock-layer { background:#1e3a5f; color:#fff; border:1px solid #2c5282; }
.dock-layer.active-tab { background:#5cacee; color:#fff; font-weight:900; }
```

> **Opcional**: pode-se reaproveitar `dock-outs` (verde) ou criar nova classe. Recomendação: criar nova classe `dock-layer` para deixar a feature isolada e fácil de remover.

### Passo 8 — Verificação manual

Após implementar, testar:

- [ ] Abrir o app com a feature OFF: comportamento idêntico ao atual (32 faders).
- [ ] Ativar `toggleLayerNav`: devem aparecer os botões "1-16" e "17-32" no topo do dock.
- [ ] Clicar em "1-16": faders 1-16 visíveis, faders 17-32 ocultos. Botão "1-16" destacado.
- [ ] Clicar em "17-32": faders 17-32 visíveis, faders 1-16 ocultos. Botão "17-32" destacado.
- [ ] Desativar `toggleLayerNav`: botões somem, todos os 32 faders voltam a aparecer.
- [ ] Entrar em modo MIX/BUS: todos os 16 MIX + 16 BUS visíveis (regra `outsMode` ignora layer).
- [ ] Entrar em modo Channel Config: ver apenas o canal ativo (ignora layer).
- [ ] Entrar em modo Músico: ver apenas o canal do músico (ignora layer).
- [ ] Em portrait mobile: abrir menu → "LAYER 1-16" e "LAYER 17-32" aparecem, funcionam e somem com toggle OFF.
- [ ] Persistência: dar refresh no navegador com a feature ON, deve continuar ON e na layer 1-16 (reset de UX).
- [ ] Pair de canais: testar pair CH 1+2 com layer 1-16 → deve renderizar corretamente (regra `paired && i % 2 !== 0` continua valendo).

---

## 5. Arquivos a Modificar (resumo)

| Arquivo | Mudanças |
|---|---|
| `public/modules/globals.js` | Adicionar 2 variáveis (`layerNavEnabled`, `activeLayerStart`) + leitura de `localStorage` |
| `public/index.html` | Adicionar 1 nova `<div class="config-section">` com toggle (~15 linhas) |
| `public/modules/sidebar.js` | Adicionar `window.toggleLayerNav`, `setLayer`, integrar no `renderDock` (case 'main'), integrar no `renderMobileMenu` (case 'main'), sincronizar checkbox no `MutationObserver` existente |
| `public/modules/channel_strip.js` | Adicionar `getVisibleChannelIndices()`, substituir 4-5 loops em `initUI()` |
| `public/style.css` | (Opcional) Adicionar `.dock-layer` e `.dock-layer.active-tab` |

**Arquivos NÃO modificados** (escopo preservado):
- Servidor Rust, WASM, qualquer arquivo em `server_rust/`, `client_wasm/`, `midi_common/`, `remote_midi_server/`
- Telas secundárias: `outsMode`, `musicianMode`, `technicianMixMode`, `activeConfigChannel` (todas continuam renderizando 32 canais)
- Demais módulos JS: `auxs_sends.js`, `macro_fader.js`, `volume_geral.js`, `macros/*.js`, `socket.js`, `events.js`, etc.

---

## 6. Riscos e Decisões Pendentes

1. **Reset de layer ao desativar/reativar o toggle** (decisão UX): o plano atual define que reativar reseta para `activeLayerStart = 0`. Validar com o usuário se ele prefere lembrar a última layer usada.
2. **Comportamento durante transição de estado** (decisão UX): se o usuário está com layer 17-32 ativa e entra no modo MIX/BUS, ao voltar para `main` ele deve continuar em 17-32 ou voltar para 1-16? Recomendação: manter a última seleção.
3. **Pair de canais cross-layer**: o pair CH 1+2 e CH 31+32 estão ambos dentro de uma única layer, mas pair CH 16+17 ficaria quebrado pela metade. O plano atual respeita `if (state.paired && i % 2 !== 0) continue;` mas se o par cruzar o meio, fica inconsistente. **Recomendação**: documentar essa limitação e validar com o usuário se deve bloquear pair cross-layer ou apenas permitir (e render fica meio quebrado).
4. **CSS da classe `dock-layer`**: o plano sugere classe própria para isolamento. Confirmar se pode-se usar classes existentes (`dock-outs` verde, etc.) ao invés de criar nova.
5. **Eventuais faders "fantasma"**: se algum loop (linhas 846, 930) iterar por todos os 32 sem renderizar/atualizar UI visível, o filtro não prejudica. Mas se renderizar/atualizar, **precisa** do filtro. Auditar antes de fechar a task.

---

## 7. Critérios de Pronto

- [ ] Toggle adicionado ao modal de Configurações com persistência em `localStorage`
- [ ] Botões "1-16" e "17-32" aparecem na sidebar (e no mobile menu) **somente** quando toggle ON
- [ ] Em estado OFF, comportamento é bit-by-bit idêntico ao atual
- [ ] Em estado ON + layer 1-16: apenas CH 1-16 visíveis na tela principal
- [ ] Em estado ON + layer 17-32: apenas CH 17-32 visíveis na tela principal
- [ ] Outras telas (outs, channelConfig, techMix, musician) **inalteradas**
- [ ] Sem regressão em `initUI()`, `updateUI()`, `createChannelStrip`, `renderDock`, `renderMobileMenu`
- [ ] Sem alterações no servidor Rust
- [ ] `localStorage` na chave `01v96_layer_nav` (string `'true'` / `'false'`)
