function renderAuxs(ch) {
    const body = document.querySelector('.ch-modal-body');
    
    // 01V96: Saídas não têm Aux Sends (exceto para Matrix, que é outro módulo)
    if (ch >= 36) {
        body.innerHTML = `
            <div style="flex:1; display:flex; flex-direction:column; align-items:center; justify-content:center; color:#666; padding:20px; text-align:center;">
                <div style="font-size:48px; margin-bottom:15px; opacity:0.3;">
                    <i class="fas fa-project-diagram"></i>
                </div>
                <div style="font-size:14px; font-weight:bold; text-transform:uppercase; letter-spacing:1px;">
                    Sends Não Disponíveis
                </div>
                <div style="font-size:12px; margin-top:5px; opacity:0.7;">
                    Canais de saída não possuem barramentos de envio auxiliares.
                </div>
            </div>
        `;
        return;
    }

    let html = '';
    const state = getChannelStateById(ch);

    for (let i = 1; i <= 8; i++) {
        const currentVal = (state && state[`aux${i}`]) || 0;
        const isOn = (state && state[`aux${i}On`]) || false;

        if (layoutMode === 'desktop') {
            html += createDesktopStrip({
                id: i,
                elId: `aux_card_${i}`,
                evtCh: `${ch}, ${i}`,
                title: `AUX ${i}`,
                name: `AUX ${i}`,
                customClass: "fader-group-aux",
                onAction: `toggleAuxOn(${ch}, ${i})`,
                onWheelAction: "auxWheelInput",
                onInputAction: "auxLevelInput",
                onNudgeStartAction: "startAuxNudge",
                onNudgeStopAction: "stopAuxNudge",
                type: "aux",
                val: currentVal,
                dbLabel: rawToDb(currentVal),
                isOn: isOn,
                ids: { 
                    f: `aux_f_${i}`, 
                    v: `aux_v_${i}`, 
                    on: `aux_on_${i}`, 
                    label: `aux_label_${i}`,
                    name: `aux_name_display_${i}` 
                }
            });
        } else {
            html += createMobileStrip({
                id: i,
                title: `AUX ${i}`,
                name: `AUX ${i}`,
                customClass: "fader-group-aux",
                onAction: `toggleAuxOn(${ch}, ${i})`,
                onInputAction: "auxLevelInput",
                onNudgeStartAction: "startAuxNudge",
                onNudgeStopAction: "stopAuxNudge",
                val: currentVal,
                dbLabel: rawToDb(currentVal),
                isOn: isOn,
                evtCh: `${ch}, ${i}`,
                ids: {
                    f: `aux_f_${i}`,
                    v: `aux_v_${i}`,
                    on: `aux_on_${i}`,
                    name: `aux_name_display_${i}`
                }
            });
        }
    }

    body.style.flexDirection = 'column';
    body.style.alignItems = 'stretch';
    body.innerHTML = `
        <div class="aux-sends-area drag-scroll-area" style="display:flex; overflow-x:auto; flex:1; padding:0; gap:0; align-items:stretch;">
            ${html}
        </div>
    `;

    const area = body.querySelector('.drag-scroll-area');
    if (area && window.enableDragScroll) window.enableDragScroll(area);
}

function auxWheelInput(e, ch, auxIdx) {
    if (layoutMode !== 'desktop') return;
    e.preventDefault();
    e.stopPropagation();
    const state = getChannelStateById(ch);
    const currentRaw = (state && state[`aux${auxIdx}`]) || 0;
    const delta = e.deltaY < 0 ? 10 : -10;
    let nRaw = currentRaw + delta;
    if (nRaw < 0) nRaw = 0; if (nRaw > 1023) nRaw = 1023;
    updateAuxManual(ch, auxIdx, nRaw);
    socket.emit('control', { type: `kInputAUX/kAUX${auxIdx}Level`, channel: ch, value: nRaw });
}

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
    const state = getChannelStateById(ch);
    const currentRaw = (state && state[`aux${auxIdx}`]) || 0;
    const nRaw = getSteppedRaw(currentRaw, dir, 0.5);

    updateAuxManual(ch, auxIdx, nRaw);
    socket.emit('control', { type: `kInputAUX/kAUX${auxIdx}Level`, channel: ch, value: nRaw });
}

function auxLevelInput(e, ch, auxIdx) {
    if (!e.isTrusted || !appReady) return;
    const val = parseInt(e.target.value);
    updateAuxManual(ch, auxIdx, val);
    socket.emit('control', { type: `kInputAUX/kAUX${auxIdx}Level`, channel: ch, value: val });
}

function updateAuxManual(ch, auxIdx, val) {
    const state = getChannelStateById(ch);
    if (state) state[`aux${auxIdx}`] = val;

    if (document.getElementById(`aux_f_${auxIdx}`)) {
        document.getElementById(`aux_f_${auxIdx}`).value = val;
        document.getElementById(`aux_v_${auxIdx}`).innerText = rawToDb(val);
    }
}

function toggleAuxOn(ch, auxIdx) {
    if (!appReady) return;
    const type = `kInputAUX/kAUX${auxIdx}On`;
    const state = getChannelStateById(ch);
    if (!state) return;

    const newVal = !state[`aux${auxIdx}On`];
    state[`aux${auxIdx}On`] = newVal;

    const btn = document.getElementById(`aux_on_${auxIdx}`);
    if (btn) btn.classList.toggle('on-active', newVal);
    socket.emit('control', { type, channel: ch, value: newVal ? 1 : 0 });
}

/**
 * [CRITICAL] Apenas canais de entrada recebem atualizações de AUX Send.
 */
function updateAuxFromSocket(ch, type, value) {
    const state = getChannelStateById(ch);
    if (!state) return;
    const match = type.match(/kInputAUX\/kAUX(\d+)(Level|On)/);
    if (!match) return;

    const auxIdx = parseInt(match[1]);
    const subType = match[2];

    if (subType === 'Level') {
        state[`aux${auxIdx}`] = value;
        if (activeConfigChannel === ch && document.getElementById(`aux_f_${auxIdx}`)) {
            document.getElementById(`aux_f_${auxIdx}`).value = value;
            document.getElementById(`aux_v_${auxIdx}`).innerText = rawToDb(value);
        }
    } else if (subType === 'On') {
        const isTrue = (value === 1 || value === true);
        state[`aux${auxIdx}On`] = isTrue;
        if (activeConfigChannel === ch && document.getElementById(`aux_on_${auxIdx}`)) {
            document.getElementById(`aux_on_${auxIdx}`).classList.toggle('on-active', isTrue);
        }
    }
}
