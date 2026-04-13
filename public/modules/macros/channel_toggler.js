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
        
        channels.forEach(chIdx => {
            // Usa as primitivas da MixerAPI
            MixerAPI.mixer.toggleOn(chIdx, !getChannelStateById(chIdx).on);
        });
    }

    // 2. Configuração
    async function onConfigure(slotIndex, slotConfig) {
        internalSlotConfig = JSON.parse(JSON.stringify(slotConfig || []));
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
            const chName = namesMap[i] || (window.channelStates && window.channelStates[i] ? window.channelStates[i].name : `CH ${i+1}`);
            const isSelected = internalSlotConfig.includes(i);
            const btn = document.createElement('button');
            btn.className = 'btn-connect';
            btn.style.cssText = `background: ${isSelected? '#2e7d32':'#333'}; height: 50px; margin: 0; font-size: 10px; border: 1px solid ${isSelected? '#4caf50':'#444'}; color: ${isSelected? '#fff':'#888'}; text-transform: uppercase; border-radius:8px;`;
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
