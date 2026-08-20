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
        return ['data-ch', 'preset', 'layout', 'data-partner-ch', 'disabled', 'patch', 'pan', 'partner-pan', 'locked', 'pre-post', 'data-aux-idx'];
    }

    constructor() {
        super();
        this._ch = 0;
        this._auxIdx = 1;
        this._preset = 'input'; // 'input' | 'master' | 'output' | 'auxSend' | 'mini'
        this._layout = 'desktop'; // 'desktop' | 'mobile'
        this._partnerCh = null;
        this._value = 0;
        this._on = false;
        this._solo = false;
        this._prePost = 'post'; // 'pre' | 'post'
        this._name = '';
        this._pan = 0; // -63 to +63
        this._partnerPan = 0; // -63 to +63
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
            btnPrePost: null,
            deskLabel: null,
            nameDisplay: null,
            meterCurtainL: null,
            meterCurtainR: null,
            peakLed: null,
            panContainer: null,
            panTrack: null,
            panThumb: null,
            partnerPanTrack: null,
            partnerPanThumb: null,
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
            this._bindEvents();
            this._registerMeterBus();
        }
    }

    _parseAttributes() {
        const rawCh = this.getAttribute('data-ch');
        this._ch = rawCh === 'master' ? 52 : parseInt(rawCh || '0', 10);
        this._auxIdx = parseInt(this.getAttribute('data-aux-idx') || '1', 10);
        this._preset = this.getAttribute('preset') || 'input';
        this._layout = this.getAttribute('layout') || (document.body.classList.contains('layout-desktop-mode') ? 'desktop' : 'mobile');
        const rawPartner = this.getAttribute('data-partner-ch');
        this._partnerCh = rawPartner !== null ? parseInt(rawPartner, 10) : null;
        this._disabled = this.hasAttribute('disabled');
        this._locked = this.hasAttribute('locked');
        this._prePost = (this.getAttribute('pre-post') || 'post').toLowerCase();
        if (this.hasAttribute('patch')) this._patch = this.getAttribute('patch') || '';
        if (this.hasAttribute('pan')) this._pan = parseInt(this.getAttribute('pan') || '0', 10);
        if (this.hasAttribute('partner-pan')) this._partnerPan = parseInt(this.getAttribute('partner-pan') || '0', 10);
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
        if (this._dom.deskLabel) {
            this._dom.deskLabel.classList.toggle('label-on', this._on);
        }
    }

    get solo() { return this._solo; }
    set solo(state) {
        this._solo = Boolean(state);
        if (this._dom.btnSolo) {
            this._dom.btnSolo.classList.toggle('solo-active', this._solo);
        }
    }

    get prePost() { return this._prePost; }
    set prePost(val) {
        const isPre = (val === 'pre' || val === true || val === 1);
        this._prePost = isPre ? 'pre' : 'post';
        if (this._dom.btnPrePost) {
            this._dom.btnPrePost.classList.toggle('pre-active', isPre);
            this._dom.btnPrePost.textContent = isPre ? 'PRE' : 'POST';
            this._dom.btnPrePost.title = isPre ? 'PRE (Pre-Fader)' : 'POST (Post-Fader)';
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

    get partnerPan() { return this._partnerPan; }
    set partnerPan(val) {
        this._partnerPan = Math.max(-63, Math.min(63, parseInt(val || '0', 10)));
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
        if (this._dom.panThumb) {
            const pct = ((this._pan + 63) / 126) * 100;
            this._dom.panThumb.style.left = `${pct}%`;
            if (this._pan === 0) {
                this._dom.panThumb.classList.add('pan-center');
            } else {
                this._dom.panThumb.classList.remove('pan-center');
            }
        }
        if (this._dom.partnerPanThumb) {
            const partnerPct = ((this._partnerPan + 63) / 126) * 100;
            this._dom.partnerPanThumb.style.left = `${partnerPct}%`;
            if (this._partnerPan === 0) {
                this._dom.partnerPanThumb.classList.add('pan-center');
            } else {
                this._dom.partnerPanThumb.classList.remove('pan-center');
            }
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
        const isAuxSend = this._preset === 'auxSend';
        const isPaired = this._partnerCh !== null;
        const isPre = this._prePost === 'pre';
        let labelText = isMaster ? 'MASTER' : (isAuxSend ? `AUX ${this._auxIdx}` : `${typeof this._ch === 'number' ? (this._ch + 1) : this._ch}`);

        // Se for canal pareado estéreo (ex: 21 + 22)
        if (isPaired && !isMaster && typeof this._ch === 'number') {
            labelText = `${this._ch + 1} + ${this._partnerCh + 1}`;
        }

        const state = getChannelStateById(this._ch) || {};
        const partnerState = isPaired ? (getChannelStateById(this._partnerCh) || {}) : {};

        if (!this.hasAttribute('patch')) {
            this._patch = state.patch ? `AD ${state.patch}` : (state.defaultPatch || `AD ${this._ch + 1}`);
        }
        if (!this.hasAttribute('pan')) {
            this._pan = state.pan !== undefined ? state.pan : 0;
        }
        if (!this.hasAttribute('partner-pan') && isPaired) {
            this._partnerPan = partnerState.pan !== undefined ? partnerState.pan : 0;
        }

        // Preserva valores se já definidos localmente (ex: via setter no test harness / runtime)
        if (this._value === 0 && state.value !== undefined) {
            this._value = isAuxSend ? ((state[`aux${this._auxIdx}`] !== undefined) ? state[`aux${this._auxIdx}`] : 0) : (state.value !== undefined ? state.value : 0);
        }
        if (!this._name && state.name) {
            this._name = state.name;
        }

        const isMobile = this._layout === 'mobile';
        const dbText = rawToDb(this._value, isMobile, isMaster);
        const panPct = ((this._pan + 63) / 126) * 100;
        const partnerPanPct = ((this._partnerPan + 63) / 126) * 100;

        // Determina grupo de cores do canal
        let groupClass = 'fader-group-1';
        if (isMaster) {
            groupClass = 'fader-group-master';
        } else if (isAuxSend) {
            groupClass = 'fader-group-aux-send';
        } else if (typeof this._ch === 'number') {
            if (this._ch >= 16 && this._ch <= 31) groupClass = 'fader-group-2';
            else if (this._ch >= 60 && this._ch <= 67) groupClass = 'fader-group-st';
            else if (this._ch >= 36 && this._ch <= 43) groupClass = 'fader-group-mix';
            else if (this._ch >= 44 && this._ch <= 51) groupClass = 'fader-group-bus';
        }

        if (isMobile) {
            // Template Mobile (Full Card com VU de Fundo)
            this.innerHTML = `
                <div class="fader-card ${groupClass} ${isMaster ? 'master-card' : ''} ${this._disabled ? 'strip-disabled' : ''} ${this._locked ? 'channel-locked' : ''} ${this._on ? 'on-active-card' : ''}" data-ch="${this._ch}">
                    ${isPaired ? `
                        <div class="mobile-meter-bg left"><div class="mobile-meter-curtain meter-curtain-l"></div></div>
                        <div class="mobile-meter-bg right"><div class="mobile-meter-curtain meter-curtain-r"></div></div>
                    ` : `
                        <div class="mobile-meter-bg"><div class="mobile-meter-curtain meter-curtain-l"></div></div>
                    `}

                    <div class="ch-clickable-zone top">
                        <h2 class="card-title">${isMaster ? 'STEREO' : (isAuxSend ? `AUX ${this._auxIdx}` : `CH ${labelText}`)}</h2>
                        <div class="ch-name desk-ch-name">${this._name}</div>
                    </div>

                    ${isAuxSend ? `
                    <button class="btn-pre-post ${isPre ? 'pre-active' : ''}" title="${isPre ? 'PRE (Pre-Fader)' : 'POST (Post-Fader)'}">${isPre ? 'PRE' : 'POST'}</button>
                    ` : `
                    <button class="btn-state btn-cue ${this._solo ? 'solo-active' : ''}" ${isMaster ? 'disabled' : ''}>SOLO</button>
                    `}

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
                <div class="fader-card-desktop ${groupClass} ${isMaster ? 'master-card-desktop' : ''} ${this._disabled ? 'strip-disabled' : ''} ${this._locked ? 'channel-locked' : ''} ${this._on ? 'desk-on-bg' : ''}" data-ch="${this._ch}">
                    <!-- Header / Label -->
                    <div class="desk-label-wrapper">
                        <div class="desk-label ${this._on ? 'label-on' : ''}">${labelText}</div>
                        ${!isMaster && !isAuxSend ? `
                        <div class="desk-label-lock" title="Travar/Destravar canal">
                            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                                <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                            </svg>
                        </div>
                        ` : ''}
                    </div>

                    <!-- Slot Ação Superior: PRE/POST para AuxSend ou SOLO para canais normais -->
                    ${isAuxSend ? `
                    <button class="btn-pre-post ${isPre ? 'pre-active' : ''}" title="${isPre ? 'PRE (Pre-Fader)' : 'POST (Post-Fader)'}">${isPre ? 'PRE' : 'POST'}</button>
                    ` : `
                    <button class="btn-cue ${this._solo ? 'solo-active' : ''}" ${isMaster ? 'id="master-solo-btn" disabled' : ''}>SOLO</button>
                    `}

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
                            <div class="desk-meter-tracks-wrap">
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
                                <div class="desk-pan-thumb desk-pan-thumb-partner ${this._partnerPan === 0 ? 'pan-center' : ''}" style="left: ${partnerPanPct}%;"></div>
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
        this._dom.btnPrePost = this.querySelector('.btn-pre-post');
        this._dom.deskLabel = this.querySelector('.desk-label');
        this._dom.nameDisplay = this.querySelector('.desk-ch-name');
        this._dom.meterCurtainL = this.querySelector('.meter-curtain-l');
        this._dom.meterCurtainR = this.querySelector('.meter-curtain-r');
        this._dom.peakLed = this.querySelector('.desk-peak-led');
        this._dom.panContainer = this.querySelector('.desk-pan-tracks-container');
        this._dom.panTrack = this.querySelector('.desk-pan-track[data-pan-ch="' + this._ch + '"]') || this.querySelector('.desk-pan-track');
        this._dom.panThumb = this._dom.panTrack ? this._dom.panTrack.querySelector('.desk-pan-thumb') : null;
        if (isPaired && this._partnerCh !== null) {
            this._dom.partnerPanTrack = this.querySelector('.desk-pan-track[data-pan-ch="' + this._partnerCh + '"]');
            this._dom.partnerPanThumb = this._dom.partnerPanTrack ? this._dom.partnerPanTrack.querySelector('.desk-pan-thumb') : null;
        } else {
            this._dom.partnerPanTrack = null;
            this._dom.partnerPanThumb = null;
        }
        this._dom.patchName = this.querySelector('.desk-patch-name');
        this._dom.patchZone = this.querySelector('.desk-patch-zone');
    }

    // ==========================================
    // Eventos e Interações
    // ==========================================
    _bindEvents() {
        if (this._dom.fader) {
            // Proteção estilo mesa física: impede salto do fader ao clicar no trilho
            const restrictSliderTrackTap = (e) => {
                const input = e.target;
                const rect = input.getBoundingClientRect();
                const isVertical = input.getAttribute('orient') === 'vertical' ||
                    input.clientHeight > input.clientWidth ||
                    (window.getComputedStyle(input).writingMode || "").includes('vertical');

                const min = parseFloat(input.min || 0);
                const max = parseFloat(input.max || 1023);
                let val = parseFloat(input.value);
                if (isNaN(val)) val = 0;
                const percent = (val - min) / (max - min);

                const clientY = (e.touches && e.touches.length > 0) ? e.touches[0].clientY : e.clientY;
                const clientX = (e.touches && e.touches.length > 0) ? e.touches[0].clientX : e.clientX;

                let clickPosPx, thumbPosPx;
                let threshold;

                if (isVertical) {
                    const thumbSize = 40;
                    clickPosPx = clientY - rect.top;
                    thumbPosPx = (1 - percent) * (rect.height - thumbSize) + thumbSize / 2;
                    threshold = thumbSize / 2 + 10;
                } else {
                    clickPosPx = clientX - rect.left;
                    thumbPosPx = percent * rect.width;
                    threshold = 45;
                }

                const distance = Math.abs(clickPosPx - thumbPosPx);

                if (distance > threshold) {
                    if (e.type === 'pointerdown') {
                        e.preventDefault();
                    }
                    if (e.type === 'touchstart' || e.pointerType === 'touch') {
                        input.disabled = true;
                        setTimeout(() => { input.disabled = false; }, 600);
                    }
                }
            };

            this._dom.fader.addEventListener('pointerdown', restrictSliderTrackTap, { capture: true });
            this._dom.fader.addEventListener('touchstart', restrictSliderTrackTap, { capture: true, passive: true });

            this._dom.fader.addEventListener('input', (e) => {
                const newVal = parseInt(e.target.value, 10);
                this.value = newVal;
                if (this._preset === 'auxSend') {
                    emit('control', {
                        type: `kInputAUX/kAUX${this._auxIdx}Level`,
                        channel: this._ch,
                        value: newVal
                    });
                } else {
                    emit('control', {
                        type: this._ch === 52 ? 'kStereoFader/kFader' : 'kInputFader/kFader',
                        channel: this._ch,
                        value: newVal
                    });
                }
            });
        }

        if (this._dom.btnOn) {
            this._dom.btnOn.addEventListener('click', () => {
                const nextOn = !this._on;
                this.on = nextOn;
                if (this._preset === 'auxSend') {
                    emit('control', {
                        type: `kInputAUX/kAUX${this._auxIdx}On`,
                        channel: this._ch,
                        value: nextOn ? 1 : 0
                    });
                } else {
                    emit('control', {
                        type: this._ch === 52 ? 'kStereoChannelOn/kChannelOn' : 'kInputChannelOn/kChannelOn',
                        channel: this._ch,
                        value: nextOn ? 1 : 0
                    });
                }
            });
        }

        if (this._dom.btnPrePost) {
            this._dom.btnPrePost.addEventListener('click', (e) => {
                e.stopPropagation();
                const nextPre = this._prePost !== 'pre';
                this.prePost = nextPre;
                emit('control', {
                    type: `kInputAUX/kAUX${this._auxIdx}Pre`,
                    channel: this._ch,
                    value: nextPre ? 1 : 0
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
                if (this._preset === 'auxSend') {
                    emit('control', {
                        type: `kInputAUX/kAUX${this._auxIdx}Level`,
                        channel: this._ch,
                        value: nextRaw
                    });
                } else {
                    emit('control', {
                        type: this._ch === 52 ? 'kStereoFader/kFader' : 'kInputFader/kFader',
                        channel: this._ch,
                        value: nextRaw
                    });
                }
            });
        }

        const btnMinus = this.querySelector('.btn-nudge-minus');
        if (btnMinus) {
            btnMinus.addEventListener('click', () => {
                const nextRaw = getSteppedRaw(this._value, -1, 0.5);
                this.value = nextRaw;
                if (this._preset === 'auxSend') {
                    emit('control', {
                        type: `kInputAUX/kAUX${this._auxIdx}Level`,
                        channel: this._ch,
                        value: nextRaw
                    });
                } else {
                    emit('control', {
                        type: this._ch === 52 ? 'kStereoFader/kFader' : 'kInputFader/kFader',
                        channel: this._ch,
                        value: nextRaw
                    });
                }
            });
        }

        const panIndicator = this.querySelector('.desk-pan-indicator');
        if (panIndicator) {
            let panLongPressTimeout = null;
            let isPanDragging = false;
            let panPressStartTime = 0;
            let panTargetTrack = this._dom.panTrack;
            let panTargetCh = this._ch;

            const getTargetTrackFromEvent = (e) => {
                let track = e.target.closest('.desk-pan-track');
                if (!track && this._dom.panContainer) {
                    const rect = this._dom.panContainer.getBoundingClientRect();
                    if (this._dom.partnerPanTrack && e.clientY > rect.top + rect.height / 2) {
                        track = this._dom.partnerPanTrack;
                    } else {
                        track = this._dom.panTrack;
                    }
                }
                return track || this._dom.panTrack;
            };

            const handlePanDrag = (e) => {
                if (!panTargetTrack) return;
                const rect = panTargetTrack.getBoundingClientRect();
                const x = e.clientX - rect.left;
                const ratio = Math.max(0, Math.min(1, x / rect.width));
                const panVal = Math.round((ratio * 126) - 63);

                if (panTargetCh === this._partnerCh) {
                    this.partnerPan = panVal;
                } else {
                    this.pan = panVal;
                }

                emit('control', {
                    type: 'kInputPan/kPan',
                    channel: panTargetCh,
                    value: panVal
                });
            };

            // Duplo clique reseta para o centro (0) o track clicado
            panIndicator.addEventListener('dblclick', (e) => {
                e.stopPropagation();
                const track = getTargetTrackFromEvent(e);
                const ch = track === this._dom.partnerPanTrack ? this._partnerCh : this._ch;
                if (ch === this._partnerCh) {
                    this.partnerPan = 0;
                } else {
                    this.pan = 0;
                }
                emit('control', {
                    type: 'kInputPan/kPan',
                    channel: ch,
                    value: 0
                });
            });

            // Pointer down com long press (>350ms) para arrasto e clique curto para BubbleModal
            panIndicator.addEventListener('pointerdown', (e) => {
                if (typeof window.BubbleModal !== 'undefined') {
                    window.BubbleModal.hide();
                }
                e.stopPropagation();
                e.preventDefault();

                if (panLongPressTimeout) clearTimeout(panLongPressTimeout);
                isPanDragging = false;
                panPressStartTime = Date.now();

                panTargetTrack = getTargetTrackFromEvent(e);
                panTargetCh = (panTargetTrack === this._dom.partnerPanTrack && this._partnerCh !== null) ? this._partnerCh : this._ch;

                const captureEl = e.currentTarget;
                panLongPressTimeout = setTimeout(() => {
                    isPanDragging = true;
                    handlePanDrag(e);
                    if (captureEl.setPointerCapture) {
                        try { captureEl.setPointerCapture(e.pointerId); } catch (_) {}
                    }
                }, 350);
            });

            panIndicator.addEventListener('pointermove', (e) => {
                if (isPanDragging) {
                    e.preventDefault();
                    handlePanDrag(e);
                }
            });

            const stopPanInteraction = (e) => {
                const duration = panPressStartTime ? (Date.now() - panPressStartTime) : 0;

                // Clique curto (<350ms): exibe a BubbleModal com a dica sem mover o valor
                if (!isPanDragging && duration > 0 && duration < 350 && this._layout === 'desktop') {
                    if (typeof window.BubbleModal !== 'undefined') {
                        window.BubbleModal.show({
                            targetEl: panTargetTrack || panIndicator,
                            message: '💡 Clique e segure para ajustar o Pan'
                        });
                    }
                }

                panPressStartTime = 0;
                if (panLongPressTimeout) {
                    clearTimeout(panLongPressTimeout);
                    panLongPressTimeout = null;
                }

                if (isPanDragging && e && e.pointerId) {
                    try {
                        if (e.currentTarget && e.currentTarget.releasePointerCapture) {
                            e.currentTarget.releasePointerCapture(e.pointerId);
                        }
                    } catch (_) {}
                }

                isPanDragging = false;
            };

            panIndicator.addEventListener('pointerup', stopPanInteraction);
            panIndicator.addEventListener('pointercancel', stopPanInteraction);

            // Ajuste de Pan pela roda do mouse
            panIndicator.addEventListener('wheel', (e) => {
                e.preventDefault();
                const delta = e.deltaY < 0 ? 2 : -2;
                const track = getTargetTrackFromEvent(e);
                const ch = (track === this._dom.partnerPanTrack && this._partnerCh !== null) ? this._partnerCh : this._ch;
                const currentPan = (ch === this._partnerCh) ? this._partnerPan : this._pan;
                const nextPan = Math.max(-63, Math.min(63, currentPan + delta));

                if (ch === this._partnerCh) {
                    this.partnerPan = nextPan;
                } else {
                    this.pan = nextPan;
                }

                emit('control', {
                    type: 'kInputPan/kPan',
                    channel: ch,
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
