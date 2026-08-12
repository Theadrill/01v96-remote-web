// Lógica de configuração de Inserts (IN / OUT / POSITION)

window.openInsertModal = function(chIdx) {
    if (!appReady) return;
    window._insertModalChannel = chIdx;
    const chData = getChannelStateById(chIdx) || {};
    if (!chData.insert) chData.insert = { on: false, position: 0, patch_in: 0 };
    
    // Obter patch_out se existir, buscando em globalOutPatches
    let currentOut = 0; // 0 = None
    if (window.globalOutPatches) {
        let targetSrcNormal = 0;
        let targetSrcFx = 0;
        if (chIdx >= 0 && chIdx <= 31) {
            targetSrcNormal = chIdx + 31;
            targetSrcFx = chIdx + 13;
        } else if (chIdx >= 44 && chIdx <= 51) {
            targetSrcNormal = (chIdx - 44) + 127;
            targetSrcFx = (chIdx - 44) + 109;
        } else if (chIdx >= 36 && chIdx <= 43) {
            targetSrcNormal = (chIdx - 36) + 9;
            targetSrcFx = (chIdx - 36) + 117;
        }
        
        for (let p = 0; p < 4; p++) {
            if (window.globalOutPatches.omni && window.globalOutPatches.omni[p] === targetSrcNormal) { currentOut = p + 60; break; }
        }
        if (!currentOut) {
            for (let p = 0; p < 8; p++) {
                if (window.globalOutPatches.adat && window.globalOutPatches.adat[p] === targetSrcNormal) { currentOut = p + 40; break; }
            }
        }
        if (!currentOut) {
            for (let p = 0; p < 16; p++) {
                if (window.globalOutPatches.slot && window.globalOutPatches.slot[p] === targetSrcNormal) { currentOut = p + 90; break; }
            }
        }
        if (!currentOut) {
            for (let p = 0; p < 2; p++) {
                if (window.globalOutPatches['2tr'] && window.globalOutPatches['2tr'][p] === targetSrcNormal) { currentOut = p + 110; break; }
            }
        }
        if (!currentOut) {
            for (let p = 0; p < 8; p++) {
                if (window.globalOutPatches.fx && window.globalOutPatches.fx[p] === targetSrcFx) { currentOut = p + 70; break; }
            }
        }
    }

    const positionName = chData.insert.position === 1 ? 'PRE FADER' : (chData.insert.position === 2 ? 'POST FADER' : 'PRE EQ');
    
    let outName = "NONE";
    if (currentOut >= 60 && currentOut <= 63) outName = `OMNI ${currentOut - 59}`;
    else if (currentOut >= 40 && currentOut <= 47) outName = `ADAT ${currentOut - 39}`;
    else if (currentOut >= 90 && currentOut <= 105) outName = `S1-${currentOut - 89}`;
    else if (currentOut >= 110 && currentOut <= 111) outName = `2TD ${currentOut === 110 ? 'L' : 'R'}`;
    else if (currentOut >= 70 && currentOut <= 77) {
        const fxNum = Math.floor((currentOut - 70) / 2) + 1;
        const fxSide = (currentOut - 70) % 2 === 0 ? '1' : '2';
        outName = `FX ${fxNum}-${fxSide}`;
    }

    // Identificar nome do Insert IN a partir do valor (0-150+)
    let inName = "NONE";
    if (chData.insert.patch_in >= 1 && chData.insert.patch_in <= 16) inName = `AD ${chData.insert.patch_in}`;
    else if (chData.insert.patch_in >= 25 && chData.insert.patch_in <= 40) inName = `S1-${chData.insert.patch_in - 24}`;
    else if (chData.insert.patch_in >= 41 && chData.insert.patch_in <= 48) inName = `ADAT ${chData.insert.patch_in - 40}`;
    else if (chData.insert.patch_in >= 120) {
        // Encontrar FX pelo valor (121, 122, 129, 130...)
        for (let i = 1; i <= 4; i++) {
            const base = 121 + (i-1)*8;
            if (chData.insert.patch_in === base) inName = `FX ${i}-1`;
            if (chData.insert.patch_in === base + 1) inName = `FX ${i}-2`;
        }
        if (chData.insert.patch_in === 149) inName = '2TD L';
        if (chData.insert.patch_in === 150) inName = '2TD R';
    }

    let titleName = `CH ${chIdx + 1}`;
    if (chIdx >= 44 && chIdx <= 51) titleName = `BUS ${chIdx - 43}`;
    else if (chIdx >= 36 && chIdx <= 43) titleName = `AUX ${chIdx - 35}`;

    const html = `
        <div style="padding: 20px;">
            <h3 style="margin-top:0; color:#5cacee; margin-bottom:20px;"><i class="fas fa-random"></i> CONFIGURAR INSERT - ${titleName}</h3>
            
            <div style="display:flex; flex-direction:column; gap:15px;">
                <!-- INSERT ON/OFF -->
                <button onclick="toggleInsertOn(${chIdx})" 
                    style="height:60px; font-size:18px; font-weight:bold; border-radius:10px; border:1px solid ${chData.insert.on ? '#5cacee' : '#444'}; background: ${chData.insert.on ? '#1a334d' : '#222'}; color: ${chData.insert.on ? '#5cacee' : '#aaa'}; cursor:pointer;">
                    INSERT IS ${chData.insert.on ? 'ON' : 'OFF'}
                </button>

                <!-- POSITION -->
                <div style="background:#222; border:1px solid #444; border-radius:10px; padding:15px; cursor:pointer;" onclick="openInsertPositionSelector(${chIdx})">
                    <div style="font-size:11px; color:#888; margin-bottom:5px;">POSITION</div>
                    <div style="font-size:18px; font-weight:bold; color:#fff;">${positionName}</div>
                </div>

                <!-- OUT PATCH -->
                <div style="background:#222; border:1px solid #444; border-radius:10px; padding:15px; cursor:pointer;" onclick="openInsertOutSelector(${chIdx}, ${currentOut})">
                    <div style="font-size:11px; color:#888; margin-bottom:5px;">INSERT OUT</div>
                    <div style="font-size:18px; font-weight:bold; color:#ff9800;">${outName}</div>
                </div>

                <!-- IN PATCH -->
                <div style="background:#222; border:1px solid #444; border-radius:10px; padding:15px; cursor:pointer;" onclick="openInsertInSelector(${chIdx}, ${chData.insert.patch_in})">
                    <div style="font-size:11px; color:#888; margin-bottom:5px;">INSERT IN</div>
                    <div style="font-size:18px; font-weight:bold; color:#4caf50;">${inName}</div>
                </div>
            </div>

            <button onclick="closeInsertModal()" style="margin-top:25px; width:100%; height:50px; background:#444; border:none; color:#fff; border-radius:8px; font-weight:bold; cursor:pointer;">
                FECHAR
            </button>
        </div>
    `;

    const overlay = document.getElementById('insertModalOverlay') || createInsertModalOverlay();
    const modal = document.getElementById('insertModalContent');
    modal.innerHTML = html;
    overlay.style.display = 'flex';
};

window.toggleInsertOn = function(chIdx) {
    if (!appReady) return;
    const chData = getChannelStateById(chIdx);
    const newState = !(chData.insert && chData.insert.on);
    
    const commandType = (chIdx >= 44 && chIdx <= 51) ? 'kBusInsert/kInsertOn' : 'kInputInsert/kInsertOn';
    socket.emit('control', {
        type: commandType,
        channel: chIdx,
        value: newState ? 1 : 0
    });
    
    if(chData.insert) chData.insert.on = newState;
    window.openInsertModal(chIdx); // Re-render
    if (typeof renderRouting === 'function') renderRouting(chIdx);
};

window.closeInsertModal = function() {
    const overlay = document.getElementById('insertModalOverlay');
    if (overlay) overlay.style.display = 'none';
};

function createInsertModalOverlay() {
    const overlay = document.createElement('div');
    overlay.id = 'insertModalOverlay';
    overlay.classList.add('modal-overlay');
    overlay.style.cssText = 'position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.85); display:none; justify-content:center; align-items:center; z-index:9999;';
    
    const content = document.createElement('div');
    content.id = 'insertModalContent';
    content.style.cssText = 'background:#111; width:90%; max-width:400px; border-radius:15px; border:1px solid #333; box-shadow:0 10px 30px rgba(0,0,0,0.5);';
    
    overlay.addEventListener('click', function(e) { if(e.target === overlay) overlay.style.display = 'none'; });
    overlay.appendChild(content);
    document.body.appendChild(overlay);
    return overlay;
}

// === POSITION SELECTOR ===
window.openInsertPositionSelector = function(chIdx) {
    const overlay = document.getElementById('insertPosModalOverlay') || createInsertPosModalOverlay();
    const modal = document.getElementById('insertPosModalContent');
    
    const html = `
        <div style="padding: 20px;">
            <h3 style="margin-top:0; color:#fff; margin-bottom:20px;">INSERT POSITION</h3>
            <div style="display:flex; flex-direction:column; gap:10px;">
                <button onclick="setInsertPosition(${chIdx}, 0)" style="height:50px; background:#222; border:1px solid #444; color:#fff; border-radius:8px;">PRE EQ</button>
                <button onclick="setInsertPosition(${chIdx}, 1)" style="height:50px; background:#222; border:1px solid #444; color:#fff; border-radius:8px;">PRE FADER</button>
                <button onclick="setInsertPosition(${chIdx}, 2)" style="height:50px; background:#222; border:1px solid #444; color:#fff; border-radius:8px;">POST FADER</button>
            </div>
            <button onclick="closeInsertPosModal()" style="margin-top:20px; width:100%; height:50px; background:#444; border:none; color:#fff; border-radius:8px;">CANCELAR</button>
        </div>
    `;
    modal.innerHTML = html;
    overlay.style.display = 'flex';
};

window.setInsertPosition = function(chIdx, posVal) {
    const commandType = (chIdx >= 44 && chIdx <= 51) ? 'kBusInsert/kInsertLocInsert' : 'kInputInsert/kInsertLocInsert';
    socket.emit('control', {
        type: commandType,
        channel: chIdx,
        value: posVal
    });
    const chData = getChannelStateById(chIdx);
    if(chData.insert) chData.insert.position = posVal;
    closeInsertPosModal();
    window.openInsertModal(chIdx);
};

window.closeInsertPosModal = function() {
    const overlay = document.getElementById('insertPosModalOverlay');
    if (overlay) overlay.style.display = 'none';
};

function createInsertPosModalOverlay() {
    const overlay = document.createElement('div');
    overlay.id = 'insertPosModalOverlay';
    overlay.classList.add('modal-overlay');
    overlay.style.cssText = 'position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.85); display:none; justify-content:center; align-items:center; z-index:10000;';
    const content = document.createElement('div');
    content.id = 'insertPosModalContent';
    content.style.cssText = 'background:#111; width:90%; max-width:350px; border-radius:15px; border:1px solid #333;';
    
    overlay.addEventListener('click', function(e) { if(e.target === overlay) overlay.style.display = 'none'; });
    overlay.appendChild(content);
    document.body.appendChild(overlay);
    return overlay;
}

// === OUT SELECTOR ===
window.openInsertOutSelector = function(chIdx, currentOut) {
    // Exibir opções: NONE, OMNI 1-4, ADAT 1-8, FX 1-4 (1-2)
    const overlay = document.getElementById('insertOutModalOverlay') || createInsertOutModalOverlay();
    const modal = document.getElementById('insertOutModalContent');
    
    let optionsHtml = '<button onclick="setInsertOut(' + chIdx + ', null, 0)" style="height:45px; background:#222; border:1px solid #444; color:#fff; border-radius:8px; margin-bottom:10px;">NONE</button>';
    
    optionsHtml += '<div style="color:#666; font-size:12px; margin-top:10px; margin-bottom:5px;">OMNI</div>';
    optionsHtml += '<div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">';
    for(let i=1; i<=4; i++) {
        optionsHtml += `<button onclick="setInsertOut(${chIdx}, 'omni', ${i-1})" style="height:45px; background:#222; border:1px solid #444; color:#fff; border-radius:8px;">OMNI ${i}</button>`;
    }
    optionsHtml += '</div>';

    optionsHtml += '<div style="color:#666; font-size:12px; margin-top:15px; margin-bottom:5px;">ADAT</div>';
    optionsHtml += '<div style="display:grid; grid-template-columns:1fr 1fr 1fr 1fr; gap:5px;">';
    for(let i=1; i<=8; i++) {
        optionsHtml += `<button onclick="setInsertOut(${chIdx}, 'adat', ${i-1})" style="height:45px; background:#222; border:1px solid #444; color:#fff; border-radius:8px;">ADAT ${i}</button>`;
    }
    optionsHtml += '</div>';

    optionsHtml += '<div style="color:#666; font-size:12px; margin-top:15px; margin-bottom:5px;">SLOT 1</div>';
    optionsHtml += '<div style="display:grid; grid-template-columns:1fr 1fr 1fr 1fr; gap:5px;">';
    for(let i=1; i<=16; i++) {
        optionsHtml += `<button onclick="setInsertOut(${chIdx}, 'slot', ${i-1})" style="height:45px; background:#222; border:1px solid #444; color:#fff; border-radius:8px;">S1-${i}</button>`;
    }
    optionsHtml += '</div>';

    optionsHtml += '<div style="color:#666; font-size:12px; margin-top:15px; margin-bottom:5px;">EFFECTS</div>';
    optionsHtml += '<div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">';
    for(let i=1; i<=4; i++) {
        optionsHtml += `<button onclick="setInsertOut(${chIdx}, 'fx', ${(i-1)*2})" style="height:45px; background:#222; border:1px solid #444; color:#fff; border-radius:8px;">FX ${i}-1</button>`;
        optionsHtml += `<button onclick="setInsertOut(${chIdx}, 'fx', ${(i-1)*2+1})" style="height:45px; background:#222; border:1px solid #444; color:#fff; border-radius:8px;">FX ${i}-2</button>`;
    }
    optionsHtml += '</div>';
    
    optionsHtml += '<div style="color:#666; font-size:12px; margin-top:15px; margin-bottom:5px;">2TR OUT</div>';
    optionsHtml += '<div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">';
    optionsHtml += `<button onclick="setInsertOut(${chIdx}, '2tr', 0)" style="height:45px; background:#222; border:1px solid #444; color:#fff; border-radius:8px;">2TD L</button>`;
    optionsHtml += `<button onclick="setInsertOut(${chIdx}, '2tr', 1)" style="height:45px; background:#222; border:1px solid #444; color:#fff; border-radius:8px;">2TD R</button>`;
    optionsHtml += '</div>';

    let titleName = `CH ${chIdx + 1}`;
    if (chIdx >= 44 && chIdx <= 51) titleName = `BUS ${chIdx - 43}`;
    else if (chIdx >= 36 && chIdx <= 43) titleName = `AUX ${chIdx - 35}`;

    const html = `
        <div style="padding: 20px;">
            <h3 style="margin-top:0; color:#ff9800; margin-bottom:15px;">INSERT OUT ${titleName}</h3>
            <div style="max-height: 60vh; overflow-y: auto; padding-right:5px;">
                ${optionsHtml}
            </div>
            <button onclick="closeInsertOutModal()" style="margin-top:20px; width:100%; height:50px; background:#444; border:none; color:#fff; border-radius:8px;">CANCELAR</button>
        </div>
    `;
    modal.innerHTML = html;
    overlay.style.display = 'flex';
};

window.setInsertOut = function(chIdx, type, portIdx) {
    let srcValue = 0;
    if (type !== null) {
        if (chIdx >= 0 && chIdx <= 31) {
            srcValue = (type === 'fx') ? chIdx + 13 : chIdx + 31;
        } else if (chIdx >= 44 && chIdx <= 51) {
            const busIdx = chIdx - 44;
            srcValue = (type === 'fx') ? busIdx + 109 : busIdx + 127;
        } else if (chIdx >= 36 && chIdx <= 43) {
            const auxIdx = chIdx - 36;
            srcValue = (type === 'fx') ? auxIdx + 117 : auxIdx + 9;
        }
    }
    
    if (type !== null) {
        let currentAssignedSrc = 0;
        if (window.globalOutPatches && window.globalOutPatches[type]) {
            currentAssignedSrc = window.globalOutPatches[type][portIdx] || 0;
        }

        if (currentAssignedSrc > 0 && currentAssignedSrc !== srcValue) {
            // Mostrar modal de confirmação
            showInsertOutConfirmModal(chIdx, type, portIdx, srcValue, currentAssignedSrc);
            return;
        }
    }
    
    executeSetInsertOut(chIdx, type, portIdx, srcValue);
};

window.executeSetInsertOut = function(chIdx, type, portIdx, srcValue) {
    if (type !== null) {
        let commandType = '';
        let channelArg = portIdx;
        
        if (type === 'omni') { commandType = 'kOutputPatch/kOmni'; }
        else if (type === 'adat') { commandType = 'kOutputPatch/kAdat'; }
        else if (type === 'slot') { commandType = 'kOutputPatch/kSlot'; }
        else if (type === '2tr') { commandType = 'kOutputPatch/k2tr'; }
        else if (type === 'fx') {
            commandType = 'kOutputPatch/kFx';
            const fxNum = Math.floor(portIdx / 2);
            const isRight = portIdx % 2 !== 0;
            channelArg = isRight ? (fxNum + 4) : fxNum;
        }

        clearPreviousInsertOut(chIdx);
        
        let targetWasCleared = false;
        if (type !== null && window.globalOutPatches && window.globalOutPatches[type]) {
            if (window.globalOutPatches[type][portIdx] !== 0) {
                socket.emit('control', { type: commandType, channel: channelArg, value: 0 });
                targetWasCleared = true;
            }
        }
        
        if (type !== null) {
            setTimeout(() => {
                socket.emit('control', { type: commandType, channel: channelArg, value: srcValue });
                
                // Update local otimista
                if (!window.globalOutPatches) window.globalOutPatches = {omni:{}, adat:{}, fx:{}, slot:{}, '2tr':{}};
                if (!window.globalOutPatches[type]) window.globalOutPatches[type] = {};
                window.globalOutPatches[type][portIdx] = srcValue;
                
                window.openInsertModal(chIdx);
            }, targetWasCleared ? 100 : 50);
        }
    } else {
        clearPreviousInsertOut(chIdx);
        window.openInsertModal(chIdx);
    }

    closeInsertOutModal();
};

window.clearPreviousInsertOut = function(chIdx) {
    let srcToClearNormal = 0;
    let srcToClearFx = 0;
    if (chIdx >= 0 && chIdx <= 31) {
        srcToClearNormal = chIdx + 31;
        srcToClearFx = chIdx + 13;
    } else if (chIdx >= 44 && chIdx <= 51) {
        srcToClearNormal = (chIdx - 44) + 127;
        srcToClearFx = (chIdx - 44) + 109;
    } else if (chIdx >= 36 && chIdx <= 43) {
        srcToClearNormal = (chIdx - 36) + 9;
        srcToClearFx = (chIdx - 36) + 117;
    }
    
    if (window.globalOutPatches) {
        for (let t of ['omni', 'adat', 'fx', 'slot', '2tr']) {
            if(!window.globalOutPatches[t]) continue;
            for (let p in window.globalOutPatches[t]) {
                const currentVal = window.globalOutPatches[t][p];
                if (currentVal === srcToClearNormal || currentVal === srcToClearFx) {
                    let commandType = '';
                    let channelArg = parseInt(p);
                    
                    if (t === 'omni') commandType = 'kOutputPatch/kOmni';
                    else if (t === 'adat') commandType = 'kOutputPatch/kAdat';
                    else if (t === 'slot') commandType = 'kOutputPatch/kSlot';
                    else if (t === '2tr') commandType = 'kOutputPatch/k2tr';
                    else if (t === 'fx') { 
                        commandType = 'kOutputPatch/kFx';
                        const fxNum = Math.floor(channelArg / 2);
                        channelArg = (channelArg % 2 !== 0) ? (fxNum + 4) : fxNum;
                    }
                    
                    socket.emit('control', { type: commandType, channel: channelArg, value: 0 });
                    window.globalOutPatches[t][p] = 0;
                }
            }
        }
    }
}


function getOutSourceName(val, type) {
    if (type === 'fx') {
        if (val >= 13 && val <= 44) return `INSERT CH ${val - 12}`;
        if (val >= 109 && val <= 116) return `BUS ${val - 108}`;
        if (val >= 117 && val <= 124) return `AUX ${val - 116}`;
        return `SOURCE ${val}`;
    }
    if (val >= 31 && val <= 62) return `INSERT CH ${val - 30}`;
    if (val >= 1 && val <= 8) return `BUS ${val}`;
    if (val >= 9 && val <= 16) return `AUX ${val - 8}`;
    if (val === 17) return `STEREO L`;
    if (val === 18) return `STEREO R`;
    if (val === 19) return `CONTROL ROOM L`;
    if (val === 20) return `CONTROL ROOM R`;
    return `SOURCE ${val}`;
}

function getOutPortName(type, portIdx) {
    if (type === 'omni') return `OMNI ${portIdx + 1}`;
    if (type === 'adat') return `ADAT ${portIdx + 1}`;
    if (type === 'slot') return `S1-${portIdx + 1}`;
    if (type === '2tr') return `2TD ${portIdx === 0 ? 'L' : 'R'}`;
    if (type === 'fx') {
        const fxNum = Math.floor(portIdx / 2) + 1;
        const fxSide = (portIdx % 2 === 0) ? '1' : '2';
        return `FX ${fxNum}-${fxSide}`;
    }
    return 'UNKNOWN';
}

window.showInsertOutConfirmModal = function(chIdx, type, portIdx, srcValue, currentAssignedSrc) {
    const currentName = getOutSourceName(currentAssignedSrc, type);
    const newName = getOutSourceName(srcValue, type);
    const portName = getOutPortName(type, portIdx);

    ConfirmModal.show({
        title: 'ATENÇÃO',
        message: `A porta <strong>${portName}</strong> já está sendo usada por <strong>${currentName}</strong>.<br><br>Deseja alterar o roteamento para <strong>${newName}</strong>?`,
        type: 'danger',
        confirmText: 'SIM',
        cancelText: 'NÃO'
    }).then(function(ok) {
        if (ok) {
            executeSetInsertOut(chIdx, type, portIdx, srcValue);
        }
    });
};

window.closeInsertOutModal = function() {
    const overlay = document.getElementById('insertOutModalOverlay');
    if (overlay) overlay.style.display = 'none';
};

function createInsertOutModalOverlay() {
    const overlay = document.createElement('div');
    overlay.id = 'insertOutModalOverlay';
    overlay.classList.add('modal-overlay');
    overlay.style.cssText = 'position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.85); display:none; justify-content:center; align-items:center; z-index:10000;';
    const content = document.createElement('div');
    content.id = 'insertOutModalContent';
    content.style.cssText = 'background:#111; width:90%; max-width:400px; border-radius:15px; border:1px solid #333;';
    overlay.addEventListener('click', function(e) { if(e.target === overlay) overlay.style.display = 'none'; });
    overlay.appendChild(content);
    document.body.appendChild(overlay);
    return overlay;
}

// === IN SELECTOR ===
window.openInsertInSelector = function(chIdx, currentIn) {
    // Usaremos uma lógica similar à tela de PATCH normal, mas emitindo kChannelInsertIn/kInsertIn
    const overlay = document.getElementById('insertInModalOverlay') || createInsertInModalOverlay();
    const modal = document.getElementById('insertInModalContent');
    
    // Renderiza as opções idênticas ao "openPatchSelector", mas simplificadas para botões HTML brutos
    // Para simplificar, vou usar o window.getPatchName se existir para criar uma lista.
    // AD1-AD32 (1-32)
    // SLOT1-16 (41-56)
    // FX1-1 a FX4-2 (73-80) // 01V96 FX retorna é a partir do 73
    // NONE = 0
    let optionsHtml = '';
    
    // Opções de IN PATCH
    optionsHtml += '<div style="color:#666; font-size:12px; margin-top:5px; margin-bottom:5px;">MIXER / ANALOG (1-16)</div>';
    optionsHtml += `<button onclick="setInsertIn(${chIdx}, 0)" style="width:100%; height:35px; margin-bottom:5px; border-radius:5px; border:1px solid #444; background:${currentIn === 0 ? '#5cacee' : '#333'}; color:${currentIn === 0 ? '#000' : '#aaa'}; font-weight:bold; cursor:pointer;">NONE</button>`;
    
    // AD 1 a 16 -> IDs 1 a 16
    for(let i=1; i<=16; i++) {
        optionsHtml += `<button onclick="setInsertIn(${chIdx}, ${i})" style="width:23%; height:35px; margin:1%; border-radius:5px; border:1px solid #444; background:${currentIn === i ? '#5cacee' : '#222'}; color:${currentIn === i ? '#000' : '#aaa'}; font-size:10px; cursor:pointer;">AD ${i}</button>`;
    }

    optionsHtml += '<div style="color:#666; font-size:12px; margin-top:15px; margin-bottom:5px;">SLOT 1 (1-16)</div>';
    // Slot 1 a 16 -> IDs 25 a 40
    for(let i=1; i<=16; i++) {
        optionsHtml += `<button onclick="setInsertIn(${chIdx}, ${i+24})" style="width:23%; height:35px; margin:1%; border-radius:5px; border:1px solid #444; background:${currentIn === (i+24) ? '#5cacee' : '#222'}; color:${currentIn === (i+24) ? '#000' : '#aaa'}; font-size:10px; cursor:pointer;">S1-${i}</button>`;
    }

    optionsHtml += '<div style="color:#666; font-size:12px; margin-top:15px; margin-bottom:5px;">ADAT (1-8)</div>';
    // ADAT 1 a 8 -> IDs 41 a 48
    for(let i=1; i<=8; i++) {
        optionsHtml += `<button onclick="setInsertIn(${chIdx}, ${i+40})" style="width:23%; height:35px; margin:1%; border-radius:5px; border:1px solid #444; background:${currentIn === (i+40) ? '#5cacee' : '#222'}; color:${currentIn === (i+40) ? '#000' : '#aaa'}; font-size:10px; cursor:pointer;">ADAT ${i}</button>`;
    }

    optionsHtml += '<div style="color:#666; font-size:12px; margin-top:15px; margin-bottom:5px;">FX RETURNS</div>';
    optionsHtml += '<div style="display:grid; grid-template-columns:repeat(2, 1fr); gap:5px;">';
    for(let i=1; i<=4; i++) {
        // Values: FX1=121/122, FX2=129/130, FX3=137/138, FX4=145/146
        const fxBase = 121 + (i-1)*8;
        optionsHtml += `<button onclick="setInsertIn(${chIdx}, ${fxBase})" style="height:45px; background:#222; border:1px solid #444; color:#fff; border-radius:8px; font-size:12px;">FX ${i}-1</button>`;
        optionsHtml += `<button onclick="setInsertIn(${chIdx}, ${fxBase + 1})" style="height:45px; background:#222; border:1px solid #444; color:#fff; border-radius:8px; font-size:12px;">FX ${i}-2</button>`;
    }
    optionsHtml += '</div>';

    optionsHtml += '<div style="color:#666; font-size:12px; margin-top:15px; margin-bottom:5px;">2TR IN</div>';
    optionsHtml += '<div style="display:grid; grid-template-columns:repeat(2, 1fr); gap:5px;">';
    optionsHtml += `<button onclick="setInsertIn(${chIdx}, 149)" style="height:45px; background:#222; border:1px solid #444; color:#fff; border-radius:8px; font-size:12px;">2TD L</button>`;
    optionsHtml += `<button onclick="setInsertIn(${chIdx}, 150)" style="height:45px; background:#222; border:1px solid #444; color:#fff; border-radius:8px; font-size:12px;">2TD R</button>`;
    optionsHtml += '</div>';

    let titleName = `CH ${chIdx + 1}`;
    if (chIdx >= 44 && chIdx <= 51) titleName = `BUS ${chIdx - 43}`;
    else if (chIdx >= 36 && chIdx <= 43) titleName = `AUX ${chIdx - 35}`;

    const html = `
        <div style="padding: 20px;">
            <h3 style="margin-top:0; color:#4caf50; margin-bottom:15px;">INSERT IN ${titleName}</h3>
            <div style="max-height: 60vh; overflow-y: auto; padding-right:5px;">
                ${optionsHtml}
            </div>
            <button onclick="closeInsertInModal()" style="margin-top:20px; width:100%; height:50px; background:#444; border:none; color:#fff; border-radius:8px;">CANCELAR</button>
        </div>
    `;
    modal.innerHTML = html;
    overlay.style.display = 'flex';
};

window.setInsertIn = function(chIdx, srcValue) {
    // Envia um evento de controle em vez de SysEx bruto.
    // Assim, o servidor atualiza o GlobalState imediatamente.
    const isBus = chIdx >= 44 && chIdx <= 51;
    const commandType = isBus ? 'kBusInsertInput/kBusInsertIn' : 'kChannelInsertIn/kInsertIn';
    socket.emit('control', {
        type: commandType,
        channel: chIdx,
        value: srcValue
    });
    
    // Atualizacao otimista
    const chData = getChannelStateById(chIdx);
    if(chData.insert) chData.insert.patch_in = srcValue;
    closeInsertInModal();
    window.openInsertModal(chIdx);
};

window.closeInsertInModal = function() {
    const overlay = document.getElementById('insertInModalOverlay');
    if (overlay) overlay.style.display = 'none';
};

function createInsertInModalOverlay() {
    const overlay = document.createElement('div');
    overlay.id = 'insertInModalOverlay';
    overlay.classList.add('modal-overlay');
    overlay.style.cssText = 'position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.85); display:none; justify-content:center; align-items:center; z-index:10000;';
    const content = document.createElement('div');
    content.id = 'insertInModalContent';
    content.style.cssText = 'background:#111; width:90%; max-width:400px; border-radius:15px; border:1px solid #333;';
    overlay.addEventListener('click', function(e) { if(e.target === overlay) overlay.style.display = 'none'; });
    overlay.appendChild(content);
    document.body.appendChild(overlay);
    return overlay;
}
