/**
 * MOD: CHANNEL TOGGLER (Unified Profile Edition)
 * Toggle ON/OFF para múltiplos canais.
 */
(function() {
    const ID = "channel_toggler";
    let internalSlotConfig = []; // Array de IDs de canais

    // 1. ExecuÃ§Ã£o
    async function execute(slotIndex, slotConfig) {
        const channels = Array.isArray(slotConfig) ? slotConfig : [];
        console.log(`[TOGGLER DEBUG] Slot: ${slotIndex}, Canais:`, channels);
        if (channels.length === 0) { console.warn("[TOGGLER] Nenhum canal configurado para este slot!"); return; }
        
        // Execução sequencial com delay para garantir que a mesa física processe tudo
        for (const chIdx of channels) {
            const currentState = getChannelStateById(chIdx);
            if (currentState) {
                MixerAPI.mixer.toggleOn(chIdx, !currentState.on);
                // Pequeno delay entre mensagens no macro para não saturar a ponte socket->midi
                await new Promise(r => setTimeout(r, 20));
            }
        }
    }

    // 2. Configuração
    async function onConfigure(slotIndex, slotConfig) {
        // Garante que internalSlotConfig seja sempre um array de números (IDs de canais)
        if (Array.isArray(slotConfig)) {
            internalSlotConfig = JSON.parse(JSON.stringify(slotConfig));
        } else {
            internalSlotConfig = []; // fallback seguro
            if (slotConfig && Object.keys(slotConfig).length > 0) {
                console.warn(`[TOGGLER] slotConfig não é um array:`, slotConfig);
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
        try { const res = await fetch('/api/names'); namesMap = await res.json(); } catch (e) {}

        grid.innerHTML = '';
        for (let i = 0; i < 32; i++) {
            const chName = namesMap[i] || (typeof channelStates !== 'undefined' && channelStates[i] ? channelStates[i].name : `CH ${i+1}`);
            const isSelected = internalSlotConfig.includes(i);
            const isOnMixer = (typeof channelStates !== 'undefined' && channelStates[i] && channelStates[i].on === true);

            const btn = document.createElement('button');
            btn.className = 'btn-connect';
            
            // Base styles and conditional background/colors
            btn.style.height = '50px';
            btn.style.margin = '0';
            btn.style.fontSize = '10px';
            btn.style.textTransform = 'uppercase';
            btn.style.borderRadius = '8px';
            btn.style.background = isSelected ? '#2e7d32' : '#333';
            btn.style.color = isSelected ? '#fff' : (isOnMixer ? '#fff' : '#888');

            // Apply yellow border if channel is ON on the physical/virtual console
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
                renderUI(slotIndex);
            };
            grid.appendChild(btn);
        }
    }

    async function onSave(slotIndex) {
        await MixerAPI.saveConfig(ID, slotIndex, internalSlotConfig);
        document.getElementById('macroSettingsModal').style.display = 'none';
    }

    async function onClear(slotIndex) {
        internalSlotConfig = [];
        renderUI(slotIndex);
    }

    async function onDelete(slotIndex) {
        await MixerAPI.saveConfig(ID, slotIndex, null);
    }

    window.registerMacro(ID, {
        name: "Toggler", color: "#6a1b9a",
        execute, onConfigure, onSave, onClear, onDelete
    });
})();
