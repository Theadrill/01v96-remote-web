const midi = require('midi');

/**
 * SCRIPT DE DEBUG: TESTE DE NOMES DE SAÍDA (MIX/BUS)
 * Este script tenta se conectar à Yamaha 01V96 e pedir o nome de um Mix/Bus
 * para vermos exatamente o hexadecimal que a mesa devolve.
 */

const input = new midi.Input();
const output = new midi.Output();

// Habilita SysEx
input.ignoreTypes(false, false, false);

function findPorts() {
    let inIdx = -1;
    let outIdx = -1;

    for (let i = 0; i < input.getPortCount(); i++) {
        const name = input.getPortName(i);
        if (name.toLowerCase().includes('yamaha') && name.includes('-1')) inIdx = i;
    }

    for (let i = 0; i < output.getPortCount(); i++) {
        const name = output.getPortName(i);
        if (name.toLowerCase().includes('yamaha') && name.includes('-1')) outIdx = i;
    }

    return { inIdx, outIdx };
}

const { inIdx, outIdx } = findPorts();

if (inIdx === -1 || outIdx === -1) {
    console.error("❌ Yamaha 01V96 não encontrada (Busque por porta USB com '-1').");
    process.exit(1);
}

console.log(`\n🔗 Conectando a [IN:${inIdx}] e [OUT:${outIdx}]...`);
input.openPort(inIdx);
output.openPort(outIdx);

input.on('message', (delta, msg) => {
    if (msg[5] === 0x21 || msg[5] === 0x20 || msg.length > 20) return;

    if (msg[4] === 13 && msg[5] === 2) {
        const elements = { 4: 'INPUT', 15: 'BUS', 16: 'MIX', 18: 'STEREO' };
        const type = elements[msg[6]] || `UNKNOWN(${msg[6]})`;
        const charIdx = msg[7] - 4;
        const channel = msg[8];
        const charCode = msg[msg.length - 2];
        const char = (charCode >= 32 && charCode <= 126) ? String.fromCharCode(charCode) : `[0x${charCode.toString(16)}]`;
        
        console.log(`🎯 [RECV] Type:${type.padEnd(6)} Ch:${String(channel).padEnd(2)} Pos:${charIdx} Char:'${char}'`);
    }
});

const HEADER = [0xF0, 0x43, 0x30, 0x3E];
const FOOTER = [0xF7];

async function runTest() {
    console.log("\n🚀 Iniciando varredura completa em 2 segundos...");
    await new Promise(r => setTimeout(r, 2000));

    // Varre Mixes 1-8 (Element 16, Ch 0-7)
    for (let i = 0; i < 8; i++) {
        console.log(`\n📡 Lendo MIX ${i+1}...`);
        for (let c = 0; c < 4; c++) {
            output.sendMessage([...HEADER, 13, 2, 16, 4 + c, i, ...FOOTER]);
            await new Promise(r => setTimeout(r, 150));
        }
    }

    // Varre Buses 1-8 (Element 15, Ch 0-7)
    for (let i = 0; i < 8; i++) {
        console.log(`\n📡 Lendo BUS ${i+1}...`);
        for (let c = 0; c < 4; c++) {
            output.sendMessage([...HEADER, 13, 2, 15, 4 + c, i, ...FOOTER]);
            await new Promise(r => setTimeout(r, 150));
        }
    }

    // Stereo Master (Element 18, Ch 0)
    console.log(`\n📡 Lendo STEREO MASTER...`);
    for (let c = 0; c < 4; c++) {
        output.sendMessage([...HEADER, 13, 2, 18, 4 + c, 0, ...FOOTER]);
        await new Promise(r => setTimeout(r, 150));
    }

    console.log("\n⏳ Aguardando respostas por 5 segundos...");
    setTimeout(() => {
        console.log("\n✅ Teste finalizado.");
        process.exit(0);
    }, 5000);
}

runTest();
