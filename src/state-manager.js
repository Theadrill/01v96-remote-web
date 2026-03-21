const state = {
    sceneChars: Array(16).fill(' '),
    sceneName: "01V96",
    channels: {}
};

// Inicia os 32 canais vazios
for (let i = 0; i < 32; i++) {
    state.channels[i] = {
        value: 0,
        on: false,
        solo: false,
        nameChars: Array(16).fill(' '), // 16 espaços para as letras
        name: `CH ${i+1}`
    };
}

function updateState(type, channel, value) {
    if (!state.channels[channel]) return;
    if (type === 'FADER_INPUT') state.channels[channel].value = value;
    if (type === 'MUTE_INPUT') state.channels[channel].on = value;
    if (type === 'SOLO_INPUT') state.channels[channel].solo = value;
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