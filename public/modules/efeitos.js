// efeitos.js — Módulo de Máquinas de Efeitos da Yamaha 01V96
// Renderiza a tela de overview dos 4 processadores de efeitos (FX1–FX4)

(function () {
    'use strict';

    // ── Estado dos 4 slots (preenchido pelo servidor) ──────────────────
    const fxSlots = [
        { id: 1, effectName: '...', bypass: false, mix: 100 },
        { id: 2, effectName: '...', bypass: false, mix: 100 },
        { id: 3, effectName: '...', bypass: false, mix: 100 },
        { id: 4, effectName: '...', bypass: false, mix: 100 },
    ];

    function applyFxTypes(data) {
        console.log('[FX] fxTypesUpdate recebido:', JSON.stringify(data));
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

    function rerenderIfOpen() {
        const modal = document.getElementById('efeitosModal');
        if (modal && modal.style.display === 'flex') {
            renderEffectsScreen();
        }
    }

    // ── Socket listeners ──────────────────────────────────────────────
    if (typeof socket !== 'undefined') {
        socket.on('fxTypesUpdate', applyFxTypes);
    }

    // ── Renderização ──────────────────────────────────────────────────

    function renderSlot(slot) {
        const bypassCls = slot.bypass ? 'fx-bypass-on' : '';
        const bypassIcon = slot.bypass ? '||' : '>';

        return `
        <div class="fx-slot">
            <div class="fx-side-col fx-side-in">
                <div class="fx-side-row">
                    <span class="fx-channel-label">L</span>
                    <span class="fx-patch-label fx-patch-off">-</span>
                    <div class="fx-wire"></div>
                </div>
                <div class="fx-side-row">
                    <span class="fx-channel-label">R</span>
                    <span class="fx-patch-label fx-patch-off">-</span>
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
                    <span class="fx-patch-label fx-patch-off">-</span>
                    <span class="fx-channel-label">L</span>
                </div>
                <div class="fx-side-row">
                    <div class="fx-wire"></div>
                    <span class="fx-patch-label fx-patch-off">-</span>
                    <span class="fx-channel-label">R</span>
                </div>
            </div>
        </div>`;
    }

    function renderEffectsScreen() {
        const container = document.getElementById('efeitosModalBody');
        if (!container) return;

        const columnsHTML = `
        <div class="efeitos-title">MÁQUINAS DE EFEITOS</div>
        <div class="fx-header-row">
            <div class="fx-header-label">IN PATCH</div>
            <div class="fx-header-label fx-header-processor">PROCESSOR</div>
            <div class="fx-header-label">OUT PATCH</div>
        </div>
        <div class="fx-slots-container">
            ${fxSlots.map(renderSlot).join('')}
        </div>`;

        container.innerHTML = columnsHTML;
    }

    // ── Abertura / Fechamento do Modal ──────────────────────────────────

    function openEffectsModal() {
        const modal = document.getElementById('efeitosModal');
        if (!modal) return;
        modal.style.display = 'flex';
        // Query the mixer for current FX types in all 4 slots
        if (typeof socket !== 'undefined') {
            console.log('[FX] Enviando requestFxTypes...');
            socket.emit('requestFxTypes');
        }
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
