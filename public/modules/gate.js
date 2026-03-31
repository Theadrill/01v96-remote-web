function renderGate(container, ch) {
    // Tabela oficial de passos de Decay do Gate da 01V96 (mesma tabela de Release do Compressor)
    const DECAY_STEPS = [
        '5ms', '11ms', '16ms', '21ms', '27ms', '32ms', '37ms', '43ms', '48ms', '53ms', '59ms', '64ms', '69ms', '75ms', '80ms', '85ms', '91ms', '96ms', '101ms', '107ms',
        '112ms', '117ms', '123ms', '128ms', '133ms', '139ms', '144ms', '149ms', '155ms', '160ms', '165ms', '171ms', '176ms', '187ms', '197ms', '208ms', '219ms', '229ms', '240ms', '251ms',
        '261ms', '272ms', '283ms', '293ms', '304ms', '315ms', '325ms', '336ms', '347ms', '368ms', '389ms', '411ms', '432ms', '453ms', '475ms', '496ms', '517ms', '539ms', '560ms', '581ms',
        '603ms', '624ms', '645ms', '667ms', '688ms', '730ms', '773ms', '816ms', '858ms', '901ms', '944ms', '986ms', '1.02s', '1.07s', '1.11s', '1.15s', '1.20s', '1.24s', '1.28s', '1.32s',
        '1.37s', '1.45s', '1.54s', '1.62s', '1.71s', '1.79s', '1.88s', '1.96s', '2.05s', '2.13s', '2.22s', '2.30s', '2.39s', '2.47s', '2.56s', '2.65s', '2.73s', '2.90s', '3.07s', '3.24s',
        '3.41s', '3.58s', '3.75s', '3.93s', '4.10s', '4.27s', '4.44s', '4.61s', '4.78s', '4.95s', '5.12s', '5.29s', '5.46s', '5.80s', '6.14s', '6.48s', '6.83s', '7.17s', '7.51s', '7.85s',
        '8.19s', '8.53s', '8.87s', '9.21s', '9.56s', '9.90s', '10.2s', '10.5s', '10.9s', '11.6s', '12.2s', '12.9s', '13.6s', '14.3s', '15.0s', '15.7s', '16.3s', '17.0s', '17.7s', '18.4s',
        '19.1s', '19.7s', '20.4s', '21.1s', '21.8s', '23.2s', '24.5s', '25.9s', '27.3s', '28.6s', '30.0s', '31.4s', '32.7s', '34.1s', '35.4s', '36.8s', '38.2s', '39.5s', '40.9s', '42.3s'
    ];

    // Tabela oficial de passos de Hold do Gate da 01V96 (216 steps, 0.02ms a 1.96s @ 48kHz)
    const HOLD_STEPS = [
        '0.02ms', '0.04ms', '0.06ms', '0.08ms', '0.10ms', '0.13ms', '0.15ms', '0.17ms', '0.19ms', '0.21ms', '0.23ms', '0.25ms', '0.27ms', '0.29ms', '0.31ms', '0.33ms', '0.35ms', '0.37ms', '0.39ms', '0.41ms',
        '0.43ms', '0.45ms', '0.47ms', '0.49ms', '0.51ms', '0.53ms', '0.55ms', '0.57ms', '0.59ms', '0.61ms', '0.63ms', '0.65ms', '0.70ms', '0.75ms', '0.80ms', '0.85ms', '0.90ms', '0.94ms', '0.98ms', '1.02ms',
        '1.06ms', '1.10ms', '1.14ms', '1.18ms', '1.23ms', '1.27ms', '1.31ms', '1.37ms', '1.44ms', '1.50ms', '1.57ms', '1.63ms', '1.72ms', '1.81ms', '1.90ms', '1.99ms', '2.08ms', '2.16ms', '2.25ms', '2.34ms',
        '2.43ms', '2.52ms', '2.67ms', '2.82ms', '2.97ms', '3.12ms', '3.27ms', '3.42ms', '3.57ms', '3.72ms', '3.87ms', '4.02ms', '4.22ms', '4.42ms', '4.62ms', '4.82ms', '5.02ms', '5.22ms', '5.42ms', '5.62ms',
        '5.82ms', '6.02ms', '6.25ms', '6.49ms', '6.72ms', '6.95ms', '7.18ms', '7.42ms', '7.65ms', '7.88ms', '8.12ms', '8.35ms', '8.96ms', '9.58ms', '10.2ms', '10.8ms', '11.4ms', '12.0ms', '12.7ms', '13.3ms',
        '13.9ms', '14.5ms', '15.2ms', '15.9ms', '16.5ms', '17.2ms', '17.9ms', '18.6ms', '19.3ms', '19.9ms', '20.6ms', '21.3ms', '22.6ms', '23.9ms', '25.3ms', '26.6ms', '27.9ms', '29.2ms', '30.5ms', '31.9ms',
        '33.2ms', '34.5ms', '37.2ms', '39.9ms', '42.5ms', '45.2ms', '47.9ms', '50.5ms', '53.2ms', '55.9ms', '58.6ms', '61.3ms', '63.9ms', '66.6ms', '69.3ms', '71.9ms', '74.6ms', '77.3ms', '80.0ms', '82.7ms',
        '85.3ms', '88.0ms', '93.2ms', '98.4ms', '104ms', '109ms', '114ms', '119ms', '124ms', '130ms', '135ms', '140ms', '145ms', '150ms', '156ms', '161ms', '166ms', '171ms', '176ms', '182ms',
        '187ms', '192ms', '205ms', '218ms', '231ms', '244ms', '257ms', '270ms', '283ms', '296ms', '309ms', '323ms', '336ms', '349ms', '362ms', '375ms', '388ms', '401ms', '414ms', '427ms',
        '440ms', '453ms', '485ms', '518ms', '550ms', '582ms', '615ms', '647ms', '679ms', '712ms', '744ms', '777ms', '809ms', '841ms', '874ms', '906ms', '938ms', '971ms', '1.00s', '1.04s',
        '1.07s', '1.10s', '1.16s', '1.22s', '1.28s', '1.34s', '1.40s', '1.46s', '1.52s', '1.58s', '1.64s', '1.70s', '1.76s', '1.83s', '1.90s', '1.96s'
    ];

    const box = document.createElement('div');
    box.className = 'dyn-box gate-box';
    
    const defaultState = { on: false, thresh: -26, range: -60, attack: 0, hold: 20, decay: 50 };
    const savedState = (window.channelStates && channelStates[ch] && channelStates[ch].gate) || {};
    const state = { ...defaultState, ...savedState };

    box.innerHTML = `
        <div class="dyn-header">
            <div class="dyn-label">GATE</div>
            <button class="dyn-on-btn" id="gateOn"><span>ON</span></button>
        </div>
        
        <div class="dyn-meter-container">
            <div class="dyn-meter-wrapper" style="position: relative;">
                <div class="dyn-thresh-arrow" id="gateThreshArrow"></div>
                <div class="dyn-meter-track">
                    <div class="dyn-meter-fill" id="gateMeter"></div>
                </div>
                <div class="dyn-meter-labels">
                    <span>-72</span><span>-60</span><span>-40</span><span>-20</span><span>-10</span><span>0</span>
                </div>
            </div>
        </div>

        <div class="dyn-controls">
            <div class="dyn-param">
                <label>THRESH</label>
                <div class="dyn-slider-wrap"><input type="range" id="gateThreshSl" class="dyn-slider" min="-720" max="0" step="1" value="${state.thresh * 10}"></div>
                <span class="dyn-value">-26.0</span>
            </div>
            <div class="dyn-param">
                <label>RANGE</label>
                <div class="dyn-slider-wrap"><input type="range" id="gateRangeSl" class="dyn-slider" min="-60" max="0" step="1" value="${state.range}"></div>
                <span class="dyn-value">-60dB</span>
            </div>
            <div class="dyn-param">
                <label>ATTACK</label>
                <div class="dyn-slider-wrap"><input type="range" id="gateAttackSl" class="dyn-slider" min="0" max="120" step="1" value="${state.attack}"></div>
                <span class="dyn-value">0ms</span>
            </div>
            <div class="dyn-param">
                <label>HOLD</label>
                <div class="dyn-slider-wrap"><input type="range" id="gateHoldSl" class="dyn-slider" min="0" max="${HOLD_STEPS.length - 1}" step="1" value="${state.hold}"></div>
                <span class="dyn-value">20ms</span>
            </div>
            <div class="dyn-param">
                <label>DECAY</label>
                <div class="dyn-slider-wrap"><input type="range" id="gateDecaySl" class="dyn-slider" min="0" max="${DECAY_STEPS.length - 1}" step="1" value="${state.decay}"></div>
                <span class="dyn-value">50ms</span>
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
                 'gateThresh': 'kInputGate/kGateThreshold',
                 'gateRange': 'kInputGate/kGateRange',
                 'gateAttack': 'kInputGate/kGateAttack',
                 'gateHold': 'kInputGate/kGateHold',
                 'gateDecay': 'kInputGate/kGateDecay'
             };
             const type = typeMap[id];
             if (type && socket) socket.emit('control', { type, channel: ch, value: parseInt(sl.value) });
        };
        update();
    };

    updateUIValue('gateThresh', v => (v/10).toFixed(1));
    updateUIValue('gateRange', v => v + 'dB');
    updateUIValue('gateAttack', v => v + 'ms');
    updateUIValue('gateHold', v => HOLD_STEPS[v] || '0.02ms');
    updateUIValue('gateDecay', v => DECAY_STEPS[v] || '50ms');

    // Visual logic for Gate Arrow
    const threshSl = box.querySelector('#gateThreshSl');
    const gateAr = box.querySelector('#gateThreshArrow');
    const updateAr = () => {
        const val = parseInt(threshSl.value);
        const percent = mapDynDbToPercent(val, 'gate');
        gateAr.style.left = percent + '%';
    };
    threshSl.addEventListener('input', updateAr);
    updateAr();

    // ON/OFF Logic
    const btnOn = box.querySelector('#gateOn');
    if (btnOn) {
        const isCurrentlyOn = !!state.on;
        btnOn.classList.toggle('active', isCurrentlyOn);
        btnOn.onclick = () => {
            const nextState = !btnOn.classList.contains('active');
            socket.emit('control', { type: 'kInputGate/kGateOn', channel: ch, value: nextState ? 1 : 0 });
            btnOn.classList.toggle('active', nextState);
            // Atualiza memória local imediatamente
            if (!channelStates[ch].gate) channelStates[ch].gate = {};
            channelStates[ch].gate.on = nextState;
        };
    }
}

// Atualiza a UI do Gate a partir de dados externos (socket update) — igual ao padrão do AUX
function updateGateFromSocket(ch, key, value) {
    if (!channelStates[ch]) channelStates[ch] = {};
    if (!channelStates[ch].gate) channelStates[ch].gate = {};

    // Salva no estado
    const internalKeyMap = {
        'kGateOn': 'on', 'kGateThreshold': 'thresh', 'kGateAttack': 'attack',
        'kGateRange': 'range', 'kGateHold': 'hold', 'kGateDecay': 'decay'
    };
    const internalKey = internalKeyMap[key];
    if (internalKey) channelStates[ch].gate[internalKey] = (key === 'kGateOn' ? !!value : value);

    // Atualiza o botão ON
    const btn = document.getElementById('gateOn');
    if (btn) btn.classList.toggle('active', !!channelStates[ch].gate.on);

    // Atualiza sliders e labels diretamente
    const sliderMap = {
        'kGateThreshold': { id: 'gateThreshSl', labelFn: v => (v/10).toFixed(1) },
        'kGateRange':     { id: 'gateRangeSl',  labelFn: v => v + 'dB' },
        'kGateAttack':    { id: 'gateAttackSl', labelFn: v => v + 'ms' },
        'kGateHold':      { id: 'gateHoldSl',   labelFn: v => { const HOLD_STEPS = [
            '0.02ms', '0.04ms', '0.06ms', '0.08ms', '0.10ms', '0.13ms', '0.15ms', '0.17ms', '0.19ms', '0.21ms', '0.23ms', '0.25ms', '0.27ms', '0.29ms', '0.31ms', '0.33ms', '0.35ms', '0.37ms', '0.39ms', '0.41ms',
            '0.43ms', '0.45ms', '0.47ms', '0.49ms', '0.51ms', '0.53ms', '0.55ms', '0.57ms', '0.59ms', '0.61ms', '0.63ms', '0.65ms', '0.70ms', '0.75ms', '0.80ms', '0.85ms', '0.90ms', '0.94ms', '0.98ms', '1.02ms',
            '1.06ms', '1.10ms', '1.14ms', '1.18ms', '1.23ms', '1.27ms', '1.31ms', '1.37ms', '1.44ms', '1.50ms', '1.57ms', '1.63ms', '1.72ms', '1.81ms', '1.90ms', '1.99ms', '2.08ms', '2.16ms', '2.25ms', '2.34ms',
            '2.43ms', '2.52ms', '2.67ms', '2.82ms', '2.97ms', '3.12ms', '3.27ms', '3.42ms', '3.57ms', '3.72ms', '3.87ms', '4.02ms', '4.22ms', '4.42ms', '4.62ms', '4.82ms', '5.02ms', '5.22ms', '5.42ms', '5.62ms',
            '5.82ms', '6.02ms', '6.25ms', '6.49ms', '6.72ms', '6.95ms', '7.18ms', '7.42ms', '7.65ms', '7.88ms', '8.12ms', '8.35ms', '8.96ms', '9.58ms', '10.2ms', '10.8ms', '11.4ms', '12.0ms', '12.7ms', '13.3ms',
            '13.9ms', '14.5ms', '15.2ms', '15.9ms', '16.5ms', '17.2ms', '17.9ms', '18.6ms', '19.3ms', '19.9ms', '20.6ms', '21.3ms', '22.6ms', '23.9ms', '25.3ms', '26.6ms', '27.9ms', '29.2ms', '30.5ms', '31.9ms',
            '33.2ms', '34.5ms', '37.2ms', '39.9ms', '42.5ms', '45.2ms', '47.9ms', '50.5ms', '53.2ms', '55.9ms', '58.6ms', '61.3ms', '63.9ms', '66.6ms', '69.3ms', '71.9ms', '74.6ms', '77.3ms', '80.0ms', '82.7ms',
            '85.3ms', '88.0ms', '93.2ms', '98.4ms', '104ms', '109ms', '114ms', '119ms', '124ms', '130ms', '135ms', '140ms', '145ms', '150ms', '156ms', '161ms', '166ms', '171ms', '176ms', '182ms',
            '187ms', '192ms', '205ms', '218ms', '231ms', '244ms', '257ms', '270ms', '283ms', '296ms', '309ms', '323ms', '336ms', '349ms', '362ms', '375ms', '388ms', '401ms', '414ms', '427ms',
            '440ms', '453ms', '485ms', '518ms', '550ms', '582ms', '615ms', '647ms', '679ms', '712ms', '744ms', '777ms', '809ms', '841ms', '874ms', '906ms', '938ms', '971ms', '1.00s', '1.04s',
            '1.07s', '1.10s', '1.16s', '1.22s', '1.28s', '1.34s', '1.40s', '1.46s', '1.52s', '1.58s', '1.64s', '1.70s', '1.76s', '1.83s', '1.90s', '1.96s'
        ]; return HOLD_STEPS[v] || '0.02ms'; } },
        'kGateDecay':     { id: 'gateDecaySl',  labelFn: v => { const DECAY_STEPS = [
            '5ms', '11ms', '16ms', '21ms', '27ms', '32ms', '37ms', '43ms', '48ms', '53ms', '59ms', '64ms', '69ms', '75ms', '80ms', '85ms', '91ms', '96ms', '101ms', '107ms',
            '112ms', '117ms', '123ms', '128ms', '133ms', '139ms', '144ms', '149ms', '155ms', '160ms', '165ms', '171ms', '176ms', '187ms', '197ms', '208ms', '219ms', '229ms', '240ms', '251ms',
            '261ms', '272ms', '283ms', '293ms', '304ms', '315ms', '325ms', '336ms', '347ms', '368ms', '389ms', '411ms', '432ms', '453ms', '475ms', '496ms', '517ms', '539ms', '560ms', '581ms',
            '603ms', '624ms', '645ms', '667ms', '688ms', '730ms', '773ms', '816ms', '858ms', '901ms', '944ms', '986ms', '1.02s', '1.07s', '1.11s', '1.15s', '1.20s', '1.24s', '1.28s', '1.32s',
            '1.37s', '1.45s', '1.54s', '1.62s', '1.71s', '1.79s', '1.88s', '1.96s', '2.05s', '2.13s', '2.22s', '2.30s', '2.39s', '2.47s', '2.56s', '2.65s', '2.73s', '2.90s', '3.07s', '3.24s',
            '3.41s', '3.58s', '3.75s', '3.93s', '4.10s', '4.27s', '4.44s', '4.61s', '4.78s', '4.95s', '5.12s', '5.29s', '5.46s', '5.80s', '6.14s', '6.48s', '6.83s', '7.17s', '7.51s', '7.85s',
            '8.19s', '8.53s', '8.87s', '9.21s', '9.56s', '9.90s', '10.2s', '10.5s', '10.9s', '11.6s', '12.2s', '12.9s', '13.6s', '14.3s', '15.0s', '15.7s', '16.3s', '17.0s', '17.7s', '18.4s',
            '19.1s', '19.7s', '20.4s', '21.1s', '21.8s', '23.2s', '24.5s', '25.9s', '27.3s', '28.6s', '30.0s', '31.4s', '32.7s', '34.1s', '35.4s', '36.8s', '38.2s', '39.5s', '40.9s', '42.3s'
        ]; return DECAY_STEPS[v] || '50ms'; } }
    };
    const mapping = sliderMap[key];
    if (mapping) {
        const sl = document.getElementById(mapping.id);
        if (sl) {
            sl.value = value;
            // Atualiza o label de texto ao lado
            const labelEl = sl.parentElement && sl.parentElement.nextElementSibling;
            if (labelEl) labelEl.innerText = mapping.labelFn(parseInt(value));
            if (key === 'kGateThreshold') {
                const arrow = document.getElementById('gateThreshArrow');
                if (arrow) arrow.style.left = mapDynDbToPercent(parseInt(value), 'gate') + '%';
            }
        }
    }
}
