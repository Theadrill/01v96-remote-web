// fx_core.js — Engine Genérico de Efeitos (Yamaha 01V96 Remote)
// Gerencia Estado, Lazy-Sync, Interações Touch/Mouse e Renderização Orientada a Schemas
(function () {
    'use strict';

    // ── Estado Global dos 4 Slots FX ──────────────────────────────────
    const syncedSlots = [false, false, false, false];
    const isSyncingSlot = [false, false, false, false];
    const fxParamsState = [{}, {}, {}, {}];
    const fxTypeState = [
        { id: 0, name: 'Reverb Hall', bypass: false, mix: 100 },
        { id: 1, name: 'Reverb Room', bypass: false, mix: 100 },
        { id: 2, name: 'Reverb Stage', bypass: false, mix: 100 },
        { id: 3, name: 'Reverb Plate', bypass: false, mix: 100 }
    ];

    let lastFxTypeId = [-1, -1, -1, -1];
    let lastSameTypeRecallSyncTime = 0;
    let currentSlotIdx = 0;
    let activeTabId = 'output';
    let currentLayoutMode = detectDefaultLayoutMode();
    let stepperInterval = null;
    let stepperTimeout = null;

    // ── Detecção Automática de Dispositivo ────────────────────────────
    function detectDefaultLayoutMode() {
        try {
            const saved = localStorage.getItem('fx_layout_mode');
            if (saved === 'mobile' || saved === 'desktop') return saved;
        } catch (e) {}

        const ua = navigator.userAgent || '';
        const platform = navigator.platform || '';
        const maxTouchPoints = navigator.maxTouchPoints || 0;
        const isIOS = /iPad|iPhone|iPod/.test(ua) || (platform === 'MacIntel' && maxTouchPoints > 1);
        const isAndroid = /Android/i.test(ua);
        const isMobileUA = /Mobi|Tablet|iPad|iPhone|Android|Touch/i.test(ua);
        const isTouchScreen = (maxTouchPoints > 0 || 'ontouchstart' in window);
        const isSmallViewport = window.innerWidth <= 1024;

        return (isIOS || isAndroid || isMobileUA || (isTouchScreen && isSmallViewport)) ? 'mobile' : 'desktop';
    }

    function isModalOpen() {
        const modal = document.getElementById('fxEditorModal');
        if (!modal) return false;
        const style = window.getComputedStyle(modal);
        return modal.style.display !== 'none' && style.display !== 'none';
    }

    function rerenderIfOpen() {
        if (isModalOpen()) {
            renderModal();
        }
    }

    function setLayoutMode(mode) {
        if (mode !== 'mobile' && mode !== 'desktop') return;
        currentLayoutMode = mode;
        try { localStorage.setItem('fx_layout_mode', mode); } catch (e) {}
        rerenderIfOpen();
    }

    // ── Decodificação de Parâmetros do Schema ─────────────────────────
    function decodeParams(slotIdx, schema) {
        const raw = fxParamsState[slotIdx] || {};
        const decoded = {
            bypass: raw[52] !== undefined ? (raw[52] > 0) : (fxTypeState[slotIdx]?.bypass || false),
            params: {}
        };

        if (!schema || !schema.params) return decoded;

        for (const p of schema.params) {
            const rawVal = raw[p.sysEx] !== undefined ? raw[p.sysEx] : p.defaultVal;
            const min = p.min !== undefined ? p.min : 0;
            const max = p.max !== undefined ? p.max : 100;
            const range = (max - min) || 1;
            const pct = Math.min(100, Math.max(0, ((rawVal - min) / range) * 100));

            let displayVal = '';
            if (typeof p.formatFn === 'function') {
                displayVal = p.formatFn(rawVal);
            } else if (typeof p.formatFn === 'string' && window.FXUtils && typeof window.FXUtils[p.formatFn] === 'function') {
                displayVal = window.FXUtils[p.formatFn](rawVal);
            } else {
                displayVal = rawVal + (p.unit || '');
            }

            decoded.params[p.key] = {
                rawVal: rawVal,
                pct: pct,
                displayVal: displayVal,
                sysEx: p.sysEx,
                config: p
            };
        }

        return decoded;
    }

    // ── Atualização Local Direta do DOM de Parâmetro (Zero Scroll Jump) ──
    function updateSingleParamDom(sysEx, rawVal) {
        const modal = document.getElementById('fxEditorModal');
        if (!modal) return false;

        const currentTypeInfo = fxTypeState[currentSlotIdx] || {};
        const typeId = currentTypeInfo.id !== undefined ? currentTypeInfo.id : currentSlotIdx;
        const schema = window.FXRegistry ? window.FXRegistry.getSchema(typeId) : null;
        if (!schema) return false;

        // Trata BYPASS (sysEx 52)
        if (sysEx === 52) {
            const bypassBtn = modal.querySelector('.fx-ed-bypass-btn');
            if (bypassBtn) {
                if (rawVal > 0) bypassBtn.classList.add('active');
                else bypassBtn.classList.remove('active');
            }
            return true;
        }

        const config = schema.params.find(p => p.sysEx === sysEx);
        if (!config) return false;

        const min = config.min !== undefined ? config.min : 0;
        const max = config.max !== undefined ? config.max : 100;
        const range = (max - min) || 1;
        const pct = Math.min(100, Math.max(0, ((rawVal - min) / range) * 100));

        let displayVal = '';
        if (typeof config.formatFn === 'function') {
            displayVal = config.formatFn(rawVal);
        } else if (typeof config.formatFn === 'string' && window.FXUtils && typeof window.FXUtils[config.formatFn] === 'function') {
            displayVal = window.FXUtils[config.formatFn](rawVal);
        } else {
            displayVal = rawVal + (config.unit || '');
        }

        const paramEl = modal.querySelector(`[data-sysex="${sysEx}"]`);
        if (!paramEl) return false;

        // Atualiza Knob Box
        const badge = paramEl.querySelector('.knob-val-badge');
        if (badge) badge.textContent = displayVal;

        const ring = paramEl.querySelector('.knob-ring');
        if (ring) ring.style.setProperty('--percent', pct + '%');

        const pointer = paramEl.querySelector('.knob-pointer');
        if (pointer) {
            const deg = window.FXComponents.degFromPct ? window.FXComponents.degFromPct(pct) : Math.round(-135 + (pct / 100) * 270);
            pointer.style.transform = `rotate(${deg}deg)`;
        }

        // Atualiza Stepper Card
        const valDisplay = paramEl.querySelector('.c3-val-display');
        if (valDisplay) valDisplay.textContent = displayVal;

        // Atualiza Switch Card
        if (paramEl.classList.contains('fx-switch-card')) {
            const active = rawVal > 0;
            if (active) paramEl.classList.add('active'); else paramEl.classList.remove('active');
            const pill = paramEl.querySelector('.fx-switch-pill');
            if (pill) pill.className = `fx-switch-pill ${active ? 'on' : 'off'}`;
            const txt = paramEl.querySelector('.fx-switch-text');
            if (txt) txt.textContent = active ? 'ON' : 'OFF';
        }

        return true;
    }

    // ── Renderização Genérica de Modal ───────────────────────────────
    function renderModal() {
        const contentContainer = document.getElementById('fxEditorModalContent') || document.getElementById('fxEditorModal');
        if (!contentContainer) return;

        const modalOuter = document.getElementById('fxEditorModal');
        if (modalOuter) modalOuter.style.display = 'flex';

        const scrollBody = contentContainer.querySelector('.fx-ed-scroll-body');
        const savedScrollTop = scrollBody ? scrollBody.scrollTop : 0;

        const currentTypeInfo = fxTypeState[currentSlotIdx] || {};
        const typeId = currentTypeInfo.id !== undefined ? currentTypeInfo.id : currentSlotIdx;
        const schema = window.FXRegistry ? window.FXRegistry.getSchema(typeId) : null;

        if (!schema || !schema.supported) {
            contentContainer.innerHTML = window.FXComponents.renderUnderConstruction({
                slotNum: currentSlotIdx + 1,
                displayName: currentTypeInfo.name || `EFEITO ${currentSlotIdx + 1}`
            });
            return;
        }

        const decoded = decodeParams(currentSlotIdx, schema);
        const categories = schema.categories || [];
        if (!categories.some(c => c.id === activeTabId) && categories.length > 0) {
            activeTabId = categories[0].id;
        }

        let bodyHtml = '';
        if (schema.showMeters === true) {
            bodyHtml = renderMbandBody(schema, decoded);
        } else if (currentLayoutMode === 'desktop') {
            bodyHtml = renderDesktopGrid(schema, decoded);
        } else {
            bodyHtml = renderMobileTabs(schema, decoded, categories);
        }

        contentContainer.innerHTML = `
        <div class="fx-ed-container ${schema.colorTheme || 'theme-hall'}">
            ${window.FXComponents.renderHeader({
                slot: currentSlotIdx + 1,
                effectName: currentTypeInfo.name || schema.name,
                colorTheme: schema.colorTheme || 'theme-hall',
                bypass: decoded.bypass,
                currentMode: currentLayoutMode
            })}
            <div class="fx-ed-scroll-body">
                ${bodyHtml}
            </div>
        </div>`;

        const newScrollBody = contentContainer.querySelector('.fx-ed-scroll-body');
        if (newScrollBody && savedScrollTop > 0) {
            newScrollBody.scrollTop = savedScrollTop;
        }

        if (schema.showMeters === true) {
            startFxMeters();
            if (typeof socket !== 'undefined' && socket.emit) {
                socket.emit('requestFxMeters');
            }
        } else {
            stopFxMeters();
        }
    }

    // ── Grid Desktop (Cartões Agrupados por Categoria - Layout Original Preservado) ──
    function renderDesktopGrid(schema, decoded) {
        const categories = schema.categories || [];
        let html = '<div class="concept-view concept-knobs">';

        categories.forEach(cat => {
            const catParams = schema.params.filter(p => p.category === cat.id);
            let knobsHtml = '';

            catParams.forEach(p => {
                const item = decoded.params[p.key];
                if (!item) return;
                knobsHtml += window.FXComponents.renderKnob({
                    label: p.name,
                    value: item.displayVal,
                    percent: item.pct,
                    sysEx: p.sysEx,
                    paramKey: p.key
                });
            });

            html += window.FXComponents.renderCardGroup({
                title: cat.title,
                content: knobsHtml
            });
        });

        html += '</div>';
        return html;
    }

    // ── Abas Mobile (Touch + Stepper Cards - Conceito 3 Preservado) ─────
    function renderMobileTabs(schema, decoded, categories) {
        let tabsNav = '<div class="c3-tab-bar">';
        categories.forEach(cat => {
            const isActive = (cat.id === activeTabId);
            tabsNav += `
            <button class="c3-tab-btn ${isActive ? 'active' : ''}" onclick="FXCore.setActiveTab('${cat.id}')">
                ${cat.title}
            </button>`;
        });
        tabsNav += '</div>';

        const activeCatParams = schema.params.filter(p => p.category === activeTabId);
        let steppersHtml = '<div class="c3-card-section">';
        activeCatParams.forEach(p => {
            const item = decoded.params[p.key];
            if (!item) return;
            steppersHtml += window.FXComponents.renderStepperCard({
                title: p.name,
                value: item.displayVal,
                sysEx: p.sysEx,
                paramKey: p.key
            });
        });
        steppersHtml += '</div>';

        return `
        <div class="concept-view concept-touch">
            ${tabsNav}
            ${steppersHtml}
        </div>`;
    }

    // ── Layout Multiband Compressor (Meters + Grupos, sem Abas) ────────
    function renderMbandBody(schema, decoded) {
        const isDesktop = currentLayoutMode === 'desktop';
        const categories = schema.categories || [];
        let groupsHtml = '';

        categories.forEach(cat => {
            const catParams = schema.params.filter(p => p.category === cat.id).sort((a, b) => {
                if (a.widget === 'switch' && b.widget !== 'switch') return 1;
                if (a.widget !== 'switch' && b.widget === 'switch') return -1;
                return 0;
            });
            let controlsHtml = '';

            if (isDesktop) {
                let knobsHtml = '';
                catParams.forEach(p => {
                    const item = decoded.params[p.key];
                    if (!item) return;
                    knobsHtml += renderMbandControl(p, item, isDesktop);
                });
                controlsHtml = window.FXComponents.renderCardGroup({
                    title: cat.title,
                    content: knobsHtml
                });
            } else {
                let steppersHtml = '<div class="c3-card-section">';
                catParams.forEach(p => {
                    const item = decoded.params[p.key];
                    if (!item) return;
                    steppersHtml += renderMbandControl(p, item, isDesktop);
                });
                steppersHtml += '</div>';
                controlsHtml = `
                <div class="fx-card-group">
                    <div class="fx-card-header">${cat.title}</div>
                    ${steppersHtml}
                </div>`;
            }

            groupsHtml += controlsHtml;
        });

        return `
        <div class="concept-view concept-mband">
            ${renderMbandMeters(schema, decoded)}
            ${groupsHtml}
        </div>`;
    }

    function renderMbandControl(p, item, isDesktop) {
        if (p.widget === 'switch') {
            return window.FXComponents.renderSwitchCard({
                label: p.name,
                active: item.rawVal > 0,
                sysEx: p.sysEx,
                paramKey: p.key
            });
        }
        if (isDesktop) {
            return window.FXComponents.renderKnob({
                label: p.name,
                value: item.displayVal,
                percent: item.pct,
                sysEx: p.sysEx,
                paramKey: p.key
            });
        }
        return window.FXComponents.renderStepperCard({
            title: p.name,
            value: item.displayVal,
            sysEx: p.sysEx,
            paramKey: p.key
        });
    }

    // ── Meters de Telemetria (dados reais da mesa via MIDI) ──
    function renderMbandMeters(schema, decoded) {
        const soloState = (key) => {
            const item = decoded && decoded.params[key];
            return !!(item && item.rawVal > 0);
        };
        return window.FXComponents.renderMeters({
            bands: [
                { name: 'LOW', gr: 0, grVal: '0dB', grCh: 16, solo: { sysEx: 45, key: 'soloLow', active: soloState('soloLow') } },
                { name: 'MID', gr: 0, grVal: '0dB', grCh: 17, solo: { sysEx: 46, key: 'soloMid', active: soloState('soloMid') } },
                { name: 'HIGH', gr: 0, grVal: '0dB', grCh: 18, solo: { sysEx: 47, key: 'soloHigh', active: soloState('soloHigh') } }
            ],
            stereo: {
                inL: 0, inLVal: '-48dB',
                inR: 0, inRVal: '-48dB'
            },
            total: 12
        });
    }

    let meterPollTimer = null;

    function startMeterPolling() {
        if (meterPollTimer) return;
        if (typeof socket !== 'undefined' && socket.emit) {
            socket.emit('requestFxMeters');
        }
        meterPollTimer = setInterval(() => {
            if (!isModalOpen()) {
                stopMeterPolling();
                return;
            }
            if (typeof socket !== 'undefined' && socket.emit) {
                socket.emit('requestFxMeters');
            }
        }, 120);
    }

    function stopMeterPolling() {
        if (meterPollTimer) {
            clearInterval(meterPollTimer);
            meterPollTimer = null;
        }
    }

    // Foco contínuo do slot FX em edição (espelha o gr_monitor): a 01V96 só
    // streama os meters 0x06 do FX cujo editor está em foco. Roda APENAS
    // enquanto o modal do editor estiver aberto (startFxMeters/stopFxMeters).
    let fxFocusTimer = null;

    function startFxFocus() {
        if (fxFocusTimer) return;
        if (typeof socket !== 'undefined' && socket.emit) {
            socket.emit('focusFxSlot', { slot: currentSlotIdx });
        }
        fxFocusTimer = setInterval(() => {
            if (!isModalOpen()) {
                stopFxFocus();
                return;
            }
            if (typeof socket !== 'undefined' && socket.emit) {
                socket.emit('focusFxSlot', { slot: currentSlotIdx });
            }
        }, 2000);
    }

    function stopFxFocus() {
        if (fxFocusTimer) {
            clearInterval(fxFocusTimer);
            fxFocusTimer = null;
        }
    }

    function startFxMeters() {
        startMeterPolling();
        startFxFocus();
    }

    function stopFxMeters() {
        stopMeterPolling();
        stopFxFocus();
    }

    function updateFxMeterFromMidi(channel, rawVal) {
        if (!isModalOpen()) return;
        const modal = document.getElementById('fxEditorModal');
        if (!modal) return;

        const maxLit = 12;
        let lit = 0;
        let dbVal = '0dB';

        if (channel >= 16) {
            // --- GAIN REDUCTION (0x10=LOW, 0x11=MID, 0x12=HIGH) ---
            // Escala do GR da Yamaha 01V96: 0 a -18 dB (Step 4095 = 0 dB; Step 3328 = -18 dB)
            // Delta de 767 steps para 18 dB. Qualquer atenuação > 18 dB preenche 100% da barra.
            const is14bit = rawVal > 1023;
            const grStep = is14bit ? Math.max(0, 4095 - rawVal) : Math.max(0, 1023 - rawVal);
            const maxGrStep = is14bit ? 767 : 256;
            const pct = Math.min(100, Math.max(0, (grStep / maxGrStep) * 100));
            lit = Math.round((pct / 100) * maxLit);
            const dbNum = Math.round((pct / 100) * 18);
            dbVal = dbNum === 0 ? '0dB' : '-' + dbNum + 'dB';
        } else {
            // --- LEVEL METERS (0x00=L, 0x01=R) ---
            // Escala da 01V96: 0 dB lá no topo até -48 dB lá embaixo.
            // 0 (ou <=37) = Silêncio (-48 dB). Valores maiores sobem na escala até 0 dB.
            const maxVal = (rawVal > 1023) ? 4095 : 1023;
            if (rawVal <= 37) {
                lit = 0;
                dbVal = '-48dB';
            } else {
                const pct = Math.min(100, Math.max(0, (rawVal / maxVal) * 100));
                lit = Math.round((pct / 100) * maxLit);
                dbVal = Math.round((pct / 100) * 48 - 48) + 'dB';
            }
        }

        const meterEl = modal.querySelector(`.fx-meter[data-meter-ch="${channel}"]`);
        if (!meterEl) return;

        const segs = meterEl.querySelectorAll('.fx-meter-seg');
        segs.forEach(seg => {
            const i = parseInt(seg.getAttribute('data-i'), 10) || 0;
            seg.classList.toggle('lit', i < lit);
            seg.classList.toggle('peak', i === lit - 1 && lit > 0);
        });

        const valEl = meterEl.querySelector('.fx-meter-val');
        if (valEl) valEl.textContent = dbVal;
    }

    function setActiveTab(tabId) {
        activeTabId = tabId;
        rerenderIfOpen();
    }

    // ── Abrir Editor de Efeito (Lazy Sync) ────────────────────────────
    function openFxEditor(slotIdx) {
        if (slotIdx < 0 || slotIdx > 3) return;
        currentSlotIdx = slotIdx;

        const currentTypeInfo = fxTypeState[slotIdx] || {};
        const typeId = currentTypeInfo.id !== undefined ? currentTypeInfo.id : slotIdx;
        const schema = window.FXRegistry ? window.FXRegistry.getSchema(typeId) : null;

        renderModal();

        if (schema && schema.supported) {
            if (!syncedSlots[slotIdx] && !isSyncingSlot[slotIdx]) {
                console.log(`[FX] 🚀 Abrindo slot FX${slotIdx + 1}. Solicitando parâmetros ao servidor...`);
                showEditorSyncOverlay();
                isSyncingSlot[slotIdx] = true;
                if (typeof socket !== 'undefined') {
                    socket.emit('requestFxSlotParams', { slot: slotIdx });
                }
            } else {
                hideEditorSyncOverlay();
            }
        }
    }

    function closeFxEditor() {
        const modal = document.getElementById('fxEditorModal');
        if (modal) modal.style.display = 'none';
        hideEditorSyncOverlay();
        stopFxMeters();

        if (typeof window.syncFxSlotsFromCore === 'function') {
            window.syncFxSlotsFromCore();
        }
        if (typeof window.renderEffectsScreen === 'function') {
            window.renderEffectsScreen();
        }
    }

    function showEditorSyncOverlay() {
        const overlay = document.getElementById('fxEditorSyncOverlay');
        if (overlay) overlay.classList.add('active');
    }

    function hideEditorSyncOverlay() {
        const overlay = document.getElementById('fxEditorSyncOverlay');
        if (overlay) overlay.classList.remove('active');
    }

    // ── Alterar Parâmetro no Servidor (SysEx) ─────────────────────────
    function sendParamChange(sysExParam, newRawVal, slotOverride) {
        const slotIdx = slotOverride !== undefined ? slotOverride : currentSlotIdx;
        if (!fxParamsState[slotIdx]) fxParamsState[slotIdx] = {};
        fxParamsState[slotIdx][sysExParam] = newRawVal;

        if (sysExParam === 52) {
            if (fxTypeState[slotIdx]) {
                fxTypeState[slotIdx].bypass = (newRawVal > 0);
            }
            if (typeof window.syncFxSlotsFromCore === 'function') {
                window.syncFxSlotsFromCore();
            }
            if (typeof window.renderEffectsScreen === 'function') {
                window.renderEffectsScreen();
            }
        }

        if (slotIdx === currentSlotIdx) {
            const updated = updateSingleParamDom(sysExParam, newRawVal);
            if (!updated) {
                rerenderIfOpen();
            }
        }

        if (typeof socket !== 'undefined') {
            socket.emit('changeFxParam', {
                slot: slotIdx,
                param: sysExParam,
                value: newRawVal
            });
        }
    }

    function toggleBypass(slotOverride) {
        const slotIdx = slotOverride !== undefined ? slotOverride : currentSlotIdx;
        const raw = fxParamsState[slotIdx] || {};
        const currentBypass = raw[52] !== undefined ? raw[52] : (fxTypeState[slotIdx]?.bypass ? 1 : 0);
        const newBypass = currentBypass > 0 ? 0 : 1;
        sendParamChange(52, newBypass, slotIdx);
    }

    function toggleSwitch(el) {
        const info = getParamInfoFromElement(el);
        if (!info) return;
        const newVal = info.currentRaw > 0 ? 0 : 1;
        sendParamChange(info.sysEx, newVal);
    }

    // ── Interações de Drag & Wheel ───────────────────────────────────
    let isDragging = false;
    let dragElement = null;
    let startY = 0;
    let startVal = 0;

    function getParamInfoFromElement(el) {
        if (!el) return null;
        const target = el.closest('[data-sysex]') || el;
        const sysExAttr = target.getAttribute('data-sysex');
        if (sysExAttr === null) return null;
        const sysEx = parseInt(sysExAttr, 10);

        const typeId = fxTypeState[currentSlotIdx]?.id ?? currentSlotIdx;
        const schema = window.FXRegistry?.getSchema(typeId);
        if (!schema) return null;

        const config = schema.params.find(p => p.sysEx === sysEx);
        if (!config) return null;

        const currentRaw = fxParamsState[currentSlotIdx][sysEx] !== undefined ? fxParamsState[currentSlotIdx][sysEx] : config.defaultVal;
        return { sysEx: sysEx, config: config, currentRaw: currentRaw };
    }

    function startKnobDrag(e, element) {
        e.preventDefault();
        const info = getParamInfoFromElement(element);
        if (!info) return;

        isDragging = true;
        dragElement = element;
        startY = e.touches ? e.touches[0].clientY : e.clientY;
        startVal = info.currentRaw;

        document.addEventListener('mousemove', onKnobDragMove);
        document.addEventListener('mouseup', onKnobDragEnd);
        document.addEventListener('touchmove', onKnobDragMove, { passive: false });
        document.addEventListener('touchend', onKnobDragEnd);
    }

    function onKnobDragMove(e) {
        if (!isDragging || !dragElement) return;
        e.preventDefault();

        const info = getParamInfoFromElement(dragElement);
        if (!info) return;

        const currentY = e.touches ? e.touches[0].clientY : e.clientY;
        const deltaY = startY - currentY;
        const range = info.config.max - info.config.min;
        const stepChange = (deltaY / 150) * range;
        let newRaw = Math.round(startVal + stepChange);

        newRaw = Math.max(info.config.min, Math.min(info.config.max, newRaw));
        sendParamChange(info.sysEx, newRaw);
    }

    function onKnobDragEnd() {
        isDragging = false;
        dragElement = null;
        document.removeEventListener('mousemove', onKnobDragMove);
        document.removeEventListener('mouseup', onKnobDragEnd);
        document.removeEventListener('touchmove', onKnobDragMove);
        document.removeEventListener('touchend', onKnobDragEnd);
    }

    function handleWheelKnob(e, element) {
        e.preventDefault();
        const info = getParamInfoFromElement(element);
        if (!info) return;

        const delta = e.deltaY < 0 ? 1 : -1;
        let newRaw = info.currentRaw + delta;
        newRaw = Math.max(info.config.min, Math.min(info.config.max, newRaw));

        sendParamChange(info.sysEx, newRaw);
    }

    function startStepperHold(btn, dir, e) {
        if (e) e.preventDefault();
        const card = btn.closest('[data-sysex]');
        if (!card) return;

        const info = getParamInfoFromElement(card);
        if (!info) return;

        stopStepperHold();

        let stepVal = info.currentRaw + dir;
        stepVal = Math.max(info.config.min, Math.min(info.config.max, stepVal));
        sendParamChange(info.sysEx, stepVal);

        stepperTimeout = setTimeout(() => {
            stepperInterval = setInterval(() => {
                const currentInfo = getParamInfoFromElement(card);
                if (!currentInfo) return;
                let nextVal = currentInfo.currentRaw + dir;
                nextVal = Math.max(currentInfo.config.min, Math.min(currentInfo.config.max, nextVal));
                sendParamChange(currentInfo.sysEx, nextVal);
            }, 70);
        }, 300);
    }

    function stopStepperHold() {
        if (stepperTimeout) clearTimeout(stepperTimeout);
        if (stepperInterval) clearInterval(stepperInterval);
        stepperTimeout = null;
        stepperInterval = null;
    }

    // ── Listeners de Socket.IO ─────────────────────────────────────────
    if (typeof socket !== 'undefined') {
        socket.on('connect', function() {
            for (let i = 0; i < 4; i++) isSyncingSlot[i] = false;
            hideEditorSyncOverlay();

            // Bloqueia a execução do CASO 2 (Recall do mesmo preset) no fxTypesUpdate que o servidor envia ao reconectar
            lastSameTypeRecallSyncTime = Date.now();

            if (isModalOpen()) {
                if (syncedSlots[currentSlotIdx]) {
                    renderModal();
                } else {
                    socket.emit('requestFxSlotParams', { slot: currentSlotIdx });
                }
            }
        });

        socket.on('fxSlotParamsUpdate', function(data) {
            if (!data || data.slot === undefined) return;
            const slot = data.slot;

            if (data.params) {
                fxParamsState[slot] = Object.assign({}, fxParamsState[slot], data.params);

                // Atualiza o tipo e nome do efeito a partir do parâmetro 49 (Type ID) se presente
                const typeIdVal = data.params[49] !== undefined ? data.params[49] : data.params[0x31];
                if (typeIdVal !== undefined) {
                    const typeId = Math.round(typeIdVal);
                    const schema = window.FXRegistry ? window.FXRegistry.getSchema(typeId) : null;
                    if (schema) {
                        fxTypeState[slot].id = typeId;
                        fxTypeState[slot].name = schema.name || fxTypeState[slot].name;
                        lastFxTypeId[slot] = typeId;
                    }
                }
            }

            if (Object.keys(fxParamsState[slot]).length >= 14) {
                syncedSlots[slot] = true;
                isSyncingSlot[slot] = false;
                if (slot === currentSlotIdx) {
                    hideEditorSyncOverlay();
                }
            }

            if (slot === currentSlotIdx && isModalOpen()) {
                renderModal();
            }

            if (typeof window.syncFxSlotsFromCore === 'function') {
                window.syncFxSlotsFromCore();
            }
            if (typeof window.renderEffectsScreen === 'function') {
                window.renderEffectsScreen();
            }
        });

        socket.on('fxParamUpdate', function(data) {
            if (!data || data.slot === undefined || data.param === undefined) return;
            const slot = data.slot;
            if (!fxParamsState[slot]) fxParamsState[slot] = {};
            fxParamsState[slot][data.param] = data.value;

            if (data.param === 52) {
                if (fxTypeState[slot]) {
                    fxTypeState[slot].bypass = (data.value > 0);
                }
                if (typeof window.syncFxSlotsFromCore === 'function') {
                    window.syncFxSlotsFromCore();
                }
                if (typeof window.renderEffectsScreen === 'function') {
                    window.renderEffectsScreen();
                }
            }

            if (slot === currentSlotIdx && isModalOpen()) {
                // Se o usuário estiver arrastando este parâmetro, preserva o controle de arrasto
                if (isDragging && dragElement && parseInt(dragElement.getAttribute('data-sysex'), 10) === data.param) {
                    return;
                }
                const updated = updateSingleParamDom(data.param, data.value);
                if (!updated) {
                    rerenderIfOpen();
                }
            }
        });

        socket.on('fxTypesUpdate', function(data) {
            if (!data) return;

            for (let i = 0; i < 4; i++) {
                const d = data[i] || data[String(i)];
                if (d) {
                    const oldId = lastFxTypeId[i];
                    const newId = d.id !== undefined ? d.id : fxTypeState[i].id;

                    // Se o algoritmo (ID) mudou no slot i (ex: Reverb -> Delay)
                    if (oldId !== -1 && oldId !== newId) {
                        console.log(`[FX] 🔀 Mudança de algoritmo no Slot ${i + 1}: ${oldId} -> ${newId}`);
                        syncedSlots[i] = false;
                        fxParamsState[i] = {};
                    }

                    lastFxTypeId[i] = newId;
                    fxTypeState[i].id = newId;
                    fxTypeState[i].name = d.name || fxTypeState[i].name;
                    fxTypeState[i].bypass = d.bypass !== undefined ? d.bypass : fxTypeState[i].bypass;
                    fxTypeState[i].mix = d.mix !== undefined ? d.mix : fxTypeState[i].mix;

                    if (d.mix !== undefined) fxParamsState[i][48] = d.mix;
                    if (d.bypass !== undefined) fxParamsState[i][52] = d.bypass ? 1 : 0;
                }
            }

            // Se o editor estiver aberto no slot cuja máquina mudou de tipo e não estiver sincronizada
            if (isModalOpen() && !syncedSlots[currentSlotIdx] && !isSyncingSlot[currentSlotIdx]) {
                const typeId = fxTypeState[currentSlotIdx]?.id;
                const schema = window.FXRegistry ? window.FXRegistry.getSchema(typeId) : null;
                if (schema && schema.supported) {
                    isSyncingSlot[currentSlotIdx] = true;
                    showEditorSyncOverlay();
                    socket.emit('requestFxSlotParams', { slot: currentSlotIdx, force: true });
                }
            }

            rerenderIfOpen();
        });

        socket.on('fxLibraryRecall', function(data) {
            console.log('[FX RECALL] 🔄 Evento fxLibraryRecall recebido da mesa:', data);
            const slot = (data && data.slot !== undefined) ? parseInt(data.slot, 10) : -1;
            const preset = (data && data.preset !== undefined) ? parseInt(data.preset, 10) : -1;

            if (slot >= 0 && slot < 4) {
                syncedSlots[slot] = false;
                fxParamsState[slot] = {};
                isSyncingSlot[slot] = false;

                // Mapeia presets embutidos (1..64) para os algoritmos numéricos (0..63) da Yamaha 01V96
                if (preset >= 1 && preset <= 64) {
                    const typeId = preset - 1;
                    const schema = window.FXRegistry ? window.FXRegistry.getSchema(typeId) : null;
                    if (schema) {
                        fxTypeState[slot].id = typeId;
                        fxTypeState[slot].name = schema.name || fxTypeState[slot].name;
                        lastFxTypeId[slot] = typeId;
                    }
                }

                if (isModalOpen() && currentSlotIdx === slot) {
                    console.log(`[FX RECALL] Slot ${slot + 1} está ABERTO! Atualizando cabeçalho e disparando resync...`);
                    renderModal();
                    isSyncingSlot[slot] = true;
                    showEditorSyncOverlay();
                    socket.emit('requestFxSlotParams', { slot: slot, force: true });
                }
            } else {
                for (let i = 0; i < 4; i++) {
                    syncedSlots[i] = false;
                    fxParamsState[i] = {};
                    isSyncingSlot[i] = false;
                }
                if (isModalOpen()) {
                    isSyncingSlot[currentSlotIdx] = true;
                    showEditorSyncOverlay();
                    socket.emit('requestFxSlotParams', { slot: currentSlotIdx, force: true });
                }
            }
        });

        socket.on('fxMeterData', function(data) {
            if (!data) return;
            updateFxMeterFromMidi(data.channel, data.raw_val);
        });
    }

    // ── Interface Pública do Core FX ──────────────────────────────────
    const FXCore = {
        openFxEditor: openFxEditor,
        open: openFxEditor,
        openUnderConstruction: openFxEditor,
        closeFxEditor: closeFxEditor,
        close: closeFxEditor,
        setLayoutMode: setLayoutMode,
        setActiveTab: setActiveTab,
        toggleBypass: toggleBypass,
        toggleSwitch: toggleSwitch,
        sendParamChange: sendParamChange,
        startKnobDrag: startKnobDrag,
        handleWheelKnob: handleWheelKnob,
        startStepperHold: startStepperHold,
        stopStepperHold: stopStepperHold,
        getCurrentSlot: () => currentSlotIdx,
        getTypeState: () => fxTypeState,
        getParamsState: () => fxParamsState
    };

    window.FXCore = FXCore;

    // Manter Alias de Compatibilidade com ReverbEditor
    window.ReverbEditor = FXCore;

    // Expor globalmente para atalhos
    window.openFxEditor = openFxEditor;

})();
