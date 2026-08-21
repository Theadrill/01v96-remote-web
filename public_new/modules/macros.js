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
let availableManifests = [];
let currentPreset = 'default';
let protectedPresets = ['default']; // Lista de nomes que não podem ser deletados
let isMovingMacro = false;
let moveSourceIndex = -1;

const MACRO_COLOR_PALETTE = [
    '#c62828','#e53935','#ff5722','#f4511e',
    '#ef6c00','#f9a825','#fdd835','#c0ca33',
    '#7cb342','#2e7d32','#00897b','#00acc1',
    '#039be5','#1e88e5','#3949ab','#5e35b1',
    '#8e24aa','#ad1457','#6d4c41','#757575',
    '#f48fb1','#ce93d8','#90caf9','#80cbc4',
    '#a5d6a7','#fff59d','#ffcc80','#ef9a9a',
    '#ffffff','#000000'
];

function isLightColor(hex) {
    const c = hex.replace('#', '');
    const r = parseInt(c.substring(0, 2), 16);
    const g = parseInt(c.substring(2, 4), 16);
    const b = parseInt(c.substring(4, 6), 16);
    return (r * 299 + g * 587 + b * 114) / 1000 > 160;
}

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
    const chk = document.getElementById('chkSharedSync');

    // If disabling, show the 3-option modal (disable only / disable + remove / cancel)
    if (!enabled) {
        console.log(`☁️ Auto-Sync Shared para [${currentPreset}]: OFF`);

        // Re-check checkbox visually until user decides
        if (chk) chk.checked = true;
        
        ConfirmModal.show({
            title: 'Desativar Sincronização?',
            message: 'Este preset ficará apenas neste computador. Escolha como deseja prosseguir:',
            type: 'warning',
            buttons: [
                { label: 'DESATIVAR APENAS', type: 'info', action: 'disableOnly' },
                { label: 'DESATIVAR E REMOVER DA NUVEM', type: 'danger', action: 'disableAndRemove' },
                { label: 'CANCELAR', type: 'secondary', action: 'cancel' }
            ]
        }).then(function(action) {
            if (action === 'disableOnly') {
                applyDisableOnly();
            } else if (action === 'disableAndRemove') {
                applyDisableAndRemove();
            } else {
                cancelDisableSync();
            }
        });

        return;
    }

    console.log(`☁️ Auto-Sync Shared para [${currentPreset}]: ON`);

    // Etapa 1: Pre-flight check de conectividade com a nuvem/Git
    let checkOk = false;
    try {
        const checkResp = await fetch('/api/macros/sync/check').catch(() => null);
        checkOk = !!(checkResp && checkResp.ok);
    } catch (e) { checkOk = false; }
    if (!checkOk) {
        alert('⚠️ Não foi possível conectar ao serviço de nuvem/Git. A sincronização permanece desativada.');
        if (chk) chk.checked = false;
        localStorage.setItem(`macro_sync_shared_${currentPreset}`, 'false');
        return;
    }

    // Etapa 2: Checagem de existência e comparação com o perfil remoto
    let compData = null;
    try {
        const compResp = await fetch(`/api/macros/compare?preset=${encodeURIComponent(currentPreset)}`);
        compData = await compResp.json();
    } catch (e) {
        console.error("Erro ao comparar perfis:", e);
        alert('⚠️ Erro ao verificar a versão do perfil na nuvem. Tente novamente.');
        if (chk) chk.checked = false;
        localStorage.setItem(`macro_sync_shared_${currentPreset}`, 'false');
        return;
    }

    // Caso C: Conflito de perfis -> exibe o modal de comparação
    if (compData && compData.exists_shared && !compData.is_identical) {
        showMacroSyncDiff(compData);
        return;
    }

    // Caso A (primeiro sync) ou Caso B (versões idênticas) -> modal de confirmação
    const isFirstUpload = !(compData && compData.exists_shared);
    openSyncActivationConfirm(isFirstUpload);
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

// Desativa apenas: mantém o preset local, sem tocar na versão da nuvem
window.applyDisableOnly = function () {
    const chk = document.getElementById('chkSharedSync');
    if (chk) chk.checked = false;
    localStorage.setItem(`macro_sync_shared_${currentPreset}`, 'false');
    console.log(`☁️ Sincronização desativada para [${currentPreset}]. Alterações serão apenas locais.`);
};

// Desativa e remove: reabre o modal de remoção da nuvem (lógica já existente)
window.applyDisableAndRemove = async function () {
    const chk = document.getElementById('chkSharedSync');
    if (chk) chk.checked = true;

    const unshareModal = document.getElementById('macroUnshareConfirmModal');
    const btn = document.getElementById('confirmUnshareBtn');
    if (!unshareModal || !btn) {
        // Fallback: perform unshare immediately
        await performUnshare();
        return;
    }

    unshareModal.style.display = 'flex';
    const cancelBtn = document.getElementById('cancelUnshareBtn');
    const onConfirm = async () => {
        cleanup();
        await performUnshare();
    };
    const onCancel = () => {
        cleanup();
        // mantém o estado consistente: sincronização continua ativa
        if (chk) chk.checked = true;
        localStorage.setItem(`macro_sync_shared_${currentPreset}`, 'true');
    };
    function cleanup() {
        try { btn.removeEventListener('click', onConfirm); } catch(e){}
        try { cancelBtn.removeEventListener('click', onCancel); } catch(e){}
        unshareModal.style.display = 'none';
    }
    btn.addEventListener('click', onConfirm);
    if (cancelBtn) cancelBtn.addEventListener('click', onCancel);
};

window.cancelDisableSync = function () {
    const chk = document.getElementById('chkSharedSync');
    if (chk) chk.checked = true;
    localStorage.setItem(`macro_sync_shared_${currentPreset}`, 'true');
    console.log(`☁️ Desativação cancelada para [${currentPreset}]. Sincronização permanece ativa.`);
};

function openSyncActivationConfirm(isFirstUpload) {
    var message = isFirstUpload
        ? 'Este preset ainda não existe na nuvem. O perfil local será enviado para a nuvem e a sincronização será ativada. Deseja continuar?'
        : 'Os perfis local e da nuvem são idênticos. Deseja ativar a sincronização com a nuvem?';
    var confirmText = isFirstUpload ? 'SIM, ENVIAR' : 'SIM, ATIVAR';

    ConfirmModal.show({
        title: 'ATIVAR SINCRONIZAÇÃO',
        message: message,
        type: 'info',
        confirmText: confirmText,
        cancelText: 'CANCELAR'
    }).then(function (ok) {
        if (ok) {
            applySyncActivation();
        } else {
            cancelSyncActivation();
        }
    });
}

window.applySyncActivation = async function () {
    localStorage.setItem(`macro_sync_shared_${currentPreset}`, 'true');
    const chk = document.getElementById('chkSharedSync'); if (chk) chk.checked = true;
    try {
        await saveGlobalSlotsManifest();
        console.log('☁️ Sincronização com a nuvem ativada para o preset', currentPreset);
    } catch (e) {
        console.error('☁️ Erro ao salvar durante ativação da sincronização:', e);
    }
};

window.cancelSyncActivation = function () {
    const chk = document.getElementById('chkSharedSync'); if (chk) chk.checked = false;
    localStorage.setItem(`macro_sync_shared_${currentPreset}`, 'false');
};

function showMacroSyncDiff(compData) {
    renderDiffSummary('diffLocalSummary', compData.local_data || {});
    renderDiffSummary('diffSharedSummary', compData.shared_data || {});
    document.getElementById('macroSyncDiffModal').style.display = 'flex';
}

function renderDiffSummary(containerId, data) {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = '';

    const keys = Object.keys(data).filter(k => k !== 'globalConfig');
    const total = document.createElement('div');
    total.className = 'styled-macroSyncDiffTotal';
    total.innerText = `${keys.length} BOTÃO(ÕES)`;
    container.appendChild(total);

    if (keys.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'styled-macroSyncDiffEmpty';
        empty.innerText = 'Nenhuma macro configurada';
        container.appendChild(empty);
        return;
    }

    keys.sort((a, b) => parseInt(a, 10) - parseInt(b, 10));
    keys.forEach(k => {
        const item = data[k];
        const name = (item && typeof item === 'object' && item.name) ? item.name : `MACRO ${parseInt(k, 10) + 1}`;
        const mod = (item && typeof item === 'object' && item.scriptId) ? item.scriptId : '';
        const row = document.createElement('div');
        row.className = 'styled-macroSyncDiffItem';
        const nameSpan = document.createElement('span');
        nameSpan.className = 'styled-macroSyncDiffItemName';
        nameSpan.innerText = name;
        const modSpan = document.createElement('span');
        modSpan.className = 'styled-macroSyncDiffItemMod';
        modSpan.innerText = mod;
        row.appendChild(nameSpan);
        row.appendChild(modSpan);
        container.appendChild(row);
    });
}

window.uploadLocalToCloud = async function () {
    document.getElementById('macroSyncDiffModal').style.display = 'none';
    localStorage.setItem(`macro_sync_shared_${currentPreset}`, 'true');
    const chk = document.getElementById('chkSharedSync'); if (chk) chk.checked = true;
    try {
        await saveGlobalSlotsManifest();
        console.log('☁️ Perfil local enviado para a nuvem.');
    } catch (e) {
        console.error('☁️ Erro ao enviar perfil local para a nuvem:', e);
    }
};

window.downloadCloudToLocal = async function () {
    const modal = document.getElementById('macroSyncDiffModal');
    try {
        const res = await fetch(`/api/macros/slots?preset=${encodeURIComponent(currentPreset)}&syncShared=true`);
        const data = await res.json() || {};
        globalMacroConfig = data.globalConfig || {};
        assignedMacros = {};
        Object.keys(data).forEach(k => {
            if (k !== 'globalConfig') {
                assignedMacros[k] = (typeof data[k] === 'string') ? { scriptId: data[k], name: `MACRO ${parseInt(k, 10) + 1}` } : data[k];
            }
        });
        await fetch(`/api/macros/slots?preset=${encodeURIComponent(currentPreset)}&syncShared=false`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        localStorage.setItem(`macro_sync_shared_${currentPreset}`, 'true');
        const chk = document.getElementById('chkSharedSync'); if (chk) chk.checked = true;
        if (modal) modal.style.display = 'none';
        renderMacros();
        loadExternalScripts();
        console.log('☁️ Perfil da nuvem baixado para o computador.');
    } catch (e) {
        console.error('☁️ Erro ao baixar perfil da nuvem:', e);
        alert('Erro ao baixar perfil da nuvem. Verifique os logs do servidor.');
    }
};

window.cancelSyncDiff = function () {
    const modal = document.getElementById('macroSyncDiffModal');
    if (modal) modal.style.display = 'none';
    const chk = document.getElementById('chkSharedSync'); if (chk) chk.checked = false;
    localStorage.setItem(`macro_sync_shared_${currentPreset}`, 'false');
};

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

    if (isProtected) {
        ConfirmModal.show({
            title: 'Atenção!',
            message: `Impossível deletar preset padrão gerado automaticamente [<strong>${name.toUpperCase()}</strong>]`,
            type: 'warning',
            showCancel: false,
            confirmText: 'OK'
        });
        return;
    }

    ConfirmModal.show({
        title: 'Atenção!',
        message: `Deseja deletar o preset [<strong>${name.toUpperCase()}</strong>]?`,
        type: 'danger',
        confirmText: 'DELETAR',
        cancelText: 'CANCELAR'
    }).then(function(ok) {
        if (ok) confirmDeletePreset();
    });
}

window.confirmDeletePreset = async function () {
    if (!presetToDelete) return;
    try {
        const res = await fetch(`/api/macros/slots?preset=${presetToDelete}`, { method: 'DELETE' });
        if (res.ok) {
            console.log(`🗑️ Preset [${presetToDelete}] deletado.`);
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
        const data = await res.json() || [];
        availableManifests = data;
        availableScripts = data.map(m => (typeof m === 'object' && m && m.id) ? m.id : m);
    } catch (e) {
        availableManifests = [];
        availableScripts = [];
    }
}

function findManifest(id) {
    if (!id) return null;
    return availableManifests.find(m => ((typeof m === 'object' && m && m.id) ? m.id : m) === id) || null;
}

async function loadGlobalSlotsManifest() {
    try {
        const syncState = localStorage.getItem(`macro_sync_shared_${currentPreset}`) === 'true';
        const res = await fetch(`/api/macros/slots?preset=${currentPreset}&syncShared=${syncState}`);
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
    const manifest = findManifest(id);
    const entry = (manifest && manifest.entry) ? manifest.entry : 'main.js';
    const cacheBust = `?t=${Date.now()}`;
    const script = document.createElement('script');
    script.id = `script-macro-${id}`;
    script.src = (manifest && manifest.entry)
        ? `modules/macros/${id}/${entry}${cacheBust}`
        : `modules/macros/${id}.js${cacheBust}`;
    document.body.appendChild(script);
    if (manifest && manifest.style) {
        if (window.MixerAPI && window.MixerAPI.styles && window.MixerAPI.styles.loadScopedCSS) {
            window.MixerAPI.styles.loadScopedCSS(id, manifest.style);
        }
    }
}
function renderMacros() {
    const grid = document.getElementById('macroSlotsGrid');
    if (!grid) return;
    grid.innerHTML = '';

    for (let i = 0; i < TOTAL_SLOTS; i++) {
        const slotData = assignedMacros[i];
        const config = slotData ? macroDatabase[slotData.scriptId] : null;
        const isMissing = slotData && !availableScripts.includes(slotData.scriptId);

        const slot = document.createElement('div');
        slot.className = 'macro-slot';

        // Determine slot styling
        let slotBg, slotBorder, opacityStyle;
        if (isMissing) {
            slotBg = '#181818';
            opacityStyle = 'opacity: 0.65;';
            slotBorder = 'border: 2px solid #333;';
        } else {
            slotBg = (slotData && slotData.color) ? slotData.color : (config ? (config.color || '#4a148c') : '#222');
            opacityStyle = '';
            const defaultBorder = `2px solid ${config ? 'rgba(255,255,255,0.2)' : '#333'}`;
            const isBlinking = (isMovingMacro && i === moveSourceIndex);
            slotBorder = isBlinking ? 'animation: blink 1s infinite; border: 2px dashed #00ffcc; opacity:0.8;' : `border: ${defaultBorder};`;
        }

        slot.style.cssText = `height: 85px; min-width: 0; box-sizing: border-box; border-radius: 12px; background: ${slotBg}; ${slotBorder} ${opacityStyle} display: flex; flex-direction: column; align-items: center; justify-content: center; cursor: pointer; position: relative; user-select: none; -webkit-user-select: none; transition: transform 0.1s; padding: 5px; text-align: center; overflow: hidden;`;

        if (isMissing) {
            // Missing Macro State: show custom name + scriptId subtitle + MACRO AUSENTE badge
            const displayName = slotData.name || `MACRO ${i + 1}`;
            const modLabel = slotData.scriptId ? slotData.scriptId.toUpperCase() : '';
            slot.innerHTML = `
                <span style="font-size: 11px; font-weight: 800; color: #ccc; display: block; margin-bottom: 2px; line-height: 1.1; max-width: 100%; word-break: break-word; overflow-wrap: break-word;">${displayName.toUpperCase()}</span>
                <span style="font-size: 8px; color: #666; text-transform: uppercase; letter-spacing: 0.5px; max-width: 100%; word-break: break-word; overflow-wrap: break-word; margin-bottom: 4px;">${modLabel}</span>
                <span style="font-size: 9px; font-weight: 700; color: #fff; background: #c62828; padding: 2px 6px; border-radius: 4px; line-height: 1.2;">MACRO AUSENTE</span>
            `;
            // Click disabled for missing macros
            slot.style.cursor = 'not-allowed';
            slot.onpointerdown = null;
            slot.onpointerup = null;
            slot.onpointerleave = null;
            slot.onpointercancel = null;
            slot.oncontextmenu = (e) => { e.preventDefault(); return false; };
        } else if (slotData && config) {
            // Normal configured pad with dyn_status support
            const displayName = slotData.name || `MACRO ${i + 1}`;
            const modName = config.name || slotData.scriptId;
            const light = isLightColor(slotBg);
            const textColor = light ? '#111' : 'white';
            const subColor = light ? 'rgba(0,0,0,0.5)' : 'rgba(255,255,255,0.5)';

            slot.innerHTML = `
                <span style="font-size: 11px; font-weight: 800; color: ${textColor}; display: block; margin-bottom: 2px; line-height: 1.1; max-width: 100%; word-break: break-word; overflow-wrap: break-word;">${displayName.toUpperCase()}</span>
                <span style="font-size: 8px; color: ${subColor}; text-transform: uppercase; letter-spacing: 0.5px; max-width: 100%; word-break: break-word; overflow-wrap: break-word;">${modName}</span>
                <div class="dyn-status" data-slot="${i}" style="font-size: 9px; font-weight: 700; max-width: 100%; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; margin-top: 3px;"></div>
            `;

            slot.onpointerdown = (e) => handleTouchStart(i, e);
            slot.onpointerup = (e) => handleTouchEnd(i, e);
            slot.onpointerleave = (e) => { if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null; e.currentTarget.style.transform = 'scale(1)'; } };
            slot.onpointercancel = (e) => { if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null; e.currentTarget.style.transform = 'scale(1)'; } };
            slot.oncontextmenu = (e) => { e.preventDefault(); return false; };
        } else {
            // Empty slot
            slot.innerHTML = `<span style="font-size: 24px; color: #444;">+</span>`;
            slot.onpointerdown = (e) => handleTouchStart(i, e);
            slot.onpointerup = (e) => handleTouchEnd(i, e);
            slot.onpointerleave = (e) => { if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null; e.currentTarget.style.transform = 'scale(1)'; } };
            slot.onpointercancel = (e) => { if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null; e.currentTarget.style.transform = 'scale(1)'; } };
            slot.oncontextmenu = (e) => { e.preventDefault(); return false; };
        }

        grid.appendChild(slot);
    }

    for (let i = 0; i < TOTAL_SLOTS; i++) {
        const slotData = assignedMacros[i];
        if (slotData && macroDatabase[slotData.scriptId]) {
            const mod = macroDatabase[slotData.scriptId];
            if (typeof mod.onInit === 'function') {
                mod.onInit(i, slotData.config || {});
            }
        }
    }
}

// ============================================================
// Dynamic Pad System (dyn_status, colors, marquee)
// ============================================================

function isLightColorForBg(hex) {
    return isLightColor(hex);
}

function computeDynamicTextBg(slotIndex) {
    const sd = assignedMacros[slotIndex];
    return (sd && sd.color) ? sd.color : '#222';
}

window.setMacroSlotStatus = function(slotIndex, text, options = {}) {
    const grid = document.getElementById('macroSlotsGrid');
    if (!grid) return;
    const slotEl = grid.children[slotIndex];
    if (!slotEl) return;
    const dynEl = slotEl.querySelector('.dyn-status');
    if (!dynEl) return;

    dynEl.textContent = text || '';

    if (options.color) {
        dynEl.style.color = options.color;
    } else if (text) {
        const bg = computeDynamicTextBg(slotIndex);
        const light = isLightColorForBg(bg);
        dynEl.style.color = light ? '#111' : '#fff';
    }

    if (options.backgroundColor) {
        dynEl.style.backgroundColor = options.backgroundColor;
    } else if (text) {
        dynEl.style.backgroundColor = 'rgba(255,255,255,0.1)';
    }

    dynEl.style.borderRadius = '4px';
    dynEl.style.padding = text ? '1px 4px' : '0';

    // Marquee effect for long text
    if (text && text.length > 12) {
        dynEl.style.whiteSpace = 'nowrap';
        dynEl.style.overflow = 'hidden';
        dynEl.style.textOverflow = 'ellipsis';
        dynEl.style.animation = 'dynMarquee 4s linear infinite';
        dynEl.style.maxWidth = '100%';
    } else {
        dynEl.style.animation = '';
    }
};

window.setMacroDynamicColor = function(slotIndex, color) {
    const grid = document.getElementById('macroSlotsGrid');
    if (!grid) return;
    const slotEl = grid.children[slotIndex];
    if (!slotEl) return;
    slotEl.style.background = color;
};

window.resetMacroDynamicSlot = function(slotIndex) {
    const sd = assignedMacros[slotIndex];
    if (!sd) return;
    const config = macroDatabase[sd.scriptId];
    const slotColor = sd.color || (config ? (config.color || '#4a148c') : '#222');
    const grid = document.getElementById('macroSlotsGrid');
    if (!grid) return;
    const slotEl = grid.children[slotIndex];
    if (!slotEl) return;
    slotEl.style.background = slotColor;

    // Reset dyn_status
    const dynEl = slotEl.querySelector('.dyn-status');
    if (dynEl) {
        dynEl.textContent = '';
        dynEl.style.color = '';
        dynEl.style.backgroundColor = '';
        dynEl.style.animation = '';
        dynEl.style.padding = '0';
    }
};

// Inject marquee keyframes once
(function() {
    if (document.getElementById('dynMarqueeStyle')) return;
    const style = document.createElement('style');
    style.id = 'dynMarqueeStyle';
    style.textContent = `@keyframes dynMarquee { 0% { transform: translateX(0); } 100% { transform: translateX(-50%); } }`;
    document.head.appendChild(style);
})();

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
    document.getElementById('macroColorDropdown').style.display = 'none';

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
    activeSlotIndex = index;
    await refreshAvailableScripts();
    const list = document.getElementById('macroLibraryList');
    list.innerHTML = '';
    document.getElementById('macroLibraryModal').style.display = 'flex';

    availableManifests.forEach(item => {
        const manifest = (typeof item === 'object' && item) ? item : { id: item, name: item };
        const id = manifest.id || item;
        const card = document.createElement('div');
        card.style.cssText = 'background:#1a1a1a; border:1px solid #333; border-radius:8px; padding:12px; margin-bottom:6px; cursor:pointer; transition: background 0.15s;';
        card.onmouseenter = () => { card.style.background = '#2a2a2a'; };
        card.onmouseleave = () => { card.style.background = '#1a1a1a'; };

        const name = manifest.name || id.toUpperCase();
        const version = manifest.version || '';
        const description = manifest.description || '';
        const color = manifest.color || '#6a1b9a';
        const isSingleSlot = manifest.singleSlot === true;

        let badgesHtml = '';
        if (isSingleSlot) {
            badgesHtml += '<span style="display:inline-block;background:#ff6f00;color:#fff;font-size:9px;padding:1px 5px;border-radius:4px;margin-left:6px;font-weight:700;">1 SLOT</span>';
        }
        if (version) {
            badgesHtml += `<span style="display:inline-block;background:#333;color:#aaa;font-size:9px;padding:1px 5px;border-radius:4px;margin-left:4px;">v${version}</span>`;
        }

        card.innerHTML = `
            <div style="display:flex;align-items:center;margin-bottom:4px;">
                <span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${color};margin-right:8px;flex-shrink:0;"></span>
                <span style="color:#fff;font-weight:bold;font-size:13px;">${name}</span>
                ${badgesHtml}
            </div>
            ${description ? `<div style="color:#999;font-size:11px;line-height:1.3;">${description}</div>` : ''}
        `;
        card.onclick = () => selectMacroFromLibrary(manifest);
        list.appendChild(card);
    });
}
function selectMacroFromLibrary(manifestOrId) {
    const manifest = (typeof manifestOrId === 'object') ? manifestOrId : findManifest(manifestOrId);
    const macroId = manifest ? (manifest.id || manifestOrId) : manifestOrId;

    // singleSlot validation
    if (manifest && manifest.singleSlot === true) {
        const alreadyAssigned = Object.keys(assignedMacros).some(key => {
            return parseInt(key) !== activeSlotIndex && assignedMacros[key] && assignedMacros[key].scriptId === macroId;
        });
        if (alreadyAssigned) {
            if (typeof OverlayInfo !== 'undefined') {
                OverlayInfo.show('Esta macro ja esta atribuida a outro slot e so permite uma instancia por vez.', 'warning');
            } else {
                alert('Esta macro ja esta atribuida a outro slot e so permite uma instancia por vez.');
            }
            return;
        }
    }

    const slotName = (manifest && manifest.name) ? manifest.name : `MACRO ${activeSlotIndex + 1}`;
    const slotColor = (manifest && manifest.color) ? manifest.color : '#6a1b9a';

    assignedMacros[activeSlotIndex] = {
        scriptId: macroId,
        name: slotName,
        color: slotColor
    };
    saveGlobalSlotsManifest();
    loadMacroScript(macroId);
    document.getElementById('macroLibraryModal').style.display = 'none';
    renderMacros();
}
function showContextMenu(index) {
    const sd = assignedMacros[index]; if (!sd) return;
    activeSlotIndex = index;
    document.getElementById('ctxMacroName').innerText = sd.name;
    const config = macroDatabase[sd.scriptId];
    const currentColor = sd.color || (config ? config.color || '#6a1b9a' : '#6a1b9a');
    initMacroColorPicker(currentColor);
    document.getElementById('macroContextModal').style.display = 'flex';
}

function initMacroColorPicker(currentColor) {
    const grids = [document.getElementById('macroColorGrid'), document.getElementById('macroColorGridModal')];
    grids.forEach(grid => {
        if (!grid) return;
        grid.innerHTML = '';
        MACRO_COLOR_PALETTE.forEach(hex => {
            const swatch = document.createElement('div');
            swatch.className = 'macro-color-swatch';
            if (hex.toLowerCase() === currentColor.toLowerCase()) swatch.classList.add('selected');
            swatch.style.background = hex;
            if (hex === '#ffffff') swatch.style.border = '2px solid #555';
            swatch.setAttribute('data-color', hex);
            swatch.onclick = () => window.saveMacroColor(hex);
            grid.appendChild(swatch);
        });
    });
    updateColorPickerPreview(currentColor);
}

function updateColorPickerPreview(hex) {
    const border = isLightColor(hex) ? '2px solid #555' : '2px solid rgba(255,255,255,0.3)';
    const preview = document.getElementById('macroColorPreview');
    const previewModal = document.getElementById('macroColorPreviewModal');
    if (preview) { preview.style.background = hex; preview.style.border = border; }
    if (previewModal) { previewModal.style.background = hex; previewModal.style.border = border; }
}

window.openMacroColorPicker = async function () {
    const contextModal = document.getElementById('macroContextModal');
    if (contextModal) contextModal.style.display = 'none';

    const dropdown = document.getElementById('macroColorDropdown');
    if (dropdown) dropdown.style.display = 'none';

    const sd = (typeof activeSlotIndex !== 'undefined' && assignedMacros) ? assignedMacros[activeSlotIndex] : null;
    const initialColor = (sd && sd.color) ? sd.color : '#28a745';

    if (typeof ColorPicker !== 'undefined' && ColorPicker.open) {
        const chosenColor = await ColorPicker.open({
            initialColor: initialColor,
            mode: 'lite',
            title: 'Escolher Cor da Macro'
        });
        if (chosenColor) {
            saveMacroColor(chosenColor);
        }
    } else {
        const modal = document.getElementById('macroColorPickerModal');
        if (modal) modal.style.display = 'flex';
    }
};

window.closeMacroColorPickerModal = function () {
    document.getElementById('macroColorPickerModal').style.display = 'none';
};

window.closeMacroColorDropdown = function () {
    document.getElementById('macroColorDropdown').style.display = 'none';
};

window.addEventListener('resize', () => {
    const dropdown = document.getElementById('macroColorDropdown');
    const modal = document.getElementById('macroColorPickerModal');
    if (window.innerWidth <= 600 && dropdown) dropdown.style.display = 'none';
    if (window.innerWidth > 600 && modal) modal.style.display = 'none';
});
window.openMacroNameEditor = function () {
    const sd = assignedMacros[activeSlotIndex]; if (!sd) return;
    document.getElementById('inputMacroName').value = sd.name; document.getElementById('macroContextModal').style.display = 'none'; document.getElementById('macroColorDropdown').style.display = 'none'; document.getElementById('macroNameEditorModal').style.display = 'flex'; setTimeout(() => document.getElementById('inputMacroName').focus(), 100);
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
    document.getElementById('macroColorDropdown').style.display = 'none';
    document.getElementById('macroColorPickerModal').style.display = 'none';
};
window.changeSelectedMacro = function () { document.getElementById('macroContextModal').style.display = 'none'; document.getElementById('macroColorDropdown').style.display = 'none'; openLibrary(activeSlotIndex); };
window.openMacroSettings = function () {
    const sd = assignedMacros[activeSlotIndex]; if (!sd) return;
    const config = macroDatabase[sd.scriptId];
    if (config && typeof config.onConfigure === 'function') {
        document.getElementById('macroContextModal').style.display = 'none';
        document.getElementById('macroColorDropdown').style.display = 'none';
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
    if (title && (title.innerText.includes("MACRO FADER") || title.innerText.includes("CANAIS PROTEGIDOS"))) {
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
    // Suporte especial para o MACRO FADER / CANAIS PROTEGIDOS
    const title = document.getElementById('settingsMacroTitle');
    if (title && (title.innerText.includes("MACRO FADER") || title.innerText.includes("CANAIS PROTEGIDOS"))) {
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
        const sd = assignedMacros[activeSlotIndex];
        const config = sd ? macroDatabase[sd.scriptId] : null;

        // Call onDelete lifecycle hook if present
        if (config && typeof config.onDelete === 'function') {
            await config.onDelete(activeSlotIndex);
        }

        // Remove scoped CSS if the macro had styles
        if (sd && sd.scriptId && window.MixerAPI && window.MixerAPI.styles && window.MixerAPI.styles.removeScopedCSS) {
            window.MixerAPI.styles.removeScopedCSS(sd.scriptId);
        }

        delete assignedMacros[activeSlotIndex];
        await saveGlobalSlotsManifest();
        document.getElementById('macroContextModal').style.display = 'none';
        document.getElementById('macroColorDropdown').style.display = 'none';
        renderMacros();
    }
}

window.registerMacro = function (id, config) { macroDatabase[id] = config; renderMacros(); };
// Helper Global para os Mods (scripts externos) saberem qual preset está ativo
window.getCurrentMacroPreset = function () {
    return currentPreset || 'default';
};

document.addEventListener('DOMContentLoaded', initMacros);
window.initMacros = initMacros;
