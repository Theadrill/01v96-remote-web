---
name: 01V96 Remote Web
description: Real-time pro audio console controller for Yamaha 01V96
colors:
  primary: "#ffc107"
  primary-glow: "rgba(255, 193, 7, 0.4)"
  solo-active: "#22c55e"
  pre-active: "#6b21a8"
  db-value: "#5cacee"
  oled-green: "#00ff00"
  peak-led: "#ff0000"
  neutral-bg: "#111111"
  neutral-surface: "#181818"
  neutral-border: "#333333"
  neutral-text: "#ffffff"
  neutral-text-muted: "#999999"
  group-ch1: "#00adef"
  group-ch2: "#00ff88"
  group-st: "#4a90e2"
  group-mix: "#d4a017"
  group-bus: "#00b396"
  group-aux: "#7e22ce"
  group-master: "#dc3545"
typography:
  display:
    fontFamily: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif"
    fontSize: "13px"
    fontWeight: 900
    lineHeight: 1.2
    letterSpacing: "0.05em"
  headline:
    fontFamily: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif"
    fontSize: "11px"
    fontWeight: 800
    lineHeight: 1.2
    letterSpacing: "0.02em"
  title:
    fontFamily: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif"
    fontSize: "10px"
    fontWeight: 800
    lineHeight: 1.1
    letterSpacing: "normal"
  body:
    fontFamily: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif"
    fontSize: "10px"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "normal"
  label:
    fontFamily: "Consolas, Menlo, 'Courier New', monospace"
    fontSize: "9.5px"
    fontWeight: 800
    lineHeight: 1
    letterSpacing: "normal"
rounded:
  sm: "4px"
  md: "8px"
  lg: "12px"
  full: "50%"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
components:
  button-primary:
    backgroundColor: "{colors.neutral-border}"
    textColor: "{colors.neutral-text-muted}"
    rounded: "{rounded.sm}"
    padding: "6px 12px"
  button-primary-active:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.neutral-bg}"
    rounded: "{rounded.sm}"
    padding: "6px 12px"
  button-solo-active:
    backgroundColor: "{colors.solo-active}"
    textColor: "{colors.neutral-text}"
    rounded: "{rounded.sm}"
    padding: "4px 8px"
---

# Design System: 01V96 Remote Web

## Overview

**Creative North Star: "Precision Audio Deck"**

O 01V96 Remote Web é uma interface profissional de controle de áudio ao vivo em tempo real para o console digital Yamaha 01V96. O sistema equilibra a densidade informacional de consoles de mixagem de estúdio/turnê com a ergonomia tátil imediata necessária sob pressão em palcos e eventos ao vivo.

A filosofia visual se apoia no contraste nítido de visores digitais OLED e LEDs sobre superfícies escuras industriais (`#111111` e `#181818`), eliminando ornamentos desnecessários em favor de reconhecimento instantâneo de canais, barramentos e estados de mute/solo a qualquer distância de visão.

**Key Characteristics:**
- Superfícies escuras de alto contraste com feedback luminoso em LED/OLED.
- Código de cores semântico rigoroso para identificação imediata de grupos (CH 1-16, CH 17-32, ST IN, AUX, BUS, MASTER).
- Tipografia de precisão: sans-serif encorpada para identificadores/ações e monoespaçada com renderização afiada para valores de dB e medidores analógicos.
- Faders e botões com áreas de toque generosas e física de deslizamento de baixa latência.

## Colors

A paleta é baseada em tons neutros profundos de console profissional com acentos semânticos de alta saturação dedicados exclusivamente a estados de hardware e agrupamentos de canal.

### Primary
- **Active Channel / ON Amber** (#ffc107): Utilizado para o botão `ON` / unmute e indicadores ativos principais.

### Secondary
- **Solo / Cue Emerald** (#22c55e): Iluminação dos botões de Solo e audição em barramento Cue.
- **Pre / Post Send Purple** (#6b21a8): Botões de chaveamento de ponto de envio auxiliar.

### Tertiary (Display & Meters)
- **Digital Readout Cyan** (#5cacee): Valores numéricos de fader em dB e posições analógicas.
- **OLED Phosphor Green** (#00ff00): Visores digitais de rotulagem e nomes de canais.
- **Peak Alert Red** (#ff0000): Indicadores luminosos de saturação e clipping de sinal.

### Neutral
- **Deck Ground Black** (#111111): Fundo geral do viewport e base dos trilhos de fader.
- **Strip Surface Gray** (#181818): Fundo dos cards e corpos de channel strip.
- **Chassis Border Gray** (#333333): Divisores de canal, botões em estado inativo e bordas de contenção.
- **Muted Label Gray** (#999999): Escalas analógicas em dB e legendas secundárias.
- **Signal White** (#ffffff): Texto de alto contraste e realces primários.

### Channel Group Roles
- **Group 1 (CH 1-16)** (#00adef): Identificador ciano.
- **Group 2 (CH 17-32)** (#00ff88): Identificador verde elétrico.
- **Stereo In (ST 1-4)** (#4a90e2): Identificador azul royal.
- **Mix / Aux Master** (#d4a017 / #7e22ce): Identificador dourado / violeta.
- **Bus Master** (#00b396): Identificador turquesa.
- **Master Stereo** (#dc3545): Identificador vermelho console.

### Named Rules
**The Functional Glow Rule.** Cores saturadas nunca são decorativas. Se um elemento emite cor viva ou brilho (glow), ele representa um sinal de áudio real, um canal ativo (ON) ou um alerta de clipping.

## Typography

**Display / Header Font:** `'Segoe UI', Tahoma, Geneva, Verdana, sans-serif`
**Body Font:** `'Segoe UI', Tahoma, Geneva, Verdana, sans-serif`
**Label / Monospace Font:** `Consolas, Menlo, 'Courier New', monospace`

**Character:** A tipografia combina o peso confiante de sans-serif geométrica para identificação rápida com a nitidez monospace para valores métricos de áudio (-inf dB a +10 dB).

### Hierarchy
- **Display / Group Title** (Weight: 900, Size: 13px, Line-height: 1.2): Títulos de seções de mix e cabeçalhos de visualização.
- **Headline / Channel Name** (Weight: 800, Size: 11px, Line-height: 1.2): Identificação de canal no topo das tiras.
- **Title / Button Label** (Weight: 800, Size: 10px, Line-height: 1.1): Ações rápidas (ON, SOLO, PRE/POST).
- **Body / General Text** (Weight: 700, Size: 10px, Line-height: 1.2): Textos informativos de modais e opções de roteamento.
- **Label / Metric DB** (Weight: 800, Size: 9.5px, Line-height: 1): Leituras numéricas de ganho, frequências de EQ e escalas analógicas.

### Named Rules
**The Tabular Precision Rule.** Todos os valores numéricos, ganhos, frequências e patches devem utilizar exclusivamente a fonte monospace para garantir alinhamento tabular perfeito sem deslocamento visual ao atualizar.

## Layout

O layout é projetado para máxima responsividade e adaptabilidade universal, cobrindo desde Smart TVs e monitores até telas ultra-compactas:

- **Desktop:** Layout multi-colunas fixas para TVs, monitores ultrawide e notebooks workstations (faders em grade com grouping separators a cada 8 canais).
- **Mobile (Portrait):** Faders verticais com rolagem horizontal contínua — otimizado para smartphones.
- **Mobile (Landscape):** Faders horizontais compactas com sidebar lateral fixa.
- **Handheld Gaming (Steam Deck):** Layout híbrido ajustado para screen 16:10 800p com touch-target amplificado.
- **Ultra-Compact Handheld:** Tela de 4.7" (iPhone SE 3, 375x667px) como ponto de referência mínima — todas as zonas modulares do channel strip e modais devem se ajustar sem cortes ou rolagem vertical indesejada.

### Breakpoint Strategy (Alvo)
- **Ultra-Small Handheld / Compact Phone:** `< 400px` (ex: iPhone SE 3 — 375x667px)
- **Standard Smartphone:** `400px - 768px` (ex: Galaxy A55 ~6.6", iPhones standard)
- **Tablet / Gaming Handheld:** `768px - 1280px` (ex: Steam Deck 800p, iPads)
- **Desktop / TV Console:** `> 1280px` (Monitores, TVs e workstations)

## Elevation & Depth

O sistema utiliza predominantemente **tonal layering plano** e bordas sólidas nítidas, emulando painéis usinados de hardware de áudio:

- Superfícies e cartões utilizam fundos escuros planos (`#181818`, `#222222`) delimitados por bordas finas (`1px solid #333333`).
- Profundidade e foco de interação são comunicados por elevação de cor (fundo do canal clareia quando selecionado/ON) e brilho emissivo (`box-shadow: 0 0 10px rgba(255, 193, 7, 0.4)` nos botões ativos).

### Named Rules
**The Hardware Surface Rule.** Sombras são reservadas exclusivamente para botões táteis pressionáveis e emissores de luz LED. O chassi e os canais repousam em camadas planas com bordas de 1px.

## Shapes

- **Cantos Sutis (4px):** Botões de ação rápida (`ON`, `SOLO`), displays OLED e badges de status.
- **Cantos Médios (8px):** Modais de configuração de canal, janelas de EQ e caixas de ferramentas flutuantes.
- **Botões Circulares (50%):** Botões de ajuste fino (Nudge `+` e `-`).

## Components

### Channel Strip (Universal)
- **Estrutura:** 7 zonas verticais modulares (Header, TopAction, Display, MiddleFeature, PrimaryButton, FaderCore, FooterRouting).
- **Fader Rail:** Trilho em cinza escuro com escala em dB impressa lateralmente e knob em relevo de alta precisão.
- **VU Meters:** Medidores gráficos integrados de resposta rápida com LED vermelho de pico no topo.

### Buttons (ON / Mute & Solo)
- **Shape:** Retangular com cantos de 4px (`--strip-btn-on-radius: 4px`).
- **ON Inativo:** Fundo `#333333`, texto `#888888`.
- **ON Ativo:** Fundo `#ffc107` (âmbar), texto `#000000` (preto), com glow sutil de LED.
- **Solo Ativo:** Fundo `#22c55e` (esmeralda), texto `#ffffff`, com glow sutil verde.

### Display Digital OLED
- **Fundo:** `#000000` absoluto com bordas de 4px.
- **Texto:** `#00ff00` fósforo verde digital de alto contraste com peso 700.

## Do's and Don'ts

### Do:
- **Do** manter a tipografia monospace em todas as medições de dB, frequência e patch.
- **Do** respeitar as cores de identificação de grupo ao renderizar cabeçalhos de canal.
- **Do** preservar as áreas de toque mínimas de faders e botões para ergonomia móvel ao vivo.
- **Do** sincronizar visualmente os botões pareados em estéreo.

### Don't:
- **Don't** utilizar fundos claros ou gradientes excessivos que prejudiquem a legibilidade em ambientes escuros de palco.
- **Don't** aplicar animações lentas ou transições longas em faders ou medidores; o feedback deve ser instantâneo (60 FPS / latência zero).
- **Don't** alterar a ordem semântica dos botões no channel strip (ON, SOLO, PRE, Nudge).

---

## Appendix: Visual Code Audit Summary

### Legacy Codebase (`public/`) vs Modern Codebase (`public_new/`)

| Aspecto | Legado (`public/`) | Modernizado (`public_new/`) |
|---|---|---|
| **CSS Architecture** | Monolítico (10.265 linhas em `style.css`) | Modular + monolítico (`style.css` + arquivos de componente) |
| **Token System** | CSS variáveis mínimas (4 no `:root`); tokens hardcoding via YAML não aplicados dinamicamente | YAML via `theme-engine.js`; 345 tokens injetados no `:root` como variáveis CSS (`--strip-*`) |
| **Componentização** | Funções globais (`createChannelStrip`, `updateUI`); HTML via template strings | Classe `ChannelStrip` (2.912 linhas), IIFEs para screens (`MainView`, `OutsView`, etc.) |
| **Responsividade** | Media queries por `max-height` e `max-width` em arquivos espalhados | Body classes (`layout-desktop`, `layout-horizontal`) + media queries consolidadas |
| **`!important` Usage** | **831 ocorrências** | Mínimas/nenhuma (tokenização via CSS variables) |
| **CSS Stub Files** | N/A | 16 de 21 arquivos CSS são JSDoc stubs vazios — todas as regras residem em `style.css` (10.323+ linhas) ou 5 arquivos funcionais |
| **WASM Integration** | Ausente | MeterEngine (Rust→WASM) com `Float32Array` zero-copy e `IntersectionObserver` |
| **CSS Containment** | Ausente | `.fader-card` usa `contain: layout style paint` |
| **Física de Fader** | Slider nativo HTML5 | Drag via pointer events, protected rail, `setPointerCapture`, wheel zoom dB-stepado |
| **Anti-Echo Guard** | Ausente | `window._nudgeBlockUntil` + `fromExternal` flag |
| **Migration Status** | Base legada estável | Migração incompleta: funções legadas coexistem com `ChannelStrip` (dívida técnica) |

### Críticas de Arquitetura Identificadas (public_new)

1. **Placeholder Pattern:** Arquivos CSS como `base.css`, `layout.css` são stubs JSDoc — estilos reais vivem em `style.css` monolítico, invalidando a modularização declarada.
2. **Duplicação de Tokens:** Tokens existem tanto em YAML (`default.yaml`) quanto hardcoded em CSS, com drifts de valores (ex: `btn_on_active_bg: #ffc107` no YAML vs `#ff4500` no desktop CSS).
3. **Inline Styles Residuais:** Componentes como `macro_fader.js` usam atributos `style="..."` ao invés de classes CSS, bypassando o sistema de temas.
4. **Dual Codebase Debt:** Funções legadas (`updateUI()`, `createDesktopStrip()`, `createMobileStrip()`) coexistem com a classe `ChannelStrip` moderna, criando ambiguidade sobre qual caminho seguir.
