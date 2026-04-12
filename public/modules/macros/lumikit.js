/**
 * MOD: LUMIKIT SCENE AND EXTRAS
 * Envia comandos HTTP GET diretos para o web server local da Lumikit
 * Seleciona 1 ou mais cenas + 1 ou mais funções extras combinadas via Grid nativa.
 * Suporte a PÁGINA 1 e PÁGINA 2 de cenas.
 */
(function() {
    const ID = "lumikit";
    let allSlotsConfig = {}; 

    // Helper para pegar o preset do motor central (macros.js)
    function getPreset() {
        return (typeof window.getCurrentMacroPreset === 'function') ? window.getCurrentMacroPreset() : 'default';
    }

    // Carregamento da config persistente (onde estão as configs de cada botão, e a "globalHost")
    async function loadFullConfig() {
        try {
            const res = await fetch(`/api/macros/config/${ID}?preset=${getPreset()}`);
            allSlotsConfig = await res.json() || {};
            if (!allSlotsConfig.globalHost) allSlotsConfig.globalHost = { ip: '127.0.0.1', port: 5000 };
        } catch (e) { 
            allSlotsConfig = { globalHost: { ip: '127.0.0.1', port: 5000 } };
        }
    }

    // 1. Execução
    async function execute(slotIndex) {
        await loadFullConfig(); 
        const slotKey = `slot_${slotIndex}`;
        const actions = allSlotsConfig[slotKey] || { scenes: [], extras: [] };
        
        const host = allSlotsConfig.globalHost || { ip: '127.0.0.1', port: 5000 };
        const baseUrl = `http://${host.ip}:${host.port}`;

        // Executa todas cenas ativadas no slot
        if (actions.scenes && actions.scenes.length > 0) {
            for (let scene of actions.scenes) {
                try {
                    let p = 0;
                    let s = scene;
                    if (typeof scene === 'string' && scene.includes(':')) {
                        const parts = scene.split(':');
                        p = parseInt(parts[0]);
                        s = parseInt(parts[1]);
                    }
                    fetch(`${baseUrl}/services/edmx_change_scene/${p}/${s}`, { mode: 'no-cors' });
                } catch(e) {}
            }
        }

        // Delay opcional para as cenas passarem antes da varredura de toggle extra
        setTimeout(async () => {
            if (actions.extras && actions.extras.length > 0) {
                // Para habilitar o TOGGLE real das funções extras, precisamos ver se ela está ligada ou não!
                let efStatus = [];
                try {
                    const stRes = await fetch(`/api/proxy?url=${encodeURIComponent(baseUrl + '/services/main_get_ef_status')}`);
                    const stData = await stRes.json();
                    if (stData && stData.data && stData.data[0] && stData.data[0].items) {
                        efStatus = stData.data[0].items;
                    }
                } catch (err) {
                    console.warn("Lumikit (Execute Debug): Falha ao checar status do extra para toggle.", err);
                }

                for (let extra of actions.extras) {
                    try {
                        let isActive = false;
                        if (efStatus[extra] && efStatus[extra].active !== undefined) {
                            isActive = (String(efStatus[extra].active) === "true");
                        }
                        const actionType = isActive ? "release" : "press";
                        console.log(`Lumikit (Execute Debug): Extra F${extra+1} está ${isActive ? 'ON' : 'OFF'}, enviando comando ${actionType}.`);
                        fetch(`${baseUrl}/services/main_${actionType}_ef/${extra}`, { mode: 'no-cors' });
                    } catch(e) {}
                }
            }
        }, 100);
    }

    // 2. Interface de Configuração Exclusiva (usando o Modal de Grid Dinâmica)
    let currentCenasP1 = [];
    let currentCenasP2 = [];
    let currentExtras = [];

    async function onConfigure(slotIndex) {
        await loadFullConfig(); 
        const grid = document.getElementById('macroSettingsGrid');
        const title = document.getElementById('settingsMacroTitle');
        if (!grid) return;

        title.innerText = `Configurar Lumikit - Slot ${slotIndex + 1}`;
        grid.innerHTML = '<p style="grid-column: 1 / -1; color:#666; font-size:11px; text-align:center; width:100%;">Preparando dados...</p>';

        const slotKey = `slot_${slotIndex}`;
        if (!allSlotsConfig[slotKey]) allSlotsConfig[slotKey] = { scenes: [], extras: [] };
        const host = allSlotsConfig.globalHost || { ip: '127.0.0.1', port: 5000 };

        async function fetchLumikitData(syncMode = false) {
            if (syncMode) {
                const ipInput = document.getElementById('lumiIp');
                const portInput = document.getElementById('lumiPort');
                if (ipInput) host.ip = ipInput.value.trim() || '127.0.0.1';
                if (portInput) host.port = parseInt(portInput.value) || 5000;
                allSlotsConfig.globalHost = host;
            }

            const baseUrl = `http://${host.ip}:${host.port}`;
            let passCounter = 0;
            
            function checkRender() {
                passCounter++;
                if (passCounter >= 3) renderUI(slotIndex);
            }

            // Busca Página 1
            fetch(`/api/proxy?url=${encodeURIComponent(baseUrl + '/services/edmx_get_scenes_status/0')}`)
                .then(r=>r.json())
                .then(d=>{if(d&&d.data&&Array.isArray(d.data)) currentCenasP1=d.data; checkRender();})
                .catch(e=>{ checkRender();});

            // Busca Página 2
            fetch(`/api/proxy?url=${encodeURIComponent(baseUrl + '/services/edmx_get_scenes_status/1')}`)
                .then(r=>r.json())
                .then(d=>{if(d&&d.data&&Array.isArray(d.data)) currentCenasP2=d.data; checkRender();})
                .catch(e=>{ checkRender();});

            // Busca Extras
            fetch(`/api/proxy?url=${encodeURIComponent(baseUrl + '/services/main_get_ef_status')}`)
                .then(r=>r.json())
                .then(d=>{if(d&&d.data&&d.data[0]&&d.data[0].items) currentExtras=d.data[0].items; checkRender();})
                .catch(e=>{ checkRender();});

            setTimeout(() => { if (passCounter < 3) { passCounter=99; renderUI(slotIndex); } }, 2000);
        }

        fetchLumikitData(false);
    }

    function renderUI(slotIndex) {
        const grid = document.getElementById('macroSettingsGrid');
        if (!grid) return;
        const slotKey = `slot_${slotIndex}`;
        const host = allSlotsConfig.globalHost || { ip: '127.0.0.1', port: 5000 };
        const currentlySelectedScenes = allSlotsConfig[slotKey].scenes || [];
        const currentlySelectedExtras = allSlotsConfig[slotKey].extras || [];

        grid.innerHTML = `
            <!-- REDE GLOBAL -->
            <div style="grid-column: 1 / -1; width:100%; display:flex; flex-direction:column; gap:10px; margin-bottom:15px; background:rgba(0,0,0,0.4); padding:15px; border-radius:10px; box-sizing: border-box;">
                <span style="font-size:11px; color:#aaa; font-weight:bold; letter-spacing:1px;">LUMIKIT HOST (Global)</span>
                <div style="display:flex; flex-wrap:wrap; gap:10px; width:100%;">
                    <input type="text" id="lumiIp" value="${host.ip}" placeholder="IP" style="flex:2; min-width:120px; background:#222; border:1px solid #444; color:#fff; padding:10px; border-radius:8px; font-size:14px; outline:none; box-sizing:border-box;">
                    <input type="number" id="lumiPort" value="${host.port}" placeholder="Porta" style="flex:1; min-width:70px; background:#222; border:1px solid #444; color:#fff; padding:10px; border-radius:8px; font-size:14px; outline:none; box-sizing:border-box;">
                    <button id="lumiSyncBtn" style="flex:1; min-width:80px; background:#ff5722; color:#fff; border:none; border-radius:8px; padding:10px; font-size:13px; font-weight:bold; cursor:pointer; text-transform:uppercase; box-sizing:border-box;">SYNC</button>
                </div>
            </div>
        `;

        document.getElementById('lumiSyncBtn').onclick = () => {
            const btn = document.getElementById('lumiSyncBtn');
            btn.innerText = 'Buscando...';
            btn.style.opacity = '0.5';
            onConfigure(slotIndex);
        };

        // SEÇÃO PÁGINA 1
        const h1 = document.createElement('div');
        h1.style.cssText = `grid-column: 1 / -1; width:100%; border-bottom: 1px solid #444; margin-bottom: 5px; padding-bottom: 5px;`;
        h1.innerHTML = `<span style="font-size:12px; font-weight:bold; color:#ff5722;">CENAS - PÁGINA 1</span>`;
        grid.appendChild(h1);
        renderSceneButtons(slotIndex, 0, currentCenasP1);

        // SEÇÃO PÁGINA 2
        const h2 = document.createElement('div');
        h2.style.cssText = `grid-column: 1 / -1; width:100%; border-bottom: 1px solid #444; margin-top:20px; margin-bottom: 5px; padding-bottom: 5px;`;
        h2.innerHTML = `<span style="font-size:12px; font-weight:bold; color:#ffc107;">CENAS - PÁGINA 2</span>`;
        grid.appendChild(h2);
        renderSceneButtons(slotIndex, 1, currentCenasP2);

        // SEÇÃO EXTRAS
        const hEx = document.createElement('div');
        hEx.style.cssText = `grid-column: 1 / -1; width:100%; border-bottom: 1px solid #444; margin-top: 20px; margin-bottom: 5px; padding-bottom: 5px;`;
        hEx.innerHTML = `<span style="font-size:12px; font-weight:bold; color:#03a9f4;">FUNÇÕES EXTRAS</span>`;
        grid.appendChild(hEx);
        renderExtraButtons(slotIndex, currentExtras);
    }

    function renderSceneButtons(slotIndex, page, dataArray) {
        const grid = document.getElementById('macroSettingsGrid');
        const slotKey = `slot_${slotIndex}`;
        const currentlySelectedScenes = allSlotsConfig[slotKey].scenes || [];
        const count = dataArray.length > 0 ? dataArray.length : 16;
        const accent = page === 0 ? "#ff5722" : "#ffc107";
        const borderAccent = page === 0 ? "#e64a19" : "#ff9800";

        for (let i = 0; i < count; i++) {
            const rawName = dataArray[i] ? dataArray[i].name : "";
            const cName = rawName ? rawName : `CENA ${i+1}`;
            const val = `${page}:${i}`;
            const isSelected = currentlySelectedScenes.includes(val);
            
            const btn = document.createElement('button');
            btn.className = 'btn-connect';
            btn.style.cssText = `background: ${isSelected? accent : '#333'}; min-height: 72px; width: 100%; padding: 6px 4px; display: flex; flex-direction: column; align-items: center; justify-content: center; margin: 0; font-size: 9px; line-height: 1.1; border: 1px solid ${isSelected? borderAccent : '#444'}; color: ${isSelected? '#fff':'#888'}; text-transform: uppercase; word-break: break-word; border-radius: 8px;`;
            btn.innerHTML = `<span style="font-size:7px; opacity:0.5; margin-bottom:2px;">P${page+1} ID ${i}</span><span style="font-weight:bold; text-align:center;">${cName}</span>`;
            btn.onclick = () => {
                const idx = allSlotsConfig[slotKey].scenes.indexOf(val);
                if (idx === -1) { 
                    // REGRA: Somente 1 cena selecionada (Limpa as outras)
                    allSlotsConfig[slotKey].scenes = [val]; 
                } else { 
                    allSlotsConfig[slotKey].scenes = []; 
                }
                renderUI(slotIndex);
            };
            grid.appendChild(btn);
        }
    }

    function renderExtraButtons(slotIndex, dataArray) {
        const grid = document.getElementById('macroSettingsGrid');
        const slotKey = `slot_${slotIndex}`;
        const currentlySelectedExtras = allSlotsConfig[slotKey].extras || [];
        const totalExtras = dataArray.length > 0 ? dataArray.length : 16;
        for (let i = 0; i < totalExtras; i++) {
            const rawName = dataArray[i] ? dataArray[i].name : "";
            const eName = rawName ? rawName : `EXTRA F${i+1}`;
            const isSelected = currentlySelectedExtras.includes(i);
            const eBtn = document.createElement('button');
            eBtn.className = 'btn-connect';
            eBtn.style.cssText = `background: ${isSelected? '#03a9f4':'#333'}; min-height: 72px; width: 100%; padding: 6px 4px; display: flex; flex-direction: column; align-items: center; justify-content: center; margin: 0; font-size: 9px; line-height: 1.1; border: 1px solid ${isSelected? '#0288d1':'#444'}; color: ${isSelected? '#fff':'#888'}; text-transform: uppercase; word-break: break-word; border-radius: 8px;`;
            eBtn.innerHTML = `<span style="font-size:7px; opacity:0.5; margin-bottom:2px;">F${i+1}</span><span style="font-weight:bold; text-align:center;">${eName}</span>`;
            eBtn.onclick = () => {
                const idx = allSlotsConfig[slotKey].extras.indexOf(i);
                if (idx === -1) { 
                    allSlotsConfig[slotKey].extras.push(i); 
                } else { 
                    allSlotsConfig[slotKey].extras.splice(idx, 1); 
                }
                renderUI(slotIndex);
            };
            grid.appendChild(eBtn);
        }
    }

    // 3. Salva Configurações do IP Global e das Ações Individuais no JSON do preset
    async function onSave() {
        try {
            const ipVal = document.getElementById('lumiIp');
            if (ipVal) allSlotsConfig.globalHost.ip = ipVal.value.trim() || '127.0.0.1';
            const portVal = document.getElementById('lumiPort');
            if (portVal) allSlotsConfig.globalHost.port = parseInt(portVal.value) || 5000;

            await fetch(`/api/macros/config/${ID}?preset=${getPreset()}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(allSlotsConfig)
            });
            document.getElementById('macroSettingsModal').style.display = 'none';
        } catch (e) { alert("Erro ao salvar Lumikit settings."); }
    }

    // 4. Limpeza de seleção
    async function onClear(slotIndex) {
        const slotKey = `slot_${slotIndex}`;
        if (allSlotsConfig[slotKey]) {
            allSlotsConfig[slotKey].scenes = [];
            allSlotsConfig[slotKey].extras = [];
            renderUI(slotIndex);
        }
    }

    // 5. Deleção Limpa
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

    // Registra e assina o plugin
    window.registerMacro(ID, {
        name: "Lumikit", color: "#ff5722",
        execute, onConfigure, onSave, onClear, onDelete
    });
})();
