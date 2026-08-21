// ==========================================
// MONITORING DE ÁUDIO (Ouvir Áudio)
// ==========================================
let monitoringActive = false;
let monitoringFormat = localStorage.getItem('monitoringFormat') || 'pcm';
let monitoringBufferSize = parseInt(localStorage.getItem('monitoringBufferSize')) || 960;
let monitoringAudioCtx = null;
let monitoringHeartbeatInterval = null;
let monitoringDeviceName = null;
let monitoringNextStartTime = 0;
let monitoringOpusDecoder = null;

window.toggleOpusBufferOptions = function() {
    const opts = document.getElementById('monitoringBufferOpusOptions');
    if (opts) opts.style.display = opts.style.display === 'flex' ? 'none' : 'flex';
};

window.selectOpusBuffer = function(size) {
    monitoringBufferSize = size;
    localStorage.setItem('monitoringBufferSize', size);
    const btn = document.getElementById('monitoringBufferOpusBtn');
    if (btn) btn.innerText = 'BUFFER: ' + size;
    const opts = document.getElementById('monitoringBufferOpusOptions');
    if (opts) opts.style.display = 'none';
    if (monitoringActive) {
        socket.emit('rtaAudioControl', {
            action: 'reconfigure',
            format: monitoringFormat,
            bufferSize: size
        });
    }
};

window.selectMonitoringFormat = function(fmt) {
    monitoringFormat = fmt;
    localStorage.setItem('monitoringFormat', fmt);
    const btnPcm = document.getElementById('monitoringFmtPcm');
    const btnOpus = document.getElementById('monitoringFmtOpus');
    if (btnPcm) {
        btnPcm.style.background = fmt === 'pcm' ? '#007bff' : '#444';
        btnPcm.style.color = fmt === 'pcm' ? '#fff' : '#aaa';
    }
    if (btnOpus) {
        btnOpus.style.background = fmt === 'opus' ? '#007bff' : '#444';
        btnOpus.style.color = fmt === 'opus' ? '#fff' : '#aaa';
    }
    const pcmDiv = document.getElementById('monitoringBufferPcm');
    const opusDiv = document.getElementById('monitoringBufferOpus');
    if (pcmDiv) pcmDiv.style.display = fmt === 'pcm' ? 'flex' : 'none';
    if (opusDiv) opusDiv.style.display = fmt === 'opus' ? 'flex' : 'none';
};

window.refreshMonitoringDevices = function() {
    socket.emit('requestRtaDevices');
};

socket.on('rtaDevicesList', (data) => {
    const select = document.getElementById('monitoringServerDevice');
    if (!select) return;
    select.innerHTML = '<option value="default_in">Dispositivo Padrão</option>';
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
    const saved = localStorage.getItem('monitoringDevice');
    if (saved && Array.from(select.options).some(o => o.value === saved)) {
        select.value = saved;
    }
});

function startMonitoringAudio() {
    if (monitoringAudioCtx) {
        monitoringAudioCtx.close();
        monitoringAudioCtx = null;
    }
    monitoringAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
    monitoringNextStartTime = 0;

    let deviceId = document.getElementById('monitoringServerDevice').value;
    localStorage.setItem('monitoringDevice', deviceId);

    let deviceName = null;
    if (deviceId && !deviceId.startsWith('default')) {
        if (deviceId.startsWith('in:')) {
            deviceName = deviceId.substring(3);
        }
    }

    monitoringDeviceName = deviceName;
    const bufEl = monitoringFormat === 'opus'
        ? document.getElementById('monitoringBufferOpusBtn')
        : document.getElementById('monitoringBufferSize');
    monitoringBufferSize = parseInt(bufEl ? (monitoringFormat === 'opus' ? bufEl.innerText.replace('BUFFER: ', '') : bufEl.value) : 960) || 960;
    localStorage.setItem('monitoringBufferSize', monitoringBufferSize);

    socket.emit('rtaAudioControl', {
        action: 'start',
        deviceName: deviceName,
        format: monitoringFormat,
        bufferSize: monitoringBufferSize
    });

    monitoringHeartbeatInterval = setInterval(() => {
        socket.emit('rtaAudioHeartbeat');
    }, 2000);
}

function stopMonitoringAudio() {
    if (monitoringHeartbeatInterval) {
        clearInterval(monitoringHeartbeatInterval);
        monitoringHeartbeatInterval = null;
    }
    socket.emit('rtaAudioControl', { action: 'stop' });
    if (monitoringOpusDecoder) {
        monitoringOpusDecoder.close();
        monitoringOpusDecoder = null;
    }
    if (monitoringAudioCtx) {
        monitoringAudioCtx.close();
        monitoringAudioCtx = null;
    }
    monitoringNextStartTime = 0;
    document.getElementById('monitoringToggleBtn').innerText = 'INICIAR';
    document.getElementById('monitoringToggleBtn').style.background = '#28a745';
    document.getElementById('monitoringStatus').innerText = '';
    monitoringActive = false;
}

window.toggleMonitoring = function() {
    if (monitoringActive) {
        stopMonitoringAudio();
    } else {
        startMonitoringAudio();
    }
};

socket.on('rtaAudio', (msg) => {
    if (!monitoringActive || !monitoringAudioCtx) return;
    const label = msg.label;
    const data = msg.data;
    if (label === 'pcm') {
        try {
            const floatData = new Float32Array(data);
            const buf = monitoringAudioCtx.createBuffer(1, floatData.length, monitoringAudioCtx.sampleRate);
            buf.getChannelData(0).set(floatData);
            const src = monitoringAudioCtx.createBufferSource();
            src.buffer = buf;
            src.connect(monitoringAudioCtx.destination);
            if (!monitoringNextStartTime || monitoringNextStartTime < monitoringAudioCtx.currentTime) {
                monitoringNextStartTime = monitoringAudioCtx.currentTime;
            }
            src.start(monitoringNextStartTime);
            monitoringNextStartTime += floatData.length / monitoringAudioCtx.sampleRate;
        } catch(e) {
            console.error('[MONITORING] PCM playback error:', e);
        }
    } else if (label === 'opus') {
        console.log('[MONITORING] Opus data received, type:', typeof data, 'isArray:', Array.isArray(data), 'length:', data && data.length, 'sample:', data && data[0]);
        try {
            if (typeof AudioDecoder === 'undefined' || !('AudioDecoder' in window)) {
                console.warn('[MONITORING] WebCodecs AudioDecoder not available');
                const statusEl = document.getElementById('monitoringStatus');
                if (statusEl) statusEl.innerText = 'Opus não suportado neste navegador. Use PCM.';
                return;
            }
            const opusData = new Uint8Array(data);
            if (!monitoringOpusDecoder) {
                monitoringOpusDecoder = new AudioDecoder({
                    output: (audioData) => {
                        const buf = monitoringAudioCtx.createBuffer(
                            audioData.numberOfChannels,
                            audioData.numberOfFrames,
                            audioData.sampleRate
                        );
                        for (let ch = 0; ch < audioData.numberOfChannels; ch++) {
                            const dst = buf.getChannelData(ch);
                            audioData.copyTo(dst, { planeIndex: ch });
                        }
                        const src = monitoringAudioCtx.createBufferSource();
                        src.buffer = buf;
                        src.connect(monitoringAudioCtx.destination);
                        if (!monitoringNextStartTime || monitoringNextStartTime < monitoringAudioCtx.currentTime) {
                            monitoringNextStartTime = monitoringAudioCtx.currentTime;
                        }
                        src.start(monitoringNextStartTime);
                        monitoringNextStartTime += audioData.numberOfFrames / audioData.sampleRate;
                        audioData.close();
                    },
                    error: (e) => console.error('[MONITORING] Opus decoder error:', e)
                });
                monitoringOpusDecoder.configure({
                    codec: 'opus',
                    sampleRate: 48000,
                    numberOfChannels: 1
                });
            }
            const encodedChunk = new EncodedAudioChunk({
                type: 'key',
                timestamp: 0,
                duration: (monitoringBufferSize / 48000) * 1000000,
                data: opusData
            });
            monitoringOpusDecoder.decode(encodedChunk);
        } catch(e) {
            console.error('[MONITORING] Opus playback error:', e);
        }
    }
});

socket.on('rtaAudioStatus', (data) => {
    const statusEl = document.getElementById('monitoringStatus');
    if (!statusEl) return;
    if (data.status === 'started') {
        monitoringActive = true;
        document.getElementById('monitoringToggleBtn').innerText = 'PARAR';
        document.getElementById('monitoringToggleBtn').style.background = '#dc3545';
        statusEl.innerText = 'Ativo: ' + (data.format || monitoringFormat).toUpperCase() + ' | Buffer: ' + (data.bufferSize || monitoringBufferSize);
    } else if (data.status === 'stopped') {
        if (monitoringActive) stopMonitoringAudio();
        statusEl.innerText = 'Parado';
    } else if (data.status === 'reconfigured') {
        statusEl.innerText = 'Reconfigurado: ' + (data.format || '').toUpperCase() + ' | Buffer: ' + (data.bufferSize || '');
    } else if (data.status === 'active') {
        statusEl.innerText = 'Monitoramento ativo';
    } else if (data.status === 'inactive') {
        statusEl.innerText = 'Inativo';
    }
});

socket.on('rtaAudioError', (data) => {
    const statusEl = document.getElementById('monitoringStatus');
    if (statusEl) {
        statusEl.innerText = 'Erro: ' + (data.error || 'desconhecido');
        statusEl.style.color = '#ff6b6b';
    }
});

document.addEventListener('DOMContentLoaded', () => {
    window.selectMonitoringFormat(monitoringFormat);
    const bufInput = document.getElementById('monitoringBufferSize');
    if (bufInput) {
        bufInput.addEventListener('change', () => {
            localStorage.setItem('monitoringBufferSize', bufInput.value);
        });
    }
    if (monitoringFormat === 'opus') {
        const btn = document.getElementById('monitoringBufferOpusBtn');
        if (btn) btn.innerText = 'BUFFER: ' + monitoringBufferSize;
    }
    document.addEventListener('click', (e) => {
        const opts = document.getElementById('monitoringBufferOpusOptions');
        const btn = document.getElementById('monitoringBufferOpusBtn');
        if (opts && btn && !btn.contains(e.target) && !opts.contains(e.target)) {
            opts.style.display = 'none';
        }
    });
});
