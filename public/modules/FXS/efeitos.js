// efeitos.js — Módulo de Máquinas de Efeitos da Yamaha 01V96
// Renderiza a tela de overview dos 4 processadores de efeitos (FX1–FX4)

(function () {
    'use strict';

    // ── Estado dos 4 slots (preenchido pelo servidor) ──────────────────
    const fxSlots = [
        { id: 1, effectName: 'Reverb Hall', bypass: false, mix: 100 },
        { id: 2, effectName: 'Reverb Room', bypass: false, mix: 100 },
        { id: 3, effectName: 'Reverb Stage', bypass: false, mix: 100 },
        { id: 4, effectName: 'Reverb Plate', bypass: false, mix: 100 },
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
        // Verbose debug log removed
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
        
        // Sync local insert input patch values
        for (const [keyStr, val] of Object.entries(newData)) {
            const key = parseInt(keyStr, 10);
            const element = Math.floor(key / 100);
            const channel = key % 100;
            if (element === 2) {
                if (window.channelStates && window.channelStates[channel] && window.channelStates[channel].insert) {
                    window.channelStates[channel].insert.patch_in = val;
                }
            } else if (element === 7) {
                if (window.busesState && window.busesState[channel] && window.busesState[channel].insert) {
                    window.busesState[channel].insert.patch_in = val;
                }
            } else if (element === 8) {
                if (window.mixesState && window.mixesState[channel] && window.mixesState[channel].insert) {
                    window.mixesState[channel].insert.patch_in = val;
                }
            }
        }

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

    // ── Estado de sincronização global ────────────────────────────────
    // Rastreado via evento syncStatus vindo do servidor.
    // true enquanto o SyncManager está rodando (sync inicial ou manual).
    let isSyncing = false;

    // true quando o modal foi aberto durante um sync ativo.
    // Indica que a lógica de FX deve ser disparada assim que o sync terminar.
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
    // Separada em função para poder ser chamada tanto na abertura normal
    // quanto quando o sync termina com o modal já aberto.
    function dispatchFxRequests() {
        if (typeof socket === 'undefined') return;

        // IMPORTANTE: requestFxInputs e requestFxOutputs NÃO podem ser emitidos
        // simultaneamente. O servidor usa a flag global OUTPUT_PATCH_ACTIVE para
        // distinguir respostas de input-patch de output-patch (ambas usam o mesmo
        // endereço MIDI).
        // Requerimento das rotas/tipos foi movido para o socket.js (on 'connect')
        // para garantir que seja solicitado de forma síncrona com o estado da rede.
        console.log('[FX] Enviando requests iniciais de FX...');
        socket.emit('requestFxTypes');
        socket.emit('requestFxInputs');
        socket.emit('requestFxOutputs');
    }

    // ── Socket listeners ──────────────────────────────────────────────
    let isSyncingFxs = false;

    if (typeof socket !== 'undefined') {
        socket.on('fxTypesUpdate', applyFxTypes);
        socket.on('fxInputsUpdate', applyFxInputs);
        socket.on('fxOutputsUpdate', applyFxOutputs);

        socket.on('fxParamUpdate', function(data) {
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
            }
        });

        // Monitora o estado de sincronização para controlar o overlay e
        // para disparar a lógica de FX quando o sync terminar com o modal aberto.
        socket.on('syncStatus', (data) => {
            const wasActive = isSyncing;
            isSyncing = (typeof data === 'object') ? !!data.active : !!data;

            const modal = document.getElementById('efeitosModal');
            const isOpen = modal && modal.style.display === 'flex';

            if (isSyncing) {
                // Sync ativo: se o modal estiver aberto, bloqueia com overlay
                if (isOpen) {
                    showSyncOverlay("AGUARDANDO FINALIZAR SINCRONIZAÇÃO COM A MESA");
                    pendingFxLoad = true;
                    console.log('[FX] Sync ativo com modal aberto — exibindo overlay, aguardando sync...');
                }
            } else {
                // Sync terminou
                if (isOpen) {
                    hideSyncOverlay();
                    if (pendingFxLoad) {
                        // Modal estava esperando o sync terminar — dispara agora
                        pendingFxLoad = false;
                        console.log('[FX] Sync concluído — disparando lógica de FX (pendingFxLoad)...');
                        renderEffectsScreen();
                        dispatchFxRequests();
                    }
                } else {
                    // Modal fechado: limpa o estado pendente
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
        const inL = fxInputs[idx][0];
        const inR = fxInputs[idx][1];
        const lblL = fxInputLabel(inL);
        const lblR = fxInputLabel(inR);
        const clsL = fxInputPatchClass(inL);
        const clsR = fxInputPatchClass(inR);

        // FX output: find destinations for this slot's Out1 and Out2
        const outSlotVals = [
            idx === 3 ? 139 : 121 + idx * 8,  // Out1 (FX4 uses 139/140 instead of +8 rule)
            idx === 3 ? 140 : 122 + idx * 8,  // Out2
        ];
        // O valor do FX4 é 139/140, não bate com a matemática acima, por isso o ternário
        const outDestL = findFxOutputDest(outSlotVals[0]);
        const outDestR = findFxOutputDest(outSlotVals[1]);
        const lblOutL = outDestL != null ? fxOutputDestLabel(outDestL) : 'OFF';
        const lblOutR = outDestR != null ? fxOutputDestLabel(outDestR) : 'OFF';
        const clsOutL = outDestL != null ? 'fx-patch-active' : 'fx-patch-off';
        const clsOutR = outDestR != null ? 'fx-patch-active' : 'fx-patch-off';

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
            console.log('[FX] renderEffectsScreen: container efeitosModalBody NOT FOUND');
            return;
        }

        syncFxSlotsFromCore();
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

        if (isSyncing) {
            // Mesa está sincronizando canais: bloqueia o modal
            showSyncOverlay("AGUARDANDO FINALIZAR SINCRONIZAÇÃO COM A MESA");
            pendingFxLoad = true;
            console.log('[FX] Modal aberto durante sync principal...');
            renderEffectsScreen();
        } else if (isSyncingFxs) {
            // Mesa está sincronizando especificamente os Efeitos (background task do Rust)
            showSyncOverlay("CARREGANDO EFEITOS DA MESA...");
            console.log('[FX] Modal aberto durante sync de FX...');
            renderEffectsScreen();
        } else {
            // Sync já concluído: dispara normalmente
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
        // Cancela qualquer pending load pendente — modal foi fechado antes do sync terminar
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
        console.log('[FX] Abrindo slot FX' + (idx + 1) + ' (Tipo: ' + effectName + ')');

        if (window.FXCore && typeof window.FXCore.openFxEditor === 'function') {
            window.FXCore.openFxEditor(idx);
        } else if (window.ReverbEditor && typeof window.ReverbEditor.open === 'function') {
            window.ReverbEditor.open(idx, effectName);
        }
    }
    window.openFxEditor = openFxEditor;

    // ── rerenderIfOpen (usado pelos listeners de fxTypesUpdate etc.) ───
    function rerenderIfOpen() {
        const modal = document.getElementById('efeitosModal');
        const isOpen = modal && modal.style.display === 'flex';
        console.log('[FX] rerenderIfOpen: modal exists=' + !!modal + ', display=' + (modal ? modal.style.display : 'N/A') + ', isOpen=' + isOpen);
        if (isOpen && !isSyncing && !isSyncingFxs) {
            // Só re-renderiza se não estiver em sync ou carregando FX
            renderEffectsScreen();
        }
    }

    // ── Getters públicos para fx_routing.js ───────────────────────────
    // Permitem que o seletor de patch leia o estado atual e marque
    // o botão ativo ao abrir o modal.
    window.getFxInputs = function () {
        // Retorna cópia do array fxInputs: [[L,R],[L,R],[L,R],[L,R]]
        return fxInputs.map(pair => [...pair]);
    };

    window.getFxOutputs = function () {
        // Retorna cópia do objeto fxOutputs: { destKey: slotVal, ... }
        return Object.assign({}, fxOutputs);
    };

})();
