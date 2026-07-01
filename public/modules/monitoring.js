// ==========================================
// MONITORING DE ÁUDIO (Ouvir Áudio)
// ==========================================
let monitoringActive = false;
let monitoringFormat = 'pcm'; // Opus requires AVX CPU support; disabled for now
let monitoringBufferSize = parseInt(localStorage.getItem('monitoringBufferSize')) || 960;
let monitoringAudioCtx = null;
let monitoringHeartbeatInterval = null;
let monitoringDeviceName = null;

window.selectMonitoringFormat = function(fmt) {
    if (fmt === 'opus') return; // Opus disabled (requires AVX CPU)
    monitoringFormat = fmt;
    const btnPcm = document.getElementById('monitoringFmtPcm');
    const btnOpus = document.getElementById('monitoringFmtOpus');
    if (btnPcm) {
        btnPcm.style.background = '#007bff';
        btnPcm.style.color = '#fff';
    }
    if (btnOpus) {
        btnOpus.style.background = '#333';
        btnOpus.style.color = '#666';
    }
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

    let deviceId = document.getElementById('monitoringServerDevice').value;
    localStorage.setItem('monitoringDevice', deviceId);

    let deviceName = null;
    if (deviceId && !deviceId.startsWith('default')) {
        if (deviceId.startsWith('in:')) {
            deviceName = deviceId.substring(3);
        }
    }

    monitoringDeviceName = deviceName;
    monitoringBufferSize = parseInt(document.getElementById('monitoringBufferSize').value) || 960;
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
    if (monitoringAudioCtx) {
        monitoringAudioCtx.close();
        monitoringAudioCtx = null;
    }
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
            src.start();
        } catch(e) {
            console.error('[MONITORING] PCM playback error:', e);
        }
    } else if (label === 'opus') {
        try {
            const opusData = data.buffer ? data.buffer : data;
            if (typeof AudioDecoder !== 'undefined' && 'AudioDecoder' in window) {
                const decoder = new AudioDecoder({
                    output: (audioData) => {
                        const buf = monitoringAudioCtx.createBuffer(
                            audioData.numberOfChannels,
                            audioData.numberOfFrames,
                            audioData.sampleRate
                        );
                        for (let ch = 0; ch < audioData.numberOfChannels; ch++) {
                            buf.getChannelData(ch).set(audioData.getChannelData(ch));
                        }
                        const src = monitoringAudioCtx.createBufferSource();
                        src.buffer = buf;
                        src.connect(monitoringAudioCtx.destination);
                        src.start();
                        audioData.close();
                    },
                    error: (e) => console.error('[MONITORING] Opus decoder error:', e)
                });
                decoder.configure({
                    codec: 'opus',
                    sampleRate: 48000,
                    numberOfChannels: 1
                });
                const encodedChunk = new EncodedAudioChunk({
                    type: 'key',
                    timestamp: 0,
                    duration: (monitoringBufferSize / 48000) * 1000000,
                    data: opusData
                });
                decoder.decode(encodedChunk);
            }
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
    window.selectMonitoringFormat('pcm');
    const bufInput = document.getElementById('monitoringBufferSize');
    if (bufInput) {
        bufInput.addEventListener('change', () => {
            localStorage.setItem('monitoringBufferSize', bufInput.value);
        });
    }
});
