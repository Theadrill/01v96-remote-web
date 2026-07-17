// fx_routing.js — Modal de Seleção de Patch FX (IN / OUT)
// Mock: abre seletor com categorias, mas NÃO envia comando à mesa.

(function () {
    'use strict';

    // ── Contexto: qual FX / qual lado / IN ou OUT ─────────────────────
    let _fxCtx = { slot: 0, lr: 0, side: 'in' }; // slot 0-3, lr 0=L/1=R, side 'in'|'out'

    // ── Categorias FX IN (fontes que alimentam o FX) ──────────────────
    const FX_IN_CATEGORIES = [
        {
            name: 'NONE',
            options: [{ id: 0, name: 'NONE' }]
        },
        {
            name: 'AUX',
            options: [1, 2, 3, 4, 5, 6, 7, 8].map(n => ({ id: n, name: 'AUX' + n }))
        },
        {
            name: 'INS CH',
            options: Array.from({ length: 32 }, (_, i) => ({ id: 13 + i, name: 'INSCH' + (i + 1) }))
        },
        {
            name: 'INS BUS',
            options: [1, 2, 3, 4, 5, 6, 7, 8].map(n => ({ id: 108 + n, name: 'INSBUS' + n }))
        },
        {
            name: 'INS AUX',
            options: [1, 2, 3, 4, 5, 6, 7, 8].map(n => ({ id: 116 + n, name: 'INSAUX' + n }))
        },
        {
            name: 'MASTER LR',
            options: [
                { id: 137, name: 'MASTER L' },
                { id: 138, name: 'MASTER R' }
            ]
        }
    ];

    // ── Categorias FX OUT (destinos do saída do FX) ───────────────────
    // Cada opção carrega { element, channel } para o SysEx futuro
    const FX_OUT_CATEGORIES = [
        {
            name: 'NONE',
            options: [{ id: -1, name: 'NONE', element: null, channel: null }]
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
                id: 1000 + i, name: 'INSCH' + (i + 1), element: 2, channel: i
            }))
        },
        {
            name: 'INS BUS',
            options: [0, 1, 2, 3, 4, 5, 6, 7].map(ch => ({
                id: 2000 + ch, name: 'INSBUS' + (ch + 1), element: 7, channel: ch
            }))
        },
        {
            name: 'INS AUX',
            options: [0, 1, 2, 3, 4, 5, 6, 7].map(ch => ({
                id: 3000 + ch, name: 'INSAUX' + (ch + 1), element: 8, channel: ch
            }))
        },
        {
            name: 'MASTER LR',
            options: [
                { id: 4000, name: 'MASTER L', element: 10, channel: 0 },
                { id: 4001, name: 'MASTER R', element: 10, channel: 1 }
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
                btn.onclick = () => handleFxPatchSelect(opt);
                btnGrid.appendChild(btn);
            });

            catDiv.appendChild(btnGrid);
            gridEl.appendChild(catDiv);
        });
    }

    // ── Handler de seleção (MOCK — só loga e fecha) ──────────────────
    function handleFxPatchSelect(opt) {
        console.log('[FX-ROUTING] MOCK select:', JSON.stringify(opt), 'ctx:', JSON.stringify(_fxCtx));

        // Atualiza label no DOM (mock visual)
        const labelId = 'fx-patch-' + _fxCtx.side + '-' + _fxCtx.slot + '-' + _fxCtx.lr;
        const labelEl = document.getElementById(labelId);
        if (labelEl) {
            labelEl.textContent = opt.name;
            labelEl.className = 'fx-patch-label ' + (opt.id === 0 || opt.id === -1 ? 'fx-patch-off' : 'fx-patch-active');
        }

        closeFxPatchSelector();
    }

    // ── Abre o seletor de patch FX ────────────────────────────────────
    window.openFxPatchSelector = function (slot, lr, side) {
        // slot: 0-3, lr: 0=L/1=R, side: 'in'|'out'
        _fxCtx = { slot: slot, lr: lr, side: side };

        const modal = document.getElementById('fxPatchSelectorModal');
        const grid = document.getElementById('fxPatchGrid');
        const title = document.getElementById('fxPatchSelectorTitle');
        if (!modal || !grid || !title) return;

        const sideLabel = side === 'in' ? 'ENTRADA' : 'SAÍDA';
        const lrLabel = lr === 0 ? 'L' : 'R';
        title.innerText = 'FX' + (slot + 1) + ' ' + sideLabel + ' ' + lrLabel;

        // Determina categorias e valor ativo
        if (side === 'in') {
            // Para IN, o valor ativo é o source ID atual
            // Por agora usa 0 (NONE) como mock
            const currentVal = 0;
            renderCategoriesIntoGrid(grid, FX_IN_CATEGORIES, currentVal);
        } else {
            // Para OUT, o valor ativo é o destination id
            const currentVal = -1;
            renderCategoriesIntoGrid(grid, FX_OUT_CATEGORIES, currentVal);
        }

        modal.style.display = 'flex';
    };

    window.closeFxPatchSelector = function () {
        const modal = document.getElementById('fxPatchSelectorModal');
        if (modal) modal.style.display = 'none';
    };

})();
