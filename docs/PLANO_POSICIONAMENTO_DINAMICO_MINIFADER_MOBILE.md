# Plano: Posicionamento Dinâmico do Volume Geral Fader no Layout Mobile

## 1. Diagnóstico do Problema

**Symptom:** No Steam Deck com Windows em 125% scaling (e em outros devices com DPI/scaling não-padrão), o `#miniFaderContainer` — que contém o **Volume Geral Fader** (`#miniFaderVolumeGeral`) e o **Mini Channel Strip** (`#miniFaderContext`) — dentro do `#chConfigModal` não gruda corretamente na sidebar. Em vez de ficar alinhado à direita da sidebar, o minifader aparece com um offset errado ou flutua livremente.

**Root Cause:** O `.ch-modal-overlay` usa valores **hardcoded de `right` em pixels** que não correspondem à largura real da sidebar quando fatores externos alteram a escala do viewport:

- **Windows/DPI scaling** (125%, 150%) — o navegador escala CSS pixels, mas os valores hardcoded não se ajustam
- **Fullscreen** entry/exit — muda as dimensões do viewport
- **Orientation change** — portrait vs landscape alteram a estrutura da sidebar
- **Teclado virtual** aparece/desaparece — reduz altura do viewport
- **Media queries de altura** alteram a sidebar de `115px` para grid `100px + 60px = 160px`

### Estrutura HTML Atual

```
#chConfigModal (.ch-modal-overlay, position:fixed)
└── .inline-style-22 (display:flex, flex-direction:row)
    ├── .ch-modal-body.styled-chModalContent  (flex:1, EQ/AUX content)
    └── #miniFaderContainer (.styled-miniFaderContainer, flex-shrink:0)
        └── #miniFaderVolumeGeral (Volume Geral Fader — injetado dinamicamente)
        └── #miniFaderContext (.styled-miniFaderContext — Mini Channel Strip)
```

### Breakpoints de Sidebar — Antes da Correção

| Breakpoint | Classes | Sidebar width | Modal `right` atual | Problema |
|---|---|---|---|---|
| Base mobile | `not(.layout-desktop)` | `115px` | `115px` | ✅ OK (base) |
| Portrait | `.is-portrait` | `100vw` (bottom bar) | `0` | ✅ OK |
| Landscape 600px | `max-height:600px, landscape` | `115px` | `85px` | ❌ **30px de gap** |
| Landscape 500px | `max-height:500px, landscape` | `160px` (grid) | `170px` | ❌ **Não corresponde** |
| Steam Deck 125% | scaling × 1.25 | `144px` (115 × 1.25) | `115px` | ❌ **29px de gap** |

---

## 2. Estratégia: Medição Dinâmica via JavaScript

Em vez de valores hardcoded em pixels, medir a **largura real renderizada** da sidebar usando `getBoundingClientRect()` e aplicar dinamicamente ao `.ch-modal-overlay`. A medição será disparada em todos os eventos relevantes.

### 2.1. CSS Variable como Fallback

Adicionar uma CSS variable `--sidebar-real-width` no `:root` com valor de fallback `115px`, que será sobrescrito pelo JavaScript quando disponível.

### 2.2. JavaScript: `syncModalOffsetToSidebar()`

Nova função que:
1. Mede a sidebar via `getBoundingClientRect().width`
2. Atualiza a CSS variable `--sidebar-real-width`
3. Aplica `right` diretamente em `.ch-modal-overlay` (para garantir precisão)

### 2.3. Eventos de Trigger

| Evento | Listener | Ação |
|---|---|---|
| ✅ `window.resize` | Existente (sidebar.js:271) | `updateViewportInfo()` → `syncModalOffsetToSidebar()` |
| ✅ `orientationchange` | Existente (sidebar.js:272) | `updateViewportInfo()` → `syncModalOffsetToSidebar()` |
| ✅ `load` | Existente (sidebar.js:276) | `updateViewportInfo()` → `syncModalOffsetToSidebar()` |
| ✅ `fullscreenchange` | **Novo** | `syncModalOffsetToSidebar()` com debounce 150ms |
| ✅ Abertura de modal | **Novo** (events.js:47) | `syncModalOffsetToSidebar()` com delay 50ms |

---

## 3. Arquivos e Mudanças

### 3.1. `public_new/style.css`

**Adicionar no `:root` (início do arquivo, ~linha 10):**
```css
:root {
    --sidebar-real-width: 115px;  /* fallback para JS não carregado */
}
```

**Linha 2881 — `.ch-modal-overlay` base:**
```css
/* ANTES: */
right: 115px;

/* DEPOIS: */
right: var(--sidebar-real-width);
```

**Linhas 3319-3323 — `@media max-height:600px landscape`:**
```css
/* REMOVER ou comentar a regra right: 85px */
@media screen and (max-height: 600px) and (orientation: landscape) {
    /* .ch-modal-overlay { right: 85px; } ← REMOVIDO */
}
```

**Linhas 5348-5350 — `@media max-height:500px landscape`:**
```css
/* REMOVER */
body:not(.layout-desktop):not(.is-portrait) .ch-modal-overlay {
    /* right: 170px !important; ← REMOVIDO */
}
```

**Linhas 6347-6365 — `.styled-miniFaderContainer`:**
```css
.styled-miniFaderContainer {
    width: auto;
    height: 100%;
    padding: 0;
    box-sizing: border-box;
    border-left: 1px solid #333;
    background: #111;
    flex-shrink: 0;         /* ← GARANTIR que não encolhe */
    display: flex;          /* ← GARANTIR */
    flex-direction: column; /* ← GARANTIR */
    align-items: stretch;   /* ← GARANTIR */
}
```

### 3.2. `public_new/modules/components/sidebar.js`

**Função `updateViewportInfo()` (linhas 247-276) — modificar:**

Adicionar chamada para `syncModalOffsetToSidebar()` antes do bloco de `updateDockScrollIndicators`:

```javascript
function updateViewportInfo() {
    // ... existing code ...
    
    // === Sincronizar offset do modal com a sidebar real ===
    syncModalOffsetToSidebar();
    
    // ... existing updateDockScrollIndicators code ...
}
```

**Nova função `syncModalOffsetToSidebar()`:**

```javascript
/**
 * Mede a largura real da sidebar e aplica como offset do .ch-modal-overlay.
 * Garante que o minifader (Volume Geral Fader) grude corretamente na sidebar
 * em todos os breakpoints, escalas de DPI e mudanças de orientação.
 */
function syncModalOffsetToSidebar() {
    if (document.body.classList.contains('layout-desktop')) return;

    const sidebar = document.querySelector('body:not(.layout-desktop) .sidebar');
    if (!sidebar) return;

    const rect = sidebar.getBoundingClientRect();
    const sidebarWidth = rect.width;

    document.documentElement.style.setProperty('--sidebar-real-width', `${sidebarWidth}px`);

    const modals = document.querySelectorAll('.ch-modal-overlay');
    modals.forEach(modal => {
        if (document.body.classList.contains('is-portrait')) {
            modal.style.right = '0px';
        } else {
            modal.style.right = `${sidebarWidth}px`;
        }
    });
}

window.syncModalOffsetToSidebar = syncModalOffsetToSidebar;
```

**Adicionar listener para `fullscreenchange` (após `window.addEventListener('load', ...)`):**

```javascript
document.addEventListener('fullscreenchange', () => {
    clearTimeout(window.__syncModalTO);
    window.__syncModalTO = setTimeout(syncModalOffsetToSidebar, 150);
});
```

### 3.3. `public_new/modules/core/events.js`

**Linha 47 — após abrir o `#chConfigModal`, recalcular offset:**

```javascript
/* ANTES: */
document.getElementById('chConfigModal').style.display = 'flex';

/* DEPOIS: */
document.getElementById('chConfigModal').style.display = 'flex';
if (typeof syncModalOffsetToSidebar === 'function') {
    setTimeout(syncModalOffsetToSidebar, 50);
}
```

---

## 4. Plano de Implementação (Ordem dos Passos)

| Passo | Ação | Arquivo | Linhas | Prioridade |
|---|---|---|---|---|
| 1 | Adicionar `--sidebar-real-width` no `:root` | `style.css` | ~10 | Alta |
| 2 | Trocar `right: 115px` por `right: var(--sidebar-real-width)` | `style.css` | 2881 | Alta |
| 3 | Remover `right: 85px` do media query 600px | `style.css` | 3320-3322 | Alta |
| 4 | Remover `right: 170px` do media query 500px | `style.css` | 5348-5350 | Alta |
| 5 | Garantir `flex-shrink: 0` no `.styled-miniFaderContainer` | `style.css` | 6347-6365 | Média |
| 6 | Adicionar `syncModalOffsetToSidebar()` no JS | `sidebar.js` | nova função | Alta |
| 7 | Chamar `syncModalOffsetToSidebar()` no `updateViewportInfo` | `sidebar.js` | ~256 | Alta |
| 8 | Adicionar listener `fullscreenchange` | `sidebar.js` | ~277 | Média |
| 9 | Chamar `syncModalOffsetToSidebar()` ao abrir modal | `events.js` | ~47 | Média |

---

## 5. Benefícios da Solução

| Scenario | Com hardcoded | Com medição dinâmica |
|---|---|---|
| **Steam Deck 125% scaling** | ❌ right:170px ≠ 144px real | ✅ Mede 144px via getBoundingClientRect |
| **iPhone 14 Pro zoom 110%** | ❌ Break | ✅ Mede dinamicamente |
| **iPad landscape redimensionado** | ❌ Break | ✅ Mede dinamicamente |
| **Teclado virtual surge** | ❌ Não recalcula | ✅ `resize` evento dispara |
| **Fullscreen entry/exit** | ❌ Não recalcula | ✅ `fullscreenchange` dispara |
| **Sidebar colapsa/expands** | ❌ Não recalcula | ✅ `fullscreenchange` ou `resize` |
| **Safe area insets** | ❌ Ignora | ✅ `rect.width` inclui insets |

---

## 6. Skills e Referências Consultadas

- **`layout.md`** (impeccable): "Diagnose the structural problem before moving boxes" + "Make responsive behavior structural: reorder, collapse, reflow"
- **`distill.md`** (impeccable): "Remove unnecessary containers" + "Magic numbers are complexity sources"
- **`live.md`** (impeccable): Parâmetros de densidade e contrato de variantes
- **`graphify`**: Mapeamento de 70+ arquivos referentes a `sidebar`, `miniFaderContainer`, `ch-modal-overlay`, `macro-fader-card`, `fader-card`
- **Codebase exploration**: Grep/Read direto em `style.css`, `index.html`, `sidebar.js`, `events.js`, `auxs_sends.js`, `channel_setup_core.js`, `macro_fader.js`, `channel_strip.js`, `volume_geral.js`