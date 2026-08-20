/**
 * Módulo de Utilitários e Conversão de Escalas (v2) - 01v96 Remote Web
 * Funções puras de conversão matemática dB/RAW, lookup de estado e metadados de canal.
 */

import {
    channelStates,
    mixesState,
    busesState,
    masterState,
    MASTER_CHANNEL_ID
} from './state.js';

// ==========================================
// Curva Logarítmica Canônica do Fader Yamaha 01v96 (0-1023 RAW -> dB)
// ==========================================
export const FADER_CURVE = [
    { r: 1, d: -138 },
    { r: 50, d: -74.6 },
    { r: 75, d: -69.6 },
    { r: 100, d: -64.6 },
    { r: 200, d: -44.6 },
    { r: 403, d: -22 },
    { r: 423, d: -20 },
    { r: 523, d: -15 },
    { r: 603, d: -11 },
    { r: 723, d: -5 },
    { r: 823, d: 0 },
    { r: 1023, d: 10 }
];

/**
 * Converte valor RAW (0-1023) da 01v96 para valor em dB formatado
 * @param {number} v Valor raw (0 a 1023)
 * @param {boolean} withUnit Se deve anexar a string " dB"
 * @param {boolean} isMaster Se é canal Master (topo 1023 vira 0 dB)
 * @returns {string} Ex: "-12.50 dB" ou "-12.50"
 */
export function rawToDb(v, withUnit = true, isMaster = false) {
    if (v == 0) return "-∞" + (withUnit ? " dB" : "");

    for (let i = 1; i < FADER_CURVE.length; i++) {
        const p1 = FADER_CURVE[i - 1];
        const p2 = FADER_CURVE[i];
        if (v >= p1.r && v <= p2.r) {
            let dValNum = p1.d + (v - p1.r) * ((p2.d - p1.d) / (p2.r - p1.r));
            if (isMaster) dValNum -= 10; // No MASTER, 1023 (o topo) vira 0dB
            const dVal = dValNum.toFixed(2);
            return withUnit ? dVal + " dB" : dVal;
        }
    }
    return withUnit ? "0.00 dB" : "0.00";
}

/**
 * Converte valor em dB para escala RAW (0-1023) da 01v96
 * @param {number} db Valor numérico em dB
 * @returns {number} Valor inteiro entre 0 e 1023
 */
export function dbToRaw(db) {
    if (db <= -138) return 0;
    if (db >= 10) return 1023;

    for (let i = 1; i < FADER_CURVE.length; i++) {
        const p1 = FADER_CURVE[i - 1];
        const p2 = FADER_CURVE[i];
        if (db >= p1.d && db <= p2.d) {
            return Math.round(p1.r + (db - p1.d) * ((p2.r - p1.r) / (p2.d - p1.d)));
        }
    }
    return 0;
}

/**
 * Calcula o próximo valor RAW baseado em um step em dB.
 * Útil para botões de nudge (+/-) que operam em passos fixos de volume.
 * @param {number} currentRaw Valor RAW atual (0-1023)
 * @param {number} dir Direção (+1 para aumentar, -1 para diminuir)
 * @param {number} stepDb Tamanho do passo em dB (default 0.5)
 * @returns {number} Próximo valor RAW
 */
export function getSteppedRaw(currentRaw, dir, stepDb = 0.5) {
    const magnitude = Math.abs(dir);
    const isUp = dir > 0;
    const currentDbStr = rawToDb(currentRaw, false);
    const currentDb = currentDbStr === "-∞" ? -138 : parseFloat(currentDbStr);

    // Se estiver no infinito e subir, começa do fundo da curva (-138)
    if (currentRaw === 0 && isUp) {
        return dbToRaw(-138 + (stepDb * magnitude));
    }

    let nextDb = isUp ? (currentDb + (stepDb * magnitude)) : (currentDb - (stepDb * magnitude));

    // Proteções de limites
    if (nextDb > 10) nextDb = 10;
    if (nextDb < -138) return 0;

    let nRaw = dbToRaw(nextDb);

    // Garante avanço de pelo menos 1 unidade raw em áreas de baixa resolução
    if (nRaw === currentRaw) {
        if (isUp && currentRaw < 1023) nRaw = currentRaw + 1;
        else if (!isUp && currentRaw > 0) nRaw = currentRaw - 1;
    }

    return nRaw;
}

/**
 * Retorna o objeto de estado correto baseado no ID global do canal
 * @param {number|string} id 0-31 (Inputs), 32-39/60-67 (ST IN), 36-43 (Mixes), 44-51 (Buses), 52/'master' (Master)
 * @returns {Object|null}
 */
export function getChannelStateById(id) {
    if (typeof id === 'string' && id.startsWith('st')) {
        const num = parseInt(id.replace('st', ''), 10);
        return channelStates[32 + num];
    }
    if (id === 'master' || id === MASTER_CHANNEL_ID) return masterState;
    if (typeof id === 'string' && id.startsWith('m')) return mixesState[parseInt(id.substring(1), 10)];
    if (typeof id === 'string' && id.startsWith('b')) return busesState[parseInt(id.substring(1), 10)];

    if (typeof id === 'number') {
        if (id >= 0 && id <= 31) return channelStates[id];
        if (id >= 36 && id <= 43) return mixesState[id - 36];
        if (id >= 44 && id <= 51) return busesState[id - 44];
        if (id >= 60 && id <= 67) return channelStates[32 + (id - 60)];
        if (id === MASTER_CHANNEL_ID) return masterState;
    }
    return null;
}

/**
 * Retorna o rótulo padrão de apresentação do canal
 * @param {number} globalCh
 * @returns {string}
 */
export function getChannelLabel(globalCh) {
    if (globalCh >= 0 && globalCh <= 31) return 'CH ' + (globalCh + 1);
    if (globalCh >= 36 && globalCh <= 43) return 'AUX ' + (globalCh - 35);
    if (globalCh >= 44 && globalCh <= 51) return 'BUS ' + (globalCh - 43);
    if (globalCh >= 60 && globalCh <= 67) {
        return 'ST IN ' + (Math.floor((globalCh - 60) / 2) + 1) + (globalCh % 2 === 0 ? 'L' : 'R');
    }
    if (globalCh === MASTER_CHANNEL_ID) return 'MASTER';
    return 'CH ' + globalCh;
}

/**
 * Retorna o prefixo do parâmetro baseado no ID global do canal
 * @param {number|string} id
 * @returns {string} 'kInput' | 'kAUX' | 'kBus' | 'kStereo'
 */
export function getChannelParamPrefix(id) {
    if (id === 'master' || id === MASTER_CHANNEL_ID) return 'kStereo';

    if (typeof id === 'string') {
        if (id.startsWith('m')) return 'kAUX';
        if (id.startsWith('b')) return 'kBus';
    }

    if (id >= 0 && id <= 31) return 'kInput';
    if (id >= 60 && id <= 67) return 'kInput';
    if (id >= 36 && id <= 43) return 'kAUX';
    if (id >= 44 && id <= 51) return 'kBus';
    return 'kInput';
}

// ==========================================
// Bridge de Compatibilidade Global (Transição v2)
// ==========================================
if (typeof window !== 'undefined') {
    window.rawToDb = rawToDb;
    window.dbToRaw = dbToRaw;
    window.getSteppedRaw = getSteppedRaw;
    window.getChannelStateById = getChannelStateById;
    window.getChannelLabel = getChannelLabel;
    window.getChannelParamPrefix = getChannelParamPrefix;
}
