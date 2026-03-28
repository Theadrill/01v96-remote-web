function renderGate(container, ch) {
    const box = document.createElement('div');
    box.className = 'dyn-box gate-box';
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
                <div class="dyn-slider-wrap"><input type="range" id="gateThreshSl" class="dyn-slider" min="-72" max="0" step="1" value="-26"></div>
                <span class="dyn-value">-26.0</span>
            </div>
            <div class="dyn-param">
                <label>RANGE</label>
                <div class="dyn-slider-wrap"><input type="range" class="dyn-slider" min="-60" max="0" step="1" value="-56"></div>
                <span class="dyn-value">-56dB</span>
            </div>
            <div class="dyn-param">
                <label>ATTACK</label>
                <div class="dyn-slider-wrap"><input type="range" class="dyn-slider" min="0" max="120" step="1" value="0"></div>
                <span class="dyn-value">0ms</span>
            </div>
            <div class="dyn-param">
                <label>HOLD</label>
                <div class="dyn-slider-wrap"><input type="range" class="dyn-slider" min="0" max="200" step="1" value="20"></div>
                <span class="dyn-value">2.56m</span>
            </div>
            <div class="dyn-param">
                <label>DECAY</label>
                <div class="dyn-slider-wrap"><input type="range" class="dyn-slider" min="0" max="200" step="1" value="50"></div>
                <span class="dyn-value">331m</span>
            </div>
        </div>
    `;
    
    container.appendChild(box);

    // Visual logic for Gate Arrow
    const gateSl = box.querySelector('#gateThreshSl');
    const gateAr = box.querySelector('#gateThreshArrow');

    const updateArrow = (slider, arrow, min, max) => {
        const val = parseInt(slider.value);
        const percent = ((val - min) / (max - min)) * 95;
        arrow.style.left = percent + '%';
        const valEl = slider.parentElement.nextElementSibling;
        if (valEl) valEl.innerText = val.toFixed(1);
    };

    if (gateSl && gateAr) {
        gateSl.addEventListener('input', () => updateArrow(gateSl, gateAr, -72, 0));
        updateArrow(gateSl, gateAr, -72, 0);
    }
}
