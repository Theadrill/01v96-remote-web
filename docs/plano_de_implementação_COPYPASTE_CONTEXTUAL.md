# Plano de Implementação — Copiar / Colar Contextual (Com Self-Contained Expected Screen & Handlers)

## 🎯 Goal Description
Implementar um sistema modular e extensível de **Copiar e Colar Contextual**, onde cada função de tela é auto-suficiente: ao realizar a cópia, ela preenche o buffer global com os dados, o nome da fonte dinâmico (`sourceName = getMixDisplayName(auxIdx)`), o identificador da tela esperada (`expectedScreen`), o validador de destino (`validateTarget`) e o handler de colagem correspondente (`pasteFn`).

---

## 🏗️ Arquitetura do Componente: Resolução Dinâmica de Nomes

O nome da fonte e do destino é gerado **100% dinamicamente** a partir do ID da mix ativa (`auxIdx` / `targetMix`), incorporando inclusive o nome customizado do barramento se existir:

```javascript
function getMixDisplayName(mixNumber) {
    let name = `MIX ${mixNumber}`;
    const globalMixId = 35 + mixNumber; // Mix 1..8 mapeia para IDs globais 36..43
    if (window.resolvedNames && window.resolvedNames[globalMixId] && window.resolvedNames[globalMixId].name) {
        name = `MIX ${mixNumber} (${window.resolvedNames[globalMixId].name})`;
    } else if (typeof mixesState !== 'undefined' && mixesState[mixNumber - 1] && mixesState[mixNumber - 1].name) {
        name = `MIX ${mixNumber} (${mixesState[mixNumber - 1].name})`;
    }
    return name;
}
```

---

## 📊 Fluxograma de Operação & Estados (ASCII)

```text
========================================================================================
                              1. RENDERIZAÇÃO DA TELA
========================================================================================

    [ Mudança de Tela / initUI / renderDock ]
                       │
                       ▼
       ┌───────────────────────────────┐
       │ Tela está na BLACKLIST?       │
       │ (main, channelConfig, outs...)│
       └───────────────┬───────────────┘
                       │
         ┌─────────────┴─────────────┐
         ▼ SIM                       ▼ NÃO (Telas permitidas ex: techMix)
  ┌───────────────┐           ┌──────────────────────────────────────┐
  │ NÃO RENDERIZA │           │ RENDERIZA BOTÕES:                    │
  │ OS BOTÕES     │           │ [ COPIAR ] e [ COLAR ]               │
  └───────────────┘           └──────────────────┬───────────────────┘
                                                 │
                                                 ▼
                              ┌──────────────────────────────────────┐
                              │ Estado do Botão [ COLAR ]:           │
                              │ • RAM vazia/incompatível -> DISABLED │
                              │ • RAM com tipo compatível -> ATIVO   │
                              └──────────────────────────────────────┘


========================================================================================
                 2. FLUXO AO CLICAR EM [ COPIAR ] (Dinâmico via ID)
========================================================================================

    [ Usuário clica em 'COPIAR' no MIX {auxIdx} (Ex: MIX 3) ]
                       │
                       ▼
    [ Chama copySendsOnFaders(auxIdx) ]
                       │
                       ▼
    [ Resolve dinamicamente: sourceName = getMixDisplayName(auxIdx) -> 'MIX 3' ]
                       │
                       ▼
    [ Preenche window.contextClipboard com:                                 ]
    [ • type: 'sends_on_faders'                                             ]
    [ • sourceId: auxIdx                                                    ]
    [ • sourceName: sourceName                                              ]
    [ • expectedScreen: 'BARRAMENTO MIX / FONE'                             ]
    [ • validateTarget: () => technicianMixMode && activeMix >= 1 && <= 8  ]
    [ • pasteHandler: (target) => pasteSendsOnFaders(target)                ]
    [ • data: [ 32 canais faders + on/off daquele auxIdx ]                  ]
                       │
                       ▼
    [ Dispara OverlayInfo: CLIPBOARD_MESSAGES.copied(sourceName) ]
    [ "MIX 3 COPIADO COM SUCESSO!" ]
                       │
                       ▼
    [ Botão [ COLAR ] torna-se ATIVO e DESTACADO (Verde) ]


========================================================================================
                 3. FLUXO AO CLICAR EM [ COLAR ] (Despachante Dinâmico)
========================================================================================

    [ Usuário clica no botão 'COLAR' no MIX {targetMix} (Ex: MIX 5) ]
                       │
                       ▼
    [ Chama pasteActiveContext() ]
                       │
         ┌─────────────┴─────────────────────────────┐
         ▼                                           ▼
   [ RAM Vazia? ]                             [ RAM Preenchida ]
         │                                           │
         ▼ SIM                                       ▼
   [ OverlayInfo:                                    │
     CLIPBOARD_MESSAGES.empty() ]                    ▼
   [ "NENHUM DADO COPIADO" ]          ┌───────────────────────────────┐
                                      │ Executa:                      │
                                      │ contextClipboard.             │
                                      │ validateTarget()              │
                                      └──────────────┬────────────────┘
                                                     │
                               ┌─────────────────────┴─────────────────────┐
                               ▼ Retornou FALSE                            ▼ Retornou TRUE
                         ┌───────────────────────────┐               ┌───────────────────────────┐
                         │ OverlayInfo:              │               │ targetName =              │
                         │ CLIPBOARD_MESSAGES.       │               │   getMixDisplayName(target)│
                         │ incompatible(sourceName,  │               │                           │
                         │ expectedScreen)           │               │ Abre ConfirmModal:        │
                         │                           │               │ 'Deseja colar definições  │
                         │ "ERRO: DADOS NA MEMÓRIA   │               │ da MIX 3 na MIX 5?'       │
                         │ SÃO DO MIX 3. ABRA        │               └─────────────┬─────────────┘
                         │ BARRAMENTO MIX/FONE       │                             │
                         │ PARA COLAR!"              │               ┌─────────────┴─────────────┐
                         └───────────────────────────┘               ▼ CANCELAR                  ▼ CONFIRMAR
                                                                [ Aborta ]                  [ Executa:
                                                                                              pasteHandler(targetMix) ]
                                                                                                    │
                                                                                                    ▼
                                                                                            [ 32 canais enviados
                                                                                              com delay 15ms ]
                                                                                                    │
                                                                                                    ▼
                                                                                            [ OverlayInfo:
                                                                                              "MIX 5 COLADO
                                                                                              COM SUCESSO!" ]
========================================================================================
```

---

## 📐 Proposed Changes

### Componente 1: Motor e Handlers Dinâmicos (`public/modules/copy_paste.js`)

```javascript
// Dicionário Centralizado de Mensagens
const CLIPBOARD_MESSAGES = {
    copied: (source) => `${source.toUpperCase()} COPIADO COM SUCESSO!`,
    pasted: (target) => `${target.toUpperCase()} COLADO COM SUCESSO!`,
    empty: () => `NENHUM DADO COPIADO NA MEMÓRIA!`,
    incompatible: (source, expectedScreen) => `ERRO: DADOS NA MEMÓRIA SÃO DO ${source.toUpperCase()}. ABRA ${expectedScreen.toUpperCase()} PARA COLAR!`,
    error: (msg) => `ERRO: ${msg.toUpperCase()}`
};

// Blacklist de Telas
window.COPY_PASTE_BLACKLIST = ['main', 'channelConfig', 'outs', 'musician'];

window.isCopyPasteAllowedForView = function(viewMode) {
    if (!viewMode) return false;
    return !window.COPY_PASTE_BLACKLIST.includes(viewMode);
};

// Helper para obter o nome dinâmico da mix (ex: MIX 1 ou MIX 1 (Voz))
function getMixDisplayName(mixNumber) {
    let name = `MIX ${mixNumber}`;
    const globalMixId = 35 + mixNumber;
    if (window.resolvedNames && window.resolvedNames[globalMixId] && window.resolvedNames[globalMixId].name) {
        name = `MIX ${mixNumber} (${window.resolvedNames[globalMixId].name})`;
    } else if (typeof mixesState !== 'undefined' && mixesState[mixNumber - 1] && mixesState[mixNumber - 1].name) {
        name = `MIX ${mixNumber} (${mixesState[mixNumber - 1].name})`;
    }
    return name;
}

// Buffer de Clipboard Contextual
window.contextClipboard = {
    type: null,
    sourceId: null,
    sourceName: null,
    expectedScreen: null,
    data: null,
    validateTarget: null,
    pasteHandler: null
};

// --- HANDLER ESPECÍFICO: SENDS ON FADERS (MIX 1-8) ---

function copySendsOnFaders(auxIdx) {
    const channelsData = [];
    for (let i = 0; i < 32; i++) {
        const state = getChannelStateById(i);
        const level = (state && state[`aux${auxIdx}`] !== undefined) ? state[`aux${auxIdx}`] : 0;
        const on = (state && state[`aux${auxIdx}On`] !== undefined) ? !!state[`aux${auxIdx}On`] : false;
        channelsData.push({ ch: i, level, on });
    }

    const sourceName = getMixDisplayName(auxIdx);

    window.contextClipboard = {
        type: 'sends_on_faders',
        sourceId: auxIdx,
        sourceName: sourceName,
        expectedScreen: 'BARRAMENTO MIX / FONE',
        data: channelsData,
        validateTarget: () => typeof technicianMixMode !== 'undefined' && technicianMixMode && activeMix >= 1 && activeMix <= 8,
        pasteHandler: (targetAuxIdx) => executePasteSendsOnFaders(targetAuxIdx)
    };

    if (typeof OverlayInfo !== 'undefined') {
        OverlayInfo.show('copied', CLIPBOARD_MESSAGES.copied(sourceName));
    }
    updateCopyPasteUIState();
}

function executePasteSendsOnFaders(targetMix) {
    const sourceName = window.contextClipboard.sourceName;
    const targetName = getMixDisplayName(targetMix);

    ConfirmModal.show({
        title: 'Colar Mix / Fone',
        message: `Deseja colar as definições da <b>${sourceName}</b> na <b>${targetName}</b>?<br><br><small style="color:#aaa;">Os 32 canais receberão os mesmos níveis e estados ON/OFF.</small>`,
        type: 'primary',
        confirmText: 'SIM, COLAR',
        cancelText: 'CANCELAR'
    }).then(function(confirmed) {
        if (!confirmed) return;

        const items = window.contextClipboard.data;
        items.forEach((item, index) => {
            setTimeout(() => {
                const ch = item.ch;
                const state = getChannelStateById(ch);
                if (state) {
                    state[`aux${targetMix}`] = item.level;
                    state[`aux${targetMix}On`] = item.on;
                }

                // Atualização da UI
                const fader = document.getElementById(`aux_f_ch_${ch}`);
                const valDisplay = document.getElementById(`aux_v_ch_${ch}`);
                const btnOn = document.getElementById(`aux_on_ch_${ch}`);

                if (fader) fader.value = item.level;
                if (valDisplay) valDisplay.innerText = rawToDb(item.level);
                if (btnOn) btnOn.classList.toggle('on-active', item.on);

                // Emissão Socket
                socket.emit('control', { type: `kInputAUX/kAUX${targetMix}Level`, channel: ch, value: item.level });
                socket.emit('control', { type: `kInputAUX/kAUX${targetMix}On`, channel: ch, value: item.on ? 1 : 0 });

                if (index === items.length - 1 && typeof OverlayInfo !== 'undefined') {
                    OverlayInfo.show('success', CLIPBOARD_MESSAGES.pasted(targetName));
                }
            }, index * 15);
        });
    });
}

// --- DESPACHANTES GLOBAIS ---

window.copyActiveContext = function() {
    if (technicianMixMode && activeMix >= 1 && activeMix <= 8) {
        copySendsOnFaders(activeMix);
        return;
    }
    if (typeof OverlayInfo !== 'undefined') {
        OverlayInfo.show('error', CLIPBOARD_MESSAGES.error('NENHUMA TELA COPIÁVEL EM PRIMEIRO PLANO'));
    }
};

window.pasteActiveContext = function() {
    if (!window.contextClipboard || !window.contextClipboard.data) {
        if (typeof OverlayInfo !== 'undefined') {
            OverlayInfo.show('info', CLIPBOARD_MESSAGES.empty());
        }
        return;
    }

    if (typeof window.contextClipboard.validateTarget === 'function') {
        const isValid = window.contextClipboard.validateTarget();
        if (!isValid) {
            if (typeof OverlayInfo !== 'undefined') {
                OverlayInfo.show('error', CLIPBOARD_MESSAGES.incompatible(window.contextClipboard.sourceName, window.contextClipboard.expectedScreen));
            }
            return;
        }
    }

    if (typeof window.contextClipboard.pasteHandler === 'function') {
        window.contextClipboard.pasteHandler(activeMix);
    }
};

window.updateCopyPasteUIState = function() {
    const isValid = window.contextClipboard && typeof window.contextClipboard.validateTarget === 'function' && window.contextClipboard.validateTarget();
    const pasteDockBtn = document.getElementById('dockBtnPasteMix');
    if (pasteDockBtn) {
        pasteDockBtn.classList.toggle('disabled', !isValid);
        pasteDockBtn.classList.toggle('active-paste-ready', !!isValid);
    }
};
```

---

## 🧪 Verification Plan

### Testes Automatizados
```bash
node --check public/modules/copy_paste.js
node --check public/modules/sidebar.js
cargo check
```

### Validação Funcional
1. **Cópia no MIX 3**: Clicar em COPIAR ➔ Overlay *"MIX 3 COPIADO COM SUCESSO!"* (ou com nome customizado, ex: *"MIX 3 (BATERIA) COPIADO COM SUCESSO!"*).
2. **Incompatibilidade**: Ao testar colar fora de um barramento ➔ Overlay *"ERRO: DADOS NA MEMÓRIA SÃO DO MIX 3. ABRA BARRAMENTO MIX / FONE PARA COLAR!"*.
3. **Colagem no MIX 5**: Clicar em COLAR ➔ Confirmar modal ("MIX 3 na MIX 5") ➔ Envio progressivo e Overlay *"MIX 5 COLADO COM SUCESSO!"*.
