let macroSelectedChannels = JSON.parse(localStorage.getItem('macro_selected_channels')) || [];
let tempMacroSelectedChannels = [];
let macroLockedChannels = JSON.parse(localStorage.getItem('macro_locked_channels')) || [];
let tempMacroLockedChannels = [];

function saveMacroChannels() {
    if (musicianMode) {
        macroLockedChannels = [...tempMacroLockedChannels];
        localStorage.setItem('macro_locked_channels', JSON.stringify(macroLockedChannels));
    } else {
        macroSelectedChannels = [...tempMacroSelectedChannels];
        localStorage.setItem('macro_selected_channels', JSON.stringify(macroSelectedChannels));
    }
}

// --- Factory de Macro Fader ---
function createMacroFaderInstance(config) {
    const {
        title,
        titleLong,
        getChannelIds,
        showConfig = true,
        cardId = 'cardMacro',
        dbDisplayId = 'macro-db-display',
        nudgeStartFn = 'startMacroNudge',
        nudgeStopFn = 'stopMacroNudge',
        configFn = 'openMacroConfig',
    } = config;

    let nudgeInterval = null;
    let nudgeTimeout = null;
    let nudgeMaxDurationTimer = null;
    let deltaSteps = 0;
    let dbResetTimer = null;

    function deltaToDB(steps) {
        const db = musicianMode ? steps * 1.0 : steps * 0.05;
        const sign = db >= 0 ? '+' : '';
        return musicianMode ? `${sign}${db.toFixed(0)} dB` : `${sign}${db.toFixed(2)} dB`;
    }

    function updateDbDisplay() {
        const el = document.getElementById(dbDisplayId);
        if (!el) return;
        if (deltaSteps === 0) {
            el.textContent = '--';
            el.classList.remove('macro-db-active');
        } else {
            el.textContent = deltaToDB(deltaSteps);
            el.classList.add('macro-db-active');
        }
    }

    function resetDbDisplay() {
        if (dbResetTimer) clearTimeout(dbResetTimer);
        dbResetTimer = setTimeout(() => {
            deltaSteps = 0;
            updateDbDisplay();
            dbResetTimer = null;
        }, 5000);
    }

    function nudge(dir) {
        const channels = getChannelIds();
        if (!channels.length) return;

        const step = musicianMode ? dir * 20 : dir;
        let anyChanged = false;

        channels.forEach(chIdx => {
            let s = channelStates[chIdx];
            if (!s) return;

            let currentVal = ((musicianMode || technicianMixMode)) ? (s[`aux${activeMix}`] || 0) : s.value;
            if (musicianMode && currentVal <= 0) return;
            let nRaw = currentVal + step;
            if (nRaw < 0) nRaw = 0;
            if (nRaw > 1023) nRaw = 1023;

            if (nRaw === currentVal) return;

            anyChanged = true;
            updateUI(chIdx, nRaw, undefined, undefined);

            let typeFader;
            if ((musicianMode || technicianMixMode)) typeFader = `kInputAUX/kAUX${activeMix}Level`;
            else typeFader = 'kInputFader/kFader';

            if (appReady) {
                socket.emit('control', { type: typeFader, channel: chIdx, value: nRaw });
            }
        });

        if (!anyChanged) return;
        deltaSteps += dir;
        updateDbDisplay();
        resetDbDisplay();
    }

    function startNudge(dir) {
        stopNudge();
        nudge(dir);

        const repeatMs = musicianMode ? 160 : 80;
        const holdMs = musicianMode ? 200 : 500;
        nudgeTimeout = setTimeout(() => {
            nudgeInterval = setInterval(() => {
                nudge(dir * 3);
            }, repeatMs);
        }, holdMs);

        nudgeMaxDurationTimer = setTimeout(() => {
            stopNudge();
        }, 10000);
    }

    function stopNudge() {
        if (nudgeTimeout) clearTimeout(nudgeTimeout);
        if (nudgeInterval) clearInterval(nudgeInterval);
        if (nudgeMaxDurationTimer) clearTimeout(nudgeMaxDurationTimer);
        nudgeTimeout = null;
        nudgeInterval = null;
        nudgeMaxDurationTimer = null;
    }

    function getHtml() {
        const isDesktop = layoutMode === 'desktop';
        const isHorizontal = document.body.classList.contains('layout-horizontal');

        const configBtn = showConfig ? `
            <div class="macro-fader-config-wrap">
                <button class="side-btn btn-config macro-fader-config-btn" onclick="${configFn}()">CONFIG</button>
            </div>
        ` : '';

        const configBtnMobile = showConfig ? `
            <button class="btn-state macro-fader-config-btn-mobile" onclick="${configFn}()">CONFIG</button>
        ` : '';

        if (isDesktop) {
            return `
                <div class="fader-card-desktop macro-fader-card" id="${cardId}">
                    <div class="desk-label">${title}</div>
                    <div class="btn-cue-placeholder"></div>
                    
                    <div class="desk-ch-name-zone macro-ch-name-zone">
                        <div class="desk-ch-name">${titleLong}</div>
                    </div>

                    ${configBtn}

                    <div id="${dbDisplayId}" class="macro-db-display">--</div>
                    
                    <div class="macro-fader-nudge-wrap">
                        <div class="macro-nudge-btn-container" onpointerdown="${nudgeStartFn}(1)" onpointerup="${nudgeStopFn}()" onpointerleave="${nudgeStopFn}()" onpointercancel="${nudgeStopFn}()">
                            <button class="btn-nudge-macro-big">+</button>
                        </div>
                        <div class="macro-nudge-btn-container" onpointerdown="${nudgeStartFn}(-1)" onpointerup="${nudgeStopFn}()" onpointerleave="${nudgeStopFn}()" onpointercancel="${nudgeStopFn}()">
                            <button class="btn-nudge-macro-big">-</button>
                        </div>
                    </div>
                    
                    <div class="desk-footer-label">${title}</div>
                </div>
            `;
        } else {
            return `
                <div class="fader-card macro-fader-card" id="${cardId}">
                    <h2 class="card-title">${title}</h2>
                    
                    <div class="ch-clickable-zone macro-ch-clickable-zone">
                        <div class="ch-name">${titleLong}</div>
                    </div>

                    ${configBtnMobile}

                    <div id="${dbDisplayId}" class="macro-db-display">--</div>
                    
                    <div class="macro-fader-nudge-wrap">
                        <div class="macro-nudge-btn-container" onpointerdown="${nudgeStartFn}(1)" onpointerup="${nudgeStopFn}()" onpointerleave="${nudgeStopFn}()" onpointercancel="${nudgeStopFn}()">
                            <button class="btn-nudge-macro-big">+</button>
                        </div>
                        <div class="macro-nudge-btn-container" onpointerdown="${nudgeStartFn}(-1)" onpointerup="${nudgeStopFn}()" onpointerleave="${nudgeStopFn}()" onpointercancel="${nudgeStopFn}()">
                            <button class="btn-nudge-macro-big">-</button>
                        </div>
                    </div>
                </div>
            `;
        }
    }

    return { getHtml, nudge, startNudge, stopNudge };
}

// --- Instancia padrao do Macro Fader ---
const macroFader = createMacroFaderInstance({
    title: 'MACRO',
    titleLong: 'MACRO FADER',
    getChannelIds: () => {
        if (musicianMode) {
            return Array.from({length: 32}, (_, i) => i).filter(i => !macroLockedChannels.includes(i));
        }
        return macroSelectedChannels;
    },
    showConfig: true,
    cardId: 'cardMacro',
    dbDisplayId: 'macro-db-display',
    nudgeStartFn: 'startMacroNudge',
    nudgeStopFn: 'stopMacroNudge',
    configFn: 'openMacroConfig',
});

window.getMacroFaderHtml = () => macroFader.getHtml();
window.startMacroNudge = (dir) => macroFader.startNudge(dir);
window.stopMacroNudge = () => macroFader.stopNudge();
window.nudgeMacro = (dir) => macroFader.nudge(dir);

// --- Config Modal (so existe para o Macro Fader principal) ---
function openMacroConfig() {
    const modal = document.getElementById('macroSettingsModal');
    const title = document.getElementById('settingsMacroTitle');
    const subtitle = document.getElementById('settingsMacroSubtitle');

    if (musicianMode) {
        title.innerText = "CANAIS PROTEGIDOS";
        title.style.color = "#ff4444";
        modal.style.borderColor = "#ff4444";
        if (subtitle) subtitle.innerText = "Toque nos canais que NÃO quer mexer:";
        tempMacroLockedChannels = [...macroLockedChannels];
    } else {
        title.innerText = "CONFIGURACAO MACRO FADER";
        title.style.color = "#00ffcc";
        modal.style.borderColor = "#00ffcc";
        if (subtitle) subtitle.innerText = "Selecione os canais desejados abaixo:";
        tempMacroSelectedChannels = [...macroSelectedChannels];
    }

    renderMacroGrid();
    modal.style.display = 'flex';
    updateMacroModalLayout();
}

function updateMacroModalLayout() {
    const el = document.getElementById('macroSettingsModalContent');
    if (!el) return;
    const modal = document.getElementById('macroSettingsModal');
    if (!modal || modal.style.display !== 'flex') return;
    const w = window.innerWidth;
    const h = window.innerHeight;
    el.classList.toggle('compact', h < 500 && w > h);
}

window.addEventListener('resize', updateMacroModalLayout);

function renderMacroGrid() {
    const grid = document.getElementById('macroSettingsGrid');
    if (!grid) return;
    grid.innerHTML = '';

    const isLockMode = musicianMode;
    const tempArr = isLockMode ? tempMacroLockedChannels : tempMacroSelectedChannels;

    for (let i = 0; i < 32; i++) {
        const isSelected = tempArr.includes(i);
        const isOnMixer = channelStates[i].on === true;
        const chName = (window.resolvedNames && window.resolvedNames[i]) ? window.resolvedNames[i].name : (channelStates[i].name || `CH ${i + 1}`);

        const btn = document.createElement('button');
        btn.className = `btn-connect ${isSelected ? (isLockMode ? 'macro-ch-locked' : 'macro-ch-selected') : ''}`;
        btn.style.margin = '0';
        btn.style.height = '50px';
        btn.style.fontSize = '11px';
        btn.style.position = 'relative';

        if (isLockMode && isSelected) {
            btn.style.background = '#cc3333';
            btn.style.color = '#fff';
        } else if (isSelected) {
            btn.style.background = '#ffcc00';
            btn.style.color = '#000';
        } else {
            btn.style.background = '#333';
            btn.style.color = '#fff';
        }

        if (isOnMixer) {
            btn.style.border = '2px solid #ffcc00';
            btn.style.boxShadow = 'inset 0 0 5px rgba(255, 204, 0, 0.5)';
        } else {
            btn.style.border = '1px solid #444';
            btn.style.boxShadow = 'none';
        }

        const lockIcon = isLockMode && isSelected ? '<span style="position:absolute; top:2px; right:4px; font-size:20px;">🔒</span>' : '';
        const nameBlank = !chName.trim();
        if (nameBlank) {
            btn.innerHTML = `${i + 1}${lockIcon}`;
            btn.style.color = '#555';
        } else {
            const numColor = isLockMode ? '#ccc' : 'inherit';
            btn.innerHTML = `<span style="color:${numColor}">${i + 1} - </span>${chName.toUpperCase()}${lockIcon}`;
        }
        btn.onclick = () => toggleMacroChannel(i);
        grid.appendChild(btn);
    }
}

function clearMacroSelection() {
    if (musicianMode) {
        tempMacroLockedChannels = [];
    } else {
        tempMacroSelectedChannels = [];
    }
    renderMacroGrid();
}

function toggleMacroChannel(i) {
    const isLockMode = musicianMode;
    const tempArr = isLockMode ? tempMacroLockedChannels : tempMacroSelectedChannels;
    const idx = tempArr.indexOf(i);
    if (idx > -1) {
        tempArr.splice(idx, 1);
    } else {
        tempArr.push(i);
    }
    renderMacroGrid();
}

window.saveMacroChannels = saveMacroChannels;
window.clearMacroSelection = clearMacroSelection;

function renderMacroFader() {
    if (typeof initUI === 'function') initUI();
}

window.addEventListener('load', renderMacroFader);
window.addEventListener('resize', renderMacroFader);

document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
        if (typeof window.stopMacroNudge === 'function') window.stopMacroNudge();
        if (typeof window.stopVolumeGeralNudge === 'function') window.stopVolumeGeralNudge();
    }
});
