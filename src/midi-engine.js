const midi = require('midi');
const protocol = require('./protocol');
const syncCounter = require('./sync-counter');
const MidiAssembler = require('./midi-assembler');
const MidiScheduler = require('./midi-scheduler');



// Deixamos as variáveis globais, mas sem instanciar o 'new' ainda
let input = null;
let output = null;
let assembler = null;
let scheduler = null;


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
        assembler = null;
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
        // Instancia o MidiAssembler para montar SysEx completos e filtrar bytes ruidosos
        assembler = new MidiAssembler((completeSysEx) => {
            if (onMessageCallback) {
                onMessageCallback({ type: 'HEARTBEAT' });
                const translated = protocol.parseIncoming(completeSysEx);
                
                if (translated) {
                    onMessageCallback(translated, completeSysEx);
                } else {
                    onMessageCallback({ type: 'RAW_MIDI' }, completeSysEx);
                }
            }
        });

        // Instancia o MidiScheduler responsável por controlar todo o envio
        if (!scheduler) {
            scheduler = new MidiScheduler({ send: (msg) => sendDirect(msg) }, 15); // padrão 15ms
            try { scheduler.start(); } catch (e) {}
        }

        // Escuta as mensagens vindas da mesa física e passa para o assembler
        input.on('message', (delta, message) => {
            try {
                assembler.processInput(Array.from(message));
            } catch (e) {
                console.error('Erro no MidiAssembler.processInput:', e);
            }
        });

        console.log(`✅ Portas MIDI Vinculadas com Sucesso.`);
        return { success: true, inName: input.getPortName(parseInt(inputIdx)) };
    } catch (err) {
        console.error("Erro fatal ao conectar MIDI:", err);
        return { success: false, error: err.message };
    }
}

function sendDirect(msg) {
    if (output && msg) {
        try {
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

function send(msg, priority = 0) {
    if (scheduler && scheduler.isRunning) {
        return scheduler.enqueue(msg, priority);
    }
    return sendDirect(msg);
}

function getScheduler() { return scheduler; }

function setSchedulerTickMs(tickMs) {
    if (scheduler && typeof scheduler.setTickMs === 'function') {
        scheduler.setTickMs(tickMs);
        return true;
    }
    return false;
}

module.exports = { getAvailablePorts, connectPorts, send, getScheduler, setSchedulerTickMs };