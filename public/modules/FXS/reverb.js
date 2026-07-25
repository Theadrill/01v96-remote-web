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

    let currentLayoutMode = detectDefaultLayoutMode();
    let currentSlotIdx = 0;
    let currentConcept = (currentLayoutMode === 'desktop') ? 1 : 3;
    let activeTabConcept3 = 'time';
    let currentEffectTitle = '';

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

        const preset = REVERB_PRESETS[currentSlotIdx];
        const params = REVERB_PARAMS_DEFAULT;
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
                <div class="fx-demo-overlay">
                    <div class="fx-demo-overlay-text">DEMONSTRAÇÃO</div>
                </div>
                ${headerHTML}
                <div class="fx-ed-scroll-body">
                    ${bodyHTML}
                </div>
            </div>
        `;
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
    // HANDLERS INTERATIVOS (SEM LÓGICA DE SERVIDORES / APENAS MOCK UI)
    // ─────────────────────────────────────────────────────────────────

    // 1. Handlers de Fader/Slider
    function handleFaderInput(inputEl, type) {
        const val = parseInt(inputEl.value, 10);
        const container = inputEl.closest('.fader-track-container') || inputEl.closest('.c2-mix-bar');
        if (!container) return;

        const fill = container.querySelector('.fader-fill');
        if (fill) fill.style.width = val + '%';

        const row = inputEl.closest('.fader-row');
        if (row) {
            const badge = row.querySelector('.fader-badge');
            if (badge) badge.innerText = formatMockValue(val, type);
        }

        const mixBar = inputEl.closest('.c2-mix-bar');
        if (mixBar) {
            const mixVal = mixBar.querySelector('.c2-mix-val');
            if (mixVal) mixVal.innerText = val + '%';
        }
    }

    // 2. Handlers de Knobs (Drag em Y)
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

    function onKnobDrag(e) {
        if (!activeKnobDrag) return;
        if (e.cancelable) e.preventDefault();

        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
        const deltaY = activeKnobDrag.startY - clientY;
        let newPct = Math.min(100, Math.max(0, activeKnobDrag.startPct + deltaY * 0.75));

        const deg = degFromPct(newPct);
        if (activeKnobDrag.ring) activeKnobDrag.ring.style.setProperty('--percent', newPct + '%');
        if (activeKnobDrag.pointer) activeKnobDrag.pointer.style.transform = `rotate(${deg}deg)`;

        if (activeKnobDrag.badge) {
            activeKnobDrag.badge.innerText = formatMockValueByLabel(newPct, activeKnobDrag.label);
        }
    }

    function stopKnobDrag() {
        activeKnobDrag = null;
        window.removeEventListener('mousemove', onKnobDrag);
        window.removeEventListener('mouseup', stopKnobDrag);
        window.removeEventListener('touchmove', onKnobDrag);
        window.removeEventListener('touchend', stopKnobDrag);
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
        const controls = btnEl.closest('.c3-stepper-controls');
        if (!controls) return;
        const display = controls.querySelector('.c3-val-display');
        if (!display) return;

        let txt = display.innerText;
        let match = txt.match(/^([-\d.]+)/);
        if (match) {
            let num = parseFloat(match[1]);
            let isFloat = txt.includes('.');
            num = isFloat ? parseFloat((num + delta * 0.1).toFixed(1)) : (num + delta);

            let unit = txt.replace(/^scroll/i, '').replace(/^[-\d.]+/, '');
            
            // Tratamento especial para limites mock
            if (unit === 'dB') {
                if (num < -60) txt = 'OFF';
                else txt = (num > 0 ? 0 : num) + 'dB';
            } else if (unit === '%') {
                num = Math.min(100, Math.max(0, num));
                txt = num + '%';
            } else {
                if (num < 0) num = 0;
                txt = num + unit;
            }
            display.innerText = txt;
        } else if (txt === 'OFF' && delta > 0) {
            display.innerText = '-60dB';
        } else if (txt === 'Thru' && delta > 0) {
            display.innerText = '85.0Hz';
        }
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
            activeWheelDrag.valEl.innerText = formatMockValue(newPct, activeWheelDrag.type);
        }
    }

    function stopWheelDrag() {
        activeWheelDrag = null;
        window.removeEventListener('mousemove', onWheelDrag);
        window.removeEventListener('mouseup', stopWheelDrag);
        window.removeEventListener('touchmove', onWheelDrag);
        window.removeEventListener('touchend', stopWheelDrag);
    }

    // Helpers de Formatação Mock
    function formatMockValue(pct, type) {
        pct = Math.round(pct);
        if (type === 'revTime') return (0.3 + (pct / 100) * 8.0).toFixed(1) + 's';
        if (type === 'iniDly') return (pct * 2.5).toFixed(1) + 'ms';
        if (type === 'ratio') return (0.1 + (pct / 100) * 2.0).toFixed(1);
        if (type === 'diff') return Math.round(pct / 10);
        if (type === 'erDly') return (pct * 0.8).toFixed(1) + 'ms';
        if (type === 'hpf') return pct === 0 ? 'Thru' : Math.round(20 + pct * 5) + 'Hz';
        if (type === 'lpf') return pct === 100 ? 'Thru' : (1.0 + (pct / 100) * 15.0).toFixed(2) + 'kHz';
        if (type === 'gate') return pct === 0 ? 'OFF' : (pct - 61) + 'dB';
        if (type === 'ms') return Math.round(pct * 1.5) + 'ms';
        return pct + '%';
    }

    function formatMockValueByLabel(pct, label) {
        label = label.toUpperCase();
        if (label.includes('TIME')) return (0.3 + (pct / 100) * 8.0).toFixed(1) + 's';
        if (label.includes('INI. DLY') || label.includes('E/R DLY')) return (pct * 2.5).toFixed(1) + 'ms';
        if (label.includes('RATIO')) return (0.1 + (pct / 100) * 2.0).toFixed(1);
        if (label.includes('DIFF')) return Math.round(pct / 10);
        if (label.includes('HPF')) return pct === 0 ? 'Thru' : Math.round(20 + pct * 5) + 'Hz';
        if (label.includes('LPF')) return pct === 100 ? 'Thru' : (1.0 + (pct / 100) * 15.0).toFixed(2) + 'kHz';
        if (label.includes('GATE')) return pct === 0 ? 'OFF' : (pct - 61) + 'dB';
        if (label.includes('ATTACK') || label.includes('HOLD') || label.includes('DECAY')) return Math.round(pct * 1.5) + 'ms';
        return Math.round(pct) + '%';
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
        startWheelDrag: startWheelDrag
    };

})();
