// efeitos.js — Módulo de Máquinas de Efeitos da Yamaha 01V96
// Renderiza a tela de overview dos 4 processadores de efeitos (FX1–FX4)
// Estado de roteamento (inputs/outputs) é lido exclusivamente de PatchRegistry.
// Estado local: apenas fxSlots (nome do efeito, bypass, mix).

(function () {
    'use strict';

    // ── Estado local: apenas metadados dos 4 slots ────────────────────
    // Roteamento (inputs/outputs) é consultado via PatchRegistry.getFxInfo().
    const fxSlots = [
        { id: 1, effectName: 'Reverb Hall', bypass: false, mix: 100 },
        { id: 2, effectName: 'Reverb Room', bypass: false, mix: 100 },
        { id: 3, effectName: 'Reverb Stage', bypass: false, mix: 100 },
        { id: 4, effectName: 'Reverb Plate', bypass: false, mix: 100 },
    ];

    // ── Helpers ───────────────────────────────────────────────────────

    function hasPatchRegistry() {
        return typeof window.PatchRegistry !== 'undefined' && window.PatchRegistry !== null;
    }

    // ── Atualização de metadados (fxTypesUpdate) ─────────────────────
    function applyFxTypes(data) {
        for (let i = 0; i < 4; i++) {
            const d = data[i] || data[String(i)];
            if (d) {
                fxSlots[i].effectName = d.name || '...';
                fxSlots[i].bypass = d.bypass || false;
                fxSlots[i].mix = d.mix != null ? d.mix : 100;
            }
        }
        rerenderIfOpen();
    }

    // ── Estado de sincronização global ────────────────────────────────
    let isSyncing = false;
    let pendingFxLoad = false;

    // ── Overlay de bloqueio de sync ───────────────────────────────────
    function showSyncOverlay(msg) {
        const overlay = document.getElementById('fxSyncOverlay');
        if (overlay) {
            if (msg) {
                const textEl = overlay.querySelector('.fx-sync-text');
                if (textEl) textEl.innerHTML = msg;
            }
            overlay.classList.add('active');
        }
    }

    function hideSyncOverlay() {
        const overlay = document.getElementById('fxSyncOverlay');
        if (overlay) overlay.classList.remove('active');
    }

    // ── Lógica de request dos dados FX da mesa ────────────────────────
    function dispatchFxRequests() {
        if (typeof socket === 'undefined') return;
        socket.emit('requestFxTypes');
        socket.emit('requestFxInputs');
        socket.emit('requestFxOutputs');
    }

    // ── Socket listeners ──────────────────────────────────────────────
    let isSyncingFxs = false;

    if (typeof socket !== 'undefined') {
        // fxTypesUpdate: atualiza metadados locais (nome, bypass, mix)
        socket.on('fxTypesUpdate', applyFxTypes);

        // fxInputsUpdate / fxOutputsUpdate: PATCHREGISTRY já trata atualização
        // do cache. Apenas re-renderizamos a UI se o modal estiver aberto.
        socket.on('fxInputsUpdate', function () { rerenderIfOpen(); });
        socket.on('fxOutputsUpdate', function () { rerenderIfOpen(); });

        socket.on('fxParamUpdate', function (data) {
            if (!data || data.slot === undefined || data.slot < 0 || data.slot > 3) return;
            const slot = data.slot;
            if (data.param === 52) {
                fxSlots[slot].bypass = data.value > 0;
                rerenderIfOpen();
            } else if (data.param === 48) {
                fxSlots[slot].mix = data.value;
                rerenderIfOpen();
            }
        });

        socket.on('fxSyncStatus', (data) => {
            const active = (typeof data === 'object') ? !!data.active : !!data;
            isSyncingFxs = active;
            const modal = document.getElementById('efeitosModal');
            const isOpen = modal && modal.style.display === 'flex';

            if (active && isOpen) {
                showSyncOverlay("CARREGANDO EFEITOS DA MESA...");
            } else if (!active && isOpen) {
                hideSyncOverlay();
                renderEffectsScreen();
                dispatchFxRequests();
            }
        });

        socket.on('syncStatus', (data) => {
            isSyncing = (typeof data === 'object') ? !!data.active : !!data;
            const modal = document.getElementById('efeitosModal');
            const isOpen = modal && modal.style.display === 'flex';

            if (isSyncing) {
                if (isOpen) {
                    showSyncOverlay("AGUARDANDO FINALIZAR SINCRONIZAÇÃO COM A MESA");
                    pendingFxLoad = true;
                }
            } else {
                if (isOpen) {
                    hideSyncOverlay();
                    if (pendingFxLoad) {
                        pendingFxLoad = false;
                        renderEffectsScreen();
                        dispatchFxRequests();
                    }
                } else {
                    pendingFxLoad = false;
                }
            }
        });
    }

    // ── Renderização ──────────────────────────────────────────────────

    function syncFxSlotsFromCore() {
        if (!window.FXCore || !window.FXCore.getTypeState) return;
        const types = window.FXCore.getTypeState();
        const params = window.FXCore.getParamsState();
        if (!types) return;
        for (let i = 0; i < 4; i++) {
            if (types[i]) {
                fxSlots[i].effectName = types[i].name || fxSlots[i].effectName;
                const bypassFromParam = (params && params[i] && params[i][52] !== undefined)
                    ? (params[i][52] > 0)
                    : undefined;
                fxSlots[i].bypass = bypassFromParam !== undefined ? bypassFromParam : (types[i].bypass || false);
                fxSlots[i].mix = types[i].mix !== undefined ? types[i].mix : fxSlots[i].mix;
            }
        }
    }
    window.syncFxSlotsFromCore = syncFxSlotsFromCore;

    function toggleSlotBypass(idx, event) {
        if (event) event.stopPropagation();
        if (window.FXCore && window.FXCore.toggleBypass) {
            window.FXCore.toggleBypass(idx);
        } else {
            fxSlots[idx].bypass = !fxSlots[idx].bypass;
            renderEffectsScreen();
        }
    }
    window.toggleSlotBypass = toggleSlotBypass;

    function renderSlot(slot, idx) {
        const bypassCls = slot.bypass ? 'fx-bypass-on' : '';
        const bypassIcon = slot.bypass ? '||' : '>';

        // Lê roteamento exclusivamente do PatchRegistry
        const info = hasPatchRegistry() ? window.PatchRegistry.getFxInfo(idx) : null;

        const lblL = info ? info.inLabelL : 'OFF';
        const lblR = info ? info.inLabelR : 'OFF';
        const clsL = (info && info.inL) ? 'fx-patch-active' : 'fx-patch-off';
        const clsR = (info && info.inR) ? 'fx-patch-active' : 'fx-patch-off';

        const lblOutL = info ? info.outLabelL : 'OFF';
        const lblOutR = info ? info.outLabelR : 'OFF';
        const clsOutL = (info && info.outL != null) ? 'fx-patch-active' : 'fx-patch-off';
        const clsOutR = (info && info.outR != null) ? 'fx-patch-active' : 'fx-patch-off';

        return `
        <div class="fx-slot">
            <div class="fx-side-col fx-side-in">
                <div class="fx-side-row">
                    <span class="fx-channel-label">L</span>
                    <span class="fx-patch-label ${clsL}" id="fx-patch-in-${idx}-0" onclick="openFxPatchSelector(${idx}, 0, 'in')">${lblL}</span>
                    <div class="fx-wire"></div>
                </div>
                <div class="fx-side-row">
                    <span class="fx-channel-label">R</span>
                    <span class="fx-patch-label ${clsR}" id="fx-patch-in-${idx}-1" onclick="openFxPatchSelector(${idx}, 1, 'in')">${lblR}</span>
                    <div class="fx-wire"></div>
                </div>
            </div>
            <div class="fx-processor ${bypassCls}" onclick="if(!event.target.closest('.fx-bypass-btn')) openFxEditor(${idx})">
                <span class="fx-proc-id">${slot.id}</span>
                <span class="fx-proc-name">${slot.effectName}</span>
                <button class="fx-bypass-btn" title="Bypass" onclick="toggleSlotBypass(${idx}, event)">${bypassIcon}</button>
            </div>
            <div class="fx-side-col fx-side-out">
                <div class="fx-side-row">
                    <div class="fx-wire"></div>
                    <span class="fx-patch-label ${clsOutL}" id="fx-patch-out-${idx}-0" onclick="openFxPatchSelector(${idx}, 0, 'out')">${lblOutL}</span>
                    <span class="fx-channel-label">L</span>
                </div>
                <div class="fx-side-row">
                    <div class="fx-wire"></div>
                    <span class="fx-patch-label ${clsOutR}" id="fx-patch-out-${idx}-1" onclick="openFxPatchSelector(${idx}, 1, 'out')">${lblOutR}</span>
                    <span class="fx-channel-label">R</span>
                </div>
            </div>
        </div>`;
    }

    function renderEffectsScreen() {
        const container = document.getElementById('efeitosModalBody');
        if (!container) {
            console.warn('[FX] renderEffectsScreen: container efeitosModalBody NOT FOUND');
            return;
        }

        syncFxSlotsFromCore();

        const columnsHTML = `
        <div class="efeitos-title">MÁQUINAS DE EFEITOS</div>
        <div class="fx-header-row">
            <div class="fx-header-label">IN PATCH</div>
            <div class="fx-header-label fx-header-processor">PROCESSOR</div>
            <div class="fx-header-label">OUT PATCH</div>
        </div>
        <div class="fx-slots-container">
            ${fxSlots.map((s, i) => renderSlot(s, i)).join('')}
        </div>`;

        container.innerHTML = columnsHTML;
    }

    // ── Abertura / Fechamento do Modal ──────────────────────────────────

    function openEffectsModal() {
        const modal = document.getElementById('efeitosModal');
        if (!modal) return;
        modal.style.display = 'flex';

        if (isSyncing) {
            showSyncOverlay("AGUARDANDO FINALIZAR SINCRONIZAÇÃO COM A MESA");
            pendingFxLoad = true;
            renderEffectsScreen();
        } else if (isSyncingFxs) {
            showSyncOverlay("CARREGANDO EFEITOS DA MESA...");
            renderEffectsScreen();
        } else {
            hideSyncOverlay();
            pendingFxLoad = false;
            renderEffectsScreen();
            dispatchFxRequests();
        }
    }
    window.openEffectsModal = openEffectsModal;

    function closeEffectsModal() {
        const modal = document.getElementById('efeitosModal');
        if (!modal) return;
        modal.style.display = 'none';
        pendingFxLoad = false;
        hideSyncOverlay();
    }
    window.closeEffectsModal = closeEffectsModal;

    function isStandardReverbName(name) {
        if (!name) return false;
        const s = String(name).toUpperCase();
        if (s.includes('REV-X') || s.includes('REV X') || s.includes('+')) return false;
        return s.includes('HALL') || s.includes('ROOM') || s.includes('STAGE') || s.includes('PLATE') || s.includes('REVERB');
    }

    function openFxEditor(idx) {
        const slot = fxSlots[idx];
        const effectName = slot ? slot.effectName : '';

        if (window.FXCore && typeof window.FXCore.openFxEditor === 'function') {
            window.FXCore.openFxEditor(idx);
        } else if (window.ReverbEditor && typeof window.ReverbEditor.open === 'function') {
            window.ReverbEditor.open(idx, effectName);
        }
    }
    window.openFxEditor = openFxEditor;

    // ── rerenderIfOpen ──────────────────────────────────────────────
    function rerenderIfOpen() {
        const modal = document.getElementById('efeitosModal');
        const isOpen = modal && modal.style.display === 'flex';
        if (isOpen && !isSyncing && !isSyncingFxs) {
            renderEffectsScreen();
        }
    }

    // ── Getters públicos (delegam ao PatchRegistry) ───────────────────
    window.getFxInputs = function () {
        if (hasPatchRegistry()) return window.PatchRegistry.getFxInputs();
        return [[0, 0], [0, 0], [0, 0], [0, 0]];
    };

    window.getFxOutputs = function () {
        if (hasPatchRegistry()) return window.PatchRegistry.getFxOutputs();
        return {};
    };

})();
