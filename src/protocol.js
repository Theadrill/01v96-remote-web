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
  // Retornamos ao ID 13 (0x0D) pois é o padrão clássico da 01V96 para Nomes
  return [...HEADER, 48, MODEL_ID, 13, 2, 4, parameter, channelIndex, ...FOOTER];
}

function parseIncoming(message) {
  if (!message || message.length < 8) return null;

  const element = message[6];

  // METER DATA: F0 43 1n 3E (0D/1A/15/7F) (20/21/01) ...
  const isMeter = (message[4] === 21 || message[4] === 13 || message[4] === 26 || message[4] === 127) && (message[5] === 1 || message[5] === 33 || message[5] === 32);

  // METER DATA logic
  if (isMeter) {
      let levels = [];
      const dataStart = 9; 
      // 01V96 envia até 70 e poucos pontos de meter. 
      // 0-31: Canais, 32-33: Stereo, 34-41: Mixes, 42-49: Buses
      for (let i = 0; i < 70; i++) {
          const deviceLevel = message[dataStart + (i * 2)];
          if (deviceLevel === undefined) break;
          // Conversão empírica baseada no comportamento observado da 01V96 (0-32 -> 0-115%)
          let val = Math.min((Math.pow(deviceLevel, 2) / Math.pow(32, 2)) * 115, 115);
          levels.push(val);
      }
      return { type: 'METER_DATA', levels };
  }

  if (message[4] === 13 && message[5] === 127) return null;

  const dataBytes = message.slice(9, -1);
  const parameter = message[7];
  const channel = message[8];

  // Param Changes support ID 13, 26, 127
  if (message[4] === 13 || message[4] === 127 || message[4] === 26) {
      // Input EQ (Elements 32 and 33)
      if ((element === 32 || element === 33) && parameter <= 15) {
          const eqKeys = [
              'kEQMode', 'kEQLowQ', 'kEQLowF', 'kEQLowG', 'kEQHPFOn',
              'kEQLowMidQ', 'kEQLowMidF', 'kEQLowMidG',
              'kEQHiMidQ', 'kEQHiMidF', 'kEQHiMidG',
              'kEQHiQ', 'kEQHiF', 'kEQHiG',
              'kEQLPFOn', 'kEQOn'
          ];
          const key = eqKeys[parameter];
          const converter = (key.endsWith('G')) ? CONVERTERS.bytesToSigned : CONVERTERS.bytesToFader;
          // Channel byte usually already carries the shift if it's 0-31, but some mixers use element shift.
          // For now, we trust the channel byte message[8].
          return { type: `kInputEQ/${key}`, channel, value: converter(dataBytes) };
      }

      // Input Faders / On / Solo / Name / Attenuator etc
      if (element === 28) return { type: 'kInputFader/kFader', channel, value: CONVERTERS.bytesToFader(dataBytes) };
      if (element === 26) return { type: 'kInputChannelOn/kChannelOn', channel, value: CONVERTERS.bytesToOn(dataBytes) };
      if (element === 29) return { type: 'kInputAttenuator/kAtt', channel, value: CONVERTERS.bytesToSigned(dataBytes) };

      // Mix (AUX) Master Faders / ON
      if (element === 57) return { type: 'kAUXFader/kFader', channel, value: CONVERTERS.bytesToFader(dataBytes) };
      if (element === 54) return { type: 'kAUXChannelOn/kChannelOn', channel, value: CONVERTERS.bytesToOn(dataBytes) };

      // Bus Master Faders / ON
      if (element === 43) return { type: 'kBusFader/kFader', channel, value: CONVERTERS.bytesToFader(dataBytes) };
      if (element === 41) return { type: 'kBusChannelOn/kChannelOn', channel, value: CONVERTERS.bytesToOn(dataBytes) };

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

      // Names
      if (message[5] === 2 && element === 4 && parameter >= 4 && parameter <= 19) {
          const charIndex = parameter - 4;
          const char = CONVERTERS.bytesToChar(dataBytes);
          return { type: 'CH_NAME_CHAR', channel, charIndex, char };
      }
      
      // Solo
      if (message[5] === 3 && element === 46) {
          return { type: 'kSetupSoloChOn/kSoloChOn', channel, value: CONVERTERS.bytesToOn(dataBytes) };
      }
  }

  // Debug capture for unparsed messages (excluding meters and heartbeat)
  if (message[2] !== 33 && message[2] !== 32 && message[2] !== 0x7F) {
     const hex = Buffer.from(message).toString('hex').toUpperCase();
     // console.log(`🔍 [MIDI UNPARSED] -> ${hex}`);
  }

  return null;
}

module.exports = { COMMAND_BYTES, CONVERTERS, buildChange, buildRequest, buildNameRequest, parseIncoming };