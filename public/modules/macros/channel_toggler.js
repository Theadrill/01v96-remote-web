/**
 * MOD: CHANNEL TOGGLER (Preset-Aware Version)
 * Toggle ON/OFF para múltiplos canais.
 */
(function() {
    const ID = "channel_toggler";
    let allSlotsConfig = {}; 

    // Helper para pegar o preset do motor central (macros.js)
    function getPreset() {
        return (typeof window.getCurrentMacroPreset === 'function') ? window.getCurrentMacroPreset() : 'default';
    }

    // 1. Execução: Abre o preset certo do servidor antes de agir
    async function execute(slotIndex) {
        await loadFullConfig(); // Garante q está na casa certa
        const slotKey = `slot_${slotIndex}`;
        const channels = allSlotsConfig[slotKey] || [];
        if (channels.length === 0) return;
        
        channels.forEach(chIdx => {
            if (typeof toggleState === 'function') toggleState('kInputChannelOn/kChannelOn', chIdx);
        });
    }

    // 2. Configuração: Tabela de canais da casa atual
    async function onConfigure(slotIndex) {
        await loadFullConfig(); 
        const grid = document.getElementById('macroSettingsGrid');
        const title = document.getElementById('settingsMacroTitle');
        if (!grid) return;

        title.innerText = `Configurar Toggler - Slot ${slotIndex + 1}`;
        grid.innerHTML = '<p style="color:#666; font-size:11px; text-align:center; width:100%;">Carregando nomes da casa...</p>';

        let namesMap = {};
        try { const res = await fetch('/api/names'); namesMap = await res.json(); } catch (e) {}

        grid.innerHTML = '';
        const slotKey = `slot_${slotIndex}`;
        if (!allSlotsConfig[slotKey]) allSlotsConfig[slotKey] = [];
        const currentSelected = allSlotsConfig[slotKey];

        for (let i = 0; i < 32; i++) {
            const chName = namesMap[i] || (window.channelStates && window.channelStates[i] ? window.channelStates[i].name : `CH ${i+1}`);
            const isSelected = currentSelected.includes(i);
            const btn = document.createElement('button');
            btn.className = 'btn-connect';
            btn.style.cssText = `background: ${isSelected? '#2e7d32':'#333'}; height: 50px; margin: 0; font-size: 10px; border: 1px solid ${isSelected? '#4caf50':'#444'}; color: ${isSelected? '#fff':'#888'}; text-transform: uppercase; overflow: hidden;`;
            btn.innerHTML = `<span style="display:block; font-size:8px; opacity:0.5;">${i+1}</span> ${chName}`;
            btn.onclick = () => {
                const idx = allSlotsConfig[slotKey].indexOf(i);
                if (idx === -1) { allSlotsConfig[slotKey].push(i); btn.style.background='#2e7d32'; } 
                else { allSlotsConfig[slotKey].splice(idx, 1); btn.style.background='#333'; }
            };
            grid.appendChild(btn);
        }
    }

    // 3. Salva no arquivo correspondente ao preset (ex: channel_toggler_pcmaria.json)
    async function onSave() {
        try {
            await fetch(`/api/macros/config/${ID}?preset=${getPreset()}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(allSlotsConfig)
            });
            document.getElementById('macroSettingsModal').style.display = 'none';
        } catch (e) { alert("Erro ao salvar toggler."); }
    }

    // 4. Deleta daquela casa específica
    async function onDelete(slotIndex) {
        await loadFullConfig(); 
        const slotKey = `slot_${slotIndex}`;
        if (allSlotsConfig[slotKey]) {
            delete allSlotsConfig[slotKey];
            await fetch(`/api/macros/config/${ID}?preset=${getPreset()}`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(allSlotsConfig)
            });
        }
    }

    // Carregamento inteligente (puxa da casa correta automaticamente)
    async function loadFullConfig() {
        try {
            const res = await fetch(`/api/macros/config/${ID}?preset=${getPreset()}`);
            allSlotsConfig = await res.json() || {};
        } catch (e) { allSlotsConfig = {}; }
    }

    window.registerMacro(ID, {
        name: "Toggler", color: "#6a1b9a",
        execute, onConfigure, onSave, onDelete
    });
})();
