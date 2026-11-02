# Plano de Refatoração: Auto-Resolução do ChannelStrip & Migração do Volume Geral

## 1. Visão Geral e Contexto

No processo de migração da arquitetura legada (`public/`) para a arquitetura modular v2 (`public_new/`), diversas telas consumidoras (`main_view.js`, `outs_view.js`, `auxs_sends.js`, `channel_setup_core.js`) passaram a instanciar a classe modular única `ChannelStrip` (`public_new/modules/components/channel_strip.js`).

Este plano consolida a autonomia e auto-resolução do componente `ChannelStrip` (eliminando código duplicado de nomes, cores, títulos e patch) e estabelece a rota para desacoplar e aposentar o código legado de `volume_geral.js`.

---

## 2. Status Atual da Implementação

### ✅ Etapa 1: Métodos Estáticos e Auto-Resolução no `ChannelStrip` (CONCLUÍDO)
- [x] **`ChannelStrip.resolveName(ch, type, fallback)`**:
  - Consulta `window.resolvedNames` ou arrays de estado locais (`channelStates`, `mixesState`, `busesState`, `stInState`, `masterState`).
  - Suporta canais simples (`0..31`), pareados, compostos por vírgula (`"0, 1"` para aux_send), `mix` (36..43), `bus` (44..51), `st_in` (60..67) e `master` (52).
  - Força sempre `.toUpperCase()`.
- [x] **`ChannelStrip.resolveColorBand(ch, type, isPaired)`**:
  - `0..15`: `blue` (Azul Yamaha)
  - `16..31`: `green` (Verde Esmeralda)
  - Pareados (`isPaired: true`): `paired_green` (Verde Neon com borda)
  - MIX (36..43 ou `type: 'mix'`): `amber` (Âmbar/Amarelo Dourado)
  - BUS (44..51 ou `type: 'bus'`): `cyan` (Ciano/Azul Claro)
  - ST IN (60..67 ou `type: 'st_in'`): `st_in` (Azul-petróleo ST IN)
  - MASTER (52 ou `type: 'master'`): `wine` (Vinho/Bordô)
  - AUX SEND (`type: 'aux_send'`): `purple` (Roxo Yamaha)
  - MACRO (`type: 'macro'` / `'macro_aux'`): `macro_silver` (Prata)
- [x] **`ChannelStrip.resolveTitle(ch, type, isPaired, partnerId)`**:
  - Deduz `1`, `1 + 2`, `MIX 1`, `BUS 1`, `ST IN 1`, `MASTER`, `MACRO`, `AUX 1`.
- [x] **`ChannelStrip.resolvePatch(ch, type, isPaired, partnerId)`**:
  - Lê de `window.PatchRegistry` com fallback para `channelStates[ch].patch`.
- [x] **Ciclo de vida `render()`**:
  - Se `chNumber`, `name`, `colorBand` ou `patch` forem omitidos na configuração do strip, são auto-resolvidos no momento da renderização.
- [x] **Bugfix Crítico de Defaults do Construtor:**
  - Corrigido `colorBand: ''` e `chNumber: ''` nos defaults de `Object.assign` da classe `ChannelStrip`. Anteriormente, `colorBand: 'blue'` fazia com que qualquer instância sem `colorBand` explícito ignorasse a auto-resolução e ficasse permanentemente azul.

### ✅ Etapa 2: Limpeza e Simplificação nas Telas Consumidoras (CONCLUÍDO)
- [x] **`public_new/modules/screens/main_view.js`:**
  - Removidas as funções redundantes locais `_getPatchText` e `_getResolvedName`.
  - Configuração dos 32 faders de entrada e do Master PA simplificada para confiar na auto-resolução.
- [x] **`public_new/modules/screens/outs_view.js`:**
  - Removida a função local `_getResolvedName`.
  - Loops de MIX 1-8, BUS 1-8, ST IN 1-4 e Master PA simplificados, omitindo `chNumber`, `name`, `colorBand` e `patch`.
- [x] **`public_new/modules/screens/channel_setup/channel_setup_core.js`:**
  - Em `getChannelMeta(ch)`, utiliza `ChannelStrip.resolveName(ch)`.
  - Em `renderMiniFader(ch)`, removido o bloco de mais de 70 linhas de dedução manual redundante; o strip contextual auto-resolve suas propriedades canônicas.
- [x] **`public_new/modules/screens/auxs_sends.js`:**
  - Ajustada a cor do modo individual de envios para a cor canônica `purple` (`band-purple`).
- [x] **`public_new/styles/components/channel_strip.css`:**
  - Adicionada a classe `.channel-strip-wrapper.mobile-strip.band-purple` para suporte mobile a faders de envios auxiliares.

---

## 3. Próximo Passo: Etapa 3 — Migração do Volume Geral em `auxs_sends.js`

### 🎯 Objetivo:
Substituir a injeção legada de HTML via string (`getMixVolumeGeralHtml()` e `getAuxVolumeGeralHtml()`) pelo componente oficial `new ChannelStrip(...)` com `mode: 'macro_aux'`, integrando reatividade, Big Nudges e botão [ZERAR].

### 📍 Localização do Código Atual:
Arquivo: `public_new/modules/screens/auxs_sends.js` (linhas ~266 a ~291):

```javascript
// Injeção do Volume Geral no Mini-Fader lateral se disponível
if (ch >= 36 && ch <= 43 && typeof getMixVolumeGeralHtml === 'function') {
    var container = document.getElementById('miniFaderContainer');
    if (container) {
        var oldMix = document.getElementById('miniFaderVolumeGeral');
        if (oldMix) oldMix.remove();
        var contextMix = document.getElementById('miniFaderContext');
        var vgSlotMix = document.createElement('div');
        vgSlotMix.id = 'miniFaderVolumeGeral';
        vgSlotMix.style.cssText = 'height:100%; display:flex; align-items:stretch;';
        vgSlotMix.innerHTML = getMixVolumeGeralHtml(); // <--- LEGADO A SER SUBSTITUÍDO
        container.insertBefore(vgSlotMix, contextMix);
    }
} else if (ch <= 31 && typeof getAuxVolumeGeralHtml === 'function') {
    var containerCh = document.getElementById('miniFaderContainer');
    if (containerCh) {
        var oldCh = document.getElementById('miniFaderVolumeGeral');
        if (oldCh) oldCh.remove();
        var contextCh = document.getElementById('miniFaderContext');
        var vgSlotCh = document.createElement('div');
        vgSlotCh.id = 'miniFaderVolumeGeral';
        vgSlotCh.style.cssText = 'height:100%; display:flex; align-items:stretch;';
        vgSlotCh.innerHTML = getAuxVolumeGeralHtml(); // <--- LEGADO A SER SUBSTITUÍDO
        containerCh.insertBefore(vgSlotCh, contextCh);
    }
}
```

### 🛠️ Como o `ChannelStrip` já suporta `macro_aux`:
A classe `ChannelStrip` (`public_new/modules/components/channel_strip.js`) **já possui estrutura nativa** para `mode: 'macro_aux'` e `type: 'macro_aux'`:
1. **Layout Desktop (`_buildDesktopHTML`) e Mobile (`_buildMobileHTML`)**:
   - Renderiza display de Delta dB: `<div class="macro-delta-display">${cfg.deltaDb || '--'}</div>`
   - Renderiza botões de Big Nudge: `.btn-nudge-plus` e `.btn-nudge-minus`
   - Renderiza botão de Reset: `.btn-zerar-sends` (desktop) e `.mobile-btn-zerar` (mobile) com texto `ZERAR`
   - Aplica classe `.is-volume-geral` (largura otimizada de 70px)
2. **Eventos Nativos do Componente**:
   - Botão ZERAR dispara:
     - Chama `window.confirmZeroSends(cfg.chNumber)` se existir, ou
     - Emite evento `this._emitEvent('zerar_sends_click', { channel: this.config.chNumber })`
   - Botões de Big Nudge disparam:
     - `this._emitEvent('nudge', { direction: +1 / -1, step: ... })`

### 📋 Tarefas para a Próxima Sessão / Agente:
1. **No arquivo `public_new/modules/screens/auxs_sends.js`:**
   - Instanciar `new ChannelStrip(...)` com:
     ```javascript
     var vgStrip = new ChannelStrip({
         id: 'vg_' + ch,
         evtCh: ch,
         type: 'macro_aux',
         mode: 'macro_aux',
         chNumber: (ch >= 36 && ch <= 43) ? 'MIX' : 'AUX',
         name: (ch >= 36 && ch <= 43) ? 'VOLUME GERAL' : 'AUX GERAL',
         layout: layout,
         hasResetBtn: true,
         callbacks: {
             nudge: function (data) {
                 if (ch >= 36 && ch <= 43) {
                     // Lógica de nudge do mix volume geral (+/- delta)
                     nudgeMixVolumeGeral(ch - 35, data.direction);
                 } else {
                     // Lógica de nudge de todos os envios do canal (+/- delta)
                     nudgeAuxVolumeGeral(ch, data.direction);
                 }
             },
             zerar_sends_click: function () {
                 if (ch >= 36 && ch <= 43) {
                     showMixZeroConfirm(ch - 35);
                 } else {
                     showAuxZeroConfirm(ch);
                 }
             }
         }
     });
     ```
   - Inserir o elemento retornado por `vgStrip.render()` diretamente no slot do container (`#miniFaderContainer`).
2. **Portar as funções de cálculo de delta/nudge para dentro de `public_new/modules/screens/auxs_sends.js` (ou módulo de serviço dedicado):**
   - Consultar as implementações originais em `public/modules/volume_geral.js` (`nudgeAuxVolumeGeral`, `zeroAuxVolGeral`, `nudgeMixVolumeGeral`, `zeroMixVolGeral`).
   - Integrar atualização em tempo real do display de delta dB chamando `vgStrip.setDeltaDb(deltaText)`.
3. **Validar:**
   - Tela de Channel Setup em um canal de entrada: aba [AUX] deve exibir o mini-fader contextual à direita e o fader de Volume Geral ao lado, operando nudges e zerar com modal de confirmação.
   - Tela de Channel Setup em um MIX (36..43): deve exibir o Volume Geral do Mix correspondente.

---

## 4. Diretrizes e Regras Críticas do Repositório (AGENTS.md)

1. **NUNCA fazer `git push` sem pedido explícito do usuário.** Mesmo após commits, aguardar sempre o comando expresso.
2. **Build commands:** Usar sempre `cargo check` em vez de `cargo build --release` caso toque em código Rust.
3. **Escopo:** Todas as alterações devem ser feitas em `public_new/` (arquitetura V2 modular) e `docs/`. O diretório `public/` é mantido como referência legada.
4. **Ponto 5 (formatação dB via `rawToDb` interno no strip):** Mantido postergado conforme instrução expressa do usuário.
