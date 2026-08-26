/**
 * =========================================================================================
 * SCREEN CONTROLLER: Main View (main_view.js)
 * =========================================================================================
 * Arquitetura Frontend V2 - Camada de Controladores de Telas / Visões
 *
 * Responsabilidades:
 * - Renderização modular da Tela Principal do Mixer utilizando instâncias de ChannelStrip.
 * - Suporte a 32 canais de entrada (Mono e Pareados), ST IN, Macro Fader Técnico e Master PA.
 * - Sincronização reativa bidirecional com estado da mesa (channelStates, masterState, WebSocket/MIDI).
 * - Integração completa com Trava de Canal (ChannelLock), Medidores 60 FPS (WASM) e Sistema de Temas YAML.
 * - Zero HTML inline e zero concatenação de templates legados.
 * =========================================================================================
 */

var MainView = (function () {
    'use strict';

    var _strips = {};
    var _active = false;

    /**
     * Obtém o texto formatado do patch de entrada do canal
     * @param {number} ch Índice do canal (0-31)
     * @param {boolean} isPaired Se o canal está pareado
     * @returns {string}
     */
    function _getPatchText(ch, isPaired) {
        if (isPaired) {
            return `AD ${ch + 1} | AD ${ch + 2}`;
        }
        return `AD ${ch + 1}`;
    }

    /**
     * Obtém o nome resolvido do canal
     * @param {number} ch Índice do canal (0-31)
     * @returns {string}
     */
    function _getResolvedName(ch) {
        if (typeof window.resolvedNames !== 'undefined' && window.resolvedNames[ch] && window.resolvedNames[ch].name) {
            return window.resolvedNames[ch].name;
        }
        if (typeof channelStates !== 'undefined' && channelStates[ch] && channelStates[ch].name) {
            return channelStates[ch].name;
        }
        return `CH ${ch + 1}`;
    }

    /**
     * Renderiza a Tela Principal do Mixer no DOM
     * @returns {boolean} Sucesso da renderização
     */
    function render() {
        var fadersContainer = document.getElementById('faders-container');
        var masterContainer = document.getElementById('master-container');
        if (!fadersContainer) return false;

        // Limpa instâncias anteriores
        _strips = {};
        fadersContainer.innerHTML = '';
        if (masterContainer) masterContainer.innerHTML = '';

        var isDesktop = typeof layoutMode !== 'undefined' ? (layoutMode === 'desktop') : true;
        var layout = isDesktop ? 'desktop' : 'mobile';

        fadersContainer.classList.add('main-view-active');

        var visibleCount = 0;

        // 1. Renderiza os 32 canais de entrada
        var numChannels = typeof NUM_CHANNELS !== 'undefined' ? NUM_CHANNELS : 32;
        for (var i = 0; i < numChannels; i++) {
            if (typeof isValidChannelForLayer === 'function' && !isValidChannelForLayer(i)) {
                continue;
            }

            var state = (typeof channelStates !== 'undefined' && channelStates[i]) ? channelStates[i] : { value: 0, on: false, solo: false, paired: false };
            var isPaired = !!state.paired;

            // Se pareado, pula a renderização do canal par (segundo canal do par)
            if (isPaired && (i % 2 !== 0)) {
                continue;
            }

            // Separador mobile a cada bloco de 8 canais
            if (!isDesktop && visibleCount > 0 && (visibleCount % 8 === 0)) {
                var mobSep = document.createElement('div');
                mobSep.className = 'mob-group-separator';
                fadersContainer.appendChild(mobSep);
            }

            var chTitle = isPaired ? `${i + 1} + ${i + 2}` : `${i + 1}`;
            var chName = _getResolvedName(i);
            var chColorBand = isPaired ? 'paired_green' : (i < 16 ? 'blue' : 'green');
            var chVal = state.value || 0;
            var chDb = typeof rawToDb === 'function' ? rawToDb(chVal, !isDesktop, false) : `${chVal}`;
            var isLocked = typeof ChannelLock !== 'undefined' && typeof ChannelLock.isLocked === 'function' ? ChannelLock.isLocked(i) : false;
            var patchText = _getPatchText(i, isPaired);

            var stripConfig = {
                id: i,
                evtCh: i,
                chNumber: chTitle,
                name: chName,
                type: isPaired ? 'input_paired' : 'input',
                layout: layout,
                colorBand: chColorBand,
                faderValue: chVal,
                dbValue: chDb,
                onState: !!state.on,
                soloState: !!state.solo,
                isLocked: isLocked,
                isPaired: isPaired,
                partnerId: isPaired ? (i + 1) : null,
                panL: state.pan !== undefined ? state.pan : 0,
                panR: isPaired && channelStates[i + 1] && channelStates[i + 1].pan !== undefined ? channelStates[i + 1].pan : null,
                patch: patchText,
                callbacks: {
                    fader_change: (function (chIdx) {
                        return function (data) {
                            if (typeof commitFaderChange === 'function') {
                                commitFaderChange(chIdx, data.value);
                            }
                        };
                    })(i),
                    on_toggle: (function (chIdx) {
                        return function () {
                            if (typeof toggleState === 'function') {
                                toggleState('kInputChannelOn/kChannelOn', chIdx);
                            }
                        };
                    })(i),
                    solo_toggle: (function (chIdx) {
                        return function () {
                            if (typeof toggleState === 'function') {
                                toggleState('kSetupSoloChOn/kSoloChOn', chIdx);
                            }
                        };
                    })(i),
                    nudge: (function (chIdx) {
                        return function (data) {
                            if (typeof nudgeFader === 'function') {
                                nudgeFader(chIdx, data.direction);
                            }
                        };
                    })(i),
                    pan_reset: (function (chIdx) {
                        return function (data) {
                            if (typeof socket !== 'undefined' && socket.emit) {
                                var targetCh = (data && data.side === 'R') ? (chIdx + 1) : chIdx;
                                socket.emit('control', { type: 'kInputPan/kPan', channel: targetCh, value: 0 });
                            }
                        };
                    })(i),
                    lock_click: (function (chIdx) {
                        return function () {
                            if (typeof ChannelLock !== 'undefined' && typeof ChannelLock.toggleLock === 'function') {
                                ChannelLock.toggleLock(chIdx);
                            }
                        };
                    })(i),
                    header_click: (function (chIdx) {
                        return function () {
                            if (typeof openChannelConfig === 'function') {
                                openChannelConfig(null, chIdx);
                            }
                        };
                    })(i),
                    name_click: (function (chIdx) {
                        return function () {
                            if (typeof openChannelConfig === 'function') {
                                openChannelConfig(null, chIdx);
                            }
                        };
                    })(i)
                }
            };

            var strip = new ChannelStrip(stripConfig);
            var stripEl = strip.render();
            fadersContainer.appendChild(stripEl);
            _strips[i] = strip;
            visibleCount++;
        }

        // 2. Injeta Macro Fader Técnico entre os blocos (apenas na visão técnica)
        var macroSpacerLeft = document.createElement('div');
        macroSpacerLeft.className = 'main-macro-spacer';
        fadersContainer.appendChild(macroSpacerLeft);

        var macroConfig = {
            id: 'macro',
            evtCh: 'macro',
            chNumber: 'MACRO',
            name: 'MACRO FADER',
            type: 'macro',
            mode: 'macro',
            layout: layout,
            colorBand: 'macro_silver',
            callbacks: {
                macro_config_click: function () {
                    if (typeof window.openMacroConfig === 'function') {
                        window.openMacroConfig();
                    } else if (typeof openMacroConfigModal === 'function') {
                        openMacroConfigModal();
                    }
                },
                nudge: function (data) {
                    if (typeof handleMacroNudge === 'function') {
                        handleMacroNudge(data.direction, data.step);
                    }
                }
            }
        };

        var macroStrip = new ChannelStrip(macroConfig);
        var macroEl = macroStrip.render();
        fadersContainer.appendChild(macroEl);
        _strips['macro'] = macroStrip;

        var macroSpacerRight = document.createElement('div');
        macroSpacerRight.className = 'main-macro-spacer';
        fadersContainer.appendChild(macroSpacerRight);

        // 3. Renderiza o Master Stereo LR
        var mState = typeof masterState !== 'undefined' ? masterState : { value: 0, on: false, solo: false };
        var mVal = mState.value || 0;
        var mDb = typeof rawToDb === 'function' ? rawToDb(mVal, !isDesktop, true) : `${mVal}`;

        var masterConfig = {
            id: 'master',
            evtCh: 'master',
            chNumber: 'MASTER',
            name: 'ST',
            type: 'master',
            isMaster: true,
            layout: layout,
            colorBand: 'wine',
            faderValue: mVal,
            dbValue: mDb,
            onState: !!mState.on,
            soloState: !!mState.solo,
            callbacks: {
                fader_change: function (data) {
                    if (typeof commitFaderChange === 'function') {
                        commitFaderChange('master', data.value);
                    }
                },
                on_toggle: function () {
                    if (typeof confirmMasterOn === 'function') {
                        confirmMasterOn();
                    } else if (typeof toggleState === 'function') {
                        toggleState('kStereoOn/kChannelOn', 'master');
                    }
                },
                solo_toggle: function () {
                    if (typeof toggleState === 'function') {
                        toggleState('kSetupSoloChOn/kSoloChOn', 'master');
                    }
                },
                nudge: function (data) {
                    if (typeof nudgeFader === 'function') {
                        nudgeFader('master', data.direction);
                    }
                },
                meters_config_click: function () {
                    if (typeof openMeterConfigModal === 'function') {
                        openMeterConfigModal('master');
                    }
                }
            }
        };

        var masterStrip = new ChannelStrip(masterConfig);
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
        _strips['master'] = masterStrip;

        _active = true;

        // Atualiza cache de medidores WASM
        if (typeof resetFaderCache === 'function') {
            resetFaderCache();
        }

        return true;
    }

    /**
     * Atualiza o estado visual de um canal na Tela Principal
     * @param {number|string} ch Identificador do canal (0-31, 'master', 'st0', etc.)
     * @param {number} [val] Valor raw do fader (0-1023)
     * @param {boolean} [onState] Estado do botão ON
     * @param {boolean} [soloState] Estado do botão SOLO
     */
    function updateChannel(ch, val, onState, soloState) {
        var strip = _strips[ch];
        if (!strip) return;

        var isMaster = ch === 'master' || ch === 52;
        var isDesktop = typeof layoutMode !== 'undefined' ? (layoutMode === 'desktop') : true;

        if (val !== undefined && val !== null) {
            var dbText = typeof rawToDb === 'function' ? rawToDb(val, !isDesktop, isMaster) : `${val}`;
            strip.setFaderValue(val, dbText);
        }

        if (onState !== undefined && onState !== null) {
            strip.setOnState(!!onState);
        }

        if (soloState !== undefined && soloState !== null) {
            strip.setSoloState(!!soloState);
        }
    }

    /**
     * Atualiza indicador de Panpot do canal
     * @param {number} ch Índice do canal
     * @param {number} panL Valor do Pan L (-32 a +32)
     * @param {number} [panR] Valor do Pan R (-32 a +32) para canais pareados
     */
    function updatePan(ch, panL, panR) {
        var strip = _strips[ch];
        if (!strip) return;
        strip.setPanValue(panL, 'L');
        if (panR !== undefined && panR !== null) {
            strip.setPanValue(panR, 'R');
        }
    }

    /**
     * Atualiza o nome exibido no visor OLED do canal
     * @param {number} ch Índice do canal
     * @param {string} name Nome do canal
     */
    function updateName(ch, name) {
        var strip = _strips[ch];
        if (!strip) return;
        strip.setName(name);
    }

    /**
     * Atualiza o estado de bloqueio/cadeado do canal
     * @param {number} ch Índice do canal
     * @param {boolean} isLocked
     */
    function updateLock(ch, isLocked) {
        var strip = _strips[ch];
        if (!strip) return;
        strip.setLockState(isLocked);
    }

    /**
     * Atualiza o texto do patch no rodapé do canal
     * @param {number} ch Índice do canal
     * @param {string} patchText
     */
    function updatePatch(ch, patchText) {
        var strip = _strips[ch];
        if (!strip) return;
        strip.setPatchText(patchText);
    }

    /**
     * Retorna a instância do ChannelStrip para o canal
     * @param {number|string} ch
     * @returns {ChannelStrip|null}
     */
    function getStrip(ch) {
        return _strips[ch] || null;
    }

    /**
     * Retorna se a Tela Principal está atualmente ativa
     * @returns {boolean}
     */
    function isActive() {
        return _active;
    }

    /**
     * Desativa a Tela Principal
     */
    function deactivate() {
        _active = false;
        var fadersContainer = document.getElementById('faders-container');
        if (fadersContainer) {
            fadersContainer.classList.remove('main-view-active');
        }
    }

    return {
        render: render,
        updateChannel: updateChannel,
        updatePan: updatePan,
        updateName: updateName,
        updateLock: updateLock,
        updatePatch: updatePatch,
        getStrip: getStrip,
        isActive: isActive,
        deactivate: deactivate
    };
})();

// Expõe globalmente
window.MainView = MainView;
