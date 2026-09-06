/**
 * =========================================================================================
 * SCREEN CONTROLLER: Channel Setup Core (channel_setup_core.js)
 * =========================================================================================
 * Arquitetura Frontend V2 - Camada de Telas / Controladores de Setup
 *
 * Responsabilidade:
 * - Orquestrador do modal de configuração e edição do canal ativo.
 * - Shell do modal, cabeçalho de navegação (◀ Anterior / Próximo ▶) e fechamento (✖).
 * - Barra de abas de navegação ([EQ], [DYN], [AUX], [INSERTS], [ROUTING]).
 * - Mini-Fader contextual integrado à direita utilizando a classe ChannelStrip modular.
 * - Gestão de canais pareados, ST IN e barramentos de saída.
 * =========================================================================================
 */

var ChannelSetupCore = (function () {
    'use strict';

    var _activeChannel = null;
    var _activeTab = 'aux';
    var _previousChannel = null;
    var _miniStripInstance = null;

    /**
     * Retorna os metadados do canal (rótulo, nome, tipo e estado de pareamento)
     * @param {number} ch 
     */
    function getChannelMeta(ch) {
        var displayTitle = '' + (ch + 1);
        var customName = '';
        var isPaired = false;
        var isOut = false;
        var isMaster = false;
        var isStIn = false;

        var state = typeof getChannelStateById === 'function' ? getChannelStateById(ch) : null;
        if (window.resolvedNames && window.resolvedNames[ch] && window.resolvedNames[ch].name) {
            customName = window.resolvedNames[ch].name;
        } else if (state && state.name) {
            customName = state.name;
        }

        if (ch >= 0 && ch <= 31) {
            isPaired = !!(state && state.paired);
            displayTitle = isPaired ? ('CH ' + (ch + 1) + ' + ' + (ch + 2)) : ('CH ' + (ch + 1));
        } else if (ch >= 36 && ch <= 43) {
            isOut = true;
            var mixIdx = ch - 36;
            displayTitle = 'MIX ' + (mixIdx + 1);
        } else if (ch >= 44 && ch <= 51) {
            isOut = true;
            var busIdx = ch - 44;
            displayTitle = 'BUS ' + (busIdx + 1);
        } else if (ch === 52) {
            isMaster = true;
            displayTitle = 'MASTER STEREO';
        } else if (ch >= 60 && ch <= 67) {
            isStIn = true;
            var stIdx = (ch - 60) / 2;
            displayTitle = 'ST IN ' + (stIdx + 1);
        }

        return {
            ch: ch,
            displayTitle: displayTitle,
            customName: customName,
            isPaired: isPaired,
            isOut: isOut,
            isMaster: isMaster,
            isStIn: isStIn
        };
    }

    /**
     * Atualiza o cabeçalho e título do modal
     * @param {number} ch 
     */
    function updateHeader(ch) {
        var meta = getChannelMeta(ch);
        var titleEl = document.getElementById('chSideTitle');
        if (titleEl) {
            titleEl.innerText = meta.displayTitle + (meta.customName ? (' - ' + meta.customName) : '');
        }

        var headerTitle = document.getElementById('chSetupHeaderTitle');
        if (headerTitle) {
            headerTitle.innerText = meta.displayTitle + (meta.customName ? (' - ' + meta.customName) : '');
        }

        // Esconder aba DYN para canais ST IN (não possuem Dynamics na 01V96)
        var dynTabs = document.querySelectorAll('.dock-tab[data-tab="dyn"], .ch-setup-tab-btn[data-tab="dyn"]');
        dynTabs.forEach(function (tab) {
            tab.style.display = (ch >= 60 && ch <= 67) ? 'none' : '';
        });
    }

    /**
     * Renderiza o Mini-Fader contextual integrado utilizando o componente ChannelStrip
     * @param {number} ch 
     */
    function renderMiniFader(ch) {
        var container = document.getElementById('miniFaderContext');
        if (!container) return;

        // Limpeza de instância anterior
        if (_miniStripInstance && typeof _miniStripInstance.destroy === 'function') {
            _miniStripInstance.destroy();
            _miniStripInstance = null;
        }

        container.innerHTML = '';

        if (typeof ChannelStrip === 'function') {
            var isMaster = ch === 52;
            var isMix = (ch >= 36 && ch <= 43);
            var isBus = (ch >= 44 && ch <= 51);
            var isSt = (ch >= 60 && ch <= 67);
            var isInput = (ch >= 0 && ch <= 31);

            var chTitle = '' + (ch + 1);
            var chName = '';
            var chType = 'input';
            var chColorBand = 'blue';
            var chVal = 0;
            var isOn = false;
            var isSolo = false;
            var isPaired = false;
            var partnerId = null;
            var panL = 0;
            var panR = null;
            var patchText = '--';

            if (isInput) {
                var s = (typeof channelStates !== 'undefined' && channelStates[ch]) ? channelStates[ch] : {};
                isPaired = !!s.paired;
                partnerId = isPaired ? (ch + 1) : null;
                chTitle = isPaired ? ((ch + 1) + ' + ' + (ch + 2)) : ('' + (ch + 1));
                chName = (window.resolvedNames && window.resolvedNames[ch] && window.resolvedNames[ch].name) || s.name || ('CH ' + (ch + 1));
                chType = isPaired ? 'input_paired' : 'input';
                chColorBand = isPaired ? 'paired_green' : (ch < 16 ? 'blue' : 'green');
                chVal = s.value !== undefined ? s.value : (s.fader !== undefined ? s.fader : 0);
                isOn = !!s.on;
                isSolo = !!s.solo;
                panL = s.pan !== undefined ? s.pan : 0;
                if (isPaired && channelStates[ch + 1]) {
                    panR = channelStates[ch + 1].pan !== undefined ? channelStates[ch + 1].pan : null;
                }
                if (typeof _getPatchText === 'function') {
                    patchText = _getPatchText(ch, isPaired);
                }
            } else if (isMix) {
                var mIdx = ch - 36;
                var mData = (typeof mixesState !== 'undefined' && mixesState[mIdx]) ? mixesState[mIdx] : {};
                chTitle = 'MIX ' + (mIdx + 1);
                chName = (window.resolvedNames && window.resolvedNames[ch] && window.resolvedNames[ch].name) || mData.name || ('MIX ' + (mIdx + 1));
                chType = 'mix';
                chColorBand = 'amber';
                chVal = mData.value !== undefined ? mData.value : (mData.fader !== undefined ? mData.fader : 0);
                isOn = !!mData.on;
                isSolo = !!mData.solo;
                panL = 0;
            } else if (isBus) {
                var bIdx = ch - 44;
                var bData = (typeof busState !== 'undefined' && busState[bIdx]) ? busState[bIdx] : {};
                chTitle = 'BUS ' + (bIdx + 1);
                chName = (window.resolvedNames && window.resolvedNames[ch] && window.resolvedNames[ch].name) || bData.name || ('BUS ' + (bIdx + 1));
                chType = 'bus';
                chColorBand = 'cyan';
                chVal = bData.value !== undefined ? bData.value : (bData.fader !== undefined ? bData.fader : 0);
                isOn = !!bData.on;
                isSolo = !!bData.solo;
                panL = bData.pan !== undefined ? bData.pan : 0;
            } else if (isMaster) {
                var mState = (typeof masterState !== 'undefined') ? masterState : {};
                chTitle = 'MASTER';
                chName = 'ST';
                chType = 'master';
                chColorBand = 'wine';
                chVal = mState.value !== undefined ? mState.value : 0;
                isOn = !!mState.on;
                isSolo = !!mState.solo;
            } else if (isSt) {
                var stIdx = (ch - 60) / 2;
                var stData = (typeof stInState !== 'undefined' && stInState[stIdx]) ? stInState[stIdx] : {};
                chTitle = 'ST IN ' + (stIdx + 1);
                chName = (window.resolvedNames && window.resolvedNames[ch] && window.resolvedNames[ch].name) || stData.name || ('ST IN ' + (stIdx + 1));
                chType = 'stIn';
                chColorBand = 'blue';
                chVal = stData.value !== undefined ? stData.value : (stData.fader !== undefined ? stData.fader : 0);
                isOn = !!stData.on;
                isSolo = !!stData.solo;
                panL = stData.pan !== undefined ? stData.pan : 0;
            }

            var isDesktop = document.body.classList.contains('layout-desktop');
            var chDb = typeof rawToDb === 'function' ? rawToDb(chVal, !isDesktop, isMaster) : ('' + chVal);

            var stripConfig = {
                id: 'mini_' + ch,
                evtCh: ch,
                chNumber: chTitle,
                name: chName,
                type: chType,
                layout: isDesktop ? 'desktop' : 'mobile',
                colorBand: chColorBand,
                faderValue: chVal,
                dbValue: chDb,
                onState: isOn,
                soloState: isSolo,
                isPaired: isPaired,
                partnerId: partnerId,
                panL: panL,
                panR: panR,
                patch: patchText,
                callbacks: {
                    fader_change: function (data) {
                        if (typeof commitFaderChange === 'function') {
                            commitFaderChange(isMaster ? 'master' : ch, data.value);
                        } else if (typeof setFaderLevel === 'function') {
                            setFaderLevel(ch, data.value);
                        }
                    },
                    on_toggle: function () {
                        if (isMaster) {
                            if (typeof confirmMasterOn === 'function') confirmMasterOn();
                            else if (typeof toggleState === 'function') toggleState('kStereoOn/kChannelOn', 'master');
                        } else if (isInput) {
                            if (typeof toggleState === 'function') toggleState('kInputChannelOn/kChannelOn', ch);
                        } else if (isMix) {
                            var mIdx = ch - 36;
                            if (typeof toggleState === 'function') toggleState('kMixMasterOn/kChannelOn', mIdx);
                        } else if (isBus) {
                            var bIdx = ch - 44;
                            if (typeof toggleState === 'function') toggleState('kBusMasterOn/kChannelOn', bIdx);
                        } else if (isSt) {
                            var stIdx = (ch - 60) / 2;
                            if (typeof toggleState === 'function') toggleState('kStInOn/kChannelOn', stIdx);
                        }
                    },
                    solo_toggle: function () {
                        if (isMaster) {
                            if (typeof toggleState === 'function') toggleState('kSetupSoloChOn/kSoloChOn', 'master');
                        } else if (isInput) {
                            if (typeof toggleState === 'function') toggleState('kSetupSoloChOn/kSoloChOn', ch);
                        } else if (isMix) {
                            var mIdx = ch - 36;
                            if (typeof toggleState === 'function') toggleState('kSetupSoloChOn/kSoloChOn', 36 + mIdx);
                        } else if (isBus) {
                            var bIdx = ch - 44;
                            if (typeof toggleState === 'function') toggleState('kSetupSoloChOn/kSoloChOn', 44 + bIdx);
                        } else if (isSt) {
                            var stIdx = (ch - 60) / 2;
                            if (typeof toggleState === 'function') toggleState('kSetupSoloChOn/kSoloChOn', 60 + stIdx * 2);
                        }
                    },
                    nudge: function (data) {
                        if (typeof nudgeFader === 'function') {
                            nudgeFader(isMaster ? 'master' : ch, data.direction);
                        }
                    }
                }
            };

            var strip = new ChannelStrip(stripConfig);
            _miniStripInstance = strip;
            var el = strip.render();
            if (el) container.appendChild(el);
        } else if (typeof createChannelStrip === 'function') {
            // Fallback legado
            var isM = ch === 52;
            var isO = (ch >= 36 && ch <= 51);
            if (isM) container.innerHTML = createChannelStrip(0, true, "mini-");
            else if (isO) {
                var t = (ch <= 43) ? 'mix' : 'bus';
                var i = (ch <= 43) ? (ch - 36) : (ch - 44);
                container.innerHTML = createOutputStrip(i, t, "mini-");
            } else if (ch >= 60 && ch <= 67) {
                container.innerHTML = createOutputStrip((ch - 60) / 2, 'stIn', "mini-");
            } else {
                container.innerHTML = createChannelStrip(ch, false, "mini-");
            }
        }
    }

    /**
     * Alterna a aba de configuração ativa
     * @param {string} tabId ('eq' | 'dyn' | 'aux' | 'inserts' | 'routing')
     */
    function switchTab(tabId) {
        _activeTab = tabId || 'aux';
        if (typeof activeConfigTab !== 'undefined') {
            window.activeConfigTab = _activeTab;
        }

        // Atualizar estado ativo dos botões de abas
        var tabBtns = document.querySelectorAll('.dock-tab, .ch-setup-tab-btn');
        tabBtns.forEach(function (btn) {
            var btnTab = btn.getAttribute('data-tab') || (
                btn.innerText.toLowerCase().includes('eq') ? 'eq' :
                btn.innerText.toLowerCase().includes('dyn') ? 'dyn' :
                btn.innerText.toLowerCase().includes('aux') ? 'aux' :
                btn.innerText.toLowerCase().includes('insert') ? 'inserts' : 'etc'
            );
            if (btnTab === _activeTab || (_activeTab === 'routing' && btnTab === 'etc')) {
                btn.classList.add('active-tab', 'active');
            } else {
                btn.classList.remove('active-tab', 'active');
            }
        });

        var modeEl = document.getElementById('chSideMode');
        var ch = _activeChannel;

        if (_activeTab === 'eq') {
            if (modeEl) modeEl.innerText = 'EQUALIZADOR';
            if (typeof renderEQ === 'function') renderEQ(ch);
        } else if (_activeTab === 'dyn') {
            if (modeEl) modeEl.innerText = 'DYNAMICS';
            if (typeof renderDynamics === 'function') renderDynamics(ch);
        } else if (_activeTab === 'aux') {
            if (modeEl) modeEl.innerText = 'AUX SENDS';
            if (typeof renderAuxs === 'function') renderAuxs(ch);
        } else if (_activeTab === 'inserts') {
            if (modeEl) modeEl.innerText = 'INSERTS';
            if (typeof renderInserts === 'function') renderInserts(ch);
        } else if (_activeTab === 'routing' || _activeTab === 'etc') {
            if (modeEl) modeEl.innerText = 'ROUTING / ETC';
            if (typeof renderRouting === 'function') renderRouting(ch);
        }

        if (typeof renderDock === 'function' && ch !== null) {
            renderDock('channelConfig');
        }
        if (typeof updateSidebarInfo === 'function') {
            updateSidebarInfo();
        }
    }

    /**
     * Altera o canal ativo navegando com delta (-1 ou +1)
     * @param {number} delta 
     */
    function changeChannel(delta) {
        if (_activeChannel === null) return;
        var nextCh = _activeChannel;
        var safetyCounter = 0;

        do {
            if (nextCh >= 60 && nextCh <= 67) {
                nextCh += delta * 2;
            } else {
                nextCh += delta;
            }

            if (nextCh > 31 && nextCh < 36 && delta > 0) nextCh = 36;
            if (nextCh > 31 && nextCh < 36 && delta < 0) nextCh = 31;

            if (nextCh > 52 && nextCh < 60 && delta > 0) nextCh = 60;
            if (nextCh > 52 && nextCh < 60 && delta < 0) nextCh = 52;

            if (nextCh < 0) nextCh = 66;
            if (nextCh > 66) nextCh = 0;

            var s = (nextCh >= 0 && nextCh <= 31 && typeof channelStates !== 'undefined') ? channelStates[nextCh] : null;
            if (!s || !s.paired || nextCh % 2 === 0) break;

            safetyCounter++;
        } while (nextCh !== _activeChannel && safetyCounter < 100);

        _activeChannel = nextCh;
        try { activeConfigChannel = nextCh; } catch (e) { }
        window.activeConfigChannel = nextCh;

        updateHeader(nextCh);
        renderMiniFader(nextCh);
        switchTab(_activeTab);
        _highlightActiveCard(nextCh);

        if (typeof renderDock === 'function') renderDock('channelConfig');
        if (typeof updateSidebarInfo === 'function') updateSidebarInfo();
    }

    /**
     * Aplica realce visual no card correspondente na tela de fundo
     * @param {number} ch 
     */
    function _highlightActiveCard(ch) {
        document.querySelectorAll('.fader-card, .channel-strip-wrapper').forEach(function (c) {
            c.classList.remove('channel-strip-selected');
        });

        var currentCard = null;
        if (ch >= 0 && ch <= 31) {
            currentCard = document.querySelectorAll('.fader-card, .channel-strip-wrapper')[ch];
        } else if (ch >= 36 && ch <= 43) {
            var idx = ch - 36;
            currentCard = document.querySelectorAll('.fader-group-mix, .strip-mix')[idx];
        } else if (ch >= 44 && ch <= 51) {
            var bIdx = ch - 44;
            currentCard = document.querySelectorAll('.fader-group-bus, .strip-bus')[bIdx];
        } else if (ch === 52) {
            currentCard = document.querySelector('.master-card, .strip-master');
        } else if (ch >= 60 && ch <= 67) {
            var stIdx = (ch - 60) / 2;
            currentCard = document.querySelectorAll('.fader-group-st, .strip-st')[stIdx];
        }

        if (currentCard) {
            currentCard.classList.add('channel-strip-selected');
        }
    }

    /**
     * Abre a central de edição para o canal especificado
     * @param {Event|null} e 
     * @param {number} ch 
     * @param {string} [defaultTab='aux'] 
     */
    function open(e, ch, defaultTab) {
        if (typeof musicianMode !== 'undefined' && musicianMode) return;
        if (e && e.target && (e.target.closest('button') || e.target.closest('input'))) return;

        // Memoriza contexto anterior apenas na navegação INPUT → MIX (36-43).
        // Reabertura do mesmo canal não toca no contexto já salvo.
        if (_activeChannel !== ch) {
            var openingMix = (ch >= 36 && ch <= 43);
            var currentIsMix = (_activeChannel !== null && _activeChannel >= 36 && _activeChannel <= 43);
            if (openingMix && _activeChannel !== null && !currentIsMix) {
                _previousChannel = _activeChannel;
            } else {
                _previousChannel = null;
            }
        }
        _activeChannel = ch;
        try { activeConfigChannel = ch; } catch (err) { }
        window.activeConfigChannel = ch;

        var modal = document.getElementById('chConfigModal');
        if (modal) {
            modal.style.display = 'flex';
        }

        updateHeader(ch);
        renderMiniFader(ch);
        // Rebuild meter cache synchronously after mini-fader render so wasmRenderLoop can see it
        if (typeof resetFaderCache === 'function') resetFaderCache();
        if (typeof buildMeterCache === 'function') buildMeterCache();
        switchTab(defaultTab || _activeTab || 'aux');
        _highlightActiveCard(ch);

        if (typeof renderDock === 'function') renderDock('channelConfig');
        if (typeof updateSidebarInfo === 'function') updateSidebarInfo();
    }

    /**
     * Fecha o modal de edição de canal
     */
    function close() {
        // Volta ao canal anterior quando veio de INPUT → MIX (ex: Canal 17 → MIX 3 → SAIR volta ao Canal 17)
        if (_previousChannel !== null) {
            var returnCh = _previousChannel;
            var returnTab = _activeTab;
            _previousChannel = null;
            if (window.stopEQAnimation) stopEQAnimation();
            if (typeof window.stopMixVolumeGeralNudge === 'function') window.stopMixVolumeGeralNudge();
            if (typeof window.stopAuxVolumeGeralNudge === 'function') window.stopAuxVolumeGeralNudge();
            open(null, returnCh, returnTab);
            return;
        }
        if (window.stopEQAnimation) stopEQAnimation();
        if (typeof window.stopMixVolumeGeralNudge === 'function') window.stopMixVolumeGeralNudge();
        if (typeof window.stopAuxVolumeGeralNudge === 'function') window.stopAuxVolumeGeralNudge();

        var modal = document.getElementById('chConfigModal');
        if (modal) {
            modal.style.display = 'none';
        }

        if (_miniStripInstance && typeof _miniStripInstance.destroy === 'function') {
            _miniStripInstance.destroy();
            _miniStripInstance = null;
        }

        _activeChannel = null;
        try { activeConfigChannel = null; } catch (e) { }
        window.activeConfigChannel = null;

        var miniFader = document.getElementById('miniFaderContext');
        if (miniFader) miniFader.innerHTML = '';

        var vgSlot = document.getElementById('miniFaderVolumeGeral');
        if (vgSlot) vgSlot.remove();

        // Rebuild meter cache for the main faders after modal close
        if (typeof resetFaderCache === 'function') resetFaderCache();
        if (typeof initUI === 'function') initUI();
        // initUI calls resetFaderCache already, but buildMeterCache needs DOM to be painted
        requestAnimationFrame(function () {
            if (typeof buildMeterCache === 'function') buildMeterCache();
        });
        if (typeof updateSidebarInfo === 'function') updateSidebarInfo();

        document.querySelectorAll('.fader-card, .channel-strip-wrapper').forEach(function (c) {
            c.classList.remove('channel-strip-selected');
        });
    }

    // ─── API Pública & Compatibilidade Global ────────────────────

    // Mapeamento para funções globais legadas
    window.openChannelConfig = function (e, ch) { open(e, ch); };
    window.closeChannelConfig = function () { close(); };
    window.changeConfigChannel = function (delta) { changeChannel(delta); };
    window.updateConfigUIForChannel = function (ch) {
        _activeChannel = ch;
        updateHeader(ch);
        renderMiniFader(ch);
    };

    function updateName(ch, name) {
        if (_activeChannel === ch) {
            updateHeader(ch);
            if (_miniStripInstance && typeof _miniStripInstance.setName === 'function') {
                _miniStripInstance.setName(name);
            }
        }
    }

    function updateChannel(ch, val, onState, soloState) {
        if (!_miniStripInstance) return;

        var active = _activeChannel;
        if (active === null || active === undefined) return;

        var matches = false;
        if (ch === 'master' || ch === 52) {
            matches = (active === 52 || active === 'master');
        } else if (typeof ch === 'string' && ch.startsWith('m')) {
            matches = (active === (36 + parseInt(ch.substring(1), 10)));
        } else if (typeof ch === 'string' && ch.startsWith('b')) {
            matches = (active === (44 + parseInt(ch.substring(1), 10)));
        } else if (typeof ch === 'string' && ch.startsWith('st')) {
            var stIdx = parseInt(ch.substring(2), 10);
            matches = (active === (60 + stIdx * 2) || active === (60 + stIdx * 2 + 1));
        } else if (typeof ch === 'number') {
            matches = (active === ch);
        } else {
            matches = (active == ch);
        }

        if (!matches) return;

        if (val !== undefined && val !== null) {
            var isMaster = (active === 52 || active === 'master');
            var isDesktop = document.body.classList.contains('layout-desktop');
            var db = typeof rawToDb === 'function' ? rawToDb(val, !isDesktop, isMaster) : ('' + val);
            _miniStripInstance.setFaderValue(val, db, true);
        }
        if (onState !== undefined && onState !== null) {
            _miniStripInstance.setOnState(onState);
        }
        if (soloState !== undefined && soloState !== null) {
            _miniStripInstance.setSoloState(soloState);
        }
    }

    function updatePan(ch, panValue, side) {
        if (!_miniStripInstance) return;
        var active = _activeChannel;
        if (active === null || active === undefined) return;

        var matches = false;
        if (ch === 'master' || ch === 52) {
            matches = (active === 52 || active === 'master');
        } else if (typeof ch === 'number') {
            matches = (active === ch);
        } else {
            matches = (active == ch);
        }

        if (matches && typeof _miniStripInstance.setPanValue === 'function') {
            _miniStripInstance.setPanValue(panValue, side || 'L', false);
        }
    }

    return {
        open: open,
        close: close,
        changeChannel: changeChannel,
        switchTab: switchTab,
        updateHeader: updateHeader,
        renderMiniFader: renderMiniFader,
        updateName: updateName,
        updateChannel: updateChannel,
        updatePan: updatePan,
        getActiveChannel: function () { return _activeChannel; },
        getActiveTab: function () { return _activeTab; }
    };
})();
