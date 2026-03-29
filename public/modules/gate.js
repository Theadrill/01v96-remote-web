function renderGate(container, ch) {
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
            <div class="dyn-thresh-arrow" id="gateThreshArrow"></div>
            <div class="dyn-meter-track">
                <div class="dyn-meter-fill" id="gateMeter"></div>
            </div>
            <div class="dyn-meter-labels">
                <span>-72</span><span>-60</span><span>-40</span><span>-20</span><span>-10</span><span>0</span>
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
                <div class="dyn-slider-wrap"><input type="range" id="gateHoldSl" class="dyn-slider" min="0" max="255" step="1" value="${state.hold}"></div>
                <span class="dyn-value">20ms</span>
            </div>
            <div class="dyn-param">
                <label>DECAY</label>
                <div class="dyn-slider-wrap"><input type="range" id="gateDecaySl" class="dyn-slider" min="0" max="255" step="1" value="${state.decay}"></div>
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
    updateUIValue('gateHold', v => v + 'ms');
    updateUIValue('gateDecay', v => v + 'ms');

    // Visual logic for Gate Arrow
    const threshSl = box.querySelector('#gateThreshSl');
    const gateAr = box.querySelector('#gateThreshArrow');
    const updateAr = () => {
        const val = parseInt(threshSl.value);
        // Mapeia -720..0 para 0..95%
        const percent = ((val + 720) / 720) * 95;
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
        'kGateHold':      { id: 'gateHoldSl',   labelFn: v => v + 'ms' },
        'kGateDecay':     { id: 'gateDecaySl',  labelFn: v => v + 'ms' }
    };
    const mapping = sliderMap[key];
    if (mapping) {
        const sl = document.getElementById(mapping.id);
        if (sl) {
            sl.value = value;
            // Atualiza o label de texto ao lado
            const labelEl = sl.parentElement && sl.parentElement.nextElementSibling;
            if (labelEl) labelEl.innerText = mapping.labelFn(parseInt(value));
            // Atualiza a seta de threshold se necessário
            if (key === 'kGateThreshold') {
                const arrow = document.getElementById('gateThreshArrow');
                if (arrow) arrow.style.left = ((parseInt(value) + 720) / 720 * 95) + '%';
            }
        }
    }
}
