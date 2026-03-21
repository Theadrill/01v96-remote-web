function openChannelConfig(e, ch) {
    if (['INPUT', 'BUTTON', 'SELECT'].includes(e.target.tagName) || e.target.closest('.nudge-zone')) return;
    
    document.querySelectorAll('.fader-card').forEach(c => c.style.background = '#222');
    
    if (activeConfigChannel === ch) {
        activeConfigChannel = null;
    } else {
        activeConfigChannel = ch;
        e.currentTarget.style.background = '#15304d'; // Azul escuro moderno e sutil
    }
}

function toggleState(type, ch) {
    let val = false;
    if (type === 'MUTE_INPUT') { 
        val = !channelStates[ch].on; 
        updateUI(ch, undefined, val, undefined); 
    } else if (type === 'SOLO_INPUT') { 
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
    socket.emit('control', { type: 'FADER_INPUT', channel: ch, value: nRaw });
}

function faderInput(e, ch) {
    if (!e.isTrusted) return;
    const v = parseInt(e.target.value);
    updateUI(ch, v, undefined, undefined);
    socket.emit('control', { type: 'FADER_INPUT', channel: ch, value: v });
}
