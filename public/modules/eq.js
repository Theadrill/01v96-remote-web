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
    if (raw === undefined || raw === null) return 1000;
    const v = sysexToVal(raw); // v is 0-124
    if (isNaN(v)) return 1000;
    
    // Formula exata baseada nos logs: f = 15.625 * 2^(v/12)
    // 0 = 15.6Hz, 72 = 1000Hz, 124 = 20000Hz
    return 15.625 * Math.pow(2, v / 12);
}
function freqToRaw(freq) {
    if (isNaN(freq) || freq <= 0) return 72;
    // v = 12 * log2(f / 15.625)
    return Math.round(12 * Math.log2(freq / 15.625));
}
function rawToGain(raw) {
    if (raw === undefined || raw === null) return 0;
    const v = sysexToVal(raw);
    // 01V96 EQ Gain: 0.1dB steps, signed 28-bit
    return v / 10; 
}
function gainToRaw(gain) {
    return Math.round(gain * 10);
}
function rawToQ(raw) {
    if (raw === undefined || raw === null) return 0.707;
    const v = sysexToVal(raw);
    if (isNaN(v)) return 0.707;
    
    // Peaking range 0-40 (10.0 to 0.10)
    if (v > 40) return 0.707;
    
    // Fator de escala 0.7 para "alargar" e ficar fiel ao visual da 01V96
    return 0.7 * (0.1 * Math.pow(10, (40 - v) / 20));
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
let eqClipboard = null; // Buffer para Copiar/Colar EQ

function initEQEngine(ch) {
    if (!eqContext) eqContext = new (window.AudioContext || window.webkitAudioContext)();
    
    let state = channelStates[ch] || { eq: {} };
    const chEq = state.eq || {};
    eqBands = [];
    
    const lowData = chEq.low || {};
    const highData = chEq.high || chEq.hi || {};
    
    // Detecção de Modo baseada nos códigos de Q e as chaves HPF/LPF
    // Na 01V96, se a chave HPF/LPF On (Par 4/14) for 0, é sempre Peaking.
    let lowMode = 'peaking';
    const lowQRaw = sysexToVal(lowData.q);
    const lowHPFOn = sysexToVal(lowData.hpfOn);
    if (lowHPFOn === 1) {
        if (lowQRaw === 44) lowMode = 'highpass';
        else if (lowQRaw === 41) lowMode = 'lowshelf';
        else lowMode = 'peaking';
    }
    
    let highMode = 'peaking';
    const highQRaw = sysexToVal(highData.q);
    const highLPFOn = sysexToVal(highData.lpfOn);
    if (highLPFOn === 1) {
        // Códigos para a banda High podem variar, mas seguem o padrão
        if (highQRaw === 43 || highQRaw === 44) {
            // Se o Q for 44 e a tela dizer Shelf, usamos shelf
            // Pelos logs recentes, 44 na High com LPF ON resultou em H.Shelf na mesa
            highMode = 'highshelf'; 
        } else if (highQRaw === 42) {
            highMode = 'highshelf';
        } else if (highQRaw === 40) {
            // LPF as vezes é um valor específico
            highMode = 'lowpass';
        }
    }
    
    // Calibração Final: Se o LPF On for 1 e for o canal 24+, na HIGH, costuma ser Shelf o padrão
    if (highLPFOn === 1 && highMode === 'peaking') highMode = 'highshelf';

    const mapping = [
        { key: 'low', type: lowMode, color: '#ff4d4d', defaultF: 22 }, // 21.2Hz
        { key: 'lowmid', type: 'peaking', color: '#ffeb3b', defaultF: 40 }, // ~200Hz
        { key: 'himid', type: 'peaking', color: '#4caf50', defaultF: 80 }, // ~2kHz
        { key: 'high', type: highMode, color: '#2196f3', defaultF: 124 } // 20kHz
    ];

    mapping.forEach((m, i) => {
        const filter = eqContext.createBiquadFilter();
        const data = chEq[m.key] || {};
        
        filter.type = m.type;
        filter.frequency.value = rawToFreq(data.f !== undefined ? data.f : m.defaultF);
        filter.gain.value = rawToGain(data.g);

        // Se estiver em modo corte (HPF/LPF), forçamos o Q a 0.707 (curva plana)
        if (m.type.includes('pass')) {
            filter.Q.value = 0.707;
        } else {
            filter.Q.value = rawToQ(data.q !== undefined ? data.q : 20);
        }

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
        sideBtnPhase.classList.toggle('phase-inv', isPhase);
        sideBtnPhase.classList.toggle('phase-norm', !isPhase);
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
                        <button id="headerBtnPhase" class="btn-state ${isPhase ? 'phase-inv' : 'phase-norm'}" style="width:70px; height:32px; font-size:10px; margin:0;" onclick="togglePhase(${ch})">Ø PHASE</button>
                        <button id="headerBtnFlat" class="btn-state" style="width:70px; height:32px; font-size:10px; margin:0; background:#dc3545; border-color:#dc3545; color:#fff;" onclick="flatEQ(${ch})">FLAT</button>
                        <button id="headerBtnCopy" class="btn-state" style="width:70px; height:32px; font-size:10px; margin:0; background:#007bff; color:#fff;" onclick="copyEQ(${ch})">COPIAR</button>
                        <button id="headerBtnPaste" class="btn-state" style="width:70px; height:32px; font-size:10px; margin:0; background:${eqClipboard ? '#fff' : '#444'}; color:${eqClipboard ? '#000' : '#fff'}; opacity:${eqClipboard ? '1' : '0.4'};" ${eqClipboard ? '' : 'disabled'} onclick="pasteEQ(${ch})">COLAR</button>
                        <button id="headerBtnEQOn" class="btn-state ${isEqOn ? 'on-active' : ''}" style="width:70px; height:32px; font-size:10px; margin:0; color:#fff;" onclick="toggleEQ(${ch})">EQ ON</button>
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
    const ch = activeConfigChannel;

    // Atualiza Áudio Local
    b.filter.type = mode;
    if (mode.includes('pass')) b.filter.Q.value = 0.707;

    // Sincroniza com a Mesa
    const hpfOnType = isLow ? 'kInputEQ/kEQHPFOn' : 'kInputEQ/kEQLPFOn';
    const qType = isLow ? 'kInputEQ/kEQLowQ' : 'kInputEQ/kEQHiQ';
    
    let qValue = 20; // Default Padrão (Q=1.0)
    let switchOn = 0;

    if (mode === 'peaking') {
        switchOn = 0;
    } else {
        switchOn = 1;
        if (isLow) {
            qValue = (mode === 'highpass') ? 44 : 41;
        } else {
            qValue = (mode === 'lowpass') ? 43 : 42;
        }
    }

    // Persiste no state local para evitar flicker
    if (!channelStates[ch].eq) channelStates[ch].eq = { low:{}, high:{} };
    const bandKey = isLow ? 'low' : 'high';
    if (!channelStates[ch].eq[bandKey]) channelStates[ch].eq[bandKey] = {};
    channelStates[ch].eq[bandKey].q = qValue;
    channelStates[ch].eq[bandKey][isLow ? 'hpfOn' : 'lpfOn'] = switchOn;

    // Se for HPF/LPF, o ganho deve ser fixado em 0dB
    if (mode.includes('pass')) {
        b.filter.gain.value = 0;
        channelStates[ch].eq[bandKey].g = 0;
        socket.emit('control', { type: `kInputEQ/kEQ${isLow?'Low':'Hi'}G`, channel: ch, value: 0 });
    }

    // Envia os comandos para a mesa
    socket.emit('control', { type: qType, channel: ch, value: qValue });
    socket.emit('control', { type: hpfOnType, channel: ch, value: switchOn });

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

    // Envio para mesa
    const rawF = Math.round(freqToRaw(newF));
    const rawG = Math.round(gainToRaw(newG));
    
    const labelMap = { 'low': 'Low', 'lowmid': 'LowMid', 'himid': 'HiMid', 'high': 'Hi' };
    const label = labelMap[b.key] || 'Low';
    
    // ATUALIZAÇÃO DO ESTADO LOCAL (MEMÓRIA)
    const chState = channelStates[ch];
    if (chState && chState.eq && chState.eq[b.key]) {
        chState.eq[b.key].f = rawF;
        chState.eq[b.key].g = rawG;
    }

    socket.emit('control', { type: `kInputEQ/kEQ${label}F`, channel: ch, value: rawF });
    socket.emit('control', { type: `kInputEQ/kEQ${label}G`, channel: ch, value: rawG });

    document.getElementById('eqInfo').innerText = `${label.toUpperCase()}: ${Math.round(newF)}Hz | ${newG.toFixed(1)}dB`;
}

function onEQUp() { 
    activeBandIdx = -1; // Para de arrastar imediatamente ao soltar
    if (longPressTimeout) clearTimeout(longPressTimeout);
}

window.updateEQParam = function(type, val, mode = null, ch = null) {
    const targetCh = ch !== null ? ch : activeConfigChannel;
    
    // 1. SALVAR NO ESTADO LOCAL (MEMÓRIA) - SEMPRE, MESMO SE UI ESTIVER FECHADA
    const chState = channelStates[targetCh];
    if (!chState.eq) chState.eq = {};
    if (!chState.eq.low) chState.eq.low = { f:12, g:0, q:44, hpfOn:0 };
    if (!chState.eq.lowmid) chState.eq.lowmid = { f:49, g:0, q:35 };
    if (!chState.eq.himid) chState.eq.himid = { f:82, g:0, q:35 };
    if (!chState.eq.high) chState.eq.high = { f:110, g:0, q:44, lpfOn:0 };

    if (type.includes('kEQHPFOn')) chState.eq.low.hpfOn = val;
    if (type.includes('kEQLPFOn')) chState.eq.high.lpfOn = val;
    if (type.includes('kEQOn')) chState.eq.on = (val === 1 || val === true);
    
    const parts = type.match(/kInputEQ\/kEQ(Low|LowMid|HiMid|Hi)(F|G|Q)/);
    if (parts) {
        // Normaliza a chave para o estado: Hi -> high
        const bLabel = parts[1];
        const bandKey = (bLabel === 'Hi' ? 'high' : bLabel.toLowerCase());
        const paramKey = parts[2].toLowerCase();
        
        if (!chState.eq[bandKey]) chState.eq[bandKey] = {};
        chState.eq[bandKey][paramKey] = val;
    }
    
    // ATUALIZAR UI APENAS SE O CANAL FOR O ATIVO E HOUVER CANVAS
    if (targetCh !== activeConfigChannel || !eqCanvas || !eqBands.length) return;

    if (mode) {
        let bIdx = -1;
        if (type.includes('HPF') || (type.includes('Low') && !type.includes('Mid'))) bIdx = 0;
        if (type.includes('LPF') || (type.includes('Hi') && !type.includes('Mid'))) bIdx = 3;
        if (bIdx !== -1 && eqBands[bIdx]) {
            eqBands[bIdx].filter.type = mode;
            const key = bIdx === 0 ? 'lowMode' : 'highMode';
            chState.eq[key] = mode;
        }
    }

    const eq = chState.eq;
    
    // Sincroniza Tipos de Filtro na UI
    let lMode = 'peaking';
    if (sysexToVal(eq.low?.hpfOn) === 1) {
        const lq = sysexToVal(eq.low?.q);
        if (lq === 44) lMode = 'highpass';
        else if (lq === 41) lMode = 'lowshelf';
    }
    if (eqBands[0]) eqBands[0].filter.type = lMode;

    let hMode = 'peaking';
    if (sysexToVal(eq.high?.lpfOn) === 1) {
        const hq = sysexToVal(eq.high?.q);
        if (hq === 43) hMode = 'lowpass';
        else if (hq === 42) hMode = 'highshelf';
    }
    if (eqBands[3]) eqBands[3].filter.type = hMode;

    // Sincroniza Valores no Gráfico
    if (parts) {
        const b = eqBands.find(x => x.key === (parts[1].toLowerCase() === 'hi' ? 'high' : parts[1].toLowerCase()));
        if (b) {
            const label = parts[1].toUpperCase() === 'HI' ? 'HIGH' : parts[1].toUpperCase();
            if (parts[2] === 'F') b.filter.frequency.value = rawToFreq(val);
            if (parts[2] === 'G') b.filter.gain.value = (b.filter.type.includes('pass')) ? 0 : rawToGain(val);
            if (b.filter.type.includes('pass')) b.filter.Q.value = 0.707;
            else if (parts[2] === 'Q') b.filter.Q.value = rawToQ(val);

            const info = document.getElementById('eqInfo');
            if (info) info.innerText = `${label}: ${Math.round(b.filter.frequency.value)}Hz | ${b.filter.type.includes('pass') ? '0.0' : b.filter.gain.value.toFixed(1)}dB`;
        }
    }
    // Garantia extra global anti-ombro (sempre executada)
    if (eqBands[0] && eqBands[0].filter.type.includes('pass')) { 
        eqBands[0].filter.Q.value = 0.707; 
        eqBands[0].filter.gain.value = 0; 
    }
    if (eqBands[3] && eqBands[3].filter.type.includes('pass')) { 
        eqBands[3].filter.Q.value = 0.707;
        eqBands[3].filter.gain.value = 0;
    }
    
    // A animação em loop iniciada no renderEQ/startEQAnimation 
    // vai atualizar o gráfico automaticamente a 60fps refletindo os filtros novos.
}

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
            const val = tMag[i];
            if (isNaN(val) || val <= 0) continue;
            const db = 20 * Math.log10(val);
            const y = gToY(db, h);
            if (isNaN(y)) continue;
            eqCtx.lineTo((i/steps)*w, y);
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
            
            // Halo de seleção
            eqCtx.beginPath();
            eqCtx.arc(bx, by, 12, 0, Math.PI*2);
            eqCtx.fillStyle = (i === selectedBandIdx) ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.1)';
            eqCtx.fill();
            
            // Texto da Frequência Real-Time
            eqCtx.fillStyle = '#fff';
            eqCtx.font = 'bold 10px Inter, sans-serif';
            eqCtx.textAlign = 'center';
            const fText = b.filter.frequency.value >= 1000 
                ? (b.filter.frequency.value/1000).toFixed(2) + 'k' 
                : Math.round(b.filter.frequency.value) + 'Hz';
            eqCtx.fillText(fText, bx, by - 18);

            // Ponto da Banda
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

// Reversão: Funcionalidade de Copia e Cola removida conforme solicitado pelo usuário para restaurar a estabilidade.

window.togglePhase = function(ch) {
    const s = channelStates[ch];
    if (!s) return;
    s.phase = !s.phase;
    const btn = document.getElementById('sideBtnPhase');
    if (btn) {
        btn.classList.toggle('phase-inv', s.phase);
        btn.classList.toggle('phase-norm', !s.phase);
    }
    const hBtn = document.getElementById('headerBtnPhase');
    if (hBtn) {
        hBtn.classList.toggle('phase-inv', s.phase);
        hBtn.classList.toggle('phase-norm', !s.phase);
    }
    socket.emit('control', { type: 'kInputPhase/kPhase', channel: ch, value: s.phase ? 1 : 0 });
}

window.flatEQ = function(ch) {
    // Sincroniza Frequências, Ganhos e Q das 4 bandas (Low, LowMid, HiMid, Hi)
    const bands = ['Low', 'LowMid', 'HiMid', 'Hi'];
    bands.forEach(bName => {
        const type = `kInputEQ/kEQ${bName}G`;
        // Para a 01V96, 0.0dB é o valor central (0 assinado)
        socket.emit('control', { type, channel: ch, value: 0 });
        
        // Atualiza visual local imediatamente
        const key = bName.toLowerCase().replace('hi', 'high').replace('highmid', 'himid');
        const band = eqBands.find(x => x.key === key);
        if (band) band.filter.gain.value = 0;
        
        // Persiste no state
        if (channelStates[ch].eq && channelStates[ch].eq[key]) {
            channelStates[ch].eq[key].g = 0;
        }
    });
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
    // Invertido: + aumenta v (diminui Q linear = alarga), - diminui v (aumenta Q linear = afina)
    v += (dir * 1); 
    if (v < 0) v = 0;
    if (v > 40) v = 40; // Limite do modo Peaking
    
    const labelMap = { 'low': 'Low', 'lowmid': 'LowMid', 'himid': 'HiMid', 'high': 'Hi' };
    const label = labelMap[b.key] || 'Low';
    
    // Salva o valor no state local (como número para consistência)
    chEq[b.key].q = v;
    
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

// Funções de Cópia e Cola
window.copyEQ = function(ch) {
    const s = channelStates[ch].eq;
    if (!s) return console.warn(`Sem dados de EQ para o canal ${ch + 1}`);
    
    // Captura profunda (clone) para não ter referências cruzadas
    eqClipboard = JSON.parse(JSON.stringify(s));

    console.log(`\n📋 [COPIAR] Dados Capturados do Canal ${ch + 1}:`);
    console.log(JSON.stringify(eqClipboard, null, 2));
    
    // Habilita os botões de Colar (estilo branco com texto preto)
    const btns = ['sideBtnPaste', 'headerBtnPaste'];
    btns.forEach(id => {
        const b = document.getElementById(id);
        if (b) {
            b.disabled = false;
            b.style.background = '#fff';
            b.style.color = '#000';
            b.style.opacity = '1';
        }
    });
};

window.showCustomConfirm = function(msg, onOk) {
    const modal = document.getElementById('customConfirmModal');
    const msgEl = document.getElementById('customConfirmMsg');
    const okBtn = document.getElementById('customConfirmOk');
    const cancelBtn = document.getElementById('customConfirmCancel');

    msgEl.innerText = msg;
    modal.style.display = 'flex';

    okBtn.onclick = () => {
        modal.style.display = 'none';
        onOk();
    };
    cancelBtn.onclick = () => {
        modal.style.display = 'none';
    };
};

window.pasteEQ = function(ch) {
    if (!eqClipboard) return;
    showCustomConfirm(`Deseja colar as definições de EQ para o Canal ${ch + 1}?`, () => {
        console.log(`\n📥 [COLAR] Aplicando no Canal ${ch + 1}...`);
    
    // Mapeamento necessário para os nomes de comando da 01V96
    const bMap = [
        { key: 'low', label: 'Low' },
        { key: 'lowmid', label: 'LowMid' },
        { key: 'himid', label: 'HiMid' },
        { key: 'high', label: 'Hi' }
    ];

    bMap.forEach(b => {
        const data = eqClipboard[b.key];
        if (!data) return;

        // Frequência, Ganho e Q - Garantindo que enviamos números decimais (decodificados do SysEx se necessário)
        if (data.f !== undefined) socket.emit('control', { type: `kInputEQ/kEQ${b.label}F`, channel: ch, value: sysexToVal(data.f) });
        if (data.g !== undefined) socket.emit('control', { type: `kInputEQ/kEQ${b.label}G`, channel: ch, value: sysexToVal(data.g) });
        if (data.q !== undefined) socket.emit('control', { type: `kInputEQ/kEQ${b.label}Q`, channel: ch, value: sysexToVal(data.q) });

        // HPF On (apenas banda Low)
        if (b.key === 'low' && data.hpfOn !== undefined) {
            socket.emit('control', { type: 'kInputEQ/kEQHPFOn', channel: ch, value: sysexToVal(data.hpfOn) });
        }
        // LPF On (apenas banda High)
        if (b.key === 'high' && data.lpfOn !== undefined) {
            socket.emit('control', { type: 'kInputEQ/kEQLPFOn', channel: ch, value: sysexToVal(data.lpfOn) });
        }
    });

    // EQ Global ON/OFF
    if (eqClipboard.on !== undefined) {
        socket.emit('control', { type: 'kInputEQ/kEQOn', channel: ch, value: (eqClipboard.on === 1 || eqClipboard.on === true) ? 1 : 0 });
    }

    // Opcional: atualização visual imediata se estivemos vendo o canal colado
    if (activeConfigChannel === ch) {
        // O servidor emitirá de volta os parâmetros via 'update', o que atualizará o channelStates.
        // Mas para feedback instantâneo, poderíamos forçar um render aqui.
        // O usuário pediu "puxando da mesa", então vamos deixar o 'update' vindo da mesa atualizar.
        console.log(`[PASTE] Dados enviados para a mesa. Aguardando atualização...`);
    }
    }); // Fim do callback do confirm
};
