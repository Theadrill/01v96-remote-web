const midi = require('midi');
const output = new midi.Output();

let portName = '';
for (let i = 0; i < output.getPortCount(); i++) {
    if (output.getPortName(i).includes('Yamaha')) {
        output.openPort(i);
        portName = output.getPortName(i);
        console.log(`Opened port: ${portName}`);
        break;
    }
}

if (!portName) {
    console.error("Nenhuma porta Yamaha encontrada!");
    process.exit(1);
}

// Envia o comando para abrir a tela de FX genérica primeiro (como a tecla F1-F4 física)
const openFxPage = [0xF0, 0x43, 0x10, 0x3E, 0x0D, 0x04, 0x09, 0x04, 0x00, 0x00, 0x00, 0x00, 0x00, 0xF7];

// Envia o comando para focar no FX4 (slot 3)
const focusFx4 = [0xF0, 0x43, 0x10, 0x3E, 0x0D, 0x04, 0x09, 0x05, 0x00, 0x00, 0x00, 0x00, 0x03, 0xF7];

console.log("Enviando comando para abrir página FX...");
output.sendMessage(openFxPage);

setTimeout(() => {
    console.log("Enviando comando para focar no FX4 (slot 3)...");
    output.sendMessage(focusFx4);
    
    setTimeout(() => {
        output.closePort();
        console.log("Teste finalizado.");
    }, 500);
}, 100);
