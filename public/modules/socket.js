let faderCardsCache = null;

// --- Sincronização por URL Hash (Redirecionamento Automático HTTPS) ---
// Sincroniza 'auto_redirect_https' entre as origens http:// e https:// via hash da URL
// no momento dos redirecionamentos. A preferência continua 100% individual por
// dispositivo/celular (localStorage), sem exigir login nem banco de dados.
function applyAutoRedirectHashSync() {
    if (!window.location.hash) return;

    const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    const syncVal = hashParams.get('sync_https');
    if (syncVal === null) return;

    if (syncVal === 'true') {
        localStorage.setItem('auto_redirect_https', 'true');
        const httpOrigin = hashParams.get('http_origin');
        if (httpOrigin) {
            localStorage.setItem('http_origin', httpOrigin);
        }
    } else if (syncVal === 'false') {
        localStorage.setItem('auto_redirect_https', 'false');
    }

    // Limpa a hash da URL
    window.history.replaceState(null, '', window.location.pathname + window.location.search);

    // Atualiza o estado visual do checkbox (se existir no DOM)
    const toggle = document.getElementById('toggleAutoRedirectHttps');
    if (toggle) toggle.checked = localStorage.getItem('auto_redirect_https') === 'true';
}
applyAutoRedirectHashSync();

// Monta a URL de destino do redirecionamento automático HTTPS anexando a hash de
// sincronização quando a origem atual é http:// (salvando a origem de retorno).
function buildAutoRedirectTarget(tailscaleUrl) {
    let targetUrl = tailscaleUrl;
    if (window.location.protocol === 'http:') {
        localStorage.setItem('http_origin', window.location.origin);
        targetUrl = tailscaleUrl + '#sync_https=true&http_origin=' + encodeURIComponent(window.location.origin);
    }
    return targetUrl;
}

// Decide o que fazer com a splash screen baseado no status do .env no servidor.
// Chamado pelo listener de 'portsList' e 'setupStatus' (via 'connect' → 'checkSetupStatus').
// - envStatus !== 'complete': limpa localStorage e mostra tela de cadastro
// - envStatus === 'complete': auto-login se houver role salva
function applySetupStatus(data) {
    if (!data) return;
    if (data.env_status) window.envStatus = data.env_status;
    if (data.server_name) window.serverName = data.server_name;
    if (data.env_status && data.env_status !== 'complete') {
        try {
            localStorage.removeItem('01v96_role');
            localStorage.removeItem('01v96_mix');
        } catch (e) { /* localStorage indisponível */ }
        const splash = document.getElementById('splashScreen');
        if (splash && splash.style.display !== 'none') {
            if (typeof window.showSetupScreen === 'function') window.showSetupScreen();
        }
    } else if (data.env_status === 'complete') {
        try {
            const savedRole = localStorage.getItem('01v96_role');
            const splash = document.getElementById('splashScreen');
            const isSplashVisible = splash && splash.style.display !== 'none';
            if (savedRole === 'technician' && isSplashVisible) {
                splash.style.display = 'none';
            } else if (savedRole === 'musician') {
                const savedMix = localStorage.getItem('01v96_mix');
                if (savedMix && isSplashVisible) {
                    splash.style.display = 'none';
                    if (typeof enterMusicianMode === 'function') {
                        enterMusicianMode(parseInt(savedMix));
                    }
                }
            }
        } catch (e) { /* localStorage indisponível */ }
    }
}

// Garante que o frontend SEMPRE pergunte ao servidor o estado do .env
// (no boot, em reconexões, e se o módulo carregar após o socket já estar conectado).
function requestSetupStatus() {
    if (typeof socket !== 'undefined' && socket.connected) {
        socket.emit('checkSetupStatus');
        const view = (typeof outsMode !== 'undefined' && outsMode) ? 'outs' : 'ins';
        socket.emit('set_active_view', { view: view });
        // --- Sincronização de FX (Memória do Servidor) ---
        // O servidor Rust agora sincroniza os Efeitos de forma autônoma no boot.
        // O frontend apenas pede a cópia instantânea da memória local do servidor.
        socket.emit('requestFxTypes');
        socket.emit('requestFxInputs');
        socket.emit('requestFxOutputs');
    }
}
socket.on('connect', function () {
    requestSetupStatus();
    // requestGlobalNames() removido: o servidor agora faz o push passivo (resolvedNamesUpdated)
});
if (typeof socket !== 'undefined' && socket.connected) {
    requestSetupStatus();
    // requestGlobalNames() removido
}

// 🚨 [CRITICAL SYNC LOGIC] - LISTENER DE UPDATES E DINÂMICAS
// Este módulo depende do objeto 'socket' global (definido em globals.js).
// Os handlers 'update', 'dynamicsState' e 'meterData' garantem que a UI reflita a mesa física em tempo real.
// Se quebrar essa estrutura de listeners, a sincronia bidirecional da dynamics/faders irá parar de funcionar.

socket.on('syncStatus', (data) => {
    const blocker = document.getElementById('blockingOverlay');

    const isActive = (typeof data === 'object') ? data.active : data;
    const isScene = (typeof data === 'object') ? (data.type === 'is_scene') : false;

    if (isActive) {
        let text = 'SINCRONIZANDO...';
        if (typeof data === 'object' && data.progress !== undefined && data.total !== undefined) {
            let percent = Math.floor((data.progress / data.total) * 100);
            if (data.type === 'channels') {
                text = `SINCRONIZANDO - CANAIS ${percent}%`;
            } else if (data.type === 'scenes') {
                text = `SINCRONIZANDO - CENAS ${percent}%`;
            }
        }
        OverlayInfo.show('sync', text);
    } else {
        OverlayInfo.hide();
    }

    if (blocker) {
        blocker.style.display = (isActive && isScene) ? 'block' : 'none';
    }

    if (!isActive) {
        console.log('✅ [SYNC COMPLETO]');

    }
});
socket.on('update', (d) => {
    const isTrue = (d.value === 1 || d.value === true);

    // --- PAN ---
    if (d.type === 'kPan') {
        const isMaster = d.channel === 'master' || d.channel === 52 || d.channel === "'master'";
        const s = isMaster
            ? masterState
            : (typeof getChannelStateById === 'function' ? getChannelStateById(d.channel) : null);
        if (s) s.pan = d.value;

        // Atualiza o indicador visual (apenas no layout desktop)
        if (layoutMode === 'desktop' && typeof window.updatePanIndicator === 'function') {
            window.updatePanIndicator(isMaster ? 'master' : d.channel, d.value);
        }

        // Sincroniza o slider do PAN Mobile na aba ETC em tempo real
        if (activeConfigTab === 'etc') {
            const panSlider = document.getElementById(`etcPanSl-${d.channel}`);
            if (panSlider) panSlider.value = d.value;
        }
        return;
    }

    if (d.channel === 'master' || d.type.startsWith('kStereo')) {
        if (d.type === 'kStereoFader/kFader') updateUI('master', d.value, undefined, undefined);
        if (d.type === 'kStereoChannelOn/kChannelOn') updateUI('master', undefined, isTrue, undefined);
        if (d.type === 'kStereoAttenuator/kAtt') {
            if (masterState) masterState.att = d.value;
            const activeIsMaster = activeConfigChannel === 'master' || activeConfigChannel === 52;
            if (activeIsMaster && window.updateATTUI) window.updateATTUI(d.value);
        }
        return;
    }

    if (d.type === 'kAUXFader/kFader') { updateUI(`m${d.channel}`, d.value, undefined); return; }
    if (d.type === 'kAUXChannelOn/kChannelOn') { updateUI(`m${d.channel}`, undefined, isTrue); return; }
    if (d.type === 'kAUXAttenuator/kAtt') {
        const state = getChannelStateById(d.channel < 8 ? 36 + d.channel : d.channel);
        if (state) state.att = d.value;
        if (activeConfigChannel === (36 + d.channel) && window.updateATTUI) window.updateATTUI(d.value);
        return;
    }
    if (d.type === 'kBusFader/kFader') { updateUI(`b${d.channel}`, d.value, undefined); return; }
    if (d.type === 'kBusChannelOn/kChannelOn') { updateUI(`b${d.channel}`, undefined, isTrue); return; }
    if (d.type === 'kBusAttenuator/kAtt') {
        const state = getChannelStateById(d.channel < 8 ? 44 + d.channel : d.channel);
        if (state) state.att = d.value;
        if (activeConfigChannel === (44 + d.channel) && window.updateATTUI) window.updateATTUI(d.value);
        return;
    }

    // Handler para EQ de canais Out (Bus/AUX: channel IDs 36-51)
    // Estes ficam FORA da guarda `d.channel < NUM_CHANNELS` abaixo.
    if (typeof d.channel === 'number' && d.channel >= 36 && d.type.includes('EQ/kEQ')) {
        if (window.updateEQParam) window.updateEQParam(d.type, d.value, null, d.channel);
        return;
    }

    if (typeof d.channel === 'number' && (d.channel < 56 || (d.channel >= 60 && d.channel <= 67))) {
        // No modo músico ou técnico mix, ignoramos updates dos faders principais para não bagunçar a visão do AUX
        if (!musicianMode && !technicianMixMode) {
            if (d.type === 'kInputFader/kFader') updateUI(d.channel, d.value, undefined, undefined);
            if (d.type === 'kInputChannelOn/kChannelOn') updateUI(d.channel, undefined, isTrue, undefined);
        }
        let mappedSoloCh = d.channel;
        if (d.type === 'kSetupSoloChOn/kSoloChOn') {
            if (d.channel >= 40 && d.channel <= 47) mappedSoloCh = d.channel - 4;
            else if (d.channel >= 48 && d.channel <= 55) mappedSoloCh = d.channel - 4;
            updateUI(mappedSoloCh, undefined, undefined, isTrue);
        }

        if (d.type === 'kInputPhase/kPhase') {
            const state = getChannelStateById(d.channel);
            if (state) state.phase = d.value;
            if (activeConfigChannel === d.channel && window.updatePhaseUI) updatePhaseUI(d.channel, d.value);
        }

        if (d.type === 'kInputAttenuator/kAtt') {
            const state = getChannelStateById(d.channel);
            if (state) state.att = d.value;
            if (activeConfigChannel === d.channel && window.updateATTUI) window.updateATTUI(d.value);
        }

        // Suporte a Auxiliares
        if (d.type.includes('kInputAUX/kAUX')) {
            updateAuxFromSocket(d.channel, d.type, d.value);

            // Se estivermos em modo músico ou técnico mix e o update for pro AUX que estou mixando...
            if ((musicianMode || technicianMixMode) && d.type.startsWith(`kInputAUX/kAUX${activeMix}`)) {
                const isLevel = d.type.endsWith('Level');
                const isOn = d.type.endsWith('On');
                if (isLevel) updateUI(d.channel, d.value, undefined, undefined);
                if (isOn) updateUI(d.channel, undefined, isTrue, undefined);
            }
        }

        if (d.type === 'updateState') {
            const prefixMatch = d.typeParam.match(/^(kInput|kAUX|kBus|kStereo)(EQ|Comp|Gate)\/(.*)/);
            if (prefixMatch) {
                const module = prefixMatch[2]; // EQ, Comp, Gate
                const param = prefixMatch[3];  // Ex: kEQOn, kCompThreshold

                if (module === 'EQ' && typeof updateEQFromSocket === 'function') {
                    updateEQFromSocket(d.channel, param, d.value);
                } else if (module === 'Comp' && typeof updateCompFromSocket === 'function') {
                    updateCompFromSocket(d.channel, param, d.value);
                } else if (module === 'Gate' && typeof updateGateFromSocket === 'function') {
                    updateGateFromSocket(d.channel, param, d.value);
                }
                return;
            }

            if (d.typeParam.startsWith('kInputAUX/')) {
                if (typeof updateAuxFromSocket === 'function') {
                    updateAuxFromSocket(d.channel, d.typeParam, d.value);
                }
            }
            // ... restante do updateState (Phase, Patch, Buses, Stereo On)
        }

        // Suporte a Patch (ETC)
        if (d.type === 'kChannelInput/kChannelIn') {
            const state = getChannelStateById(d.channel);
            if (state) state.patch = d.value;
            if (activeConfigChannel === d.channel) {
                const nameEl = document.getElementById('currentPatchName');
                if (nameEl && typeof window.getPatchName === 'function') {
                    nameEl.innerText = window.getPatchName(d.value);
                }
            }
        }

        // Suporte a Insert (ETC)
        if (d.type === 'kInputInsert/kInsertOn') {
            const state = getChannelStateById(d.channel);
            if (state && state.insert) state.insert.on = !!d.value;
            if (activeConfigChannel === d.channel && typeof renderRouting === 'function') {
                renderRouting(d.channel);
            }
        }
        if (d.type === 'kInputInsert/kInsertLocInsert') {
            const state = getChannelStateById(d.channel);
            if (state && state.insert) state.insert.position = d.value;
            if (activeConfigChannel === d.channel && typeof renderRouting === 'function') {
                renderRouting(d.channel);
            }
        }
        if (d.type === 'kChannelInsertIn/kInsertIn') {
            const state = getChannelStateById(d.channel);
            if (state && state.insert) state.insert.patch_in = d.value;
            if (activeConfigChannel === d.channel && typeof renderRouting === 'function') {
                renderRouting(d.channel);
            }
        }

        // Suporte a Bus Insert / Stereo (ETC)
        if (d.type === 'kBusInsert/kInsertOn') {
            const busIdx = d.channel >= 44 ? d.channel - 44 : d.channel;
            const globalCh = 44 + busIdx;
            const state = busesState[busIdx];
            if (state) state.insert.on = !!d.value;
            if (activeConfigChannel === globalCh && typeof renderRouting === 'function') {
                renderRouting(globalCh);
            }
        }
        if (d.type === 'kBusInsert/kInsertLocInsert') {
            const busIdx = d.channel >= 44 ? d.channel - 44 : d.channel;
            const globalCh = 44 + busIdx;
            const state = busesState[busIdx];
            if (state) state.insert.position = d.value;
            if (activeConfigChannel === globalCh && typeof renderRouting === 'function') {
                renderRouting(globalCh);
            }
        }
        if (d.type === 'kBusToStereo/kBusToStereoOn') {
            const busIdx = d.channel >= 44 ? d.channel - 44 : d.channel;
            const globalCh = 44 + busIdx;
            const state = busesState[busIdx];
            if (state) state.stereo = !!d.value;
            if (activeConfigChannel === globalCh && typeof renderRouting === 'function') {
                renderRouting(globalCh);
            }
        }

        // Suporte a BUS / STEREO (ETC)
        if (d.type && d.type.startsWith('kInputBus/k')) {
            const state = getChannelStateById(d.channel);
            if (state) {
                if (d.type === 'kInputBus/kStereo') {
                    state.stereo = !!d.value;
                } else {
                    const busIdx = parseInt(d.type.replace('kInputBus/kBus', '')) - 1;
                    if (!state.buses) state.buses = new Array(8).fill(false);
                    state.buses[busIdx] = !!d.value;
                }
            }

            if (activeConfigChannel === d.channel && typeof renderRouting === 'function') {
                renderRouting(d.channel);
            }
        }
    } // FIM DO BLOCO DE INPUTS (0-31)

    // --- HANDLERS UNIVERSAIS (INPUTS E OUTS) ---

    // Suporte a Pan em Tempo Real
    if (d.type === 'kPan') {
        const s = getChannelStateById(d.channel);
        if (s) s.pan = d.value;
        if (layoutMode === 'desktop' && typeof window.updatePanIndicator === 'function') {
            window.updatePanIndicator(d.channel, d.value);
        }
    }

    // Suporte a Output Patches Globais
    if (d.type.startsWith('kOutputPatch/')) {
        if (!window.globalOutPatches) {
            window.globalOutPatches = { omni: {}, adat: {}, fx: {}, slot: {}, '2tr': {} };
        }
        const port = d.channel;
        const src = d.value;
        if (d.type === 'kOutputPatch/kOmni') window.globalOutPatches.omni[port] = src;
        if (d.type === 'kOutputPatch/kAdat') window.globalOutPatches.adat[port] = src;
        if (d.type === 'kOutputPatch/kFx') window.globalOutPatches.fx[port] = src;
        if (d.type === 'kOutputPatch/kSlot') window.globalOutPatches.slot[port] = src;
        if (d.type === 'kOutputPatch/k2tr') window.globalOutPatches['2tr'][port] = src;

        // Se a tela de config do insert estiver aberta, re-renderizar para atualizar o patch selecionado
        if (activeConfigTab === 'etc' && typeof renderRouting === 'function') {
            renderRouting(activeConfigChannel);
        }
    }

    // Suporte Universal a EQ
    if (d.type.includes('EQ/kEQ')) {
        if (window.updateEQParam) {
            window.updateEQParam(d.type, d.value, d.mode, d.channel);
        }
    }

    // Suporte Universal a Gate
    if (d.type.includes('Gate/')) {
        const key = d.type.split('/')[1];
        if (activeConfigChannel === d.channel && typeof updateGateFromSocket === 'function') {
            updateGateFromSocket(d.channel, key, d.value);
        } else {
            const s = getChannelStateById(d.channel);
            if (s) {
                if (!s.gate) s.gate = {};
                const iMap = { 'kGateOn': 'on', 'kGateThreshold': 'thresh', 'kGateAttack': 'attack', 'kGateRange': 'range', 'kGateHold': 'hold', 'kGateDecay': 'decay' };
                const ik = iMap[key];
                if (ik) s.gate[ik] = (key === 'kGateOn' ? !!d.value : d.value);
            }
        }
    }

    // Suporte Universal a Compressor
    if (d.type.includes('Comp/')) {
        const key = d.type.split('/')[1];
        if (activeConfigChannel === d.channel && typeof updateCompFromSocket === 'function') {
            updateCompFromSocket(d.channel, key, d.value);
        } else {
            const s = getChannelStateById(d.channel);
            if (s) {
                if (!s.comp) s.comp = {};
                const iMap = { 'kCompOn': 'on', 'kCompThreshold': 'thresh', 'kCompRatio': 'ratio', 'kCompAttack': 'attack', 'kCompRelease': 'release', 'kCompGain': 'gain', 'kCompKnee': 'knee' };
                const ik = iMap[key];
                if (ik) s.comp[ik] = (key === 'kCompOn' ? !!d.value : d.value);
            }
        }
    }

    if (d.type === 'updateNameChar') {
        const stateObj = getChannelStateById(d.channel);
        if (!stateObj.nameChars) {
            stateObj.nameChars = (stateObj.name || '').padEnd(16, ' ').substring(0, 16).split('');
        }
        stateObj.nameChars[d.charIndex] = d.char;
        const newName = stateObj.nameChars.join('').trim();

        // Mantém sicronia do nome
        stateObj.name = newName;

        if (typeof window.updateNameUI === 'function') {
            window.updateNameUI(d.channel, newName);
        }
        return;
    }

    // Suporte a Cena (Echo da mesa)
    if (d.type === 'kSceneNumber') {
        window.currentSceneNumber = d.value;
        updateSceneDisplay();
    }
    if (d.type === 'updateSceneChar') {
        if (!window.sceneChars) window.sceneChars = Array(16).fill(' ');
        window.sceneChars[d.charIndex] = d.char;
        window.currentSceneName = window.sceneChars.join('').trim();
        updateSceneDisplay();
    }

    // Suporte a Pair (Link) de Canais
    if (d.type === 'kInputPair/kPair') {
        const chA = d.channel;
        const partnerIdx = chA % 2 === 0 ? chA + 1 : chA - 1;
        const isPaired = !!d.value;

        console.log(`🔗 [SOCKET] Atualização de Pair: CH ${chA + 1} + ${partnerIdx + 1} = ${isPaired}`);

        // Update State
        if (channelStates[chA]) {
            channelStates[chA].paired = isPaired;
            channelStates[chA].pairedWith = isPaired ? partnerIdx : null;
        }
        if (channelStates[partnerIdx]) {
            channelStates[partnerIdx].paired = isPaired;
            channelStates[partnerIdx].pairedWith = isPaired ? chA : null;
        }

        // Re-render UI
        if (activeConfigChannel === chA || activeConfigChannel === partnerIdx) {
            if (activeConfigTab === 'etc' && typeof renderRouting === 'function') {
                renderRouting(activeConfigChannel);
            }
        }

        // Dispara re-inicialização do grid de faders para aplicar o layout unificado
        if (typeof initUI === 'function') {
            console.log("♻️ [SOCKET] Re-inicializando UI devido a mudança de Pair");
            initUI();
        }
    }

    // Suporte a Pair de MIX/AUX
    if (d.type === 'kAUXPair/kPair') {
        const chA = d.channel;
        const partnerIdx = chA % 2 === 0 ? chA + 1 : chA - 1;
        const isPaired = !!d.value;

        console.log(`🔗 [SOCKET] Atualização de Pair AUX: MIX ${chA + 1} + MIX ${partnerIdx + 1} = ${isPaired}`);

        if (mixesState[chA]) {
            mixesState[chA].paired = isPaired;
            mixesState[chA].pairedWith = isPaired ? partnerIdx : null;
        }
        if (mixesState[partnerIdx]) {
            mixesState[partnerIdx].paired = isPaired;
            mixesState[partnerIdx].pairedWith = isPaired ? chA : null;
        }

        if (typeof initUI === 'function') {
            console.log("♻️ [SOCKET] Re-inicializando UI devido a mudança de Pair AUX");
            initUI();
        }
    }

    // Suporte a Pair de BUS
    if (d.type === 'kBusPair/kPair') {
        const chA = d.channel;
        const partnerIdx = chA % 2 === 0 ? chA + 1 : chA - 1;
        const isPaired = !!d.value;

        console.log(`🔗 [SOCKET] Atualização de Pair BUS: BUS ${chA + 1} + BUS ${partnerIdx + 1} = ${isPaired}`);

        if (busesState[chA]) {
            busesState[chA].paired = isPaired;
            busesState[chA].pairedWith = isPaired ? partnerIdx : null;
        }
        if (busesState[partnerIdx]) {
            busesState[partnerIdx].paired = isPaired;
            busesState[partnerIdx].pairedWith = isPaired ? chA : null;
        }

        if (typeof initUI === 'function') {
            console.log("♻️ [SOCKET] Re-inicializando UI devido a mudança de Pair BUS");
            initUI();
        }
    }
});

function updateSceneDisplay() {
    const el = document.getElementById('scene-info');
    const elConfig = document.getElementById('configSceneDisplay');
    if ((!window.currentSceneName || window.currentSceneName === '') && (window.currentSceneNumber === undefined || window.currentSceneNumber === null)) {
        const text = window.isDemoMode ? 'MODO DEMO ON' : 'SINCRONIZANDO...';
        if (el) el.innerText = text;
        if (elConfig) elConfig.innerText = text;
        return;
    }

    // Fallback para 0 se não houver número de cena
    const displayNum = (window.currentSceneNumber !== undefined && window.currentSceneNumber !== null) ? window.currentSceneNumber : '--';
    const num = (displayNum === '--') ? '--' : String(displayNum).padStart(2, '0');

    const name = window.currentSceneName || '---';
    const fullText = `CENA: ${num} - ${name}`;

    if (el) el.innerText = fullText;
    if (elConfig) elConfig.innerText = fullText;
}

socket.on('updateName', (data) => {
    if (typeof window.updateNameUI === 'function') {
        const stateObj = getChannelStateById(data.channel);
        if (stateObj) {
            stateObj.nameChars = (data.name || '').padEnd(16, ' ').substring(0, 16).split('');
            // Se não houver nome customizado na cena ativa ou custom names desativado, atualizamos o stateObj.name normal
            if (!window.customNamesEnabled || !window.activeCustomSceneChannels || !window.activeCustomSceneChannels[data.channel]) {
                stateObj.name = data.name;
            }
        }

        window.updateNameUI(data.channel, data.name);
    }
});

// Recebe o estado completo do Dynamics para o canal solicitado
socket.on('dynamicsState', (data) => {
    const { channel, gate, comp } = data;

    // Salva sempre no estado local (funciona p/ Input, Bus, AUX e Stereo)
    const s = getChannelStateById(channel);
    if (s) {
        if (gate) s.gate = { ...(s.gate || {}), ...gate };
        if (comp) s.comp = { ...(s.comp || {}), ...comp };
    }

    // Só atualiza a UI se o canal ainda estiver aberto
    if (channel !== activeConfigChannel) return;

    // Atualiza Gate
    if (gate && typeof updateGateFromSocket === 'function') {
        const gateKeyMap = {
            on: 'kGateOn', thresh: 'kGateThreshold', attack: 'kGateAttack',
            range: 'kGateRange', hold: 'kGateHold', decay: 'kGateDecay'
        };
        for (const [stateKey, midiKey] of Object.entries(gateKeyMap)) {
            if (gate[stateKey] !== undefined) {
                updateGateFromSocket(channel, midiKey, gate[stateKey]);
            }
        }
    }

    // Atualiza Compressor
    if (comp && typeof updateCompFromSocket === 'function') {
        const compKeyMap = {
            on: 'kCompOn', thresh: 'kCompThreshold', ratio: 'kCompRatio',
            attack: 'kCompAttack', release: 'kCompRelease', gain: 'kCompGain', knee: 'kCompKnee'
        };
        for (const [stateKey, midiKey] of Object.entries(compKeyMap)) {
            if (comp[stateKey] !== undefined) {
                updateCompFromSocket(channel, midiKey, comp[stateKey]);
            }
        }
    }
});

// Recebe atualizações em tempo real da posição dos medidores (0D 03 0C)
socket.on('globalMeterPositionUpdated', (data) => {
    console.log('🎛️ [METER POSITION SOCKET EVENT]', data);
    if (data && data.target && data.mode !== undefined && typeof window.updateMeterIndicatorUI === 'function') {
        window.updateMeterIndicatorUI(data.target, data.mode);
    }
});

// LOGICA DE DEBUG - permanecida para compatibilidade residual
socket.on('dynamicsDebugLog', (data) => {
    console.log(`%c[DEBUG DYNAMICS] Resposta legada:`, 'color: gray; font-size: 11px;');
});

// Listener de updateName consolidado acima.

socket.on('sync', (s) => {
    // 🔧 [COMPAT] O servidor Rust serializa HashMap<usize,_> com chaves STRING ("0","1"...).
    // O Node.js antigo usava chaves numéricas. Esta função normaliza o acesso para ambos.
    const getCh = (obj, i) => obj[i] !== undefined ? obj[i] : obj[String(i)];

    if (s.channels) {
        for (let i = 0; i < 40; i++) {
            const ch = getCh(s.channels, i);
            if (ch) {
                const prevAuxVal = channelStates[i][`aux${activeMix}`];
                const prevAuxOn = channelStates[i][`aux${activeMix}On`];
                Object.assign(channelStates[i], ch);

                let v = ch.value;
                let o = ch.on;

                if (musicianMode || technicianMixMode) {
                    v = channelStates[i][`aux${activeMix}`];
                    o = channelStates[i][`aux${activeMix}On`];
                    if ((v === 0 || v === null || v === undefined) && (prevAuxVal > 0 || prevAuxVal === true)) {
                        channelStates[i][`aux${activeMix}`] = prevAuxVal;
                        v = prevAuxVal;
                    }
                    if ((o === false || o === null || o === undefined) && prevAuxOn === true) {
                        channelStates[i][`aux${activeMix}On`] = true;
                        o = true;
                    }
                    if (v === undefined || v === null) v = 0;
                    if (o === undefined || o === null) o = false;
                }

                const soloBool = !!ch.solo;
                const onBool = !!o;

                const globalId = (i >= 32) ? (60 + (i - 32) * 2) : i;

                updateUI(globalId, v, onBool, soloBool);
                // Nomes são atualizados via resolvedNamesUpdated (emitido antes do sync)
                // Não chamamos updateNameUI aqui para evitar flash com nome físico.
            }
        }
    }

    window.globalOutPatches = {
        omni: s.outPatchesOmni || {},
        adat: s.outPatchesAdat || {},
        fx: s.outPatchesFx || {},
        slot: s.outPatchesSlot || {},
        '2tr': s.outPatches2tr || {}
    };

    // ... rest of sync (mixes/buses)
    if (s.mixes) {
        for (let i = 0; i < 8; i++) {
            const mix = getCh(s.mixes, i);
            if (mix) {
                Object.assign(mixesState[i], mix);
                updateUI(`m${i}`, mix.value, !!mix.on);
            }
        }
    }
    if (s.buses) {
        for (let i = 0; i < 8; i++) {
            const bus = getCh(s.buses, i);
            if (bus) {
                Object.assign(busesState[i], bus);
                updateUI(`b${i}`, bus.value, !!bus.on);
            }
        }
    }
    if (s.master) {
        Object.assign(masterState, s.master);
        updateUI('master', s.master.value, !!s.master.on, undefined);
        if (layoutMode === 'desktop' && typeof window.updatePanIndicator === 'function' && s.master.pan !== undefined) {
            window.updatePanIndicator('master', s.master.pan);
        }
    }

    if (s.globalMeterPosMaster !== undefined && typeof window.updateMeterIndicatorUI === 'function') {
        window.updateMeterIndicatorUI('master', s.globalMeterPosMaster);
    }
    if (s.globalMeterPosChannels !== undefined && typeof window.updateMeterIndicatorUI === 'function') {
        window.updateMeterIndicatorUI('channels', s.globalMeterPosChannels);
    }

    // Atualiza os indicadores de Pan após o sync completo (desktop apenas)
    if (layoutMode === 'desktop' && typeof window.updatePanIndicator === 'function' && s.channels) {
        for (let i = 0; i < 40; i++) {
            const ch = getCh(s.channels, i);
            if (!ch || ch.pan === undefined) continue;

            // Pular índices ímpares dos ST IN (33, 35, 37, 39) pois compartilham a barra com os pares
            if (i >= 32 && i % 2 !== 0) continue;

            // Canais 0-31 mantêm o ID. ST IN (32-39) mapeiam para 60-67.
            const globalId = (i >= 32) ? (60 + (i - 32)) : i;
            window.updatePanIndicator(globalId, ch.pan);
        }
    }

    if (s.sceneNumber !== undefined && s.sceneNumber !== null) {
        window.currentSceneNumber = s.sceneNumber;
        window.currentSceneName = s.sceneName || '';
        if (typeof updateSceneDisplay === 'function') updateSceneDisplay();
    }

    if (typeof initUI === 'function') {
        console.log("♻️ [SOCKET] Re-inicializando UI após Sync Completo");
        
        initUI();
        // 🔑 NÃO chamamos requestGlobalNames() aqui — os globals já estão em memória
        // (foram carregados no connect). Recarregar a cada sync causava o flash de nomes.
    }
});

socket.on('scenesUpdated', (data) => {
    if (data.scenes) {
        window.scenesLibrary = data.scenes;
    }
    if (data.currentScene) {
        const newNum = data.currentScene.index;
        const newName = data.currentScene.name;
        const changed = window.currentSceneNumber !== newNum || window.currentSceneName !== newName;
        window.currentSceneNumber = newNum;
        window.currentSceneName = newName;
        if (changed) {
            console.log(`🎬 Cena Atual Atualizada (scenesUpdated): ${window.currentSceneNumber} - ${window.currentSceneName}`);
        }
        if (typeof updateSceneDisplay === 'function') updateSceneDisplay();
        // requestActiveCustomChannels() e requestGlobalNames() removidos para evitar flood
    }
});

// requestActiveCustomChannels() removido: o backend faz o push proativo
// requestGlobalNames() removido: o backend faz o push proativo

socket.on('currentScene', (data) => {
    if (data) {
        const newNum = data.index;
        const newName = data.name;
        const changed = window.currentSceneNumber !== newNum || window.currentSceneName !== newName;
        window.currentSceneNumber = newNum;
        window.currentSceneName = newName;
        if (changed) {
            console.log(`🎬 Cena Atual Atualizada (currentScene): ${window.currentSceneNumber} - ${window.currentSceneName}`);
        }
        if (typeof updateSceneDisplay === 'function') updateSceneDisplay();
        // requestActiveCustomChannels() e requestGlobalNames() removidos
    }
});

socket.on('saveSceneResult', (data) => {
    if (data && data.success) {
        const num = String(data.index).padStart(2, '0');
        const name = data.scene_name ? ' - ' + data.scene_name : '';
        window.currentSceneNumber = data.index;
        window.currentSceneName = data.scene_name || '';

        // Atualiza a biblioteca local para refletir a nova cena salva na grade imediatamente
        if (!window.scenesLibrary) window.scenesLibrary = [];
        const existingIdx = window.scenesLibrary.findIndex(s => s.index === data.index);
        const sceneData = { index: data.index, name: data.scene_name || '', isEmpty: false };
        if (existingIdx >= 0) {
            window.scenesLibrary[existingIdx] = sceneData;
        } else {
            window.scenesLibrary.push(sceneData);
        }

        if (typeof updateSceneDisplay === 'function') updateSceneDisplay();
        OverlayInfo.show('success', 'CENA ' + num + name + ' SALVA');
        // requestActiveCustomChannels() e requestGlobalNames() removidos
    } else if (data && !data.success) {
        OverlayInfo.show('error', 'ERRO AO SALVAR CENA');
    }
});


// --- RESOLVED NAMES (fonte de verdade única) ---
// O servidor emite este evento antes do 'sync' para eliminar qualquer
// flash de nome físico → nome global/custom durante troca de tela.
socket.on('resolvedNamesUpdated', (data) => {
    if (!data || !data.channels) return;

    // Limpar estado antigo
    window.globalNames = {};
    window.activeCustomSceneChannels = {};
    window.resolvedNames = {}; // <-- NOVO: Objeto absoluto que a UI vai usar para renderizar

    if (typeof window.updateNameUI === 'function') {
        for (const entry of data.channels) {
            // Popular o estado local para as checkboxes do modal de edição (sidebar.js)
            if (entry.source === 'global') {
                window.globalNames[entry.ch] = { name: entry.name, short: entry.short };
            } else if (entry.source === 'custom') {
                window.activeCustomSceneChannels[entry.ch] = { name: entry.name, short: entry.short };
            }

            // Armazena o nome final decidido pelo backend no objeto absoluto
            window.resolvedNames[entry.ch] = { name: entry.name, short: entry.short, source: entry.source };

            window.updateNameUI(entry.ch, entry.name);
        }
    }

    if (typeof window.updateBusRoutingLabels === 'function' && activeConfigTab === 'etc' && activeConfigChannel !== null) {
        window.updateBusRoutingLabels();
    }
});

// Stubs de compatibilidade — mantidos para não errar caso outros paths
// ainda emitam estes eventos. A lógica de prioridade está no backend.
socket.on('activeCustomChannels', (_data) => {
    // Substituído por resolvedNamesUpdated
});

socket.on('globalNamesLoaded', (_data) => {
    // Substituído por resolvedNamesUpdated
});

socket.on('customSceneLoaded', (data) => {
    if (data && data.active) {
        console.log('[CUSTOM] customSceneLoaded:', data.scene_name);
        // Nomes já vêm via resolvedNamesUpdated — aqui só tratamos UI de feedback
    } else {
        console.log('[CUSTOM] customSceneLoaded: nenhuma cena ativa');
        if (window.customNamesEnabled) {
            socket.emit('ensureCurrentCustomScene', { syncShared: window.customScenesSyncEnabled });
        }
    }
});

socket.on('saveNameResult', (data) => {
    if (data && data.success) {
        OverlayInfo.show('success', 'NOME CUSTOMIZADO SALVO');
    } else if (data && !data.success) {
        OverlayInfo.show('error', 'ERRO: ' + (data.error || 'falha ao salvar nome'));
    }
});

socket.on('connectionState', (state) => {
    window.isDemoMode = !!state.demo_mode;
    document.body.classList.toggle('is-offline', !state.connected);
    const scn = document.getElementById('scn');
    const baseName = window.serverName || '01V96';
    if (state.connected) {
        window.currentScnNameText = baseName;
        if (scn) scn.style.color = '#0f0';
    } else {
        window.currentScnNameText = state.demo_mode ? `${baseName} (demo)` : `${baseName} (offline)`;
        if (scn) scn.style.color = state.demo_mode ? '#ffc107' : '#dc3545';
    }
    if ((!window.sidebarScnDisplayMode || window.sidebarScnDisplayMode === 'name') && scn) {
        scn.innerText = window.currentScnNameText;
        if (typeof autoScaleElement === 'function') autoScaleElement(scn);
    }
    const overlay = document.getElementById('offlineOverlay');
    if (overlay) {
        if (state.connected) {
            overlay.style.display = 'none';
            overlay.classList.remove('demo-mode');
        } else if (state.demo_mode) {
            overlay.style.display = 'flex';
            overlay.classList.add('demo-mode');
        } else {
            overlay.style.display = 'flex';
            overlay.classList.remove('demo-mode');
        }
    }
    // Força atualização do texto na sidebar caso ainda não tenha cena carregada
    updateSceneDisplay();
});

socket.on('portsList', (data) => {
    if (data.tailscaleUrl) {
        window.lastTailscaleUrl = data.tailscaleUrl;
    }
    const autoRedirect = localStorage.getItem('auto_redirect_https') === 'true';
    if (autoRedirect && data.tailscaleUrl && window.location.protocol !== 'https:' && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
        window.location.href = buildAutoRedirectTarget(data.tailscaleUrl);
        return;
    }

    if (data.tecnicoPassword) {
        tecnicoPassword = data.tecnicoPassword;
        window.tecnicoPassword = data.tecnicoPassword;
    } else {
        // A senha TÉCNICO vem APENAS do .env (serverPassword). Nunca de config.json.
        tecnicoPassword = null;
        window.tecnicoPassword = null;
    }
    if (data.serverName) {
        window.serverName = data.serverName;
    }
    if (data.envStatus) {
        window.envStatus = data.envStatus;
        applySetupStatus({
            env_status: data.envStatus,
            server_name: data.serverName,
        });
    }

    const sinEl = document.getElementById('sin');
    const soutEl = document.getElementById('sout');
    if (sinEl) sinEl.innerHTML = data.available.inputs.map(p => `<option value="${p.id}" ${data.savedConfig.inIdx == p.id ? 'selected' : ''}>IN: ${p.name}</option>`).join('');
    if (soutEl) soutEl.innerHTML = data.available.outputs.map(p => `<option value="${p.id}" ${data.savedConfig.outIdx == p.id ? 'selected' : ''}>OUT: ${p.name}</option>`).join('');

    if (data.savedConfig && data.savedConfig.inIdx !== null && data.savedConfig.outIdx !== null) {
        conn();
    } else {
        document.getElementById('configModal').style.display = 'flex';
    }
    // Sincroniza o modo demo e opacidade
    const demoBtn = document.getElementById('demoBtn');
    const opacitySlider = document.getElementById('meterOpacity');
    const opacityValSpan = document.getElementById('opacityVal');

    if (data.savedConfig) {
        window.isDemoMode = !!data.savedConfig.demo_mode;

        const fpsMobile = data.savedConfig.meter_fps_mobile !== undefined ? data.savedConfig.meter_fps_mobile : 60;
        const fpsDesktop = data.savedConfig.meter_fps_desktop !== undefined ? data.savedConfig.meter_fps_desktop : 60;

        let localFps = localStorage.getItem('meter_fps_override');
        if (localFps && !isNaN(localFps)) {
            currentMeterFPS = parseInt(localFps);
        } else {
            currentMeterFPS = isMobileAgent ? fpsMobile : fpsDesktop;
        }

        const inputLocalFps = document.getElementById('inputLocalFps');
        if (inputLocalFps) {
            inputLocalFps.value = currentMeterFPS;
        }

        if (data.savedConfig.wasm_throttle_ms !== undefined && wasmMidiDispatcher) {
            wasmMidiDispatcher.set_throttle(data.savedConfig.wasm_throttle_ms);
        }

        if (demoBtn) {
            const isDemo = !!data.savedConfig.demo_mode;
            demoBtn.innerText = isDemo ? 'DEMO OFF' : 'DEMO ON';
            demoBtn.style.background = isDemo ? '#dc3545' : '#28a745';
        }
        if (opacitySlider) {
            const op = data.savedConfig.meter_opacity || 50;
            opacitySlider.value = op;
            if (opacityValSpan) opacityValSpan.innerText = op + '%';
            document.documentElement.style.setProperty('--meter-opacity', op / 100);
        }
        const toggleBrowser = document.getElementById('toggleOpenBrowser');
        if (toggleBrowser) {
            toggleBrowser.checked = data.savedConfig.open_browser_startup !== false;
        }

        const toggleAutoRedirect = document.getElementById('toggleAutoRedirectHttps');
        if (toggleAutoRedirect) {
            toggleAutoRedirect.checked = localStorage.getItem('auto_redirect_https') === 'true';
        }

        const toggleCanvas = document.getElementById('toggleCanvasMode');
        if (toggleCanvas) {
            toggleCanvas.checked = data.savedConfig.use_canvas === true;
        }

        if (data.savedConfig.use_canvas === true && !window.location.pathname.startsWith('/canvas')) {
            window.location.href = '/canvas/index.html';
            return;
        }

        if (data.savedConfig.rta_decay_rate !== undefined) {
            window.rtaConfig.decayRate = data.savedConfig.rta_decay_rate;
        }
        if (data.savedConfig.rta_peak_hold_time !== undefined) {
            window.rtaConfig.peakHoldTime = data.savedConfig.rta_peak_hold_time;
        }
        if (data.savedConfig.rta_smoothing !== undefined) {
            window.rtaConfig.smoothing = data.savedConfig.rta_smoothing;
        }
        if (data.savedConfig.rta_fft_size !== undefined) {
            window.rtaConfig.fftSize = data.savedConfig.rta_fft_size;
        }
        
        if (typeof window.updateRtaInputsUI === 'function') {
            window.updateRtaInputsUI();
        }

        window.rtaSmoothingFactor = Math.min(0.99, Math.max(0, window.rtaConfig.smoothing / 100));
        window.rtaPeakHoldTimeMs = window.rtaConfig.peakHoldTime * 1000;
        window.rtaDecayRate = window.rtaConfig.decayRate;

        console.log("[RTA SOCKET LOG] portsList recebeu dados do config.json e atualizou memória (window):", {
            rtaSmoothingFactor: window.rtaSmoothingFactor,
            rtaPeakHoldTimeMs: window.rtaPeakHoldTimeMs,
            rtaDecayRate: window.rtaDecayRate,
            rtaConfig: window.rtaConfig ? { ...window.rtaConfig } : null
        });

        if (typeof window.restartRtaIfActive === 'function') {
            window.restartRtaIfActive(window.rtaConfig.fftSize, window.rtaConfig.smoothing, window.rtaConfig.peakHoldTime);
        }

        // Configuração do FLAT EQ
        window.eqFlatSkipHpfLpf = data.savedConfig.eq_flat_skip_hpf_lpf === true;
        const toggleFlat = document.getElementById('toggleEqFlatSkipHpfLpf');
        if (toggleFlat) {
            toggleFlat.checked = window.eqFlatSkipHpfLpf;
        }

        // Atualiza a UI inicial
        updateSceneDisplay();
    }
});

socket.on('eqFlatConfigUpdated', (data) => {
    if (data && data.skip_hpf_lpf !== undefined) {
        window.eqFlatSkipHpfLpf = data.skip_hpf_lpf === true;
        const toggleFlat = document.getElementById('toggleEqFlatSkipHpfLpf');
        if (toggleFlat) toggleFlat.checked = window.eqFlatSkipHpfLpf;
    }
});

window.updateEqFlatConfig = function(enabled) {
    window.eqFlatSkipHpfLpf = !!enabled;
    if (appReady) {
        socket.emit('updateEqFlatConfig', { skip_hpf_lpf: !!enabled });
    }
};

socket.on('rtaConfigUpdated', (cfg) => {
    if (cfg.rta_decay_rate !== undefined) {
        window.rtaConfig.decayRate = cfg.rta_decay_rate;
    }
    if (cfg.rta_peak_hold_time !== undefined) {
        window.rtaConfig.peakHoldTime = cfg.rta_peak_hold_time;
    }
    if (cfg.rta_smoothing !== undefined) {
        window.rtaConfig.smoothing = cfg.rta_smoothing;
    }
    if (cfg.rta_fft_size !== undefined) {
        window.rtaConfig.fftSize = cfg.rta_fft_size;
    }
    
    if (typeof window.updateRtaInputsUI === 'function') {
        window.updateRtaInputsUI();
    }

    window.rtaSmoothingFactor = Math.min(0.99, Math.max(0, window.rtaConfig.smoothing / 100));
    window.rtaPeakHoldTimeMs = window.rtaConfig.peakHoldTime * 1000;
    window.rtaDecayRate = window.rtaConfig.decayRate;
    
    console.log("[RTA SOCKET LOG] rtaConfigUpdated recebeu dados e atualizou memória (window):", {
        rtaSmoothingFactor: window.rtaSmoothingFactor,
        rtaPeakHoldTimeMs: window.rtaPeakHoldTimeMs,
        rtaDecayRate: window.rtaDecayRate,
        rtaConfig: window.rtaConfig ? { ...window.rtaConfig } : null
    });

    if (typeof window.restartRtaIfActive === 'function') {
        window.restartRtaIfActive(window.rtaConfig.fftSize, window.rtaConfig.smoothing, window.rtaConfig.peakHoldTime);
    }
});

window.updateOpenBrowser = function (enabled) {
    socket.emit('updateOpenBrowser', { enabled: enabled });
};

window.updateAutoRedirectHttps = function (enabled) {
    localStorage.setItem('auto_redirect_https', enabled ? 'true' : 'false');
    const isLocalHost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

    if (enabled) {
        // Se estiver em http:// (e não for localhost/127.0.0.1): salva a origem e
        // redireciona ao Tailscale HTTPS com a hash de sincronização.
        if (window.location.protocol === 'http:' && !isLocalHost) {
            localStorage.setItem('http_origin', window.location.origin);
            if (window.lastTailscaleUrl) {
                window.location.href = buildAutoRedirectTarget(window.lastTailscaleUrl);
            }
        }
    } else {
        // Se estiver em https://: volta para a origem HTTP salva, sincronizando a desativação.
        if (window.location.protocol === 'https:') {
            let httpOrigin = localStorage.getItem('http_origin');
            if (!httpOrigin) {
                httpOrigin = 'http://' + window.location.hostname.split('.')[0] + ':4000';
            }
            const targetUrl = httpOrigin + '/#sync_https=false';
            window.location.href = targetUrl;
        }
    }
};

window.toggleCanvasMode = function (enabled) {
    socket.emit('updateCanvasMode', { enabled: enabled });
    if (enabled) {
        window.location.href = '/canvas/index.html';
    } else {
        window.location.href = '/index.html';
    }
};

socket.on('tailscaleUrl', (data) => {
    if (data.url) {
        window.lastTailscaleUrl = data.url;
    }
    const autoRedirect = localStorage.getItem('auto_redirect_https') === 'true';
    if (autoRedirect && data.url && window.location.protocol !== 'https:' && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
        window.location.href = buildAutoRedirectTarget(data.url);
    }
});

window.resetFaderCache = () => {
    faderCardsCache = null;
    meterElementsCache = null;
};

let smoothedLevels = new Array(64).fill(0);
let lastPeakTime = new Array(64).fill(0);
let meterElementsCache = null;

let lastMeterRenderTime = 0;
let currentMeterFPS = 30;
const isMobileAgent = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

let meterVisibilityObserver = null;

function setupMeterObserver() {
    if (meterVisibilityObserver) meterVisibilityObserver.disconnect();

    meterVisibilityObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (meterElementsCache) {
                const cached = meterElementsCache.find(c => c && c.card === entry.target);
                if (cached) cached.isVisible = entry.isIntersecting;
            }
        });
    }, {
        root: null,
        rootMargin: '150px', // Renderiza um pouco antes de entrar na tela
        threshold: 0.01
    });
}

function buildMeterCache() {
    if (!faderCardsCache || !faderCardsCache.length) {
        meterElementsCache = null;
        return;
    }
    meterElementsCache = new Array(faderCardsCache.length);

    if (!meterVisibilityObserver) setupMeterObserver();
    else meterVisibilityObserver.disconnect(); // Reseta os observadores antigos

    for (let i = 0; i < faderCardsCache.length; i++) {
        const card = faderCardsCache[i];
        meterElementsCache[i] = {
            card,
            dataCh: card.getAttribute('data-ch'),
            partnerCh: card.getAttribute('data-partner-ch'),
            curtains: Array.from(card.querySelectorAll('.desk-meter-curtain')),
            mobileCurtains: Array.from(card.querySelectorAll('.mobile-meter-curtain')),
            peakLed: card.querySelector('.desk-peak-led') || card.querySelector('.mobile-peak-led'),
            hasMeter: card.classList.contains('has-meter') || card.classList.contains('has-paired-meter'),
            isPeakActive: false,
            isVisible: true // Inicialmente true, o observer atualiza log em seguida
        };

        if (meterVisibilityObserver) meterVisibilityObserver.observe(card);
    }
}

function clearAllMeters() {
    if (!meterElementsCache) return;
    for (let i = 0; i < meterElementsCache.length; i++) {
        const cached = meterElementsCache[i];
        if (!cached || !cached.card) continue;

        cached.card.classList.remove('has-meter', 'has-paired-meter', 'peak-glow');
        cached.hasMeter = false;

        if (cached.curtains) {
            cached.curtains.forEach(curtain => {
                if (curtain) curtain.style.transform = '';
            });
        }
        if (cached.mobileCurtains) {
            cached.mobileCurtains.forEach(curtain => {
                if (curtain) curtain.style.transform = '';
            });
        }
        if (cached.peakLed) {
            cached.peakLed.classList.remove('active');
        }
        cached.isPeakActive = false;
    }
}
window.clearAllMeters = clearAllMeters;

function toggleMusicianMeters() {
    window.showMetersInMusicianMode = !window.showMetersInMusicianMode;
    localStorage.setItem('01v96_musician_meters', window.showMetersInMusicianMode);
    const btn = document.getElementById('musicianMetersBtn');
    if (btn) {
        if (window.showMetersInMusicianMode) {
            btn.textContent = 'OCULTAR NÍVEIS';
            btn.classList.add('active');
            if (!faderCardsCache) {
                faderCardsCache = document.querySelectorAll('.faders-area > .fader-card, .faders-area > .fader-card-desktop, #master-container .fader-card-desktop, #master-container .fader-card');
            }
            buildMeterCache();
        } else {
            btn.textContent = 'MOSTRAR NÍVEIS';
            btn.classList.remove('active');
            clearAllMeters();
        }
    }
}
window.toggleMusicianMeters = toggleMusicianMeters;

// --- WASM Meter Engine Globals ---
let wasmMeterEngine = null;
let wasmMeterView = null; // TRUE zero-copy view da memória
let lastWasmRenderTime = performance.now();
const wasmTargetLevels = new Float32Array(80);

// --- WASM Throttler Globals ---
let wasmMidiDispatcher = null;
const originalSocketEmit = typeof socket !== 'undefined' ? socket.emit : null;

if (originalSocketEmit && typeof socket !== 'undefined') {
    socket.emit = function (eventName, data) {
        if (eventName === 'control' && wasmMidiDispatcher && typeof data === 'object') {
            const { type, channel, value } = data;
            if (type !== undefined && channel !== undefined && value !== undefined) {
                const now = performance.now();
                const canSend = wasmMidiDispatcher.push_event(type, channel, value, now);
                if (!canSend) return this; // Retido pelo WASM
            }
        }
        return originalSocketEmit.apply(this, arguments);
    };
}

import('../wasm/client_wasm.js').then(async (wasm) => {
    const wasmExports = await wasm.default();
    window.wasmExports = wasmExports; // Exporta as instâncias internas e a memória WASM
    window.wasm = wasm; // EXPOSING GLOBALLY FOR EQ.JS (As classes MeterEngine, etc)
    wasmMeterEngine = new wasm.MeterEngine(80);
    window.wasmMeterEngine = wasmMeterEngine; // Expose globally for canvas_engine.js
    wasmMeterEngine.set_decay_rate(0.1); // Queda suave calibrada para escala 0-100
    
    // TRUE ZERO COPY: Criamos um Float32Array apontando exatamente para o ponteiro de memória no WASM
    const ptr = wasmMeterEngine.get_levels_ptr();
    wasmMeterView = new Float32Array(wasmExports.memory.buffer, ptr, 80);
    
    console.log("[WASM] MeterEngine initialized (TRUE zero-copy view)");

    wasmMidiDispatcher = new wasm.MidiDispatcher(16); // Default 16ms
    console.log("[WASM] MidiDispatcher initialized");

    tryLoadWasmCalibration(); // Injeta calibrações no WASM
    if (!window.location.pathname.startsWith('/canvas')) {
        requestAnimationFrame(wasmRenderLoop);
    }
}).catch(err => {
    console.error("[WASM] Failed to load MeterEngine/MidiDispatcher:", err);
});

let calibrationLoadedToWasm = false;
function tryLoadWasmCalibration() {
    if (calibrationLoadedToWasm || !wasmMeterEngine) return;
    if (!window.meterCalibration || !window.meterCalibration.inputs) {
        setTimeout(tryLoadWasmCalibration, 100);
        return;
    }
    const inputsArray = new Float32Array(33);
    const masterArray = new Float32Array(33);
    for (let i = 0; i <= 32; i++) {
        inputsArray[i] = calibrateStep(i, false);
        masterArray[i] = calibrateStep(i, true);
    }
    wasmMeterEngine.set_calibration_tables(inputsArray, masterArray);
    calibrationLoadedToWasm = true;
    console.log("[WASM] Calibration tables loaded into MeterEngine");
}

function applyMetersToDOM(smoothedLevels, now) {
    if (!meterElementsCache) return;

    if (outsMode) {
        // No modo OUTS, mapeamos os índices recebidos para Mix/Bus/Master
        for (let i = 0; i < meterElementsCache.length; i++) {
            const cached = meterElementsCache[i];
            if (!cached || !cached.card || !cached.isVisible) continue;

            let levelIdx = -1;
            if (cached.dataCh === 'master') levelIdx = 32;
            else if (i < 8) levelIdx = 34 + i;       // Mix 1-8
            else if (i < 16) levelIdx = 42 + (i - 8); // Bus 1-8
            else levelIdx = parseInt(cached.dataCh);

            if (levelIdx >= 0 && levelIdx < smoothedLevels.length) {
                const finalPercent = smoothedLevels[levelIdx];
                let isPeaking = finalPercent >= 98;

                    if (cached.curtains && cached.curtains.length > 0) {
                    cached.curtains[0].style.transform = `translateZ(0) scaleY(${1 - (finalPercent / 100)})`;

                    if (cached.curtains.length > 1 && (cached.dataCh === 'master' || (levelIdx >= 60 && levelIdx <= 66))) {
                        const pIdx = (cached.dataCh === 'master') ? 33 : (levelIdx + 1);
                        if (pIdx < smoothedLevels.length) {
                            const partnerPercent = smoothedLevels[pIdx];
                            cached.curtains[1].style.transform = `translateZ(0) scaleY(${1 - (partnerPercent / 100)})`;
                            if (partnerPercent >= 98) isPeaking = true;
                        }
                    }
                } else if (cached.mobileCurtains && cached.mobileCurtains.length > 0) {
                    if (!cached.hasMeter) {
                        cached.card.classList.add('has-meter');
                        cached.hasMeter = true;
                    }
                    cached.mobileCurtains[0].style.transform = `translateZ(0) scaleY(${1 - (finalPercent / 100)})`;

                    if (cached.mobileCurtains.length > 1 && (cached.dataCh === 'master' || (levelIdx >= 60 && levelIdx <= 66))) {
                        const pIdx = (cached.dataCh === 'master') ? 33 : (levelIdx + 1);
                        if (pIdx < smoothedLevels.length) {
                            const partnerPercent = smoothedLevels[pIdx];
                            cached.mobileCurtains[1].style.transform = `translateZ(0) scaleY(${1 - (partnerPercent / 100)})`;
                            if (partnerPercent >= 98) isPeaking = true;
                        }
                    }
                }

                if (cached.peakLed) {
                    if (isPeaking) {
                        if (!cached.isPeakActive) {
                            cached.peakLed.classList.add('active');
                            cached.card.classList.add('peak-glow');
                            cached.isPeakActive = true;
                        }
                    } else {
                        if (cached.isPeakActive) {
                            cached.peakLed.classList.remove('active');
                            cached.card.classList.remove('peak-glow');
                            cached.isPeakActive = false;
                        }
                    }
                }
            }
        }
    } else {
        // Modo normal: 0-31 Canais e Master
        for (let i = 0; i < meterElementsCache.length; i++) {
            const cached = meterElementsCache[i];
            if (!cached || !cached.card || !cached.isVisible) continue;

            let levelIdx = (cached.dataCh === 'master') ? 32 : parseInt(cached.dataCh);

            if (levelIdx >= 0 && levelIdx < smoothedLevels.length) {
                const finalPercent = smoothedLevels[levelIdx];
                let isPeaking = finalPercent >= 98;
                let partnerPercent = 0;

                if (cached.curtains && cached.curtains.length > 0) {
                    cached.curtains[0].style.transform = `translateZ(0) scaleY(${1 - (finalPercent / 100)})`;

                    const s = (typeof channelStates !== 'undefined' && levelIdx < 32) ? channelStates[levelIdx] : null;
                    const pIdx = (cached.dataCh === 'master') ? 33 :
                        ((s && s.paired && s.pairedWith !== null) ? s.pairedWith :
                        ((levelIdx >= 60 && levelIdx <= 66) ? levelIdx + 1 : null));

                    if (pIdx !== null && cached.curtains.length > 1 && pIdx < smoothedLevels.length) {
                        partnerPercent = smoothedLevels[pIdx];
                        cached.curtains[1].style.transform = `translateZ(0) scaleY(${1 - (partnerPercent / 100)})`;
                        if (partnerPercent >= 98) isPeaking = true;
                    }
                } else if (cached.mobileCurtains && cached.mobileCurtains.length > 0) {
                    if (!cached.hasMeter) {
                        cached.card.classList.add('has-meter');
                        cached.hasMeter = true;
                    }
                    cached.mobileCurtains[0].style.transform = `translateZ(0) scaleY(${1 - (finalPercent / 100)})`;

                    const s = (typeof channelStates !== 'undefined' && levelIdx < 32) ? channelStates[levelIdx] : null;
                    const pIdx = (cached.dataCh === 'master') ? 33 :
                        ((s && s.paired && s.pairedWith !== null) ? s.pairedWith :
                        ((levelIdx >= 60 && levelIdx <= 66) ? levelIdx + 1 : null));

                    if (pIdx !== null && cached.mobileCurtains.length > 1 && pIdx < smoothedLevels.length) {
                        partnerPercent = smoothedLevels[pIdx];
                        cached.mobileCurtains[1].style.transform = `translateZ(0) scaleY(${1 - (partnerPercent / 100)})`;
                        if (partnerPercent >= 98) isPeaking = true;
                    }
                }

                if (isPeaking) {
                    lastPeakTime[levelIdx] = now;
                    if (!cached.isPeakActive) {
                        if (cached.peakLed) cached.peakLed.classList.add('active');
                        cached.card.classList.add('peak-glow');
                        cached.isPeakActive = true;
                    }
                } else if (now - lastPeakTime[levelIdx] > 1000) {
                    if (cached.isPeakActive) {
                        if (cached.peakLed) cached.peakLed.classList.remove('active');
                        cached.card.classList.remove('peak-glow');
                        cached.isPeakActive = false;
                    }
                }
            }
        }
    }

    // --- Suporte ao METER do Mini Fader (no modal de config) ---
    if (activeConfigChannel !== null) {
        let miniCardId = `mini-card${activeConfigChannel}`;
        if (activeConfigChannel === 52) miniCardId = 'mini-cardmaster';
        else if (activeConfigChannel >= 36 && activeConfigChannel <= 43) miniCardId = `mini-cardm${activeConfigChannel - 36}`;
        else if (activeConfigChannel >= 44 && activeConfigChannel <= 51) miniCardId = `mini-cardb${activeConfigChannel - 44}`;
        else if (activeConfigChannel >= 60 && activeConfigChannel <= 67) miniCardId = `mini-cardst${Math.floor((activeConfigChannel - 60) / 2)}`;

        const miniCard = document.getElementById(miniCardId);
        if (miniCard) {
            const isMasterMini = (activeConfigChannel === 52 || activeConfigChannel === 'master');
            const levelIdx = isMasterMini ? 32 : activeConfigChannel;
            const finalPercent = smoothedLevels[levelIdx] || 0;

            const deskCurtains = miniCard.querySelectorAll('.desk-meter-curtain');
            const mobileCurtains = miniCard.querySelectorAll('.mobile-meter-curtain');
            const peakLed = miniCard.querySelector('.desk-peak-led') || miniCard.querySelector('.mobile-peak-led');

            let isPeaking = finalPercent >= 98;

            if (deskCurtains.length > 0) {
                deskCurtains[0].style.transform = `translateZ(0) scaleY(${1 - (finalPercent / 100)})`;

                if (deskCurtains.length > 1) {
                    const s = (typeof channelStates !== 'undefined' && levelIdx < 32) ? channelStates[levelIdx] : null;
                    const pIdx = isMasterMini ? 33 :
                        ((s && s.paired && s.pairedWith !== null) ? s.pairedWith :
                        ((levelIdx >= 60 && levelIdx <= 66) ? levelIdx + 1 : null));

                    if (pIdx !== null && pIdx < smoothedLevels.length) {
                        const partnerPercent = smoothedLevels[pIdx];
                        deskCurtains[1].style.transform = `translateZ(0) scaleY(${1 - (partnerPercent / 100)})`;
                        if (partnerPercent >= 98) isPeaking = true;
                    }
                }
            } else if (mobileCurtains.length > 0) {
                if (!miniCard.classList.contains('has-meter')) miniCard.classList.add('has-meter');
                mobileCurtains[0].style.transform = `translateZ(0) scaleY(${1 - (finalPercent / 100)})`;

                if (mobileCurtains.length > 1) {
                    const s = (typeof channelStates !== 'undefined' && levelIdx < 32) ? channelStates[levelIdx] : null;
                    const pIdx = isMasterMini ? 33 :
                        ((s && s.paired && s.pairedWith !== null) ? s.pairedWith :
                        ((levelIdx >= 60 && levelIdx <= 66) ? levelIdx + 1 : null));

                    if (pIdx !== null && pIdx < smoothedLevels.length) {
                        const partnerPercent = smoothedLevels[pIdx];
                        mobileCurtains[1].style.transform = `translateZ(0) scaleY(${1 - (partnerPercent / 100)})`;
                        if (partnerPercent >= 98) isPeaking = true;
                    }
                }
            } else {
                if (!miniCard.classList.contains('has-meter')) miniCard.classList.add('has-meter');
                miniCard.style.backgroundSize = `100% ${finalPercent}%`;
            }

            if (isPeaking) {
                if (peakLed) peakLed.classList.add('active');
                miniCard.classList.add('peak-glow');
            } else {
                if (peakLed) peakLed.classList.remove('active');
                miniCard.classList.remove('peak-glow');
            }
        }
    }
}

function wasmRenderLoop(now) {
    requestAnimationFrame(wasmRenderLoop);

    // Em modo canvas, apenas faz o tick do MIDI dispatcher — o canvas_engine gerencia render
    const isCanvasMode = window.location.pathname.startsWith('/canvas');

    if (!wasmMeterEngine) return;

    // --- WASM Throttler (despachante) ---
    if (wasmMidiDispatcher) {
        const pending = wasmMidiDispatcher.tick(now);
        for (let i = 0; i < pending.length; i++) {
            const parts = pending[i].split(':');
            if (parts.length === 3) {
                originalSocketEmit.call(socket, 'control', {
                    type: parts[0],
                    channel: parseInt(parts[1], 10),
                    value: parseFloat(parts[2])
                });
            }
        }
    }

    if (isCanvasMode || !meterElementsCache || (typeof musicianMode !== 'undefined' && musicianMode && !window.showMetersInMusicianMode)) {
        return;
    }

    if (currentMeterFPS > 0) {
        const renderInterval = 1000 / currentMeterFPS;
        if (now - lastWasmRenderTime < renderInterval) return;
    }

    // Calcula tempo decorrido para balística correta a qualquer frame rate
    const deltaMs = now - lastWasmRenderTime;
    lastWasmRenderTime = now;

    // Limita deltaMs caso a aba fique inativa por muito tempo (evita pulos absurdos e cálculos longos)
    if (deltaMs > 100) return;

    // Executa a balística in-place no WASM (void, sem alocação)
    wasmMeterEngine.render_frame(deltaMs);

    // Lê diretamente da memória do WASM — sem cópia, sem GC
    applyMetersToDOM(wasmMeterView, now);
}

socket.on('meterDataRaw', (rawBytes) => {
    if (typeof musicianMode !== 'undefined' && musicianMode && !window.showMetersInMusicianMode) return;

    // Cache preenchido na primeira vez ou após resetFaderCache
    if (!faderCardsCache) {
        faderCardsCache = document.querySelectorAll('.faders-area > .fader-card, .faders-area > .fader-card-desktop, #master-container .fader-card-desktop, #master-container .fader-card');
        buildMeterCache();
    }

    if (wasmMeterEngine) {
        wasmMeterEngine.processar_pacote_sysex(new Uint8Array(rawBytes));
    }

    // --- Atualização em tempo real das meters internas de Gate/Comp se o modal estiver aberto ---
    if (activeConfigChannel !== null && wasmMeterEngine) {
        const isMaster = activeConfigChannel === 'master' || activeConfigChannel === 52;
        const levelIdx = isMaster ? 32 : activeConfigChannel;
        const rawStep = wasmMeterEngine.get_raw_step(levelIdx);

        const source = isMaster ? (window.meterCalibration ? window.meterCalibration.master : null) : (window.meterCalibration ? window.meterCalibration.inputs : null);
        const dbVal = (source && source[rawStep]) !== undefined ? source[rawStep] : -138;

        const gateMeter = document.getElementById('gateMeter');
        if (gateMeter) gateMeter.style.width = `${mapDynDbToPercent(dbVal * 10, 'gate')}%`;

        const compMeter = document.getElementById('compMeter');
        if (compMeter) compMeter.style.width = `${mapDynDbToPercent(dbVal * 10, 'comp')}%`;
    }
});

socket.on('grMeterData', (data) => {
    if (!data || activeConfigChannel === null) return;
    if (data.channel !== activeConfigChannel) return;

    const step = data.raw_step;
    const percent = Math.min(Math.max(((4095 - step) / 767) * 100, 0), 100);

    if (data.type === 'gate') {
        const el = document.getElementById('gateGrMeter');
        if (el) el.style.width = `${percent.toFixed(1)}%`;
    } else if (data.type === 'comp') {
        const el = document.getElementById('compGrMeter');
        if (el) el.style.width = `${percent.toFixed(1)}%`;
    }
});

socket.on('setupResult', (data) => {
    if (typeof window.onSetupResult === 'function') {
        window.onSetupResult(data);
    } else {
        console.warn('[SETUP] setupResult recebido mas onSetupResult não está pronto', data);
    }
});

socket.on('setupCompleted', (data) => {
    window.envStatus = 'complete';
    window.serverName = (data && data.server_name) || window.serverName;
    if (typeof window.onSetupCompleted === 'function') window.onSetupCompleted(data);
});

socket.on('setupRequired', (data) => {
    window.envStatus = (data && data.env_status) || 'not_found';
    const splash = document.getElementById('splashScreen');
    if (splash && splash.style.display === 'none') {
        if (typeof window.showSetupScreen === 'function') window.showSetupScreen();
    }
});

socket.on('setupStatus', (data) => {
    applySetupStatus(data);
});

socket.on('serverName', (data) => {
    if (!data) return;
    if (data.server_name) {
        window.serverName = data.server_name;
        // Atualiza o sidebar mesmo se isDemoMode ainda não foi definido
        // (a próxima connectionState/portsList vai re-aplicar com o estado correto).
        if (window.isDemoMode !== undefined) {
            applyServerNameToSidebar(data.server_name);
        }
        if (typeof window.onServerRenamed === 'function') window.onServerRenamed(data);
    }
});

socket.on('renameResult', (data) => {
    if (typeof window.onRenameResult === 'function') window.onRenameResult(data);
});

function applyServerNameToSidebar(serverName) {
    const scn = document.getElementById('scn');
    if (!scn) return;
    const baseName = serverName || '01V96';
    if (document.body.classList.contains('is-offline')) {
        window.currentScnNameText = window.isDemoMode ? `${baseName} (demo)` : `${baseName} (offline)`;
    } else {
        window.currentScnNameText = baseName;
    }
    if ((!window.sidebarScnDisplayMode || window.sidebarScnDisplayMode === 'name') && scn) {
        scn.innerText = window.currentScnNameText;
        if (typeof autoScaleElement === 'function') autoScaleElement(scn);
    }
}

socket.on('serverRenamed', (data) => {
    if (data && data.server_name) {
        window.serverName = data.server_name;
        applyServerNameToSidebar(data.server_name);
        if (typeof window.onServerRenamed === 'function') window.onServerRenamed(data);
    }
});

socket.on('resetResult', (data) => {
    if (typeof window.onResetResult === 'function') window.onResetResult(data);
});

socket.on('configReset', () => {
    if (typeof window.onConfigReset === 'function') window.onConfigReset();
});

window.saveLocalFps = function (val) {
    if (!val || isNaN(val)) {
        localStorage.removeItem('meter_fps_override');
        alert("FPS Local removido. Recarregue a página para usar o padrão.");
        return;
    }
    const newFps = parseInt(val);
    if (newFps >= 5 && newFps <= 60) {
        localStorage.setItem('meter_fps_override', newFps);
        currentMeterFPS = newFps;
    }
};
