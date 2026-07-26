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
        if (currentLayoutMode === 'desktop') {
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
                console.log(`[FX] 🚀 Abrindo slot FX${slotIdx + 1} des-sincronizado. Solicitando dados da mesa...`);
                showEditorSyncOverlay();
                isSyncingSlot[slotIdx] = true;
                if (typeof socket !== 'undefined') {
                    socket.emit('requestFxSlotParams', { slot: slotIdx, force: true });
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
    function sendParamChange(sysExParam, newRawVal) {
        fxParamsState[currentSlotIdx][sysExParam] = newRawVal;

        // Atualização instantânea dirigida do DOM para evitar perdas de foco/arrasto e saltos de scroll
        const updated = updateSingleParamDom(sysExParam, newRawVal);
        if (!updated) {
            rerenderIfOpen();
        }

        if (typeof socket !== 'undefined') {
            socket.emit('changeFxParam', {
                slot: currentSlotIdx,
                param: sysExParam,
                value: newRawVal
            });
        }
    }

    function toggleBypass() {
        const raw = fxParamsState[currentSlotIdx] || {};
        const currentBypass = raw[52] !== undefined ? raw[52] : (fxTypeState[currentSlotIdx]?.bypass ? 1 : 0);
        const newBypass = currentBypass > 0 ? 0 : 1;
        sendParamChange(52, newBypass);
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
            }

            if (Object.keys(fxParamsState[slot]).length >= 14) {
                syncedSlots[slot] = true;
                isSyncingSlot[slot] = false;
                if (slot === currentSlotIdx) {
                    hideEditorSyncOverlay();
                }
            }

            if (slot === currentSlotIdx && isModalOpen()) {
                let allUpdated = true;
                for (const [pByteStr, pVal] of Object.entries(data.params || {})) {
                    const pByte = parseInt(pByteStr, 10);
                    if (!updateSingleParamDom(pByte, pVal)) {
                        allUpdated = false;
                    }
                }
                if (!allUpdated) {
                    rerenderIfOpen();
                }
            }
        });

        socket.on('fxParamUpdate', function(data) {
            if (!data || data.slot === undefined || data.param === undefined) return;
            fxParamsState[data.slot][data.param] = data.value;

            if (data.slot === currentSlotIdx && isModalOpen()) {
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

            let isInitial = true;
            let hasDifferentType = false;

            for (let i = 0; i < 4; i++) {
                if (lastFxTypeId[i] !== -1) isInitial = false;
                const d = data[i] || data[String(i)];
                if (d && d.id !== undefined && lastFxTypeId[i] !== -1 && lastFxTypeId[i] !== d.id) {
                    hasDifferentType = true;
                }
            }

            // CARGA INICIAL (no boot / primeira carga): Apenas salva os IDs e estado local
            if (isInitial) {
                for (let i = 0; i < 4; i++) {
                    const d = data[i] || data[String(i)];
                    if (d && d.id !== undefined) lastFxTypeId[i] = d.id;
                    if (d) {
                        fxTypeState[i].id = d.id !== undefined ? d.id : fxTypeState[i].id;
                        fxTypeState[i].name = d.name || fxTypeState[i].name;
                        fxTypeState[i].bypass = d.bypass !== undefined ? d.bypass : fxTypeState[i].bypass;
                        fxTypeState[i].mix = d.mix !== undefined ? d.mix : fxTypeState[i].mix;

                        if (d.mix !== undefined) fxParamsState[i][48] = d.mix;
                        if (d.bypass !== undefined) fxParamsState[i][52] = d.bypass ? 1 : 0;
                    }
                }
                rerenderIfOpen();
                return;
            }

            // CASO 1: Algoritmo mudou (ex: Hall -> Room)
            if (hasDifferentType) {
                console.log('[FX] 🔀 Mudança de Tipo/Algoritmo detectada!');
                for (let i = 0; i < 4; i++) {
                    const d = data[i] || data[String(i)];
                    if (d && d.id !== undefined && lastFxTypeId[i] !== d.id) {
                        syncedSlots[i] = false;
                        fxParamsState[i] = {};
                        lastFxTypeId[i] = d.id;
                    }
                    if (d) {
                        fxTypeState[i].id = d.id !== undefined ? d.id : fxTypeState[i].id;
                        fxTypeState[i].name = d.name || fxTypeState[i].name;
                        fxTypeState[i].bypass = d.bypass !== undefined ? d.bypass : fxTypeState[i].bypass;
                        fxTypeState[i].mix = d.mix !== undefined ? d.mix : fxTypeState[i].mix;

                        if (d.mix !== undefined) fxParamsState[i][48] = d.mix;
                        if (d.bypass !== undefined) fxParamsState[i][52] = d.bypass ? 1 : 0;
                    }
                }

                if (isModalOpen() && !isSyncingSlot[currentSlotIdx]) {
                    isSyncingSlot[currentSlotIdx] = true;
                    showEditorSyncOverlay();
                    socket.emit('requestFxSlotParams', { slot: currentSlotIdx, force: true });
                }
                rerenderIfOpen();
                return;
            }

            // CASO 2: Todos os 4 IDs vieram idênticos (Recall do MESMO Preset na mesa!)
            // Proteção com Cooldown de 3 segundos para que o re-sync execute UMA VEZ e NUNCA entre em loop!
            const now = Date.now();
            if (now - lastSameTypeRecallSyncTime > 3000) {
                lastSameTypeRecallSyncTime = now;
                console.log('[FX] 🔄 Recall do MESMO Preset detectado na mesa! Resyncing...');
                for (let i = 0; i < 4; i++) {
                    syncedSlots[i] = false;
                    fxParamsState[i] = {};
                    const d = data[i] || data[String(i)];
                    if (d) {
                        fxTypeState[i].id = d.id !== undefined ? d.id : fxTypeState[i].id;
                        fxTypeState[i].name = d.name || fxTypeState[i].name;
                        fxTypeState[i].bypass = d.bypass !== undefined ? d.bypass : fxTypeState[i].bypass;
                        fxTypeState[i].mix = d.mix !== undefined ? d.mix : fxTypeState[i].mix;

                        if (d.mix !== undefined) fxParamsState[i][48] = d.mix;
                        if (d.bypass !== undefined) fxParamsState[i][52] = d.bypass ? 1 : 0;
                    }
                }

                if (isModalOpen() && !isSyncingSlot[currentSlotIdx]) {
                    isSyncingSlot[currentSlotIdx] = true;
                    showEditorSyncOverlay();
                    socket.emit('requestFxSlotParams', { slot: currentSlotIdx, force: true });
                }
            } else {
                for (let i = 0; i < 4; i++) {
                    const d = data[i] || data[String(i)];
                    if (d) {
                        fxTypeState[i].id = d.id !== undefined ? d.id : fxTypeState[i].id;
                        fxTypeState[i].name = d.name || fxTypeState[i].name;
                        fxTypeState[i].bypass = d.bypass !== undefined ? d.bypass : fxTypeState[i].bypass;
                        fxTypeState[i].mix = d.mix !== undefined ? d.mix : fxTypeState[i].mix;

                        if (d.mix !== undefined) fxParamsState[i][48] = d.mix;
                        if (d.bypass !== undefined) fxParamsState[i][52] = d.bypass ? 1 : 0;
                    }
                }
            }

            rerenderIfOpen();
        });

        socket.on('fxLibraryRecall', function() {
            console.log('[FX RECALL] 🔄 fxLibraryRecall recebido da mesa!');
            lastSameTypeRecallSyncTime = Date.now();
            for (let i = 0; i < 4; i++) {
                syncedSlots[i] = false;
                fxParamsState[i] = {};
            }

            isSyncingSlot[currentSlotIdx] = false;

            if (isModalOpen()) {
                isSyncingSlot[currentSlotIdx] = true;
                showEditorSyncOverlay();
                socket.emit('requestFxSlotParams', { slot: currentSlotIdx, force: true });
            }
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
        sendParamChange: sendParamChange,
        startKnobDrag: startKnobDrag,
        handleWheelKnob: handleWheelKnob,
        startStepperHold: startStepperHold,
        stopStepperHold: stopStepperHold,
        getCurrentSlot: () => currentSlotIdx,
        getParamsState: () => fxParamsState
    };

    window.FXCore = FXCore;

    // Manter Alias de Compatibilidade com ReverbEditor
    window.ReverbEditor = FXCore;

    // Expor globalmente para atalhos
    window.openFxEditor = openFxEditor;

})();
