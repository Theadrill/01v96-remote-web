function renderDynamics(ch) {
    const body = document.querySelector('.ch-modal-body');
    const chName = document.getElementById(`name${ch}`).innerText;
    
    // Configura o body do modal para comportar o painel de dinâmica
    body.style.flexDirection = 'column';
    body.style.alignItems = 'stretch';
    body.style.overflowY = 'auto'; // Garante scroll se ficar muito apertado
    body.innerHTML = `
        <div class="dyn-container">
            <!-- GATE MODULE -->
            <div class="dyn-box gate-box">
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
            </div>

            <!-- COMP MODULE -->
            <div class="dyn-box comp-box">
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
            </div>
        </div>
    `;

    // Visual Logic only
    const gateSl = document.getElementById('gateThreshSl');
    const compSl = document.getElementById('compThreshSl');
    const gateAr = document.getElementById('gateThreshArrow');
    const compAr = document.getElementById('compThreshArrow');

    const updateArrow = (slider, arrow, min, max) => {
        const val = parseInt(slider.value);
        // O Threshold é inversamente proporcional à posição visual (0dB está na direita)
        const percent = ((val - min) / (max - min)) * 95; // 95% para não encostar na borda direita
        arrow.style.left = percent + '%';
        
        const valEl = slider.parentElement.nextElementSibling;
        if (valEl) valEl.innerText = val.toFixed(1);
    };

    if (gateSl && gateAr) {
        gateSl.addEventListener('input', () => updateArrow(gateSl, gateAr, -72, 0));
        updateArrow(gateSl, gateAr, -72, 0);
    }
    if (compSl && compAr) {
        compSl.addEventListener('input', () => updateArrow(compSl, compAr, -54, 0));
        updateArrow(compSl, compAr, -54, 0);
    }
}
