// fx_components.js — Sistema de Componentes Reutilizáveis de Efeitos (Yamaha 01V96 Remote)
(function () {
    'use strict';

    function degFromPct(pct) {
        return Math.round(-135 + (pct / 100) * 270);
    }

    function controllerRef() {
        return (window.FXCore) ? 'FXCore' : 'ReverbEditor';
    }

    // ── Componente: Rotary Knob ──────────────────────────────────────
    function renderKnob({ label, value, percent, colorClass = 'purple', isLarge = false, onDrag, onWheel, sysEx, paramKey }) {
        const deg = degFromPct(percent);
        const sizeCls = isLarge ? 'large-knob' : '';
        const ctrl = controllerRef();
        const dragAttr = onDrag || `${ctrl}.startKnobDrag(event, this)`;
        const wheelAttr = onWheel || `${ctrl}.handleWheelKnob(event, this)`;
        const dataSysEx = (sysEx !== undefined) ? `data-sysex="${sysEx}"` : '';
        const dataKey = (paramKey) ? `data-param-key="${paramKey}"` : '';

        return `
        <div class="knob-box ${colorClass} ${sizeCls}" ${dataSysEx} ${dataKey} onmousedown="${dragAttr}" ontouchstart="${dragAttr}">
            ${label ? `<span class="knob-label">${label}</span>` : ''}
            <div class="knob-outer" onwheel="${wheelAttr}">
                <div class="knob-ring" style="--percent: ${percent}%;"></div>
                <div class="knob-pointer" style="transform: rotate(${deg}deg);"></div>
                <div class="knob-center-dot"></div>
            </div>
            <span class="knob-val-badge">${value}</span>
        </div>`;
    }

    // ── Componente: Stepper Card (Touch + Auto-repeat) ───────────────
    function renderStepperCard({ title, value, desc, sysEx, paramKey }) {
        const ctrl = controllerRef();
        const dataSysEx = (sysEx !== undefined) ? `data-sysex="${sysEx}"` : '';
        const dataKey = (paramKey) ? `data-param-key="${paramKey}"` : '';

        return `
        <div class="c3-stepper-card" ${dataSysEx} ${dataKey}>
            <div class="c3-stepper-info">
                <span class="c3-stepper-title">${title}</span>
                <span class="c3-stepper-desc">${desc || ''}</span>
            </div>
            <div class="c3-stepper-controls">
                <button class="c3-btn-step" 
                        onmousedown="${ctrl}.startStepperHold(this, -1, event)"
                        onmouseup="${ctrl}.stopStepperHold()"
                        onmouseleave="${ctrl}.stopStepperHold()"
                        ontouchstart="${ctrl}.startStepperHold(this, -1, event)"
                        ontouchend="${ctrl}.stopStepperHold()"
                        ontouchcancel="${ctrl}.stopStepperHold()">-</button>
                <span class="c3-val-display">${value}</span>
                <button class="c3-btn-step" 
                        onmousedown="${ctrl}.startStepperHold(this, 1, event)"
                        onmouseup="${ctrl}.stopStepperHold()"
                        onmouseleave="${ctrl}.stopStepperHold()"
                        ontouchstart="${ctrl}.startStepperHold(this, 1, event)"
                        ontouchend="${ctrl}.stopStepperHold()"
                        ontouchcancel="${ctrl}.stopStepperHold()">+</button>
            </div>
        </div>`;
    }

    // ── Componente: Card Group (Container de Seção) ──────────────────
    function renderCardGroup({ title, content, extraClass = '' }) {
        return `
        <div class="fx-card-group ${extraClass}">
            ${title ? `<div class="fx-card-header">${title}</div>` : ''}
            <div class="knobs-grid">
                ${content}
            </div>
        </div>`;
    }

    // ── Componente: Seletor de Layout (MOBILE | DESKTOP) ─────────────
    function renderLayoutPicker({ currentMode, onSetMode }) {
        const ctrl = controllerRef();
        const fn = onSetMode || `${ctrl}.setLayoutMode`;
        return `
        <div class="fx-ed-layout-picker">
            <span class="fx-ed-picker-label">LAYOUT:</span>
            <button class="fx-ed-layout-btn ${currentMode === 'mobile' ? 'active' : ''}" onclick="${fn}('mobile')">
                MOBILE
            </button>
            <button class="fx-ed-layout-btn ${currentMode === 'desktop' ? 'active' : ''}" onclick="${fn}('desktop')">
                DESKTOP
            </button>
        </div>`;
    }

    // ── Componente: Cabeçalho Padrão do Efeito ────────────────────────
    function renderHeader({ slot, effectName, colorTheme, bypass, currentMode, showBypass = true }) {
        const ctrl = controllerRef();
        return `
        <div class="fx-ed-header ${colorTheme}">
            <div class="fx-ed-header-top">
                <div class="fx-ed-title-block">
                    <span class="fx-ed-slot-tag">FX${slot}</span>
                    <h2 class="fx-ed-name">${effectName}</h2>
                </div>
                ${showBypass ? `
                <div class="fx-ed-bypass-wrapper">
                    <button class="fx-ed-bypass-btn ${bypass ? 'active' : ''}" onclick="if (window.${ctrl} && window.${ctrl}.toggleBypass) window.${ctrl}.toggleBypass(); else if (window.ReverbEditor && window.ReverbEditor.toggleBypass) window.ReverbEditor.toggleBypass(); else this.classList.toggle('active');">
                        BYPASS
                    </button>
                </div>` : ''}
            </div>

            ${renderLayoutPicker({ currentMode })}
        </div>`;
    }

    // ── Componente: Switch / Toggle (ON/OFF) ──────────────────────────
    function renderSwitchCard({ label, active, onToggle, sysEx, paramKey }) {
        const ctrl = controllerRef();
        const fn = onToggle || `${ctrl}.toggleSwitch(this)`;
        const dataSysEx = (sysEx !== undefined) ? `data-sysex="${sysEx}"` : '';
        const dataKey = (paramKey) ? `data-param-key="${paramKey}"` : '';

        return `
        <div class="fx-switch-card ${active ? 'active' : ''}" ${dataSysEx} ${dataKey} onclick="${fn}">
            <span class="fx-switch-label">${label}</span>
            <div class="fx-switch-pill ${active ? 'on' : 'off'}">
                <span class="fx-switch-text">${active ? 'ON' : 'OFF'}</span>
            </div>
        </div>`;
    }

    // ── Componente: Meter de Telemetria (Barra Vertical de LED) ───────
    function renderMeterColumn({ label, value = '', lit = 0, total = 12, live = false, cls = '' }) {
        let segs = '';
        for (let i = 0; i < total; i++) {
            const isLit = i < lit;
            const isPeak = isLit && i === lit - 1;
            segs += `<div class="fx-meter-seg${isLit ? ' lit' : ''}${isPeak ? ' peak' : ''}" data-i="${i}"></div>`;
        }
        return `
        <div class="fx-meter${cls ? ' fx-meter-' + cls : ''}">
            <span class="fx-meter-label">${label}</span>
            <div class="fx-meter-track${live ? ' fx-meter-live' : ''}">
                ${segs}
            </div>
            <span class="fx-meter-val">${value}</span>
        </div>`;
    }

    function renderMeters({ bands = [], stereo = null, total = 12, live = true }) {
        const bandGroups = bands.map(b => `
        <div class="fx-meter-group fx-meter-band">
            <div class="fx-meter-group-title">${b.name}</div>
            <div class="fx-meter-pair">
                ${renderMeterColumn({ label: 'LVL', value: b.levelVal || '', lit: b.level, total, live })}
                ${renderMeterColumn({ label: 'GR', value: b.grVal || '', lit: b.gr, total, live, cls: 'gr' })}
            </div>
            ${b.solo ? renderSwitchCard({ label: 'SOLO', active: b.solo.active, sysEx: b.solo.sysEx, paramKey: b.solo.key }) : ''}
        </div>`).join('');

        const stereoGroup = stereo ? `
        <div class="fx-meter-group fx-meter-stereo">
            <div class="fx-meter-group-title">STEREO</div>
            <div class="fx-meter-pair">
                <div class="fx-meter-subpair fx-meter-in-pair">
                    ${renderMeterColumn({ label: 'IN L', value: stereo.inLVal || '', lit: stereo.inL, total, live })}
                    ${renderMeterColumn({ label: 'IN R', value: stereo.inRVal || '', lit: stereo.inR, total, live })}
                </div>
                <div class="fx-meter-subpair fx-meter-out-pair">
                    ${renderMeterColumn({ label: 'OUT L', value: stereo.outLVal || '', lit: stereo.outL, total, live })}
                    ${renderMeterColumn({ label: 'OUT R', value: stereo.outRVal || '', lit: stereo.outR, total, live })}
                </div>
            </div>
        </div>` : '';

        return `
        <div class="fx-meters-block">
            <div class="fx-meters-bar-head">
                <span class="fx-meters-title">NÍVEIS</span>
                <div class="fx-meters-scale-pill">
                    <span class="scale-lbl">ESCALA:</span>
                    <span class="scale-item green">-24</span>
                    <span class="scale-item yellow">-12</span>
                    <span class="scale-item yellow">-6</span>
                    <span class="scale-item red">0 dB</span>
                </div>
            </div>
            <div class="fx-meters-row">
                ${bandGroups}
                ${stereoGroup}
            </div>
        </div>`;
    }

    // ── Componente: Seletor / Dropdown / Pills ────────────────────────
    function renderSelectorCard({ label, options = [], selectedVal, onSelect, sysEx, paramKey }) {
        const ctrl = controllerRef();
        const dataSysEx = (sysEx !== undefined) ? `data-sysex="${sysEx}"` : '';
        const dataKey = (paramKey) ? `data-param-key="${paramKey}"` : '';

        const buttons = options.map(opt => {
            const isSel = (opt.val === selectedVal);
            const fn = onSelect || `${ctrl}.selectOption(this, ${opt.val})`;
            return `<button class="fx-opt-btn ${isSel ? 'active' : ''}" onclick="${fn}">${opt.label}</button>`;
        }).join('');

        return `
        <div class="fx-selector-card" ${dataSysEx} ${dataKey}>
            ${label ? `<span class="fx-selector-label">${label}</span>` : ''}
            <div class="fx-selector-options">
                ${buttons}
            </div>
        </div>`;
    }

    // ── Componente: Tela de Efeito em Construção ──────────────────────
    function renderUnderConstruction({ slotNum, displayName }) {
        return `
        <div class="fx-ed-container theme-stage concept-construction">
            <div class="fx-ed-header theme-stage">
                <div class="fx-ed-header-top">
                    <div class="fx-ed-title-block">
                        <span class="fx-ed-slot-tag">FX${slotNum}</span>
                        <h2 class="fx-ed-name">${displayName}</h2>
                    </div>
                </div>
            </div>
            <div class="fx-ed-scroll-body">
                <div class="fx-under-construction">
                    <div class="fx-uc-icon">
                        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"></path>
                        </svg>
                    </div>
                    <h3 class="fx-uc-title">TELA DE EFEITO EM CONSTRUÇÃO</h3>
                    <div class="fx-uc-name-badge">${displayName}</div>
                    <p class="fx-uc-desc">
                        A tela de configuração individual para este efeito está em desenvolvimento.<br><br>
                        Os 4 Reverbs Padrão (<strong>REVERB HALL</strong>, <strong>REVERB ROOM</strong>, <strong>REVERB STAGE</strong> e <strong>REVERB PLATE</strong>) já estão 100% calibrados e disponíveis para teste no simulador.
                    </p>
                </div>
            </div>
        </div>`;
    }

    // Expor Globalmente
    window.FXComponents = {
        renderKnob: renderKnob,
        renderStepperCard: renderStepperCard,
        renderCardGroup: renderCardGroup,
        renderLayoutPicker: renderLayoutPicker,
        renderHeader: renderHeader,
        renderSwitchCard: renderSwitchCard,
        renderSelectorCard: renderSelectorCard,
        renderUnderConstruction: renderUnderConstruction,
        renderMeterColumn: renderMeterColumn,
        renderMeters: renderMeters,
        degFromPct: degFromPct
    };

})();
