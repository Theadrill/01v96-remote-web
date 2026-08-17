const midi = require('midi');
const fs = require('fs');
const path = require('path');

// ────────────────────────────────────────────────────────────────────────────
// SCRIPT DE SONDAGEM E ESCUTA — 100% READ ONLY (SOMENTE LEITURA)
// ────────────────────────────────────────────────────────────────────────────
//
// >> NENHUM PARÂMETRO É ESCRITO NA MESA <<
// Este script envia EXCLUSIVAMENTE requests de leitura (prefixo 0x30):
//   F0 43 30 3E [section] [group] [element] [param] [channel] F7
//
// NADA é alterado (faders, botões ON, rotas, cenas ou memórias).
// A mesa apenas responde com o estado atual.
// ────────────────────────────────────────────────────────────────────────────

// Argumentos: auxIdx, inPort, outPort
const args = process.argv.slice(2);
let targetAux = 1;
let customIn = null;
let customOut = null;

for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--in' && args[i + 1] !== undefined) customIn = parseInt(args[++i], 10);
    else if (a === '--out' && args[i + 1] !== undefined) customOut = parseInt(args[++i], 10);
    else if (!isNaN(parseInt(a, 10))) targetAux = parseInt(a, 10);
}

if (targetAux < 1 || targetAux > 8) targetAux = 1;
const auxIdx = targetAux;

const LOG_DIR = path.join(__dirname, 'log');
const LOG_FILE = path.join(LOG_DIR, 'aux_probe.txt');
fs.mkdirSync(LOG_DIR, { recursive: true });
const logStream = fs.createWriteStream(LOG_FILE, { flags: 'w' });

function log(line, stdoutOnly = false) {
    console.log(line);
    if (!stdoutOnly) {
        logStream.write(line + '\n');
    }
}

function listAndFindPorts() {
    const inp = new midi.Input();
    const out = new midi.Output();

    log(`\n--- MAPEAMENTO DE PORTAS MIDI DO SISTEMA ---`);
    let autoIn = -1, autoOut = -1;

    for (let i = 0; i < inp.getPortCount(); i++) {
        const name = inp.getPortName(i);
        log(`  [MIDI IN]  ${i}: "${name}"`);
        const lower = name.toLowerCase();
        if (autoIn === -1 && lower.includes('yamaha')) {
            // Prioriza porta -1 se houver
            if (lower.includes('-1') || lower.includes(' 1') || lower.includes('port 1')) {
                autoIn = i;
            } else if (autoIn === -1) {
                autoIn = i;
            }
        }
    }

    for (let i = 0; i < out.getPortCount(); i++) {
        const name = out.getPortName(i);
        log(`  [MIDI OUT] ${i}: "${name}"`);
        const lower = name.toLowerCase();
        if (autoOut === -1 && lower.includes('yamaha')) {
            if (lower.includes('-1') || lower.includes(' 1') || lower.includes('port 1')) {
                autoOut = i;
            } else if (autoOut === -1) {
                autoOut = i;
            }
        }
    }

    inp.closePort();
    out.closePort();

    const selectedIn = customIn !== null ? customIn : (autoIn !== -1 ? autoIn : 0);
    const selectedOut = customOut !== null ? customOut : (autoOut !== -1 ? autoOut : 0);

    return { selectedIn, selectedOut };
}

const { selectedIn, selectedOut } = listAndFindPorts();

const input = new midi.Input();
const output = new midi.Output();
try {
    input.openPort(selectedIn);
    output.openPort(selectedOut);
    input.ignoreTypes(false, false, false);
} catch (err) {
    console.error(`\n❌ Erro ao abrir portas MIDI [IN:${selectedIn} OUT:${selectedOut}]:`, err.message);
    process.exit(1);
}

log(`\n========================================================================`);
log(`🔍 YAMAHA 01V96 - SONDAGEM AUXILIAR & PRE/POST [100% READ ONLY]`);
log(`🔌 Portas Abertas: IN=${selectedIn} | OUT=${selectedOut}`);
log(`🎯 Alvo Inicial: AUX ${auxIdx} (CH 1..32 + Config do Barramento)`);
log(`🛡️  Segurança: Apenas requisições de consulta (0x30). NENHUMA ESCRITA (0x10).`);
log(`🔇 Filtro de Ruído: Medidores contínuos (VU/Peak 0D 21) silenciados.`);
log(`========================================================================\n`);

let sysexBuffer = null;

function formatHex(bytes) {
    return Array.from(bytes).map(b => b.toString(16).toUpperCase().padStart(2, '0')).join(' ');
}

function parseFader(bytes) {
    let val = 0;
    for (let b of bytes) {
        val = (val << 7) | (b & 0x7F);
    }
    return val;
}

// ────────────────────────────────────────────────────────────────────────────
// LISTENER EM TEMPO REAL
// ────────────────────────────────────────────────────────────────────────────
input.on('message', (_dt, rawMessage) => {
    let message = rawMessage;
    if (message[0] === 0xFE) return; // Active Sensing

    const startsWithF0 = message[0] === 0xF0;
    const endsWithF7 = message[message.length - 1] === 0xF7;

    if (startsWithF0 && !endsWithF7) {
        sysexBuffer = Array.from(message);
        return;
    }
    if (!startsWithF0 && sysexBuffer) {
        for (const b of message) sysexBuffer.push(b);
        if (!endsWithF7) return;
        message = sysexBuffer;
        sysexBuffer = null;
    }

    if (message.length < 8 || message[0] !== 0xF0 || message[1] !== 0x43) return;

    const msgType = message[2]; // 0x10 = Parameter Change (resposta da mesa ou alteração física)
    const modelId = message[3]; // 0x3E = 01V96
    if (modelId !== 0x3E) return;

    const section = message[4];
    const group = message[5];
    const element = message[6];
    const param = message[7];
    const channel = message[8];
    const dataBytes = message.slice(9, message.length - 1);
    const timeStr = new Date().toLocaleTimeString('pt-BR', { hour12: false });

    // SILENCIA METER STREAM (Section 0x0D, Group 0x21 = VU/Peak/GR contínuos da mesa)
    if (section === 0x0D && group === 0x21) {
        return;
    }

    // 1. Envio de Canais para Auxiliar (Element 35 / 0x23)
    if (element === 35 || element === 0x23) {
        const auxNumber = Math.floor(param / 3) + 1;
        const offset = param % 3;
        const chNumber = channel + 1;

        if (offset === 1) { // PRE / POST
            const rawVal = dataBytes[dataBytes.length - 1];
            const isPre = rawVal === 1;
            const label = isPre ? 'PRE (1)' : 'POST (0)';
            const chLabel = channel < 32 
                ? `CH ${(channel + 1).toString().padStart(2, '0')}` 
                : `ST IN ${Math.floor((channel - 32) / 2) + 1}${(channel % 2 === 0) ? 'L' : 'R'}`;
            log(`[${timeStr}] 🎛️  ${chLabel.padEnd(8)} ➔ AUX ${auxNumber} | PRE/POST : \x1b[36m${label.padEnd(8)}\x1b[0m | Hex: ${formatHex(message)}`);
        } else if (offset === 0) { // ON / OFF
            const rawVal = dataBytes[dataBytes.length - 1];
            const isOn = rawVal !== 0;
            const label = isOn ? 'ON (1)' : 'OFF (0)';
            const chLabel = channel < 32 
                ? `CH ${(channel + 1).toString().padStart(2, '0')}` 
                : `ST IN ${Math.floor((channel - 32) / 2) + 1}${(channel % 2 === 0) ? 'L' : 'R'}`;
            log(`[${timeStr}] 🟢 ${chLabel.padEnd(8)} ➔ AUX ${auxNumber} | SEND ON  : \x1b[32m${label.padEnd(8)}\x1b[0m | Hex: ${formatHex(message)}`);
        } else if (offset === 2) { // LEVEL
            const levelVal = parseFader(dataBytes);
            const chLabel = channel < 32 
                ? `CH ${(channel + 1).toString().padStart(2, '0')}` 
                : `ST IN ${Math.floor((channel - 32) / 2) + 1}${(channel % 2 === 0) ? 'L' : 'R'}`;
            log(`[${timeStr}] 🎚️  ${chLabel.padEnd(8)} ➔ AUX ${auxNumber} | LEVEL    : ${levelVal.toString().padEnd(8)} | Hex: ${formatHex(message)}`);
        }
        return;
    }

    // 2. Modo do Auxiliar (Element 55 / 0x37 - FIXED vs VARIABLE)
    if (element === 55 || element === 0x37) {
        const auxNumber = channel + 1;
        const rawVal = dataBytes[dataBytes.length - 1];
        const modeLabel = rawVal === 0 ? 'FIXED (0)' : 'VARIABLE (1)';
        log(`[${timeStr}] ⚙️  AUX ${auxNumber} MODE (TYPE)     : \x1b[33m${modeLabel}\x1b[0m | Hex: ${formatHex(message)}`);
        return;
    }

    // 3. Pre-Point Global da Mesa (Element 96 / 0x60)
    if (element === 96 || element === 0x60) {
        const rawVal = dataBytes[dataBytes.length - 1];
        const prePointLabel = rawVal === 0 ? 'PRE ON (0)' : 'POST ON (1)';
        log(`[${timeStr}] 📍 CONSOLE AUX PRE-POINT: \x1b[35m${prePointLabel}\x1b[0m (raw: ${rawVal}) | Hex: ${formatHex(message)}`);
        return;
    }

    // 4. Insert do Barramento Auxiliar (Element 53 / 0x35)
    if (element === 53 || element === 0x35) {
        const auxNumber = channel + 1;
        const rawVal = dataBytes[dataBytes.length - 1];
        if (param === 0) {
            const insOn = rawVal !== 0 ? 'ON (1)' : 'OFF (0)';
            log(`[${timeStr}] 🔌 AUX ${auxNumber} INSERT ON/OFF : ${insOn} | Hex: ${formatHex(message)}`);
        } else if (param === 2) {
            const locNames = ['PRE EQ (0)', 'PRE FADER (1)', 'POST FADER (2)'];
            const insLoc = locNames[rawVal] || `LOC ${rawVal}`;
            log(`[${timeStr}] 🔌 AUX ${auxNumber} INSERT POSITION: \x1b[34m${insLoc}\x1b[0m | Hex: ${formatHex(message)}`);
        }
        return;
    }

    // Outros parâmetros gerais da 01V96 (excluindo meters)
    log(`[${timeStr}] 📨 OUTRO SysEx recebido: Elem=${element} Param=${param} Ch=${channel} | Hex: ${formatHex(message)}`);
});

// ────────────────────────────────────────────────────────────────────────────
// CONSTRUTOR DE REQUESTS 100% READ ONLY (0x30)
// ────────────────────────────────────────────────────────────────────────────
function buildParamRequest(section, group, element, param, channel) {
    return [
        0xF0, 0x43,
        0x30, // 0x30 = Parameter Request (READ ONLY)
        0x3E, // Model ID: Yamaha 01V96
        section & 0x7F,
        group & 0x7F,
        element & 0x7F,
        param & 0x7F,
        channel & 0x7F,
        0xF7
    ];
}

// ────────────────────────────────────────────────────────────────────────────
// FILA SEGURA DE LEITURA (35ms delay por requisição)
// ────────────────────────────────────────────────────────────────────────────
const requestQueue = [];

// A. Consulta Configuração do Barramento Auxiliar
requestQueue.push({
    name: `AUX ${auxIdx} MODE (Fixed/Variable)`,
    bytes: buildParamRequest(127, 1, 55, 0, auxIdx - 1)
});

requestQueue.push({
    name: `Console AUX PRE-POINT`,
    bytes: buildParamRequest(127, 1, 96, 0, 0)
});

requestQueue.push({
    name: `AUX ${auxIdx} INSERT ON`,
    bytes: buildParamRequest(127, 1, 53, 0, auxIdx - 1)
});

requestQueue.push({
    name: `AUX ${auxIdx} INSERT POSITION`,
    bytes: buildParamRequest(127, 1, 53, 2, auxIdx - 1)
});

// B. Consulta PRE/POST e ON dos 32 canais de entrada para o Auxiliar selecionado
const preParam = (auxIdx - 1) * 3 + 1;  // Offset 1 = PRE/POST
const onParam = (auxIdx - 1) * 3 + 0;   // Offset 0 = ON/OFF

for (let ch = 0; ch < 32; ch++) {
    // 1. PRE/POST
    requestQueue.push({
        name: `CH ${ch + 1} ➔ AUX ${auxIdx} PRE/POST`,
        bytes: buildParamRequest(127, 1, 35, preParam, ch)
    });
    // 2. ON/OFF
    requestQueue.push({
        name: `CH ${ch + 1} ➔ AUX ${auxIdx} ON/OFF`,
        bytes: buildParamRequest(127, 1, 35, onParam, ch)
    });
}

log(`🚀 Iniciando envio de ${requestQueue.length} requisições READ ONLY (delay: 35ms)...`);

let currentIndex = 0;
const interval = setInterval(() => {
    if (currentIndex >= requestQueue.length) {
        clearInterval(interval);
        setTimeout(() => {
            log(`\n========================================================================`);
            log(`✅ SONDAGEM INICIAL CONCLUÍDA!`);
            log(`👂 O script continua ATIVO e ESCUTANDO em tempo real (Filtro de Meters ativado).`);
            log(`👉 Agora altere PRE/POST ou algo na tela da 01V96 para testar a escuta passiva.`);
            log(`(Pressione Ctrl+C para encerrar)`);
            log(`========================================================================\n`);
        }, 800);
        return;
    }

    const item = requestQueue[currentIndex];
    output.sendMessage(item.bytes);
    currentIndex++;
}, 35);

process.on('SIGINT', () => {
    log('\n🛑 Encerrando monitor...');
    try {
        input.closePort();
        output.closePort();
    } catch (_) {}
    logStream.end();
    log(`📄 Log completo gravado em: ${LOG_FILE}`);
    process.exit(0);
});
