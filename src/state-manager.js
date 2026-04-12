const state = {
    sceneNumber: 0,
    sceneChars: Array(16).fill(' '),
    sceneName: "01V96",
    channels: {},
    mixes: {},
    buses: {},
    master: {
        value: 0,
        on: false,
        name: "MASTER",
        comp: { on: false, thresh: -8, ratio: 2.5, attack: 30, release: 250, gain: 0, knee: 2 },
        eq: {
            on: false,
            mode: 0,
            low: { f: 32, g: 0, q: 20, hpfOn: 0 },
            lowmid: { f: 60, g: 0, q: 20 },
            himid: { f: 84, g: 0, q: 20 },
            high: { f: 108, g: 0, q: 20, lpfOn: 0 }
        }
    }
};

// 🚨 [CRITICAL SYNC LOGIC] - ESTRUTURA DO ESTADO
// Os nomes das chaves em 'gate' e 'comp' (ex: thresh, range, attack) devem ser MANTIDOS EXATAMENTE.
// O frontend e os reducers do socket dependem desses nomes específicos para injetar dados via dynamicsState.
for (let i = 0; i < 32; i++) {
    state.channels[i] = {
        value: 0,
        on: false,
        solo: false,
        phase: 0,
        att: 0,
        patch: 1, // AD1 default
        nameChars: Array(4).fill(' '), // 4 espaços para as letras
        name: `CH ${i + 1}`,
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
    state.mixes[i] = { 
        value: 0, 
        on: false, 
        name: `MIX ${i + 1}`,
        nameChars: Array(16).fill(' ')
    };
    state.buses[i] = { 
        value: 0, 
        on: false, 
        name: `BUS ${i + 1}`,
        nameChars: Array(16).fill(' ')
    };
}

state.master.nameChars = Array(16).fill(' ');

function updateState(d) {
    if (!d) return;
    const { type, channel, value } = d;

    // --- PRIORIDADE: NOMES DE CANAIS ---
    // Deve vir antes da trava de '!state.channels[channel]' para permitir IDs de saídas (36-52)
    if (type === 'updateNameChar') {
        updateChannelNameChar(d.channel, d.charIndex, d.char);
        return; 
    }

    if (type === 'updateSceneChar') {
        updateSceneChar(d.charIndex, d.char);
        return;
    }

    if (type === 'kSceneNumber') {
        state.sceneNumber = value;
        return;
    }



    // Suporte ao Master (Stereo)
    if (channel === 'master' || type.startsWith('kStereo')) {
        if (type === 'kStereoFader/kFader') state.master.value = value;
        if (type === 'kStereoChannelOn/kChannelOn') state.master.on = value;
        if (type === 'kStereoAttenuator/kAtt') state.master.att = value;

        // Master EQ
        if (type.includes('kStereoEQ/')) {
            const eqKey = type.split('/')[1];
            if (eqKey === 'kEQOn') state.master.eq.on = !!value;
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
                if (band === 'eq') state.master.eq[param] = value;
                else state.master.eq[band][param] = value;
            }
        }

        // Master Comp
        if (type.startsWith('kStereoComp/')) {
            const key = type.split('/')[1];
            if (key === 'kCompOn') state.master.comp.on = !!value;
            if (key === 'kCompThreshold') state.master.comp.thresh = value;
            if (key === 'kCompRatio') state.master.comp.ratio = value;
            if (key === 'kCompAttack') state.master.comp.attack = value;
            if (key === 'kCompRelease') state.master.comp.release = value;
            if (key === 'kCompGain') state.master.comp.gain = value;
            if (key === 'kCompKnee') state.master.comp.knee = value;
        }
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

}

// 🚨 [CRITICAL SYNC LOGIC] - NOMES DE CANAIS (PROTOCOL SYNC)
// Permitimos que a array cresça além de 4 conforme o protocolo MIDI.
// O front-end é responsável por limitar a exibição e o input se necessário.
function updateChannelNameChar(channel, charIndex, char) {
    const s = getChannelStateById(channel);
    if (!s) return;
    if (!s.nameChars) s.nameChars = Array(16).fill(' ');
    s.nameChars[charIndex] = char;
    s.name = s.nameChars.join('').trim();
}

function setChannelName(channel, name) {
    const s = getChannelStateById(channel);
    if (!s) return;
    s.name = name;
    s.nameChars = name.padEnd(16, ' ').split('');
}

function getChannelStateById(id) {
    if (id >= 0 && id <= 31) return state.channels[id];
    if (id >= 36 && id <= 43) return state.mixes[id - 36];
    if (id >= 44 && id <= 51) return state.buses[id - 44];
    if (id === 52) return state.master;
    return null;
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