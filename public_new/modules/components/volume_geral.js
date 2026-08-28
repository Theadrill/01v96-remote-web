function toggleVolumeGeral() {
    window.showVolumeGeral = !window.showVolumeGeral;
    const btn = document.getElementById('volumeGeralBtn');
    if (btn) {
        btn.classList.toggle('active', window.showVolumeGeral);
    }
    if (typeof initUI === 'function') initUI();
}
window.toggleVolumeGeral = toggleVolumeGeral;

const volumeGeral = createMacroFaderInstance({
    title: 'GERAL',
    titleLong: 'VOLUME GERAL',
    getChannelIds: () => {
        const isChanLocked = (i) => window.lockedChannels && window.lockedChannels.includes("CH" + (i + 1));
        if (musicianMode) {
            return Array.from({length: 32}, (_, i) => i).filter(i => !macroLockedChannels.includes(i) && !isChanLocked(i));
        }
        return Array.from({length: 32}, (_, i) => i).filter(i => !isChanLocked(i));
    },
    showConfig: true,
    cardId: 'cardVolumeGeral',
    dbDisplayId: 'volume-geral-db-display',
    nudgeStartFn: 'startVolumeGeralNudge',
    nudgeStopFn: 'stopVolumeGeralNudge',
});

window.getVolumeGeralHtml = () => volumeGeral.getHtml();
window.startVolumeGeralNudge = (dir) => volumeGeral.startNudge(dir);
window.stopVolumeGeralNudge = () => volumeGeral.stopNudge();

// --- AUX Volume Geral (canal individual → AUX 1-8) ---
let auxVG_nudgeInterval = null;
let auxVG_nudgeTimeout = null;
let auxVG_nudgeMaxDurationTimer = null;
let auxVG_deltaSteps = 0;
let auxVG_dbResetTimer = null;

function auxVG_deltaToDB(steps) {
    const db = steps * 0.05;
    const sign = db >= 0 ? '+' : '';
    return `${sign}${db.toFixed(2)} dB`;
}

function auxVG_updateDbDisplay() {
    const el = document.getElementById('aux-volume-geral-db-display');
    if (!el) return;
    if (auxVG_deltaSteps === 0) {
        el.textContent = '--';
        el.classList.remove('macro-db-active');
    } else {
        el.textContent = auxVG_deltaToDB(auxVG_deltaSteps);
        el.classList.add('macro-db-active');
    }
}

function auxVG_resetDbDisplay() {
    if (auxVG_dbResetTimer) clearTimeout(auxVG_dbResetTimer);
    auxVG_dbResetTimer = setTimeout(() => {
        auxVG_deltaSteps = 0;
        auxVG_updateDbDisplay();
        auxVG_dbResetTimer = null;
    }, 5000);
}

function getActiveConfigChannel() {
    if (typeof activeConfigChannel !== 'undefined' && activeConfigChannel !== null) return activeConfigChannel;
    if (typeof window.activeConfigChannel !== 'undefined' && window.activeConfigChannel !== null) return window.activeConfigChannel;
    if (typeof ChannelSetupCore !== 'undefined' && typeof ChannelSetupCore.getActiveChannel === 'function') {
        return ChannelSetupCore.getActiveChannel();
    }
    return null;
}

function nudgeAuxVolumeGeral(dir, stepDb = 0.05) {
    const ch = getActiveConfigChannel();
    if (ch === null || ch > 31) return;
    const s = typeof channelStates !== 'undefined' ? channelStates[ch] : null;
    if (!s) return;

    let anyChanged = false;

    for (let auxIdx = 1; auxIdx <= 8; auxIdx++) {
        const currentVal = s[`aux${auxIdx}`] || 0;
        if (currentVal <= 0) continue;
        let nRaw = typeof getSteppedRaw === 'function'
            ? getSteppedRaw(currentVal, dir, stepDb, false)
            : Math.max(0, Math.min(1023, currentVal + (dir > 0 ? 1 : -1)));

        if (nRaw < 0) nRaw = 0;
        if (nRaw > 1023) nRaw = 1023;
        if (nRaw === currentVal) continue;

        anyChanged = true;
        s[`aux${auxIdx}`] = nRaw;
        if (typeof updateAuxManual === 'function') {
            updateAuxManual(ch, auxIdx, nRaw);
        } else if (typeof updateAuxFromSocket === 'function') {
            updateAuxFromSocket(ch, `kInputAUX/kAUX${auxIdx}Level`, nRaw);
        }
        if (typeof appReady !== 'undefined' && appReady && typeof socket !== 'undefined') {
            socket.emit('control', { type: `kInputAUX/kAUX${auxIdx}Level`, channel: ch, value: nRaw });
        }
    }

    if (!anyChanged) return;
    auxVG_deltaSteps += dir;
    auxVG_updateDbDisplay();
    auxVG_resetDbDisplay();
}

function startAuxVolumeGeralNudge(dir) {
    stopAuxVolumeGeralNudge();
    nudgeAuxVolumeGeral(dir, 0.05);

    const repeatMs = (typeof musicianMode !== 'undefined' && musicianMode) ? 140 : 80;
    const holdMs = (typeof musicianMode !== 'undefined' && musicianMode) ? 200 : 260;
    auxVG_nudgeTimeout = setTimeout(() => {
        auxVG_nudgeInterval = setInterval(() => {
            nudgeAuxVolumeGeral(dir, 0.10);
        }, repeatMs);
    }, holdMs);

    auxVG_nudgeMaxDurationTimer = setTimeout(() => {
        stopAuxVolumeGeralNudge();
    }, 10000);
}

function stopAuxVolumeGeralNudge() {
    if (auxVG_nudgeTimeout) clearTimeout(auxVG_nudgeTimeout);
    if (auxVG_nudgeInterval) clearInterval(auxVG_nudgeInterval);
    if (auxVG_nudgeMaxDurationTimer) clearTimeout(auxVG_nudgeMaxDurationTimer);
    auxVG_nudgeTimeout = null;
    auxVG_nudgeInterval = null;
    auxVG_nudgeMaxDurationTimer = null;
}

function zeroAuxVolGeral() {
    const ch = getActiveConfigChannel();
    if (ch === null || ch > 31) return;
    const s = typeof channelStates !== 'undefined' ? channelStates[ch] : null;
    if (!s) return;

    for (let auxIdx = 1; auxIdx <= 8; auxIdx++) {
        const currentVal = s[`aux${auxIdx}`] || 0;
        if (currentVal <= 0) continue;
        s[`aux${auxIdx}`] = 0;
        if (typeof updateAuxManual === 'function') {
            updateAuxManual(ch, auxIdx, 0);
        } else if (typeof updateAuxFromSocket === 'function') {
            updateAuxFromSocket(ch, `kInputAUX/kAUX${auxIdx}Level`, 0);
        }
        if (typeof appReady !== 'undefined' && appReady && typeof socket !== 'undefined') {
            socket.emit('control', { type: `kInputAUX/kAUX${auxIdx}Level`, channel: ch, value: 0 });
        }
    }

    auxVG_deltaSteps = 0;
    auxVG_updateDbDisplay();
}

function getAuxVolumeGeralHtml() {
    const isDesktop = layoutMode === 'desktop';

    if (isDesktop) {
        return `
            <div class="fader-card-desktop macro-fader-card" id="cardAuxVolumeGeral" onwheel="if (typeof startAuxVolumeGeralNudge === 'function') { startAuxVolumeGeralNudge(event.deltaY < 0 ? 1 : -1); stopAuxVolumeGeralNudge(); event.preventDefault(); }">
                <div class="desk-label">AUX</div>
                <div class="btn-cue-placeholder"></div>
                <div class="desk-ch-name-zone macro-ch-name-zone">
                    <div class="desk-ch-name">AUX GERAL</div>
                </div>
                <div id="aux-volume-geral-db-display" class="macro-db-display">--</div>
                <div class="macro-fader-nudge-wrap">
                    <div class="macro-nudge-btn-container" onpointerdown="startAuxVolumeGeralNudge(1)" onpointerup="stopAuxVolumeGeralNudge()" onpointerleave="stopAuxVolumeGeralNudge()" onpointercancel="stopAuxVolumeGeralNudge()">
                        <button class="btn-nudge-macro-big">+</button>
                    </div>
                    <div class="macro-nudge-btn-container" onpointerdown="startAuxVolumeGeralNudge(-1)" onpointerup="stopAuxVolumeGeralNudge()" onpointerleave="stopAuxVolumeGeralNudge()" onpointercancel="stopAuxVolumeGeralNudge()">
                        <button class="btn-nudge-macro-big">-</button>
                    </div>
                </div>
                <div class="macro-fader-config-wrap">
                    <button class="macro-fader-zerar-btn" onclick="zeroAuxVolGeral()">ZERAR</button>
                </div>
                <div class="desk-footer-label">AUX</div>
            </div>
        `;
    } else {
        return `
            <div class="fader-card macro-fader-card" id="cardAuxVolumeGeral" onwheel="if (typeof startAuxVolumeGeralNudge === 'function') { startAuxVolumeGeralNudge(event.deltaY < 0 ? 1 : -1); stopAuxVolumeGeralNudge(); event.preventDefault(); }">
                <h2 class="card-title">AUX</h2>
                <div class="ch-clickable-zone macro-ch-clickable-zone">
                    <div class="ch-name">AUX GERAL</div>
                </div>
                <div id="aux-volume-geral-db-display" class="macro-db-display">--</div>
                <div class="macro-fader-nudge-wrap">
                    <div class="macro-nudge-btn-container" onpointerdown="startAuxVolumeGeralNudge(1)" onpointerup="stopAuxVolumeGeralNudge()" onpointerleave="stopAuxVolumeGeralNudge()" onpointercancel="stopAuxVolumeGeralNudge()">
                        <button class="btn-nudge-macro-big">+</button>
                    </div>
                    <div class="macro-nudge-btn-container" onpointerdown="startAuxVolumeGeralNudge(-1)" onpointerup="stopAuxVolumeGeralNudge()" onpointerleave="stopAuxVolumeGeralNudge()" onpointercancel="stopAuxVolumeGeralNudge()">
                        <button class="btn-nudge-macro-big">-</button>
                    </div>
                </div>
                <button class="macro-fader-zerar-btn-mobile" onclick="zeroAuxVolGeral()">ZERAR</button>
            </div>
        `;
    }
}

window.getAuxVolumeGeralHtml = getAuxVolumeGeralHtml;
window.zeroAuxVolGeral = zeroAuxVolGeral;

// --- MIX Volume Geral (MIX 1-8 config → all 32 channels' sends to that MIX) ---
let mixVG_nudgeInterval = null;
let mixVG_nudgeTimeout = null;
let mixVG_nudgeMaxDurationTimer = null;
let mixVG_deltaSteps = 0;
let mixVG_dbResetTimer = null;

function mixVG_deltaToDB(steps) {
    const db = steps * 0.05;
    const sign = db >= 0 ? '+' : '';
    return `${sign}${db.toFixed(2)} dB`;
}

function mixVG_updateDbDisplay() {
    const el = document.getElementById('mix-volume-geral-db-display');
    if (!el) return;
    if (mixVG_deltaSteps === 0) {
        el.textContent = '--';
        el.classList.remove('macro-db-active');
    } else {
        el.textContent = mixVG_deltaToDB(mixVG_deltaSteps);
        el.classList.add('macro-db-active');
    }
}

function mixVG_resetDbDisplay() {
    if (mixVG_dbResetTimer) clearTimeout(mixVG_dbResetTimer);
    mixVG_dbResetTimer = setTimeout(() => {
        mixVG_deltaSteps = 0;
        mixVG_updateDbDisplay();
        mixVG_dbResetTimer = null;
    }, 5000);
}

function nudgeMixVolumeGeral(dir, stepDb = 0.05) {
    const ch = getActiveConfigChannel();
    if (ch === null || ch < 36 || ch > 43) return;
    const mixIdx = ch - 35; // MIX 1 (36) → auxIdx 1
    let anyChanged = false;

    for (let i = 0; i < 32; i++) {
        const s = typeof channelStates !== 'undefined' ? channelStates[i] : null;
        if (!s) continue;
        const currentVal = s[`aux${mixIdx}`] || 0;
        if (currentVal <= 0) continue;
        let nRaw = typeof getSteppedRaw === 'function'
            ? getSteppedRaw(currentVal, dir, stepDb, false)
            : Math.max(0, Math.min(1023, currentVal + (dir > 0 ? 1 : -1)));
        if (nRaw < 0) nRaw = 0;
        if (nRaw > 1023) nRaw = 1023;
        if (nRaw === currentVal) continue;

        anyChanged = true;
        s[`aux${mixIdx}`] = nRaw;
        if (typeof updateAuxManual === 'function') {
            updateAuxManual(i, mixIdx, nRaw);
        } else if (typeof updateAuxFromSocket === 'function') {
            updateAuxFromSocket(i, `kInputAUX/kAUX${mixIdx}Level`, nRaw);
        }
        if (typeof appReady !== 'undefined' && appReady && typeof socket !== 'undefined') {
            socket.emit('control', { type: `kInputAUX/kAUX${mixIdx}Level`, channel: i, value: nRaw });
        }
    }

    if (!anyChanged) return;
    mixVG_deltaSteps += dir;
    mixVG_updateDbDisplay();
    mixVG_resetDbDisplay();
}

function startMixVolumeGeralNudge(dir) {
    stopMixVolumeGeralNudge();
    nudgeMixVolumeGeral(dir, 0.05);

    const repeatMs = (typeof musicianMode !== 'undefined' && musicianMode) ? 140 : 80;
    const holdMs = (typeof musicianMode !== 'undefined' && musicianMode) ? 200 : 260;
    mixVG_nudgeTimeout = setTimeout(() => {
        mixVG_nudgeInterval = setInterval(() => {
            nudgeMixVolumeGeral(dir, 0.10);
        }, repeatMs);
    }, holdMs);

    mixVG_nudgeMaxDurationTimer = setTimeout(() => {
        stopMixVolumeGeralNudge();
    }, 10000);
}

function stopMixVolumeGeralNudge() {
    if (mixVG_nudgeTimeout) clearTimeout(mixVG_nudgeTimeout);
    if (mixVG_nudgeInterval) clearInterval(mixVG_nudgeInterval);
    if (mixVG_nudgeMaxDurationTimer) clearTimeout(mixVG_nudgeMaxDurationTimer);
    mixVG_nudgeTimeout = null;
    mixVG_nudgeInterval = null;
    mixVG_nudgeMaxDurationTimer = null;
}

function zeroMixVolGeral() {
    const ch = getActiveConfigChannel();
    if (ch === null || ch < 36 || ch > 43) return;
    const mixIdx = ch - 35;

    for (let i = 0; i < 32; i++) {
        const s = typeof channelStates !== 'undefined' ? channelStates[i] : null;
        if (!s) continue;
        const currentVal = s[`aux${mixIdx}`] || 0;
        if (currentVal <= 0) continue;
        s[`aux${mixIdx}`] = 0;
        if (typeof updateAuxManual === 'function') {
            updateAuxManual(i, mixIdx, 0);
        } else if (typeof updateAuxFromSocket === 'function') {
            updateAuxFromSocket(i, `kInputAUX/kAUX${mixIdx}Level`, 0);
        }
        if (typeof appReady !== 'undefined' && appReady && typeof socket !== 'undefined') {
            socket.emit('control', { type: `kInputAUX/kAUX${mixIdx}Level`, channel: i, value: 0 });
        }
    }

    mixVG_deltaSteps = 0;
    mixVG_updateDbDisplay();
}

async function showMixZeroConfirm() {
    const ch = getActiveConfigChannel();
    if (ch === null || ch < 36 || ch > 43) return;
    const mixNum = ch - 35;
    let mixName = `MIX ${mixNum}`;
    if (window.resolvedNames && window.resolvedNames[ch]) {
        mixName = window.resolvedNames[ch].name;
    }

    if (typeof ConfirmModal !== 'undefined' && typeof ConfirmModal.show === 'function') {
        const confirmed = await ConfirmModal.show({
            title: 'CONFIRMAR ZERAR',
            message: `Deseja zerar o envio de <b>TODOS</b> os 32 canais para <strong style="color:#ff5252;">${mixName}</strong>?`,
            type: 'danger',
            confirmText: 'ZERAR',
            cancelText: 'CANCELAR'
        });
        if (confirmed) {
            zeroMixVolGeral();
        }
        return;
    }

    let overlay = document.getElementById('mixZeroConfirmOverlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'mixZeroConfirmOverlay';
        document.body.appendChild(overlay);
    }
    overlay.innerHTML = `
        <div style="position:fixed; inset:0; background:rgba(0,0,0,0.8); z-index:10000; display:flex; align-items:center; justify-content:center;" onclick="closeMixZeroConfirm()">
            <div style="background:#1a1a2e; border:2px solid #c62828; border-radius:12px; padding:30px; max-width:400px; width:90%; text-align:center; color:white; box-shadow:0 0 30px rgba(198,40,40,0.4);" onclick="event.stopPropagation()">
                <div style="font-size:16px; font-weight:bold; margin-bottom:15px; color:#ff5252;"><i class="fas fa-exclamation-triangle"></i> CONFIRMAR ZERAR</div>
                <div style="font-size:14px; margin-bottom:25px; color:#ccc;">
                    Deseja zerar o envio de <strong>TODOS</strong> os 32 canais para<br>
                    <strong style="color:#ff5252;">${mixName}</strong>?
                </div>
                <div style="display:flex; gap:15px; justify-content:center;">
                    <button onclick="closeMixZeroConfirm()" style="flex:1; padding:12px; background:#555; color:white; border:none; border-radius:8px; font-size:13px; cursor:pointer; font-weight:bold;">CANCELAR</button>
                    <button onclick="closeMixZeroConfirm(); zeroMixVolGeral();" style="flex:1; padding:12px; background:#c62828; color:white; border:none; border-radius:8px; font-size:13px; cursor:pointer; font-weight:bold;">ZERAR</button>
                </div>
            </div>
        </div>
    `;
    overlay.style.display = 'block';
}

function closeMixZeroConfirm() {
    const overlay = document.getElementById('mixZeroConfirmOverlay');
    if (overlay) overlay.style.display = 'none';
}

function getMixVolumeGeralHtml() {
    const isDesktop = layoutMode === 'desktop';

    if (isDesktop) {
        return `
            <div class="fader-card-desktop macro-fader-card" id="cardMixVolumeGeral" onwheel="if (typeof startMixVolumeGeralNudge === 'function') { startMixVolumeGeralNudge(event.deltaY < 0 ? 1 : -1); stopMixVolumeGeralNudge(); event.preventDefault(); }">
                <div class="desk-label">MIX</div>
                <div class="btn-cue-placeholder"></div>
                <div class="desk-ch-name-zone macro-ch-name-zone">
                    <div class="desk-ch-name">VOLUME GERAL</div>
                </div>
                <div id="mix-volume-geral-db-display" class="macro-db-display">--</div>
                <div class="macro-fader-nudge-wrap">
                    <div class="macro-nudge-btn-container" onpointerdown="startMixVolumeGeralNudge(1)" onpointerup="stopMixVolumeGeralNudge()" onpointerleave="stopMixVolumeGeralNudge()" onpointercancel="stopMixVolumeGeralNudge()">
                        <button class="btn-nudge-macro-big">+</button>
                    </div>
                    <div class="macro-nudge-btn-container" onpointerdown="startMixVolumeGeralNudge(-1)" onpointerup="stopMixVolumeGeralNudge()" onpointerleave="stopMixVolumeGeralNudge()" onpointercancel="stopMixVolumeGeralNudge()">
                        <button class="btn-nudge-macro-big">-</button>
                    </div>
                </div>
                <div class="macro-fader-config-wrap">
                    <button class="macro-fader-zerar-btn" onclick="showMixZeroConfirm()">ZERAR</button>
                </div>
                <div class="desk-footer-label">MIX</div>
            </div>
        `;
    } else {
        return `
            <div class="fader-card macro-fader-card" id="cardMixVolumeGeral" onwheel="if (typeof startMixVolumeGeralNudge === 'function') { startMixVolumeGeralNudge(event.deltaY < 0 ? 1 : -1); stopMixVolumeGeralNudge(); event.preventDefault(); }">
                <h2 class="card-title">MIX</h2>
                <div class="ch-clickable-zone macro-ch-clickable-zone">
                    <div class="ch-name">VOLUME GERAL</div>
                </div>
                <div id="mix-volume-geral-db-display" class="macro-db-display">--</div>
                <div class="macro-fader-nudge-wrap">
                    <div class="macro-nudge-btn-container" onpointerdown="startMixVolumeGeralNudge(1)" onpointerup="stopMixVolumeGeralNudge()" onpointerleave="stopMixVolumeGeralNudge()" onpointercancel="stopMixVolumeGeralNudge()">
                        <button class="btn-nudge-macro-big">+</button>
                    </div>
                    <div class="macro-nudge-btn-container" onpointerdown="startMixVolumeGeralNudge(-1)" onpointerup="stopMixVolumeGeralNudge()" onpointerleave="stopMixVolumeGeralNudge()" onpointercancel="stopMixVolumeGeralNudge()">
                        <button class="btn-nudge-macro-big">-</button>
                    </div>
                </div>
                <button class="macro-fader-zerar-btn-mobile" onclick="showMixZeroConfirm()">ZERAR</button>
            </div>
        `;
    }
}

window.getMixVolumeGeralHtml = getMixVolumeGeralHtml;
window.startMixVolumeGeralNudge = startMixVolumeGeralNudge;
window.stopMixVolumeGeralNudge = stopMixVolumeGeralNudge;
window.zeroMixVolGeral = zeroMixVolGeral;
window.showMixZeroConfirm = showMixZeroConfirm;
window.closeMixZeroConfirm = closeMixZeroConfirm;
