// routing_overview.js — Tela de Visão Geral do Roteamento (Read-Only)
// Renderiza um painel completo com todas as conexões da mesa: Entradas,
// Saídas Físicas, Barramentos MIX/BUS, Efeitos FX1-4 e Inserts.
// Consome dados de window.PatchRegistry (módulo passivo).

(function () {
    'use strict';

    var modalEl = null;

    // ═══════════════════════════════════════════════════════════════════
    // UTILIDADES DE RENDERIZAÇÃO
    // ═══════════════════════════════════════════════════════════════════

    function escapeHtml(str) {
        return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    function getChannelDisplayName(globalId) {
        if (typeof window.getChannelLabel === 'function') {
            return window.getChannelLabel(globalId);
        }
        if (globalId >= 0 && globalId <= 31) return 'CH ' + (globalId + 1);
        if (globalId >= 36 && globalId <= 43) return 'AUX ' + (globalId - 35);
        if (globalId >= 44 && globalId <= 51) return 'BUS ' + (globalId - 43);
        if (globalId === 52) return 'MASTER';
        return 'CH ' + globalId;
    }

    function getChannelResolvedName(globalId) {
        if (window.resolvedNames && window.resolvedNames[globalId]) {
            return window.resolvedNames[globalId].name || '';
        }
        return '';
    }

    function makeSectionHeader(title) {
        return '<div class="ro-section-header">' + escapeHtml(title) + '</div>';
    }

    function makeRow(label, value, id) {
        var valClass = (value === '--' || value === 'NONE' || value === 'OFF') ? 'ro-val-empty' : 'ro-val-active';
        var idAttr = id ? ' id="' + escapeHtml(id) + '"' : '';
        return '<div class="ro-row">' +
            '<span class="ro-label">' + escapeHtml(label) + '</span>' +
            '<span' + idAttr + ' class="ro-value ' + valClass + '">' + escapeHtml(value) + '</span>' +
            '</div>';
    }

    function makeCompactRow(label, value, id) {
        var valClass = (value === '--' || value === 'NONE' || value === 'OFF') ? 'ro-val-empty' : 'ro-val-active';
        var idAttr = id ? ' id="' + escapeHtml(id) + '"' : '';
        return '<div class="ro-row ro-row-compact">' +
            '<span class="ro-label">' + escapeHtml(label) + '</span>' +
            '<span' + idAttr + ' class="ro-value ' + valClass + '">' + escapeHtml(value) + '</span>' +
            '</div>';
    }

    // ═══════════════════════════════════════════════════════════════════
    // RENDERIZAÇÃO DAS 5 SEÇÕES
    // ═══════════════════════════════════════════════════════════════════

    function renderSection1_Inputs(data) {
        var html = makeSectionHeader('1. ENTRADAS DOS CANAIS');

        // CH 1-32
        for (var i = 0; i < 32; i++) {
            var label = getChannelDisplayName(i);
            var name = getChannelResolvedName(i);
            var patch = data.inputs[i] || '--';
            var displayLabel = label + (name ? ' <span class="ro-ch-name">' + escapeHtml(name) + '</span>' : '');
            html += '<div class="ro-row">' +
                '<span class="ro-label">' + displayLabel + '</span>' +
                '<span id="ro-val-input-' + i + '" class="ro-value ' + (patch === '--' || patch === 'NONE' ? 'ro-val-empty' : 'ro-val-active') + '">' + escapeHtml(patch) + '</span>' +
                '</div>';
        }

        // ST IN 1-4 L/R
        html += '<div class="ro-sub-header">STEREO IN</div>';
        var stLabels = ['ST IN 1 L', 'ST IN 1 R', 'ST IN 2 L', 'ST IN 2 R', 'ST IN 3 L', 'ST IN 3 R', 'ST IN 4 L', 'ST IN 4 R'];
        for (var j = 0; j < 8; j++) {
            var patch = data.inputs[32 + j] || '--';
            html += makeRow(stLabels[j], patch, 'ro-val-input-' + (32 + j));
        }

        return html;
    }

    function renderSection2_PhysicalOutputs(data) {
        var html = makeSectionHeader('2. SAÍDAS FÍSICAS');

        // OMNI 1-4
        html += '<div class="ro-sub-header">OMNI</div>';
        for (var i = 0; i < 4; i++) {
            html += makeRow('OMNI ' + (i + 1), data.physicalOutputs.omni[i]);
        }

        // ADAT 1-8
        html += '<div class="ro-sub-header">ADAT</div>';
        for (var i = 0; i < 8; i++) {
            html += makeRow('ADAT ' + (i + 1), data.physicalOutputs.adat[i]);
        }

        // SLOT 1-16
        html += '<div class="ro-sub-header">SLOT (1-16)</div>';
        for (var i = 0; i < 16; i++) {
            html += makeCompactRow('S1-' + (i + 1), data.physicalOutputs.slot[i]);
        }

        // 2TR
        html += '<div class="ro-sub-header">2TR</div>';
        html += makeRow('2TD L', data.physicalOutputs.twoTrack[0]);
        html += makeRow('2TD R', data.physicalOutputs.twoTrack[1]);

        // FX Physical Ports
        html += '<div class="ro-sub-header">FX PORTS</div>';
        for (var i = 0; i < 8; i++) {
            var fxNum = Math.floor(i / 2) + 1;
            var fxSide = (i % 2 === 0) ? '1' : '2';
            html += makeRow('FX ' + fxNum + '-' + fxSide, data.physicalOutputs.fx[i]);
        }

        return html;
    }

    function renderSection3_BusOutputs(data) {
        var html = makeSectionHeader('3. BARRAMENTOS DE SAÍDA');

        // MIX 1-8
        html += '<div class="ro-sub-header">MIX (AUX) 1-8</div>';
        for (var i = 0; i < 8; i++) {
            var label = getChannelDisplayName(36 + i);
            var name = getChannelResolvedName(36 + i);
            var displayLabel = label + (name ? ' <span class="ro-ch-name">' + escapeHtml(name) + '</span>' : '');
            var output = data.mixOutputs[i];
            html += '<div class="ro-row">' +
                '<span class="ro-label">' + displayLabel + '</span>' +
                '<span class="ro-value ' + (output === '--' ? 'ro-val-empty' : 'ro-val-active') + '">' + escapeHtml(output) + '</span>' +
                '</div>';
        }

        // BUS 1-8
        html += '<div class="ro-sub-header">BUS 1-8</div>';
        for (var i = 0; i < 8; i++) {
            var label = getChannelDisplayName(44 + i);
            var name = getChannelResolvedName(44 + i);
            var displayLabel = label + (name ? ' <span class="ro-ch-name">' + escapeHtml(name) + '</span>' : '');
            var output = data.busOutputs[i];
            html += '<div class="ro-row">' +
                '<span class="ro-label">' + displayLabel + '</span>' +
                '<span class="ro-value ' + (output === '--' ? 'ro-val-empty' : 'ro-val-active') + '">' + escapeHtml(output) + '</span>' +
                '</div>';
        }

        // Stereo Master
        html += '<div class="ro-sub-header">MASTER STEREO</div>';
        html += makeRow('STEREO L', data.stereoOutputs[0]);
        html += makeRow('STEREO R', data.stereoOutputs[1]);

        return html;
    }

    function renderSection4_Fx(data) {
        var html = makeSectionHeader('4. EFEITOS (FX 1-4)');

        for (var s = 0; s < 4; s++) {
            var fx = data.fx[s];
            if (!fx) continue;

            html += '<div class="ro-fx-slot">';
            html += '<div class="ro-fx-title">FX ' + (s + 1) + '</div>';

            // Inputs
            html += '<div class="ro-fx-row">' +
                '<span class="ro-fx-label">IN L:</span>' +
                '<span class="ro-value ' + (fx.inLabelL === 'OFF' ? 'ro-val-empty' : 'ro-val-active') + '">' + escapeHtml(fx.inLabelL) + '</span>' +
                '</div>';
            html += '<div class="ro-fx-row">' +
                '<span class="ro-fx-label">IN R:</span>' +
                '<span class="ro-value ' + (fx.inLabelR === 'OFF' ? 'ro-val-empty' : 'ro-val-active') + '">' + escapeHtml(fx.inLabelR) + '</span>' +
                '</div>';

            // Outputs / Destinations
            html += '<div class="ro-fx-row">' +
                '<span class="ro-fx-label">OUT L:</span>' +
                '<span class="ro-value ' + (fx.outLabelL === 'OFF' ? 'ro-val-empty' : 'ro-val-active') + '">' + escapeHtml(fx.outLabelL) + '</span>' +
                '</div>';
            html += '<div class="ro-fx-row">' +
                '<span class="ro-fx-label">OUT R:</span>' +
                '<span class="ro-value ' + (fx.outLabelR === 'OFF' ? 'ro-val-empty' : 'ro-val-active') + '">' + escapeHtml(fx.outLabelR) + '</span>' +
                '</div>';

            html += '</div>';
        }

        return html;
    }

    function renderSection5_Inserts(data) {
        var html = makeSectionHeader('5. INSERTS ATIVOS');

        var hasAnyInsert = false;

        // Canais 0-31
        for (var i = 0; i < 32; i++) {
            var ins = data.inserts[i];
            if (ins && ins.on) {
                hasAnyInsert = true;
                var label = getChannelDisplayName(i);
                var name = getChannelResolvedName(i);
                var displayLabel = label + (name ? ' <span class="ro-ch-name">' + escapeHtml(name) + '</span>' : '');
                html += '<div class="ro-insert-row">' +
                    '<div class="ro-insert-ch">' + displayLabel + '</div>' +
                    '<div class="ro-insert-detail">' +
                    '<span class="ro-insert-pos">' + escapeHtml(ins.posLabel) + '</span>' +
                    '<span class="ro-insert-io">IN: ' + escapeHtml(ins.inLabel) + '</span>' +
                    '<span class="ro-insert-io">OUT: ' + escapeHtml(ins.outLabel) + '</span>' +
                    '</div>' +
                    '</div>';
            }
        }

        // BUS 44-51
        for (var i = 44; i <= 51; i++) {
            var ins = data.inserts[i];
            if (ins && ins.on) {
                hasAnyInsert = true;
                var label = getChannelDisplayName(i);
                var name = getChannelResolvedName(i);
                var displayLabel = label + (name ? ' <span class="ro-ch-name">' + escapeHtml(name) + '</span>' : '');
                html += '<div class="ro-insert-row">' +
                    '<div class="ro-insert-ch">' + displayLabel + '</div>' +
                    '<div class="ro-insert-detail">' +
                    '<span class="ro-insert-pos">' + escapeHtml(ins.posLabel) + '</span>' +
                    '<span class="ro-insert-io">IN: ' + escapeHtml(ins.inLabel) + '</span>' +
                    '<span class="ro-insert-io">OUT: ' + escapeHtml(ins.outLabel) + '</span>' +
                    '</div>' +
                    '</div>';
            }
        }

        // AUX 36-43
        for (var i = 36; i <= 43; i++) {
            var ins = data.inserts[i];
            if (ins && ins.on) {
                hasAnyInsert = true;
                var label = getChannelDisplayName(i);
                var name = getChannelResolvedName(i);
                var displayLabel = label + (name ? ' <span class="ro-ch-name">' + escapeHtml(name) + '</span>' : '');
                html += '<div class="ro-insert-row">' +
                    '<div class="ro-insert-ch">' + displayLabel + '</div>' +
                    '<div class="ro-insert-detail">' +
                    '<span class="ro-insert-pos">' + escapeHtml(ins.posLabel) + '</span>' +
                    '<span class="ro-insert-io">IN: ' + escapeHtml(ins.inLabel) + '</span>' +
                    '<span class="ro-insert-io">OUT: ' + escapeHtml(ins.outLabel) + '</span>' +
                    '</div>' +
                    '</div>';
            }
        }

        if (!hasAnyInsert) {
            html += '<div class="ro-empty">Nenhum insert ativo</div>';
        }

        return html;
    }

    // ═══════════════════════════════════════════════════════════════════
    // RENDERIZAÇÃO DO MODAL COMPLETO
    // ═══════════════════════════════════════════════════════════════════

    function renderModalContent() {
        if (!modalEl) return;

        var body = modalEl.querySelector('.ro-body');
        if (!body) return;

        // Sync latest state from PatchRegistry
        if (typeof window.PatchRegistry !== 'undefined' && window.PatchRegistry.syncFromGlobalState) {
            window.PatchRegistry.syncFromGlobalState();
        }

        var data = (typeof window.PatchRegistry !== 'undefined' && window.PatchRegistry.getAllData)
            ? window.PatchRegistry.getAllData()
            : null;

        if (!data) {
            body.innerHTML = '<div class="ro-empty">PatchRegistry não disponível.</div>';
            return;
        }

        var html = '';
        html += renderSection1_Inputs(data);
        html += renderSection2_PhysicalOutputs(data);
        html += renderSection3_BusOutputs(data);
        html += renderSection4_Fx(data);
        html += renderSection5_Inserts(data);

        body.innerHTML = html;
    }

    // ═══════════════════════════════════════════════════════════════════
    // CRIAÇÃO DO MODAL
    // ═══════════════════════════════════════════════════════════════════

    function createModal() {
        if (modalEl) return;

        modalEl = document.createElement('div');
        modalEl.id = 'routingOverviewModal';
        modalEl.className = 'modal-overlay ro-modal-overlay';

        modalEl.innerHTML =
            '<div class="ro-modal-card" onclick="event.stopPropagation()">' +
                '<div class="ro-modal-header">' +
                    '<span class="ro-modal-title">VISÃO GERAL DO ROTEAMENTO</span>' +
                    '<button class="ro-modal-close" onclick="closeRoutingOverviewModal()">&times;</button>' +
                '</div>' +
                '<div class="ro-body"></div>' +
                '<div class="ro-modal-footer">' +
                    '<button class="ro-modal-close-btn" onclick="closeRoutingOverviewModal()">FECHAR</button>' +
                '</div>' +
            '</div>';

        // Close on overlay click
        modalEl.addEventListener('click', function (e) {
            if (e.target === modalEl) {
                closeRoutingOverviewModal();
            }
        });

        document.body.appendChild(modalEl);
    }

    // ═══════════════════════════════════════════════════════════════════
    // API PÚBLICA
    // ═══════════════════════════════════════════════════════════════════

    function openRoutingOverviewModal() {
        createModal();
        renderModalContent();
        modalEl.style.display = 'flex';
    }

    function closeRoutingOverviewModal() {
        if (modalEl) {
            modalEl.style.display = 'none';
        }
    }

    // Expose globally
    window.openRoutingOverviewModal = openRoutingOverviewModal;
    window.closeRoutingOverviewModal = closeRoutingOverviewModal;
    window.renderRoutingOverview = function () {
        if (modalEl && modalEl.style.display === 'flex') {
            renderModalContent();
        }
    };

})();
