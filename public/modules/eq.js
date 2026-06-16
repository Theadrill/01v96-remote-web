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
    let v = sysexToVal(raw); 
    if (isNaN(v)) return 1000;
    
    // Tratamento 01V96 (Original Revertido): Mesa envia índices diretamente (0-124).
    // Clampa o índice para o range da 01V96 (0-124) para evitar erros no BiquadFilter
    if (v > 124) v = 124;
    if (v < 0) v = 0;
    
    // Formula exata baseada nos logs da 01V96: f = 15.625 * 2^(v/12)
    return 15.625 * Math.pow(2, v / 12);
}
function freqToRaw(freq) {
    if (isNaN(freq) || freq <= 0) return 72;
    // v = index (0-124)
    const index = Math.round(12 * Math.log2(freq / 15.625));
    // Clampa o índice para o range da 01V96 (0-124)
    return Math.max(0, Math.min(124, index));
}
function rawToGain(raw) {
    if (raw === undefined || raw === null) return 0;
    let v = sysexToVal(raw);
    if (isNaN(v)) return 0;
    // Proteção básica p/ evitar ganhos fora dos 18dB
    if (v > 180) v = 180;
    if (v < -180) v = -180;
    return v / 10; 
}
function gainToRaw(gain) {
    return Math.round(gain * 10);
}
function rawToQ(raw) {
    if (raw === undefined || raw === null) return 0.707;
    let v = sysexToVal(raw);
    if (isNaN(v)) return 0.707;
    
    // Proteção: Range PEAKING da 01V96 é 0-40.
    if (v > 120) v = 40; 
    
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
let bubbleHideTimer = null; // Timer para ocultar o balão de Q
let showBubbleRequest = false; // Flag de controle de visibilidade temporária do balão

function initEQEngine(ch) {
    if (!eqContext) eqContext = new (window.AudioContext || window.webkitAudioContext)();
    
    let state = getChannelStateById(ch) || { eq: {} };
    const chEq = state.eq || {};
    eqBands = [];
    
    const lowData = chEq.low || {};
    const highData = chEq.high || chEq.hi || {};
    
    // Detecção de Modo baseada nos códigos de Q e as chaves HPF/LPF
    // Na 01V96, se a chave HPF/LPF On (Par 4/14) for 0, é sempre Peaking.
    let lowMode = 'peaking';
    const lowQRaw = sysexToVal(lowData.q);
    const lowHPFOn = sysexToVal(lowData.hpfOn);
    
    if (lowQRaw === 41) {
        lowMode = 'lowshelf';
    } else if (lowQRaw >= 42 || lowHPFOn === 1) {
        lowMode = 'highpass';
    }
    const lowWasHPFMode = (lowMode === 'highpass');
    const safeInitLowQ = (lowQRaw > 40) ? 20 : lowQRaw;
    
    let highMode = 'peaking';
    const highQRaw = sysexToVal(highData.q);
    
    if (highQRaw === 41 || highQRaw === 42) {
        highMode = 'highshelf';
    } else if (highQRaw >= 43) {
        highMode = 'lowpass';
    }
    const highWasLPFMode = (highMode === 'lowpass');
    const safeInitHighQ = (highQRaw > 40) ? 20 : highQRaw;

    const mapping = [
        { key: 'low', type: lowMode, color: '#ff4d4d', defaultF: 32 }, // 100Hz
        { key: 'lowmid', type: 'peaking', color: '#ffeb3b', defaultF: 60 }, // 500Hz
        { key: 'himid', type: 'peaking', color: '#4caf50', defaultF: 84 }, // 2kHz
        { key: 'high', type: highMode, color: '#2196f3', defaultF: 108 } // 8kHz
    ];

    // Usa os Q seguros (clampeados para o range peaking quando HPF/LPF está OFF)
    const safeQMap = { low: safeInitLowQ, high: safeInitHighQ };
    // Quando o modo era HPF/LPF mas está OFF: force gain=0 (mesmo comportamento do caminho real-time)
    const forceZeroGain = { low: lowWasHPFMode, high: highWasLPFMode };

    mapping.forEach((m, i) => {
        const filter = eqContext.createBiquadFilter();
        const data = chEq[m.key] || {};
        
        filter.type = m.type;
        filter.frequency.value = rawToFreq(data.f !== undefined ? data.f : m.defaultF);

        // Se estiver em modo corte (HPF/LPF), forçamos o Q a 0.707 e gain a 0
        if (m.type.includes('pass')) {
            filter.gain.value = 0;
            filter.Q.value = 0.707;
        } else {
            // Para low e high usa o Q seguro (não usa código de modo >= 41 no peaking)
            const safeQ = safeQMap[m.key] !== undefined ? safeQMap[m.key] : (data.q !== undefined ? data.q : 20);
            filter.Q.value = rawToQ(safeQ !== undefined ? safeQ : 20);
            // Se o modo era HPF/LPF mas está OFF: gain=0, igual ao caminho real-time (filter vinha de HPF com gain=0)
            filter.gain.value = forceZeroGain[m.key] ? 0 : rawToGain(data.g);
        }

        eqBands.push({ filter, color: m.color, id: i, key: m.key });
    });
}

function renderEQ(ch) {
    selectedBandIdx = -1; // Reseta seleção de banda ao abrir novo canal
    initEQEngine(ch); // Inicializa os filtros biquad e preenche eqBands
    socket.emit('requestEqAtt', { channel: ch }); // Reabre sync do ganho ao entrar na tela da mesa

    const state = getChannelStateById(ch) || { eq: {} };
    const isEqOn = state.eq ? !!state.eq.on : false;
    const isPhase = !!state.phase;

    const body = document.querySelector('.ch-modal-body');
    
    // Impede menu de contexto em TODO o corpo do equalizador (incluindo botões e canvas)
    body.addEventListener('contextmenu', (e) => e.preventDefault());
    
    // Atualiza estados nos botões da SIDEBAR
    const sideBtnOn = document.getElementById('sideBtnEQOn');
    if (sideBtnOn) sideBtnOn.classList.toggle('on-active', isEqOn);
    const sideBtnPhase = document.getElementById('sideBtnPhase');
    if (sideBtnPhase) {
        sideBtnPhase.classList.toggle('phase-inv', isPhase);
        sideBtnPhase.classList.toggle('phase-norm', !isPhase);
    }
    body.innerHTML = `
        <div class="eq-container" style="display:flex; flex-direction:column; width:100%; height:100%; overflow:visible; touch-action:none;">
            <div style="background:#1a1a1a; padding:12px; display:flex; justify-content:center; align-items:center; flex-shrink:0; flex-wrap:wrap; gap:10px;">
                <div style="display:flex; gap:8px; flex-wrap:wrap; justify-content:center;">
                    <button id="headerBtnPhase" class="btn-state ${isPhase ? 'phase-inv' : 'phase-norm'}" style="width:80px; height:38px; font-size:11px; margin:0;" onclick="togglePhase(${ch})">Ø PHASE</button>
                    <button id="headerBtnFlat" class="btn-state" style="width:80px; height:38px; font-size:11px; margin:0; background:#dc3545; border-color:#dc3545; color:#fff;" onclick="flatEQ(${ch})">FLAT</button>
                    <button id="headerBtnCopy" class="btn-state" style="width:80px; height:38px; font-size:11px; margin:0; background:#007bff; color:#fff;" onclick="copyEQ(${ch})">COPIAR</button>
                    <button id="headerBtnPaste" class="btn-state" style="width:80px; height:38px; font-size:11px; margin:0; background:${window.clipboardMode ? '#fff' : '#444'}; color:${window.clipboardMode ? '#000' : '#fff'}; opacity:${window.clipboardMode ? '1' : '0.4'};" ${window.clipboardMode ? '' : 'disabled'} onclick="pasteClipboard(${ch})">COLAR</button>
                    <button id="headerBtnATT" class="btn-state" style="width:80px; height:38px; font-size:11px; margin:0; background:#444; color:#fff;" onclick="toggleATTModal(true)">EQ ATT</button>
                    <button id="headerBtnRTA" class="btn-state" style="width:80px; height:38px; font-size:11px; margin:0; background:${rtaSource && rtaSource !== 'none' ? '#28a745' : '#444'}; color:#fff; border:none;" onclick="window.toggleRTAModal()">RTA</button>
                    <button id="headerBtnEQOn" class="btn-state ${isEqOn ? 'on-active' : ''}" style="width:80px; height:38px; font-size:11px; margin:0; color:#fff;" onclick="toggleEQ(${ch})">EQ ON</button>
                </div>
            </div>
            <div class="eq-content-wrapper" style="display:flex; flex:1; width:100%; min-height:0; overflow:hidden;">
                <div class="eq-main-area" style="flex:1; display:flex; flex-direction:column; min-width:0;">
                    <div class="eq-graph-container" style="position:relative;">
                        <canvas id="eqCanvas" style="display:block; width:100%; height:100%; position:absolute; top:0; left:0; z-index:1;"></canvas>
                        <canvas id="rtaCanvas" style="display:block; width:100%; height:100%; position:absolute; top:0; left:0; z-index:0; pointer-events:none;"></canvas>
                        
                        <!-- Balão de ajuste de Q (Aparece ao lado da banda selecionada) -->
                        <div id="eqBubble" onpointerdown="resetBubbleTimer()" style="display:none; position:absolute; background:#222; border:1px solid #444; border-radius:12px; padding:6px; z-index:100; flex-direction:row; align-items:center; box-shadow:0 10px 30px rgba(0,0,0,0.6); pointer-events:auto; transform:translate(15px, -50%);">
                            <button class="nav-btn" style="width:34px; height:34px; font-size:22px; cursor:pointer;" onpointerdown="startQNudge(-1)" onpointerup="stopQNudge()" onpointerleave="stopQNudge()">-</button>
                            <span style="font-size:12px; color:#888; font-weight:bold; margin:0 8px; font-family:sans-serif;">Q</span>
                            <button class="nav-btn" style="width:34px; height:34px; font-size:20px; cursor:pointer;" onpointerdown="startQNudge(1)" onpointerup="stopQNudge()" onpointerleave="stopQNudge()">+</button>
                        </div>
                    </div>

                    <!-- NOVO: Fader de Frequência Horizontal -->
                    <div id="eqFreqFaderContainer" class="eq-freq-fader-container" style="opacity: 0.3; pointer-events: none; display: flex; align-items: center; justify-content: center; gap: 8px;">
                        <button class="nav-btn" style="width: 34px; height: 34px; font-size: 20px; font-weight: bold; background: #222; border: 1px solid #444; border-radius: 6px; color: #fff; cursor: pointer; flex-shrink: 0;" onpointerdown="startFreqNudge(-1)" onpointerup="stopFreqNudge()" onpointerleave="stopFreqNudge()" onpointercancel="stopFreqNudge()">-</button>
                        <input type="range" id="eqFreqFaderInput" class="eq-freq-fader-input" min="0" max="124" step="1" value="72" orient="horizontal" oninput="eqFreqInput(event)" style="flex: 1;">
                        <button class="nav-btn" style="width: 34px; height: 34px; font-size: 20px; font-weight: bold; background: #222; border: 1px solid #444; border-radius: 6px; color: #fff; cursor: pointer; flex-shrink: 0;" onpointerdown="startFreqNudge(1)" onpointerup="stopFreqNudge()" onpointerleave="stopFreqNudge()" onpointercancel="stopFreqNudge()">+</button>
                    </div>

                    <div id="eqInfo" style="background:#111; color:#777; font-size:10px; padding:5px 35px 18px 35px; font-family:monospace; height:20px; border-top: 1px solid #222;">
                        Canais 1 e 4: Pressione e segure para HPF/LPF...
                    </div>
                </div>

                <!-- NOVO: Fader de Ganho Lateral (Referência AirFader) -->
                <div id="eqGainFaderContainer" class="eq-fader-container" style="opacity: 0.3; pointer-events: none; display: flex; flex-direction: column; align-items: center; gap: 6px;">
                    <button class="nav-btn" style="width: 34px; height: 34px; font-size: 20px; font-weight: bold; background: #222; border: 1px solid #444; border-radius: 6px; color: #fff; cursor: pointer; flex-shrink: 0;" onpointerdown="startGainNudge(1)" onpointerup="stopGainNudge()" onpointerleave="stopGainNudge()" onpointercancel="stopGainNudge()">+</button>
                    <div id="eqFaderVal" class="eq-fader-val" style="margin: 0;">+18.0</div>
                    <input type="range" id="eqFaderInput" class="eq-fader-input" min="-180" max="180" step="1" value="0" orient="vertical" oninput="eqGainInput(event)">
                    <div id="eqFaderLabel" class="eq-fader-label" style="margin: 0;">GAIN</div>
                    <button class="nav-btn" style="width: 34px; height: 34px; font-size: 22px; font-weight: bold; background: #222; border: 1px solid #444; border-radius: 6px; color: #fff; cursor: pointer; flex-shrink: 0;" onpointerdown="startGainNudge(-1)" onpointerup="stopGainNudge()" onpointerleave="stopGainNudge()" onpointercancel="stopGainNudge()">-</button>
                </div>
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

            <!-- Modal do Atenuador (EQ ATT) -->
            <div id="eqATTModal" style="display:none; position:absolute; top:50%; left:50%; transform:translate(-50%, -50%); background:#181818; border:1px solid #444; border-radius:15px; padding:25px; z-index:6000; box-shadow:0 15px 50px rgba(0,0,0,0.9); flex-direction:column; align-items:center; width:85%; max-width:400px; max-height:90dvh; overflow-y:auto; gap:25px;">
                <div style="display:flex; justify-content:space-between; width:100%; align-items:center; border-bottom:1px solid #333; padding-bottom:10px;">
                    <span style="font-weight:bold; color:#777; font-size:12px; text-transform:uppercase; letter-spacing:1px;">Ganho de EQ (ATT)</span>
                    <button onclick="toggleATTModal(false)" style="background:none; border:none; color:#777; font-size:24px; cursor:pointer; padding:0 5px;">&times;</button>
                </div>
                <div id="eqATTVal" style="font-size:32px; color:#5cacee; font-family:monospace; font-weight:bold;">0.0 dB</div>
                <div style="width:100%; padding:10px 0; display:flex; align-items:center; justify-content:center; gap:8px; min-width:0;">
                    <button class="nav-btn" style="width: 34px; height: 34px; font-size: 20px; font-weight: bold; background: #222; border: 1px solid #444; border-radius: 6px; color: #fff; cursor: pointer; flex-shrink: 0;" onpointerdown="startATTNudge(-1)" onpointerup="stopATTNudge()" onpointerleave="stopATTNudge()" onpointercancel="stopATTNudge()">-</button>
                    <input type="range" id="eqATTInput" min="-960" max="120" step="1" value="0" style="flex:1; min-width:0; height:12px; -webkit-appearance:none; background:#333; border-radius:6px; outline:none; cursor:pointer;" oninput="eqATTInput(event)">
                    <button class="nav-btn" style="width: 34px; height: 34px; font-size: 20px; font-weight: bold; background: #222; border: 1px solid #444; border-radius: 6px; color: #fff; cursor: pointer; flex-shrink: 0;" onpointerdown="startATTNudge(1)" onpointerup="stopATTNudge()" onpointerleave="stopATTNudge()" onpointercancel="stopATTNudge()">+</button>
                </div>
                <p style="margin:0; font-size:10px; color:#666; text-align:center;">Ajuste o ganho de entrada do equalizador</p>
                <button onclick="toggleATTModal(false)" class="nav-btn" style="width:100%; height:45px; background:#444; border-radius:8px; margin-top:10px;">FECHAR</button>
            </div>
            
            <!-- Modal do RTA -->
            <div id="rtaModal" style="display:none; position:absolute; top:50%; left:50%; transform:translate(-50%, -50%); background:#181818; border:1px solid #444; border-radius:15px; padding:25px; z-index:6000; box-shadow:0 15px 50px rgba(0,0,0,0.9); flex-direction:column; align-items:center; width:85%; max-width:400px; max-height:90dvh; overflow-y:auto; gap:25px;">
                <div style="display:flex; justify-content:space-between; width:100%; align-items:center; border-bottom:1px solid #333; padding-bottom:10px;">
                    <span id="rtaModalTitle" style="font-weight:bold; color:#777; font-size:12px; text-transform:uppercase; letter-spacing:1px;">Fonte do RTA</span>
                    <button onclick="document.getElementById('rtaModal').style.display='none'" style="background:none; border:none; color:#777; font-size:24px; cursor:pointer; padding:0 5px;">&times;</button>
                </div>
                
                <!-- Step 1: Choose Source Type -->
                <div id="rtaStep1" style="width:100%; display:flex; flex-direction:column; gap:10px;">
                    <div style="display:flex; flex-direction:column; gap:5px; margin-bottom: 5px;">
                        <div style="display:flex; gap:10px;">
                            <div style="display:flex; flex-direction:column; gap:5px; flex:1;">
                                <label style="color:#aaa; font-size:11px;">Resolução (FFT Size)</label>
                                <input type="number" id="rtaFftSize" value="4096" min="256" max="32768" step="256" style="background:#222; border:1px solid #444; color:#fff; border-radius:5px; padding:8px; width:100%; box-sizing:border-box;">
                            </div>
                            <div style="display:flex; flex-direction:column; gap:5px; flex:1;">
                                <label style="color:#aaa; font-size:11px;">Suavização (%)</label>
                                <input type="number" id="rtaSmoothing" value="90" min="0" max="100" step="1" style="background:#222; border:1px solid #444; color:#fff; border-radius:5px; padding:8px; width:100%; box-sizing:border-box;">
                            </div>
                        </div>
                        <button onclick="window.applyRTASettings()" class="nav-btn" style="width:100%; height:35px; background:#28a745; border-radius:5px; font-size:12px; margin-top:5px; color:#fff;">Aplicar Alterações</button>
                    </div>
                    <button onclick="window.showRtaStep2('local')" class="nav-btn" style="width:100%; height:45px; background:#444; border-radius:8px; color:#fff;">Microfone do Dispositivo Atual</button>
                    <button onclick="window.showRtaStep2('server')" class="nav-btn" style="width:100%; height:45px; background:#444; border-radius:8px; color:#fff;">Dispositivo do Servidor</button>
                    <button onclick="window.selectRTASource('simulated', 'default_in', parseInt(document.getElementById('rtaFftSize').value) || 4096, parseInt(document.getElementById('rtaSmoothing').value) || 90)" class="nav-btn" style="width:100%; height:45px; background:#005cbf; border-radius:8px; margin-top: 5px; color:#fff;">Áudio Simulado (Modo Teste)</button>
                    <button onclick="window.disableRTA()" class="nav-btn" style="width:100%; height:45px; background:#8b0000; border-radius:8px; margin-top: 10px; color:#fff;">DESATIVAR RTA</button>
                </div>

                <!-- Step 2: Configure and Connect -->
                <div id="rtaStep2" style="width:100%; display:none; flex-direction:column; gap:10px;">
                    <div style="display:flex; flex-direction:column; gap:5px;">
                        <label id="rtaDeviceLabel" style="color:#aaa; font-size:11px;">Dispositivo de Áudio</label>
                        <select id="rtaServerDevice" style="background:#222; border:1px solid #444; color:#fff; border-radius:5px; padding:8px; width:100%; box-sizing:border-box;">
                            <option value="default_in">Carregando dispositivos...</option>
                        </select>
                    </div>
                    
                    <div style="display:flex; gap:10px; margin-top: 15px;">
                        <button onclick="window.showRtaStep1()" class="nav-btn" style="flex:1; height:45px; background:#555; border-radius:8px; color:#fff;">VOLTAR</button>
                        <button onclick="window.connectRTA()" class="nav-btn" style="flex:1; height:45px; background:#28a745; border-radius:8px; color:#fff;">CONECTAR</button>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    setupCanvas(ch);
    startEQAnimation();
    updateEQFadersUI();
    
    // Auto-resume do RTA garantido APÓS a tela ter os Canvas prontos
    if (window.resumeRTA && rtaSource !== 'none') {
        window.resumeRTA();
    }
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

    // RTA Canvas setup
    const rtaCanvas = document.getElementById('rtaCanvas');
    if (rtaCanvas) {
        window.rtaCtx = rtaCanvas.getContext('2d');
        const doRtaResize = () => {
            const rect = rtaCanvas.parentElement.getBoundingClientRect();
            rtaCanvas.width = rect.width * (window.devicePixelRatio || 1);
            rtaCanvas.height = rect.height * (window.devicePixelRatio || 1);
            window.rtaCtx.scale(window.devicePixelRatio || 1, window.devicePixelRatio || 1);
        };
        window.addEventListener('resize', doRtaResize);
        doRtaResize();
    }

    eqCanvas.addEventListener('pointerdown', onEQDown);
    eqCanvas.addEventListener('pointermove', (e) => onEQMove(e, ch));
    window.addEventListener('pointerup', onEQUp);
    
    // Impede o menu de contexto nativo do Windows/Browsers ao segurar/clicar com botão direito
    eqCanvas.addEventListener('contextmenu', (e) => e.preventDefault());
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
        // Usa a mesma posição do ponto que o render (filtros de corte ficam em -12dB)
        const isPassFilter = b.filter.type === 'highpass' || b.filter.type === 'lowpass';
        const by = isPassFilter ? gToY(-12, rect.height) : gToY(b.filter.gain.value, rect.height);
        if (Math.hypot(bx - px, by - py) < 30) {
            activeBandIdx = i;
            selectedBandIdx = i; 
            resetBubbleTimer(); // Mostra o balão ao clicar na banda
            eqCanvas.setPointerCapture(e.pointerId);
            updateQControlsUI(); 
            
            // Inicia Timer de Long Press...

            // Inicia Timer de Long Press para Bandas 1 (0) e 4 (3)
            if (i === 0 || i === 3) {
                longPressTimeout = setTimeout(() => {
                    showEQContextMenu(e.clientX, e.clientY, i);
                    longPressOccurred = true;
                }, 900); // 1.5x mais demorado (600 -> 900)
            }
        }
    });

    // Se clicar em área vazia (fora de qualquer banda), reseta a seleção e esconde o balão
    if (activeBandIdx === -1) {
        selectedBandIdx = -1;
        showBubbleRequest = false; 
    }

    updateEQFadersUI();

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
    const prefix = getChannelParamPrefix(ch);
    const hpfOnType = `${prefix}EQ/${isLow ? 'kEQHPFOn' : 'kEQLPFOn'}`; // envia HPF para low, LPF para high
    const qType = `${prefix}EQ/kEQ${isLow ? 'Low' : 'Hi'}Q`;
    
    let qValue = 20; // Default Padrão (Q=1.0)
    let switchOn = 0;

    if (mode === 'peaking') {
        switchOn = 0;
    } else if (mode.includes('shelf')) {
        switchOn = 0; // Shelf não liga o HPF/LPF
        qValue = isLow ? 41 : 42;
    } else {
        switchOn = 1; // Highpass/Lowpass liga o HPF/LPF
        qValue = isLow ? 44 : 43;
    }

    // Persiste no state local para evitar flicker
    const targetState = getChannelStateById(ch);
    if (targetState && !targetState.eq) targetState.eq = { low:{}, high:{} };
    const bandKey = isLow ? 'low' : 'high';
    if (targetState && !targetState.eq[bandKey]) targetState.eq[bandKey] = {};
    if (targetState) {
        targetState.eq[bandKey].q = qValue;
        targetState.eq[bandKey][isLow ? 'hpfOn' : 'lpfOn'] = switchOn;
    }

    // Se for HPF/LPF, o ganho deve ser fixado em 0dB
    if (mode.includes('pass')) {
        b.filter.gain.value = 0;
        if (targetState) targetState.eq[bandKey].g = 0;
        socket.emit('control', { type: `${prefix}EQ/kEQ${isLow?'Low':'Hi'}G`, channel: ch, value: 0 });
    }

    // Envia os comandos para a mesa
    socket.emit('control', { type: qType, channel: ch, value: qValue });
    // Pequeno atraso antes do HPF/LPF - alguns firmwares parecem ignorar mudança de modo
    // quando enviada imediatamente após o Q. Temporalmente inofensivo e facilmente removível.
    setTimeout(() => {
        socket.emit('control', { type: hpfOnType, channel: ch, value: switchOn });
    }, 90);

    document.getElementById('eqContextMenu').style.display = 'none';
    updateQControlsUI();
    updateEQFadersUI();
}

function onEQMove(e, ch) {
    if (activeBandIdx === -1) return;

    // Reduçao de threshold p/ Android não interpretar arrastos de "Fine Tuning" como Long Press.
    const threshold = e.pointerType === 'touch' ? 8 : 4;
    if (!longPressOccurred && Math.hypot(e.clientX - startPos.x, e.clientY - startPos.y) > threshold) {
        if (longPressTimeout) {
            clearTimeout(longPressTimeout);
            longPressTimeout = null;
        }
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
    
    if (activeBandIdx !== -1) {
        resetBubbleTimer(); // Mantém visível enquanto arrasta
    }
    
    b.filter.frequency.value = newF;
    b.filter.gain.value = newG;

    // Envio para mesa
    const rawF = Math.round(freqToRaw(newF));
    const rawG = Math.round(gainToRaw(newG));
    
    const labelMap = { 'low': 'Low', 'lowmid': 'LowMid', 'himid': 'HiMid', 'high': 'Hi' };
    const label = labelMap[b.key] || 'Low';
    
    // ATUALIZAÇÃO DO ESTADO LOCAL (MEMÓRIA)
    const chState = getChannelStateById(ch);
    if (chState && chState.eq && chState.eq[b.key]) {
        chState.eq[b.key].f = rawF;
        chState.eq[b.key].g = rawG;
    }

    const prefix = getChannelParamPrefix(ch);
    socket.emit('control', { type: `${prefix}EQ/kEQ${label}F`, channel: ch, value: rawF });
    socket.emit('control', { type: `${prefix}EQ/kEQ${label}G`, channel: ch, value: rawG });

    updateEQFadersUI();

    document.getElementById('eqInfo').innerText = `${label.toUpperCase()}: ${Math.round(newF)}Hz | ${newG.toFixed(1)}dB`;
}

function onEQUp() { 
    activeBandIdx = -1; // Para de arrastrar imediatamente ao soltar
    if (longPressTimeout) clearTimeout(longPressTimeout);
}

window.updateEQParam = function(type, val, mode = null, ch = null) {
    const targetCh = ch !== null ? ch : activeConfigChannel;
    
    // 1. SALVAR NO ESTADO LOCAL (MEMÓRIA) - SEMPRE, MESMO SE UI ESTIVER FECHADA
    const chState = getChannelStateById(targetCh);
    if (!chState) return;
    if (!chState.eq) chState.eq = { on: false };
    if (!chState.eq.low) chState.eq.low = { f:32, g:0, q:44, hpfOn:0 };
    if (!chState.eq.lowmid) chState.eq.lowmid = { f:60, g:0, q:20 };
    if (!chState.eq.himid) chState.eq.himid = { f:84, g:0, q:20 };
    if (!chState.eq.high) chState.eq.high = { f:108, g:0, q:44, lpfOn:0 };

    if (type.includes('kEQHPFOn')) chState.eq.low.hpfOn = val;
    if (type.includes('kEQLPFOn')) chState.eq.high.lpfOn = val;
    if (type.endsWith('kEQOn')) chState.eq.on = (val === 1 || val === true);
    
    // ATENÇÃO: o regex deve cobrir TODOS os prefixos (kInput, kAUX, kBus, kStereo)
    // Se ficar hardcoded em kInputEQ, os canais Out (Bus/Mix) nunca sincronizam no gráfico.
    const parts = type.match(/^k(?:Input|AUX|Bus|Stereo)EQ\/kEQ(Low|LowMid|HiMid|Hi)(F|G|Q)/);
    if (parts) {
        // Normaliza a chave para o estado: Hi -> high, HiMid -> himid
        const bLabel = parts[1];
        const bandKey = bLabel === 'Hi' ? 'high' : bLabel.toLowerCase();
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
    const lqRaw = sysexToVal(eq.low?.q);
    const lhpfOn = sysexToVal(eq.low?.hpfOn);
    
    if (lqRaw === 41) {
        lMode = 'lowshelf';
    } else if (lqRaw >= 42 || lhpfOn === 1) {
        lMode = 'highpass';
    }

    if (eqBands[0]) {
        eqBands[0].filter.type = lMode;
        if (lMode === 'peaking') {
            const safeLQ = (lqRaw > 40) ? 20 : (lqRaw ?? 20);
            eqBands[0].filter.Q.value = rawToQ(safeLQ);
        }
    }

    let hMode = 'peaking';
    const hqRaw = sysexToVal(eq.high?.q ?? eq.hi?.q);
    
    if (hqRaw === 41 || hqRaw === 42) {
        hMode = 'highshelf';
    } else if (hqRaw >= 43) {
        hMode = 'lowpass';
    }

    if (eqBands[3]) {
        eqBands[3].filter.type = hMode;
        if (hMode === 'peaking') {
            const safeHQ = (hqRaw > 40) ? 20 : (hqRaw ?? 20);
            eqBands[3].filter.Q.value = rawToQ(safeHQ);
        }
    }

    // Sincroniza Valores no Gráfico
    if (parts) {
        // Normaliza: 'hi' -> 'high', 'himid' -> 'himid'
        const lookupKey = parts[1].toLowerCase() === 'hi' ? 'high' : parts[1].toLowerCase();
        const b = eqBands.find(x => x.key === lookupKey);
        if (b) {
            const label = parts[1].toUpperCase() === 'HI' ? 'HIGH' : parts[1].toUpperCase();
            if (parts[2] === 'F') b.filter.frequency.value = rawToFreq(val);
            if (parts[2] === 'G') b.filter.gain.value = (b.filter.type.includes('pass')) ? 0 : rawToGain(val);
            if (b.filter.type.includes('pass')) {
                b.filter.Q.value = 0.707;
                b.filter.gain.value = 0;
            } else if (parts[2] === 'Q') {
                // Só aplica Q se estiver dentro do range peaking (ignora códigos de modo)
                const safeVal = (val > 40) ? 20 : val;
                b.filter.Q.value = rawToQ(safeVal);
            }

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
    updateEQFadersUI();
}

window.startEQAnimation = function() {
    if (eqAnimationId) cancelAnimationFrame(eqAnimationId);
    const run = () => {
        if (!eqCanvas || !eqCtx) return;
        const w = eqCanvas.width / (window.devicePixelRatio || 1);
        const h = eqCanvas.height / (window.devicePixelRatio || 1);
        
        // O fundo do eqCanvas agora deve ser transparente para mostrar o rtaCanvas atrás
        eqCtx.clearRect(0, 0, w, h);
        
        // --- TEXTO MODO OFFLINE (MARCA D'ÁGUA) ---
        if (document.body.classList.contains('is-offline')) {
            eqCtx.fillStyle = 'rgba(255, 255, 255, 0.05)';
            eqCtx.font = 'bold 36px Inter, sans-serif';
            eqCtx.textAlign = 'center';
            
            if (w < 500) {
                // Quebra em duas linhas para telas estreitas
                eqCtx.fillText('MESA NÃO', w / 2, h * 0.25 - 20);
                eqCtx.fillText('CONECTADA', w / 2, h * 0.25 + 20);
            } else {
                // Linha única para telas largas
                eqCtx.fillText('MESA NÃO CONECTADA', w / 2, h * 0.25);
            }
        }
        
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

        const bubble = document.getElementById('eqBubble');
        eqBands.forEach((b, i) => {
            const bx = fToX(b.filter.frequency.value, w);
            // Para filtros de corte (HPF/LPF), posiciona o ponto em -12dB na frequência de corte
            // (visualmente sobre a curva descendente), não no centro (gain=0)
            const isPassFilter = b.filter.type === 'highpass' || b.filter.type === 'lowpass';
            const by = isPassFilter ? gToY(-12, h) : gToY(b.filter.gain.value, h);
            
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

            // Sincroniza posição do Balão de Q se a banda estiver selecionada
            if (i === selectedBandIdx && bubble) {
                // Só exibe se houver request ativo (após toque/clique e antes de 4 segundos)
                if (showBubbleRequest) {
                    bubble.style.display = 'flex';
                    bubble.style.left = `${bx}px`;
                    bubble.style.top = `${by}px`;
                    
                    // Inverte posição se estiver muito na direita
                    if (bx > w * 0.7) {
                        bubble.style.transform = 'translate(calc(-100% - 15px), -50%)';
                    } else {
                        bubble.style.transform = 'translate(15px, -50%)';
                    }
                    
                    // Esconder COMPLETAMENTE se o filtro for fixo (HPF/LPF/Shelf)
                    const isFixed = b.filter.type !== 'peaking';
                    if (isFixed) {
                        bubble.style.display = 'none';
                    } else {
                        bubble.style.display = 'flex';
                        bubble.style.opacity = '1';
                        bubble.style.pointerEvents = 'auto';
                    }
                } else {
                    bubble.style.display = 'none';
                }
            }
        });

        if (bubble && selectedBandIdx === -1) {
            bubble.style.display = 'none';
        }

        eqAnimationId = requestAnimationFrame(run);
    };
    run();
};

function stopEQAnimation() {
    if (eqAnimationId) cancelAnimationFrame(eqAnimationId);
    eqAnimationId = null;
    window.pauseRTA(); // Pausa o RTA
}

let pendingRtaSource = null;

window.showRtaStep1 = function() {
    document.getElementById('rtaStep1').style.display = 'flex';
    document.getElementById('rtaStep2').style.display = 'none';
    document.getElementById('rtaModalTitle').innerText = 'Fonte do RTA';
};

window.showRtaStep2 = async function(source) {
    pendingRtaSource = source;
    document.getElementById('rtaStep1').style.display = 'none';
    document.getElementById('rtaStep2').style.display = 'flex';
    
    const select = document.getElementById('rtaServerDevice');
    select.innerHTML = '<option value="default_in">Carregando dispositivos...</option>';
    
    if (source === 'server') {
        document.getElementById('rtaModalTitle').innerText = 'Servidor - Configuração';
        document.getElementById('rtaDeviceLabel').innerText = 'Dispositivo do Servidor';
        socket.emit('requestRtaDevices');
    } else if (source === 'local') {
        document.getElementById('rtaModalTitle').innerText = 'Local - Configuração';
        document.getElementById('rtaDeviceLabel').innerText = 'Microfone Local';
        
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
            stream.getTracks().forEach(t => t.stop());
            
            const devices = await navigator.mediaDevices.enumerateDevices();
            const audioInputs = devices.filter(d => d.kind === 'audioinput');
            
            select.innerHTML = '';
            if (audioInputs.length === 0) {
                select.innerHTML = '<option value="default_in">Nenhum microfone encontrado</option>';
            } else {
                audioInputs.forEach(d => {
                    const opt = document.createElement('option');
                    opt.value = d.deviceId || 'default_in';
                    opt.innerText = d.label || 'Microfone ' + (select.options.length + 1);
                    select.appendChild(opt);
                });
            }
        } catch (err) {
            console.error(err);
            select.innerHTML = '<option value="default_in">Microfone Padrão</option>';
        }
    }
    
    const savedSource = localStorage.getItem('rtaSource');
    if (savedSource === source) {
        const savedDevice = localStorage.getItem('rtaDeviceId');
        if (savedDevice) {
            setTimeout(() => {
                if (Array.from(select.options).some(o => o.value === savedDevice)) {
                    select.value = savedDevice;
                }
            }, 500); 
        }
    }
};

window.connectRTA = function() {
    const fftSize = parseInt(document.getElementById('rtaFftSize').value) || 4096;
    let smoothing = parseInt(document.getElementById('rtaSmoothing').value) || 90;
    const deviceId = document.getElementById('rtaServerDevice').value;
    
    if (smoothing > 99) smoothing = 99;
    if (smoothing < 1) smoothing = 1;
    document.getElementById('rtaSmoothing').value = smoothing;

    localStorage.setItem('rtaFftSize', fftSize);
    localStorage.setItem('rtaSmoothing', smoothing);
    localStorage.setItem('rtaDeviceId', deviceId);
    
    window.selectRTASource(pendingRtaSource, deviceId, fftSize, smoothing);
};

window.applyRTASettings = function() {
    const fftSize = parseInt(document.getElementById('rtaFftSize').value) || 4096;
    let smoothing = parseInt(document.getElementById('rtaSmoothing').value) || 90;
    
    if (smoothing > 99) smoothing = 99;
    if (smoothing < 1) smoothing = 1;
    document.getElementById('rtaSmoothing').value = smoothing;

    localStorage.setItem('rtaFftSize', fftSize);
    localStorage.setItem('rtaSmoothing', smoothing);
    window.rtaSmoothingFactor = smoothing / 100;
    
    if (rtaIsActive && rtaSource && rtaSource !== 'none') {
        const deviceId = localStorage.getItem('rtaDeviceId') || 'default_in';
        window.selectRTASource(rtaSource, deviceId, fftSize, smoothing);
    }
};

window.toggleRTAModal = function() {
    const modal = document.getElementById('rtaModal');
    if(modal) {
        const savedFft = localStorage.getItem('rtaFftSize');
        if (savedFft && document.getElementById('rtaFftSize')) {
            document.getElementById('rtaFftSize').value = savedFft;
        }
        const savedSmoothing = localStorage.getItem('rtaSmoothing');
        if (savedSmoothing && document.getElementById('rtaSmoothing')) {
            document.getElementById('rtaSmoothing').value = savedSmoothing;
        }
        modal.style.display = 'flex';
        window.showRtaStep1();
    }
};

window.resetBubbleTimer = function() {
    if (bubbleHideTimer) clearTimeout(bubbleHideTimer);
    showBubbleRequest = true;
    bubbleHideTimer = setTimeout(() => {
        showBubbleRequest = false;
    }, 4000); // 4 segundos de inatividade
};

window.toggleEQ = function(ch) {
    const state = getChannelStateById(ch);
    if (!state) return;
    const nextOn = !state.eq.on;
    state.eq.on = nextOn;
    
    const prefix = getChannelParamPrefix(ch);
    socket.emit('control', { type: `${prefix}EQ/kEQOn`, channel: ch, value: nextOn ? 1 : 0 });
    
    const btn = document.getElementById('headerBtnEQOn');
    if (btn) {
        btn.classList.toggle('on-active', nextOn);
    }
}

// Reversão: Funcionalidade de Copia e Cola removida conforme solicitado pelo usuário para restaurar a estabilidade.

window.togglePhase = function(ch) {
    const s = getChannelStateById(ch);
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
    const prefix = getChannelParamPrefix(ch);
    socket.emit('control', { type: `${prefix}Phase/kPhase`, channel: ch, value: s.phase ? 1 : 0 });
}

window.flatEQ = function(ch) {
    const prefix = getChannelParamPrefix(ch);
    const chState = getChannelStateById(ch);

    // Monta a lista de comandos a enviar com delay escalonado (igual padrão macros)
    // para evitar que múltiplos socket.emit síncronos sejam descartados pelo scheduler.
    const cmds = [
        { type: `${prefix}EQ/kEQHPFOn`, value: 0 },  // Low: desativa HPF/Shelf
        { type: `${prefix}EQ/kEQLowQ`,  value: 20 },  // Low: Q normal
        { type: `${prefix}EQ/kEQLowG`,  value: 0 },   // Low: gain flat
        { type: `${prefix}EQ/kEQLowMidG`, value: 0 }, // LowMid: gain flat
        { type: `${prefix}EQ/kEQHiMidG`, value: 0 },  // HiMid: gain flat
        { type: `${prefix}EQ/kEQLPFOn`, value: 0 },   // High: desativa LPF/Shelf
        { type: `${prefix}EQ/kEQHiQ`,   value: 20 },  // High: Q normal
        { type: `${prefix}EQ/kEQHiG`,   value: 0 },   // High: gain flat
    ];

    cmds.forEach((cmd, idx) => {
        setTimeout(() => {
            socket.emit('control', { type: cmd.type, channel: ch, value: cmd.value });
        }, idx * 30);
    });

    // Atualiza gráfico e state local imediatamente (não precisa esperar MIDI)
    const bandMap = {
        low:    { bandName: 'Low',    hasMode: true },
        lowmid: { bandName: 'LowMid', hasMode: false },
        himid:  { bandName: 'HiMid',  hasMode: false },
        high:   { bandName: 'Hi',     hasMode: true }
    };
    Object.entries(bandMap).forEach(([key, { hasMode }]) => {
        const band = eqBands.find(x => x.key === key);
        if (band) {
            band.filter.gain.value = 0;
            if (hasMode) {
                band.filter.type = 'peaking';
                band.filter.Q.value = rawToQ(20);
            }
        }
        if (chState && chState.eq && chState.eq[key]) {
            chState.eq[key].g = 0;
            if (key === 'low')  { chState.eq[key].hpfOn = 0; chState.eq[key].q = 20; }
            if (key === 'high') { chState.eq[key].lpfOn = 0; chState.eq[key].q = 20; }
        }
    });
}


function updatePhaseUI(ch, val) {
    if (activeConfigChannel !== ch) return;
    const hBtn = document.getElementById('headerBtnPhase');
    if (hBtn) {
        hBtn.classList.toggle('phase-inv', !!val);
        hBtn.classList.toggle('phase-norm', !val);
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
    
    const state = getChannelStateById(ch);
    const chEq = state ? state.eq : null;
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
    const prefix = getChannelParamPrefix(ch);
    socket.emit('control', { type: `${prefix}EQ/kEQ${label}Q`, channel: ch, value: v });
}

function updateQControlsUI() {
    // Agora o controle de Q é feito via balão contextual posicionado pelo run()
}

// NUDGE FREQUENCY
let freqNudgeInterval = null;
window.startFreqNudge = function(dir) {
    stopFreqNudge();
    nudgeFreq(dir);
    // Reduzido o intervalo (de 100 para 250ms) para ficar menos agressivo
    freqNudgeInterval = setInterval(() => nudgeFreq(dir), 250);
};
window.stopFreqNudge = function() {
    if (freqNudgeInterval) clearInterval(freqNudgeInterval);
    freqNudgeInterval = null;
};
function nudgeFreq(dir) {
    if (selectedBandIdx === -1) return;
    const ch = activeConfigChannel;
    const b = eqBands[selectedBandIdx];
    const state = getChannelStateById(ch);
    const chEq = state ? state.eq : null;
    if (!chEq || !chEq[b.key]) return;

    let v = sysexToVal(chEq[b.key].f);
    v += dir;
    if (v < 0) v = 0;
    if (v > 124) v = 124;

    chEq[b.key].f = v;
    const newF = rawToFreq(v);
    if (b.filter) b.filter.frequency.value = newF;

    const labelMap = { 'low': 'Low', 'lowmid': 'LowMid', 'himid': 'HiMid', 'high': 'Hi' };
    const label = labelMap[b.key] || 'Low';
    const prefix = getChannelParamPrefix(ch);
    socket.emit('control', { type: `${prefix}EQ/kEQ${label}F`, channel: ch, value: v });
    
    const fader = document.getElementById('eqFreqFaderInput');
    if (fader) fader.value = v;
    
    const info = document.getElementById('eqInfo');
    if (info) {
        const g = b.filter.gain.value;
        info.innerText = `${label.toUpperCase()}: ${Math.round(newF)}Hz | ${g.toFixed(1)}dB`;
    }
}

// NUDGE GAIN
let gainNudgeInterval = null;
window.startGainNudge = function(dir) {
    stopGainNudge();
    nudgeGain(dir);
    gainNudgeInterval = setInterval(() => nudgeGain(dir), 100);
};
window.stopGainNudge = function() {
    if (gainNudgeInterval) clearInterval(gainNudgeInterval);
    gainNudgeInterval = null;
};
function nudgeGain(dir) {
    if (selectedBandIdx === -1) return;
    const ch = activeConfigChannel;
    const b = eqBands[selectedBandIdx];
    if (b.filter.type === 'highpass' || b.filter.type === 'lowpass') return;

    const state = getChannelStateById(ch);
    const chEq = state ? state.eq : null;
    if (!chEq || !chEq[b.key]) return;

    let v = sysexToVal(chEq[b.key].g);
    v += (dir * 1); // 0.1dB por clique
    if (v < -180) v = -180;
    if (v > 180) v = 180;

    chEq[b.key].g = v;
    const newG = v / 10;
    if (b.filter) b.filter.gain.value = newG;

    const labelMap = { 'low': 'Low', 'lowmid': 'LowMid', 'himid': 'HiMid', 'high': 'Hi' };
    const label = labelMap[b.key] || 'Low';
    const prefix = getChannelParamPrefix(ch);
    socket.emit('control', { type: `${prefix}EQ/kEQ${label}G`, channel: ch, value: v });
    
    const fader = document.getElementById('eqFaderInput');
    if (fader) fader.value = v;

    const valEl = document.getElementById('eqFaderVal');
    if (valEl) valEl.innerText = (newG >= 0 ? '+' : '') + newG.toFixed(1);
    
    const info = document.getElementById('eqInfo');
    if (info) {
        const f = b.filter.frequency.value;
        info.innerText = `${label.toUpperCase()}: ${Math.round(f)}Hz | ${newG.toFixed(1)}dB`;
    }
}

window.eqGainInput = function(e) {
    if (!appReady) return;
    if (selectedBandIdx === -1) return;
    const ch = activeConfigChannel;
    const b = eqBands[selectedBandIdx];
    
    // Filtros de corte (HPF/LPF) não têm ganho
    if (b.filter.type === 'highpass' || b.filter.type === 'lowpass') return;

    const rawG = parseInt(e.target.value);
    const newG = rawG / 10;
    
    // Atualiza Áudio Local
    b.filter.gain.value = newG;
    
    // Atualiza Estado Local
    const chState = getChannelStateById(ch);
    if (chState && chState.eq && chState.eq[b.key]) {
        chState.eq[b.key].g = rawG;
    }

    // Envia para mesa
    const prefix = getChannelParamPrefix(ch);
    const labelMap = { 'low': 'Low', 'lowmid': 'LowMid', 'himid': 'HiMid', 'high': 'Hi' };
    const label = labelMap[b.key] || 'Low';
    socket.emit('control', { type: `${prefix}EQ/kEQ${label}G`, channel: ch, value: rawG });
    
    // Atualiza Texto do Valor no Fader
    const valEl = document.getElementById('eqFaderVal');
    if (valEl) valEl.innerText = (newG >= 0 ? '+' : '') + newG.toFixed(1);
    
    // Atualiza a barra de info
    const info = document.getElementById('eqInfo');
    if (info) info.innerText = `${label.toUpperCase()}: ${Math.round(b.filter.frequency.value)}Hz | ${newG.toFixed(1)}dB`;
};

window.eqFreqInput = function(e) {
    if (!appReady) return;
    if (selectedBandIdx === -1) return;
    const ch = activeConfigChannel;
    const b = eqBands[selectedBandIdx];
    
    const rawF = parseInt(e.target.value);
    const newF = rawToFreq(rawF);
    
    // Atualiza Áudio Local
    b.filter.frequency.value = newF;
    
    // Atualiza Estado Local
    const chState = getChannelStateById(ch);
    if (chState && chState.eq && chState.eq[b.key]) {
        chState.eq[b.key].f = rawF;
    }

    // Envia para mesa
    const prefix = getChannelParamPrefix(ch);
    const labelMap = { 'low': 'Low', 'lowmid': 'LowMid', 'himid': 'HiMid', 'high': 'Hi' };
    const label = labelMap[b.key] || 'Low';
    socket.emit('control', { type: `${prefix}EQ/kEQ${label}F`, channel: ch, value: rawF });
    
    // Atualiza a barra de info
    const info = document.getElementById('eqInfo');
    if (info) {
        const g = b.filter.gain.value;
        info.innerText = `${label.toUpperCase()}: ${Math.round(newF)}Hz | ${g.toFixed(1)}dB`;
    }
};

// NUDGE EQ ATT
let attNudgeInterval = null;
window.startATTNudge = function(dir) {
    stopATTNudge();
    nudgeATT(dir);
    attNudgeInterval = setInterval(() => nudgeATT(dir), 100);
};
window.stopATTNudge = function() {
    if (attNudgeInterval) clearInterval(attNudgeInterval);
    attNudgeInterval = null;
};
function nudgeATT(dir) {
    const ch = activeConfigChannel;
    const state = getChannelStateById(ch);
    if (!state) return;

    let v = state.att !== undefined ? state.att : (state.eq && state.eq.att !== undefined ? state.eq.att : 0);
    v = sysexToVal(v) + (dir * 1); // 0.1dB por clique

    if (v < -960) v = -960; // -96.0 dB
    if (v > 120) v = 120; // +12.0 dB

    state.att = v;
    if (state.eq) state.eq.att = v;
    socket.emit('control', { type: 'kInputAttenuator/kAtt', channel: ch, value: v });

    const fader = document.getElementById('eqATTInput');
    if (fader) fader.value = v;

    const valEl = document.getElementById('eqATTVal');
    if (valEl) {
        const db = v / 10;
        valEl.innerText = (db >= 0 ? '+' : '') + db.toFixed(1) + ' dB';
    }
}

window.updateEQFadersUI = function() {
    // 1. Ganho (Fader Vertical)
    const container = document.getElementById('eqGainFaderContainer');
    const fader = document.getElementById('eqFaderInput');
    const valEl = document.getElementById('eqFaderVal');
    const labelEl = document.getElementById('eqFaderLabel');
    
    // 2. Frequência (Fader Horizontal)
    const freqContainer = document.getElementById('eqFreqFaderContainer');
    const freqFader = document.getElementById('eqFreqFaderInput');

    if (!container || !fader || !freqContainer || !freqFader) return;

    if (selectedBandIdx === -1) {
        // Reset Ganho
        container.style.opacity = '0.3';
        container.style.pointerEvents = 'none';
        if (labelEl) labelEl.innerText = 'GAIN';
        if (valEl) valEl.innerText = '+0.0';
        fader.value = 0;

        // Reset Frequência
        freqContainer.style.opacity = '0.3';
        freqContainer.style.pointerEvents = 'none';
        freqFader.value = 72; // 1kHz default
        return;
    }

    const b = eqBands[selectedBandIdx];
    
    // Ganho
    const isFixed = b.filter.type === 'highpass' || b.filter.type === 'lowpass';
    if (isFixed) {
        container.style.opacity = '0.3';
        container.style.pointerEvents = 'none';
        if (valEl) valEl.innerText = '---';
    } else {
        container.style.opacity = '1';
        container.style.pointerEvents = 'auto';
        const g = b.filter.gain.value;
        if (valEl) valEl.innerText = (g >= 0 ? '+' : '') + g.toFixed(1);
        fader.value = Math.round(g * 10);
    }
    
    // Frequência
    freqContainer.style.opacity = '1';
    freqContainer.style.pointerEvents = 'auto';
    const f = b.filter.frequency.value;
    freqFader.value = freqToRaw(f);

    const labels = ['LOW', 'L-MID', 'H-MID', 'HIGH'];
    if (labelEl) labelEl.innerText = labels[selectedBandIdx] || 'GAIN';

    // NOVO: Atualiza a barra de informações inferior imediatamente ao selecionar
    const info = document.getElementById('eqInfo');
    if (info) {
        const labelsLong = ['LOW', 'LOW-MID', 'HI-MID', 'HIGH'];
        const f = b.filter.frequency.value;
        const g = b.filter.type.includes('pass') ? 0 : b.filter.gain.value;
        const label = labelsLong[selectedBandIdx] || 'EQ';
        info.innerText = `${label}: ${Math.round(f)}Hz | ${g.toFixed(1)}dB`;
    }
};

window.toggleATTModal = function(show) {
    const modal = document.getElementById('eqATTModal');
    if (!modal) return;
    modal.style.display = show ? 'flex' : 'none';
    if (show) {
        // Inicializa com o valor atual (puxado do channelStates)
        const ch = activeConfigChannel;
        const state = getChannelStateById(ch) || {};
        const att = (state.att !== undefined) ? state.att : 0;
        
        const input = document.getElementById('eqATTInput');
        const valEl = document.getElementById('eqATTVal');
        if (input && valEl) {
            input.value = att;
            const dbValue = att / 10;
            valEl.innerText = (dbValue > 0 ? '+' : '') + dbValue.toFixed(1) + ' dB';
        }
    }
};

window.updateATTUI = function(value) {
    const input = document.getElementById('eqATTInput');
    const valEl = document.getElementById('eqATTVal');
    if (input && valEl) {
        input.value = value;
        const dbValue = value / 10;
        valEl.innerText = (dbValue > 0 ? '+' : '') + dbValue.toFixed(1) + ' dB';
    }
}

window.eqATTInput = function(e) {
    if (!appReady) return;
    const ch = activeConfigChannel;
    const rawVal = parseInt(e.target.value);
    const dbValue = rawVal / 10;
    
    // Atualiza Texto
    const valEl = document.getElementById('eqATTVal');
    if (valEl) valEl.innerText = (dbValue > 0 ? '+' : '') + dbValue.toFixed(1) + ' dB';
    
    // Atualiza Estado Local
    const state = getChannelStateById(ch);
    if (state) state.att = rawVal;
    
    // Envia para mesa
    socket.emit('control', { type: 'kInputAttenuator/kAtt', channel: ch, value: rawVal });
};

// ==========================================
// RTA LOGIC (Real-Time Analyzer)
// ==========================================
let rtaSource = localStorage.getItem('rtaSource') || 'none'; 
let rtaWasmInst = null;
let rtaAudioContext = null;
let rtaAnalyzer = null;
let rtaIsActive = false;
let rtaAnimId = null;
let rtaLocalStream = null;
let rtaServerData = new Float32Array(256);
let rtaPauseTimeout = null;

window.updateRtaBtnUI = function(isActive) {
    const btn = document.getElementById('headerBtnRTA');
    if (btn) {
        if (isActive) {
            btn.classList.remove('on-active'); // Remove para nao puxar bordas amarelas padrão do EQ
            btn.style.background = '#28a745';
        } else {
            btn.classList.remove('on-active');
            btn.style.background = '#444';
        }
    }
};

window.selectRTASource = async function(source, deviceId = 'default_in', fftSize = 4096, smoothing = 90) {
    localStorage.setItem('rtaSource', source);
    localStorage.setItem('rtaSmoothing', smoothing);
    window.rtaSmoothingFactor = Math.min(0.99, Math.max(0, smoothing / 100));
    
    rtaSource = source;
    const modal = document.getElementById('rtaModal');
    if(modal) modal.style.display = 'none';

    // Stop current stream if changing
    if (rtaLocalStream) {
        rtaLocalStream.getTracks().forEach(t => t.stop());
        rtaLocalStream = null;
    }
    if (rtaAudioContext) {
        rtaAudioContext.close();
        rtaAudioContext = null;
    }
    
    if (source === 'local') {
        try {
            const constraints = { audio: true, video: false };
            if (deviceId && deviceId !== 'default' && deviceId !== 'default_in' && deviceId !== '') {
                constraints.audio = { deviceId: { exact: deviceId } };
            }
            rtaLocalStream = await navigator.mediaDevices.getUserMedia(constraints);
            window.rtaCtxLocal = new window.AudioContext();
            let audioInput = window.rtaCtxLocal.createMediaStreamSource(rtaLocalStream);
            rtaAnalyzer = window.rtaCtxLocal.createAnalyser();
            rtaAnalyzer.fftSize = fftSize;
            rtaAnalyzer.minDecibels = -140;
            rtaAnalyzer.maxDecibels = 0;
            rtaAnalyzer.smoothingTimeConstant = 0;
            audioInput.connect(rtaAnalyzer);
            rtaIsActive = true;
            window.updateRtaBtnUI(true);
            startRtaLoop();
        } catch(e) {
            console.error("Microphone access denied:", e);
            alert("Permissão de microfone negada ou erro ao iniciar.");
            window.disableRTA();
            return;
        }
    } else if (source === 'server') {
        let deviceName = null;
        let isOutput = false;
        if (deviceId && !deviceId.startsWith('default')) {
            if (deviceId.startsWith('out:')) {
                isOutput = true;
                deviceName = deviceId.substring(4);
            } else if (deviceId.startsWith('in:')) {
                isOutput = false;
                deviceName = deviceId.substring(3);
            }
        }
        
        socket.emit('rtaControl', { 
            action: 'start_server_mic',
            deviceName: deviceName,
            isOutput: isOutput,
            fftSize: fftSize
        });
        rtaIsActive = true;
        window.updateRtaBtnUI(true);
        startRtaLoop();
    } else if (source === 'simulated') {
        // Apenas seta rtaSource, o startRtaLoop cuidará do fake audio
    }
    
    rtaIsActive = true;
    window.updateRtaBtnUI(true);
    startRtaLoop();
};

window.disableRTA = function() {
    localStorage.setItem('rtaSource', 'none');
    rtaSource = 'none';
    rtaIsActive = false;
    
    if (rtaAnimId) {
        cancelAnimationFrame(rtaAnimId);
        rtaAnimId = null;
    }
    if (rtaPauseTimeout) clearTimeout(rtaPauseTimeout);

    const modal = document.getElementById('rtaModal');
    if(modal) modal.style.display = 'none';
    
    if (rtaLocalStream) {
        rtaLocalStream.getTracks().forEach(t => t.stop());
        rtaLocalStream = null;
    }
    if (rtaAudioContext) {
        rtaAudioContext.close();
        rtaAudioContext = null;
    }
    socket.emit('rtaControl', { action: 'stop_server_mic' });
    if(window.rtaCtx) {
        const w = window.rtaCtx.canvas.width;
        const h = window.rtaCtx.canvas.height;
        window.rtaCtx.clearRect(0, 0, w, h);
    }
    window.updateRtaBtnUI(false);
};

window.pauseRTA = function() {
    if (rtaAnimId) {
        cancelAnimationFrame(rtaAnimId);
        rtaAnimId = null;
    }
    rtaIsActive = false;
    
    // Pausa Inteligente: só desliga o microfone real e o servidor depois de 5s
    if (rtaPauseTimeout) clearTimeout(rtaPauseTimeout);
    rtaPauseTimeout = setTimeout(() => {
        if (!rtaIsActive) {
            socket.emit('rtaControl', { action: 'stop_server_mic' });
            if (rtaLocalStream) {
                rtaLocalStream.getTracks().forEach(t => t.stop());
                rtaLocalStream = null;
            }
            if (window.rtaCtx) {
                window.rtaCtx.clearRect(0, 0, window.rtaCtx.canvas.width, window.rtaCtx.canvas.height);
            }
            window.updateRtaBtnUI(false);
        }
    }, 5000);
};

window.resumeRTA = function() {
    const savedSource = localStorage.getItem('rtaSource');
    if (savedSource && savedSource !== 'none') {
        const savedDevice = localStorage.getItem('rtaDeviceId') || 'default_in';
        const savedFft = parseInt(localStorage.getItem('rtaFftSize')) || 4096;
        const savedSmoothing = parseInt(localStorage.getItem('rtaSmoothing')) || 90;
        window.selectRTASource(savedSource, savedDevice, savedFft, savedSmoothing);
    }
};

function startRtaLoop() {
    const run = () => {
        if (!rtaIsActive || !window.rtaCtx) return;
        
        let magnitudes = null;
        if (rtaSource === 'local' && rtaAnalyzer) {
            let dataArray = new Float32Array(rtaAnalyzer.frequencyBinCount);
            rtaAnalyzer.getFloatFrequencyData(dataArray);
            magnitudes = new Float32Array(dataArray.length);
            for(let i=0; i<dataArray.length; i++) {
                magnitudes[i] = dataArray.length * Math.pow(10, dataArray[i] / 20);
            }
            window.rtaPacketCount = (window.rtaPacketCount || 0) + 1;
        } else if (rtaSource === 'server') {
            magnitudes = rtaServerData;
        } else if (rtaSource === 'simulated') {
            const time = performance.now() / 1000;
            const len = 2048; 
            magnitudes = new Float32Array(len);
            for(let i=0; i<len; i++) {
                let f = (i / len) * 24000;
                let mag = 0.001;
                if (f > 50 && f < 70) mag += 0.1;
                let sweepF = 1000 + Math.sin(time)*500;
                if (Math.abs(f - sweepF) < 50) mag += 0.05;
                magnitudes[i] = mag * len;
            }
            window.rtaPacketCount = (window.rtaPacketCount || 0) + 1;
        }

        drawRtaData(magnitudes);
        requestAnimationFrame(run);
    };
    run();
}

function drawRtaData(mags) {
    if (!window.rtaCtx) return;
    const canvas = window.rtaCtx.canvas;
    const w = canvas.width / (window.devicePixelRatio || 1);
    const h = canvas.height / (window.devicePixelRatio || 1);
    const ctx = window.rtaCtx;
    
    ctx.clearRect(0, 0, w, h);
    if (!mags || mags.length === 0) return;

    ctx.beginPath();
    ctx.moveTo(0, h);
    
    const len = mags.length; 
    
    // Resolve o Nyquist dinamicamente dependendo da fonte (Server usa o que veio do Rust, Local usa o WebAudio, Simulado usa 48000)
    let sRate = 48000;
    if (rtaSource === 'server' && window.rtaServerSampleRate) sRate = window.rtaServerSampleRate;
    if (rtaSource === 'local' && window.rtaCtxLocal) sRate = window.rtaCtxLocal.sampleRate;
    const nyquist = sRate / 2.0; 
    
    let maxDb = -200;
    
    // Falloff array (Smoothing Temporal)
    if (!window.rtaSmoothMags || window.rtaSmoothMags.length !== len) {
        window.rtaSmoothMags = new Float32Array(len);
    }
    
    // Ler o fator de suavização customizado pelo usuário ou fallback para 0.90
    const smoothFactor = window.rtaSmoothingFactor !== undefined ? window.rtaSmoothingFactor : 0.90;

    let buckets = [];
    let currentX = -1;
    let maxDbInBucket = -140;

    for(let i=0; i<len; i++) {
        let f = (i / len) * nyquist;
        if (f < EQ_MIN_FREQ) continue;
        if (f > EQ_MAX_FREQ) break;
        
        let x = Math.round(fToX(f, w));
        let rawMag = mags[i] / len;
        
        // Aplicando a Suavização no tempo (Smoothing)
        window.rtaSmoothMags[i] = window.rtaSmoothMags[i] * smoothFactor + rawMag * (1.0 - smoothFactor);
        
        let db = window.rtaSmoothMags[i] > 0.0000001 ? 20 * Math.log10(window.rtaSmoothMags[i]) : -140;
        
        // Compensação TILT de 3dB/Octave (Padrão de VSTs como FabFilter)
        let tilt_db = Math.log2(f / 1000.0) * 3.0; 
        db += tilt_db;

        if (db > maxDb) maxDb = db;
        
        if (x !== currentX) {
            if (currentX !== -1) {
                buckets.push({ x: currentX, db: maxDbInBucket });
            }
            currentX = x;
            maxDbInBucket = db;
        } else {
            if (db > maxDbInBucket) maxDbInBucket = db;
        }
    }
    if (currentX !== -1) buckets.push({ x: currentX, db: maxDbInBucket });

    if (buckets.length > 0) {
        // Suavização Espacial (Frequência) usando Média Móvel
        const spaceSmoothWindow = 3; // Janela de pixels
        let smoothedBuckets = [];
        for (let b = 0; b < buckets.length; b++) {
            let sumDb = 0;
            let count = 0;
            for (let j = Math.max(0, b - spaceSmoothWindow); j <= Math.min(buckets.length - 1, b + spaceSmoothWindow); j++) {
                sumDb += buckets[j].db;
                count++;
            }
            smoothedBuckets.push({ x: buckets[b].x, db: sumDb / count });
        }

        let firstY = h - ((smoothedBuckets[0].db + 90) / 90) * h;
        if (firstY < 0) firstY = 0; if (firstY > h) firstY = h;
        ctx.lineTo(smoothedBuckets[0].x, firstY);

        for (let i = 1; i < smoothedBuckets.length - 1; i++) {
            let b0 = smoothedBuckets[i];
            let b1 = smoothedBuckets[i + 1];
            
            let y0 = h - ((b0.db + 90) / 90) * h;
            if (y0 < 0) y0 = 0; if (y0 > h) y0 = h;
            
            let y1 = h - ((b1.db + 90) / 90) * h;
            if (y1 < 0) y1 = 0; if (y1 > h) y1 = h;

            let xc = (b0.x + b1.x) / 2;
            let yc = (y0 + y1) / 2;
            
            ctx.quadraticCurveTo(b0.x, y0, xc, yc);
        }

        let lastB = smoothedBuckets[smoothedBuckets.length - 1];
        let lastY = h - ((lastB.db + 90) / 90) * h;
        if (lastY < 0) lastY = 0; if (lastY > h) lastY = h;
        ctx.lineTo(lastB.x, lastY);
    }
    
    ctx.lineTo(w, h);
    ctx.fillStyle = 'rgba(200, 200, 200, 0.2)'; 
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.stroke();

    // Textos de debug renderizados por cima pra entendermos os dados
    ctx.fillStyle = '#fff';
    ctx.font = '10px monospace';
    ctx.textAlign = 'left';
    ctx.fillText('FONTE: ' + rtaSource, 10, 20);
    ctx.fillText('MAX SINAL: ' + maxDb.toFixed(1) + ' dB', 10, 35);
    ctx.fillText('PACOTES: ' + (window.rtaPacketCount || 0), 10, 50);
}

// Escuta os dados vindo do servidor assim que o JS carregar
try {
    socket.on('rtaConfig', (config) => {
        if (config && config.sampleRate) {
            window.rtaServerSampleRate = config.sampleRate;
            console.log("[RTA] Sincronizado Sample Rate do Servidor:", window.rtaServerSampleRate);
        }
    });

    socket.on('rtaData', (data) => {
        window.rtaPacketCount = (window.rtaPacketCount || 0) + 1;
        if (rtaIsActive && rtaSource === 'server') {
            rtaServerData = new Float32Array(data);
        }
    });

    socket.on('rtaControl', (msg) => {
        if(msg.status === 'stopped' && rtaSource === 'server') {
            rtaIsActive = false;
            window.updateRtaBtnUI(false);
        }
    });

    socket.on('rtaDevicesList', (data) => {
        const select = document.getElementById('rtaServerDevice');
        if (select) {
            select.innerHTML = '<option value="default_in">Dispositivo Padrão do Windows</option>';
            if (data.inputs && data.inputs.length > 0) {
                const optgroup = document.createElement('optgroup');
                optgroup.label = 'Entradas (Microfones)';
                data.inputs.forEach(d => {
                    const opt = document.createElement('option');
                    opt.value = 'in:' + d;
                    opt.innerText = d;
                    optgroup.appendChild(opt);
                });
                select.appendChild(optgroup);
            }
            if (data.outputs && data.outputs.length > 0) {
                const optgroup = document.createElement('optgroup');
                optgroup.label = 'Saídas (Loopback / Caixas)';
                data.outputs.forEach(d => {
                    const opt = document.createElement('option');
                    opt.value = 'out:' + d;
                    opt.innerText = d;
                    optgroup.appendChild(opt);
                });
                select.appendChild(optgroup);
            }
        }
    });

} catch(e) {
    console.error("Falha ao adicionar rtaData event listener:", e);
}
