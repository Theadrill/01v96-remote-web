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

// --- HANDLER ESPECÍFICO: ROUTING / ETC ---

function copyRouting(ch) {
    var state = getChannelStateById(ch);
    if (ch >= 44 && ch <= 51) {
        state = (typeof busesState !== 'undefined' && busesState[ch - 44]) ? busesState[ch - 44] : state;
    }
    if (!state) return;

    var sourceName = getChannelDisplayName(ch);

    var hasInsertOut = false;
    if (window.globalOutPatches) {
        var targetSrcNormal = ch + 31;
        var targetSrcFx = ch + 13;

        for (var p = 0; p < 4; p++) {
            if (window.globalOutPatches.omni && window.globalOutPatches.omni[p] === targetSrcNormal) { hasInsertOut = true; break; }
        }
        if (!hasInsertOut) {
            for (var p = 0; p < 8; p++) {
                if (window.globalOutPatches.adat && window.globalOutPatches.adat[p] === targetSrcNormal) { hasInsertOut = true; break; }
            }
        }
        if (!hasInsertOut) {
            for (var p = 0; p < 16; p++) {
                if (window.globalOutPatches.slot && window.globalOutPatches.slot[p] === targetSrcNormal) { hasInsertOut = true; break; }
            }
        }
        if (!hasInsertOut) {
            for (var p = 0; p < 2; p++) {
                if (window.globalOutPatches['2tr'] && window.globalOutPatches['2tr'][p] === targetSrcNormal) { hasInsertOut = true; break; }
            }
        }
        if (!hasInsertOut) {
            for (var p = 0; p < 8; p++) {
                if (window.globalOutPatches.fx && window.globalOutPatches.fx[p] === targetSrcFx) { hasInsertOut = true; break; }
            }
        }
    }

    window.contextClipboard = {
        type: 'routing',
        sourceId: ch,
        sourceName: sourceName,
        expectedScreen: 'ROUTING / ETC',
        data: {
            patch: (state && state.patch !== undefined ? state.patch : null),
            pan: (state && state.pan !== undefined ? state.pan : 0),
            buses: (state && state.buses ? [...state.buses] : new Array(8).fill(false)),
            stereo: (state && state.stereo !== undefined ? !!state.stereo : true),
            insert: (state && state.insert ? JSON.parse(JSON.stringify(state.insert)) : null)
        },
        validateTarget: function() {
            return (typeof activeConfigTab !== 'undefined' && activeConfigTab === 'etc' && typeof activeConfigChannel !== 'undefined' && activeConfigChannel !== null && ((activeConfigChannel >= 0 && activeConfigChannel <= 31) || (activeConfigChannel >= 44 && activeConfigChannel <= 51) || (activeConfigChannel >= 60 && activeConfigChannel <= 67)));
        },
        pasteHandler: function(targetCh) { executePasteRouting(targetCh); }
    };

    if (hasInsertOut) {
        ConfirmModal.show({
            title: 'Aviso de Cópia',
            message: 'ROUTING de <b>' + sourceName + '</b> copiado!<br><br><small style="color:#aaa;">Nota: O <b>Insert Out</b> não foi copiado pois depende de uma porta de saída física única na mesa.</small>',
            type: 'info',
            confirmText: 'OK',
            showCancel: false
        });
    } else {
        if (typeof OverlayInfo !== 'undefined') {
            OverlayInfo.show('copied', CLIPBOARD_MESSAGES.copied('ROUTING DE ' + sourceName));
        }
    }
    window.updateCopyPasteUIState();
}

function executePasteRouting(targetCh) {
    var sourceName = window.contextClipboard.sourceName;
    var targetName = getChannelDisplayName(targetCh);

    ConfirmModal.show({
        title: 'Colar Definições de Routing',
        message: 'Deseja colar as definições de Routing de <b>' + sourceName + '</b> em <b>' + targetName + '</b>?<br><br><small style="color:#aaa;">Patch, Pan, Buses, Stereo e Configuração de Insert serão aplicados.</small>',
        type: 'primary',
        confirmText: 'SIM, COLAR',
        cancelText: 'CANCELAR'
    }).then(function(confirmed) {
        if (!confirmed) return;

        var data = window.contextClipboard.data;
        var commands = [];

        if ((targetCh >= 0 && targetCh <= 31) || (targetCh >= 60 && targetCh <= 67)) {
            var state = getChannelStateById(targetCh);

            if (data.patch !== null && data.patch !== undefined) {
                state.patch = data.patch;
                commands.push({ type: 'kChannelInput/kChannelIn', channel: targetCh, value: data.patch });
            }
            if (data.pan !== undefined) {
                state.pan = data.pan;
                commands.push({ type: 'kPan', channel: targetCh, value: data.pan });
            }
            if (data.buses) {
                state.buses = [...data.buses];
                for (var i = 0; i < 8; i++) {
                    commands.push({ type: 'kInputBus/kBus' + (i + 1), channel: targetCh, value: data.buses[i] ? 1 : 0 });
                }
            }
            if (data.stereo !== undefined) {
                state.stereo = !!data.stereo;
                commands.push({ type: 'kInputBus/kStereo', channel: targetCh, value: data.stereo ? 1 : 0 });
            }
            if (targetCh <= 31 && data.insert) {
                if (!state.insert) state.insert = {};
                state.insert.on = !!data.insert.on;
                state.insert.position = data.insert.position || 0;
                state.insert.patch_in = data.insert.patch_in || 0;
                commands.push({ type: 'kInputInsert/kInsertOn', channel: targetCh, value: data.insert.on ? 1 : 0 });
                commands.push({ type: 'kInputInsert/kInsertLocInsert', channel: targetCh, value: data.insert.position || 0 });
                commands.push({ type: 'kChannelInsertIn/kInsertIn', channel: targetCh, value: data.insert.patch_in || 0 });
            }
        }

        if (targetCh >= 44 && targetCh <= 51) {
            var busIdx = targetCh - 44;
            var busState = (typeof busesState !== 'undefined' && busesState[busIdx]) ? busesState[busIdx] : getChannelStateById(targetCh);

            if (data.stereo !== undefined) {
                busState.stereo = !!data.stereo;
                commands.push({ type: 'kBusToStereo/kBusToStereoOn', channel: targetCh, value: data.stereo ? 1 : 0 });
            }
            if (data.insert) {
                if (!busState.insert) busState.insert = {};
                busState.insert.on = !!data.insert.on;
                busState.insert.position = data.insert.position || 0;
                busState.insert.patch_in = data.insert.patch_in || 0;
                commands.push({ type: 'kBusInsert/kInsertOn', channel: targetCh, value: data.insert.on ? 1 : 0 });
                commands.push({ type: 'kBusInsert/kInsertLocInsert', channel: targetCh, value: data.insert.position || 0 });
                commands.push({ type: 'kChannelInsertIn/kInsertIn', channel: targetCh, value: data.insert.patch_in || 0 });
            }
        }

        dispatchThrottledCommands(commands, function() {
            if (activeConfigChannel === targetCh && activeConfigTab === 'etc' && typeof renderRouting === 'function') {
                renderRouting(targetCh);
            }
            if (typeof OverlayInfo !== 'undefined') {
                OverlayInfo.show('success', CLIPBOARD_MESSAGES.pasted('ROUTING DE ' + targetName));
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
    if (activeConfigChannel !== null && activeConfigTab === 'eq') {
        copyEQ(activeConfigChannel);
        return;
    }
    if (activeConfigChannel !== null && ((activeConfigChannel >= 0 && activeConfigChannel <= 31) || (activeConfigChannel >= 44 && activeConfigChannel <= 51) || (activeConfigChannel >= 60 && activeConfigChannel <= 67)) && activeConfigTab === 'etc') {
        copyRouting(activeConfigChannel);
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
        } else if (window.contextClipboard.type === 'routing') {
            window.contextClipboard.pasteHandler(activeConfigChannel);
        } else if (window.contextClipboard.type === 'input_channel_aux_sends') {
            window.contextClipboard.pasteHandler(activeConfigChannel);
        } else if (window.contextClipboard.type === 'eq' || window.contextClipboard.type === 'full_channel') {
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
};

// ============================================================
// Motor de Copiar/Colar Contextual — EQ e Canal Inteiro
// ============================================================

window.copyEQ = function(ch) {
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
            window.executeCopyEQOnly(ch);
        } else if (result === 'full') {
            window.executeCopyFullChannel(ch);
        }
    });
};

window.executeCopyEQOnly = function(ch) {
    var state = getChannelStateById(ch);
    if (!state) return;

    var sourceName = getChannelDisplayName(ch);

    window.contextClipboard = {
        type: 'eq',
        sourceId: ch,
        sourceName: sourceName,
        expectedScreen: 'EQUALIZADOR (EQ)',
        data: {
            mode: (state && state.eq ? state.eq.mode : 0),
            on: (state && state.eq ? !!state.eq.on : false),
            att: (state && state.att !== undefined ? state.att : 0),
            phase: (state && state.phase !== undefined ? !!state.phase : false),
            bands: (state && state.eq ? JSON.parse(JSON.stringify(state.eq)) : {})
        },
        validateTarget: function() {
            return (typeof activeConfigTab !== 'undefined' && activeConfigTab === 'eq' && typeof activeConfigChannel !== 'undefined' && activeConfigChannel !== null);
        },
        pasteHandler: function(targetCh) { executePasteEQOnly(targetCh); }
    };

    if (typeof OverlayInfo !== 'undefined') {
        OverlayInfo.show('copied', CLIPBOARD_MESSAGES.copied('EQ DE ' + sourceName));
    }
    window.updateCopyPasteUIState();
};

window.executeCopyFullChannel = function(ch) {
    var state = getChannelStateById(ch);
    if (!state) return;

    var sourceName = getChannelDisplayName(ch);

    window.contextClipboard = {
        type: 'full_channel',
        sourceId: ch,
        sourceName: sourceName,
        expectedScreen: 'EQUALIZADOR (EQ)',
        data: {
            value: state && state.value !== undefined ? state.value : 0,
            on: state && state.on !== undefined ? !!state.on : true,
            pan: state && state.pan !== undefined ? state.pan : 0,
            phase: state && state.phase !== undefined ? !!state.phase : false,
            att: state && state.att !== undefined ? state.att : 0,
            eq: state && state.eq ? JSON.parse(JSON.stringify(state.eq)) : {},
            gate: state && state.gate ? JSON.parse(JSON.stringify(state.gate)) : null,
            comp: state && state.comp ? JSON.parse(JSON.stringify(state.comp)) : null,
            auxSends: Array.from({ length: 8 }, function(_, i) {
                return {
                    aux: i + 1,
                    level: state && state['aux' + (i + 1)] !== undefined ? state['aux' + (i + 1)] : 0,
                    on: state && state['aux' + (i + 1) + 'On'] !== undefined ? !!state['aux' + (i + 1) + 'On'] : false
                };
            }),
            patch: state && state.patch !== undefined ? state.patch : null,
            buses: state && state.buses ? [...state.buses] : new Array(8).fill(false),
            stereo: state && state.stereo !== undefined ? !!state.stereo : true,
            insert: state && state.insert ? JSON.parse(JSON.stringify(state.insert)) : null
        },
        validateTarget: function() {
            return (typeof activeConfigTab !== 'undefined' && activeConfigTab === 'eq' && typeof activeConfigChannel !== 'undefined' && activeConfigChannel !== null && ((activeConfigChannel >= 0 && activeConfigChannel <= 31) || (activeConfigChannel >= 60 && activeConfigChannel <= 67)));
        },
        pasteHandler: function(targetCh) { executePasteFullChannel(targetCh); }
    };

    var hasInsertOut = false;
    if (window.globalOutPatches) {
        var targetSrcNormal = ch + 31;
        var targetSrcFx = ch + 13;

        for (var p = 0; p < 4; p++) {
            if (window.globalOutPatches.omni && window.globalOutPatches.omni[p] === targetSrcNormal) { hasInsertOut = true; break; }
        }
        if (!hasInsertOut) {
            for (var p = 0; p < 8; p++) {
                if (window.globalOutPatches.adat && window.globalOutPatches.adat[p] === targetSrcNormal) { hasInsertOut = true; break; }
            }
        }
        if (!hasInsertOut) {
            for (var p = 0; p < 16; p++) {
                if (window.globalOutPatches.slot && window.globalOutPatches.slot[p] === targetSrcNormal) { hasInsertOut = true; break; }
            }
        }
        if (!hasInsertOut) {
            for (var p = 0; p < 2; p++) {
                if (window.globalOutPatches['2tr'] && window.globalOutPatches['2tr'][p] === targetSrcNormal) { hasInsertOut = true; break; }
            }
        }
        if (!hasInsertOut) {
            for (var p = 0; p < 8; p++) {
                if (window.globalOutPatches.fx && window.globalOutPatches.fx[p] === targetSrcFx) { hasInsertOut = true; break; }
            }
        }
    }

    if (hasInsertOut) {
        ConfirmModal.show({
            title: 'Aviso de Cópia',
            message: 'CANAL <b>' + sourceName + '</b> copiado!<br><br><small style="color:#aaa;">Nota: O <b>Insert Out</b> não foi copiado pois depende de uma porta de saída física única na mesa.</small>',
            type: 'info',
            confirmText: 'OK',
            showCancel: false
        });
    } else {
        if (typeof OverlayInfo !== 'undefined') {
            OverlayInfo.show('copied', CLIPBOARD_MESSAGES.copied('CANAL ' + sourceName));
        }
    }
    window.updateCopyPasteUIState();
};

function executePasteEQOnly(targetCh) {
    var sourceName = window.contextClipboard.sourceName;
    var targetName = getChannelDisplayName(targetCh);

    ConfirmModal.show({
        title: 'Colar Equalizador',
        message: 'Deseja colar as definições de EQ de <b>' + sourceName + '</b> em <b>' + targetName + '</b>?',
        type: 'primary',
        confirmText: 'SIM, COLAR',
        cancelText: 'CANCELAR'
    }).then(function(confirmed) {
        if (!confirmed) return;

        var data = window.contextClipboard.data;
        var state = getChannelStateById(targetCh);
        var prefix = getChannelParamPrefix(targetCh);
        var commands = [];

        if (data.bands) {
            if (!state.eq) state.eq = {};
            var bMap = [{ key: 'low', label: 'Low' }, { key: 'lowmid', label: 'LowMid' }, { key: 'himid', label: 'HiMid' }, { key: 'high', label: 'Hi' }];
            bMap.forEach(function(b) {
                var bData = data.bands[b.key];
                if (!bData) return;
                if (!state.eq[b.key]) state.eq[b.key] = {};
                if (bData.f !== undefined) {
                    state.eq[b.key].f = bData.f;
                    commands.push({ type: prefix + 'EQ/kEQ' + b.label + 'F', channel: targetCh, value: bData.f });
                }
                if (bData.g !== undefined) {
                    state.eq[b.key].g = bData.g;
                    commands.push({ type: prefix + 'EQ/kEQ' + b.label + 'G', channel: targetCh, value: bData.g });
                }
                if (bData.q !== undefined) {
                    state.eq[b.key].q = bData.q;
                    commands.push({ type: prefix + 'EQ/kEQ' + b.label + 'Q', channel: targetCh, value: bData.q });
                }
                if (b.key === 'low' && bData.hpfOn !== undefined) {
                    state.eq.low.hpfOn = bData.hpfOn;
                    commands.push({ type: prefix + 'EQ/kEQHPFOn', channel: targetCh, value: bData.hpfOn ? 1 : 0 });
                }
                if (b.key === 'high' && bData.lpfOn !== undefined) {
                    state.eq.high.lpfOn = bData.lpfOn;
                    commands.push({ type: prefix + 'EQ/kEQLPFOn', channel: targetCh, value: bData.lpfOn ? 1 : 0 });
                }
            });
        }

        if (data.mode !== undefined) {
            state.eq.mode = data.mode;
            commands.push({ type: prefix + 'EQ/kEQMode', channel: targetCh, value: data.mode });
        }
        if (data.on !== undefined) {
            state.eq.on = !!data.on;
            commands.push({ type: prefix + 'EQ/kEQOn', channel: targetCh, value: data.on ? 1 : 0 });
        }
        if (data.att !== undefined) {
            state.att = data.att;
            commands.push({ type: prefix + 'Attenuator/kAtt', channel: targetCh, value: data.att });
        }
        if (data.phase !== undefined && targetCh <= 31) {
            state.phase = !!data.phase;
            commands.push({ type: 'kInputPhase/kPhase', channel: targetCh, value: data.phase ? 1 : 0 });
        }

        dispatchThrottledCommands(commands, function() {
            if (activeConfigChannel === targetCh && activeConfigTab === 'eq') {
                if (typeof drawEQ === 'function') drawEQ();
                var sideBtnOn = document.getElementById('sideBtnEQOn');
                if (sideBtnOn) sideBtnOn.classList.toggle('on-active', !!state.eq.on);
                var headerBtnOn = document.getElementById('headerBtnEQOn');
                if (headerBtnOn) headerBtnOn.classList.toggle('on-active', !!state.eq.on);
            }
            if (typeof OverlayInfo !== 'undefined') {
                OverlayInfo.show('success', CLIPBOARD_MESSAGES.pasted('EQ DE ' + targetName));
            }
        }, 20);
    });
}

function executePasteFullChannel(targetCh) {
    var sourceName = window.contextClipboard.sourceName;
    var targetName = getChannelDisplayName(targetCh);

    ConfirmModal.show({
        title: 'Colar Canal Inteiro',
        message: 'Deseja colar <b>TODOS OS PARÂMETROS</b> de <b>' + sourceName + '</b> em <b>' + targetName + '</b>?<br><br><small style="color:#aaa;">Fader, Pan, EQ, Dinâmica, Envios AUX e Routing serão sobrescritos.</small>',
        type: 'primary',
        confirmText: 'SIM, COLAR TUDO',
        cancelText: 'CANCELAR'
    }).then(function(confirmed) {
        if (!confirmed) return;

        var data = window.contextClipboard.data;
        var state = getChannelStateById(targetCh);
        var prefix = getChannelParamPrefix(targetCh);
        var commands = [];

        // Strip
        if (data.value !== undefined) {
            state.value = data.value;
            commands.push({ type: prefix + 'Fader/kFader', channel: targetCh, value: data.value });
        }
        if (data.pan !== undefined) {
            state.pan = data.pan;
            commands.push({ type: 'kPan', channel: targetCh, value: data.pan });
        }
        if (data.att !== undefined) {
            state.att = data.att;
            commands.push({ type: prefix + 'Attenuator/kAtt', channel: targetCh, value: data.att });
        }
        if (data.phase !== undefined) {
            state.phase = !!data.phase;
            commands.push({ type: 'kInputPhase/kPhase', channel: targetCh, value: data.phase ? 1 : 0 });
        }

        // Patch
        if (data.patch !== null && data.patch !== undefined) {
            state.patch = data.patch;
            commands.push({ type: 'kChannelInput/kChannelIn', channel: targetCh, value: data.patch });
        }

        // Stereo
        if (data.stereo !== undefined) {
            state.stereo = !!data.stereo;
            commands.push({ type: prefix + 'Bus/kStereo', channel: targetCh, value: data.stereo ? 1 : 0 });
        }

        // Buses
        if (data.buses) {
            state.buses = [...data.buses];
            for (var i = 0; i < 8; i++) {
                commands.push({ type: prefix + 'Bus/kBus' + (i + 1), channel: targetCh, value: data.buses[i] ? 1 : 0 });
            }
        }

        // AUX
        if (data.auxSends) {
            data.auxSends.forEach(function(s) {
                state['aux' + s.aux] = s.level;
                state['aux' + s.aux + 'On'] = s.on;
                commands.push({ type: prefix + 'AUX/kAUX' + s.aux + 'Level', channel: targetCh, value: s.level });
                commands.push({ type: prefix + 'AUX/kAUX' + s.aux + 'On', channel: targetCh, value: s.on ? 1 : 0 });
            });
        }

        // Insert (apenas canais de entrada 0..31)
        if (targetCh <= 31 && data.insert) {
            if (!state.insert) state.insert = {};
            state.insert.on = !!data.insert.on;
            state.insert.position = data.insert.position || 0;
            state.insert.patch_in = data.insert.patch_in || 0;
            commands.push({ type: 'kInputInsert/kInsertOn', channel: targetCh, value: data.insert.on ? 1 : 0 });
            commands.push({ type: 'kInputInsert/kInsertLocInsert', channel: targetCh, value: data.insert.position || 0 });
            commands.push({ type: 'kChannelInsertIn/kInsertIn', channel: targetCh, value: data.insert.patch_in || 0 });
        }

        // Gate (apenas canais de entrada 0..31)
        if (targetCh <= 31 && data.gate) {
            state.gate = JSON.parse(JSON.stringify(data.gate));
            commands.push({ type: 'kInputGate/kGateOn', channel: targetCh, value: data.gate.on ? 1 : 0 });
            commands.push({ type: 'kInputGate/kGateThreshold', channel: targetCh, value: data.gate.thresh });
            commands.push({ type: 'kInputGate/kGateRange', channel: targetCh, value: data.gate.range });
            commands.push({ type: 'kInputGate/kGateAttack', channel: targetCh, value: data.gate.attack });
            commands.push({ type: 'kInputGate/kGateHold', channel: targetCh, value: data.gate.hold });
            commands.push({ type: 'kInputGate/kGateDecay', channel: targetCh, value: data.gate.decay });
        }

        // Compressor
        if (data.comp) {
            state.comp = JSON.parse(JSON.stringify(data.comp));
            commands.push({ type: prefix + 'Comp/kCompOn', channel: targetCh, value: data.comp.on ? 1 : 0 });
            commands.push({ type: prefix + 'Comp/kCompThreshold', channel: targetCh, value: data.comp.thresh });
            commands.push({ type: prefix + 'Comp/kCompRatio', channel: targetCh, value: data.comp.ratio });
            commands.push({ type: prefix + 'Comp/kCompAttack', channel: targetCh, value: data.comp.attack });
            commands.push({ type: prefix + 'Comp/kCompRelease', channel: targetCh, value: data.comp.release });
            commands.push({ type: prefix + 'Comp/kCompGain', channel: targetCh, value: data.comp.gain });
            commands.push({ type: prefix + 'Comp/kCompKnee', channel: targetCh, value: data.comp.knee });
        }

        // EQ
        if (data.eq) {
            state.eq = JSON.parse(JSON.stringify(data.eq));
            var bMap = [{ key: 'low', label: 'Low' }, { key: 'lowmid', label: 'LowMid' }, { key: 'himid', label: 'HiMid' }, { key: 'high', label: 'Hi' }];
            bMap.forEach(function(b) {
                var bData = data.eq[b.key];
                if (!bData) return;
                if (bData.f !== undefined) commands.push({ type: prefix + 'EQ/kEQ' + b.label + 'F', channel: targetCh, value: bData.f });
                if (bData.g !== undefined) commands.push({ type: prefix + 'EQ/kEQ' + b.label + 'G', channel: targetCh, value: bData.g });
                if (bData.q !== undefined) commands.push({ type: prefix + 'EQ/kEQ' + b.label + 'Q', channel: targetCh, value: bData.q });
                if (b.key === 'low' && bData.hpfOn !== undefined) commands.push({ type: prefix + 'EQ/kEQHPFOn', channel: targetCh, value: bData.hpfOn ? 1 : 0 });
                if (b.key === 'high' && bData.lpfOn !== undefined) commands.push({ type: prefix + 'EQ/kEQLPFOn', channel: targetCh, value: bData.lpfOn ? 1 : 0 });
            });
            if (data.eq.mode !== undefined) commands.push({ type: prefix + 'EQ/kEQMode', channel: targetCh, value: data.eq.mode });
            if (data.eq.on !== undefined) commands.push({ type: prefix + 'EQ/kEQOn', channel: targetCh, value: data.eq.on ? 1 : 0 });
        }

        dispatchThrottledCommands(commands, function() {
            if (activeConfigChannel === targetCh && activeConfigTab === 'eq') {
                if (typeof drawEQ === 'function') drawEQ();
            }
            if (typeof OverlayInfo !== 'undefined') {
                OverlayInfo.show('success', CLIPBOARD_MESSAGES.pasted('CANAL ' + targetName));
            }
        }, 20);
    });
}

window.pasteClipboard = function(ch) {
    if (window.contextClipboard && typeof window.contextClipboard.pasteHandler === 'function' && (window.contextClipboard.type === 'eq' || window.contextClipboard.type === 'full_channel')) {
        window.contextClipboard.pasteHandler(ch);
    }
};
