# Plano de Implementação — Copiar / Colar Contextual na Aba EQ (Apenas EQ & Canal Inteiro)

## 🎯 Goal Description
Implementar o sistema de **Copiar e Colar** da tela de **Equalizador (EQ)** dentro da **nova arquitetura contextual** (`window.contextClipboard`, `ConfirmModal`, `OverlayInfo`, `dispatchThrottledCommands` com 20ms de delay seguro), **sem nenhuma dependência do código legado**.

> [!IMPORTANT]
> **Independência Total do Código Legado**:
> O novo motor de cópia/colagem de EQ e Canal Inteiro será 100% autossuficiente e isolado. Ele **NÃO** usará variáveis legadas (`window.clipboardMode`, `window.eqClipboard`, `window.fullChannelClipboard`) nem funções legadas (`pasteEQLogic`, `pasteFullChannelLogic`, `showCustomConfirm`, `showCustomAlert`). O bloco legado permanecerá intacto e inativo no final do arquivo até que os testes manuais sejam aprovados pelo usuário, momento em que será excluído numa etapa futura de limpeza.

---

## 📍 Regras de Interface & Botões
1. **Posicionamento**:
   - Os botões de copiar e colar para o EQ continuam no **cabeçalho superior da janela de equalização** (`#headerBtnCopy` e `#headerBtnPaste`).
   - Os botões de copiar/colar da sidebar e bottom bar lateral continuam **ocultos** na aba `eq` (como já definido).
2. **Estado Visual do Botão [ COLAR ] no Topo (`#headerBtnPaste`)**:
   - Gerenciado pela função unificada `window.updateCopyPasteUIState()`.
   - Fica **ativo e habilitado** (`eq-header-btn-paste-on`, `disabled = false`) sempre que houver no `window.contextClipboard` um item do tipo `'eq'` ou `'full_channel'` compatível com o canal aberto.
   - Fica **desabilitado/apagado** (`eq-header-btn-paste-off`, `disabled = true`) caso o clipboard esteja vazio ou possua dados incompatíveis.

---

## 🔍 Parâmetros & Estrutura dos Buffers Contextuais

### 1. "COPIAR APENAS EQ" (`type: 'eq'`):
- **Canais Compatíveis**: Inputs `0..31`, Mixes `36..43`, Buses `44..51`, Master `52` e ST IN `60..67`.
- **Estrutura no `window.contextClipboard`**:
```javascript
window.contextClipboard = {
    type: 'eq',
    sourceId: ch,
    sourceName: getChannelDisplayName(ch),
    expectedScreen: 'EQUALIZADOR (EQ)',
    data: {
        mode: state.eq ? state.eq.mode : 0,
        on: state.eq ? !!state.eq.on : false,
        att: state.att !== undefined ? state.att : 0,
        phase: state.phase !== undefined ? !!state.phase : false,
        bands: state.eq ? JSON.parse(JSON.stringify(state.eq)) : {}
    },
    validateTarget: function() {
        return (
            typeof activeConfigTab !== 'undefined' &&
            activeConfigTab === 'eq' &&
            typeof activeConfigChannel !== 'undefined' &&
            activeConfigChannel !== null
        );
    },
    pasteHandler: function(targetCh) {
        executePasteEQOnly(targetCh);
    }
};
```

### 2. "COPIAR CANAL TODO" (`type: 'full_channel'`):
- **Canais Compatíveis**: Canais de Entrada (Inputs `0..31` e ST IN `60..67`).
- **Estrutura no `window.contextClipboard`**:
```javascript
window.contextClipboard = {
    type: 'full_channel',
    sourceId: ch,
    sourceName: getChannelDisplayName(ch),
    expectedScreen: 'EQUALIZADOR (EQ)',
    data: {
        // Strip
        value: state.value !== undefined ? state.value : 0,
        on: state.on !== undefined ? !!state.on : true,
        pan: state.pan !== undefined ? state.pan : 0,
        phase: state.phase !== undefined ? !!state.phase : false,
        att: state.att !== undefined ? state.att : 0,
        // EQ
        eq: state.eq ? JSON.parse(JSON.stringify(state.eq)) : {},
        // Dynamics
        gate: state.gate ? JSON.parse(JSON.stringify(state.gate)) : null,
        comp: state.comp ? JSON.parse(JSON.stringify(state.comp)) : null,
        // AUX Sends 1..8
        auxSends: Array.from({ length: 8 }, (_, i) => ({
            aux: i + 1,
            level: state['aux' + (i + 1)] !== undefined ? state['aux' + (i + 1)] : 0,
            on: state['aux' + (i + 1) + 'On'] !== undefined ? !!state['aux' + (i + 1) + 'On'] : false
        })),
        // Routing
        patch: state.patch !== undefined ? state.patch : null,
        buses: state.buses ? [...state.buses] : new Array(8).fill(false),
        stereo: state.stereo !== undefined ? !!state.stereo : true,
        insert: state.insert ? JSON.parse(JSON.stringify(state.insert)) : null
    },
    validateTarget: function() {
        return (
            typeof activeConfigTab !== 'undefined' &&
            activeConfigTab === 'eq' &&
            typeof activeConfigChannel !== 'undefined' &&
            activeConfigChannel !== null &&
            ((activeConfigChannel >= 0 && activeConfigChannel <= 31) || (activeConfigChannel >= 60 && activeConfigChannel <= 67))
        );
    },
    pasteHandler: function(targetCh) {
        executePasteFullChannel(targetCh);
    }
};
```

---

## ⚡ Despachante Sequencial de 20ms (`dispatchThrottledCommands`)
- Totalmente unificado: ao colar `eq` ou `full_channel`, a lista de comandos socket é montada e despachada através de `dispatchThrottledCommands(commands, onComplete, 20)`.
- No `onComplete`:
  - Se a tela de EQ do canal destino estiver aberta (`activeConfigChannel === targetCh && activeConfigTab === 'eq'`), chama `drawEQ()` para atualizar o canvas gráfico e atualiza os botões de Phase/EQ ON.
  - Exibe o toast de confirmação via `OverlayInfo.show('success', CLIPBOARD_MESSAGES.pasted(...))`.

---

## 📊 Fluxograma de Operação (ASCII)

```text
========================================================================================
                          1. COPIAR NA TELA DE EQUALIZADOR (EQ)
========================================================================================

  [ Usuário em Channel Config: CH 1 na aba EQ ]
                          │
                          ▼
             [ Clica no botão [ COPIAR ] no topo ]
                          │
                          ▼
             [ copyEQ(ch) ] ──▶ Abre ConfirmModal moderno:
                                 "O que você deseja copiar deste canal?"
                                 [ COPIAR APENAS EQ ] | [ COPIAR CANAL TODO ] | [ CANCELAR ]
                                              │
                    ┌─────────────────────────┴─────────────────────────┐
                    ▼ COPIAR APENAS EQ                                  ▼ COPIAR CANAL TODO
        [ executeCopyEQOnly(ch) ]                          [ executeCopyFullChannel(ch) ]
          • type: 'eq'                                       • type: 'full_channel'
          • Captura 4 bandas, HPF, LPF, Att, Phase           • Captura Strip, Pan, EQ, Dyn, Aux, Routing
          • OverlayInfo:                                     • Verifica hasInsertOut em globalOutPatches
            "EQ DE CH 1 COPIADO!"                              • Se hasInsertOut: Modal explicativo
                                                               • Se não: OverlayInfo "CANAL CH 1 COPIADO!"
                    │                                                   │
                    └─────────────────────────┬─────────────────────────┘
                                              ▼
                        [ window.updateCopyPasteUIState() ]
                          • Habilita o botão [ COLAR ] no topo do EQ (#headerBtnPaste)
                          • Aplica classe 'eq-header-btn-paste-on'


========================================================================================
                          2. COLAR NA TELA DE EQ DE OUTRO CANAL
========================================================================================

  [ Usuário navega para CH 2 na aba EQ ]
                          │
                          ▼
             [ Clica no botão [ COLAR ] no topo ]
                          │
                          ▼
             [ pasteClipboard(targetCh) ]
                          │
            [ Valida contextClipboard.validateTarget() ]
                          │
           ┌──────────────┴──────────────┐
           ▼                             ▼
    [ Tipo 'eq' ]                [ Tipo 'full_channel' ]
           │                             │
           ▼                             ▼
    [ ConfirmModal:               [ ConfirmModal:
      "Colar EQ de CH 1             "Colar TODOS OS PARÂMETROS
       em CH 2?" ]                   de CH 1 em CH 2?" ]
           │                             │
           └──────────────┬──────────────┘
                          ▼ CONFIRMAR
        [ Atualiza state local do canal destino ]
                          │
                          ▼
        [ dispatchThrottledCommands(commands, 20) ]
          • Emite comandos Socket a cada 20ms
                          │
                          ▼
        [ onComplete: drawEQ() + OverlayInfo: "COLADO COM SUCESSO!" ]
========================================================================================
```

---

## 📐 Proposed Changes

### Componente 1: Motor Contextual de EQ e Canal Inteiro (`public/modules/copy_paste.js`)

#### [MODIFY] `public/modules/copy_paste.js`
1. **Implementar `copyEQ(ch)`**:
   - Abre `ConfirmModal` moderno com opções `COPIAR APENAS EQ` e `COPIAR CANAL TODO`.
2. **Implementar `executeCopyEQOnly(ch)`**:
   - Popula `window.contextClipboard` com tipo `'eq'`.
   - Exibe `OverlayInfo.show('copied', CLIPBOARD_MESSAGES.copied('EQ DE ' + sourceName))`.
   - Chama `window.updateCopyPasteUIState()`.
3. **Implementar `executeCopyFullChannel(ch)`**:
   - Popula `window.contextClipboard` com tipo `'full_channel'`.
   - Varre `window.globalOutPatches` para `hasInsertOut` (com modal informativo se presente).
   - Exibe `OverlayInfo.show('copied', CLIPBOARD_MESSAGES.copied('CANAL ' + sourceName))`.
   - Chama `window.updateCopyPasteUIState()`.
4. **Implementar `executePasteEQOnly(targetCh)`**:
   - Abre `ConfirmModal` com confirmação.
   - Aplica dados em `state.eq`, `state.att`, `state.phase`.
   - Monta comandos de EQ (`${prefix}EQ/kEQ*F`, `${prefix}EQ/kEQ*G`, `${prefix}EQ/kEQ*Q`, HPF, LPF, Mode, On, Phase, Att).
   - Despacha com `dispatchThrottledCommands(commands, onComplete, 20)`.
   - No `onComplete`, chama `drawEQ()` e exibe `OverlayInfo`.
5. **Implementar `executePasteFullChannel(targetCh)`**:
   - Abre `ConfirmModal` com confirmação.
   - Aplica em todos os módulos no `state` do canal destino (Fader, ON, Pan, Phase, Att, EQ, Gate, Comp, Aux 1-8, Patch, Buses, Stereo, Insert).
   - Monta fila com todos os comandos socket.
   - Despacha com `dispatchThrottledCommands(commands, onComplete, 20)`.
   - No `onComplete`, chama `drawEQ()`, atualiza sliders e exibe `OverlayInfo`.
6. **Atualizar `updateCopyPasteUIState()`**:
   - Adicionar sincronização do botão `#headerBtnPaste`:
     ```javascript
     var headerPasteBtn = document.getElementById('headerBtnPaste');
     if (headerPasteBtn) {
         var isEqCompatible = window.contextClipboard && 
             (window.contextClipboard.type === 'eq' || window.contextClipboard.type === 'full_channel') &&
             typeof window.contextClipboard.validateTarget === 'function' &&
             window.contextClipboard.validateTarget();
         headerPasteBtn.disabled = !isEqCompatible;
         headerPasteBtn.classList.toggle('eq-header-btn-paste-on', !!isEqCompatible);
         headerPasteBtn.classList.toggle('eq-header-btn-paste-off', !isEqCompatible);
     }
     ```
7. **Atualizar `pasteClipboard(ch)`**:
   - Redirecionar diretamente para `window.contextClipboard.pasteHandler(ch)`.

---

### Componente 2: Sincronização no Equalizador (`public/modules/eq.js`)

#### [MODIFY] `public/modules/eq.js`
- Na montagem do template do EQ (linha 179):
  - Inicializar `#headerBtnPaste` verificando se `window.contextClipboard` possui tipo compatível (`eq` ou `full_channel`), mantendo sincronismo perfeito.

---

## 🧪 Verification Plan

### Testes Automatizados
```bash
node --check public/modules/copy_paste.js
node --check public/modules/eq.js
cargo check
```

### Validação Manual
1. **Copiar Apenas EQ no CH 1**:
   - Abrir CH 1 no EQ ➔ Clicar em `COPIAR` ➔ `COPIAR APENAS EQ`.
   - Verificar toast *"EQ DE CH 1 COPIADO COM SUCESSO!"*.
   - Botão `COLAR` no topo do EQ fica ativo.
2. **Colar Apenas EQ no CH 2, MIX 1 e MASTER**:
   - Abrir CH 2, MIX 1 e MASTER ➔ Clicar em `COLAR` no topo ➔ Confirmar modal.
   - Verificar que a curva gráfica do EQ é atualizada na hora.
3. **Copiar Canal Inteiro no CH 1**:
   - Clicar em `COPIAR` ➔ `COPIAR CANAL TODO`.
   - Se houver Insert Out, verificar modal explicativo.
4. **Colar Canal Inteiro no CH 2**:
   - Abrir CH 2 ➔ Clicar em `COLAR` no topo ➔ Confirmar modal.
   - Verificar que Fader, Pan, EQ, Gate, Comp, Auxiliares 1-8 e Routing são todos colados com intervalo seguro de 20ms.
5. **Proteção de Incompatibilidade**:
   - Ao copiar Canal Inteiro e abrir o Master no EQ, verificar que o botão `COLAR` no topo permanece desabilitado (já que Master não aceita canal inteiro de entrada).
