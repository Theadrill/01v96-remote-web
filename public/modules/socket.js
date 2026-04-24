let faderCardsCache = null;

// 🚨 [CRITICAL SYNC LOGIC] - LISTENER DE UPDATES E DINÂMICAS
// Este módulo depende do objeto 'socket' global (definido em globals.js).
// Os handlers 'update', 'dynamicsState' e 'meterData' garantem que a UI reflita a mesa física em tempo real.
// Se quebrar essa estrutura de listeners, a sincronia bidirecional da dynamics/faders irá parar de funcionar.

socket.on('syncStatus', (data) => {
    const shield = document.getElementById('syncShield');
    const blocker = document.getElementById('blockingOverlay');
    
    // Suporte para formato antigo (boolean) ou novo (object)
    const isActive = (typeof data === 'object') ? data.active : data;
    const isScene = (typeof data === 'object') ? (data.type === 'is_scene') : false;

    if (shield) {
        shield.style.display = isActive ? 'flex' : 'none';
    }

    if (blocker) {
        // Bloqueia a interface totalmente apenas se for um carregamento de cena
        // Perdurando enquanto o shield de sincronismo estiver ativo
        blocker.style.display = (isActive && isScene) ? 'block' : 'none';
    }
});
socket.on('update', (d) => {
    const isTrue = (d.value === 1 || d.value === true);
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

    if (typeof d.channel === 'number' && d.channel < NUM_CHANNELS) {
        // No modo músico ou técnico mix, ignoramos updates dos faders principais para não bagunçar a visão do AUX
        if (!musicianMode && !technicianMixMode) {
            if (d.type === 'kInputFader/kFader') updateUI(d.channel, d.value, undefined, undefined);
            if (d.type === 'kInputChannelOn/kChannelOn') updateUI(d.channel, undefined, isTrue, undefined);
        }
        if (d.type === 'kSetupSoloChOn/kSoloChOn') updateUI(d.channel, undefined, undefined, isTrue);

        if (d.type === 'kInputPhase/kPhase') {
            channelStates[d.channel].phase = d.value;
            if (activeConfigChannel === d.channel && window.updatePhaseUI) updatePhaseUI(d.channel, d.value);
        }

        if (d.type === 'kInputAttenuator/kAtt') {
            channelStates[d.channel].att = d.value;
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
            channelStates[d.channel].patch = d.value;
            if (activeConfigChannel === d.channel) {
                const nameEl = document.getElementById('currentPatchName');
                if (nameEl && typeof window.getPatchName === 'function') {
                    nameEl.innerText = window.getPatchName(d.value);
                }
            }
        }

        // Suporte a BUS / STEREO (ETC)
        if (d.type && d.type.startsWith('kInputBus/k')) {
            if (d.type === 'kInputBus/kStereo') {
                channelStates[d.channel].stereo = !!d.value;
            } else {
                const busIdx = parseInt(d.type.replace('kInputBus/kBus', '')) - 1;
                if (!channelStates[d.channel].buses) channelStates[d.channel].buses = new Array(8).fill(false);
                channelStates[d.channel].buses[busIdx] = !!d.value;
            }

            if (activeConfigChannel === d.channel && typeof renderRouting === 'function') {
                renderRouting(d.channel);
            }
        }
    } // FIM DO BLOCO DE INPUTS (0-31)

    // --- HANDLERS UNIVERSAIS (INPUTS E OUTS) ---

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
        
        if (typeof updateNameUI === 'function') {
            updateNameUI(d.channel, newName);
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
    if (typeof updateNameUI === 'function') {
        const stateObj = getChannelStateById(data.channel);
        if (stateObj) {
            stateObj.nameChars = (data.name || '').padEnd(16, ' ').substring(0, 16).split('');
        }
        updateNameUI(data.channel, data.name);
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
    if (s.channels) {
        for (let i = 0; i < NUM_CHANNELS; i++) {
            if (s.channels[i]) {
                Object.assign(channelStates[i], s.channels[i]);

                let v = s.channels[i].value;
                let o = s.channels[i].on;

                if (musicianMode || technicianMixMode) {
                    v = s.channels[i][`aux${activeMix}`] || 0;
                    o = s.channels[i][`aux${activeMix}On`] || false;
                }

                const soloBool = !!s.channels[i].solo;
                const onBool = !!o;

                updateUI(i, v, onBool, soloBool);
                const elN = document.getElementById(`name${i}`);
                const newName = s.channels[i].name || `CH ${i + 1}`;
                if (elN && elN.innerText !== newName) {
                    elN.innerText = newName;
                }
            }
        }
    }
    // ... rest of sync (mixes/buses)
    if (s.mixes) {
        for (let i = 0; i < 8; i++) {
            if (s.mixes[i]) {
                Object.assign(mixesState[i], s.mixes[i]);
                updateUI(`m${i}`, s.mixes[i].value, !!s.mixes[i].on);
            }
        }
    }
    if (s.buses) {
        for (let i = 0; i < 8; i++) {
            if (s.buses[i]) {
                Object.assign(busesState[i], s.buses[i]);
                updateUI(`b${i}`, s.buses[i].value, !!s.buses[i].on);
            }
        }
    }
    if (s.master) {
        Object.assign(masterState, s.master);
        updateUI('master', s.master.value, !!s.master.on, undefined);
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
    }
});

socket.on('currentScene', (data) => {
    if (data) {
        window.currentSceneNumber = data.index;
        window.currentSceneName = data.name;
        console.log(`🎬 Cena Atual Atualizada (currentScene): ${window.currentSceneNumber} - ${window.currentSceneName}`);
        if (typeof updateSceneDisplay === 'function') updateSceneDisplay();
    }
});

socket.on('connectionState', (state) => {
    window.isDemoMode = !!state.demo_mode;
    document.body.classList.toggle('is-offline', !state.connected);
    const scn = document.getElementById('scn');
    if (state.connected) {
        scn.innerText = '01V96';
        scn.style.color = '#0f0';
    } else {
        scn.innerText = state.demo_mode ? '01V96 (demo)' : '01V96 (offline)';
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
    if (data.savedConfig && data.savedConfig.tecnico_pass) {
        tecnicoPassword = data.savedConfig.tecnico_pass;
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

window.updateOpenBrowser = function(enabled) {
    socket.emit('updateOpenBrowser', { enabled: enabled });
};

window.resetFaderCache = () => { faderCardsCache = null; };

let smoothedLevels = new Array(64).fill(0);
let lastPeakTime = new Array(64).fill(0);

socket.on('meterData', (levels) => {
    if (musicianMode) return;

    // faderCardsCache é preenchido na primeira execução e invalidado quando a UI é recarregada
    if (!faderCardsCache) {
        // Seleciona cards de ambos os layouts (Mobile/Desktop) e containers (Area/Master)
        faderCardsCache = document.querySelectorAll('.faders-area > .fader-card, .faders-area > .fader-card-desktop, #master-container .fader-card-desktop, #master-container .fader-card');
    }

    requestAnimationFrame(() => {
        if (!faderCardsCache) {
            faderCardsCache = document.querySelectorAll('.faders-area > .fader-card, .faders-area > .fader-card-desktop, #master-container .fader-card-desktop, #master-container .fader-card');
        }
        if (!faderCardsCache || !faderCardsCache.length) return;

        if (outsMode) {
            // No modo OUTS, mapeamos os índices recebidos para Mix/Bus/Master
            // 34-41: Mixes, 42-49: Buses, 32: Stereo Master L
            for (let i = 0; i < faderCardsCache.length; i++) {
                const card = faderCardsCache[i];
                if (!card) continue;

                let levelIdx = -1;
                if (i < 8) levelIdx = 34 + i;       // Mix 1-8
                else if (i < 16) levelIdx = 42 + (i - 8); // Bus 1-8
                else levelIdx = 32;                 // Stereo Master

                if (levelIdx >= 0 && levelIdx < levels.length) {
                    const targetPercent = calibrateStep(levels[levelIdx], levelIdx === 32);
                    smoothedLevels[levelIdx] = (smoothedLevels[levelIdx] * 0.05) + (targetPercent * 0.95);
                    const finalPercent = smoothedLevels[levelIdx];

                    const meterCurtain = card.querySelector('.desk-meter-curtain');
                    const peakLed = card.querySelector('.desk-peak-led') || card.querySelector('.mobile-peak-led');
                    if (meterCurtain) {
                        meterCurtain.style.transform = `scaleY(${1 - (finalPercent / 100)})`;
                    } else {
                        if (!card.classList.contains('has-meter')) card.classList.add('has-meter');
                        card.style.backgroundSize = `100% ${finalPercent}%`;
                    }
                    if (peakLed) {
                        if (finalPercent >= 98) {
                            peakLed.classList.add('active');
                            card.classList.add('peak-glow');
                        } else {
                            peakLed.classList.remove('active');
                            card.classList.remove('peak-glow');
                        }
                    }


                }
            }
        } else {
            // Modo normal: 0-31 Canais, e o último card é o Stereo Master se existir
            for (let i = 0; i < faderCardsCache.length; i++) {
                const card = faderCardsCache[i];
                if (!card) continue;

                let levelIdx = i;
                if (i >= NUM_CHANNELS) levelIdx = 32; // Stereo Master encostado no fim

                if (levelIdx >= 0 && levelIdx < (levels ? levels.length : 0)) {
                    const targetPercent = calibrateStep(levels[levelIdx], levelIdx === 32);
                    smoothedLevels[levelIdx] = (smoothedLevels[levelIdx] * 0.2) + (targetPercent * 0.8);
                    const finalPercent = smoothedLevels[levelIdx];

                    const meterCurtain = card.querySelector('.desk-meter-curtain');
                    const peakLed = card.querySelector('.desk-peak-led') || card.querySelector('.mobile-peak-led');
                    if (meterCurtain) {
                        meterCurtain.style.transform = `scaleY(${1 - (finalPercent / 100)})`;
                    } else {
                        if (!card.classList.contains('has-meter')) card.classList.add('has-meter');
                        card.style.backgroundSize = `100% ${finalPercent}%`;
                    }
                    // Alerta de Peak (Glow no card sempre, LED apenas se existir)
                    const now = Date.now();
                    if (finalPercent >= 98) {
                        lastPeakTime[levelIdx] = now;
                        if (peakLed) peakLed.classList.add('active');
                        card.classList.add('peak-glow');
                    } else if (now - lastPeakTime[levelIdx] > 1000) {
                        // Só limpa se passou mais de 1 segundo desde o último pico
                        if (peakLed) peakLed.classList.remove('active');
                        card.classList.remove('peak-glow');
                    }


                }
            }
        }

        // --- Suporte ao METER do Mini Fader (no modal de config) ---
        if (activeConfigChannel !== null) {
            const miniCard = document.getElementById(`mini-card${activeConfigChannel}`);
            if (miniCard) {
                const levelIdx = activeConfigChannel;
                const targetPercent = calibrateStep(levels[levelIdx], false);
                // Usamos o mesmo array de suavização para manter a consistência
                const finalPercent = smoothedLevels[levelIdx];

                const meterCurtain = miniCard.querySelector('.desk-meter-curtain');
                const peakLed = miniCard.querySelector('.desk-peak-led') || miniCard.querySelector('.mobile-peak-led');

                if (meterCurtain) {
                    meterCurtain.style.transform = `scaleY(${1 - (finalPercent / 100)})`;
                } else {
                    if (!miniCard.classList.contains('has-meter')) miniCard.classList.add('has-meter');
                    miniCard.style.backgroundSize = `100% ${finalPercent}%`; // Layout Mobile
                }

                if (finalPercent >= 98) {
                    if (peakLed) peakLed.classList.add('active');
                    miniCard.classList.add('peak-glow');
                } else {
                    if (peakLed) peakLed.classList.remove('active');
                    miniCard.classList.remove('peak-glow');
                }
            }
        }
    });

    // --- Atualização em tempo real das meters internas de Gate/Comp se o modal estiver aberto ---
    if (activeConfigChannel !== null) {
        const isMaster = activeConfigChannel === 'master';
        const levelIdx = isMaster ? 32 : activeConfigChannel;
        if (levelIdx < levels.length) {
            const source = isMaster ? (window.meterCalibration ? window.meterCalibration.master : null) : (window.meterCalibration ? window.meterCalibration.inputs : null);
            const dbVal = (source && source[levels[levelIdx]]) !== undefined ? source[levels[levelIdx]] : -138;

            const gateMeter = document.getElementById('gateMeter');
            if (gateMeter) gateMeter.style.width = `${mapDynDbToPercent(dbVal * 10, 'gate')}%`;

            const compMeter = document.getElementById('compMeter');
            if (compMeter) compMeter.style.width = `${mapDynDbToPercent(dbVal * 10, 'comp')}%`;
        }

    }
});
