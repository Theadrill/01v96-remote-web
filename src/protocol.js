const { COMMAND_BYTES } = require('./dictionary');

const CONVERTERS = {
  faderToBytes: (value) => [0, 0, (value >> 7) & 0x07, value & 0x7F],
  bytesToFader: (bytes) => {
      let val = 0;
      for (let i = 0; i < bytes.length; i++) {
          val = (val << 7) | bytes[i];
      }
      return val;
  },
  bytesToSigned: (bytes) => {
      let val = 0;
      for (let i = 0; i < bytes.length; i++) {
          val = (val << 7) | bytes[i];
      }
      
      const numBits = bytes.length * 7;
      const signBit = 1 << (numBits - 1);
      const mask = (1 << numBits) - 1;
      if (val & signBit) val -= (mask + 1);
      return val;
  },
  signedToBytes: (value) => {
      let v = Math.round(value);
      if (v < 0) v += 0x10000000;
      return [(v >> 21) & 0x7F, (v >> 14) & 0x7F, (v >> 7) & 0x7F, v & 0x7F];
  },
  signed14ToBytes: (value) => {
      let v = Math.round(value);
      if (v < 0) v += 0x4000;
      return [(v >> 7) & 0x7F, v & 0x7F];
  },
  dynOnToBytes: (isOn) => [0, 0, 0, isOn ? 0 : 1],
  bytesToDynOn: (bytes) => (bytes[bytes.length - 1] === 0),
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

function buildNameChange(channelIndex, charIndex, charCode) {
  const parameter = 4 + charIndex;
  // F0 43 10 3E 0D 02 04 [PARAM] [CH] 00 00 00 [VAL] F7
  return [...HEADER, 16, MODEL_ID, 13, 2, 4, parameter, channelIndex, 0, 0, 0, charCode, ...FOOTER];
}

function parseIncoming(message) {
  if (!message || message.length < 8) return null;

  // Ignora se não for uma mensagem de dados/mudança (0x1n). 
  // Isso evita processar nossos próprios pedidos (Requests 0x3n) que o loopMIDI ecoa de volta.
  if ((message[2] & 0xF0) !== 0x10) return null;

  const element = message[6];

  // 🚨 [CRITICAL SYNC LOGIC] - NÃO ALTERAR A LÓGICA DE METER ABAIXO
  // O check 'message.length > 20' é VITAL para diferenciar meters de parâmetros de dinâmica (Gate/Comp).
  // Se remover esse check ou os IDs (13/26/127), a sincronia de Gate/Comp da 01V96 IRÁ QUEBRAR.
  const isMeter = message.length > 20 && (message[4] === 13 || message[4] === 26 || message[4] === 127) && (message[5] === 33 || message[5] === 32);

  if (isMeter) {
      let levels = [];
      const dataStart = 9; 
      // 01V96 envia 32 canais. O Master ou outros dependem do grupo pedido.
      // Limitamos a 33 pontos, mas garantimos que não lemos o byte F7 (message.length - 1)
      for (let i = 0; i < 33; i++) {
          const idx = dataStart + (i * 2);
          if (idx >= message.length - 1) {
              levels.push(0); // Evita ler F7 (247) como valor de meter
          } else {
              levels.push(message[idx] || 0);
          }
      }
      return { type: 'METER_DATA', levels };
  }

  if (message[4] === 13 && message[5] === 127) return null;

  const dataBytes = message.slice(9, -1);
  const parameter = message[7];
  const channel = message[8];

  // 🚨 [CRITICAL SYNC LOGIC] - PARAMETER CHANGES
  // Suporta ID 13, 26 e 127 (Universal) que são os comandos de mudança de parâmetro da 01V96.
  if (message[4] === 13 || message[4] === 127 || message[4] === 26 || message[4] === 1) {
      // EQ Parsing: Input (32, 33), Bus (46), AUX (60), Stereo (82)
      // Note: Bus EQ (46) collides with Solo (46) when requested, so we check message[5] === 1 (Param Change)
      const eqMap = { 32: 'kInput', 33: 'kInput', 46: 'kBus', 60: 'kAUX', 82: 'kStereo' };
      if (eqMap[element] && parameter <= 15 && message[5] === 1) {
          const eqKeys = [
              'kEQMode', 'kEQLowQ', 'kEQLowF', 'kEQLowG', 'kEQHPFOn',
              'kEQLowMidQ', 'kEQLowMidF', 'kEQLowMidG',
              'kEQHiMidQ', 'kEQHiMidF', 'kEQHiMidG',
              'kEQHiQ', 'kEQHiF', 'kEQHiG',
              'kEQLPFOn', 'kEQOn'
          ];
          const prefix = eqMap[element];
          const key = eqKeys[parameter];
          const converter = (key.endsWith('G')) ? CONVERTERS.bytesToSigned : CONVERTERS.bytesToFader;
          return { type: `${prefix}EQ/${key}`, channel: (prefix === 'kStereo' ? 'master' : channel), value: converter(dataBytes) };
      }

    // Input GATE (Element 30)
    if (element === 30) {
        const gateKeys = [
            'kGateOn', 'kGateLink', 'kGateKeyIn', 'kGateKeyAUX', 'kGateKeyCh',
            'kGateType', 'kGateAttack', 'kGateRange', 'kGateHold', 'kGateDecay', 'kGateThreshold'
        ];
        const key = gateKeys[parameter];
        let converter = CONVERTERS.bytesToFader;
        if (key === 'kGateThreshold' || key === 'kGateRange') converter = CONVERTERS.bytesToSigned;
        if (key === 'kGateOn' || key === 'kGateLink') converter = CONVERTERS.bytesToOn;
        return { type: `kInputGate/${key}`, channel, value: converter(dataBytes) };
    }

    // Input Comp (Element 31)
    if (element === 31) {
        const compKeys = [
            'kCompLocComp', 'kCompOn', 'kCompLink', 'kCompType',
            'kCompAttack', 'kCompRelease', 'kCompRatio', 'kCompGain', 'kCompKnee', 'kCompThreshold'
        ];
        const key = compKeys[parameter];
        let converter = CONVERTERS.bytesToFader;
        if (key === 'kCompThreshold') converter = CONVERTERS.bytesToSigned;
        if (key === 'kCompOn' || key === 'kCompLink') converter = CONVERTERS.bytesToOn;
        return { type: `kInputComp/${key}`, channel, value: converter(dataBytes) };
    }

    // Bus Assign (Element 34)
    if (element === 34) {
        if (parameter === 0) {
            return { type: 'kInputBus/kStereo', channel, value: CONVERTERS.bytesToOn(dataBytes) };
        }
        if (parameter >= 3 && parameter <= 10) {
            return { type: `kInputBus/kBus${parameter - 2}`, channel, value: CONVERTERS.bytesToOn(dataBytes) };
        }
    }

    // 🚨 [CRITICAL SYNC LOGIC] - NOMES DE CANAIS (YAMAHA 01V96 PADRÃO)
    // Mantemos o limite de 19 (16 caracteres) para compatibilidade total com o protocolo da mesa.
    // O controle visual de 4 caracteres deve ser feito apenas no Front-end.
    if (message[4] === 13 && message[5] === 2 && element === 4) {
        if (parameter >= 4 && parameter <= 19) {
            const charIndex = parameter - 4;
            const charCode = dataBytes[dataBytes.length - 1];
            return { 
                type: 'updateNameChar', 
                channel, 
                charIndex, 
                char: String.fromCharCode(charCode) 
            };
        }
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

      
      // Solo
      if (message[5] === 3 && element === 46) {
          return { type: 'kSetupSoloChOn/kSoloChOn', channel, value: CONVERTERS.bytesToOn(dataBytes) };
      }

      // Input Patch (Element ID 13, Element 2, Param 1, Sub 0)
      if (message[4] === 13 && message[5] === 2 && element === 1 && parameter === 0) {
          return { type: 'kChannelInput/kChannelIn', channel, value: CONVERTERS.bytesToFader(dataBytes), raw: message };
      }
  }

  // Debug capture for unparsed messages (excluding meters and heartbeat)
  if (message[2] !== 33 && message[2] !== 32 && message[2] !== 0x7F) {
     const hex = Buffer.from(message).toString('hex').toUpperCase();
     // console.log(`🔍 [MIDI UNPARSED] -> ${hex}`);
  }

  return null;
}

module.exports = { COMMAND_BYTES, CONVERTERS, buildChange, buildRequest, buildNameRequest, buildNameChange, parseIncoming };
