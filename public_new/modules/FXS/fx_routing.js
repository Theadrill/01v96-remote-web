// fx_routing.js — Modal de Seleção de Patch FX (IN / OUT)
// Implementa a troca real de fonte/destino dos processadores de efeito.

(function () {
    'use strict';

    // ── Contexto: qual FX / qual lado / IN ou OUT ─────────────────────
    // slot: 0-3, lr: 0=L/1=R, side: 'in'|'out'
    let _fxCtx = { slot: 0, lr: 0, side: 'in' };

    // ── Categorias FX IN (fontes que alimentam o FX) ──────────────────
    const FX_IN_CATEGORIES = [
        {
            name: 'NONE',
            options: [{ id: 0, name: 'OFF' }]
        },
        {
            name: 'AUX',
            options: [1, 2, 3, 4, 5, 6, 7, 8].map(n => ({ id: n, name: 'AUX' + n }))
        },
        {
            name: 'INS CH',
            options: Array.from({ length: 32 }, (_, i) => ({ id: 13 + i, name: 'INS CH' + (i + 1) }))
        },
        {
            name: 'INS BUS',
            options: [1, 2, 3, 4, 5, 6, 7, 8].map(n => ({ id: 108 + n, name: 'INS BUS' + n }))
        },
        {
            name: 'INS AUX',
            options: [1, 2, 3, 4, 5, 6, 7, 8].map(n => ({ id: 116 + n, name: 'INS AUX' + n }))
        },
        {
            name: 'INS MASTER LR',
            options: [
                { id: 137, name: 'INS MASTER L' },
                { id: 138, name: 'INS MASTER R' }
            ]
        }
    ];

    // ── Categorias FX OUT (destinos da saída do FX) ───────────────────
    // element + channel identificam o destino no protocolo Yamaha.
    // element=null → NONE (limpar a rota)
    const FX_OUT_CATEGORIES = [
        {
            name: 'NONE',
            options: [{ id: -1, name: 'OFF', element: null, channel: null }]
        },
        {
            name: 'CH',
            options: Array.from({ length: 32 }, (_, i) => ({
                id: i, name: 'CH' + (i + 1), element: 1, channel: i
            }))
        },
        {
            name: 'ST IN',
            options: (() => {
                const opts = [];
                for (let pair = 0; pair < 4; pair++) {
                    const baseCh = 32 + pair * 2;
                    opts.push({ id: baseCh, name: 'STIN' + (pair + 1) + 'L', element: 1, channel: baseCh });
                    opts.push({ id: baseCh + 1, name: 'STIN' + (pair + 1) + 'R', element: 1, channel: baseCh + 1 });
                }
                return opts;
            })()
        },
        {
            name: 'INS CH',
            options: Array.from({ length: 32 }, (_, i) => ({
                id: 1000 + i, name: 'INS CH' + (i + 1), element: 2, channel: i
            }))
        },
        {
            name: 'INS BUS',
            options: [0, 1, 2, 3, 4, 5, 6, 7].map(ch => ({
                id: 2000 + ch, name: 'INS BUS' + (ch + 1), element: 7, channel: ch
            }))
        },
        {
            name: 'INS AUX',
            options: [0, 1, 2, 3, 4, 5, 6, 7].map(ch => ({
                id: 3000 + ch, name: 'INS AUX' + (ch + 1), element: 8, channel: ch
            }))
        },
        {
            name: 'INS MASTER LR',
            options: [
                { id: 4000, name: 'INS MASTER L', element: 10, channel: 0 },
                { id: 4001, name: 'INS MASTER R', element: 10, channel: 1 }
            ]
        }
    ];

    // ── Renderiza categorias no grid ──────────────────────────────────
    function renderCategoriesIntoGrid(gridEl, categories, activeId) {
        gridEl.innerHTML = '';

        categories.forEach(cat => {
            if (!cat.options || cat.options.length === 0) return;

            const catDiv = document.createElement('div');
            catDiv.className = 'fx-patch-category';

            const header = document.createElement('div');
            header.className = 'fx-patch-category-header';
            header.innerText = cat.name;
            catDiv.appendChild(header);

            const btnGrid = document.createElement('div');
            btnGrid.className = 'patch-category-grid';

            cat.options.forEach(opt => {
                const btn = document.createElement('button');
                const isActive = (opt.id === activeId);
                btn.className = 'patch-opt-btn' + (isActive ? ' active' : '');
                btn.innerText = opt.name;
                btn.dataset.id = opt.id;
                btn.onclick = () => handleFxPatchSelect(opt);
                btnGrid.appendChild(btn);
            });

            catDiv.appendChild(btnGrid);
            gridEl.appendChild(catDiv);
        });
    }

    // ── Handler de seleção REAL ─────────────────────────────────────
    function handleFxPatchSelect(opt) {
        const { slot, lr, side } = _fxCtx;
        console.log('[FX-ROUTING] Select:', JSON.stringify(opt), '| ctx:', JSON.stringify(_fxCtx));

        if (typeof socket === 'undefined') {
            console.warn('[FX-ROUTING] socket não disponível');
            return;
        }

        if (side === 'in') {
            // Envia comando MIDI para mudar a fonte do FX input
            const payload = {
                slot: slot,
                lr: lr,
                source_id: opt.id  // 0=OFF, 1-8=AUX, 13-44=INSCH, etc.
            };
            console.log('[FX-ROUTING] Emitindo setFxInput:', payload);
            socket.emit('setFxInput', payload);
            updateGridUi(opt);
        } else {
            // Para FX Output, checa se a porta de destino já está sendo usada
            if (opt.element !== null && opt.channel !== null) {
                const destKey = opt.element * 100 + opt.channel;
                const outputs = (typeof window.getFxOutputs === 'function') ? window.getFxOutputs() : {};
                const currentSrcVal = outputs[destKey] ? Math.round(outputs[destKey]) : 0;
                
                const fxSlotVals = [
                    [121, 122], [129, 130], [137, 138], [139, 140]
                ];
                const ourFxVal = fxSlotVals[slot][lr];

                if (currentSrcVal !== 0 && currentSrcVal !== ourFxVal) {
                    showFxOutConfirmModal(opt, currentSrcVal, ourFxVal);
                    return;
                }
            }
            executeFxPatchSelect(opt);
        }
    }

    window.executeFxPatchSelect = function(opt) {
        const { slot, lr } = _fxCtx;
        const payload = {
            slot: slot,
            lr: lr,
            element: opt.element ?? null,      // null = NONE
            dest_channel: opt.channel ?? null  // null = NONE
        };
        console.log('[FX-ROUTING] Emitindo setFxOutput:', payload);
        socket.emit('setFxOutput', payload);
        updateGridUi(opt);
    };

    function updateGridUi(opt) {
        // Atualiza visualmente o botão ativo no grid imediatamente (optimistic UI)
        const grid = document.getElementById('fxPatchGrid');
        if (grid) {
            grid.querySelectorAll('.patch-opt-btn').forEach(btn => btn.classList.remove('active'));
            const clickedId = String(opt.id);
            grid.querySelectorAll('.patch-opt-btn').forEach(btn => {
                if (btn.dataset.id === clickedId) btn.classList.add('active');
            });
        }
        closeFxPatchSelector();
    }

    // ── Determina o valor ativo atual para marcar o botão no seletor ─
    function getCurrentActiveId(slot, lr, side) {
        // Tenta ler o estado atual do módulo efeitos.js via getter global
        if (side === 'in') {
            if (typeof window.getFxInputs === 'function') {
                const inputs = window.getFxInputs();
                return (inputs[slot] && inputs[slot][lr] !== undefined) ? inputs[slot][lr] : 0;
            }
            return 0;
        } else {
            // Para OUT: busca qual destino está mapeado para o slot+lr via projeção
            if (window.PatchRegistry && typeof window.PatchRegistry.getFxDestination === 'function') {
                const destKey = window.PatchRegistry.getFxDestination(slot, lr);
                if (destKey !== null) {
                    const element = Math.floor(destKey / 100);
                    const channel = destKey % 100;
                    return findFxOutId(element, channel);
                }
                return -1;
            }
            if (typeof window.getFxOutputs === 'function') {
                const outputs = window.getFxOutputs();
                const fxSlotVals = [
                    [121, 122], // FX1 L/R
                    [129, 130], // FX2 L/R
                    [137, 138], // FX3 L/R
                    [139, 140], // FX4 L/R
                ];
                const targetVal = fxSlotVals[slot][lr];
                for (const [destKey, val] of Object.entries(outputs)) {
                    if (Math.round(val) === targetVal) {
                        const element = Math.floor(destKey / 100);
                        const channel = destKey % 100;
                        return findFxOutId(element, channel);
                    }
                }
            }
            return -1; // NONE
        }
    }

    // Encontra o opt.id correspondente a um element+channel nas categorias FX_OUT
    function findFxOutId(element, channel) {
        for (const cat of FX_OUT_CATEGORIES) {
            for (const opt of cat.options) {
                if (opt.element === element && opt.channel === channel) {
                    return opt.id;
                }
            }
        }
        return -1;
    }

    // ── Abre o seletor de patch FX ────────────────────────────────────
    window.openFxPatchSelector = function (slot, lr, side) {
        _fxCtx = { slot, lr, side };

        const modal = document.getElementById('fxPatchSelectorModal');
        const grid = document.getElementById('fxPatchGrid');
        const title = document.getElementById('fxPatchSelectorTitle');
        if (!modal || !grid || !title) return;

        const sideLabel = side === 'in' ? 'ENTRADA' : 'SAÍDA';
        const lrLabel = lr === 0 ? 'L' : 'R';
        title.innerText = 'FX' + (slot + 1) + ' ' + sideLabel + ' ' + lrLabel;

        const activeId = getCurrentActiveId(slot, lr, side);
        const categories = side === 'in' ? FX_IN_CATEGORIES : FX_OUT_CATEGORIES;
        renderCategoriesIntoGrid(grid, categories, activeId);

        modal.style.display = 'flex';

        // Scroll automático para o botão ativo
        requestAnimationFrame(() => {
            const activeBtn = grid.querySelector('.patch-opt-btn.active');
            if (activeBtn) activeBtn.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        });
    };

    window.closeFxPatchSelector = function () {
        const modal = document.getElementById('fxPatchSelectorModal');
        if (modal) modal.style.display = 'none';
    };

    // ── Lógica de Confirmação de FX Output ────────────────────────────
    function getFxSourceName(val) {
        if (val === 0) return 'OFF';
        if (val >= 1 && val <= 32) return `CH ${val}`;
        if (val >= 33 && val <= 40) return `BUS ${val - 32}`;
        if (val >= 41 && val <= 48) return `AUX ${val - 40}`;
        if (val === 49) return `STEREO L`;
        if (val === 50) return `STEREO R`;
        if (val === 51) return `C-R L`;
        if (val === 52) return `C-R R`;
        if (val === 139) return 'FX4 L';
        if (val === 140) return 'FX4 R';
        if (val >= 121 && val <= 138) {
            const fxNum = Math.floor((val - 121) / 8) + 1;
            const isR = (val - 121) % 8 === 1;
            return `FX${fxNum} ${isR ? 'R' : 'L'}`;
        }
        return `FONTE ${val}`;
    }

    function createFxConfirmModalOverlay() {
        const overlay = document.createElement('div');
        overlay.id = 'fxConfirmModalOverlay';
        overlay.className = 'modal-overlay';
        overlay.style.cssText = 'position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.85); display:none; justify-content:center; align-items:center; z-index:99999 !important;';
        
        const modalBody = document.createElement('div');
        modalBody.className = 'modal-content';
        modalBody.id = 'fxConfirmModalContent';
        modalBody.style.maxWidth = '350px';
        modalBody.style.padding = '0';
        modalBody.style.overflow = 'hidden';
        
        overlay.appendChild(modalBody);
        document.body.appendChild(overlay);
        return overlay;
    }

    window.closeFxConfirmModal = function() {
        const overlay = document.getElementById('fxConfirmModalOverlay');
        if (overlay) overlay.style.display = 'none';
    };

    window.showFxOutConfirmModal = function(opt, currentAssignedSrc, ourFxVal) {
        const overlay = document.getElementById('fxConfirmModalOverlay') || createFxConfirmModalOverlay();
        const modal = document.getElementById('fxConfirmModalContent');
        
        const currentName = getFxSourceName(currentAssignedSrc);
        const newName = getFxSourceName(ourFxVal);
        const portName = opt.name;

        const html = `
            <div style="padding: 20px; text-align: center;">
                <h3 style="margin-top:0; color:#dc3545; margin-bottom:15px;"><i class="fas fa-exclamation-triangle"></i> ATENÇÃO</h3>
                <p style="color:#ddd; margin-bottom: 20px; font-size: 14px;">
                    O destino <strong>${portName}</strong> já está sendo usado por <strong>${currentName}</strong>.<br><br>
                    Deseja alterar o roteamento para <strong>${newName}</strong>?
                </p>
                <div style="display: flex; gap: 10px;">
                    <button onclick="confirmFxPatchSelect(${opt.id})" style="flex:1; height:45px; background:#dc3545; border:none; color:#fff; border-radius:8px; font-weight:bold; cursor:pointer;">SIM</button>
                    <button onclick="closeFxConfirmModal()" style="flex:1; height:45px; background:#444; border:none; color:#fff; border-radius:8px; font-weight:bold; cursor:pointer;">NÃO</button>
                </div>
            </div>
        `;
        modal.innerHTML = html;
        overlay.style.display = 'flex';
        
        // Save the opt temporarily so we can execute it later
        window._pendingFxOpt = opt;
    };

    window.confirmFxPatchSelect = function(optId) {
        closeFxConfirmModal();
        if (window._pendingFxOpt && window._pendingFxOpt.id === optId) {
            executeFxPatchSelect(window._pendingFxOpt);
        }
    };

})();
