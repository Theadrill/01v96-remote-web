const midi = require('midi');
const fs = require('fs');
const path = require('path');

// ────────────────────────────────────────────────────────────────────────────
// EXPERIMENTO v3: meters de FX da 01V96 via Element 0x06 — SOMENTE LEITURA.
//
// >> NENHUM PARAMETRO E ESCRITO NA MESA <<
// Este script só envia REQUESTS de leitura (prefixo 0x30):
//   F0 43 30 3E 0D 21 06 [CH] 00 00 04 F7
// Nada é alterado (volume, patch, cena). A mesa envia apenas a leitura.
//
// Referência (log/studio_log.txt, SM aberto no FX2, GR atuando):
//   O SM pediu esses canais e a mesa respondeu SOMENTE:
//     F0 43 10 3E 0D 21 06 [CH] 00 [8 bytes] F7
//   • Canais que respondem: 0x08, 0x09 (nível) e 0x10/0x11/0x12 (GR)
//   • 0x00..0x07 NUNCA responderam nas captures reais.
//   • O valor GR (que varia) está no par message[11]/message[12].
//
// IMPORTANTE: o stream de meters segue o slot cujo EDITOR está aberto no
// momento na consola. Parao teste de atividade, abra o FX editor do slot
// desejado na PRÓPRIA mesa (botão EDIT) ou use o app do projeto.
// ────────────────────────────────────────────────────────────────────────────

// ATENÇÃO: o stream 0x06 segue o editor de FX aberto na mesa na hora —
// NÃO existe byte de slot no request. O número abaixo é só cosmético p/ log.
const SLOT = process.argv[2] !== undefined ? parseInt(process.argv[2], 10) : 3; // 0=Fx1 … 3=FX4

// Canais: só o GR MID (0x11) por enquanto — menos ruído pra acompanhar.
const METER_CHANNELS = [
    { ch: 0x11, label: 'GR MID ', gr: true },
];

const buildMeterRequest = (ch) => [0xF0, 0x43, 0x30, 0x3E, 0x0D, 0x21, 0x06, ch,
                                   0x00, 0x00, 0x04, 0xF7];

// Log: sempre o mesmo arquivo, sobrescreve a cada execucao
const LOG_DIR = path.join(__dirname, 'log');
const LOG_FILE = path.join(LOG_DIR, 'gr_monitor.txt');
fs.mkdirSync(LOG_DIR, { recursive: true });
const logStream = fs.createWriteStream(LOG_FILE, { flags: 'w' });

const CYCLE_MS = 2000;

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

function u14(msb, lsb) {
    return (((msb & 0x7F) << 7) | (lsb & 0x7F)) & 0x0FFF;
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
console.log(`Lendo meters do FX cujo EDITOR estiver aberto na mesa (SOMENTE requests 0x30, nada escrito)\n`);

let sysexBuffer = null;
let lastByChannel = {};

const log = (line) => {
    console.log(line);
    logStream.write(line + '\n');
};

input.on('message', (_dt, message) => {
    if (message[0] === 0xFE) return;

    const startsWithF0 = message[0] === 0xF0;
    const endsWithF7 = message[message.length - 1] === 0xF7;

    if (startsWithF0 && !endsWithF7) { sysexBuffer = Array.from(message); return; }
    if (!startsWithF0 && sysexBuffer) {
        for (const b of message) sysexBuffer.push(b);
        if (!endsWithF7) return;
        message = sysexBuffer;
        sysexBuffer = null;
    }

    // Resposta de meter FX: F0 43 10 3E 0D 21 06 [CH] 00 [dados] F7
    if (message.length < 9 || message[0] !== 0xF0 || message[1] !== 0x43 ||
        message[2] !== 0x10 || message[3] !== 0x3E || message[4] !== 0x0D ||
        message[5] !== 0x21 || message[6] !== 0x06) return;

    const ch = message[7];
    const entry = METER_CHANNELS.find((m) => m.ch === ch);
    if (!entry) return;

    // valor 14-bit GR em message[11]/[12] (confirmado no log SM)
    const msb = message[11];
    const lsb = message[12];
    const raw = u14(msb, lsb);

    const stamp = new Date().toLocaleTimeString('pt-BR', { hour12: false });
    const prefix = entry.gr ? 'GR' : 'LV';
    const line = `[${stamp}] ${prefix} ${entry.label} = 0x${raw.toString(16).toUpperCase().padStart(3, '0')} (${raw})`;
    log(line);
    lastByChannel[ch] = raw;
});

function sendMeterCycle() {
    for (const m of METER_CHANNELS) {
        output.sendMessage(buildMeterRequest(m.ch));
    }
}

sendMeterCycle();
setInterval(sendMeterCycle, CYCLE_MS);

process.on('SIGINT', () => {
    log('\nEncerrando...');
    try { input.closePort(); output.closePort(); } catch (_) {}
    logStream.end();
    log(`Log salvo em: ${LOG_FILE}`);
    process.exit(0);
});