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

    // FX outputs: maps destination key (element*100+channel) → FX slot value
    let fxOutputs = {};

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
        if (val === 113) return 'INS BUS5';
        if (val === 114) return 'INS BUS6';
        if (val === 115) return 'INS BUS7';
        if (val === 116) return 'INS BUS8';
        if (val >= 117 && val <= 124) return 'INS AUX' + (val - 116);
        if (val === 137) return 'INS ST-L';
        if (val === 138) return 'INS ST-R';
        return '???(' + val + ')';
    }

    function fxInputPatchClass(val) {
        return Math.round(val) === 0 ? 'fx-patch-off' : 'fx-patch-active';
    }

    // ── Decoder FX Output Slot ID → label ───────────────────────────────
    function fxOutputSlotLabel(slotVal) {
        slotVal = Math.round(slotVal);
        if (slotVal === 0) return 'OFF';
        if (slotVal >= 1 && slotVal <= 8) return 'BUS' + slotVal;
        if (slotVal === 9) return 'ST L';
        if (slotVal === 10) return 'ST R';
        if (slotVal >= 11 && slotVal <= 18) return 'MATRIX' + (slotVal - 10);
        if (slotVal >= 117 && slotVal <= 124) return 'INS AUX' + (slotVal - 116);
        if (slotVal === 121) return 'FX1 Out1';
        if (slotVal === 122) return 'FX1 Out2';
        if (slotVal === 129) return 'FX2 Out1';
        if (slotVal === 130) return 'FX2 Out2';
        if (slotVal === 137) return 'FX3 Out1';
        if (slotVal === 138) return 'FX3 Out2';
        if (slotVal === 139) return 'FX4 Out1';
        if (slotVal === 140) return 'FX4 Out2';
        return '???(' + slotVal + ')';
    }

    function fxOutputSlotClass(slotVal) {
        return Math.round(slotVal) === 0 ? 'fx-patch-off' : 'fx-patch-active';
    }

    // Decode a destination key (element*100+channel) into a human-readable label
    function fxOutputDestLabel(destKey) {
        const element = Math.floor(destKey / 100);
        const channel = destKey % 100;
        if (element === 1) {
            if (channel <= 31) return 'CH' + (channel + 1);
            const stereoIdx = channel - 32;
            const stinNum = Math.floor(stereoIdx / 2) + 1;
            const lr = stereoIdx % 2 === 0 ? 'L' : 'R';
            return 'STIN' + stinNum + lr;
        }
        if (element === 2) return 'INS CH' + (channel + 1);
        if (element === 7) return 'INS BUS' + (channel + 1);
        if (element === 8) return 'INS AUX' + (channel + 1);
        if (element === 10) return channel === 0 ? 'MASTER L' : 'MASTER R';
        return '?el' + element + 'ch' + channel;
    }

    // Given an FX output slot value (121-140), find the destination key where it's routed
    function findFxOutputDest(slotVal) {
        slotVal = Math.round(slotVal);
        for (const [key, val] of Object.entries(fxOutputs)) {
            const v = Math.round(val);
            if (v === slotVal) {
                return parseInt(key);
            }
        }
        return null;
    }

    // Find ALL destinations matching a given FX slot value (debug helper)
    function findAllFxOutputDests(slotVal) {
        slotVal = Math.round(slotVal);
        const results = [];
        for (const [key, val] of Object.entries(fxOutputs)) {
            const v = Math.round(val);
            if (v === slotVal) {
                results.push(parseInt(key));
            }
        }
        return results;
    }

    function logFxOutputMapping() {
        const fxSlotInfo = [
            { val: 121, name: 'FX1 Out1' },
            { val: 122, name: 'FX1 Out2' },
            { val: 129, name: 'FX2 Out1' },
            { val: 130, name: 'FX2 Out2' },
            { val: 137, name: 'FX3 Out1' },
            { val: 138, name: 'FX3 Out2' },
            { val: 139, name: 'FX4 Out1' },
            { val: 140, name: 'FX4 Out2' },
        ];
        console.log('[FX] === FX Output Mapping ===');
        for (const info of fxSlotInfo) {
            const dests = findAllFxOutputDests(info.val);
            const labels = dests.map(d => fxOutputDestLabel(d));
            console.log('[FX]   ' + info.name + ' (val=' + info.val + '): ' +
                (dests.length === 0 ? 'NOT ROUTED' : dests.map((d, i) => d + '=' + labels[i]).join(', ')));
        }
    }

    function applyFxOutputs(data) {
        const newData = data || {};
        const oldKeys = Object.keys(fxOutputs);
        const newKeys = Object.keys(newData);
        let changed = 0;
        const diffs = [];
        for (const k of newKeys) {
            if (fxOutputs[k] !== newData[k]) {
                changed++;
                diffs.push(k + ': ' + fxOutputs[k] + ' -> ' + newData[k]);
            }
        }
        for (const k of oldKeys) {
            if (!(k in newData)) {
                changed++;
                diffs.push(k + ': ' + fxOutputs[k] + ' -> (removed)');
            }
        }
        console.log('[FX] applyFxOutputs: changed=' + changed + '/' + newKeys.length + ' keys');
        if (changed > 0) console.log('[FX] diffs:', diffs.join(', '));
        fxOutputs = newData;
        logFxOutputMapping();
        rerenderIfOpen();
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
        for (const [key, val] of Object.entries(data)) {
            const i = parseInt(key, 10);
            if (isNaN(i) || i < 0 || i > 7) continue;
            const slot = Math.floor(i / 2);
            const lr = i % 2;
            fxInputs[slot][lr] = val;
        }
        rerenderIfOpen();
    }

    function rerenderIfOpen() {
        const modal = document.getElementById('efeitosModal');
        const isOpen = modal && modal.style.display === 'flex';
        console.log('[FX] rerenderIfOpen: modal exists=' + !!modal + ', display=' + (modal ? modal.style.display : 'N/A') + ', isOpen=' + isOpen);
        if (isOpen) {
            renderEffectsScreen();
        }
    }

    // ── Socket listeners ──────────────────────────────────────────────
    if (typeof socket !== 'undefined') {
        socket.on('fxTypesUpdate', applyFxTypes);
        socket.on('fxInputsUpdate', applyFxInputs);
        socket.on('fxOutputsUpdate', applyFxOutputs);
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

        // FX output: find destinations for this slot's Out1 and Out2
        const outSlotVals = [
            121 + idx * 8,  // Out1
            122 + idx * 8,  // Out2
        ];
        // FX3→FX4 is +2 not +8, so adjust
        if (idx === 3) {
            outSlotVals[0] = 139;
            outSlotVals[1] = 140;
        }
        const outDestL = findFxOutputDest(outSlotVals[0]);
        const outDestR = findFxOutputDest(outSlotVals[1]);
        const lblOutL = outDestL != null ? fxOutputDestLabel(outDestL) : 'OFF';
        const lblOutR = outDestR != null ? fxOutputDestLabel(outDestR) : 'OFF';
        console.log('[FX] renderSlot(' + idx + '): Out1 val=' + outSlotVals[0] + ' dest=' + outDestL + ' lbl=' + lblOutL +
            ' | Out2 val=' + outSlotVals[1] + ' dest=' + outDestR + ' lbl=' + lblOutR);
        const clsOutL = outDestL != null ? 'fx-patch-active' : 'fx-patch-off';
        const clsOutR = outDestR != null ? 'fx-patch-active' : 'fx-patch-off';

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
                    <span class="fx-patch-label ${clsOutL}">${lblOutL}</span>
                    <span class="fx-channel-label">L</span>
                </div>
                <div class="fx-side-row">
                    <div class="fx-wire"></div>
                    <span class="fx-patch-label ${clsOutR}">${lblOutR}</span>
                    <span class="fx-channel-label">R</span>
                </div>
            </div>
        </div>`;
    }

    function renderEffectsScreen() {
        const container = document.getElementById('efeitosModalBody');
        if (!container) {
            console.log('[FX] renderEffectsScreen: container efeitosModalBody NOT FOUND');
            return;
        }
        console.log('[FX] renderEffectsScreen: container found, fxOutputs keys=' + Object.keys(fxOutputs).length);

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

        console.log('[FX] renderEffectsScreen: setting innerHTML (' + columnsHTML.length + ' chars)');
        container.innerHTML = columnsHTML;
        console.log('[FX] renderEffectsScreen: DONE');
    }

    // ── Abertura / Fechamento do Modal ──────────────────────────────────

    function openEffectsModal() {
        const modal = document.getElementById('efeitosModal');
        if (!modal) return;
        modal.style.display = 'flex';
        if (typeof socket !== 'undefined') {
            console.log('[FX] Enviando requestFxTypes + requestFxInputs + requestFxOutputs...');
            socket.emit('requestFxTypes');
            socket.emit('requestFxInputs');
            socket.emit('requestFxOutputs');
            setTimeout(() => {
                console.log('[FX] 2º resync...');
                socket.emit('requestFxTypes');
                socket.emit('requestFxInputs');
                socket.emit('requestFxOutputs');
            }, 4000);
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
