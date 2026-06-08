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
    let uiId = ch;

    if (isMaster) {
        stateRef = masterState;
    } else if (typeof ch === 'string' && ch.startsWith('m')) {
        stateRef = mixesState[ch.substring(1)];
    } else if (typeof ch === 'string' && ch.startsWith('b')) {
        stateRef = busesState[ch.substring(1)];
    } else if (typeof ch === 'number' && ch >= 60 && ch <= 67) {
        stateRef = channelStates[32 + (ch - 60)];
        const stIndex = Math.floor((ch - 60) / 2);
        uiId = `st${stIndex}`;
    } else {
        stateRef = channelStates[ch];
    }

    if (!stateRef) return;

    if (val !== undefined && val !== null) {
        const elF = document.getElementById(`f${uiId}`);
        if (elF) elF.value = val;
        const elFMini = document.getElementById(`mini-f${uiId}`);
        if (elFMini) elFMini.value = val;

        const elV = document.getElementById(`v${uiId}`);
        if (elV) elV.innerText = rawToDb(val, layoutMode !== 'desktop', isMaster);
        const elVMini = document.getElementById(`mini-v${uiId}`);
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
        const elOn = document.getElementById(`on${uiId}`);
        if (elOn) elOn.classList.toggle('on-active', onState);
        const elOnMini = document.getElementById(`mini-on${uiId}`);
        if (elOnMini) elOnMini.classList.toggle('on-active', onState);

        // Novo: Subtle yellow background for desktop layout when channel is ON
        const elCard = document.getElementById(`card${uiId}`);
        if (elCard && layoutMode === 'desktop') elCard.classList.toggle('desk-on-bg', onState);
        const elCardMini = document.getElementById(`mini-card${uiId}`);
        if (elCardMini) elCardMini.classList.toggle('desk-on-bg', onState);

        // Novo: Colorized Label background
        const elLabel = document.getElementById(`label${uiId}`);
        if (elLabel && layoutMode === 'desktop') elLabel.classList.toggle('label-on', onState);
        const elLabelMini = document.getElementById(`mini-label${uiId}`);
        if (elLabelMini) elLabelMini.classList.toggle('label-on', onState);
    }
    if (typeof ch === 'number' && soloState !== undefined && soloState !== null) {
        if (stateRef) stateRef.solo = soloState;
        const elSolo = document.getElementById(`solo${uiId}`);
        if (elSolo) elSolo.classList.toggle('solo-active', soloState);
        const elSoloMini = document.getElementById(`mini-solo${uiId}`);
        if (elSoloMini) elSoloMini.classList.toggle('solo-active', soloState);
        // Atualiza o indicador de SOLO no master sempre que qualquer solo muda
        checkMasterSoloIndicator();
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
        isOn = false,    // Estado ON/OFF inicial
        isPaired = false,
        partnerId = null,
        hasPan = true,    // Define se exibe o indicador de Pan
        dataCh = ""      // Canal real para meters
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
        <div class="fader-card-desktop ${customClass}" id="${ids.card || `${pfx}card${id}`}" ${dataCh !== undefined && dataCh !== '' ? `data-ch="${dataCh}"` : ''} ${partnerId !== null ? `data-partner-ch="${partnerId}"` : ''}>
            <div class="desk-label" id="${labelId}" style="cursor: pointer;" onclick="${configAction}">${title}</div>
            
            ${hasSolo ?
            `<button id="solo${id}" class="btn-cue" onclick="toggleState('kSetupSoloChOn/kSoloChOn', ${id})">SOLO</button>` :
            isMaster ?
                `<button id="master-solo-btn" class="btn-cue" disabled onclick="clearAllSolos()">SOLO</button>` :
                `<div class="btn-cue-placeholder"></div>`}
            
            <div class="desk-ch-name-zone" onclick="${configAction}">
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
                    <div style="display: flex; gap: 2px; flex: 1; width: 100%; justify-content: center;">
                        <div class="desk-meter-wrap" style="margin-top: 5px; flex: 0 0 4px; height: 92%;">
                            <div class="desk-meter-curtain" id="${mId}"></div>
                        </div>
                        ${isPaired ? `
                        <div class="desk-meter-wrap" style="margin-top: 5px; flex: 0 0 4px; height: 92%;">
                            <div class="desk-meter-curtain" id="m${partnerId}"></div>
                        </div>
                        ` : ''}
                    </div>
                </div>` : ''}
            </div>

            <div class="nudge-zone-desk" onpointerdown="${onNudgeStartAction}(${evtCh}, -1)" onpointerup="${onNudgeStopAction}()" onpointerleave="${onNudgeStopAction}()" onpointercancel="${onNudgeStopAction}()" onclick="event.stopPropagation()">
                <button class="btn-nudge-desk">-</button>
            </div>
            
            <div class="desk-pan-indicator" id="pani${ids.card || `${pfx}card${id}`}"
                 ${layoutMode === 'desktop' && hasPan ? `
                    onwheel="handleWheelPan(event, ${evtCh}, ${partnerId})" 
                    ondblclick="resetPan(event, ${evtCh}, ${partnerId})"
                    onpointerdown="startPanLongPress(event, ${evtCh}, ${partnerId})"
                    onpointermove="handlePanPointerMove(event)"
                    onpointerup="stopPanLongPress(event)"
                    onpointerleave="stopPanLongPress(event)"
                    onpointercancel="stopPanLongPress(event)"` : ''}>
                ${hasPan ? `
                <span class="desk-pan-l">L</span>
                <div class="desk-pan-tracks-container">
                    ${(() => {
                const getPanTrackHTML = (ch) => {
                    let panVal = 0;
                    const stateRef = typeof getChannelStateById === 'function' ? getChannelStateById(ch) : null;
                    if (stateRef && stateRef.pan !== undefined) {
                        panVal = stateRef.pan;
                    }

                    const percent = ((panVal + 63) / 126) * 100;
                    let panClass = "pan-center";
                    if (panVal < 0) panClass = "pan-left";
                    if (panVal > 0) panClass = "pan-right";

                    return `
                                <div class="desk-pan-track" data-pan-ch="${ch}">
                                    <div class="desk-pan-center-tick"></div>
                                    <div class="desk-pan-thumb ${panClass}" style="left:${percent}%"></div>
                                </div>
                            `;
                };

                let tracksHTML = getPanTrackHTML(evtCh);
                if (isPaired && partnerId !== null) {
                    tracksHTML += getPanTrackHTML(partnerId);
                }
                return tracksHTML;
            })()}
                </div>
                <span class="desk-pan-r">R</span>` : ''}
            </div>
        </div>
    `;
}

/**
 * Atualiza o indicador visual de Pan no fader desktop.
 * @param {number|string} channel  ID global do canal (0-31, 60-67, ou 'master')
 * @param {number}        panValue Valor entre -63 (L) e +63 (R)
 */
function updatePanIndicator(channel, panValue) {
    // pan -63 → 0%, pan 0 → 50%, pan +63 → 100%
    const pct = ((panValue + 63) / 126) * 100;

    // Busca todas as trilhas na UI (desktop card ou mobile routing etc)
    const tracks = document.querySelectorAll(`.desk-pan-track[data-pan-ch="${channel}"]`);

    tracks.forEach(track => {
        const thumb = track.querySelector('.desk-pan-thumb');
        if (!thumb) return;

        thumb.style.left = `${pct}%`;

        // Cor: centro = cinza, qualquer lado = roxo
        if (panValue === 0) {
            thumb.classList.add('pan-center');
        } else {
            thumb.classList.remove('pan-center');
        }
    });
}

function createDesktopChannelStrip(i, isMaster = false, idPrefix = "") {
    const s = isMaster ? masterState : channelStates[i];
    let title = isMaster ? "MASTER" : `${i + 1}`;

    // Se estiver pareado, o título mostra os dois canais (ex: 1 + 2)
    if (!isMaster && s.paired) {
        title = `${i + 1} + ${i + 2}`;
    }

    let nameDiv = isMaster ? (s.name !== undefined ? s.name : "MASTER") : (s.name !== undefined ? s.name : "...");
    if (!isMaster && window.customNamesEnabled && window.activeCustomSceneChannels && window.activeCustomSceneChannels[i]) {
        nameDiv = window.activeCustomSceneChannels[i].name;
    }
    let customClass = isMaster ? "master-card-desktop" : "";
    if (!isMaster) {
        if (i < 16) customClass += " fader-group-1";
        else if (i < 32) customClass += " fader-group-2";

        // Aplica classe de largura dupla se estiver pareado
        if (s.paired) customClass += " fader-card-paired";
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
        type: "main",
        isPaired: !isMaster && s.paired,
        partnerId: !isMaster && s.paired ? s.pairedWith : null,
        dataCh: isMaster ? "master" : i
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
        isOn = false,
        dataCh = "",
        onTop = false,   // Se true, renderiza o botão ON antes do título/fader
        isPaired = false,
        partnerId = null
    } = config;

    const pfx = config.idPrefix || "";
    const fId = ids.f || `${pfx}f${id}`;
    const vId = ids.v || `${pfx}v${id}`;
    const onId = ids.on || `${pfx}on${id}`;
    const soloId = ids.solo || `${pfx}solo${id}`;
    const nameId = ids.name || `${pfx}name${id}`;
    const cardId = ids.card || `${pfx}card${id}`;

    const inputCall = `${onInputAction}(event, ${evtCh})`;
    const onBtn = `<button id="${onId}" class="btn-state ${isOn ? 'on-active' : ''}" onclick="${onAction}">On</button>`;

    return `
        <div class="fader-card ${customClass}" id="${cardId}" ${dataCh !== undefined && dataCh !== '' ? `data-ch="${dataCh}"` : ''} ${partnerId !== null ? `data-partner-ch="${partnerId}"` : ''}>
            ${isPaired ? `
            <div class="mobile-paired-meter left"></div>
            <div class="mobile-paired-meter right"></div>
            ` : ''}
            ${getMobileScaleHTML()}
            ${onTop ? onBtn : ''}
            <div class="ch-clickable-zone" onclick="${configAction}">
                <h2 class="card-title">${title}</h2>
                <div id="${nameId}" class="ch-name">${name}</div>
            </div>
            
            ${hasSolo ? `<button id="${soloId}" class="btn-state" onclick="toggleState('kSetupSoloChOn/kSoloChOn', ${id})">Solo</button>` : isMaster ? `<button id="master-solo-btn" class="btn-state" disabled onclick="clearAllSolos()">SOLO</button>` : ''}
            ${!onTop ? onBtn : ''}

            <div class="nudge-zone" onpointerdown="${onNudgeStartAction}(${evtCh}, 1)" onpointerup="${onNudgeStopAction}()" onpointerleave="${onNudgeStopAction}()" onpointercancel="${onNudgeStopAction}()" oncontextmenu="return false;" onclick="event.stopPropagation()">
                <button class="btn-nudge pointer-none">+</button>
            </div>
            
            <div class="fader-rotated-container">
                <input type="range" id="${fId}" min="0" max="1023" value="${val}" orient="vertical" oninput="${inputCall}" onclick="event.stopPropagation()">
            </div>
            
            <div class="ch-clickable-zone mt-auto" onclick="${configAction}">
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

    const s = isMaster ? masterState : channelStates[i];
    let title = isMaster ? "STEREO" : `CH ${i + 1}`;

    // Mobile title para pareado
    if (!isMaster && s.paired) {
        title = `CH ${i + 1} + ${i + 2}`;
    }

    let nameDiv = isMaster ? "MASTER" : (s.name !== undefined ? s.name : "...");
    if (!isMaster && window.customNamesEnabled && window.activeCustomSceneChannels && window.activeCustomSceneChannels[i]) {
        nameDiv = window.activeCustomSceneChannels[i].name;
    }
    let customClass = isMaster ? "master-card" : "";
    if (!isMaster) {
        if (i < 16) customClass = "fader-group-1";
        else if (i < 32) customClass = "fader-group-2";

        // Aplica largura dupla no mobile
        if (s.paired) customClass += " fader-card-paired";
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
        configAction: musicianMode ? "" : (idPrefix ? "" : `openChannelConfig(event, ${isMaster ? 52 : i})`),
        dataCh: isMaster ? "master" : i,
        onTop: musicianMode,  // Botão ON no topo apenas no modo músico
        isPaired: !isMaster && s.paired,
        partnerId: !isMaster && s.paired ? s.pairedWith : null
    });
}

function createDesktopOutputStrip(i, type, idPrefix = "") {
    let prefix, title, cmdPrefix, customClass, configId, ch, stateRef;

    if (type === 'mix') {
        prefix = 'm';
        title = `MIX ${i + 1}`;
        cmdPrefix = 'kAUX';
        customClass = "fader-group-mix";
        configId = 36 + i;
        ch = `'m${i}'`;
        stateRef = mixesState[i];
    } else if (type === 'bus') {
        prefix = 'b';
        title = `BUS ${i + 1}`;
        cmdPrefix = 'kBus';
        customClass = "fader-group-bus";
        configId = 44 + i;
        ch = `'b${i}'`;
        stateRef = busesState[i];
    } else if (type === 'stIn') {
        prefix = 'st';
        title = `ST IN ${i + 1}`;
        cmdPrefix = 'kInput';
        customClass = "fader-group-st";
        configId = 60 + (i * 2);
        ch = 32 + (i * 2);
        stateRef = channelStates[ch];
    }

    let nameDiv = (stateRef && stateRef.name !== undefined) ? stateRef.name : title;
    if (type === 'stIn' && window.customNamesEnabled && window.activeCustomSceneChannels && window.activeCustomSceneChannels[configId]) {
        nameDiv = window.activeCustomSceneChannels[configId].name;
    }
    const actionCh = type === 'stIn' ? configId : ch;

    return createDesktopStrip({
        id: prefix + i,
        evtCh: actionCh,
        title,
        name: nameDiv,
        customClass,
        idPrefix,
        onAction: `toggleState('${cmdPrefix}ChannelOn/kChannelOn', ${actionCh})`,
        configAction: `openChannelConfig(event, ${configId})`,
        type: "output",
        isPaired: type === 'stIn',
        partnerId: type === 'stIn' ? configId + 1 : null,
        hasPan: type === 'stIn', // Apenas ST IN tem Pan nas saídas
        dataCh: configId
    });
}

function createOutputStrip(i, type, idPrefix = "") {
    if (layoutMode === 'desktop') return createDesktopOutputStrip(i, type, idPrefix);

    let prefix, title, cmdPrefix, customClass, configId, ch, stateRef;

    if (type === 'mix') {
        prefix = 'm';
        title = `MIX ${i + 1}`;
        cmdPrefix = 'kAUX';
        customClass = "fader-group-mix";
        configId = 36 + i;
        ch = `'m${i}'`;
        stateRef = mixesState[i];
    } else if (type === 'bus') {
        prefix = 'b';
        title = `BUS ${i + 1}`;
        cmdPrefix = 'kBus';
        customClass = "fader-group-bus";
        configId = 44 + i;
        ch = `'b${i}'`;
        stateRef = busesState[i];
    } else if (type === 'stIn') {
        prefix = 'st';
        title = `ST IN ${i + 1}`;
        cmdPrefix = 'kInput';
        customClass = "fader-group-st";
        configId = 60 + (i * 2);
        ch = 32 + (i * 2);
        stateRef = channelStates[ch];
    }

    let nameDiv = (stateRef && stateRef.name !== undefined) ? stateRef.name : title;
    if (type === 'stIn' && window.customNamesEnabled && window.activeCustomSceneChannels && window.activeCustomSceneChannels[configId]) {
        nameDiv = window.activeCustomSceneChannels[configId].name;
    }
    const actionCh = type === 'stIn' ? configId : ch;

    const pfx = idPrefix || "";
    return `
        <div class="fader-card ${customClass}" id="${pfx}card${prefix}${i}" ${type === 'stIn' ? `data-ch="${configId}" data-partner-ch="${configId + 1}"` : ''}>
            ${type === 'stIn' ? `
            <div class="mobile-paired-meter left"></div>
            <div class="mobile-paired-meter right"></div>
            ` : ''}
            ${getMobileScaleHTML()}
            <div class="ch-clickable-zone" onclick="${idPrefix ? "" : `openChannelConfig(event, ${configId})`}">
                <h2 class="card-title" style="color: ${type === 'mix' ? '#ffcc00' : type === 'bus' ? '#00ffcc' : '#ff00ff'}">${title}</h2>
                <div id="${pfx}name${prefix}${i}" class="ch-name">${nameDiv}</div>
            </div>
            
            <button id="${pfx}on${prefix}${i}" class="btn-state" onclick="toggleState('${cmdPrefix}ChannelOn/kChannelOn', ${actionCh})">On</button>

            <div class="nudge-zone" onpointerdown="startNudge(${actionCh}, 1)" onpointerup="stopNudge()" onpointerleave="stopNudge()" onpointercancel="stopNudge()" oncontextmenu="return false;" onclick="event.stopPropagation()">
                <button class="btn-nudge pointer-none">+</button>
            </div>
            
            <div class="fader-rotated-container">
                <input type="range" id="${pfx}f${prefix}${i}" min="0" max="1023" value="0" orient="vertical" oninput="faderInput(event, ${actionCh})" onclick="event.stopPropagation()">
            </div>
            
            <div class="ch-clickable-zone mt-auto" onclick="${type === 'mix' && !idPrefix ? `enterTechnicianMixMode(${i})` : ''}">
                <div class="nudge-zone" onpointerdown="startNudge(${actionCh}, -1)" onpointerup="stopNudge()" onpointerleave="stopNudge()" onpointercancel="stopNudge()" oncontextmenu="return false;" onclick="event.stopPropagation()">
                    <button class="btn-nudge pointer-none">-</button>
                    <h1 id="${pfx}v${prefix}${i}" class="fader-val">-∞</h1>
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
    if (!sidebar) return;
    if (musicianMode) {
        sidebar.classList.add('sidebar-musician');
    } else {
        sidebar.classList.remove('sidebar-musician');
    }

    const isConfig = activeConfigChannel !== null;

    let dockMode;
    if (musicianMode) {
        dockMode = 'musician';
    } else if (isConfig) {
        dockMode = 'channelConfig';
    } else if (technicianMixMode) {
        dockMode = 'techMix';
    } else if (outsMode) {
        dockMode = 'outs';
    } else {
        dockMode = 'main';
    }

    if (typeof renderDock === 'function') renderDock(dockMode);
    if (typeof updateSidebarInfo === 'function') updateSidebarInfo();

    // DOCK & MACROS visibility in Musician Mode
    const macrosPanel = document.getElementById('sidebarMacros');
    if (macrosPanel) {
        macrosPanel.style.display = musicianMode ? 'none' : 'block';
    }

    const dockPanel = document.getElementById('sidebarDock');
    if (dockPanel) dockPanel.style.display = musicianMode ? 'none' : 'block';

    const musicianExitBtn = document.getElementById('musicianExitBtn');
    if (musicianExitBtn) musicianExitBtn.style.display = musicianMode ? 'flex' : 'none';

    const musicianMetersBtn = document.getElementById('musicianMetersBtn');
    if (musicianMetersBtn) musicianMetersBtn.style.display = musicianMode ? 'flex' : 'none';

    const musicianFsBtn = document.getElementById('musicianFsBtn');
    if (musicianFsBtn) {
        const isStandalone = window.navigator.standalone === true;
        if (musicianMode && !isStandalone) {
            musicianFsBtn.style.removeProperty('display');
        } else {
            musicianFsBtn.style.setProperty('display', 'none', 'important');
        }
    }

    if (outsMode && !musicianMode && !technicianMixMode) {
        for (let i = 0; i < 8; i++) html += createOutputStrip(i, 'mix');
        for (let i = 0; i < 8; i++) html += createOutputStrip(i, 'bus');
        for (let i = 0; i < 4; i++) html += createOutputStrip(i, 'stIn');
    } else {
        for (let i = 0; i < NUM_CHANNELS; i++) {
            const state = channelStates[i];
            // Se estiver pareado, pulamos a renderização do canal PAR (o segundo do par)
            if (state && state.paired && i % 2 !== 0) {
                continue;
            }
            html += createChannelStrip(i, false);
        }
    }

    let masterHtml = '';
    if (technicianMixMode) {
        masterHtml = createOutputStrip(activeMix - 1, 'mix');
    } else if (!musicianMode) {
        masterHtml = createChannelStrip(0, true);
    }

    // Injetar Macro Fader na string HTML se o módulo estiver carregado e estivermos EXCLUSIVAMENTE na tela principal (CH 1-32)
    if (typeof getMacroFaderHtml === 'function' && !musicianMode && !outsMode && !technicianMixMode && activeConfigChannel === null) {
        html += '<div style="flex: 0 0 55px !important; width: 55px !important; background: transparent !important;"></div>';
        html += getMacroFaderHtml();
        html += '<div style="flex: 0 0 55px !important; width: 55px !important; background: transparent !important;"></div>';
    }

    const masterContainer = document.getElementById('master-container');
    if (layoutMode === 'desktop' && !musicianMode) {
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
        for (let i = 0; i < 4; i++) {
            const stCh = 32 + (i * 2);
            const globalId = 60 + (i * 2);
            const state = channelStates[stCh];
            if (state) updateUI(globalId, state.value, state.on, undefined);
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
            if (nameEl) {
                let dName = state.name !== undefined ? state.name : `CH ${i + 1}`;
                if (window.customNamesEnabled && window.activeCustomSceneChannels && window.activeCustomSceneChannels[i]) {
                    dName = window.activeCustomSceneChannels[i].name;
                }
                nameEl.innerText = dName;
            }
        }
    }

    // CORREÇÃO: Atualiza o fader master do Mix se estivermos em modo Mix
    if (technicianMixMode || musicianMode) {
        const mixIdx = activeMix - 1;
        updateUI(`m${mixIdx}`, mixesState[mixIdx].value, mixesState[mixIdx].on, undefined);
    }
    if (!technicianMixMode || !outsMode) {
        updateUI('master', masterState.value, masterState.on, undefined);
    }

    // Inicializa os indicadores de Pan (apenas no layout desktop)
    if (layoutMode === 'desktop') {
        for (let i = 0; i < NUM_CHANNELS; i++) {
            const s = channelStates[i];
            if (s && s.pan !== undefined) updatePanIndicator(i, s.pan);
        }
        // ST IN (globais 60-67)
        for (let stGlobal = 60; stGlobal <= 67; stGlobal++) {
            const s = channelStates[32 + (stGlobal - 60)];
            if (s && s.pan !== undefined) updatePanIndicator(stGlobal, s.pan);
        }
        if (masterState.pan !== undefined) updatePanIndicator('master', masterState.pan);
    }

    // Verifica estado inicial dos solos após renderizar a UI
    checkMasterSoloIndicator();
}

/**
 * Verifica se há canais com solo ativo e atualiza o indicador no botão SOLO do master.
 * Roda no frontend puro, sem tráfego MIDI extra.
 */
function checkMasterSoloIndicator() {
    const hasSolo = channelStates.some(s => s && !!s.solo);
    const btn = document.getElementById('master-solo-btn');
    if (!btn) return;
    if (hasSolo) {
        btn.classList.add('master-solo-alert');
        btn.disabled = false; // Habilita o clique quando há algo a limpar
    } else {
        btn.classList.remove('master-solo-alert');
        btn.disabled = true;  // Desabilita quando não há solos ativos
    }
}

/**
 * Desativa o solo de todos os canais que estão solados, enviando os comandos
 * de forma sequencial com delay de 30ms entre cada um para evitar
 * congestionamento na fila MIDI (mesmo padrão das macros).
 */
async function clearAllSolos() {
    const soloedChannels = [];
    for (let i = 0; i < NUM_CHANNELS; i++) {
        if (channelStates[i] && !!channelStates[i].solo) {
            soloedChannels.push(i);
        }
    }
    if (soloedChannels.length === 0) return;

    console.log(`[MASTER SOLO] Limpando solo de ${soloedChannels.length} canal(is):`, soloedChannels);

    // Desativa o botão imediatamente para evitar cliques duplos
    const btn = document.getElementById('master-solo-btn');
    if (btn) { btn.disabled = true; btn.classList.remove('master-solo-alert'); }

    for (const ch of soloedChannels) {
        // Atualiza UI local imediatamente (sem esperar confirmação da mesa)
        updateUI(ch, undefined, undefined, false);
        // Envia comando MIDI via socket
        if (appReady) {
            socket.emit('control', { type: 'kSetupSoloChOn/kSoloChOn', channel: ch, value: 0 });
        }
        // Delay entre envios para não congestionar a fila
        await new Promise(r => setTimeout(r, 30));
    }
}
