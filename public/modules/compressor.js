function renderCompressor(container, ch) {
    const box = document.createElement('div');
    box.className = 'dyn-box comp-box';
    box.innerHTML = `
        <div class="dyn-header">
            <div class="dyn-label">COMP</div>
            <button class="dyn-on-btn" id="compOn"><span>ON</span></button>
        </div>

        <div class="dyn-meter-container">
            <div class="dyn-thresh-arrow" id="compThreshArrow"></div>
            <div class="dyn-meter-track">
                <div class="dyn-meter-fill" id="compMeter"></div>
            </div>
            <div class="dyn-meter-labels">
                <span>-54</span><span>-40</span><span>-20</span><span>-10</span><span>-5</span><span>0</span>
            </div>
        </div>

        <div class="dyn-controls">
            <div class="dyn-param">
                <label>THRESH</label>
                <div class="dyn-slider-wrap"><input type="range" id="compThreshSl" class="dyn-slider" min="-54" max="0" step="1" value="-8"></div>
                <span class="dyn-value">-8.0</span>
            </div>
            <div class="dyn-param">
                <label>RATIO</label>
                <div class="dyn-slider-wrap"><input type="range" class="dyn-slider" min="1" max="100" step="1" value="25"></div>
                <span class="dyn-value">2.5:1</span>
            </div>
            <div class="dyn-param">
                <label>ATTACK</label>
                <div class="dyn-slider-wrap"><input type="range" class="dyn-slider" min="0" max="120" step="1" value="30"></div>
                <span class="dyn-value">30ms</span>
            </div>
            <div class="dyn-param">
                <label>RELEASE</label>
                <div class="dyn-slider-wrap"><input type="range" class="dyn-slider" min="6" max="600" step="1" value="250"></div>
                <span class="dyn-value">250m</span>
            </div>
            <div class="dyn-param">
                <label>OUTGAIN</label>
                <div class="dyn-slider-wrap"><input type="range" class="dyn-slider" min="0" max="18" step="1" value="0"></div>
                <span class="dyn-value">0.0dB</span>
            </div>
            <div class="dyn-param">
                <label>KNEE</label>
                <div class="dyn-slider-wrap"><input type="range" class="dyn-slider" min="0" max="5" step="1" value="2"></div>
                <span class="dyn-value">2</span>
            </div>
        </div>
    `;

    container.appendChild(box);

    // Visual logic for Comp Arrow
    const compSl = box.querySelector('#compThreshSl');
    const compAr = box.querySelector('#compThreshArrow');

    const updateArrow = (slider, arrow, min, max) => {
        const val = parseInt(slider.value);
        const percent = ((val - min) / (max - min)) * 95;
        arrow.style.left = percent + '%';
        const valEl = slider.parentElement.nextElementSibling;
        if (valEl) valEl.innerText = val.toFixed(1);
    };

    if (compSl && compAr) {
        compSl.addEventListener('input', () => updateArrow(compSl, compAr, -54, 0));
        updateArrow(compSl, compAr, -54, 0);
    }
}
