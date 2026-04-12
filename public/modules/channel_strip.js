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
        { d: -138, l: '-∞' }
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
        { d: -138, l: '-∞' }
    ];

    if (musicianMode) return '';
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
        if (elF) elF.value = val;
        const elFMini = document.getElementById(`mini-f${ch}`);
        if (elFMini) elFMini.value = val;

        const elV = document.getElementById(`v${ch}`);
        if (elV) elV.innerText = rawToDb(val, layoutMode !== 'desktop', isMaster);
        const elVMini = document.getElementById(`mini-v${ch}`);
        if (elVMini) elVMini.innerText = rawToDb(val, false, isMaster);

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
        if (elOn) elOn.classList.toggle('on-active', onState);
        const elOnMini = document.getElementById(`mini-on${ch}`);
        if (elOnMini) elOnMini.classList.toggle('on-active', onState);

        // Novo: Subtle yellow background for desktop layout when channel is ON
        const elCard = document.getElementById(`card${ch}`);
        if (elCard && layoutMode === 'desktop') elCard.classList.toggle('desk-on-bg', onState);
        const elCardMini = document.getElementById(`mini-card${ch}`);
        if (elCardMini) elCardMini.classList.toggle('desk-on-bg', onState);

        // Novo: Colorized Label background
        const elLabel = document.getElementById(`label${ch}`);
        if (elLabel && layoutMode === 'desktop') elLabel.classList.toggle('label-on', onState);
        const elLabelMini = document.getElementById(`mini-label${ch}`);
        if (elLabelMini) elLabelMini.classList.toggle('label-on', onState);
    }
    if (typeof ch === 'number' && soloState !== undefined && soloState !== null) {
        if (stateRef) stateRef.solo = soloState;
        const elSolo = document.getElementById(`solo${ch}`);
        if (elSolo) elSolo.classList.toggle('solo-active', soloState);
        const elSoloMini = document.getElementById(`mini-solo${ch}`);
        if (elSoloMini) elSoloMini.classList.toggle('solo-active', soloState);
    }
}
/**
 * 🚨 [CRITICAL SYNC LOGIC]
 * Esta função é o componente universal para faders desktop.
 * ATENÇÃO: As propriedades 'ids' e 'evtCh' são vitais para a sincronização com o servidor.
 * Não altere a lógica de IDs ('f${id}', 'v${id}', etc) sem garantir que o motor de 
 * sincronização em 'socket.js' e 'updateUI' seja atualizado de acordo.
 */
function createDesktopStrip(config) {
    const {
        id,              // ID base
        elId,            // ID do container card
        title,           // Texto no topo/base
        name,            // Texto display verde
        customClass = "",
        onAction,
        configAction = "",
        isMaster = false,
        hasSolo = false,
        evtCh,           // Identificador do socket (0, 'm0', etc)
        onWheelAction = "handleWheelFader",
        onInputAction = "faderInput",
        onNudgeStartAction = "startNudge",
        onNudgeStopAction = "stopNudge",
        type = "main",
        ids = {},        // Overrides de IDs (ex: { f: 'aux_f_1' })
        val = 0,         // Valor inicial do fader
        dbLabel = "-∞",  // Texto inicial do dB
        isOn = false     // Estado ON/OFF inicial
    } = config;

    const pfx = config.idPrefix || "";
    // Resolve IDs: Se não houver override, usa padrao (f0, v0, etc)
    const fId = ids.f || `${pfx}f${id}`;
    const vId = ids.v || `${pfx}v${id}`;
    const onId = ids.on || `${pfx}on${id}`;
    const pId = ids.p || `${pfx}p${id}`;
    const mId = ids.m || `${pfx}m${id}`;
    const nameId = ids.name || `${pfx}name${id}`;
    const labelId = ids.label || `${pfx}label${id}`;

    const wheelCall = `${onWheelAction}(event, ${evtCh})`;
    const inputCall = `${onInputAction}(event, ${evtCh})`;

    return `
        <div class="fader-card-desktop ${customClass}" id="${elId || `${pfx}card${id}`}">
            <div class="desk-label" id="${labelId}" style="cursor: pointer;" onclick="${isMaster ? '' : configAction}">${title}</div>
            
            ${hasSolo ?
            `<button id="solo${id}" class="btn-cue" onclick="toggleState('kSetupSoloChOn/kSoloChOn', ${id})">SOLO</button>` :
            `<div class="btn-cue-placeholder"></div>`}
            
            <div class="desk-ch-name-zone" onclick="${isMaster ? '' : configAction}">
                <div id="${nameId}" class="desk-ch-name">${name}</div>
            </div>

            <button id="${onId}" class="btn-on-desk ${isOn ? 'on-active' : ''}" onclick="${onAction}">ON</button>

            <div class="nudge-zone-desk" onpointerdown="${onNudgeStartAction}(${evtCh}, 1)" onpointerup="${onNudgeStopAction}()" onpointerleave="${onNudgeStopAction}()" onpointercancel="${onNudgeStopAction}()" onclick="event.stopPropagation()">
                <button class="btn-nudge-desk">+</button>
            </div>

            <div class="desk-db-val">
                <span id="${vId}">${dbLabel}</span>
            </div>

            <div class="desk-fader-container" onwheel="${wheelCall}">
                ${getFaderScaleHTML(isMaster)}
                <input type="range" id="${fId}" min="0" max="1023" value="${val}" orient="vertical" oninput="${inputCall}">
                ${type === 'main' ? `
                <div class="desk-meter-container" style="display: flex; flex-direction: column; align-items: center; margin-left: 2px; height: 100%;">
                    <div id="${pId}" class="desk-peak-led"></div>
                    <div class="desk-meter-wrap" style="margin-left: 0; margin-top: 5px; flex: 1; max-height: 92%;">
                        <div class="desk-meter-curtain" id="${mId}"></div>
                    </div>
                </div>` : ''}
            </div>

            <div class="nudge-zone-desk" onpointerdown="${onNudgeStartAction}(${evtCh}, -1)" onpointerup="${onNudgeStopAction}()" onpointerleave="${onNudgeStopAction}()" onpointercancel="${onNudgeStopAction}()" onclick="event.stopPropagation()">
                <button class="btn-nudge-desk">-</button>
            </div>
            
            <div class="desk-footer-label">${title}</div>
        </div>
    `;
}

function createDesktopChannelStrip(i, isMaster = false, idPrefix = "") {
    const s = isMaster ? masterState : channelStates[i];
    const title = isMaster ? "MASTER" : `${i + 1}`;
    const nameDiv = isMaster ? (s.name || "MASTER") : (s.name || "...");
    let customClass = isMaster ? "master-card-desktop" : "";
    if (!isMaster) {
        if (i < 16) customClass += " fader-group-1";
        else if (i < 32) customClass += " fader-group-2";
    }

    let val = s.value;
    let isOn = s.on;
    let solo = !isMaster ? s.solo : false;

    // Se estivermos editando um Mix (Sends on Faders)
    if ((musicianMode || technicianMixMode) && !isMaster) {
        val = s[`aux${activeMix}`] || 0;
        isOn = s[`aux${activeMix}On`] || false;
    }

    let onAction = isMaster ? "toggleState('kStereoChannelOn/kChannelOn', 'master')" : `toggleState('kInputChannelOn/kChannelOn', ${i})`;
    if ((musicianMode || technicianMixMode) && !isMaster) {
        onAction = `toggleState('kInputAUX/kAUX${activeMix}On', ${i})`;
    }

    return createDesktopStrip({
        id: isMaster ? 'master' : i,
        evtCh: isMaster ? "'master'" : i,
        title,
        name: nameDiv,
        customClass,
        isMaster,
        idPrefix,
        hasSolo: !isMaster && !musicianMode && !technicianMixMode,
        onAction,
        val,
        isOn,
        solo,
        dbLabel: rawToDb(val, false, isMaster),
        configAction: musicianMode ? "" : (idPrefix ? "" : `openChannelConfig(event, ${isMaster ? 52 : i})`), // Evita recursão no mini-fader
        type: "main"
    });
}

/**
 * 🚨 [CRITICAL SYNC LOGIC]
 * Componente universal para faders MOBILE.
 */
function createMobileStrip(config) {
    const {
        id,
        title,
        name,
        customClass = "",
        onAction,
        configAction = "",
        isMaster = false,
        hasSolo = false,
        evtCh,
        onInputAction = "faderInput",
        onNudgeStartAction = "startNudge",
        onNudgeStopAction = "stopNudge",
        ids = {},
        val = 0,
        dbLabel = "-∞",
        isOn = false
    } = config;

    const pfx = config.idPrefix || "";
    const fId = ids.f || `${pfx}f${id}`;
    const vId = ids.v || `${pfx}v${id}`;
    const onId = ids.on || `${pfx}on${id}`;
    const soloId = ids.solo || `${pfx}solo${id}`;
    const nameId = ids.name || `${pfx}name${id}`;
    const cardId = ids.card || `${pfx}card${id}`;

    const inputCall = `${onInputAction}(event, ${evtCh})`;

    return `
        <div class="fader-card ${customClass}" id="${cardId}">
            ${getMobileScaleHTML()}
            <div class="ch-clickable-zone" onclick="${isMaster ? '' : configAction}">
                <h2 class="card-title">${title}</h2>
                <div id="${nameId}" class="ch-name">${name}</div>
            </div>
            
            ${hasSolo ? `<button id="${soloId}" class="btn-state" onclick="toggleState('kSetupSoloChOn/kSoloChOn', ${id})">Solo</button>` : ''}
            <button id="${onId}" class="btn-state ${isOn ? 'on-active' : ''}" onclick="${onAction}">On</button>

            <div class="nudge-zone" onpointerdown="${onNudgeStartAction}(${evtCh}, 1)" onpointerup="${onNudgeStopAction}()" onpointerleave="${onNudgeStopAction}()" onpointercancel="${onNudgeStopAction}()" oncontextmenu="return false;" onclick="event.stopPropagation()">
                <button class="btn-nudge pointer-none">+</button>
            </div>
            
            <div class="fader-rotated-container">
                <input type="range" id="${fId}" min="0" max="1023" value="${val}" orient="vertical" oninput="${inputCall}" onclick="event.stopPropagation()">
            </div>
            
            <div class="ch-clickable-zone mt-auto" onclick="${isMaster ? '' : configAction}">
                <div class="nudge-zone" onpointerdown="${onNudgeStartAction}(${evtCh}, -1)" onpointerup="${onNudgeStopAction}()" onpointerleave="${onNudgeStopAction}()" onpointercancel="${onNudgeStopAction}()" oncontextmenu="return false;" onclick="event.stopPropagation()">
                    <button class="btn-nudge pointer-none">-</button>
                    <h1 id="${vId}" class="fader-val">${dbLabel}</h1>
                </div>
            </div>
        </div>
    `;
}

function createChannelStrip(i, isMaster = false, idPrefix = "") {
    if (layoutMode === 'desktop') {
        return createDesktopChannelStrip(i, isMaster, idPrefix);
    }

    const title = isMaster ? "STEREO" : `CH ${i + 1}`;
    const s = isMaster ? masterState : channelStates[i];
    const nameDiv = isMaster ? "MASTER" : (s.name || "...");
    let customClass = isMaster ? "master-card" : "";
    if (!isMaster) {
        if (i < 16) customClass = "fader-group-1";
        else if (i < 32) customClass = "fader-group-2";
    }

    let val = s.value;
    let isOn = s.on;

    if ((musicianMode || technicianMixMode) && !isMaster) {
        val = s[`aux${activeMix}`] || 0;
        isOn = s[`aux${activeMix}On`] || false;
    }

    let onAction = isMaster ? "toggleState('kStereoChannelOn/kChannelOn', 'master')" : `toggleState('kInputChannelOn/kChannelOn', ${i})`;
    if ((musicianMode || technicianMixMode) && !isMaster) {
        onAction = `toggleState('kInputAUX/kAUX${activeMix}On', ${i})`;
    }

    return createMobileStrip({
        id: isMaster ? 'master' : i,
        evtCh: isMaster ? "'master'" : i,
        title,
        name: nameDiv,
        customClass,
        isMaster,
        idPrefix,
        hasSolo: !isMaster && !musicianMode && !technicianMixMode,
        onAction,
        val,
        isOn,
        dbLabel: rawToDb(val, true, isMaster),
        configAction: musicianMode ? "" : (idPrefix ? "" : `openChannelConfig(event, ${i})`)
    });
}

function createDesktopOutputStrip(i, type) {
    const prefix = type === 'mix' ? 'm' : 'b';
    const title = type === 'mix' ? `MIX ${i + 1}` : `BUS ${i + 1}`;
    const cmdPrefix = type === 'mix' ? 'kAUX' : 'kBus';
    const customClass = type === 'mix' ? "fader-group-mix" : "fader-group-bus";

    const stateRef = type === 'mix' ? mixesState[i] : busesState[i];
    const nameDiv = stateRef ? stateRef.name : title;

    return createDesktopStrip({
        id: prefix + i,
        evtCh: `'${prefix}${i}'`,
        title,
        name: nameDiv,
        customClass,
        onAction: `toggleState('${cmdPrefix}ChannelOn/kChannelOn', '${prefix}${i}')`,
        configAction: `openChannelConfig(event, ${type === 'mix' ? 36 + i : 44 + i})`,
        type: "output"
    });
}

function createOutputStrip(i, type) {
    if (layoutMode === 'desktop') return createDesktopOutputStrip(i, type);

    const prefix = type === 'mix' ? 'm' : 'b';
    const title = type === 'mix' ? `MIX ${i + 1}` : `BUS ${i + 1}`;
    const cmdPrefix = type === 'mix' ? 'kAUX' : 'kBus';

    let customClass = type === 'mix' ? "fader-group-mix" : "fader-group-bus";
    let onAction = `toggleState('${cmdPrefix}ChannelOn/kChannelOn', '${prefix}${i}')`;
    const evtCh = `'${prefix}${i}'`;

    const stateRef = type === 'mix' ? mixesState[i] : busesState[i];
    const nameDiv = stateRef ? stateRef.name : title;

    return `
        <div class="fader-card ${customClass}">
            ${getMobileScaleHTML()}
            <div class="ch-clickable-zone" onclick="openChannelConfig(event, ${type === 'mix' ? 36 + i : 44 + i})">
                <h2 class="card-title" style="color: ${type === 'mix' ? '#ffcc00' : '#00ffcc'}">${title}</h2>
                <div id="name${prefix}${i}" class="ch-name">${nameDiv}</div>
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
    if (musicianMode) return '';
    const marks = [0, -10, -30];
    let html = '<div class="mobile-db-scale-overlay">';
    marks.forEach(db => {
        const raw = dbToRaw(db);
        const topPercent = 100 - ((raw / 1023) * 100);
        html += `<div class="mobile-db-tick" style="top: ${topPercent}%"><span>${db}</span></div>`;
    });
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
            const mixData = mixesState[activeMix - 1];
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

    // Injetar Macro Fader na string HTML se o módulo estiver carregado e estivermos EXCLUSIVAMENTE na tela principal (CH 1-32)
    if (typeof getMacroFaderHtml === 'function' && !musicianMode && !outsMode && !technicianMixMode && activeConfigChannel === null) {
        html += '<div style="flex: 0 0 55px !important; width: 55px !important; background: transparent !important;"></div>';
        html += getMacroFaderHtml();
        html += '<div style="flex: 0 0 55px !important; width: 55px !important; background: transparent !important;"></div>';
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
