socket.on('update', (d) => {
    const isTrue = (d.value === 1 || d.value === true);
    if (d.channel === 'master' || d.type.startsWith('kStereo')) {
        if (d.type === 'kStereoFader/kFader') updateUI('master', d.value, undefined, undefined);
        if (d.type === 'kStereoChannelOn/kChannelOn') updateUI('master', undefined, isTrue, undefined);
        return;
    }

    if (d.channel < NUM_CHANNELS) {
        if (d.type === 'kInputFader/kFader') updateUI(d.channel, d.value, undefined, undefined);
        if (d.type === 'kInputChannelOn/kChannelOn') updateUI(d.channel, undefined, isTrue, undefined);
        if (d.type === 'kSetupSoloChOn/kSoloChOn') updateUI(d.channel, undefined, undefined, isTrue);
        
        if (d.type === 'kInputPhase/kPhase') {
            channelStates[d.channel].phase = d.value;
            if (activeConfigChannel === d.channel && window.updatePhaseUI) updatePhaseUI(d.channel, d.value);
        }
        
        // Suporte a Auxiliares
        if (d.type.includes('kInputAUX/kAUX')) {
            updateAuxFromSocket(d.channel, d.type, d.value);
        }

        // Suporte a EQ
        if (d.type.includes('kInputEQ/')) {
            if (activeConfigChannel === d.channel && window.updateEQParam) {
                window.updateEQParam(d.type, d.value);
            }
        }
    }
});

socket.on('updateName', (d) => {
    if (d.channel < NUM_CHANNELS) {
        document.getElementById(`name${d.channel}`).innerText = d.name || `CH ${d.channel + 1}`;
    }
});

socket.on('sync', (s) => {
    if (s.channels) {
        for (let i = 0; i < NUM_CHANNELS; i++) {
            if (s.channels[i]) {
                Object.assign(channelStates[i], s.channels[i]);
                updateUI(i, s.channels[i].value, s.channels[i].on, s.channels[i].solo);
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
    document.getElementById('sin').innerHTML = data.available.inputs.map(p => `<option value="${p.id}">IN: ${p.name}</option>`).join('');
    document.getElementById('sout').innerHTML = data.available.outputs.map(p => `<option value="${p.id}">OUT: ${p.name}</option>`).join('');
    
    if (data.savedConfig && data.savedConfig.inIdx !== null && data.savedConfig.outIdx !== null) {
        document.getElementById('sin').value = String(data.savedConfig.inIdx);
        document.getElementById('sout').value = String(data.savedConfig.outIdx);
        conn(); 
    } else { 
        document.getElementById('configModal').style.display='flex'; 
    }
});

let faderCardsCache = null;
socket.on('meterData', (levels) => {
    if (!faderCardsCache) faderCardsCache = document.querySelectorAll('.faders-area > .fader-card');
    requestAnimationFrame(() => {
        for (let i = 0; i < Math.min(NUM_CHANNELS, faderCardsCache.length); i++) {
            const card = faderCardsCache[i];
            if (!card.classList.contains('has-meter')) card.classList.add('has-meter');
            card.style.backgroundSize = `100% ${levels[i]}%`;
        }
    });
});
