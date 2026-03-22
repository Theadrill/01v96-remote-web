// --- CONSTANTES DA MESA 01V96 ---
const EQ_MIN_FREQ = 20;
const EQ_MAX_FREQ = 20000;
const EQ_MIN_GAIN = -18;
const EQ_MAX_GAIN = 18;

// Conversor de Sysex Yamaha 01V96 para Valor Numérico (10-bit Param Change)
// Formato esperado: [0, 0, msb, lsb] (últimos 2 bytes carregam os 10 bits: MSB(0-7) e LSB(0-127))
function sysexToVal(bytes) {
    if (!Array.isArray(bytes)) return bytes; // Fallback se já for número
    const len = bytes.length;
    if (len < 2) return 0;
    return (bytes[len - 2] << 7) | bytes[len - 1];
}

// Conversores: 01V96 - Fader (0-1023) p/ Valores Reais
function rawToFreq(raw) {
    const v = sysexToVal(raw); // Converte Sysex se necessário
    return EQ_MIN_FREQ * Math.pow(EQ_MAX_FREQ / EQ_MIN_FREQ, v / 1023);
}
function freqToRaw(freq) {
    return (Math.log10(freq / EQ_MIN_FREQ) / Math.log10(EQ_MAX_FREQ / EQ_MIN_FREQ)) * 1023;
}
function rawToGain(raw) {
    const v = sysexToVal(raw);
    return (v - 512) * (18 / 512); 
}
function gainToRaw(gain) {
    return (gain * 512 / 18) + 512;
}
function rawToQ(raw) {
    const v = sysexToVal(raw);
    return 0.1 * Math.pow(100, v / 1023);
}

// --- ESTADO GLOBAL ---
let eqContext = null;
let eqBands = []; 
let eqAnimationId = null;
let eqCanvas = null;
let eqCtx = null;
let activeBandIdx = -1; // Banda sendo arrastada no momento
let selectedBandIdx = -1; // Banda focada para o ajuste de Q e visibilidade de UI
let longPressTimeout = null;
let longPressOccurred = false;
let startPos = { x: 0, y: 0 };

function initEQEngine(ch) {
    if (!eqContext) eqContext = new (window.AudioContext || window.webkitAudioContext)();
    
    let state = channelStates[ch] || { eq: {} };
    const chEq = state.eq || {};
    eqBands = [];
    
    // Configura tipos dinâmicos (Shelf vs HPF/LPF vs Peaking)
    // Para simplificar a simulação, usaremos o state.eq.lowMode e highMode se existirem
    const lowMode = chEq.lowMode || (sysexToVal(chEq.hpfOn) === 1 ? 'highpass' : 'lowshelf');
    const highMode = chEq.highMode || (sysexToVal(chEq.lpfOn) === 1 ? 'lowpass' : 'highshelf');

    const mapping = [
        { key: 'low', type: lowMode, color: '#ff4d4d', defaultF: 20 },
        { key: 'lowmid', type: 'peaking', color: '#ffeb3b', defaultF: 50 },
        { key: 'himid', type: 'peaking', color: '#4caf50', defaultF: 80 },
        { key: 'high', type: highMode, color: '#2196f3', defaultF: 110 }
    ];

    mapping.forEach((m, i) => {
        const filter = eqContext.createBiquadFilter();
        const data = chEq[m.key] || {};
        
        filter.type = m.type;
        filter.frequency.value = rawToFreq(data.f !== undefined ? data.f : m.defaultF);
        filter.gain.value = rawToGain(data.g !== undefined ? data.g : 512);
        filter.Q.value = rawToQ(data.q !== undefined ? data.q : 65); // ~0.7 de Q

        eqBands.push({ filter, color: m.color, id: i, key: m.key });
    });
}

function renderEQ(ch) {
    initEQEngine(ch);
    const state = channelStates[ch] || { eq: {} };
    const isEqOn = state.eq ? !!state.eq.on : false;
    const isPhase = !!state.phase;

    const body = document.querySelector('.ch-modal-body');
    
    // Atualiza estados nos botões da SIDEBAR
    const sideBtnOn = document.getElementById('sideBtnEQOn');
    if (sideBtnOn) sideBtnOn.classList.toggle('on-active', isEqOn);
    const sideBtnPhase = document.getElementById('sideBtnPhase');
    if (sideBtnPhase) {
        sideBtnPhase.classList.remove('phase-inv', 'phase-norm');
        sideBtnPhase.classList.add(isPhase ? 'phase-inv' : 'phase-norm');
    }
    body.innerHTML = `
        <div class="eq-container" style="display:flex; flex-direction:column; width:100%; height:100%; overflow:hidden; touch-action:none;">
            <div style="background:#1a1a1a; padding:10px; display:flex; justify-content:space-between; align-items:center; flex-shrink:0;">
                <div style="display:flex; align-items:center; gap:10px;">
                    <button class="nav-btn" onclick="changeConfigChannel(-1)">&lt;</button>
                    <h2 style="margin:0; font-size:14px; color:#5cacee; min-width:140px; text-align:center;">${ch+1} - ${document.getElementById(`name${ch}`).innerText === '...' ? `CH ${ch+1}` : document.getElementById(`name${ch}`).innerText}</h2>
                    <button class="nav-btn" onclick="changeConfigChannel(1)">&gt;</button>
                </div>
                
                <!-- Controles Visíveis apenas em telas largas -->
                <div class="hide-mobile" style="gap:15px; align-items:center;">
                    <div id="headerQNudge" style="display:flex; align-items:center; gap:5px; background:#222; padding:3px 8px; border-radius:6px; border:1px solid #333;">
                        <button class="nav-btn" style="width:24px; height:24px; font-size:18px;" onpointerdown="startQNudge(-1)" onpointerup="stopQNudge()" onpointerleave="stopQNudge()">-</button>
                        <span style="font-size:10px; color:#888; font-weight:bold; min-width:10px; text-align:center;">Q</span>
                        <button class="nav-btn" style="width:24px; height:24px; font-size:16px;" onpointerdown="startQNudge(1)" onpointerup="stopQNudge()" onpointerleave="stopQNudge()">+</button>
                    </div>
                    <div style="display:flex; gap:8px;">
                        <button id="headerBtnEQOn" class="btn-state ${isEqOn ? 'on-active' : ''}" style="width:70px; height:32px; font-size:10px; margin:0;" onclick="toggleEQ(${ch})">EQ ON</button>
                        <button id="headerBtnPhase" class="btn-state ${isPhase ? 'phase-inv' : 'phase-norm'}" style="width:70px; height:32px; font-size:10px; margin:0;" onclick="togglePhase(${ch})">Ø PHASE</button>
                    </div>
                </div>
            </div>
            <div style="flex:1; background:#000; position:relative; min-height:280px;">
                <canvas id="eqCanvas" style="display:block; width:100%; height:100%;"></canvas>
            </div>
            <div id="eqInfo" style="background:#111; color:#777; font-size:10px; padding:5px 15px; font-family:monospace; height:20px;">
                Canais 1 e 4: Pressione e segure para HPF/LPF...
            </div>
            <!-- Modal de Contexto para HPF/LPF -->
            <div id="eqContextMenu" style="display:none; position:absolute; background:#222; border:1px solid #555; border-radius:10px; padding:10px; z-index:5000; box-shadow:0 8px 25px rgba(0,0,0,0.8); flex-direction:column; gap:5px;">
                <p style="margin:0 0 5px 0; font-size:9px; color:#aaa; text-align:center; text-transform:uppercase;">Tipo de Filtro</p>
                <div id="eqModeButtons" style="display:flex; flex-direction:column; gap:5px;">
                    <button id="btnModeNormal" class="btn-state" style="margin:0; width:110px; height:32px; font-size:10px;">NORMAL</button>
                    <button id="btnModeShelf" class="btn-state" style="margin:0; width:110px; height:32px; font-size:10px;">SHELF</button>
                    <button id="btnModeSpecial" class="btn-state" style="margin:0; width:110px; height:32px; font-size:10px;">HPF</button>
                </div>
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
    longPressOccurred = false;
    startPos = { x: e.clientX, y: e.clientY };

    eqBands.forEach((b, i) => {
        const bx = fToX(b.filter.frequency.value, rect.width);
        const by = gToY(b.filter.gain.value, rect.height);
        if (Math.hypot(bx - px, by - py) < 30) {
            activeBandIdx = i;
            selectedBandIdx = i; // Memoriza para o Q Nudge
            eqCanvas.setPointerCapture(e.pointerId);
            updateQControlsUI(); // Atualiza visibilidade dos botões de Q

            // Inicia Timer de Long Press para Bandas 1 (0) e 4 (3)
            if (i === 0 || i === 3) {
                longPressTimeout = setTimeout(() => {
                    showEQContextMenu(e.clientX, e.clientY, i);
                    longPressOccurred = true;
                }, 600);
            }
        }
    });

    // Fecha menu se clicar fora
    document.getElementById('eqContextMenu').style.display = 'none';
}

function showEQContextMenu(x, y, bandIdx) {
    const menu = document.getElementById('eqContextMenu');
    const b = eqBands[bandIdx];
    const isLow = bandIdx === 0;

    // Configura botões
    const btnN = document.getElementById('btnModeNormal');
    const btnS = document.getElementById('btnModeShelf');
    const btnX = document.getElementById('btnModeSpecial');

    btnX.innerText = isLow ? 'HPF' : 'LPF';

    // Highlight atual
    btnN.style.borderColor = (b.filter.type === 'peaking') ? '#007bff' : '#444';
    btnS.style.borderColor = (b.filter.type === 'lowshelf' || b.filter.type === 'highshelf') ? '#007bff' : '#444';
    btnX.style.borderColor = (b.filter.type === 'highpass' || b.filter.type === 'lowpass') ? '#007bff' : '#444';

    btnN.onclick = () => setBandMode(bandIdx, 'peaking');
    btnS.onclick = () => setBandMode(bandIdx, isLow ? 'lowshelf' : 'highshelf');
    btnX.onclick = () => setBandMode(bandIdx, isLow ? 'highpass' : 'lowpass');

    menu.style.left = `${Math.min(window.innerWidth - 130, x - 60)}px`;
    menu.style.top = `${Math.min(window.innerHeight - 150, y - 60)}px`;
    menu.style.display = 'flex';
}

function setBandMode(bandIdx, mode) {
    const b = eqBands[bandIdx];
    const isLow = bandIdx === 0;

    // Atualiza Áudio Local
    b.filter.type = mode;

    // Sincroniza Flags da Mesa (HPF/LPF On/Off)
    const hpfType = isLow ? 'kInputEQ/kEQHPFOn' : 'kInputEQ/kEQLPFOn';
    const isSpecial = mode === 'highpass' || mode === 'lowpass';
    
    // Persiste no state local
    if (!channelStates[activeConfigChannel].eq) channelStates[activeConfigChannel].eq = {};
    channelStates[activeConfigChannel].eq[isLow ? 'lowMode' : 'highMode'] = mode;

    // Se for HPF/LPF, o ganho deve ser fixado em 0dB visualmente
    if (isSpecial) {
        b.filter.gain.value = 0;
        const targetState = channelStates[activeConfigChannel]?.eq?.[isLow ? 'low' : 'high'];
        if (targetState) targetState.g = 512; // 0dB em raw
    }

    updateEQParam(hpfType, [0,0,0, isSpecial ? 1 : 0], mode);
    socket.emit('control', { type: hpfType, channel: activeConfigChannel, value: isSpecial ? 1 : 0, mode: mode });

    document.getElementById('eqContextMenu').style.display = 'none';
    updateQControlsUI();
}

function onEQMove(e, ch) {
    if (activeBandIdx === -1) return;

    // Se moveu, cancela long press. No touch (Android) usamos um threshold maior (25px)
    const threshold = e.pointerType === 'touch' ? 25 : 10;
    if (!longPressOccurred && Math.hypot(e.clientX - startPos.x, e.clientY - startPos.y) > threshold) {
        if (longPressTimeout) clearTimeout(longPressTimeout);
    }

    if (longPressOccurred) return; // Não arrasta se o menu estiver aberto
    const rect = eqCanvas.getBoundingClientRect();
    const px = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
    const py = Math.max(0, Math.min(rect.height, e.clientY - rect.top));
    
    const b = eqBands[activeBandIdx];
    const newF = xToF(px, rect.width);
    let newG = Math.max(EQ_MIN_GAIN, Math.min(EQ_MAX_GAIN, yToG(py, rect.height)));
    
    // HPF/LPF não possuem parâmetro de ganho; fixamos em 0dB
    if (b.filter.type === 'highpass' || b.filter.type === 'lowpass') {
        newG = 0;
    }
    
    b.filter.frequency.value = newF;
    b.filter.gain.value = newG;

    // Envio para mesa - Mapeamento exato com o dicionário (Case Sensitive)
    const rawF = Math.round(freqToRaw(newF));
    const rawG = Math.round(gainToRaw(newG));
    
    // Mapeamento de nomes para o dicionário (Yamaha usa 'Hi' em vez de 'High')
    const labelMap = { 'low': 'Low', 'lowmid': 'LowMid', 'himid': 'HiMid', 'high': 'Hi' };
    const label = labelMap[b.key] || 'Low';
    
    socket.emit('control', { type: `kInputEQ/kEQ${label}F`, channel: ch, value: rawF });
    socket.emit('control', { type: `kInputEQ/kEQ${label}G`, channel: ch, value: rawG });

    document.getElementById('eqInfo').innerText = `${label.toUpperCase()}: ${Math.round(newF)}Hz | ${newG.toFixed(1)}dB`;
}

function onEQUp() { 
    activeBandIdx = -1; // Para de arrastar imediatamente ao soltar
    if (longPressTimeout) clearTimeout(longPressTimeout);
}

window.updateEQParam = function(type, val, mode = null, ch = null) {
    if (!eqCanvas || !eqBands.length) return;
    const targetCh = ch !== null ? ch : activeConfigChannel;

    // Sincroniza o modo se vier no pacote (exclusivo para sincronização multi-aparelho)
    if (mode) {
        // Detecção precisa da banda (evitando confundir Low com LowMid)
        let bIdx = -1;
        if (type.includes('HPF') || (type.includes('Low') && !type.includes('Mid'))) bIdx = 0;
        if (type.includes('LPF') || (type.includes('Hi') && !type.includes('Mid'))) bIdx = 3;
        
        if (bIdx !== -1 && eqBands[bIdx]) {
            eqBands[bIdx].filter.type = mode;
            if (!channelStates[targetCh].eq) channelStates[targetCh].eq = {};
            const key = bIdx === 0 ? 'lowMode' : 'highMode';
            channelStates[targetCh].eq[key] = mode;
        }
    }

    // Gatilhos para Mudança de Tipo (HPF/LPF) - Checar antes do regex de F/G/Q
    if (type.includes('kEQHPFOn') || type.includes('kEQLPFOn')) {
        const isHPF = type.includes('kEQHPFOn') && sysexToVal(val) === 1;
        const isLPF = type.includes('kEQLPFOn') && sysexToVal(val) === 1;
        
        const stateSet = channelStates[targetCh]?.eq || {};

        if (type.includes('kEQHPFOn')) {
            eqBands[0].filter.type = isHPF ? 'highpass' : (stateSet.lowMode || 'lowshelf');
        }
        if (type.includes('kEQLPFOn')) {
            eqBands[3].filter.type = isLPF ? 'lowpass' : (stateSet.highMode || 'highshelf');
        }
        return; // Processado
    }

    const m = type.match(/kInputEQ\/kEQ(Low|LowMid|HiMid|Hi)(F|G|Q)/);
    if (!m) return;
    const b = eqBands.find(x => x.key === (m[1].toLowerCase() === 'hi' ? 'high' : m[1].toLowerCase()));
    if (b) {
        if (m[2] === 'F') b.filter.frequency.value = rawToFreq(val);
        if (m[2] === 'G') b.filter.gain.value = rawToGain(val);
        if (m[2] === 'Q') b.filter.Q.value = rawToQ(val);
    }
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
            eqCtx.fillStyle = (i === selectedBandIdx) ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.1)';
            eqCtx.fill();
            eqCtx.beginPath();
            eqCtx.arc(bx, by, 5, 0, Math.PI*2);
            eqCtx.fillStyle = b.color;
            eqCtx.fill();
            eqCtx.strokeStyle = (i === selectedBandIdx) ? '#fff' : 'rgba(255,255,255,0.5)';
            eqCtx.lineWidth = (i === selectedBandIdx) ? 2 : 1;
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
    if (!s) return;
    s.on = !s.on;
    const btn = document.getElementById('sideBtnEQOn');
    if (btn) btn.classList.toggle('on-active', s.on);
    const hBtn = document.getElementById('headerBtnEQOn');
    if (hBtn) hBtn.classList.toggle('on-active', s.on);
    socket.emit('control', { type: 'kInputEQ/kEQOn', channel: ch, value: s.on ? 1 : 0 });
}

function updatePhaseUI(ch, val) {
    if (activeConfigChannel !== ch) return;
    const sideBtn = document.getElementById('sideBtnPhase');
    if (sideBtn) {
        sideBtn.classList.remove('phase-inv', 'phase-norm');
        sideBtn.classList.add(!!val ? 'phase-inv' : 'phase-norm');
    }
    const hBtn = document.getElementById('headerBtnPhase');
    if (hBtn) {
        hBtn.classList.remove('phase-inv', 'phase-norm');
        hBtn.classList.add(!!val ? 'phase-inv' : 'phase-norm');
    }
}

// Lógica de Nudge para o fator Q
let qNudgeInterval = null;
window.startQNudge = function(dir) {
    stopQNudge();
    nudgeQ(dir);
    qNudgeInterval = setInterval(() => nudgeQ(dir), 100);
};

window.stopQNudge = function() {
    if (qNudgeInterval) clearInterval(qNudgeInterval);
    qNudgeInterval = null;
};

function nudgeQ(dir) {
    if (selectedBandIdx === -1) return;
    const ch = activeConfigChannel;
    const b = eqBands[selectedBandIdx];
    
    // Na 01V96, apenas o modo PEAKING (Normal) permite ajuste de Q
    if (b.filter.type !== 'peaking') return;
    
    const chEq = channelStates[ch].eq;
    if (!chEq || !chEq[b.key]) return;

    let v = sysexToVal(chEq[b.key].q);
    v += (-dir * 16); // Dobrei a sensitividade (de 8 para 16) para ir mais rápido
    if (v < 0) v = 0;
    if (v > 1023) v = 1023;
    
    // Mapeamento de nomes para o dicionário (Yamaha usa 'HiMid' e 'Hi')
    const labelMap = { 'low': 'Low', 'lowmid': 'LowMid', 'himid': 'HiMid', 'high': 'Hi' };
    const label = labelMap[b.key] || 'Low';
    
    chEq[b.key].q = [0, 0, (v >> 7) & 0x07, v & 0x7F];
    if (b.filter) b.filter.Q.value = rawToQ(v);
    socket.emit('control', { type: `kInputEQ/kEQ${label}Q`, channel: ch, value: v });
}

function updateQControlsUI() {
    if (selectedBandIdx === -1) return;
    const b = eqBands[selectedBandIdx];
    // Apenas Peaking tem Q ajustável
    const isFixed = b.filter.type !== 'peaking';
    
    // Header Q
    const hQ = document.getElementById('headerQNudge');
    if (hQ) {
        hQ.style.opacity = isFixed ? '0.2' : '1';
        hQ.style.pointerEvents = isFixed ? 'none' : 'auto';
    }
    
    // Sidebar Q
    const sQ = document.getElementById('sideQNudge');
    if (sQ) {
        sQ.style.opacity = isFixed ? '0.2' : '1';
        sQ.style.pointerEvents = isFixed ? 'none' : 'auto';
    }
}
