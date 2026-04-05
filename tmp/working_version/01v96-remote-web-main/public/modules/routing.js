window.renderRouting = function(chIdx) {
    const container = document.querySelector('.ch-modal-body');
    const chData = channelStates[chIdx];
    const patchVal = chData.patch || 0; 
    
    container.innerHTML = `
        <div class="routing-container" style="display: flex; flex-direction: column; gap: 25px; padding: 15px; height: 100%; overflow-y: auto;">
            <!-- Seção de Patch -->
            <div class="routing-section">
                <p style="font-size: 10px; color: #666; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 15px;">Entrada do Canal (Patch)</p>
                <div class="patch-display-box" onclick="openPatchSelector(${chIdx})" style="background: #222; border: 1px solid #444; border-radius: 10px; padding: 20px; display: flex; align-items: center; justify-content: space-between; cursor: pointer;">
                    <div style="display: flex; flex-direction: column;">
                        <span style="font-size: 12px; color: #888;">FONTE ATUAL:</span>
                        <span id="currentPatchName" style="font-size: 20px; font-weight: bold; color: #5cacee;">${getPatchName(patchVal)}</span>
                    </div>
                    <div style="background: #333; width: 40px; height: 40px; border-radius: 8px; display: flex; align-items: center; justify-content: center; color: #aaa;">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12h14"/></svg>
                    </div>
                </div>
            </div>

            <!-- Seção de BUS / STEREO -->
            <div class="routing-section" style="border-top: 1px solid #333; padding-top: 20px;">
                <p style="font-size: 10px; color: #666; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 15px;">Enviar para BUS</p>
                <div class="bus-grid" style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 30px;">
                    ${Array.from({length: 8}, (_, i) => {
                        const active = chData.buses && chData.buses[i];
                        return `<button class="bus-btn" 
                            onclick="toggleBusAssignment(${chIdx}, ${i})"
                            style="height: 45px; background: ${active ? '#28a745' : '#333'}; 
                                   border: 1px solid ${active ? '#34c759' : '#444'}; 
                                   color: ${active ? '#fff' : '#aaa'}; 
                                   border-radius: 8px; font-size: 12px; font-weight: bold; cursor: pointer;">
                            BUS ${i+1}
                        </button>`;
                    }).join('')}
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
};

window.toggleStereoAssignment = function(chIdx) {
    if (!appReady) return;
    const currentState = !!channelStates[chIdx].stereo;
    const newState = !currentState;
    
    console.log(`[STEREO] Canal ${chIdx+1} -> MASTER = ${newState}`);
    
    socket.emit('control', {
        type: `kInputBus/kStereo`,
        channel: chIdx,
        value: newState ? 1 : 0
    });

    channelStates[chIdx].stereo = newState;
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
    if (val === 0) return "NONE";
    if (val >= 1 && val <= 16) return `AD ${val}`;
    if (val >= 17 && val <= 24) return `GAP ${val}`;
    if (val >= 25 && val <= 40) return `S1-${val - 24}`;
    if (val >= 41 && val <= 48) return `ADAT ${val - 40}`;
    
    // Mapeamento específico de efeitos conforme log
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

window.openPatchSelector = function(chIdx) {
    const grid = document.getElementById('patchGrid');
    grid.innerHTML = '';
    
    // Categorias Finais (Slot movido pro final apenas visualmente)
    const categories = [
        { name: 'MIXER / ANALOG', options: [] },
        { name: 'ADAT (ÓPTICO)', options: [] },
        { name: 'EFFECTS / FX', options: [] },
        { name: 'DIGITAL / 2TD', options: [] },
        { name: 'SLOT (S1)', options: [] }
    ];
    
    // Analog (1-16) -> Categoria 0
    categories[0].options.push({ id: 0, name: 'NONE' });
    for(let i=1; i<=16; i++) categories[0].options.push({ id: i, name: `AD${i}` });
    
    // ADAT (41-48) -> Categoria 1
    for(let i=1; i<=8; i++) categories[1].options.push({ id: 40+i, name: `ADT${i}` });
    
    // FX (IDs Fixos) -> Categoria 2
    const fxOpts = [
        { id: 121, n: "FX1-1" }, { id: 122, n: "FX1-2" },
        { id: 129, n: "FX2-1" }, { id: 130, n: "FX2-2" },
        { id: 137, n: "FX3-1" }, { id: 138, n: "FX3-2" },
        { id: 139, n: "FX4-1" }, { id: 140, n: "FX4-2" }
    ];
    fxOpts.forEach(o => categories[2].options.push({ id: o.id, name: o.n }));
    
    // Digital (149-150) -> Categoria 3
    categories[3].options.push({ id: 149, name: '2TD-L' });
    categories[3].options.push({ id: 150, name: '2TD-R' });

    // Slot (25-40) -> Categoria 4 (FINAL)
    for(let i=1; i<=16; i++) categories[4].options.push({ id: 24+i, name: `S1-${i}` });

    categories.forEach(cat => {
        if (cat.options.length === 0) return;

        const header = document.createElement('div');
        header.style.gridColumn = '1 / -1';
        header.style.padding = '15px 5px 5px 5px';
        header.style.fontSize = '9px';
        header.style.fontWeight = 'bold';
        header.style.color = '#555';
        header.style.textTransform = 'uppercase';
        header.style.borderBottom = '1px solid #333';
        grid.appendChild(header);
        header.innerText = cat.name;

        cat.options.forEach(opt => {
            const btn = document.createElement('button');
            btn.className = 'patch-opt-btn';
            btn.innerText = opt.name;
            btn.style.height = '45px';
            btn.style.background = (channelStates[chIdx].patch === opt.id) ? '#28a745' : '#2a2a2a';
            btn.style.color = (channelStates[chIdx].patch === opt.id) ? '#fff' : '#ccc';
            btn.style.border = '1px solid #444';
            btn.style.borderRadius = '5px';
            btn.style.fontSize = '10px';
            btn.style.cursor = 'pointer';
            btn.onclick = () => {
                selectPatch(chIdx, opt.id);
                document.getElementById('patchSelectorModal').style.display = 'none';
            };
            grid.appendChild(btn);
        });
    });

    document.getElementById('patchSelectorModal').style.display = 'flex';
};

function selectPatch(chIdx, patchId) {
    if (!appReady) return;
    console.log(`[FRONT] Mudando Canal ${chIdx + 1} para Patch ${patchId}`);
    socket.emit('control', {
        type: 'kChannelInput/kChannelIn',
        channel: chIdx,
        value: patchId
    });
    
    // UI Local
    channelStates[chIdx].patch = patchId;
    const nameEl = document.getElementById('currentPatchName');
    if (nameEl) nameEl.innerText = getPatchName(patchId);
}
