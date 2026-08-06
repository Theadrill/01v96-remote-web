// fx_registry.js — Catálogo Declarativo de Schemas de Efeitos da Yamaha 01V96
(function () {
    'use strict';

    const registry = {};

    // ── Helper de Registro de Schemas ─────────────────────────────────
    function registerSchema(typeId, schema) {
        registry[typeId] = schema;
    }

    function getSchema(typeId) {
        if (registry[typeId]) return registry[typeId];
        if (typeId === 49) return registry[43] || null;
        return null;
    }

    function isSupported(typeId) {
        const schema = getSchema(typeId);
        return !!(schema && schema.supported);
    }

    // ── Schema Base para Reverb Standard (IDs 0, 1, 2, 3) ─────────────
    function createReverbSchema(typeId, name, typeKey, colorTheme, defaultConcept) {
        return {
            id: typeId,
            typeKey: typeKey,
            name: name,
            category: 'Reverb',
            colorTheme: colorTheme,
            defaultConcept: defaultConcept,
            supported: true,
            categories: [
                { id: 'output', title: 'Saída & Filtros' },
                { id: 'time', title: 'Tempo & Espectro' },
                { id: 'reflections', title: 'Reflexões & Difusão' },
                { id: 'gate', title: 'Envelope do Gate' }
            ],
            params: [
                // ── Saída & Filtros ───────────────────────────────────
                { sysEx: 48, key: 'mix', name: 'MIX BALANCE', min: 0, max: 100, defaultVal: 100, unit: '%', category: 'output', formatFn: 'formatPercent' },
                { sysEx: 22, key: 'hpf', name: 'HPF', min: 0, max: 104, defaultVal: 0, unit: 'Hz', category: 'output', formatFn: 'formatHpfStep' },
                { sysEx: 23, key: 'lpf', name: 'LPF', min: 0, max: 101, defaultVal: 101, unit: 'kHz', category: 'output', formatFn: 'formatLpfStep' },

                // ── Tempo & Espectro ──────────────────────────────────
                { sysEx: 17, key: 'revTime', name: 'REV TIME', min: 0, max: 83, defaultVal: 32, unit: 's', category: 'time', formatFn: 'formatRevTimeStep' },
                { sysEx: 16, key: 'iniDly', name: 'INI. DLY', min: 0, max: 5000, scale: 10, defaultVal: 360, unit: 'ms', category: 'time', formatFn: 'formatTimeMs' },
                { sysEx: 18, key: 'hiRatio', name: 'HI.RATIO', min: 0, max: 9, defaultVal: 2, unit: '', category: 'time', formatFn: v => ((v + 1) / 10).toFixed(1) },
                { sysEx: 19, key: 'loRatio', name: 'LO.RATIO', min: 0, max: 23, defaultVal: 13, unit: '', category: 'time', formatFn: v => ((v + 1) / 10).toFixed(1) },

                // ── Reflexões & Difusão ───────────────────────────────
                { sysEx: 24, key: 'erDly', name: 'E/R DLY', min: 0, max: 1000, scale: 10, defaultVal: 20, unit: 'ms', category: 'reflections', formatFn: 'formatTimeMs' },
                { sysEx: 25, key: 'erBal', name: 'E/R BAL.', min: 0, max: 100, defaultVal: 44, unit: '%', category: 'reflections', formatFn: 'formatPercent' },
                { sysEx: 20, key: 'diff', name: 'DIFF.', min: 0, max: 10, defaultVal: 8, unit: '', category: 'reflections', formatFn: v => String(Math.round(v)) },
                { sysEx: 21, key: 'density', name: 'DENSITY', min: 0, max: 100, defaultVal: 100, unit: '%', category: 'reflections', formatFn: 'formatPercent' },

                // ── Envelope do Gate ─────────────────────────────────
                { sysEx: 26, key: 'gateLvl', name: 'GATE LVL', min: 0, max: 61, defaultVal: 0, unit: 'dB', category: 'gate', formatFn: 'formatGateLevel' },
                { sysEx: 27, key: 'attack', name: 'ATTACK', min: 0, max: 120, defaultVal: 4, unit: 'ms', category: 'gate', formatFn: v => Math.round(v) + 'ms' },
                { sysEx: 28, key: 'hold', name: 'HOLD', min: 0, max: 215, defaultVal: 160, unit: 'ms', category: 'gate', formatFn: 'formatHoldStep' },
                { sysEx: 29, key: 'decay', name: 'DECAY', min: 0, max: 159, defaultVal: 69, unit: 'ms', category: 'gate', formatFn: 'formatDecayStep' }
            ]
        };
    }

    // Registra os 4 Reverbs Padrão da 01V96
    registerSchema(0, createReverbSchema(0, 'Reverb Hall', 'REVERB HALL', 'theme-hall', 1));
    registerSchema(1, createReverbSchema(1, 'Reverb Room', 'REVERB ROOM', 'theme-room', 2));
    registerSchema(2, createReverbSchema(2, 'Reverb Stage', 'REVERB STAGE', 'theme-stage', 3));
    registerSchema(3, createReverbSchema(3, 'Reverb Plate', 'REVERB PLATE', 'theme-plate', 4));

    // ── Schema do Multiband Compressor (M.BAND DYNA. - ID 43) ─────────
    function createMultibandSchema() {
        return {
            id: 43,
            typeKey: 'M.BAND DYNA.',
            name: 'Multiband Compressor',
            category: 'Dynamic',
            colorTheme: 'theme-mband',
            defaultConcept: 43,
            supported: true,
            showMeters: true,
            categories: [
                { id: 'gain', title: 'Ganho' },
                { id: 'comp', title: 'Compressor' },
                { id: 'xover', title: 'Crossover' },
                { id: 'exp', title: 'Expansor' },
                { id: 'lim', title: 'Limiter' }
            ],
            params: [
                // ── Grupo Ganho ────────────────────────────────────────
                { sysEx: 16, key: 'lowGain', name: 'LOW GAIN', min: 0, max: 1080, defaultVal: 960, unit: 'dB', category: 'gain', formatFn: v => ((v - 960) / 10).toFixed(1) + 'dB' },
                { sysEx: 45, key: 'soloLow', name: 'SOLO LOW', min: 0, max: 1, defaultVal: 0, unit: '', category: 'meter', widget: 'switch', formatFn: v => (v === 1 ? 'ON' : 'OFF') },
                { sysEx: 17, key: 'midGain', name: 'MID GAIN', min: 0, max: 1080, defaultVal: 960, unit: 'dB', category: 'gain', formatFn: v => ((v - 960) / 10).toFixed(1) + 'dB' },
                { sysEx: 46, key: 'soloMid', name: 'SOLO MID', min: 0, max: 1, defaultVal: 0, unit: '', category: 'meter', widget: 'switch', formatFn: v => (v === 1 ? 'ON' : 'OFF') },
                { sysEx: 18, key: 'hiGain', name: 'HI. GAIN', min: 0, max: 1080, defaultVal: 960, unit: 'dB', category: 'gain', formatFn: v => ((v - 960) / 10).toFixed(1) + 'dB' },
                { sysEx: 47, key: 'soloHigh', name: 'SOLO HIGH', min: 0, max: 1, defaultVal: 0, unit: '', category: 'meter', widget: 'switch', formatFn: v => (v === 1 ? 'ON' : 'OFF') },
                { sysEx: 19, key: 'presence', name: 'PRESENCE', min: 0, max: 20, defaultVal: 10, unit: '', category: 'gain', formatFn: v => (v - 10 >= 0 ? '+' : '') + (v - 10) },

                // ── Grupo Compressor ───────────────────────────────────
                { sysEx: 24, key: 'cmpThre', name: 'CMP.THRE', min: 0, max: 240, defaultVal: 120, unit: 'dB', category: 'comp', formatFn: v => ((v - 240) / 10).toFixed(1) + 'dB' },
                { sysEx: 25, key: 'cmpRat', name: 'CMP.RAT', min: 0, max: 14, defaultVal: 5, unit: '', category: 'comp', formatFn: v => ['1:1', '1.1:1', '1.3:1', '1.5:1', '1.7:1', '2:1', '2.5:1', '3:1', '3.5:1', '4:1', '5:1', '6:1', '8:1', '10:1', '20:1'][v] },
                { sysEx: 27, key: 'cmpAtk', name: 'CMP.ATK', min: 0, max: 120, defaultVal: 20, unit: 'ms', category: 'comp', formatFn: v => Math.round(v) + 'ms' },
                { sysEx: 26, key: 'cmpRel', name: 'CMP.REL', min: 0, max: 159, defaultVal: 69, unit: 'ms', category: 'comp', formatFn: 'formatDecayStep' },
                { sysEx: 28, key: 'cmpKnee', name: 'CMP.KNEE', min: 0, max: 5, defaultVal: 0, unit: '', category: 'comp', formatFn: v => String(Math.round(v)) },
                { sysEx: 35, key: 'lookup', name: 'LOOKUP', min: 0, max: 1000, defaultVal: 0, unit: 'ms', category: 'comp', formatFn: v => (v / 10).toFixed(1) + 'ms' },
                { sysEx: 29, key: 'cmpByp', name: 'CMP.BYP', min: 0, max: 1, defaultVal: 0, unit: '', category: 'comp', widget: 'switch', formatFn: v => (v === 1 ? 'ON' : 'OFF') },

                // ── Grupo Crossover ────────────────────────────────────
                { sysEx: 36, key: 'lmXovr', name: 'L-M XOVR', min: 0, max: 103, defaultVal: 47, unit: 'Hz', category: 'xover', formatFn: v => window.FXUtils.formatHpfStep(v + 1) },
                { sysEx: 37, key: 'mhXovr', name: 'M-H XOVR', min: 0, max: 103, defaultVal: 80, unit: 'Hz', category: 'xover', formatFn: v => window.FXUtils.formatHpfStep(v + 1) },
                { sysEx: 38, key: 'slope', name: 'SLOPE', min: 0, max: 1, defaultVal: 1, unit: '', category: 'xover', formatFn: v => (v === 1 ? '-12dB' : '-6dB') },
                { sysEx: 39, key: 'ceiling', name: 'CEILING', min: 0, max: 61, defaultVal: 61, unit: 'dB', category: 'xover', formatFn: v => (v === 61 ? 'OFF' : ((v - 60) / 10).toFixed(1) + 'dB') },

                // ── Grupo Expansor ─────────────────────────────────────
                { sysEx: 20, key: 'expThre', name: 'EXP.THRE', min: 0, max: 300, defaultVal: 0, unit: 'dB', category: 'exp', formatFn: v => ((v - 540) / 10).toFixed(1) + 'dB' },
                { sysEx: 21, key: 'expRat', name: 'EXP.RAT', min: 0, max: 15, defaultVal: 0, unit: '', category: 'exp', formatFn: v => ['1:1', '1.1:1', '1.3:1', '1.5:1', '1.7:1', '2:1', '2.5:1', '3:1', '3.5:1', '4:1', '5:1', '6:1', '8:1', '10:1', '20:1', '∞:1'][v] },
                { sysEx: 22, key: 'expRel', name: 'EXP.REL', min: 0, max: 159, defaultVal: 69, unit: 'ms', category: 'exp', formatFn: 'formatDecayStep' },
                { sysEx: 23, key: 'expByp', name: 'EXP.BYP', min: 0, max: 1, defaultVal: 0, unit: '', category: 'exp', widget: 'switch', formatFn: v => (v === 1 ? 'ON' : 'OFF') },

                // ── Grupo Limiter ──────────────────────────────────────
                { sysEx: 30, key: 'limThre', name: 'LIM.THRE', min: 0, max: 120, defaultVal: 120, unit: 'dB', category: 'lim', formatFn: v => ((v - 120) / 10).toFixed(1) + 'dB' },
                { sysEx: 32, key: 'limAtk', name: 'LIM.ATK', min: 0, max: 120, defaultVal: 0, unit: 'ms', category: 'lim', formatFn: v => Math.round(v) + 'ms' },
                { sysEx: 31, key: 'limRel', name: 'LIM.REL', min: 0, max: 159, defaultVal: 69, unit: 'ms', category: 'lim', formatFn: 'formatDecayStep' },
                { sysEx: 33, key: 'limKnee', name: 'LIM.KNEE', min: 0, max: 5, defaultVal: 0, unit: '', category: 'lim', formatFn: v => String(Math.round(v)) },
                { sysEx: 34, key: 'limByp', name: 'LIM.BYP', min: 0, max: 1, defaultVal: 0, unit: '', category: 'lim', widget: 'switch', formatFn: v => (v === 1 ? 'ON' : 'OFF') }
            ]
        };
    }

    registerSchema(43, createMultibandSchema());

    // Expor Globalmente
    window.FXRegistry = {
        registerSchema: registerSchema,
        getSchema: getSchema,
        isSupported: isSupported,
        registry: registry
    };

})();
