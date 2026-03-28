function openChannelConfig(e, ch) {
    if (musicianMode || technicianMixMode) return; // Músico ou Técnico em modo Mix não abrem config
    if (e.target.closest('button') || e.target.closest('input')) return;
    
    activeConfigChannel = ch;
    updateConfigUIForChannel(ch);
    switchTab('aux');
}

function updateConfigUIForChannel(ch) {
    const chName = document.getElementById(`name${ch}`).innerText;
    document.getElementById('chSideTitle').innerText = `${ch + 1} - ${chName === '...' ? `CH ${ch + 1}` : chName}`;
    
    document.getElementById('chConfigModal').style.display = 'flex';
    document.getElementById('mainNav').style.display = 'none';
    document.getElementById('chNav').style.display = 'flex';
    document.getElementById('chContext').style.display = 'flex';
    
    // Esconde botões de logout ao entrar na config do canal
    const mExit = document.getElementById('musicianExitBtn');
    if (mExit) mExit.style.display = 'none';
    const tExit = document.getElementById('tecnicoExitBtn');
    if (tExit) tExit.style.display = 'none';
    
    if (window.autoScaleTitle) autoScaleTitle();
    
    const cards = document.querySelectorAll('.fader-card');
    cards.forEach(c => c.style.background = ''); 
    if (cards[ch]) cards[ch].style.background = '#15304d';
}

function changeConfigChannel(delta) {
    let nextCh = activeConfigChannel + delta;
    if (nextCh < 0) nextCh = NUM_CHANNELS - 1;
    if (nextCh >= NUM_CHANNELS) nextCh = 0;
    
    activeConfigChannel = nextCh;
    updateConfigUIForChannel(nextCh);

    const activeTab = document.querySelector('.btn-tab.active-tab');
    let tabId = 'aux';
    if (activeTab) {
        const txt = activeTab.innerText.toLowerCase();
        if (txt.includes('eq')) tabId = 'eq';
        else if (txt.includes('dyn')) tabId = 'dyn';
        else tabId = 'aux';
    }
    switchTab(tabId);
}

function closeChannelConfig() {
    if (window.stopEQAnimation) stopEQAnimation();
    document.getElementById('chConfigModal').style.display = 'none';
    document.getElementById('mainNav').style.display = 'flex';
    document.getElementById('chNav').style.display = 'none';
    document.getElementById('chContext').style.display = 'none';

    // Mostra botões de logout de volta ao sair
    if (musicianMode) {
        const mExit = document.getElementById('musicianExitBtn');
        if (mExit) mExit.style.display = 'block';
    } else {
        const tExit = document.getElementById('tecnicoExitBtn');
        if (tExit) tExit.style.display = 'block';
    }
    
    // Reseta cores dos cards
    document.querySelectorAll('.fader-card').forEach(c => c.style.background = '');
}

function toggleState(type, ch) {
    let val = false;
    let s;
    let actualType = type;

    if (ch === 'master') s = masterState;
    else if (typeof ch === 'string' && ch.startsWith('m')) s = mixesState[ch.substring(1)];
    else if (typeof ch === 'string' && ch.startsWith('b')) s = busesState[ch.substring(1)];
    else s = channelStates[ch];

    // Se no modo músico ou técnico editando mix, o tipo base recebido (kInputChannelOn) vira o AUX ativo
    if ((musicianMode || technicianMixMode) && typeof ch === 'number' && type === 'kInputChannelOn/kChannelOn') {
        actualType = `kInputAUX/kAUX${activeMix}On`;
    }

    // Lógica Genérica de Toggle para Booleanos
    if (actualType.includes('On') || actualType.includes('Solo')) {
        let currentOn;
        if ((musicianMode || technicianMixMode) && typeof ch === 'number' && actualType.includes('kInputAUX/kAUX')) {
             currentOn = s[`aux${activeMix}On`] || false;
        } else {
             currentOn = actualType.includes('Solo') ? s.solo : s.on;
        }
        
        val = !currentOn;
        
        // Atualiza a visualização local
        if (actualType.includes('Solo')) {
            updateUI(ch, undefined, undefined, val);
        } else {
            updateUI(ch, undefined, val, undefined);
        }
    }
    
    // Para Mix/Bus, o canal emitido é o número após m/b
    const emitCh = (typeof ch === 'string' && (ch.startsWith('m') || ch.startsWith('b'))) ? parseInt(ch.substring(1)) : (ch === 'master' ? 0 : ch);
    socket.emit('control', { type: actualType, channel: emitCh, value: val ? 1 : 0 });
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
    let s;
    if (ch === 'master') s = masterState;
    else if (typeof ch === 'string' && ch.startsWith('m')) s = mixesState[ch.substring(1)];
    else if (typeof ch === 'string' && ch.startsWith('b')) s = busesState[ch.substring(1)];
    else s = channelStates[ch];

    let currentVal = ((musicianMode || technicianMixMode) && typeof ch === 'number') ? (s[`aux${activeMix}`] || 0) : s.value;
    let nRaw = currentVal + dir;
    if (nRaw < 0) nRaw = 0; if (nRaw > 1023) nRaw = 1023;
    updateUI(ch, nRaw, undefined, undefined);
    
    let typeFader = (ch === 'master') ? 'kStereoFader/kFader' : 'kInputFader/kFader';
    if ((musicianMode || technicianMixMode) && typeof ch === 'number') {
        typeFader = `kInputAUX/kAUX${activeMix}Level`;
    } else if (typeof ch === 'string' && ch.startsWith('m')) {
        typeFader = 'kAUXFader/kFader';
    } else if (typeof ch === 'string' && ch.startsWith('b')) {
        typeFader = 'kBusFader/kFader';
    }

    const emitCh = (typeof ch === 'string' && (ch.startsWith('m') || ch.startsWith('b'))) ? parseInt(ch.substring(1)) : (ch === 'master' ? 0 : ch);
    socket.emit('control', { type: typeFader, channel: emitCh, value: nRaw });
}

function faderInput(e, ch) {
    if (!e.isTrusted) return;
    const v = parseInt(e.target.value);
    updateUI(ch, v, undefined, undefined);
    
    let typeFader = (ch === 'master') ? 'kStereoFader/kFader' : 'kInputFader/kFader';
    if ((musicianMode || technicianMixMode) && typeof ch === 'number') {
        typeFader = `kInputAUX/kAUX${activeMix}Level`;
    } else if (typeof ch === 'string' && ch.startsWith('m')) {
        typeFader = 'kAUXFader/kFader';
    } else if (typeof ch === 'string' && ch.startsWith('b')) {
        typeFader = 'kBusFader/kFader';
    }

    const emitCh = (typeof ch === 'string' && (ch.startsWith('m') || ch.startsWith('b'))) ? parseInt(ch.substring(1)) : (ch === 'master' ? 0 : ch);
    socket.emit('control', { type: typeFader, channel: emitCh, value: v });
}
