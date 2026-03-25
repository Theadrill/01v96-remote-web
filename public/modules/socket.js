socket.on('update', (d) => {
    const isTrue = (d.value === 1 || d.value === true);
    if (d.channel === 'master' || d.type.startsWith('kStereo')) {
        if (d.type === 'kStereoFader/kFader') updateUI('master', d.value, undefined, undefined);
        if (d.type === 'kStereoChannelOn/kChannelOn') updateUI('master', undefined, isTrue, undefined);
        return;
    }

    if (d.channel < NUM_CHANNELS) {
        // No modo músico, ignoramos updates dos faders principais para não bagunçar a visão do AUX
        if (!musicianMode) {
            if (d.type === 'kInputFader/kFader') updateUI(d.channel, d.value, undefined, undefined);
            if (d.type === 'kInputChannelOn/kChannelOn') updateUI(d.channel, undefined, isTrue, undefined);
        }
        if (d.type === 'kSetupSoloChOn/kSoloChOn') updateUI(d.channel, undefined, undefined, isTrue);
        
        if (d.type === 'kInputPhase/kPhase') {
            channelStates[d.channel].phase = d.value;
            if (activeConfigChannel === d.channel && window.updatePhaseUI) updatePhaseUI(d.channel, d.value);
        }
        
        // Suporte a Auxiliares
        if (d.type.includes('kInputAUX/kAUX')) {
            updateAuxFromSocket(d.channel, d.type, d.value);

            // Se estivermos em modo músico e o update for pro AUX que estou mixando...
            if (musicianMode && d.type.startsWith(`kInputAUX/kAUX${activeMix}`)) {
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
    }
});

socket.on('updateName', (d) => {
    if (d.channel < NUM_CHANNELS) {
        const newName = d.name || `CH ${d.channel + 1}`;
        document.getElementById(`name${d.channel}`).innerText = newName;
        
        // Se este canal for o que está aberto na sidebar, atualiza o título lá tbm
        if (activeConfigChannel === d.channel) {
            const sideTitle = document.getElementById('chSideTitle');
            if (sideTitle) {
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
                
                if (musicianMode) {
                    v = s.channels[i][`aux${activeMix}`] || 0;
                    o = s.channels[i][`aux${activeMix}On`] || false;
                }
                
                updateUI(i, v, o, s.channels[i].solo);
                document.getElementById(`name${i}`).innerText = s.channels[i].name || `CH ${i + 1}`;
            }
        }
        if (s.master) {
            Object.assign(masterState, s.master);
            updateUI('master', s.master.value, s.master.on, undefined);
        }
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

let faderCardsCache = null;
socket.on('meterData', (levels) => {
    if (musicianMode) return; // Músicos não vêem volumes de entrada (referência técnica)
    if (!faderCardsCache) faderCardsCache = document.querySelectorAll('.faders-area > .fader-card');
    requestAnimationFrame(() => {
        for (let i = 0; i < Math.min(NUM_CHANNELS, faderCardsCache.length); i++) {
            const card = faderCardsCache[i];
            if (!card.classList.contains('has-meter')) card.classList.add('has-meter');
            card.style.backgroundSize = `100% ${levels[i]}%`;
        }
    });
});
