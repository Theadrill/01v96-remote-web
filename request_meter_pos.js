const midi = require('midi');

/**
 * Sends READ-ONLY requests (0x30) for meter position (0D 03 0C)
 * Tests different request formats to find which one works for both Input and Output params.
 */

const REQUESTS = [
  // --- Format A: channel=0x00 (standard build_request pattern) ---
  { label: 'A1 INP (chan=00)', sysex: [0xF0, 0x43, 0x30, 0x3E, 0x0D, 0x03, 0x0C, 0x00, 0x00, 0xF7] },
  { label: 'A2 OUT (chan=00)', sysex: [0xF0, 0x43, 0x30, 0x3E, 0x0D, 0x03, 0x0C, 0x01, 0x00, 0xF7] },
  // --- Format B: byte_count=0x01 (build_fx_type_request pattern) ---
  { label: 'B1 INP (bc=01)',   sysex: [0xF0, 0x43, 0x30, 0x3E, 0x0D, 0x03, 0x0C, 0x00, 0x01, 0xF7] },
  { label: 'B2 OUT (bc=01)',   sysex: [0xF0, 0x43, 0x30, 0x3E, 0x0D, 0x03, 0x0C, 0x01, 0x01, 0xF7] },
  // --- Format C: byte_count=0x05 (all data bytes) ---
  { label: 'C1 INP (bc=05)',   sysex: [0xF0, 0x43, 0x30, 0x3E, 0x0D, 0x03, 0x0C, 0x00, 0x05, 0xF7] },
  { label: 'C2 OUT (bc=05)',   sysex: [0xF0, 0x43, 0x30, 0x3E, 0x0D, 0x03, 0x0C, 0x01, 0x05, 0xF7] },
  // --- Format D: with sub-param 0x00, channel=0x00 (extra field) ---
  { label: 'D1 INP (+sub)',    sysex: [0xF0, 0x43, 0x30, 0x3E, 0x0D, 0x03, 0x0C, 0x00, 0x00, 0x00, 0xF7] },
  { label: 'D2 OUT (+sub)',    sysex: [0xF0, 0x43, 0x30, 0x3E, 0x0D, 0x03, 0x0C, 0x01, 0x00, 0x00, 0xF7] },
  // --- Format E: like master_meter format (param=00, ch=00, extra=00, bc=01) ---
  // master_meter format: F0 43 30 3E 0D 21 04 00 7F 00 01 F7
  // Adapted for 0D 03 0C:
  { label: 'E1 INP (full)',    sysex: [0xF0, 0x43, 0x30, 0x3E, 0x0D, 0x03, 0x0C, 0x00, 0x00, 0x00, 0x01, 0xF7] },
  { label: 'E2 OUT (full)',    sysex: [0xF0, 0x43, 0x30, 0x3E, 0x0D, 0x03, 0x0C, 0x01, 0x00, 0x00, 0x01, 0xF7] },
];

const LISTEN_MS = 4000;
let responses = [];

function toHex(msg) {
  if (!msg || msg.length === 0) return '(empty)';
  const hex = Buffer.from(msg).toString('hex').toUpperCase().match(/.{1,2}/g);
  return hex ? hex.join(' ') : '(empty)';
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
  console.error('Yamaha 01V96 not found on MIDI ports');
  process.exit(1);
}

const input = new midi.Input();
const output = new midi.Output();
input.openPort(yamahaIn);
output.openPort(yamahaOut);
input.ignoreTypes(false, false, false);

console.log(`Yamaha 01V96 IN:${yamahaIn} OUT:${yamahaOut}`);
console.log('');

input.on('message', (_deltaTime, message) => {
  if (message[0] === 0xFE) return;
  responses.push(message);
  const hex = toHex(message);
  // Only print responses matching 0D 03 to avoid meter noise
  if (message.length >= 6 && message[4] === 0x0D && message[5] === 0x03) {
    console.log(`  <- ${hex}`);
  }
});

let idx = 0;
function sendNext() {
  if (idx >= REQUESTS.length) {
    console.log('');
    console.log('All requests sent. Waiting for responses...');
    setTimeout(summarize, LISTEN_MS);
    return;
  }
  const req = REQUESTS[idx];
  console.log(`-> ${req.label}`);
  output.sendMessage(req.sysex);
  idx++;
  setTimeout(sendNext, 100);
}
sendNext();

function summarize() {
  console.log('');
  console.log('=== SUMMARY ===');
  let found = 0;
  for (const msg of responses) {
    if (msg.length >= 8 && msg[0] === 0xF0 && msg[1] === 0x43
        && msg[2] === 0x10 && msg[3] === 0x3E
        && msg[4] === 0x0D && msg[5] === 0x03 && msg[6] === 0x0C) {
      found++;
      const param = msg[7];
      // The value is the last non-F7 byte (or near it in the data payload)
      const valueByte = msg[msg.length - 2];
      let dataStr = '';
      for (let i = 8; i < msg.length - 1; i++) {
        dataStr += ' ' + msg[i].toString(16).padStart(2, '0');
      }
      const target = param === 0 ? 'INPUT (canais)' :
                     param === 1 ? 'OUTPUT (master)' :
                     `?0x${param.toString(16)}`;
      const valStr = valueByte === 0 ? 'Pre-EQ' :
                     valueByte === 1 ? 'Pre-Fader' :
                     valueByte === 2 ? 'Post-Fader' :
                     `0x${valueByte.toString(16)}`;
      console.log(`  [RESP] ${target} = ${valStr} (data:${dataStr})`);
    }
  }
  if (found === 0) {
    console.log('  No response received for 0D 03 0C');
  } else {
    console.log(`  Total: ${found} response(s) for 0D 03 0C`);
  }

  input.closePort();
  output.closePort();
  process.exit(0);
}
