const state = {
    sceneChars: Array(16).fill(' '),
    sceneName: "01V96",
    channels: {},
    master: { value: 0, on: false, name: "MASTER" }
};

// Inicia os 32 canais vazios
for (let i = 0; i < 32; i++) {
    state.channels[i] = {
        value: 0,
        on: false,
        solo: false,
        phase: 0,
        att: 0,
        nameChars: Array(16).fill(' '), // 16 espaços para as letras
        name: `CH ${i+1}`,
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

function updateState(type, channel, value) {
    if (channel === 'master' || type.startsWith('kStereo')) {
        if (type === 'kStereoFader/kFader') state.master.value = value;
        if (type === 'kStereoChannelOn/kChannelOn') state.master.on = value;
        return;
    }

    if (!state.channels[channel]) return;
    if (type === 'kInputFader/kFader') state.channels[channel].value = value;
    if (type === 'kInputChannelOn/kChannelOn') state.channels[channel].on = value;
    if (type === 'kSetupSoloChOn/kSoloChOn') state.channels[channel].solo = value;
    if (type === 'kInputPhase/kPhase') state.channels[channel].phase = value;
    if (type === 'kInputAttenuator/kAtt') state.channels[channel].att = value;

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
}

// Junta a letrinha nova com as outras e forma o nome do Canal
function updateChannelNameChar(channel, charIndex, char) {
    if (!state.channels[channel]) return;
    state.channels[channel].nameChars[charIndex] = char;
    state.channels[channel].name = state.channels[channel].nameChars.join('').trim();
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

module.exports = { updateState, updateChannelNameChar, updateSceneChar, getFullSceneName, getState };