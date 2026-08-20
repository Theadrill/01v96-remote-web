// multiband_compressor.js — Ponte de Compatibilidade do Multiband Compressor (M.BAND DYNA.)
// Redireciona todas as chamadas para o motor genérico FXCore e FXRegistry
(function () {
    'use strict';

    // Garante que MbandEditor aponte para FXCore
    if (window.FXCore) {
        window.MbandEditor = window.FXCore;
    }

    // Expor função de conveniência
    window.openMbandEditor = function (slotIdx) {
        if (window.FXCore) {
            window.FXCore.openFxEditor(slotIdx);
        }
    };
})();
