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

    // FX inputs: [slot][lr] → source id
    const fxInputs = [
        [0, 0], // FX1 L/R
        [0, 0], // FX2 L/R
        [0, 0], // FX3 L/R
        [0, 0], // FX4 L/R
    ];

    // ── Decoder FX Input Source → label ───────────────────────────────
    function fxInputLabel(val) {
        val = Math.round(val);
        if (val === 0) return 'OFF';
        if (val >= 1 && val <= 8) return 'AUX' + val;
        if (val >= 13 && val <= 44) return 'INS CH' + (val - 12);
        if (val === 109) return 'INS BUS1';
        if (val === 110) return 'INS BUS2';
        if (val === 111) return 'INS BUS3';
        if (val === 112) return 'INS BUS4';
        if (val === 113) return 'INS RET1 L';
        if (val === 114) return 'INS RET1 R';
        if (val === 115) return 'INS RET2 L';
        if (val === 116) return 'INS RET2 R';
        if (val >= 117 && val <= 124) return 'INS AUX' + (val - 116);
        if (val === 137) return 'INS ST-L';
        if (val === 138) return 'INS ST-R';
        return '???(' + val + ')';
    }

    function fxInputPatchClass(val) {
        return Math.round(val) === 0 ? 'fx-patch-off' : 'fx-patch-active';
    }

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

    function applyFxInputs(data) {
        console.log('[FX] fxInputsUpdate recebido:', JSON.stringify(data));
        for (let i = 0; i < 8; i++) {
            const val = data[i] != null ? data[i] : 0;
            const slot = Math.floor(i / 2);
            const lr = i % 2;
            fxInputs[slot][lr] = val;
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
        socket.on('fxInputsUpdate', applyFxInputs);
    }

    // ── Renderização ──────────────────────────────────────────────────

    function renderSlot(slot, idx) {
        const bypassCls = slot.bypass ? 'fx-bypass-on' : '';
        const bypassIcon = slot.bypass ? '||' : '>';
        const inL = fxInputs[idx][0];
        const inR = fxInputs[idx][1];
        const lblL = fxInputLabel(inL);
        const lblR = fxInputLabel(inR);
        const clsL = fxInputPatchClass(inL);
        const clsR = fxInputPatchClass(inR);

        return `
        <div class="fx-slot">
            <div class="fx-side-col fx-side-in">
                <div class="fx-side-row">
                    <span class="fx-channel-label">L</span>
                    <span class="fx-patch-label ${clsL}">${lblL}</span>
                    <div class="fx-wire"></div>
                </div>
                <div class="fx-side-row">
                    <span class="fx-channel-label">R</span>
                    <span class="fx-patch-label ${clsR}">${lblR}</span>
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
            ${fxSlots.map((s, i) => renderSlot(s, i)).join('')}
        </div>`;

        container.innerHTML = columnsHTML;
    }

    // ── Abertura / Fechamento do Modal ──────────────────────────────────

    function openEffectsModal() {
        const modal = document.getElementById('efeitosModal');
        if (!modal) return;
        modal.style.display = 'flex';
        if (typeof socket !== 'undefined') {
            console.log('[FX] Enviando requestFxTypes + requestFxInputs...');
            socket.emit('requestFxTypes');
            socket.emit('requestFxInputs');
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
