const midi = require('midi');

/**
 * Script de Leitura Inicial + Monitoramento Contínuo (Real-Time Listener)
 * 1. Puxa os valores atuais de posição dos medidores via 0x30 (Read Request)
 * 2. Mantém o Listener ativo em tempo real exibindo as alterações feitas na mesa física.
 */

const REQUESTS = [
  { label: '0D 03 0C 00 (INPUTS)',  sysex: [0xF0, 0x43, 0x30, 0x3E, 0x0D, 0x03, 0x0C, 0x00, 0x00, 0xF7] },
  { label: '0D 03 0C 01 (OUTPUTS)', sysex: [0xF0, 0x43, 0x30, 0x3E, 0x0D, 0x03, 0x0C, 0x01, 0x00, 0xF7] },
];

function timestamp() {
  const d = new Date();
  return d.toTimeString().split(' ')[0];
}

function findYamahaPort() {
  let yamahaIn = -1, yamahaOut = -1;
  const inp = new midi.Input();
  const out = new midi.Output();
  for (let i = 0; i < inp.getPortCount(); i++) {
    const name = inp.getPortName(i).toLowerCase();
    if (name.includes('yamaha')) { yamahaIn = i; break; }
  }
  for (let i = 0; i < out.getPortCount(); i++) {
    const name = out.getPortName(i).toLowerCase();
    if (name.includes('yamaha')) { yamahaOut = i; break; }
  }
  inp.closePort();
  out.closePort();
  return { yamahaIn, yamahaOut };
}

const { yamahaIn, yamahaOut } = findYamahaPort();
if (yamahaIn === -1 || yamahaOut === -1) {
  console.error('Yamaha 01V96 não encontrada nas portas MIDI.');
  process.exit(1);
}

const input = new midi.Input();
const output = new midi.Output();
input.openPort(yamahaIn);
output.openPort(yamahaOut);
input.ignoreTypes(false, false, false);

console.log(`Yamaha 01V96 Conectada [IN:${yamahaIn} OUT:${yamahaOut}]`);
console.log('🔄 Sincronizando estado inicial via 0x30...');
console.log('');

let isInitialSync = true;
let initialSyncDone = false;

input.on('message', (_deltaTime, message) => {
  if (message[0] === 0xFE) return; // ignora active sensing
  if (message.length >= 6 && message[4] === 0x0D && message[5] === 0x21) return; // ignora streaming de audio meters

  // Processa mensagens de parâmetro de medidores (0D 03 0C)
  if (message.length >= 8 && message[0] === 0xF0 && message[1] === 0x43
      && message[2] === 0x10 && message[3] === 0x3E
      && message[4] === 0x0D && message[5] === 0x03 && message[6] === 0x0C) {
    const param = message[7];
    const valueByte = message[message.length - 2];

    const targetStr = param === 0 ? 'INPUTS (00)' : param === 1 ? 'OUTPUTS (01)' : `Param 0x${param.toString(16)}`;
    const valStr = valueByte === 0 ? 'Pre-EQ (0x00)' :
                   valueByte === 1 ? 'Pre-Fader (0x01)' :
                   valueByte === 2 ? 'Post-Fader (0x02)' :
                   `0x${valueByte.toString(16).padStart(2, '0')}`;

    if (isInitialSync) {
      console.log(`  <- [ESTADO INICIAL] ${targetStr} => ${valStr}`);
    } else {
      console.log(`[${timestamp()}] 🎛️ ALTERAÇÃO NA MESA -> ${targetStr} => ${valStr}`);
    }
  }
});

// Envia as requisições de sincronização inicial
let idx = 0;
function sendNext() {
  if (idx >= REQUESTS.length) {
    setTimeout(() => {
      isInitialSync = false;
      initialSyncDone = true;
      console.log('');
      console.log('====================================================');
      console.log('🎧 MONITORAMENTO EM TEMPO REAL ATIVO (Somente Escuta)');
      console.log('   Altere as opções na mesa física para ver os logs...');
      console.log('====================================================');
      console.log('');
    }, 1000);
    return;
  }
  const req = REQUESTS[idx];
  output.sendMessage(req.sysex);
  idx++;
  setTimeout(sendNext, 300);
}

sendNext();
