# 🚀 Plano de Otimização de Performance – 01v96-remote-web

Este plano detalha os gargalos identificados através de análise estática de código e rastreamento de performance (Chrome Performance Trace), apresentando observações técnicas e sugestões de implementação.

---

## 📊 Análise Técnica de Performance (Trace Chrome)

Com base na análise do arquivo `Trace-20260505T230058.json` (246MB), identificamos problemas críticos de responsividade e renderização.

### 1. Interaction to Next Paint (INP) - Crítico
Sua interação mais longa foi um **clique (MouseUp)** que gerou uma tarefa de **141,3 ms**, aproximando-se do limite de "Precisa de Melhorias" (200 ms).

*   **🔍 Causa Raiz**: O clique dispara `closeChannelConfig` (`events.js`), que invoca `initUI` (`channel_strip.js`). Esta função reconstrói grandes partes da interface usando `innerHTML`.
*   **📊 Detalhamento Técnico (Trace)**:
    *   **Volume de Dados**: O navegador registra **6.761 nós no DOM** e **1.043 listeners de eventos**. Processar isso via `innerHTML` é extremamente lento.
    *   **Parsing e Layout**: As chamadas de `innerHTML` forçam o navegador a analisar o HTML (Parse HTML - 53ms) e disparar **Recálculo de Estilo (46ms)** e **Layout (13ms)** imediatos.
*   **💡 Sugestão**: Substituir o `innerHTML` por atualizações granulares. Atualize apenas `textContent` ou `classList` de elementos existentes em vez de destruir e recriar o DOM.

### 2. Layerize e Custos de Renderização (8,5 segundos)
O "Layerize" (gerenciamento de camadas) consumiu impressionantes **8.496 ms** do tempo total do trace, enquanto o **Recálculo de Estilo** acumulou **1.729 ms**.

*   **🔍 Causa Raiz**: O arquivo `socket.js` (linha 469) utiliza `requestAnimationFrame` para atualizar os medidores (meters) via transformações CSS.
*   **📊 Detalhamento Técnico (Código)**:
    *   **Loop Ineficiente**: Dentro do `requestAnimationFrame`, o código executa `querySelectorAll` e `querySelector` repetidamente para cada canal (32+) a cada frame.
    *   **Layout Thrashing**: Buscar elementos no DOM enquanto se altera o estilo de outros no mesmo loop impede que o navegador otimize a renderização.
*   **💡 Sugestão**: 
    *   **Cache de Seletores**: Armazene as referências dos elementos (`curtains`, `leds`) em um array durante o `initUI`. Nunca use `querySelector` dentro de um loop de animação.
    *   **Throttling de Meters**: Limite a atualização visual dos medidores (ex: máximo 30fps) ou atualize apenas se a mudança for significativa (> 2%).

---

## 🛠️ Outros Gargalos Identificados

1.  **Atualizações frequentes do DOM com `innerHTML`**: Em `auxs_sends.js`, a função `renderAuxs()` reconstrói toda a lista de envios a cada chamada.
2.  **Listeners de roda e arrasto**: Em `scroll.js`, o listener de `wheel` é registrado com `{ passive: false }`, impedindo otimizações nativas.
3.  **Conversões de dB**: Funções `rawToDb()` e `dbToRaw()` percorrem arrays em loops frequentes.
4.  **Múltiplas chamadas a `window.enableDragScroll`**: Acúmulo de listeners ao abrir/fechar modais.

---

## 💡 Estratégias de Melhoria Propostas

### 🟢 Curto Prazo (Impacto Imediato)
*   **Cache de DOM no `socket.js`**: Implementar um objeto global `meterElements` para evitar buscas repetitivas.
*   **CSS `contain: strict`**: Aplicar nos containers de faders para isolar o custo de "Layerize".
*   **Passive Listeners**: Alterar eventos de scroll para `{ passive: true }`.

### 🟡 Médio Prazo (Arquitetura)
*   **Refatoração do `initUI`**: Migrar de `innerHTML` para templates ou manipulação direta de nós.
*   **Virtualização**: Renderizar apenas os canais visíveis no grid.

### 🔵 Esquema de economia de energia baseado em foco/visibilidade
Para reduzir o processamento quando a janela ou aba não está em primeiro plano, podemos usar a Page Visibility API.

#### Código sugerido (salvar como `public/modules/visibility.js`)

```javascript
(function () {
  let isPageVisible = true;
  let isWindowFocused = true;

  function enterLowPowerMode() {
    if (!isPageVisible || !isWindowFocused) return;
    isPageVisible = false;
    isWindowFocused = false;
    console.log('[Visibilidade] Modo economia ativado – pausando atualizações pesadas');

    if (window.socket && typeof socket.emit === 'function') {
      window._originalSocketEmit = socket.emit;
      socket.emit = function () { /* pausa emissões */ };
    }

    if (window.disableDragScrollListeners) window.disableDragScrollListeners();
    document.documentElement.setAttribute('data-low-power', 'true');
  }

  function exitLowPowerMode() {
    if (isPageVisible && isWindowFocused) return;
    isPageVisible = true;
    isWindowFocused = true;
    console.log('[Visibilidade] Modo normal retomado');

    if (window._originalSocketEmit) {
      socket.emit = window._originalSocketEmit;
      window._originalSocketEmit = null;
    }

    if (window.enableDragScrollListeners) window.enableDragScrollListeners();
    document.documentElement.removeAttribute('data-low-power');
  }

  // Page Visibility API
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      enterLowPowerMode();
    } else {
      exitLowPowerMode();
    }
  });

  // Window focus/blur
  window.addEventListener('focus', () => {
    isWindowFocused = true;
    if (isPageVisible) exitLowPowerMode();
  });
  window.addEventListener('blur', () => {
    isWindowFocused = false;
    if (!document.hidden) enterLowPowerMode();
  });

  // Initialize
  if (document.hidden || !document.hasFocus()) {
    enterLowPowerMode();
  }
})();
```

---

## 🛠️ Sugestões Adicionais

1. **Debounce / Throttle em eventos de alta frequência**
   - Aplicar `debounce` (ex: 100 ms) em listeners de `wheel`, `mousemove` e `touchmove` que acionam atualizações de UI ou cálculos de dB.
   - Para atualizações de medidores, usar `throttle` no `requestAnimationFrame` para garantir no máximo 30 fps, já sugerido, mas deixar explícito onde aplicar.

2. **Uso de `requestIdleCallback` para tarefas de baixo prioridade**
   - Funções como conversões de dB em grandes arrays ou atualizações de caches podem ser agendadas com `requestIdleCallback` (ou polyfill) para não bloquear a renderização.

3. **Web Workers para processamento pesado**
   - Mover as funções `rawToDb()` e `dbToRaw()` (ou qualquer outro cálculo intensivo) para um Web Worker, liberando a thread principal para interações do usuário.

4. **IntersectionObserver para elementos fora da tela**
   - Ao renderizar listas grandes (por exemplo, lista de auxiliares ou envios), usar `IntersectionObserver` para atualizar apenas os itens visíveis, reduzindo manipulações de DOM.

5. **CSS `will-change` e `transform` para animações de faders**
   - Em vez de alterar `top`/`left`, usar `transform: translateY()` nos elementos de fader e adicionar `will-change: transform` para permitir que o navegador otimize a camada de composição.

6. **Contenção de layout com `contain: strict` em containers de canal**
   - Já mencionado aplicar `contain: strict` nos containers de faders; vale reforçar que isso também reduz o custo de recálculo de estilo e layout em subárvores isoladas.

7. **Evitar leituras síncronas de layout (layout thrashing)**
   - Sempre agrupar leituras de propriedades de layout (ex: `offsetHeight`, `getComputedStyle`) antes de fazer gravações (ex: `style.transform`). Pode-se usar técnicas de "read‑then‑write" ou bibliotecas como `fastdom`.

8. **Uso de `passive: true` em todos os listeners de scroll e touch**
   - Além do `wheel` em `scroll.js`, verificar se há outros listeners de `touchmove` ou `pointermove` que também podem ser marcados como passivos.

9. **Cache de seletores além do `socket.js`**
   - Estender o padrão de cache de elementos (como já proposto para `meterElements`) a outros módulos que fazem `querySelectorAll` em loops (por exemplo, `auxs_sends.js`, `channel_strip.js`).

10. **Monitoramento de performance em produção**
    - Incluir um pequeno script que coleta métricas de INP, FID e FCP via a API `PerformanceObserver` e envia para um endpoint de logs, permitindo validar o impacto das otimizações em campo.
