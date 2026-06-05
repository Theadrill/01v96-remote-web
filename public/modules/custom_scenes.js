console.log('[CUSTOM] custom_scenes.js loaded, socket is', typeof socket, socket ? 'defined' : 'UNDEFINED');
window.customScenesData = [];
window.pendingAssignFile = null;
window.customScenesSyncEnabled = localStorage.getItem('custom_scenes_sync') === 'true';

window.toggleCustomScenesSyncSetting = function(enabled) {
    window.customScenesSyncEnabled = enabled;
    localStorage.setItem('custom_scenes_sync', enabled ? 'true' : 'false');
    console.log('[CUSTOM] customScenesSyncEnabled changed to:', enabled);
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
        socket.emit('refreshNames');
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
        if (window.assignModalOpen && window.currentAssignSceneIndex !== null) {
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
            console.log('[CUSTOM] rendering scene', i, ':', s.file, 'physical:', s.physical_scene, 'id:', s.physical_id);
            const assigned = s.physical_scene ? s.physical_scene.trim() : '';
            const prefix = String(s.physical_id + 1).padStart(2, '0');
            
            // Tenta pegar o nome pelo campo novo custom_name, ou extrai via fallback
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
            html += '<div style="display:flex; gap:5px; flex-shrink:0;">';
            html += '<button onclick="openAssignScene(' + i + ')" style="background:#2a4a2a; border:1px solid #4a4; color:#4caf50; border-radius:6px; padding:6px 10px; font-size:10px; cursor:pointer;">ATRIBUIR</button>';
            html += '<button onclick="renameScene(\'' + escHtml(s.file) + '\', \'' + escHtml(s.custom_name || '') + '\')" style="background:#4a3a2a; border:1px solid #a84; color:#fa4; border-radius:6px; padding:6px 10px; font-size:10px; cursor:pointer;">RENOMEAR</button>';
            html += '<button onclick="openSceneDetails(' + i + ')" style="background:#2a2a4a; border:1px solid #44a; color:#58f; border-radius:6px; padding:6px 10px; font-size:10px; cursor:pointer;">DETALHES</button>';
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
        const idx = String(libScene.index + 1).padStart(2, '0');
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
        const chLabel = getChannelLabel(ch.ch);
        html += '<tr style="border-bottom:1px solid #2a2a2a; background:' + rowBg + ';">';
        html += '<td style="padding:6px 8px; color:#aaa;">' + escHtml(chLabel) + '</td>';
        html += '<td style="padding:6px 8px; color:' + (customName ? '#8cf' : '#555') + ';">' + escHtml(customName || '—') + '</td>';
        html += '<td style="padding:6px 8px; color:#fa8;">' + escHtml(mesaName) + '</td>';
        html += '</tr>';
    }
    tbody.innerHTML = html;
});

function getChannelLabel(globalCh) {
    if (globalCh >= 0 && globalCh <= 31) return 'CH ' + (globalCh + 1);
    if (globalCh >= 60 && globalCh <= 67) return 'ST IN ' + (Math.floor((globalCh - 60) / 2) + 1) + (globalCh % 2 === 0 ? 'L' : 'R');
    if (globalCh === 52) return 'MASTER';
    return 'CH ' + globalCh;
}
