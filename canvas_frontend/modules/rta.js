// ==========================================
// RTA LOGIC (Real-Time Analyzer)
// ==========================================
window.rtaSource = localStorage.getItem('rtaSource') || 'none'; 
let rtaAudioContext = null;
let rtaAnalyzer = null;
let rtaIsActive = false;
let rtaAnimId = null;
let rtaLocalStream = null;
let rtaServerData = new Float32Array(256);
let rtaPauseTimeout = null;
let pendingRtaSource = null;

// RTA configuration from server (populated via portsList/rtaConfigUpdated events)
const savedShowStatus = localStorage.getItem('rtaShowStatus');
window.rtaConfig = {
    decayRate: 0.10,
    peakHoldTime: 8,
    smoothing: 90,
    fftSize: 4096,
    showStatus: savedShowStatus !== null ? (savedShowStatus === 'true') : true
};

window.updateRtaInputsUI = function() {
    const elDecay = document.getElementById('rtaDecayRate');
    if (elDecay) elDecay.value = Math.round(window.rtaConfig.decayRate * 100.0);
    
    const elPeak = document.getElementById('rtaPeakHoldTime');
    if (elPeak) elPeak.value = window.rtaConfig.peakHoldTime;
    
    const elSmoothing = document.getElementById('rtaSmoothing');
    if (elSmoothing) elSmoothing.value = window.rtaConfig.smoothing;
    
    const elFft = document.getElementById('rtaFftSize');
    if (elFft) elFft.value = window.rtaConfig.fftSize;

    const elShowStatus = document.getElementById('rtaShowStatus');
    if (elShowStatus) elShowStatus.checked = window.rtaConfig.showStatus;
};

window.updateRtaBtnUI = function(isActive) {
    const btn = document.getElementById('headerBtnRTA');
    if (btn) {
        if (isActive) {
            btn.classList.remove('on-active'); 
            btn.style.background = '#28a745';
        } else {
            btn.classList.remove('on-active');
            btn.style.background = '#444';
        }
    }
};

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
            
            const savedDevice = localStorage.getItem('rtaDeviceId_local') || localStorage.getItem('rtaDeviceId');
            if (savedDevice && Array.from(select.options).some(o => o.value === savedDevice)) {
                select.value = savedDevice;
            }
        } catch (err) {
            console.error(err);
            select.innerHTML = '<option value="default_in">Microfone Padrão</option>';
        }
    }
};

window.connectRTA = function() {
    const fftSize = parseInt(document.getElementById('rtaFftSize').value) || 4096;
    let smoothing = parseInt(document.getElementById('rtaSmoothing').value) || 90;
    let peakHoldTime = parseInt(document.getElementById('rtaPeakHoldTime').value) || 7;
    let decayRateUI = parseFloat(document.getElementById('rtaDecayRate').value) || 9;
    let decayRate = decayRateUI / 100.0;
    
    const selectEl = document.getElementById('rtaServerDevice');
    const deviceId = selectEl.value;
    const deviceLabel = selectEl.options.length > 0 && selectEl.selectedIndex >= 0 ? selectEl.options[selectEl.selectedIndex].text : deviceId;
    
    if (smoothing > 99) smoothing = 99;
    if (smoothing < 1) smoothing = 1;

    window.rtaConfig.fftSize = fftSize;
    window.rtaConfig.smoothing = smoothing;
    window.rtaConfig.peakHoldTime = peakHoldTime;
    window.rtaConfig.decayRate = decayRate;

    window.updateRtaInputsUI();

    localStorage.setItem('rtaDeviceId', deviceId);
    if (pendingRtaSource === 'server') {
        localStorage.setItem('rtaDeviceId_server', deviceId);
    } else if (pendingRtaSource === 'local') {
        localStorage.setItem('rtaDeviceId_local', deviceId);
    }

    if (typeof socket !== 'undefined' && socket.connected) {
        socket.emit('updateRtaConfig', {
            rta_decay_rate: decayRate,
            rta_peak_hold_time: peakHoldTime,
            rta_smoothing: smoothing,
            rta_fft_size: fftSize
        });
    }
    
    window.selectRTASource(pendingRtaSource, deviceId, fftSize, smoothing, peakHoldTime, deviceLabel);
};

window.applyRTASettings = function() {
    const fftSize = parseInt(document.getElementById('rtaFftSize').value) || 4096;
    let smoothing = parseInt(document.getElementById('rtaSmoothing').value) || 90;
    let peakHoldTime = parseInt(document.getElementById('rtaPeakHoldTime').value) || 7;
    let decayRateUI = parseFloat(document.getElementById('rtaDecayRate').value) || 9;
    let decayRate = decayRateUI / 100.0;
    const showStatus = document.getElementById('rtaShowStatus') ? document.getElementById('rtaShowStatus').checked : true;
    
    if (smoothing > 99) smoothing = 99;
    if (smoothing < 1) smoothing = 1;

    window.rtaConfig.fftSize = fftSize;
    window.rtaConfig.smoothing = smoothing;
    window.rtaConfig.peakHoldTime = peakHoldTime;
    window.rtaConfig.decayRate = decayRate;
    window.rtaConfig.showStatus = showStatus;

    window.updateRtaInputsUI();

    window.rtaSmoothingFactor = Math.min(0.99, Math.max(0, smoothing / 100));
    window.rtaPeakHoldTimeMs = peakHoldTime * 1000;
    window.rtaDecayRate = decayRate;
    window.rtaShowStatus = showStatus;

    localStorage.setItem('rtaShowStatus', showStatus);

    if (typeof socket !== 'undefined' && socket.connected) {
        socket.emit('updateRtaConfig', {
            rta_decay_rate: decayRate,
            rta_peak_hold_time: peakHoldTime,
            rta_smoothing: smoothing,
            rta_fft_size: fftSize
        });
    }
    
    window.restartRtaIfActive(fftSize, smoothing, peakHoldTime);
};

window.restartRtaIfActive = function(fftSize, smoothing, peakHoldTime) {
    if (rtaIsActive && window.rtaSource && window.rtaSource !== 'none') {
        const deviceId = localStorage.getItem('rtaDeviceId') || 'default_in';
        window.selectRTASource(window.rtaSource, deviceId, fftSize, smoothing, peakHoldTime);
    }
};

window.toggleRTAModal = function() {
    const modal = document.getElementById('rtaModal');
    if(modal) {
        window.updateRtaInputsUI();
        modal.style.display = 'flex';
        window.showRtaStep1();
    }
};

window.selectRTASource = async function(source, deviceId = 'default_in', fftSize = null, smoothing = null, peakHoldTime = null, deviceLabel = null) {
    if (rtaAnimId) {
        cancelAnimationFrame(rtaAnimId);
        rtaAnimId = null;
    }
    window.rtaCurrentLoopToken = null; // Invalida qualquer loop ativo concorrente

    localStorage.setItem('rtaSource', source);
    if (deviceId) {
        localStorage.setItem('rtaDeviceId', deviceId);
        if (source === 'server') {
            localStorage.setItem('rtaDeviceId_server', deviceId);
        } else if (source === 'local') {
            localStorage.setItem('rtaDeviceId_local', deviceId);
        }
    }
    
    if (deviceLabel) {
        localStorage.setItem('rtaDeviceLabel', deviceLabel);
        window.rtaDeviceName = deviceLabel;
    } else {
        const savedLabel = localStorage.getItem('rtaDeviceLabel');
        if (savedLabel && deviceId === localStorage.getItem('rtaDeviceId')) {
            window.rtaDeviceName = savedLabel;
        } else {
            window.rtaDeviceName = deviceId;
        }
    }

    const finalFftSize = fftSize !== null ? fftSize : window.rtaConfig.fftSize;
    const finalSmoothing = smoothing !== null ? smoothing : window.rtaConfig.smoothing;
    const finalPeakHoldTime = peakHoldTime !== null ? peakHoldTime : window.rtaConfig.peakHoldTime;

    window.rtaSmoothingFactor = Math.min(0.99, Math.max(0, finalSmoothing / 100));
    window.rtaPeakHoldTimeMs = finalPeakHoldTime * 1000;
    
    window.rtaDecayRate = window.rtaConfig.decayRate;
    window.rtaShowStatus = window.rtaConfig.showStatus;
    
    window.rtaSource = source;
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
    
    if (source === 'local') {
        try {
            const constraints = { audio: true, video: false };
            if (deviceId && deviceId !== 'default' && deviceId !== 'default_in' && deviceId !== '') {
                constraints.audio = { deviceId: { exact: deviceId } };
            }
            rtaLocalStream = await navigator.mediaDevices.getUserMedia(constraints);
            window.rtaCtxLocal = new (window.AudioContext || window.webkitAudioContext)();
            let audioInput = window.rtaCtxLocal.createMediaStreamSource(rtaLocalStream);
            rtaAnalyzer = window.rtaCtxLocal.createAnalyser();
            rtaAnalyzer.fftSize = finalFftSize;
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
            fftSize: finalFftSize
        });
        rtaIsActive = true;
        window.updateRtaBtnUI(true);
        startRtaLoop();
    } else if (source === 'simulated') {
        // Apenas seta window.rtaSource, o startRtaLoop cuidará do fake audio
    }
    
    rtaIsActive = true;
    window.updateRtaBtnUI(true);
    if (source === 'simulated') {
        startRtaLoop();
    }
};

window.disableRTA = function() {
    localStorage.setItem('rtaSource', 'none');
    window.rtaSource = 'none';
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
        let savedDevice = localStorage.getItem('rtaDeviceId') || 'default_in';
        if (savedSource === 'server' && localStorage.getItem('rtaDeviceId_server')) {
            savedDevice = localStorage.getItem('rtaDeviceId_server');
        } else if (savedSource === 'local' && localStorage.getItem('rtaDeviceId_local')) {
            savedDevice = localStorage.getItem('rtaDeviceId_local');
        }
        window.selectRTASource(savedSource, savedDevice, window.rtaConfig.fftSize, window.rtaConfig.smoothing, window.rtaConfig.peakHoldTime);
    }
};

function startRtaLoop() {
    if (rtaAnimId) {
        cancelAnimationFrame(rtaAnimId);
        rtaAnimId = null;
    }
    
    // Gera um token único para este loop de renderização específico
    const currentLoopToken = Math.random();
    window.rtaCurrentLoopToken = currentLoopToken;

    console.log("[RTA LOOP START] Iniciando loop do RTA (Token: " + currentLoopToken + "). Valores ativos na memória (window):", {
        rtaSource: window.rtaSource,
        rtaSmoothingFactor: window.rtaSmoothingFactor,
        rtaPeakHoldTimeMs: window.rtaPeakHoldTimeMs,
        rtaDecayRate: window.rtaDecayRate,
        rtaShowStatus: window.rtaShowStatus,
        rtaConfig: window.rtaConfig ? { ...window.rtaConfig } : null
    });

    const run = () => {
        // Se o token em memória mudou, encerra este loop concorrente imediatamente
        if (window.rtaCurrentLoopToken !== currentLoopToken) {
            console.log("[RTA LOOP STOP] Detectado loop concorrente ou antigo com token diferente (" + currentLoopToken + " vs ativo: " + window.rtaCurrentLoopToken + "). Finalizando este thread de animação.");
            return;
        }

        if (!rtaIsActive || !window.rtaCtx) return;
        
        let magnitudes = null;
        if (window.rtaSource === 'local' && rtaAnalyzer) {
            let dataArray = new Float32Array(rtaAnalyzer.frequencyBinCount);
            rtaAnalyzer.getFloatFrequencyData(dataArray);
            magnitudes = new Float32Array(dataArray.length);
            for(let i=0; i<dataArray.length; i++) {
                magnitudes[i] = dataArray.length * Math.pow(10, dataArray[i] / 20);
            }
            window.rtaPacketCount = (window.rtaPacketCount || 0) + 1;
        } else if (window.rtaSource === 'server') {
            magnitudes = rtaServerData;
        } else if (window.rtaSource === 'simulated') {
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
        rtaAnimId = requestAnimationFrame(run);
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
    
    let sRate = 48000;
    if (window.rtaSource === 'server' && window.rtaServerSampleRate) sRate = window.rtaServerSampleRate;
    if (window.rtaSource === 'local' && window.rtaCtxLocal) sRate = window.rtaCtxLocal.sampleRate;
    const nyquist = sRate / 2.0; 
    
    let maxDb = -200;
    
    if (!window.rtaSmoothMags || window.rtaSmoothMags.length !== len) {
        window.rtaSmoothMags = new Float32Array(len);
        window.rtaPeakMags = new Float32Array(len);
        window.rtaPeakMags.fill(-140);
        window.rtaPeakHold = new Float64Array(len);
    }
    
    const smoothFactor = window.rtaSmoothingFactor !== undefined ? window.rtaSmoothingFactor : 0.90;
    const now = performance.now();

    if (!window.lastRtaLogTime || now - window.lastRtaLogTime > 3000) {
        window.lastRtaLogTime = now;
        console.log("[RTA ACTIVE VALUES] Valores ativos em memória sendo usados pelo desenho do RTA:", {
            rtaSource: window.rtaSource,
            rtaSmoothingFactor: window.rtaSmoothingFactor,
            rtaPeakHoldTimeMs: window.rtaPeakHoldTimeMs,
            rtaDecayRate: window.rtaDecayRate,
            rtaShowStatus: window.rtaShowStatus,
            smoothFactorCalculated: smoothFactor,
            decayRateCalculated: window.rtaDecayRate !== undefined ? window.rtaDecayRate : 0.09,
            peakHoldTimeMsCalculated: window.rtaPeakHoldTimeMs !== undefined ? window.rtaPeakHoldTimeMs : 5000,
            rtaConfig: window.rtaConfig ? { ...window.rtaConfig } : null
        });
    }

    let buckets = [];
    let currentX = -1;
    let maxDbInBucket = -140;

    for(let i=0; i<len; i++) {
        let f = (i / len) * nyquist;
        // EQ_MIN_FREQ e EQ_MAX_FREQ devem estar acessíveis de eq.js
        if (typeof EQ_MIN_FREQ !== 'undefined' && f < EQ_MIN_FREQ) continue;
        if (typeof EQ_MAX_FREQ !== 'undefined' && f > EQ_MAX_FREQ) break;
        
        let x = 0;
        if (typeof fToX !== 'undefined') {
            x = Math.round(fToX(f, w));
        }
        
        let rawMag = mags[i] / len;
        let rawDb = rawMag > 0.0000001 ? 20 * Math.log10(rawMag) : -140;
        let tilt_db = Math.log2(f / 1000.0) * 3.0; 
        rawDb += tilt_db;

        if (!window.rtaSmoothDb || window.rtaSmoothDb.length !== len) {
            window.rtaSmoothDb = new Float32Array(len).fill(-140);
        }

        if (rawDb > window.rtaSmoothDb[i]) {
            // Ataque: pode ser instantâneo ou suavizado com base no smoothFactor se quiser
            window.rtaSmoothDb[i] = window.rtaSmoothDb[i] * smoothFactor + rawDb * (1.0 - smoothFactor);
        } else {
            // Decaimento: linear (em dB por frame)
            let decay = window.rtaDecayRate !== undefined ? window.rtaDecayRate : 0.09;
            window.rtaSmoothDb[i] -= decay;
            if (window.rtaSmoothDb[i] < rawDb) window.rtaSmoothDb[i] = rawDb;
        }

        let db = window.rtaSmoothDb[i];

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
        const spaceSmoothWindow = 3;
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

        if (!window.rtaScreenPeaks || window.rtaScreenPeaks.length !== smoothedBuckets.length) {
            window.rtaScreenPeaks = new Float32Array(smoothedBuckets.length).fill(-140);
            window.rtaScreenHold = new Float64Array(smoothedBuckets.length).fill(0);
        }

        let holdTimeMs = window.rtaPeakHoldTimeMs !== undefined ? window.rtaPeakHoldTimeMs : 5000;
        let peakDecay = window.rtaDecayRate !== undefined ? window.rtaDecayRate : 0.09;
        
        for (let b = 0; b < smoothedBuckets.length; b++) {
            let sdb = smoothedBuckets[b].db;
            if (sdb >= window.rtaScreenPeaks[b]) {
                window.rtaScreenPeaks[b] = sdb;
                window.rtaScreenHold[b] = now + holdTimeMs;
            } else {
                if (now >= window.rtaScreenHold[b]) {
                    window.rtaScreenPeaks[b] -= peakDecay;
                    if (window.rtaScreenPeaks[b] < sdb) window.rtaScreenPeaks[b] = sdb;
                }
            }
            smoothedBuckets[b].peak_db = window.rtaScreenPeaks[b];
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
        
        ctx.lineTo(w, h);
        ctx.fillStyle = 'rgba(200, 200, 200, 0.2)'; 
        ctx.fill();
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
        ctx.stroke();

        // Path do Peak Hold
        ctx.beginPath();
        let firstPeakY = h - ((smoothedBuckets[0].peak_db + 90) / 90) * h;
        if (firstPeakY < 0) firstPeakY = 0; if (firstPeakY > h) firstPeakY = h;
        ctx.moveTo(smoothedBuckets[0].x, firstPeakY);

        for (let i = 1; i < smoothedBuckets.length - 1; i++) {
            let b0 = smoothedBuckets[i];
            let b1 = smoothedBuckets[i + 1];
            
            let y0 = h - ((b0.peak_db + 90) / 90) * h;
            if (y0 < 0) y0 = 0; if (y0 > h) y0 = h;
            
            let y1 = h - ((b1.peak_db + 90) / 90) * h;
            if (y1 < 0) y1 = 0; if (y1 > h) y1 = h;

            let xc = (b0.x + b1.x) / 2;
            let yc = (y0 + y1) / 2;
            
            ctx.quadraticCurveTo(b0.x, y0, xc, yc);
        }

        let lastPeakY = h - ((lastB.peak_db + 90) / 90) * h;
        if (lastPeakY < 0) lastPeakY = 0; if (lastPeakY > h) lastPeakY = h;
        ctx.lineTo(lastB.x, lastPeakY);

        ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)'; // Linha mais nítida
        ctx.stroke();
    } else {
        ctx.lineTo(w, h);
        ctx.fillStyle = 'rgba(200, 200, 200, 0.2)'; 
        ctx.fill();
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
        ctx.stroke();
    }

    if (window.rtaShowStatus !== false) {
        ctx.fillStyle = '#fff';
        ctx.font = '10px monospace';
        ctx.textAlign = 'left';
        
        let sourceText = window.rtaSource;
        if (window.rtaDeviceName) {
            let devName = window.rtaDeviceName;
            if (devName === 'default_in' || devName === 'default') devName = 'Padrão';
            sourceText += ' / ' + devName;
        }
        
        ctx.fillText('FONTE: ' + sourceText.toUpperCase(), 10, 20);
        ctx.fillText('MAX SINAL: ' + maxDb.toFixed(1) + ' dB', 10, 35);
        ctx.fillText('PACOTES: ' + (window.rtaPacketCount || 0), 10, 50);
    }
}

try {
    socket.on('rtaConfig', (config) => {
        if (config && config.sampleRate) {
            window.rtaServerSampleRate = config.sampleRate;
            console.log("[RTA] Sincronizado Sample Rate do Servidor:", window.rtaServerSampleRate);
        }
    });

    socket.on('rtaData', (data) => {
        window.rtaPacketCount = (window.rtaPacketCount || 0) + 1;
        if (rtaIsActive && window.rtaSource === 'server') {
            rtaServerData = new Float32Array(data);
        }
    });

    socket.on('rtaControl', (msg) => {
        if(msg.status === 'stopped' && window.rtaSource === 'server') {
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
            
            const savedDevice = localStorage.getItem('rtaDeviceId_server') || localStorage.getItem('rtaDeviceId');
            if (savedDevice && Array.from(select.options).some(o => o.value === savedDevice)) {
                select.value = savedDevice;
            }
        }
    });

} catch(e) {
    console.error("Falha ao adicionar rtaData event listener:", e);
}
