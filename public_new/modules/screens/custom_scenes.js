console.log('[CUSTOM] custom_scenes.js loaded, socket is', typeof socket, socket ? 'defined' : 'UNDEFINED');
window.customScenesData = [];
window.pendingAssignFile = null;
window.customScenesSyncEnabled = localStorage.getItem('custom_scenes_sync') === 'true';

window.toggleCustomScenesSyncSetting = function(enabled) {
    window.customScenesSyncEnabled = enabled;
    localStorage.setItem('custom_scenes_sync', enabled ? 'true' : 'false');
    console.log('[CUSTOM] customScenesSyncEnabled changed to:', enabled);
    if (enabled && typeof socket !== 'undefined' && socket) {
        socket.emit('ensureCurrentCustomScene', { syncShared: true });
    }
};

window.showCustomScenes = function() {
    console.log('[CUSTOM] showCustomScenes CALLED');
    try {
        var modal = document.getElementById('customScenesModal');
        console.log('[CUSTOM] modal element:', modal);
        if (modal) {
            modal.style.display = 'flex';
            var toggle = document.getElementById('toggleCustomNames');
            if (toggle) toggle.checked = window.customNamesEnabled !== false;
            var toggleSync = document.getElementById('toggleCustomScenesSync');
            if (toggleSync) toggleSync.checked = window.customScenesSyncEnabled === true;
        } else {
            console.error('[CUSTOM] customScenesModal not found in DOM');
        }
        var listContainer = document.getElementById('customScenesList');
        console.log('[CUSTOM] list container:', listContainer);
        if (listContainer) {
            listContainer.innerHTML = '<p style="color:#666; font-size:12px;">Carregando...</p>';
        } else {
            console.error('[CUSTOM] customScenesList not found in DOM');
        }
        console.log('[CUSTOM] about to emit listCustomScenes, socket.connected:', socket ? socket.connected : 'N/A');
        if (socket && socket.connected) {
            socket.emit('listCustomScenes');
            console.log('[CUSTOM] listCustomScenes emitted');
        } else {
            console.error('[CUSTOM] socket not connected, cannot emit');
        }
    } catch (e) {
        console.error('[CUSTOM] ERROR in showCustomScenes:', e.message, e.stack);
    }
};

window.toggleCustomNamesSetting = function(enabled) {
    window.customNamesEnabled = enabled;
    localStorage.setItem('custom_names_enabled', enabled ? 'true' : 'false');
    console.log('[CUSTOM] customNamesEnabled changed to:', enabled);
    
    // Atualiza a UI imediatamente para todos os canais
    for (let i = 0; i <= 67; i++) {
        if (i >= 32 && i <= 51 && i !== 44 && i !== 45 && i !== 46 && i !== 47 && i !== 48 && i !== 49 && i !== 50 && i !== 51) continue; // Pula canais não utilizados (mantém mix/bus)
        const stateObj = window.getChannelStateById ? window.getChannelStateById(i) : null;
        if (stateObj) {
            if (window.updateNameUI) {
                window.updateNameUI(i, stateObj.name);
            }
        }
    }
    
    // Refresh the names from the backend just to be absolutely sure
    if (typeof socket !== 'undefined' && socket) {
        if (enabled) {
            socket.emit('ensureCurrentCustomScene', { syncShared: window.customScenesSyncEnabled });
        } else {
            socket.emit('refreshNames');
        }
    }
};

socket.on('customScenesList', (data) => {
    console.log('[CUSTOM] customScenesList EVENT received', JSON.stringify(data));
    try {
        if (!data) {
            console.error('[CUSTOM] customScenesList: data is null/undefined');
            return;
        }
        if (!data.scenes) {
            console.error('[CUSTOM] customScenesList: data.scenes is missing, keys:', Object.keys(data));
            return;
        }
        console.log('[CUSTOM] customScenesList: scenes array length =', data.scenes.length);
        window.customScenesData = data.scenes;
        window.currentMesaNome = data.mesa_nome || '';
        if (data.scenes.length > 0) {
            console.log('[CUSTOM] first scene:', JSON.stringify(data.scenes[0]));
        }
        renderCustomScenesList(data.scenes);
    } catch (e) {
        console.error('[CUSTOM] ERROR in customScenesList handler:', e.message, e.stack);
    }
});

// Update the assign modal dynamically if the scenes are updated while it's open
socket.on('scenesUpdated', (data) => {
    if (data && data.scenes) {
        const modal = document.getElementById('assignSceneModal');
        const isVisible = modal && modal.style.display !== 'none' && window.getComputedStyle(modal).display !== 'none';
        if (isVisible && window.currentAssignSceneIndex !== null) {
            console.log('[CUSTOM] scenesUpdated received while modal open, refreshing modal...');
            window.openAssignScene(window.currentAssignSceneIndex);
        }
    }
});

function renderCustomScenesList(scenes) {
    console.log('[CUSTOM] renderCustomScenesList called with', scenes ? scenes.length : 0, 'scenes');
    try {
        const container = document.getElementById('customScenesList');
        if (!container) {
            console.error('[CUSTOM] renderCustomScenesList: container not found');
            return;
        }
        console.log('[CUSTOM] container found, innerHTML length:', container.innerHTML.length);
        if (!scenes || scenes.length === 0) {
            console.log('[CUSTOM] no scenes, showing empty message');
            container.innerHTML = '<p style="color:#666; font-size:13px; padding:20px;">Nenhuma cena customizada criada ainda.</p>';
            return;
        }
        let html = '';
        for (let i = 0; i < scenes.length; i++) {
            const s = scenes[i];
            const assigned = s.physical_scene ? s.physical_scene.trim() : '';
            const prefix = String(s.physical_id).padStart(2, '0');
            
            let sceneDisplayName = s.custom_name;
            if (!sceneDisplayName) {
                sceneDisplayName = s.file.replace(/^custom_names_scene-/, '').replace(/\.json$/, '');
                const suffix = '-' + (window.currentMesaNome || 'mesa-teste');
                if (sceneDisplayName.endsWith(suffix)) {
                    sceneDisplayName = sceneDisplayName.substring(0, sceneDisplayName.length - suffix.length);
                }
            }

            html += '<div style="background:#222; border:1px solid #333; border-radius:8px; padding:12px; margin-bottom:8px; text-align:left;">';
            html += '<div style="display:flex; justify-content:space-between; align-items:center;">';
            html += '<div style="flex:1;">';
            html += '<div style="color:#fff; font-size:13px; font-weight:bold;">' + escHtml(sceneDisplayName) + '</div>';
            html += '<div style="color:#888; font-size:10px; margin-top:3px;">Arquivo: ' + escHtml(s.file) + '</div>';
            if (assigned) {
                html += '<div style="color:#4caf50; font-size:10px; margin-top:2px;">Cena física atribuída: <b>' + escHtml(prefix + ' - ' + assigned) + '</b></div>';
            } else {
                html += '<div style="color:#f44336; font-size:10px; margin-top:2px;">Não atribuída</div>';
            }
            html += '</div>';
            html += '<div style="display:flex; flex-direction:column; gap:5px; flex-shrink:0;">';
            html += '<div style="display:flex; gap:5px;">';
            html += '<button onclick="openAssignScene(' + i + ')" style="flex:1; background:#2a4a2a; border:1px solid #4a4; color:#4caf50; border-radius:6px; padding:6px 10px; font-size:10px; cursor:pointer;">ATRIBUIR</button>';
            html += '<button onclick="renameScene(\'' + escHtml(s.file) + '\', \'' + escHtml(s.custom_name || '') + '\')" style="flex:1; background:#4a3a2a; border:1px solid #a84; color:#fa4; border-radius:6px; padding:6px 10px; font-size:10px; cursor:pointer;">RENOMEAR</button>';
            html += '</div>';
            html += '<div style="display:flex; gap:5px;">';
            html += '<button onclick="openSceneDetails(' + i + ')" style="flex:1; background:#2a2a4a; border:1px solid #44a; color:#58f; border-radius:6px; padding:6px 10px; font-size:10px; cursor:pointer;">DETALHES</button>';
            html += '<button onclick="copySceneNames(' + i + ')" style="flex:1; background:#4a2a4a; border:1px solid #a4a; color:#f8f; border-radius:6px; padding:6px 10px; font-size:10px; cursor:pointer;">COPIAR</button>';
            html += '</div>';
            html += '</div>';
            html += '</div>';
            html += '</div>';
        }
        console.log('[CUSTOM] setting innerHTML, length:', html.length);
        container.innerHTML = html;
        console.log('[CUSTOM] renderCustomScenesList DONE');
    } catch (e) {
        console.error('[CUSTOM] ERROR in renderCustomScenesList:', e.message, e.stack);
    }
}

function escHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

window.pendingRenameFile = null;

window.renameScene = function(file, explicitCustomName) {
    window.pendingRenameFile = file;
    
    // Extrai o nome atual do arquivo de forma segura
    let currentName = explicitCustomName || "";
    if (!currentName && file && file.startsWith("custom_names_scene-")) {
        currentName = file.replace(/^custom_names_scene-/, '').replace(/\.json$/, '');
        const suffix = '-' + (window.currentMesaNome || 'mesa-teste');
        if (currentName.endsWith(suffix)) {
            currentName = currentName.substring(0, currentName.length - suffix.length);
        }
    }
    
    document.getElementById('renameSceneFileName').textContent = 'Arquivo: ' + file;
    document.getElementById('renameSceneInput').value = currentName;
    document.getElementById('renameSceneModal').style.display = 'flex';
    document.getElementById('renameSceneInput').focus();
};

window.confirmRenameScene = function() {
    const newName = document.getElementById('renameSceneInput').value;
    if (newName && newName.trim() !== '') {
        socket.emit('renameCustomSceneFile', { old_file: window.pendingRenameFile, new_name: newName.trim(), syncShared: window.customScenesSyncEnabled });
        document.getElementById('renameSceneModal').style.display = 'none';
    } else {
        if (typeof OverlayInfo !== 'undefined' && OverlayInfo.show) {
            OverlayInfo.show('error', 'NOME INVÁLIDO');
        } else {
            alert('Nome inválido!');
        }
    }
};

// Permite confirmar com Enter
document.addEventListener('DOMContentLoaded', () => {
    const input = document.getElementById('renameSceneInput');
    if (input) {
        input.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                window.confirmRenameScene();
            }
        });
    }
});

window.assignModalOpen = false;
window.currentAssignSceneIndex = null;

window.openAssignScene = function(index) {
    window.currentAssignSceneIndex = index;
    window.assignModalOpen = true;
    console.log('[CUSTOM] openAssignScene called', index);
    const scene = window.customScenesData[index];
    if (!scene) return;
    window.pendingAssignFile = scene.file;
    document.getElementById('assignSceneName').textContent = 'Cena: ' + (scene.physical_scene || scene.file);

    const list = document.getElementById('physicalSceneList');
    const library = window.scenesLibrary || [];
    if (!library || library.length === 0) {
        list.innerHTML = '<p style="color:#666; font-size:12px;">Nenhuma cena física disponível.</p>';
        document.getElementById('assignSceneModal').style.display = 'flex';
        return;
    }

    let html = '';
    for (let i = 0; i < library.length; i++) {
        const libScene = library[i];
        if (!libScene) continue;
        const idx = String(libScene.index).padStart(2, '0');
        const name = libScene.name || 'Sem nome';
        const checked = (libScene.index === scene.physical_id) ? ' checked' : '';
        html += '<label style="display:flex; align-items:center; gap:8px; padding:6px 8px; border-radius:6px; cursor:pointer; background:' + (checked ? '#2a4a2a' : 'transparent') + ';">';
        html += '<input type="radio" name="physScene" value="' + i + '"' + checked + ' onchange="selectPhysicalScene(this)">';
        html += '<span style="color:#ccc; font-size:12px;">' + escHtml(idx + ' - ' + name) + '</span>';
        html += '</label>';
    }
    list.innerHTML = html;
    document.getElementById('assignSceneModal').style.display = 'flex';
};

window.selectPhysicalScene = function(el) {
    document.querySelectorAll('#physicalSceneList label').forEach(l => l.style.background = 'transparent');
    if (el && el.parentElement) el.parentElement.style.background = '#2a4a2a';
};

window.confirmAssignScene = function() {
    const selected = document.querySelector('input[name="physScene"]:checked');
    if (!selected) return;
    const libIndex = parseInt(selected.value, 10);
    const library = window.scenesLibrary || [];
    const libScene = library[libIndex];
    if (!libScene) return;

    socket.emit('assignCustomScene', {
        file: window.pendingAssignFile,
        physical_id: libScene.index,
        physical_scene: libScene.name || '',
        syncShared: window.customScenesSyncEnabled
    });
    window.assignModalOpen = false;
    window.currentAssignSceneIndex = null;
    document.getElementById('assignSceneModal').style.display = 'none';
};

window.closeAssignSceneModal = function() {
    window.assignModalOpen = false;
    window.currentAssignSceneIndex = null;
    document.getElementById('assignSceneModal').style.display = 'none';
};

socket.on('assignResult', (data) => {
    if (data && data.success) {
        if (typeof OverlayInfo !== 'undefined' && OverlayInfo.show) {
            OverlayInfo.show('success', 'CENA ATRIBUÍDA');
        }
        socket.emit('listCustomScenes');
    } else if (data && !data.success) {
        if (typeof OverlayInfo !== 'undefined' && OverlayInfo.show) {
            OverlayInfo.show('error', 'ERRO AO ATRIBUIR');
        }
    }
});

window.openSceneDetails = function(index) {
    const scene = window.customScenesData[index];
    if (!scene) return;
    window.detailsSceneFile = scene.file;
    document.getElementById('detailsSceneName').textContent = 'Cena: ' + (scene.physical_scene || scene.file);
    document.getElementById('detailsTableBody').innerHTML = '<tr><td colspan="3" style="color:#666; padding:20px; text-align:center;">Carregando...</td></tr>';
    document.getElementById('sceneDetailsModal').style.display = 'flex';
    socket.emit('previewCustomScene', { file: scene.file });
};

socket.on('previewResult', (data) => {
    if (!data || !data.channels) return;
    const tbody = document.getElementById('detailsTableBody');
    if (!tbody) return;
    const chs = data.channels;
    if (!chs || chs.length === 0) {
        tbody.innerHTML = '<tr><td colspan="3" style="color:#666; padding:20px; text-align:center;">Nenhum canal nesta cena.</td></tr>';
        return;
    }
    let html = '';
    for (let i = 0; i < chs.length; i++) {
        const ch = chs[i];
        const customName = ch.name || '';
        const mesaName = ch.mesa_name || '';
        const isDifferent = customName && mesaName && customName.substring(0, 4).toUpperCase() !== mesaName.substring(0, 4).toUpperCase();
        const rowBg = isDifferent ? '#3a3a1a' : 'transparent';
        const chLabel = window.getChannelLabel ? window.getChannelLabel(ch.ch) : ch.ch;
        html += '<tr style="border-bottom:1px solid #2a2a2a; background:' + rowBg + ';">';
        html += '<td style="padding:6px 8px; color:#aaa;">' + escHtml(chLabel) + '</td>';
        html += '<td style="padding:6px 8px; color:' + (customName ? '#8cf' : '#555') + ';">' + escHtml(customName || '—') + '</td>';
        html += '<td style="padding:6px 8px; color:#fa8;">' + escHtml(mesaName) + '</td>';
        html += '</tr>';
    }
    tbody.innerHTML = html;
});

window.pendingCopyFile = null;

window.copySceneNames = function(index) {
    const scene = window.customScenesData[index];
    if (!scene) return;
    window.pendingCopyFile = scene.file;
    document.getElementById('copySceneNameDisplay').textContent = 'Cena Fonte: ' + (scene.custom_name || scene.file);
    document.getElementById('copySceneModal').style.display = 'flex';
};

window.confirmCopyScene = function() {
    if (!window.pendingCopyFile) return;
    socket.emit('copyCustomSceneToCurrent', {
        source_file: window.pendingCopyFile,
        syncShared: window.customScenesSyncEnabled
    });
    document.getElementById('copySceneModal').style.display = 'none';
};

// --- RESTAURAÇÃO DE VERSÕES ANTERIORES (Local vs GitHub) ---

window.openRestoreSourceModal = function() {
    if (!window.detailsSceneFile) return;
    document.getElementById('restoreSourceModal').style.display = 'flex';
};

window.requestCustomSceneHistory = function(source) {
    const file = window.detailsSceneFile;
    if (!file) return;
    const url = '/api/custom-scenes/history/' + source + '?file=' + encodeURIComponent(file);
    const overlay = typeof OverlayInfo !== 'undefined' && OverlayInfo.show;
    document.getElementById('restoreSourceModal').style.display = 'none';

    fetch(url)
        .then(async (res) => {
            if (!res.ok) {
                let errMsg = 'Erro HTTP ' + res.status;
                try {
                    const data = await res.json();
                    if (data && data.error) errMsg = data.error;
                } catch (e) {}
                throw new Error(errMsg);
            }
            return res.json();
        })
        .then((data) => {
            const versions = (data && data.versions) || [];
            if (versions.length === 0) {
                if (overlay) OverlayInfo.show('error', 'NENHUMA VERSÃO ANTERIOR');
                else alert('Nenhuma versão anterior encontrada para esta cena.');
                return;
            }
            showRestoreVersionsModal(data.file, source, versions);
        })
        .catch((err) => {
            console.error('[CUSTOM] Falha ao buscar histórico:', err);
            if (overlay) OverlayInfo.show('error', 'HISTÓRICO INDISPONÍVEL');
            else alert('Falha ao buscar histórico: ' + err.message);
        });
};

function formatRestoreDate(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    const now = new Date();
    const diffMs = now - d;
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    const pad = (n) => String(n).padStart(2, '0');
    const time = pad(d.getHours()) + ':' + pad(d.getMinutes());
    if (diffDays === 0) return 'Hoje às ' + time;
    if (diffDays === 1) return 'Ontem às ' + time;
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const thatDay = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    if (thatDay.getFullYear() === today.getFullYear()) {
        const months = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
        return d.getDate() + ' ' + months[d.getMonth()] + ' às ' + time;
    }
    return d.toLocaleDateString('pt-BR') + ' às ' + time;
}

function shortSha(sha) {
    return sha ? sha.substring(0, 7) : '';
}

window.showRestoreVersionsModal = function(file, source, versions) {
    document.getElementById('restoreVersionsSceneName').textContent = 'Arquivo: ' + file;
    const list = document.getElementById('restoreVersionsList');
    if (!versions || versions.length === 0) {
        list.innerHTML = '<p style="color:#666; font-size:12px; padding:10px;">Nenhuma versão anterior disponível.</p>';
        document.getElementById('restoreVersionsModal').style.display = 'flex';
        return;
    }
    let html = '';
    for (let i = 0; i < versions.length; i++) {
        const v = versions[i];
        const author = v.author || 'Desconhecido';
        const dateLabel = formatRestoreDate(v.date);
        const msg = v.message || 'Sem mensagem';
        html += '<div style="background:#222; border:1px solid #333; border-radius:8px; padding:10px; margin-bottom:8px; text-align:left;">';
        html += '<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">';
        html += '<span style="background:#4a3a2a; border:1px solid #a84; color:#fa4; border-radius:4px; padding:2px 6px; font-size:10px; font-family:monospace;">' + escHtml(shortSha(v.commit_sha)) + '</span>';
        html += '<span style="color:#888; font-size:10px;">' + escHtml(author) + ' · ' + escHtml(dateLabel) + '</span>';
        html += '</div>';
        html += '<div style="color:#ccc; font-size:11px; margin-bottom:8px;">' + escHtml(msg) + '</div>';
        html += '<button class="btn-connect inline-style-46" onclick="openRestoreConfirm(\'' + escHtml(v.commit_sha) + '\', \'' + source + '\')" style="width:100%; font-size:11px;">RESTAURAR ESTA VERSÃO</button>';
        html += '</div>';
    }
    list.innerHTML = html;
    document.getElementById('restoreVersionsModal').style.display = 'flex';
};

window.openRestoreConfirm = function(commitSha, source) {
    window.pendingRestore = { file: window.detailsSceneFile, source: source, commit_sha: commitSha };

    ConfirmModal.show({
        title: 'Confirmar Restauração',
        message: 'Tem certeza que deseja substituir os nomes atuais pelos nomes da versão selecionada?',
        type: 'warning',
        confirmText: 'SIM, RESTAURAR',
        cancelText: 'CANCELAR'
    }).then(function(ok) {
        if (ok) {
            confirmRestoreScene();
        }
    });
};

window.confirmRestoreScene = function() {
    const pending = window.pendingRestore;
    if (!pending) return;
    const overlay = typeof OverlayInfo !== 'undefined' && OverlayInfo.show;

    fetch('/api/custom-scenes/restore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(pending)
    })
        .then(async (res) => {
            if (!res.ok) {
                let errMsg = 'Erro HTTP ' + res.status;
                try {
                    const data = await res.json();
                    if (data && data.error) errMsg = data.error;
                } catch (e) {}
                throw new Error(errMsg);
            }
            return res.json();
        })
        .then((data) => {
            document.getElementById('restoreVersionsModal').style.display = 'none';
            if (overlay) OverlayInfo.show('success', 'CENA RESTAURADA');
            // Recarrega a lista de cenas e re-preview da cena restaurada
            socket.emit('listCustomScenes');
            socket.emit('previewCustomScene', { file: pending.file });
        })
        .catch((err) => {
            console.error('[CUSTOM] Falha na restauração:', err);
            if (overlay) OverlayInfo.show('error', 'FALHA NA RESTAURAÇÃO');
            else alert('Falha na restauração: ' + err.message);
        });
};

// Quando o servidor confirma a restauração, atualiza os nomes exibidos na grade
socket.on('customSceneRestored', (data) => {
    console.log('[CUSTOM] customSceneRestored recebido', data);
    if (typeof socket !== 'undefined' && socket) {
        socket.emit('getActiveCustomChannels');
    }
});
