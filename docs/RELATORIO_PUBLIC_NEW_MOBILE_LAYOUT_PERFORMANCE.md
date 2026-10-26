# 📊 Relatório Técnico: Diagnóstico de Performance do Layout Mobile (`public_new`)

## 1. Contexto e Motivação

O objetivo da reformulação do layout Mobile no `public_new` era proporcionar uma experiência otimizada, responsiva e leve para dispositivos com poder de processamento gráfico reduzido (smartphones, tablets, Steam Deck e telas compactas). 

No entanto, medições práticas e percepção tátil revelaram um paradoxo: **a rolagem horizontal (scroll) no modo Mobile apresenta sensação de peso, engasgos (stutter/jank) e consumo de GPU substancialmente maiores do que no modo Desktop**.

Este relatório documenta a investigação aprofundada nas camadas de CSS, DOM, renderização gráfica, compositing e listeners de eventos que causam esse comportamento.

---

## 2. Quadro Comparativo: Desktop vs Mobile

| Aspecto | Modo Desktop | Modo Mobile | Impacto na GPU / Compositor |
| :--- | :--- | :--- | :--- |
| **Largura por Card** | 86px (108px pareado) | 118px (148px pareado) | Mobile exige **53% mais buffer horizontal** no canvas de scroll |
| **Espaçamento (Gap)** | 0px (cards colados) | 12px + separadores de 24px | Mobile gera fragmentação visual contínua de camadas |
| **Largura Total (32 CH)** | ~2.752px | ~4.220px | Maior área de memória de texturas/tiling na GPU |
| **VU Meter (Área)** | Coluna lateral fina de **8px** | Cortina de fundo de **100% da área do card** | **Fill-rate ~47x maior no Mobile** |
| **Mecanismo de VU** | `clip-path` em barrinha estreita (4-8px) | `clip-path` em gradiente de 5 cores cobrindo o card inteiro | Blending alfa de toda a tela do canal a cada frame |
| **Contenção CSS** | Inexistente no wrapper novo | Inexistente no wrapper novo | Sem `contain`, invalidações propagam para a árvore inteira |
| **Sombras (`box-shadow`)** | `none` (zero sombras externas) | `0 4px 12px rgba(0,0,0,0.4)` em todos os 32 cards | 32 filtros de Gaussian Blur calculados a cada frame de scroll |
| **Cantos Arredondados** | `0px` (retângulos puros) | `border-radius: 12px` | Máscara de cantos curvos nos 32 cards |
| **Transições CSS de Pico** | `none` (LED estático de 7px) | `transition: box-shadow 0.2s ease` | Interpolação contínua de sombra ao clippar |
| **Eventos de Roda (`wheel`)**| Permitido em áreas neutras | Bloqueado na área central do fader (`passive: false`) | Roda do mouse no meio do card cancela o scroll |
| **Área de Drag-to-Scroll** | Áreas neutras amplas (header, display, footer) | ~90% do card na lista de bloqueio de arrasto | Falhas intermitentes ao tentar arrastar a tela |
| **Barra de Rolagem** | Nativa acelerada (`::-webkit-scrollbar` de 22px) | Oculta (`scrollbar-width: none; display: none`) | Perda da rolagem direta acelerada pelo SO |

---

## 3. Investigação Aprofundada dos 8 Gargalos Técnicos

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
  * Além disso, todos os controles interativos (botões ON, SOLO, nudges, displays, trilho do fader) ficam posicionados **sobre** essa cortina móvel (`.mobile-card-content { z-index: 1; }`). 
  * A GPU precisa fazer composição alfa (Alpha Blending) contínua de todos os nós filhos sobre o gradiente animado a 30-60 FPS durante o deslocamento de scroll.

---

### 3.2. Custo de Sombras Suaves (`box-shadow`) e `border-radius: 12px`
* **Desktop**: Os strips utilizam formato retangular puro (`border-radius: 0px`) separados apenas por uma borda de 1px (`border-right: 1px solid #111111;`). Não há `box-shadow` nos cards. O compositor gráfico do navegador agrupa esses elementos como texturas opacas contíguas.
* **Mobile**: Cada card possui:
  ```css
  .channel-strip-wrapper.mobile-strip {
      border-radius: 12px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
  }
  ```
* Durante o scroll horizontal, os 32 cards movem-se individualmente pela viewport. Para cada pixel de deslocamento, o rasterizador da GPU precisa processar 32 convoluções de desfoque gaussiano (Gaussian Blur de 12px) sobrepostas ao plano de fundo escuro, combinadas com o recorte vetorial dos 4 cantos arredondados de cada card.

---

### 3.3. Transição Ativa de `box-shadow` em Picos de Áudio (`.peak-glow`)
* Em `public_new/styles/components/channel_strip.css` (linha 775):
  ```css
  .channel-strip-wrapper.mobile-strip {
      transition: border-color 0.2s ease, box-shadow 0.2s ease;
  }
  .channel-strip-wrapper.mobile-strip.peak-glow {
      border-color: #ff0000 !important;
      box-shadow: 0 0 15px rgba(255, 0, 0, 0.5) !important;
  }
  ```
* Quando qualquer canal atinge nível próximo de 0 dBFS (pico), o script adiciona a classe `.peak-glow`. 
* Devido à regra de transição CSS de `0.2s`, o navegador inicia uma interpolação quadro a quadro da sombra externa de `0 4px 12px` para `0 0 15px`.
* Interpolação de `box-shadow` obriga o browser a re-rasterizar a textura da sombra na GPU a cada 16ms durante os 200ms da animação. Se isso ocorre simultaneamente à rolagem, o frame rate despenca instantaneamente.
* No Desktop, o pico acende um LED estático de 7px (`.desk-peak-led.active`) sem nenhuma transição no corpo do card.

---

### 3.4. Regressão de Contenção CSS (`contain: layout style paint`)
* Durante a otimização de Maio/2026 documentada em `docs/plano_de_otimizacao.md`, foi comprovado que `contain: layout style paint;` isolava o recálculo dos canais.
* Essa regra estava amarrada aos seletores legados `.fader-card` e `.fader-card-desktop` no `style.css`.
* Com a migração da V2 no `public_new`, o componente universal passou a usar `.channel-strip-wrapper` (`.desk-strip` e `.mobile-strip`).
* **Nenhuma declaração de `contain` foi atribuída a `.channel-strip-wrapper`**.
* O layout Mobile possui uma árvore DOM muito mais profunda por card (cortina de medidor, régua de escala, card-content, cluster de nudges, displays duplos). Sem contenção, mutações de atributos ou estilos em um canal disparam verificações que propagam para o contêiner flex e para os canais vizinhos.

---

### 3.5. Bloqueio e Degradação de Eventos de Rolagem (`scroll.js` e `channel_strip.js`)
* **Conflito de Roda do Mouse (`wheel`)**:
  * O commit `ae17656` habilitou ajuste de volume via roda do mouse no Mobile adicionando listener em `.mobile-fader-track-area` com `{ passive: false }` executando `e.preventDefault()` e `e.stopPropagation()`.
  * Como o trilho do fader mobile ocupa mais de 60% da altura visível do card (`flex: 1; min-height: 180px`), qualquer tentativa de usar a roda do mouse no terço central da tela é capturada pelo fader, **anulando a rolagem horizontal**.
* **Bloqueio no Drag-to-Scroll (Mousedown/Pointer)**:
  * Em `scroll.js`, a verificação de exclusão de arrasto inclui:
    ```javascript
    if (e.target.closest('.mobile-fader-thumb, .mobile-fader-track-area, .mobile-fader-groove, .mobile-nudge-btn, .mobile-btn-on, .mobile-btn-solo, .mobile-btn-pre')) return;
    ```
  * Quase **90% da superfície de cada card Mobile** se enquadra nessa lista de exclusão. Para conseguir iniciar um arrasto no modo Mobile, o usuário precisa clicar milimetricamente no cabeçalho ou no espaço vazio entre canais, gerando a sensação física de rolagem "travada" ou "insensível".
* **Scrollbar Nativo Oculto**:
  * No Desktop, a barra inferior de 22px (`::-webkit-scrollbar`) oferece trilha de rolagem acelerada nativamente pelo sistema operacional. No Mobile, a barra está completamente oculta (`display: none; scrollbar-width: none;`).

---

### 3.6. Largura Virtual de Composição 53% Maior
* No Desktop, com largura de 86px por card e gap 0, a esteira horizontal de 32 canais tem **2.752px**.
* No Mobile, com largura base de 118px (148px para estéreos), gap de 12px entre canais e 3 separadores de grupo de 24px, a esteira horizontal atinge **4.220px**.
* O compositor de gráficos (Blink/Webkit Compositor) precisa alocar uma superfície de texturas 53% maior na memória de vídeo (VRAM) para processar o deslocamento da lista.

---

### 3.7. Filtros Tipográficos Vetoriais (`-webkit-text-stroke` e `text-shadow`)
* Em `channel_strip.css` (linhas 2410 e 2421):
  ```css
  .mobile-db-readout, .mobile-patch-readout {
      -webkit-text-stroke: var(--strip-mobile-db-stroke, 1px #000000);
      text-shadow: 0 0 2px #000000, 0 0 1px #000000;
  }
  ```
* O contorno vetorial de texto (`-webkit-text-stroke`) somado a múltiplas camadas de `text-shadow` aplicadas sobre elementos que flutuam sobre a cortina de gradiente força o rasterizador a recalcular o contorno e as sombras dos glifos continuamente durante o scroll e as atualizações numéricas de dB.

---

### 3.8. Sobrecarga de Busca Linear no `IntersectionObserver`
* Em `socket.js` (linha 1260), o callback de visibilidade executa:
  ```javascript
  meterVisibilityObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
          if (meterElementsCache) {
              const cached = meterElementsCache.find(c => c && c.card === entry.target);
              if (cached) cached.isVisible = entry.isIntersecting;
          }
      });
  });
  ```
* Durante uma rolagem rápida, dezenas de `entries` de interseção disparam simultaneamente. A cada evento, o código executa um `Array.find` linear ($O(N)$) em uma lista de 32 a 40 elementos, disputando a thread principal do JavaScript no exato momento em que o browser precisa calcular a inércia do scroll.

---

## 4. Matriz de Prioridade dos Gargalos

| # | Gargalo Técnico | Impacto na GPU / Scroll | Dificuldade de Resolução |
| :-: | :--- | :---: | :---: |
| **1** | Cortina Integral de VU Meter (Fill-Rate 47x maior) | **Crítico (Alto)** | Baixa / Média |
| **2** | 32 Sombras com Blur Gaussiano (`box-shadow: 0 4px 12px`) | **Crítico (Alto)** | Baixa |
| **3** | Transição CSS de `box-shadow` durante Pico (`.peak-glow`) | **Alto** | Baixa |
| **4** | Ausência de `contain: layout style paint` nos novos Strips | **Alto** | Baixa |
| **5** | Conflito de `wheel` e área de bloqueio de arrasto em `scroll.js` | **Alto (Perceptual)**| Baixa |
| **6** | Sobrecarga de `-webkit-text-stroke` e `text-shadow` | **Médio** | Baixa |
| **7** | Busca $O(N)$ no `IntersectionObserver` via `Array.find` | **Médio** | Baixa |
| **8** | Largura total de buffer (4.220px) | **Baixo / Estrutural** | Não aplicável |

---

## 5. Próximos Passos Recomendados

Para recuperar os 60 FPS contínuos no modo Mobile **sem nenhuma alteração no layout visual**, as intervenções devem focar exclusivamente em otimizações *under-the-hood* (isolamento de camadas GPU, otimização de propriedades de pintura, remoção de transições sintéticas de sombra e desobstrução dos listeners de rolagem).
