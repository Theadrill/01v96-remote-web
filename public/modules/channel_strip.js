function updateUI(ch, val, onState, soloState) {
    let stateRef;
    if (ch === 'master') stateRef = masterState;
    else if (typeof ch === 'string' && ch.startsWith('m')) stateRef = mixesState[ch.substring(1)];
    else if (typeof ch === 'string' && ch.startsWith('b')) stateRef = busesState[ch.substring(1)];
    else stateRef = channelStates[ch];

    if (!stateRef) return;

    if (val !== undefined && val !== null) {
        const elF = document.getElementById(`f${ch}`);
        if(elF) elF.value = val;
        const elV = document.getElementById(`v${ch}`);
        if(elV) elV.innerText = rawToDb(val);
        
        // Se no modo músico ou modo técnico editando mix, salvamos no AUX correspondente
        if ((musicianMode || technicianMixMode) && typeof ch === 'number') {
            stateRef[`aux${activeMix}`] = val;
        } else {
            stateRef.value = val;
        }
    }
    if (onState !== undefined && onState !== null) {
        if ((musicianMode || technicianMixMode) && typeof ch === 'number') {
            stateRef[`aux${activeMix}On`] = onState;
        } else {
            stateRef.on = onState;
        }
        const elOn = document.getElementById(`on${ch}`);
        if(elOn) elOn.classList.toggle('on-active', onState);
    }
    if (typeof ch === 'number' && soloState !== undefined && soloState !== null) {
        if(stateRef) stateRef.solo = soloState;
        const elSolo = document.getElementById(`solo${ch}`);
        if(elSolo) elSolo.classList.toggle('solo-active', soloState);
    }
}

function createChannelStrip(i, isMaster = false) {
    const title = isMaster ? "STEREO" : `CH ${i + 1}`;
    const nameDiv = isMaster ? "MASTER" : "...";
    
    let customClass = "";
    if (isMaster) {
        customClass = "master-card";
    } else {
        if (i < 16) {
            customClass = "fader-group-1";
        } else if (i < 32) {
            customClass = "fader-group-2";
        }
    }
    
    let onAction = isMaster ? "toggleState('kStereoChannelOn/kChannelOn', 'master')" : `toggleState('kInputChannelOn/kChannelOn', ${i})`;
    const evtCh = isMaster ? "'master'" : i;

    if ((musicianMode || technicianMixMode) && !isMaster) {
        onAction = `toggleState('kInputAUX/kAUX${activeMix}On', ${i})`;
    }

    const configAction = (musicianMode || technicianMixMode) ? "" : `openChannelConfig(event, ${i})`;

    return `
        <div class="fader-card ${customClass}">
            <div class="ch-clickable-zone" onclick="${isMaster ? '' : configAction}">
                <h2 class="card-title">${title}</h2>
                <div id="name${isMaster ? 'master' : i}" class="ch-name">${nameDiv}</div>
            </div>
            
            ${(!isMaster && !musicianMode && !technicianMixMode) ? `<button id="solo${i}" class="btn-state" onclick="toggleState('kSetupSoloChOn/kSoloChOn', ${i})">Solo</button>` : ''}
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

function createOutputStrip(i, type) { 
    const prefix = type === 'mix' ? 'm' : 'b';
    const title = type === 'mix' ? `MIX ${i + 1}` : `BUS ${i + 1}`;
    const cmdPrefix = type === 'mix' ? 'kAUX' : 'kBus';
    
    let customClass = type === 'mix' ? "fader-group-mix" : "fader-group-bus";
    let onAction = `toggleState('${cmdPrefix}ChannelOn/kChannelOn', '${prefix}${i}')`;
    const evtCh = `'${prefix}${i}'`;

    return `
        <div class="fader-card ${customClass}">
            <div class="ch-clickable-zone" onclick="${type === 'mix' ? `enterTechnicianMixMode(${i})` : ''}">
                <h2 class="card-title" style="color: ${type === 'mix' ? '#ffcc00' : '#00ffcc'}">${title}</h2>
                <div id="name${prefix}${i}" class="ch-name">${title}</div>
            </div>
            
            <button id="on${prefix}${i}" class="btn-state" onclick="${onAction}">On</button>

            <div class="nudge-zone" onpointerdown="startNudge(${evtCh}, 1)" onpointerup="stopNudge()" onpointerleave="stopNudge()" onpointercancel="stopNudge()" oncontextmenu="return false;" onclick="event.stopPropagation()">
                <button class="btn-nudge pointer-none">+</button>
            </div>
            
            <input type="range" id="f${prefix}${i}" min="0" max="1023" value="0" orient="vertical" oninput="faderInput(event, ${evtCh})" onclick="event.stopPropagation()">
            
            <div class="ch-clickable-zone mt-auto" onclick="${type === 'mix' ? `enterTechnicianMixMode(${i})` : ''}">
                <div class="nudge-zone" onpointerdown="startNudge(${evtCh}, -1)" onpointerup="stopNudge()" onpointerleave="stopNudge()" onpointercancel="stopNudge()" oncontextmenu="return false;" onclick="event.stopPropagation()">
                    <button class="btn-nudge pointer-none">-</button>
                    <h1 id="v${prefix}${i}" class="fader-val">-∞</h1>
                </div>
            </div>
        </div>
    `;
}

function initUI() {
    if (window.resetFaderCache) window.resetFaderCache();
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
            sidebar.insertBefore(indicator, document.getElementById('sideFooter'));
        }
        indicator.innerText = `FONE ${activeMix}`;
        container.style.marginTop = "0";
    } else {
        sidebar.classList.remove('sidebar-musician');
        // Mantém o menu principal visível para técnicos, mas esconde em technicianMixMode
        document.getElementById('mainNav').style.display = (musicianMode || technicianMixMode) ? 'none' : 'flex';
        // MOSTRA o painel de contexto do OUTS ou Technico Mix
        document.getElementById('outsContext').style.display = (outsMode && !musicianMode) ? 'flex' : 'none';
        
        // Novo container de contexto para Técnico Mix
        const tmContext = document.getElementById('techMixContext');
        if (tmContext) tmContext.style.display = technicianMixMode ? 'flex' : 'none';

        document.getElementById('sideFooter').style.display = 'flex';
        document.getElementById('chContext').style.display = 'none';
        
        const mExit = document.getElementById('musicianExitBtn');
        if (mExit) mExit.style.display = 'none';
        
        // Esconde apenas o desconectar técnico quando estiver na visão de saídas ou editando mix
        const tExit = document.getElementById('tecnicoExitBtn');
        if (tExit) tExit.style.display = (outsMode || musicianMode || technicianMixMode) ? 'none' : 'block';

        const mInd = document.getElementById('foneIndicator');
        if (mInd && !technicianMixMode) mInd.remove();
        
        if (technicianMixMode) {
            let indicator = document.getElementById('foneIndicator');
            if (!indicator) {
                indicator = document.createElement('div');
                indicator.id = 'foneIndicator';
                indicator.className = 'fone-indicator';
                // Adiciona cor amarelo/alaranjado para diferenciar do modo músico (opcional, mas bom pra UX)
                indicator.style.color = '#ffcc00'; 
                sidebar.insertBefore(indicator, document.getElementById('sideFooter'));
            }
            indicator.innerText = `MIX ${activeMix}`;
        }
        
        // Atualiza o título na sidebar do modo técnico mix
        const tmTitle = document.getElementById('techMixTitle');
        if (tmTitle) {
            const mixData = mixesState[activeMix-1];
            tmTitle.innerText = `${activeMix} - ${mixData ? mixData.name : `MIX ${activeMix}`}`;
        }
    }

    if (outsMode && !musicianMode && !technicianMixMode) {
        for (let i = 0; i < 8; i++) html += createOutputStrip(i, 'mix');
        for (let i = 0; i < 8; i++) html += createOutputStrip(i, 'bus');
    } else {
        for (let i = 0; i < NUM_CHANNELS; i++) {
            html += createChannelStrip(i, false);
        }
    }
    
    if (!musicianMode && !technicianMixMode) html += createChannelStrip(0, true);
    
    container.innerHTML = html;
    
    // Atualiza os estados visuais
    if (outsMode && !musicianMode && !technicianMixMode) {
        for (let i = 0; i < 8; i++) {
            updateUI(`m${i}`, mixesState[i].value, mixesState[i].on, undefined);
            updateUI(`b${i}`, busesState[i].value, busesState[i].on, undefined);
        }
    } else {
        for (let i = 0; i < NUM_CHANNELS; i++) {
            const state = channelStates[i];
            if (!state) continue;
            if (musicianMode || technicianMixMode) {
                updateUI(i, state[`aux${activeMix}`] || 0, state[`aux${activeMix}On`] || false, undefined);
            } else {
                updateUI(i, state.value, state.on, state.solo);
            }
            const nameEl = document.getElementById(`name${i}`);
            if (nameEl) nameEl.innerText = state.name || `CH ${i + 1}`;
        }
    }
    if (!technicianMixMode || !outsMode) {
        updateUI('master', masterState.value, masterState.on, undefined);
    }
}
