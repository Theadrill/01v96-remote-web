const midi = require('midi');
const fs = require('fs');

/**
 * SCENE_MANAGER.JS
 * Script individual para sincronização da biblioteca de cenas da Yamaha 01V96.
 * Baseado na análise do dump do Studio Manager.
 */

// Configurações extraídas do dump
const HEADER = [0xF0, 0x43, 0x20, 0x7E]; // F0 43 20 7E
const SIGNATURE = [0x4C, 0x4D, 0x20, 0x20, 0x38, 0x43, 0x39, 0x33]; // "LM  8C93"
const CMD_BULK_REQUEST = 0x6D;
const FOOTER = 0xF7;

/**
 * Constrói uma mensagem de seleção de library (Parameter Change)
 * F0 43 10 3E 7F 5E 01 6D [TYPE] [INDEX] 00 00 00 00 00 F7 (7 bytes de valor)
 */
function buildSelectRequest(type, index) {
    return [0xF0, 0x43, 0x10, 0x3E, 0x7F, 0x5E, 0x01, 0x6D, type, index, 0x00, 0x00, 0x00, 0x00, 0x00, 0xF7];
}

function buildBulkRequest(type, index) {
    return [...HEADER, ...SIGNATURE, CMD_BULK_REQUEST, type, index, FOOTER];
}

function findYamahaPorts() {
    const input = new midi.Input();
    const output = new midi.Output();
    let yamahaIn = -1;
    let yamahaOut = -1;

    console.log('--- Mapeando portas MIDI ---');
    for (let i = 0; i < input.getPortCount(); i++) {
        const name = input.getPortName(i);
        console.log(`  [IN]  ${i}: ${name}`);
        if (name.toLowerCase().includes('yamaha') && name.includes('-1')) yamahaIn = i;
    }
    for (let i = 0; i < output.getPortCount(); i++) {
        const name = output.getPortName(i);
        console.log(`  [OUT] ${i}: ${name}`);
        if (name.toLowerCase().includes('yamaha') && name.includes('-1')) yamahaOut = i;
    }

    input.closePort();
    output.closePort();

    return { yamahaIn, yamahaOut };
}

async function run() {
    const ports = findYamahaPorts();
    if (ports.yamahaIn === -1 || ports.yamahaOut === -1) {
        console.error('❌ Yamaha 01V96 não encontrada!');
        return;
    }

    const input = new midi.Input();
    const output = new midi.Output();

    input.openPort(ports.yamahaIn);
    output.openPort(ports.yamahaOut);

    // Essencial para receber SysEx
    input.ignoreTypes(false, false, false);

    console.log('\n🚀 Scene Manager Iniciado');
    console.log('Conectado à Yamaha 01V96');
    console.log('Pressione Ctrl+C para encerrar\n');

    const scenes = [];

    input.on('message', (delta, message) => {
        // Verifica se é uma resposta de Bulk Dump (0x6D)
        // Estrutura da resposta: F0 43 00 7E [LEN_HI] [LEN_LO] L M ... 6D [TYPE] [INDEX] ...
        if (message.length > 20 && message[0] === 0xF0 && message[1] === 0x43 && message[14] === 0x6D) {
            const type = message[15];
            const index = message[16];
            
            if ((type === 0x00 || type === 0x02) && message.length > 21) {
                // Bulk Dump de Cena Completa (Type 00 para Library, 02 para Edit Buffer)
                // O nome começa no byte 20 e tem até 16 caracteres
                let name = '';
                for (let i = 0; i < 16; i++) {
                    const charCode = message[20 + i];
                    if (charCode >= 32 && charCode <= 126) {
                        name += String.fromCharCode(charCode);
                    } else if (charCode === 0) {
                        // Ignora nulls no meio (ex: teste33\03 -> teste333)
                    } else {
                        name += ' ';
                    }
                }
                name = name.trim();

                console.log(`✅ Recebida Cena [${index}]: "${name}" (${message.length} bytes)`);
                scenes[index] = { index, name, raw: Buffer.from(message).toString('hex') };
            } else if ((type === 0x00 || type === 0x01) && message.length <= 21) {
                // Info indicando que a cena está vazia (resposta de 21 bytes)
                // console.log(`ℹ️ Slot [${index}] VAZIO`);
            }
        }
    });

    // Função para esperar um pouco entre mensagens
    const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

    console.log('--- Iniciando Sincronização da Biblioteca ---');

    // O Studio Manager no dump começou pedindo Info (Type 01)
    // Vamos tentar pedir o Dump (Type 02) diretamente para as primeiras cenas 
    // para testar a teoria.
    
    // Primeiro vamos pedir o "Current Edit Buffer" (Index 0)
    console.log('Pedindo Edit Buffer (Slot 0)...');
    output.sendMessage(buildBulkRequest(0x02, 0x00));
    await wait(200);

    console.log("\nSweep Library (Type 00)...");
    // Vamos testar as cenas 1 a 10, e algumas adicionais
    for (let i = 1; i <= 99; i++) {
        output.sendMessage(buildBulkRequest(0x00, i));
        await wait(50); // Esperar 50ms é geralmente seguro para dumps desse tamanho (500~800 bytes)
    }

    console.log('\nSincronização concluída (aguardando respostas pendentes...)');
    
    // Deixa aberto por 5 segundos para coletar respostas
    await wait(5000);

    console.log('\n--- Resumo de Cenas Encontradas ---');
    scenes.forEach(s => {
        if (s) console.log(`Slot ${String(s.index).padStart(2, '0')}: ${s.name}`);
    });

    input.closePort();
    output.closePort();
    console.log('\nEncerrado.');
}

run().catch(err => {
    console.error('Erro na execução:', err);
});
