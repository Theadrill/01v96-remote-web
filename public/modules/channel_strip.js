function getFaderScaleHTML(isMaster) {
    const marks = isMaster ? [
        { d: 0, l: '0' },
        { d: -2.5, l: '' },
        { d: -5, l: '5' },
        { d: -7.5, l: '' },
        { d: -10, l: '10' },
        { d: -12.5, l: '' },
        { d: -15, l: '15' },
        { d: -17.5, l: '' },
        { d: -20, l: '20' },
        { d: -25, l: '25' },
        { d: -30, l: '30' },
        { d: -40, l: '40' },
        { d: -50, l: '50' },
        { d: -60, l: '60' },
        { d: -138, l: '-∞'}
    ] : [
        { d: 10, l: '+10' },
        { d: 7.5, l: '' },
        { d: 5, l: '5' },
        { d: 2.5, l: '' },
        { d: 0, l: '0' },
        { d: -2.5, l: '' },
        { d: -5, l: '5' },
        { d: -7.5, l: '' },
        { d: -10, l: '10' },
        { d: -12.5, l: '' },
        { d: -15, l: '15' },
        { d: -17.5, l: '' },
        { d: -20, l: '20' },
        { d: -25, l: '' },
        { d: -30, l: '30' },
        { d: -40, l: '40' },
        { d: -50, l: '50' },
        { d: -60, l: '' },
        { d: -138, l: '-∞'}
    ];

    let html = '<div class="desk-db-scale">';
    marks.forEach(m => {
        let r;
        if (m.l === '-∞') r = 0;
        else r = dbToRaw(isMaster ? m.d + 10 : m.d);
        const p = (r / 1023) * 100;
        html += `<div class="desk-db-item" style="bottom: ${p}%">${m.l ? `<span>${m.l}</span>` : ''}<div class="tick ${m.l ? '' : 'tick-small'}"></div></div>`;
    });
    html += '</div>';
    return html;
}


function updateUI(ch, val, onState, soloState) {

    const isMaster = ch === 'master';
    let stateRef;
    if (isMaster) stateRef = masterState;
    else if (typeof ch === 'string' && ch.startsWith('m')) stateRef = mixesState[ch.substring(1)];
    else if (typeof ch === 'string' && ch.startsWith('b')) stateRef = busesState[ch.substring(1)];
    else stateRef = channelStates[ch];

    if (!stateRef) return;

    if (val !== undefined && val !== null) {
        const elF = document.getElementById(`f${ch}`);
        if(elF) elF.value = val;
        const elV = document.getElementById(`v${ch}`);
        if(elV) elV.innerText = rawToDb(val, layoutMode !== 'desktop', isMaster);
        
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
        
        // Novo: Subtle yellow background for desktop layout when channel is ON
        const elCard = document.getElementById(`card${ch}`);
        if(elCard && layoutMode === 'desktop') elCard.classList.toggle('desk-on-bg', onState);
    }
    if (typeof ch === 'number' && soloState !== undefined && soloState !== null) {
        if(stateRef) stateRef.solo = soloState;
        const elSolo = document.getElementById(`solo${ch}`);
        if(elSolo) elSolo.classList.toggle('solo-active', soloState);
    }
}

function createDesktopChannelStrip(i, isMaster = false) {
    const title = isMaster ? "MASTER" : `${i + 1}`;
    const nameDiv = isMaster ? "MASTER" : "...";
    
    let customClass = isMaster ? "master-card-desktop" : "";
    let onAction = isMaster ? "toggleState('kStereoChannelOn/kChannelOn', 'master')" : `toggleState('kInputChannelOn/kChannelOn', ${i})`;
    const evtCh = isMaster ? "'master'" : i;

    if ((musicianMode || technicianMixMode) && !isMaster) {
        onAction = `toggleState('kInputAUX/kAUX${activeMix}On', ${i})`;
    }

    const configAction = (musicianMode || technicianMixMode) ? "" : `openChannelConfig(event, ${i})`;

    return `
        <div class="fader-card-desktop ${customClass}" id="card${isMaster ? 'master' : i}">
            <div class="desk-label">${title}</div>
            
            ${(!isMaster && !musicianMode && !technicianMixMode) ? 
                `<button id="solo${i}" class="btn-cue" onclick="toggleState('kSetupSoloChOn/kSoloChOn', ${i})">SOLO</button>` : 
                `<div class="btn-cue-placeholder"></div>`}
            
            <div class="desk-ch-name-zone" onclick="${isMaster ? '' : configAction}">
                <div id="name${isMaster ? 'master' : i}" class="desk-ch-name">${nameDiv}</div>
            </div>

            <button id="on${isMaster ? 'master' : i}" class="btn-on-desk" onclick="${onAction}">ON</button>

            <div class="nudge-zone-desk" onpointerdown="startNudge(${evtCh}, 1)" onpointerup="stopNudge()" onpointerleave="stopNudge()" onpointercancel="stopNudge()" onclick="event.stopPropagation()">
                <button class="btn-nudge-desk">+</button>
            </div>

            <div class="desk-db-val">
                <span id="v${isMaster ? 'master' : i}">-∞</span>
            </div>

            <div class="desk-fader-container" onwheel="handleWheelFader(event, ${evtCh})">
                ${getFaderScaleHTML(isMaster)}
                <input type="range" id="f${isMaster ? 'master' : i}" min="0" max="1023" value="0" orient="vertical" oninput="faderInput(event, ${evtCh})">
                <div class="desk-meter-container" style="display: flex; flex-direction: column; align-items: center; margin-left: 2px; height: 100%;">
                    <div id="p${isMaster ? 'master' : i}" class="desk-peak-led"></div>
                    <div class="desk-meter-wrap" style="margin-left: 0; margin-top: 5px; flex: 1; max-height: 92%;">
                        <div class="desk-meter-curtain" id="m${isMaster ? 'master' : i}"></div>
                    </div>
                </div>
            </div>


            <div class="nudge-zone-desk" onpointerdown="startNudge(${evtCh}, -1)" onpointerup="stopNudge()" onpointerleave="stopNudge()" onpointercancel="stopNudge()" onclick="event.stopPropagation()">
                <button class="btn-nudge-desk">-</button>
            </div>
            
            <div class="desk-footer-label">${title}</div>
        </div>
    `;
}

function createChannelStrip(i, isMaster = false) {
    if (layoutMode === 'desktop') return createDesktopChannelStrip(i, isMaster);

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
            ${getMobileScaleHTML()}
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
            ${getMobileScaleHTML()}
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

function getMobileScaleHTML() {
    const marks = [10, 5, 0, -5, -10, -20, -30, -50];
    let html = '<div class="mobile-db-scale-overlay">';
    marks.forEach(db => {
        const raw = dbToRaw(db);
        // Inverte a lógica: o topo do card (0%) é o +10dB, a base (100%) é o -inf
        const topPercent = 100 - ((raw / 1023) * 100);
        html += `<div class="mobile-db-tick" style="top: ${topPercent}%"><span>${db > 0 ? '+' : ''}${db}</span></div>`;
    });
    // Adiciona o -inf na base (100%)
    html += `<div class="mobile-db-tick" style="top: 100%"><span>-∞</span></div>`;
    html += '</div>';
    return html;
}

function initUI() {
    if (typeof resetFaderCache === 'function') resetFaderCache();
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
    
    let masterHtml = '';
    if (!musicianMode && !technicianMixMode) {
        masterHtml = createChannelStrip(0, true);
    }
    
    const masterContainer = document.getElementById('master-container');
    if (layoutMode === 'desktop' && !musicianMode && !technicianMixMode) {
        container.innerHTML = html;
        if (masterContainer) masterContainer.innerHTML = masterHtml;
    } else {
        container.innerHTML = html + masterHtml;
        if (masterContainer) masterContainer.innerHTML = '';
    }
    
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
