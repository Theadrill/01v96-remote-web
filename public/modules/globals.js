// 🚨 [CRITICAL SYNC LOGIC] - O socket DEVE ser inicializado aqui, como primeiro script.
// Se mover para o app.js ou carregar depois, os listeners nos outros módulos darão erro de 'undefined'.
const socket = io();
let appReady = false; 
const NUM_CHANNELS = 32;
let channelStates = [];
for (let i = 0; i < NUM_CHANNELS; i++) {
    channelStates.push({ 
        value: 0, 
        on: false, 
        solo: false,
        patch: 1, // AD1 padrão
        buses: Array(8).fill(false), // Novo: Assignments Bus 1-8
        stereo: true, // Novo: On/Off no barramento L/R Stereo
        eq: { on: false }
    });
}
const DEFAULT_OUT_EQ = () => ({
    on: false,
    low:    { f: 32,  g: 0, q: 20, hpfOn: 0 },
    lowmid: { f: 60,  g: 0, q: 20 },
    himid:  { f: 84,  g: 0, q: 20 },
    high:   { f: 108, g: 0, q: 20, lpfOn: 0 }
});
let mixesState = [];
let busesState = [];
for (let i = 0; i < 8; i++) {
    mixesState.push({ value: 0, on: false, name: `MIX ${i+1}`, eq: DEFAULT_OUT_EQ() });
    busesState.push({ value: 0, on: false, name: `BUS ${i+1}`, eq: DEFAULT_OUT_EQ() });
}

let masterState = { value: 0, on: false };
let activeConfigChannel = null;
let activeConfigTab = "aux"; // Auxiliares por padrão
let appOrientation = 'vertical';
let musicianMode = false;
let outsMode = false;
let technicianMixMode = false;
let activeMix = 1;
let tecnicoPassword = '2107'; // Fallback inicial
let layoutMode = localStorage.getItem('mixer_layout') || 'mobile';
document.body.classList.toggle('layout-desktop', layoutMode === 'desktop');

const container = document.getElementById('faders-container');

const curve = [
    {r:1,d:-138},{r:50,d:-74.6},{r:75,d:-69.6},
    {r:100,d:-64.6},{r:200,d:-44.6},{r:403,d:-22},
    {r:423,d:-20},{r:523,d:-15},{r:603,d:-11},
    {r:723,d:-5},{r:823,d:0},{r:1023,d:10}
];

function rawToDb(v, withUnit = true, isMaster = false) { 
    if(v==0) return "-∞" + (withUnit ? " dB" : ""); 
    for (let i=1; i<curve.length; i++) { 
        let p1=curve[i-1], p2=curve[i]; 
        if (v>=p1.r && v<=p2.r) {
            let dValNum = p1.d+(v-p1.r)*((p2.d-p1.d)/(p2.r-p1.r));
            if (isMaster) dValNum -= 10; // No MASTER, 1023 (o topo) vira 0dB
            const dVal = dValNum.toFixed(2);
            return withUnit ? dVal + " dB" : dVal;
        }
    } 
    return withUnit ? "0.00 dB" : "0.00";
}

function dbToRaw(db) { 
    if (db<=-138) return 0; 
    if (db>=10) return 1023; 
    for(let i=1; i<curve.length; i++) { 
        let p1=curve[i-1], p2=curve[i]; 
        if (db>=p1.d && db<=p2.d) {
            return Math.round(p1.r+(db-p1.d)*((p2.r-p1.r)/(p2.d-p1.d))); 
        }
    } 
    return 0; 
}

/**
 * Retorna o objeto de estado correto baseado no ID global do canal
 * IDs: 0-31 (Inputs), 36-43 (Mixes), 44-51 (Buses), 52 (Master)
 */
function getChannelStateById(id) {
    if (id === 'master' || id === 52) return masterState;

    // Se for string no formato 'm0' (Mix) ou 'b0' (Bus)
    if (typeof id === 'string') {
        if (id.startsWith('m')) return mixesState[parseInt(id.substring(1))];
        if (id.startsWith('b')) return busesState[parseInt(id.substring(1))];
    }

    if (id >= 0 && id <= 31) return channelStates[id];
    if (id >= 36 && id <= 43) return mixesState[id - 36];
    if (id >= 44 && id <= 51) return busesState[id - 44];
    return null;
}

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
    if (id >= 36 && id <= 43) return 'kAUX';
    if (id >= 44 && id <= 51) return 'kBus';
    return 'kInput'; // Fallback
}

/**
 * Calcula o próximo valor RAW baseado em um step em dB.
 * Útil para botões de nudge (+/-) que operam em passos fixos de volume.
 */
function getSteppedRaw(currentRaw, dir, stepDb = 0.5) {
    const magnitude = Math.abs(dir);
    const isUp = dir > 0;
    const currentDbStr = rawToDb(currentRaw, false);
    let currentDb = currentDbStr === "-∞" ? -138 : parseFloat(currentDbStr);

    // Se estiver no infinito e subir, começa do fundo da curva (-138)
    if (currentRaw === 0 && isUp) {
        return dbToRaw(-138 + (stepDb * magnitude));
    }
    
    let nextDb = isUp ? (currentDb + (stepDb * magnitude)) : (currentDb - (stepDb * magnitude));
    
    // Proteções de limites
    if (nextDb > 10) nextDb = 10;
    if (nextDb < -138) return 0;

    let nRaw = dbToRaw(nextDb);

    // 🚨 CORREÇÃO: Se nRaw não mudou mas houve direção, força mudança de pelo menos 1 unidade raw
    // Isso evita o "travamento" em áreas de baixa resolução da curva (ex: perto de -∞)
    if (nRaw === currentRaw) {
        if (isUp && currentRaw < 1023) nRaw = currentRaw + 1;
        else if (!isUp && currentRaw > 0) nRaw = currentRaw - 1;
    }

    return nRaw;
}

/**
 * Sincroniza visualmente o nome de um canal em todos os lugares necessários:
 * Fader Principal, Mini Fader (Config) e Sidebar Title.
 */
window.updateNameUI = function(channel, name) {
    const limitedName = (name || '').substring(0, 16).trim(); // Armazenamos até 16, mas exibimos 4 no visor
    const displayName = limitedName.substring(0, 4) || (channel < 32 ? `CH ${channel + 1}` : '');
    
    // 1. Atualiza o estado local para consistência
    const stateObj = getChannelStateById(channel);
    if (stateObj) stateObj.name = limitedName;

    // 2. Resolve IDs de elementos
    let baseId = '';
    let displayTitle = '';
    
    if (channel >= 0 && channel <= 31) {
        baseId = `name${channel}`;
        displayTitle = `${channel + 1}`;
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
    if (el) el.innerText = displayName;

    // 4. Atualiza mini-fader se estiver aberto na config
    const elMini = document.getElementById(`mini-${baseId}`);
    if (elMini) elMini.innerText = displayName;

    // 5. Atualiza título da sidebar se este canal for o ativo na config
    if (activeConfigChannel === channel) {
        const sideTitle = document.getElementById('chSideTitle');
        if (sideTitle) {
            sideTitle.innerText = `${displayTitle} - ${displayName || '...'}`;
            if (window.autoScaleTitle) window.autoScaleTitle();
        }
    }
};

// Mapeamento Piecewise Linear para Dynamics (Gate e Compressor)
// Resolve a não-linearidade das escalas visuais e alinha com os labels.
window.mapDynDbToPercent = function(val, type) {
    const GATE_POINTS = [-720, -600, -400, -200, -100, 0];
    const COMP_POINTS = [-540, -400, -200, -100, -50, 0];
    const DYN_PERCENTS = [0, 20, 40, 60, 80, 100];
    
    const points = (type === 'gate' ? GATE_POINTS : COMP_POINTS);
    const percentages = DYN_PERCENTS;
    
    if (val <= points[0]) return 0;
    if (val >= points[points.length - 1]) return 100;
    
    for (let i = 1; i < points.length; i++) {
        if (val <= points[i]) {
            const dbRange = points[i] - points[i-1];
            const pctRange = percentages[i] - percentages[i-1];
            return percentages[i-1] + ((val - points[i-1]) / dbRange) * pctRange;
        }
    }
    return 100;
};
