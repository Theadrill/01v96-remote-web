const midi = require('midi');
const protocol = require('./protocol');

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

function connectPorts(inputIdx, outputIdx, onMessageCallback) {
    try {
        // Se já existirem instâncias abertas, limpamos tudo primeiro
        if (input) { try { input.closePort(); } catch(e){} }
        if (output) { try { output.closePort(); } catch(e){} }

        // Criamos as instâncias NO MOMENTO exato da conexão
        input = new midi.Input();
        output = new midi.Output();

        // Abre as portas que o usuário escolheu no frontend
        input.openPort(parseInt(inputIdx));
        output.openPort(parseInt(outputIdx));
        
        // Habilita SysEx IMEDIATAMENTE após abrir a porta (Essencial para a Yamaha)
        input.ignoreTypes(false, false, false);

        // Escuta as mensagens vindas da mesa física
        input.on('message', (delta, message) => {
            // Se recebemos qualquer dado, a mesa está viva
            if (onMessageCallback) {
                onMessageCallback({ type: 'HEARTBEAT' });
                
                // Passa para o tradutor (protocol.js) ver se é algo útil
                const translated = protocol.parseIncoming(message);
                
                if (translated) {
                    onMessageCallback(translated);
                } else {
                    // Filtro para focarmos apenas no que NÃO catalogamos ainda
                    // Vamos ignorar tbm os heartbeats conhecidos [F0, 43, 10, 3E, 0D, 7F, F7]
                    const hex = Buffer.from(message).toString('hex').toUpperCase();
                    const isHearbeat = (hex === 'F043103E0D7FF7');
                    const isYamaha = (message[0] === 0xF0 && message[1] === 0x43);
                    
                    if (!isHearbeat && isYamaha) {
                        console.log(`🔍 [MIDI RAW DESCONHECIDO] -> ${hex}`);
                    }
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