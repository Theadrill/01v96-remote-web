let faderCardsCache = null;

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
    }
}
socket.on('connect', function () {
    requestSetupStatus();
    requestGlobalNames();
});
if (typeof socket !== 'undefined' && socket.connected) {
    requestSetupStatus();
    requestGlobalNames();
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
        console.log('✅ [SYNC COMPLETO] syncStatus=false → estado atual dos pares:');
        for (let i = 0; i < 4; i++) {
            if (channelStates[i]) {
                console.log(`  CH${i + 1}: paired=${channelStates[i].paired}, pairedWith=${channelStates[i].pairedWith}`);
            }
        }
    }
});
socket.on('update', (d) => {
    const isTrue = (d.value === 1 || d.value === true);

    // --- PAN ---
    if (d.type === 'kPan') {
        // Atualiza estado local
        const s = d.channel === 'master'
            ? masterState
            : (typeof getChannelStateById === 'function' ? getChannelStateById(d.channel) : null);
        if (s) s.pan = d.value;

        // Atualiza o indicador visual (apenas no layout desktop)
        if (layoutMode === 'desktop' && typeof window.updatePanIndicator === 'function') {
            window.updatePanIndicator(d.channel, d.value);
        }
        return;
    }

    if (d.channel === 'master' || d.type.startsWith('kStereo')) {
        if (d.type === 'kStereoFader/kFader') updateUI('master', d.value, undefined, undefined);
        if (d.type === 'kStereoChannelOn/kChannelOn') updateUI('master', undefined, isTrue, undefined);
        return;
    }

    if (d.type === 'kAUXFader/kFader') { updateUI(`m${d.channel}`, d.value, undefined); return; }
    if (d.type === 'kAUXChannelOn/kChannelOn') { updateUI(`m${d.channel}`, undefined, isTrue); return; }
    if (d.type === 'kBusFader/kFader') { updateUI(`b${d.channel}`, d.value, undefined); return; }
    if (d.type === 'kBusChannelOn/kChannelOn') { updateUI(`b${d.channel}`, undefined, isTrue); return; }

    // Handler para EQ de canais Out (Bus/AUX: channel IDs 36-51)
    // Estes ficam FORA da guarda `d.channel < NUM_CHANNELS` abaixo.
    if (typeof d.channel === 'number' && d.channel >= 36 && d.type.includes('EQ/kEQ')) {
        if (window.updateEQParam) window.updateEQParam(d.type, d.value, null, d.channel);
        return;
    }

    if (typeof d.channel === 'number' && (d.channel < NUM_CHANNELS || (d.channel >= 60 && d.channel <= 67))) {
        // No modo músico ou técnico mix, ignoramos updates dos faders principais para não bagunçar a visão do AUX
        if (!musicianMode && !technicianMixMode) {
            if (d.type === 'kInputFader/kFader') updateUI(d.channel, d.value, undefined, undefined);
            if (d.type === 'kInputChannelOn/kChannelOn') updateUI(d.channel, undefined, isTrue, undefined);
        }
        if (d.type === 'kSetupSoloChOn/kSoloChOn') updateUI(d.channel, undefined, undefined, isTrue);

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
                Object.assign(channelStates[i], ch);

                let v = ch.value;
                let o = ch.on;

                if (musicianMode || technicianMixMode) {
                    v = ch[`aux${activeMix}`] || 0;
                    o = ch[`aux${activeMix}On`] || false;
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
        const ch0 = getCh(s.channels || {}, 0);
        const ch1 = getCh(s.channels || {}, 1);
        if (ch0 && ch1) {
            console.log("🔍 [DEBUG SYNC] CH1 from server:", ch0.paired, "pairedWith:", ch0.pairedWith);
            console.log("🔍 [DEBUG SYNC] CH2 from server:", ch1.paired, "pairedWith:", ch1.pairedWith);
            console.log("🔍 [DEBUG SYNC] CH1 state:", channelStates[0].paired, "pairedWith:", channelStates[0].pairedWith);
            console.log("🔍 [DEBUG SYNC] CH2 state:", channelStates[1].paired, "pairedWith:", channelStates[1].pairedWith);
        }
        initUI();
        // 🔑 NÃO chamamos requestGlobalNames() aqui — os globals já estão em memória
        // (foram carregados no connect). Recarregar a cada sync causava o flash de nomes.
    }
});

socket.on('scenesUpdated', (data) => {
    if (data.scenes) {
        window.scenesLibrary = data.scenes;
        console.log(`📚 Biblioteca de Cenas atualizada: ${data.scenes.length} cenas.`);
    }
    if (data.currentScene) {
        window.currentSceneNumber = data.currentScene.index;
        window.currentSceneName = data.currentScene.name;
        console.log(`🎬 Cena Atual Atualizada (scenesUpdated): ${window.currentSceneNumber} - ${window.currentSceneName}`);
        if (typeof updateSceneDisplay === 'function') updateSceneDisplay();
        requestActiveCustomChannels();
        requestGlobalNames();
    }
});

function requestActiveCustomChannels() {
    if (typeof socket !== 'undefined' && socket.connected) {
        // Solicita o mapa resolvido unificado (Global > Custom > Físico)
        socket.emit('getActiveCustomChannels');
    }
}

function requestGlobalNames() {
    if (typeof socket !== 'undefined' && socket.connected) {
        // Solicita o mapa resolvido unificado
        socket.emit('getGlobalNames');
    }
}

socket.on('currentScene', (data) => {
    if (data) {
        window.currentSceneNumber = data.index;
        window.currentSceneName = data.name;
        console.log(`🎬 Cena Atual Atualizada (currentScene): ${window.currentSceneNumber} - ${window.currentSceneName}`);
        if (typeof updateSceneDisplay === 'function') updateSceneDisplay();
        requestActiveCustomChannels();
        requestGlobalNames();
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
        requestActiveCustomChannels();
        requestGlobalNames();
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
        scn.innerText = baseName;
        scn.style.color = '#0f0';
    } else {
        scn.innerText = state.demo_mode ? `${baseName} (demo)` : `${baseName} (offline)`;
        scn.style.color = state.demo_mode ? '#ffc107' : '#dc3545';
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

        const fpsMobile = data.savedConfig.meter_fps_mobile !== undefined ? data.savedConfig.meter_fps_mobile : 15;
        const fpsDesktop = data.savedConfig.meter_fps_desktop !== undefined ? data.savedConfig.meter_fps_desktop : 30;
        currentMeterFPS = isMobileAgent ? fpsMobile : fpsDesktop;

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
        // Atualiza a UI inicial
        updateSceneDisplay();
    }
});

window.updateOpenBrowser = function (enabled) {
    socket.emit('updateOpenBrowser', { enabled: enabled });
};

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
            mobileBgs: Array.from(card.querySelectorAll('.mobile-paired-meter')),
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
        cached.card.style.backgroundSize = '';

        if (cached.curtains) {
            cached.curtains.forEach(curtain => {
                if (curtain) curtain.style.transform = '';
            });
        }
        if (cached.mobileBgs) {
            cached.mobileBgs.forEach(bg => {
                if (bg) bg.style.backgroundSize = '';
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
let lastWasmRenderTime = performance.now();
const wasmTargetLevels = new Float32Array(80);

import('../wasm/client_wasm.js').then(async (wasm) => {
    await wasm.default();
    wasmMeterEngine = new wasm.MeterEngine(80);
    wasmMeterEngine.set_decay_rate(0.1); // Queda suave calibrada para escala 0-100
    console.log("[WASM] MeterEngine initialized");
    tryLoadWasmCalibration(); // Injeta calibrações no WASM
    requestAnimationFrame(wasmRenderLoop);
}).catch(err => {
    console.error("[WASM] Failed to load MeterEngine:", err);
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
                    cached.curtains[0].style.transform = `scaleY(${1 - (finalPercent / 100)})`;

                    if (cached.curtains.length > 1 && levelIdx >= 60 && levelIdx <= 66) {
                        const pIdx = levelIdx + 1;
                        if (pIdx < smoothedLevels.length) {
                            const partnerPercent = smoothedLevels[pIdx];
                            cached.curtains[1].style.transform = `scaleY(${1 - (partnerPercent / 100)})`;
                            if (partnerPercent >= 98) isPeaking = true;
                        }
                    }
                } else if (cached.mobileBgs && cached.mobileBgs.length > 0) {
                    if (!cached.card.classList.contains('has-paired-meter')) {
                        cached.card.classList.add('has-paired-meter');
                    }
                    cached.mobileBgs[0].style.backgroundSize = `100% ${finalPercent}%`;

                    if (cached.mobileBgs.length > 1 && levelIdx >= 60 && levelIdx <= 66) {
                        const pIdx = levelIdx + 1;
                        if (pIdx < smoothedLevels.length) {
                            const partnerPercent = smoothedLevels[pIdx];
                            cached.mobileBgs[1].style.backgroundSize = `100% ${partnerPercent}%`;
                            if (partnerPercent >= 98) isPeaking = true;
                        }
                    }
                } else {
                    if (!cached.hasMeter) {
                        cached.card.classList.add('has-meter');
                        cached.hasMeter = true;
                    }
                    cached.card.style.backgroundSize = `100% ${finalPercent}%`;
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
                    cached.curtains[0].style.transform = `scaleY(${1 - (finalPercent / 100)})`;

                    const s = (typeof channelStates !== 'undefined' && levelIdx < 32) ? channelStates[levelIdx] : null;
                    const pIdx = (s && s.paired && s.pairedWith !== null) ? s.pairedWith :
                        ((levelIdx >= 60 && levelIdx <= 66) ? levelIdx + 1 : null);

                    if (pIdx !== null && cached.curtains.length > 1 && pIdx < smoothedLevels.length) {
                        partnerPercent = smoothedLevels[pIdx];
                        cached.curtains[1].style.transform = `scaleY(${1 - (partnerPercent / 100)})`;
                        if (partnerPercent >= 98) isPeaking = true;
                    }
                } else if (cached.mobileBgs && cached.mobileBgs.length > 0) {
                    if (!cached.card.classList.contains('has-paired-meter')) {
                        cached.card.classList.add('has-paired-meter');
                    }
                    cached.mobileBgs[0].style.backgroundSize = `100% ${finalPercent}%`;

                    const s = (typeof channelStates !== 'undefined' && levelIdx < 32) ? channelStates[levelIdx] : null;
                    const pIdx = (s && s.paired && s.pairedWith !== null) ? s.pairedWith :
                        ((levelIdx >= 60 && levelIdx <= 66) ? levelIdx + 1 : null);

                    if (pIdx !== null && cached.mobileBgs.length > 1 && pIdx < smoothedLevels.length) {
                        partnerPercent = smoothedLevels[pIdx];
                        cached.mobileBgs[1].style.backgroundSize = `100% ${partnerPercent}%`;
                        if (partnerPercent >= 98) isPeaking = true;
                    }
                } else {
                    if (!cached.hasMeter) {
                        cached.card.classList.add('has-meter');
                        cached.hasMeter = true;
                    }
                    cached.card.style.backgroundSize = `100% ${finalPercent}%`;
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
            const levelIdx = activeConfigChannel;
            const finalPercent = smoothedLevels[levelIdx] || 0;

            const meterCurtains = miniCard.querySelectorAll('.desk-meter-curtain');
            const peakLed = miniCard.querySelector('.desk-peak-led') || miniCard.querySelector('.mobile-peak-led');

            let isPeaking = finalPercent >= 98;

            if (meterCurtains.length > 0) {
                meterCurtains[0].style.transform = `scaleY(${1 - (finalPercent / 100)})`;

                if (meterCurtains.length > 1) {
                    const s = (typeof channelStates !== 'undefined' && levelIdx < 32) ? channelStates[levelIdx] : null;
                    const pIdx = (s && s.paired && s.pairedWith !== null) ? s.pairedWith :
                        ((levelIdx >= 60 && levelIdx <= 66) ? levelIdx + 1 : null);

                    if (pIdx !== null && pIdx < smoothedLevels.length) {
                        const partnerPercent = smoothedLevels[pIdx];
                        meterCurtains[1].style.transform = `scaleY(${1 - (partnerPercent / 100)})`;
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
    if (!wasmMeterEngine || !meterElementsCache || (typeof musicianMode !== 'undefined' && musicianMode && !window.showMetersInMusicianMode)) {
        lastWasmRenderTime = now;
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

    // Obtém barras do WASM (Float32Array interligado com a memória do Rust)
    const smoothedLevels = wasmMeterEngine.render_frame(deltaMs);

    // Desenha as barras!
    applyMetersToDOM(smoothedLevels, now);
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
        const isMaster = activeConfigChannel === 'master';
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
        scn.innerText = window.isDemoMode ? `${baseName} (demo)` : `${baseName} (offline)`;
    } else {
        scn.innerText = baseName;
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
