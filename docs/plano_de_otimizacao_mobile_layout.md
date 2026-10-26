# 📋 Plano de Otimização: Performance de Rolagem do Layout Mobile (`public_new`)

## 1. Visão Geral e Diretrizes

Este plano detalha a sequência de correções estruturais e *under-the-hood* no `public_new` para restaurar a fluidez total (60 FPS constantes) na rolagem horizontal do layout Mobile, eliminando o gargalo de GPU.

### 🔒 Regras Invioláveis
1. **Zero alterações no layout visual**: Tamanhos, cores, tipografia, bordas, gaps, disposições de botões e identidade gráfica permanecem 100% idênticos.
2. **Zero alterações na lógica de rede / sync**: Nenhum evento de socket (`control`, `meterData`, `sync`, etc.) tem sua assinatura ou semântica alterada.
3. **Etapas testáveis e auditáveis**: Cada etapa pode ser validada individualmente pelo desenvolvedor através do console, DevTools (Paint Flashing, Layers) e do medidor de FPS integrado (`toggleFpsMeter(true)`).

---

## 2. Etapas de Implementação

### 🧱 Etapa 1: CSS Containment e Promoção de Camadas GPU (Isolamento de Renderização)
* **Arquivos envolvidos**: `public_new/styles/components/channel_strip.css`
* **O que será feito**:
  1. Adicionar `contain: layout style paint;` nas classes fundamentais `.channel-strip-wrapper`, `.desk-strip` e `.mobile-strip`.
  2. Isolar a cortina do medidor (`.mobile-meter-curtain-container`) e o conteúdo do card (`.mobile-card-content`) em contextos de composição GPU próprios através de `transform: translateZ(0)` e `will-change: clip-path`.
* **Benefício**: Evita que o recálculo do medidor ou o movimento do fader repinte a árvore inteira do contêiner flex e os canais vizinhos.
* **Como testar e auditar**:
  1. Abrir o DevTools (F12) no navegador -> Pressionar `Ctrl+Shift+P` -> Digitar `Show Rendering`.
  2. Marcar **Paint Flashing**. Ao rolar a tela ou receber medidores, apenas as áreas que realmente mudam devem piscar em verde, e não o contêiner inteiro.
  3. No console, executar `toggleFpsMeter(true)` e verificar a estabilidade do FPS na rolagem.

---

### ⚡ Etapa 2: Desativação de Transições CSS de Sombra no Pico (`.peak-glow`)
* **Arquivos envolvidos**: `public_new/styles/components/channel_strip.css`
* **O que será feito**:
  1. Remover `transition: border-color 0.2s ease, box-shadow 0.2s ease;` de `.channel-strip-wrapper.mobile-strip`.
  2. Garantir que a indicação de pico `.peak-glow` acione de forma instantânea (`transition: none !important`), sem interpolar desfoque gaussiano de sombra a cada 16ms.
* **Benefício**: Elimina os engasgos (jank) severos que ocorrem quando múltiplos canais entram ou saem de pico de sinal enquanto a tela é rolada.
* **Como testar e auditar**:
  1. Injetar áudio ou forçar picos na mesa.
  2. Rolar a tela horizontalmente de forma rápida enquanto os canais piscam em pico. O scroll deve permanecer contínuo e sem micro-travamentos.

---

### 🎯 Etapa 3: Otimização do `IntersectionObserver` de $O(N)$ para $O(1)$
* **Arquivos envolvidos**: `public_new/modules/services/socket.js`
* **O que será feito**:
  1. Substituir a busca linear `meterElementsCache.find(c => c && c.card === entry.target)` por um mapeamento instantâneo via `Map` indexado pelo nó HTML do card (`cardToMeterCacheMap.get(entry.target)`).
* **Benefício**: Zera o tempo de CPU gasto com `Array.find` repetitivo a cada rajada de cards entrando e saindo da viewport durante a rolagem rápida.
* **Como testar e auditar**:
  1. Rolar intensamente da esquerda para a direita no Mobile.
  2. Na aba **Performance** do DevTools, gravar um trace de 3 segundos de rolagem contínua. Observar que o tempo de execução em `IntersectionObserverCallback` cai para próximo de 0ms.
  3. Verificar que nenhum canal para de receber VU meters quando entra na tela.

---

### 🖱️ Etapa 4: Desobstrução da Roda do Mouse e Ajuste do Drag-to-Scroll
* **Arquivos envolvidos**: `public_new/modules/components/channel_strip.js`, `public_new/modules/utils/scroll.js`
* **O que será feito**:
  1. Em `channel_strip.js`: Refinar o listener de `wheel` no fader mobile para interceptar apenas se o ponteiro estiver exatamente sobre o botão deslizante (`.mobile-fader-thumb`) ou se uma tecla de ajuste fino (`Shift`/`Ctrl`) estiver pressionada. Se o cursor estiver na área livre do card, o evento propaga normalmente para a rolagem horizontal da página.
  2. Em `scroll.js`: No listener de `mousedown` para arrasto, retirar da lista de exclusão o trilho de fundo (`.mobile-fader-track-area`, `.mobile-fader-groove`), mantendo o bloqueio apenas no `thumb` móvel e botões interativos (`ON`, `SOLO`, `Nudges`).
* **Benefício**: O usuário recupera a capacidade de rolar a página com a roda do mouse e de clicar/arrastar em mais de 70% da área do card, sem disparar salto de volume indesejado.
* **Como testar e auditar**:
  1. No modo Mobile em desktop/notebook: colocar o ponteiro no meio de um canal e usar a roda do mouse. A página deve rolar suavemente na horizontal.
  2. Clicar no corpo de um canal (fora do knob) e arrastar: a página deve rolar suavemente sem mexer no volume.
  3. Clicar e arrastar especificamente no knob do fader: o volume deve responder perfeitamente como antes.

---

### 🧪 Etapa 5: Validação Global e Auditoria Comparativa
* **O que será feito**:
  1. Rodar os testes automatizados da aplicação (`public_new/tests.html`).
  2. Comparar FPS no layout Desktop vs layout Mobile usando o medidor integrado (`toggleFpsMeter(true)`).
  3. Testar canais mono, canais pareados estéreo, master, telas de AUX e OUTS.
