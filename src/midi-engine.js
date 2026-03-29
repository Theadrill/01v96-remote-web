const midi = require('midi');
const fs = require('fs');
const path = require('path');
const protocol = require('./protocol');

// Deixamos as variáveis globais, mas sem instanciar o 'new' ainda
let input = null;
let output = null;

const filterFile = path.join(__dirname, '../filter.json');
let logFilters = [];

function loadFilters() {
    try {
        if (fs.existsSync(filterFile)) {
            const data = JSON.parse(fs.readFileSync(filterFile, 'utf8'));
            logFilters = data.prefixes || [];
        }
    } catch (e) {
        console.error("❌ Erro ao carregar filter.json:", e.message);
    }
}

// Carrega na primeira vez
loadFilters();

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

        // Recarrega os filtros do arquivo a cada conexão
        loadFilters();

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
                }

                // Log RAW para debugging solicitado pelo usuário (mostra TUDO que for Yamaha)
                const hex = Buffer.from(message).toString('hex').toUpperCase();
                const isHeartbeat = (hex === 'F043103E0D7FF7');
                const isMeter = (message[4] === 0x15 || message[4] === 0x0D || message[4] === 0x1A || message[4] === 0x7F) && (message[5] === 0x21 || message[5] === 0x20);
                
                // Verifica na lista de filtros dinâmicos
                const isNoise = logFilters.some(prefix => hex.startsWith(prefix));

                if (!isHeartbeat && !isMeter && !isNoise) {
                    console.log(`📥 [MIDI IN RAW] -> ${hex}`);
                }
                
                // DIAGNÓSTICO: log detalhado apenas para Element 30 (Gate) e 31 (Comp)
                const elem = message[6];
                if (elem === 30 || elem === 31) {
                    const param = message[7];
                    const ch = message[8];
                    const dataBytes = Array.from(message.slice(9, -1));
                    const label = elem === 30 ? 'GATE' : 'COMP';
                    console.log(`🔎 [${label}] Element=${elem} Param(idx)=${param} Ch=${ch+1} DataBytes=[${dataBytes}]`);
                }
            }
        });

        console.log(`✅ Portas MIDI Vinculadas com Sucesso. [Filtros ativos: ${logFilters.length}]`);
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