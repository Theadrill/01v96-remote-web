// fx_registry.js — Catálogo Declarativo de Schemas de Efeitos da Yamaha 01V96
(function () {
    'use strict';

    const registry = {};

    // ── Helper de Registro de Schemas ─────────────────────────────────
    function registerSchema(typeId, schema) {
        registry[typeId] = schema;
    }

    function getSchema(typeId) {
        return registry[typeId] || null;
    }

    function isSupported(typeId) {
        return !!(registry[typeId] && registry[typeId].supported);
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

    // Expor Globalmente
    window.FXRegistry = {
        registerSchema: registerSchema,
        getSchema: getSchema,
        isSupported: isSupported,
        registry: registry
    };

})();
