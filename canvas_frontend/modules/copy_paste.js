// Lógica extraída de eq.js para Copiar e Colar EQ

window.clipboardMode = null; // 'eq' ou 'full'
window.eqClipboard = null; // Buffer para Copiar/Colar EQ
window.fullChannelClipboard = null; // Buffer para Copiar/Colar Canal Inteiro
window.pendingCopyChannel = null;

window.copyEQ = function(ch) {
    window.pendingCopyChannel = ch;
    const modal = document.getElementById('copyOptionsModal');
    if (modal) modal.style.display = 'flex';
};

window.executeCopyEQOnly = function() {
    const ch = window.pendingCopyChannel;
    if (ch === null) return;
    
    const modal = document.getElementById('copyOptionsModal');
    if (modal) modal.style.display = 'none';

    const state = getChannelStateById(ch);
    const s = state ? state.eq : null;
    if (!s) return console.warn(`Sem dados de EQ para o canal ${ch + 1}`);
    
    window.eqClipboard = JSON.parse(JSON.stringify(s));
    window.clipboardMode = 'eq';

    // Habilita o botão de Colar no header
    const b = document.getElementById('headerBtnPaste');
    if (b) {
        b.disabled = false;
        b.style.background = '#fff';
        b.style.color = '#000';
        b.style.opacity = '1';
    }
};

window.showCustomAlert = function(msg) {
    const modal = document.getElementById('customConfirmModal');
    const msgEl = document.getElementById('customConfirmMsg');
    const okBtn = document.getElementById('customConfirmOk');
    const cancelBtn = document.getElementById('customConfirmCancel');

    msgEl.innerText = msg;
    cancelBtn.style.display = 'none';
    okBtn.innerText = 'OK';
    modal.style.display = 'flex';

    okBtn.onclick = () => {
        modal.style.display = 'none';
        cancelBtn.style.display = '';
        okBtn.innerText = 'SIM';
    };
};

window.executeCopyFullChannel = function() {
    const ch = window.pendingCopyChannel;
    if (ch === null) return;

    const modal = document.getElementById('copyOptionsModal');
    if (modal) modal.style.display = 'none';

    const state = getChannelStateById(ch);
    if (!state) return;
    
    window.clipboardMode = 'full';
    window.fullChannelClipboard = JSON.parse(JSON.stringify(state));
    
    // Header flash
    const pasteBtn = document.getElementById('headerBtnPaste');
    if (pasteBtn) {
        pasteBtn.style.background = '#4caf50';
        pasteBtn.style.color = '#fff';
        pasteBtn.innerText = 'FULL CH COPIED!';
        setTimeout(() => {
            pasteBtn.style.background = '#333';
            pasteBtn.innerText = 'PASTE';
        }, 1500);
    }
    
    // Check if Insert Out is defined
    let hasInsertOut = false;
    if (window.globalOutPatches) {
        const targetSrcNormal = ch + 31;
        const targetSrcFx = ch + 13;
        
        for (let p = 0; p < 4; p++) {
            if (window.globalOutPatches.omni && window.globalOutPatches.omni[p] === targetSrcNormal) { hasInsertOut = true; break; }
        }
        if (!hasInsertOut) {
            for (let p = 0; p < 8; p++) {
                if (window.globalOutPatches.adat && window.globalOutPatches.adat[p] === targetSrcNormal) { hasInsertOut = true; break; }
            }
        }
        if (!hasInsertOut) {
            for (let p = 0; p < 16; p++) {
                if (window.globalOutPatches.slot && window.globalOutPatches.slot[p] === targetSrcNormal) { hasInsertOut = true; break; }
            }
        }
        if (!hasInsertOut) {
            for (let p = 0; p < 2; p++) {
                if (window.globalOutPatches['2tr'] && window.globalOutPatches['2tr'][p] === targetSrcNormal) { hasInsertOut = true; break; }
            }
        }
        if (!hasInsertOut) {
            for (let p = 0; p < 8; p++) {
                if (window.globalOutPatches.fx && window.globalOutPatches.fx[p] === targetSrcFx) { hasInsertOut = true; break; }
            }
        }
    }

    if (hasInsertOut) {
        showCustomAlert("Canal copiado!\n\nNota: O 'Insert Out' não foi copiado pois ele depende de um Output Patch físico e único na mesa.");
    }
};

window.showCustomConfirm = function(msg, onOk) {
    const modal = document.getElementById('customConfirmModal');
    const msgEl = document.getElementById('customConfirmMsg');
    const okBtn = document.getElementById('customConfirmOk');
    const cancelBtn = document.getElementById('customConfirmCancel');

    msgEl.innerText = msg;
    modal.style.display = 'flex';

    okBtn.onclick = () => {
        modal.style.display = 'none';
        onOk();
    };
    cancelBtn.onclick = () => {
        modal.style.display = 'none';
    };
};

window.pasteClipboard = function(ch) {
    if (!window.clipboardMode) return;

    let msg = `Deseja colar as definições para o Canal ${ch + 1}?`;
    if (window.clipboardMode === 'eq') msg = `Deseja colar apenas o EQ para o Canal ${ch + 1}?`;
    if (window.clipboardMode === 'full') msg = `Deseja colar TODOS OS PARÂMETROS para o Canal ${ch + 1}?`;

    showCustomConfirm(msg, () => {
        if (window.clipboardMode === 'eq') {
            pasteEQLogic(ch);
        } else if (window.clipboardMode === 'full') {
            pasteFullChannelLogic(ch);
        }
    });
};

function pasteEQLogic(ch) {
    const prefix = getChannelParamPrefix(ch);
    const bMap = [
        { key: 'low', label: 'Low' },
        { key: 'lowmid', label: 'LowMid' },
        { key: 'himid', label: 'HiMid' },
        { key: 'high', label: 'Hi' }
    ];

    bMap.forEach(b => {
        const data = window.eqClipboard[b.key];
        if (!data) return;

        if (data.f !== undefined) socket.emit('control', { type: `${prefix}EQ/kEQ${b.label}F`, channel: ch, value: sysexToVal(data.f) });
        if (data.g !== undefined) socket.emit('control', { type: `${prefix}EQ/kEQ${b.label}G`, channel: ch, value: sysexToVal(data.g) });
        if (data.q !== undefined) socket.emit('control', { type: `${prefix}EQ/kEQ${b.label}Q`, channel: ch, value: sysexToVal(data.q) });

        if (b.key === 'low' && data.hpfOn !== undefined) {
            setTimeout(() => {
                socket.emit('control', { type: `${prefix}EQ/kEQHPFOn`, channel: ch, value: sysexToVal(data.hpfOn) });
            }, 90);
        }
        if (b.key === 'high' && data.lpfOn !== undefined) {
            setTimeout(() => {
                socket.emit('control', { type: `${prefix}EQ/kEQLPFOn`, channel: ch, value: sysexToVal(data.lpfOn) });
            }, 90);
        }
    });

    if (window.eqClipboard.mode !== undefined) {
        socket.emit('control', { type: `${prefix}EQ/kEQMode`, channel: ch, value: sysexToVal(window.eqClipboard.mode) });
    }

    if (window.eqClipboard.on !== undefined) {
        socket.emit('control', { type: `${prefix}EQ/kEQOn`, channel: ch, value: (window.eqClipboard.on === 1 || window.eqClipboard.on === true) ? 1 : 0 });
    }
}

function pasteFullChannelLogic(ch) {
    const data = window.fullChannelClipboard;
    if (!data) return;
    
    const prefix = getChannelParamPrefix(ch);

    // Fader
    if (data.value !== undefined) socket.emit('control', { type: `${prefix}Fader/kFader`, channel: ch, value: sysexToVal(data.value) });
    // Pan
    if (data.pan !== undefined) socket.emit('control', { type: 'kPan', channel: ch, value: sysexToVal(data.pan) });
    // Att
    if (data.att !== undefined) socket.emit('control', { type: 'kInputAttenuator/kAtt', channel: ch, value: sysexToVal(data.att) });
    // Phase
    if (data.phase !== undefined) socket.emit('control', { type: 'kInputPhase/kPhase', channel: ch, value: (data.phase === 1 || data.phase === true) ? 1 : 0 });
    
    // Patch
    if (data.patch !== undefined) socket.emit('control', { type: 'kChannelInput/kChannelIn', channel: ch, value: sysexToVal(data.patch) });

    // Stereo
    if (data.stereo !== undefined) socket.emit('control', { type: `${prefix}Bus/kStereo`, channel: ch, value: (data.stereo === 1 || data.stereo === true) ? 1 : 0 });
    
    // Buses
    if (data.buses && Array.isArray(data.buses)) {
        data.buses.forEach((busVal, idx) => {
            const bOn = (busVal === 1 || busVal === true) ? 1 : 0;
            socket.emit('control', { type: `${prefix}Bus/kBus${idx + 1}`, channel: ch, value: bOn });
        });
    }

    // Auxiliares (1 a 8)
    for (let i = 1; i <= 8; i++) {
        if (data[`aux${i}`] !== undefined) {
            socket.emit('control', { type: `${prefix}AUX/kAUX${i}Level`, channel: ch, value: sysexToVal(data[`aux${i}`]) });
        }
        if (data[`aux${i}On`] !== undefined) {
            const auxOn = (data[`aux${i}On`] === 1 || data[`aux${i}On`] === true) ? 1 : 0;
            socket.emit('control', { type: `${prefix}AUX/kAUX${i}On`, channel: ch, value: auxOn });
        }
    }

    // Insert
    if (data.insert) {
        if (data.insert.on !== undefined) socket.emit('control', { type: 'kInputInsert/kInsertOn', channel: ch, value: (data.insert.on === 1 || data.insert.on === true) ? 1 : 0 });
        if (data.insert.position !== undefined) socket.emit('control', { type: 'kInputInsert/kInsertLocInsert', channel: ch, value: sysexToVal(data.insert.position) });
        if (data.insert.patch_in !== undefined) socket.emit('control', { type: 'kChannelInsertIn/kInsertIn', channel: ch, value: sysexToVal(data.insert.patch_in) });
    }

    // Gate
    if (data.gate) {
        if (data.gate.on !== undefined) socket.emit('control', { type: 'kInputGate/kGateOn', channel: ch, value: (data.gate.on === 1 || data.gate.on === true) ? 1 : 0 });
        if (data.gate.thresh !== undefined) socket.emit('control', { type: 'kInputGate/kGateThreshold', channel: ch, value: sysexToVal(data.gate.thresh) });
        if (data.gate.range !== undefined) socket.emit('control', { type: 'kInputGate/kGateRange', channel: ch, value: sysexToVal(data.gate.range) });
        if (data.gate.attack !== undefined) socket.emit('control', { type: 'kInputGate/kGateAttack', channel: ch, value: sysexToVal(data.gate.attack) });
        if (data.gate.hold !== undefined) socket.emit('control', { type: 'kInputGate/kGateHold', channel: ch, value: sysexToVal(data.gate.hold) });
        if (data.gate.decay !== undefined) socket.emit('control', { type: 'kInputGate/kGateDecay', channel: ch, value: sysexToVal(data.gate.decay) });
    }

    // Compressor
    if (data.comp) {
        if (data.comp.on !== undefined) socket.emit('control', { type: `${prefix}Comp/kCompOn`, channel: ch, value: (data.comp.on === 1 || data.comp.on === true) ? 1 : 0 });
        if (data.comp.thresh !== undefined) socket.emit('control', { type: `${prefix}Comp/kCompThreshold`, channel: ch, value: sysexToVal(data.comp.thresh) });
        if (data.comp.ratio !== undefined) socket.emit('control', { type: `${prefix}Comp/kCompRatio`, channel: ch, value: sysexToVal(data.comp.ratio) });
        if (data.comp.attack !== undefined) socket.emit('control', { type: `${prefix}Comp/kCompAttack`, channel: ch, value: sysexToVal(data.comp.attack) });
        if (data.comp.release !== undefined) socket.emit('control', { type: `${prefix}Comp/kCompRelease`, channel: ch, value: sysexToVal(data.comp.release) });
        if (data.comp.gain !== undefined) socket.emit('control', { type: `${prefix}Comp/kCompGain`, channel: ch, value: sysexToVal(data.comp.gain) });
        if (data.comp.knee !== undefined) socket.emit('control', { type: `${prefix}Comp/kCompKnee`, channel: ch, value: sysexToVal(data.comp.knee) });
    }

    // EQ
    if (data.eq) {
        window.eqClipboard = data.eq; // Compartilha a variável para reuso
        pasteEQLogic(ch);
    }
}
