// 🚨 [CRITICAL SYNC LOGIC] - O socket DEVE ser inicializado aqui, como primeiro script.
// Se mover para o app.js ou carregar depois, os listeners nos outros módulos darão erro de 'undefined'.
const socket = typeof io === 'function' ? io({
    transports: ['websocket']
}) : null;
let appReady = false;
const NUM_CHANNELS = 32;
let channelStates = [];
for (let i = 0; i < 40; i++) {
    channelStates.push({
        value: 0,
        on: false,
        solo: false,
        patch: 1, // AD1 padrão
        buses: Array(8).fill(false), // Novo: Assignments Bus 1-8
        stereo: true, // Novo: On/Off no barramento L/R Stereo
        insert: { on: false, position: 0, patch_in: 0 },
        eq: { on: false },
        paired: false,      // bool: este canal está em pair?
        pairedWith: null,   // number|null: índice 0-based do canal parceiro
        pairSource: null,   // number|null: qual canal foi a fonte na última operação de pair
        aux1Pre: true,      // bool: PRE/POST do envio AUX 1 (true=PRE)
        aux2Pre: true,
        aux3Pre: true,
        aux4Pre: true,
        aux5Pre: true,
        aux6Pre: true,
        aux7Pre: true,
        aux8Pre: true
    });
}
const DEFAULT_OUT_EQ = () => ({
    on: false,
    low: { f: 32, g: 0, q: 20, hpfOn: 0 },
    lowmid: { f: 60, g: 0, q: 20 },
    himid: { f: 84, g: 0, q: 20 },
    high: { f: 108, g: 0, q: 20, lpfOn: 0 }
});
let mixesState = [];
let busesState = [];
for (let i = 0; i < 8; i++) {
    mixesState.push({ value: 0, on: false, solo: false, name: `MIX ${i + 1}`, eq: DEFAULT_OUT_EQ(), paired: false, pairedWith: null, pairSource: null, auxTypeMode: 1, auxGlobal: 1, auxSendPrePoint: 0 });
    busesState.push({ value: 0, on: false, solo: false, name: `BUS ${i + 1}`, eq: DEFAULT_OUT_EQ(), paired: false, pairedWith: null, pairSource: null, insert: { on: false, position: 0, patch_in: 0 }, stereo: false, auxTypeMode: 1, auxGlobal: 1, auxSendPrePoint: 0 });
}

let masterState = { value: 0, pan: 0, on: false, solo: false, eq: DEFAULT_OUT_EQ() };
channelStates[52] = masterState; // Map for canvas engine

window.channelStates = channelStates;
window.mixesState = mixesState;
window.busesState = busesState;
window.masterState = masterState;

var activeConfigChannel = null;
window.activeConfigChannel = null;
var activeConfigTab = "aux"; // Auxiliares por padrão
window.activeConfigTab = "aux";
let appOrientation = 'vertical';
let musicianMode = false;
window.showMetersInMusicianMode = localStorage.getItem('01v96_musician_meters') === 'true';
window.showVolumeGeral = true;
let outsMode = false;
let technicianMixMode = false;
let activeMix = 1;
let tecnicoPassword = null; // Definido apenas pelo servidor via socket (lido do .env)
window.tecnicoPassword = tecnicoPassword;
window.envStatus = 'not_found';
window.serverName = null;
const savedRole = localStorage.getItem('01v96_role');
let layoutMode = savedRole === 'musician' ? 'mobile' : (localStorage.getItem('mixer_layout') || 'mobile');
document.body.classList.toggle('layout-desktop', layoutMode === 'desktop');
window.customNamesEnabled = localStorage.getItem('custom_names_enabled') !== 'false';
let layerNavEnabled = false;
let activeLayerStart = 0;
try { layerNavEnabled = localStorage.getItem('01v96_layer_nav') === 'true'; } catch (e) { }
window.globalNames = null;
window.lockedChannels = [];
window.themeChannelLockConfig = {
    hold_duration_ms: 1500,
    icon_class: 'fas fa-lock',
    z_index: 100
};

const container = document.getElementById('faders-container');

const curve = [
    { r: 1, d: -138 }, { r: 50, d: -74.6 }, { r: 75, d: -69.6 },
    { r: 100, d: -64.6 }, { r: 200, d: -44.6 }, { r: 403, d: -22 },
    { r: 423, d: -20 }, { r: 523, d: -15 }, { r: 603, d: -11 },
    { r: 723, d: -5 }, { r: 823, d: 0 }, { r: 1023, d: 10 }
];

function rawToDb(v, withUnit = true, isMaster = false) {
    if (v == 0) return "-∞" + (withUnit ? " dB" : "");
    for (let i = 1; i < curve.length; i++) {
        let p1 = curve[i - 1], p2 = curve[i];
        if (v >= p1.r && v <= p2.r) {
            let dValNum = p1.d + (v - p1.r) * ((p2.d - p1.d) / (p2.r - p1.r));
            if (isMaster) dValNum -= 10; // No MASTER, 1023 (o topo) vira 0dB
            const dVal = dValNum.toFixed(2);
            return withUnit ? dVal + " dB" : dVal;
        }
    }
    return withUnit ? "0.00 dB" : "0.00";
}

function dbToRaw(db) {
    if (db <= -138) return 0;
    if (db >= 10) return 1023;
    for (let i = 1; i < curve.length; i++) {
        let p1 = curve[i - 1], p2 = curve[i];
        if (db >= p1.d && db <= p2.d) {
            return Math.round(p1.r + (db - p1.d) * ((p2.r - p1.r) / (p2.d - p1.d)));
        }
    }
    return 0;
}

/**
 * Retorna o objeto de estado correto baseado no ID global do canal
 * IDs: 0-31 (Inputs), 36-43 (Mixes), 44-51 (Buses), 52 (Master)
 */
function getChannelStateById(id) {
    if (typeof id === 'string' && id.startsWith('st')) {
        const num = parseInt(id.replace('st', ''), 10);
        return channelStates[32 + num];
    }
    if (id === 'master' || id === 52) return masterState;
    if (typeof id === 'string' && id.startsWith('m')) return mixesState[parseInt(id.substring(1), 10)];
    if (typeof id === 'string' && id.startsWith('b')) return busesState[parseInt(id.substring(1), 10)];

    if (typeof id === 'number') {
        if (id >= 0 && id <= 31) return channelStates[id];
        if (id >= 36 && id <= 43) return mixesState[id - 36];
        if (id >= 44 && id <= 51) return busesState[id - 44];
        if (id >= 60 && id <= 67) return channelStates[32 + (id - 60)];
    }
    return null;
}

window.getChannelLabel = function (globalCh) {
    if (globalCh >= 0 && globalCh <= 31) return 'CH ' + (globalCh + 1);
    if (globalCh >= 36 && globalCh <= 43) return 'AUX ' + (globalCh - 35);
    if (globalCh >= 44 && globalCh <= 51) return 'BUS ' + (globalCh - 43);
    if (globalCh >= 60 && globalCh <= 67) return 'ST IN ' + (Math.floor((globalCh - 60) / 2) + 1) + (globalCh % 2 === 0 ? 'L' : 'R');
    if (globalCh === 52) return 'MASTER';
    return 'CH ' + globalCh;
};

/**
 * Retorna o prefixo do parâmetro baseado no ID global do canal
 */
function getChannelParamPrefix(id) {
    if (id === 'master' || id === 52) return 'kStereo';

    if (typeof id === 'string') {
        if (id.startsWith('m')) return 'kAUX';
        if (id.startsWith('b')) return 'kBus';
    }

    if (id >= 0 && id <= 31) return 'kInput';
    if (id >= 60 && id <= 67) return 'kInput';
    if (id >= 36 && id <= 43) return 'kAUX';
    if (id >= 44 && id <= 51) return 'kBus';
    return 'kInput'; // Fallback
}

/**
 * Calcula o próximo valor RAW baseado em um step em dB.
 * Útil para botões de nudge (+/-) que operam em passos fixos de volume.
 */
function getSteppedRaw(currentRaw, dir, stepDb = 0.5, isMaster = false) {
    const isUp = dir > 0;
    if (currentRaw <= 0 && !isUp) return 0;
    if (currentRaw >= 1023 && isUp) return 1023;

    // Se estiver no infinito (raw=0) e subir, vai para o primeiro degrau audível (raw=1)
    if (currentRaw === 0 && isUp) {
        return 1;
    }

    // Se estiver em raw=1 e descer, vai para -infinito (raw=0)
    if (currentRaw === 1 && !isUp) {
        return 0;
    }

    const currentDbStr = typeof rawToDb === 'function' ? rawToDb(currentRaw, false, isMaster) : '0';
    let currentDb = (currentDbStr === "-∞" || currentDbStr === "-inf") ? -138 : parseFloat(currentDbStr);
    if (isNaN(currentDb)) currentDb = -138;

    const maxDb = isMaster ? 0.0 : 10.0;
    let nextDb = isUp ? (currentDb + stepDb) : (currentDb - stepDb);

    if (nextDb > maxDb) nextDb = maxDb;
    if (nextDb < -138) return 0;

    let nRaw = typeof dbToRaw === 'function' ? dbToRaw(isMaster ? nextDb + 10 : nextDb) : Math.round(currentRaw + (isUp ? 1 : -1));

    // Se a resolução da curva em dB não gerou pelo menos 1 unidade de alteração raw:
    if (nRaw === currentRaw) {
        if (isUp && currentRaw < 1023) nRaw = currentRaw + 1;
        else if (!isUp && currentRaw > 0) nRaw = currentRaw - 1;
    }

    return Math.max(0, Math.min(1023, nRaw));
}

/**
 * Sincroniza visualmente o nome de um canal em todos os lugares necessários:
 * Fader Principal, Mini Fader (Config) e Sidebar Title.
 */
window.updateNameUI = function (channel, name) {
    // 0. Fonte da verdade: se name não foi passado explicitamente, busca nos nomes resolvidos ou estado
    if (name === undefined || name === null) {
        if (window.resolvedNames && window.resolvedNames[channel] && window.resolvedNames[channel].name !== undefined) {
            name = window.resolvedNames[channel].name;
        } else {
            const s = typeof getChannelStateById === 'function' ? getChannelStateById(channel) : null;
            name = (s && s.name) || '';
        }
    }

    const limitedName = (name || '').substring(0, 16).trim();

    // 1. Atualiza o estado local para consistência
    const stateObj = typeof getChannelStateById === 'function' ? getChannelStateById(channel) : null;
    if (stateObj) stateObj.name = limitedName;

    // 2. Atualiza via MainView (Componentes V2)
    if (typeof window.MainView !== 'undefined' && typeof window.MainView.updateName === 'function') {
        window.MainView.updateName(channel, limitedName);
    }

    // 3. Atualiza via OutsView (Componentes V2)
    if (typeof window.OutsView !== 'undefined' && typeof window.OutsView.updateName === 'function') {
        window.OutsView.updateName(channel, limitedName);
    }

    // 4. Atualiza via AuxSendsView (Componentes V2)
    if (typeof window.AuxSendsView !== 'undefined' && typeof window.AuxSendsView.updateName === 'function') {
        window.AuxSendsView.updateName(channel, limitedName);
    }

    // 5. Atualiza o Mini-Fader e Modal de Configuração se aberto
    if (typeof window.ChannelSetupCore !== 'undefined' && typeof window.ChannelSetupCore.updateName === 'function') {
        window.ChannelSetupCore.updateName(channel, limitedName);
    }

    // 6. Resolve IDs de elementos para compatibilidade legada
    let baseId = '';
    let displayTitle = '';

    if (channel >= 0 && channel <= 31) {
        baseId = `name${channel}`;
        displayTitle = `${channel + 1}`;
    } else if (channel >= 60 && channel <= 67) {
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
    } else if (channel === 52 || channel === 'master') {
        baseId = `namemaster`;
        displayTitle = `MASTER`;
    }

    if (baseId) {
        const el = document.getElementById(baseId);
        if (el) el.innerText = limitedName;
        const elMini = document.getElementById(`mini-${baseId}`);
        if (elMini) elMini.innerText = limitedName;
    }

    // 7. Atualiza título da sidebar se este canal for o ativo na config
    if (typeof activeConfigChannel !== 'undefined' && activeConfigChannel === channel) {
        const sideTitle = document.getElementById('chSideTitle');
        if (sideTitle) {
            sideTitle.innerText = `${displayTitle}${limitedName ? (' - ' + limitedName) : ''}`;
            if (window.autoScaleTitle) window.autoScaleTitle();
        }
        const headerTitle = document.getElementById('chSetupHeaderTitle');
        if (headerTitle) {
            headerTitle.innerText = `${displayTitle}${limitedName ? (' - ' + limitedName) : ''}`;
        }
    }
};

// Mapeamento Piecewise Linear para Dynamics (Gate e Compressor)
// Resolve a não-linearidade das escalas visuais e alinha com os labels.
window.mapDynDbToPercent = function (val, type) {
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
};

document.addEventListener('contextmenu', e => e.preventDefault());
