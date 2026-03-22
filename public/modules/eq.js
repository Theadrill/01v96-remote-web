// --- CONSTANTES DA MESA 01V96 ---
const EQ_MIN_FREQ = 20;
const EQ_MAX_FREQ = 20000;
const EQ_MIN_GAIN = -18;
const EQ_MAX_GAIN = 18;

// Conversores: 01V96 - Fader (0-1023) p/ Valores Reais
function rawToFreq(raw) {
    if (raw === undefined || raw === null || isNaN(raw)) raw = 512;
    // Log approximation for 01V96 (0-1023)
    return EQ_MIN_FREQ * Math.pow(EQ_MAX_FREQ / EQ_MIN_FREQ, raw / 1023);
}
function freqToRaw(freq) {
    return Math.log10(freq / EQ_MIN_FREQ) / Math.log10(EQ_MAX_FREQ / EQ_MIN_FREQ) * 1023;
}
function rawToGain(raw) {
    if (raw === undefined || raw === null || isNaN(raw)) raw = 512;
    return (raw - 512) * (18 / 512); 
}
function gainToRaw(gain) {
    return (gain * 512 / 18) + 512;
}

// --- ESTADO GLOBAL ---
let eqContext = null;
let eqBands = []; 
let eqAnimationId = null;
let eqCanvas = null;
let eqCtx = null;
let activeBandIdx = -1; 

function initEQEngine(ch) {
    if (!eqContext) eqContext = new (window.AudioContext || window.webkitAudioContext)();
    
    // Carrega do channelStates
    const state = channelStates[ch] || { eq: {} };
    const chEq = state.eq || {};
    eqBands = [];
    
    const mapping = [
        { key: 'low', type: 'lowshelf', color: '#ff4d4d', defaultF: 236 },
        { key: 'lowmid', type: 'peaking', color: '#ffeb3b', defaultF: 512 },
        { key: 'himid', type: 'peaking', color: '#4caf50', defaultF: 680 },
        { key: 'high', type: 'highshelf', color: '#2196f3', defaultF: 915 }
    ];

    mapping.forEach((m, i) => {
        const filter = eqContext.createBiquadFilter();
        const data = chEq[m.key] || {};
        
        filter.type = m.type;
        filter.frequency.value = rawToFreq(data.f !== undefined ? data.f : m.defaultF);
        filter.gain.value = rawToGain(data.g !== undefined ? data.g : 512);
        filter.Q.value = 0.7; // Padrão

        eqBands.push({ filter, color: m.color, id: i, key: m.key });
    });
}

function renderEQ(ch) {
    initEQEngine(ch);
    const state = channelStates[ch] || { eq: {} };
    const isEqOn = state.eq ? !!state.eq.on : false;
    const isPhase = !!state.phase;

    const body = document.querySelector('.ch-modal-body');
    body.innerHTML = `
        <div class="eq-container" style="display:flex; flex-direction:column; width:100%; height:100%; overflow:hidden;">
            <div style="background:#1a1a1a; padding:10px; display:flex; justify-content:space-between; align-items:center;">
                <h2 style="margin:0; font-size:14px; color:#5cacee;">EQUALIZADOR - CH ${ch+1}</h2>
                <div style="display:flex; gap:8px;">
                    <button id="btnEQOn" class="btn-state ${isEqOn ? 'on-active' : ''}" style="width:70px; height:32px; font-size:10px; margin:0;" onclick="toggleEQ(${ch})">EQ ON</button>
                    <button id="btnPhase" class="btn-state ${isPhase ? 'phase-inv' : 'phase-norm'}" style="width:70px; height:32px; font-size:10px; margin:0;" onclick="togglePhase(${ch})">Ø PHASE</button>
                </div>
            </div>
            <div style="flex:1; background:#000; position:relative; min-height:280px;">
                <canvas id="eqCanvas" style="display:block; width:100%; height:100%;"></canvas>
            </div>
            <div id="eqInfo" style="background:#111; color:#777; font-size:10px; padding:5px 15px; font-family:monospace; height:20px;">
                Clique e arraste um nó para ajustar...
            </div>
        </div>
    `;
    
    setupCanvas(ch);
    startEQAnimation();
}

function setupCanvas(ch) {
    eqCanvas = document.getElementById('eqCanvas');
    if (!eqCanvas) return;
    eqCtx = eqCanvas.getContext('2d');

    const doResize = () => {
        const rect = eqCanvas.parentElement.getBoundingClientRect();
        eqCanvas.width = rect.width * (window.devicePixelRatio || 1);
        eqCanvas.height = rect.height * (window.devicePixelRatio || 1);
        eqCtx.scale(window.devicePixelRatio || 1, window.devicePixelRatio || 1);
    };
    window.addEventListener('resize', doResize);
    doResize();

    eqCanvas.addEventListener('pointerdown', onEQDown);
    eqCanvas.addEventListener('pointermove', (e) => onEQMove(e, ch));
    window.addEventListener('pointerup', onEQUp);
}

// Mapas Gráficos
function fToX(f, w) {
    return (Math.log10(f) - Math.log10(EQ_MIN_FREQ)) / (Math.log10(EQ_MAX_FREQ) - Math.log10(EQ_MIN_FREQ)) * w;
}
function xToF(x, w) {
    return Math.pow(10, Math.log10(EQ_MIN_FREQ) + (x / w) * (Math.log10(EQ_MAX_FREQ) - Math.log10(EQ_MIN_FREQ)));
}
function gToY(g, h) {
    return h / 2 - (g * (h / 2) / EQ_MAX_GAIN);
}
function yToG(y, h) {
    return (h / 2 - y) * EQ_MAX_GAIN / (h / 2);
}

function onEQDown(e) {
    const rect = eqCanvas.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    activeBandIdx = -1;
    eqBands.forEach((b, i) => {
        const bx = fToX(b.filter.frequency.value, rect.width);
        const by = gToY(b.filter.gain.value, rect.height);
        if (Math.hypot(bx - px, by - py) < 30) {
            activeBandIdx = i;
            eqCanvas.setPointerCapture(e.pointerId);
        }
    });
}

function onEQMove(e, ch) {
    if (activeBandIdx === -1) return;
    const rect = eqCanvas.getBoundingClientRect();
    const px = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
    const py = Math.max(0, Math.min(rect.height, e.clientY - rect.top));
    
    const b = eqBands[activeBandIdx];
    const newF = xToF(px, rect.width);
    const newG = Math.max(EQ_MIN_GAIN, Math.min(EQ_MAX_GAIN, yToG(py, rect.height)));
    
    b.filter.frequency.value = newF;
    b.filter.gain.value = newG;

    // Envio para mesa
    const rawF = Math.round(freqToRaw(newF));
    const rawG = Math.round(gainToRaw(newG));
    const label = b.key.charAt(0).toUpperCase() + b.key.slice(1);
    
    socket.emit('control', { type: `kInputEQ/kEQ${label}F`, channel: ch, value: rawF });
    socket.emit('control', { type: `kInputEQ/kEQ${label}G`, channel: ch, value: rawG });

    document.getElementById('eqInfo').innerText = `${label.toUpperCase()}: ${Math.round(newF)}Hz | ${newG.toFixed(1)}dB`;
}

function onEQUp() { activeBandIdx = -1; }

window.updateEQParam = function(type, val) {
    if (!eqCanvas || !eqBands.length) return;
    const m = type.match(/kInputEQ\/kEQ(Low|LowMid|HiMid|High)(F|G|Q)/);
    if (!m) return;
    const b = eqBands.find(x => x.key === m[1].toLowerCase());
    if (!b) return;
    if (m[2] === 'F') b.filter.frequency.value = rawToFreq(val);
    if (m[2] === 'G') b.filter.gain.value = rawToGain(val);
};

function startEQAnimation() {
    if (eqAnimationId) cancelAnimationFrame(eqAnimationId);
    const run = () => {
        if (!eqCanvas || !eqCtx) return;
        const w = eqCanvas.width / (window.devicePixelRatio || 1);
        const h = eqCanvas.height / (window.devicePixelRatio || 1);
        
        eqCtx.fillStyle = '#0a0a0a';
        eqCtx.fillRect(0, 0, w, h);
        
        // GRID
        eqCtx.strokeStyle = '#222';
        eqCtx.lineWidth = 1;
        eqCtx.beginPath();
        [50, 100, 200, 500, 1000, 2000, 5000, 10000].forEach(f => {
            const x = fToX(f, w);
            eqCtx.moveTo(x, 0); eqCtx.lineTo(x, h);
        });
        [-12, -6, 0, 6, 12].forEach(g => {
            const y = gToY(g, h);
            eqCtx.moveTo(0, y); eqCtx.lineTo(w, y);
        });
        eqCtx.stroke();

        // Linha Zero
        eqCtx.strokeStyle = '#333';
        eqCtx.beginPath();
        eqCtx.moveTo(0, h/2); eqCtx.lineTo(w, h/2);
        eqCtx.stroke();

        // MATH CURVE
        const steps = Math.min(w, 400); // Otimizado
        const fArr = new Float32Array(steps);
        for(let i=0; i<steps; i++) fArr[i] = xToF((i/steps)*w, w);
        const tMag = new Float32Array(steps).fill(1.0);
        const mOut = new Float32Array(steps);
        const pOut = new Float32Array(steps);

        eqBands.forEach(b => {
            b.filter.getFrequencyResponse(fArr, mOut, pOut);
            for(let i=0; i<steps; i++) tMag[i] *= mOut[i];
        });

        // CURVE PATH
        eqCtx.beginPath();
        eqCtx.moveTo(0, h/2);
        for(let i=0; i<steps; i++) {
            const db = 20 * Math.log10(Math.max(1e-6, tMag[i]));
            eqCtx.lineTo((i/steps)*w, gToY(db, h));
        }
        eqCtx.lineTo(w, h/2);
        
        const g = eqCtx.createLinearGradient(0,0,0,h);
        g.addColorStop(0, 'rgba(0,150,255,0.1)');
        g.addColorStop(0.5, 'rgba(0,100,255,0.4)');
        g.addColorStop(1, 'rgba(0,50,255,0.1)');
        eqCtx.fillStyle = g;
        eqCtx.fill();
        
        eqCtx.strokeStyle = '#5cacee';
        eqCtx.lineWidth = 2;
        eqCtx.stroke();

        // HANDLES
        eqBands.forEach((b, i) => {
            const bx = fToX(b.filter.frequency.value, w);
            const by = gToY(b.filter.gain.value, h);
            eqCtx.beginPath();
            eqCtx.arc(bx, by, 12, 0, Math.PI*2);
            eqCtx.fillStyle = (i === activeBandIdx) ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.1)';
            eqCtx.fill();
            eqCtx.beginPath();
            eqCtx.arc(bx, by, 5, 0, Math.PI*2);
            eqCtx.fillStyle = b.color;
            eqCtx.fill();
            eqCtx.strokeStyle = '#fff';
            eqCtx.stroke();
        });

        eqAnimationId = requestAnimationFrame(run);
    };
    run();
}

function stopEQAnimation() {
    if (eqAnimationId) cancelAnimationFrame(eqAnimationId);
    eqAnimationId = null;
}

function toggleEQ(ch) {
    const s = channelStates[ch].eq;
    s.on = !s.on;
    document.getElementById('btnEQOn').classList.toggle('on-active', s.on);
    socket.emit('control', { type: 'kInputEQ/kEQOn', channel: ch, value: s.on ? 1 : 0 });
}

function togglePhase(ch) {
    const s = channelStates[ch];
    s.phase = s.phase ? 0 : 1;
    updatePhaseUI(ch, s.phase);
    socket.emit('control', { type: 'kInputPhase/kPhase', channel: ch, value: s.phase });
}

window.updatePhaseUI = function(ch, val) {
    if (activeConfigChannel !== ch) return;
    const btn = document.getElementById('btnPhase');
    if (btn) btn.className = `btn-state ${!!val ? 'phase-inv' : 'phase-norm'}`;
}
