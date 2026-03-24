function renderAuxs(ch) {
    const body = document.querySelector('.ch-modal-body');
    let html = '';

    for (let i = 1; i <= 8; i++) {
        const currentVal = (channelStates[ch] && channelStates[ch][`aux${i}`]) || 0;
        const isOn = (channelStates[ch] && channelStates[ch][`aux${i}On`]) || false;

        html += `
            <div class="fader-card aux-card">
                <h2 class="card-title">AUX ${i}</h2>
                
                <button id="aux_on_${i}" class="btn-state ${isOn ? 'on-active' : ''}" 
                    onclick="toggleAuxOn(${ch}, ${i})">ON</button>
                
                <div class="nudge-zone" onpointerdown="startAuxNudge(${ch}, ${i}, 1)" onpointerup="stopAuxNudge()" onpointerleave="stopAuxNudge()" onpointercancel="stopAuxNudge()" oncontextmenu="return false;">
                    <button class="btn-nudge pointer-none">+</button>
                </div>

                <input type="range" id="aux_f_${i}" min="0" max="1023" value="${currentVal}" 
                    orient="vertical" oninput="auxLevelInput(event, ${ch}, ${i})">
                    
                <div class="nudge-zone" onpointerdown="startAuxNudge(${ch}, ${i}, -1)" onpointerup="stopAuxNudge()" onpointerleave="stopAuxNudge()" onpointercancel="stopAuxNudge()" oncontextmenu="return false;">
                    <button class="btn-nudge pointer-none">-</button>
                    <h1 id="aux_v_${i}" class="fader-val">${rawToDb(currentVal)}</h1>
                </div>
            </div>
        `;
    }

    const chName = document.getElementById(`name${ch}`).innerText;
    const titleText = `${ch+1} - ${chName === '...' ? `CH ${ch+1}` : chName}`;

    body.style.flexDirection = 'column';
    body.style.alignItems = 'stretch';
    body.innerHTML = `

        <div class="aux-sends-area drag-scroll-area" style="display:flex; overflow-x:auto; flex:1; padding:10px; gap:8px; align-items:center;">
            ${html}
        </div>
    `;
    
    const area = body.querySelector('.drag-scroll-area');
    if (window.enableDragScroll) window.enableDragScroll(area);
}

// Lógica de Nudge para Auxiliares
let auxNudgeTimeout = null;
let auxNudgeInterval = null;

function startAuxNudge(ch, auxIdx, dir) {
    stopAuxNudge();
    nudgeAuxLevel(ch, auxIdx, dir);
    
    auxNudgeTimeout = setTimeout(() => {
        auxNudgeInterval = setInterval(() => {
            nudgeAuxLevel(ch, auxIdx, dir * 3);
        }, 80);
    }, 500);
}

function stopAuxNudge() {
    if (auxNudgeTimeout) clearTimeout(auxNudgeTimeout);
    if (auxNudgeInterval) clearInterval(auxNudgeInterval);
    auxNudgeTimeout = null;
    auxNudgeInterval = null;
}

function nudgeAuxLevel(ch, auxIdx, dir) {
    const currentRaw = (channelStates[ch] && channelStates[ch][`aux${auxIdx}`]) || 0;
    let nRaw = currentRaw + dir;
    if (nRaw < 0) nRaw = 0; if (nRaw > 1023) nRaw = 1023;
    
    // Atualiza UI e Estado
    updateAuxManual(ch, auxIdx, nRaw);
    socket.emit('control', { type: `kInputAUX/kAUX${auxIdx}Level`, channel: ch, value: nRaw });
}

function auxLevelInput(e, ch, auxIdx) {
    const val = parseInt(e.target.value);
    updateAuxManual(ch, auxIdx, val);
    socket.emit('control', { type: `kInputAUX/kAUX${auxIdx}Level`, channel: ch, value: val });
}

function updateAuxManual(ch, auxIdx, val) {
    if (!channelStates[ch]) channelStates[ch] = {};
    channelStates[ch][`aux${auxIdx}`] = val;
    
    if (document.getElementById(`aux_f_${auxIdx}`)) {
        document.getElementById(`aux_f_${auxIdx}`).value = val;
        document.getElementById(`aux_v_${auxIdx}`).innerText = rawToDb(val);
    }
}

function toggleAuxOn(ch, auxIdx) {
    const type = `kInputAUX/kAUX${auxIdx}On`;
    if (!channelStates[ch]) channelStates[ch] = {};
    
    const newVal = !channelStates[ch][`aux${auxIdx}On`];
    channelStates[ch][`aux${auxIdx}On`] = newVal;
    
    const btn = document.getElementById(`aux_on_${auxIdx}`);
    if (btn) btn.classList.toggle('on-active', newVal);
    socket.emit('control', { type, channel: ch, value: newVal ? 1 : 0 });
}

function updateAuxFromSocket(ch, type, value) {
    if (!channelStates[ch]) channelStates[ch] = {};
    const match = type.match(/kInputAUX\/kAUX(\d+)(Level|On)/);
    if (!match) return;
    
    const auxIdx = parseInt(match[1]);
    const subType = match[2];
    
    if (subType === 'Level') {
        channelStates[ch][`aux${auxIdx}`] = value;
        if (activeConfigChannel === ch && document.getElementById(`aux_f_${auxIdx}`)) {
            document.getElementById(`aux_f_${auxIdx}`).value = value;
            document.getElementById(`aux_v_${auxIdx}`).innerText = rawToDb(value);
        }
    } else if (subType === 'On') {
        const isTrue = (value === 1 || value === true);
        channelStates[ch][`aux${auxIdx}On`] = isTrue;
        if (activeConfigChannel === ch && document.getElementById(`aux_on_${auxIdx}`)) {
            document.getElementById(`aux_on_${auxIdx}`).classList.toggle('on-active', isTrue);
        }
    }
}
