const midi = require('midi');
const readline = require('readline');

const ELEMENT = 0x06; // 0x06 = FX Meters (Element 6)
const POLL_MS = 100;
const SCAN_INTERVAL_MS = 5000;

let currentBaseCh = 0x10;

function generateRequests(baseCh) {
    return [
        { ch: baseCh, label: 'LOW', sysex: [0xF0, 0x43, 0x30, 0x3E, 0x0D, 0x21, ELEMENT, baseCh, 0x00, 0x00, 0x04, 0xF7] },
        { ch: baseCh + 1, label: 'MID', sysex: [0xF0, 0x43, 0x30, 0x3E, 0x0D, 0x21, ELEMENT, baseCh + 1, 0x00, 0x00, 0x04, 0xF7] },
        { ch: baseCh + 2, label: 'HIGH', sysex: [0xF0, 0x43, 0x30, 0x3E, 0x0D, 0x21, ELEMENT, baseCh + 2, 0x00, 0x00, 0x04, 0xF7] },
    ];
}

let REQUESTS = generateRequests(currentBaseCh);

const FX4_SLOT = 0x03;
const FOCUS_REQUESTS = [
    [0xF0, 0x43, 0x30, 0x3E, 0x7F, 0x01, 0x58, 0x31, FX4_SLOT, 0xF7], // tipo do efeito
    [0xF0, 0x43, 0x30, 0x3E, 0x7F, 0x01, 0x58, 0x10, FX4_SLOT, 0xF7],
    [0xF0, 0x43, 0x30, 0x3E, 0x7F, 0x01, 0x58, 0x11, FX4_SLOT, 0xF7],
    [0xF0, 0x43, 0x30, 0x3E, 0x7F, 0x01, 0x58, 0x12, FX4_SLOT, 0xF7],
];
const FOCUS_MS = 2000;

const IDLE = 0x0FFF; // 4095 (0 dB)
const FULL_SCALE_GR_STEPS = 767; // 4095 (0 dB) a 3328 (-18 dB)
const FULL_SCALE_GR_DB = 18;

function findYamahaPorts() {
    const inp = new midi.Input();
    const out = new midi.Output();
    let yamahaIn = -1, yamahaOut = -1;

    for (let i = 0; i < inp.getPortCount(); i++) {
        const name = inp.getPortName(i).toLowerCase();
        if (yamahaIn === -1 && name.includes('yamaha')) yamahaIn = i;
    }
    for (let i = 0; i < out.getPortCount(); i++) {
        const name = out.getPortName(i).toLowerCase();
        if (yamahaOut === -1 && name.includes('yamaha')) yamahaOut = i;
    }

    inp.closePort();
    out.closePort();
    return { yamahaIn, yamahaOut };
}

function formatGR(raw) {
    if (raw === undefined || raw === null) return 'N/A';
    const norm = raw & 0x0FFF;
    if (norm >= IDLE) {
        return `0x${norm.toString(16).toUpperCase().padStart(4, '0')}( 0.0dB)`;
    }
    const db = ((IDLE - norm) / FULL_SCALE_GR_STEPS) * FULL_SCALE_GR_DB;
    return `0x${norm.toString(16).toUpperCase().padStart(4, '0')}(-${db.toFixed(1).padStart(4, ' ')}dB)`;
}

const { yamahaIn, yamahaOut } = findYamahaPorts();
if (yamahaIn === -1 || yamahaOut === -1) {
    console.error('\nPorta Yamaha 01V96 nao encontrada nas portas MIDI.');
    process.exit(1);
}

const input = new midi.Input();
const output = new midi.Output();
input.openPort(yamahaIn);
output.openPort(yamahaOut);
input.ignoreTypes(false, false, false);

console.log(`\nYAMAHA 01V96 CONECTADA [IN:${yamahaIn} OUT:${yamahaOut}]`);
console.log(`SCANNING STARTING AT 0x${currentBaseCh.toString(16).toUpperCase()}...`);

let sysexBuffer = null;
let latestValues = {};

input.on('message', (_deltaTime, message) => {
    if (message[0] === 0xFE) return;

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

    if (message.length < 12 || message[0] !== 0xF0 || message[1] !== 0x43 || message[2] !== 0x10) return;
    if (message[3] !== 0x3E || message[4] !== 0x0D || message[5] !== 0x21 || message[6] !== ELEMENT) return;

    const ch = message[7];
    const msb = message.length >= 13 ? message[11] : message[10];
    const lsb = message.length >= 13 ? message[12] : message[11];
    const raw = ((msb & 0x7f) << 7) | (lsb & 0x7f);
    latestValues[ch] = raw;

    if (ch >= currentBaseCh && ch <= currentBaseCh + 2) {
        readline.cursorTo(process.stdout, 0);
        readline.clearLine(process.stdout, 0);
        const l = formatGR(latestValues[currentBaseCh]);
        const m = formatGR(latestValues[currentBaseCh + 1]);
        const h = formatGR(latestValues[currentBaseCh + 2]);
        process.stdout.write(`SCANNING 0x${currentBaseCh.toString(16).toUpperCase()} | LOW:${l} MID:${m} HI:${h}`);
    }
});

let reqIdx = 0;
function sendNext() {
    output.sendMessage(REQUESTS[reqIdx].sysex);
    reqIdx = (reqIdx + 1) % REQUESTS.length;
    setTimeout(sendNext, POLL_MS);
}

function sendFocus() {
    for (const sysex of FOCUS_REQUESTS) {
        output.sendMessage(sysex);
    }
}
sendFocus();
setInterval(sendFocus, FOCUS_MS);
sendNext();

// SCANNER LOOP
setInterval(() => {
    currentBaseCh += 3;
    if (currentBaseCh > 0x1B) {
        currentBaseCh = 0x10; // Reset
    }
    REQUESTS = generateRequests(currentBaseCh);
    latestValues = {};
    console.log(`\n--- CHANGING SCAN CHANNELS TO 0x${currentBaseCh.toString(16).toUpperCase()} ---`);
}, SCAN_INTERVAL_MS);

process.on('SIGINT', () => {
    console.log('\nEncerrando monitor GR...');
    try {
        input.closePort();
        output.closePort();
    } catch (_) {}
    process.exit(0);
});
