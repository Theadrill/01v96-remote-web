let macroSelectedChannels = JSON.parse(localStorage.getItem('macro_selected_channels')) || [];
let tempMacroSelectedChannels = [];

function saveMacroChannels() {
    macroSelectedChannels = [...tempMacroSelectedChannels];
    localStorage.setItem('macro_selected_channels', JSON.stringify(macroSelectedChannels));
}

function getMacroFaderHtml() {
    const isDesktop = layoutMode === 'desktop';
    const isHorizontal = document.body.classList.contains('layout-horizontal');

    // Configurações de estilo baseadas no modo
    const cardStyle = isDesktop
        ? 'display: flex !important; flex-direction: column !important; flex: 0 0 74px !important; height: 100%; box-sizing: border-box; overflow: hidden;'
        : 'display: flex !important; flex-direction: column !important; flex: 0 0 110px !important; height: 100%; box-sizing: border-box; overflow: hidden;';

    if (isDesktop) {
        return `
            <div class="fader-card-desktop macro-fader-card" id="cardMacro" style="${cardStyle}">
                <div class="desk-label" style="background: #555 !important; color: #fff !important;">MACRO</div>
                <div class="btn-cue-placeholder"></div>
                
                <div class="desk-ch-name-zone" style="display: flex; align-items: center; justify-content: center; overflow: hidden; height: 35px;">
                    <div class="desk-ch-name" style="color: #fff !important; background: transparent !important; border: none !important; font-size: 11px; white-space: normal; line-height: 1.1; text-align: center; width: 100%;">MACRO FADER</div>
                </div>

                <div style="padding: 10px 5px;">
                    <button class="side-btn btn-config" style="margin: 0; width: 100%; height: 35px; font-size: 10px; background: #6a1b9a; color: white; border: none;" onclick="openMacroConfig()">CONFIG</button>
                </div>
                
                <div style="flex: 1; display: flex; flex-direction: column; gap: 5px; padding: 5px;">
                    <div class="macro-nudge-btn-container" style="flex: 1;" onpointerdown="startMacroNudge(1)" onpointerup="stopMacroNudge()" onpointerleave="stopMacroNudge()">
                        <button class="btn-nudge-macro-big">+</button>
                    </div>
                    <div class="macro-nudge-btn-container" style="flex: 1;" onpointerdown="startMacroNudge(-1)" onpointerup="stopMacroNudge()" onpointerleave="stopMacroNudge()">
                        <button class="btn-nudge-macro-big">-</button>
                    </div>
                </div>
                
                <div class="desk-footer-label" style="color: #666;">MACRO</div>
            </div>
        `;
    } else {
        return `
            <div class="fader-card macro-fader-card" style="${cardStyle}">
                <h2 class="card-title" style="color: #333 !important; margin: 5px 0 2px 0; font-size: 10px; text-align: center; font-weight: bold;">MACRO</h2>
                
                <div class="ch-clickable-zone" style="background: #000 !important; margin: 0 4px 4px 4px; border-radius: 8px; padding: 8px 2px; height: 40px; display: flex; align-items: center; justify-content: center;">
                    <div class="ch-name" style="color: #fff !important; background: transparent !important; border: none !important; font-size: 11px; white-space: normal; line-height: 1.1; text-align: center; width: 100%;">MACRO FADER</div>
                </div>

                <button class="btn-state" style="width: 90%; margin: 5px auto; padding: 8px 0; background: #6a1b9a; color: white; border: 1px solid #8e24aa;" onclick="openMacroConfig()">CONFIG</button>
                
                <div style="flex: 1; display: flex; flex-direction: column; gap: 10px; padding: 10px; width: 100%;">
                    <div class="macro-nudge-btn-container" style="flex: 1;" onpointerdown="startMacroNudge(1)" onpointerup="stopMacroNudge()" onpointerleave="stopMacroNudge()">
                        <button class="btn-nudge-macro-big" style="width: 100%; font-size: 40px;">+</button>
                    </div>
                    <div class="macro-nudge-btn-container" style="flex: 1;" onpointerdown="startMacroNudge(-1)" onpointerup="stopMacroNudge()" onpointerleave="stopMacroNudge()">
                        <button class="btn-nudge-macro-big" style="width: 100%; font-size: 40px;">-</button>
                    </div>
                </div>
            </div>
        `;
    }
}

function openMacroConfig() {
    const modal = document.getElementById('macroSettingsModal');
    const title = document.getElementById('settingsMacroTitle');

    title.innerText = "CONFIGURAÇÃO MACRO FADER";
    title.style.color = "#00ffcc";
    modal.style.borderColor = "#00ffcc";

    // CARREGA CÓPIA TEMPORÁRIA (Para não limpar o storage real se cancelar)
    tempMacroSelectedChannels = [...macroSelectedChannels];
    renderMacroGrid();

    // Os botões agora são gerenciados pelo motor central em macros.js
    modal.style.display = 'flex';
}

function renderMacroGrid() {
    const grid = document.getElementById('macroSettingsGrid');
    if (!grid) return;
    grid.innerHTML = '';

    for (let i = 0; i < 32; i++) {
        const isSelected = tempMacroSelectedChannels.includes(i);
        const isOnMixer = channelStates[i].on === true;
        const chName = channelStates[i].name || `CH ${i + 1}`;

        const btn = document.createElement('button');
        btn.className = `btn-connect ${isSelected ? 'macro-ch-selected' : ''}`;
        btn.style.margin = '0';
        btn.style.height = '50px';
        btn.style.fontSize = '11px';

        btn.style.background = isSelected ? '#ffcc00' : '#333';
        btn.style.color = isSelected ? '#000' : '#fff';

        if (isOnMixer) {
            btn.style.border = '2px solid #ffcc00';
            btn.style.boxShadow = 'inset 0 0 5px rgba(255, 204, 0, 0.5)';
        } else {
            btn.style.border = '1px solid #444';
            btn.style.boxShadow = 'none';
        }

        btn.innerText = `${i + 1}\n${chName}`;
        btn.onclick = () => toggleMacroChannel(i);
        grid.appendChild(btn);
    }
}

function clearMacroSelection() {
    // Limpa apenas o temporário
    tempMacroSelectedChannels = [];
    renderMacroGrid();
}

window.saveMacroChannels = saveMacroChannels;
window.clearMacroSelection = clearMacroSelection;

function toggleMacroChannel(i) {
    const idx = tempMacroSelectedChannels.indexOf(i);
    if (idx > -1) {
        tempMacroSelectedChannels.splice(idx, 1);
    } else {
        tempMacroSelectedChannels.push(i);
    }
    renderMacroGrid();
}

let macroNudgeInterval = null;
let macroNudgeTimeout = null;

function startMacroNudge(dir) {
    stopMacroNudge();
    nudgeMacro(dir);

    macroNudgeTimeout = setTimeout(() => {
        macroNudgeInterval = setInterval(() => {
            nudgeMacro(dir * 3);
        }, 80);
    }, 500);
}

function stopMacroNudge() {
    if (macroNudgeTimeout) clearTimeout(macroNudgeTimeout);
    if (macroNudgeInterval) clearInterval(macroNudgeInterval);
    macroNudgeTimeout = null;
    macroNudgeInterval = null;
}

function nudgeMacro(dir) {
    if (!macroSelectedChannels.length) return;

    macroSelectedChannels.forEach(chIdx => {
        let s = channelStates[chIdx];
        if (!s) return;

        let currentVal = ((musicianMode || technicianMixMode)) ? (s[`aux${activeMix}`] || 0) : s.value;
        let nRaw = currentVal + dir;
        if (nRaw < 0) nRaw = 0;
        if (nRaw > 1023) nRaw = 1023;

        updateUI(chIdx, nRaw, undefined, undefined);

        let typeFader;
        if ((musicianMode || technicianMixMode)) typeFader = `kInputAUX/kAUX${activeMix}Level`;
        else typeFader = 'kInputFader/kFader';

        if (appReady) {
            socket.emit('control', { type: typeFader, channel: chIdx, value: nRaw });
        }
    });
}

function renderMacroFader() {
    if (typeof initUI === 'function') initUI();
}

window.addEventListener('load', renderMacroFader);
window.addEventListener('resize', renderMacroFader);
