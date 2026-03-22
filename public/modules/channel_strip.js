function updateUI(ch, val, onState, soloState) {
    if (ch !== 'master' && ch >= NUM_CHANNELS) return; 
    let stateRef = (ch === 'master') ? masterState : channelStates[ch];

    if (val !== undefined && val !== null) {
        const elF = document.getElementById(`f${ch}`);
        if(elF) elF.value = val;
        const elV = document.getElementById(`v${ch}`);
        if(elV) elV.innerText = rawToDb(val);
        if(stateRef) stateRef.value = val;
    }
    if (onState !== undefined && onState !== null) {
        if(stateRef) stateRef.on = onState;
        const elOn = document.getElementById(`on${ch}`);
        if(elOn) elOn.classList.toggle('on-active', onState);
    }
    if (ch !== 'master' && soloState !== undefined && soloState !== null) {
        if(stateRef) stateRef.solo = soloState;
        const elSolo = document.getElementById(`solo${ch}`);
        if(elSolo) elSolo.classList.toggle('solo-active', soloState);
    }
}

function createChannelStrip(i, isMaster = false) {
    const chID = isMaster ? "'master'" : i;
    const title = isMaster ? "STEREO" : `CH ${i + 1}`;
    const nameDiv = isMaster ? "MASTER" : "...";
    const customClass = isMaster ? "master-card" : "";
    const onAction = isMaster ? "toggleState('kStereoChannelOn/kChannelOn', 'master')" : `toggleState('kInputChannelOn/kChannelOn', ${i})`;
    const evtCh = isMaster ? "'master'" : i;

    return `
        <div class="fader-card ${customClass}">
            <div class="ch-clickable-zone" onclick="${isMaster ? '' : `openChannelConfig(event, ${i})`}">
                <h2 class="card-title">${title}</h2>
                <div id="name${isMaster ? 'master' : i}" class="ch-name">${nameDiv}</div>
            </div>
            
            ${isMaster ? '<div style="flex:1;"></div>' : `<button id="solo${i}" class="btn-state" onclick="toggleState('kSetupSoloChOn/kSoloChOn', ${i})">Solo</button>`}
            <button id="on${isMaster ? 'master' : i}" class="btn-state" onclick="${onAction}">On</button>

            <div class="nudge-zone" onpointerdown="startNudge(${evtCh}, 1)" onpointerup="stopNudge()" onpointerleave="stopNudge()" onpointercancel="stopNudge()" oncontextmenu="return false;" onclick="event.stopPropagation()">
                <button class="btn-nudge pointer-none">+</button>
            </div>
            
            <input type="range" id="f${isMaster ? 'master' : i}" min="0" max="1023" value="0" orient="vertical" oninput="faderInput(event, ${evtCh})" onclick="event.stopPropagation()">
            
            <div class="ch-clickable-zone mt-auto" onclick="${isMaster ? '' : `openChannelConfig(event, ${i})`}">
                <div class="nudge-zone" onpointerdown="startNudge(${evtCh}, -1)" onpointerup="stopNudge()" onpointerleave="stopNudge()" onpointercancel="stopNudge()" oncontextmenu="return false;" onclick="event.stopPropagation()">
                    <button class="btn-nudge pointer-none">-</button>
                    <h1 id="v${isMaster ? 'master' : i}" class="fader-val">-∞</h1>
                </div>
            </div>
        </div>
    `;
}

function initUI() {
    let html = '';
    for (let i = 0; i < NUM_CHANNELS; i++) {
        html += createChannelStrip(i, false);
    }
    html += createChannelStrip(0, true);
    container.innerHTML = html;
}
