// reverb.js — Módulo Editor do Reverb Standard (Hall, Room, Stage, Plate)
// Yamaha 01V96 Remote Web
// Contém 4 conceitos de interface mockados pensados Mobile-First (Em Pé / Tablet)
// Todos os controles (Knobs, Faders, Steppers e Wheels) são 100% manipuláveis para teste!

(function () {
    'use strict';

    // Lista dos 14 Parâmetros do Reverb Standard + Mix Balance + Bypass
    const REVERB_PARAMS_DEFAULT = {
        revTime: { name: 'REV TIME', val: '3.2s', pct: 65, unit: 's' },
        iniDly: { name: 'INI. DLY', val: '36.0ms', pct: 30, unit: 'ms' },
        hiRatio: { name: 'HI.RATIO', val: '0.3', pct: 30, unit: '' },
        loRatio: { name: 'LO.RATIO', val: '1.4', pct: 60, unit: '' },
        diff: { name: 'DIFF.', val: '8', pct: 80, unit: '' },
        density: { name: 'DENSITY', val: '100%', pct: 100, unit: '%' },
        erDly: { name: 'E/R DLY', val: '2.0ms', pct: 15, unit: 'ms' },
        erBal: { name: 'E/R BAL.', val: '44%', pct: 44, unit: '%' },
        hpf: { name: 'HPF', val: 'Thru', pct: 0, unit: 'Hz' },
        lpf: { name: 'LPF', val: '6.70kHz', pct: 70, unit: 'kHz' },
        gateLvl: { name: 'GATE LVL', val: 'OFF', pct: 0, unit: 'dB' },
        attack: { name: 'ATTACK', val: '4ms', pct: 10, unit: 'ms' },
        hold: { name: 'HOLD', val: '181ms', pct: 50, unit: 'ms' },
        decay: { name: 'DECAY', val: '69ms', pct: 35, unit: 'ms' },
        mix: { name: 'MIX BALANCE', val: '100%', pct: 100, unit: '%' },
        bypass: false
    };

    // Temas por Efeito (Cores e Títulos)
    const REVERB_PRESETS = [
        { slot: 1, type: 'REVERB HALL', name: 'Reverb Hall', colorTheme: 'theme-hall', defaultConcept: 1 },
        { slot: 2, type: 'REVERB ROOM', name: 'Reverb Room', colorTheme: 'theme-room', defaultConcept: 2 },
        { slot: 3, type: 'REVERB STAGE', name: 'Reverb Stage', colorTheme: 'theme-stage', defaultConcept: 3 },
        { slot: 4, type: 'REVERB PLATE', name: 'Reverb Plate', colorTheme: 'theme-plate', defaultConcept: 4 }
    ];

    // ── Detecção Automática de Dispositivo (Desktop/Mac vs Mobile/Tablet/iOS) ──
    function detectDefaultLayoutMode() {
        // 1. Prioridade para a escolha salva no localStorage
        try {
            const saved = localStorage.getItem('fx_layout_mode');
            if (saved === 'mobile' || saved === 'desktop') {
                return saved;
            }
        } catch (e) {}

        // 2. Detecção de Dispositivo e Sistema Operacional (Mobile, Tablet, iPadOS, iOS, Android, Mac, Windows)
        const ua = navigator.userAgent || '';
        const platform = navigator.platform || '';
        const maxTouchPoints = navigator.maxTouchPoints || 0;

        // iOS (iPhone, iPad, iPod) + iPadOS 13+ que se reporta como MacIntel com Touch
        const isIOS = /iPad|iPhone|iPod/.test(ua) || (platform === 'MacIntel' && maxTouchPoints > 1);
        const isAndroid = /Android/i.test(ua);
        const isMobileUA = /Mobi|Tablet|iPad|iPhone|Android|Touch/i.test(ua);
        const isTouchScreen = (maxTouchPoints > 0 || 'ontouchstart' in window);
        const isSmallViewport = window.innerWidth <= 1024;

        if (isIOS || isAndroid || isMobileUA || (isTouchScreen && isSmallViewport)) {
            return 'mobile'; // Layout 3 (Abas Touch / Steppers)
        }

        return 'desktop'; // Layout 1 (Knobs Grid)
    }

    const syncedSlots = [false, false, false, false];
    const isSyncingSlot = [false, false, false, false];
    const fxParamsState = [{}, {}, {}, {}];

    const holdPoints = [0.02, 0.04, 0.06, 0.08, 0.10, 0.13, 0.15, 0.17, 0.19, 0.21, 0.23, 0.25, 0.27, 0.29, 0.31, 0.33, 0.35, 0.38, 0.40, 0.42, 0.44, 0.46, 0.48, 0.50, 0.52, 0.54, 0.56, 0.58, 0.60, 0.63, 0.65, 0.67, 0.69, 0.73, 0.77, 0.81, 0.85, 0.90, 0.94, 0.98, 1.02, 1.06, 1.10, 1.15, 1.19, 1.23, 1.27, 1.31, 1.35, 1.44, 1.52, 1.60, 1.68, 1.76, 1.84, 1.93, 2.01, 2.10, 2.18, 2.27, 2.35, 2.44, 2.52, 2.60, 2.69, 2.85, 3.02, 3.19, 3.35, 3.52, 3.69, 3.85, 4.02, 4.19, 4.35, 4.52, 4.69, 4.85, 5.02, 5.19, 5.35, 5.69, 6.02, 6.35, 6.69, 7.02, 7.35, 7.69, 8.02, 8.35, 8.69, 9.02, 9.35, 9.69, 10.0, 10.3, 10.6, 11.3, 12.0, 12.6, 13.3, 14.0, 14.6, 15.3, 16.0, 16.6, 17.3, 18.0, 18.6, 19.3, 20.0, 20.6, 21.3, 22.6, 24.0, 25.3, 26.6, 28.0, 29.3, 30.6, 32.0, 33.3, 34.6, 36.0, 37.3, 38.6, 40.0, 41.3, 42.6, 45.3, 48.0, 50.6, 53.3, 56.0, 58.6, 61.3, 64.0, 66.6, 69.3, 72.0, 74.6, 77.3, 80.0, 82.6, 85.3, 90.6, 96.0, 101, 106, 112, 117, 122, 128, 133, 138, 144, 149, 154, 160, 165, 170, 181, 192, 202, 213, 224, 234, 245, 256, 266, 277, 288, 298, 309, 320, 330, 341, 362, 384, 405, 426, 448, 469, 490, 512, 533, 554, 576, 597, 618, 640, 661, 682, 725, 768, 810, 853, 896, 938, 981, 1020, 1060, 1100, 1150, 1190, 1230, 1280, 1320, 1360, 1450, 1530, 1620, 1700, 1790, 1870, 1960];
    const decayPoints = [5, 11, 16, 21, 27, 32, 37, 43, 48, 53, 59, 64, 69, 75, 80, 85, 91, 96, 101, 107, 112, 117, 123, 128, 133, 139, 144, 149, 155, 160, 165, 171, 176, 187, 197, 208, 219, 229, 240, 251, 261, 272, 283, 293, 304, 315, 325, 336, 347, 368, 389, 411, 432, 453, 475, 496, 517, 539, 560, 581, 603, 624, 645, 667, 688, 730, 773, 816, 858, 901, 944, 986, 1020, 1070, 1110, 1150, 1200, 1240, 1280, 1320, 1370, 1450, 1540, 1620, 1710, 1790, 1880, 1960, 2050, 2130, 2220, 2300, 2390, 2470, 2560, 2650, 2730, 2900, 3070, 3240, 3410, 3580, 3750, 3930, 4100, 4270, 4440, 4610, 4780, 4950, 5120, 5290, 5460, 5800, 6140, 6480, 6830, 7170, 7510, 7850, 8190, 8530, 8870, 9210, 9560, 9900, 10200, 10500, 10900, 11600, 12200, 12900, 13600, 14300, 15000, 15700, 16300, 17000, 17700, 18400, 19100, 19700, 20400, 21100, 21800, 23200, 24500, 25900, 27300, 28600, 30000, 31400, 32700, 34100, 35400, 36800, 38200, 39500, 40900, 42300];

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

    function formatHpfStep(step) {
        step = Math.round(step);
        if (step === 0) return 'Thru';
        if (step >= 1 && step <= 104) return FREQ_TABLE[step];
        return 'Thru';
    }

    function formatLpfStep(step) {
        step = Math.round(step);
        const idx = step + 16;
        if (idx >= 16 && idx <= 116) return FREQ_TABLE[idx];
        return 'Thru';
    }

    function formatHoldStep(step) {
        if (step < 0) step = 0;
        if (step >= holdPoints.length) step = holdPoints.length - 1;
        const ms = holdPoints[step];
        return ms >= 1000 ? (ms / 1000).toFixed(2) + 's' : ms + 'ms';
    }

    function formatDecayStep(step) {
        if (step < 0) step = 0;
        if (step >= decayPoints.length) step = decayPoints.length - 1;
        const ms = decayPoints[step];
        return ms >= 1000 ? (ms / 1000).toFixed(2) + 's' : ms + 'ms';
    }

    function decodeReverbParams(slotIdx) {
        const raw = fxParamsState[slotIdx] || {};
        const p = JSON.parse(JSON.stringify(REVERB_PARAMS_DEFAULT));

        if (raw[48] !== undefined) {
            const v = Math.round(raw[48]);
            p.mix.val = v + '%';
            p.mix.pct = v;
        }
        if (raw[52] !== undefined) {
            p.bypass = raw[52] > 0;
        }
        if (raw[16] !== undefined) { // INI.DLY (0x10)
            const v = raw[16] / 10;
            p.iniDly.val = v.toFixed(1) + 'ms';
            p.iniDly.pct = Math.min(100, (raw[16] / 5000) * 100);
        }
        if (raw[17] !== undefined) { // REV TIME (0x11)
            const step = Math.round(raw[17]);
            let secs = 0.3;
            if (step <= 47) secs = step * 0.1 + 0.3;
            else if (step <= 57) secs = (step - 47) * 0.5 + 5.0;
            else if (step <= 67) secs = (step - 57) * 1.0 + 10.0;
            else if (step <= 82) secs = (step - 67) * 5.0 + 20.0;
            else secs = 99.0;
            p.revTime.val = secs.toFixed(1) + 's';
            p.revTime.pct = Math.min(100, (step / 83) * 100);
        }
        if (raw[18] !== undefined) { // HI.RATIO (0x12)
            const v = (raw[18] + 1) / 10;
            p.hiRatio.val = v.toFixed(1);
            p.hiRatio.pct = Math.min(100, (raw[18] / 9) * 100);
        }
        if (raw[19] !== undefined) { // LO.RATIO (0x13)
            const v = (raw[19] + 1) / 10;
            p.loRatio.val = v.toFixed(1);
            p.loRatio.pct = Math.min(100, (raw[19] / 23) * 100);
        }
        if (raw[20] !== undefined) { // DIFF (0x14)
            const v = Math.round(raw[20]);
            p.diff.val = String(v);
            p.diff.pct = Math.min(100, v * 10);
        }
        if (raw[21] !== undefined) { // DENSITY (0x15)
            const v = Math.round(raw[21]);
            p.density.val = v + '%';
            p.density.pct = v;
        }
        if (raw[22] !== undefined) { // HPF (0x16)
            const step = Math.round(raw[22]);
            p.hpf.val = formatHpfStep(step);
            p.hpf.pct = Math.min(100, (step / 104) * 100);
        }
        if (raw[23] !== undefined) { // LPF (0x17)
            const step = Math.round(raw[23]);
            p.lpf.val = formatLpfStep(step);
            p.lpf.pct = Math.min(100, (step / 101) * 100);
        }
        if (raw[24] !== undefined) { // E/R DLY (0x18)
            const v = raw[24] / 10;
            p.erDly.val = v.toFixed(1) + 'ms';
            p.erDly.pct = Math.min(100, (raw[24] / 1000) * 100);
        }
        if (raw[25] !== undefined) { // E/R BAL (0x19)
            const v = Math.round(raw[25]);
            p.erBal.val = v + '%';
            p.erBal.pct = v;
        }
        if (raw[26] !== undefined) { // GATE LVL (0x1A)
            const v = Math.round(raw[26]);
            p.gateLvl.val = v === 0 ? 'OFF' : (v - 61) + 'dB';
            p.gateLvl.pct = Math.min(100, (v / 61) * 100);
        }
        if (raw[27] !== undefined) { // ATTACK (0x1B)
            const v = Math.round(raw[27]);
            p.attack.val = v + 'ms';
            p.attack.pct = Math.min(100, (v / 120) * 100);
        }
        if (raw[28] !== undefined) { // HOLD (0x1C)
            const step = Math.round(raw[28]);
            p.hold.val = formatHoldStep(step);
            p.hold.pct = Math.min(100, (step / 215) * 100);
        }
        if (raw[29] !== undefined) { // DECAY (0x1D)
            const step = Math.round(raw[29]);
            p.decay.val = formatDecayStep(step);
            p.decay.pct = Math.min(100, (step / 159) * 100);
        }
        return p;
    }

    let currentLayoutMode = detectDefaultLayoutMode();
    let currentSlotIdx = 0;
    let currentConcept = (currentLayoutMode === 'desktop') ? 1 : 3;
    let activeTabConcept3 = 'time';
    let currentEffectTitle = '';

    function showEditorSyncOverlay() {
        const overlay = document.getElementById('fxEditorSyncOverlay');
        if (overlay) overlay.classList.add('active');
    }

    function hideEditorSyncOverlay() {
        const overlay = document.getElementById('fxEditorSyncOverlay');
        if (overlay) overlay.classList.remove('active');
    }

    if (typeof socket !== 'undefined') {
        socket.on('fxTypesUpdate', function(data) {
            if (!data) return;
            for (let i = 0; i < 4; i++) {
                const d = data[i] || data[String(i)];
                if (d && d.id !== undefined) {
                    if (lastFxTypeId[i] !== -1 && lastFxTypeId[i] !== d.id) {
                        // O algoritmo do efeito mudou na mesa: invalida o cache deste slot
                        syncedSlots[i] = false;
                        fxParamsState[i] = {};
                    }
                    lastFxTypeId[i] = d.id;
                }
            }
        });

        socket.on('fxSlotParamsUpdate', function(data) {
            if (data && typeof data.slot === 'number' && data.params) {
                const slot = data.slot;
                fxParamsState[slot] = Object.assign({}, fxParamsState[slot], data.params);
                syncedSlots[slot] = true;
                isSyncingSlot[slot] = false;
                if (currentSlotIdx === slot) {
                    hideEditorSyncOverlay();
                }
                const modal = document.getElementById('fxEditorModal');
                if (modal && modal.style.display === 'flex' && currentSlotIdx === slot && !activeKnobDrag) {
                    renderModal();
                }
            }
        });

        socket.on('fxParamUpdate', function(data) {
            if (data && typeof data.slot === 'number' && typeof data.param === 'number') {
                const slot = data.slot;
                if (!fxParamsState[slot]) fxParamsState[slot] = {};
                fxParamsState[slot][data.param] = data.value;

                // Modificar um parâmetro NÃO des-sincroniza o slot! Se já temos >= 14 params, mantemos syncedSlots = true
                if (Object.keys(fxParamsState[slot]).length >= 14) {
                    syncedSlots[slot] = true;
                }

                const modal = document.getElementById('fxEditorModal');
                if (modal && modal.style.display === 'flex' && currentSlotIdx === slot && !activeKnobDrag) {
                    renderModal();
                }
            }
        });
    }

    // ── Função Principal de Abertura ──────────────────────────────────
    function open(slotIdx, customEffectName) {
        currentSlotIdx = slotIdx >= 0 && slotIdx < 4 ? slotIdx : 0;
        currentEffectTitle = customEffectName || REVERB_PRESETS[currentSlotIdx].type;
        
        currentLayoutMode = detectDefaultLayoutMode();
        currentConcept = (currentLayoutMode === 'desktop') ? 1 : 3;

        renderModal();

        // Oculta a tela de visão geral (Máquinas de Efeitos)
        const overviewModal = document.getElementById('efeitosModal');
        if (overviewModal) overviewModal.style.display = 'none';

        // Exibe o modal do editor individual do efeito
        const modal = document.getElementById('fxEditorModal');
        if (modal) modal.style.display = 'flex';

        // Se o estado local tem >= 14 parâmetros acumulados, a slot já está sincronizada
        if (fxParamsState[currentSlotIdx] && Object.keys(fxParamsState[currentSlotIdx]).length >= 14) {
            syncedSlots[currentSlotIdx] = true;
        }

        // Lazy sync: dispara requisição apenas se ainda NÃO tiver sincronizado este slot
        if (!syncedSlots[currentSlotIdx]) {
            if (typeof socket !== 'undefined' && socket.emit) {
                console.log('[FX] Disparando Lazy-Sync para FX' + (currentSlotIdx + 1));
                isSyncingSlot[currentSlotIdx] = true;
                showEditorSyncOverlay();
                socket.emit('requestFxSlotParams', { slot: currentSlotIdx });
            }
        } else {
            hideEditorSyncOverlay();
        }
    }

    function openUnderConstruction(slotIdx, customEffectName) {
        currentSlotIdx = slotIdx >= 0 && slotIdx < 4 ? slotIdx : 0;
        const slotNum = currentSlotIdx + 1;
        const displayName = customEffectName || ('EFEITO ' + slotNum);

        const container = document.getElementById('fxEditorModalContent');
        if (!container) return;

        if (window.FXComponents) {
            container.innerHTML = FXComponents.renderUnderConstruction({ slotNum, displayName });
        }

        const overviewModal = document.getElementById('efeitosModal');
        if (overviewModal) overviewModal.style.display = 'none';

        const modal = document.getElementById('fxEditorModal');
        if (modal) modal.style.display = 'flex';
    }

    function close() {
        hideEditorSyncOverlay();
        const modal = document.getElementById('fxEditorModal');
        if (modal) modal.style.display = 'none';

        if (typeof window.openEffectsModal === 'function') {
            window.openEffectsModal();
        }
    }

    function setLayoutMode(mode) {
        if (mode !== 'mobile' && mode !== 'desktop') return;
        currentLayoutMode = mode;
        try {
            localStorage.setItem('fx_layout_mode', mode);
        } catch (e) {}
        currentConcept = (mode === 'desktop') ? 1 : 3;
        renderModal();
    }

    function setConcept3Tab(tabId) {
        activeTabConcept3 = tabId;
        renderModal();
    }

    // ── Helper de Renderização do Modal ──────────────────────────────
    function renderModal() {
        const container = document.getElementById('fxEditorModalContent');
        if (!container) return;

        // Salva a posição atual do scroll da lista antes de atualizar o HTML
        const scrollEl = container.querySelector('.fx-ed-scroll-body');
        const savedScrollTop = scrollEl ? scrollEl.scrollTop : 0;

        const preset = REVERB_PRESETS[currentSlotIdx];
        const params = decodeReverbParams(currentSlotIdx);
        const effectName = currentEffectTitle || preset.type;

        const headerHTML = window.FXComponents ? FXComponents.renderHeader({
            slot: preset.slot,
            effectName: effectName,
            colorTheme: preset.colorTheme,
            bypass: params.bypass,
            currentMode: currentLayoutMode,
            showBypass: true
        }) : '';

        let bodyHTML = '';
        if (currentConcept === 1) {
            bodyHTML = renderConcept1Knobs(params, preset);
        } else {
            bodyHTML = renderConcept3Tabs(params, preset);
        }

        container.innerHTML = `
            <div class="fx-ed-container ${preset.colorTheme} concept-${currentConcept}" style="position: relative;">
                ${headerHTML}
                <div class="fx-ed-scroll-body">
                    ${bodyHTML}
                </div>
            </div>
        `;

        // Restaura a posição exata da barra de rolagem
        const newScrollEl = container.querySelector('.fx-ed-scroll-body');
        if (newScrollEl) {
            newScrollEl.scrollTop = savedScrollTop;
        }
    }

    // ─────────────────────────────────────────────────────────────────
    // CONCEITO 1: Knobs Rotativos em Grid (Manipuláveis por Arrasto)
    // ─────────────────────────────────────────────────────────────────
    function renderConcept1Knobs(p, preset) {
        if (!window.FXComponents) return '';

        return `
        <div class="concept-view concept-knobs">
            <!-- Grupo 1: Mix Balance & Filtros -->
            ${FXComponents.renderCardGroup({
                title: 'SAÍDA & FILTROS',
                content: `
                    ${FXComponents.renderKnob({ label: p.mix.name, value: p.mix.val, percent: p.mix.pct, colorClass: 'purple' })}
                    ${FXComponents.renderKnob({ label: p.hpf.name, value: p.hpf.val, percent: p.hpf.pct, colorClass: 'rose' })}
                    ${FXComponents.renderKnob({ label: p.lpf.name, value: p.lpf.val, percent: p.lpf.pct, colorClass: 'rose' })}
                `
            })}

            <!-- Grupo 2: Tempos & Ratios -->
            ${FXComponents.renderCardGroup({
                title: 'TEMPO & ESPECTRO',
                content: `
                    ${FXComponents.renderKnob({ label: p.revTime.name, value: p.revTime.val, percent: p.revTime.pct, colorClass: 'purple' })}
                    ${FXComponents.renderKnob({ label: p.iniDly.name, value: p.iniDly.val, percent: p.iniDly.pct, colorClass: 'cyan' })}
                    ${FXComponents.renderKnob({ label: p.hiRatio.name, value: p.hiRatio.val, percent: p.hiRatio.pct, colorClass: 'amber' })}
                    ${FXComponents.renderKnob({ label: p.loRatio.name, value: p.loRatio.val, percent: p.loRatio.pct, colorClass: 'amber' })}
                `
            })}

            <!-- Grupo 3: Reflexões Primárias & Difusão -->
            ${FXComponents.renderCardGroup({
                title: 'REFLEXÕES & DIFUSÃO',
                content: `
                    ${FXComponents.renderKnob({ label: p.diff.name, value: p.diff.val, percent: p.diff.pct, colorClass: 'blue' })}
                    ${FXComponents.renderKnob({ label: p.density.name, value: p.density.val, percent: p.density.pct, colorClass: 'blue' })}
                    ${FXComponents.renderKnob({ label: p.erDly.name, value: p.erDly.val, percent: p.erDly.pct, colorClass: 'cyan' })}
                    ${FXComponents.renderKnob({ label: p.erBal.name, value: p.erBal.val, percent: p.erBal.pct, colorClass: 'green' })}
                `
            })}

            <!-- Grupo 4: Envelope do Gate -->
            ${FXComponents.renderCardGroup({
                title: 'ENVELOPE DO GATE',
                content: `
                    ${FXComponents.renderKnob({ label: p.gateLvl.name, value: p.gateLvl.val, percent: p.gateLvl.pct, colorClass: 'emerald' })}
                    ${FXComponents.renderKnob({ label: p.attack.name, value: p.attack.val, percent: p.attack.pct, colorClass: 'emerald' })}
                    ${FXComponents.renderKnob({ label: p.hold.name, value: p.hold.val, percent: p.hold.pct, colorClass: 'emerald' })}
                    ${FXComponents.renderKnob({ label: p.decay.name, value: p.decay.val, percent: p.decay.pct, colorClass: 'emerald' })}
                `
            })}
        </div>`;
    }

    function degFromPct(pct) {
        return window.FXComponents ? FXComponents.degFromPct(pct) : Math.round(-135 + (pct / 100) * 270);
    }

    function renderKnobItem(label, value, percent, colorClass = 'purple') {
        return window.FXComponents ? FXComponents.renderKnob({ label, value, percent, colorClass }) : '';
    }

    // ─────────────────────────────────────────────────────────────────
    // CONCEITO 2: Faders & Sliders Touch (Manipuláveis)
    // ─────────────────────────────────────────────────────────────────
    function renderConcept2Faders(p, preset) {
        return `
        <div class="concept-view concept-faders">
            <div class="c2-mix-bar">
                <div class="c2-mix-info">
                    <span class="c2-mix-title">MIX BALANCE</span>
                    <span class="c2-mix-val">${p.mix.val}</span>
                </div>
                <div class="fader-track-container">
                    <input type="range" class="c2-slider mix-slider" value="${p.mix.pct}" min="0" max="100" oninput="ReverbEditor.handleFaderInput(this, 'mix')">
                    <div class="fader-fill" style="width: ${p.mix.pct}%;"></div>
                </div>
            </div>

            <!-- Grupo 1: Tempo Principal & Resposta de Frequência -->
            <div class="fader-card">
                <div class="fader-card-title">DECAIMENTO & TEMPO</div>
                <div class="faders-list">
                    ${renderFaderRow(p.revTime.name, p.revTime.val, p.revTime.pct, 'purple', 'revTime')}
                    ${renderFaderRow(p.iniDly.name, p.iniDly.val, p.iniDly.pct, 'cyan', 'iniDly')}
                    ${renderFaderRow(p.hiRatio.name, p.hiRatio.val, p.hiRatio.pct, 'amber', 'ratio')}
                    ${renderFaderRow(p.loRatio.name, p.loRatio.val, p.loRatio.pct, 'amber', 'ratio')}
                </div>
            </div>

            <!-- Grupo 2: Densidade & Reflexões -->
            <div class="fader-card">
                <div class="fader-card-title">REFLEXÕES PRIMÁRIAS (E/R)</div>
                <div class="faders-list">
                    ${renderFaderRow(p.diff.name, p.diff.val, p.diff.pct, 'blue', 'diff')}
                    ${renderFaderRow(p.density.name, p.density.val, p.density.pct, 'blue', 'pct')}
                    ${renderFaderRow(p.erDly.name, p.erDly.val, p.erDly.pct, 'cyan', 'erDly')}
                    ${renderFaderRow(p.erBal.name, p.erBal.val, p.erBal.pct, 'green', 'pct')}
                </div>
            </div>

            <!-- Grupo 3: Filtros de Corte -->
            <div class="fader-card">
                <div class="fader-card-title">FILTROS EQ</div>
                <div class="faders-list">
                    ${renderFaderRow(p.hpf.name, p.hpf.val, p.hpf.pct, 'rose', 'hpf')}
                    ${renderFaderRow(p.lpf.name, p.lpf.val, p.lpf.pct, 'rose', 'lpf')}
                </div>
            </div>

            <!-- Grupo 4: Gate Dynamics -->
            <div class="fader-card">
                <div class="fader-card-title">GATE ENVELOPE</div>
                <div class="faders-list">
                    ${renderFaderRow(p.gateLvl.name, p.gateLvl.val, p.gateLvl.pct, 'emerald', 'gate')}
                    ${renderFaderRow(p.attack.name, p.attack.val, p.attack.pct, 'emerald', 'ms')}
                    ${renderFaderRow(p.hold.name, p.hold.val, p.hold.pct, 'emerald', 'ms')}
                    ${renderFaderRow(p.decay.name, p.decay.val, p.decay.pct, 'emerald', 'ms')}
                </div>
            </div>
        </div>`;
    }

    function renderFaderRow(label, value, pct, accentColor = 'purple', type = 'pct') {
        return `
        <div class="fader-row ${accentColor}">
            <div class="fader-meta">
                <span class="fader-lbl">${label}</span>
                <span class="fader-badge">${value}</span>
            </div>
            <div class="fader-track-container">
                <input type="range" class="c2-slider" value="${pct}" min="0" max="100" oninput="ReverbEditor.handleFaderInput(this, '${type}')">
                <div class="fader-fill" style="width: ${pct}%;"></div>
            </div>
        </div>`;
    }

    // ─────────────────────────────────────────────────────────────────
    // CONCEITO 3: Abas / Categorias com Touch Steppers (Manipuláveis)
    // ─────────────────────────────────────────────────────────────────
    function renderConcept3Tabs(p, preset) {
        return `
        <div class="concept-view concept-tabs">
            <!-- Mix Balance em Destaque (Mobile) -->
            <div class="c2-mix-bar" style="margin-bottom: 12px;">
                <div class="c2-mix-info">
                    <span class="c2-mix-title">${p.mix.name}</span>
                    <span class="c2-mix-val">${p.mix.val}</span>
                </div>
                <div class="fader-track-container">
                    <input type="range" class="c2-slider mix-slider" value="${p.mix.pct}" min="0" max="100" oninput="ReverbEditor.handleFaderInput(this, 'mix')">
                    <div class="fader-fill" style="width: ${p.mix.pct}%;"></div>
                </div>
            </div>

            <!-- Tab Navigation Bar -->
            <div class="c3-tab-bar">
                <button class="c3-tab-btn ${activeTabConcept3 === 'time' ? 'active' : ''}" onclick="ReverbEditor.setConcept3Tab('time')">
                    TEMPO
                </button>
                <button class="c3-tab-btn ${activeTabConcept3 === 'er' ? 'active' : ''}" onclick="ReverbEditor.setConcept3Tab('er')">
                    REFLEXÕES
                </button>
                <button class="c3-tab-btn ${activeTabConcept3 === 'filter' ? 'active' : ''}" onclick="ReverbEditor.setConcept3Tab('filter')">
                    FILTROS
                </button>
                <button class="c3-tab-btn ${activeTabConcept3 === 'gate' ? 'active' : ''}" onclick="ReverbEditor.setConcept3Tab('gate')">
                    GATE
                </button>
            </div>

            <div class="c3-tab-content">
                ${renderConcept3ActiveTabContent(p)}
            </div>
        </div>`;
    }

    function renderConcept3ActiveTabContent(p) {
        if (activeTabConcept3 === 'time') {
            return `
            <div class="c3-card-section">
                <h3 class="c3-sec-title">CONFIGURAÇÃO DE TEMPO</h3>
                ${renderStepperCard(p.revTime.name, p.revTime.val, 'Duração total da cauda da reverberação')}
                ${renderStepperCard(p.iniDly.name, p.iniDly.val, 'Atraso inicial antes da primeira resposta')}
                ${renderStepperCard(p.hiRatio.name, p.hiRatio.val, 'Proporção de atenuação das altas frequências')}
                ${renderStepperCard(p.loRatio.name, p.loRatio.val, 'Proporção de atenuação das baixas frequências')}
            </div>`;
        }
        if (activeTabConcept3 === 'er') {
            return `
            <div class="c3-card-section">
                <h3 class="c3-sec-title">REFLEXÕES E DIFUSÃO</h3>
                ${renderStepperCard(p.diff.name, p.diff.val, 'Difusão inicial das reflexões (0 a 10)')}
                ${renderStepperCard(p.density.name, p.density.val, 'Densidade de reflexões do ambiente')}
                ${renderStepperCard(p.erDly.name, p.erDly.val, 'Delay das reflexões primárias')}
                ${renderStepperCard(p.erBal.name, p.erBal.val, 'Balanço entre som direto e reflexões')}
            </div>`;
        }
        if (activeTabConcept3 === 'filter') {
            return `
            <div class="c3-card-section">
                <h3 class="c3-sec-title">CORTE DE FREQUÊNCIAS</h3>
                ${renderStepperCard(p.hpf.name, p.hpf.val, 'Filtro passa-altas na entrada do reverb')}
                ${renderStepperCard(p.lpf.name, p.lpf.val, 'Filtro passa-baixas na entrada do reverb')}
            </div>`;
        }
        if (activeTabConcept3 === 'gate') {
            return `
            <div class="c3-card-section">
                <h3 class="c3-sec-title">ENVELOPE DE GATE</h3>
                ${renderStepperCard(p.gateLvl.name, p.gateLvl.val, 'Nível de threshold do gate (OFF / -60dB a 0dB)')}
                ${renderStepperCard(p.attack.name, p.attack.val, 'Tempo de abertura do gate')}
                ${renderStepperCard(p.hold.name, p.hold.val, 'Tempo de sustentação do gate')}
                ${renderStepperCard(p.decay.name, p.decay.val, 'Tempo de fechamento do gate')}
            </div>`;
        }
        return '';
    }

    function renderStepperCard(title, val, desc) {
        return `
        <div class="c3-stepper-card">
            <div class="c3-stepper-info">
                <span class="c3-stepper-title">${title}</span>
                <span class="c3-stepper-desc">${desc}</span>
            </div>
            <div class="c3-stepper-controls">
                <button class="c3-btn-step" 
                        onmousedown="ReverbEditor.startStepperHold(this, -1, event)"
                        onmouseup="ReverbEditor.stopStepperHold()"
                        onmouseleave="ReverbEditor.stopStepperHold()"
                        ontouchstart="ReverbEditor.startStepperHold(this, -1, event)"
                        ontouchend="ReverbEditor.stopStepperHold()"
                        ontouchcancel="ReverbEditor.stopStepperHold()">-</button>
                <div class="c3-val-display">${val}</div>
                <button class="c3-btn-step" 
                        onmousedown="ReverbEditor.startStepperHold(this, 1, event)"
                        onmouseup="ReverbEditor.stopStepperHold()"
                        onmouseleave="ReverbEditor.stopStepperHold()"
                        ontouchstart="ReverbEditor.startStepperHold(this, 1, event)"
                        ontouchend="ReverbEditor.stopStepperHold()"
                        ontouchcancel="ReverbEditor.stopStepperHold()">+</button>
            </div>
        </div>`;
    }

    // ─────────────────────────────────────────────────────────────────
    // CONCEITO 4: Pro DAW Plugin (Manipulável por Arrasto)
    // ─────────────────────────────────────────────────────────────────
    function renderConcept4ProGraph(p, preset) {
        return `
        <div class="concept-view concept-daw">
            <!-- Display Gráfico de Resposta do Reverb -->
            <div class="daw-graph-card">
                <div class="daw-graph-header">
                    <span class="daw-graph-title">CURVA DE DECAIMENTO VISUAL</span>
                    <span class="daw-graph-badge" id="dawGraphBadge">REV TIME: ${p.revTime.val} | INI.DLY: ${p.iniDly.val}</span>
                </div>
                <div class="daw-svg-wrapper">
                    <svg viewBox="0 0 400 120" preserveAspectRatio="none" class="daw-svg-graph">
                        <defs>
                            <linearGradient id="reverbGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                                <stop offset="0%" stop-color="var(--accent-glow)" stop-opacity="0.6" />
                                <stop offset="50%" stop-color="var(--accent-glow)" stop-opacity="0.2" />
                                <stop offset="100%" stop-color="var(--accent-glow)" stop-opacity="0.0" />
                            </linearGradient>
                        </defs>
                        <!-- Grid lines -->
                        <line x1="0" y1="30" x2="400" y2="30" stroke="rgba(255,255,255,0.05)" />
                        <line x1="0" y1="60" x2="400" y2="60" stroke="rgba(255,255,255,0.05)" />
                        <line x1="0" y1="90" x2="400" y2="90" stroke="rgba(255,255,255,0.05)" />
                        <line x1="100" y1="0" x2="100" y2="120" stroke="rgba(255,255,255,0.05)" />
                        <line x1="200" y1="0" x2="200" y2="120" stroke="rgba(255,255,255,0.05)" />
                        <line x1="300" y1="0" x2="300" y2="120" stroke="rgba(255,255,255,0.05)" />
                        
                        <!-- Initial Delay gap + Early Reflections spikes + Exponential decay tail -->
                        <path id="dawSvgPath" d="M 0 115 L 25 115 
                                 L 28 40 L 32 110 L 38 30 L 45 105 L 52 50 L 60 95 L 70 65 L 80 90
                                 Q 160 85, 280 110 L 380 115 L 400 115 L 400 115 L 0 115 Z" 
                              fill="url(#reverbGrad)" stroke="var(--accent-color)" stroke-width="2" />
                    </svg>
                </div>
            </div>

            <!-- Controles Macro Destaque (Rodas / Wheels Grandes) -->
            <div class="daw-main-wheels">
                <div class="daw-wheel-item" onmousedown="ReverbEditor.startWheelDrag(event, this, 'revTime')" ontouchstart="ReverbEditor.startWheelDrag(event, this, 'revTime')">
                    <span class="daw-wheel-lbl">REV TIME</span>
                    <div class="daw-wheel-body">
                        <span class="daw-wheel-val">${p.revTime.val}</span>
                    </div>
                </div>
                <div class="daw-wheel-item" onmousedown="ReverbEditor.startWheelDrag(event, this, 'iniDly')" ontouchstart="ReverbEditor.startWheelDrag(event, this, 'iniDly')">
                    <span class="daw-wheel-lbl">INI. DLY</span>
                    <div class="daw-wheel-body">
                        <span class="daw-wheel-val">${p.iniDly.val}</span>
                    </div>
                </div>
                <div class="daw-wheel-item" onmousedown="ReverbEditor.startWheelDrag(event, this, 'mix')" ontouchstart="ReverbEditor.startWheelDrag(event, this, 'mix')">
                    <span class="daw-wheel-lbl">MIX</span>
                    <div class="daw-wheel-body highlight">
                        <span class="daw-wheel-val">${p.mix.val}</span>
                    </div>
                </div>
            </div>

            <!-- Grid Compacto de Ajustes Finos -->
            <div class="daw-sub-grid">
                <div class="daw-sub-col">
                    <h4 class="daw-sub-header">RATIOS & DIFUSÃO</h4>
                    ${renderDawCompactItem(p.hiRatio.name, p.hiRatio.val, 'ratio')}
                    ${renderDawCompactItem(p.loRatio.name, p.loRatio.val, 'ratio')}
                    ${renderDawCompactItem(p.diff.name, p.diff.val, 'diff')}
                    ${renderDawCompactItem(p.density.name, p.density.val, 'pct')}
                </div>
                <div class="daw-sub-col">
                    <h4 class="daw-sub-header">REFLEXÕES E EQs</h4>
                    ${renderDawCompactItem(p.erDly.name, p.erDly.val, 'ms')}
                    ${renderDawCompactItem(p.erBal.name, p.erBal.val, 'pct')}
                    ${renderDawCompactItem(p.hpf.name, p.hpf.val, 'hpf')}
                    ${renderDawCompactItem(p.lpf.name, p.lpf.val, 'lpf')}
                </div>
            </div>

            <!-- Envelope Gate Compacto -->
            <div class="daw-gate-panel">
                <h4 class="daw-sub-header">GATE ENVELOPE</h4>
                <div class="daw-gate-row">
                    ${renderDawCompactItem(p.gateLvl.name, p.gateLvl.val, 'gate')}
                    ${renderDawCompactItem(p.attack.name, p.attack.val, 'ms')}
                    ${renderDawCompactItem(p.hold.name, p.hold.val, 'ms')}
                    ${renderDawCompactItem(p.decay.name, p.decay.val, 'ms')}
                </div>
            </div>
        </div>`;
    }

    function renderDawCompactItem(name, val, type = 'pct') {
        return `
        <div class="daw-compact-item" onmousedown="ReverbEditor.startWheelDrag(event, this, '${type}')" ontouchstart="ReverbEditor.startWheelDrag(event, this, '${type}')">
            <span class="daw-ci-name">${name}</span>
            <div class="daw-ci-val-box">
                <span>${val}</span>
            </div>
        </div>`;
    }

    // ─────────────────────────────────────────────────────────────────
    // ENVIO DE ALTERAÇÃO DE PARÂMETROS (APP -> MESA 01V96)
    // ─────────────────────────────────────────────────────────────────
    const PARAM_MAP_BY_TITLE = {
        'REV. TIME': { param: 17, min: 0, max: 99 },
        'REV TIME': { param: 17, min: 0, max: 99 },
        'INI. DLY': { param: 16, min: 0, max: 5000 },
        'HI.RATIO': { param: 18, min: 0, max: 9 },
        'LO.RATIO': { param: 19, min: 0, max: 23 },
        'DIFF.': { param: 20, min: 0, max: 10 },
        'DIFF': { param: 20, min: 0, max: 10 },
        'DENSITY': { param: 21, min: 0, max: 100 },
        'HPF': { param: 22, min: 0, max: 104 },
        'LPF': { param: 23, min: 0, max: 105 },
        'E/R DLY': { param: 24, min: 0, max: 1000 },
        'E/R BAL.': { param: 25, min: 0, max: 100 },
        'E/R BAL': { param: 25, min: 0, max: 100 },
        'GATE': { param: 26, min: 0, max: 61 },
        'GATE LVL': { param: 26, min: 0, max: 61 },
        'ATTACK': { param: 27, min: 0, max: 120 },
        'HOLD': { param: 28, min: 0, max: 215 },
        'DECAY': { param: 29, min: 0, max: 159 },
        'MIX BALANCE': { param: 48, min: 0, max: 100 },
        'MIX': { param: 48, min: 0, max: 100 }
    };

    function sendParamChange(param, value) {
        if (typeof currentSlotIdx !== 'number' || currentSlotIdx < 0 || currentSlotIdx > 3) return;
        if (!fxParamsState[currentSlotIdx]) fxParamsState[currentSlotIdx] = {};
        
        // Atualização Otimista local
        fxParamsState[currentSlotIdx][param] = value;

        if (typeof socket !== 'undefined' && socket.emit) {
            socket.emit('changeFxParam', {
                slot: currentSlotIdx,
                param: param,
                value: value
            });
        }
    }

    function toggleBypass() {
        const currentVal = fxParamsState[currentSlotIdx] ? (fxParamsState[currentSlotIdx][52] || 0) : 0;
        const newBypassVal = currentVal > 0 ? 0 : 1;
        sendParamChange(52, newBypassVal);
        renderModal();
    }

    // 1. Handlers de Fader/Slider
    let lastFaderSentTime = 0;
    function handleFaderInput(inputEl, type) {
        const val = parseInt(inputEl.value, 10);
        const now = Date.now();
        if (type === 'mix' && (now - lastFaderSentTime >= 40)) {
            sendParamChange(48, val);
            lastFaderSentTime = now;
        }
        renderModal();
    }

    // 2. Handlers de Knobs (Drag em Y com Transmissão em Tempo Real Cadenciada)
    let activeKnobDrag = null;

    function startKnobDrag(e, knobBox) {
        e.preventDefault();
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
        const ring = knobBox.querySelector('.knob-ring');
        const pointer = knobBox.querySelector('.knob-pointer');
        const badge = knobBox.querySelector('.knob-val-badge') || knobBox.querySelector('.knob-value');
        const labelEl = knobBox.querySelector('.knob-label');

        let currentPct = 50;
        if (ring) {
            const styleVal = ring.style.getPropertyValue('--percent');
            if (styleVal) currentPct = parseFloat(styleVal);
        }

        activeKnobDrag = {
            startY: clientY,
            startPct: currentPct,
            lastPct: currentPct,
            lastSentTime: 0,
            lastSentStep: -1,
            ring: ring,
            pointer: pointer,
            badge: badge,
            label: labelEl ? labelEl.innerText : 'MIX'
        };

        window.addEventListener('mousemove', onKnobDrag);
        window.addEventListener('mouseup', stopKnobDrag);
        window.addEventListener('touchmove', onKnobDrag, { passive: false });
        window.addEventListener('touchend', stopKnobDrag);
    }

    function formatRevTimeStep(step) {
        step = Math.round(step);
        let secs = 0.3;
        if (step <= 47) secs = step * 0.1 + 0.3;
        else if (step <= 57) secs = (step - 47) * 0.5 + 5.0;
        else if (step <= 67) secs = (step - 57) * 1.0 + 10.0;
        else if (step <= 82) secs = (step - 67) * 5.0 + 20.0;
        else secs = 99.0;
        return secs.toFixed(1) + 's';
    }

    function formatRealValueByParam(param, step) {
        step = Math.round(step);
        if (param === 16) return (step / 10).toFixed(1) + 'ms';
        if (param === 17) return formatRevTimeStep(step);
        if (param === 18) return ((step + 1) / 10).toFixed(1);
        if (param === 19) return ((step + 1) / 10).toFixed(1);
        if (param === 20) return String(step);
        if (param === 21) return step + '%';
        if (param === 22) return formatHpfStep(step);
        if (param === 23) return formatLpfStep(step);
        if (param === 24) return (step / 10).toFixed(1) + 'ms';
        if (param === 25) return step + '%';
        if (param === 26) return step === 0 ? 'OFF' : (step - 61) + 'dB';
        if (param === 27) return step + 'ms';
        if (param === 28) return formatHoldStep(step);
        if (param === 29) return formatDecayStep(step);
        if (param === 48) return step + '%';
        return String(step);
    }

    function onKnobDrag(e) {
        if (!activeKnobDrag) return;
        if (e.cancelable) e.preventDefault();

        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
        const deltaY = activeKnobDrag.startY - clientY;
        let newPct = Math.min(100, Math.max(0, activeKnobDrag.startPct + deltaY * 0.75));
        activeKnobDrag.lastPct = newPct;

        const deg = degFromPct(newPct);
        if (activeKnobDrag.ring) activeKnobDrag.ring.style.setProperty('--percent', newPct + '%');
        if (activeKnobDrag.pointer) activeKnobDrag.pointer.style.transform = `rotate(${deg}deg)`;

        const labelKey = activeKnobDrag.label.trim().toUpperCase();
        const info = PARAM_MAP_BY_TITLE[labelKey];

        if (info) {
            const step = Math.min(info.max, Math.max(info.min, Math.round((newPct / 100) * info.max)));
            if (activeKnobDrag.badge) {
                activeKnobDrag.badge.innerText = formatRealValueByParam(info.param, step);
            }
            // Transmissão cadastrada em tempo real (Throttle ~40ms para audio feeling sem flood)
            const now = Date.now();
            if (step !== activeKnobDrag.lastSentStep && (now - activeKnobDrag.lastSentTime >= 40)) {
                sendParamChange(info.param, step);
                activeKnobDrag.lastSentTime = now;
                activeKnobDrag.lastSentStep = step;
            }
        } else if (activeKnobDrag.badge) {
            activeKnobDrag.badge.innerText = Math.round(newPct) + '%';
        }
    }

    function stopKnobDrag() {
        if (activeKnobDrag) {
            const labelKey = activeKnobDrag.label.trim().toUpperCase();
            const info = PARAM_MAP_BY_TITLE[labelKey];
            if (info && typeof activeKnobDrag.lastPct === 'number') {
                const step = Math.min(info.max, Math.max(info.min, Math.round((activeKnobDrag.lastPct / 100) * info.max)));
                if (step !== activeKnobDrag.lastSentStep) {
                    sendParamChange(info.param, step);
                }
            }
        }
        activeKnobDrag = null;
        window.removeEventListener('mousemove', onKnobDrag);
        window.removeEventListener('mouseup', stopKnobDrag);
        window.removeEventListener('touchmove', onKnobDrag);
        window.removeEventListener('touchend', stopKnobDrag);
        renderModal();
    }

    // 3. Handlers de Steppers (Conceito 3 com Press & Hold)
    let stepperHoldTimer = null;
    let stepperHoldInterval = null;

    function startStepperHold(btnEl, delta, e) {
        if (e && e.type === 'touchstart') e.preventDefault();
        stopStepperHold();

        handleStepper(btnEl, delta);

        stepperHoldTimer = setTimeout(() => {
            stepperHoldInterval = setInterval(() => {
                handleStepper(btnEl, delta);
            }, 80);
        }, 350);
    }

    function stopStepperHold() {
        if (stepperHoldTimer) {
            clearTimeout(stepperHoldTimer);
            stepperHoldTimer = null;
        }
        if (stepperHoldInterval) {
            clearInterval(stepperHoldInterval);
            stepperHoldInterval = null;
        }
    }

    function handleStepper(btnEl, delta) {
        const card = btnEl.closest('.c3-stepper-card');
        if (!card) return;
        const titleEl = card.querySelector('.c3-stepper-title');
        if (!titleEl) return;

        const titleKey = titleEl.innerText.trim().toUpperCase();
        const info = PARAM_MAP_BY_TITLE[titleKey];
        if (!info) return;

        const currentSlotParams = fxParamsState[currentSlotIdx] || {};
        let currentRaw = currentSlotParams[info.param];
        if (currentRaw === undefined) currentRaw = 0;

        let newRaw = Math.min(info.max, Math.max(info.min, Math.round(currentRaw) + delta));
        sendParamChange(info.param, newRaw);
        renderModal();
    }

    // 4. Handlers de Wheel Drag (Conceito 4)
    let activeWheelDrag = null;

    function startWheelDrag(e, wheelEl, type) {
        e.preventDefault();
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
        const valEl = wheelEl.querySelector('.daw-wheel-val') || wheelEl.querySelector('.daw-ci-val-box span');

        activeWheelDrag = {
            startY: clientY,
            valEl: valEl,
            type: type,
            currentPct: 50
        };

        window.addEventListener('mousemove', onWheelDrag);
        window.addEventListener('mouseup', stopWheelDrag);
        window.addEventListener('touchmove', onWheelDrag, { passive: false });
        window.addEventListener('touchend', stopWheelDrag);
    }

    function onWheelDrag(e) {
        if (!activeWheelDrag) return;
        if (e.cancelable) e.preventDefault();

        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
        const deltaY = activeWheelDrag.startY - clientY;
        let newPct = Math.min(100, Math.max(0, activeWheelDrag.currentPct + deltaY * 0.5));

        if (activeWheelDrag.valEl) {
            activeWheelDrag.valEl.innerText = Math.round(newPct) + '%';
        }
    }

    function stopWheelDrag() {
        activeWheelDrag = null;
        window.removeEventListener('mousemove', onWheelDrag);
        window.removeEventListener('mouseup', stopWheelDrag);
        window.removeEventListener('touchmove', onWheelDrag);
        window.removeEventListener('touchend', stopWheelDrag);
    }

    // Expor Globalmente
    window.ReverbEditor = {
        open: open,
        openUnderConstruction: openUnderConstruction,
        close: close,
        setLayoutMode: setLayoutMode,
        setConcept3Tab: setConcept3Tab,
        handleFaderInput: handleFaderInput,
        startKnobDrag: startKnobDrag,
        handleStepper: handleStepper,
        startStepperHold: startStepperHold,
        stopStepperHold: stopStepperHold,
        startWheelDrag: startWheelDrag,
        toggleBypass: toggleBypass
    };

})();
