// efeitos.js — Módulo de Máquinas de Efeitos da Yamaha 01V96
// Renderiza a tela de overview dos 4 processadores de efeitos (FX1–FX4)

(function () {
    'use strict';

    // ── Dados Mockados ──────────────────────────────────────────────────
    const MOCK_SLOTS = [
        {
            id: 1,
            effectName: 'REVERB HALL',
            bypass: false,
            panMode: 'L/R',
            mixL: 78,
            mixR: 78,
            inPatchL: { label: '-', type: 'off' },
            inPatchR: { label: '-', type: 'off' },
            outPatchL: { label: '-', type: 'off' },
            outPatchR: { label: '-', type: 'off' },
        },
        {
            id: 2,
            effectName: 'M.BAND DYNA.',
            bypass: false,
            panMode: 'L/R',
            mixL: 64,
            mixR: 64,
            inPatchL: { label: 'INS BUS8', type: 'insert' },
            inPatchR: { label: '-', type: 'off' },
            outPatchL: { label: 'INS CH29', type: 'insert' },
            outPatchR: { label: '-', type: 'off' },
        },
        {
            id: 3,
            effectName: 'REVERB STAGE',
            bypass: false,
            panMode: 'L/R',
            mixL: 70,
            mixR: 70,
            inPatchL: { label: '-', type: 'off' },
            inPatchR: { label: '-', type: 'off' },
            outPatchL: { label: '-', type: 'off' },
            outPatchR: { label: '-', type: 'off' },
        },
        {
            id: 4,
            effectName: 'REVERB PLATE',
            bypass: false,
            panMode: 'L/R',
            mixL: 65,
            mixR: 65,
            inPatchL: { label: '-', type: 'off' },
            inPatchR: { label: '-', type: 'off' },
            outPatchL: { label: '-', type: 'off' },
            outPatchR: { label: '-', type: 'off' },
        },
    ];

    // ── Renderização ────────────────────────────────────────────────────

    function renderSlot(slot) {
        const bypassCls = slot.bypass ? 'fx-bypass-on' : '';
        const bypassIcon = slot.bypass ? '||' : '>';

        return `
        <div class="fx-slot">
            <div class="fx-side-col fx-side-in">
                <div class="fx-side-row">
                    <span class="fx-channel-label">L</span>
                    <span class="fx-patch-label ${slot.inPatchL.type === 'off' ? 'fx-patch-off' : 'fx-patch-active'}">${slot.inPatchL.label}</span>
                    <div class="fx-wire"></div>
                </div>
                <div class="fx-side-row">
                    <span class="fx-channel-label">R</span>
                    <span class="fx-patch-label ${slot.inPatchR.type === 'off' ? 'fx-patch-off' : 'fx-patch-active'}">${slot.inPatchR.label}</span>
                    <div class="fx-wire"></div>
                </div>
            </div>
            <div class="fx-processor ${bypassCls}">
                <span class="fx-proc-id">${slot.id}</span>
                <span class="fx-proc-name">${slot.effectName}</span>
                <button class="fx-bypass-btn" title="Bypass">${bypassIcon}</button>
            </div>
            <div class="fx-side-col fx-side-out">
                <div class="fx-side-row">
                    <div class="fx-wire"></div>
                    <span class="fx-patch-label ${slot.outPatchL.type === 'off' ? 'fx-patch-off' : 'fx-patch-active'}">${slot.outPatchL.label}</span>
                    <span class="fx-channel-label">L</span>
                </div>
                <div class="fx-side-row">
                    <div class="fx-wire"></div>
                    <span class="fx-patch-label ${slot.outPatchR.type === 'off' ? 'fx-patch-off' : 'fx-patch-active'}">${slot.outPatchR.label}</span>
                    <span class="fx-channel-label">R</span>
                </div>
            </div>
        </div>`;
    }

    function renderEffectsScreen() {
        const container = document.getElementById('efeitosModalBody');
        if (!container) return;

        const columnsHTML = `
        <div class="efeitos-title">MÁQUINAS DE EFEITOS (EM CONSTRUÇÃO)</div>
        <div class="fx-header-row">
            <div class="fx-header-label">IN PATCH</div>
            <div class="fx-header-label fx-header-processor">PROCESSOR</div>
            <div class="fx-header-label">OUT PATCH</div>
        </div>
        <div class="fx-slots-container">
            ${MOCK_SLOTS.map(renderSlot).join('')}
        </div>
        <button class="efeitos-close-btn" onclick="closeEffectsModal()">FECHAR</button>`;

        container.innerHTML = columnsHTML;
    }

    // ── Abertura / Fechamento do Modal ──────────────────────────────────

    function openEffectsModal() {
        const modal = document.getElementById('efeitosModal');
        if (!modal) return;
        modal.style.display = 'flex';
        renderEffectsScreen();
    }
    window.openEffectsModal = openEffectsModal;

    function closeEffectsModal() {
        const modal = document.getElementById('efeitosModal');
        if (!modal) return;
        modal.style.display = 'none';
    }
    window.closeEffectsModal = closeEffectsModal;

})();
