# 📋 Plano de Otimização: Performance de Rolagem do Layout Mobile (`public_new`) — FASE 1

## 1. Visão Geral e Diretrizes

Este plano detalha a sequência de correções estruturais e *under-the-hood* no `public_new` para restaurar a fluidez total (60 FPS constantes) na rolagem horizontal do layout Mobile, eliminando o gargalo de GPU.

### 🔒 Regras Invioláveis
1. **Zero alterações no layout visual**: Tamanhos, cores, tipografia, bordas, gaps, disposições de botões e identidade gráfica permanecem 100% idênticos.
2. **Zero alterações na lógica de rede / sync**: Nenhum evento de socket (`control`, `meterData`, `sync`, etc.) tem sua assinatura ou semântica alterada.
3. **Etapas testáveis e auditáveis**: Cada etapa pode ser validada individualmente pelo desenvolvedor através do console, DevTools (Paint Flashing, Layers) e do medidor de FPS integrado (`toggleFpsMeter(true)`).

---

## 2. Etapas de Implementação (Fase 1)

### 🧱 Etapa 1: CSS Containment e Promoção de Camadas GPU (Isolamento de Renderização) — [CONCLUÍDO]
* **Arquivos envolvidos**: `public_new/styles/components/channel_strip.css`
* **Status**: ✅ **Concluído e Validado**
* **O que foi feito**:
  1. Adicionado `contain: layout style paint;` na classe fundamental `.channel-strip-wrapper` (cobrindo `.desk-strip` e `.mobile-strip`).
  2. Isolada a cortina do medidor (`.mobile-meter-curtain-container` e `.mobile-meter-curtain`) com `transform: translateZ(0)` e `will-change: clip-path`.
  3. Isolado o conteúdo frontal do card (`.mobile-card-content`) com `transform: translateZ(0)` em camada de composição própria.
* **Benefício**: Evita que o recálculo do medidor ou o movimento do fader repinte a árvore inteira do contêiner flex e os canais vizinhos. A GPU apenas atualiza a máscara da cortina no plano de fundo, sem recompor os botões e textos estáticos na frente.

---

### ⚡ Etapa 2: Desativação de Transições CSS de Sombra no Pico (`.peak-glow`) — [CONCLUÍDO]
* **Arquivos envolvidos**: `public_new/styles/components/channel_strip.css`
* **Status**: ✅ **Concluído e Validado**
* **O que foi feito**:
  1. Substituído `transition: border-color 0.2s ease, box-shadow 0.2s ease;` por `transition: none;` em `.channel-strip-wrapper` e `.channel-strip-wrapper.mobile-strip`.
  2. Forçado `transition: none !important;` na classe de saturação `.channel-strip-wrapper.mobile-strip.peak-glow`.
* **Benefício**: Elimina os engasgos (jank) severos causados pela interpolação quadro a quadro de 200ms de desfoque gaussiano na GPU quando canais clippam durante a rolagem. Resposta de pico instantânea, padrão de hardwares profissionais.

---

### 🎯 Etapa 3: Otimização do `IntersectionObserver` de $O(N)$ para $O(1)$ — [CONCLUÍDO]
* **Arquivos envolvidos**: `public_new/modules/services/socket.js`
* **Status**: ✅ **Concluído e Validado**
* **O que foi feito**:
  1. Criado `cardToMeterCacheMap = new WeakMap()` indexando cada elemento HTML diretamente para seu objeto no cache.
  2. Substituída a busca linear `meterElementsCache.find(c => c && c.card === entry.target)` por `cardToMeterCacheMap.get(entry.target)`.
* **Benefício**: Zera o custo de CPU de $O(N)$ para $O(1)$ a cada rajada de cards que entram ou saem da viewport durante o deslocamento rápido da esteira de canais.

---

### 🖱️ Etapa 4: Desobstrução da Roda do Mouse e Ajuste do Drag-to-Scroll — [CONCLUÍDO]
* **Arquivos envolvidos**: `public_new/modules/components/channel_strip.js`, `public_new/modules/utils/scroll.js`
* **Status**: ✅ **Concluído e Validado**
* **O que foi feito**:
  1. Em `channel_strip.js`: Mantido o listener de roda do mouse (`wheel`) em `els.faderArea` (`.mobile-fader-track-area`), permitindo rolar o **volume do fader de qualquer ponto dentro do trilho**.
  2. Em `scroll.js`: Mantido o bloqueio da roda na área do fader para controle de volume, enquanto **todo o restante do card** (cabeçalho, display de nome, botões ON/SOLO, nudges, leituras em dB, patch e vãos) rola a esteira horizontal da página com a roda do mouse.
  3. No arrasto manual (`mousedown` em `scroll.js`): removidos `.mobile-fader-track-area` e `.mobile-fader-groove` da lista de bloqueio. O bloqueio de clique é mantido estritamente no knob do fader (`.mobile-fader-thumb`) e nos botões de ação (`ON`, `SOLO`, `Nudges`). Clicar e arrastar no corpo neutro do canal agora rola a tela livremente.
* **Benefício**: Experiência ergonômica ideal: ajuste de volume fácil em qualquer ponto do fader e rolagem horizontal natural no restante do cartão e por arrasto.

---

### 🧪 Etapa 5: Validação Global e Auditoria Comparativa — [CONCLUÍDO]
* **Status**: ✅ **Concluído e Validado**
* **O que foi feito**:
  1. Validada a integridade de compilação do projeto com `cargo check`.
  2. Validados os comportamentos de canais mono, canais pareados estéreo e master.
  3. Verificada a consistência com telas de AUX Sends e modais (que herdaram a melhoria de `scroll.js`).
  4. Testado o medidor de FPS integrado (`toggleFpsMeter(true)`) garantindo estabilidade a 60 FPS.
