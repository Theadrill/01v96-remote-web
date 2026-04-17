/**
 * MOD: LUMIKIT SCENE AND EXTRAS (Master Blaster Edition - UNIFIED)
 * Envia comandos HTTP GET diretos para o web server local da Lumikit.
 * Agora integrado 100% no Profile principal.
 */
(function () {
    const ID = "lumikit";
    let internalSlotConfig = {}; // Temporário para a UI de edição

    // 1. Execução (Recebe config do slot e config global do plugin)
    async function execute(slotIndex, slotConfig, globalConfig) {
        const actions = slotConfig || { scenes: [], extras: [] };
        const host = globalConfig || { ip: '127.0.0.1', port: 5000 };
        const baseUrl = `http://${host.ip}:${host.port}`;

        // Executa todas cenas ativadas no slot
        if (actions.scenes && actions.scenes.length > 0) {
            for (let scene of actions.scenes) {
                try {
                    let p = 0; let s = scene;
                    if (typeof scene === 'string' && scene.includes(':')) {
                        const parts = scene.split(':');
                        p = parseInt(parts[0]); s = parseInt(parts[1]);
                    }
                    // Usa a Proxy API para evitar CORS
                    MixerAPI.network.fetch(`${baseUrl}/services/edmx_change_scene/${p}/${s}`, { mode: 'no-cors' });
                } catch (e) { }
            }
        }

        // Delay para toggle de extras
        setTimeout(async () => {
            if (actions.extras && actions.extras.length > 0) {
                let efStatus = [];
                try {
                    const stRes = await MixerAPI.network.fetch(`${baseUrl}/services/main_get_ef_status`);
                    // Ajuste: O Proxy retorna { status, data }, e o Lumikit retorna { data: [...] }
                    if (stRes && stRes.data && stRes.data.data && stRes.data.data[0] && stRes.data.data[0].items) {
                        efStatus = stRes.data.data[0].items;
                    } else {
                        console.warn("[LUMIKIT DEBUG] Estrutura de status desconhecida:", stRes);
                    }
                } catch (err) { console.error("[LUMIKIT] Erro na checagem de status:", err); }

                for (let extra of actions.extras) {
                    try {
                        const item = efStatus[extra] || {};
                        let isActive = (String(item.active) === "true");

                        console.log(`[LUMIKIT DEBUG] Item F${extra + 1}:`, item);
                        console.log(`[LUMIKIT DEBUG] Status Final: ${isActive ? 'ON' : 'OFF'}. Enviando: ${isActive ? 'liberar' : 'pressionar'}`);

                        const actionType = isActive ? "release" : "press";
                        await MixerAPI.network.fetch(`${baseUrl}/services/main_${actionType}_ef/${extra}`, { mode: 'no-cors' });
                    } catch (e) { console.error("[LUMIKIT] Falha ao alternar extra:", e); }
                }
            }
        }, 100);
    }

    // 2. Configuração
    let currentCenasP1 = [];
    let currentCenasP2 = [];
    let currentExtras = [];
    let activeGlobalConfig = {};

    async function onConfigure(slotIndex, slotConfig, globalConfig) {
        // Garante a estrutura correta igual ao Toggler
        internalSlotConfig = {
            scenes: (slotConfig && Array.isArray(slotConfig.scenes)) ? [...slotConfig.scenes] : [],
            extras: (slotConfig && Array.isArray(slotConfig.extras)) ? [...slotConfig.extras] : []
        };
        activeGlobalConfig = JSON.parse(JSON.stringify(globalConfig || { ip: '127.0.0.1', port: 5000 }));

        const grid = document.getElementById('macroSettingsGrid');
        const title = document.getElementById('settingsMacroTitle');
        if (!grid) return;

        console.log(`[LUMIKIT] Abrindo config slot ${slotIndex} com:`, internalSlotConfig);

        title.innerText = `Configurar Lumikit - Slot ${slotIndex + 1}`;
        grid.innerHTML = '<p style="grid-column: 1 / -1; color:#666; font-size:11px; text-align:center; width:100%;">Preparando dados...</p>';

        async function fetchLumikitData(syncMode = false) {
            if (syncMode) {
                const ipInput = document.getElementById('lumiIp');
                const portInput = document.getElementById('lumiPort');
                if (ipInput) activeGlobalConfig.ip = ipInput.value.trim() || '127.0.0.1';
                if (portInput) activeGlobalConfig.port = parseInt(portInput.value) || 5000;
            }

            const baseUrl = `http://${activeGlobalConfig.ip}:${activeGlobalConfig.port}`;
            let passCounter = 0;
            const checkRender = () => { passCounter++; if (passCounter >= 3) renderUI(slotIndex); };

            MixerAPI.network.fetch(`${baseUrl}/services/edmx_get_scenes_status/0`).then(d => {
                console.log("[LUMIKIT DEBUG] Resposta Cenas P1:", d);
                if (d && d.data && Array.isArray(d.data.data)) {
                    currentCenasP1 = d.data.data;
                }
                checkRender();
            }).catch(checkRender);

            MixerAPI.network.fetch(`${baseUrl}/services/edmx_get_scenes_status/1`).then(d => {
                console.log("[LUMIKIT DEBUG] Resposta Cenas P2:", d);
                if (d && d.data && Array.isArray(d.data.data)) {
                    currentCenasP2 = d.data.data;
                }
                checkRender();
            }).catch(checkRender);

            MixerAPI.network.fetch(`${baseUrl}/services/main_get_ef_status`).then(d => {
                if (d && d.data && d.data.data && d.data.data[0]) currentExtras = d.data.data[0].items;
                checkRender();
            }).catch(checkRender);

            setTimeout(() => { if (passCounter < 3) { passCounter = 99; renderUI(slotIndex); } }, 3000);
        }

        fetchLumikitData(false);
    }

    function renderUI(slotIndex) {
        const grid = document.getElementById('macroSettingsGrid');
        if (!grid) return;

        grid.innerHTML = `
            <div style="grid-column: 1 / -1; width:100%; display:flex; flex-direction:column; gap:10px; margin-bottom:15px; background:rgba(0,0,0,0.4); padding:15px; border-radius:10px; box-sizing: border-box;">
                <span style="font-size:11px; color:#aaa; font-weight:bold; letter-spacing:1px;">LUMIKIT HOST (Global)</span>
                <div style="display:flex; flex-wrap:wrap; gap:10px; width:100%;">
                    <input type="text" id="lumiIp" value="${activeGlobalConfig.ip}" placeholder="IP" style="flex:2; min-width:120px; background:#222; border:1px solid #444; color:#fff; padding:10px; border-radius:8px; font-size:14px; outline:none; box-sizing:border-box;">
                    <input type="number" id="lumiPort" value="${activeGlobalConfig.port}" placeholder="Porta" style="flex:1; min-width:70px; background:#222; border:1px solid #444; color:#fff; padding:10px; border-radius:8px; font-size:14px; outline:none; box-sizing:border-box;">
                    <button id="lumiSyncBtn" style="flex:1; min-width:80px; background:#444; color:#fff; border:none; border-radius:8px; padding:10px; font-size:13px; font-weight:bold; cursor:pointer; text-transform:uppercase;">SYNC</button>
                </div>
            </div>
        `;

        document.getElementById('lumiSyncBtn').onclick = () => onConfigure(slotIndex, internalSlotConfig, activeGlobalConfig);

        renderSec(grid, "CENAS - PÁGINA 1", "#ff5722");
        renderBtns(grid, slotIndex, 0, currentCenasP1);
        renderSec(grid, "CENAS - PÁGINA 2", "#ffc107");
        renderBtns(grid, slotIndex, 1, currentCenasP2);
        renderSec(grid, "FUNÇÕES EXTRAS", "#03a9f4");
        renderExtraBtns(grid, slotIndex, currentExtras);
    }

    function renderSec(grid, label, color) {
        const h = document.createElement('div');
        h.style.cssText = `grid-column: 1 / -1; width:100%; border-bottom: 1px solid #444; margin: 15px 0 5px; padding-bottom: 5px;`;
        h.innerHTML = `<span style="font-size:12px; font-weight:bold; color:${color};">${label}</span>`;
        grid.appendChild(h);
    }

    function renderBtns(grid, slotIdx, page, data) {
        const sel = internalSlotConfig.scenes || [];
        const items = data || [];
        const count = items.length > 0 ? items.length : 16;
        for (let i = 0; i < count; i++) {
            const val = `${page}:${i}`;
            const isSel = sel.includes(val);
            const name = items[i] ? items[i].name : `CENA ${i + 1}`;
            const btn = document.createElement('button');
            btn.className = 'btn-connect';
            btn.style.cssText = `background:${isSel ? '#ff5722' : '#333'}; min-height:60px; border-radius:8px; font-size:10px; border:1px solid ${isSel ? '#fff' : '#444'}; color:${isSel ? '#fff' : '#888'};`;
            btn.innerHTML = `<span>${name}</span>`;
            btn.onclick = () => { internalSlotConfig.scenes = isSel ? [] : [val]; renderUI(slotIdx); };
            grid.appendChild(btn);
        }
    }

    function renderExtraBtns(grid, slotIdx, data) {
        const sel = internalSlotConfig.extras || [];
        const items = data || [];
        const count = items.length > 0 ? items.length : 16;
        for (let i = 0; i < count; i++) {
            const isSel = sel.includes(i);
            const name = items[i] ? items[i].name : `EXTRA F${i + 1}`;
            const btn = document.createElement('button');
            btn.className = 'btn-connect';
            btn.style.cssText = `background:${isSel ? '#03a9f4' : '#333'}; min-height:60px; border-radius:8px; font-size:10px; border:1px solid ${isSel ? '#fff' : '#444'}; color:${isSel ? '#fff' : '#888'};`;
            btn.innerHTML = `<span>${name}</span>`;
            btn.onclick = () => {
                const idx = internalSlotConfig.extras.indexOf(i);
                if (idx === -1) internalSlotConfig.extras.push(i); else internalSlotConfig.extras.splice(idx, 1);
                renderUI(slotIdx);
            };
            grid.appendChild(btn);
        }
    }

    async function onSave(slotIndex) {
        const ipInput = document.getElementById('lumiIp');
        if (ipInput) activeGlobalConfig.ip = ipInput.value.trim();
        const portInput = document.getElementById('lumiPort');
        if (portInput) activeGlobalConfig.port = parseInt(portInput.value);

        await MixerAPI.saveConfig(ID, slotIndex, internalSlotConfig, activeGlobalConfig);
        document.getElementById('macroSettingsModal').style.display = 'none';
    }

    async function onClear(slotIndex) {
        internalSlotConfig = { scenes: [], extras: [] };
        renderUI(slotIndex);
    }

    async function onDelete(slotIndex) {
        await MixerAPI.saveConfig(ID, slotIndex, null);
    }

    window.registerMacro(ID, {
        name: "Lumikit", color: "#ff5722",
        execute, onConfigure, onSave, onClear, onDelete
    });
})();
