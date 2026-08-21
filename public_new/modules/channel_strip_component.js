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
import { rawToDb, dbToRaw, getSteppedRaw, getChannelStateById, getChannelLabel, getLockIdForDataCh } from './utils.js';
import { uiState, channelStates } from './state.js';
import { emit } from './socket-client.js';

// ==========================================
// Macro Configuration Modal & State Management
// ==========================================
export function getMacroSelectedChannels() {
    try {
        return JSON.parse(localStorage.getItem('macro_selected_channels')) || [];
    } catch (_) {
        return [];
    }
}

export function setMacroSelectedChannels(channels) {
    localStorage.setItem('macro_selected_channels', JSON.stringify(channels));
}

export function getMacroLockedChannels() {
    try {
        return JSON.parse(localStorage.getItem('macro_locked_channels')) || [];
    } catch (_) {
        return [];
    }
}

export function setMacroLockedChannels(channels) {
    localStorage.setItem('macro_locked_channels', JSON.stringify(channels));
}

let tempMacroChannels = [];

export function openMacroConfigModal(options = {}) {
    let modal = document.getElementById('macroSettingsModal');
    const isLockMode = Boolean(options.isMusicianMode ?? uiState.musicianMode);

    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'macroSettingsModal';
        modal.className = 'macro-settings-modal-overlay';
        modal.style.cssText = 'position:fixed; inset:0; background:rgba(0,0,0,0.85); z-index:100000; display:flex; align-items:center; justify-content:center; padding:16px; box-sizing:border-box;';
        modal.innerHTML = `
            <div id="macroSettingsModalContent" class="macro-settings-modal-content" style="background:#18181b; border:2px solid #00ffcc; border-radius:12px; max-width:680px; width:100%; max-height:90vh; display:flex; flex-direction:column; padding:20px; box-sizing:border-box; box-shadow:0 10px 40px rgba(0,0,0,0.8);" onclick="event.stopPropagation()">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; border-bottom:1px solid #27272a; padding-bottom:10px;">
                    <div>
                        <h2 id="settingsMacroTitle" style="margin:0; font-size:16px; font-weight:bold; color:#00ffcc;">CONFIGURAÇÃO MACRO FADER</h2>
                        <p id="settingsMacroSubtitle" style="margin:4px 0 0 0; font-size:12px; color:#888;">Selecione os canais desejados abaixo:</p>
                    </div>
                    <button id="macroModalCloseBtn" style="background:transparent; border:none; color:#aaa; font-size:22px; cursor:pointer; padding:4px 8px;">&times;</button>
                </div>
                <div id="macroSettingsGrid" style="display:grid; grid-template-columns:repeat(auto-fill, minmax(65px, 1fr)); gap:6px; overflow-y:auto; flex:1; padding:4px 0; margin-bottom:16px;"></div>
                <div style="display:flex; gap:10px; justify-content:flex-end;">
                    <button id="macroModalCancelBtn" style="padding:10px 18px; background:#27272a; color:#fff; border:1px solid #3f3f46; border-radius:6px; font-size:12px; font-weight:bold; cursor:pointer;">CANCELAR</button>
                    <button id="macroModalSaveBtn" style="padding:10px 22px; background:#00ffcc; color:#000; border:none; border-radius:6px; font-size:12px; font-weight:bold; cursor:pointer;">SALVAR</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);

        modal.addEventListener('click', () => closeMacroConfigModal());
        modal.querySelector('#macroModalCloseBtn').addEventListener('click', () => closeMacroConfigModal());
        modal.querySelector('#macroModalCancelBtn').addEventListener('click', () => closeMacroConfigModal());
    }

    modal._currentIsLockMode = isLockMode;

    const saveBtn = modal.querySelector('#macroModalSaveBtn');
    // Substitui handler de salvar para respeitar o modo atual
    const newSaveBtn = saveBtn.cloneNode(true);
    saveBtn.parentNode.replaceChild(newSaveBtn, saveBtn);
    newSaveBtn.addEventListener('click', () => {
        if (modal._currentIsLockMode) {
            setMacroLockedChannels(tempMacroChannels);
        } else {
            setMacroSelectedChannels(tempMacroChannels);
        }
        closeMacroConfigModal();
    });

    const title = modal.querySelector('#settingsMacroTitle');
    const subtitle = modal.querySelector('#settingsMacroSubtitle');
    const content = modal.querySelector('#macroSettingsModalContent');

    if (isLockMode) {
        title.innerText = 'CANAIS PROTEGIDOS';
        title.style.color = '#ff4444';
        content.style.borderColor = '#ff4444';
        newSaveBtn.style.background = '#ff4444';
        newSaveBtn.style.color = '#fff';
        if (subtitle) subtitle.innerText = 'Toque nos canais que NÃO quer mexer:';
        tempMacroChannels = [...getMacroLockedChannels()];
    } else {
        title.innerText = 'CONFIGURAÇÃO MACRO FADER';
        title.style.color = '#00ffcc';
        content.style.borderColor = '#00ffcc';
        newSaveBtn.style.background = '#00ffcc';
        newSaveBtn.style.color = '#000';
        if (subtitle) subtitle.innerText = 'Selecione os canais desejados abaixo:';
        tempMacroChannels = [...getMacroSelectedChannels()];
    }

    renderMacroConfigGrid(isLockMode);
    modal.style.display = 'flex';
}

export function closeMacroConfigModal() {
    const modal = document.getElementById('macroSettingsModal');
    if (modal) modal.style.display = 'none';
}

function renderMacroConfigGrid(isLockMode = uiState.musicianMode) {
    const grid = document.getElementById('macroSettingsGrid');
    if (!grid) return;
    grid.innerHTML = '';

    for (let i = 0; i < 32; i++) {
        const isSelected = tempMacroChannels.includes(i);
        const state = (channelStates && channelStates[i]) ? channelStates[i] : {};
        const isOnMixer = state.on === true;

        // Resolução estrita de prioridade: resMap > globalMap > customName > channelState.name > DOM channel-strip name > fallback
        const resMap = uiState.resolvedNames || (typeof window !== 'undefined' ? window.resolvedNames : null);
        const globalMap = uiState.globalNames || (typeof window !== 'undefined' ? window.globalNames : null);
        let resolved = '';

        if (resMap && resMap[i]) {
            resolved = typeof resMap[i] === 'object' ? (resMap[i].name || resMap[i].short || '') : resMap[i];
        } else if (globalMap && globalMap[i]) {
            resolved = typeof globalMap[i] === 'object' ? (globalMap[i].name || globalMap[i].short || '') : globalMap[i];
        } else if (state.customName) {
            resolved = state.customName;
        } else if (state.name) {
            resolved = state.name;
        } else if (typeof document !== 'undefined') {
            const domStrip = document.querySelector(`channel-strip[data-ch="${i}"]`);
            if (domStrip) {
                resolved = domStrip.name || domStrip._name || '';
            }
        }

        if (!resolved) {
            resolved = `CH ${i + 1}`;
        }

        const btn = document.createElement('button');
        btn.className = `btn-macro-chan-select ${isSelected ? (isLockMode ? 'macro-ch-locked' : 'macro-ch-selected') : ''}`;
        btn.style.cssText = 'position:relative; height:46px; border-radius:6px; font-size:11px; font-weight:bold; cursor:pointer; display:flex; flex-direction:column; align-items:center; justify-content:center; transition:all 0.15s ease; user-select:none; border:1px solid #333;';

        const isPhysicallyLocked = (window.lockedChannels && window.lockedChannels.includes('CH' + (i + 1))) || (uiState.lockedChannels && uiState.lockedChannels.includes('CH' + (i + 1)));

        let lockBadgeHtml = '';
        if (isPhysicallyLocked) {
            btn.style.background = 'rgba(255, 68, 68, 0.15)';
            btn.style.color = '#888';
            btn.style.borderColor = '#ff4444';
            btn.style.borderStyle = 'dashed';
            btn.style.cursor = 'not-allowed';
            btn.style.pointerEvents = 'none';

            lockBadgeHtml = `
                <div style="position:absolute; top:3px; right:4px; color:#ff6666; opacity:0.85; display:flex; align-items:center;">
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
                        <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                        <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                    </svg>
                </div>
            `;
        } else if (isLockMode && isSelected) {
            btn.style.background = '#cc3333';
            btn.style.color = '#fff';
            btn.style.borderColor = '#ff4444';

            lockBadgeHtml = `
                <div style="position:absolute; top:3px; right:4px; color:#fff; display:flex; align-items:center;">
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
                        <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                        <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                    </svg>
                </div>
            `;
        } else if (isSelected) {
            btn.style.background = '#ffcc00';
            btn.style.color = '#000';
            btn.style.borderColor = '#ffcc00';
        } else {
            btn.style.background = '#27272a';
            btn.style.color = '#fff';
            btn.style.borderColor = isOnMixer ? '#ffcc00' : '#3f3f46';
        }

        btn.innerHTML = `${lockBadgeHtml}<span style="font-size:10px; opacity:0.8;">CH ${i + 1}</span><span style="font-size:11px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:90%;">${resolved}</span>`;

        if (!isPhysicallyLocked) {
            btn.addEventListener('click', () => {
                const idx = tempMacroChannels.indexOf(i);
                if (idx > -1) {
                    tempMacroChannels.splice(idx, 1);
                } else {
                    tempMacroChannels.push(i);
                }
                renderMacroConfigGrid(isLockMode);
            });
        }

        grid.appendChild(btn);
    }
}

// Expõe globalmente para compatibilidade
if (typeof window !== 'undefined') {
    window.openMacroConfigModal = openMacroConfigModal;
    window.closeMacroConfigModal = closeMacroConfigModal;
    window.openMacroConfig = openMacroConfigModal;
}

export class ChannelStripComponent extends HTMLElement {
    static get observedAttributes() {
        return ['data-ch', 'preset', 'layout', 'data-partner-ch', 'disabled', 'patch', 'pan', 'partner-pan', 'locked', 'pre-post', 'data-aux-idx', 'compact', 'show-config', 'nudge-step', 'musician-mode'];
    }

    constructor() {
        super();
        this._ch = 0;
        this._auxIdx = 1;
        this._preset = 'input'; // 'input' | 'master' | 'output' | 'auxSend' | 'mini' | 'macro' | 'volumeGeral' | 'auxVolumeGeral' | 'mixVolumeGeral'
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
        this._compact = false;
        this._showConfig = false;
        this._nudgeStep = null; // Step em dB personalizado (opcional)
        this._musicianMode = null; // null: herda de uiState.musicianMode; boolean: override local via atributo
        this._isVisible = true;

        // Auto-Repeat / Long Press para Botões de Nudge (+ e -)
        this._channelNudgeTimeout = null;
        this._channelNudgeInterval = null;

        // Estado do Peak LED e Peak Glow (Hold time de 1000ms)
        this._lastPeakTime = 0;
        this._isPeakActive = false;
        this._levelL = 0;
        this._levelR = 0;
        this._peakHoldTimer = null;

        // Estado para Presets de Macro / Volume Geral
        this._deltaSteps = 0;
        this._dbResetTimer = null;
        this._nudgeTimeout = null;
        this._nudgeInterval = null;
        this._nudgeMaxDurationTimer = null;

        // Referências locais de DOM
        this._dom = {
            card: null,
            fader: null,
            faderContainer: null,
            dbVal: null,
            macroDbVal: null,
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
            patchZone: null,
            btnNudgePlus: null,
            btnNudgeMinus: null,
            btnConfig: null,
            btnZerar: null
        };

        this._observer = null;
        this._onMeterUpdate = this._handleMeterUpdate.bind(this);
    }

    connectedCallback() {
        this._parseAttributes();
        this._render();
        this._bindEvents();
        if (!this._isMacroPreset()) {
            this._setupObserver();
            this._registerMeterBus();
        }
        ChannelStripComponent.checkMasterSolo();
    }

    disconnectedCallback() {
        this._stopNudge();
        this._stopChannelNudge();
        if (this._dbResetTimer) {
            clearTimeout(this._dbResetTimer);
            this._dbResetTimer = null;
        }
        if (this._peakHoldTimer) {
            clearTimeout(this._peakHoldTimer);
            this._peakHoldTimer = null;
        }
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
            if (!this._isMacroPreset()) {
                this._registerMeterBus();
            }
        }
    }

    _isMacroPreset() {
        return ['macro', 'volumeGeral', 'auxVolumeGeral', 'mixVolumeGeral'].includes(this._preset);
    }

    _parseAttributes() {
        const rawCh = this.getAttribute('data-ch');
        this._ch = rawCh === 'master' ? 52 : parseInt(rawCh || '0', 10);
        this._auxIdx = parseInt(this.getAttribute('data-aux-idx') || '1', 10);
        this._preset = this.getAttribute('preset') || 'input';
        this._layout = this.getAttribute('layout') || (document.body.classList.contains('layout-desktop-mode') ? 'desktop' : 'mobile');
        const rawPartner = this.getAttribute('data-partner-ch');
        this._partnerCh = rawPartner !== null ? parseInt(rawPartner, 10) : null;
        if (this._partnerCh !== null) {
            if (!this.hasAttribute('paired')) this.setAttribute('paired', '');
        } else {
            if (this.hasAttribute('paired')) this.removeAttribute('paired');
        }
        this._disabled = this.hasAttribute('disabled');
        this._locked = this.hasAttribute('locked');
        this._compact = this.hasAttribute('compact');
        this._musicianMode = this.hasAttribute('musician-mode') ? true : null;
        this._showConfig = this.hasAttribute('show-config') || this._preset === 'macro' || (this._preset === 'volumeGeral' && this._isMusicianMode());
        this._prePost = (this.getAttribute('pre-post') || 'post').toLowerCase();
        if (this.hasAttribute('nudge-step')) {
            const parsedStep = parseFloat(this.getAttribute('nudge-step'));
            this._nudgeStep = isNaN(parsedStep) ? null : parsedStep;
        } else {
            this._nudgeStep = null;
        }
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
        ChannelStripComponent.checkMasterSolo();
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
        if (this._ch !== null && this._ch !== undefined) {
            const st = getChannelStateById(this._ch);
            if (st) {
                st.name = this._name;
            }
            if (uiState && uiState.resolvedNames) {
                uiState.resolvedNames[this._ch] = { name: this._name, short: this._name };
            }
            if (typeof window !== 'undefined' && window.resolvedNames && window.resolvedNames !== uiState?.resolvedNames) {
                window.resolvedNames[this._ch] = { name: this._name, short: this._name };
            }
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
            if (this._dom.card) {
                this._dom.card.classList.add('channel-locked');
                let overlay = this._dom.card.querySelector('.channel-lock-overlay');
                if (!overlay) {
                    overlay = document.createElement('div');
                    overlay.className = 'channel-lock-overlay';
                    overlay.innerHTML = `
                        <div class="channel-lock-badge" data-lock-id="${getLockIdForDataCh(this._ch)}">
                            <svg class="channel-lock-svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#000000" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                                <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                            </svg>
                        </div>
                    `;
                    const eventsToBlock = ['selectstart', 'dragstart'];
                    eventsToBlock.forEach(evt => {
                        overlay.addEventListener(evt, (e) => e.preventDefault());
                    });
                    this._dom.card.appendChild(overlay);
                }
            }
            if (this._dom.fader) this._dom.fader.disabled = true;
        } else {
            this.removeAttribute('locked');
            if (this._dom.card) {
                this._dom.card.classList.remove('channel-locked');
                const overlay = this._dom.card.querySelector('.channel-lock-overlay');
                if (overlay) overlay.remove();
            }
            if (this._dom.fader && !this._disabled) this._dom.fader.disabled = false;
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

    get nudgeStep() { return this._nudgeStep; }
    set nudgeStep(val) {
        const parsed = parseFloat(val);
        this._nudgeStep = isNaN(parsed) ? null : parsed;
        if (this._nudgeStep !== null) {
            this.setAttribute('nudge-step', this._nudgeStep);
        } else {
            this.removeAttribute('nudge-step');
        }
    }

    /**
     * Resolve o step em dB apropriado para o contexto do canal / tela:
     * - Atributo explícito `nudge-step`: tem prioridade máxima.
     * - Presets 'auxSend' ou 'auxSendIndividual' (aba interna de envios do canal): 0.50 dB.
     * - Presets 'sendsOnFader' / 'sendsOnFaderAux' (faders de envio para um aux específico): 0.25 dB.
     * - Presets 'output' ou canais Mix 1-8 (36-43) e Bus 1-8 (44-51): 0.10 dB.
     * - Tela Principal / Inputs normais (0-31, ST IN 60-67, Master 52): 0.05 dB.
     * @returns {number} Step em dB (0.05, 0.10, 0.25 ou 0.50)
     */
    _resolveNudgeStep() {
        if (this._nudgeStep !== null && this._nudgeStep !== undefined && !isNaN(this._nudgeStep)) {
            return this._nudgeStep;
        }

        // Contexto de aba interna com envios auxiliares do canal selecionado
        if (this._preset === 'auxSend' || this._preset === 'auxSendIndividual') {
            return 0.50;
        }

        // Contexto de Sends on Fader (faders representam o envio dos 32 canais para um aux)
        if (this._preset === 'sendsOnFader' || this._preset === 'sendsOnFaderAux') {
            return 0.25;
        }

        // Mix 1-8 (36-43), Bus 1-8 (44-51) ou preset output
        const isMixOrBus = (typeof this._ch === 'number' && this._ch >= 36 && this._ch <= 51);
        if (this._preset === 'output' || isMixOrBus) {
            return 0.10;
        }

        // Tela Principal (Inputs normais 0-31, ST IN 60-67, Master 52 / Stereo)
        return 0.05;
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
                this._levelR = level;
                if (this._dom.meterCurtainR && this._isVisible) {
                    this._dom.meterCurtainR.style.transform = `scaleY(${1 - (level / 100)})`;
                }
                this._evaluatePeak(now);
            });
        }
    }

    _unregisterMeterBus() {
        MeterBus.unregister(this._ch, this._onMeterUpdate);
        if (this._partnerCh !== null) {
            MeterBus.unregister(this._partnerCh);
        }
    }

    _evaluatePeak(now = performance.now()) {
        const isPeaking = (this._levelL >= 98) || (this._partnerCh !== null && this._levelR >= 98);

        if (isPeaking) {
            this._lastPeakTime = now;
            if (!this._isPeakActive) {
                this._isPeakActive = true;
                if (this._dom.peakLed) this._dom.peakLed.classList.add('active');
                if (this._dom.card) this._dom.card.classList.add('peak-glow');
            }
        } else if (this._isPeakActive && (now - this._lastPeakTime > 1000)) {
            this._isPeakActive = false;
            if (this._dom.peakLed) this._dom.peakLed.classList.remove('active');
            if (this._dom.card) this._dom.card.classList.remove('peak-glow');
        }
    }

    _handleMeterUpdate(level, now) {
        if (!this._isVisible) return;

        this._levelL = level;

        if (this._dom.meterCurtainL) {
            this._dom.meterCurtainL.style.transform = `scaleY(${1 - (level / 100)})`;
        }

        this._evaluatePeak(now);
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
    // Renderização dos Presets Macro / Volume Geral
    // ==========================================
    _renderMacroPreset() {
        const isMobile = this._layout === 'mobile';
        let isAuxVG = this._preset === 'auxVolumeGeral';
        let isMixVG = this._preset === 'mixVolumeGeral';
        const isMusician = this._isMusicianMode();
        const isCompact = this._compact || isAuxVG || isMixVG || (this._preset === 'volumeGeral' && isMusician);

        let title = 'MACRO';
        let titleLong = 'MACRO FADER';
        let isZerar = false;

        if (this._preset === 'volumeGeral') {
            title = 'GERAL';
            titleLong = 'VOLUME GERAL';
        } else if (isAuxVG) {
            title = 'AUX';
            titleLong = 'AUX GERAL';
            isZerar = true;
        } else if (isMixVG) {
            title = 'MIX';
            titleLong = 'VOLUME GERAL';
            isZerar = true;
        }

        // Config button exibido no Macro Fader ou Volume Geral em Musician Mode
        const showConfig = this._showConfig || (this._preset === 'volumeGeral' && isMusician);

        const configBtnDesktop = showConfig ? `
            <div class="macro-fader-config-wrap">
                <button class="side-btn btn-config macro-fader-config-btn">CONFIG</button>
            </div>
        ` : '';

        const configBtnMobile = showConfig ? `
            <button class="btn-state macro-fader-config-btn-mobile">CONFIG</button>
        ` : '';

        const zerarBtnDesktop = isZerar ? `
            <div class="macro-fader-config-wrap">
                <button class="macro-fader-zerar-btn">ZERAR</button>
            </div>
        ` : '';

        const zerarBtnMobile = isZerar ? `
            <button class="macro-fader-zerar-btn-mobile">ZERAR</button>
        ` : '';

        const deltaText = this._deltaSteps === 0 ? '--' : this._deltaToDB(this._deltaSteps);
        const activeClass = this._deltaSteps !== 0 ? 'macro-db-active' : '';

        if (isMobile) {
            this.innerHTML = `
                <div class="fader-card macro-fader-card ${isCompact ? 'macro-fader-compact' : ''}">
                    <h2 class="card-title">${title}</h2>
                    <div class="ch-clickable-zone macro-ch-clickable-zone">
                        <div class="ch-name">${titleLong}</div>
                    </div>
                    ${configBtnMobile}
                    <div class="macro-db-display ${activeClass}">${deltaText}</div>
                    <div class="macro-fader-nudge-wrap">
                        <div class="macro-nudge-btn-container nudge-plus-container">
                            <button class="btn-nudge-macro-big btn-nudge-plus">+</button>
                        </div>
                        <div class="macro-nudge-btn-container nudge-minus-container">
                            <button class="btn-nudge-macro-big btn-nudge-minus">-</button>
                        </div>
                    </div>
                    ${zerarBtnMobile}
                </div>
            `;
        } else {
            this.innerHTML = `
                <div class="fader-card-desktop macro-fader-card ${isCompact ? 'macro-fader-compact' : ''}">
                    <div class="desk-label">${title}</div>
                    <div class="btn-cue-placeholder"></div>
                    <div class="desk-ch-name-zone macro-ch-name-zone">
                        <div class="desk-ch-name">${titleLong}</div>
                    </div>
                    ${configBtnDesktop}
                    <div class="macro-db-display ${activeClass}">${deltaText}</div>
                    <div class="macro-fader-nudge-wrap">
                        <div class="macro-nudge-btn-container nudge-plus-container">
                            <button class="btn-nudge-macro-big btn-nudge-plus">+</button>
                        </div>
                        <div class="macro-nudge-btn-container nudge-minus-container">
                            <button class="btn-nudge-macro-big btn-nudge-minus">-</button>
                        </div>
                    </div>
                    ${zerarBtnDesktop}
                    <div class="desk-footer-label">${title}</div>
                </div>
            `;
        }

        // Coleta de referências locais
        this._dom.card = this.querySelector('.fader-card-desktop') || this.querySelector('.fader-card');
        this._dom.macroDbVal = this.querySelector('.macro-db-display');
        this._dom.btnNudgePlus = this.querySelector('.btn-nudge-plus');
        this._dom.btnNudgeMinus = this.querySelector('.btn-nudge-minus');
        this._dom.btnConfig = this.querySelector('.macro-fader-config-btn, .macro-fader-config-btn-mobile');
        this._dom.btnZerar = this.querySelector('.macro-fader-zerar-btn, .macro-fader-zerar-btn-mobile');
    }

    // ==========================================
    // Renderização do Template Light DOM
    // ==========================================
    _render() {
        if (this._isMacroPreset()) {
            this._renderMacroPreset();
            return;
        }

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
                <div class="fader-card ${groupClass} ${isPaired && !isMaster ? 'fader-card-paired' : ''} ${isMaster ? 'master-card' : ''} ${this._disabled ? 'strip-disabled' : ''} ${this._locked ? 'channel-locked' : ''} ${this._on ? 'on-active-card' : ''}" data-ch="${this._ch}">
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
                    <button class="btn-state btn-cue ${this._solo ? 'solo-active' : ''}" ${isMaster ? 'id="master-solo-btn-mobile" data-master-solo="true"' : ''}>SOLO</button>
                    `}

                    <button class="btn-state btn-on-desk ${this._on ? 'on-active' : ''}">ON</button>

                    <div class="nudge-zone">
                        <button class="btn-nudge btn-nudge-plus">+</button>
                    </div>

                    <div class="fader-rotated-container">
                        <input type="range" min="0" max="1023" value="${this._value}" class="fader-input" orient="vertical" ${this._disabled || this._locked ? 'disabled' : ''}>
                    </div>

                    <div class="ch-clickable-zone bottom mt-auto">
                        <div class="nudge-zone">
                            <button class="btn-nudge btn-nudge-minus">-</button>
                            <h1 class="fader-val db-val-text">${dbText}</h1>
                        </div>
                    </div>

                    ${this._locked ? `
                    <div class="channel-lock-overlay">
                        <div class="channel-lock-badge" data-lock-id="${getLockIdForDataCh(this._ch)}">
                            <svg class="channel-lock-svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#000000" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                                <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                            </svg>
                        </div>
                    </div>
                    ` : ''}
                </div>
            `;
        } else {
            // Template Desktop (Fader Card de Mesa 01v96)
            this.innerHTML = `
                <div class="fader-card-desktop ${groupClass} ${isPaired && !isMaster ? 'fader-card-paired' : ''} ${isMaster ? 'master-card-desktop' : ''} ${this._disabled ? 'strip-disabled' : ''} ${this._locked ? 'channel-locked' : ''} ${this._on ? 'desk-on-bg' : ''}" data-ch="${this._ch}">
                    <!-- Header / Label -->
                    <div class="desk-label-wrapper">
                        <div class="desk-label ${this._on ? 'label-on' : ''}">${labelText}</div>
                        ${!isMaster && !isAuxSend ? `
                        <div class="desk-label-lock" data-ch="${this._ch}" title="Travar/Destravar canal">
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
                    <button class="btn-cue ${this._solo ? 'solo-active' : ''}" ${isMaster ? 'id="master-solo-btn" data-master-solo="true"' : ''}>SOLO</button>
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
                        <div class="channel-lock-badge" data-lock-id="${getLockIdForDataCh(this._ch)}">
                            <svg class="channel-lock-svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#000000" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                                <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                            </svg>
                        </div>
                    </div>
                    ` : ''}
                </div>
            `;
        }

        // Coleta de referências locais
        this._dom.card = this.querySelector('.fader-card-desktop') || this.querySelector('.fader-card');
        this._dom.fader = this.querySelector('.fader-input');
        this._dom.faderContainer = this.querySelector('.desk-fader-container');
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

    _isMusicianMode() {
        return this._musicianMode !== null ? this._musicianMode : Boolean(uiState.musicianMode);
    }

    // ==========================================
    // Eventos e Interações
    // ==========================================
    // ==========================================
    // Lógica e Métodos do Macro / Volume Geral
    // ==========================================
    _deltaToDB(steps) {
        if (this._preset === 'auxVolumeGeral' || this._preset === 'mixVolumeGeral') {
            const db = steps * 0.05;
            const sign = db >= 0 ? '+' : '';
            return `${sign}${db.toFixed(2)} dB`;
        }
        const isMusician = this._isMusicianMode();
        const db = isMusician ? steps * 1.0 : steps * 0.05;
        const sign = db >= 0 ? '+' : '';
        return isMusician ? `${sign}${db.toFixed(0)} dB` : `${sign}${db.toFixed(2)} dB`;
    }

    _updateMacroDbDisplay() {
        if (!this._dom.macroDbVal) return;
        if (this._deltaSteps === 0) {
            this._dom.macroDbVal.textContent = '--';
            this._dom.macroDbVal.classList.remove('macro-db-active');
        } else {
            this._dom.macroDbVal.textContent = this._deltaToDB(this._deltaSteps);
            this._dom.macroDbVal.classList.add('macro-db-active');
        }
    }

    _resetMacroDbDisplay() {
        if (this._dbResetTimer) clearTimeout(this._dbResetTimer);
        this._dbResetTimer = setTimeout(() => {
            this._deltaSteps = 0;
            this._updateMacroDbDisplay();
            this._dbResetTimer = null;
        }, 5000);
    }

    _getTargetChannels() {
        const isChanLocked = (i) => {
            return (window.lockedChannels && window.lockedChannels.includes('CH' + (i + 1))) ||
                (uiState.lockedChannels && uiState.lockedChannels.includes('CH' + (i + 1)));
        };

        const isMusician = this._isMusicianMode();

        if (this._preset === 'volumeGeral') {
            if (isMusician) {
                const locked = getMacroLockedChannels();
                return Array.from({ length: 32 }, (_, i) => i).filter(i => !locked.includes(i) && !isChanLocked(i));
            }
            return Array.from({ length: 32 }, (_, i) => i).filter(i => !isChanLocked(i));
        }

        // Preset 'macro'
        if (isMusician) {
            const locked = getMacroLockedChannels();
            return Array.from({ length: 32 }, (_, i) => i).filter(i => !locked.includes(i) && !isChanLocked(i));
        }
        const selected = getMacroSelectedChannels();
        return selected.filter(i => !isChanLocked(i));
    }

    _nudgeMacro(dir) {
        if (this._preset === 'auxVolumeGeral') {
            this._nudgeAuxVolumeGeral(dir);
            return;
        }
        if (this._preset === 'mixVolumeGeral') {
            this._nudgeMixVolumeGeral(dir);
            return;
        }

        const channels = this._getTargetChannels();
        if (!channels.length) return;

        const isMusician = this._isMusicianMode();
        const isTechMix = uiState.technicianMixMode;
        const activeMix = uiState.activeMix || 1;
        const step = isMusician ? dir * 20 : dir;
        let anyChanged = false;

        channels.forEach(chIdx => {
            const s = (channelStates && channelStates[chIdx]) ? channelStates[chIdx] : getChannelStateById(chIdx);
            if (!s) return;

            const currentVal = (isMusician || isTechMix) ? (s[`aux${activeMix}`] || 0) : (s.value !== undefined ? s.value : 0);
            if (isMusician && currentVal <= 0) return;

            let nRaw = currentVal + step;
            if (nRaw < 0) nRaw = 0;
            if (nRaw > 1023) nRaw = 1023;

            if (nRaw === currentVal) return;

            anyChanged = true;
            if (isMusician || isTechMix) {
                s[`aux${activeMix}`] = nRaw;
                emit('control', { type: `kInputAUX/kAUX${activeMix}Level`, channel: chIdx, value: nRaw });
            } else {
                s.value = nRaw;
                emit('control', { type: 'kInputFader/kFader', channel: chIdx, value: nRaw });
            }

            // Atualiza strip correspondente se presente no DOM
            const targetStrip = document.querySelector(`channel-strip[data-ch="${chIdx}"]`);
            if (targetStrip && targetStrip !== this) {
                targetStrip.value = nRaw;
            }
        });

        if (!anyChanged) return;
        this._deltaSteps += dir;
        this._updateMacroDbDisplay();
        this._resetMacroDbDisplay();
    }

    _nudgeAuxVolumeGeral(dir) {
        const ch = (this._ch !== undefined && this._ch !== null) ? this._ch : uiState.activeConfigChannel;
        if (ch === null || ch === undefined || ch > 31) return;
        const s = (channelStates && channelStates[ch]) ? channelStates[ch] : getChannelStateById(ch);
        if (!s) return;

        const step = dir;
        let anyChanged = false;

        for (let auxIdx = 1; auxIdx <= 8; auxIdx++) {
            const currentVal = s[`aux${auxIdx}`] || 0;
            if (currentVal <= 0) continue;
            let nRaw = currentVal + step;
            if (nRaw < 0) nRaw = 0;
            if (nRaw > 1023) nRaw = 1023;
            if (nRaw === currentVal) continue;

            anyChanged = true;
            s[`aux${auxIdx}`] = nRaw;
            emit('control', { type: `kInputAUX/kAUX${auxIdx}Level`, channel: ch, value: nRaw });

            const auxStrip = document.querySelector(`channel-strip[preset="auxSend"][data-aux-idx="${auxIdx}"]`);
            if (auxStrip) {
                auxStrip.value = nRaw;
            }
        }

        if (!anyChanged) return;
        this._deltaSteps += dir;
        this._updateMacroDbDisplay();
        this._resetMacroDbDisplay();
    }

    _nudgeMixVolumeGeral(dir) {
        const ch = (this._ch !== undefined && this._ch !== null) ? this._ch : uiState.activeConfigChannel;
        if (ch === null || ch === undefined || ch < 36 || ch > 43) return;
        const mixIdx = ch - 35; // MIX 1 (36) -> auxIdx 1
        const step = dir;
        let anyChanged = false;

        for (let i = 0; i < 32; i++) {
            const s = (channelStates && channelStates[i]) ? channelStates[i] : getChannelStateById(i);
            if (!s) continue;
            const currentVal = s[`aux${mixIdx}`] || 0;
            if (currentVal <= 0) continue;
            let nRaw = currentVal + step;
            if (nRaw < 0) nRaw = 0;
            if (nRaw > 1023) nRaw = 1023;
            if (nRaw === currentVal) continue;

            anyChanged = true;
            s[`aux${mixIdx}`] = nRaw;
            emit('control', { type: `kInputAUX/kAUX${mixIdx}Level`, channel: i, value: nRaw });
        }

        if (!anyChanged) return;
        this._deltaSteps += dir;
        this._updateMacroDbDisplay();
        this._resetMacroDbDisplay();
    }

    _startNudge(dir) {
        this._stopNudge();
        this._nudgeMacro(dir);

        const isMusician = uiState.musicianMode;
        const repeatMs = isMusician ? 160 : 80;
        const holdMs = isMusician ? 200 : 500;

        this._nudgeTimeout = setTimeout(() => {
            this._nudgeInterval = setInterval(() => {
                this._nudgeMacro(dir * 3);
            }, repeatMs);
        }, holdMs);

        this._nudgeMaxDurationTimer = setTimeout(() => {
            this._stopNudge();
        }, 10000);
    }

    _stopNudge() {
        if (this._nudgeTimeout) clearTimeout(this._nudgeTimeout);
        if (this._nudgeInterval) clearInterval(this._nudgeInterval);
        if (this._nudgeMaxDurationTimer) clearTimeout(this._nudgeMaxDurationTimer);
        this._nudgeTimeout = null;
        this._nudgeInterval = null;
        this._nudgeMaxDurationTimer = null;
    }

    _zeroAuxVolumeGeral() {
        const ch = (this._ch !== undefined && this._ch !== null) ? this._ch : uiState.activeConfigChannel;
        if (ch === null || ch === undefined || ch > 31) return;
        const s = (channelStates && channelStates[ch]) ? channelStates[ch] : getChannelStateById(ch);
        if (!s) return;

        for (let auxIdx = 1; auxIdx <= 8; auxIdx++) {
            const currentVal = s[`aux${auxIdx}`] || 0;
            if (currentVal <= 0) continue;
            s[`aux${auxIdx}`] = 0;
            emit('control', { type: `kInputAUX/kAUX${auxIdx}Level`, channel: ch, value: 0 });

            const auxStrip = document.querySelector(`channel-strip[preset="auxSend"][data-aux-idx="${auxIdx}"]`);
            if (auxStrip) {
                auxStrip.value = 0;
            }
        }

        this._deltaSteps = 0;
        this._updateMacroDbDisplay();
    }

    _zeroMixVolumeGeral() {
        const ch = (this._ch !== undefined && this._ch !== null) ? this._ch : uiState.activeConfigChannel;
        if (ch === null || ch === undefined || ch < 36 || ch > 43) return;
        const mixIdx = ch - 35;

        for (let i = 0; i < 32; i++) {
            const s = (channelStates && channelStates[i]) ? channelStates[i] : getChannelStateById(i);
            if (!s) continue;
            const currentVal = s[`aux${mixIdx}`] || 0;
            if (currentVal <= 0) continue;
            s[`aux${mixIdx}`] = 0;
            emit('control', { type: `kInputAUX/kAUX${mixIdx}Level`, channel: i, value: 0 });
        }

        this._deltaSteps = 0;
        this._updateMacroDbDisplay();
    }

    // ==========================================
    // Lógica de Nudge / Auto-Repeat para Canais
    // ==========================================
    _applyChannelNudge(dir) {
        if (this._locked || this._disabled) return;
        const isMaster = this._ch === 52 || this._preset === 'master';
        const stepDb = this._resolveNudgeStep();
        const nextRaw = getSteppedRaw(this._value, dir, stepDb, isMaster);

        if (nextRaw === this._value) return;

        this.value = nextRaw;
        if (this._preset === 'auxSend' || this._preset === 'auxSendIndividual') {
            emit('control', {
                type: `kInputAUX/kAUX${this._auxIdx}Level`,
                channel: this._ch,
                value: nextRaw
            });
        } else if (this._preset === 'sendsOnFader' || this._preset === 'sendsOnFaderAux') {
            emit('control', {
                type: `kInputAUX/kAUX${this._auxIdx}Level`,
                channel: this._ch,
                value: nextRaw
            });
        } else if (this._preset === 'output' || (typeof this._ch === 'number' && this._ch >= 36 && this._ch <= 43)) {
            emit('control', {
                type: 'kAUXFader/kFader',
                channel: typeof this._ch === 'number' && this._ch >= 36 ? this._ch - 36 : this._ch,
                value: nextRaw
            });
        } else if (typeof this._ch === 'number' && this._ch >= 44 && this._ch <= 51) {
            emit('control', {
                type: 'kBusFader/kFader',
                channel: this._ch - 44,
                value: nextRaw
            });
        } else {
            emit('control', {
                type: isMaster ? 'kStereoFader/kFader' : 'kInputFader/kFader',
                channel: this._ch,
                value: nextRaw
            });
        }
    }

    _startChannelNudge(dir) {
        this._stopChannelNudge();
        this._applyChannelNudge(dir);

        // Timeout inicial de 350ms antes de começar o auto-repeat
        this._channelNudgeTimeout = setTimeout(() => {
            // Repetição contínua a cada 60ms enquanto o botão estiver pressionado
            this._channelNudgeInterval = setInterval(() => {
                this._applyChannelNudge(dir);
            }, 60);
        }, 350);
    }

    _stopChannelNudge() {
        if (this._channelNudgeTimeout) {
            clearTimeout(this._channelNudgeTimeout);
            this._channelNudgeTimeout = null;
        }
        if (this._channelNudgeInterval) {
            clearInterval(this._channelNudgeInterval);
            this._channelNudgeInterval = null;
        }
    }

    _bindEvents() {
        if (this._isMacroPreset()) {
            this._bindMacroEvents();
            return;
        }

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

        // Suporte a Mouse Wheel no Fader em modo Desktop
        const faderWheelTarget = this._dom.faderContainer || this._dom.fader;
        if (faderWheelTarget) {
            faderWheelTarget.addEventListener('wheel', (e) => {
                if (this._layout !== 'desktop') return;
                if (this._locked || this._disabled) return;
                e.preventDefault();
                e.stopPropagation();

                const dir = e.deltaY < 0 ? 1 : -1;
                this._applyChannelNudge(dir);
            }, { passive: false });
        }

        if (this._dom.btnOn) {
            this._dom.btnOn.addEventListener('click', (e) => {
                e.stopPropagation();
                if (this._locked || this._disabled) return;
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
                if (this._locked || this._disabled) return;
                const nextPre = this._prePost !== 'pre';
                this.prePost = nextPre;
                emit('control', {
                    type: `kInputAUX/kAUX${this._auxIdx}Pre`,
                    channel: this._ch,
                    value: nextPre ? 1 : 0
                });
            });
        }

        if (this._dom.btnSolo) {
            if (this._ch !== 52 && this._preset !== 'master') {
                this._dom.btnSolo.addEventListener('click', (e) => {
                    e.stopPropagation();
                    if (this._locked || this._disabled) return;
                    const nextSolo = !this._solo;
                    this.solo = nextSolo;
                    emit('control', {
                        type: 'kSetupSoloChOn/kSoloChOn',
                        channel: this._ch,
                        value: nextSolo ? 1 : 0
                    });
                });
            } else {
                // Master Strip: Botão SOLO atua como "UNSOLO ALL" (Clear all solos) quando está em alerta piscando
                this._dom.btnSolo.addEventListener('click', (e) => {
                    e.stopPropagation();
                    if (this._dom.btnSolo.classList.contains('master-solo-alert')) {
                        ChannelStripComponent.clearAllSolos();
                    }
                });
            }
        }

        const btnPlus = this.querySelector('.btn-nudge-plus');
        if (btnPlus) {
            btnPlus.addEventListener('pointerdown', (e) => {
                e.stopPropagation();
                if (e.button !== undefined && e.button !== 0) return;
                this._startChannelNudge(1);
            });
            btnPlus.addEventListener('pointerup', () => this._stopChannelNudge());
            btnPlus.addEventListener('pointercancel', () => this._stopChannelNudge());
            btnPlus.addEventListener('pointerleave', () => this._stopChannelNudge());

            // Previne context menu e drag indesejado em touch/longpress
            btnPlus.addEventListener('contextmenu', (e) => e.preventDefault());
        }

        const btnMinus = this.querySelector('.btn-nudge-minus');
        if (btnMinus) {
            btnMinus.addEventListener('pointerdown', (e) => {
                e.stopPropagation();
                if (e.button !== undefined && e.button !== 0) return;
                this._startChannelNudge(-1);
            });
            btnMinus.addEventListener('pointerup', () => this._stopChannelNudge());
            btnMinus.addEventListener('pointercancel', () => this._stopChannelNudge());
            btnMinus.addEventListener('pointerleave', () => this._stopChannelNudge());

            // Previne context menu e drag indesejado em touch/longpress
            btnMinus.addEventListener('contextmenu', (e) => e.preventDefault());
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

    _bindMacroEvents() {
        if (this._dom.btnConfig) {
            this._dom.btnConfig.addEventListener('click', (e) => {
                e.stopPropagation();
                openMacroConfigModal({ isMusicianMode: this._isMusicianMode() });
            });
        }

        if (this._dom.btnZerar) {
            this._dom.btnZerar.addEventListener('click', async (e) => {
                e.stopPropagation();

                const triggerZero = () => {
                    if (this._preset === 'auxVolumeGeral') {
                        this._zeroAuxVolumeGeral();
                    } else if (this._preset === 'mixVolumeGeral') {
                        this._zeroMixVolumeGeral();
                    } else {
                        this._deltaSteps = 0;
                        this._updateMacroDbDisplay();
                    }
                };

                if (typeof ConfirmModal !== 'undefined' && ConfirmModal.show) {
                    let title = 'CONFIRMAR ZERAR';
                    let message = 'Deseja realmente zerar os envios?';

                    if (this._preset === 'auxVolumeGeral') {
                        title = 'ZERAR ENVIOS DE AUXILIAR';
                        const chLabel = getChannelLabel(this._ch !== null && this._ch !== undefined ? this._ch : uiState.activeConfigChannel);
                        message = `Deseja realmente zerar todos os envios de auxiliar do canal <b>${chLabel}</b>?`;
                    } else if (this._preset === 'mixVolumeGeral') {
                        title = 'ZERAR ENVIOS DO MIX';
                        const mixNum = (this._ch !== null && this._ch !== undefined && this._ch >= 36) ? (this._ch - 35) : 1;
                        message = `Deseja realmente zerar os envios do <b>MIX ${mixNum}</b> em todos os 32 canais?`;
                    }

                    const confirmed = await ConfirmModal.show({
                        title: title,
                        message: message,
                        type: 'danger',
                        confirmText: 'ZERAR',
                        cancelText: 'CANCELAR'
                    });

                    if (confirmed) {
                        triggerZero();
                    }
                } else {
                    triggerZero();
                }
            });
        }

        const plusContainer = this.querySelector('.nudge-plus-container') || this._dom.btnNudgePlus;
        if (plusContainer) {
            plusContainer.addEventListener('pointerdown', (e) => {
                e.preventDefault();
                this._startNudge(1);
            });
            plusContainer.addEventListener('pointerup', () => this._stopNudge());
            plusContainer.addEventListener('pointerleave', () => this._stopNudge());
            plusContainer.addEventListener('pointercancel', () => this._stopNudge());
        }

        const minusContainer = this.querySelector('.nudge-minus-container') || this._dom.btnNudgeMinus;
        if (minusContainer) {
            minusContainer.addEventListener('pointerdown', (e) => {
                e.preventDefault();
                this._startNudge(-1);
            });
            minusContainer.addEventListener('pointerup', () => this._stopNudge());
            minusContainer.addEventListener('pointerleave', () => this._stopNudge());
            minusContainer.addEventListener('pointercancel', () => this._stopNudge());
        }

        // Suporte a Mouse Wheel em Macro Faders e Volume Geral no modo Desktop
        const macroWheelTarget = this.querySelector('.macro-fader-nudge-wrap') || this._dom.card;
        if (macroWheelTarget) {
            macroWheelTarget.addEventListener('wheel', (e) => {
                if (this._layout !== 'desktop') return;
                if (this._locked || this._disabled) return;
                e.preventDefault();
                e.stopPropagation();

                const dir = e.deltaY < 0 ? 1 : -1;
                this._nudgeMacro(dir);
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
    },
    macro: (options = {}) => {
        const el = document.createElement('channel-strip');
        el.setAttribute('preset', 'macro');
        if (options.compact) el.setAttribute('compact', '');
        if (options.showConfig) el.setAttribute('show-config', '');
        return el;
    },
    volumeGeral: (options = {}) => {
        const el = document.createElement('channel-strip');
        el.setAttribute('preset', 'volumeGeral');
        if (options.compact) el.setAttribute('compact', '');
        if (options.showConfig) el.setAttribute('show-config', '');
        return el;
    },
    auxVolumeGeral: (ch, options = {}) => {
        const el = document.createElement('channel-strip');
        el.setAttribute('preset', 'auxVolumeGeral');
        if (ch !== undefined && ch !== null) el.setAttribute('data-ch', ch);
        if (options.compact) el.setAttribute('compact', '');
        return el;
    },
    mixVolumeGeral: (ch, options = {}) => {
        const el = document.createElement('channel-strip');
        el.setAttribute('preset', 'mixVolumeGeral');
        if (ch !== undefined && ch !== null) el.setAttribute('data-ch', ch);
        if (options.compact) el.setAttribute('compact', '');
        return el;
    }
};

/**
 * Lógica Global de Monitoramento do Master Solo (01v96)
 * Se qualquer canal no mixer / DOM estiver com solo ativo, os botões SOLO do MASTER
 * (desktop e mobile) entram em alerta pulsante. Clicar no botão aciona "UNSOLO ALL".
 */
ChannelStripComponent.checkMasterSolo = function () {
    const strips = Array.from(document.querySelectorAll('channel-strip'));
    const hasAnySolo = strips.some(strip => {
        const isMaster = strip.getAttribute('data-ch') === '52' ||
            strip.getAttribute('data-ch') === 'master' ||
            strip.getAttribute('preset') === 'master';
        if (isMaster) return false;
        return strip.solo === true;
    }) || (typeof channelStates !== 'undefined' && Array.isArray(channelStates) && channelStates.some(s => s && s.solo === true));

    const masterStrips = strips.filter(strip => {
        return strip.getAttribute('data-ch') === '52' ||
            strip.getAttribute('data-ch') === 'master' ||
            strip.getAttribute('preset') === 'master';
    });

    masterStrips.forEach(masterStrip => {
        const soloBtns = masterStrip.querySelectorAll('.btn-cue, .btn-state.btn-cue');
        soloBtns.forEach(btn => {
            if (hasAnySolo) {
                btn.classList.add('master-solo-alert');
                btn.removeAttribute('disabled');
                btn.title = 'Limpar todos os solos ativos (UNSOLO ALL)';
            } else {
                btn.classList.remove('master-solo-alert');
                btn.removeAttribute('title');
            }
        });
    });

    const standaloneMasterBtns = document.querySelectorAll('#master-solo-btn, #master-solo-btn-mobile');
    standaloneMasterBtns.forEach(btn => {
        if (hasAnySolo) {
            btn.classList.add('master-solo-alert');
            btn.removeAttribute('disabled');
            btn.title = 'Limpar todos os solos ativos (UNSOLO ALL)';
        } else {
            btn.classList.remove('master-solo-alert');
            btn.removeAttribute('title');
        }
    });
};

/**
 * Desmarca o solo de todos os canais ativos (UNSOLO ALL),
 * enviando os comandos OSC/Socket correspondentes e atualizando a interface.
 */
ChannelStripComponent.clearAllSolos = async function () {
    const strips = Array.from(document.querySelectorAll('channel-strip'));
    const soloedStrips = strips.filter(strip => {
        const isMaster = strip.getAttribute('data-ch') === '52' ||
            strip.getAttribute('data-ch') === 'master' ||
            strip.getAttribute('preset') === 'master';
        return !isMaster && strip.solo === true;
    });

    // Remove alerta imediatamente dos botões de Master
    const masterBtns = document.querySelectorAll('.master-solo-alert');
    masterBtns.forEach(btn => btn.classList.remove('master-solo-alert'));

    // Desativa strips no DOM
    for (const strip of soloedStrips) {
        strip.solo = false;
        const ch = strip._ch !== undefined ? strip._ch : parseInt(strip.getAttribute('data-ch') || '0', 10);
        emit('control', {
            type: 'kSetupSoloChOn/kSoloChOn',
            channel: ch,
            value: 0
        });
        await new Promise(r => setTimeout(r, 30));
    }

    // Se houver channelStates em memória (modo app completo)
    if (typeof channelStates !== 'undefined' && Array.isArray(channelStates)) {
        channelStates.forEach((s, idx) => {
            if (s && s.solo) {
                s.solo = false;
                emit('control', {
                    type: 'kSetupSoloChOn/kSoloChOn',
                    channel: idx,
                    value: 0
                });
            }
        });
    }

    ChannelStripComponent.checkMasterSolo();
};

if (typeof window !== 'undefined') {
    window.ChannelStripComponent = ChannelStripComponent;
    window.checkMasterSoloIndicator = ChannelStripComponent.checkMasterSolo;
    window.clearAllSolos = ChannelStripComponent.clearAllSolos;
}

