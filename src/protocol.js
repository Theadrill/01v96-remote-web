const { COMMAND_BYTES } = require('./dictionary');

const CONVERTERS = {
  faderToBytes: (value) => [0, 0, (value >> 7) & 0x07, value & 0x7F],
  bytesToFader: (bytes) => {
      const len = bytes.length;
      if (len >= 4) return (bytes[len-4] << 21) | (bytes[len-3] << 14) | (bytes[len-2] << 7) | bytes[len-1];
      if (len === 2) return (bytes[0] << 7) | bytes[1];
      return 0;
  },
  bytesToSigned: (bytes) => {
      const len = bytes.length;
      let val = 0;
      if (len >= 4) val = (bytes[len-4] << 21) | (bytes[len-3] << 14) | (bytes[len-2] << 7) | bytes[len-1];
      else if (len === 2) val = (bytes[0] << 7) | bytes[1];
      
      // Sign extension for 28-bit (if 4 bytes) or 14-bit (if 2 bytes)
      const signBit = (len >= 4) ? 0x08000000 : 0x2000;
      const mask = (len >= 4) ? 0x0FFFFFFF : 0x3FFF;
      if (val & signBit) val -= (mask + 1);
      return val;
  },
  signedToBytes: (value) => {
      let v = Math.round(value);
      if (v < 0) v += 0x10000000;
      return [(v >> 21) & 0x7F, (v >> 14) & 0x7F, (v >> 7) & 0x7F, v & 0x7F];
  },
  onToBytes: (isOn) => [0, 0, 0, isOn ? 1 : 0],
  bytesToOn: (bytes) => !!bytes[bytes.length - 1],
  bytesToChar: (bytes) => String.fromCharCode(bytes[bytes.length - 1] || 32)
};

const HEADER = [240, 67]; // F0 43
const MODEL_ID = 62;      // 3E
const FOOTER = [247];     // F7

function buildChange(commandName, channelIndex, value, converterFunc) {
  const address = COMMAND_BYTES[commandName];
  if (!address) return null;
  return [...HEADER, 16, MODEL_ID, ...address, channelIndex, ...converterFunc(value), ...FOOTER];
}

function buildRequest(commandName, channelIndex = 0) {
  const address = COMMAND_BYTES[commandName];
  if (!address) return null;
  return [...HEADER, 48, MODEL_ID, ...address, channelIndex, ...FOOTER];
}

function buildNameRequest(channelIndex, charIndex) {
  const parameter = 4 + charIndex;
  // Bug arrumado: Removido o byte "17" que estava aqui quebrando a leitura da mesa
  return [...HEADER, 48, MODEL_ID, 13, 2, 4, parameter, channelIndex, ...FOOTER];
}

function parseIncoming(message) {
  if (!message || message.length < 8) return null;

  const element = message[6];

  // DEBUG EXTREMO: Se for Parameter Change (127 1), ignora Faders (28), ON (26) e Auxs (35)
  if (message[4] === 127 && message[5] === 1) {
      if (element !== 28 && element !== 26 && element !== 35) {
          console.log(`🔍 [DEBUG PARAM] Ele|Par: ${element}|${message[7]} ->`, Buffer.from(message).toString('hex').toUpperCase());
      }
  } else if (message[4] !== 13 && message[4] !== 26) {
      // Se não for Nome/Solo (13) nem Bulk que eu já leio (26), joga no log!
      console.log('🔍 [DEBUG SYSEX DESCONHECIDO] ->', Buffer.from(message).toString('hex').toUpperCase());
  }

  // Meter Bulk Dump Detection: F0 43 1n 3E 1A 21 ...
  if (message[4] === 26 && message[5] === 33) {
      let levels = [];
      const dataStart = 10;
      
      const dataLen = message.length - dataStart - 2; 
      const bytesPerCh = Math.max(1, Math.floor(dataLen / 32));
      
      for(let i = 0; i < 32; i++) {
          let val = 0;
          let idx = dataStart + (i * bytesPerCh);
          
          let raw = 0;
          for (let b = 0; b < bytesPerCh; b++) {
              raw = (raw << 7) | (message[idx + b] & 0x7F);
          }
          
          if (raw > 0) {
              // Dinamicamente calc max log baseado nos bytes da mesa e gera a %
              const maxPow = Math.log10(Math.pow(128, bytesPerCh) - 1);
              val = (Math.log10(raw) / maxPow) * 110; // offset leve
              if (val > 100) val = 100;
              if (val < 0) val = 0;
          }
          levels.push(val);
      }
      return { type: 'METER_BULK', levels };
  }

  if (message[4] === 13 && message[5] === 127) return null;

  const dataBytes = message.slice(9, -1);
  const parameter = message[7];
  const channel = message[8];

  if (message[4] === 127 && message[5] === 1) {
      // Attenuator (Element 29)
      if (element === 29) return { type: 'kInputAttenuator/kAtt', channel, value: CONVERTERS.bytesToSigned(dataBytes) };

      if (element === 28) return { type: 'kInputFader/kFader', channel, value: CONVERTERS.bytesToFader(dataBytes) };
      if (element === 26) return { type: 'kInputChannelOn/kChannelOn', channel, value: CONVERTERS.bytesToOn(dataBytes) };

      // EQ (Element 32)
      if (element === 32 && parameter <= 15) {
          const eqKeys = [
              'kEQMode', 'kEQLowQ', 'kEQLowF', 'kEQLowG', 'kEQHPFOn',
              'kEQLowMidQ', 'kEQLowMidF', 'kEQLowMidG',
              'kEQHiMidQ', 'kEQHiMidF', 'kEQHiMidG',
              'kEQHiQ', 'kEQHiF', 'kEQHiG',
              'kEQLPFOn', 'kEQOn'
          ];
          const key = eqKeys[parameter];
          // EQ Gain (G) uses signed resolution, others use fader (unsigned)
          const converter = (key.endsWith('G')) ? CONVERTERS.bytesToSigned : CONVERTERS.bytesToFader;
          return { type: `kInputEQ/${key}`, channel, value: converter(dataBytes) };
      }

      // Master (Stereo) Fader e ON
      if (element === 79 && message[7] === 0) return { type: 'kStereoFader/kFader', channel: 'master', value: CONVERTERS.bytesToFader(dataBytes) };
      if (element === 77 && message[7] === 0) return { type: 'kStereoChannelOn/kChannelOn', channel: 'master', value: CONVERTERS.bytesToOn(dataBytes) };

      // Aux Sends (Element 35)
      if (element === 35) {
          const auxIdx = Math.floor(parameter / 3) + 1;
          const offset = parameter % 3;
          if (offset === 0) return { type: `kInputAUX/kAUX${auxIdx}On`, channel, value: CONVERTERS.bytesToOn(dataBytes) };
          if (offset === 2) return { type: `kInputAUX/kAUX${auxIdx}Level`, channel, value: CONVERTERS.bytesToFader(dataBytes) };
      }
  }
  
  if (message[4] === 13) {
      // Lê as letras dos nomes
      if (message[5] === 2 && element === 4 && parameter >= 4 && parameter <= 19) {
          const charIndex = parameter - 4;
          return { type: 'CH_NAME_CHAR', channel, charIndex, char: CONVERTERS.bytesToChar(dataBytes) };
      }
      
      // Lê o Solo
      if (message[5] === 3 && element === 46) {
          return { type: 'kSetupSoloChOn/kSoloChOn', channel, value: CONVERTERS.bytesToOn(dataBytes) };
      }
  }

  return null;
}

module.exports = { COMMAND_BYTES, CONVERTERS, buildChange, buildRequest, buildNameRequest, parseIncoming };