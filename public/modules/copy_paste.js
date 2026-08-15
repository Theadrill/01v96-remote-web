// ============================================================
// Motor de Copiar e Colar Contextual
// ============================================================

// Dicionário Centralizado de Mensagens
const CLIPBOARD_MESSAGES = {
    copied: (source) => source.toUpperCase() + ' COPIADO COM SUCESSO!',
    pasted: (target) => target.toUpperCase() + ' COLADO COM SUCESSO!',
    empty: () => 'NENHUM DADO COPIADO NA MEMORIA!',
    incompatible: (source, expectedScreen) => 'ERRO: DADOS NA MEMORIA SAO DO ' + source.toUpperCase() + '. ABRA ' + expectedScreen.toUpperCase() + ' PARA COLAR!',
    error: (msg) => 'ERRO: ' + msg.toUpperCase()
};

// Blacklist de Telas
window.COPY_PASTE_BLACKLIST = ['main', 'outs', 'musician'];

window.isCopyPasteAllowedForView = function(viewMode) {
    if (!viewMode) return false;
    return !window.COPY_PASTE_BLACKLIST.includes(viewMode);
};

// Helper para obter o nome dinâmico da mix (ex: MIX 1 ou MIX 1 (Voz))
function getMixDisplayName(mixNumber) {
    let name = 'MIX ' + mixNumber;
    const globalMixId = 35 + mixNumber;
    if (window.resolvedNames && window.resolvedNames[globalMixId] && window.resolvedNames[globalMixId].name) {
        name = 'MIX ' + mixNumber + ' (' + window.resolvedNames[globalMixId].name + ')';
    } else if (typeof mixesState !== 'undefined' && mixesState[mixNumber - 1] && mixesState[mixNumber - 1].name) {
        name = 'MIX ' + mixNumber + ' (' + mixesState[mixNumber - 1].name + ')';
    }
    return name;
}

function getChannelDisplayName(ch) {
    if (ch >= 36 && ch <= 43) {
        return getMixDisplayName(ch - 35);
    }
    let name = '';
    const stateRef = typeof getChannelStateById === 'function' ? getChannelStateById(ch) : null;
    if (window.resolvedNames && window.resolvedNames[ch] && window.resolvedNames[ch].name) {
        name = window.resolvedNames[ch].name;
    } else if (stateRef && stateRef.name) {
        name = stateRef.name;
    }
    const label = typeof getChannelLabel === 'function' ? getChannelLabel(ch) : ('CH ' + (ch + 1));
    return name ? (label + ' (' + name + ')') : label;
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

/**
 * Despacha uma fila de comandos de controle via socket sequencialmente
 * com delay seguro (padrão: 20ms) para proteção do processador da 01V96.
 */
function dispatchThrottledCommands(commands, onComplete, intervalMs) {
    var delay = (typeof intervalMs === 'number') ? intervalMs : 20;
    if (!commands || commands.length === 0) {
        if (typeof onComplete === 'function') onComplete();
        return;
    }

    commands.forEach(function(cmd, index) {
        setTimeout(function() {
            if (cmd.type && cmd.channel !== undefined) {
                socket.emit('control', { type: cmd.type, channel: cmd.channel, value: cmd.value });
            }
            if (typeof cmd.onExecute === 'function') {
                cmd.onExecute();
            }
            if (index === commands.length - 1 && typeof onComplete === 'function') {
                onComplete();
            }
        }, index * delay);
    });
}

// --- HANDLER ESPECÍFICO: SENDS ON FADERS (MIX 1-8) ---

function copySendsOnFaders(auxIdx) {
    const channelsData = [];
    for (let i = 0; i < 32; i++) {
        const state = getChannelStateById(i);
        const level = (state && state['aux' + auxIdx] !== undefined) ? state['aux' + auxIdx] : 0;
        const on = (state && state['aux' + auxIdx + 'On'] !== undefined) ? !!state['aux' + auxIdx + 'On'] : false;
        channelsData.push({ ch: i, level, on });
    }

    const sourceName = getMixDisplayName(auxIdx);

    window.contextClipboard = {
        type: 'sends_on_faders',
        sourceId: auxIdx,
        sourceName: sourceName,
        expectedScreen: 'BARRAMENTO MIX / FONE',
        data: channelsData,
        validateTarget: function() {
            if (typeof technicianMixMode !== 'undefined' && technicianMixMode && activeMix >= 1 && activeMix <= 8) return true;
            if (activeConfigChannel !== null && activeConfigChannel >= 36 && activeConfigChannel <= 43 && activeConfigTab === 'aux') return true;
            return false;
        },
        pasteHandler: function(targetAuxIdx) { executePasteSendsOnFaders(targetAuxIdx); }
    };

    if (typeof OverlayInfo !== 'undefined') {
        OverlayInfo.show('copied', CLIPBOARD_MESSAGES.copied(sourceName));
    }
    window.updateCopyPasteUIState();
}

function executePasteSendsOnFaders(targetMix) {
    var sourceName = window.contextClipboard.sourceName;
    var targetName = getMixDisplayName(targetMix);

    ConfirmModal.show({
        title: 'Colar Mix / Fone',
        message: 'Deseja colar as definições da <b>' + sourceName + '</b> na <b>' + targetName + '</b>?<br><br><small style="color:#aaa;">Os 32 canais receberão os mesmos níveis e estados ON/OFF.</small>',
        type: 'primary',
        confirmText: 'SIM, COLAR',
        cancelText: 'CANCELAR'
    }).then(function(confirmed) {
        if (!confirmed) return;

        var items = window.contextClipboard.data;
        var commands = [];

        items.forEach(function(item) {
            var ch = item.ch;
            var state = getChannelStateById(ch);
            if (state) {
                state['aux' + targetMix] = item.level;
                state['aux' + targetMix + 'On'] = item.on;
            }

            commands.push({
                type: 'kInputAUX/kAUX' + targetMix + 'Level',
                channel: ch,
                value: item.level,
                onExecute: function() {
                    var fader = document.getElementById('aux_f_ch_' + ch);
                    var valDisplay = document.getElementById('aux_v_ch_' + ch);
                    if (fader) fader.value = item.level;
                    if (valDisplay) valDisplay.innerText = rawToDb(item.level);
                }
            });

            commands.push({
                type: 'kInputAUX/kAUX' + targetMix + 'On',
                channel: ch,
                value: item.on ? 1 : 0,
                onExecute: function() {
                    var btnOn = document.getElementById('aux_on_ch_' + ch);
                    if (btnOn) {
                        if (item.on) {
                            btnOn.classList.add('on-active');
                        } else {
                            btnOn.classList.remove('on-active');
                        }
                    }
                }
            });
        });

        dispatchThrottledCommands(commands, function() {
            if (typeof OverlayInfo !== 'undefined') {
                OverlayInfo.show('success', CLIPBOARD_MESSAGES.pasted(targetName));
            }
        }, 20);
    });
}

// --- HANDLER ESPECÍFICO: INPUT CHANNEL AUX SENDS (CH 0-31, 60-67) ---

function copyInputChannelAuxSends(ch) {
    const state = getChannelStateById(ch);
    if (!state) return;

    const channelsData = [];
    for (let i = 1; i <= 8; i++) {
        const currentVal = (state['aux' + i] !== undefined) ? state['aux' + i] : 0;
        const isOn = (state['aux' + i + 'On'] !== undefined) ? !!state['aux' + i + 'On'] : false;
        channelsData.push({ aux: i, level: currentVal, on: isOn });
    }

    const sourceName = getChannelDisplayName(ch);

    window.contextClipboard = {
        type: 'input_channel_aux_sends',
        sourceId: ch,
        sourceName: sourceName,
        expectedScreen: 'AUX DO CANAL',
        data: channelsData,
        validateTarget: function() {
            return (typeof activeConfigTab !== 'undefined' && activeConfigTab === 'aux' && typeof activeConfigChannel !== 'undefined' && activeConfigChannel !== null && ((activeConfigChannel >= 0 && activeConfigChannel <= 31) || (activeConfigChannel >= 60 && activeConfigChannel <= 67)));
        },
        pasteHandler: function(targetCh) { executePasteInputChannelAuxSends(targetCh); }
    };

    if (typeof OverlayInfo !== 'undefined') {
        OverlayInfo.show('copied', CLIPBOARD_MESSAGES.copied('AUX DE ' + sourceName));
    }
    window.updateCopyPasteUIState();
}

function executePasteInputChannelAuxSends(targetCh) {
    var sourceName = window.contextClipboard.sourceName;
    var targetName = getChannelDisplayName(targetCh);

    ConfirmModal.show({
        title: 'Colar Envios AUX do Canal',
        message: 'Deseja colar os envios AUX de <b>' + sourceName + '</b> em <b>' + targetName + '</b>?<br><br><small style="color:#aaa;">Os 8 envios AUX receberão os mesmos níveis e estados ON/OFF.</small>',
        type: 'primary',
        confirmText: 'SIM, COLAR',
        cancelText: 'CANCELAR'
    }).then(function(confirmed) {
        if (!confirmed) return;

        var items = window.contextClipboard.data;
        var commands = [];

        items.forEach(function(item) {
            var state = getChannelStateById(targetCh);
            if (state) {
                state['aux' + item.aux] = item.level;
                state['aux' + item.aux + 'On'] = item.on;
            }

            commands.push({
                type: 'kInputAUX/kAUX' + item.aux + 'Level',
                channel: targetCh,
                value: item.level,
                onExecute: function() {
                    if (activeConfigChannel === targetCh && activeConfigTab === 'aux') {
                        var fader = document.getElementById('aux_f_' + item.aux);
                        var valDisplay = document.getElementById('aux_v_' + item.aux);
                        if (fader) fader.value = item.level;
                        if (valDisplay) valDisplay.innerText = rawToDb(item.level);
                    }
                }
            });

            commands.push({
                type: 'kInputAUX/kAUX' + item.aux + 'On',
                channel: targetCh,
                value: item.on ? 1 : 0,
                onExecute: function() {
                    if (activeConfigChannel === targetCh && activeConfigTab === 'aux') {
                        var btnOn = document.getElementById('aux_on_' + item.aux);
                        if (btnOn) {
                            if (item.on) {
                                btnOn.classList.add('on-active');
                            } else {
                                btnOn.classList.remove('on-active');
                            }
                        }
                    }
                }
            });
        });

        dispatchThrottledCommands(commands, function() {
            if (typeof OverlayInfo !== 'undefined') {
                OverlayInfo.show('success', CLIPBOARD_MESSAGES.pasted('AUX DE ' + targetName));
            }
        }, 20);
    });
}

// --- HANDLER ESPECÍFICO: DYNAMICS (GATE & COMPRESSOR) ---

function copyDynamics(ch) {
    const state = getChannelStateById(ch);
    if (!state) return;

    const sourceName = getChannelDisplayName(ch);

    window.contextClipboard = {
        type: 'dynamics',
        sourceId: ch,
        sourceName: sourceName,
        expectedScreen: 'DYNAMICS (GATE / COMPRESSOR)',
        data: {
            gate: (state && state.gate) ? JSON.parse(JSON.stringify(state.gate)) : null,
            comp: (state && state.comp) ? JSON.parse(JSON.stringify(state.comp)) : null
        },
        validateTarget: function() {
            return (typeof activeConfigTab !== 'undefined' && activeConfigTab === 'dyn' && typeof activeConfigChannel !== 'undefined' && activeConfigChannel !== null && (activeConfigChannel <= 31 || (activeConfigChannel >= 36 && activeConfigChannel <= 52)));
        },
        pasteHandler: function(targetCh) { executePasteDynamics(targetCh); }
    };

    if (typeof OverlayInfo !== 'undefined') {
        OverlayInfo.show('copied', CLIPBOARD_MESSAGES.copied('DYNAMICS DE ' + sourceName));
    }
    window.updateCopyPasteUIState();
}

function executePasteDynamics(targetCh) {
    var sourceName = window.contextClipboard.sourceName;
    var targetName = getChannelDisplayName(targetCh);

    ConfirmModal.show({
        title: 'Colar Definições de Dinâmica',
        message: 'Deseja colar as definições de Dinâmica de <b>' + sourceName + '</b> em <b>' + targetName + '</b>?<br><br><small style="color:#aaa;">Os parâmetros de Gate e Compressor serão aplicados.</small>',
        type: 'primary',
        confirmText: 'SIM, COLAR',
        cancelText: 'CANCELAR'
    }).then(function(confirmed) {
        if (!confirmed) return;

        var state = getChannelStateById(targetCh);
        var commands = [];

        // Gate (apenas canais de entrada 0..31)
        if (targetCh <= 31 && window.contextClipboard.data.gate) {
            state.gate = JSON.parse(JSON.stringify(window.contextClipboard.data.gate));
            commands.push({ type: 'kInputGate/kGateOn', channel: targetCh, value: state.gate.on ? 1 : 0 });
            commands.push({ type: 'kInputGate/kGateThreshold', channel: targetCh, value: state.gate.thresh });
            commands.push({ type: 'kInputGate/kGateRange', channel: targetCh, value: state.gate.range });
            commands.push({ type: 'kInputGate/kGateAttack', channel: targetCh, value: state.gate.attack });
            commands.push({ type: 'kInputGate/kGateHold', channel: targetCh, value: state.gate.hold });
            commands.push({ type: 'kInputGate/kGateDecay', channel: targetCh, value: state.gate.decay });
        }

        // Compressor
        if (window.contextClipboard.data.comp) {
            state.comp = JSON.parse(JSON.stringify(window.contextClipboard.data.comp));
            var prefix = getChannelParamPrefix(targetCh);
            commands.push({ type: prefix + 'Comp/kCompOn', channel: targetCh, value: state.comp.on ? 1 : 0 });
            commands.push({ type: prefix + 'Comp/kCompThreshold', channel: targetCh, value: state.comp.thresh });
            commands.push({ type: prefix + 'Comp/kCompRatio', channel: targetCh, value: state.comp.ratio });
            commands.push({ type: prefix + 'Comp/kCompAttack', channel: targetCh, value: state.comp.attack });
            commands.push({ type: prefix + 'Comp/kCompRelease', channel: targetCh, value: state.comp.release });
            commands.push({ type: prefix + 'Comp/kCompGain', channel: targetCh, value: state.comp.gain });
            commands.push({ type: prefix + 'Comp/kCompKnee', channel: targetCh, value: state.comp.knee });
        }

        var updateUI = function() {
            if (activeConfigChannel === targetCh && activeConfigTab === 'dyn') {
                if (targetCh <= 31 && state.gate) {
                    var gateOnBtn = document.getElementById('gateOn');
                    if (gateOnBtn) gateOnBtn.classList.toggle('active', !!state.gate.on);

                    var gateSliders = {
                        'gateThreshSl': state.gate.thresh,
                        'gateRangeSl': state.gate.range,
                        'gateAttackSl': state.gate.attack,
                        'gateHoldSl': state.gate.hold,
                        'gateDecaySl': state.gate.decay
                    };
                    Object.keys(gateSliders).forEach(function(id) {
                        var sl = document.getElementById(id);
                        if (sl) {
                            sl.value = gateSliders[id];
                            sl.dispatchEvent(new Event('input'));
                        }
                    });
                }

                if (state.comp) {
                    var compOnBtn = document.getElementById('compOn');
                    if (compOnBtn) compOnBtn.classList.toggle('active', !!state.comp.on);

                    var compSliders = {
                        'compThreshSl': state.comp.thresh,
                        'compRatioSl': state.comp.ratio,
                        'compAttackSl': state.comp.attack,
                        'compReleaseSl': state.comp.release,
                        'compGainSl': state.comp.gain,
                        'compKneeSl': state.comp.knee
                    };
                    Object.keys(compSliders).forEach(function(id) {
                        var sl = document.getElementById(id);
                        if (sl) {
                            sl.value = compSliders[id];
                            sl.dispatchEvent(new Event('input'));
                        }
                    });
                }
            }
        };

        dispatchThrottledCommands(commands, function() {
            updateUI();
            if (typeof OverlayInfo !== 'undefined') {
                OverlayInfo.show('success', CLIPBOARD_MESSAGES.pasted('DYNAMICS DE ' + targetName));
            }
        }, 20);
    });
}

// --- DESPACHANTES GLOBAIS ---

window.copyActiveContext = function() {
    if (typeof technicianMixMode !== 'undefined' && technicianMixMode && activeMix >= 1 && activeMix <= 8) {
        copySendsOnFaders(activeMix);
        return;
    }
    if (activeConfigChannel !== null && activeConfigChannel >= 36 && activeConfigChannel <= 43 && activeConfigTab === 'aux') {
        copySendsOnFaders(activeConfigChannel - 35);
        return;
    }
    if (activeConfigChannel !== null && ((activeConfigChannel >= 0 && activeConfigChannel <= 31) || (activeConfigChannel >= 60 && activeConfigChannel <= 67)) && activeConfigTab === 'aux') {
        copyInputChannelAuxSends(activeConfigChannel);
        return;
    }
    if (activeConfigChannel !== null && (activeConfigChannel <= 31 || (activeConfigChannel >= 36 && activeConfigChannel <= 52)) && activeConfigTab === 'dyn') {
        copyDynamics(activeConfigChannel);
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
        var isValid = window.contextClipboard.validateTarget();
        if (!isValid) {
            if (typeof OverlayInfo !== 'undefined') {
                OverlayInfo.show('error', CLIPBOARD_MESSAGES.incompatible(window.contextClipboard.sourceName, window.contextClipboard.expectedScreen));
            }
            return;
        }
    }

    if (typeof window.contextClipboard.pasteHandler === 'function') {
        var targetMix;
        if (window.contextClipboard.type === 'dynamics') {
            window.contextClipboard.pasteHandler(activeConfigChannel);
        } else if (window.contextClipboard.type === 'input_channel_aux_sends') {
            window.contextClipboard.pasteHandler(activeConfigChannel);
        } else if (typeof technicianMixMode !== 'undefined' && technicianMixMode) {
            targetMix = activeMix;
            window.contextClipboard.pasteHandler(targetMix);
        } else if (activeConfigChannel !== null && activeConfigChannel >= 36 && activeConfigChannel <= 43 && activeConfigTab === 'aux') {
            targetMix = activeConfigChannel - 35;
            window.contextClipboard.pasteHandler(targetMix);
        }
    }
};

window.updateCopyPasteUIState = function() {
    var isValid = window.contextClipboard && typeof window.contextClipboard.validateTarget === 'function' && window.contextClipboard.validateTarget();
    var pasteDockBtn = document.getElementById('dockBtnPasteMix');
    if (pasteDockBtn) {
        if (!isValid) {
            pasteDockBtn.classList.add('disabled');
            pasteDockBtn.classList.remove('active-paste-ready');
        } else {
            pasteDockBtn.classList.remove('disabled');
            pasteDockBtn.classList.add('active-paste-ready');
        }
    }
    var pasteMobileBtn = document.getElementById('mobileMenuBtnPaste');
    if (pasteMobileBtn) {
        if (!isValid) {
            pasteMobileBtn.classList.add('disabled');
            pasteMobileBtn.classList.remove('active-paste-ready');
        } else {
            pasteMobileBtn.classList.remove('disabled');
            pasteMobileBtn.classList.add('active-paste-ready');
        }
    }
};

// ============================================================
// Lógica Legada: Copiar e Colar EQ / Canal Inteiro
// ============================================================

window.clipboardMode = null; // 'eq' ou 'full'
window.eqClipboard = null; // Buffer para Copiar/Colar EQ
window.fullChannelClipboard = null; // Buffer para Copiar/Colar Canal Inteiro
window.pendingCopyChannel = null;

window.copyEQ = function(ch) {
    window.pendingCopyChannel = ch;

    ConfirmModal.show({
        title: 'Opções de Cópia',
        message: 'O que você deseja copiar deste canal?',
        type: 'info',
        buttons: [
            { label: 'COPIAR APENAS EQ', type: 'info', action: 'eq' },
            { label: 'COPIAR CANAL TODO', type: 'primary', action: 'full' },
            { label: 'CANCELAR', type: 'secondary', action: 'cancel' }
        ]
    }).then(function(result) {
        if (result === 'eq') {
            executeCopyEQOnly();
        } else if (result === 'full') {
            executeCopyFullChannel();
        }
    });
};

window.executeCopyEQOnly = function() {
    const ch = window.pendingCopyChannel;
    if (ch === null) return;

    const state = getChannelStateById(ch);
    const s = state ? state.eq : null;
    if (!s) return console.warn('Sem dados de EQ para o canal ' + (ch + 1));

    window.eqClipboard = JSON.parse(JSON.stringify(s));
    window.clipboardMode = 'eq';

    // Habilita o botão de Colar no header
    const b = document.getElementById('headerBtnPaste');
    if (b) {
        b.disabled = false;
        b.style.background = '#fff';
        b.style.color = '#000';
        b.style.opacity = '1';
    }
};

window.showCustomAlert = function(msg) {
    ConfirmModal.show({
        title: 'Aviso',
        message: msg,
        type: 'info',
        confirmText: 'OK',
        showCancel: false
    });
};

window.executeCopyFullChannel = function() {
    const ch = window.pendingCopyChannel;
    if (ch === null) return;

    const state = getChannelStateById(ch);
    if (!state) return;

    window.clipboardMode = 'full';
    window.fullChannelClipboard = JSON.parse(JSON.stringify(state));

    // Header flash
    const pasteBtn = document.getElementById('headerBtnPaste');
    if (pasteBtn) {
        pasteBtn.style.background = '#4caf50';
        pasteBtn.style.color = '#fff';
        pasteBtn.innerText = 'FULL CH COPIED!';
        setTimeout(function() {
            pasteBtn.style.background = '#333';
            pasteBtn.innerText = 'PASTE';
        }, 1500);
    }

    // Check if Insert Out is defined
    let hasInsertOut = false;
    if (window.globalOutPatches) {
        const targetSrcNormal = ch + 31;
        const targetSrcFx = ch + 13;

        for (let p = 0; p < 4; p++) {
            if (window.globalOutPatches.omni && window.globalOutPatches.omni[p] === targetSrcNormal) { hasInsertOut = true; break; }
        }
        if (!hasInsertOut) {
            for (let p = 0; p < 8; p++) {
                if (window.globalOutPatches.adat && window.globalOutPatches.adat[p] === targetSrcNormal) { hasInsertOut = true; break; }
            }
        }
        if (!hasInsertOut) {
            for (let p = 0; p < 16; p++) {
                if (window.globalOutPatches.slot && window.globalOutPatches.slot[p] === targetSrcNormal) { hasInsertOut = true; break; }
            }
        }
        if (!hasInsertOut) {
            for (let p = 0; p < 2; p++) {
                if (window.globalOutPatches['2tr'] && window.globalOutPatches['2tr'][p] === targetSrcNormal) { hasInsertOut = true; break; }
            }
        }
        if (!hasInsertOut) {
            for (let p = 0; p < 8; p++) {
                if (window.globalOutPatches.fx && window.globalOutPatches.fx[p] === targetSrcFx) { hasInsertOut = true; break; }
            }
        }
    }

    if (hasInsertOut) {
        showCustomAlert("Canal copiado!\n\nNota: O 'Insert Out' não foi copiado pois ele depende de um Output Patch físico e único na mesa.");
    }
};

window.showCustomConfirm = function(msg, onOk) {
    ConfirmModal.show({
        title: 'Confirmação de Cópia',
        message: msg,
        type: 'info',
        confirmText: 'SIM',
        cancelText: 'CANCELAR'
    }).then(function(ok) {
        if (ok) onOk();
    });
};

window.pasteClipboard = function(ch) {
    if (!window.clipboardMode) return;

    let msg = 'Deseja colar as definições para o Canal ' + (ch + 1) + '?';
    if (window.clipboardMode === 'eq') msg = 'Deseja colar apenas o EQ para o Canal ' + (ch + 1) + '?';
    if (window.clipboardMode === 'full') msg = 'Deseja colar TODOS OS PARÂMETROS para o Canal ' + (ch + 1) + '?';

    showCustomConfirm(msg, function() {
        if (window.clipboardMode === 'eq') {
            pasteEQLogic(ch);
        } else if (window.clipboardMode === 'full') {
            pasteFullChannelLogic(ch);
        }
    });
};

function pasteEQLogic(ch) {
    const prefix = getChannelParamPrefix(ch);
    const bMap = [
        { key: 'low', label: 'Low' },
        { key: 'lowmid', label: 'LowMid' },
        { key: 'himid', label: 'HiMid' },
        { key: 'high', label: 'Hi' }
    ];

    bMap.forEach(function(b) {
        const data = window.eqClipboard[b.key];
        if (!data) return;

        if (data.f !== undefined) socket.emit('control', { type: prefix + 'EQ/kEQ' + b.label + 'F', channel: ch, value: sysexToVal(data.f) });
        if (data.g !== undefined) socket.emit('control', { type: prefix + 'EQ/kEQ' + b.label + 'G', channel: ch, value: sysexToVal(data.g) });
        if (data.q !== undefined) socket.emit('control', { type: prefix + 'EQ/kEQ' + b.label + 'Q', channel: ch, value: sysexToVal(data.q) });

        if (b.key === 'low' && data.hpfOn !== undefined) {
            setTimeout(function() {
                socket.emit('control', { type: prefix + 'EQ/kEQHPFOn', channel: ch, value: sysexToVal(data.hpfOn) });
            }, 90);
        }
        if (b.key === 'high' && data.lpfOn !== undefined) {
            setTimeout(function() {
                socket.emit('control', { type: prefix + 'EQ/kEQLPFOn', channel: ch, value: sysexToVal(data.lpfOn) });
            }, 90);
        }
    });

    if (window.eqClipboard.mode !== undefined) {
        socket.emit('control', { type: prefix + 'EQ/kEQMode', channel: ch, value: sysexToVal(window.eqClipboard.mode) });
    }

    if (window.eqClipboard.on !== undefined) {
        socket.emit('control', { type: prefix + 'EQ/kEQOn', channel: ch, value: (window.eqClipboard.on === 1 || window.eqClipboard.on === true) ? 1 : 0 });
    }
}

function pasteFullChannelLogic(ch) {
    const data = window.fullChannelClipboard;
    if (!data) return;

    const prefix = getChannelParamPrefix(ch);

    // Fader
    if (data.value !== undefined) socket.emit('control', { type: prefix + 'Fader/kFader', channel: ch, value: sysexToVal(data.value) });
    // Pan
    if (data.pan !== undefined) socket.emit('control', { type: 'kPan', channel: ch, value: sysexToVal(data.pan) });
    // Att
    if (data.att !== undefined) socket.emit('control', { type: prefix + 'Attenuator/kAtt', channel: ch, value: sysexToVal(data.att) });
    // Phase
    if (data.phase !== undefined) socket.emit('control', { type: 'kInputPhase/kPhase', channel: ch, value: (data.phase === 1 || data.phase === true) ? 1 : 0 });

    // Patch
    if (data.patch !== undefined) socket.emit('control', { type: 'kChannelInput/kChannelIn', channel: ch, value: sysexToVal(data.patch) });

    // Stereo
    if (data.stereo !== undefined) socket.emit('control', { type: prefix + 'Bus/kStereo', channel: ch, value: (data.stereo === 1 || data.stereo === true) ? 1 : 0 });

    // Buses
    if (data.buses && Array.isArray(data.buses)) {
        data.buses.forEach(function(busVal, idx) {
            const bOn = (busVal === 1 || busVal === true) ? 1 : 0;
            socket.emit('control', { type: prefix + 'Bus/kBus' + (idx + 1), channel: ch, value: bOn });
        });
    }

    // Auxiliares (1 a 8)
    for (let i = 1; i <= 8; i++) {
        if (data['aux' + i] !== undefined) {
            socket.emit('control', { type: prefix + 'AUX/kAUX' + i + 'Level', channel: ch, value: sysexToVal(data['aux' + i]) });
        }
        if (data['aux' + i + 'On'] !== undefined) {
            const auxOn = (data['aux' + i + 'On'] === 1 || data['aux' + i + 'On'] === true) ? 1 : 0;
            socket.emit('control', { type: prefix + 'AUX/kAUX' + i + 'On', channel: ch, value: auxOn });
        }
    }

    // Insert
    if (data.insert) {
        if (data.insert.on !== undefined) socket.emit('control', { type: 'kInputInsert/kInsertOn', channel: ch, value: (data.insert.on === 1 || data.insert.on === true) ? 1 : 0 });
        if (data.insert.position !== undefined) socket.emit('control', { type: 'kInputInsert/kInsertLocInsert', channel: ch, value: sysexToVal(data.insert.position) });
        if (data.insert.patch_in !== undefined) socket.emit('control', { type: 'kChannelInsertIn/kInsertIn', channel: ch, value: sysexToVal(data.insert.patch_in) });
    }

    // Gate
    if (data.gate) {
        if (data.gate.on !== undefined) socket.emit('control', { type: 'kInputGate/kGateOn', channel: ch, value: (data.gate.on === 1 || data.gate.on === true) ? 1 : 0 });
        if (data.gate.thresh !== undefined) socket.emit('control', { type: 'kInputGate/kGateThreshold', channel: ch, value: sysexToVal(data.gate.thresh) });
        if (data.gate.range !== undefined) socket.emit('control', { type: 'kInputGate/kGateRange', channel: ch, value: sysexToVal(data.gate.range) });
        if (data.gate.attack !== undefined) socket.emit('control', { type: 'kInputGate/kGateAttack', channel: ch, value: sysexToVal(data.gate.attack) });
        if (data.gate.hold !== undefined) socket.emit('control', { type: 'kInputGate/kGateHold', channel: ch, value: sysexToVal(data.gate.hold) });
        if (data.gate.decay !== undefined) socket.emit('control', { type: 'kInputGate/kGateDecay', channel: ch, value: sysexToVal(data.gate.decay) });
    }

    // Compressor
    if (data.comp) {
        if (data.comp.on !== undefined) socket.emit('control', { type: prefix + 'Comp/kCompOn', channel: ch, value: (data.comp.on === 1 || data.comp.on === true) ? 1 : 0 });
        if (data.comp.thresh !== undefined) socket.emit('control', { type: prefix + 'Comp/kCompThreshold', channel: ch, value: sysexToVal(data.comp.thresh) });
        if (data.comp.ratio !== undefined) socket.emit('control', { type: prefix + 'Comp/kCompRatio', channel: ch, value: sysexToVal(data.comp.ratio) });
        if (data.comp.attack !== undefined) socket.emit('control', { type: prefix + 'Comp/kCompAttack', channel: ch, value: sysexToVal(data.comp.attack) });
        if (data.comp.release !== undefined) socket.emit('control', { type: prefix + 'Comp/kCompRelease', channel: ch, value: sysexToVal(data.comp.release) });
        if (data.comp.gain !== undefined) socket.emit('control', { type: prefix + 'Comp/kCompGain', channel: ch, value: sysexToVal(data.comp.gain) });
        if (data.comp.knee !== undefined) socket.emit('control', { type: prefix + 'Comp/kCompKnee', channel: ch, value: sysexToVal(data.comp.knee) });
    }

    // EQ
    if (data.eq) {
        window.eqClipboard = data.eq; // Compartilha a variável para reuso
        pasteEQLogic(ch);
    }
}
