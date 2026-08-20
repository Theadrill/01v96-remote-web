/**
 * Módulo de Estado Global Reativo (v2) - 01v96 Remote Web
 * Centraliza o estado de canais, barramentos, navegação e preferências do sistema.
 */

// ==========================================
// Constantes Semânticas da 01v96
// ==========================================
export const NUM_INPUT_CHANNELS = 32;   // Canais de entrada físicos (CH 1-32)
export const NUM_ST_IN_CHANNELS = 8;    // Entradas estéreo (ST IN 1-4 L/R)
export const NUM_TOTAL_INPUTS = 40;     // 32 Inputs + 8 ST IN
export const NUM_MIX_CHANNELS = 8;      // Barramentos de Mix/Aux 1-8
export const NUM_BUS_CHANNELS = 8;      // Barramentos de Bus 1-8
export const MASTER_CHANNEL_ID = 52;    // ID Global do Master L/R

// Alias de retrocompatibilidade
export const NUM_CHANNELS = NUM_INPUT_CHANNELS;

// ==========================================
// Factory de Estruturas de Dados
// ==========================================
export const createDefaultOutEq = () => ({
    on: false,
    low: { f: 32, g: 0, q: 20, hpfOn: 0 },
    lowmid: { f: 60, g: 0, q: 20 },
    himid: { f: 84, g: 0, q: 20 },
    high: { f: 108, g: 0, q: 20, lpfOn: 0 }
});

export const createDefaultChannelState = (patchIndex = 1) => ({
    value: 0,
    on: false,
    solo: false,
    patch: patchIndex,
    buses: Array(NUM_BUS_CHANNELS).fill(false),
    stereo: true,
    insert: { on: false, position: 0, patch_in: 0 },
    eq: { on: false },
    paired: false,
    pairedWith: null,
    pairSource: null,
    aux1Pre: true,
    aux2Pre: true,
    aux3Pre: true,
    aux4Pre: true,
    aux5Pre: true,
    aux6Pre: true,
    aux7Pre: true,
    aux8Pre: true
});

// ==========================================
// Inicialização dos Estados
// ==========================================
export const channelStates = [];
for (let i = 0; i < NUM_TOTAL_INPUTS; i++) {
    channelStates.push(createDefaultChannelState(1));
}

export const mixesState = [];
export const busesState = [];
for (let i = 0; i < NUM_MIX_CHANNELS; i++) {
    mixesState.push({
        value: 0,
        on: false,
        solo: false,
        name: `MIX ${i + 1}`,
        eq: createDefaultOutEq(),
        paired: false,
        pairedWith: null,
        pairSource: null,
        auxTypeMode: 1,
        auxGlobal: 1,
        auxSendPrePoint: 0
    });

    busesState.push({
        value: 0,
        on: false,
        solo: false,
        name: `BUS ${i + 1}`,
        eq: createDefaultOutEq(),
        paired: false,
        pairedWith: null,
        pairSource: null,
        insert: { on: false, position: 0, patch_in: 0 },
        stereo: false,
        auxTypeMode: 1,
        auxGlobal: 1,
        auxSendPrePoint: 0
    });
}

export const masterState = {
    value: 0,
    pan: 0,
    on: false,
    solo: false,
    eq: createDefaultOutEq()
};

// Mapeamento direto do canal 52 para compatibilidade com motores gráficos
channelStates[MASTER_CHANNEL_ID] = masterState;

// ==========================================
// Estados de UI e Controle
// ==========================================
export const uiState = {
    appReady: false,
    activeConfigChannel: null,
    activeConfigTab: "aux",
    appOrientation: 'vertical',
    musicianMode: false,
    showMetersInMusicianMode: localStorage.getItem('01v96_musician_meters') === 'true',
    showVolumeGeral: true,
    outsMode: false,
    technicianMixMode: false,
    activeMix: 1,
    tecnicoPassword: null,
    envStatus: 'not_found',
    serverName: null,
    layoutMode: (localStorage.getItem('01v96_role') === 'musician')
        ? 'mobile'
        : (localStorage.getItem('mixer_layout') || 'mobile'),
    customNamesEnabled: localStorage.getItem('custom_names_enabled') !== 'false',
    layerNavEnabled: (() => {
        try { return localStorage.getItem('01v96_layer_nav') === 'true'; } catch (e) { return false; }
    })(),
    activeLayerStart: 0,
    globalNames: null,
    resolvedNames: {},
    lockedChannels: [],
    themeChannelLockConfig: {
        hold_duration_ms: 450,
        icon_class: 'fas fa-lock',
        z_index: 100
    }
};

// ==========================================
// Bridge de Compatibilidade Global (Transição v2)
// Permite que módulos legados continuem funcionando enquanto são refatorados
// ==========================================
if (typeof window !== 'undefined') {
    window.NUM_CHANNELS = NUM_CHANNELS;
    window.NUM_INPUT_CHANNELS = NUM_INPUT_CHANNELS;
    window.NUM_ST_IN_CHANNELS = NUM_ST_IN_CHANNELS;
    window.NUM_MIX_CHANNELS = NUM_MIX_CHANNELS;
    window.NUM_BUS_CHANNELS = NUM_BUS_CHANNELS;
    window.MASTER_CHANNEL_ID = MASTER_CHANNEL_ID;

    window.channelStates = channelStates;
    window.mixesState = mixesState;
    window.busesState = busesState;
    window.masterState = masterState;

    window.showMetersInMusicianMode = uiState.showMetersInMusicianMode;
    window.showVolumeGeral = uiState.showVolumeGeral;
    window.tecnicoPassword = uiState.tecnicoPassword;
    window.envStatus = uiState.envStatus;
    window.serverName = uiState.serverName;
    window.customNamesEnabled = uiState.customNamesEnabled;
    window.globalNames = uiState.globalNames;
    window.resolvedNames = uiState.resolvedNames;
    window.lockedChannels = uiState.lockedChannels;
    window.themeChannelLockConfig = uiState.themeChannelLockConfig;
}
