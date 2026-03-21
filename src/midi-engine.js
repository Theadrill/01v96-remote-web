const midi = require('midi');
const protocol = require('./protocol');

const input = new midi.Input();
const output = new midi.Output();

function initMIDI(onMessageCallback) {
    let inputPort = -1;
    let outputPort = -1;

    // Busca automática por nome para garantir
    for (let i = 0; i < input.getPortCount(); i++) {
        if (input.getPortName(i).includes('01V96')) {
            inputPort = i;
            break;
        }
    }

    for (let i = 0; i < output.getPortCount(); i++) {
        if (output.getPortName(i).includes('01V96')) {
            outputPort = i;
            break; 
        }
    }

    // PRIORIDADE: Se não achou por nome, usa os índices 0 e 1 que você mencionou
    if (inputPort === -1) inputPort = 0;
    if (outputPort === -1) outputPort = 1;

    try {
        input.openPort(inputPort);
        output.openPort(outputPort);
        
        // Habilita SysEx, Timing e Active Sensing
        input.ignoreTypes(false, false, false);

        console.log(`✅ Entrada MIDI: ${input.getPortName(inputPort)} (Porta ${inputPort})`);
        console.log(`✅ Saída MIDI: ${output.getPortName(outputPort)} (Porta ${outputPort})`);

        input.on('message', (delta, message) => {
            const translated = protocol.parseIncoming(message);
            if (translated) onMessageCallback(translated);
        });

        return true;
    } catch (err) {
        console.error('❌ Erro ao abrir portas MIDI:', err.message);
        return false;
    }
}

function send(msg) {
    if (msg) {
        output.sendMessage(msg);
    }
}

module.exports = { initMIDI, send };