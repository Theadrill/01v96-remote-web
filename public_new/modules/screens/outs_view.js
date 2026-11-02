/**
 * =========================================================================================
 * SCREEN CONTROLLER: Outs View (outs_view.js)
 * =========================================================================================
 * Arquitetura Frontend V2 - Camada de Controladores de Telas / Visões
 *
 * Responsabilidades:
 * - Renderização da Tela de Barramentos de Saída (MIX 1-8, BUS 1-8, ST IN 1-4 e Master Stereo).
 * - Utilização 100% modular da classe ChannelStrip com temas YAML (--strip-*).
 * - Suporte a canais pareados (PAIR), duplos VUs e Panpots estéreo.
 * - Sincronização reativa bidirecional com estado da mesa (mixesState, busesState, channelStates, masterState).
 * - Zero HTML inline e zero concatenação de templates legados.
 * =========================================================================================
 */

var OutsView = (function () {
    'use strict';

    var _strips = {};
    var _active = false;


    /**
     * Renderiza a visão completa de Barramentos de Saída
     */
    function render() {
        var fadersContainer = document.getElementById('faders-container');
        var masterContainer = document.getElementById('master-container');
        if (!fadersContainer) return false;

        _strips = {};
        _active = true;
        fadersContainer.innerHTML = '';
        if (masterContainer) masterContainer.innerHTML = '';

        var isDesktop = typeof layoutMode !== 'undefined' ? (layoutMode === 'desktop') : true;
        var layout = isDesktop ? 'desktop' : 'mobile';

        fadersContainer.classList.add('outs-view-active');

        // 1. Barramentos MIX 1-8 (Masters de Envio)
        for (var m = 0; m < 8; m++) {
            var mState = (typeof mixesState !== 'undefined' && mixesState[m]) ? mixesState[m] : { value: 0, on: false, solo: false, paired: false };
            var isMPaired = !!mState.paired;

            if (isMPaired && (m % 2 !== 0)) continue;

            var mGlobalId = 36 + m;
            var mVal = mState.value || 0;
            var mDb = typeof rawToDb === 'function' ? rawToDb(mVal, !isDesktop, false) : `${mVal}`;
            var mLocked = typeof ChannelLock !== 'undefined' && typeof ChannelLock.isLocked === 'function' ? ChannelLock.isLocked(mGlobalId) : false;

            var mStrip = new ChannelStrip({
                id: `m${m}`,
                evtCh: mGlobalId,
                type: isMPaired ? 'mix_paired' : 'mix',
                layout: layout,
                faderValue: mVal,
                dbValue: mDb,
                onState: !!mState.on,
                soloState: !!mState.solo,
                isLocked: mLocked,
                isPaired: isMPaired,
                partnerId: isMPaired ? (mGlobalId + 1) : null,
                hasPan: false,
                callbacks: {
                    fader_change: (function (mixIdx, gId) {
                        return function (data) {
                            if (typeof mixesState !== 'undefined' && mixesState[mixIdx]) {
                                mixesState[mixIdx].value = data.value;
                            }
                            if (typeof commitFaderChange === 'function') {
                                commitFaderChange(gId, data.value);
                            }
                        };
                    })(m, mGlobalId),
                    on_toggle: (function (gId) {
                        return function (data) {
                            if (typeof toggleState === 'function') {
                                toggleState('kAUXChannelOn/kChannelOn', gId);
                            }
                        };
                    })(mGlobalId),
                    solo_toggle: (function (mixIdx, gId) {
                        return function (data) {
                            var s = typeof mixesState !== 'undefined' ? mixesState[mixIdx] : null;
                            var newVal = data.state !== undefined ? data.state : (s ? !s.solo : true);
                            if (s) s.solo = newVal;
                            if (typeof socket !== 'undefined') {
                                socket.emit('control', { type: 'kSetupSoloChOn/kSoloChOn', channel: 40 + mixIdx, value: newVal ? 1 : 0 });
                            }
                        };
                    })(m, mGlobalId),
                    nudge: (function (mixIdx, gId) {
                        return function (data) {
                            if (typeof nudgeFader === 'function') {
                                nudgeFader(gId, data.direction || (data.dir === 'plus' ? 1 : -1));
                            }
                        };
                    })(m, mGlobalId),
                    config_click: (function (gId) {
                        return function () {
                            if (typeof openChannelConfig === 'function') {
                                openChannelConfig(null, gId);
                            }
                        };
                    })(mGlobalId),
                    header_click: (function (gId) {
                        return function () {
                            if (typeof openChannelConfig === 'function') {
                                openChannelConfig(null, gId);
                            }
                        };
                    })(mGlobalId),
                    name_click: (function (gId) {
                        return function () {
                            if (typeof openChannelConfig === 'function') {
                                openChannelConfig(null, gId);
                            }
                        };
                    })(mGlobalId),
                    lock_click: (function (gId) {
                        return function () {
                            if (typeof ChannelLock !== 'undefined' && typeof ChannelLock.toggleLock === 'function') {
                                ChannelLock.toggleLock(gId);
                            }
                        };
                    })(mGlobalId)
                }
            });

            _strips[`m${m}`] = mStrip;
            _strips[mGlobalId] = mStrip;
            fadersContainer.appendChild(mStrip.render());
        }

        // 2. Barramentos BUS 1-8
        for (var b = 0; b < 8; b++) {
            var bState = (typeof busesState !== 'undefined' && busesState[b]) ? busesState[b] : { value: 0, on: false, solo: false, paired: false };
            var isBPaired = !!bState.paired;

            if (isBPaired && (b % 2 !== 0)) continue;

            var bGlobalId = 44 + b;
            var bVal = bState.value || 0;
            var bDb = typeof rawToDb === 'function' ? rawToDb(bVal, !isDesktop, false) : `${bVal}`;
            var bLocked = typeof ChannelLock !== 'undefined' && typeof ChannelLock.isLocked === 'function' ? ChannelLock.isLocked(bGlobalId) : false;

            var bStrip = new ChannelStrip({
                id: `b${b}`,
                evtCh: bGlobalId,
                type: isBPaired ? 'bus_paired' : 'bus',
                layout: layout,
                faderValue: bVal,
                dbValue: bDb,
                onState: !!bState.on,
                soloState: !!bState.solo,
                isLocked: bLocked,
                isPaired: isBPaired,
                partnerId: isBPaired ? (bGlobalId + 1) : null,
                hasPan: true,
                panL: bState.pan !== undefined ? bState.pan : 0,
                panR: isBPaired && busesState[b + 1] && busesState[b + 1].pan !== undefined ? busesState[b + 1].pan : null,
                callbacks: {
                    fader_change: (function (busIdx, gId) {
                        return function (data) {
                            if (typeof busesState !== 'undefined' && busesState[busIdx]) {
                                busesState[busIdx].value = data.value;
                            }
                            if (typeof commitFaderChange === 'function') {
                                commitFaderChange(gId, data.value);
                            }
                        };
                    })(b, bGlobalId),
                    on_toggle: (function (gId) {
                        return function (data) {
                            if (typeof toggleState === 'function') {
                                toggleState('kBusChannelOn/kChannelOn', gId);
                            }
                        };
                    })(bGlobalId),
                    solo_toggle: (function (busIdx, gId) {
                        return function (data) {
                            var s = typeof busesState !== 'undefined' ? busesState[busIdx] : null;
                            var newVal = data.state !== undefined ? data.state : (s ? !s.solo : true);
                            if (s) s.solo = newVal;
                            if (typeof socket !== 'undefined') {
                                socket.emit('control', { type: 'kSetupSoloChOn/kSoloChOn', channel: 48 + busIdx, value: newVal ? 1 : 0 });
                            }
                        };
                    })(b, bGlobalId),
                    nudge: (function (busIdx, gId) {
                        return function (data) {
                            if (typeof nudgeFader === 'function') {
                                nudgeFader(gId, data.direction || (data.dir === 'plus' ? 1 : -1));
                            }
                        };
                    })(b, bGlobalId),
                    pan_change: (function (busIdx, gId, isPairedBus) {
                        return function (data) {
                            if (typeof socket !== 'undefined' && socket.emit) {
                                if (data.side === 'L' || data.side === null) {
                                    socket.emit('setPan', { channel: gId, value: data.panL });
                                }
                                if (data.side === 'R' && isPairedBus) {
                                    socket.emit('setPan', { channel: gId + 1, value: data.panR });
                                }
                            }
                        };
                    })(b, bGlobalId, isBPaired),
                    config_click: (function (gId) {
                        return function () {
                            if (typeof openChannelConfig === 'function') {
                                openChannelConfig(null, gId);
                            }
                        };
                    })(bGlobalId),
                    header_click: (function (gId) {
                        return function () {
                            if (typeof openChannelConfig === 'function') {
                                openChannelConfig(null, gId);
                            }
                        };
                    })(bGlobalId),
                    name_click: (function (gId) {
                        return function () {
                            if (typeof openChannelConfig === 'function') {
                                openChannelConfig(null, gId);
                            }
                        };
                    })(bGlobalId),
                    lock_click: (function (gId) {
                        return function () {
                            if (typeof ChannelLock !== 'undefined' && typeof ChannelLock.toggleLock === 'function') {
                                ChannelLock.toggleLock(gId);
                            }
                        };
                    })(bGlobalId)
                }
            });

            _strips[`b${b}`] = bStrip;
            _strips[bGlobalId] = bStrip;
            fadersContainer.appendChild(bStrip.render());
        }

        // 3. Entradas Estéreo ST IN 1-4 (Canais 32-39, Globais 60-67)
        for (var sIdx = 0; sIdx < 4; sIdx++) {
            var stCh = 32 + (sIdx * 2);
            var stGlobalId = 60 + (sIdx * 2);
            var stStateL = (typeof channelStates !== 'undefined' && channelStates[stCh]) ? channelStates[stCh] : { value: 0, on: false, solo: false };
            var stStateR = (typeof channelStates !== 'undefined' && channelStates[stCh + 1]) ? channelStates[stCh + 1] : { value: 0, on: false, solo: false };

            var stVal = stStateL.value || 0;
            var stDb = typeof rawToDb === 'function' ? rawToDb(stVal, !isDesktop, false) : `${stVal}`;
            var stLocked = typeof ChannelLock !== 'undefined' && typeof ChannelLock.isLocked === 'function' ? ChannelLock.isLocked(stGlobalId) : false;

            var stStrip = new ChannelStrip({
                id: `st${sIdx}`,
                evtCh: stGlobalId,
                type: 'st_in',
                layout: layout,
                faderValue: stVal,
                dbValue: stDb,
                onState: !!stStateL.on,
                soloState: !!stStateL.solo,
                isLocked: stLocked,
                isPaired: true,
                partnerId: stGlobalId + 1,
                hasPan: true,
                panL: stStateL.pan !== undefined ? stStateL.pan : -32,
                panR: stStateR.pan !== undefined ? stStateR.pan : 32,
                callbacks: {
                    fader_change: (function (stId, gId) {
                        return function (data) {
                            if (typeof channelStates !== 'undefined' && channelStates[stId]) {
                                channelStates[stId].value = data.value;
                            }
                            if (typeof commitFaderChange === 'function') {
                                commitFaderChange(gId, data.value);
                            }
                        };
                    })(stCh, stGlobalId),
                    on_toggle: (function (gId) {
                        return function (data) {
                            if (typeof toggleState === 'function') {
                                toggleState('kInputChannelOn/kChannelOn', gId);
                            }
                        };
                    })(stGlobalId),
                    solo_toggle: (function (stId, gId) {
                        return function (data) {
                            var s = typeof channelStates !== 'undefined' ? channelStates[stId] : null;
                            var newVal = data.state !== undefined ? data.state : (s ? !s.solo : true);
                            if (s) s.solo = newVal;
                            if (typeof socket !== 'undefined') {
                                socket.emit('control', { type: 'kSetupSoloChOn/kSoloChOn', channel: gId, value: newVal ? 1 : 0 });
                            }
                        };
                    })(stCh, stGlobalId),
                    nudge: (function (stId, gId) {
                        return function (data) {
                            if (typeof nudgeFader === 'function') {
                                nudgeFader(gId, data.direction || (data.dir === 'plus' ? 1 : -1));
                            }
                        };
                    })(stCh, stGlobalId),
                    pan_change: (function (stId, gId) {
                        return function (data) {
                            if (typeof socket !== 'undefined' && socket.emit) {
                                if (data.side === 'L' || data.side === null) {
                                    socket.emit('setPan', { channel: gId, value: data.panL });
                                }
                                if (data.side === 'R') {
                                    socket.emit('setPan', { channel: gId + 1, value: data.panR });
                                }
                            }
                        };
                    })(stCh, stGlobalId),
                    config_click: (function (gId) {
                        return function () {
                            if (typeof openChannelConfig === 'function') {
                                openChannelConfig(null, gId);
                            }
                        };
                    })(stGlobalId),
                    header_click: (function (gId) {
                        return function () {
                            if (typeof openChannelConfig === 'function') {
                                openChannelConfig(null, gId);
                            }
                        };
                    })(stGlobalId),
                    name_click: (function (gId) {
                        return function () {
                            if (typeof openChannelConfig === 'function') {
                                openChannelConfig(null, gId);
                            }
                        };
                    })(stGlobalId),
                    lock_click: (function (gId) {
                        return function () {
                            if (typeof ChannelLock !== 'undefined' && typeof ChannelLock.toggleLock === 'function') {
                                ChannelLock.toggleLock(gId);
                            }
                        };
                    })(stGlobalId)
                }
            });

            _strips[`st${sIdx}`] = stStrip;
            _strips[stGlobalId] = stStrip;
            fadersContainer.appendChild(stStrip.render());
        }

        // 4. Master Stereo PA
        if (masterContainer) {
            var mStatePA = typeof masterState !== 'undefined' ? masterState : { value: 0, on: false, solo: false, pan: 0 };
            var masterVal = mStatePA.value || 0;
            var masterDb = typeof rawToDb === 'function' ? rawToDb(masterVal, !isDesktop, true) : `${masterVal}`;

            var masterStrip = new ChannelStrip({
                id: 'master',
                evtCh: 'master',
                type: 'master',
                isMaster: true,
                layout: layout,
                faderValue: masterVal,
                dbValue: masterDb,
                onState: !!mStatePA.on,
                soloState: false,
                isPaired: true,
                hasPan: true,
                panL: mStatePA.pan !== undefined ? mStatePA.pan : 0,
                patch: 'OMNI 1/2',
                callbacks: {
                    fader_change: function (data) {
                        if (typeof masterState !== 'undefined') masterState.value = data.value;
                        if (typeof commitFaderChange === 'function') {
                            commitFaderChange('master', data.value);
                        }
                    },
                    on_toggle: function () {
                        if (typeof confirmMasterOn === 'function') {
                            confirmMasterOn();
                        } else if (typeof toggleState === 'function') {
                            toggleState('kStereoChannelOn/kChannelOn', 'master');
                        }
                    },
                    pan_change: function (data) {
                        if (typeof socket !== 'undefined' && socket.emit) {
                            socket.emit('setPan', { channel: 'master', value: data.panL });
                        }
                    },
                    nudge: function (data) {
                        if (typeof nudgeFader === 'function') {
                            nudgeFader('master', data.direction || (data.dir === 'plus' ? 1 : -1));
                        }
                    },
                    solo_toggle: function () {
                        if (typeof clearAllSolos === 'function') {
                            clearAllSolos();
                        }
                    },
                    header_click: function () {
                        if (typeof openChannelConfig === 'function') {
                            openChannelConfig(null, 52);
                        }
                    },
                    name_click: function () {
                        if (typeof openChannelConfig === 'function') {
                            openChannelConfig(null, 52);
                        }
                    }
                }
            });

            _strips['master'] = masterStrip;
            _strips[52] = masterStrip;

            var masterEl = masterStrip.render();
            if (isDesktop && masterContainer) {
                masterContainer.appendChild(masterEl);
                masterContainer.style.cssText = '';
            } else {
                fadersContainer.appendChild(masterEl);
                if (masterContainer) {
                    masterContainer.innerHTML = '';
                    masterContainer.style.cssText = '';
                }
            }
        }

        if (typeof window.updateDesktopPatchBadges === 'function') {
            window.updateDesktopPatchBadges();
        }

        if (typeof resetFaderCache === 'function') {
            resetFaderCache();
        }

        return true;
    }

    /**
     * Atualização reativa de um canal/barramento em tempo real
     */
    function updateChannel(id, val, onState, soloState) {
        var strip = _strips[id];
        if (!strip) return;

        if (val !== undefined && val !== null) {
            strip.setFaderValue(val, undefined, true);
        }
        if (onState !== undefined && onState !== null) {
            strip.setOnState(!!onState);
        }
        if (soloState !== undefined && soloState !== null) {
            strip.setSoloState(!!soloState);
        }
    }

    /**
     * Atualização de Pan em tempo real
     */
    function updatePan(channel, panValue) {
        var strip = _strips[channel];
        if (strip) {
            if (strip.config.isPaired) {
                strip.setPanValue(panValue, 'L', false);
            } else {
                strip.setPanValue(panValue, null, false);
            }
            return;
        }
        if (typeof channel === 'number' && channel > 0) {
            var primaryStrip = _strips[channel - 1];
            if (primaryStrip && primaryStrip.config && primaryStrip.config.isPaired) {
                primaryStrip.setPanValue(panValue, 'R', false);
            }
        }
    }

    /**
     * Atualização do nome do barramento em tempo real
     */
    function updateName(id, name) {
        var strip = _strips[id];
        if (!strip) return;
        strip.setName(name);
    }

    function deactivate() {
        _active = false;
        _strips = {};
    }

    function isActive() {
        return _active;
    }

    return {
        render: render,
        updateChannel: updateChannel,
        updatePan: updatePan,
        updateName: updateName,
        deactivate: deactivate,
        isActive: isActive
    };
})();

window.OutsView = OutsView;
