// fx_utils.js — Tabelas Físicas da Yamaha 01V96 e Formatadores Gerais de Efeitos
(function () {
    'use strict';

    // ── Tabela de Frequências de 1/12 oitava (HPF / LPF / EQ) ─────────
    const FREQ_TABLE = [
        '20.0Hz', '21.2Hz', '22.4Hz', '23.6Hz', '25.0Hz', '26.5Hz', '28.0Hz', '30.0Hz', '31.5Hz', '33.5Hz',
        '35.5Hz', '37.5Hz', '40.0Hz', '42.5Hz', '45.0Hz', '47.5Hz', '50.0Hz', '53.0Hz', '56.0Hz', '60.0Hz',
        '63.0Hz', '67.0Hz', '71.0Hz', '75.0Hz', '80.0Hz', '85.0Hz', '90.0Hz', '95.0Hz', '100Hz', '106Hz',
        '112Hz', '118Hz', '125Hz', '132Hz', '140Hz', '150Hz', '160Hz', '170Hz', '180Hz', '190Hz',
        '200Hz', '212Hz', '224Hz', '236Hz', '250Hz', '265Hz', '280Hz', '300Hz', '315Hz', '335Hz',
        '355Hz', '375Hz', '400Hz', '425Hz', '450Hz', '475Hz', '500Hz', '530Hz', '560Hz', '600Hz',
        '630Hz', '670Hz', '710Hz', '750Hz', '800Hz', '850Hz', '900Hz', '950Hz', '1.00kHz', '1.06kHz',
        '1.12kHz', '1.18kHz', '1.25kHz', '1.32kHz', '1.40kHz', '1.50kHz', '1.60kHz', '1.70kHz', '1.80kHz', '1.90kHz',
        '2.00kHz', '2.12kHz', '2.24kHz', '2.36kHz', '2.50kHz', '2.65kHz', '2.80kHz', '3.00kHz', '3.15kHz', '3.35kHz',
        '3.55kHz', '3.75kHz', '4.00kHz', '4.25kHz', '4.50kHz', '4.75kHz', '5.00kHz', '5.30kHz', '5.60kHz', '6.00kHz',
        '6.30kHz', '6.70kHz', '7.10kHz', '7.50kHz', '8.00kHz', '8.50kHz', '9.00kHz', '9.50kHz', '10.0kHz', '10.6kHz',
        '11.2kHz', '11.8kHz', '12.5kHz', '13.2kHz', '14.0kHz', '15.0kHz', '16.0kHz', '17.0kHz', '18.0kHz', '19.0kHz',
        '20.0kHz'
    ];

    // ── Mapeamento Auditado de 216 passos para o parâmetro HOLD ────────
    const HOLD_POINTS = [
        0.02, 0.04, 0.06, 0.08, 0.10, 0.13, 0.15, 0.17, 0.19, 0.21, 0.23, 0.25, 0.27, 0.29, 0.31, 0.33, 0.35, 0.38, 0.40, 0.42, 0.44, 0.46, 0.48, 0.50, 0.52, 0.54, 0.56, 0.58, 0.60, 0.63, 0.65, 0.67, 0.69, 0.73, 0.77, 0.81, 0.85, 0.90, 0.94, 0.98, 1.02, 1.06, 1.10, 1.15, 1.19, 1.23, 1.27, 1.31, 1.35, 1.44, 1.52, 1.60, 1.68, 1.76, 1.84, 1.93, 2.01, 2.10, 2.18, 2.27, 2.35, 2.44, 2.52, 2.60, 2.69, 2.85, 3.02, 3.19, 3.35, 3.52, 3.69, 3.85, 4.02, 4.19, 4.35, 4.52, 4.69, 4.85, 5.02, 5.19, 5.35, 5.69, 6.02, 6.35, 6.69, 7.02, 7.35, 7.69, 8.02, 8.35, 8.69, 9.02, 9.35, 9.69, 10.0, 10.3, 10.6, 11.3, 12.0, 12.6, 13.3, 14.0, 14.6, 15.3, 16.0, 16.6, 17.3, 18.0, 18.6, 19.3, 20.0, 20.6, 21.3, 22.6, 24.0, 25.3, 26.6, 28.0, 29.3, 30.6, 32.0, 33.3, 34.6, 36.0, 37.3, 38.6, 40.0, 41.3, 42.6, 45.3, 48.0, 50.6, 53.3, 56.0, 58.6, 61.3, 64.0, 66.6, 69.3, 72.0, 74.6, 77.3, 80.0, 82.6, 85.3, 90.6, 96.0, 101, 106, 112, 117, 122, 128, 133, 138, 144, 149, 154, 160, 165, 170, 181, 192, 202, 213, 224, 234, 245, 256, 266, 277, 288, 298, 309, 320, 330, 341, 362, 384, 405, 426, 448, 469, 490, 512, 533, 554, 576, 597, 618, 640, 661, 682, 725, 768, 810, 853, 896, 938, 981, 1020, 1060, 1100, 1150, 1190, 1230, 1280, 1320, 1360, 1450, 1530, 1620, 1700, 1790, 1870, 1960
    ];

    // ── Mapeamento Auditado de 160 passos para o parâmetro DECAY ───────
    const DECAY_POINTS = [
        5, 11, 16, 21, 27, 32, 37, 43, 48, 53, 59, 64, 69, 75, 80, 85, 91, 96, 101, 107, 112, 117, 123, 128, 133, 139, 144, 149, 155, 160, 165, 171, 176, 187, 197, 208, 219, 229, 240, 251, 261, 272, 283, 293, 304, 315, 325, 336, 347, 368, 389, 411, 432, 453, 475, 496, 517, 539, 560, 581, 603, 624, 645, 667, 688, 730, 773, 816, 858, 901, 944, 986, 1020, 1070, 1110, 1150, 1200, 1240, 1280, 1320, 1370, 1450, 1540, 1620, 1710, 1790, 1880, 1960, 2050, 2130, 2220, 2300, 2390, 2470, 2560, 2650, 2730, 2900, 3070, 3240, 3410, 3580, 3750, 3930, 4100, 4270, 4440, 4610, 4780, 4950, 5120, 5290, 5460, 5800, 6140, 6480, 6830, 7170, 7510, 7850, 8190, 8530, 8870, 9210, 9560, 9900, 10200, 10500, 10900, 11600, 12200, 12900, 13600, 14300, 15000, 15700, 16300, 17000, 17700, 18400, 19100, 19700, 20400, 21100, 21800, 23200, 24500, 25900, 27300, 28600, 30000, 31400, 32700, 34100, 35400, 36800, 38200, 39500, 40900, 42300
    ];

    // ── Formatadores de Valor ──────────────────────────────────────────
    function formatHpfStep(step) {
        step = Math.round(step || 0);
        if (step === 0) return 'Thru';
        if (step >= 1 && step <= 104) return FREQ_TABLE[step];
        return 'Thru';
    }

    function formatLpfStep(step) {
        step = Math.round(step || 0);
        const idx = step + 16;
        if (idx >= 16 && idx <= 116) return FREQ_TABLE[idx];
        return 'Thru';
    }

    function formatHoldStep(step) {
        step = Math.round(step || 0);
        if (step < 0) step = 0;
        if (step >= HOLD_POINTS.length) step = HOLD_POINTS.length - 1;
        const ms = HOLD_POINTS[step];
        return ms >= 1000 ? (ms / 1000).toFixed(2) + 's' : ms + 'ms';
    }

    function formatDecayStep(step) {
        step = Math.round(step || 0);
        if (step < 0) step = 0;
        if (step >= DECAY_POINTS.length) step = DECAY_POINTS.length - 1;
        const ms = DECAY_POINTS[step];
        return ms >= 1000 ? (ms / 1000).toFixed(2) + 's' : ms + 'ms';
    }

    function formatRevTimeStep(step) {
        step = Math.round(step || 0);
        let secs = 0.3;
        if (step <= 47) secs = step * 0.1 + 0.3;
        else if (step <= 57) secs = (step - 47) * 0.5 + 5.0;
        else if (step <= 67) secs = (step - 57) * 1.0 + 10.0;
        else if (step <= 82) secs = (step - 67) * 5.0 + 20.0;
        else secs = 99.0;
        return secs.toFixed(1) + 's';
    }

    function formatTimeMs(rawVal, scale = 10) {
        const ms = rawVal / scale;
        return ms >= 1000 ? (ms / 1000).toFixed(2) + 's' : ms.toFixed(1) + 'ms';
    }

    function formatPercent(rawVal) {
        return Math.round(rawVal || 0) + '%';
    }

    function formatRatio(rawVal, offset = 1, divisor = 10) {
        const v = (rawVal + offset) / divisor;
        return v.toFixed(1);
    }

    function formatGateLevel(rawVal) {
        const v = Math.round(rawVal || 0);
        return v === 0 ? 'OFF' : (v - 61) + 'dB';
    }

    // Expor Globalmente
    window.FXUtils = {
        FREQ_TABLE: FREQ_TABLE,
        HOLD_POINTS: HOLD_POINTS,
        DECAY_POINTS: DECAY_POINTS,
        formatHpfStep: formatHpfStep,
        formatLpfStep: formatLpfStep,
        formatHoldStep: formatHoldStep,
        formatDecayStep: formatDecayStep,
        formatRevTimeStep: formatRevTimeStep,
        formatTimeMs: formatTimeMs,
        formatPercent: formatPercent,
        formatRatio: formatRatio,
        formatGateLevel: formatGateLevel
    };

})();
