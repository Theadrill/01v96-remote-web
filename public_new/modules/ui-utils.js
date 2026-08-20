/**
 * Módulo de Utilitários de Interface (v2) - 01v96 Remote Web
 * Centraliza funções de atualização de visores, títulos e escalas de dinâmica.
 */

import { uiState } from './state.js';
import { getChannelStateById } from './utils.js';

/**
 * Sincroniza visualmente o nome de um canal em todos os lugares necessários:
 * Fader Principal, Mini Fader (Config) e Sidebar Title.
 * @param {number} channel ID global do canal
 * @param {string|null|undefined} name Nome vindo da mesa ou override customizado
 */
export function updateNameUI(channel, name) {
    // 0. Fonte da verdade ABSOLUTA: se o backend já resolveu este nome (Global/Custom), forçamos ele.
    const resolvedMap = uiState.resolvedNames || (typeof window !== 'undefined' ? window.resolvedNames : null);
    if (resolvedMap && resolvedMap[channel]) {
        name = resolvedMap[channel].name;
    }

    const limitedName = (name !== undefined && name !== null ? name : '').substring(0, 16).trim();
    let defaultShortName = '';

    if (channel >= 0 && channel <= 31) {
        defaultShortName = `CH ${channel + 1}`;
    } else if (channel >= 60 && channel <= 67) {
        defaultShortName = `ST ${Math.floor((channel - 60) / 2) + 1}`;
    } else if (channel >= 36 && channel <= 43) {
        defaultShortName = `AUX${channel - 35}`;
    } else if (channel >= 44 && channel <= 51) {
        defaultShortName = `BUS${channel - 43}`;
    } else if (channel === 52) {
        defaultShortName = `MSTR`;
    }

    const displayName = name !== undefined ? limitedName : defaultShortName;

    // 1. Atualiza o estado local para consistência
    const stateObj = getChannelStateById(channel);
    if (stateObj) stateObj.name = limitedName;

    // 2. Resolve IDs de elementos do DOM
    let baseId = '';
    let displayTitle = '';

    if (channel >= 0 && channel <= 31) {
        baseId = `name${channel}`;
        displayTitle = `${channel + 1}`;
    } else if (channel >= 60 && channel <= 67) {
        // Para ST IN, apenas o canal "L" (par: 60, 62, 64, 66) deve atualizar o visor,
        // pois eles compartilham o mesmo strip físico na interface.
        if (channel % 2 !== 0) return;

        const stNum = Math.floor((channel - 60) / 2) + 1;
        baseId = `namest${stNum - 1}`;
        displayTitle = `ST IN ${stNum}`;
    } else if (channel >= 36 && channel <= 43) {
        baseId = `namem${channel - 36}`;
        displayTitle = `MIX ${channel - 35}`;
    } else if (channel >= 44 && channel <= 51) {
        baseId = `nameb${channel - 44}`;
        displayTitle = `BUS ${channel - 43}`;
    } else if (channel === 52) {
        baseId = `namemaster`;
        displayTitle = `MASTER`;
    }

    if (!baseId) return;

    // 3. Atualiza fader na tela principal
    const el = document.getElementById(baseId);
    if (el) {
        el.innerText = displayName;
    }

    // 4. Atualiza mini-fader se estiver aberto na config
    const elMini = document.getElementById(`mini-${baseId}`);
    if (elMini) {
        elMini.innerText = displayName;
    }

    // 5. Atualiza título da sidebar se este canal for o ativo na config
    const currentActiveCh = uiState.activeConfigChannel !== null
        ? uiState.activeConfigChannel
        : (typeof window !== 'undefined' ? window.activeConfigChannel : null);

    if (currentActiveCh === channel) {
        const sideTitle = document.getElementById('chSideTitle');
        if (sideTitle) {
            sideTitle.innerText = `${displayTitle} - ${displayName || '...'}`;
            if (typeof window !== 'undefined' && typeof window.autoScaleTitle === 'function') {
                window.autoScaleTitle();
            }
        }
    }
}

/**
 * Mapeamento Piecewise Linear para Dynamics (Gate e Compressor)
 * Converte dB para escala de porcentagem gráfica (0-100%).
 * @param {number} val Valor numérico em dB (-540 a 0)
 * @param {'gate'|'comp'} type Tipo da dinâmica
 * @returns {number} Porcentagem de 0 a 100
 */
export function mapDynDbToPercent(val, type) {
    const GATE_POINTS = [-540, -400, -200, -100, -50, 0];
    const COMP_POINTS = [-540, -400, -200, -100, -50, 0];
    const DYN_PERCENTS = [0, 20, 40, 60, 80, 100];

    const points = (type === 'gate' ? GATE_POINTS : COMP_POINTS);
    const percentages = DYN_PERCENTS;

    if (val <= points[0]) return 0;
    if (val >= points[points.length - 1]) return 100;

    for (let i = 1; i < points.length; i++) {
        if (val <= points[i]) {
            const dbRange = points[i] - points[i - 1];
            const pctRange = percentages[i] - percentages[i - 1];
            return percentages[i - 1] + ((val - points[i - 1]) / dbRange) * pctRange;
        }
    }
    return 100;
}

// ==========================================
// Bridge de Compatibilidade Global (Transição v2)
// ==========================================
if (typeof window !== 'undefined') {
    window.updateNameUI = updateNameUI;
    window.mapDynDbToPercent = mapDynDbToPercent;
}
