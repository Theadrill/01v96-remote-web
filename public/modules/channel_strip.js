function updateUI(ch, val, onState, soloState) {
    if (ch >= NUM_CHANNELS) return; 

    if (val !== undefined && val !== null) {
        document.getElementById(`f${ch}`).value = val;
        document.getElementById(`v${ch}`).innerText = rawToDb(val);
        channelStates[ch].value = val;
    }
    if (onState !== undefined && onState !== null) {
        channelStates[ch].on = onState;
        document.getElementById(`on${ch}`).classList.toggle('on-active', onState);
    }
    if (soloState !== undefined && soloState !== null) {
        channelStates[ch].solo = soloState;
        document.getElementById(`solo${ch}`).classList.toggle('solo-active', soloState);
    }
}

function createChannelStrip(i) {
    return `
        <div class="fader-card" onclick="openChannelConfig(event, ${i})" style="cursor: pointer;">
            <div style="width:100%; display:flex; flex-direction:column; align-items:center;">
                <h2 class="card-title">CH ${i + 1}</h2>
                <div id="name${i}" class="ch-name">...</div>
                
                <button id="solo${i}" class="btn-state" onclick="toggleState('SOLO_INPUT', ${i})">Solo</button>
                <button id="on${i}" class="btn-state" onclick="toggleState('MUTE_INPUT', ${i})">On</button>
            </div>
            
            <div style="flex:1; width:100%; display:flex; flex-direction:column; align-items:center; touch-action: pan-x;">
                <div class="nudge-zone" onpointerdown="startNudge(${i}, 1)" onpointerup="stopNudge()" onpointerleave="stopNudge()" onpointercancel="stopNudge()" oncontextmenu="return false;">
                    <button class="btn-nudge pointer-none">+</button>
                </div>
                
                <input type="range" id="f${i}" min="0" max="1023" value="0" orient="vertical" oninput="faderInput(event, ${i})">
                
                <div class="nudge-zone" onpointerdown="startNudge(${i}, -1)" onpointerup="stopNudge()" onpointerleave="stopNudge()" onpointercancel="stopNudge()" oncontextmenu="return false;">
                    <button class="btn-nudge pointer-none">-</button>
                    <h1 id="v${i}" class="fader-val">-∞</h1>
                </div>
            </div>
        </div>
    `;
}

function initUI() {
    let html = '';
    for (let i = 0; i < NUM_CHANNELS; i++) {
        html += createChannelStrip(i);
    }
    container.innerHTML = html;
}
