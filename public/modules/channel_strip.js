function updateUI(ch, val, onState, soloState) {
    if (ch !== 'master' && ch >= NUM_CHANNELS) return; 
    let stateRef = (ch === 'master') ? masterState : channelStates[ch];

    if (val !== undefined && val !== null) {
        const elF = document.getElementById(`f${ch}`);
        if(elF) elF.value = val;
        const elV = document.getElementById(`v${ch}`);
        if(elV) elV.innerText = rawToDb(val);
        
        // Se no modo músico, salvamos no AUX correspondente
        if (musicianMode && ch !== 'master') {
            stateRef[`aux${activeMix}`] = val;
        } else if(stateRef) {
            stateRef.value = val;
        }
    }
    if (onState !== undefined && onState !== null) {
        if (musicianMode && ch !== 'master') {
            stateRef[`aux${activeMix}On`] = onState;
        } else if(stateRef) {
            stateRef.on = onState;
        }
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
    const title = isMaster ? "STEREO" : `CH ${i + 1}`;
    const nameDiv = isMaster ? "MASTER" : "...";
    const customClass = isMaster ? "master-card" : "";
    
    let onAction = isMaster ? "toggleState('kStereoChannelOn/kChannelOn', 'master')" : `toggleState('kInputChannelOn/kChannelOn', ${i})`;
    const evtCh = isMaster ? "'master'" : i;

    if (musicianMode && !isMaster) {
        onAction = `toggleState('kInputAUX/kAUX${activeMix}On', ${i})`;
    }

    const configAction = musicianMode ? "" : `openChannelConfig(event, ${i})`;

    return `
        <div class="fader-card ${customClass}">
            <div class="ch-clickable-zone" onclick="${isMaster ? '' : configAction}">
                <h2 class="card-title">${title}</h2>
                <div id="name${isMaster ? 'master' : i}" class="ch-name">${nameDiv}</div>
            </div>
            
            ${(!isMaster && !musicianMode) ? `<button id="solo${i}" class="btn-state" onclick="toggleState('kSetupSoloChOn/kSoloChOn', ${i})">Solo</button>` : ''}
            <button id="on${isMaster ? 'master' : i}" class="btn-state" onclick="${onAction}">On</button>

            <div class="nudge-zone" onpointerdown="startNudge(${evtCh}, 1)" onpointerup="stopNudge()" onpointerleave="stopNudge()" onpointercancel="stopNudge()" oncontextmenu="return false;" onclick="event.stopPropagation()">
                <button class="btn-nudge pointer-none">+</button>
            </div>
            
            <input type="range" id="f${isMaster ? 'master' : i}" min="0" max="1023" value="0" orient="vertical" oninput="faderInput(event, ${evtCh})" onclick="event.stopPropagation()">
            
            <div class="ch-clickable-zone mt-auto" onclick="${isMaster ? '' : configAction}">
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
    
    const sidebar = document.querySelector('.sidebar');
    if (musicianMode) {
        // Remove banner de topo legado se ainda existir
        const oldH = document.getElementById('musician-header');
        if (oldH) oldH.remove();

        sidebar.classList.add('sidebar-musician');
        document.getElementById('mainNav').style.display = 'none';
        document.getElementById('chNav').style.display = 'none';
        document.getElementById('chContext').style.display = 'none';
        document.getElementById('sideFooter').style.display = 'flex';
        
        // Exibe o botão de saída estático do músico
        const mExit = document.getElementById('musicianExitBtn');
        if (mExit) mExit.style.display = 'block';

        const tExit = document.getElementById('tecnicoExitBtn');
        if (tExit) tExit.style.display = 'none';

        // Garante o indicador no fone
        let indicator = document.getElementById('foneIndicator');
        if (!indicator) {
            indicator = document.createElement('div');
            indicator.id = 'foneIndicator';
            indicator.className = 'fone-indicator';
            // Insere antes do rodapé
            sidebar.insertBefore(indicator, document.getElementById('sideFooter'));
        }
        indicator.innerText = `FONE ${activeMix}`;
        
        container.style.marginTop = "0";
    } else {
        sidebar.classList.remove('sidebar-musician');
        document.getElementById('mainNav').style.display = 'flex';
        document.getElementById('sideFooter').style.display = 'flex';
        document.getElementById('chContext').style.display = 'none';
        
        const mExit = document.getElementById('musicianExitBtn');
        if (mExit) mExit.style.display = 'none';
        
        const tExit = document.getElementById('tecnicoExitBtn');
        if (tExit) tExit.style.display = 'block';

        const mInd = document.getElementById('foneIndicator');
        if (mInd) mInd.remove();
    }

    for (let i = 0; i < NUM_CHANNELS; i++) {
        html += createChannelStrip(i, false);
    }
    
    if (!musicianMode) html += createChannelStrip(0, true);
    
    container.innerHTML = html;

    if (musicianMode) {
        for (let i = 0; i < NUM_CHANNELS; i++) {
            const auxVal = (channelStates[i] && channelStates[i][`aux${activeMix}`]) || 0;
            const auxOn = (channelStates[i] && channelStates[i][`aux${activeMix}On`]) || false;
            updateUI(i, auxVal, auxOn, undefined);
        }
    }
}
