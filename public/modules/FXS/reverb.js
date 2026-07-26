// reverb.js — Ponte de Compatibilidade do Reverb Standard
// Redireciona todas as chamadas para o motor genérico FXCore e FXRegistry
(function () {
    'use strict';

    // Garante que ReverbEditor aponte para FXCore
    if (window.FXCore) {
        window.ReverbEditor = window.FXCore;
    }

    // Expor função de conveniência
    window.openReverbEditor = function (slotIdx) {
        if (window.FXCore) {
            window.FXCore.openFxEditor(slotIdx);
        }
    };
})();
