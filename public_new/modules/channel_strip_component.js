/**
 * ChannelStripComponent (v2) - 01v96 Remote Web
 * Custom Element nativo com Light DOM para faders e medidores de canal.
 *
 * Características:
 * - Renderização Light DOM (total integração com CSS e sistema de temas YAML).
 * - Inscrição autônoma no MeterBus a 60 FPS com zero-copy.
 * - IntersectionObserver local para economizar CPU quando fora do viewport.
 * - Setters reativos cirúrgicos (value, on, solo, name) sem re-renderizar o card.
 */

import { MeterBus } from './meter-bus.js';
import { rawToDb, dbToRaw, getSteppedRaw, getChannelStateById, getChannelLabel } from './utils.js';
import { uiState } from './state.js';
import { emit } from './socket-client.js';

export class ChannelStripComponent extends HTMLElement {
    static get observedAttributes() {
        return ['data-ch', 'preset', 'layout', 'data-partner-ch', 'disabled', 'patch', 'pan', 'locked'];
    }

    constructor() {
        super();
        this._ch = 0;
        this._preset = 'input'; // 'input' | 'master' | 'output' | 'auxSend' | 'mini'
        this._layout = 'desktop'; // 'desktop' | 'mobile'
        this._partnerCh = null;
        this._value = 0;
        this._on = false;
        this._solo = false;
        this._name = '';
        this._pan = 0; // -63 to +63
        this._patch = '';
        this._disabled = false;
        this._locked = false;
        this._isVisible = true;

        // Referências locais de DOM
        this._dom = {
            card: null,
            fader: null,
            dbVal: null,
            btnOn: null,
            btnSolo: null,
            nameDisplay: null,
            meterCurtainL: null,
            meterCurtainR: null,
            peakLed: null,
            panTrack: null,
            panThumb: null,
            patchName: null,
            patchZone: null
        };

        this._observer = null;
        this._onMeterUpdate = this._handleMeterUpdate.bind(this);
    }

    connectedCallback() {
        this._parseAttributes();
        this._render();
        this._bindEvents();
        this._setupObserver();
        this._registerMeterBus();
    }

    disconnectedCallback() {
        this._unregisterMeterBus();
        if (this._observer) {
            this._observer.disconnect();
            this._observer = null;
        }
    }

    attributeChangedCallback(name, oldValue, newValue) {
        if (oldValue === newValue) return;
        if (this.isConnected) {
            this._parseAttributes();
            this._render();
            this._registerMeterBus();
        }
    }

    _parseAttributes() {
        const rawCh = this.getAttribute('data-ch');
        this._ch = rawCh === 'master' ? 52 : parseInt(rawCh || '0', 10);
        this._preset = this.getAttribute('preset') || 'input';
        this._layout = this.getAttribute('layout') || (document.body.classList.contains('layout-desktop-mode') ? 'desktop' : 'mobile');
        const rawPartner = this.getAttribute('data-partner-ch');
        this._partnerCh = rawPartner !== null ? parseInt(rawPartner, 10) : null;
        this._disabled = this.hasAttribute('disabled');
        this._locked = this.hasAttribute('locked');
        if (this.hasAttribute('patch')) this._patch = this.getAttribute('patch') || '';
        if (this.hasAttribute('pan')) this._pan = parseInt(this.getAttribute('pan') || '0', 10);
    }

    // ==========================================
    // Setters Reativos de Alta Frequência
    // ==========================================
    get value() { return this._value; }
    set value(val) {
        this._value = val;
        if (this._dom.fader) this._dom.fader.value = val;
        if (this._dom.dbVal) {
            this._dom.dbVal.textContent = rawToDb(val, this._layout === 'mobile', this._ch === 52);
        }
    }

    get on() { return this._on; }
    set on(state) {
        this._on = Boolean(state);
        if (this._dom.btnOn) {
            this._dom.btnOn.classList.toggle('on-active', this._on);
        }
        if (this._dom.card) {
            this._dom.card.classList.toggle('desk-on-bg', this._on);
        }
    }

    get solo() { return this._solo; }
    set solo(state) {
        this._solo = Boolean(state);
        if (this._dom.btnSolo) {
            this._dom.btnSolo.classList.toggle('solo-active', this._solo);
        }
    }

    get name() { return this._name; }
    set name(str) {
        this._name = str || '';
        if (this._dom.nameDisplay) {
            this._dom.nameDisplay.textContent = this._name;
        }
    }

    get pan() { return this._pan; }
    set pan(val) {
        this._pan = Math.max(-63, Math.min(63, parseInt(val || '0', 10)));
        this._updatePanUI();
    }

    get patch() { return this._patch; }
    set patch(str) {
        this._patch = str || '';
        if (this._dom.patchName) {
            this._dom.patchName.textContent = this._patch || '--';
        }
    }

    get locked() { return this._locked; }
    set locked(val) {
        this._locked = Boolean(val);
        if (this._locked) {
            this.setAttribute('locked', '');
            if (this._dom.card) this._dom.card.classList.add('channel-locked');
        } else {
            this.removeAttribute('locked');
            if (this._dom.card) this._dom.card.classList.remove('channel-locked');
        }
    }

    get disabled() { return this._disabled; }
    set disabled(val) {
        this._disabled = Boolean(val);
        if (this._disabled) {
            this.setAttribute('disabled', '');
            if (this._dom.card) this._dom.card.classList.add('strip-disabled');
            if (this._dom.fader) this._dom.fader.disabled = true;
        } else {
            this.removeAttribute('disabled');
            if (this._dom.card) this._dom.card.classList.remove('strip-disabled');
            if (this._dom.fader) this._dom.fader.disabled = false;
        }
    }

    _updatePanUI() {
        if (!this._dom.panThumb) return;
        const pct = ((this._pan + 63) / 126) * 100;
        this._dom.panThumb.style.left = `${pct}%`;
        if (this._pan === 0) {
            this._dom.panThumb.classList.add('pan-center');
        } else {
            this._dom.panThumb.classList.remove('pan-center');
        }
    }

    // ==========================================
    // Inscrição no MeterBus e Observer
    // ==========================================
    _registerMeterBus() {
        MeterBus.register(this._ch, this._onMeterUpdate);
        if (this._partnerCh !== null) {
            MeterBus.register(this._partnerCh, (level, now) => {
                if (this._dom.meterCurtainR && this._isVisible) {
                    this._dom.meterCurtainR.style.transform = `scaleY(${1 - (level / 100)})`;
                }
            });
        }
    }

    _unregisterMeterBus() {
        MeterBus.unregister(this._ch, this._onMeterUpdate);
        if (this._partnerCh !== null) {
            MeterBus.unregister(this._partnerCh);
        }
    }

    _handleMeterUpdate(level, now) {
        if (!this._isVisible) return;

        if (this._dom.meterCurtainL) {
            this._dom.meterCurtainL.style.transform = `scaleY(${1 - (level / 100)})`;
        }

        if (this._dom.peakLed) {
            if (level >= 98) {
                this._dom.peakLed.classList.add('active');
            } else {
                this._dom.peakLed.classList.remove('active');
            }
        }
    }

    _setupObserver() {
        if (this._observer) this._observer.disconnect();

        this._observer = new IntersectionObserver((entries) => {
            for (const entry of entries) {
                this._isVisible = entry.isIntersecting;
            }
        }, {
            root: null,
            rootMargin: '100px',
            threshold: 0.01
        });

        this._observer.observe(this);
    }

    // ==========================================
    // Renderização da Escala de dB
    // ==========================================
    _renderDbScale(isMaster) {
        const marks = isMaster ? [
            { d: 0, l: '0' },
            { d: -2.5, l: '' },
            { d: -5, l: '5' },
            { d: -7.5, l: '' },
            { d: -10, l: '10' },
            { d: -12.5, l: '' },
            { d: -15, l: '15' },
            { d: -17.5, l: '' },
            { d: -20, l: '20' },
            { d: -25, l: '25' },
            { d: -30, l: '30' },
            { d: -40, l: '40' },
            { d: -50, l: '50' },
            { d: -60, l: '60' },
            { d: -138, l: '-∞' }
        ] : [
            { d: 10, l: '+10' },
            { d: 7.5, l: '' },
            { d: 5, l: '5' },
            { d: 2.5, l: '' },
            { d: 0, l: '0' },
            { d: -2.5, l: '' },
            { d: -5, l: '5' },
            { d: -7.5, l: '' },
            { d: -10, l: '10' },
            { d: -12.5, l: '' },
            { d: -15, l: '15' },
            { d: -17.5, l: '' },
            { d: -20, l: '20' },
            { d: -25, l: '' },
            { d: -30, l: '30' },
            { d: -40, l: '40' },
            { d: -50, l: '50' },
            { d: -60, l: '' },
            { d: -138, l: '-∞' }
        ];

        let html = '<div class="desk-db-scale">';
        marks.forEach(m => {
            let r;
            if (m.l === '-∞') r = 0;
            else r = dbToRaw(isMaster ? m.d + 10 : m.d);
            const p = (r / 1023) * 100;
            html += `<div class="desk-db-item" style="bottom: ${p}%">${m.l ? `<span>${m.l}</span>` : ''}<div class="tick ${m.l ? '' : 'tick-small'}"></div></div>`;
        });
        html += '</div>';
        return html;
    }

    // ==========================================
    // Renderização do Template Light DOM
    // ==========================================
    _render() {
        const isMaster = this._ch === 52 || this._preset === 'master';
        const isPaired = this._partnerCh !== null;
        let labelText = isMaster ? 'MASTER' : `${typeof this._ch === 'number' ? (this._ch + 1) : this._ch}`;

        // Se for canal pareado estéreo (ex: 21 + 22)
        if (isPaired && !isMaster && typeof this._ch === 'number') {
            labelText = `${this._ch + 1} + ${this._partnerCh + 1}`;
        }

        const state = getChannelStateById(this._ch) || {};

        if (!this.hasAttribute('patch')) {
            this._patch = state.patch ? `AD ${state.patch}` : (state.defaultPatch || `AD ${this._ch + 1}`);
        }
        if (!this.hasAttribute('pan')) {
            this._pan = state.pan !== undefined ? state.pan : 0;
        }

        this._value = state.value !== undefined ? state.value : 0;
        this._on = Boolean(state.on);
        this._solo = Boolean(state.solo);
        this._name = state.name || (isMaster ? 'MASTER' : '');

        const isMobile = this._layout === 'mobile';
        const dbText = rawToDb(this._value, isMobile, isMaster);
        const panPct = ((this._pan + 63) / 126) * 100;

        // Determina grupo de cores do canal
        let groupClass = 'fader-group-1';
        if (typeof this._ch === 'number') {
            if (this._ch >= 16 && this._ch <= 31) groupClass = 'fader-group-2';
            else if (this._ch >= 60 && this._ch <= 67) groupClass = 'fader-group-st';
            else if (this._ch >= 36 && this._ch <= 43) groupClass = 'fader-group-mix';
            else if (this._ch >= 44 && this._ch <= 51) groupClass = 'fader-group-bus';
        }

        if (isMobile) {
            // Template Mobile (Full Card com VU de Fundo)
            this.innerHTML = `
                <div class="fader-card ${groupClass} ${isMaster ? 'master-card' : ''} ${this._disabled ? 'strip-disabled' : ''} ${this._locked ? 'channel-locked' : ''}" data-ch="${this._ch}">
                    ${isPaired ? `
                        <div class="mobile-meter-bg left"><div class="mobile-meter-curtain meter-curtain-l"></div></div>
                        <div class="mobile-meter-bg right"><div class="mobile-meter-curtain meter-curtain-r"></div></div>
                    ` : `
                        <div class="mobile-meter-bg"><div class="mobile-meter-curtain meter-curtain-l"></div></div>
                    `}

                    <div class="ch-clickable-zone top">
                        <h2 class="card-title">${isMaster ? 'STEREO' : `CH ${labelText}`}</h2>
                        <div class="ch-name desk-ch-name">${this._name}</div>
                    </div>

                    <button class="btn-state btn-cue ${this._solo ? 'solo-active' : ''}" ${isMaster ? 'disabled' : ''}>SOLO</button>

                    <button class="btn-state btn-on-desk ${this._on ? 'on-active' : ''}">ON</button>

                    <div class="nudge-zone">
                        <button class="btn-nudge btn-nudge-plus pointer-none">+</button>
                    </div>

                    <div class="fader-rotated-container">
                        <input type="range" min="0" max="1023" value="${this._value}" class="fader-input" orient="vertical" ${this._disabled || this._locked ? 'disabled' : ''}>
                    </div>

                    <div class="ch-clickable-zone bottom mt-auto">
                        <div class="nudge-zone">
                            <button class="btn-nudge btn-nudge-minus pointer-none">-</button>
                            <h1 class="fader-val db-val-text">${dbText}</h1>
                        </div>
                    </div>

                    ${this._locked ? `
                    <div class="channel-lock-overlay">
                        <svg class="lock-icon" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#ff4444" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                            <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                        </svg>
                    </div>
                    ` : ''}
                </div>
            `;
        } else {
            // Template Desktop (Fader Card de Mesa 01v96)
            this.innerHTML = `
                <div class="fader-card-desktop ${groupClass} ${isMaster ? 'master-card-desktop' : ''} ${this._disabled ? 'strip-disabled' : ''} ${this._locked ? 'channel-locked' : ''}" data-ch="${this._ch}">
                    <!-- Header / Label -->
                    <div class="desk-label-wrapper">
                        <div class="desk-label">${labelText}</div>
                        ${!isMaster ? `
                        <div class="desk-label-lock" title="Travar/Destravar canal">
                            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                                <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                            </svg>
                        </div>
                        ` : ''}
                    </div>

                    <!-- Botão SOLO (Master tem botão SOLO que serve para SOLO CLEAR) -->
                    <button class="btn-cue ${this._solo ? 'solo-active' : ''}" ${isMaster ? 'id="master-solo-btn" disabled' : ''}>SOLO</button>

                    <!-- Visor LCD de Nome -->
                    <div class="desk-ch-name-zone">
                        <div class="desk-ch-name">${this._name}</div>
                    </div>

                    <!-- Botão ON -->
                    <button class="btn-on-desk ${this._on ? 'on-active' : ''}">ON</button>

                    <!-- Botão Nudge (+) -->
                    <div class="nudge-zone-desk">
                        <button class="btn-nudge-desk btn-nudge-plus">+</button>
                    </div>

                    <!-- Display de Valor dB -->
                    <div class="desk-db-val">
                        <span class="db-val-text">${dbText}</span>
                    </div>

                    <!-- Fader Track + Escala dB + VU Meter -->
                    <div class="desk-fader-container">
                        ${this._renderDbScale(isMaster)}

                        <input type="range" min="0" max="1023" value="${this._value}" class="fader-input" orient="vertical" ${this._disabled || this._locked ? 'disabled' : ''}>

                        <div class="desk-meter-container">
                            <div class="desk-peak-led"></div>
                            <div class="desk-meter-wrap">
                                <div class="desk-meter-track">
                                    <div class="desk-meter-curtain meter-curtain-l"></div>
                                </div>
                                ${isPaired ? `
                                <div class="desk-meter-track">
                                    <div class="desk-meter-curtain meter-curtain-r"></div>
                                </div>
                                ` : ''}
                            </div>
                        </div>
                    </div>

                    <!-- Botão Nudge (-) -->
                    <div class="nudge-zone-desk">
                        <button class="btn-nudge-desk btn-nudge-minus">-</button>
                    </div>

                    <!-- Indicador de Pan -->
                    ${!isMaster ? `
                    <div class="desk-pan-indicator" title="Clique duplo: centro | Roda do mouse ou arraste: ajustar pan">
                        <span class="desk-pan-l">L</span>
                        <div class="desk-pan-tracks-container">
                            <div class="desk-pan-track" data-pan-ch="${this._ch}">
                                <div class="desk-pan-center-tick"></div>
                                <div class="desk-pan-thumb ${this._pan === 0 ? 'pan-center' : ''}" style="left: ${panPct}%;"></div>
                            </div>
                            ${isPaired ? `
                            <div class="desk-pan-track" data-pan-ch="${this._partnerCh}">
                                <div class="desk-pan-center-tick"></div>
                                <div class="desk-pan-thumb ${this._pan === 0 ? 'pan-center' : ''}" style="left: ${panPct}%;"></div>
                            </div>
                            ` : ''}
                        </div>
                        <span class="desk-pan-r">R</span>
                    </div>
                    ` : ''}

                    <!-- Rodapé de Patch -->
                    ${!isMaster ? `
                    <div class="desk-patch-zone">
                        <span class="desk-patch-name">${this._patch || '--'}</span>
                    </div>
                    ` : ''}

                    ${this._locked ? `
                    <div class="channel-lock-overlay">
                        <svg class="lock-icon" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#ff4444" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                            <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                        </svg>
                    </div>
                    ` : ''}
                </div>
            `;
        }

        // Coleta de referências locais
        this._dom.card = this.querySelector('.fader-card-desktop') || this.querySelector('.fader-card');
        this._dom.fader = this.querySelector('.fader-input');
        this._dom.dbVal = this.querySelector('.db-val-text');
        this._dom.btnOn = this.querySelector('.btn-on-desk');
        this._dom.btnSolo = this.querySelector('.btn-cue');
        this._dom.nameDisplay = this.querySelector('.desk-ch-name');
        this._dom.meterCurtainL = this.querySelector('.meter-curtain-l');
        this._dom.meterCurtainR = this.querySelector('.meter-curtain-r');
        this._dom.peakLed = this.querySelector('.desk-peak-led');
        this._dom.panTrack = this.querySelector('.desk-pan-track');
        this._dom.panThumb = this.querySelector('.desk-pan-thumb');
        this._dom.patchName = this.querySelector('.desk-patch-name');
        this._dom.patchZone = this.querySelector('.desk-patch-zone');
    }

    // ==========================================
    // Eventos e Interações
    // ==========================================
    _bindEvents() {
        if (this._dom.fader) {
            this._dom.fader.addEventListener('input', (e) => {
                const newVal = parseInt(e.target.value, 10);
                this.value = newVal;
                emit('control', {
                    type: this._ch === 52 ? 'kStereoFader/kFader' : 'kInputFader/kFader',
                    channel: this._ch,
                    value: newVal
                });
            });
        }

        if (this._dom.btnOn) {
            this._dom.btnOn.addEventListener('click', () => {
                const nextOn = !this._on;
                this.on = nextOn;
                emit('control', {
                    type: this._ch === 52 ? 'kStereoChannelOn/kChannelOn' : 'kInputChannelOn/kChannelOn',
                    channel: this._ch,
                    value: nextOn ? 1 : 0
                });
            });
        }

        if (this._dom.btnSolo && this._ch !== 52) {
            this._dom.btnSolo.addEventListener('click', () => {
                const nextSolo = !this._solo;
                this.solo = nextSolo;
                emit('control', {
                    type: 'kSetupSoloChOn/kSoloChOn',
                    channel: this._ch,
                    value: nextSolo ? 1 : 0
                });
            });
        }

        const btnPlus = this.querySelector('.btn-nudge-plus');
        if (btnPlus) {
            btnPlus.addEventListener('click', () => {
                const nextRaw = getSteppedRaw(this._value, 1, 0.5);
                this.value = nextRaw;
                emit('control', {
                    type: this._ch === 52 ? 'kStereoFader/kFader' : 'kInputFader/kFader',
                    channel: this._ch,
                    value: nextRaw
                });
            });
        }

        const btnMinus = this.querySelector('.btn-nudge-minus');
        if (btnMinus) {
            btnMinus.addEventListener('click', () => {
                const nextRaw = getSteppedRaw(this._value, -1, 0.5);
                this.value = nextRaw;
                emit('control', {
                    type: this._ch === 52 ? 'kStereoFader/kFader' : 'kInputFader/kFader',
                    channel: this._ch,
                    value: nextRaw
                });
            });
        }

        if (this._dom.panTrack) {
            this._dom.panTrack.addEventListener('dblclick', () => {
                this.pan = 0;
                emit('control', {
                    type: 'kInputPan/kPan',
                    channel: this._ch,
                    value: 0
                });
            });

            // Arraste interativo de Pan via PointerEvents
            let isDraggingPan = false;
            const handlePanDrag = (e) => {
                const rect = this._dom.panTrack.getBoundingClientRect();
                const x = e.clientX - rect.left;
                const ratio = Math.max(0, Math.min(1, x / rect.width));
                const panVal = Math.round((ratio * 126) - 63);
                this.pan = panVal;
                emit('control', {
                    type: 'kInputPan/kPan',
                    channel: this._ch,
                    value: panVal
                });
            };

            this._dom.panTrack.addEventListener('pointerdown', (e) => {
                isDraggingPan = true;
                this._dom.panTrack.setPointerCapture(e.pointerId);
                handlePanDrag(e);
            });

            this._dom.panTrack.addEventListener('pointermove', (e) => {
                if (isDraggingPan) handlePanDrag(e);
            });

            const stopPanDrag = (e) => {
                if (isDraggingPan) {
                    isDraggingPan = false;
                    try { this._dom.panTrack.releasePointerCapture(e.pointerId); } catch (_) {}
                }
            };

            this._dom.panTrack.addEventListener('pointerup', stopPanDrag);
            this._dom.panTrack.addEventListener('pointercancel', stopPanDrag);

            // Ajuste de Pan pela roda do mouse
            this._dom.panTrack.parentElement.addEventListener('wheel', (e) => {
                e.preventDefault();
                const delta = e.deltaY < 0 ? 2 : -2;
                const nextPan = Math.max(-63, Math.min(63, this._pan + delta));
                this.pan = nextPan;
                emit('control', {
                    type: 'kInputPan/kPan',
                    channel: this._ch,
                    value: nextPan
                });
            }, { passive: false });
        }
    }
}

// Registro oficial do Custom Element
if (typeof customElements !== 'undefined' && !customElements.get('channel-strip')) {
    customElements.define('channel-strip', ChannelStripComponent);
}

// Presets Declarativos Estáticos
ChannelStripComponent.presets = {
    mainInput: (ch, options = {}) => {
        const el = document.createElement('channel-strip');
        el.setAttribute('data-ch', ch);
        el.setAttribute('preset', 'input');
        if (options.partnerCh !== undefined) el.setAttribute('data-partner-ch', options.partnerCh);
        if (options.patch) el.setAttribute('patch', options.patch);
        if (options.pan !== undefined) el.setAttribute('pan', options.pan);
        if (options.disabled) el.setAttribute('disabled', '');
        return el;
    },
    master: (options = {}) => {
        const el = document.createElement('channel-strip');
        el.setAttribute('data-ch', 'master');
        el.setAttribute('preset', 'master');
        return el;
    },
    output: (outId, options = {}) => {
        const el = document.createElement('channel-strip');
        el.setAttribute('data-ch', outId);
        el.setAttribute('preset', 'output');
        if (options.patch) el.setAttribute('patch', options.patch);
        return el;
    },
    mini: (ch, options = {}) => {
        const el = document.createElement('channel-strip');
        el.setAttribute('data-ch', ch);
        el.setAttribute('preset', 'mini');
        return el;
    }
};
