function openChannelConfig(e, ch) {
    const isHeader = e.target.closest('.card-title') || e.target.closest('.ch-name');
    if (!isHeader) return;
    
    activeConfigChannel = ch;
    
    // Atualiza o nome do canal na SIDEBAR
    const chName = document.getElementById(`name${ch}`).innerText;
    document.getElementById('chSideName').innerText = chName === '...' ? `CH ${ch + 1}` : chName;
    
    // Mostra o modal e troca botões da sidebar para modo contexto
    document.getElementById('chConfigModal').style.display = 'flex';
    document.getElementById('mainNav').style.display = 'none';
    document.getElementById('chNav').style.display = 'flex';
    document.getElementById('chContext').style.display = 'flex';
    
    // Força a aba inicial do canal ser sempre AUX
    switchTab('aux');
    
    // Mantém o feedback visual de seleção no fundo
    document.querySelectorAll('.fader-card').forEach(c => c.style.background = '#222');
    e.currentTarget.style.background = '#15304d'; 
}

function closeChannelConfig() {
    if (window.stopEQAnimation) stopEQAnimation();
    document.getElementById('chConfigModal').style.display = 'none';
    document.getElementById('mainNav').style.display = 'flex';
    document.getElementById('chNav').style.display = 'none';
    document.getElementById('chContext').style.display = 'none';
}

function toggleState(type, ch) {
    let val = false;
    let s = (ch === 'master') ? masterState : channelStates[ch];

    if (type === 'kInputChannelOn/kChannelOn' || type === 'kStereoChannelOn/kChannelOn') { 
        val = !s.on; 
        updateUI(ch, undefined, val, undefined); 
    } else if (type === 'kSetupSoloChOn/kSoloChOn') { 
        val = !s.solo; 
        updateUI(ch, undefined, undefined, val); 
    }
    
    const emitCh = (ch === 'master') ? 0 : ch;
    socket.emit('control', { type, channel: emitCh, value: val ? 1 : 0 });
}

let nudgeTimeout = null;
let nudgeInterval = null;

function startNudge(ch, dir) {
    stopNudge(); 
    nudgeFader(ch, dir); 
    
    nudgeTimeout = setTimeout(() => {
        nudgeInterval = setInterval(() => {
            nudgeFader(ch, dir * 3);
        }, 80); 
    }, 500);
}

function stopNudge() {
    if (nudgeTimeout) clearTimeout(nudgeTimeout);
    if (nudgeInterval) clearInterval(nudgeInterval);
    nudgeTimeout = null;
    nudgeInterval = null;
}

function nudgeFader(ch, dir) {
    let s = (ch === 'master') ? masterState : channelStates[ch];
    let nRaw = s.value + dir;
    if (nRaw < 0) nRaw = 0; if (nRaw > 1023) nRaw = 1023;
    updateUI(ch, nRaw, undefined, undefined);
    
    const typeFader = (ch === 'master') ? 'kStereoFader/kFader' : 'kInputFader/kFader';
    socket.emit('control', { type: typeFader, channel: (ch === 'master' ? 0 : ch), value: nRaw });
}

function faderInput(e, ch) {
    if (!e.isTrusted) return;
    const v = parseInt(e.target.value);
    updateUI(ch, v, undefined, undefined);
    
    const typeFader = (ch === 'master') ? 'kStereoFader/kFader' : 'kInputFader/kFader';
    socket.emit('control', { type: typeFader, channel: (ch === 'master' ? 0 : ch), value: v });
}
