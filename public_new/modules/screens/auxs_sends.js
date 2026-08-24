function renderAuxPrePostBtn(ch, auxIdx, isPre) {
    const cls = isPre ? 'btn-aux-pre active' : 'btn-aux-pre';
    return `<button id="aux_pre_${ch}_${auxIdx}" class="${cls}" onclick="handleAuxPreToggle(event, ${ch}, ${auxIdx})" title="${isPre ? 'PRE (Pre-Fader)' : 'POST (Post-Fader)'}">${isPre ? 'PRE' : 'POST'}</button>`;
}

function handleAuxPreToggle(e, ch, auxIdx) {
    if (e) e.stopPropagation();
    const newVal = toggleAuxPre(ch, auxIdx);
    const btnPre = document.getElementById(`aux_pre_${ch}_${auxIdx}`);
    if (btnPre) {
        btnPre.classList.toggle('active', newVal);
        btnPre.textContent = newVal ? 'PRE' : 'POST';
        btnPre.title = newVal ? 'PRE (Pre-Fader)' : 'POST (Post-Fader)';
    }
}

function getMixBusGlobalLabel(mixIdx) {
    return getMixBusGlobal(mixIdx) === 1 ? 'PRE' : 'POST';
}

function getMixBusPrePointLabel(mixIdx) {
    return getMixBusPrePoint(mixIdx) === 1 ? 'PRE ON' : 'POST ON';
}

async function handleMixBusMode(mixIdx, val) {
    const currentVal = getMixBusMode(mixIdx);
    if (currentVal === val) return;
    
    const currentModeName = currentVal === 0 ? 'VARIABLE' : 'FIXED';
    const targetModeName = val === 0 ? 'VARIABLE' : 'FIXED';
    const mixName = `MIX ${mixIdx + 1}`;
    
    const confirmed = await ConfirmModal.show({
        title: 'ALTERAR MODO DO AUXILIAR',
        message: `Deseja realmente alterar o modo de <b>${mixName}</b> de <b>${currentModeName}</b> para <b>${targetModeName}</b>?<br><br><small style="color:#aaa;">No modo FIXED, o nível de envio dos canais é travado em valor nominal.</small>`,
        type: 'warning',
        confirmText: 'ALTERAR',
        cancelText: 'CANCELAR'
    });
    
    if (!confirmed) return;
    
    setMixBusMode(mixIdx, val);
    updateAuxConfigModalUI(mixIdx);
    const ch = 36 + mixIdx;
    if (activeConfigChannel === ch) {
        renderAuxs(ch);
    }
}

function handleMixBusGlobal(mixIdx, val) {
    setMixBusGlobal(mixIdx, val);
    const auxIdx = mixIdx + 1;
    const isPre = (val === 1);
    for (let i = 0; i < 32; i++) {
        setAuxPre(i, auxIdx, isPre);
    }
    const ch = 36 + mixIdx;
    if (activeConfigChannel === ch) {
        renderAuxs(ch);
    }
}

function handleMixBusPrePoint(mixIdx, val) {
    setMixBusPrePoint(mixIdx, val);
    const ch = 36 + mixIdx;
    if (activeConfigChannel === ch) {
        renderAuxs(ch);
    }
}

function renderAuxs(ch) {
    const body = document.querySelector('.ch-modal-body');
    if (!body) return;
    
    // 01V96: Buses (44-51) e Master (52) realmente não possuem envios.
    if (ch >= 44) {
        body.innerHTML = `
            <div style="flex:1; display:flex; flex-direction:column; align-items:center; justify-content:center; color:#666; padding:20px; text-align:center;">
                <div style="font-size:48px; margin-bottom:15px; opacity:0.3;"><i class="fas fa-project-diagram"></i></div>
                <div style="font-size:14px; font-weight:bold; text-transform:uppercase;">Sends Não Disponíveis</div>
            </div>`;
        return;
    }

    let html = '';
    
    // --- MODO 1: MIXER DO BARRAMENTO (Se clicou em MIX 1-8, mostra os 32 canais enviando para ele) ---
    if (ch >= 36 && ch <= 43) {
        const auxIdx = ch - 35; // Mix 1 (36) vira Aux 1
        const mixIdx = ch - 36;
        const isMixFixed = (getMixBusMode(mixIdx) === 1);
        for (let i = 0; i < 32; i++) {
            const state = getChannelStateById(i);
            if (state && state.paired && i % 2 !== 0) continue;
            const currentVal = (state && state[`aux${auxIdx}`]) || 0;
            const isOn = (state && state[`aux${auxIdx}On`]) || false;
            const isPre = getAuxPre(i, auxIdx);
            let baseTitle = `${i+1}`;
            if (state && state.paired) {
                baseTitle = `${i+1} + ${i+2}`;
            }

            let chName = baseTitle;
            if (window.resolvedNames && window.resolvedNames[i]) {
                chName = window.resolvedNames[i].name;
            } else if (state && state.name && state.name.trim() !== "") {
                chName = state.name;
            }

            let patchText = '--';
            if (window.PatchRegistry) {
                patchText = (state && state.paired && state.pairedWith !== null)
                    ? window.PatchRegistry.getPairedChannelInput(i, state.pairedWith)
                    : window.PatchRegistry.getChannelInput(i);
            }

            const config = {
                id: i,
                title: baseTitle,
                name: chName,
                customClass: `fader-group-aux-send${isMixFixed ? ' aux-mode-fixed' : ''}`,
                onAction: `toggleAuxOn(${i}, ${auxIdx})`,
                onInputAction: "auxLevelInput",
                onNudgeStartAction: "startAuxNudge",
                onNudgeStopAction: "stopAuxNudge",
                val: currentVal,
                dbLabel: rawToDb(currentVal),
                isOn: isOn,
                evtCh: `${i}, ${auxIdx}`,
                patchText: patchText,
                ids: { f: `aux_f_ch_${i}`, v: `aux_v_ch_${i}`, on: `aux_on_ch_${i}`, name: `aux_name_ch_${i}`, patchVal: `patch-val-${i}` },
                topExtraHtml: renderAuxPrePostBtn(i, auxIdx, isPre)
            };
            html += (layoutMode === 'desktop') ? createDesktopStrip(config) : createMobileStrip(config);
        }
    }
    // --- MODO 2: ENVIOS DO CANAL (Se clicou em CH 1-32, mostra os 8 botões de Aux) ---
    else {
        const state = getChannelStateById(ch);
        for (let i = 1; i <= 8; i++) {
            const currentVal = (state && state[`aux${i}`]) || 0;
            const isOn = (state && state[`aux${i}On`]) || false;
            const isPre = getAuxPre(ch, i);
            
            let baseTitle = `AUX ${i}`;
            let auxName = baseTitle;
            let globalMixId = 35 + i;
            if (window.resolvedNames && window.resolvedNames[globalMixId]) {
                auxName = window.resolvedNames[globalMixId].name;
            }

            let patchText = '--';
            if (window.PatchRegistry) {
                patchText = window.PatchRegistry.getMixOutput(i - 1);
            }

            const config = {
                id: i,
                title: baseTitle,
                name: auxName,
                customClass: "fader-group-aux",
                onAction: `toggleAuxOn(${ch}, ${i})`,
                onInputAction: "auxLevelInput",
                onNudgeStartAction: "startAuxNudge",
                onNudgeStopAction: "stopAuxNudge",
                val: currentVal,
                dbLabel: rawToDb(currentVal),
                isOn: isOn,
                evtCh: `${ch}, ${i}`,
                patchText: patchText,
                ids: { f: `aux_f_${i}`, v: `aux_v_${i}`, on: `aux_on_${i}`, name: `aux_name_display_${i}`, patchVal: `patch-val-m${i-1}` },
                onTop: layoutMode !== 'desktop',
                topExtraHtml: renderAuxPrePostBtn(ch, i, isPre)
            };
            html += (layoutMode === 'desktop') ? createDesktopStrip(config) : createMobileStrip(config);
        }
    }

    body.style.flexDirection = 'column';
    body.style.alignItems = 'stretch';
    body.innerHTML = `
        <div class="aux-sends-area drag-scroll-area" style="display:flex; overflow-x:auto; flex:1; padding:0; gap:0; align-items:stretch;">
            ${html}
        </div>
    `;

    if (typeof window.updateDesktopPatchBadges === 'function') {
        window.updateDesktopPatchBadges();
    }

    if (ch >= 36 && ch <= 43 && typeof getMixVolumeGeralHtml === 'function') {
        const container = document.getElementById('miniFaderContainer');
        if (container) {
            const old = document.getElementById('miniFaderVolumeGeral');
            if (old) old.remove();
            const context = document.getElementById('miniFaderContext');
            const vgSlot = document.createElement('div');
            vgSlot.id = 'miniFaderVolumeGeral';
            vgSlot.style.cssText = 'height:100%; display:flex; align-items:stretch;';
            vgSlot.innerHTML = getMixVolumeGeralHtml();
            container.insertBefore(vgSlot, context);
        }
    } else if (ch <= 31 && typeof getAuxVolumeGeralHtml === 'function') {
        const container = document.getElementById('miniFaderContainer');
        if (container) {
            const old = document.getElementById('miniFaderVolumeGeral');
            if (old) old.remove();
            const context = document.getElementById('miniFaderContext');
            const vgSlot = document.createElement('div');
            vgSlot.id = 'miniFaderVolumeGeral';
            vgSlot.style.cssText = 'height:100%; display:flex; align-items:stretch;';
            vgSlot.innerHTML = getAuxVolumeGeralHtml();
            container.insertBefore(vgSlot, context);
        }
    }

    const area = body.querySelector('.drag-scroll-area');
    if (area && window.enableDragScroll) window.enableDragScroll(area);
}

function auxWheelInput(e, ch, auxIdx) {
    if (layoutMode !== 'desktop') return;
    e.preventDefault();
    e.stopPropagation();
    const state = getChannelStateById(ch);
    const currentRaw = (state && state[`aux${auxIdx}`]) || 0;
    const delta = e.deltaY < 0 ? 10 : -10;
    let nRaw = currentRaw + delta;
    if (nRaw < 0) nRaw = 0; if (nRaw > 1023) nRaw = 1023;
    updateAuxManual(ch, auxIdx, nRaw);
    socket.emit('control', { type: `kInputAUX/kAUX${auxIdx}Level`, channel: ch, value: nRaw });
}

let auxNudgeTimeout = null;
let auxNudgeInterval = null;

function startAuxNudge(ch, auxIdx, dir) {
    stopAuxNudge();
    nudgeAuxLevel(ch, auxIdx, dir);

    auxNudgeTimeout = setTimeout(() => {
        auxNudgeInterval = setInterval(() => {
            nudgeAuxLevel(ch, auxIdx, dir * 3);
        }, 80);
    }, 500);
}

function stopAuxNudge() {
    if (auxNudgeTimeout) clearTimeout(auxNudgeTimeout);
    if (auxNudgeInterval) clearInterval(auxNudgeInterval);
    auxNudgeTimeout = null;
    auxNudgeInterval = null;
}

function nudgeAuxLevel(ch, auxIdx, dir) {
    const state = getChannelStateById(ch);
    const currentRaw = (state && state[`aux${auxIdx}`]) || 0;
    const nRaw = getSteppedRaw(currentRaw, dir, 0.5);

    updateAuxManual(ch, auxIdx, nRaw);
    socket.emit('control', { type: `kInputAUX/kAUX${auxIdx}Level`, channel: ch, value: nRaw });
}

function auxLevelInput(e, ch, auxIdx) {
    if (!appReady) return;
    const val = parseInt(e.target.value);
    updateAuxManual(ch, auxIdx, val);
    socket.emit('control', { type: `kInputAUX/kAUX${auxIdx}Level`, channel: ch, value: val });
}

function updateAuxManual(ch, auxIdx, val) {
    const state = getChannelStateById(ch);
    if (state) state[`aux${auxIdx}`] = val;

    const fader = document.getElementById(`aux_f_${auxIdx}`) || document.getElementById(`aux_f_ch_${ch}`);
    const valDisplay = document.getElementById(`aux_v_${auxIdx}`) || document.getElementById(`aux_v_ch_${ch}`);
    
    if (fader) fader.value = val;
    if (valDisplay) valDisplay.innerText = rawToDb(val);
}

function toggleAuxOn(ch, auxIdx) {
    if (!appReady) return;
    const type = `kInputAUX/kAUX${auxIdx}On`;
    const state = getChannelStateById(ch);
    if (!state) return;

    const newVal = !state[`aux${auxIdx}On`];
    state[`aux${auxIdx}On`] = newVal;

    const btn = document.getElementById(`aux_on_${auxIdx}`) || document.getElementById(`aux_on_ch_${ch}`);
    if (btn) btn.classList.toggle('on-active', newVal);
    socket.emit('control', { type, channel: ch, value: newVal ? 1 : 0 });
}

function updateAuxFromSocket(ch, type, value) {
    const state = getChannelStateById(ch);
    if (!state) return;
    const match = type.match(/kInputAUX\/kAUX(\d+)(Level|On|Pre)/);
    if (!match) return;

    const auxIdx = parseInt(match[1]);
    const subType = match[2];

    if (subType === 'Level') {
        state[`aux${auxIdx}`] = value;
        const targetFaderMix = document.getElementById(`aux_f_ch_${ch}`);
        if (activeConfigChannel >= 36 && activeConfigChannel <= 43 && (activeConfigChannel - 35) === auxIdx && targetFaderMix) {
            targetFaderMix.value = value;
            const targetValMix = document.getElementById(`aux_v_ch_${ch}`);
            if (targetValMix) targetValMix.innerText = rawToDb(value);
        } else if (activeConfigChannel === ch) {
            const targetFaderCh = document.getElementById(`aux_f_${auxIdx}`);
            if (targetFaderCh) {
                targetFaderCh.value = value;
                const targetValCh = document.getElementById(`aux_v_${auxIdx}`);
                if (targetValCh) targetValCh.innerText = rawToDb(value);
            }
        }
    } else if (subType === 'On') {
        const isTrue = (value === 1 || value === true);
        state[`aux${auxIdx}On`] = isTrue;
        const targetOnMix = document.getElementById(`aux_on_ch_${ch}`);
        if (activeConfigChannel >= 36 && activeConfigChannel <= 43 && (activeConfigChannel - 35) === auxIdx && targetOnMix) {
            targetOnMix.classList.toggle('on-active', isTrue);
        } else if (activeConfigChannel === ch) {
            const targetOnCh = document.getElementById(`aux_on_${auxIdx}`);
            if (targetOnCh) targetOnCh.classList.toggle('on-active', isTrue);
        }
    } else if (subType === 'Pre') {
        const isTrue = (value === 1 || value === true);
        state[`aux${auxIdx}Pre`] = isTrue;
        const btnPre = document.getElementById(`aux_pre_${ch}_${auxIdx}`);
        if (btnPre) {
            btnPre.classList.toggle('active', isTrue);
            btnPre.textContent = isTrue ? 'PRE' : 'POST';
            btnPre.title = isTrue ? 'PRE (Pre-Fader)' : 'POST (Post-Fader)';
        }
    }
}

function getAuxPre(ch, auxIdx) {
    const state = getChannelStateById(ch);
    if (!state) return true;
    return state[`aux${auxIdx}Pre`] !== undefined ? state[`aux${auxIdx}Pre`] : true;
}

function setAuxPre(ch, auxIdx, val) {
    const state = getChannelStateById(ch);
    if (!state) return;
    state[`aux${auxIdx}Pre`] = !!val;
    socket.emit('control', { type: `kInputAUX/kAUX${auxIdx}Pre`, channel: ch, value: val ? 1 : 0 });
}

function toggleAuxPre(ch, auxIdx) {
    const current = getAuxPre(ch, auxIdx);
    setAuxPre(ch, auxIdx, !current);
    return !current;
}

function getMixBusMode(mixIdx) {
    if (typeof mixesState === 'undefined' || !mixesState[mixIdx]) return 1;
    return mixesState[mixIdx].auxTypeMode !== undefined ? mixesState[mixIdx].auxTypeMode : 1;
}

function setMixBusMode(mixIdx, val) {
    if (typeof mixesState !== 'undefined' && mixesState[mixIdx]) {
        mixesState[mixIdx].auxTypeMode = val;
    }
    socket.emit('control', { type: 'kAUXType/kAUXTypeIndex', channel: mixIdx, value: val });
}

function getMixBusGlobal(mixIdx) {
    if (typeof mixesState === 'undefined' || !mixesState[mixIdx]) return 1;
    return mixesState[mixIdx].auxGlobal !== undefined ? mixesState[mixIdx].auxGlobal : 1;
}

function setMixBusGlobal(mixIdx, val) {
    if (typeof mixesState !== 'undefined' && mixesState[mixIdx]) {
        mixesState[mixIdx].auxGlobal = val;
    }
    socket.emit('control', { type: 'kAuxSendGlobal/kGlobal', channel: mixIdx, value: val });
}

function getMixBusPrePoint(mixIdx) {
    if (typeof mixesState === 'undefined' || !mixesState[mixIdx]) return 0;
    return mixesState[mixIdx].auxSendPrePoint !== undefined ? mixesState[mixIdx].auxSendPrePoint : 0;
}

function setMixBusPrePoint(mixIdx, val) {
    if (typeof mixesState !== 'undefined' && mixesState[mixIdx]) {
        mixesState[mixIdx].auxSendPrePoint = val;
    }
    socket.emit('control', { type: 'kAuxSendPrePoint/kPrePoint', channel: mixIdx, value: val });
}

window.getAuxPre = getAuxPre;
window.setAuxPre = setAuxPre;
window.toggleAuxPre = toggleAuxPre;
window.getMixBusMode = getMixBusMode;
window.setMixBusMode = setMixBusMode;
window.getMixBusGlobal = getMixBusGlobal;
window.setMixBusGlobal = setMixBusGlobal;
window.getMixBusPrePoint = getMixBusPrePoint;
window.setMixBusPrePoint = setMixBusPrePoint;
window.handleAuxPreToggle = handleAuxPreToggle;
window.handleMixBusMode = handleMixBusMode;
window.handleMixBusGlobal = handleMixBusGlobal;
window.handleMixBusPrePoint = handleMixBusPrePoint;

window._auxConfigMixIdx = 0;

window.openAuxConfigModal = function(mixIdx) {
    window._auxConfigMixIdx = mixIdx;
    const modal = document.getElementById('auxConfigModal');
    if (!modal) return;
    const title = document.getElementById('auxConfigTitle');
    if (title) title.textContent = `CONFIGURAÇÃO - MIX ${mixIdx + 1}`;
    updateAuxConfigModalUI(mixIdx);
    modal.style.display = 'flex';
};

window.closeAuxConfigModal = function() {
    const modal = document.getElementById('auxConfigModal');
    if (modal) modal.style.display = 'none';
};

window.updateAuxConfigModalUI = function(mixIdx) {
    const mode = getMixBusMode(mixIdx);
    const globalVal = getMixBusGlobal(mixIdx);
    const prePoint = getMixBusPrePoint(mixIdx);

    const modeGroup = document.getElementById('auxConfigModeGroup');
    if (modeGroup) {
        modeGroup.querySelectorAll('.meter-config-pos-btn').forEach(function(btn) {
            const bm = btn.dataset.mode;
            if (bm === 'variable') btn.classList.toggle('active', mode === 0);
            else if (bm === 'fixed') btn.classList.toggle('active', mode === 1);
        });
    }

    const globalGroup = document.getElementById('auxConfigGlobalGroup');
    if (globalGroup) {
        globalGroup.querySelectorAll('.meter-config-pos-btn').forEach(function(btn) {
            const bm = btn.dataset.mode;
            if (bm === 'pre') btn.classList.toggle('active', globalVal === 1);
            else if (bm === 'post') btn.classList.toggle('active', globalVal === 0);
        });
    }

    const prePointGroup = document.getElementById('auxConfigPrePointGroup');
    if (prePointGroup) {
        prePointGroup.querySelectorAll('.meter-config-pos-btn').forEach(function(btn) {
            const bm = btn.dataset.mode;
            if (bm === 'pre_on') btn.classList.toggle('active', prePoint === 1);
            else if (bm === 'post_on') btn.classList.toggle('active', prePoint === 0);
        });
    }
};

window.updateAuxPositionBadgeUI = function(mixIdx) {
    var globalBadge = document.getElementById('aux-global-badge-' + mixIdx);
    var prepointBadge = document.getElementById('aux-prepoint-badge-' + mixIdx);
    if (globalBadge) globalBadge.textContent = getMixBusGlobalLabel(mixIdx);
    if (prepointBadge) prepointBadge.textContent = getMixBusPrePointLabel(mixIdx);
};

window.handleAllNominal = async function(mixIdx) {
    const mixName = `MIX ${mixIdx + 1}`;
    
    const confirmed = await ConfirmModal.show({
        title: 'RESETAR TODOS OS CANAIS PARA PRE',
        message: `Deseja realmente resetar <b>todos os 32 canais</b> de <b>${mixName}</b> para a posição <b>PRE</b>?<br><br><small style="color:#aaa;">Esta operação irá configurar:<br>• GLOBAL INSERT → PRE<br>• PRE-POINT → PRE ON<br>• Todos os envios individuais → PRE</small>`,
        type: 'warning',
        confirmText: 'RESETAR',
        cancelText: 'CANCELAR'
    });
    
    if (!confirmed) return;
    
    var auxIdx = mixIdx + 1;
    setMixBusGlobal(mixIdx, 1);
    setMixBusPrePoint(mixIdx, 1);
    for (var i = 0; i < 32; i++) {
        setAuxPre(i, auxIdx, true);
    }
    updateAuxConfigModalUI(mixIdx);
    updateAuxPositionBadgeUI(mixIdx);
    if (activeConfigChannel === (36 + mixIdx)) {
        renderAuxs(36 + mixIdx);
    }
};

window.getMixBusGlobalLabel = getMixBusGlobalLabel;
window.getMixBusPrePointLabel = getMixBusPrePointLabel;
