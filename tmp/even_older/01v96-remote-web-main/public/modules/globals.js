const socket = io();
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
let mixesState = [];
let busesState = [];
for (let i = 0; i < 8; i++) {
    mixesState.push({ value: 0, on: false, name: `MIX ${i+1}` });
    busesState.push({ value: 0, on: false, name: `BUS ${i+1}` });
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
