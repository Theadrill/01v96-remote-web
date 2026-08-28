/**
 * =========================================================================================
 * SCREEN CONTROLLER: Aux Sends View (auxs_sends.js)
 * =========================================================================================
 * Arquitetura Frontend V2 - Camada de Controladores de Telas / Visões
 *
 * Responsabilidades:
 * - Renderização da Tela de Envios Auxiliares utilizando instâncias puras de ChannelStrip.
 * - Modo MIX (36-43): Visão dos 32 canais de entrada enviando para o Mix ativo (com suporte a PRE/POST e modo FIXED).
 * - Modo CANAL (0-31): Visão dos 8 barramentos AUX a partir do canal ativo.
 * - Integração com Volume Geral de Auxiliar / Macro Fader.
 * - Sincronização reativa bidirecional com estado da mesa (channelStates, mixesState, WebSocket/MIDI).
 * - Zero HTML inline e zero concatenação de templates legados.
 * =========================================================================================
 */

var AuxSendsView = (function () {
    'use strict';

    var _strips = {};
    var _activeChannel = null;

    /**
     * Obtém o texto formatado do patch para o canal/aux
     */
    function _getPatchText(ch, isMixMode, auxIdx) {
        if (isMixMode) {
            var state = typeof getChannelStateById === 'function' ? getChannelStateById(ch) : null;
            if (window.PatchRegistry) {
                return (state && state.paired && state.pairedWith !== null)
                    ? window.PatchRegistry.getPairedChannelInput(ch, state.pairedWith)
                    : window.PatchRegistry.getChannelInput(ch);
            }
            return state && state.paired ? `AD ${ch + 1} | AD ${ch + 2}` : `AD ${ch + 1}`;
        } else {
            if (window.PatchRegistry) {
                return window.PatchRegistry.getMixOutput(auxIdx - 1);
            }
            return `OMNI ${auxIdx}`;
        }
    }

    /**
     * Obtém o nome resolvido para o strip de envio
     */
    function _getResolvedName(id, isMixMode, auxIdx) {
        if (isMixMode) {
            if (window.resolvedNames && window.resolvedNames[id] && window.resolvedNames[id].name) {
                return window.resolvedNames[id].name;
            }
            var state = typeof getChannelStateById === 'function' ? getChannelStateById(id) : null;
            if (state && state.name && state.name.trim() !== '') {
                return state.name;
            }
            return `${id + 1}`;
        } else {
            var globalMixId = 35 + auxIdx;
            if (window.resolvedNames && window.resolvedNames[globalMixId] && window.resolvedNames[globalMixId].name) {
                return window.resolvedNames[globalMixId].name;
            }
            return `AUX ${auxIdx}`;
        }
    }

    /**
     * Renderiza a visualização de envios auxiliares no container
     * @param {number} ch Canal ativo (0-31 = Canal com 8 AUXs, 36-43 = MIX com 32 CHs)
     */
    function render(ch) {
        var body = document.querySelector('.ch-modal-body');
        if (!body) return;

        _activeChannel = ch;
        _strips = {};

        // 01V96: Buses (44-51) e Master (52) não possuem envios auxiliares
        if (ch >= 44) {
            body.innerHTML = `
                <div style="flex:1; display:flex; flex-direction:column; align-items:center; justify-content:center; color:#666; padding:20px; text-align:center;">
                    <div style="font-size:48px; margin-bottom:15px; opacity:0.3;"><i class="fas fa-project-diagram"></i></div>
                    <div style="font-size:14px; font-weight:bold; text-transform:uppercase;">Sends Não Disponíveis</div>
                </div>`;
            return;
        }

        var isDesktop = typeof layoutMode !== 'undefined' ? (layoutMode === 'desktop') : true;
        var layout = isDesktop ? 'desktop' : 'mobile';

        var sendsArea = document.createElement('div');
        sendsArea.className = 'aux-sends-area drag-scroll-area';
        sendsArea.style.cssText = 'display:flex; overflow-x:auto; flex:1; padding:0; gap:0; align-items:stretch;';

        // --- MODO 1: MIXER DO BARRAMENTO (36-43: Mostra os 32 canais enviando para ele) ---
        if (ch >= 36 && ch <= 43) {
            var auxIdx = ch - 35; // Mix 1 (36) -> Aux 1
            var mixIdx = ch - 36;
            var isMixFixed = (getMixBusMode(mixIdx) === 1);

            for (var i = 0; i < 32; i++) {
                var state = typeof getChannelStateById === 'function' ? getChannelStateById(i) : null;
                var isPaired = !!(state && state.paired);

                if (isPaired && (i % 2 !== 0)) continue;

                var currentVal = (state && state[`aux${auxIdx}`]) || 0;
                var isOn = (state && state[`aux${auxIdx}On`]) || false;
                var isPre = getAuxPre(i, auxIdx);
                var baseTitle = isPaired ? `${i + 1} + ${i + 2}` : `${i + 1}`;
                var chName = _getResolvedName(i, true, auxIdx);
                var patchText = _getPatchText(i, true, auxIdx);
                var colorBand = isPaired ? 'paired_green' : (i < 16 ? 'blue' : 'green');

                var strip = new ChannelStrip({
                    id: i,
                    evtCh: `${i}, ${auxIdx}`,
                    chNumber: baseTitle,
                    name: chName,
                    type: isPaired ? 'input_paired' : 'input',
                    colorBand: colorBand,
                    layout: layout,
                    faderValue: currentVal,
                    dbValue: typeof rawToDb === 'function' ? rawToDb(currentVal, !isDesktop, false) : `${currentVal}`,
                    onState: isOn,
                    prePost: isPre ? 'PRE' : 'POST',
                    hasPan: false,
                    patch: patchText,
                    isDisabled: isMixFixed,
                    isPaired: isPaired,
                    partnerId: isPaired ? (i + 1) : null,
                    customClass: `fader-group-aux-send${isMixFixed ? ' aux-mode-fixed' : ''}`,
                    callbacks: {
                        fader_change: (function (chIdx, aIdx) {
                            return function (data) {
                                var val = data.value;
                                var s = typeof getChannelStateById === 'function' ? getChannelStateById(chIdx) : null;
                                if (s) s[`aux${aIdx}`] = val;
                                if (typeof socket !== 'undefined') {
                                    socket.emit('control', { type: `kInputAUX/kAUX${aIdx}Level`, channel: chIdx, value: val });
                                }
                            };
                        })(i, auxIdx),
                        on_toggle: (function (chIdx, aIdx) {
                            return function (data) {
                                var s = typeof getChannelStateById === 'function' ? getChannelStateById(chIdx) : null;
                                if (!s) return;
                                var newVal = data.state !== undefined ? data.state : !s[`aux${aIdx}On`];
                                s[`aux${aIdx}On`] = newVal;
                                if (typeof socket !== 'undefined') {
                                    socket.emit('control', { type: `kInputAUX/kAUX${aIdx}On`, channel: chIdx, value: newVal ? 1 : 0 });
                                }
                            };
                        })(i, auxIdx),
                        pre_post_toggle: (function (chIdx, aIdx) {
                            return function (data) {
                                var isPreVal = data.mode === 'PRE';
                                setAuxPre(chIdx, aIdx, isPreVal);
                            };
                        })(i, auxIdx),
                        nudge: (function (chIdx, aIdx) {
                            return function (data) {
                                nudgeAuxLevel(chIdx, aIdx, data.direction || (data.dir === 'plus' ? 1 : -1));
                            };
                        })(i, auxIdx)
                    }
                });

                _strips[i] = strip;
                sendsArea.appendChild(strip.render());
            }
        }
        // --- MODO 2: ENVIOS DO CANAL (0-31: Mostra os 8 botões de Aux do canal) ---
        else {
            var channelState = typeof getChannelStateById === 'function' ? getChannelStateById(ch) : null;

            for (var a = 1; a <= 8; a++) {
                var currentValA = (channelState && channelState[`aux${a}`]) || 0;
                var isOnA = (channelState && channelState[`aux${a}On`]) || false;
                var isPreA = getAuxPre(ch, a);
                var baseTitleA = `AUX ${a}`;
                var auxNameA = _getResolvedName(a, false, a);
                var patchTextA = _getPatchText(ch, false, a);

                var stripA = new ChannelStrip({
                    id: a,
                    evtCh: `${ch}, ${a}`,
                    chNumber: baseTitleA,
                    name: auxNameA,
                    type: 'aux_send',
                    colorBand: 'amber',
                    layout: layout,
                    faderValue: currentValA,
                    dbValue: typeof rawToDb === 'function' ? rawToDb(currentValA, !isDesktop, false) : `${currentValA}`,
                    onState: isOnA,
                    prePost: isPreA ? 'PRE' : 'POST',
                    hasPan: false,
                    patch: patchTextA,
                    customClass: 'fader-group-aux',
                    callbacks: {
                        fader_change: (function (chIdx, aIdx) {
                            return function (data) {
                                var val = data.value;
                                var s = typeof getChannelStateById === 'function' ? getChannelStateById(chIdx) : null;
                                if (s) s[`aux${aIdx}`] = val;
                                if (typeof socket !== 'undefined') {
                                    socket.emit('control', { type: `kInputAUX/kAUX${aIdx}Level`, channel: chIdx, value: val });
                                }
                            };
                        })(ch, a),
                        on_toggle: (function (chIdx, aIdx) {
                            return function (data) {
                                var s = typeof getChannelStateById === 'function' ? getChannelStateById(chIdx) : null;
                                if (!s) return;
                                var newVal = data.state !== undefined ? data.state : !s[`aux${aIdx}On`];
                                s[`aux${aIdx}On`] = newVal;
                                if (typeof socket !== 'undefined') {
                                    socket.emit('control', { type: `kInputAUX/kAUX${aIdx}On`, channel: chIdx, value: newVal ? 1 : 0 });
                                }
                            };
                        })(ch, a),
                        pre_post_toggle: (function (chIdx, aIdx) {
                            return function (data) {
                                var isPreVal = data.mode === 'PRE';
                                setAuxPre(chIdx, aIdx, isPreVal);
                            };
                        })(ch, a),
                        nudge: (function (chIdx, aIdx) {
                            return function (data) {
                                nudgeAuxLevel(chIdx, aIdx, data.direction || (data.dir === 'plus' ? 1 : -1));
                            };
                        })(ch, a)
                    }
                });

                _strips[a] = stripA;
                sendsArea.appendChild(stripA.render());
            }
        }

        body.style.flexDirection = 'column';
        body.style.alignItems = 'stretch';
        body.innerHTML = '';
        body.appendChild(sendsArea);

        if (typeof window.updateDesktopPatchBadges === 'function') {
            window.updateDesktopPatchBadges();
        }

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
                vgSlotMix.innerHTML = getMixVolumeGeralHtml();
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
                vgSlotCh.innerHTML = getAuxVolumeGeralHtml();
                containerCh.insertBefore(vgSlotCh, contextCh);
            }
        }

        if (window.enableDragScroll) {
            window.enableDragScroll(sendsArea);
        }

        // Atualiza cache de medidores do WASM
        if (typeof resetFaderCache === 'function') {
            resetFaderCache();
        }
    }

    /**
     * Atualização em tempo real acionada por eventos de socket
     */
    function updateAuxFromSocket(ch, type, value) {
        var state = typeof getChannelStateById === 'function' ? getChannelStateById(ch) : null;
        if (!state) return;
        var match = type.match(/kInputAUX\/kAUX(\d+)(Level|On|Pre)/);
        if (!match) return;

        var auxIdx = parseInt(match[1], 10);
        var subType = match[2];

        if (subType === 'Level') {
            state[`aux${auxIdx}`] = value;
            var dbText = typeof rawToDb === 'function' ? rawToDb(value, false, false) : `${value}`;

            if (_activeChannel >= 36 && _activeChannel <= 43 && (_activeChannel - 35) === auxIdx) {
                var stripMix = _strips[ch];
                if (stripMix) stripMix.setFaderValue(value, dbText);
            } else if (_activeChannel === ch) {
                var stripCh = _strips[auxIdx];
                if (stripCh) stripCh.setFaderValue(value, dbText);
            }
        } else if (subType === 'On') {
            var isTrue = (value === 1 || value === true);
            state[`aux${auxIdx}On`] = isTrue;

            if (_activeChannel >= 36 && _activeChannel <= 43 && (_activeChannel - 35) === auxIdx) {
                var stripOnMix = _strips[ch];
                if (stripOnMix) stripOnMix.setOnState(isTrue);
            } else if (_activeChannel === ch) {
                var stripOnCh = _strips[auxIdx];
                if (stripOnCh) stripOnCh.setOnState(isTrue);
            }
        } else if (subType === 'Pre') {
            var isPreTrue = (value === 1 || value === true);
            state[`aux${auxIdx}Pre`] = isPreTrue;

            if (_activeChannel >= 36 && _activeChannel <= 43 && (_activeChannel - 35) === auxIdx) {
                var stripPreMix = _strips[ch];
                if (stripPreMix) stripPreMix.setPrePost(isPreTrue ? 'PRE' : 'POST');
            } else if (_activeChannel === ch) {
                var stripPreCh = _strips[auxIdx];
                if (stripPreCh) stripPreCh.setPrePost(isPreTrue ? 'PRE' : 'POST');
            }
        }
    }

    return {
        render: render,
        updateAuxFromSocket: updateAuxFromSocket
    };
})();

// --- Funções Globais e Handlers de Compatibilidade ---

function updateAuxManual(ch, auxIdx, val) {
    var state = typeof getChannelStateById === 'function' ? getChannelStateById(ch) : null;
    if (state) state[`aux${auxIdx}`] = val;
    if (typeof updateAuxFromSocket === 'function') {
        updateAuxFromSocket(ch, `kInputAUX/kAUX${auxIdx}Level`, val);
    }
}
window.updateAuxManual = updateAuxManual;

function renderAuxs(ch) {
    AuxSendsView.render(ch);
}

function updateAuxFromSocket(ch, type, value) {
    AuxSendsView.updateAuxFromSocket(ch, type, value);
}

function getAuxPre(ch, auxIdx) {
    const state = typeof getChannelStateById === 'function' ? getChannelStateById(ch) : null;
    if (!state) return true;
    return state[`aux${auxIdx}Pre`] !== undefined ? state[`aux${auxIdx}Pre`] : true;
}

function setAuxPre(ch, auxIdx, val) {
    const state = typeof getChannelStateById === 'function' ? getChannelStateById(ch) : null;
    if (!state) return;
    state[`aux${auxIdx}Pre`] = !!val;
    if (typeof socket !== 'undefined') {
        socket.emit('control', { type: `kInputAUX/kAUX${auxIdx}Pre`, channel: ch, value: val ? 1 : 0 });
    }
}

function toggleAuxPre(ch, auxIdx) {
    const current = getAuxPre(ch, auxIdx);
    setAuxPre(ch, auxIdx, !current);
    return !current;
}

function handleAuxPreToggle(e, ch, auxIdx) {
    if (e) e.stopPropagation();
    toggleAuxPre(ch, auxIdx);
}

function nudgeAuxLevel(ch, auxIdx, dir) {
    const state = typeof getChannelStateById === 'function' ? getChannelStateById(ch) : null;
    const currentRaw = (state && state[`aux${auxIdx}`]) || 0;
    const nRaw = typeof getSteppedRaw === 'function' ? getSteppedRaw(currentRaw, dir, 0.5) : Math.max(0, Math.min(1023, currentRaw + (dir * 10)));

    if (state) state[`aux${auxIdx}`] = nRaw;
    if (typeof socket !== 'undefined') {
        socket.emit('control', { type: `kInputAUX/kAUX${auxIdx}Level`, channel: ch, value: nRaw });
    }
}

function getMixBusMode(mixIdx) {
    if (typeof mixesState === 'undefined' || !mixesState[mixIdx]) return 1;
    return mixesState[mixIdx].auxTypeMode !== undefined ? mixesState[mixIdx].auxTypeMode : 1;
}

function setMixBusMode(mixIdx, val) {
    if (typeof mixesState !== 'undefined' && mixesState[mixIdx]) {
        mixesState[mixIdx].auxTypeMode = val;
    }
    if (typeof socket !== 'undefined') {
        socket.emit('control', { type: 'kAUXType/kAUXTypeIndex', channel: mixIdx, value: val });
    }
}

function getMixBusGlobal(mixIdx) {
    if (typeof mixesState === 'undefined' || !mixesState[mixIdx]) return 1;
    return mixesState[mixIdx].auxGlobal !== undefined ? mixesState[mixIdx].auxGlobal : 1;
}

function setMixBusGlobal(mixIdx, val) {
    if (typeof mixesState !== 'undefined' && mixesState[mixIdx]) {
        mixesState[mixIdx].auxGlobal = val;
    }
    if (typeof socket !== 'undefined') {
        socket.emit('control', { type: 'kAuxSendGlobal/kGlobal', channel: mixIdx, value: val });
    }
}

function getMixBusPrePoint(mixIdx) {
    if (typeof mixesState === 'undefined' || !mixesState[mixIdx]) return 0;
    return mixesState[mixIdx].auxSendPrePoint !== undefined ? mixesState[mixIdx].auxSendPrePoint : 0;
}

function setMixBusPrePoint(mixIdx, val) {
    if (typeof mixesState !== 'undefined' && mixesState[mixIdx]) {
        mixesState[mixIdx].auxSendPrePoint = val;
    }
    if (typeof socket !== 'undefined') {
        socket.emit('control', { type: 'kAuxSendPrePoint/kPrePoint', channel: mixIdx, value: val });
    }
}

function getMixBusGlobalLabel(mixIdx) {
    return getMixBusGlobal(mixIdx) === 1 ? 'PRE' : 'POST';
}

function getMixBusPrePointLabel(mixIdx) {
    return getMixBusPrePoint(mixIdx) === 1 ? 'PRE ON' : 'POST ON';
}

async function handleMixBusMode(mixIdx, val) {
    const currentVal = getMixBusMode(mixIdx);
    if (currentVal === val) return;

    const currentModeName = currentVal === 0 ? 'VARIABLE' : 'FIXED';
    const targetModeName = val === 0 ? 'VARIABLE' : 'FIXED';
    const mixName = `MIX ${mixIdx + 1}`;

    const confirmed = await ConfirmModal.show({
        title: 'ALTERAR MODO DO AUXILIAR',
        message: `Deseja realmente alterar o modo de <b>${mixName}</b> de <b>${currentModeName}</b> para <b>${targetModeName}</b>?<br><br><small style="color:#aaa;">No modo FIXED, o nível de envio dos canais é travado em valor nominal.</small>`,
        type: 'warning',
        confirmText: 'ALTERAR',
        cancelText: 'CANCELAR'
    });

    if (!confirmed) return;

    setMixBusMode(mixIdx, val);
    updateAuxConfigModalUI(mixIdx);
    const ch = 36 + mixIdx;
    if (typeof activeConfigChannel !== 'undefined' && activeConfigChannel === ch) {
        renderAuxs(ch);
    }
}

function handleMixBusGlobal(mixIdx, val) {
    setMixBusGlobal(mixIdx, val);
    const auxIdx = mixIdx + 1;
    const isPre = (val === 1);
    for (let i = 0; i < 32; i++) {
        setAuxPre(i, auxIdx, isPre);
    }
    const ch = 36 + mixIdx;
    if (typeof activeConfigChannel !== 'undefined' && activeConfigChannel === ch) {
        renderAuxs(ch);
    }
}

function handleMixBusPrePoint(mixIdx, val) {
    setMixBusPrePoint(mixIdx, val);
    const ch = 36 + mixIdx;
    if (typeof activeConfigChannel !== 'undefined' && activeConfigChannel === ch) {
        renderAuxs(ch);
    }
}

window.getAuxPre = getAuxPre;
window.setAuxPre = setAuxPre;
window.toggleAuxPre = toggleAuxPre;
window.getMixBusMode = getMixBusMode;
window.setMixBusMode = setMixBusMode;
window.getMixBusGlobal = getMixBusGlobal;
window.setMixBusGlobal = setMixBusGlobal;
window.getMixBusPrePoint = getMixBusPrePoint;
window.setMixBusPrePoint = setMixBusPrePoint;
window.handleAuxPreToggle = handleAuxPreToggle;
window.handleMixBusMode = handleMixBusMode;
window.handleMixBusGlobal = handleMixBusGlobal;
window.handleMixBusPrePoint = handleMixBusPrePoint;
window.getMixBusGlobalLabel = getMixBusGlobalLabel;
window.getMixBusPrePointLabel = getMixBusPrePointLabel;
window.renderAuxs = renderAuxs;
window.updateAuxFromSocket = updateAuxFromSocket;
window.AuxSendsView = AuxSendsView;

window.openAuxConfigModal = function(mixIdx) {
    window._auxConfigMixIdx = mixIdx;
    const modal = document.getElementById('auxConfigModal');
    if (!modal) return;
    const title = document.getElementById('auxConfigTitle');
    if (title) title.textContent = `CONFIGURAÇÃO - MIX ${mixIdx + 1}`;
    updateAuxConfigModalUI(mixIdx);
    modal.style.display = 'flex';
};

window.closeAuxConfigModal = function() {
    const modal = document.getElementById('auxConfigModal');
    if (modal) modal.style.display = 'none';
};

window.updateAuxConfigModalUI = function(mixIdx) {
    const mode = getMixBusMode(mixIdx);
    const globalVal = getMixBusGlobal(mixIdx);
    const prePoint = getMixBusPrePoint(mixIdx);

    const modeGroup = document.getElementById('auxConfigModeGroup');
    if (modeGroup) {
        modeGroup.querySelectorAll('.meter-config-pos-btn').forEach(function(btn) {
            const bm = btn.dataset.mode;
            if (bm === 'variable') btn.classList.toggle('active', mode === 0);
            else if (bm === 'fixed') btn.classList.toggle('active', mode === 1);
        });
    }

    const globalGroup = document.getElementById('auxConfigGlobalGroup');
    if (globalGroup) {
        globalGroup.querySelectorAll('.meter-config-pos-btn').forEach(function(btn) {
            const bm = btn.dataset.mode;
            if (bm === 'pre') btn.classList.toggle('active', globalVal === 1);
            else if (bm === 'post') btn.classList.toggle('active', globalVal === 0);
        });
    }

    const prePointGroup = document.getElementById('auxConfigPrePointGroup');
    if (prePointGroup) {
        prePointGroup.querySelectorAll('.meter-config-pos-btn').forEach(function(btn) {
            const bm = btn.dataset.mode;
            if (bm === 'pre_on') btn.classList.toggle('active', prePoint === 1);
            else if (bm === 'post_on') btn.classList.toggle('active', prePoint === 0);
        });
    }
};

window.updateAuxPositionBadgeUI = function(mixIdx) {
    var globalBadge = document.getElementById('aux-global-badge-' + mixIdx);
    var prepointBadge = document.getElementById('aux-prepoint-badge-' + mixIdx);
    if (globalBadge) globalBadge.textContent = getMixBusGlobalLabel(mixIdx);
    if (prepointBadge) prepointBadge.textContent = getMixBusPrePointLabel(mixIdx);
};

window.handleAllNominal = async function(mixIdx) {
    const mixName = `MIX ${mixIdx + 1}`;

    const confirmed = await ConfirmModal.show({
        title: 'RESETAR TODOS OS CANAIS PARA PRE',
        message: `Deseja realmente resetar <b>todos os 32 canais</b> de <b>${mixName}</b> para a posição <b>PRE</b>?<br><br><small style="color:#aaa;">Esta operação irá configurar:<br>• GLOBAL INSERT → PRE<br>• PRE-POINT → PRE ON<br>• Todos os envios individuais → PRE</small>`,
        type: 'warning',
        confirmText: 'RESETAR',
        cancelText: 'CANCELAR'
    });

    if (!confirmed) return;

    var auxIdx = mixIdx + 1;
    setMixBusGlobal(mixIdx, 1);
    setMixBusPrePoint(mixIdx, 1);
    for (var i = 0; i < 32; i++) {
        setAuxPre(i, auxIdx, true);
    }
    updateAuxConfigModalUI(mixIdx);
    updateAuxPositionBadgeUI(mixIdx);
    if (typeof activeConfigChannel !== 'undefined' && activeConfigChannel === (36 + mixIdx)) {
        renderAuxs(36 + mixIdx);
    }
};
