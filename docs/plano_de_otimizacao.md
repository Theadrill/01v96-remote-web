# 🚀 Plano de Otimização de Performance – 01v96-remote-web

Este plano consolida os gargalos identificados via análise estática de código + rastreamento de performance (Chrome Performance Trace) + varredura profunda de Maio/2026. Todas as otimizações respeitam as restrições: **zero mudança em lógica de sync**, **zero mudança de layout visual**.

---

## 🔒 Restrições Invioláveis

- **ZERO mudanças em lógica de sync**: listeners `sync`, `update`, `dynamicsState`, `meterData`, `syncStatus`, `connectionState` e qualquer `socket.emit` de controle são intocáveis.
- **ZERO mudanças de layout**: o visual final deve ser idêntico ao atual.

---

## 📊 Análise Técnica de Performance (Trace Chrome)

Com base na análise do arquivo `Trace-20260505T230058.json` (246MB), identificamos problemas críticos de responsividade e renderização.

### 1. Interaction to Next Paint (INP) - Crítico
A interação mais longa foi um **clique (MouseUp)** que gerou uma tarefa de **141,3 ms**, aproximando-se do limite de "Precisa de Melhorias" (200 ms).

*   **🔍 Causa Raiz**: O clique dispara `closeChannelConfig` (`events.js`), que invoca `initUI` (`channel_strip.js`). Esta função reconstrói grandes partes da interface usando `innerHTML`.
*   **📊 Detalhamento Técnico (Trace)**:
    *   **Volume de Dados**: O navegador registra **6.761 nós no DOM** e **1.043 listeners de eventos**. Processar isso via `innerHTML` é extremamente lento.
    *   **Parsing e Layout**: As chamadas de `innerHTML` forçam o navegador a analisar o HTML (Parse HTML - 53ms) e disparar **Recálculo de Estilo (46ms)** e **Layout (13ms)** imediatos.
*   **💡 Sugestão**: Substituir o `innerHTML` por atualizações granulares. Atualize apenas `textContent` ou `classList` de elementos existentes em vez de destruir e recriar o DOM. *(Médio prazo — arquitetura complexa)*

### 2. Layerize e Custos de Renderização (8,5 segundos)
O "Layerize" (gerenciamento de camadas) consumiu impressionantes **8.496 ms** do tempo total do trace, enquanto o **Recálculo de Estilo** acumulou **1.729 ms**.

*   **🔍 Causa Raiz**: O arquivo `socket.js` utiliza `requestAnimationFrame` para atualizar os medidores (meters) via transformações CSS, com `querySelector` repetido por canal por frame.
*   **💡 Solução imediata**: Cache de elementos + CSS `contain` + remoção de `backdrop-filter` e `box-shadow` pesados (ver seções abaixo).

---

## 🔴 Gargalos Críticos — Implementação Imediata

### A. Cache de elementos dos meters (socket.js + channel_strip.js) ✅ FEITO

**Problema:** Dentro do `requestAnimationFrame` de `meterData` (socket.js ~linha 469), o código executa a cada frame (60Hz):
- `card.querySelectorAll('.desk-meter-curtain')` — até 32× por frame
- `card.querySelector('.desk-peak-led')` — até 32× por frame
- `card.getAttribute('data-ch')` e `data-partner-ch` — até 64× por frame
- `document.getElementById('mini-card...')` + `querySelector` filhos — por frame

**Total: ~130+ leituras DOM a cada 16ms. Devastador em dispositivos lentos.**

**Solução:** Criar `meterElementsCache` populado no `buildMeterCache()` chamado após `initUI()` e invalidado no `resetFaderCache()`.

```javascript
// Em socket.js — estrutura do cache por índice de card
let meterElementsCache = null;

function buildMeterCache() {
    if (!faderCardsCache || !faderCardsCache.length) { meterElementsCache = null; return; }
    meterElementsCache = new Array(faderCardsCache.length);
    for (let i = 0; i < faderCardsCache.length; i++) {
        const card = faderCardsCache[i];
        meterElementsCache[i] = {
            card,
            dataCh: card.getAttribute('data-ch'),
            partnerCh: card.getAttribute('data-partner-ch'),
            curtains: Array.from(card.querySelectorAll('.desk-meter-curtain')),
            peakLed: card.querySelector('.desk-peak-led') || card.querySelector('.mobile-peak-led')
        };
    }
}
```

No `resetFaderCache()` (channel_strip.js): também zerar `meterElementsCache = null`.
Chamar `buildMeterCache()` logo após preencher `faderCardsCache` no início do handler `meterData`.

**Impacto:** Reduz ~130 queries DOM/frame para **0 dentro do loop**.

---

### B. Throttle do canvas EQ para ~20fps (eq.js)

**Problema:** `startEQAnimation()` roda um loop `requestAnimationFrame` a 60fps enquanto o EQ estiver aberto, calculando resposta de frequência em `Float32Array` (4 filtros × até 400 steps), gradientes, arcos e posição do bubble — em paralelo com o loop de meters.

**Solução:** Throttle simples via timestamp:

```javascript
let lastEQDrawTime = 0;
const EQ_FRAME_INTERVAL = 50; // ~20fps — suficiente para drag suave

function startEQAnimation() {
    if (eqAnimationId) cancelAnimationFrame(eqAnimationId);
    const run = (now) => {
        if (!eqCanvas || !eqCtx) return;
        eqAnimationId = requestAnimationFrame(run);
        if (now - lastEQDrawTime < EQ_FRAME_INTERVAL) return;
        lastEQDrawTime = now;
        // ... código de render atual, sem mudanças ...
    };
    eqAnimationId = requestAnimationFrame(run);
}
```

Também reduzir steps da curva em telas pequenas: `Math.min(w, 400)` → `Math.min(w, 200)` quando `w < 600`.

**Impacto:** Reduz carga de canvas em ~66% quando EQ está aberto.

---

### C. Throttle dos meters para ~30fps/15fps (socket.js) ✅ FEITO

**Problema:** Cada pacote `meterData` do socket dispara um `requestAnimationFrame`. Se o servidor envia a 60Hz, são 60 renders/segundo de UI.

**Solução:** Throttle no topo do handler, **sem tocar na lógica de sync**:

```javascript
let lastMeterRenderTime = 0;
const METER_RENDER_INTERVAL = 33; // ~30fps

socket.on('meterData', (levels) => {
    if (musicianMode) return;

    // Cache preenchido na primeira vez ou após resetFaderCache
    if (!faderCardsCache) {
        faderCardsCache = document.querySelectorAll(
            '.faders-area > .fader-card, .faders-area > .fader-card-desktop, ' +
            '#master-container .fader-card-desktop, #master-container .fader-card'
        );
        buildMeterCache();
    }

    const now = performance.now();
    if (now - lastMeterRenderTime < METER_RENDER_INTERVAL) return;
    lastMeterRenderTime = now;

    requestAnimationFrame(() => {
        // ... código existente, lendo de meterElementsCache em vez de querySelector ...
    });
});
```

> ⚠️ O throttle atua **apenas na renderização visual**. Os dados do socket continuam sendo recebidos normalmente — zero impacto em sync.

**Impacto:** Reduz processamento de meters em ~50% (30fps vs 60fps).

---

### D. `Date.now()` fora do loop de canais (socket.js) ✅ FEITO

**Problema:** `const now = Date.now()` está dentro do loop `for (let i = 0; ...)` (linha ~561), chamando o relógio do sistema N vezes por frame.

**Solução:** Mover para fora do loop, uma única chamada por frame:

```javascript
// Fora do loop:
const now = Date.now();
for (let i = 0; i < faderCardsCache.length; i++) {
    // ... usa 'now' já calculado
}
```

**Impacto:** Elimina N chamadas de sistema desnecessárias por frame.

---

## 🟡 Gargalos Altos — CSS (style.css + index.html)

### E. Remover `backdrop-filter: blur()` do `.ch-name` (style.css) ✅ FEITO

**Problema:** `.ch-name` usa `backdrop-filter: blur(3px)` — são **32+ instâncias permanentes** na tela principal. Cada `backdrop-filter` força o browser a criar uma camada GPU separada, renderizar tudo abaixo dela e aplicar blur. Em dispositivos com GPU integrada/fraca, é catastrófico.

```css
/* ANTES */
.ch-name {
    background: rgba(0, 0, 0, 0.4);
    backdrop-filter: blur(3px);
    ...
}

/* DEPOIS — opacidade mais alta compensa visualmente */
.ch-name {
    background: rgba(0, 0, 0, 0.65);
    /* backdrop-filter removido */
}
```

**Impacto:** Elimina 32+ camadas de composição GPU permanentes.

---

### F. Substituir `box-shadow inset` dos fader groups por `border` lateral (style.css) ✅ FEITO

**Problema:** `.fader-group-1` e `.fader-group-2` usam `box-shadow` com `inset` + sombra externa. Com 32 cards sofrendo repaint frequente (meters), o custo de renderizar `box-shadow inset` se multiplica.

**Decisão:** Manter segmentação visual com `border` lateral colorido (sem custo de composição), removendo o `box-shadow`:

```css
/* ANTES */
.fader-group-1 {
    border-top: 3px solid #00adef !important;
    box-shadow: 0 -5px 15px rgba(0, 173, 239, 0.2) inset, 0 0 5px rgba(0, 173, 239, 0.1);
}
.fader-group-2 {
    border-top: 3px solid #00ff88 !important;
    box-shadow: 0 -5px 15px rgba(0, 255, 136, 0.2) inset, 0 0 5px rgba(0, 255, 136, 0.1);
}

/* DEPOIS — segmentação por border lateral esquerdo colorido */
.fader-group-1 {
    border-top: 3px solid #00adef !important;
    border-left: 3px solid rgba(0, 173, 239, 0.5) !important;
    box-shadow: none;
}
.fader-group-2 {
    border-top: 3px solid #00ff88 !important;
    border-left: 3px solid rgba(0, 255, 136, 0.5) !important;
    box-shadow: none;
}
```

**Impacto:** Remove custo de repaint de sombras em 32 elementos durante updates de meter.

---

### G. Remover `transition` dos fader cards (style.css) ✅ FEITO

**Problema:**
- `.fader-card { transition: border-color 0.2s, box-shadow 0.2s; }` — força interpolação CSS quando `.peak-glow` é adicionado/removido, em paralelo com o rAF.
- `.fader-card.has-meter { transition: background-size 0.05s linear; }` — cria interpolação CSS duplicada com o rAF de meters mobile (double-rendering).

**Decisão:** Remover ambas as transições. O `.peak-glow` simplesmente fica vermelho instantâneo quando clip — comportamento mais correto para uso ao vivo.

```css
/* ANTES */
.fader-card { transition: border-color 0.2s, box-shadow 0.2s; }
.fader-card.has-meter { transition: background-size 0.05s linear; }

/* DEPOIS */
.fader-card { transition: none; }
.fader-card.has-meter { transition: none; }
```

**Impacto:** Elimina interpolação CSS em 32 elementos a cada frame de meter e a cada evento de peak.

---

### H. Simplificar `text-shadow` em `.fader-card.has-meter > *` (style.css) ✅ FEITO

**Problema:** `text-shadow: 1px 1px 3px rgba(0,0,0,0.9), -1px -1px 3px rgba(0,0,0,0.9)` — dois blurs em todos os filhos de 32 cards. Quando `background-size` muda (meter mobile), o browser repinta os textos com blur computado.

```css
/* ANTES */
.fader-card.has-meter>* {
    text-shadow: 1px 1px 3px rgba(0,0,0,0.9), -1px -1px 3px rgba(0,0,0,0.9);
}

/* DEPOIS — sombra sólida, sem blur */
.fader-card.has-meter>* {
    text-shadow: 1px 1px 0 #000, -1px -1px 0 #000;
}
```

**Impacto:** Elimina blur computado em N × 32 elementos durante cada repaint de meter.

---

### I. Remover `backdrop-filter: blur()` do modal de Macros (index.html) ✅ FEITO

**Problema:** O modal `#macrosModal` usa `backdrop-filter: blur(3px)` inline. Ao abrir, o browser precisa renderizar **todo o conteúdo abaixo** (32 faders + meters em execução) e aplicar blur — pico de GPU.

```html
<!-- ANTES -->
style="... backdrop-filter: blur(3px); -webkit-backdrop-filter: blur(3px);"

<!-- DEPOIS -->
style="... background: rgba(0, 0, 0, 0.75);"
```

**Impacto:** Elimina pico de composição GPU ao abrir macros.

---

### J. Adicionar `contain: layout style paint` nos fader cards (style.css) ✅ FEITO

**Problema:** Nenhum container de fader usa `contain` CSS. Quando um meter muda, o browser recalcula layout e estilo de toda a árvore DOM.

```css
/* ADICIONAR */
.fader-card,
.fader-card-desktop {
    contain: layout style paint;
}

.faders-area {
    contain: layout style;
}
```

> ⚠️ Usar `contain: layout style paint` (não `strict`) para evitar problemas com `position: absolute` de filhos como `.mobile-db-scale-overlay` e `.desk-peak-led`.

**Impacto:** Isola o custo de recálculo de estilo e layout por canal — essencial para dispositivos lentos.

---

### K. Adicionar `will-change: transform` nos curtains (style.css) ✅ FEITO

**Problema:** `.desk-meter-curtain` recebe `style.transform = scaleY(...)` a cada frame de meter, mas sem `will-change`, o browser pode não promovê-los a camadas GPU, forçando repaint da subárvore.

```css
/* ADICIONAR */
.desk-meter-curtain {
    will-change: transform;
}
```

**Impacto:** Promove curtains a camadas GPU independentes, eliminando repaint da árvore pai a cada frame.

---

## 🟢 Gargalos Médios

### L. `passive: false` no wheel listener (events.js)

O listener global de `wheel` (linha 369 de events.js) usa `{ passive: false }` pois precisa chamar `e.preventDefault()` para bloquear scroll vertical nos faders desktop. **Esse não pode ser alterado.**

O `scroll.js` (linha 14) também usa `{ passive: false }` no drag scroll. Esse poderia receber uma guarda por `layoutMode`:

```javascript
el.addEventListener('wheel', handler, { passive: layoutMode !== 'desktop' });
```

Mas como o drag scroll é usado em modais (AUX sends) que rodam em qualquer layout, é uma mudança de risco médio. **Manter como está por ora.**

---

## 🔵 Estratégias de Médio Prazo

### M. Visibility API — modo economia de energia

Para reduzir o processamento quando a janela ou aba não está em primeiro plano, usar a Page Visibility API (código já elaborado no plano original — salvar como `public/modules/visibility.js`).

> ⚠️ A função `socket.emit = noop` que pausa emissões **não deve pausar eventos de sync entrante** (listeners). Apenas emissões de controle do usuário ficam pausadas.

### N. Refatoração do `initUI` (longo prazo)

Migrar `container.innerHTML = html` para manipulação incremental de nós DOM (`createElement`, `replaceChild`). Alta complexidade, alto risco. Requer testes extensivos por envolver a feature de sync. **Não implementar sem cobertura de testes**.

### O. Virtualização de canais

Renderizar apenas os canais visíveis na viewport usando `IntersectionObserver`. Reduziria o DOM node count de ~6.761 para ~2.000. Alto impacto, alta complexidade.

---

## 📋 Sequência de Implementação Aprovada

| # | Prioridade | Mudança | Arquivo | Risco Sync |
|---|-----------|---------|---------|-----------|
| A | 🔴 Crítico | Cache de elementos dos meters | `socket.js` + `channel_strip.js` | **Zero** | ✅ FEITO |
| B | 🔴 Crítico | Throttle EQ canvas para ~20fps | `eq.js` | **Zero** |
| C | 🔴 Crítico | Throttle meters para ~30fps | `socket.js` | **Zero** (visual only) | ✅ FEITO |
| D | 🔴 Crítico | `Date.now()` fora do loop | `socket.js` | **Zero** | ✅ FEITO |
| E | 🟡 Alto | Remover `backdrop-filter` do `.ch-name` | `style.css` | **Zero** | ✅ FEITO |
| F | 🟡 Alto | `box-shadow` → `border` lateral nos groups | `style.css` | **Zero** | ✅ FEITO |
| G | 🟡 Alto | Remover `transition` dos fader cards | `style.css` | **Zero** | ✅ FEITO |
| H | 🟡 Alto | Simplificar `text-shadow` do `.has-meter` | `style.css` | **Zero** | ✅ FEITO |
| I | 🟡 Alto | Remover `backdrop-filter` do modal Macros | `index.html` | **Zero** | ✅ FEITO |
| J | 🟡 Alto | Adicionar `contain` nos fader cards | `style.css` | **Zero** | ✅ FEITO |
| K | 🟢 Médio | `will-change: transform` nos curtains | `style.css` | **Zero** | ✅ FEITO |

---

## 🛠️ Sugestões Adicionais (Referência Futura)

1. **Debounce / Throttle em eventos de alta frequência** — `wheel`, `mousemove`, `touchmove` com debounce de 100ms onde aplicável.
2. **Web Workers para cálculos pesados** — mover `rawToDb()` / `dbToRaw()` para Worker se o volume crescer.
3. **Cache de seletores além do `socket.js`** — estender o padrão `meterElementsCache` a outros módulos com loops (ex: `auxs_sends.js`).
4. **Monitoramento de performance em produção** — `PerformanceObserver` para coletar INP, FID e FCP e enviar para endpoint de log.
