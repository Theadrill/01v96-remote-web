/**
 * MOTOR DE MODS / MACROS - 01V96 LIVE SAFE
 * Versão Multi-Preset Unificado (Centralized slots.json)
 */

const TOTAL_SLOTS = 12;
let macroDatabase = {};
let assignedMacros = {};
let activeSlotIndex = null;
let longPressTimer = null;
let availableScripts = [];
let currentPreset = 'default';
let protectedPresets = ['default']; // Lista de nomes que não podem ser deletados
let isMovingMacro = false;
let moveSourceIndex = -1;

async function initMacros() {
    await detectCurrentPreset();
    await fetchProtectedPresets(); // Carrega lista de hosts do servidor
    await refreshAvailableScripts();
    await loadGlobalSlotsManifest();
    renderMacros();
    loadExternalScripts();
}

async function detectCurrentPreset() {
    try {
        const res = await fetch('/api/macros/hosts');
        const hosts = await res.json() || [];
        const currentUrl = window.location.href.toLowerCase();
        const hostname = window.location.hostname.toLowerCase();
        let found = 'default';
        for (const h of hosts) {
            if (Array.isArray(h.matches) && h.matches.some(m => currentUrl.includes(m.toLowerCase()) || hostname === m.toLowerCase())) {
                found = h.preset; break;
            }
        }
        // Primeiro, tenta restaurar o último preset usado no navegador
        const saved = localStorage.getItem('macro_last_preset');
        if (saved) {
            currentPreset = saved;
        } else {
            currentPreset = found;
        }

        // Carrega o estado do Auto-Sync do LocalStorage
        const syncState = localStorage.getItem(`macro_sync_shared_${currentPreset}`) === 'true';
        const chk = document.getElementById('chkSharedSync');
        if (chk) chk.checked = syncState;

        /**
         * FIXME: [FUTURE UI IMPLEMENTATION]
         * Se o Auto-Sync estiver ligado mas o Git falhar no check (server-side),
         * devemos desabilitar o checkbox e mostrar um botão 'LOGIN GITHUB / SETUP'.
         */

        updatePresetUI();
    } catch (e) { currentPreset = 'default'; updatePresetUI(); }
}

window.toggleSharedSync = async function(enabled) {
    // Persist UI state first
    localStorage.setItem(`macro_sync_shared_${currentPreset}`, enabled);
    console.log(`☁️ Auto-Sync Shared para [${currentPreset}]: ${enabled ? 'ON' : 'OFF'}`);

    // If enabling, ensure current preset is saved and trigger sync
    if (enabled) {
        try {
            await saveGlobalSlotsManifest();
            const resp = await fetch(`/api/macros/sync?preset=${encodeURIComponent(currentPreset)}`, { method: 'POST' });
            if (!resp.ok) {
                const err = await resp.json().catch(() => ({}));
                console.warn('⚠️ Falha ao iniciar sync:', err);
            } else {
                console.log('☁️ Sync iniciado para preset', currentPreset);
            }
        } catch (e) { console.warn('⚠️ Erro ao salvar ou iniciar sync:', e); }
        return;
    }

    // If disabling, show confirmation modal before removing remote preset
    const chk = document.getElementById('chkSharedSync');
    // Re-check checkbox visually until user confirms or cancels
    if (chk) chk.checked = true;
    const modal = document.getElementById('macroUnshareConfirmModal');
    const btn = document.getElementById('confirmUnshareBtn');
    if (!modal || !btn) {
        // Fallback: perform unshare immediately
        await performUnshare();
        return;
    }

    modal.style.display = 'flex';
    const cancelBtn = document.getElementById('cancelUnshareBtn');
    const onConfirm = async () => {
        cleanup();
        await performUnshare();
    };
    const onCancel = () => {
        cleanup();
        // restore checkbox to checked state
        if (chk) chk.checked = true;
    };
    function cleanup() {
        try { btn.removeEventListener('click', onConfirm); } catch(e){}
        try { cancelBtn.removeEventListener('click', onCancel); } catch(e){}
        modal.style.display = 'none';
    }
    btn.addEventListener('click', onConfirm);
    if (cancelBtn) cancelBtn.addEventListener('click', onCancel);
};

async function performUnshare() {
    try {
        const resp = await fetch(`/api/macros/sync?preset=${encodeURIComponent(currentPreset)}`, { method: 'DELETE' });
        if (!resp.ok) {
            const err = await resp.json().catch(() => ({}));
            console.warn('⚠️ Falha ao remover preset remoto:', err);
            alert('Falha ao remover preset remoto. Verifique os logs do servidor.');
            return;
        }
        // Update UI/localStorage
        localStorage.setItem(`macro_sync_shared_${currentPreset}`, 'false');
        const chk = document.getElementById('chkSharedSync'); if (chk) chk.checked = false;
        console.log('☁️ Preset removido da nuvem e agora apenas local.');
    } catch (e) {
        console.warn('⚠️ Erro ao chamar API de remoção:', e);
        alert('Erro ao comunicar com o servidor para remover o preset.');
    }
}

function updatePresetUI() {
    const label = document.getElementById('currentPresetLabel');
    if (label) {
        label.innerText = `PRESET: ${currentPreset.toUpperCase()}`;
        label.style.color = currentPreset === 'default' ? '#666' : '#00e676';
    }
}

// 1. Abre a lista de presets salvos no slots.json para escolha manual
window.openPresetPicker = async function () {
    const list = document.getElementById('macroPresetList');
    list.innerHTML = '<p style="color:#666; font-size:11px; text-align:center;">Buscando chaves...</p>';
    document.getElementById('macroPresetModal').style.display = 'flex';

    try {
        const res = await fetch('/api/macros/slots');
        const data = await res.json() || {};
        const keys = Object.keys(data);
        list.innerHTML = '';

        keys.forEach(key => {
            const container = document.createElement('div');
            container.style.cssText = 'display:flex; gap:5px; align-items:center;';

            const btn = document.createElement('button');
            btn.className = 'btn-connect';
            btn.style.cssText = `background:${key === currentPreset ? '#00c853' : '#333'}; height:45px; margin:0; flex: 8; overflow:hidden; text-overflow:ellipsis;`; // 80% aprox
            btn.innerText = key.toUpperCase();
            btn.onclick = () => switchPreset(key);

            container.appendChild(btn);

            // Botão de deletar (DELETAR) - não permite deletar o default
            if (key !== 'default') {
                const delBtn = document.createElement('button');
                delBtn.className = 'btn-connect';
                delBtn.style.cssText = 'background:#c62828; flex: 2; height:45px; margin:0; font-weight:bold; font-size:9px; letter-spacing: 0.5px;'; // 20% aprox
                delBtn.innerText = 'DELETAR';
                delBtn.onclick = (e) => { e.stopPropagation(); askDeletePreset(key); };
                container.appendChild(delBtn);
            }

            list.appendChild(container);
        });
    } catch (e) { list.innerHTML = '<p style="color:red;">Falha ao ler slots.json</p>'; }
}

async function fetchProtectedPresets() {
    try {
        const res = await fetch('/api/macros/hosts');
        const hosts = await res.json() || [];
        protectedPresets = ['default', ...hosts.map(h => h.preset)];
    } catch (e) { protectedPresets = ['default']; }
}

let presetToDelete = null;
function askDeletePreset(name) {
    presetToDelete = name;
    const isProtected = protectedPresets.includes(name);

    const confirmBtn = document.querySelector('#macroDeleteConfirmModal .btn-connect');
    const modalText = document.getElementById('deleteConfirmText');

    if (isProtected) {
        modalText.innerText = `Impossível deletar preset padrão gerado automaticamente [${name.toUpperCase()}]`;
        if (confirmBtn) confirmBtn.style.display = 'none';
    } else {
        modalText.innerText = `Deseja deletar o preset [${name.toUpperCase()}]?`;
        if (confirmBtn) confirmBtn.style.display = 'flex';
    }

    document.getElementById('macroDeleteConfirmModal').style.display = 'flex';
}

window.confirmDeletePreset = async function () {
    if (!presetToDelete) return;
    try {
        const res = await fetch(`/api/macros/slots?preset=${presetToDelete}`, { method: 'DELETE' });
        if (res.ok) {
            console.log(`🗑️ Preset [${presetToDelete}] deletado.`);
            document.getElementById('macroDeleteConfirmModal').style.display = 'none';
            if (currentPreset === presetToDelete) currentPreset = 'default';
            openPresetPicker(); // Atualiza a lista
        }
    } catch (e) { alert("Erro ao deletar preset."); }
};

async function switchPreset(newPreset) {
    currentPreset = newPreset;
    // Persiste localmente para restaurar após refresh
    try { localStorage.setItem('macro_last_preset', currentPreset); } catch (e) {}
    
    // Atualiza o checkbox de sync para o novo preset carregado
    const syncState = localStorage.getItem(`macro_sync_shared_${currentPreset}`) === 'true';
    const chk = document.getElementById('chkSharedSync');
    if (chk) chk.checked = syncState;

    document.getElementById('macroPresetModal').style.display = 'none';
    updatePresetUI();
    console.log(`🚀 Trocando para Preset: ${currentPreset}`);
    await loadGlobalSlotsManifest();
    renderMacros();
    loadExternalScripts();
}

window.openSaveAsModal = function () {
    document.getElementById('inputNewPresetName').value = '';
    document.getElementById('macroSaveAsModal').style.display = 'flex';
    setTimeout(() => document.getElementById('inputNewPresetName').focus(), 100);
}

window.savePresetAs = async function () {
    const newName = document.getElementById('inputNewPresetName').value.trim().toLowerCase();
    if (!newName) return;

    currentPreset = newName;
    await saveGlobalSlotsManifest(); // Salva o set atual de macros no novo preset

    // Persiste localmente o preset criado
    try { localStorage.setItem('macro_last_preset', currentPreset); } catch (e) {}

    document.getElementById('macroSaveAsModal').style.display = 'none';
    updatePresetUI();
    console.log(`💾 Preset [${newName}] criado e salvo.`);
    renderMacros();
}

async function refreshAvailableScripts() {
    try {
        const res = await fetch('/api/macros');
        availableScripts = await res.json() || [];
    } catch (e) { availableScripts = []; }
}

async function loadGlobalSlotsManifest() {
    try {
        const res = await fetch(`/api/macros/slots?preset=${currentPreset}`);
        const data = await res.json() || {};
        
        // Separa os slots da configuração global embutida
        globalMacroConfig = data.globalConfig || {};
        assignedMacros = {};
        Object.keys(data).forEach(k => {
            if (k !== 'globalConfig') {
                assignedMacros[k] = (typeof data[k] === 'string') ? { scriptId: data[k], name: `MACRO ${parseInt(k) + 1}` } : data[k];
            }
        });
        console.log(`✅ [MACROS] Profile [${currentPreset}] carregado: ${Object.keys(assignedMacros).length} botões.`);
    } catch (e) {
        assignedMacros = {};
        globalMacroConfig = {};
        console.error("Erro ao carregar manifesto de slots:", e);
    }
}

async function saveGlobalSlotsManifest() {
    try {
        const syncShared = localStorage.getItem(`macro_sync_shared_${currentPreset}`) === 'true';
        // Pacote unificado para salvar
        const payload = { ...assignedMacros, globalConfig: globalMacroConfig };
        await fetch(`/api/macros/slots?preset=${currentPreset}&syncShared=${syncShared}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        console.log("💾 Profile salvo com sucesso!");
    } catch (e) { console.error("Erro ao salvar slots"); }
}

// Helper global para que os mods salvem suas configurações de volta no profile principal
window.MixerAPI.saveConfig = async function(modId, slotIndex, config, globalConfig = null) {
    if (assignedMacros[slotIndex]) {
        assignedMacros[slotIndex].config = config;
    }
    if (globalConfig) {
        globalMacroConfig[modId] = globalConfig;
    }
    await saveGlobalSlotsManifest();
    renderMacros(); // Força re-render para atualizar os botões
};

// ... Restante das funções de ciclo de vida (vão continuar as mesmas)
function loadExternalScripts() {
    const scriptsToLoad = [...new Set(Object.values(assignedMacros).map(m => m.scriptId))];
    for (const id of scriptsToLoad) { if (availableScripts.includes(id)) loadMacroScript(id); }
}
function loadMacroScript(id) {
    if (!id || !availableScripts.includes(id) || document.getElementById(`script-macro-${id}`)) return;
    const script = document.createElement('script'); script.id = `script-macro-${id}`;
    script.src = `modules/macros/${id}.js`; document.body.appendChild(script);
}
function renderMacros() {
    const grid = document.getElementById('macroSlotsGrid'); if (!grid) return; grid.innerHTML = '';
    for (let i = 0; i < TOTAL_SLOTS; i++) {
        const slotData = assignedMacros[i];
        if (slotData && !availableScripts.includes(slotData.scriptId)) { delete assignedMacros[i]; saveGlobalSlotsManifest(); continue; }
        const config = slotData ? macroDatabase[slotData.scriptId] : null;
        const slot = document.createElement('div'); slot.className = 'macro-slot';
        const slotColor = (slotData && slotData.color) ? slotData.color : (config ? (config.color || '#4a148c') : '#222');
        const defaultBorder = `2px solid ${config ? 'rgba(255,255,255,0.2)' : '#333'}`;
        const isBlinking = (isMovingMacro && i === moveSourceIndex);
        const animCss = isBlinking ? `animation: blink 1s infinite; border: 2px dashed #00ffcc; opacity:0.8;` : `border: ${defaultBorder};`;
        slot.style.cssText = `height: 85px; min-width: 0; box-sizing: border-box; border-radius: 12px; background: ${slotColor}; ${animCss} display: flex; flex-direction: column; align-items: center; justify-content: center; cursor: pointer; position: relative; user-select: none; -webkit-user-select: none; transition: transform 0.1s; padding: 5px; text-align: center; overflow: hidden;`;
        if (slotData && config) {
            const displayName = slotData.name || `MACRO ${i + 1}`; const modName = config.name || slotData.scriptId;
            slot.innerHTML = `<span style="font-size: 11px; font-weight: 800; color: white; display: block; margin-bottom: 3px; line-height: 1.1; max-width: 100%; word-break: break-word; overflow-wrap: break-word;">${displayName.toUpperCase()}</span><span style="font-size: 8px; color: rgba(255,255,255,0.5); text-transform: uppercase; letter-spacing: 0.5px; max-width: 100%; word-break: break-word; overflow-wrap: break-word;">${modName}</span>`;
        } else { slot.innerHTML = `<span style="font-size: 24px; color: #444;">+</span>`; }

        slot.onpointerdown = (e) => handleTouchStart(i, e);
        slot.onpointerup = (e) => handleTouchEnd(i, e);
        slot.onpointerleave = (e) => { if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null; e.currentTarget.style.transform = 'scale(1)'; } };
        slot.onpointercancel = (e) => { if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null; e.currentTarget.style.transform = 'scale(1)'; } };
        slot.oncontextmenu = (e) => { e.preventDefault(); return false; };

        grid.appendChild(slot);
    }
}
function handleTouchStart(index, e) {
    activeSlotIndex = index; const el = e.currentTarget;
    if (el) { el.style.transform = 'scale(0.92)'; el.style.transition = 'transform 0.1s'; }
    if (isMovingMacro) return; // Prevent long press context menu while moving
    longPressTimer = setTimeout(() => { showContextMenu(index); longPressTimer = null; if (el) el.style.transform = 'scale(1)'; }, 500);
}
function handleTouchEnd(index, e) {
    const el = e.currentTarget; if (el) el.style.transform = 'scale(1)';

    let wasLongPress = (longPressTimer === null);
    if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null; }

    if (isMovingMacro) {
        completeMacroMove(index);
        return;
    }

    // Apenas executar a macro se o toque foi rápido (não foi um long press)
    if (!wasLongPress) {
        const sd = assignedMacros[index];
        if (sd && availableScripts.includes(sd.scriptId) && macroDatabase[sd.scriptId]) executeMacro(sd.scriptId, index);
        else openLibrary(index);
    }
}

function startMovingMacro() {
    isMovingMacro = true;
    moveSourceIndex = activeSlotIndex;
    document.getElementById('macroContextModal').style.display = 'none';

    const modal = document.getElementById('macrosModal');
    const warning = document.createElement('div');
    warning.id = 'moveMacroWarning';
    warning.style.cssText = 'position:absolute; top:0; left:0; width:100%; min-height:40px; background:#1976d2; color:white; display:flex; align-items:center; justify-content:center; font-weight:bold; z-index:99999; text-transform:uppercase; font-size:12px; letter-spacing:1px; box-shadow: 0 4px 10px rgba(0,0,0,0.5); padding:10px; box-sizing:border-box; text-align:center; border-radius: 12px 12px 0 0;';
    warning.innerHTML = '👉 TOQUE NO NOVO ESPAÇO PARA MOVER';

    const modalContent = modal.querySelector('.modal-content');
    modalContent.style.position = 'relative';
    modalContent.appendChild(warning);

    if (!document.getElementById('blinkStyleAnim')) {
        const style = document.createElement('style');
        style.id = 'blinkStyleAnim';
        style.innerHTML = `@keyframes blink { 0% { opacity: 1; } 50% { opacity: 0.3; } 100% { opacity: 1; } }`;
        document.head.appendChild(style);
    }

    renderMacros();
}

async function completeMacroMove(targetIndex) {
    isMovingMacro = false;
    const fromIndex = moveSourceIndex;
    moveSourceIndex = -1;

    const warning = document.getElementById('moveMacroWarning');
    if (warning) warning.remove();

    if (fromIndex !== targetIndex && !isNaN(fromIndex) && fromIndex !== -1) {
        // Optimistic visual block update
        const t = assignedMacros[fromIndex];
        assignedMacros[fromIndex] = assignedMacros[targetIndex];
        assignedMacros[targetIndex] = t;
        if (!assignedMacros[fromIndex]) delete assignedMacros[fromIndex];
        if (!assignedMacros[targetIndex]) delete assignedMacros[targetIndex];
        renderMacros();

        try {
            await fetch(`/api/macros/swap?preset=${currentPreset}`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ from: fromIndex, to: targetIndex })
            });
            await loadSlotsManifest();
        } catch (err) { console.error("Erro no move touch", err); }
    } else {
        renderMacros();
    }
}
function executeMacro(id, slotIndex) {
    const macroPlugin = macroDatabase[id];
    if (macroPlugin && macroPlugin.execute) {
        const slotData = assignedMacros[slotIndex] || {};
        const slotConfig = slotData.config || {};
        const gConfig = globalMacroConfig[id] || {};
        
        macroPlugin.execute(slotIndex, slotConfig, gConfig);

        const modal = document.getElementById('macrosModal');
        modal.style.boxShadow = `0 0 30px ${macroPlugin.color || '#6a1b9a'}`;
        setTimeout(() => modal.style.boxShadow = '', 200);
    }
}
async function openLibrary(index) {
    activeSlotIndex = index; await refreshAvailableScripts(); const list = document.getElementById('macroLibraryList'); list.innerHTML = ''; document.getElementById('macroLibraryModal').style.display = 'flex';
    availableScripts.forEach(id => {
        const btn = document.createElement('button'); btn.className = 'btn-connect'; btn.style.cssText = 'background:#222; border:1px solid #333; margin-bottom:5px; text-align:left; padding-left:15px;';
        btn.innerHTML = `<span style="color:#6a1b9a; font-weight:bold;">MOD:</span> ${id.toUpperCase()}`; btn.onclick = () => selectMacroFromLibrary(id); list.appendChild(btn);
    });
}
function selectMacroFromLibrary(id) { assignedMacros[activeSlotIndex] = { scriptId: id, name: `MACRO ${activeSlotIndex + 1}` }; saveGlobalSlotsManifest(); loadMacroScript(id); document.getElementById('macroLibraryModal').style.display = 'none'; renderMacros(); }
function showContextMenu(index) {
    const sd = assignedMacros[index]; if (!sd) return;
    activeSlotIndex = index;
    document.getElementById('ctxMacroName').innerText = sd.name;
    const picker = document.getElementById('macroColorPicker');
    const config = macroDatabase[sd.scriptId];
    if (picker) picker.value = sd.color || (config ? config.color || '#6a1b9a' : '#6a1b9a');
    document.getElementById('macroContextModal').style.display = 'flex';
}
window.openMacroNameEditor = function () {
    const sd = assignedMacros[activeSlotIndex]; if (!sd) return;
    document.getElementById('inputMacroName').value = sd.name; document.getElementById('macroContextModal').style.display = 'none'; document.getElementById('macroNameEditorModal').style.display = 'flex'; setTimeout(() => document.getElementById('inputMacroName').focus(), 100);
};
window.saveMacroName = async function () {
    const nn = document.getElementById('inputMacroName').value.trim();
    if (nn && assignedMacros[activeSlotIndex]) { assignedMacros[activeSlotIndex].name = nn; await saveGlobalSlotsManifest(); renderMacros(); }
    document.getElementById('macroNameEditorModal').style.display = 'none';
};
window.saveMacroColor = async function (colorHex) {
    if (activeSlotIndex !== null && assignedMacros[activeSlotIndex]) {
        assignedMacros[activeSlotIndex].color = colorHex;
        await saveGlobalSlotsManifest();
        renderMacros();
    }
    document.getElementById('macroContextModal').style.display = 'none';
};
window.changeSelectedMacro = function () { document.getElementById('macroContextModal').style.display = 'none'; openLibrary(activeSlotIndex); };
window.openMacroSettings = function () {
    const sd = assignedMacros[activeSlotIndex]; if (!sd) return;
    const config = macroDatabase[sd.scriptId];
    if (config && typeof config.onConfigure === 'function') {
        document.getElementById('macroContextModal').style.display = 'none';
        document.getElementById('macroSettingsModal').style.display = 'flex';

        // Garante que os botÃµes SALVAR e LIMPAR executem as funÃ§Ãµes centralizadas
        const saveBtn = document.getElementById('btnMacroSave');
        if (saveBtn) saveBtn.onclick = () => window.saveCurrentMacroSettings();

        const clearBtn = document.getElementById('btnMacroClear');
        if (clearBtn) clearBtn.onclick = () => window.clearCurrentMacroSettings();

        const slotConfig = sd.config || {};
        const gConfig = globalMacroConfig[sd.scriptId] || {};
        config.onConfigure(activeSlotIndex, slotConfig, gConfig);
    }
};
window.saveCurrentMacroSettings = function () {
    // Suporte especial para o MACRO FADER (que não é via plugin/slot)
    const title = document.getElementById('settingsMacroTitle');
    if (title && title.innerText.includes("MACRO FADER")) {
        if (typeof saveMacroChannels === 'function') saveMacroChannels();
        document.getElementById('macroSettingsModal').style.display = 'none';
        if (typeof renderMacroFader === 'function') renderMacroFader();
        return;
    }

    const sd = assignedMacros[activeSlotIndex]; if (!sd) return; const config = macroDatabase[sd.scriptId];
    if (config && typeof config.onSave === 'function') {
        config.onSave(activeSlotIndex);
    } else {
        document.getElementById('macroSettingsModal').style.display = 'none';
    }
};

window.clearCurrentMacroSettings = function () {
    // Suporte especial para o MACRO FADER
    const title = document.getElementById('settingsMacroTitle');
    if (title && title.innerText.includes("MACRO FADER")) {
        if (typeof clearMacroSelection === 'function') clearMacroSelection();
        return;
    }

    const sd = assignedMacros[activeSlotIndex]; if (!sd) return; const config = macroDatabase[sd.scriptId];
    if (config && typeof config.onClear === 'function') {
        config.onClear(activeSlotIndex);
    }
};
async function removeMacroFromSlot() {
    if (activeSlotIndex !== null) {
        const sd = assignedMacros[activeSlotIndex]; const config = sd ? macroDatabase[sd.scriptId] : null;
        if (config && typeof config.onDelete === 'function') await config.onDelete(activeSlotIndex);
        delete assignedMacros[activeSlotIndex]; await saveGlobalSlotsManifest(); document.getElementById('macroContextModal').style.display = 'none'; renderMacros();
    }
}

window.registerMacro = function (id, config) { macroDatabase[id] = config; renderMacros(); };
// Helper Global para os Mods (scripts externos) saberem qual preset está ativo
window.getCurrentMacroPreset = function () {
    return currentPreset || 'default';
};

document.addEventListener('DOMContentLoaded', initMacros);
window.initMacros = initMacros;
