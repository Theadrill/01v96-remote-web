window.meterCalibration = {};
async function loadMeterSteps() {
    try {
        const response = await fetch('steps.json?t=' + Date.now());
        window.meterCalibration = await response.json();
        console.log("✅ [METERS] Calibração de steps carregada:", window.meterCalibration);
    } catch (e) {
        console.error("❌ [METERS] Erro ao carregar steps.json do servidor");
    }
}

/**
 * Converte o step bruto da mesa (0-32) para a porcentagem de preenchimento (0-100)
 * baseado na calibração manual feita em steps.json, garantindo alinhamento
 * com a escala visual do mixer (fader curve).
 */
window.calibrateStep = function(step, isMaster = false) {
    // Se o step for 32 (PICO/CLIP), forçamos 100% de preenchimento na hora
    if (step >= 32) return 100;

    const dbValue = window.meterCalibration[step];
    
    // Se não houver valor definido para esse step, consideramos -inf
    if (dbValue === undefined || dbValue <= -138) return 0;
    
    // Para o Master, a escala visual é deslocada em 10dB (0dB é o topo 1023)
    const rawVal = dbToRaw(isMaster ? dbValue + 10 : dbValue);
    let percent = (rawVal / 1023) * 100;

    // Curva de sensibilidade no topo (Step 32 / Clip)
    // CLIP ARTIFICIAL: Se chegar nos 98%, "pula" pro topo (100%)
    if (percent >= 98) percent = 100;

    return percent;
}



// Inicializa o carregamento
loadMeterSteps();
