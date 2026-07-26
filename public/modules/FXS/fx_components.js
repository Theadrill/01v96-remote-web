// fx_components.js — Sistema de Componentes Reutilizáveis de Efeitos (Yamaha 01V96 Remote)
(function () {
    'use strict';

    function degFromPct(pct) {
        return Math.round(-135 + (pct / 100) * 270);
    }

    // ── Componente: Rotary Knob ──────────────────────────────────────
    function renderKnob({ label, value, percent, colorClass = 'purple', isLarge = false, onDrag, onWheel }) {
        const deg = degFromPct(percent);
        const sizeCls = isLarge ? 'large-knob' : '';
        const dragAttr = onDrag || "ReverbEditor.startKnobDrag(event, this)";
        const wheelAttr = onWheel || "ReverbEditor.handleWheelKnob(event, this)";

        return `
        <div class="knob-box ${colorClass} ${sizeCls}" onmousedown="${dragAttr}" ontouchstart="${dragAttr}" onwheel="${wheelAttr}">
            ${label ? `<span class="knob-label">${label}</span>` : ''}
            <div class="knob-outer">
                <div class="knob-ring" style="--percent: ${percent}%;"></div>
                <div class="knob-pointer" style="transform: rotate(${deg}deg);"></div>
                <div class="knob-center-dot"></div>
            </div>
            <span class="knob-val-badge">${value}</span>
        </div>`;
    }

    // ── Componente: Stepper Card (Touch + Auto-repeat) ───────────────
    function renderStepperCard({ title, value, desc }) {
        return `
        <div class="c3-stepper-card">
            <div class="c3-stepper-info">
                <span class="c3-stepper-title">${title}</span>
                <span class="c3-stepper-desc">${desc || ''}</span>
            </div>
            <div class="c3-stepper-controls">
                <button class="c3-btn-step" 
                        onmousedown="ReverbEditor.startStepperHold(this, -1, event)"
                        onmouseup="ReverbEditor.stopStepperHold()"
                        onmouseleave="ReverbEditor.stopStepperHold()"
                        ontouchstart="ReverbEditor.startStepperHold(this, -1, event)"
                        ontouchend="ReverbEditor.stopStepperHold()"
                        ontouchcancel="ReverbEditor.stopStepperHold()">-</button>
                <span class="c3-val-display">${value}</span>
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
        const fn = onSetMode || 'ReverbEditor.setLayoutMode';
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
        return `
        <div class="fx-ed-header ${colorTheme}">
            <div class="fx-ed-header-top">
                <div class="fx-ed-title-block">
                    <span class="fx-ed-slot-tag">FX${slot}</span>
                    <h2 class="fx-ed-name">${effectName}</h2>
                </div>
                ${showBypass ? `
                <div class="fx-ed-bypass-wrapper">
                    <button class="fx-ed-bypass-btn ${bypass ? 'active' : ''}" onclick="if (window.ReverbEditor && window.ReverbEditor.toggleBypass) window.ReverbEditor.toggleBypass(); else this.classList.toggle('active');">
                        BYPASS
                    </button>
                </div>` : ''}
            </div>

            ${renderLayoutPicker({ currentMode })}
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
        renderUnderConstruction: renderUnderConstruction,
        degFromPct: degFromPct
    };

})();
