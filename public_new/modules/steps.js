/**
 * Módulo de Calibração de Steps de VU Meters (v2) - 01v96 Remote Web
 * Carrega a tabela de calibração do steps.json e realiza o mapeamento dos 32 LEDs para porcentagem (0-100%).
 */

import { dbToRaw } from './utils.js';

let meterCalibration = {
    inputs: {},
    master: {}
};

let isLoaded = false;
const readyCallbacks = [];

/**
 * Carrega o arquivo de calibração steps.json do servidor
 * @returns {Promise<Object>}
 */
export async function loadMeterSteps() {
    try {
        const response = await fetch('steps.json?t=' + Date.now());
        meterCalibration = await response.json();
        isLoaded = true;
        console.log("✅ [METERS v2] Calibração de steps carregada com sucesso:", meterCalibration);

        while (readyCallbacks.length > 0) {
            const cb = readyCallbacks.shift();
            try { cb(meterCalibration); } catch (e) { console.error(e); }
        }
        return meterCalibration;
    } catch (e) {
        console.error("❌ [METERS v2] Erro ao carregar steps.json do servidor:", e);
        return meterCalibration;
    }
}

/**
 * Registra um callback para ser executado assim que a calibração estiver disponível
 * @param {Function} cb
 */
export function onCalibrationReady(cb) {
    if (isLoaded) {
        cb(meterCalibration);
    } else {
        readyCallbacks.push(cb);
    }
}

/**
 * Converte o step bruto da mesa (0-32) para a porcentagem de preenchimento (0-100)
 * baseado na calibração manual feita em steps.json.
 * @param {number} step Step bruto vindo do MIDI SysEx (0 a 32)
 * @param {boolean} isMaster Se deve usar a tabela de Master Output
 * @returns {number} Porcentagem de 0 a 100
 */
export function calibrateStep(step, isMaster = false) {
    // Se o step for 32 (PICO/CLIP), forçamos 100% de preenchimento
    if (step >= 32) return 100;

    const source = isMaster ? meterCalibration.master : meterCalibration.inputs;
    if (!source) return 0;

    const dbValue = source[step];

    // Se não houver valor definido para esse step, consideramos -inf
    if (dbValue === undefined || dbValue <= -138) return 0;

    const rawVal = dbToRaw(dbValue);
    let percent = (rawVal / 1023) * 100;

    // Curva de sensibilidade no topo (Step 32 / Clip)
    if (percent >= 98) percent = 100;

    return percent;
}

export function getMeterCalibration() {
    return meterCalibration;
}

// Inicia o carregamento imediatamente
loadMeterSteps();

// Bridge temporária para compatibilidade global
if (typeof window !== 'undefined') {
    window.meterCalibration = meterCalibration;
    window.calibrateStep = calibrateStep;
    window.loadMeterSteps = loadMeterSteps;
}
