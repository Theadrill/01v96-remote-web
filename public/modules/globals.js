const socket = io();
const NUM_CHANNELS = 32;
let channelStates = [];
for (let i = 0; i < NUM_CHANNELS; i++) {
    channelStates.push({ value: 0, on: false, solo: false });
}
let masterState = { value: 0, on: false };
let activeConfigChannel = null;
let appOrientation = 'vertical';

const container = document.getElementById('faders-container');

const curve = [
    {r:1,d:-138},{r:50,d:-74.6},{r:75,d:-69.6},
    {r:100,d:-64.6},{r:200,d:-44.6},{r:403,d:-22},
    {r:423,d:-20},{r:523,d:-15},{r:603,d:-11},
    {r:723,d:-5},{r:823,d:0},{r:1023,d:10}
];

function rawToDb(v) { 
    if(v==0) return "-∞"; 
    for (let i=1; i<curve.length; i++) { 
        let p1=curve[i-1], p2=curve[i]; 
        if (v>=p1.r && v<=p2.r) {
            return (p1.d+(v-p1.r)*((p2.d-p1.d)/(p2.r-p1.r))).toFixed(2)+" dB"; 
        }
    } 
    return "0.00 dB"; 
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
