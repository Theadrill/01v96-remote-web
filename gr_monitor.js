const midi = require('midi');

const ELEMENT = 0x04; // 0x04 = Master Stereo Bus
const SUB_COMP_GR = 0x03; // Comp GR
const CHANNEL = 0x00;
const LENGTH = 0x01;
const POLL_MS = 100;

const REQUESTS = [
    { label: 'COMP', visible: true, sysex: [0xF0, 0x43, 0x30, 0x3E, 0x0D, 0x21, ELEMENT, SUB_COMP_GR, CHANNEL, 0x00, LENGTH, 0xF7] },
];

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

function timestamp() {
    return new Date().toLocaleTimeString();
}

function formatGR(raw) {
    if (raw >= IDLE) {
        return `0x${raw.toString(16).toUpperCase().padStart(4, '0')} (idle)`;
    }
    const db = ((IDLE - raw) / FULL_SCALE_GR_STEPS) * FULL_SCALE_GR_DB;
    const flag = db >= 0.05 ? ` (-${db.toFixed(2)} dB)` : ' (idle)';
    return `0x${raw.toString(16).toUpperCase().padStart(4, '0')}${flag}`;
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
console.log(`Monitorando GR do MASTER (Elemento 0x04, Sub-canal 0x03, ${LENGTH} valor)`);
console.log('Idle = 0x0FFF; valores menores indicam Gain Reduction ativo\n');

let sysexBuffer = null;

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

    if (message.length !== 12 || message[0] !== 0xF0 || message[1] !== 0x43 || message[2] !== 0x10) return;
    if (message[3] !== 0x3E || message[4] !== 0x0D || message[5] !== 0x21) return;
    if (message[6] !== ELEMENT || message[7] !== SUB_COMP_GR || message[8] !== CHANNEL) return;

    const raw = ((message[9] & 0x7f) << 7) | (message[10] & 0x7f);
    process.stdout.write(`\r[${timestamp()}] COMP GR MASTER = ${formatGR(raw)} | step ${raw}\x1b[K`);
});

function sendNext() {
    output.sendMessage(REQUESTS[0].sysex);
    setTimeout(sendNext, POLL_MS);
}

sendNext();

process.on('SIGINT', () => {
    console.log('\nEncerrando monitor GR...');
    try {
        input.closePort();
        output.closePort();
    } catch (_) {}
    process.exit(0);
});
