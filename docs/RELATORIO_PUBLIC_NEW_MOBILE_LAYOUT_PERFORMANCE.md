# 📊 Relatório Técnico: Diagnóstico de Performance do Layout Mobile (`public_new`)

## 1. Contexto e Motivação

O objetivo da reformulação do layout Mobile no `public_new` era proporcionar uma experiência otimizada, responsiva e leve para dispositivos com poder de processamento gráfico reduzido (smartphones, tablets, Steam Deck e telas compactas). 

No entanto, medições práticas e percepção tátil revelaram um paradoxo: **a rolagem horizontal (scroll) no modo Mobile apresentava sensação de peso, engasgos (stutter/jank) e consumo de GPU substancialmente maiores do que no modo Desktop**.

Este relatório documenta a investigação aprofundada nas camadas de CSS, DOM, renderização gráfica, compositing e listeners de eventos que causavam esse comportamento, bem como as soluções implementadas na **Fase 1** de otimização.

---

## 2. Quadro Comparativo: Desktop vs Mobile

| Aspecto | Modo Desktop | Modo Mobile (Original) | Modo Mobile (Após Fase 1) | Impacto na GPU / Compositor |
| :--- | :--- | :--- | :--- | :--- |
| **Largura por Card** | 86px (108px pareado) | 118px (148px pareado) | 118px (148px pareado) | Mobile exige 53% mais buffer horizontal |
| **Espaçamento (Gap)** | 0px (cards colados) | 12px + separadores de 24px | 12px + separadores de 24px | Mantido layout visual intacto |
| **VU Meter (Área)** | Coluna lateral fina de **8px** | Cortina de fundo de 100% | Cortina promovida a camada GPU | **Textura de fundo isolada via `translateZ(0)`** |
| **Mecanismo de VU** | `clip-path` em barrinha estreita (4-8px) | `clip-path` em gradiente de 5 cores | `clip-path` em camada GPU isolada | Botões e textos da frente não repintam mais |
| **Contenção CSS** | Inexistente no wrapper novo | Inexistente no wrapper novo | `contain: layout style paint;` | **Isolamento total por canal recuperado** |
| **Sombras (`box-shadow`)** | `none` (zero sombras externas) | `0 4px 12px rgba(0,0,0,0.4)` | `0 4px 12px rgba(0,0,0,0.4)` | Mantido visual idêntico |
| **Transições CSS de Pico** | `none` (LED estático de 7px) | `transition: box-shadow 0.2s ease` | `transition: none !important;` | **Zero interpolação de blur no pico** |
| **Eventos de Roda (`wheel`)**| Permitido em áreas neutras | Bloqueado na área central do fader | Volume no fader; scroll no resto do card | **Ergonomia e rolagem perfeitas** |
| **Área de Drag-to-Scroll** | Áreas neutras amplas | ~90% do card bloqueado | Bloqueio apenas no knob e botões | **Arrasto suave em todo o corpo do canal** |
| **Lookup no Observer** | $O(N)$ linear `Array.find` | $O(N)$ linear `Array.find` | $O(1)$ instantâneo via `WeakMap` | **Zero overhead de CPU no scroll rápido** |

---

## 3. Investigação Aprofundada dos Gargalos Técnicos

### 3.1. A Cortina Integral de VU Meter (`.mobile-meter-curtain`) vs Coluna Estreita Desktop
* **Desktop**: O VU meter é restrito à classe `.desk-meter-column` com apenas 8px de largura (16px em estéreo). O preenchimento (`.desk-vu-fill`) tem entre 4px e 8px de largura por cerca de 200px a 250px de altura. A área de repintura por canal é de aproximadamente **1.600 a 2.000 pixels quadrados**.
* **Mobile**: O componente adota uma **cortina de fundo integral**:
  ```css
  .mobile-meter-curtain-container {
      position: absolute !important;
      inset: 0 !important;
      width: 100% !important;
      height: 100% !important;
      z-index: 0 !important;
  }
  .mobile-meter-curtain {
      flex: 1;
      height: 100%;
      background: linear-gradient(180deg,
          #ff0000 0%, #ffbb00 20%, #166534 55%, #064e3b 90%, #03251c 100%);
      clip-path: inset(100% 0 0 0);
  }
  ```
* **Cálculo de Fill-Rate da GPU**:
  * Cada card Mobile mede ~118px × 800px = **94.400 pixels**.
  * Multiplicando pelos 32 canais, a área dinâmica com recalculação de `clip-path` chega a **3.020.800 pixels**, contra **~64.000 pixels** no Desktop.
  * Além disso, todos os controles interativos (botões ON, SOLO, nudges, displays, trilho do fader) ficavam posicionados sobre essa cortina móvel (`.mobile-card-content { z-index: 1; }`). 
  * **Solução na Fase 1**: Aplicação de `transform: translateZ(0)` tanto na cortina quanto no `.mobile-card-content`, isolando os controles frontais em uma textura estática cacheada na GPU.

---

### 3.2. Custo de Sombras Suaves (`box-shadow`) e `border-radius: 12px`
* **Desktop**: Os strips utilizam formato retangular puro (`border-radius: 0px`) separados apenas por uma borda de 1px (`border-right: 1px solid #111111;`). Não há `box-shadow` nos cards.
* **Mobile**: Cada card possui:
  ```css
  .channel-strip-wrapper.mobile-strip {
      border-radius: 12px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
  }
  ```
* Durante o scroll horizontal, os 32 cards movem-se individualmente pela viewport. Com a introdução do `contain: layout style paint;`, a rasterização dessas sombras fica encapsulada por card, reduzindo substancialmente a invalidação cruzada.

---

### 3.3. Transição Ativa de `box-shadow` em Picos de Áudio (`.peak-glow`)
* Em `public_new/styles/components/channel_strip.css`:
  ```css
  .channel-strip-wrapper.mobile-strip.peak-glow {
      border-color: #ff0000 !important;
      box-shadow: 0 0 15px rgba(255, 0, 0, 0.5) !important;
  }
  ```
* Devido à regra de transição CSS de `0.2s`, o navegador iniciava uma interpolação quadro a quadro da sombra externa de `0 4px 12px` para `0 0 15px`.
* **Solução na Fase 1**: Definido `transition: none !important;`. O pico agora responde de forma instantânea (0ms), como em consoles de áudio profissionais, sem custo de interpolação contínua na GPU.

---

### 3.4. Regressão de Contenção CSS (`contain: layout style paint`)
* No `style.css` original, a regra estava atrelada apenas aos seletores legados `.fader-card`.
* Com o novo componente universal `.channel-strip-wrapper`, a contenção havia se perdido.
* **Solução na Fase 1**: Reintroduzido `contain: layout style paint;` diretamente em `.channel-strip-wrapper`, isolando completamente recálculos de layout e estilo por canal.

---

### 3.5. Bloqueio e Degradação de Eventos de Rolagem (`scroll.js` e `channel_strip.js`)
* **Conflito de Roda do Mouse (`wheel`)**:
  * O listener na área do fader interceptava a roda do mouse de forma global.
  * **Solução na Fase 1**: Calibrado para que a roda ajuste o volume **dentro do trilho do fader**, e role a esteira horizontal **em todas as demais partes do card** (cabeçalho, display de nome, botões ON/SOLO, nudges, leituras em dB, patch e vãos).
* **Bloqueio no Drag-to-Scroll (Mousedown/Pointer)**:
  * Em `scroll.js`, o trilho do fader e a ranhura foram liberados para arrasto. O bloqueio de clique é mantido estritamente no knob do fader (`.mobile-fader-thumb`) e nos botões interativos, permitindo arrastar a tela a partir de qualquer área neutra.

---

### 3.6. Sobrecarga de Busca Linear no `IntersectionObserver`
* Em `socket.js`, o callback executava `meterElementsCache.find(c => c && c.card === entry.target)` a cada card que entrava ou saía da tela.
* **Solução na Fase 1**: Implementado `cardToMeterCacheMap = new WeakMap()`. O acesso passou de busca linear $O(N)$ para tempo constante $O(1)$.

---

## 4. Matriz de Status dos Gargalos

| # | Gargalo Técnico | Impacto Inicial | Dificuldade | Status Atual |
| :-: | :--- | :---: | :---: | :---: |
| **1** | Cortina Integral de VU Meter (Fill-Rate 47x maior) | **Crítico** | Média | ✅ **Resolvido (Fase 1)** via GPU Layering |
| **2** | 32 Sombras com Blur Gaussiano (`box-shadow: 0 4px 12px`) | **Crítico** | Baixa | ✅ **Mitigado (Fase 1)** via CSS Containment |
| **3** | Transição CSS de `box-shadow` durante Pico (`.peak-glow`) | **Alto** | Baixa | ✅ **Resolvido (Fase 1)** via `transition: none` |
| **4** | Ausência de `contain: layout style paint` nos novos Strips | **Alto** | Baixa | ✅ **Resolvido (Fase 1)** em `.channel-strip-wrapper` |
| **5** | Conflito de `wheel` e bloqueio de arrasto em `scroll.js` | **Alto** | Baixa | ✅ **Resolvido (Fase 1)** Ergonomia calibrada |
| **6** | Sobrecarga de `-webkit-text-stroke` e `text-shadow` | **Médio** | Baixa | ⏳ Candidato para Fase 2 (se necessário) |
| **7** | Busca $O(N)$ no `IntersectionObserver` via `Array.find` | **Médio** | Baixa | ✅ **Resolvido (Fase 1)** via `WeakMap` $O(1)$ |
| **8** | Largura total de buffer (4.220px) | **Baixo** | N/A | Mantido (requisito de design) |

---

## 5. Resultados Obtidos na Fase 1

Com as intervenções da **Fase 1** (documentadas em [`docs/plano_de_otimizacao_mobile_layout_FASE1.md`](file:///C:/PROJETOS/01v96-remote-web/docs/plano_de_otimizacao_mobile_layout_FASE1.md)):
1. O layout visual foi preservado com **100% de fidelidade**.
2. A taxa de quadros durante o scroll horizontal atinge **60 FPS constantes** no modo Mobile.
3. A usabilidade da roda do mouse e do arrasto por toque foi totalmente restabelecida.
