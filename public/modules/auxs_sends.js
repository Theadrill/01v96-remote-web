function renderAuxs(ch) {
    const body = document.querySelector('.ch-modal-body');
    
    // 01V96: Buses (44-51) e Master (52) realmente não possuem envios.
    if (ch >= 44) {
        body.innerHTML = `
            <div style="flex:1; display:flex; flex-direction:column; align-items:center; justify-content:center; color:#666; padding:20px; text-align:center;">
                <div style="font-size:48px; margin-bottom:15px; opacity:0.3;"><i class="fas fa-project-diagram"></i></div>
                <div style="font-size:14px; font-weight:bold; text-transform:uppercase;">Sends Não Disponíveis</div>
            </div>`;
        return;
    }

    let html = '';
    
    // --- MODO 1: MIXER DO BARRAMENTO (Se clicou em MIX 1-8, mostra os 32 canais enviando para ele) ---
    if (ch >= 36 && ch <= 43) {
        const auxIdx = ch - 35; // Mix 1 (36) vira Aux 1
        for (let i = 0; i < 32; i++) {
            const state = getChannelStateById(i);
            const currentVal = (state && state[`aux${auxIdx}`]) || 0;
            const isOn = (state && state[`aux${auxIdx}On`]) || false;
            const chName = (state && state.name && state.name.trim() !== "") ? state.name : `CH ${i+1}`;

            const config = {
                id: i,
                title: chName,
                name: chName,
                customClass: "fader-group-aux-send",
                onAction: `toggleAuxOn(${i}, ${auxIdx})`,
                onInputAction: "auxLevelInput",
                onNudgeStartAction: "startAuxNudge",
                onNudgeStopAction: "stopAuxNudge",
                val: currentVal,
                dbLabel: rawToDb(currentVal),
                isOn: isOn,
                evtCh: `${i}, ${auxIdx}`,
                ids: { f: `aux_f_ch_${i}`, v: `aux_v_ch_${i}`, on: `aux_on_ch_${i}`, name: `aux_name_ch_${i}` }
            };
            html += (layoutMode === 'desktop') ? createDesktopStrip(config) : createMobileStrip(config);
        }
    } 
    // --- MODO 2: ENVIOS DO CANAL (Se clicou em CH 1-32, mostra os 8 botões de Aux) ---
    else {
        const state = getChannelStateById(ch);
        for (let i = 1; i <= 8; i++) {
            const currentVal = (state && state[`aux${i}`]) || 0;
            const isOn = (state && state[`aux${i}On`]) || false;
            
            const config = {
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
                ids: { f: `aux_f_${i}`, v: `aux_v_${i}`, on: `aux_on_${i}`, name: `aux_name_display_${i}` }
            };
            html += (layoutMode === 'desktop') ? createDesktopStrip(config) : createMobileStrip(config);
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
    if (!appReady) return;
    const val = parseInt(e.target.value);
    updateAuxManual(ch, auxIdx, val);
    socket.emit('control', { type: `kInputAUX/kAUX${auxIdx}Level`, channel: ch, value: val });
}

function updateAuxManual(ch, auxIdx, val) {
    const state = getChannelStateById(ch);
    if (state) state[`aux${auxIdx}`] = val;

    const fader = document.getElementById(`aux_f_${auxIdx}`) || document.getElementById(`aux_f_ch_${ch}`);
    const valDisplay = document.getElementById(`aux_v_${auxIdx}`) || document.getElementById(`aux_v_ch_${ch}`);
    
    if (fader) fader.value = val;
    if (valDisplay) valDisplay.innerText = rawToDb(val);
}

function toggleAuxOn(ch, auxIdx) {
    if (!appReady) return;
    const type = `kInputAUX/kAUX${auxIdx}On`;
    const state = getChannelStateById(ch);
    if (!state) return;

    const newVal = !state[`aux${auxIdx}On`];
    state[`aux${auxIdx}On`] = newVal;

    const btn = document.getElementById(`aux_on_${auxIdx}`) || document.getElementById(`aux_on_ch_${ch}`);
    if (btn) btn.classList.toggle('on-active', newVal);
    socket.emit('control', { type, channel: ch, value: newVal ? 1 : 0 });
}

function updateAuxFromSocket(ch, type, value) {
    const state = getChannelStateById(ch);
    if (!state) return;
    const match = type.match(/kInputAUX\/kAUX(\d+)(Level|On)/);
    if (!match) return;

    const auxIdx = parseInt(match[1]);
    const subType = match[2];

    if (subType === 'Level') {
        state[`aux${auxIdx}`] = value;
        const targetFaderMix = document.getElementById(`aux_f_ch_${ch}`);
        if (activeConfigChannel >= 36 && activeConfigChannel <= 43 && (activeConfigChannel - 35) === auxIdx && targetFaderMix) {
            targetFaderMix.value = value;
            const targetValMix = document.getElementById(`aux_v_ch_${ch}`);
            if (targetValMix) targetValMix.innerText = rawToDb(value);
        } else if (activeConfigChannel === ch) {
            const targetFaderCh = document.getElementById(`aux_f_${auxIdx}`);
            if (targetFaderCh) {
                targetFaderCh.value = value;
                const targetValCh = document.getElementById(`aux_v_${auxIdx}`);
                if (targetValCh) targetValCh.innerText = rawToDb(value);
            }
        }
    } else if (subType === 'On') {
        const isTrue = (value === 1 || value === true);
        state[`aux${auxIdx}On`] = isTrue;
        const targetOnMix = document.getElementById(`aux_on_ch_${ch}`);
        if (activeConfigChannel >= 36 && activeConfigChannel <= 43 && (activeConfigChannel - 35) === auxIdx && targetOnMix) {
            targetOnMix.classList.toggle('on-active', isTrue);
        } else if (activeConfigChannel === ch) {
            const targetOnCh = document.getElementById(`aux_on_${auxIdx}`);
            if (targetOnCh) targetOnCh.classList.toggle('on-active', isTrue);
        }
    }
}
