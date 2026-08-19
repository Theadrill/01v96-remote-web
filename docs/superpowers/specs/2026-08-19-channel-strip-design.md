# Especificação de Design — Componente Universal ChannelStrip & ChannelOperations

**Data:** 2026-08-19  
**Status:** Aprovado  
**Subsistemas:** `ChannelStrip` (`channel_strip_component.js`), `ChannelOperations` (`channel_operations.js`), Integração com Temas YAML (`default.yaml`, `theme-editor.js`, `style.css`).

---

## 1. Visão Geral e Objetivos

Centralizar a renderização, ciclo de vida e operações administrativas de todos os **Channel Strips** do sistema em uma arquitetura modular, declarativa e desacoplada em 3 camadas:

1. **Apresentação Pura (`ChannelStrip`):** Um preset declarativo que alimenta dois renderers dedicados (`renderDesktop` e `renderMobile`), emitindo eventos DOM/CustomEvents sem acoplamento a MIDI/WASM/Sockets.
2. **Fachada Única de Operações (`ChannelOperations`):** Módulo central que absorve 100% das operações de gerenciamento de canal (Lock, Rename, Wizard de Troca/Swap e Cópia Integral/Copy).
3. **Estilização e Temas:** Integração direta com `public/themes/default.yaml`, `--strip-*` CSS custom properties e `ThemeEditor`.

---

## 2. Decisões Arquiteturais e de UX

### 2.1 Separação de Camadas (SRP & Event-Driven)
- O componente `ChannelStrip` não contém lógica de negócio. Apenas detecta gestos (Long Press de ~500ms quando `hasLongPress: true`) e emite:
  ```javascript
  element.dispatchEvent(new CustomEvent('ch:longpress', {
      bubbles: true,
      detail: { ch: config.ch, element }
  }));
  ```
- O módulo `channel_operations.js` escuta `ch:longpress` no `document` e abre o menu contextual de ações.

### 2.2 Absorção Total do `channel_lock.js`
- O arquivo `channel_lock.js` é descontinuado e suas responsabilidades são 100% integradas dentro de `channel_operations.js`:
  - `ChannelOperations.isLocked(ch)`
  - `ChannelOperations.toggleLock(ch)`
  - `ChannelOperations.applyLockOverlay(cardEl, isLocked)`
  - `ChannelOperations.openChannelMenu(ch)`
  - `ChannelOperations.startSwap(sourceCh)`
  - `ChannelOperations.startCopy(sourceCh)`
  - `ChannelOperations.rename(ch)`

### 2.3 Throttle e Intervalos de Comandos
- **Cópia Integral (`copy`):** Constante fixa `const COPY_INTERVAL_MS = 20;`.
- **Troca de Canais (`swap`):** Constante calculada dinamicamente como o dobro da cópia: `const SWAP_INTERVAL_MS = COPY_INTERVAL_MS * 2;` (40ms), garantindo que qualquer ajuste futuro na base escale o swap proporcionalmente.

### 2.4 UX do Wizard de Troca e Cópia (Stack de Modais)
- **Modal 1 (Ação):** `[ 🔄 1. TROCAR CANAIS DE LUGAR ]` ou `[ 📋 2. COPIAR E COLAR NESTE CANAL ]` + `[ ❌ Cancelar ]`.
- **Modal 2 (Grid de Destino com Filtragem Estrita de Compatibilidade):**
  - O componente `ChannelGridSelector` renderiza **apenas os canais compatíveis** com a origem:
    - Se a origem for **Input Mono (1-32)**: exibe apenas os outros Inputs Mono.
    - Se a origem for **Canal Linkado/Estéreo**: exibe apenas os outros Canais Linkados/Estéreo.
    - Se a origem for **Mix/Auxiliar**: exibe apenas as 8 Mixes.
    - Se a origem for **Bus**: exibe apenas os 8 Buses.
  - O canal de origem aparece destacado com o badge `"ORIGEM"`.
  - Canais organizados visualmente em blocos de 8 com número e Scribble Strip (nome customizado).
- **Modal 3 (Confirmação Visual Lado a Lado):**
  - Exibe os dois cards comparativos (Nome, Fader atual, Mute).
  - Botão de ação: `[ ✅ CONFIRMAR ]` e `[ ⬅️ Voltar ]`.
- **Execução e Feedback:**
  - O modal fecha imediatamente ao clicar em `CONFIRMAR`.
  - Exibição de `OverlayInfo.show()` (módulo `public/modules/overlay_info.js`) com progresso em tempo real e mensagem de conclusão.

---

## 3. Estrutura do ChannelStrip Universal (7 Zonas Desktop / 5 Zonas Mobile)

```
┌────────────────────────────────────────────────────────┐
│ 1. HEADER ZONE (Left: ⇄ Swap/Copy | Center: Label | 🔒)│
├────────────────────────────────────────────────────────┤
│ 2. TOP ACTION ZONE (Slot: SOLO | PRE/POST | Nada)      │
├────────────────────────────────────────────────────────┤
│ 3. DISPLAY / NAME TAG (Nome do canal / Scribble Strip) │
├────────────────────────────────────────────────────────┤
│ 4. MIDDLE FEATURE ZONE (Medidores Master / Aux Pos)    │
├────────────────────────────────────────────────────────┤
│ 5. PRIMARY BUTTON (Botão ON com estado iluminado)      │
├────────────────────────────────────────────────────────┤
│ 6. FADER & METER CORE (Fader + Nudges + Escala + VU)   │
├────────────────────────────────────────────────────────┤
│ 7. FOOTER / ROUTING ZONE (Panpot + Patch Input/Output) │
└────────────────────────────────────────────────────────┘
```

- **Desktop:** 7 Zonas completas.
- **Mobile:** 5 Zonas (sem Panpot, sem Patch no rodapé, sem ícones no Header — operações via Long Press).

---

## 4. Presets Declarativos do ChannelStrip

- `presets.mainInput(chIndex, options)`
- `presets.output(index, type, options)` (Mix, Bus, ST IN)
- `presets.master(options)`
- `presets.auxSend({ ch, auxIdx, isPre, options })`
- `presets.mixMatrix({ ch, mixIdx, isFixed, isPre, options })`
- `presets.mini(chIndex, options)`

---

## 5. Integração com Temas YAML (`public/themes/default.yaml`)

Seção unificada `channel_strip:` cobrindo:
- Cores de fundo e bordas do card (`card_bg`, `card_bg_on`, `card_border_color`).
- Cores de texto do cabeçalho por tipo de canal (`input_1`, `input_2`, `st_in`, `mix`, `bus`, `master`).
- Scribble Strip (`display_bg`, `display_text_color`, `display_font_size`).
- Botões de controle (`btn_on_active`, `btn_solo_active`, `btn_pre_active`).
- Fader e medidores (`fader_track_bg`, `fader_thumb_color`, `meter_curtain_color`, `peak_led_color`).
- Ícones do cabeçalho (`header_icon_swap_color`, `header_icon_lock_active`).
