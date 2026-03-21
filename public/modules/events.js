function openChannelConfig(e, ch) {
    if (['INPUT', 'BUTTON', 'SELECT'].includes(e.target.tagName) || e.target.closest('.nudge-zone')) return;
    
    activeConfigChannel = ch;
    
    // Atualiza o nome do canal na SIDEBAR
    const chName = document.getElementById(`name${ch}`).innerText;
    document.getElementById('chSideName').innerText = chName === '...' ? `CH ${ch + 1}` : chName;
    
    // Mostra o modal e troca botões da sidebar para modo contexto
    document.getElementById('chConfigModal').style.display = 'flex';
    document.getElementById('mainNav').style.display = 'none';
    document.getElementById('chNav').style.display = 'flex';
    document.getElementById('chContext').style.display = 'flex';
    
    // Força a aba inicial do canal ser sempre EQ
    switchTab('eq');
    
    // Mantém o feedback visual de seleção no fundo
    document.querySelectorAll('.fader-card').forEach(c => c.style.background = '#222');
    e.currentTarget.style.background = '#15304d'; 
}

function closeChannelConfig() {
    document.getElementById('chConfigModal').style.display = 'none';
    document.getElementById('mainNav').style.display = 'flex';
    document.getElementById('chNav').style.display = 'none';
    document.getElementById('chContext').style.display = 'none';
}

function toggleState(type, ch) {
    let val = false;
    if (type === 'kInputChannelOn/kChannelOn') { 
        val = !channelStates[ch].on; 
        updateUI(ch, undefined, val, undefined); 
    } else if (type === 'kSetupSoloChOn/kSoloChOn') { 
        val = !channelStates[ch].solo; 
        updateUI(ch, undefined, undefined, val); 
    }
    socket.emit('control', { type, channel: ch, value: val ? 1 : 0 });
}

let nudgeStepDB = 0.50; 
let nudgeTimeout = null;
let nudgeInterval = null;

function startNudge(ch, dir) {
    stopNudge(); 
    nudgeFader(ch, dir); 
    
    nudgeTimeout = setTimeout(() => {
        nudgeInterval = setInterval(() => {
            nudgeFader(ch, dir);
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
    let db = (channelStates[ch].value === 0) ? -138.0 : parseFloat(rawToDb(channelStates[ch].value));
    let nRaw = dbToRaw(db + (nudgeStepDB * dir));
    
    if (nRaw === channelStates[ch].value) nRaw = channelStates[ch].value + dir;
    if (nRaw < 0) nRaw = 0; if (nRaw > 1023) nRaw = 1023;
    updateUI(ch, nRaw, undefined, undefined);
    socket.emit('control', { type: 'kInputFader/kFader', channel: ch, value: nRaw });
}

function faderInput(e, ch) {
    if (!e.isTrusted) return;
    const v = parseInt(e.target.value);
    updateUI(ch, v, undefined, undefined);
    socket.emit('control', { type: 'kInputFader/kFader', channel: ch, value: v });
}
