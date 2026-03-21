socket.on('update', (d) => {
    if (d.channel < NUM_CHANNELS) {
        const isTrue = (d.value === 1 || d.value === true);
        if (d.type === 'FADER_INPUT') updateUI(d.channel, d.value, undefined, undefined);
        if (d.type === 'MUTE_INPUT') updateUI(d.channel, undefined, isTrue, undefined);
        if (d.type === 'SOLO_INPUT') updateUI(d.channel, undefined, undefined, isTrue);
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
                updateUI(i, s.channels[i].value, s.channels[i].on, s.channels[i].solo);
                document.getElementById(`name${i}`).innerText = s.channels[i].name || `CH ${i + 1}`;
            }
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
