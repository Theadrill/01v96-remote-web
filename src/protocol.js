// ==========================================
// 1. O DICIONÁRIO DE ENDEREÇOS (Extraído do message-types.ts)
// ==========================================
const COMMAND_BYTES = {
  // Faders e Mutes de Entrada (Canais 1 a 32)
  'FADER_INPUT': [127, 1, 28, 0], 
  'MUTE_INPUT':  [127, 1, 26, 0],

  // Nome da Cena (16 Caracteres)
  'SCENE_NAME_1':  [127, 1, 1, 0],
  'SCENE_NAME_2':  [127, 1, 1, 1],
  'SCENE_NAME_3':  [127, 1, 1, 2],
  'SCENE_NAME_4':  [127, 1, 1, 3],
  'SCENE_NAME_5':  [127, 1, 1, 4],
  'SCENE_NAME_6':  [127, 1, 1, 5],
  'SCENE_NAME_7':  [127, 1, 1, 6],
  'SCENE_NAME_8':  [127, 1, 1, 7],
  'SCENE_NAME_9':  [127, 1, 1, 8],
  'SCENE_NAME_10': [127, 1, 1, 9],
  'SCENE_NAME_11': [127, 1, 1, 10],
  'SCENE_NAME_12': [127, 1, 1, 11],
  'SCENE_NAME_13': [127, 1, 1, 12],
  'SCENE_NAME_14': [127, 1, 1, 13],
  'SCENE_NAME_15': [127, 1, 1, 14],
  'SCENE_NAME_16': [127, 1, 1, 15],
  
  // Você pode adicionar os Auxiliares, Busses e EQs aqui depois facilmente!
};

// ==========================================
// 2. CONVERSORES MATEMÁTICOS (Extraído do converters.ts)
// ==========================================
const CONVERTERS = {
  // Converte array de bytes da mesa para número do fader (0 a 1023)
  bytesToFader: (bytes) => (bytes[2] << 7) + bytes[3],
  
  // Converte número do fader (0 a 1023) para array de bytes da mesa
  faderToBytes: (value) => [0, 0, value >> 7, value & 0x7f],
  
  // Converte bytes (Mute) para booleano (true/false)
  bytesToOn: (bytes) => !!bytes[3],
  
  // Converte booleano (true/false) para bytes de Mute
  onToBytes: (isOn) => [0, 0, 0, isOn ? 1 : 0],
  
  // Converte o byte final da mensagem para um Caractere ASCII (Texto)
  bytesToChar: (bytes) => String.fromCharCode(bytes[3])
};

// ==========================================
// 3. MONTADORES DE MENSAGEM (O "Motor" do Protocolo)
// ==========================================

const HEADER = [240, 67]; // F0 43
const MODEL_ID = 62;      // 3E
const FOOTER = [247];     // F7

/**
 * Cria uma mensagem de ALTERAÇÃO (Para enviar um comando pra mesa)
 * Ex: buildChange('FADER_INPUT', 0, 500, CONVERTERS.faderToBytes)
 */
function buildChange(commandName, channelIndex, value, converterFunc) {
  const address = COMMAND_BYTES[commandName];
  if (!address) return null;

  const payload = converterFunc(value);
  // 16 = 0x10 (Parameter Change), 127 = 0x7F (Universal)
  return [...HEADER, 16, MODEL_ID, 127, ...address, channelIndex, ...payload, ...FOOTER];
}

/**
 * Cria uma mensagem de PEDIDO/SYNC (Para pedir uma info pra mesa)
 * Ex: buildRequest('SCENE_NAME_1', 0)
 */
function buildRequest(commandName, channelIndex = 0) {
  const address = COMMAND_BYTES[commandName];
  if (!address) return null;

  // 48 = 0x30 (Parameter Request), 17 = 0x11 (Request Command)
  return [...HEADER, 48, MODEL_ID, 17, ...address, channelIndex, ...FOOTER];
}

// ==========================================
// 4. TRADUTOR DE ENTRADA (Mesa -> Node)
// ==========================================
function parseIncoming(message) {
  // Ignora Heartbeat ou mensagens pequenas demais
  if (message.length < 14 || message[4] === 13) return null;

  const isRequest = message[2] === 48; // Verifica se é resposta de um Request
  const element = message[6];
  const parameter = message[7];
  const channel = message[8];
  const dataBytes = message.slice(9, -1); // Pega só o "miolo" da mensagem com os valores

  // Aqui nós criamos uma lógica que identifica o que chegou e usa o conversor certo
  if (element === 28) {
      return { type: 'FADER_INPUT', channel, value: CONVERTERS.bytesToFader(dataBytes) };
  }
  if (element === 26) {
      return { type: 'MUTE_INPUT', channel, value: CONVERTERS.bytesToOn(dataBytes) };
  }
  if (element === 1 && parameter >= 0 && parameter <= 15) {
      return { type: 'SCENE_NAME_CHAR', index: parameter, char: CONVERTERS.bytesToChar(dataBytes) };
  }

  return { type: 'UNKNOWN', element, parameter, channel };
}

// Exportamos tudo para o Servidor usar
module.exports = {
  COMMAND_BYTES,
  CONVERTERS,
  buildChange,
  buildRequest,
  parseIncoming
};