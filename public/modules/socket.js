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

        // Suporte a EQ
        if (d.type.includes('kInputEQ/')) {
            if (window.updateEQParam) {
                window.updateEQParam(d.type, d.value, d.mode, d.channel);
            }
        }

        // Suporte a Gate
        if (d.type.startsWith('kInputGate/')) {
            const key = d.type.split('/')[1];
            if (activeConfigChannel === d.channel && typeof updateGateFromSocket === 'function') {
                updateGateFromSocket(d.channel, key, d.value);
            } else {
                // Atualiza apenas o estado sem tocar na UI
                if (!channelStates[d.channel].gate) channelStates[d.channel].gate = {};
                const iMap = { 'kGateOn': 'on', 'kGateThreshold': 'thresh', 'kGateAttack': 'attack', 'kGateRange': 'range', 'kGateHold': 'hold', 'kGateDecay': 'decay' };
                const ik = iMap[key];
                if (ik) channelStates[d.channel].gate[ik] = (key === 'kGateOn' ? !!d.value : d.value);
            }
        }

        // Suporte a Compressor
        if (d.type.startsWith('kInputComp/')) {
            const key = d.type.split('/')[1];
            if (activeConfigChannel === d.channel && typeof updateCompFromSocket === 'function') {
                updateCompFromSocket(d.channel, key, d.value);
            } else {
                // Atualiza apenas o estado sem tocar na UI
                if (!channelStates[d.channel].comp) channelStates[d.channel].comp = {};
                const iMap = { 'kCompOn': 'on', 'kCompThreshold': 'thresh', 'kCompRatio': 'ratio', 'kCompAttack': 'attack', 'kCompRelease': 'release', 'kCompGain': 'gain', 'kCompKnee': 'knee' };
                const ik = iMap[key];
                if (ik) channelStates[d.channel].comp[ik] = (key === 'kCompOn' ? !!d.value : d.value);
            }
        }
    }
});

// Recebe o estado completo do Dynamics para o canal solicitado
socket.on('dynamicsState', (data) => {
    const { channel, gate, comp } = data;

    // Salva sempre no estado local
    if (channelStates[channel]) {
        if (gate) channelStates[channel].gate = { ...channelStates[channel].gate, ...gate };
        if (comp) channelStates[channel].comp = { ...channelStates[channel].comp, ...comp };
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

socket.on('updateName', (d) => {
    if (typeof d.channel === 'number' && d.channel < NUM_CHANNELS) {
        const newName = d.name || `CH ${d.channel + 1}`;
        const el = document.getElementById(`name${d.channel}`);
        if(el && el.innerText !== newName) {
            el.innerText = newName;
        }
        
        // Se este canal for o que está aberto na sidebar, atualiza o título lá tbm
        if (activeConfigChannel === d.channel) {
            const sideTitle = document.getElementById('chSideTitle');
            if (sideTitle && sideTitle.innerText !== `${d.channel + 1} - ${newName}`) {
                sideTitle.innerText = `${d.channel + 1} - ${newName}`;
                if (window.autoScaleTitle) autoScaleTitle();
            }
        }
    }
});

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
                
                updateUI(i, v, o, s.channels[i].solo);
                const elN = document.getElementById(`name${i}`);
                const newName = s.channels[i].name || `CH ${i + 1}`;
                if(elN && elN.innerText !== newName) {
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
                updateUI(`m${i}`, s.mixes[i].value, s.mixes[i].on);
            }
        }
    }
    if (s.buses) {
        for (let i = 0; i < 8; i++) {
            if (s.buses[i]) {
                Object.assign(busesState[i], s.buses[i]);
                updateUI(`b${i}`, s.buses[i].value, s.buses[i].on);
            }
        }
    }
    if (s.master) {
        Object.assign(masterState, s.master);
        updateUI('master', s.master.value, s.master.on, undefined);
    }
});

socket.on('connectionState', (state) => {
    document.body.classList.toggle('is-offline', !state.connected);
    const scn = document.getElementById('scn');
    if (state.connected) {
        scn.innerText = '01V96';
        scn.style.color = '#0f0';
    } else {
        scn.innerText = '01V96 (offline)';
        scn.style.color = '#dc3545';
    }
});

socket.on('portsList', (data) => {
    if (data.savedConfig && data.savedConfig.tecnico_pass) {
        tecnicoPassword = data.savedConfig.tecnico_pass;
    }
    
    const sinEl = document.getElementById('sin');
    const soutEl = document.getElementById('sout');
    if (sinEl) sinEl.innerHTML = data.available.inputs.map(p => `<option value="${p.id}" ${data.savedConfig.inIdx == p.id ? 'selected':''}>IN: ${p.name}</option>`).join('');
    if (soutEl) soutEl.innerHTML = data.available.outputs.map(p => `<option value="${p.id}" ${data.savedConfig.outIdx == p.id ? 'selected':''}>OUT: ${p.name}</option>`).join('');
    
    if (data.savedConfig && data.savedConfig.inIdx !== null && data.savedConfig.outIdx !== null) {
        conn(); 
    } else { 
        document.getElementById('configModal').style.display='flex'; 
    }
    // Sincroniza o modo demo e opacidade
    const demoBtn = document.getElementById('demoBtn');
    const opacitySlider = document.getElementById('meterOpacity');
    const opacityValSpan = document.getElementById('opacityVal');

    if (data.savedConfig) {
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
    }
});

window.resetFaderCache = () => { faderCardsCache = null; };

socket.on('meterData', (levels) => {
    if (musicianMode) return; 

    if (!faderCardsCache) {
        // Seleciona cards de ambos os layouts (Mobile/Desktop) e containers (Area/Master)
        faderCardsCache = document.querySelectorAll('.faders-area > .fader-card, .faders-area > .fader-card-desktop, #master-container > .fader-card-desktop, #master-container > .fader-card');
    }
    
    requestAnimationFrame(() => {
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
                    const meterBar = card.querySelector('.desk-meter-bar');
                    if (meterBar) {
                        meterBar.style.height = `${levels[levelIdx]}%`;
                    } else {
                        if (!card.classList.contains('has-meter')) card.classList.add('has-meter');
                        card.style.backgroundSize = `100% ${levels[levelIdx]}%`;
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

                if (levelIdx >= 0 && levelIdx < levels.length) {
                    const meterBar = card.querySelector('.desk-meter-bar');
                    if (meterBar) {
                        meterBar.style.height = `${levels[levelIdx]}%`;
                    } else {
                        if (!card.classList.contains('has-meter')) card.classList.add('has-meter');
                        card.style.backgroundSize = `100% ${levels[levelIdx]}%`;
                    }
                }
            }
        }
    });

    // --- Atualização em tempo real das meters internas de Gate/Comp se o modal estiver aberto ---
    if (activeConfigChannel !== null && activeConfigChannel < levels.length) {
        const inputLevel = levels[activeConfigChannel];
        const gateMeter = document.getElementById('gateMeter');
        const compMeter = document.getElementById('compMeter');
        
        if (gateMeter) {
            gateMeter.style.width = `${inputLevel}%`;
        }
        if (compMeter) {
            compMeter.style.width = `${inputLevel}%`;
        }
    }
});
