/**
 * MOD: CHANNEL TOGGLER (Unified Profile Edition)
 * Toggle ON/OFF para multiplos canais.
 */
(function() {
    let internalSlotConfig = [];

    async function execute(slotIndex, slotConfig) {
        const channels = Array.isArray(slotConfig) ? slotConfig : [];
        console.log(`[TOGGLER DEBUG] Slot: ${slotIndex}, Canais:`, channels);
        if (channels.length === 0) { console.warn("[TOGGLER] Nenhum canal configurado para este slot!"); return; }
        
        for (const chIdx of channels) {
            const currentState = getChannelStateById(chIdx);
            if (currentState) {
                MixerAPI.mixer.toggleOn(chIdx, !currentState.on);
                await new Promise(r => setTimeout(r, 20));
            }
        }
    }

    async function onConfigure(slotIndex, slotConfig) {
        if (Array.isArray(slotConfig)) {
            internalSlotConfig = JSON.parse(JSON.stringify(slotConfig));
        } else {
            internalSlotConfig = [];
            if (slotConfig && Object.keys(slotConfig).length > 0) {
                console.warn(`[TOGGLER] slotConfig nao e um array:`, slotConfig);
            }
        }
        renderUI(slotIndex);
    }

    async function renderUI(slotIndex) {
        const grid = document.getElementById('macroSettingsGrid');
        const title = document.getElementById('settingsMacroTitle');
        if (!grid) return;

        title.innerText = `Configurar Toggler - Slot ${slotIndex + 1}`;
        grid.innerHTML = '<p style="grid-column: 1 / -1; color:#666; font-size:11px; text-align:center; width:100%;">Carregando nomes...</p>';

        let namesMap = {};
        try { const res = await window.apiFetch('/api/names'); namesMap = await res.json(); } catch (e) {}

        grid.innerHTML = '';
        for (let i = 0; i < 32; i++) {
            const chName = namesMap[i] || (window.resolvedNames && window.resolvedNames[i] ? window.resolvedNames[i].name : (typeof channelStates !== 'undefined' && channelStates[i] ? channelStates[i].name : `CH ${i+1}`));
            const isSelected = internalSlotConfig.includes(i);
            const isOnMixer = (typeof channelStates !== 'undefined' && channelStates[i] && channelStates[i].on === true);

            const btn = document.createElement('button');
            btn.className = 'btn-connect';
            
            btn.style.height = '50px';
            btn.style.margin = '0';
            btn.style.fontSize = '10px';
            btn.style.textTransform = 'uppercase';
            btn.style.borderRadius = '8px';
            btn.style.background = isSelected ? '#2e7d32' : '#333';
            btn.style.color = isSelected ? '#fff' : (isOnMixer ? '#fff' : '#888');

            if (isOnMixer) {
                btn.style.border = '2px solid #ffcc00';
                btn.style.boxShadow = 'inset 0 0 5px rgba(255, 204, 0, 0.5)';
            } else {
                btn.style.border = `1px solid ${isSelected ? '#4caf50' : '#444'}`;
                btn.style.boxShadow = 'none';
            }

            btn.innerHTML = `<span style="display:block; font-size:8px; opacity:0.5;">${i+1}</span> ${chName}`;
            btn.onclick = () => {
                const idx = internalSlotConfig.indexOf(i);
                if (idx === -1) internalSlotConfig.push(i); else internalSlotConfig.splice(idx, 1);
                const nowSelected = internalSlotConfig.includes(i);
                btn.style.background = nowSelected ? '#2e7d32' : '#333';
                btn.style.color = nowSelected ? '#fff' : (isOnMixer ? '#fff' : '#888');
                btn.style.border = isOnMixer ? '2px solid #ffcc00' : `1px solid ${nowSelected ? '#4caf50' : '#444'}`;
            };
            grid.appendChild(btn);
        }
    }

    async function onSave(slotIndex) {
        await MixerAPI.saveConfig('channel_toggler', slotIndex, internalSlotConfig);
        document.getElementById('macroSettingsModal').style.display = 'none';
    }

    async function onClear(slotIndex) {
        internalSlotConfig = [];
        renderUI(slotIndex);
    }

    async function onDelete(slotIndex) {
        await MixerAPI.saveConfig('channel_toggler', slotIndex, null);
    }

    MixerAPI.registerMacro('channel_toggler', {
        name: "Toggler", color: "#6a1b9a",
        execute, onConfigure, onSave, onClear, onDelete
    });
})();
