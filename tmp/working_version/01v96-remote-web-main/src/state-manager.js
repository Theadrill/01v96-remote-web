const state = {
    sceneChars: Array(16).fill(' '),
    sceneName: "01V96",
    channels: {},
    mixes: {},
    buses: {},
    master: { value: 0, on: false, name: "MASTER" }
};

// Inicia os 32 canais e 8 mixes/buses vazios
for (let i = 0; i < 32; i++) {
    state.channels[i] = {
        value: 0,
        on: false,
        solo: false,
        phase: 0,
        att: 0,
        patch: 1, // AD1 default
        nameChars: Array(4).fill(' '), // 4 espaços para as letras
        name: `CH ${i+1}`,
        gate: { on: false, thresh: -26, range: -60, attack: 0, hold: 20, decay: 50 },
        comp: { on: false, thresh: -8, ratio: 2.5, attack: 30, release: 250, gain: 0, knee: 2 },
        buses: Array(8).fill(false), // Novo: Assignments para Bus 1-8
        stereo: true, // Novo: On/Off no barramento L/R Stereo
        eq: {
            on: false,
            mode: 0,
            low: { f: 32, g: 0, q: 20, hpfOn: 0 },    // 100Hz, 0dB
            lowmid: { f: 60, g: 0, q: 20 },           // 500Hz, 0dB
            himid: { f: 84, g: 0, q: 20 },            // 2kHz, 0dB
            high: { f: 108, g: 0, q: 20, lpfOn: 0 }   // 8kHz, 0dB
        }
    };
}

for (let i = 0; i < 8; i++) {
    state.mixes[i] = { value: 0, on: false, name: `MIX ${i+1}` };
    state.buses[i] = { value: 0, on: false, name: `BUS ${i+1}` };
}

function updateState(d) {
    if (!d) return;
    const { type, channel, value } = d;
    if (channel === 'master' || type.startsWith('kStereo')) {
        if (type === 'kStereoFader/kFader') state.master.value = value;
        if (type === 'kStereoChannelOn/kChannelOn') state.master.on = value;
        return;
    }

    // Suporte a Mixes (AUX Master)
    if (type.startsWith('kAUX')) {
        if (!state.mixes[channel]) return;
        if (type === 'kAUXFader/kFader') state.mixes[channel].value = value;
        if (type === 'kAUXChannelOn/kChannelOn') state.mixes[channel].on = value;
        return;
    }

    // Suporte a Buses (Bus Master)
    if (type.startsWith('kBus')) {
        if (!state.buses[channel]) return;
        if (type === 'kBusFader/kFader') state.buses[channel].value = value;
        if (type === 'kBusChannelOn/kChannelOn') state.buses[channel].on = value;
        return;
    }

    if (!state.channels[channel]) return;
    if (type === 'kInputFader/kFader') state.channels[channel].value = value;
    if (type === 'kInputChannelOn/kChannelOn') state.channels[channel].on = value;
    if (type === 'kSetupSoloChOn/kSoloChOn') state.channels[channel].solo = value;
    if (type === 'kInputPhase/kPhase') state.channels[channel].phase = value;
    if (type === 'kInputAttenuator/kAtt') state.channels[channel].att = value;
    if (type === 'kChannelInput/kChannelIn') state.channels[channel].patch = value;

    if (type.includes('kInputAUX/kAUX')) {
        const auxMatch = type.match(/kInputAUX\/kAUX(\d+)(Level|On)/);
        if (auxMatch) {
            const auxIdx = auxMatch[1];
            if (auxMatch[2] === 'Level') state.channels[channel][`aux${auxIdx}`] = value;
            if (auxMatch[2] === 'On') state.channels[channel][`aux${auxIdx}On`] = value;
        }
    }

    // Suporte a EQ (Elemento 32)
    if (type.includes('kInputEQ/')) {
        const eqKey = type.split('/')[1];
        if (eqKey === 'kEQOn') state.channels[channel].eq.on = !!value;
        
        const map = {
            'kEQLowF': ['low', 'f'], 'kEQLowG': ['low', 'g'], 'kEQLowQ': ['low', 'q'],
            'kEQHPFOn': ['low', 'hpfOn'],
            'kEQLowMidF': ['lowmid', 'f'], 'kEQLowMidG': ['lowmid', 'g'], 'kEQLowMidQ': ['lowmid', 'q'],
            'kEQHiMidF': ['himid', 'f'], 'kEQHiMidG': ['himid', 'g'], 'kEQHiMidQ': ['himid', 'q'],
            'kEQHiF': ['high', 'f'], 'kEQHiG': ['high', 'g'], 'kEQHiQ': ['high', 'q'],
            'kEQLPFOn': ['high', 'lpfOn'],
            'kEQMode': ['eq', 'mode']
        };

        if (map[eqKey]) {
            const [band, param] = map[eqKey];
            if (band === 'eq') {
                state.channels[channel].eq[param] = value;
            } else {
                state.channels[channel].eq[band][param] = value;
            }
        }
    }

    // Suporte a Gate
    if (type.startsWith('kInputGate/')) {
        const key = type.split('/')[1];
        if (key === 'kGateOn') state.channels[channel].gate.on = !!value;
        if (key === 'kGateThreshold') state.channels[channel].gate.thresh = value;
        if (key === 'kGateAttack') state.channels[channel].gate.attack = value;
        if (key === 'kGateRange') state.channels[channel].gate.range = value;
        if (key === 'kGateHold') state.channels[channel].gate.hold = value;
        if (key === 'kGateDecay') state.channels[channel].gate.decay = value;
    }

    // Suporte a Compressor
    if (type.startsWith('kInputComp/')) {
        const key = type.split('/')[1];
        if (key === 'kCompOn') state.channels[channel].comp.on = !!value;
        if (key === 'kCompThreshold') state.channels[channel].comp.thresh = value;
        if (key === 'kCompRatio') state.channels[channel].comp.ratio = value;
        if (key === 'kCompAttack') state.channels[channel].comp.attack = value;
        if (key === 'kCompRelease') state.channels[channel].comp.release = value;
        if (key === 'kCompGain') state.channels[channel].comp.gain = value;
        if (key === 'kCompKnee') state.channels[channel].comp.knee = value;
    }

    // Suporte a BUS / STEREO
    if (type.startsWith('kInputBus/k')) {
        if (type === 'kInputBus/kStereo') {
            if (state.channels[channel]) state.channels[channel].stereo = !!value;
        } else {
            const busIdx = parseInt(type.replace('kInputBus/kBus', '')) - 1;
            if (state.channels[channel]) {
                state.channels[channel].buses[busIdx] = !!value;
            }
        }
    }

    // Suporte a Letras de Nomes
    if (type === 'updateNameChar') {
        updateChannelNameChar(d.channel, d.charIndex, d.char);
    }
}

// Junta a letrinha nova com as outras e forma o nome do Canal
function updateChannelNameChar(channel, charIndex, char) {
    if (!state.channels[channel]) return;
    state.channels[channel].nameChars[charIndex] = char;
    state.channels[channel].name = state.channels[channel].nameChars.join('').trim();
}

function setChannelName(channel, name) {
    if (!state.channels[channel]) return;
    state.channels[channel].name = name;
    state.channels[channel].nameChars = name.padEnd(4, ' ').split('');
}

function updateSceneChar(index, char) {
    state.sceneChars[index] = char;
    state.sceneName = state.sceneChars.join('').trim();
}

function getFullSceneName() {
    return state.sceneName;
}

function getState() {
    return state;
}

module.exports = { 
    updateState, 
    updateChannelNameChar, 
    setChannelName,
    updateSceneChar, 
    getFullSceneName, 
    getState 
};