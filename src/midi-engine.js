const midi = require('midi');
const protocol = require('./protocol');
const syncCounter = require('./sync-counter');



// Deixamos as variáveis globais, mas sem instanciar o 'new' ainda
let input = null;
let output = null;


function getAvailablePorts() {
    const inputs = [];
    const outputs = [];
    try {
        const tempIn = new midi.Input();
        const tempOut = new midi.Output();
        
        for (let i = 0; i < tempIn.getPortCount(); i++) {
            inputs.push({ id: i, name: tempIn.getPortName(i) });
        }
        
        for (let i = 0; i < tempOut.getPortCount(); i++) {
            outputs.push({ id: i, name: tempOut.getPortName(i) });
        }
        
        // Importante: destruir os temporários para libertar o driver do Windows
        tempIn.closePort(); 
        tempOut.closePort();
    } catch (e) {
        console.error("Erro ao listar portas:", e);
    }
    return { inputs, outputs };
}

let currentInIdx = -1;
let currentOutIdx = -1;

function connectPorts(inputIdx, outputIdx, onMessageCallback) {
    try {
        const inIdx = parseInt(inputIdx);
        const outIdx = parseInt(outputIdx);

        // Se já estivermos conectados EXATAMENTE nessas portas, não fazemos nada
        if (input && output && currentInIdx === inIdx && currentOutIdx === outIdx) {
            console.log(`ℹ️ [MIDI] Portas já conectadas (${inIdx}, ${outIdx}). Ignorando re-conexão.`);
            return { success: true, inName: input.getPortName(inIdx), alreadyConnected: true };
        }

        // Se já existirem instâncias abertas mas as portas mudaram, limpamos tudo primeiro
        if (input) { try { input.closePort(); } catch(e){} }
        if (output) { try { output.closePort(); } catch(e){} }
        syncCounter.reset(); // Zera os pendentes


        // Criamos as instâncias NO MOMENTO exato da conexão
        input = new midi.Input();
        output = new midi.Output();

        // Abre as portas que o usuário escolheu no frontend
        input.openPort(inIdx);
        output.openPort(outIdx);
        currentInIdx = inIdx;
        currentOutIdx = outIdx;
        
        // Habilita SysEx IMEDIATAMENTE após abrir a porta (Essencial para a Yamaha)
        input.ignoreTypes(false, false, false);

        // Escuta as mensagens vindas da mesa física
        input.on('message', (delta, message) => {
            // ?? [CRITICAL SYNC LOGIC] - O ESCUDO ANTI-LOOP
            // O Studio Manager incrementa um contador ao enviar params, e se a mesa devolver o mesmo log (eco param-change 0x1n), ele descarta.
            if (message && message.length > 2 && (message[2] & 0xF0) === 0x10) {
                // Meters nunca entram na conta de ecos! As repostas do hardware usam group 32/33.
                const isMeter = message.length > 20 && (message[5] === 33 || message[5] === 32);
                if (!isMeter) {
                    if (syncCounter.shouldIgnore()) return; // Aborta! É apenas um eco do que nós mesmos acabamos de enviar
                }
            }

            // Se recebemos qualquer dado, a mesa está viva
            if (onMessageCallback) {
                onMessageCallback({ type: 'HEARTBEAT' });
                
                // Passa para o tradutor (protocol.js) ver se é algo útil
                const translated = protocol.parseIncoming(message);
                
                if (translated) {
                    onMessageCallback(translated, message);
                } else {
                    // Se não foi traduzido como parâmetro conhecido, ainda assim enviamos o RAW para módulos independentes
                    onMessageCallback({ type: 'RAW_MIDI' }, message);
                }
            }
        });

        console.log(`✅ Portas MIDI Vinculadas com Sucesso.`);
        return { success: true, inName: input.getPortName(parseInt(inputIdx)) };
    } catch (err) {
        console.error("Erro fatal ao conectar MIDI:", err);
        return { success: false, error: err.message };
    }
}

function send(msg) {
    if (output && msg) {
        try {
            // Se estamos enviando um Command Byte de Modificação Paramétrica (0x1n), sinalizamos ao Anti-Loop
            if (msg.length > 2 && (msg[2] & 0xF0) === 0x10) {
                syncCounter.beginSync();
            }

            output.sendMessage(msg);
            return true;

        } catch (e) {
            console.error("❌ Erro fatal ao enviar MIDI (Cabo desconectado?):", e.message);
            return false;
        }
    }
    return false;
}

module.exports = { getAvailablePorts, connectPorts, send };