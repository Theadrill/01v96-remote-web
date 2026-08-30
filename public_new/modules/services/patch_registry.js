// patch_registry.js — Registro Reativo Centralizado de Roteamento da Yamaha 01V96
// Expõe window.PatchRegistry (e alias window.patchRegistry).
// Módulo passivo: lê o estado global preenchido por globals.js e socket.js,
// indexa tudo em caches O(1) para consulta rápida por qualquer consumidor.

(function () {
    'use strict';

    // ═══════════════════════════════════════════════════════════════════
    // TABELAS DE MAPEAMENTO PADRONIZADAS
    // ═══════════════════════════════════════════════════════════════════

    // Canal de entrada 0-31 → label
    const INPUT_LABELS = Array.from({ length: 32 }, (_, i) => 'CH ' + (i + 1));
    // ST IN 32-39 → label (par L+R por par)
    const STIN_LABELS = [];
    for (let p = 0; p < 4; p++) {
        STIN_LABELS.push('ST IN ' + (p + 1) + ' L');
        STIN_LABELS.push('ST IN ' + (p + 1) + ' R');
    }

    // ═══════════════════════════════════════════════════════════════════
    // ESTADO INTERNO (CACHES INDEXADOS)
    // ═══════════════════════════════════════════════════════════════════

    // Entradas dos canais 0..39 (CH 1-32 + ST IN 1-4 L/R)
    const inputs = new Array(40).fill('--');

    // Saídas físicas: omni[0..3], adat[0..7], slot[0..15], twoTrack[0..1], fx[0..7]
    const physicalOutputs = {
        omni: new Array(4).fill('--'),
        adat: new Array(8).fill('--'),
        slot: new Array(16).fill('--'),
        twoTrack: new Array(2).fill('--'),
        fx: new Array(8).fill('--')
    };

    // Saídas dos BUS (0-7) e MIX (0-7) — portas físicas onde estão roteados
    const busOutputs = new Array(8).fill('--');
    const mixOutputs = new Array(8).fill('--');

    // Saída Stereo L/R — portas físicas onde está roteado
    const stereoOutputs = ['--', '--'];

    // FX slots (0-3): { inL, inR, outL, outR, inLabelL, inLabelR, outLabelL, outLabelR }
    const fxSlots = [
        { inL: 0, inR: 0, outL: null, outR: null, inLabelL: 'OFF', inLabelR: 'OFF', outLabelL: 'OFF', outLabelR: 'OFF' },
        { inL: 0, inR: 0, outL: null, outR: null, inLabelL: 'OFF', inLabelR: 'OFF', outLabelL: 'OFF', outLabelR: 'OFF' },
        { inL: 0, inR: 0, outL: null, outR: null, inLabelL: 'OFF', inLabelR: 'OFF', outLabelL: 'OFF', outLabelR: 'OFF' },
        { inL: 0, inR: 0, outL: null, outR: null, inLabelL: 'OFF', inLabelR: 'OFF', outLabelL: 'OFF', outLabelR: 'OFF' }
    ];

    // Inserts de canais/buses/aux: index = globalId
    // { on, position, patch_in, patch_out, inLabel, outLabel, posLabel }
    const inserts = {};

    // FX raw data caches (source of truth for getFxInputs/getFxOutputs)
    const rawFxInputs = [[0, 0], [0, 0], [0, 0], [0, 0]];
    const rawFxOutputs = {};

    // ═══════════════════════════════════════════════════════════════════
    // DECODIFICADORES DE VALORES → LABELS
    // ═══════════════════════════════════════════════════════════════════

    /**
     * Decodifica o valor de patch de entrada de um canal (0-150+) em label legível.
     * Tabela: 0=NONE, 1-16=AD, 17-24=GAP, 25-40=SLOT(S1-1..16), 41-48=ADAT,
     * 121/122=FX1, 129/130=FX2, 137/138=FX3, 139/140=FX4, 149=2TD-L, 150=2TD-R.
     */
    function decodeInputPatch(val) {
        val = Math.round(val);
        if (val === 0) return 'NONE';
        if (val >= 1 && val <= 16) return 'AD ' + val;
        if (val >= 17 && val <= 24) return 'GAP ' + val;
        if (val >= 25 && val <= 40) return 'S1-' + (val - 24);
        if (val >= 41 && val <= 48) return 'ADAT ' + (val - 40);
        if (val === 121) return 'FX1-1';
        if (val === 122) return 'FX1-2';
        if (val === 129) return 'FX2-1';
        if (val === 130) return 'FX2-2';
        if (val === 137) return 'FX3-1';
        if (val === 138) return 'FX3-2';
        if (val === 139) return 'FX4-1';
        if (val === 140) return 'FX4-2';
        if (val === 149) return '2TD-L';
        if (val === 150) return '2TD-R';
        return 'ID ' + val;
    }

    /**
     * Decodifica o source value de uma saída física NORMAL (não-FX) em label legível.
     * Valores: 31-62=INS CH, 1-8=BUS, 9-16=AUX, 17=ST L, 18=ST R, 19=C-R L, 20=C-R R.
     */
    function decodeNormalSource(val) {
        val = Math.round(val);
        if (val === 0) return '--';
        if (val >= 31 && val <= 62) return 'INS CH ' + (val - 30);
        if (val >= 1 && val <= 8) return 'BUS ' + val;
        if (val >= 9 && val <= 16) return 'AUX ' + (val - 8);
        if (val === 17) return 'STEREO L';
        if (val === 18) return 'STEREO R';
        if (val === 19) return 'C-R L';
        if (val === 20) return 'C-R R';
        return 'SRC ' + val;
    }

    /**
     * Decodifica o source value de uma saída FX (FX outpatch) em label legível.
     * Valores: 13-44=INS CH, 109-116=INS BUS, 117-124=INS AUX, 137=ST L, 138=ST R.
     */
    function decodeFxSource(val) {
        val = Math.round(val);
        if (val === 0) return '--';
        if (val >= 13 && val <= 44) return 'INS CH ' + (val - 12);
        if (val >= 109 && val <= 116) return 'INS BUS ' + (val - 108);
        if (val >= 117 && val <= 124) return 'INS AUX ' + (val - 116);
        if (val === 137) return 'STEREO L';
        if (val === 138) return 'STEREO R';
        return 'SRC ' + val;
    }

    /**
     * Decodifica o source value de entrada FX (FX IN) em label legível.
     * Valores: 1-8=AUX, 13-44=INS CH, 109-116=INS BUS, 117-124=INS AUX, 137=ST L, 138=ST R.
     */
    function decodeFxInputLabel(val) {
        val = Math.round(val);
        if (val === 0) return 'OFF';
        if (val >= 1 && val <= 8) return 'AUX ' + val;
        if (val >= 13 && val <= 44) return 'INS CH ' + (val - 12);
        if (val >= 109 && val <= 116) return 'INS BUS ' + (val - 108);
        if (val >= 117 && val <= 124) return 'INS AUX ' + (val - 116);
        if (val === 137) return 'MASTER L';
        if (val === 138) return 'MASTER R';
        return '???(' + val + ')';
    }

    /**
     * Decodifica um destKey (element*100+channel) de saída FX em label legível.
     * element: 1=CH/STIN, 2=INS CH, 7=INS BUS, 8=INS AUX, 10=MASTER.
     */
    function decodeFxOutputDest(destKey) {
        destKey = Math.round(destKey);
        var element = Math.floor(destKey / 100);
        var channel = destKey % 100;
        if (element === 1) {
            if (channel <= 31) return 'CH ' + (channel + 1);
            var stereoIdx = channel - 32;
            var stinNum = Math.floor(stereoIdx / 2) + 1;
            var lr = stereoIdx % 2 === 0 ? 'L' : 'R';
            return 'ST IN ' + stinNum + lr;
        }
        if (element === 2) return 'INS CH ' + (channel + 1);
        if (element === 7) return 'INS BUS ' + (channel + 1);
        if (element === 8) return 'INS AUX ' + (channel + 1);
        if (element === 10) return channel === 0 ? 'MASTER L' : 'MASTER R';
        return '?el' + element + 'ch' + channel;
    }

    /**
     * Decodifica o nome da porta física de saída para label legível.
     */
    function decodeOutputPortName(type, portIdx) {
        if (type === 'omni') return 'OMNI ' + (portIdx + 1);
        if (type === 'adat') return 'ADAT ' + (portIdx + 1);
        if (type === 'slot') return 'S1-' + (portIdx + 1);
        if (type === '2tr') return '2TD ' + (portIdx === 0 ? 'L' : 'R');
        if (type === 'fx') {
            var fxNum = Math.floor(portIdx / 2) + 1;
            var fxSide = (portIdx % 2 === 0) ? '1' : '2';
            return 'FX ' + fxNum + '-' + fxSide;
        }
        return 'UNKNOWN';
    }

    /**
     * Decodifica a posição do insert em label legível.
     */
    function decodeInsertPosition(pos) {
        if (pos === 1) return 'PRE FADER';
        if (pos === 2) return 'POST FADER';
        return 'PRE EQ';
    }

    /**
     * Decodifica o valor de patch_in do insert em label legível.
     */
    function decodeInsertInLabel(patchIn) {
        patchIn = Math.round(patchIn);
        if (patchIn === 0) return 'NONE';
        if (patchIn >= 1 && patchIn <= 16) return 'AD ' + patchIn;
        if (patchIn >= 25 && patchIn <= 40) return 'S1-' + (patchIn - 24);
        if (patchIn >= 41 && patchIn <= 48) return 'ADAT ' + (patchIn - 40);
        if (patchIn === 121) return 'FX1-1';
        if (patchIn === 122) return 'FX1-2';
        if (patchIn === 129) return 'FX2-1';
        if (patchIn === 130) return 'FX2-2';
        if (patchIn === 137) return 'FX3-1';
        if (patchIn === 138) return 'FX3-2';
        if (patchIn === 139) return 'FX4-1';
        if (patchIn === 140) return 'FX4-2';
        if (patchIn === 149) return '2TD-L';
        if (patchIn === 150) return '2TD-R';
        return 'ID ' + patchIn;
    }

    /**
     * Calcula o source value NORMAL que uma saída física teria para um canal given.
     * Usado para encontrar qual porta física está roteada para um dado canal.
     * Retorna { type: 'omni'|'adat'|'slot'|'2tr'|'fx', portIdx: n } ou null.
     */
    function findPhysicalOutputForSource(targetSrcNormal, targetSrcFx) {
        var gop = window.globalOutPatches;
        if (!gop) return null;

        // Procura em OMNI
        if (gop.omni) {
            for (var p = 0; p < 4; p++) {
                if (Math.round(gop.omni[p] || 0) === targetSrcNormal) {
                    return { type: 'omni', portIdx: p, portName: 'OMNI ' + (p + 1) };
                }
            }
        }
        // Procura em ADAT
        if (gop.adat) {
            for (var p = 0; p < 8; p++) {
                if (Math.round(gop.adat[p] || 0) === targetSrcNormal) {
                    return { type: 'adat', portIdx: p, portName: 'ADAT ' + (p + 1) };
                }
            }
        }
        // Procura em SLOT
        if (gop.slot) {
            for (var p = 0; p < 16; p++) {
                if (Math.round(gop.slot[p] || 0) === targetSrcNormal) {
                    return { type: 'slot', portIdx: p, portName: 'S1-' + (p + 1) };
                }
            }
        }
        // Procura em 2TR
        if (gop['2tr']) {
            for (var p = 0; p < 2; p++) {
                if (Math.round(gop['2tr'][p] || 0) === targetSrcNormal) {
                    return { type: '2tr', portIdx: p, portName: '2TD ' + (p === 0 ? 'L' : 'R') };
                }
            }
        }
        // Procura em FX (source value diferente)
        if (gop.fx) {
            for (var p = 0; p < 8; p++) {
                if (Math.round(gop.fx[p] || 0) === targetSrcFx) {
                    var fxNum = Math.floor(p / 2) + 1;
                    var fxSide = (p % 2 === 0) ? '1' : '2';
                    return { type: 'fx', portIdx: p, portName: 'FX ' + fxNum + '-' + fxSide };
                }
            }
        }
        return null;
    }

    /**
     * Retorna o source value NORMAL para um canal dado seu globalId.
     * Canais 0-31 → src = chIdx + 31
     * BUS 44-51 → src = (chIdx-44) + 127
     * AUX 36-43 → src = (chIdx-36) + 9
     */
    function getNormalSourceValue(globalId) {
        if (globalId >= 0 && globalId <= 31) return globalId + 31;
        if (globalId >= 44 && globalId <= 51) return (globalId - 44) + 127;
        if (globalId >= 36 && globalId <= 43) return (globalId - 36) + 9;
        return 0;
    }

    /**
     * Retorna o source value FX para um canal dado seu globalId.
     * Canais 0-31 → src = chIdx + 13
     * BUS 44-51 → src = (chIdx-44) + 109
     * AUX 36-43 → src = (chIdx-36) + 117
     */
    function getFxSourceValue(globalId) {
        if (globalId >= 0 && globalId <= 31) return globalId + 13;
        if (globalId >= 44 && globalId <= 51) return (globalId - 44) + 109;
        if (globalId >= 36 && globalId <= 43) return (globalId - 36) + 117;
        return 0;
    }

    /**
     * Retorna o source value FX de um canal como valor de INSERT OUT para um dado portType/portIdx.
     */
    function getInsertOutSourceValue(globalId, portType) {
        var isFx = (portType === 'fx');
        if (isFx) {
            return getFxSourceValue(globalId);
        }
        return getNormalSourceValue(globalId);
    }

    /**
     * Formata um array de nomes de portas físicas em string legível.
     * Ex: ['OMNI 1', '--', 'ADAT 3'] → 'OMNI 1, ADAT 3'
     * Se todos '--', retorna '--'.
     */
    function formatPortList(portNames) {
        var active = portNames.filter(function (n) { return n !== '--'; });
        if (active.length === 0) return '--';
        return active.join(', ');
    }

    // ═══════════════════════════════════════════════════════════════════
    // SINCRONIZAÇÃO PASSIVA DO ESTADO GLOBAL
    // ═══════════════════════════════════════════════════════════════════

    /**
     * Lê passivamente channelStates, globalOutPatches, fxInputs, fxOutputs,
     * preenchendo todos os caches indexados. Chamado após sync completo e
     * em cada atualização relevante.
     */
    function syncFromGlobalState() {
        // 1. Entradas dos canais (CH 1-32 e ST IN 1-4 L/R)
        var cs = window.channelStates || (typeof channelStates !== 'undefined' ? channelStates : null);
        if (cs) {
            for (var i = 0; i < 40; i++) {
                var ch = cs[i];
                if (!ch) continue;
                var patchVal = (ch.patch !== undefined) ? ch.patch : 0;
                inputs[i] = decodeInputPatch(patchVal);
            }
        }

        // 2. Saídas físicas (Output Patches Globais)
        var gop = window.globalOutPatches;
        if (gop) {
            // OMNI 1-4
            if (gop.omni) {
                for (var p = 0; p < 4; p++) {
                    var val = Math.round(gop.omni[p] || 0);
                    physicalOutputs.omni[p] = decodeNormalSource(val);
                }
            }
            // ADAT 1-8
            if (gop.adat) {
                for (var p = 0; p < 8; p++) {
                    var val = Math.round(gop.adat[p] || 0);
                    physicalOutputs.adat[p] = decodeNormalSource(val);
                }
            }
            // SLOT 1-16
            if (gop.slot) {
                for (var p = 0; p < 16; p++) {
                    var val = Math.round(gop.slot[p] || 0);
                    physicalOutputs.slot[p] = decodeNormalSource(val);
                }
            }
            // 2TR L/R
            if (gop['2tr']) {
                for (var p = 0; p < 2; p++) {
                    var val = Math.round(gop['2tr'][p] || 0);
                    physicalOutputs.twoTrack[p] = decodeNormalSource(val);
                }
            }
            // FX Inputs (portas físicas de FX: FX1-1, FX1-2, etc.)
            if (gop.fx) {
                for (var p = 0; p < 8; p++) {
                    var val = Math.round(gop.fx[p] || 0);
                    physicalOutputs.fx[p] = decodeFxSource(val);
                }
            }
        }

        // 3. Saídas dos MIX e BUS (portas físicas onde estão roteados)
        syncMixBusOutputs();

        // 4. Saída Stereo L/R
        syncStereoOutputs();

        // 5. FX Slots
        syncFxSlots();

        // 6. Inserts
        syncInserts();

        // 7. Atualiza badges de patch no layout desktop
        if (typeof window.updateDesktopPatchBadges === 'function') {
            window.updateDesktopPatchBadges();
        }
    }

    /**
     * Procura TODAS as portas de saída físicas para uma dada fonte interna (1-para-Muitos).
     * Retorna array de strings: ['OMNI 1', 'ADAT 1'] ou [] se nenhuma.
     */
    function findAllPhysicalOutputsForSource(targetSrcNormal, targetSrcFx) {
        var gop = window.globalOutPatches;
        if (!gop) return [];
        var ports = [];

        // Procura em OMNI
        if (gop.omni) {
            for (var p = 0; p < 4; p++) {
                if (Math.round(gop.omni[p] || 0) === targetSrcNormal) {
                    ports.push('OMNI ' + (p + 1));
                }
            }
        }
        // Procura em ADAT
        if (gop.adat) {
            for (var p = 0; p < 8; p++) {
                if (Math.round(gop.adat[p] || 0) === targetSrcNormal) {
                    ports.push('ADAT ' + (p + 1));
                }
            }
        }
        // Procura em SLOT
        if (gop.slot) {
            for (var p = 0; p < 16; p++) {
                if (Math.round(gop.slot[p] || 0) === targetSrcNormal) {
                    ports.push('S1-' + (p + 1));
                }
            }
        }
        // Procura em 2TR
        if (gop['2tr']) {
            for (var p = 0; p < 2; p++) {
                if (Math.round(gop['2tr'][p] || 0) === targetSrcNormal) {
                    ports.push('2TD ' + (p === 0 ? 'L' : 'R'));
                }
            }
        }
        // Procura em FX (source value diferente)
        if (gop.fx) {
            for (var p = 0; p < 8; p++) {
                if (Math.round(gop.fx[p] || 0) === targetSrcFx) {
                    var fxNum = Math.floor(p / 2) + 1;
                    var fxSide = (p % 2 === 0) ? '1' : '2';
                    ports.push('FX ' + fxNum + '-' + fxSide);
                }
            }
        }
        return ports;
    }

    /**
     * Sincroniza as saídas dos MIX e BUS, verificando quais portas físicas
     * estão atribuídas a cada um deles. Suporta saídas múltiplas (1-para-Muitos).
     */
    function syncMixBusOutputs() {
        var gop = window.globalOutPatches;
        if (!gop) return;

        // Para cada MIX (globalId 36-43) e BUS (globalId 44-51), encontra todas as portas físicas
        for (var i = 0; i < 8; i++) {
            // MIX i+1 = globalId 36+i
            var mixGlobalId = 36 + i;
            var mixSrcNormal = getNormalSourceValue(mixGlobalId);
            var mixSrcFx = getFxSourceValue(mixGlobalId);
            var mixPorts = findAllPhysicalOutputsForSource(mixSrcNormal, mixSrcFx);
            mixOutputs[i] = mixPorts.length > 0 ? mixPorts.join(' + ') : '--';

            // BUS i+1 = globalId 44+i
            var busGlobalId = 44 + i;
            var busSrcNormal = getNormalSourceValue(busGlobalId);
            var busSrcFx = getFxSourceValue(busGlobalId);
            var busPorts = findAllPhysicalOutputsForSource(busSrcNormal, busSrcFx);
            busOutputs[i] = busPorts.length > 0 ? busPorts.join(' + ') : '--';
        }
    }

    /**
     * Sincroniza a saída Stereo L/R (MASTER L/R), verificando quais portas físicas
     * estão atribuídas ao master stereo.
     */
    function syncStereoOutputs() {
        var gop = window.globalOutPatches;
        if (!gop) return;

        // Stereo L = source value 17, Stereo R = source value 18 (no outpatch normal)
        // Mas para o master, o protocolo usa source values diferentes.
        // Procuramos nas portas físicas por source values que representem STEREO L/R.
        var stereoLPorts = [];
        var stereoRPorts = [];

        // Verificar OMNI
        if (gop.omni) {
            for (var p = 0; p < 4; p++) {
                var val = Math.round(gop.omni[p] || 0);
                if (val === 17) stereoLPorts.push('OMNI ' + (p + 1));
                if (val === 18) stereoRPorts.push('OMNI ' + (p + 1));
            }
        }
        // Verificar ADAT
        if (gop.adat) {
            for (var p = 0; p < 8; p++) {
                var val = Math.round(gop.adat[p] || 0);
                if (val === 17) stereoLPorts.push('ADAT ' + (p + 1));
                if (val === 18) stereoRPorts.push('ADAT ' + (p + 1));
            }
        }
        // Verificar SLOT
        if (gop.slot) {
            for (var p = 0; p < 16; p++) {
                var val = Math.round(gop.slot[p] || 0);
                if (val === 17) stereoLPorts.push('S1-' + (p + 1));
                if (val === 18) stereoRPorts.push('S1-' + (p + 1));
            }
        }
        // Verificar 2TR
        if (gop['2tr']) {
            for (var p = 0; p < 2; p++) {
                var val = Math.round(gop['2tr'][p] || 0);
                if (val === 17) stereoLPorts.push('2TD ' + (p === 0 ? 'L' : 'R'));
                if (val === 18) stereoRPorts.push('2TD ' + (p === 0 ? 'L' : 'R'));
            }
        }

        stereoOutputs[0] = stereoLPorts.length > 0 ? stereoLPorts.join(', ') : '--';
        stereoOutputs[1] = stereoRPorts.length > 0 ? stereoRPorts.join(', ') : '--';
    }

    /**
     * Sincroniza os slots de FX (inputs e outputs).
     */
    function syncFxSlots() {
        // FX Inputs — lê diretamente do cache raw
        for (var s = 0; s < 4; s++) {
            var inL = Math.round(rawFxInputs[s][0] || 0);
            var inR = Math.round(rawFxInputs[s][1] || 0);
            fxSlots[s].inL = inL;
            fxSlots[s].inR = inR;
            fxSlots[s].inLabelL = decodeFxInputLabel(inL);
            fxSlots[s].inLabelR = decodeFxInputLabel(inR);
        }

        // FX Outputs — lê diretamente do cache raw
        var slotVals = [
            [121, 122],
            [129, 130],
            [137, 138],
            [139, 140]
        ];
        for (var s = 0; s < 4; s++) {
            var outL = null;
            var outR = null;
            for (var key in rawFxOutputs) {
                if (Math.round(rawFxOutputs[key]) === slotVals[s][0]) {
                    outL = parseInt(key, 10);
                }
                if (Math.round(rawFxOutputs[key]) === slotVals[s][1]) {
                    outR = parseInt(key, 10);
                }
            }
            fxSlots[s].outL = outL;
            fxSlots[s].outR = outR;
            fxSlots[s].outLabelL = outL != null ? decodeFxOutputDest(outL) : 'OFF';
            fxSlots[s].outLabelR = outR != null ? decodeFxOutputDest(outR) : 'OFF';
        }
    }

    /**
     * Sincroniza os patch_in de inserts (channelStates/busesState/mixesState)
     * a partir dos FX outputs. Quando um canal tem insert com patch_in apontando
     * para uma porta FX, o valor do insert patch_in é derivado da rotação de FX output.
     * Esta lógica era feita em efeitos.js (applyFxOutputs) e agora é centralizada aqui.
     */
    function syncInsertPatchesFromFxOutputs() {
        for (var keyStr in rawFxOutputs) {
            var key = parseInt(keyStr, 10);
            var val = rawFxOutputs[keyStr];
            var element = Math.floor(key / 100);
            var channel = key % 100;
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
    }

    /**
     * Sincroniza os inserts de todos os canais/buses/aux que possuem insert.
     */
    function syncInserts() {
        var cs = window.channelStates || (typeof channelStates !== 'undefined' ? channelStates : null);
        if (cs) {
            for (var i = 0; i < 32; i++) {
                syncSingleInsert(i, cs[i]);
            }
        }
        var bs = window.busesState || (typeof busesState !== 'undefined' ? busesState : null);
        if (bs) {
            for (var i = 0; i < 8; i++) {
                syncSingleInsert(44 + i, bs[i]);
            }
        }
        var ms = window.mixesState || (typeof mixesState !== 'undefined' ? mixesState : null);
        if (ms) {
            for (var i = 0; i < 8; i++) {
                syncSingleInsert(36 + i, ms[i]);
            }
        }
    }

    /**
     * Sincroniza o insert de um canal/bus/aux específico.
     */
    function syncSingleInsert(globalId, stateObj) {
        if (!stateObj || !stateObj.insert) {
            inserts[globalId] = {
                on: false,
                position: 0,
                patch_in: 0,
                patch_out: 0,
                inLabel: 'NONE',
                outLabel: '--',
                posLabel: 'PRE EQ'
            };
            return;
        }
        var ins = stateObj.insert;
        var patchIn = ins.patch_in || 0;
        var inLabel = decodeInsertInLabel(patchIn);

        // Calcula o INSERT OUT atual (porta física)
        var outLabel = '--';
        var gop = window.globalOutPatches;
        if (gop) {
            var targetSrcNormal = getNormalSourceValue(globalId);
            var targetSrcFx = getFxSourceValue(globalId);
            var result = findPhysicalOutputForSource(targetSrcNormal, targetSrcFx);
            if (result) {
                outLabel = result.portName;
            }
        }

        inserts[globalId] = {
            on: !!ins.on,
            position: ins.position || 0,
            patch_in: patchIn,
            patch_out: 0,
            inLabel: inLabel,
            outLabel: outLabel,
            posLabel: decodeInsertPosition(ins.position || 0)
        };
    }

    // ═══════════════════════════════════════════════════════════════════
    // MÉTODOS DE ATUALIZAÇÃO / REATIVOS
    // ═══════════════════════════════════════════════════════════════════

    /**
     * Atualiza o cache de patch de entrada de um canal.
     */
    function setInputPatch(ch, val) {
        if (ch >= 0 && ch < 40) {
            inputs[ch] = decodeInputPatch(val);
            if (window.channelStates && window.channelStates[ch]) window.channelStates[ch].patch = val;
            if (typeof window.updateDesktopPatchBadges === 'function') {
                window.updateDesktopPatchBadges();
            }
        }
    }

    /**
     * Atualiza o cache de uma porta de saída física.
     */
    function setOutputPatch(portType, portIdx, src) {
        if (!portType) return;
        var pType = String(portType).toLowerCase();
        if (pType.indexOf('koutputpatch/') !== -1) {
            pType = pType.replace('koutputpatch/', '');
        }
        if (pType === 'twotrack') pType = '2tr';

        src = Math.round(src);

        // Atualiza o objeto globalOutPatches em window
        if (!window.globalOutPatches) {
            window.globalOutPatches = { omni: {}, adat: {}, fx: {}, slot: {}, '2tr': {} };
        }
        if (!window.globalOutPatches[pType]) {
            window.globalOutPatches[pType] = {};
        }
        window.globalOutPatches[pType][portIdx] = src;

        // Atualiza o cache interno de physicalOutputs
        if (pType === 'omni' && portIdx >= 0 && portIdx < 4) {
            physicalOutputs.omni[portIdx] = decodeNormalSource(src);
        } else if (pType === 'adat' && portIdx >= 0 && portIdx < 8) {
            physicalOutputs.adat[portIdx] = decodeNormalSource(src);
        } else if (pType === 'slot' && portIdx >= 0 && portIdx < 16) {
            physicalOutputs.slot[portIdx] = decodeNormalSource(src);
        } else if (pType === '2tr' && portIdx >= 0 && portIdx < 2) {
            physicalOutputs.twoTrack[portIdx] = decodeNormalSource(src);
        } else if (pType === 'fx' && portIdx >= 0 && portIdx < 8) {
            physicalOutputs.fx[portIdx] = decodeFxSource(src);
        }

        // Recalcula as saídas MIX/BUS, Stereo e os Inserts que apontam para esta porta física
        syncMixBusOutputs();
        syncStereoOutputs();
        syncInserts();

        // Notifica as telas abertas e os badges desktop
        if (typeof window.updateDesktopPatchBadges === 'function') {
            window.updateDesktopPatchBadges();
        }
        if (typeof window.rerenderOpenInsertModal === 'function') {
            window.rerenderOpenInsertModal(window._insertModalChannel);
        }
        if (typeof window.renderRoutingOverview === 'function') {
            window.renderRoutingOverview();
        }
    }

    /**
     * Atualiza o cache de entrada FX.
     */
    function setFxInput(slot, lr, val) {
        if (slot >= 0 && slot < 4 && lr >= 0 && lr < 2) {
            var v = Math.round(val);
            rawFxInputs[slot][lr] = v;
            if (lr === 0) {
                fxSlots[slot].inL = v;
                fxSlots[slot].inLabelL = decodeFxInputLabel(v);
            } else {
                fxSlots[slot].inR = v;
                fxSlots[slot].inLabelR = decodeFxInputLabel(v);
            }
        }
    }

    /**
     * Atualiza o cache de saída FX.
     */
    function setFxOutput(destKey, slotVal) {
        var sv = Math.round(slotVal);
        // Store raw output (destKey → slotVal)
        rawFxOutputs[destKey] = sv;

        var element = Math.floor(destKey / 100);
        var channel = destKey % 100;

        // element 1: Channel In (0..39)
        if (element === 1 && channel >= 0 && channel < 40) {
            setInputPatch(channel, sv);
            if (typeof activeConfigTab !== 'undefined' && activeConfigTab === 'etc' && typeof activeConfigChannel !== 'undefined' && activeConfigChannel === channel && typeof window.renderRouting === 'function') {
                window.renderRouting(channel);
            }
        }
        // element 2: Insert CH (0..31)
        else if (element === 2 && channel >= 0 && channel < 32) {
            var chData = typeof getChannelStateById === 'function' ? getChannelStateById(channel) : (window.channelStates && window.channelStates[channel]);
            if (chData && chData.insert) {
                chData.insert.patch_in = sv;
                syncSingleInsert(channel, chData);
            } else {
                syncSingleInsert(channel, { insert: { on: false, position: 0, patch_in: sv } });
            }
            if (typeof window.rerenderOpenInsertModal === 'function') window.rerenderOpenInsertModal(channel);
        }
        // element 7: Insert BUS (0..7)
        else if (element === 7 && channel >= 0 && channel < 8) {
            var busGlobalId = 44 + channel;
            var busData = window.busesState && window.busesState[channel];
            if (busData && busData.insert) {
                busData.insert.patch_in = sv;
                syncSingleInsert(busGlobalId, busData);
            } else {
                syncSingleInsert(busGlobalId, { insert: { on: false, position: 0, patch_in: sv } });
            }
            if (typeof window.rerenderOpenInsertModal === 'function') window.rerenderOpenInsertModal(busGlobalId);
        }
        // element 8: Insert AUX (0..7)
        else if (element === 8 && channel >= 0 && channel < 8) {
            var auxGlobalId = 36 + channel;
            var auxData = window.mixesState && window.mixesState[channel];
            if (auxData && auxData.insert) {
                auxData.insert.patch_in = sv;
                syncSingleInsert(auxGlobalId, auxData);
            } else {
                syncSingleInsert(auxGlobalId, { insert: { on: false, position: 0, patch_in: sv } });
            }
            if (typeof window.rerenderOpenInsertModal === 'function') window.rerenderOpenInsertModal(auxGlobalId);
        }

        // Recalcula os slots de FX (garante que unassign/OFF atualize instantaneamente)
        syncFxSlots();

        // Update routing overview if open
        if (typeof window.renderRoutingOverview === 'function') window.renderRoutingOverview();
    }

    /**
     * Atualiza o cache de insert de um canal.
     */
    function setInsertInfo(ch, data) {
        var stateObj = (data && data.insert) ? data : { insert: data };
        syncSingleInsert(ch, stateObj);
        if (typeof window.rerenderOpenInsertModal === 'function') window.rerenderOpenInsertModal(ch);
        if (typeof window.renderRoutingOverview === 'function') window.renderRoutingOverview();
    }

    // ═══════════════════════════════════════════════════════════════════
    // MÉTODOS DE CONSULTA O(1)
    // ═══════════════════════════════════════════════════════════════════

    /**
     * Retorna o patch de entrada de um canal em formato legível.
     * @param {number} logicCh - Índice lógico do canal (0-39)
     * @returns {string} Ex: 'AD 1', 'ADAT 5', 'NONE'
     */
    function getChannelInput(logicCh) {
        if (logicCh >= 0 && logicCh < 40) return inputs[logicCh];
        return '--';
    }

    /**
     * Retorna o patch de entrada de dois canais pareados.
     * Se ambos têm o mesmo patch, retorna 'AD 1 + AD 2'.
     * Se patches diferentes, retorna 'AD 1 / AD 2'.
     * @param {number} ch1 - Canal primário
     * @param {number} ch2 - Canal parceiro
     * @returns {string}
     */
    function getPairedChannelInput(ch1, ch2) {
        var in1 = getChannelInput(ch1);
        var in2 = getChannelInput(ch2);
        if (in1 === in2) {
            return in1;
        }
        return in1 + ' / ' + in2;
    }

    /**
     * Retorna o patch de entrada para um par estéreo ST IN (1-4).
     * @param {number} sIdx - Índice ST IN (0-3)
     * @returns {string} Ex: 'AD 13 / 14', 'ADAT 1 / 2', etc.
     */
    function getStereoInInput(sIdx) {
        if (sIdx >= 0 && sIdx < 4) {
            var ch1 = 32 + (sIdx * 2);
            var ch2 = ch1 + 1;
            return getPairedChannelInput(ch1, ch2);
        }
        return '--';
    }

    /**
     * Retorna as portas físicas onde um MIX/AUX está roteado.
     * @param {number} mixIdx - Índice do MIX (0-7)
     * @returns {string} Ex: 'OMNI 1', 'ADAT 3', '--'
     */
    function getMixOutput(mixIdx) {
        if (mixIdx >= 0 && mixIdx < 8) return mixOutputs[mixIdx];
        return '--';
    }

    /**
     * Retorna as portas físicas onde um BUS está roteado.
     * @param {number} busIdx - Índice do BUS (0-7)
     * @returns {string} Ex: 'ADAT 1', '--'
     */
    function getBusOutput(busIdx) {
        if (busIdx >= 0 && busIdx < 8) return busOutputs[busIdx];
        return '--';
    }

    /**
     * Retorna as portas físicas onde o STEREO L/R está roteado.
     * @returns {string} Ex: 'OMNI 1/2', '2TD L/R'
     */
    function getStereoOutput() {
        var parts = [];
        if (stereoOutputs[0] !== '--') parts.push(stereoOutputs[0]);
        if (stereoOutputs[1] !== '--') parts.push(stereoOutputs[1]);
        if (parts.length === 0) return '--';
        if (parts.length === 2 && parts[0] === parts[1]) return parts[0];
        return parts.join(', ');
    }

    /**
     * Retorna informações completas de um slot de efeito.
     * @param {number} slot - Índice do slot (0-3)
     * @returns {object} { inL, inR, outL, outR, inLabelL, inLabelR, outLabelL, outLabelR }
     */
    function getFxInfo(slot) {
        if (slot >= 0 && slot < 4) return Object.assign({}, fxSlots[slot]);
        return null;
    }

    /**
     * Retorna os inputs FX brutos: [[inL, inR], [inL, inR], [inL, inR], [inL, inR]]
     * Compatível com window.getFxInputs() do efeitos.js original.
     */
    function getFxInputs() {
        return rawFxInputs.map(function (pair) { return [pair[0], pair[1]]; });
    }

    /**
     * Retorna os outputs FX brutos: { destKey: slotVal, ... }
     * Compatível com window.getFxOutputs() do efeitos.js original.
     */
    function getFxOutputs() {
        var copy = {};
        for (var k in rawFxOutputs) {
            if (rawFxOutputs.hasOwnProperty(k)) {
                copy[k] = rawFxOutputs[k];
            }
        }
        return copy;
    }

    /**
     * Retorna informações completas do insert de um canal/bus/aux.
     * @param {number} ch - GlobalId do canal (0-31, 36-43, 44-51)
     * @returns {object} { on, position, patch_in, patch_out, inLabel, outLabel, posLabel }
     */
    function getInsertInfo(ch) {
        if (inserts[ch]) return Object.assign({}, inserts[ch]);
        return { on: false, position: 0, patch_in: 0, patch_out: 0, inLabel: 'NONE', outLabel: '--', posLabel: 'PRE EQ' };
    }

    /**
     * Retorna mapa consolidado completo com todos os dados de roteamento.
     * Usado pela tela de Visão Geral do Roteamento.
     * @returns {object}
     */
    function getAllData() {
        return {
            inputs: inputs.slice(),
            physicalOutputs: {
                omni: physicalOutputs.omni.slice(),
                adat: physicalOutputs.adat.slice(),
                slot: physicalOutputs.slot.slice(),
                twoTrack: physicalOutputs.twoTrack.slice(),
                fx: physicalOutputs.fx.slice()
            },
            busOutputs: busOutputs.slice(),
            mixOutputs: mixOutputs.slice(),
            stereoOutputs: stereoOutputs.slice(),
            fx: fxSlots.map(function (s) { return Object.assign({}, s); }),
            inserts: Object.assign({}, inserts)
        };
    }

    // ═══════════════════════════════════════════════════════════════════
    // LISTENERS PASSIVOS DE SOCKET
    // ═══════════════════════════════════════════════════════════════════

    function setupSocketListeners() {
        if (typeof socket === 'undefined' || !socket) return;

        // Atualização de patch de entrada de canal
        socket.on('update', function (d) {
            if (d.type === 'kChannelInput/kChannelIn') {
                setInputPatch(d.channel, d.value);
            }
            // Atualização de output patches
            if (d.type && d.type.startsWith('kOutputPatch/')) {
                if (!window.globalOutPatches) {
                    window.globalOutPatches = { omni: {}, adat: {}, fx: {}, slot: {}, '2tr': {} };
                }
                var port = d.channel;
                var src = d.value;
                if (d.type === 'kOutputPatch/kOmni') {
                    window.globalOutPatches.omni[port] = src;
                    setOutputPatch('omni', port, src);
                }
                if (d.type === 'kOutputPatch/kAdat') {
                    window.globalOutPatches.adat[port] = src;
                    setOutputPatch('adat', port, src);
                }
                if (d.type === 'kOutputPatch/kFx') {
                    window.globalOutPatches.fx[port] = src;
                    setOutputPatch('fx', port, src);
                }
                if (d.type === 'kOutputPatch/kSlot') {
                    window.globalOutPatches.slot[port] = src;
                    setOutputPatch('slot', port, src);
                }
                if (d.type === 'kOutputPatch/k2tr') {
                    window.globalOutPatches['2tr'][port] = src;
                    setOutputPatch('2tr', port, src);
                }
                // Re-sync MIX/BUS/Stereo outputs quando output patch muda
                syncMixBusOutputs();
                syncStereoOutputs();
            }
            // Inserts
            if (d.type === 'kInputInsert/kInsertOn') {
                setInsertInfo(d.channel, { on: !!d.value, position: (inserts[d.channel] || {}).position || 0, patch_in: (inserts[d.channel] || {}).patch_in || 0 });
            }
            if (d.type === 'kInputInsert/kInsertLocInsert') {
                setInsertInfo(d.channel, { on: (inserts[d.channel] || {}).on || false, position: d.value, patch_in: (inserts[d.channel] || {}).patch_in || 0 });
            }
            if (d.type === 'kChannelInsertIn/kInsertIn') {
                setInsertInfo(d.channel, { on: (inserts[d.channel] || {}).on || false, position: (inserts[d.channel] || {}).position || 0, patch_in: d.value });
            }
            if (d.type === 'kBusInsert/kInsertOn') {
                var busIdx = d.channel >= 44 ? d.channel - 44 : d.channel;
                var globalCh = 44 + busIdx;
                setInsertInfo(globalCh, { on: !!d.value, position: (inserts[globalCh] || {}).position || 0, patch_in: (inserts[globalCh] || {}).patch_in || 0 });
            }
            if (d.type === 'kBusInsert/kInsertLocInsert') {
                var busIdx = d.channel >= 44 ? d.channel - 44 : d.channel;
                var globalCh = 44 + busIdx;
                setInsertInfo(globalCh, { on: (inserts[globalCh] || {}).on || false, position: d.value, patch_in: (inserts[globalCh] || {}).patch_in || 0 });
            }
        });

        // FX Inputs update
        socket.on('fxInputsUpdate', function (data) {
            if (!data || typeof data !== 'object') return;
            for (var key in data) {
                var port = parseInt(key, 10);
                if (isNaN(port) || port < 0 || port > 7) continue;
                var slot = Math.floor(port / 2);
                var lr = port % 2;
                setFxInput(slot, lr, data[key]);
            }
            if (typeof window.rerenderOpenInsertModal === 'function') window.rerenderOpenInsertModal(window._insertModalChannel);
            if (typeof window.renderRoutingOverview === 'function') window.renderRoutingOverview();
        });

        // FX Outputs update
        socket.on('fxOutputsUpdate', function (data) {
            if (!data || typeof data !== 'object') return;
            for (var key in data) {
                setFxOutput(parseInt(key, 10), data[key]);
            }
            // Sincroniza patch_in de inserts (channelStates/busesState/mixesState)
            syncInsertPatchesFromFxOutputs();
            if (typeof window.rerenderOpenInsertModal === 'function') window.rerenderOpenInsertModal(window._insertModalChannel);
            if (typeof window.renderRoutingOverview === 'function') window.renderRoutingOverview();
        });

        // Sync completo: resync tudo
        socket.on('sync', function () {
            syncFromGlobalState();
        });
    }

    // ═══════════════════════════════════════════════════════════════════
    // INICIALIZAÇÃO
    // ═══════════════════════════════════════════════════════════════════

    /**
     * Inicializa o módulo. Chamado uma vez após globals.js estar disponível.
     */
    function init() {
        setupSocketListeners();
    }

    // ═══════════════════════════════════════════════════════════════════
    // API PÚBLICA
    // ═══════════════════════════════════════════════════════════════════

    var PatchRegistry = {
        // Sincronização
        syncFromGlobalState: syncFromGlobalState,

        // Atualização / Reativos
        setInputPatch: setInputPatch,
        setOutputPatch: setOutputPatch,
        setFxInput: setFxInput,
        setFxOutput: setFxOutput,
        setInsertInfo: setInsertInfo,

        // Consulta O(1)
        getChannelInput: getChannelInput,
        getPairedChannelInput: getPairedChannelInput,
        getStereoInInput: getStereoInInput,
        getMixOutput: getMixOutput,
        getBusOutput: getBusOutput,
        getStereoOutput: getStereoOutput,
        getFxInfo: getFxInfo,
        getFxInputs: getFxInputs,
        getFxOutputs: getFxOutputs,
        getInsertInfo: getInsertInfo,
        getAllData: getAllData,

        // Decoders públicos (para uso externo se necessário)
        decodeInputPatch: decodeInputPatch,
        decodeNormalSource: decodeNormalSource,
        decodeFxSource: decodeFxSource,
        decodeFxInputLabel: decodeFxInputLabel,
        decodeFxOutputDest: decodeFxOutputDest,
        decodeOutputPortName: decodeOutputPortName,
        decodeInsertPosition: decodeInsertPosition,
        decodeInsertInLabel: decodeInsertInLabel,

        // Inicialização
        init: init,

        // Expor caches (somente leitura por convenção)
        _inputs: inputs,
        _physicalOutputs: physicalOutputs,
        _busOutputs: busOutputs,
        _mixOutputs: mixOutputs,
        _stereoOutputs: stereoOutputs,
        _fxSlots: fxSlots,
        _inserts: inserts
    };

    // Expõe globalmente
    window.PatchRegistry = PatchRegistry;
    window.patchRegistry = PatchRegistry;

    // Inicializa automaticamente (módulo carrega após globals.js)
    init();

})();
