const { COMMAND_BYTES } = require('./dictionary');

const CONVERTERS = {
  faderToBytes: (value) => [0, 0, (value >> 7) & 0x07, value & 0x7F],
  bytesToFader: (bytes) => {
      const len = bytes.length;
      if (len >= 2) return (bytes[len-2] << 7) + bytes[len-1];
      return 0;
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
  if (message[4] === 13 && message[5] === 127) return null;

  const dataBytes = message.slice(9, -1);
  const element = message[6];
  const parameter = message[7];
  const channel = message[8];

  if (message[4] === 127 && message[5] === 1) {
      if (element === 28) return { type: 'kInputFader/kFader', channel, value: CONVERTERS.bytesToFader(dataBytes) };
      if (element === 26) return { type: 'kInputChannelOn/kChannelOn', channel, value: CONVERTERS.bytesToOn(dataBytes) };

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