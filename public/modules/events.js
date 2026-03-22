function openChannelConfig(e, ch) {
    if (e.target.closest('button') || e.target.closest('input')) return;
    
    activeConfigChannel = ch;
    updateConfigUIForChannel(ch);
    switchTab('aux');
}

function updateConfigUIForChannel(ch) {
    const chName = document.getElementById(`name${ch}`).innerText;
    document.getElementById('chSideName').innerText = chName === '...' ? `CH ${ch + 1}` : chName;
    
    document.getElementById('chConfigModal').style.display = 'flex';
    document.getElementById('mainNav').style.display = 'none';
    document.getElementById('chNav').style.display = 'flex';
    document.getElementById('chContext').style.display = 'flex';
    
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
    
    // Reseta cores dos cards
    document.querySelectorAll('.fader-card').forEach(c => c.style.background = '');
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
