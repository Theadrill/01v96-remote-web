/**
 * MASTER METER MODULE (PRO VERSION)
 * Handles the Stereo Master meter (CH 33) using Yamaha 01V96 Native Meter Command (0x21).
 * Based on AirFader Reverse Engineering.
 */

function buildRequest() {
    // F0 43 30 3E 0D 21 [Point] [Mix] [SubCh] [Lower] [Upper] F7
    // Request Point 4 (Stereo Master), Mix 0 (Pre-fader), using SubChannel 0x7F (All)
    // 0x7F triggers the console to send all meters for this point
    return [240, 67, 48, 62, 13, 33, 4, 0, 127, 0, 1, 247];
}

/**
 * Reconstructs a 14-bit value from two 7-bit MIDI bytes (Unstuffing).
 * Yamaha 01V96 uses Big-Endian (High Byte first) for meter data.
 */
function unstuff(highByte, lowByte) {
    if (lowByte === undefined || highByte === undefined) return 0;
    return ((highByte & 0x7f) << 7) | (lowByte & 0x7f);
}

let stepsTable = {}; // Mapeamento step -> db do steps.json

/**
 * Recebe a tabela de steps do steps.json para alinhar com o frontend.
 */
function setSteps(steps) {
    if (steps) {
        stepsTable = steps;
        console.log(`📊 [MASTER-METER] Tabela de steps carregada (${Object.keys(steps).length} entradas) para calibração reversa.`);
    }
}

/**
 * Converte o valor bruto de 14-bits para o Step (0-32) correspondente,
 * baseando-se no arquivo steps.json para garantir que o nível no Web
 * seja idêntico ao da mesa física.
 */
function convertValue(raw) {
    if (raw <= 37) return 0;

    // 1. Cálculo de dB real baseado nos pontos de referência:
    // -18dB -> 3347, -6dB -> 4111, 0dB -> 4493
    // Fórmula Linear: db = (raw - 4493) / 63.66
    let db = (raw - 4493) / 63.66;

    // 2. Encontrar o step no steps.json que tem o dB mais próximo
    let bestStep = 0;

    if (Object.keys(stepsTable).length > 0) {
        let minDiff = Infinity;
        for (const s in stepsTable) {
            const stepDb = stepsTable[s];
            const diff = Math.abs(db - stepDb);
            if (diff < minDiff) {
                minDiff = diff;
                bestStep = parseInt(s);
            }
        }
    } else {
        // Fallback: usar o byte alto se o steps.json não foi carregado
        bestStep = Math.min(32, (raw >> 7));
    }

    return bestStep;
}

function parse(message) {
    if (!message || message.length < 13) return null;

    // Header fixo do Point 4 (Master)
    // F0 43 1n 3E 0D 21 04 ...
    if (message[4] !== 13 || message[5] !== 33 || message[6] !== 4) return null;

    // Stereo Master (Point 4) envia L no byte 9-10 e R no byte 11-12
    const leftRaw = unstuff(message[9], message[10]);
    const rightRaw = unstuff(message[11], message[12]);

    const left = convertValue(leftRaw);
    const right = convertValue(rightRaw);

    // Retorna o maior dos dois para o index 32 do UI
    return Math.max(left, right);
}

function buildStopRequest() {
    // F0 43 30 3E 0D 21 7F 00 00 00 00 F7
    return [240, 67, 48, 62, 13, 33, 127, 0, 0, 0, 0, 247];
}

module.exports = { buildRequest, buildStopRequest, parse, setSteps };
