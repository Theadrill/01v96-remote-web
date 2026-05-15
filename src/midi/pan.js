// ============================================================================
// pan.js — Módulo de Pan (Stereo Position) da Yamaha 01V96
// ============================================================================
//
// PROTOCOLO (baseado em engenharia reversa via monitor.js):
//
//  Comando: F0 43 10 3E 7F 01 1B 00 <CH_IDX> <b3> <b2> <b1> <b0> F7
//  Request: F0 43 30 3E 7F 01 1B 00 <CH_IDX> F7
//
//  CH_IDX (índice linear 0-based):
//    CH 1-32    → 0x00–0x1F
//    ST IN 1-4  → 0x20, 0x22, 0x24, 0x26
//    MASTER     → usa endereço diferente: 4E 00 01 (não usa 1B)
//
//  VALOR (4 bytes, 28-bit signed, leitura big-endian de 7 bits cada):
//    Centro (C)  → 00 00 00 00
//    Direita R1  → 00 00 00 01   ...   R63 → 00 00 00 3F
//    Esquerda L1 → 7F 7F 7F 7F  ...   L63 → 7F 7F 7F 41
//
//  Faixa MIDI: –63 (L63) a 0 (C) a +63 (R63)
//
// ÍNDICE GLOBAL DO SISTEMA → ÍNDICE DE CANAL DA MESA:
//   CH 1-32   : global 0–31  → canal 0x00–0x1F
//   ST IN 1-4 : global 60–67 (pares) → canal 0x20–0x23 (índice = 32 + (global-60)/2)
//   MASTER    : 'master'     → endereço 4E 00 01
// ============================================================================

// --- CONSTANTES DO PROTOCOLO ---
const HEADER = [0xF0, 0x43];
const MODEL  = 0x3E;
const FOOTER = [0xF7];

// Seção/Grupo do Pan de input (1B 00) — seção 7F, grupo 01
const PAN_SECTION = 0x7F;
const PAN_GROUP   = 0x01;
const PAN_ELEMENT = 0x1B;  // 27
const PAN_PARAM   = 0x00;

// Endereço do Pan do Master (Stereo Out)
const MASTER_SECTION = 0x7F; // 127
const MASTER_GROUP   = 0x01;
const MASTER_ELEMENT = 0x4E; // 78
const MASTER_PARAM   = 0x00;

// -------------------------------------------------------------------
// CONVERSÃO DE VALOR
// -------------------------------------------------------------------

/**
 * Converte um valor de Pan do sistema (–63 a +63) para 4 bytes MIDI (28-bit signed).
 * R positivo → 00 00 00 VV
 * L negativo → 7F 7F 7F (128 – |VV|)   (complemento de 128 em 7 bits)
 * Centro     → 00 00 00 00
 *
 * @param {number} panValue  Número inteiro entre –63 e +63
 * @returns {number[]} Array de 4 bytes [b3, b2, b1, b0]
 */
function panValueToBytes(panValue) {
    const v = Math.round(Math.max(-63, Math.min(63, panValue)));
    if (v >= 0) {
        return [0x00, 0x00, 0x00, v & 0x7F];
    }
    // Negativo: representação 28-bit complemento
    // Equivale a: (2^28 + v) em grupos de 7 bits
    const raw = 0x10000000 + v;  // 2^28 = 268435456 = 0x10000000
    return [
        (raw >> 21) & 0x7F,
        (raw >> 14) & 0x7F,
        (raw >>  7) & 0x7F,
         raw        & 0x7F
    ];
}

/**
 * Converte 4 bytes MIDI de volta para valor de Pan (–63 a +63).
 *
 * @param {number[]} bytes  Array de 4 bytes [b3, b2, b1, b0]
 * @returns {number} Valor entre –63 e +63
 */
function bytesToPanValue(bytes) {
    // Reconstrói o inteiro de 28 bits (big-endian, 7 bits por byte)
    const raw = ((bytes[0] & 0x7F) << 21) |
                ((bytes[1] & 0x7F) << 14) |
                ((bytes[2] & 0x7F) <<  7) |
                 (bytes[3] & 0x7F);

    // Testa o bit de sinal (bit 27 de um inteiro de 28 bits)
    const SIGN_BIT = 1 << 27;
    const MASK     = (1 << 28) - 1;
    const signed   = (raw & SIGN_BIT) ? (raw - MASK - 1) : raw;

    return Math.max(-63, Math.min(63, signed));
}

// -------------------------------------------------------------------
// MAPEAMENTO DE CANAL GLOBAL → ÍNDICE LOCAL DA MESA
// -------------------------------------------------------------------

/**
 * Converte o ID global do canal para o índice linear usado no SysEx de Pan.
 * Retorna null para canais que não suportam Pan (BUS, AUX, etc.).
 *
 * @param {number|string} globalChannel
 * @returns {{ isMaster: boolean, channelIdx: number } | null}
 */
function globalChannelToPanIndex(globalChannel) {
    if (globalChannel === 'master' || Number(globalChannel) === 52) {
        return { isMaster: true, channelIdx: 1 };
    }

    const ch = Number(globalChannel);

    // CH 1-32 (índices globais 0–31)
    if (ch >= 0 && ch <= 31) {
        return { isMaster: false, channelIdx: ch };
    }

    // ST IN 1-4 (índices globais 60, 62, 64, 66 → local 32, 34, 36, 38 = 0x20, 0x22, 0x24, 0x26)
    if (ch >= 60 && ch <= 67) {
        const stIdx = Math.floor((ch - 60) / 2); // 0-3
        return { isMaster: false, channelIdx: 0x20 + (stIdx * 2) };
    }

    // AUX, BUS, MATRIX: não têm Pan independente de canal
    return null;
}

// -------------------------------------------------------------------
// COMANDOS SYSEX
// -------------------------------------------------------------------

/**
 * Constrói o SysEx de ESCRITA de Pan.
 *
 * @param {number|string} globalChannel  ID global do canal
 * @param {number}        panValue       Valor entre –63 e +63
 * @returns {number[]|null}
 */
function buildPanChange(globalChannel, panValue) {
    const mapped = globalChannelToPanIndex(globalChannel);
    if (!mapped) return null;

    const bytes = panValueToBytes(panValue);

    if (mapped.isMaster) {
        return [
            ...HEADER, 0x10, MODEL,
            MASTER_SECTION, MASTER_GROUP, MASTER_ELEMENT, MASTER_PARAM,
            mapped.channelIdx,
            ...bytes,
            ...FOOTER
        ];
    }

    return [
        ...HEADER, 0x10, MODEL,
        PAN_SECTION, PAN_GROUP, PAN_ELEMENT, PAN_PARAM,
        mapped.channelIdx,
        ...bytes,
        ...FOOTER
    ];
}

/**
 * Constrói o SysEx de LEITURA (Request) de Pan.
 *
 * @param {number|string} globalChannel  ID global do canal
 * @returns {number[]|null}
 */
function buildPanRequest(globalChannel) {
    const mapped = globalChannelToPanIndex(globalChannel);
    if (!mapped) return null;

    if (mapped.isMaster) {
        return [
            ...HEADER, 0x30, MODEL,
            MASTER_SECTION, MASTER_GROUP, MASTER_ELEMENT, MASTER_PARAM,
            mapped.channelIdx,
            ...FOOTER
        ];
    }

    return [
        ...HEADER, 0x30, MODEL,
        PAN_SECTION, PAN_GROUP, PAN_ELEMENT, PAN_PARAM,
        mapped.channelIdx,
        ...FOOTER
    ];
}

// -------------------------------------------------------------------
// PARSER DE MENSAGEM RECEBIDA
// -------------------------------------------------------------------

/**
 * Tenta interpretar uma mensagem SysEx como um evento de Pan.
 * Retorna null se a mensagem não for de Pan.
 *
 * @param {number[]|Buffer} message  Mensagem MIDI recebida
 * @returns {{ type: 'kPan', channel: number|string, value: number } | null}
 */
function parsePanMessage(message) {
    if (!message || message.length !== 14) return null;

    // Deve ser uma mensagem de dado (0x10), não request
    if (message[0] !== 0xF0 || message[1] !== 0x43 || message[2] !== 0x10 || message[3] !== 0x3E) return null;

    const sec  = message[4];
    const grp  = message[5];
    const elem = message[6];
    const prm  = message[7];
    const chIdx = message[8];
    const dataBytes = [message[9], message[10], message[11], message[12]];

    // Pan de input (CH 1-32, ST IN 1-4)
    if (sec === PAN_SECTION && grp === PAN_GROUP && elem === PAN_ELEMENT && prm === PAN_PARAM) {
        const panValue = bytesToPanValue(dataBytes);
        let globalChannel;

        if (chIdx >= 0x00 && chIdx <= 0x1F) {
            // CH 1-32
            globalChannel = chIdx;
        } else if (chIdx >= 0x20 && chIdx <= 0x27) {
            // ST IN 1-4 (mapeados nos índices pares 32, 34, 36, 38)
            const stIdx = Math.floor((chIdx - 0x20) / 2);
            globalChannel = 60 + (stIdx * 2);
        } else {
            return null;
        }

        return { type: 'kPan', channel: globalChannel, value: panValue };
    }

    // Pan do Master (Stereo Out)
    if (sec === MASTER_SECTION && grp === MASTER_GROUP && elem === MASTER_ELEMENT && prm === MASTER_PARAM && chIdx === 0x01) {
        const panValue = bytesToPanValue(dataBytes);
        return { type: 'kPan', channel: 'master', value: panValue };
    }

    return null;
}

// -------------------------------------------------------------------
// SINCRONIZAÇÃO INICIAL (bulk read)
// -------------------------------------------------------------------

/**
 * Gera a lista de todos os SysEx de Request para sincronizar o Pan
 * de todos os canais da mesa de uma vez.
 *
 * Canais cobertosl:
 *   CH 1-32   (globais 0–31)
 *   ST IN 1-4 (globais 60, 62, 64, 66)
 *   MASTER    ('master')
 *
 * @returns {number[][]}  Array de mensagens SysEx
 */
function buildPanSyncRequests() {
    const requests = [];

    // CH 1-32
    for (let ch = 0; ch <= 31; ch++) {
        const req = buildPanRequest(ch);
        if (req) requests.push(req);
    }

    // ST IN 1-4
    for (let stGlobal = 60; stGlobal <= 66; stGlobal += 2) {
        const req = buildPanRequest(stGlobal);
        if (req) requests.push(req);
    }

    // Master
    const masterReq = buildPanRequest('master');
    if (masterReq) requests.push(masterReq);

    return requests;
}

// -------------------------------------------------------------------
// EXPORTS
// -------------------------------------------------------------------

module.exports = {
    // Encode / Decode
    panValueToBytes,
    bytesToPanValue,

    // Address mapping
    globalChannelToPanIndex,

    // SysEx builders
    buildPanChange,
    buildPanRequest,

    // Parser
    parsePanMessage,

    // Sync
    buildPanSyncRequests,
};
