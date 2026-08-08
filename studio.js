const midi = require('midi');
const fs = require('fs');
const path = require('path');

const logDir = path.join(__dirname, 'log');
if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
}

const logStream = fs.createWriteStream(path.join(logDir, 'studio_log.txt'), { flags: 'w' });
const originalConsoleLog = console.log;
logStream.write(`=== Sessão iniciada em ${new Date().toLocaleDateString()} - ${new Date().toLocaleTimeString()} ===\n`);
console.log = function(...args) {
    const formattedMessage = require('util').format(...args);
    const cleanMessage = formattedMessage.replace(/\x1b\[[0-9;]*m/g, ''); // Remove ANSI color codes
    logStream.write(cleanMessage + '\n');
    originalConsoleLog.apply(console, args);
};

/**
 * STUDIO.JS - Monitor do Studio Manager (Sem conexão com a MESA)
 * 
 * Escuta exclusivamente as mensagens MIDI enviadas pelo Studio Manager
 * através da porta "monitor" (loopMIDI), sem transmitir nada para a mesa de som.
 */

function findPorts() {
    const input = new midi.Input();
    const output = new midi.Output();

    let monitorInIdx = -1, monitorOutIdx = -1;

    console.log('--- MAPEANDO PORTAS MIDI (STUDIO MONITOR) ---');

    for (let i = 0; i < input.getPortCount(); i++) {
        const portName = input.getPortName(i);
        const name = portName.toLowerCase();
        console.log(`  [IN]  ${i}: ${portName}`);
        if (name.includes('monitor') && monitorInIdx === -1) monitorInIdx = i;
    }

    for (let i = 0; i < output.getPortCount(); i++) {
        const portName = output.getPortName(i);
        const name = portName.toLowerCase();
        console.log(`  [OUT] ${i}: ${portName}`);
        if (name.includes('monitor') && monitorOutIdx === -1) monitorOutIdx = i;
    }

    input.closePort();
    output.closePort();
    return { monitorInIdx, monitorOutIdx };
}

const ports = findPorts();
const monitorFound = ports.monitorInIdx !== -1;

if (!monitorFound) {
    console.log('\n❌ Porta "monitor" não encontrada. Crie no loopMIDI.');
    process.exit(1);
}

const monitorIn = new midi.Input();
monitorIn.openPort(ports.monitorInIdx);
monitorIn.ignoreTypes(false, false, false);

console.log('\n====================================================');
console.log('🚀 STUDIO MONITOR ATIVO (Apenas escutando Studio Manager)');
console.log(`   MONITOR IN: ${ports.monitorInIdx}`);
console.log('   MESA YAMAHA: Desconectada (Sem envio de dados)');
console.log('====================================================\n');

let sCount = 0, reassembled = 0, errors = 0, filteredCount = 0;

// ============================================================
// SYSEX REASSEMBLY BUFFER
// ============================================================
function createSysExHandler(onMessageComplete) {
    let sysexBuffer = null;

    return function (message) {
        const startsWithF0 = message[0] === 0xF0;
        const endsWithF7 = message[message.length - 1] === 0xF7;

        // Caso 1: Mensagem curta normal (1-3 bytes, channel message)
        if (message.length <= 3 && !startsWithF0) {
            if (message[0] & 0x80) {
                onMessageComplete(message);
            }
            return;
        }

        // Caso 2: SysEx completa (F0 ... F7)
        if (startsWithF0 && endsWithF7) {
            if (sysexBuffer) {
                sysexBuffer = null;
            }
            onMessageComplete(message);
            return;
        }

        // Caso 3: Início de SysEx fragmentada (F0 ... sem F7)
        if (startsWithF0 && !endsWithF7) {
            sysexBuffer = Array.from(message);
            return;
        }

        // Caso 4: Continuação de SysEx fragmentada (sem F0)
        if (!startsWithF0 && sysexBuffer) {
            for (let i = 0; i < message.length; i++) {
                sysexBuffer.push(message[i]);
            }

            if (endsWithF7) {
                reassembled++;
                onMessageComplete(sysexBuffer);
                sysexBuffer = null;
            }
            return;
        }
    };
}

// ============================================================
// FILTROS E LOG
// ============================================================
function toHex(msg) {
    const hex = Buffer.from(msg).toString('hex').toUpperCase().match(/.{1,2}/g);
    return hex ? hex.join(' ') : '(empty)';
}

function isMeterData(msg) {
    return msg.length >= 8 && msg[0] === 0xF0 && msg[1] === 0x43
        && msg[2] === 0x10 && msg[3] === 0x3E && (msg[5] === 0x21 || msg[5] === 0x20);
}

function isMeterRequest(msg) {
    return msg.length >= 8 && msg[0] === 0xF0 && msg[1] === 0x43
        && msg[2] === 0x30 && msg[3] === 0x3E
        && (msg[5] === 0x20 || msg[5] === 0x21);
}

function isHeartbeat(msg) {
    return msg.length === 7 && msg[0] === 0xF0 && msg[1] === 0x43
        && msg[5] === 0x7F && msg[6] === 0xF7;
}

let customFilters = [];
const filterFile = path.join(__dirname, 'filter.json');

function loadFilters() {
    if (fs.existsSync(filterFile)) {
        try {
            const data = JSON.parse(fs.readFileSync(filterFile, 'utf8'));
            if (data.prefixes) {
                customFilters = data.prefixes.map(pre => {
                    const clean = pre.replace(/\s/g, '');
                    const bytes = [];
                    for (let i = 0; i < clean.length; i += 2) {
                        bytes.push(parseInt(clean.substr(i, 2), 16));
                    }
                    return bytes;
                });
                console.log(`✅ [FILTER] ${customFilters.length} prefixos carregados.`);
            }
        } catch (e) {
            console.error("❌ [FILTER] Erro ao carregar filter.json:", e.message);
        }
    }
}

function matchesCustomFilter(msg) {
    for (const prefix of customFilters) {
        if (msg.length < prefix.length) continue;
        let match = true;
        for (let i = 0; i < prefix.length; i++) {
            if (msg[i] !== prefix[i]) { match = false; break; }
        }
        if (match) return true;
    }
    return false;
}

if (!fs.existsSync(filterFile)) {
    fs.writeFileSync(filterFile, JSON.stringify({ prefixes: [] }, null, 2));
    console.log(`📝 [FILTER] Criado filter.json inicial.`);
}

loadFilters();
if (fs.existsSync(filterFile)) {
    fs.watch(filterFile, (event) => {
        if (event === 'change') loadFilters();
    });
}

const C = {
    blue: "\x1b[34m", dim: "\x1b[2m", reset: "\x1b[0m"
};

const processStudioMessage = createSysExHandler((message) => {
    sCount++;

    if (matchesCustomFilter(message)) {
        filteredCount++;
        return;
    }

    const ts = new Date().toLocaleTimeString();
    if (isMeterRequest(message)) {
        console.log(`\x1b[33m[${ts}] 📊 [METER REQ] (${message.length}b): ${toHex(message)}\x1b[0m`);
        return;
    }

    if (isMeterData(message)) {
        console.log(`\x1b[35m[${ts}] 📊 [METER DATA] (${message.length}b): ${toHex(message)}\x1b[0m`);
        return;
    }

    console.log(`${C.blue}[${ts}] 💻 Studio Manager (${message.length}b): ${toHex(message)}${C.reset}`);
});

// Studio Manager escuta
monitorIn.on('message', (deltaTime, message) => {
    if (message[0] === 0xFE) return;
    processStudioMessage(message);
});

// STATS a cada 5 segundos
setInterval(() => {
    const parts = [`📊 Studio Manager Msgs: ${sCount}`];
    if (filteredCount > 0) parts.push(`🛡️ Filtrados: ${filteredCount}`);
    if (reassembled > 0) parts.push(`🔧 Remontados: ${reassembled}`);
    if (errors > 0) parts.push(`❌ Erros: ${errors}`);
    console.log(`${C.dim}${parts.join(' | ')}${C.reset}`);
    sCount = 0; reassembled = 0; errors = 0; filteredCount = 0;
}, 5000);

// Cleanup
process.stdin.resume();
process.on('SIGINT', () => {
    console.log('\nEncerrando studio monitor...');
    monitorIn.closePort();
    process.exit();
});
