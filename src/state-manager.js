/**
 * O State Manager funciona como o "Single Source of Truth" (Fonte Única da Verdade).
 * Ele armazena o estado atual de cada fader e parâmetro da mesa.
 */

const state = {
    // Nome da cena (armazenado como array de 16 caracteres para facilitar atualização individual)
    sceneName: new Array(16).fill(' '),
    
    // Canais de entrada (1 a 32). Usamos um objeto onde a chave é o índice (0-31)
    channels: {},
    
    // Auxiliares (1 a 8)
    aux: {},
};

// Inicializa os canais com valores padrão para evitar erros de 'undefined'
for (let i = 0; i < 32; i++) {
    state.channels[i] = {
        value: 0,
        on: true,
        name: `CH ${i + 1}`
    };
}

/**
 * Atualiza um valor no estado global
 * @param {string} type - Tipo de parâmetro (FADER_INPUT, MUTE_INPUT, etc)
 * @param {number} channel - Índice do canal
 * @param {any} value - Novo valor
 */
function updateState(type, channel, value) {
    if (type === 'FADER_INPUT') {
        if (state.channels[channel]) state.channels[channel].value = value;
    } 
    else if (type === 'MUTE_INPUT') {
        if (state.channels[channel]) state.channels[channel].on = value;
    }
}

/**
 * Atualiza uma letra específica do nome da cena
 * @param {number} index - Posição (0-15)
 * @param {string} char - Caractere ASCII
 */
function updateSceneChar(index, char) {
    state.sceneName[index] = char;
}

/**
 * Retorna o nome da cena como uma string limpa
 */
function getFullSceneName() {
    return state.sceneName.join('').trim();
}

/**
 * Retorna todo o estado para sincronizar novos clientes
 */
function getState() {
    return {
        sceneName: getFullSceneName(),
        channels: state.channels
    };
}

module.exports = {
    updateState,
    updateSceneChar,
    getState,
    getFullSceneName
};