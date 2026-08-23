/**
 * =========================================================================================
 * COMPONENT: ChannelStrip Universal (channel_strip.js)
 * =========================================================================================
 * Arquitetura Frontend V2 - Camada de Componentes Modulares Reutilizáveis
 *
 * Responsabilidades:
 * - Renderização e controle unificado dos Channel Strips em Desktop e Mobile.
 * - Arquitetura Canônica das 7 Zonas Modulares:
 *     1. Header (Tripartite / Slot Esquerdo + Número + Lock)
 *     2. Top Action (Solo / Cue / Pre-Post)
 *     3. Display (Visor OLED digital verde neon)
 *     4. Middle Feature (Medidores no Master / Delta dB em Macros)
 *     5. Primary Action & Nudge (Botão ON + Nudge +)
 *     6. Fader Core (Régua dB, Trilho protegido, Thumb, VU Meter 60FPS WASM, Peak LED / Cortina, Nudge -)
 *     7. Footer Routing (Panpot analógico L-C-R / Duplo Pan Estéreo + Patch Badge com marquee)
 * - Cache de nós DOM O(1) em `this.elements`.
 * - Física tátil e segurança contra saltos de volume ao tocar no trilho.
 * - Suporte nativo a Roda do Mouse (0.10 dB inputs, 0.50 dB masters/sends).
 * - Nudges finos (+/- 0.05 dB) com aceleração auto-repeat em long press.
 * - Totalmente integrável ao sistema de temas YAML (--strip-*).
 * =========================================================================================
 */

class ChannelStrip {
    /**
     * @param {Object} config Configuração declarativa do canal
     */
    constructor(config = {}) {
        this.config = Object.assign({
            id: 'ch_0',
            evtCh: 0,
            chNumber: 1,
            name: 'CH 1',
            type: 'input',              // 'input' | 'input_paired' | 'master' | 'mix' | 'bus' | 'macro'
            layout: 'desktop',          // 'desktop' | 'mobile'
            colorBand: 'blue',          // 'blue' | 'green' | 'paired_green' | 'amber' | 'cyan' | 'wine' | 'macro_silver'
            faderValue: 0,              // 0 a 1023
            dbValue: '-∞',
            onState: false,
            soloState: false,
            isLocked: false,
            isDisabled: false,
            isPaired: false,
            isMaster: false,
            partnerId: null,
            panL: 0,                    // -63 a +63 (ou -32 a +32)
            panR: null,
            patch: '--',
            prePost: null,              // 'PRE' | 'POST' | null
            mode: 'channel',            // 'channel' | 'macro'
            deltaDb: '--',
            hasResetBtn: false,
            callbacks: {}
        }, config);

        this.element = null;
        this.elements = {};
        this.deltaDbVal = 0;
        this.deltaResetTimer = null;
        this.nudgeTimer = null;
        this.nudgeInterval = null;
        this.peakHoldTimerL = null;
        this.peakHoldTimerR = null;
        this.isDragging = false;
        this.dragStartY = 0;
        this.dragStartVal = 0;
    }

    /**
     * Renderiza o nó DOM do Channel Strip com cache O(1)
     * @returns {HTMLElement}
     */
    render() {
        const cfg = this.config;
        const isDesktop = cfg.layout === 'desktop';

        const wrapper = document.createElement('div');
        wrapper.id = `strip_${cfg.id}`;
        const isMaster = cfg.isMaster || cfg.type === 'master';
        wrapper.className = [
            'channel-strip-wrapper',
            isDesktop ? 'desk-strip' : 'mob-strip',
            cfg.isPaired ? 'paired-channel' : '',
            isMaster ? 'is-master' : '',
            cfg.isLocked ? 'is-locked' : '',
            cfg.isDisabled ? 'is-disabled' : '',
            cfg.colorBand ? `band-${cfg.colorBand}` : '',
            cfg.customClass || ''
        ].filter(Boolean).join(' ');

        wrapper.dataset.id = cfg.id;
        wrapper.dataset.ch = cfg.evtCh;
        wrapper.dataset.layout = cfg.layout;
        wrapper.dataset.type = cfg.type;

        wrapper.innerHTML = isDesktop ? this._buildDesktopHTML() : this._buildMobileHTML();

        this.element = wrapper;
        this._cacheElements();
        this._bindEvents();

        requestAnimationFrame(() => this._checkMarquee());

        return wrapper;
    }

    /**
     * Constrói o HTML Desktop das 7 Zonas Modulares
     * @private
     */
    _buildDesktopHTML() {
        const cfg = this.config;
        const isMacro = cfg.mode === 'macro' || (cfg.type && cfg.type.startsWith('macro'));
        const isMaster = cfg.isMaster || cfg.type === 'master';
        const isPaired = cfg.isPaired;

        if (isMacro) {
            const hasConfig = cfg.hasConfig !== false && cfg.mode !== 'macro_aux' && cfg.type !== 'macro_aux';
            const hasReset = cfg.hasResetBtn === true || cfg.mode === 'macro_aux' || cfg.type === 'macro_aux';

            return `
                <div class="desk-label-wrapper">
                    <span class="desk-ch-num">${cfg.chNumber}</span>
                </div>
                <div class="desk-ch-name-zone">
                    <span class="desk-ch-name">${cfg.name.replace(' ', '<br>')}</span>
                </div>
                <div class="desk-macro-feature-zone">
                    ${hasConfig ? `<button class="macro-config-btn">CONFIG</button>` : ''}
                    <div class="macro-delta-display">${cfg.deltaDb || '--'}</div>
                </div>
                <div class="desk-fader-core macro-fader-core">
                    <button class="desk-big-nudge btn-nudge-plus" title="Aumentar">+</button>
                    <button class="desk-big-nudge btn-nudge-minus" title="Diminuir">-</button>
                </div>
                ${hasReset ? `
                    <div class="macro-reset-container">
                        <button class="btn-zerar-sends">ZERAR</button>
                    </div>
                ` : ''}
                <div class="desk-footer-zone macro-footer">
                    <div class="desk-patch-area">
                        <span>${cfg.chNumber}</span>
                    </div>
                </div>
            `;
        }

        return `
            <!-- ZONA 1: Header Tripartite -->
            <div class="desk-label-wrapper">
                <span class="desk-slot-left"></span>
                <span class="desk-ch-num">${cfg.chNumber}</span>
                <span class="desk-slot-right" title="${cfg.isLocked ? 'Canal Travado' : 'Travar Canal'}">🔒</span>
            </div>

            <!-- ZONA 2: Top Action / Solo -->
            <div class="desk-top-action-zone">
                ${cfg.prePost ? `
                    <button class="btn-pre-post ${cfg.prePost.toLowerCase()}">${cfg.prePost}</button>
                ` : `
                    <button class="desk-btn-solo ${cfg.soloState ? 'active' : ''}">SOLO</button>
                `}
            </div>

            <!-- ZONA 3: Display OLED -->
            <div class="desk-ch-name-zone">
                <span class="desk-ch-name">${cfg.name}</span>
            </div>

            <!-- ZONA 4: Middle Feature (Painel de Medidores Exclusivo Master) -->
            ${isMaster ? `
                <div class="desk-master-meters-toggle" title="Configurar Posição dos Medidores">
                    <div class="desk-meters-title">MEDIDORES</div>
                    <div class="desk-meters-row"><span class="desk-meters-lbl">MASTER:</span><span class="desk-meters-badge master-badge">${window.currentMeterPosMasterLabel || 'POST'}</span></div>
                    <div class="desk-meters-row"><span class="desk-meters-lbl">CANAIS:</span><span class="desk-meters-badge channels-badge">${window.currentMeterPosChannelsLabel || 'PREEQ'}</span></div>
                </div>
            ` : ''}

            <!-- ZONA 5: Primary Action (ON), Nudge Superior & Leitura dB -->
            <div class="desk-primary-action-zone">
                <button class="desk-btn-on ${cfg.onState ? 'active' : ''}">ON</button>
                <button class="desk-nudge-btn desk-nudge-plus" title="Nudge + (Clique ou segure)">+</button>
                <div class="desk-db-readout">${cfg.dbValue || '-10.00'}</div>
            </div>

            <!-- ZONA 6: Fader Core (Régua, Fader Rail, VU Meter & Peak LED, Nudge -) -->
            <div class="desk-fader-core">
                <div class="desk-fader-track-area">

                    <!-- Régua de dB Analógica Completa -->
                    <div class="desk-db-ruler ${isMaster ? 'master-ruler' : ''}">
                        ${isMaster ? `
                            <span class="mark-p10">0</span>
                            <span class="mark-p5">-5</span>
                            <span class="mark-0">-10</span>
                            <span class="mark-m5">-15</span>
                            <span class="mark-m10">-20</span>
                            <span class="mark-m20">-30</span>
                            <span class="mark-m30">-40</span>
                            <span class="mark-m40">-50</span>
                            <span class="mark-inf">-∞</span>
                        ` : `
                            <span class="mark-p10">+10</span>
                            <span class="mark-p5">+5</span>
                            <span class="mark-0">0</span>
                            <span class="mark-m5">-5</span>
                            <span class="mark-m10">-10</span>
                            <span class="mark-m15">-15</span>
                            <span class="mark-m20">-20</span>
                            <span class="mark-m30">-30</span>
                            <span class="mark-m40">-40</span>
                            <span class="mark-m50">-50</span>
                            <span class="mark-inf">-∞</span>
                        `}
                    </div>

                    <!-- Trilho do Fader (Protegido contra saltos de clique) -->
                    <div class="desk-fader-rail">
                        <div class="desk-rail-groove"></div>
                        <div class="desk-fader-thumb" style="--fader-pos: ${((cfg.faderValue || 0) / 1023).toFixed(4)};">
                            <div class="thumb-center-line"></div>
                        </div>
                    </div>

                    <!-- VU Meter 60FPS + Peak LED Circular -->
                    <div class="desk-meter-column">
                        <!-- Peak LED Circular -->
                        <div class="desk-peak-led-group">
                            <div class="desk-peak-led peak-l"></div>
                            ${(isPaired || isMaster) ? `<div class="desk-peak-led peak-r"></div>` : ''}
                        </div>

                        <!-- Barra de Medidor VU Gradiente Físico -->
                        <div class="desk-meter-bar-track">
                            <div class="desk-vu-fill vu-l"></div>
                            ${(isPaired || isMaster) ? `<div class="desk-vu-fill vu-r"></div>` : ''}
                        </div>
                    </div>

                </div>

                <!-- Nudge Inferior (-) -->
                <div class="desk-nudge-bottom-container">
                    <button class="desk-nudge-btn desk-nudge-minus" title="Nudge - (Clique ou segure)">-</button>
                </div>
            </div>

            <!-- ZONA 7: Footer Routing & Panpot -->
            <div class="desk-footer-zone">
                ${isPaired ? `
                    <!-- Duplo Panpot Analógico Real Empilhado (L / R) -->
                    <div class="desk-dual-pan-container">
                        <!-- Trilha Pan L (Canal Ímpar) -->
                        <div class="desk-pan-row">
                            <span class="pan-ch-label">L</span>
                            <div class="desk-pan-track desk-dual-track">
                                <div class="desk-pan-center-line"></div>
                                <div class="desk-pan-thumb" style="--pan-val: ${cfg.panL !== null && cfg.panL !== undefined ? cfg.panL : -32};"></div>
                            </div>
                            <span class="pan-val-label">${cfg.panL !== null && cfg.panL !== undefined ? cfg.panL : -32}</span>
                        </div>
                        <!-- Trilha Pan R (Canal Par) -->
                        <div class="desk-pan-row">
                            <span class="pan-ch-label">R</span>
                            <div class="desk-pan-track desk-dual-track">
                                <div class="desk-pan-center-line"></div>
                                <div class="desk-pan-thumb" style="--pan-val: ${cfg.panR !== null && cfg.panR !== undefined ? cfg.panR : 32};"></div>
                            </div>
                            <span class="pan-val-label">${cfg.panR !== null && cfg.panR !== undefined ? cfg.panR : 32}</span>
                        </div>
                    </div>
                ` : `
                    <!-- Panpot Analógico L-C-R com Linha Central -->
                    <div class="desk-pan-container">
                        <div class="desk-pan-labels">
                            <span>L</span><span>C</span><span>R</span>
                        </div>
                        <div class="desk-pan-track">
                            <div class="desk-pan-center-line"></div>
                            <div class="desk-pan-thumb" style="--pan-val: ${cfg.panL || 0};"></div>
                        </div>
                    </div>
                `}
                <div class="desk-patch-area">
                    <span class="marquee-text">${cfg.patch || ''}</span>
                </div>
            </div>

            <!-- Overlay de Bloqueio se Travado (Locked) -->
            ${cfg.isLocked ? `
                <div class="desk-lock-overlay">
                    <div class="lock-badge-btn" title="Clique para destravar">🔒</div>
                </div>
            ` : ''}
        `;
    }

    /**
     * Constrói o HTML Mobile com Cortina VU Integral
     * @private
     */
    _buildMobileHTML() {
        const cfg = this.config;
        const isMacro = cfg.mode === 'macro' || (cfg.type && cfg.type.startsWith('macro'));
        const isPaired = cfg.isPaired;
        const isMaster = cfg.type === 'master' || cfg.isMaster;

        if (isMacro) {
            const hasConfig = cfg.hasConfig !== false && cfg.mode !== 'macro_aux' && cfg.type !== 'macro_aux';
            const hasReset = cfg.hasResetBtn === true || cfg.mode === 'macro_aux' || cfg.type === 'macro_aux';

            return `
                <div class="mob-card-header">
                    ${cfg.chNumber}
                </div>
                <div class="mob-display-name">
                    ${cfg.name}
                </div>
                <div class="mob-macro-feature-zone">
                    ${hasConfig ? `<button class="macro-config-btn">CONFIG</button>` : ''}
                    <div class="mob-macro-delta-display macro-delta-display">${cfg.deltaDb || '--'}</div>
                </div>
                <div class="mob-macro-fader-core">
                    <button class="mob-big-nudge btn-nudge-plus" title="Aumentar">+</button>
                    <button class="mob-big-nudge btn-nudge-minus" title="Diminuir">-</button>
                </div>
                ${hasReset ? `
                    <div class="mob-macro-reset-container">
                        <button class="mob-btn-zerar">ZERAR</button>
                    </div>
                ` : ''}
            `;
        }

        return `
            <!-- Cortina de Medidor VU de Fundo Integral (100% da área do card) -->
            <div class="mob-meter-curtain-container">
                <div class="mob-meter-curtain vu-l"></div>
                ${(isPaired || isMaster) ? `<div class="mob-meter-curtain vu-r"></div>` : ''}
            </div>

            <!-- Conteúdo dos Controles sobre a Cortina -->
            <div class="mob-card-content">

                <!-- Zona 1: Header Centralizado -->
                <div class="mob-card-header">
                    ${cfg.chNumber}
                </div>

                <!-- Zona 3: Display do Canal -->
                <div class="mob-display-name">
                    ${cfg.name}
                </div>

                <!-- Zona 2: Top Action / Solo / Pre -->
                <div class="mob-top-action">
                    ${cfg.prePost ? `
                        <button class="mob-btn-pre">${cfg.prePost}</button>
                    ` : `
                        <button class="mob-btn-solo ${cfg.soloState ? 'active' : ''}">SOLO</button>
                    `}
                </div>

                <!-- Zona 5: Botão ON (Mute) -->
                <div class="mob-primary-action">
                    <button class="mob-btn-on ${cfg.onState ? 'active' : ''}">ON</button>
                </div>

                <!-- Zona 4: Medidores Master Mobile -->
                ${isMaster ? `
                    <div class="mob-master-meters-toggle" title="Configurar Posição dos Medidores">
                        <button class="mob-btn-medidores">[ MEDIDORES ]</button>
                    </div>
                ` : ''}

                <!-- Nudge Superior (+) -->
                <div class="mob-nudge-container">
                    <button class="mob-nudge-btn mob-nudge-plus" title="Nudge + (Toque ou segure)">+</button>
                </div>

                <!-- Fader Rail Central (Sem salto ao toque direto) -->
                <div class="mob-fader-track-area">
                    <!-- Régua Simplificada Mobile (0, -10, -30) -->
                    <div class="mob-db-ruler ${isMaster ? 'master-ruler' : ''}">
                        <span class="mark-0">0 ───</span>
                        <span class="mark-m10">-10 ───</span>
                        <span class="mark-m30">-30 ───</span>
                    </div>

                    <div class="mob-fader-groove"></div>
                    <div class="mob-fader-thumb" style="--fader-pos: ${((cfg.faderValue || 0) / 1023).toFixed(4)};">
                        <div class="thumb-center-line"></div>
                    </div>
                </div>

                <!-- Nudge Inferior (-) -->
                <div class="mob-nudge-container">
                    <button class="mob-nudge-btn mob-nudge-minus" title="Nudge - (Toque ou segure)">-</button>
                </div>

                <!-- Zona 6: Leitura Numérica Neon em dB -->
                <div class="mob-db-readout">
                    ${cfg.dbValue || '-17.50 dB'}
                </div>

            </div>

            <!-- Overlay de Travamento Mobile -->
            ${cfg.isLocked ? `
                <div class="mob-lock-overlay">
                    <div class="lock-badge-btn" title="Toque para destravar">🔒</div>
                </div>
            ` : ''}
        `;
    }

    /**
     * Cache O(1) de todos os nós DOM internos
     * @private
     */
    _cacheElements() {
        const root = this.element;
        if (!root) return;

        this.elements = {
            wrapper: root,
            headerNum: root.querySelector('.desk-ch-num, .mob-ch-num'),
            lockSlot: root.querySelector('.desk-slot-right'),
            nameDisplay: root.querySelector('.desk-ch-name, .mob-display-name'),
            soloBtn: root.querySelector('.desk-btn-solo, .mob-btn-solo'),
            onBtn: root.querySelector('.desk-btn-on, .mob-btn-on'),
            nudgePlus: root.querySelector('.desk-nudge-plus, .mob-nudge-plus, .btn-nudge-plus'),
            nudgeMinus: root.querySelector('.desk-nudge-minus, .mob-nudge-minus, .btn-nudge-minus'),
            faderArea: root.querySelector('.desk-fader-track-area, .mob-fader-track-area'),
            faderRail: root.querySelector('.desk-fader-rail, .mob-fader-groove'),
            faderThumb: root.querySelector('.desk-fader-thumb, .mob-fader-thumb'),
            dbReadout: root.querySelector('.desk-db-readout, .mob-db-readout'),
            deltaDisplay: root.querySelector('.macro-delta-display'),
            patchArea: root.querySelector('.desk-patch-area'),
            patchText: root.querySelector('.desk-patch-area .marquee-text'),
            vuL: root.querySelector('.vu-l'),
            vuR: root.querySelector('.vu-r'),
            peakL: root.querySelector('.peak-l'),
            peakR: root.querySelector('.peak-r'),
            lockOverlay: root.querySelector('.desk-lock-overlay, .mob-lock-overlay'),
            lockBadgeBtn: root.querySelector('.lock-badge-btn')
        };
    }

    /**
     * Conecta todos os manipuladores de eventos do componente
     * @private
     */
    _bindEvents() {
        const els = this.elements;
        const cfg = this.config;

        // 1. Bloqueio de salto de volume no clique direto no trilho
        if (els.faderArea) {
            els.faderArea.addEventListener('mousedown', (e) => {
                if (e.target === els.faderThumb || els.faderThumb?.contains(e.target)) return;
                this._emitEvent('rail_blocked', { message: 'Trilho protegido contra toque direto.' });
            });
            els.faderArea.addEventListener('touchstart', (e) => {
                if (e.target === els.faderThumb || els.faderThumb?.contains(e.target)) return;
                this._emitEvent('rail_blocked', { message: 'Trilho protegido contra toque direto.' });
            }, { passive: true });
        }

        // 2. Arraste do Fader Thumb (Pointer Events)
        if (els.faderThumb && !cfg.isDisabled && !cfg.isLocked) {
            els.faderThumb.addEventListener('pointerdown', (e) => {
                e.preventDefault();
                this.isDragging = true;
                this.dragStartY = e.clientY;
                this.dragStartVal = cfg.faderValue || 0;
                els.faderThumb.setPointerCapture(e.pointerId);
                els.faderThumb.style.cursor = 'grabbing';
            });

            els.faderThumb.addEventListener('pointermove', (e) => {
                if (!this.isDragging) return;
                const railHeight = els.faderArea ? (els.faderArea.clientHeight || 180) : 180;
                const deltaY = this.dragStartY - e.clientY; // Subir = positivo
                const deltaVal = (deltaY / railHeight) * 1023;
                const newVal = Math.max(0, Math.min(1023, Math.round(this.dragStartVal + deltaVal)));

                const isMaster = this.config.isMaster || this.config.type === 'master';
                const isDesktop = this.config.layout === 'desktop';
                const dbText = typeof rawToDb === 'function' ? rawToDb(newVal, !isDesktop, isMaster) : `${newVal}`;

                this.setFaderValue(newVal, dbText);
                this._emitEvent('fader_change', { value: newVal, dbText });
            });

            const stopDrag = (e) => {
                if (this.isDragging) {
                    this.isDragging = false;
                    try { els.faderThumb.releasePointerCapture(e.pointerId); } catch (_) {}
                    els.faderThumb.style.cursor = 'grab';
                }
            };

            els.faderThumb.addEventListener('pointerup', stopDrag);
            els.faderThumb.addEventListener('pointercancel', stopDrag);
        }

        // 3. Roda do Mouse (Desktop Apenas - restrito à área do slider e thumb, exceto Macros)
        const isMacro = cfg.mode === 'macro' || (cfg.type && cfg.type.startsWith('macro'));
        if (cfg.layout === 'desktop' && !cfg.isDisabled && !cfg.isLocked && !isMacro && els.faderArea) {
            els.faderArea.addEventListener('wheel', (e) => {
                e.preventDefault();
                e.stopPropagation();
                const isFine = (cfg.type === 'mix' || cfg.type === 'bus' || cfg.type === 'bus_paired' || cfg.type === 'aux_send') ? 0.50 : 0.10;
                const dir = e.deltaY < 0 ? 1 : -1;

                // Atualiza valor se o canal tiver fader normal
                if (typeof this.config.faderValue === 'number') {
                    this._applyNudgeStep(dir, isFine);
                }

                this._emitEvent('wheel', { dir, step: isFine, deltaY: e.deltaY });
            }, { passive: false });
        }

        // 4. Nudges com Step Fino e Auto-Repeat Acelerado em Long Press
        if (els.nudgePlus) {
            this._setupNudgeButton(els.nudgePlus, 1);
        }
        if (els.nudgeMinus) {
            this._setupNudgeButton(els.nudgeMinus, -1);
        }

        // 5. Botão ON / Mute
        if (els.onBtn) {
            els.onBtn.addEventListener('click', () => {
                const newState = !this.config.onState;
                this.setOnState(newState);
                this._emitEvent('on_toggle', { state: newState });
            });
        }

        // 6. Botão SOLO
        if (els.soloBtn && !cfg.isDisabled && !cfg.isLocked) {
            els.soloBtn.addEventListener('click', () => {
                const newState = !this.config.soloState;
                this.setSoloState(newState);
                this._emitEvent('solo_toggle', { state: newState });
            });
        }

        // 7. Ação de Trava / Destrava (Lock)
        const lockTrigger = els.lockBadgeBtn || els.lockSlot;
        if (lockTrigger) {
            lockTrigger.addEventListener('click', (e) => {
                e.stopPropagation();
                this._emitEvent('lock_click', { isLocked: this.config.isLocked });
            });
        }

        // 8. Interação da Barra de Pan (Click -> Tip, Long Press Drag -> Mover, Double Click -> Centralizar)
        this._bindPanEvents();

        // 9. Abertura do Modal de Configuração de Medidores (Master Desktop & Mobile)
        const metersToggle = this.element.querySelector('.desk-master-meters-toggle, .mob-btn-medidores');
        if (metersToggle) {
            metersToggle.addEventListener('click', (e) => {
                e.stopPropagation();
                if (typeof window.openMeterConfigModal === 'function') {
                    window.openMeterConfigModal('master');
                }
                this._emitEvent('meters_config_click', { target: 'master' });
            });
        }

        // 10. Abertura do Modal de Configuração do Macro Fader (Desktop & Mobile)
        const macroConfigBtn = this.element.querySelector('.macro-config-btn');
        if (macroConfigBtn) {
            macroConfigBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                if (typeof window.openMacroConfigModal === 'function') {
                    window.openMacroConfigModal();
                }
                this._emitEvent('macro_config_click', { mode: this.config.mode || 'macro' });
            });
        }

        // 11. Botão ZERAR Envios do Macro Aux Geral (Desktop & Mobile)
        const zerarBtn = this.element.querySelector('.btn-zerar-sends, .mob-btn-zerar');
        if (zerarBtn) {
            zerarBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                if (typeof window.confirmZeroSends === 'function') {
                    window.confirmZeroSends(this.config.chNumber);
                }
                this._emitEvent('zerar_sends_click', { channel: this.config.chNumber });
            });
        }
    }

    /**
     * Configura interatividade do Panpot (Single e Dual)
     * @private
     */
    _bindPanEvents() {
        const root = this.element;
        if (!root || this.config.isDisabled || this.config.isLocked) return;

        // Single Pan
        const singleTrack = root.querySelector('.desk-pan-container .desk-pan-track');
        if (singleTrack) {
            this._setupPanTrackInteraction(singleTrack, null, root.querySelector('.desk-pan-container'));
        }

        // Dual Pan (L e R)
        const dualRows = root.querySelectorAll('.desk-dual-pan-container .desk-pan-row');
        if (dualRows && dualRows.length >= 2) {
            const rowL = dualRows[0];
            const trackL = rowL.querySelector('.desk-pan-track');
            if (trackL) this._setupPanTrackInteraction(trackL, 'L', rowL);

            const rowR = dualRows[1];
            const trackR = rowR.querySelector('.desk-pan-track');
            if (trackR) this._setupPanTrackInteraction(trackR, 'R', rowR);
        }
    }

    /**
     * Gerencia Long Press, Drag, Double Click e Click Tip para um trilho de Pan
     * @private
     */
    _setupPanTrackInteraction(trackEl, side = null, rowEl = null) {
        let pressStartTime = 0;
        let longPressTimer = null;
        let pendingTipTimer = null;
        let isDragging = false;
        let lastClickTime = 0;
        let didResetOnDown = false;

        const containerEl = rowEl || trackEl;

        const cancelTip = () => {
            if (pendingTipTimer) {
                clearTimeout(pendingTipTimer);
                pendingTipTimer = null;
            }
            if (typeof window.BubbleModal !== 'undefined') {
                window.BubbleModal.hideImmediate();
            }
        };

        const getValFromClientX = (clientX) => {
            const rect = trackEl.getBoundingClientRect();
            if (!rect.width) return 0;
            let pct = (clientX - rect.left) / rect.width;
            pct = Math.max(0, Math.min(1, pct));
            // Converte 0..1 para -32..+32
            return Math.round((pct * 64) - 32);
        };

        const updatePan = (val) => {
            this.setPanValue(val, side);
        };

        const doResetToCenter = () => {
            cancelTip();
            updatePan(0);
            this._emitEvent('pan_reset', { side });
        };

        // Pointerdown no trilho / linha / container
        containerEl.addEventListener('pointerdown', (e) => {
            e.preventDefault();
            e.stopPropagation();

            const now = Date.now();
            didResetOnDown = false;

            // Verifica duplo clique (<= 350ms entre cliques)
            if (now - lastClickTime <= 350) {
                lastClickTime = 0;
                didResetOnDown = true;
                if (longPressTimer) {
                    clearTimeout(longPressTimer);
                    longPressTimer = null;
                }
                doResetToCenter();
                return;
            }
            lastClickTime = now;

            pressStartTime = now;
            isDragging = false;

            longPressTimer = setTimeout(() => {
                cancelTip();
                isDragging = true;
                try { trackEl.setPointerCapture(e.pointerId); } catch (_) {}
                updatePan(getValFromClientX(e.clientX));
            }, 250);
        });

        // Pointermove
        containerEl.addEventListener('pointermove', (e) => {
            if (!isDragging) return;
            e.preventDefault();
            updatePan(getValFromClientX(e.clientX));
        });

        // Pointerup / Pointercancel
        const handlePointerEnd = (e) => {
            if (longPressTimer) {
                clearTimeout(longPressTimer);
                longPressTimer = null;
            }

            const duration = Date.now() - pressStartTime;

            if (isDragging) {
                isDragging = false;
                try { trackEl.releasePointerCapture(e.pointerId); } catch (_) {}
            } else if (!didResetOnDown && duration < 250 && duration > 0) {
                // Aguarda a janela de duplo clique (350ms) antes de abrir a dica do BubbleModal
                cancelTip();
                pendingTipTimer = setTimeout(() => {
                    pendingTipTimer = null;
                    if (typeof window.BubbleModal !== 'undefined') {
                        window.BubbleModal.show({
                            targetEl: containerEl,
                            message: '💡 <b>Controle de Pan</b><br>Clique e segure para ajustar<br>Duplo clique centraliza (0)',
                            delay: 0,
                            duration: 3500
                        });
                    }
                }, 350);
            }
            pressStartTime = 0;
            didResetOnDown = false;
        };

        containerEl.addEventListener('pointerup', handlePointerEnd);
        containerEl.addEventListener('pointercancel', handlePointerEnd);

        // Duplo clique nativo (dblclick)
        containerEl.addEventListener('dblclick', (e) => {
            e.preventDefault();
            e.stopPropagation();
            doResetToCenter();
        });

        // Wheel para ajuste de Pan (Scroll Vertical ou Horizontal + Suporte a Shift)
        containerEl.addEventListener('wheel', (e) => {
            e.preventDefault();
            e.stopPropagation();
            cancelTip();

            const isHorizontal = Math.abs(e.deltaX) > Math.abs(e.deltaY);
            const dir = isHorizontal ? (e.deltaX > 0 ? 1 : -1) : (e.deltaY < 0 ? 1 : -1);
            const step = e.shiftKey ? 4 : 1; // Shift para incremento rápido

            const cur = side === 'R' ? (this.config.panR !== null && this.config.panR !== undefined ? this.config.panR : 32)
                                     : (this.config.panL !== null && this.config.panL !== undefined ? this.config.panL : (side === 'L' ? -32 : 0));
            const next = Math.max(-32, Math.min(32, cur + (dir * step)));
            updatePan(next);
            this._emitEvent('wheel', { dir, step, type: 'pan', side, value: next });
        }, { passive: false });
    }

    /**
     * Atualiza o valor do Pan e o elemento visual correspondente
     * @param {number} val -32 a +32
     * @param {string|null} side 'L' | 'R' | null
     */
    setPanValue(val, side = null) {
        const clamped = Math.max(-32, Math.min(32, val));
        const root = this.element;
        if (!root) return;

        if (side === 'L') {
            this.config.panL = clamped;
            const rowL = root.querySelector('.desk-dual-pan-container .desk-pan-row:first-child');
            if (rowL) {
                const thumb = rowL.querySelector('.desk-pan-thumb');
                if (thumb) thumb.style.setProperty('--pan-val', clamped);
                const label = rowL.querySelector('.pan-val-label');
                if (label) label.innerText = clamped;
            }
            this._emitEvent('pan_change', { panL: clamped, panR: this.config.panR, side: 'L' });
        } else if (side === 'R') {
            this.config.panR = clamped;
            const rowR = root.querySelector('.desk-dual-pan-container .desk-pan-row:last-child');
            if (rowR) {
                const thumb = rowR.querySelector('.desk-pan-thumb');
                if (thumb) thumb.style.setProperty('--pan-val', clamped);
                const label = rowR.querySelector('.pan-val-label');
                if (label) label.innerText = clamped;
            }
            this._emitEvent('pan_change', { panL: this.config.panL, panR: clamped, side: 'R' });
        } else {
            this.config.panL = clamped;
            const singleThumb = root.querySelector('.desk-pan-container .desk-pan-thumb');
            if (singleThumb) singleThumb.style.setProperty('--pan-val', clamped);
            this._emitEvent('pan_change', { panL: clamped, panR: null });
        }
    }

    /**
     * Configura botão de Nudge com auto-repeat acelerado
     * @private
     */
    _setupNudgeButton(btnEl, direction) {
        const isOut = this.config.type === 'mix' || this.config.type === 'bus' || this.config.type === 'bus_paired';
        const isAuxSend = this.config.type === 'aux_send';
        const isMacro = this.config.mode === 'macro' || (this.config.type && this.config.type.startsWith('macro'));

        let step = 0.05;
        if (isAuxSend) {
            step = 0.50;
        } else if (this.config.mode === 'macro_musician' || this.config.type === 'macro_musician') {
            step = 0.25;
        } else if (this.config.mode === 'macro_aux' || this.config.type === 'macro_aux') {
            step = 0.10;
        } else if (isOut || isMacro) {
            step = 0.05;
        }

        const stepNudge = () => {
            if (isMacro) {
                // Em macros, acumula delta dB, atualiza o LED e agenda retorno para '--' após 5s
                this._applyMacroDelta(direction, step);
                this._emitEvent('nudge', { direction, step });
            } else if (typeof this.config.faderValue === 'number') {
                this._applyNudgeStep(direction, step);
                this._emitEvent('nudge', { direction, step });
            } else {
                this._emitEvent('nudge', { direction, step });
            }
        };

        const startAutoRepeat = (e) => {
            e.preventDefault();
            stepNudge();

            let delay = 120;
            const minDelay = 25;

            const repeat = () => {
                stepNudge();
                delay = Math.max(minDelay, delay * 0.82);
                this.nudgeInterval = setTimeout(repeat, delay);
            };

            this.nudgeTimer = setTimeout(() => {
                repeat();
            }, 220);
        };

        const stopAutoRepeat = () => {
            if (this.nudgeTimer) clearTimeout(this.nudgeTimer);
            if (this.nudgeInterval) clearTimeout(this.nudgeInterval);
            this.nudgeTimer = null;
            this.nudgeInterval = null;
        };

        btnEl.addEventListener('pointerdown', startAutoRepeat);
        btnEl.addEventListener('pointerup', stopAutoRepeat);
        btnEl.addEventListener('pointerleave', stopAutoRepeat);
        btnEl.addEventListener('pointercancel', stopAutoRepeat);
    }

    /**
     * Aplica incremento/decremento de Delta dB acumulado no visor de Macro Fader e mantém por 5 segundos
     * @private
     */
    _applyMacroDelta(direction, step) {
        this.deltaDbVal += (direction * step);
        if (this.elements.deltaDisplay) {
            const sign = this.deltaDbVal > 0 ? '+' : '';
            this.elements.deltaDisplay.innerText = `${sign}${this.deltaDbVal.toFixed(2)} dB`;
            this.elements.deltaDisplay.classList.add('macro-db-active');
        }

        if (this.deltaResetTimer) clearTimeout(this.deltaResetTimer);
        this.deltaResetTimer = setTimeout(() => {
            this.deltaDbVal = 0;
            if (this.elements.deltaDisplay) {
                this.elements.deltaDisplay.innerText = '--';
                this.elements.deltaDisplay.classList.remove('macro-db-active');
            }
            this.deltaResetTimer = null;
        }, 5000);
    }

    /**
     * Aplica um incremento/decremento de dB no fader e recalcula raw/db
     * @private
     */
    _applyNudgeStep(direction, stepDb) {
        const isMaster = this.config.isMaster || this.config.type === 'master';
        const isDesktop = this.config.layout === 'desktop';
        const currentRaw = this.config.faderValue !== null && this.config.faderValue !== undefined ? this.config.faderValue : 0;

        let currentDb = -138;
        if (currentRaw > 0) {
            const rawText = typeof rawToDb === 'function' ? rawToDb(currentRaw, false, isMaster) : '0';
            currentDb = parseFloat(rawText);
            if (isNaN(currentDb)) currentDb = -138;
        }

        let newDb;
        if (currentRaw === 0 && direction > 0) {
            newDb = -60.0;
        } else {
            newDb = currentDb + (direction * stepDb);
        }

        const maxDb = isMaster ? 0.0 : 10.0;
        if (newDb > maxDb) newDb = maxDb;
        if (newDb < -60.0) newDb = -138;

        let newRaw = 0;
        if (newDb > -138) {
            newRaw = typeof dbToRaw === 'function' ? dbToRaw(isMaster ? newDb + 10 : newDb) : Math.round((newDb + 60) * 10);
            newRaw = Math.max(0, Math.min(1023, newRaw));
        }

        const newDbText = typeof rawToDb === 'function' ? rawToDb(newRaw, !isDesktop, isMaster) : `${newDb.toFixed(2)} dB`;

        this.setFaderValue(newRaw, newDbText);
        this._emitEvent('fader_change', { value: newRaw, dbText: newDbText });
    }

    /**
     * Atualiza o valor do fader e a posição do thumb
     * @param {number} val 0 a 1023
     * @param {string} [dbText] Texto em dB opcional (se omitido, calcula automaticamente)
     */
    setFaderValue(val, dbText) {
        this.config.faderValue = val;
        const normalized = Math.max(0, Math.min(1, val / 1023));

        if (this.elements.faderThumb) {
            this.elements.faderThumb.style.setProperty('--fader-pos', normalized.toFixed(4));
        }

        if (this.elements.dbReadout) {
            if (dbText !== undefined) {
                this.elements.dbReadout.innerText = dbText;
            } else if (typeof rawToDb === 'function') {
                const isMaster = this.config.isMaster || this.config.type === 'master';
                const isDesktop = this.config.layout === 'desktop';
                this.elements.dbReadout.innerText = rawToDb(val, !isDesktop, isMaster);
            }
        }
    }

    /**
     * Verifica e ativa animação de marquee caso o texto de patch extrapole a largura disponível
     * @private
     */
    _checkMarquee() {
        if (!this.elements.patchArea || !this.elements.patchText) return;
        const area = this.elements.patchArea;
        const text = this.elements.patchText;

        text.classList.remove('is-overflowing');
        text.style.removeProperty('--marquee-dist');

        const scrollW = text.scrollWidth;
        const clientW = area.clientWidth;

        if (scrollW > clientW && clientW > 0) {
            const overflowPx = scrollW - clientW + 8;
            text.style.setProperty('--marquee-dist', `-${overflowPx}px`);
            text.classList.add('is-overflowing');
        }
    }

    /**
     * Define o estado do botão ON
     * @param {boolean} state
     */
    setOnState(state) {
        this.config.onState = !!state;
        if (this.elements.onBtn) {
            this.elements.onBtn.classList.toggle('active', this.config.onState);
            this.elements.onBtn.classList.toggle('on-active', this.config.onState);
        }
    }

    /**
     * Define o estado do botão SOLO
     * @param {boolean} state
     */
    setSoloState(state) {
        this.config.soloState = !!state;
        if (this.elements.soloBtn) {
            this.elements.soloBtn.classList.toggle('active', this.config.soloState);
            this.elements.soloBtn.classList.toggle('solo-active', this.config.soloState);
        }
    }

    /**
     * Atualiza o texto do badge de Patch I/O e recalcula o marquee
     * @param {string} patchText
     */
    setPatch(patchText) {
        this.config.patch = patchText;
        if (this.elements.patchText) {
            this.elements.patchText.innerText = patchText || '';
            this._checkMarquee();
        }
    }

    /**
     * Atualiza níveis do medidor VU e dispara Peak Hold quando >= 98%
     * @param {number} levelL 0 a 100
     * @param {number} levelR 0 a 100
     */
    setMeterLevel(levelL, levelR = levelL) {
        const pL = Math.max(0, Math.min(100, levelL));
        const pR = Math.max(0, Math.min(100, levelR));
        const isPeak = pL >= 98 || pR >= 98;

        if (this.config.layout === 'desktop') {
            if (this.elements.vuL) {
                this.elements.vuL.style.height = `${pL}%`;
            }
            if (this.elements.vuR) {
                this.elements.vuR.style.height = `${pR}%`;
            }
            if (isPeak) {
                this._triggerDesktopPeak();
            }
        } else {
            // Mobile (Cortina de fundo integral)
            if (this.elements.vuL) this.elements.vuL.style.height = `${pL}%`;
            if (this.elements.vuR) this.elements.vuR.style.height = `${pR}%`;
            if (isPeak) {
                this._triggerMobilePeakGlow();
            }
        }
    }

    /**
     * Dispara Peak Hold de 1000ms no LED circular Desktop
     * @private
     */
    _triggerDesktopPeak() {
        const peakL = this.elements.peakL;
        const peakR = this.elements.peakR;

        if (peakL) peakL.classList.add('active');
        if (peakR) peakR.classList.add('active');

        if (this.peakHoldTimerL) clearTimeout(this.peakHoldTimerL);
        this.peakHoldTimerL = setTimeout(() => {
            if (peakL) peakL.classList.remove('active');
            if (peakR) peakR.classList.remove('active');
        }, 1000);
    }

    /**
     * Dispara contorno Peak Glow de 1000ms no Mobile
     * @private
     */
    _triggerMobilePeakGlow() {
        if (!this.element) return;
        this.element.classList.add('peak-glow');

        if (this.peakHoldTimerL) clearTimeout(this.peakHoldTimerL);
        this.peakHoldTimerL = setTimeout(() => {
            if (this.element) this.element.classList.remove('peak-glow');
        }, 1000);
    }

    /**
     * Dispara callbacks de eventos registrados
     * @private
     */
    _emitEvent(eventName, payload) {
        if (typeof this.config.callbacks[eventName] === 'function') {
            this.config.callbacks[eventName](payload, this);
        }
        const customEvent = new CustomEvent(`strip:${eventName}`, {
            detail: Object.assign({ id: this.config.id, ch: this.config.evtCh }, payload),
            bubbles: true
        });
        if (this.element) this.element.dispatchEvent(customEvent);
    }
}

// Expõe globalmente
window.ChannelStrip = ChannelStrip;

/* =========================================================================================
 * PONTES LEGADAS DE COMPATIBILIDADE (Preservadas para zero quebra no sistema principal)
 * ========================================================================================= */

function getFaderScaleHTML(isMaster) {
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

    if (musicianMode) return '';
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


function updateUI(ch, val, onState, soloState) {

    const isMaster = ch === 'master';
    let stateRef;
    let uiId = ch;

    if (isMaster) {
        stateRef = masterState;
    } else if (typeof ch === 'string' && ch.startsWith('m')) {
        stateRef = mixesState[ch.substring(1)];
    } else if (typeof ch === 'string' && ch.startsWith('b')) {
        stateRef = busesState[ch.substring(1)];
    } else if (typeof ch === 'number' && ch >= 36 && ch <= 43) {
        stateRef = mixesState[ch - 36];
        uiId = `m${ch - 36}`;
    } else if (typeof ch === 'number' && ch >= 44 && ch <= 51) {
        stateRef = busesState[ch - 44];
        uiId = `b${ch - 44}`;
    } else if (typeof ch === 'number' && ch >= 60 && ch <= 67) {
        stateRef = channelStates[32 + (ch - 60)];
        const stIndex = Math.floor((ch - 60) / 2);
        uiId = `st${stIndex}`;
    } else if (ch === 52) {
        stateRef = masterState;
        uiId = 'master';
    } else {
        stateRef = channelStates[ch];
    }

    if (!stateRef) return;

    if (val !== undefined && val !== null) {
        const elF = document.getElementById(`f${uiId}`);
        if (elF) elF.value = val;
        const elFMini = document.getElementById(`mini-f${uiId}`);
        if (elFMini) elFMini.value = val;

        const elV = document.getElementById(`v${uiId}`);
        if (elV) elV.innerText = rawToDb(val, layoutMode !== 'desktop', isMaster);
        const elVMini = document.getElementById(`mini-v${uiId}`);
        if (elVMini) elVMini.innerText = rawToDb(val, false, isMaster);

        // Se no modo músico ou modo técnico editando mix, salvamos no AUX correspondente
        if ((musicianMode || technicianMixMode) && typeof ch === 'number') {
            stateRef[`aux${activeMix}`] = val;
        } else {
            stateRef.value = val;
        }
    }
    if (onState !== undefined && onState !== null) {
        if ((musicianMode || technicianMixMode) && typeof ch === 'number') {
            stateRef[`aux${activeMix}On`] = onState;
        } else {
            stateRef.on = onState;
        }
        const elOn = document.getElementById(`on${uiId}`);
        if (elOn) elOn.classList.toggle('on-active', onState);
        const elOnMini = document.getElementById(`mini-on${uiId}`);
        if (elOnMini) elOnMini.classList.toggle('on-active', onState);

        // Novo: Subtle yellow background for desktop layout when channel is ON
        const elCard = document.getElementById(`card${uiId}`);
        if (elCard && layoutMode === 'desktop') elCard.classList.toggle('desk-on-bg', onState);
        const elCardMini = document.getElementById(`mini-card${uiId}`);
        if (elCardMini) elCardMini.classList.toggle('desk-on-bg', onState);

        // Novo: Colorized Label background
        const elLabel = document.getElementById(`label${uiId}`);
        if (elLabel && layoutMode === 'desktop') elLabel.classList.toggle('label-on', onState);
        const elLabelMini = document.getElementById(`mini-label${uiId}`);
        if (elLabelMini) elLabelMini.classList.toggle('label-on', onState);
    }
    if (soloState !== undefined && soloState !== null) {
        if (stateRef) stateRef.solo = soloState;
        const elSolo = document.getElementById(`solo${uiId}`);
        if (elSolo) elSolo.classList.toggle('solo-active', soloState);
        const elSoloMini = document.getElementById(`mini-solo${uiId}`);
        if (elSoloMini) elSoloMini.classList.toggle('solo-active', soloState);
        // Atualiza o indicador de SOLO no master sempre que qualquer solo muda
        if (typeof checkMasterSoloIndicator === 'function') {
            checkMasterSoloIndicator();
        }
    }
}
/**
 * 🚨 [CRITICAL SYNC LOGIC]
 * Esta função é o componente universal para faders desktop.
 * ATENÇÃO: As propriedades 'ids' e 'evtCh' são vitais para a sincronização com o servidor.
 * Não altere a lógica de IDs ('f${id}', 'v${id}', etc) sem garantir que o motor de 
 * sincronização em 'socket.js' e 'updateUI' seja atualizado de acordo.
 */
function createDesktopStrip(config) {
    const {
        id,              // ID base
        elId,            // ID do container card
        title,           // Texto no topo/base
        name,            // Texto display verde
        customClass = "",
        onAction,
        configAction = "",
        isMaster = false,
        hasSolo = false,
        evtCh,           // Identificador do socket (0, 'm0', etc)
        onWheelAction = "handleWheelFader",
        onInputAction = "faderInput",
        onNudgeStartAction = "startNudge",
        onNudgeStopAction = "stopNudge",
        type = "main",
        ids = {},        // Overrides de IDs (ex: { f: 'aux_f_1' })
        val = 0,         // Valor inicial do fader
        dbLabel = "-∞",  // Texto inicial do dB
        isOn = false,    // Estado ON/OFF inicial
        solo = false,    // Estado SOLO inicial
        isPaired = false,
        partnerId = null,
        hasPan = true,    // Define se exibe o indicador de Pan
        dataCh = ""      // Canal real para meters
    } = config;

    const pfx = config.idPrefix || "";
    // Resolve IDs: Se não houver override, usa padrao (f0, v0, etc)
    const fId = ids.f || `${pfx}f${id}`;
    const vId = ids.v || `${pfx}v${id}`;
    const onId = ids.on || `${pfx}on${id}`;
    const soloId = ids.solo || `${pfx}solo${id}`;
    const pId = ids.p || `${pfx}p${id}`;
    const mId = ids.m || `${pfx}m${id}`;
    const nameId = ids.name || `${pfx}name${id}`;
    const labelId = ids.label || `${pfx}label${id}`;
    const patchId = ids.patch || `${pfx}patch-zone-${id}`;
    const patchValId = ids.patchVal || `${pfx}patch-val-${id}`;
    const patchText = config.patchText || '';

    const wheelCall = `${onWheelAction}(event, ${evtCh})`;
    const inputCall = `${onInputAction}(event, ${evtCh})`;

    return `
        <div class="fader-card-desktop ${customClass}" id="${ids.card || `${pfx}card${id}`}" ${dataCh !== undefined && dataCh !== '' ? `data-ch="${dataCh}"` : ''} ${partnerId !== null ? `data-partner-ch="${partnerId}"` : ''}>
            <div class="desk-label-wrapper">
                <div class="desk-label" id="${labelId}" style="cursor: pointer;" onclick="${configAction}">${title}</div>
                ${dataCh !== undefined && dataCh !== '' ? `<div class="desk-label-lock" data-ch="${dataCh}">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                        <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                        <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                    </svg>
                </div>` : ''}
            </div>

            ${hasSolo ?
            `<button id="${soloId}" class="btn-cue ${solo ? 'solo-active' : ''}" onclick="${pfx === 'mini-' ? `soloReplace('kSetupSoloChOn/kSoloChOn', ${evtCh})` : `toggleState('kSetupSoloChOn/kSoloChOn', ${evtCh})`}">SOLO</button>` :
            isMaster ?
                `<button id="master-solo-btn" class="btn-cue" disabled onclick="clearAllSolos()">SOLO</button>` :
                config.topExtraHtml !== undefined ?
                    config.topExtraHtml :
                    `<div class="btn-cue-placeholder"></div>`}    
            <div class="desk-ch-name-zone" onclick="${pfx && pfx === 'mini-' && config.type === 'main' ? 'openNameEditor()' : configAction}">
                <div id="${nameId}" class="desk-ch-name">${name}</div>
            </div>

            ${isMaster ? `
            <div class="master-meter-section" onclick="openMeterConfigModal('master')">
                <div class="master-meter-divider">MEDIDORES</div>
                <div class="master-meter-group">
                    <span class="master-meter-label">MASTER:</span>
                    <span id="master-meter-indicator-btn" class="master-meter-badge">${window.currentMeterPosMasterLabel || 'PRE'}</span>
                </div>
                <div class="master-meter-group">
                    <span class="master-meter-label">CANAIS:</span>
                    <span id="channels-meter-indicator-btn" class="master-meter-badge">${window.currentMeterPosChannelsLabel || 'PRE'}</span>
                </div>
            </div>
            ` : ''}

            ${config.auxSectionHtml || ''}

            <button id="${onId}" class="btn-on-desk ${isOn ? 'on-active' : ''}" onclick="${onAction}">ON</button>

            <div class="nudge-zone-desk" onpointerdown="${onNudgeStartAction}(${evtCh}, 1)" onpointerup="${onNudgeStopAction}()" onpointerleave="${onNudgeStopAction}()" onpointercancel="${onNudgeStopAction}()" onclick="event.stopPropagation()">
                <button class="btn-nudge-desk">+</button>
            </div>

            <div class="desk-db-val">
                <span id="${vId}">${dbLabel}</span>
            </div>

            <div class="desk-fader-container" onwheel="${wheelCall}">
                ${getFaderScaleHTML(isMaster)}
                <input type="range" id="${fId}" min="0" max="1023" value="${val}" orient="vertical" oninput="${inputCall}">
                ${(type === 'main' || type === 'output') ? `
                <div class="desk-meter-container" style="display: flex; flex-direction: column; align-items: center; margin-left: 2px; height: 100%;">
                    <div id="${pId}" class="desk-peak-led"></div>
                    <div style="display: flex; gap: 2px; flex: 1; width: 100%; justify-content: center;">
                        <div class="desk-meter-wrap" style="margin-top: 5px; flex: 0 0 4px; height: 92%;">
                            <div class="desk-meter-curtain" id="${mId}"></div>
                        </div>
                        ${isPaired ? `
                        <div class="desk-meter-wrap" style="margin-top: 5px; flex: 0 0 4px; height: 92%;">
                            <div class="desk-meter-curtain" id="m${partnerId}"></div>
                        </div>
                        ` : ''}
                    </div>
                </div>` : ''}
            </div>

            <div class="nudge-zone-desk" onpointerdown="${onNudgeStartAction}(${evtCh}, -1)" onpointerup="${onNudgeStopAction}()" onpointerleave="${onNudgeStopAction}()" onpointercancel="${onNudgeStopAction}()" onclick="event.stopPropagation()">
                <button class="btn-nudge-desk">-</button>
            </div>
            
            <div class="desk-pan-indicator" id="pani${ids.card || `${pfx}card${id}`}"
                 ${layoutMode === 'desktop' && hasPan ? `
                    onwheel="handleWheelPan(event, ${evtCh}, ${isMaster ? 'null' : partnerId})" 
                    ondblclick="resetPan(event, ${evtCh}, ${isMaster ? 'null' : partnerId})"
                    onpointerdown="startPanLongPress(event, ${evtCh}, ${isMaster ? 'null' : partnerId})"
                    onpointermove="handlePanPointerMove(event)"
                    onpointerup="stopPanLongPress(event)"
                    onpointercancel="stopPanLongPress(event)"` : ''}>
                ${hasPan ? `
                <span class="desk-pan-l">L</span>
                <div class="desk-pan-tracks-container">
                    ${(() => {
                const getPanTrackHTML = (ch) => {
                    let panVal = 0;
                    const stateRef = typeof getChannelStateById === 'function' ? getChannelStateById(ch) : null;
                    if (stateRef && stateRef.pan !== undefined) {
                        panVal = stateRef.pan;
                    }

                    const percent = ((panVal + 63) / 126) * 100;
                    let panClass = "pan-center";
                    if (panVal < 0) panClass = "pan-left";
                    if (panVal > 0) panClass = "pan-right";

                    return `
                                <div class="desk-pan-track" data-pan-ch="${ch}">
                                    <div class="desk-pan-center-tick"></div>
                                    <div class="desk-pan-thumb ${panClass}" style="left:${percent}%"></div>
                                </div>
                            `;
                };

                let tracksHTML = getPanTrackHTML(evtCh);
                if (isPaired && partnerId !== null && !isMaster) {
                    tracksHTML += getPanTrackHTML(partnerId);
                }
                return tracksHTML;
            })()}
                </div>
                <span class="desk-pan-r">R</span>` : ''}
            </div>

            ${!isMaster ? `
            <div class="desk-patch-zone" id="${patchId}" onclick="${configAction}">
                <span class="desk-patch-name" id="${patchValId}">${patchText || '--'}</span>
            </div>
            ` : ''}
        </div>
    `;
}

/**
 * Atualiza o indicador visual de Pan no fader desktop.
 * @param {number|string} channel  ID global do canal (0-31, 60-67, ou 'master')
 * @param {number}        panValue Valor entre -63 (L) e +63 (R)
 */
function updatePanIndicator(channel, panValue) {
    // pan -63 → 0%, pan 0 → 50%, pan +63 → 100%
    const pct = ((panValue + 63) / 126) * 100;

    const isMaster = (channel === 52 || channel === 'master' || channel === "'master'");
    const targetCh = isMaster ? 'master' : channel;
    const selector = `.desk-pan-track[data-pan-ch="${targetCh}"], .desk-pan-track[data-pan-ch="'${targetCh}'"], .desk-pan-track[data-pan-ch="${channel}"]`;

    // Busca todas as trilhas na UI (desktop card ou mobile routing etc)
    const tracks = document.querySelectorAll(selector);

    tracks.forEach(track => {
        const thumb = track.querySelector('.desk-pan-thumb');
        if (!thumb) return;

        thumb.style.left = `${pct}%`;

        // Cor: centro = cinza, qualquer lado = roxo
        if (panValue === 0) {
            thumb.classList.add('pan-center');
        } else {
            thumb.classList.remove('pan-center');
        }
    });
}

/**
 * Atualiza dinamicamente os badges de patch no layout desktop.
 */
function updateDesktopPatchBadges() {
    if (layoutMode !== 'desktop' || !window.PatchRegistry) return;

    function applyTextAndMarquee(el, txt) {
        if (!el) return;
        const val = txt || '--';
        el.innerText = val;
        el.title = val;

        // Se o texto for maior que o container, ativa marquee lento e suave
        requestAnimationFrame(() => {
            const parent = el.parentElement;
            if (!parent) return;
            const diff = el.scrollWidth - parent.clientWidth;
            if (diff > 2) {
                el.style.setProperty('--marquee-dist', `-${diff + 8}px`);
                el.classList.add('desk-patch-marquee');
            } else {
                el.classList.remove('desk-patch-marquee');
                el.style.removeProperty('--marquee-dist');
            }
        });
    }

    // Canais 0-31
    for (let i = 0; i < 32; i++) {
        const el = document.getElementById(`patch-val-${i}`);
        if (el) {
            const s = (typeof getChannelStateById === 'function') ? getChannelStateById(i) : (window.channelStates && window.channelStates[i]);
            const txt = (s && s.paired && s.pairedWith !== null)
                ? window.PatchRegistry.getPairedChannelInput(i, s.pairedWith)
                : window.PatchRegistry.getChannelInput(i);
            applyTextAndMarquee(el, txt);
        }
    }

    // ST IN 0-3 (st0..st3)
    for (let i = 0; i < 4; i++) {
        const el = document.getElementById(`patch-val-st${i}`);
        if (el) {
            const ch = 32 + (i * 2);
            applyTextAndMarquee(el, window.PatchRegistry.getPairedChannelInput(ch, ch + 1));
        }
    }

    // MIX 0-7 (m0..m7) & BUS 0-7 (b0..b7)
    for (let i = 0; i < 8; i++) {
        const elMix = document.getElementById(`patch-val-m${i}`);
        if (elMix) {
            const s = (window.mixesState && window.mixesState[i]);
            let txt = window.PatchRegistry.getMixOutput(i);
            if (s && s.paired && i % 2 === 0) {
                const out1 = window.PatchRegistry.getMixOutput(i);
                const out2 = window.PatchRegistry.getMixOutput(i + 1);
                txt = (out1 === out2) ? out1 : `${out1} | ${out2}`;
            }
            applyTextAndMarquee(elMix, txt);
        }
        const elBus = document.getElementById(`patch-val-b${i}`);
        if (elBus) {
            const s = (window.busesState && window.busesState[i]);
            let txt = window.PatchRegistry.getBusOutput(i);
            if (s && s.paired && i % 2 === 0) {
                const out1 = window.PatchRegistry.getBusOutput(i);
                const out2 = window.PatchRegistry.getBusOutput(i + 1);
                txt = (out1 === out2) ? out1 : `${out1} | ${out2}`;
            }
            applyTextAndMarquee(elBus, txt);
        }
    }
}
window.updateDesktopPatchBadges = updateDesktopPatchBadges;

function createDesktopChannelStrip(i, isMaster = false, idPrefix = "") {
    const s = isMaster ? masterState : channelStates[i];
    let title = isMaster ? "MASTER" : `${i + 1}`;

    // Se estiver pareado, o título mostra os dois canais (ex: 1 + 2)
    if (!isMaster && s.paired) {
        title = `${i + 1} + ${i + 2}`;
    }

    let nameDiv = isMaster ? (s.name !== undefined ? s.name : "MASTER") : (s.name !== undefined ? s.name : "...");
    const globalId = isMaster ? 52 : i;
    if (window.resolvedNames && window.resolvedNames[globalId]) {
        nameDiv = window.resolvedNames[globalId].name;
    }
    let customClass = isMaster ? "master-card-desktop" : "";
    if (!isMaster) {
        if (i < 16) customClass += " fader-group-1";
        else if (i < 32) customClass += " fader-group-2";

        // Aplica classe de largura dupla se estiver pareado
        if (s.paired) customClass += " fader-card-paired";
    }

    let val = s.value;
    let isOn = s.on;
    let solo = !isMaster ? s.solo : false;

    // Se estivermos editando um Mix (Sends on Faders)
    if ((musicianMode || technicianMixMode) && !isMaster) {
        val = s[`aux${activeMix}`] || 0;
        isOn = s[`aux${activeMix}On`] || false;
    }

    let onAction = isMaster ? "confirmMasterOn()" : `toggleState('kInputChannelOn/kChannelOn', ${i})`;
    if ((musicianMode || technicianMixMode) && !isMaster) {
        onAction = `toggleState('kInputAUX/kAUX${activeMix}On', ${i})`;
    }

    let patchText = '--';
    if (!isMaster && window.PatchRegistry) {
        patchText = s.paired && s.pairedWith !== null
            ? window.PatchRegistry.getPairedChannelInput(i, s.pairedWith)
            : window.PatchRegistry.getChannelInput(i);
    }

    return createDesktopStrip({
        id: isMaster ? 'master' : i,
        evtCh: isMaster ? "'master'" : i,
        title,
        name: nameDiv,
        customClass,
        isMaster,
        idPrefix,
        hasSolo: !isMaster && !musicianMode && !technicianMixMode,
        onAction,
        val,
        isOn,
        solo,
        dbLabel: rawToDb(val, false, isMaster),
        configAction: musicianMode ? "" : (idPrefix ? "" : `openChannelConfig(event, ${isMaster ? 52 : i})`), // Evita recursão no mini-fader
        type: "main",
        isPaired: isMaster || (!isMaster && s.paired),
        partnerId: !isMaster && s.paired ? s.pairedWith : (isMaster ? 'master-r' : null),
        dataCh: isMaster ? "master" : i,
        patchText
    });
}

/**
 * 🚨 [CRITICAL SYNC LOGIC]
 * Componente universal para faders MOBILE.
 */
function createMobileStrip(config) {
    const {
        id,
        title,
        name,
        customClass = "",
        onAction,
        configAction = "",
        isMaster = false,
        hasSolo = false,
        evtCh,
        onInputAction = "faderInput",
        onNudgeStartAction = "startNudge",
        onNudgeStopAction = "stopNudge",
        ids = {},
        val = 0,
        dbLabel = "-∞",
        isOn = false,
        dataCh = "",
        onTop = false,   // Se true, renderiza o botão ON antes do título/fader
        isPaired = false,
        partnerId = null
    } = config;

    const pfx = config.idPrefix || "";
    const fId = ids.f || `${pfx}f${id}`;
    const vId = ids.v || `${pfx}v${id}`;
    const onId = ids.on || `${pfx}on${id}`;
    const soloId = ids.solo || `${pfx}solo${id}`;
    const nameId = ids.name || `${pfx}name${id}`;
    const cardId = ids.card || `${pfx}card${id}`;

    const inputCall = `${onInputAction}(event, ${evtCh})`;
    const onBtn = `<button id="${onId}" class="btn-state ${isOn ? 'on-active' : ''}" onclick="${onAction}">On</button>`;

    return `
        <div class="fader-card ${customClass}" id="${cardId}" ${dataCh !== undefined && dataCh !== '' ? `data-ch="${dataCh}"` : ''} ${partnerId !== null ? `data-partner-ch="${partnerId}"` : ''}>
            ${isPaired ? `
            <div class="mobile-meter-bg left"><div class="mobile-meter-curtain"></div></div>
            <div class="mobile-meter-bg right"><div class="mobile-meter-curtain"></div></div>
            ` : `
            <div class="mobile-meter-bg"><div class="mobile-meter-curtain"></div></div>
            `}
            ${getMobileScaleHTML()}
            ${onTop ? onBtn : ''}
            <div class="ch-clickable-zone top" onclick="${pfx && pfx === 'mini-' && config.type === 'main' ? 'openNameEditor()' : configAction}">
                <h2 class="card-title">${title}</h2>
                <div id="${nameId}" class="ch-name">${name}</div>
            </div>
            
            ${hasSolo ? `<button id="${soloId}" class="btn-state" onclick="${pfx === 'mini-' ? `soloReplace('kSetupSoloChOn/kSoloChOn', ${evtCh})` : `toggleState('kSetupSoloChOn/kSoloChOn', ${evtCh})`}">Solo</button>` : isMaster ? `<button id="master-solo-btn" class="btn-state" disabled onclick="clearAllSolos()">SOLO</button>` : config.topExtraHtml !== undefined ? config.topExtraHtml : ''}
            ${!onTop ? onBtn : ''}
            ${isMaster ? `
            <button class="btn-state mobile-master-medidores-btn" onclick="openMeterConfigModal('master')">MEDIDORES</button>
            ` : ''}

            <div class="nudge-zone" onpointerdown="${onNudgeStartAction}(${evtCh}, 1)" onpointerup="${onNudgeStopAction}()" onpointerleave="${onNudgeStopAction}()" onpointercancel="${onNudgeStopAction}()" oncontextmenu="return false;" onclick="event.stopPropagation()">
                <button class="btn-nudge pointer-none">+</button>
            </div>
            
            <div class="fader-rotated-container">
                <input type="range" id="${fId}" min="0" max="1023" value="${val}" orient="vertical" oninput="${inputCall}" onclick="event.stopPropagation()">
            </div>
            
            <div class="ch-clickable-zone bottom mt-auto" onclick="${configAction}">
                <div class="nudge-zone" onpointerdown="${onNudgeStartAction}(${evtCh}, -1)" onpointerup="${onNudgeStopAction}()" onpointerleave="${onNudgeStopAction}()" onpointercancel="${onNudgeStopAction}()" oncontextmenu="return false;" onclick="event.stopPropagation()">
                    <button class="btn-nudge pointer-none">-</button>
                    <h1 id="${vId}" class="fader-val">${dbLabel}</h1>
                </div>
            </div>
        </div>
    `;
}

function createChannelStrip(i, isMaster = false, idPrefix = "") {
    if (layoutMode === 'desktop') {
        return createDesktopChannelStrip(i, isMaster, idPrefix);
    }

    const s = isMaster ? masterState : channelStates[i];
    let title = isMaster ? "STEREO" : `CH ${i + 1}`;

    // Mobile title para pareado
    if (!isMaster && s.paired) {
        title = `CH ${i + 1} + ${i + 2}`;
    }

    let nameDiv = isMaster ? "MASTER" : title;
    const globalId = isMaster ? 52 : i;
    if (window.resolvedNames && window.resolvedNames[globalId]) {
        nameDiv = window.resolvedNames[globalId].name;
    }
    let customClass = isMaster ? "master-card" : "";
    if (!isMaster) {
        if (i < 16) customClass = "fader-group-1";
        else if (i < 32) customClass = "fader-group-2";

        // Aplica largura dupla no mobile
        if (s.paired) customClass += " fader-card-paired";
    }

    let val = s.value;
    let isOn = s.on;

    if ((musicianMode || technicianMixMode) && !isMaster) {
        val = s[`aux${activeMix}`] || 0;
        isOn = s[`aux${activeMix}On`] || false;
    }

    let onAction = isMaster ? "confirmMasterOn()" : `toggleState('kInputChannelOn/kChannelOn', ${i})`;
    if ((musicianMode || technicianMixMode) && !isMaster) {
        onAction = `toggleState('kInputAUX/kAUX${activeMix}On', ${i})`;
    }

    return createMobileStrip({
        id: isMaster ? 'master' : i,
        evtCh: isMaster ? "'master'" : i,
        title,
        name: nameDiv,
        customClass,
        isMaster,
        idPrefix,
        hasSolo: !isMaster && !musicianMode && !technicianMixMode,
        onAction,
        val,
        isOn,
        dbLabel: rawToDb(val, true, isMaster),
        configAction: musicianMode ? "" : (idPrefix ? "" : `openChannelConfig(event, ${isMaster ? 52 : i})`),
        type: "main",
        dataCh: isMaster ? "master" : i,
        onTop: musicianMode,  // Botão ON no topo apenas no modo músico
        isPaired: isMaster || (!isMaster && s.paired),
        partnerId: !isMaster && s.paired ? s.pairedWith : (isMaster ? 'master-r' : null)
    });
}

function createDesktopOutputStrip(i, type, idPrefix = "") {
    let prefix, title, cmdPrefix, customClass, configId, ch, stateRef;

    if (type === 'mix') {
        prefix = 'm';
        title = `MIX ${i + 1}`;
        cmdPrefix = 'kAUX';
        customClass = "fader-group-mix";
        configId = 36 + i;
        ch = `'m${i}'`;
        stateRef = mixesState[i];
    } else if (type === 'bus') {
        prefix = 'b';
        title = `BUS ${i + 1}`;
        cmdPrefix = 'kBus';
        customClass = "fader-group-bus";
        configId = 44 + i;
        ch = `'b${i}'`;
        stateRef = busesState[i];
    } else if (type === 'stIn') {
        prefix = 'st';
        title = `ST IN ${i + 1}`;
        cmdPrefix = 'kInput';
        customClass = "fader-group-st";
        configId = 60 + (i * 2);
        ch = 32 + (i * 2);
        stateRef = channelStates[ch];
    }

    let nameDiv = title;
    if (window.resolvedNames && window.resolvedNames[configId]) {
        nameDiv = window.resolvedNames[configId].name;
    }
    if (stateRef && stateRef.paired && i % 2 === 0 && (type === 'mix' || type === 'bus')) {
        const label = type === 'mix' ? 'MIX' : 'BUS';
        title = `${label} ${i + 1} + ${i + 2}`;
    }
    const actionCh = type === 'stIn' ? configId : ch;

    let patchText = '--';
    if (window.PatchRegistry) {
        if (type === 'stIn') {
            patchText = window.PatchRegistry.getPairedChannelInput(ch, ch + 1);
        } else if (type === 'mix') {
            if (stateRef && stateRef.paired && i % 2 === 0) {
                const out1 = window.PatchRegistry.getMixOutput(i);
                const out2 = window.PatchRegistry.getMixOutput(i + 1);
                patchText = (out1 === out2) ? out1 : `${out1} | ${out2}`;
            } else {
                patchText = window.PatchRegistry.getMixOutput(i);
            }
        } else if (type === 'bus') {
            if (stateRef && stateRef.paired && i % 2 === 0) {
                const out1 = window.PatchRegistry.getBusOutput(i);
                const out2 = window.PatchRegistry.getBusOutput(i + 1);
                patchText = (out1 === out2) ? out1 : `${out1} | ${out2}`;
            } else {
                patchText = window.PatchRegistry.getBusOutput(i);
            }
        }
    }

    return createDesktopStrip({
        id: prefix + i,
        evtCh: actionCh,
        title,
        name: nameDiv,
        customClass,
        idPrefix,
        onAction: `toggleState('${cmdPrefix}ChannelOn/kChannelOn', ${actionCh})`,
        configAction: `openChannelConfig(event, ${configId})`,
        type: "output",
        hasSolo: true,
        solo: stateRef.solo,
        isPaired: type === 'stIn',
        partnerId: type === 'stIn' ? configId + 1 : null,
        hasPan: type === 'stIn',
        dataCh: configId,
        patchText,
        auxSectionHtml: (type === 'mix' && idPrefix === 'mini-') ? `
            <div class="master-meter-section aux-position-section" onclick="openAuxConfigModal(${i})">
                <div class="master-meter-divider">POSIÇÃO</div>
                <div class="master-meter-group">
                    <span class="master-meter-label">GLOBAL:</span>
                    <span id="aux-global-badge-${i}" class="master-meter-badge">${window.getMixBusGlobalLabel ? window.getMixBusGlobalLabel(i) : 'PRE'}</span>
                </div>
                <div class="master-meter-group">
                    <span class="master-meter-label">PRE-P:</span>
                    <span id="aux-prepoint-badge-${i}" class="master-meter-badge">${window.getMixBusPrePointLabel ? window.getMixBusPrePointLabel(i) : 'POST ON'}</span>
                </div>
            </div>
        ` : ''
    });
}

function createOutputStrip(i, type, idPrefix = "") {
    if (layoutMode === 'desktop') return createDesktopOutputStrip(i, type, idPrefix);

    let prefix, title, cmdPrefix, customClass, configId, ch, stateRef;

    if (type === 'mix') {
        prefix = 'm';
        title = `MIX ${i + 1}`;
        cmdPrefix = 'kAUX';
        customClass = "fader-group-mix";
        configId = 36 + i;
        ch = `'m${i}'`;
        stateRef = mixesState[i];
    } else if (type === 'bus') {
        prefix = 'b';
        title = `BUS ${i + 1}`;
        cmdPrefix = 'kBus';
        customClass = "fader-group-bus";
        configId = 44 + i;
        ch = `'b${i}'`;
        stateRef = busesState[i];
    } else if (type === 'stIn') {
        prefix = 'st';
        title = `ST IN ${i + 1}`;
        cmdPrefix = 'kInput';
        customClass = "fader-group-st";
        configId = 60 + (i * 2);
        ch = 32 + (i * 2);
        stateRef = channelStates[ch];
    }

    let nameDiv = title;
    if (window.resolvedNames && window.resolvedNames[configId]) {
        nameDiv = window.resolvedNames[configId].name;
    }
    if (stateRef && stateRef.paired && i % 2 === 0 && (type === 'mix' || type === 'bus')) {
        const label = type === 'mix' ? 'MIX' : 'BUS';
        title = `${label} ${i + 1} + ${i + 2}`;
    }
    const actionCh = type === 'stIn' ? configId : ch;

    const pfx = idPrefix || "";
    return `
        <div class="fader-card ${customClass}" id="${pfx}card${prefix}${i}" ${type === 'stIn' ? `data-ch="${configId}" data-partner-ch="${configId + 1}"` : `data-ch="${configId}"`}>
            ${type === 'stIn' ? `
            <div class="mobile-meter-bg left"><div class="mobile-meter-curtain"></div></div>
            <div class="mobile-meter-bg right"><div class="mobile-meter-curtain"></div></div>
            ` : `
            <div class="mobile-meter-bg"><div class="mobile-meter-curtain"></div></div>
            `}
            ${getMobileScaleHTML()}
            <div class="ch-clickable-zone top" onclick="${idPrefix ? "" : `openChannelConfig(event, ${configId})`}">
                <h2 class="card-title" style="color: ${type === 'mix' ? '#ffcc00' : type === 'bus' ? '#00ffcc' : '#ff00ff'}">${title}</h2>
                <div id="${pfx}name${prefix}${i}" class="ch-name">${nameDiv}</div>
            </div>
            
            <button id="${pfx}solo${prefix}${i}" class="btn-state" onclick="${pfx === 'mini-' ? `soloReplace('kSetupSoloChOn/kSoloChOn', ${actionCh})` : `toggleState('kSetupSoloChOn/kSoloChOn', ${actionCh})`}">Solo</button>
            <button id="${pfx}on${prefix}${i}" class="btn-state" onclick="toggleState('${cmdPrefix}ChannelOn/kChannelOn', ${actionCh})">On</button>
            ${type === 'mix' && idPrefix === 'mini-' ? `<button class="btn-state mobile-master-medidores-btn" onclick="openAuxConfigModal(${i})">POSIÇÃO</button>` : ''}

            <div class="nudge-zone" onpointerdown="startNudge(${actionCh}, 1)" onpointerup="stopNudge()" onpointerleave="stopNudge()" onpointercancel="stopNudge()" oncontextmenu="return false;" onclick="event.stopPropagation()">
                <button class="btn-nudge pointer-none">+</button>
            </div>
            
            <div class="fader-rotated-container">
                <input type="range" id="${pfx}f${prefix}${i}" min="0" max="1023" value="0" orient="vertical" oninput="faderInput(event, ${actionCh})" onclick="event.stopPropagation()">
            </div>
            
            <div class="ch-clickable-zone bottom mt-auto" onclick="${type === 'mix' && !idPrefix ? `enterTechnicianMixMode(${i})` : ''}">
                <div class="nudge-zone" onpointerdown="startNudge(${actionCh}, -1)" onpointerup="stopNudge()" onpointerleave="stopNudge()" onpointercancel="stopNudge()" oncontextmenu="return false;" onclick="event.stopPropagation()">
                    <button class="btn-nudge pointer-none">-</button>
                    <h1 id="${pfx}v${prefix}${i}" class="fader-val">-∞</h1>
                </div>
            </div>
        </div>
    `;
}

function getMobileScaleHTML() {
    if (musicianMode) return '';
    const marks = [0, -10, -30];
    let html = '<div class="mobile-db-scale-overlay">';
    marks.forEach(db => {
        const raw = dbToRaw(db);
        const topPercent = 100 - ((raw / 1023) * 100);
        html += `<div class="mobile-db-tick" style="top: ${topPercent}%"><span>${db}</span></div>`;
    });
    html += '</div>';
    return html;
}

function isValidChannelForLayer(i) {
    if (!layerNavEnabled) return true;
    const isMain = !musicianMode && !outsMode && !technicianMixMode && activeConfigChannel === null;
    if (!isMain) return true;
    return i >= activeLayerStart && i < activeLayerStart + 16;
}

function initUI() {
    if (typeof resetFaderCache === 'function') resetFaderCache();
    let html = '';

    const sidebar = document.querySelector('.sidebar');
    if (!sidebar) return;
    if (musicianMode) {
        sidebar.classList.add('sidebar-musician');
        document.body.classList.add('musician-active');
    } else {
        sidebar.classList.remove('sidebar-musician');
        document.body.classList.remove('musician-active');
    }

    const isConfig = activeConfigChannel !== null;

    let dockMode;
    if (musicianMode) {
        dockMode = 'musician';
    } else if (isConfig) {
        dockMode = 'channelConfig';
    } else if (technicianMixMode) {
        dockMode = 'techMix';
    } else if (outsMode) {
        dockMode = 'outs';
    } else {
        dockMode = 'main';
    }

    if (typeof renderDock === 'function') renderDock(dockMode);
    if (typeof updateSidebarInfo === 'function') updateSidebarInfo();

    // DOCK & MACROS visibility in Musician Mode
    const macrosPanel = document.getElementById('sidebarMacros');
    if (macrosPanel) {
        macrosPanel.style.display = musicianMode ? 'none' : 'block';
    }

    const dockPanel = document.getElementById('sidebarDock');
    if (dockPanel) dockPanel.style.display = musicianMode ? 'none' : 'block';

    const musicianExitBtn = document.getElementById('musicianExitBtn');
    if (musicianExitBtn) musicianExitBtn.style.setProperty('display', musicianMode ? 'flex' : 'none', 'important');

    const musicianMetersBtn = document.getElementById('musicianMetersBtn');
    if (musicianMetersBtn) musicianMetersBtn.style.setProperty('display', musicianMode ? 'flex' : 'none', 'important');

    const volumeGeralBtn = document.getElementById('volumeGeralBtn');
    if (volumeGeralBtn) volumeGeralBtn.style.setProperty('display', musicianMode ? 'flex' : 'none', 'important');

    const musicianFsBtn = document.getElementById('musicianFsBtn');
    if (musicianFsBtn) {
        const isStandalone = window.navigator.standalone === true;
        if (musicianMode && !isStandalone) {
            musicianFsBtn.style.removeProperty('display');
        } else {
            musicianFsBtn.style.setProperty('display', 'none', 'important');
        }
    }

    if (outsMode && !musicianMode && !technicianMixMode) {
        for (let i = 0; i < 8; i++) {
            if (mixesState[i] && mixesState[i].paired && i % 2 !== 0) continue;
            html += createOutputStrip(i, 'mix');
        }
        for (let i = 0; i < 8; i++) {
            if (busesState[i] && busesState[i].paired && i % 2 !== 0) continue;
            html += createOutputStrip(i, 'bus');
        }
        for (let i = 0; i < 4; i++) html += createOutputStrip(i, 'stIn');
    } else {
        for (let i = 0; i < NUM_CHANNELS; i++) {
            if (!isValidChannelForLayer(i)) continue;
            const state = channelStates[i];
            // Se estiver pareado, pulamos a renderização do canal PAR (o segundo do par)
            if (state && state.paired && i % 2 !== 0) {
                continue;
            }
            html += createChannelStrip(i, false);
        }
    }

    let masterHtml = '';
    if (technicianMixMode) {
        masterHtml = createOutputStrip(activeMix - 1, 'mix');
    } else if (!musicianMode) {
        masterHtml = createChannelStrip(0, true);
    }

    // Injetar Macro Fader na string HTML se o módulo estiver carregado e estivermos EXCLUSIVAMENTE na tela principal (CH 1-32)
    if (typeof getMacroFaderHtml === 'function' && !musicianMode && !outsMode && !technicianMixMode && activeConfigChannel === null) {
        html += '<div style="flex: 0 0 55px !important; width: 55px !important; background: transparent !important;"></div>';
        html += getMacroFaderHtml();
        html += '<div style="flex: 0 0 55px !important; width: 55px !important; background: transparent !important;"></div>';
    }

    const masterContainer = document.getElementById('master-container');
    if (musicianMode) {
        if (masterContainer && typeof getVolumeGeralHtml === 'function' && window.showVolumeGeral !== false) {
            masterContainer.innerHTML = getVolumeGeralHtml();
            masterContainer.style.cssText = 'display:flex !important; flex-shrink:0 !important; order:1 !important; border-left:1px solid #000; background:#111; align-items:stretch;';
        } else if (masterContainer) {
            masterContainer.innerHTML = '';
            masterContainer.style.cssText = 'display:none !important;';
        }
        container.innerHTML = html;
    } else if (layoutMode === 'desktop') {
        container.innerHTML = html;
        if (masterContainer) {
            masterContainer.innerHTML = masterHtml;
            masterContainer.style.cssText = '';
        }
    } else {
        container.innerHTML = html + masterHtml;
        if (masterContainer) {
            masterContainer.innerHTML = '';
            masterContainer.style.cssText = '';
        }
    }

    // Atualiza os estados visuais
    if (outsMode && !musicianMode && !technicianMixMode) {
        for (let i = 0; i < 8; i++) {
            updateUI(`m${i}`, mixesState[i].value, mixesState[i].on, undefined);
            updateUI(`b${i}`, busesState[i].value, busesState[i].on, undefined);
        }
        for (let i = 0; i < 4; i++) {
            const stCh = 32 + (i * 2);
            const globalId = 60 + (i * 2);
            const state = channelStates[stCh];
            if (state) updateUI(globalId, state.value, state.on, undefined);
        }
    } else {
        for (let i = 0; i < NUM_CHANNELS; i++) {
            if (!isValidChannelForLayer(i)) continue;
            const state = channelStates[i];
            if (!state) continue;
            if (musicianMode || technicianMixMode) {
                updateUI(i, state[`aux${activeMix}`] || 0, state[`aux${activeMix}On`] || false, undefined);
            } else {
                updateUI(i, state.value, state.on, state.solo);
            }
            const nameEl = document.getElementById(`name${i}`);
            if (nameEl) {
                let dName = `CH ${i + 1}`;
                const globalId = i;
                if (window.resolvedNames && window.resolvedNames[globalId]) {
                    dName = window.resolvedNames[globalId].name;
                }
                nameEl.innerText = dName;
            }
        }
    }

    // CORREÇÃO: Atualiza o fader master do Mix se estivermos em modo Mix
    if (technicianMixMode || musicianMode) {
        const mixIdx = activeMix - 1;
        updateUI(`m${mixIdx}`, mixesState[mixIdx].value, mixesState[mixIdx].on, undefined);
    }
    if (!technicianMixMode || !outsMode) {
        updateUI('master', masterState.value, masterState.on, undefined);
    }

    // Inicializa os indicadores de Pan (apenas no layout desktop)
    if (layoutMode === 'desktop') {
        for (let i = 0; i < NUM_CHANNELS; i++) {
            if (!isValidChannelForLayer(i)) continue;
            const s = channelStates[i];
            if (s && s.pan !== undefined) updatePanIndicator(i, s.pan);
        }
        // ST IN (globais 60-67)
        for (let stGlobal = 60; stGlobal <= 67; stGlobal++) {
            const s = channelStates[32 + (stGlobal - 60)];
            if (s && s.pan !== undefined) updatePanIndicator(stGlobal, s.pan);
        }
        if (masterState.pan !== undefined) updatePanIndicator('master', masterState.pan);
    }

    // Verifica estado inicial dos solos após renderizar a UI
    checkMasterSoloIndicator();
}

/**
 * Substitui o solo: limpa todos os canais solados e ativa o solo no canal alvo.
 * Usado no mini fader (tela de config individual) para comportamento "solo replace"
 * — diferente do toggleState aditivo usado na tela principal.
 * Envia comandos sequenciais com delay de 30ms para não congestionar a fila MIDI.
 */
async function soloReplace(type, ch) {
    // Converte o identificador do canal para global ID numérico
    const targetCh = (typeof ch === 'string' && ch.startsWith('m')) ? 36 + parseInt(ch.substring(1), 10)
        : (typeof ch === 'string' && ch.startsWith('b')) ? 44 + parseInt(ch.substring(1), 10)
            : (ch === 'master' || ch === 52) ? 52
                : ch;

    const toClear = [];

    // Inputs 0-31
    for (let i = 0; i < NUM_CHANNELS; i++) {
        if (channelStates[i]?.solo) toClear.push(i);
    }
    // ST IN (channelStates 32-35)
    for (let i = 0; i < 4; i++) {
        if (channelStates[32 + i]?.solo) toClear.push(60 + i * 2);
    }
    // Mixes
    for (let i = 0; i < 8; i++) {
        if (mixesState[i]?.solo) toClear.push(36 + i);
    }
    // Buses
    for (let i = 0; i < 8; i++) {
        if (busesState[i]?.solo) toClear.push(44 + i);
    }
    // Master
    if (masterState?.solo) toClear.push(52);

    // Se o alvo já está solado, apenas dessola (toggle off) — não mexe nos outros
    if (getChannelStateById(targetCh)?.solo) {
        updateUI(targetCh, undefined, undefined, false);
        if (appReady) {
            let emitCh = targetCh;
            if (targetCh === 52) emitCh = 0;
            else if (targetCh >= 36 && targetCh <= 43) emitCh = 40 + (targetCh - 36);
            else if (targetCh >= 44 && targetCh <= 51) emitCh = 48 + (targetCh - 44);
            socket.emit('control', { type, channel: emitCh, value: 0 });
        }
        return;
    }

    // Remove o alvo da lista para evitar flicker (desligar e religar)
    const filtered = toClear.filter(id => id !== targetCh);

    console.log(`[SOLO REPLACE] Alvo: ${targetCh}. Limpando solo de:`, filtered);

    // Desliga todos os outros solados
    for (const globalId of filtered) {
        updateUI(globalId, undefined, undefined, false);
        if (appReady) {
            let emitCh = globalId;
            if (globalId === 52) emitCh = 0;
            else if (globalId >= 36 && globalId <= 43) emitCh = 40 + (globalId - 36);
            else if (globalId >= 44 && globalId <= 51) emitCh = 48 + (globalId - 44);
            socket.emit('control', { type, channel: emitCh, value: 0 });
        }
        await new Promise(r => setTimeout(r, 30));
    }

    // Solo o alvo
    updateUI(targetCh, undefined, undefined, true);
    if (appReady) {
        let emitCh = targetCh;
        if (targetCh === 52) emitCh = 0;
        else if (targetCh >= 36 && targetCh <= 43) emitCh = 40 + (targetCh - 36);
        else if (targetCh >= 44 && targetCh <= 51) emitCh = 48 + (targetCh - 44);
        socket.emit('control', { type, channel: emitCh, value: 1 });
    }
}

/**
 * Verifica se há canais com solo ativo e atualiza o indicador no botão SOLO do master.
 * Roda no frontend puro, sem tráfego MIDI extra.
 */
function checkMasterSoloIndicator() {
    const hasSolo = channelStates.some(s => s && !!s.solo);
    const btn = document.getElementById('master-solo-btn');
    if (!btn) return;
    if (hasSolo) {
        btn.classList.add('master-solo-alert');
        btn.disabled = false; // Habilita o clique quando há algo a limpar
    } else {
        btn.classList.remove('master-solo-alert');
        btn.disabled = true;  // Desabilita quando não há solos ativos
    }
}

/**
 * Desativa o solo de todos os canais que estão solados, enviando os comandos
 * de forma sequencial com delay de 30ms entre cada um para evitar
 * congestionamento na fila MIDI (mesmo padrão das macros).
 */
async function clearAllSolos() {
    const soloedChannels = [];
    for (let i = 0; i < NUM_CHANNELS; i++) {
        if (channelStates[i] && !!channelStates[i].solo) {
            soloedChannels.push(i);
        }
    }
    if (soloedChannels.length === 0) return;

    console.log(`[MASTER SOLO] Limpando solo de ${soloedChannels.length} canal(is):`, soloedChannels);

    // Desativa o botão imediatamente para evitar cliques duplos
    const btn = document.getElementById('master-solo-btn');
    if (btn) { btn.disabled = true; btn.classList.remove('master-solo-alert'); }

    for (const ch of soloedChannels) {
        // Atualiza UI local imediatamente (sem esperar confirmação da mesa)
        updateUI(ch, undefined, undefined, false);
        // Envia comando MIDI via socket
        if (appReady) {
            socket.emit('control', { type: 'kSetupSoloChOn/kSoloChOn', channel: ch, value: 0 });
        }
        // Delay entre envios para não congestionar a fila
        await new Promise(r => setTimeout(r, 30));
    }
}

/**
 * Abre o modal de configuração da posição dos medidores.
 * Ao abrir não envia nada à mesa — somente sincroniza o estado já conhecido.
 */
window.openMeterConfigModal = function (target) {
    const modal = document.getElementById('meterConfigModal');
    if (!modal) return;
    // Sincroniza os botões ativos com o último estado conhecido antes de exibir.
    if (typeof window.updateMeterConfigModalUI === 'function') {
        window.updateMeterConfigModalUI('channels', window.currentMeterPosChannels || 'pre');
        window.updateMeterConfigModalUI('master', window.currentMeterPosMaster || 'pre');
    }
    modal.style.display = 'flex';
    console.log(`[MEDIDORES CONFIG] Modal aberto (${target}).`);
};

/**
 * Atualiza o texto do botão indicador de medidores no canal Master (Desktop)
 * e o botão ativo do modal de configuração de medidores.
 * @param {'master' | 'channels'} target 
 * @param {number | string} mode (0/pre_eq => "PRE EQ", 1/pre => "PRE", 2/post => "POST")
 */
window.updateMeterIndicatorUI = function (target, mode) {
    let label = 'PRE';
    let modeKey = 'pre';
    if (mode === 0 || mode === '00' || mode === 'pre_eq') { label = 'PREEQ'; modeKey = 'pre_eq'; }
    else if (mode === 1 || mode === '01' || mode === 'pre' || mode === 'pre_fader') { label = 'PRE'; modeKey = 'pre'; }
    else if (mode === 2 || mode === '02' || mode === 'post' || mode === 'post_fader') { label = 'POST'; modeKey = 'post'; }

    if (target === 'master') {
        window.currentMeterPosMasterLabel = label;
        window.currentMeterPosMaster = modeKey;
        document.querySelectorAll('.desk-master-meters-toggle .master-badge').forEach(el => {
            el.textContent = label;
        });
    } else {
        window.currentMeterPosChannelsLabel = label;
        window.currentMeterPosChannels = modeKey;
        document.querySelectorAll('.desk-master-meters-toggle .channels-badge').forEach(el => {
            el.textContent = label;
        });
    }

    const btnId = target === 'master' ? 'master-meter-indicator-btn' : 'channels-meter-indicator-btn';
    const btn = document.getElementById(btnId);
    if (btn) {
        btn.textContent = label;
    }
    if (typeof window.updateMeterConfigModalUI === 'function') {
        window.updateMeterConfigModalUI(target, modeKey);
    }
    console.log(`[MEDIDORES UI] Indicador ${target} atualizado para: ${label}`);
};

/**
 * Atualiza o botão ativo (visual) do modal de configuração de medidores.
 * @param {'master' | 'channels'} target 
 * @param {string} modeKey ('pre_eq' | 'pre' | 'post')
 */
window.updateMeterConfigModalUI = function (target, modeKey) {
    const groupId = target === 'master' ? 'meterConfigMasterGroup' : 'meterConfigChannelsGroup';
    const group = document.getElementById(groupId);
    if (!group) return;
    group.querySelectorAll('.meter-config-pos-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.mode === modeKey);
    });
};

/**
 * Envia o write global de posição dos medidores (0D 03 0C) para a mesa.
 * @param {'master' | 'channels'} target 
 * @param {'pre_eq' | 'pre' | 'post'} modeKey
 */
window.setMeterPosition = function (target, modeKey) {
    const valueMap = { pre_eq: 0, pre: 1, post: 2 };
    const typeMap = {
        channels: 'kSetupMeterSetup/kMeterSetupInpPoint',
        master: 'kSetupMeterSetup/kMeterSetupOutPoint'
    };
    const value = valueMap[modeKey];
    const type = typeMap[target];
    if (typeof socket !== 'undefined' && socket && typeof socket.emit === 'function') {
        socket.emit('control', { type, channel: 0, value });
    }
    console.log(`[MEDIDORES CONFIG] Write 0D 03 0C (${type}) = ${value} (${modeKey})`);
    if (typeof window.updateMeterIndicatorUI === 'function') {
        window.updateMeterIndicatorUI(target, modeKey);
    }
};

/**
 * Abre o modal de confirmação apenas ao DESLIGAR o canal MASTER.
 * Se o canal estiver desligado, ele é ligado diretamente sem confirmação.
 */
window.confirmMasterOn = function () {
    if (!masterState.on) {
        toggleState('kStereoChannelOn/kChannelOn', 'master');
        return;
    }

    ConfirmModal.show({
        title: 'DESLIGAR CANAL MASTER',
        message: 'O canal master está LIGADO. Deseja DESLIGAR o áudio agora?',
        type: 'danger',
        confirmText: 'SIM, DESLIGAR',
        cancelText: 'CANCELAR'
    }).then(function (ok) {
        if (ok) toggleState('kStereoChannelOn/kChannelOn', 'master');
    });
};

