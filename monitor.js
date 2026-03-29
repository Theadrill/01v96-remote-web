const midi = require('midi');

/**
 * MONITOR.JS - MIDI Bridge com Reassembly de SysEx
 * 
 * O RtMidi no Windows fragmenta SysEx grandes (>1024 bytes).
 * Fragmento 1: [F0, ...dados...]        (sem F7 no final)
 * Fragmento 2: [...mais dados...]        (sem F0 no início)
 * Fragmento N: [...dados finais..., F7]  (sem F0, com F7)
 * 
 * Este script remonta os fragmentos antes de enviar,
 * garantindo que apenas mensagens válidas chegam ao driver.
 */

function findPorts() {
    const input = new midi.Input();
    const output = new midi.Output();
    
    let yamahaInIdx = -1, yamahaOutIdx = -1;
    let monitorInIdx = -1, monitorOutIdx = -1;

    console.log('--- MAPEANDO PORTAS MIDI ---');
    
    for (let i = 0; i < input.getPortCount(); i++) {
        const portName = input.getPortName(i);
        const name = portName.toLowerCase();
        console.log(`  [IN]  ${i}: ${portName}`);
        if (name.includes('yamaha') && name.includes('-1')) yamahaInIdx = i;
        if (name.includes('monitor') && monitorInIdx === -1) monitorInIdx = i;
    }

    for (let i = 0; i < output.getPortCount(); i++) {
        const portName = output.getPortName(i);
        const name = portName.toLowerCase();
        console.log(`  [OUT] ${i}: ${portName}`);
        if (name.includes('yamaha') && name.includes('-1')) yamahaOutIdx = i;
        if (name.includes('monitor') && monitorOutIdx === -1) monitorOutIdx = i;
    }

    input.closePort();
    output.closePort();
    return { yamahaInIdx, yamahaOutIdx, monitorInIdx, monitorOutIdx };
}

const ports = findPorts();

if (ports.yamahaInIdx === -1 || ports.yamahaOutIdx === -1) {
    console.log('\n❌ Yamaha não encontrada. Verifique driver e cabo USB.');
    process.exit(1);
}
if (ports.monitorInIdx === -1 || ports.monitorOutIdx === -1) {
    console.log('\n❌ Porta "monitor" não encontrada. Crie no loopMIDI.');
    process.exit(1);
}

const yamahaIn = new midi.Input();
const yamahaOut = new midi.Output();
const monitorIn = new midi.Input();
const monitorOut = new midi.Output();

yamahaIn.openPort(ports.yamahaInIdx);
yamahaOut.openPort(ports.yamahaOutIdx);
monitorIn.openPort(ports.monitorInIdx);
monitorOut.openPort(ports.monitorOutIdx);

yamahaIn.ignoreTypes(false, false, false);
monitorIn.ignoreTypes(false, false, false);

console.log('\n====================================================');
console.log('🚀 BRIDGE MIDI ATIVO (SysEx Reassembly)');
console.log(`   YAMAHA  IN:${ports.yamahaInIdx}  OUT:${ports.yamahaOutIdx}`);
console.log(`   MONITOR IN:${ports.monitorInIdx}  OUT:${ports.monitorOutIdx}`);
console.log('====================================================\n');

let y2s = 0, s2y = 0, reassembled = 0, errors = 0;

// ============================================================
// SYSEX REASSEMBLY BUFFER
// ============================================================
// Cria um buffer para remontar SysEx fragmentado.
// Uso: const handler = createSysExHandler(outputPort)
//      handler(message)  ← chame para cada msg recebida
// ============================================================
function createSysExHandler(outputPort, direction) {
    let sysexBuffer = null;

    return function(message) {
        const startsWithF0 = message[0] === 0xF0;
        const endsWithF7 = message[message.length - 1] === 0xF7;

        // Caso 1: Mensagem curta normal (1-3 bytes, channel message)
        if (message.length <= 3 && !startsWithF0) {
            // Enviar direto (Note On, CC, Program Change, etc.)
            if (message[0] & 0x80) { // tem status byte válido
                try { outputPort.sendMessage(message); }
                catch(e) { errors++; }
            }
            return;
        }

        // Caso 2: SysEx completa (F0 ... F7) - mensagem inteira de uma vez
        if (startsWithF0 && endsWithF7) {
            // Se tinha buffer pendente, descarta (nova SysEx começou)
            if (sysexBuffer) {
                sysexBuffer = null;
            }
            try { outputPort.sendMessage(message); }
            catch(e) { errors++; }
            return;
        }

        // Caso 3: Início de SysEx fragmentada (F0 ... sem F7)
        if (startsWithF0 && !endsWithF7) {
            sysexBuffer = Array.from(message);
            return;
        }

        // Caso 4: Continuação de SysEx fragmentada (sem F0)
        if (!startsWithF0 && sysexBuffer) {
            // Anexar ao buffer
            for (let i = 0; i < message.length; i++) {
                sysexBuffer.push(message[i]);
            }

            // Se termina com F7, SysEx completa - enviar tudo
            if (endsWithF7) {
                reassembled++;
                try { outputPort.sendMessage(sysexBuffer); }
                catch(e) { errors++; }
                sysexBuffer = null;
            }
            // Se não termina com F7, continuar acumulando
            return;
        }

        // Caso 5: Fragmento solto sem buffer ativo (dados perdidos) - ignorar
    };
}

// Criar handlers para cada direção
const forwardToMonitor = createSysExHandler(monitorOut, 'Y→S');
const forwardToYamaha = createSysExHandler(yamahaOut, 'S→Y');

// ============================================================
// FILTROS E LOG
// ============================================================
function toHex(msg) {
    return Buffer.from(msg).toString('hex').toUpperCase().match(/.{1,2}/g).join(' ');
}

function isMeterData(msg) {
    // Meter RESPONSE: F0 43 10 3E xx 21 00 00/05 ...
    return msg.length >= 8 && msg[0] === 0xF0 && msg[1] === 0x43
        && msg[3] === 0x3E && msg[5] === 0x21;
}

function isMeterRequest(msg) {
    // Meter REQUEST: F0 43 30 3E xx 20/21 00 00 00 00 1F F7
    // Byte[2]=0x30 = request, Byte[5]=0x20 ou 0x21 = meter group
    return msg.length >= 8 && msg[0] === 0xF0 && msg[1] === 0x43
        && msg[2] === 0x30 && msg[3] === 0x3E
        && (msg[5] === 0x20 || msg[5] === 0x21);
}

function isHeartbeat(msg) {
    // Heartbeat: F0 43 10 3E xx 7F F7
    return msg.length === 7 && msg[0] === 0xF0 && msg[1] === 0x43
        && msg[5] === 0x7F && msg[6] === 0xF7;
}

// Filtro geral: tudo que é "ruído" repetitivo e não precisa aparecer no log
function isNoise(msg) {
    return isMeterData(msg) || isMeterRequest(msg) || isHeartbeat(msg);
}

const C = {
    green: "\x1b[32m", blue: "\x1b[34m", dim: "\x1b[2m", reset: "\x1b[0m"
};

let meterCount = 0, heartbeatCount = 0, loopbackCount = 0;

// ============================================================
// BRIDGE
// ============================================================

// Yamaha → Studio Manager
yamahaIn.on('message', (deltaTime, message) => {
    if (message[0] === 0xFE) return;
    forwardToMonitor(message);
    y2s++;

    // Log: silenciar todo ruído repetitivo
    if (isNoise(message)) { meterCount++; return; }

    const ts = new Date().toLocaleTimeString();
    console.log(`${C.green}[${ts}] 🎹 Y→S (${message.length}b): ${toHex(message)}${C.reset}`);
});

// Studio Manager → Yamaha
// IMPORTANTE: O loopMIDI ecoa de volta tudo que escrevemos no monitorOut.
// Meter data e heartbeats vindos daqui são ecos nossos, NÃO do Studio Manager.
// O Studio Manager NUNCA envia meter data para a mesa (não faz sentido).
monitorIn.on('message', (deltaTime, message) => {
    if (message[0] === 0xFE) return;

    // Descartar loopback puro (meter DATA e heartbeats são ecos nossos)
    if (isMeterData(message) || isHeartbeat(message)) {
        loopbackCount++;
        return;
    }

    // Mensagem genuína: encaminhar à Yamaha
    forwardToYamaha(message);
    s2y++;

    // Log: silenciar meter requests (server.js polling), mostrar o resto
    if (isMeterRequest(message)) { meterCount++; return; }

    const ts = new Date().toLocaleTimeString();
    console.log(`${C.blue}[${ts}] 💻 S→Y (${message.length}b): ${toHex(message)}${C.reset}`);
});

// ============================================================
// STATS a cada 5 segundos
// ============================================================
setInterval(() => {
    const parts = [`📊 Y→S: ${y2s}`, `S→Y: ${s2y}`];
    if (meterCount > 0) parts.push(`📶 Meters: ${meterCount}`);
    if (heartbeatCount > 0) parts.push(`💓 HB: ${heartbeatCount}`);
    if (loopbackCount > 0) parts.push(`🔁 Loopback filtrado: ${loopbackCount}`);
    if (reassembled > 0) parts.push(`🔧 Remontados: ${reassembled}`);
    if (errors > 0) parts.push(`❌ Erros: ${errors}`);
    console.log(`${C.dim}${parts.join(' | ')}${C.reset}`);
    y2s = 0; s2y = 0; meterCount = 0; heartbeatCount = 0; loopbackCount = 0; reassembled = 0; errors = 0;
}, 5000);

// Cleanup
process.stdin.resume();
process.on('SIGINT', () => {
    console.log('\nEncerrando monitor...');
    yamahaIn.closePort();
    yamahaOut.closePort();
    monitorIn.closePort();
    monitorOut.closePort();
    process.exit();
});
