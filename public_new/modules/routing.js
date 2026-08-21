window.renderRouting = function(chIdx) {
    const container = document.querySelector('.ch-modal-body');
    const chData = getChannelStateById(chIdx) || {};
    
    // Master (52) e Mixes (36-43) não têm essa tela de routing na 01V96
    if (((chIdx >= 36 && chIdx <= 43) || chIdx === 52) && !(chIdx >= 60 && chIdx <= 67)) {
        container.innerHTML = `
            <div style="flex:1; display:flex; flex-direction:column; align-items:center; justify-content:center; color:#666; padding:20px; text-align:center;">
                <div style="font-size:48px; margin-bottom:15px; opacity:0.3;"><i class="fas fa-route"></i></div>
                <div style="font-size:14px; font-weight:bold; text-transform:uppercase;">Routing Não Disponível</div>
            </div>`;
        return;
    }

    if (chIdx >= 44 && chIdx <= 51) {
        const busIdx = chIdx - 44;
        const busState = busesState[busIdx] || {};
        const stereoActive = !!busState.stereo;
        
        container.innerHTML = `
            <div class="routing-container" style="display:flex; flex-direction:column; gap:25px; padding:15px; height:100%; overflow-y:auto;">
                <!-- Stereo Master -->
                <div class="routing-section" style="padding-bottom:20px;">
                    <p style="font-size:10px; color:#666; text-transform:uppercase; letter-spacing:1px; margin-bottom:15px;">Saída Master</p>
                    <button class="route-btn ${stereoActive ? 'active' : ''}" onclick="toggleStereoAssignment(${chIdx})"
                        style="width:100%; height:55px; background:${stereoActive ? '#34c759' : '#1a1f2e'}; border:1px solid ${stereoActive ? '#34c759' : '#333'}; color:${stereoActive ? '#fff' : '#aaa'}; border-radius:10px; font-size:14px; font-weight:bold; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:10px;">
                        👑 STEREO L/R
                    </button>
                </div>
                
                <!-- Insert -->
                <div class="routing-section" style="border-top:1px solid #333; padding-top:20px; padding-bottom:20px;">
                    <p style="font-size:10px; color:#666; text-transform:uppercase; letter-spacing:1px; margin-bottom:15px;">Configuração do Insert</p>
                    <button onclick="window.openInsertModal(${chIdx})"
                        style="width:100%; height:55px; background:#1a1f2e; border:1px solid #5cacee; color:#5cacee; border-radius:10px; font-size:14px; font-weight:bold; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:10px;">
                        🔌 CONFIGURAR INSERT
                    </button>
                </div>
            </div>
        `;
        const routeContainer = container.querySelector('.routing-container');
        if (routeContainer) routeContainer.innerHTML += renderPairSection(chIdx);
        return;
    }

    let primaryLogicCh = chIdx;
    let partnerLogicCh = null;
    let isPaired = false;
    let isStereoIn = false;
    let primaryName = 'FONTE ATUAL:';
    let partnerName = '';

    if (chIdx >= 60 && chIdx <= 67) {
        isStereoIn = true;
        isPaired = true;
        primaryLogicCh = 32 + (chIdx - 60);
        
        if (primaryLogicCh % 2 === 0) {
            partnerLogicCh = primaryLogicCh + 1;
            const stIndex = Math.floor((primaryLogicCh - 32) / 2) + 1;
            primaryName = `PATCH ST IN ${stIndex} L:`;
            partnerName = `PATCH ST IN ${stIndex} R:`;
        } else {
            partnerLogicCh = primaryLogicCh - 1;
            const stIndex = Math.floor((partnerLogicCh - 32) / 2) + 1;
            primaryName = `PATCH ST IN ${stIndex} R:`;
            partnerName = `PATCH ST IN ${stIndex} L:`;
        }
    } else {
        if (chData.paired && chData.pairedWith !== null && chData.pairedWith !== undefined) {
            isPaired = true;
            partnerLogicCh = chData.pairedWith;
            primaryName = `PATCH CH ${primaryLogicCh + 1}:`;
            partnerName = `PATCH CH ${partnerLogicCh + 1}:`;
        }
    }

    const getPanTrackHTML = (ch) => {
        let panVal = 0;
        const stateRef = getChannelStateById(ch);
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

    let tracksHTML = getPanTrackHTML(primaryLogicCh);
    if (isPaired && partnerLogicCh !== null) {
        tracksHTML += getPanTrackHTML(partnerLogicCh);
    }
    const isMobilePan = typeof layoutMode !== 'undefined' && layoutMode !== 'desktop';
    let etcPanVal = 0;
    const etcPanStateRef = getChannelStateById(primaryLogicCh);
    if (etcPanStateRef && etcPanStateRef.pan !== undefined) {
        etcPanVal = etcPanStateRef.pan;
    }
    const panSectionHTML = isMobilePan ? `
        <div class="etc-pan-legacy">
            <div style="flex: 1; min-width: 120px; display: flex; flex-direction: column;">
                <p style="font-size: 10px; color: #666; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 15px;">Pan</p>
                <div style="display: flex; flex-direction: column; gap: 12px; flex: 1;">
                    <div style="background: #222; border: 1px solid #444; border-radius: 10px; padding: 18px; flex: 1; display: flex; align-items: center; justify-content: center;">
                        <div class="desk-pan-indicator" id="pani-mobile-${chIdx}" style="flex: 1; max-width: 100%; background: transparent; border: none; box-shadow: none;"
                            onwheel="handleWheelPan(event, ${primaryLogicCh}, ${isPaired ? partnerLogicCh : 'null'})" 
                            ondblclick="resetPan(event, ${primaryLogicCh}, ${isPaired ? partnerLogicCh : 'null'})"
                            onpointerdown="startPanLongPress(event, ${primaryLogicCh}, ${isPaired ? partnerLogicCh : 'null'})"
                            onpointermove="handlePanPointerMove(event)"
                            onpointerup="stopPanLongPress(event)"
                            onpointerleave="stopPanLongPress(event)"
                            onpointercancel="stopPanLongPress(event)">
                        <span class="desk-pan-l">L</span>
                        <div class="desk-pan-tracks-container">
                            ${tracksHTML}
                        </div>
                        <span class="desk-pan-r">R</span>
                    </div>
                </div>
                </div>
            </div>
        </div>
        <div class="etc-pan-container">
            <p class="etc-pan-title">Pan</p>
            <div class="etc-pan-body">
                <div class="etc-pan-box">
                    <button type="button" class="etc-pan-reset" onclick="resetMobilePanToCenter('etcPanSl-${chIdx}', ${primaryLogicCh})">resetar</button>
                    <div class="etc-pan">
                        <div class="etc-pan-labels">
                            <span>L</span>
                            <span class="etc-pan-center">C</span>
                            <span>R</span>
                        </div>
                        <input type="range" id="etcPanSl-${chIdx}" class="dyn-slider etc-pan-slider" min="-63" max="63" step="1" value="${etcPanVal}" oninput="onMobilePanChange(event, ${primaryLogicCh})" onpointerup="onMobilePanTap(event, 'etcPanSl-${chIdx}', ${primaryLogicCh})">
                    </div>
                </div>
            </div>
        </div>
    ` : '';

    container.innerHTML = `
        <div class="routing-container" style="display: flex; flex-direction: column; gap: 25px; padding: 15px; height: 100%; overflow-y: auto;">
            <!-- Top Row: Patch + Pan -->
            <div style="display: flex; gap: 15px; align-items: stretch; flex-wrap: wrap;">
                <!-- Seção de Patch -->
                <div style="flex: 1; display: flex; flex-direction: column;">
                    <p style="font-size: 10px; color: #666; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 15px;">Entrada do Canal (Patch)</p>
                    <div style="display: flex; flex-direction: column; gap: 12px; flex: 1;">
                        <!-- Patch do Canal Principal -->
                        <div class="patch-display-box" onclick="openPatchSelector(${primaryLogicCh}, ${chIdx})" style="background: #222; border: 1px solid #444; border-radius: 10px; padding: 15px 20px; flex: 1; display: flex; align-items: center; justify-content: space-between; cursor: pointer;">
                            <div style="display: flex; flex-direction: column; flex: 1;">
                                <span style="font-size: 10px; color: #888;">${primaryName}</span>
                                <span id="currentPatchName" style="font-size: 18px; font-weight: bold; color: #5cacee;">${window.PatchRegistry ? window.PatchRegistry.getChannelInput(primaryLogicCh) : getPatchName(channelStates[primaryLogicCh].patch || 0)}</span>
                            </div>
                            <div style="background: #333; width: 35px; height: 35px; border-radius: 6px; display: flex; align-items: center; justify-content: center; color: #aaa; flex-shrink: 0;">
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12h14"/></svg>
                            </div>
                        </div>

                        ${isPaired ? `
                        <!-- Patch do Canal Parceiro -->
                        <div class="patch-display-box" onclick="openPatchSelector(${partnerLogicCh}, ${chIdx})" style="background: #222; border: 1px solid #444; border-radius: 10px; padding: 15px 20px; flex: 1; display: flex; align-items: center; justify-content: space-between; cursor: pointer;">
                            <div style="display: flex; flex-direction: column;">
                                <span style="font-size: 10px; color: #888;">${partnerName}</span>
                                <span style="font-size: 18px; font-weight: bold; color: #5cacee;">${window.PatchRegistry ? window.PatchRegistry.getChannelInput(partnerLogicCh) : getPatchName(channelStates[partnerLogicCh].patch || 0)}</span>
                            </div>
                            <div style="background: #333; width: 35px; height: 35px; border-radius: 6px; display: flex; align-items: center; justify-content: center; color: #aaa;">
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12h14"/></svg>
                            </div>
                        </div>
                        ` : ''}
                    </div>
                </div>
                
                ${panSectionHTML}
            </div>

            <!-- Seção de BUS / STEREO -->
            <div class="routing-section" style="border-top: 1px solid #333; padding-top: 20px;">
                <p style="font-size: 10px; color: #666; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 15px;">Enviar para BUS</p>
                <div class="bus-grid" style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 30px;">
                    ${Array.from({length: 8}, (_, i) => {
                        const active = chData.buses && chData.buses[i];
                        const busLabel = getBusButtonLabel(i);
                        return `<button class="bus-btn" 
                            onclick="toggleBusAssignment(${chIdx}, ${i})"
                            style="height: 45px; background: ${active ? '#28a745' : '#333'}; 
                                   border: 1px solid ${active ? '#34c759' : '#444'}; 
                                   color: ${active ? '#fff' : '#aaa'}; 
                                   border-radius: 8px; font-size: 12px; font-weight: bold; cursor: pointer;">
                            ${busLabel}
                        </button>`;
                    }).join('')}
                </div>

                <p style="font-size: 10px; color: #666; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 15px; border-top: 1px solid #333; padding-top: 20px;">Inserts</p>
                <div style="display: flex; gap: 10px; margin-bottom: 30px;">
                    <button class="insert-btn" 
                        onclick="window.openInsertModal(${chIdx})"
                        style="flex: 1; height: 50px; background: #222; 
                               border: 1px solid ${(chData.insert && chData.insert.on) ? '#5cacee' : '#444'}; 
                               color: ${(chData.insert && chData.insert.on) ? '#5cacee' : '#aaa'}; 
                               border-radius: 8px; font-size: 14px; font-weight: bold; cursor: pointer;
                               display: flex; align-items: center; justify-content: center; gap: 10px;
                               box-shadow: ${(chData.insert && chData.insert.on) ? '0 0 10px rgba(92,172,238,0.3)' : 'none'};">
                        <i class="fas fa-random"></i> CONFIGURAR INSERT
                    </button>
                </div>

                <p style="font-size: 10px; color: #666; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 15px; border-top: 1px solid #333; padding-top: 20px;">Saída Master</p>
                <button class="stereo-btn" 
                    onclick="toggleStereoAssignment(${chIdx})"
                    style="width: 100%; height: 55px; 
                           background: ${chData.stereo ? '#dc3545' : '#333'}; 
                           border: 1px solid ${chData.stereo ? '#ff4d4d' : '#444'}; 
                           color: white; border-radius: 10px; font-size: 14px; font-weight: bold; cursor: pointer;
                           box-shadow: ${chData.stereo ? '0 0 15px rgba(220,53,69,0.4)' : 'none'};">
                    STEREO L/R
                </button>
            </div>
        </div>
    `;

    // Adicionar seção de Pair (apenas para Inputs 1-32)
    if (chIdx >= 0 && chIdx <= 31) {
        const routeContainer = container.querySelector('.routing-container');
        if (routeContainer) {
            routeContainer.innerHTML += renderPairSection(chIdx);
        }
    }
};

let mobilePanTapTimer = null;
let mobilePanLastTapTime = 0;

window.onMobilePanChange = function(e, ch) {
    const newPan = parseInt(e.target.value, 10);
    const state = getChannelStateById(ch);
    if (state) state.pan = newPan;
    if (appReady && typeof socket !== 'undefined' && socket) {
        socket.emit('setPan', { channel: ch, value: newPan });
    }
};

window.resetMobilePanToCenter = function(sliderId, ch) {
    const el = document.getElementById(sliderId);
    if (el) el.value = 0;
    const state = getChannelStateById(ch);
    if (state) state.pan = 0;
    if (appReady && typeof socket !== 'undefined' && socket) {
        socket.emit('setPan', { channel: ch, value: 0 });
    }
};

window.onMobilePanTap = function(e, sliderId, ch) {
    const now = Date.now();
    if (now - mobilePanLastTapTime < 300) {
        if (mobilePanTapTimer) {
            clearTimeout(mobilePanTapTimer);
            mobilePanTapTimer = null;
        }
        mobilePanLastTapTime = 0;
        resetMobilePanToCenter(sliderId, ch);
        e.preventDefault();
        e.stopPropagation();
    } else {
        mobilePanLastTapTime = now;
        mobilePanTapTimer = setTimeout(() => {
            mobilePanLastTapTime = 0;
            mobilePanTapTimer = null;
        }, 300);
    }
};



window.toggleStereoAssignment = function(chIdx) {
    if (!appReady) return;
    
    const isBus = chIdx >= 44 && chIdx <= 51;
    const state = isBus ? busesState[chIdx - 44] : channelStates[chIdx];
    const currentState = !!state.stereo;
    const newState = !currentState;
    
    if (isBus) {
        console.log(`[STEREO] BUS ${chIdx - 43} -> MASTER = ${newState}`);
        socket.emit('control', {
            type: `kBusToStereo/kBusToStereoOn`,
            channel: chIdx,
            value: newState ? 1 : 0
        });
    } else {
        console.log(`[STEREO] Canal ${chIdx+1} -> MASTER = ${newState}`);
        socket.emit('control', {
            type: `kInputBus/kStereo`,
            channel: chIdx,
            value: newState ? 1 : 0
        });
    }

    state.stereo = newState;
    renderRouting(chIdx);
};

window.toggleBusAssignment = function(chIdx, busIdx) {
    if (!appReady) return;
    const currentState = !!(channelStates[chIdx].buses && channelStates[chIdx].buses[busIdx]);
    const newState = !currentState;
    
    console.log(`[BUS] Canal ${chIdx+1} -> BUS ${busIdx+1} = ${newState}`);
    
    // Emitir para o servidor
    socket.emit('control', {
        type: `kInputBus/kBus${busIdx+1}`,
        channel: chIdx,
        value: newState ? 1 : 0
    });

    // Update UI Local
    if (!channelStates[chIdx].buses) channelStates[chIdx].buses = new Array(8).fill(false);
    channelStates[chIdx].buses[busIdx] = newState;
    renderRouting(chIdx); // Re-renderiza a aba
};

function getPatchName(val) {
    if (window.PatchRegistry) return window.PatchRegistry.decodeInputPatch(val);
    if (val === 0) return "NONE";
    if (val >= 1 && val <= 16) return `AD ${val}`;
    if (val >= 17 && val <= 24) return `GAP ${val}`;
    if (val >= 25 && val <= 40) return `S1-${val - 24}`;
    if (val >= 41 && val <= 48) return `ADAT ${val - 40}`;
    const fxMap = {
        121: "FX1-1", 122: "FX1-2",
        129: "FX2-1", 130: "FX2-2",
        137: "FX3-1", 138: "FX3-2",
        139: "FX4-1", 140: "FX4-2"
    };
    if (fxMap[val]) return fxMap[val];
    if (val === 149) return "2TD-L";
    if (val === 150) return "2TD-R";
    return `ID ${val}`;
}

window.openPatchSelector = function(logicChIdx, uiChIdx) {
    const grid = document.getElementById('patchGrid');
    grid.innerHTML = '';
    grid.style.cssText = `
        display: flex; flex-wrap: wrap; gap: 4px; padding: 5px;
        justify-content: flex-start; align-items: flex-start;
    `;
    
    // Categorias reais do 01v96
    const categories = [
        { name: "NONE", options: [{ id: 0, name: "NONE" }] },
        { name: "ADAT (ÓPTICO)", options: [] },
        { name: "MIXER / ANALOG", options: [] },
        { name: "DIGITAL / 2TD", options: [] },
        { name: "SLOT (S1)", options: [] },
        { name: 'EFFECTS / FX', options: [] }
    ];

    // Popula conforme a tabela da Yamaha
    // AD (1-16) -> Categoria 2
    for(let i=1; i<=16; i++) categories[2].options.push({ id: i, name: `AD ${i}` });

    // Slot (25-40) -> Categoria 4
    for(let i=1; i<=16; i++) categories[4].options.push({ id: 24+i, name: `S1-${i}` });

    // ADAT (41-48) -> Categoria 1
    for(let i=1; i<=8; i++) categories[1].options.push({ id: 40+i, name: `ADT${i}` });
    
    // FX (IDs Fixos) -> Categoria 5
    const fxOpts = [
        { id: 121, n: "FX1-1" }, { id: 122, n: "FX1-2" },
        { id: 129, n: "FX2-1" }, { id: 130, n: "FX2-2" },
        { id: 137, n: "FX3-1" }, { id: 138, n: "FX3-2" },
        { id: 139, n: "FX4-1" }, { id: 140, n: "FX4-2" }
    ];
    fxOpts.forEach(o => categories[5].options.push({ id: o.id, name: o.n }));
    
    // Digital (149-150) -> Categoria 3
    categories[3].options.push({ id: 149, name: '2TD-L' });
    categories[3].options.push({ id: 150, name: '2TD-R' });

    categories.forEach(cat => {
        if (cat.options.length === 0) return;

        const catDiv = document.createElement('div');
        catDiv.style.cssText = `
            flex: 1; padding: 0 4px; min-width: 180px;
            margin-bottom: 25px;
            display: flex; flex-direction: column; align-items: center;
        `;

        const header = document.createElement('div');
        header.style.cssText = `
            padding: 10px 5px; font-size: 10px; font-weight: bold; 
            color: #666; text-transform: uppercase; border-bottom: 1px solid #333;
            margin-bottom: 10px; width: 100%; text-align: center;
        `;
        header.innerText = cat.name;
        catDiv.appendChild(header);

        const btnGrid = document.createElement('div');
        btnGrid.className = 'patch-category-grid';

        cat.options.forEach(opt => {
            const btn = document.createElement('button');
            const isActive = (channelStates[logicChIdx].patch === opt.id);
            btn.className = `patch-opt-btn ${isActive ? 'active' : ''}`;
            btn.innerText = opt.name;
            btn.onclick = () => selectPatch(logicChIdx, opt.id, uiChIdx);
            btnGrid.appendChild(btn);
        });
        
        catDiv.appendChild(btnGrid);
        grid.appendChild(catDiv);
    });
    
    document.getElementById('patchSelectorModal').style.display = 'flex';
};

function selectPatch(logicChIdx, patchId, uiChIdx) {
    if (!appReady) return;
    
    console.log(`[PATCH] Canal ${logicChIdx+1} -> ID ${patchId} (${getPatchName(patchId)})`);
    
    socket.emit('control', {
        type: 'kChannelInput/kChannelIn',
        channel: logicChIdx,
        value: patchId
    });
    
    channelStates[logicChIdx].patch = patchId;
    if (window.PatchRegistry) window.PatchRegistry.setInputPatch(logicChIdx, patchId);
    document.getElementById('patchSelectorModal').style.display = 'none';
    
    // IMPORTANTE: Se o canal for parte de um par, precisamos re-renderizar a aba
    // para mostrar os dois patches atualizados.
    if (uiChIdx !== undefined) {
        renderRouting(uiChIdx);
    } else {
        renderRouting(channelStates[logicChIdx].paired ? (logicChIdx % 2 === 0 ? logicChIdx : logicChIdx - 1) : logicChIdx);
    }
}


/**
 * Renderiza o botão de PAIR ou o status de PAREADO
 */
function renderPairSection(chIdx) {
    if (chIdx >= 44 && chIdx <= 51) {
        const busIdx = chIdx - 44;
        const state = busesState[busIdx];
        const isPaired = state && state.paired;
        if (isPaired) {
            return `
            <div class="routing-section" style="border-top:1px solid #333; padding-top:20px;">
                <p style="font-size:10px; color:#666; text-transform:uppercase; letter-spacing:1px; margin-bottom:15px;">Pair de Canal</p>
                <div style="background:#0a1f10; border:1px solid #34c759; border-radius:10px; padding:16px; display:flex; align-items:center; justify-content:space-between;">
                    <div>
                        <span style="color:#34c759; font-size:13px; font-weight:bold;">🔗 PAREADO</span><br>
                        <span style="color:#aaa; font-size:11px; margin-top:4px; display:block;">BUS ${busIdx+1} + BUS ${state.pairedWith+1}</span>
                    </div>
                </div>
            </div>`;
        }
        return '';
    }

    const partnerIdx = chIdx % 2 === 0 ? chIdx + 1 : chIdx - 1;
    const state = channelStates[chIdx];
    const isPaired = state && state.paired;

    if (isPaired) {
        return `
        <div class="routing-section" style="border-top:1px solid #333; padding-top:20px;">
            <p style="font-size:10px; color:#666; text-transform:uppercase; letter-spacing:1px; margin-bottom:15px;">Pair de Canal</p>
            <div style="background:#0a1f10; border:1px solid #34c759; border-radius:10px; padding:16px; display:flex; align-items:center; justify-content:space-between;">
                <div>
                    <span style="color:#34c759; font-size:13px; font-weight:bold;">🔗 PAREADO</span><br>
                    <span style="color:#aaa; font-size:11px; margin-top:4px; display:block;">CH ${chIdx+1} + CH ${state.pairedWith+1}</span>
                </div>
                <button onclick="openUnpairConfirm(${chIdx})"
                    style="background:#c62828; color:#fff; border:none; border-radius:8px; padding:10px 16px; font-size:12px; font-weight:bold; cursor:pointer;">
                    🔌 UNPAIR
                </button>
            </div>
        </div>`;
    } else {
        return `
        <div class="routing-section" style="border-top:1px solid #333; padding-top:20px;">
            <p style="font-size:10px; color:#666; text-transform:uppercase; letter-spacing:1px; margin-bottom:15px;">Pair de Canal</p>
            <button onclick="openPairModal(${chIdx})"
                style="width:100%; height:55px; background:#1a1f2e; border:1px solid #5cacee; color:#5cacee; border-radius:10px; font-size:14px; font-weight:bold; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:10px;">
                ♥ PAIR &nbsp; CH ${chIdx+1} + CH ${partnerIdx+1}
            </button>
        </div>`;
    }
}

// Variável de contexto para os modais
let _pairCtx = { chA: null, chB: null };

window.openPairModal = function(chIdx) {
    const partnerIdx = chIdx % 2 === 0 ? chIdx + 1 : chIdx - 1;
    _pairCtx = { 
        chA: Math.min(chIdx, partnerIdx), 
        chB: Math.max(chIdx, partnerIdx) 
    };
    
    document.getElementById('pairModalSubtitle').innerText = `CH ${_pairCtx.chA+1} + CH ${_pairCtx.chB+1}`;
    
    const btnAtoB = document.getElementById('pairBtn_AtoB');
    const btnBtoA = document.getElementById('pairBtn_BtoA');
    
    btnAtoB.innerHTML = `CH ${_pairCtx.chA+1} → ${_pairCtx.chB+1}<br><small style="font-size:10px; opacity:0.7;">Copiar CH ${_pairCtx.chA+1} para CH ${_pairCtx.chB+1}</small>`;
    btnBtoA.innerHTML = `CH ${_pairCtx.chB+1} → ${_pairCtx.chA+1}<br><small style="font-size:10px; opacity:0.7;">Copiar CH ${_pairCtx.chB+1} para CH ${_pairCtx.chA+1}</small>`;
    
    document.getElementById('pairModal').style.display = 'flex';
};

window.confirmPairDirection = function(direction) {
    const { chA, chB } = _pairCtx;
    const confirmModal = document.getElementById('pairConfirmModal');
    const title = document.getElementById('pairConfirmTitle');
    const text = document.getElementById('pairConfirmText');
    const okBtn = document.getElementById('pairConfirmOkBtn');

    if (direction === 'a_to_b') {
        title.innerText = 'CONFIRMAR PAIR';
        text.innerText = `Parear canal ${chA+1} + ${chB+1}, copiando as informações do canal ${chA+1}.`;
        okBtn.style.background = '#28a745';
        okBtn.innerText = 'CONFIRMAR';
        okBtn.onclick = () => { executePair(chA, chB, chA); confirmModal.style.display='none'; document.getElementById('pairModal').style.display='none'; };
    } else if (direction === 'b_to_a') {
        title.innerText = 'CONFIRMAR PAIR';
        text.innerText = `Parear canal ${chA+1} + ${chB+1}, copiando as informações do canal ${chB+1}.`;
        okBtn.style.background = '#28a745';
        okBtn.innerText = 'CONFIRMAR';
        okBtn.onclick = () => { executePair(chA, chB, chB); confirmModal.style.display='none'; document.getElementById('pairModal').style.display='none'; };
    } else if (direction === 'reset') {
        title.innerText = 'RESETAR E PAREAR?';
        text.innerText = `Esta ação irá resetar os canais ${chA+1} e ${chB+1} para o padrão de fábrica e ATIVAR o pareamento entre eles.`;
        okBtn.style.background = '#ffa726';
        okBtn.innerText = 'SIM, RESETAR E PAREAR';
        okBtn.onclick = () => { executeResetBoth(chA, chB); confirmModal.style.display='none'; document.getElementById('pairModal').style.display='none'; };
    }
    confirmModal.style.display = 'flex';
};

window.openUnpairConfirm = function(chIdx) {
    const partnerIdx = channelStates[chIdx].pairedWith;
    const chA = Math.min(chIdx, partnerIdx);
    const chB = Math.max(chIdx, partnerIdx);
    
    const confirmModal = document.getElementById('pairConfirmModal');
    const title = document.getElementById('pairConfirmTitle');
    const text = document.getElementById('pairConfirmText');
    const okBtn = document.getElementById('pairConfirmOkBtn');
    
    title.innerText = 'DESFAZER PAIR?';
    text.innerText = `Deseja desparear o canal ${chA+1} e ${chB+1}? Os canais voltarão a ser independentes.`;
    okBtn.style.background = '#c62828';
    okBtn.innerText = 'SIM, UNPAIR';
    okBtn.onclick = () => { executeUnpair(chA, chB); confirmModal.style.display='none'; };
    
    confirmModal.style.display = 'flex';
};

function executePair(chA, chB, sourceCh) {
    if (!appReady) return;
    console.log(`[PAIR] Executando: CH ${chA+1}+${chB+1} (Source: ${sourceCh+1})`);
    socket.emit('pairChannel', { action: 'pair', chA, chB, sourceCh });
    
    // Update Local
    channelStates[chA].paired = true; channelStates[chA].pairedWith = chB;
    channelStates[chB].paired = true; channelStates[chB].pairedWith = chA;
    channelStates[chA].pairSource = sourceCh;
    
    renderRouting(activeConfigChannel);
    if (typeof initUI === 'function') initUI();
}

function executeUnpair(chA, chB) {
    if (!appReady) return;
    console.log(`[PAIR] Desfazendo: CH ${chA+1}+${chB+1}`);
    socket.emit('pairChannel', { action: 'unpair', chA, chB });
    
    // Update Local
    channelStates[chA].paired = false; channelStates[chA].pairedWith = null;
    channelStates[chB].paired = false; channelStates[chB].pairedWith = null;
    
    renderRouting(activeConfigChannel);
    if (typeof initUI === 'function') initUI();
}

function executeResetBoth(chA, chB) {
    if (!appReady) return;
    console.log(`[PAIR] Resetando: CH ${chA+1} e ${chB+1}`);
    socket.emit('pairChannel', { action: 'reset', chA, chB });
}

function getBusButtonLabel(busIndex) {
    const ch = 44 + busIndex;
    const resolved = window.resolvedNames && window.resolvedNames[ch];

    if (resolved && (resolved.source === 'global' || resolved.source === 'custom')) {
        const cleanName = (resolved.name || '').replace(/\s+/g, '');
        if (cleanName.length > 0) {
            return cleanName.substring(0, 4);
        }
        const shortTrimmed = (resolved.short || '').trim();
        return shortTrimmed.length > 0 ? shortTrimmed : `BUS${busIndex + 1}`;
    }

    if (resolved) {
        const shortTrimmed = (resolved.short || '').trim();
        return shortTrimmed.length > 0 ? shortTrimmed : `BUS${busIndex + 1}`;
    }

    return `BUS${busIndex + 1}`;
}

window.updateBusRoutingLabels = function () {
    const buttons = document.querySelectorAll('.bus-grid .bus-btn');
    if (!buttons || buttons.length === 0) return;
    buttons.forEach((btn, i) => {
        btn.innerText = getBusButtonLabel(i);
    });
};

window.getPatchName = getPatchName;
