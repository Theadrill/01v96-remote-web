function renderCompressor(container, ch) {
    const RATIOS = ['1:1', '1.1:1', '1.3:1', '1.5:1', '1.7:1', '2:1', '2.5:1', '3:1', '3.5:1', '4:1', '5:1', '6:1', '8:1', '10:1', '20:1', 'inf:1'];
    
    // Tabela oficial de passos de Release da 01V96 fornecida pelo usuário
    const RELEASE_STEPS = [
        '5ms', '11ms', '16ms', '21ms', '27ms', '32ms', '37ms', '43ms', '48ms', '53ms', '59ms', '64ms', '69ms', '75ms', '80ms', '85ms', '91ms', '96ms', '101ms', '107ms',
        '112ms', '117ms', '123ms', '128ms', '133ms', '139ms', '144ms', '149ms', '155ms', '160ms', '165ms', '171ms', '176ms', '187ms', '197ms', '208ms', '219ms', '229ms', '240ms', '251ms',
        '261ms', '272ms', '283ms', '293ms', '304ms', '315ms', '325ms', '336ms', '347ms', '368ms', '389ms', '411ms', '432ms', '453ms', '475ms', '496ms', '517ms', '539ms', '560ms', '581ms',
        '603ms', '624ms', '645ms', '667ms', '688ms', '730ms', '773ms', '816ms', '858ms', '901ms', '944ms', '986ms', '1.02s', '1.07s', '1.11s', '1.15s', '1.20s', '1.24s', '1.28s', '1.32s',
        '1.37s', '1.45s', '1.54s', '1.62s', '1.71s', '1.79s', '1.88s', '1.96s', '2.05s', '2.13s', '2.22s', '2.30s', '2.39s', '2.47s', '2.56s', '2.65s', '2.73s', '2.90s', '3.07s', '3.24s',
        '3.41s', '3.58s', '3.75s', '3.93s', '4.10s', '4.27s', '4.44s', '4.61s', '4.78s', '4.95s', '5.12s', '5.29s', '5.46s', '5.80s', '6.14s', '6.48s', '6.83s', '7.17s', '7.51s', '7.85s',
        '8.19s', '8.53s', '8.87s', '9.21s', '9.56s', '9.90s', '10.2s', '10.5s', '10.9s', '11.6s', '12.2s', '12.9s', '13.6s', '14.3s', '15.0s', '15.7s', '16.3s', '17.0s', '17.7s', '18.4s',
        '19.1s', '19.7s', '20.4s', '21.1s', '21.8s', '23.2s', '24.5s', '25.9s', '27.3s', '28.6s', '30.0s', '31.4s', '32.7s', '34.1s', '35.4s', '36.8s', '38.2s', '39.5s', '40.9s', '42.3s'
    ];
    
    const box = document.createElement('div');
    box.className = 'dyn-box comp-box';
    
    const defaultState = { on: false, thresh: -8, ratio: 7, attack: 30, release: 250, gain: 0, knee: 2 };
    const savedState = (window.channelStates && channelStates[ch] && channelStates[ch].comp) || {};
    const state = { ...defaultState, ...savedState };

    box.innerHTML = `
        <div class="dyn-header">
            <div class="dyn-label">COMPRESSOR</div>
            <button class="dyn-on-btn" id="compOn"><span>ON</span></button>
        </div>

        <div class="dyn-meter-container">
            <div class="dyn-meter-wrapper" style="position: relative;">
                <div class="dyn-thresh-arrow" id="compThreshArrow"></div>
                <div class="dyn-meter-track">
                    <div class="dyn-meter-fill" id="compMeter"></div>
                </div>
                <div class="dyn-meter-labels">
                    <span>-54</span><span>-40</span><span>-20</span><span>-10</span><span>-5</span><span>0</span>
                </div>
            </div>
        </div>

        <div class="dyn-controls">
            <div class="dyn-param">
                <label>THRESH</label>
                <div class="dyn-slider-wrap"><input type="range" id="compThreshSl" class="dyn-slider" min="-540" max="0" step="1" value="${state.thresh * 10}"></div>
                <span class="dyn-value">-8.0</span>
            </div>
            <div class="dyn-param">
                <label>RATIO</label>
                <div class="dyn-slider-wrap"><input type="range" id="compRatioSl" class="dyn-slider" min="0" max="15" step="1" value="${state.ratio}"></div>
                <span class="dyn-value">2.5:1</span>
            </div>
            <div class="dyn-param">
                <label>ATTACK</label>
                <div class="dyn-slider-wrap"><input type="range" id="compAttackSl" class="dyn-slider" min="0" max="120" step="1" value="${state.attack}"></div>
                <span class="dyn-value">30ms</span>
            </div>
            <div class="dyn-param">
                <label>RELEASE</label>
                <div class="dyn-slider-wrap"><input type="range" id="compReleaseSl" class="dyn-slider" min="0" max="${RELEASE_STEPS.length - 1}" step="1" value="${state.release}"></div>
                <span class="dyn-value">250ms</span>
            </div>
            <div class="dyn-param">
                <label>OUTGAIN</label>
                <div class="dyn-slider-wrap"><input type="range" id="compGainSl" class="dyn-slider" min="0" max="180" step="1" value="${state.gain}"></div>
                <span class="dyn-value">0.0dB</span>
            </div>
            <div class="dyn-param">
                <label>KNEE</label>
                <div class="dyn-slider-wrap"><input type="range" id="compKneeSl" class="dyn-slider" min="0" max="5" step="1" value="${state.knee}"></div>
                <span class="dyn-value">2</span>
            </div>
        </div>
    `;

    container.appendChild(box);

    const updateUIValue = (id, formatter) => {
        const sl = box.querySelector(`#${id}Sl`);
        const valEl = sl.parentElement.nextElementSibling;
        const update = () => {
            valEl.innerText = formatter(parseInt(sl.value));
        };
        sl.oninput = update;
        sl.onchange = () => {
             const typeMap = {
                 'compThresh': 'kInputComp/kCompThreshold',
                 'compRatio': 'kInputComp/kCompRatio',
                 'compAttack': 'kInputComp/kCompAttack',
                 'compRelease': 'kInputComp/kCompRelease',
                 'compGain': 'kInputComp/kCompGain',
                 'compKnee': 'kInputComp/kCompKnee'
             };
             const type = typeMap[id];
             if (type && socket) socket.emit('control', { type, channel: ch, value: parseInt(sl.value) });
        };
        update();
    };

    updateUIValue('compThresh', v => (v/10).toFixed(1));
    updateUIValue('compRatio', v => RATIOS[v] || '1:1');
    updateUIValue('compAttack', v => v + 'ms');
    updateUIValue('compRelease', v => RELEASE_STEPS[v] || '250ms');
    updateUIValue('compGain', v => (v/10).toFixed(1) + 'dB');
    updateUIValue('compKnee', v => v === 0 ? 'HARD' : v);

    // Threshold Arrow logic
    const threshSl = box.querySelector('#compThreshSl');
    const compAr = box.querySelector('#compThreshArrow');
    const updateAr = () => {
        const val = parseInt(threshSl.value);
        const percent = mapDynDbToPercent(val, 'comp');
        compAr.style.left = percent + '%';
    };
    threshSl.addEventListener('input', updateAr);
    updateAr();

    // ON/OFF Logic
    const btnOn = box.querySelector('#compOn');
    if (btnOn) {
        const isCurrentlyOn = !!state.on;
        btnOn.classList.toggle('active', isCurrentlyOn);
        btnOn.onclick = () => {
            const nextState = !btnOn.classList.contains('active');
            socket.emit('control', { type: 'kInputComp/kCompOn', channel: ch, value: nextState ? 1 : 0 });
            btnOn.classList.toggle('active', nextState);
            // Atualiza memória local imediatamente
            if (!channelStates[ch].comp) channelStates[ch].comp = {};
            channelStates[ch].comp.on = nextState;
        };
    }
}

// Atualiza a UI do Compressor a partir de dados externos (socket update) — igual ao padrão do AUX
function updateCompFromSocket(ch, key, value) {
    const RATIOS = ['1:1', '1.1:1', '1.3:1', '1.5:1', '1.7:1', '2:1', '2.5:1', '3:1', '3.5:1', '4:1', '5:1', '6:1', '8:1', '10:1', '20:1', 'inf:1'];
    const RELEASE_STEPS = [
        '5ms', '11ms', '16ms', '21ms', '27ms', '32ms', '37ms', '43ms', '48ms', '53ms', '59ms', '64ms', '69ms', '75ms', '80ms', '85ms', '91ms', '96ms', '101ms', '107ms',
        '112ms', '117ms', '123ms', '128ms', '133ms', '139ms', '144ms', '149ms', '155ms', '160ms', '165ms', '171ms', '176ms', '187ms', '197ms', '208ms', '219ms', '229ms', '240ms', '251ms',
        '261ms', '272ms', '283ms', '293ms', '304ms', '315ms', '325ms', '336ms', '347ms', '368ms', '389ms', '411ms', '432ms', '453ms', '475ms', '496ms', '517ms', '539ms', '560ms', '581ms',
        '603ms', '624ms', '645ms', '667ms', '688ms', '730ms', '773ms', '816ms', '858ms', '901ms', '944ms', '986ms', '1.02s', '1.07s', '1.11s', '1.15s', '1.20s', '1.24s', '1.28s', '1.32s',
        '1.37s', '1.45s', '1.54s', '1.62s', '1.71s', '1.79s', '1.88s', '1.96s', '2.05s', '2.13s', '2.22s', '2.30s', '2.39s', '2.47s', '2.56s', '2.65s', '2.73s', '2.90s', '3.07s', '3.24s',
        '3.41s', '3.58s', '3.75s', '3.93s', '4.10s', '4.27s', '4.44s', '4.61s', '4.78s', '4.95s', '5.12s', '5.29s', '5.46s', '5.80s', '6.14s', '6.48s', '6.83s', '7.17s', '7.51s', '7.85s',
        '8.19s', '8.53s', '8.87s', '9.21s', '9.56s', '9.90s', '10.2s', '10.5s', '10.9s', '11.6s', '12.2s', '12.9s', '13.6s', '14.3s', '15.0s', '15.7s', '16.3s', '17.0s', '17.7s', '18.4s',
        '19.1s', '19.7s', '20.4s', '21.1s', '21.8s', '23.2s', '24.5s', '25.9s', '27.3s', '28.6s', '30.0s', '31.4s', '32.7s', '34.1s', '35.4s', '36.8s', '38.2s', '39.5s', '40.9s', '42.3s'
    ];

    if (!channelStates[ch]) channelStates[ch] = {};
    if (!channelStates[ch].comp) channelStates[ch].comp = {};

    const internalKeyMap = {
        'kCompOn': 'on', 'kCompThreshold': 'thresh', 'kCompRatio': 'ratio',
        'kCompAttack': 'attack', 'kCompRelease': 'release', 'kCompGain': 'gain', 'kCompKnee': 'knee'
    };
    const internalKey = internalKeyMap[key];
    if (internalKey) channelStates[ch].comp[internalKey] = (key === 'kCompOn' ? !!value : value);

    // Atualiza o botão ON
    const btn = document.getElementById('compOn');
    if (btn) btn.classList.toggle('active', !!channelStates[ch].comp.on);

    // Atualiza sliders e labels diretamente
    const sliderMap = {
        'kCompThreshold': { id: 'compThreshSl', labelFn: v => (v/10).toFixed(1) },
        'kCompRatio':     { id: 'compRatioSl',  labelFn: v => RATIOS[v] || '1:1' },
        'kCompAttack':    { id: 'compAttackSl', labelFn: v => v + 'ms' },
        'kCompRelease':   { id: 'compReleaseSl',labelFn: v => RELEASE_STEPS[v] || '250ms' },
        'kCompGain':      { id: 'compGainSl',   labelFn: v => (v/10).toFixed(1) + 'dB' },
        'kCompKnee':      { id: 'compKneeSl',   labelFn: v => v === 0 ? 'HARD' : v }
    };
    const mapping = sliderMap[key];
    if (mapping) {
        const sl = document.getElementById(mapping.id);
        if (sl) {
            sl.value = value;
            const labelEl = sl.parentElement && sl.parentElement.nextElementSibling;
            if (labelEl) labelEl.innerText = mapping.labelFn(parseInt(value));
            if (key === 'kCompThreshold') {
                const arrow = document.getElementById('compThreshArrow');
                if (arrow) arrow.style.left = mapDynDbToPercent(parseInt(value), 'comp') + '%';
            }
        }
    }
}
