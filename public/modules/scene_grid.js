/**
 * MOD: SCENE GRID MODAL
 *
 * Responsável por renderizar e gerenciar o modal de seleção de cenas
 * (Salvar / Carregar), incluindo busca fuzzy integrada.
 *
 * Depende de: search.js (fuzzyMatch, createFuzzySearch)
 * Depende de: socket (global, definido em globals.js)
 */

window.scenesLibrary = [];

/**
 * Abre o modal de grade de cenas.
 * @param {'save'|'load'} action
 */
window.showSceneGrid = (action) => {
    const modal  = document.getElementById('sceneGridModal');
    const grid   = document.getElementById('sceneGrid');
    const title  = document.getElementById('sceneGridTitle');
    if (!modal || !grid) return;

    title.innerText = action === 'save' ? 'SALVAR CENA EM...' : 'CARREGAR CENA...';
    grid.innerHTML = '';

    // --- Monta lista de itens ---
    const sortedScenes = [...window.scenesLibrary].sort((a, b) => a.index - b.index);
    let itemsToRender = [];

    if (action === 'save') {
        for (let i = 1; i <= 99; i++) {
            const existing = sortedScenes.find(s => s.index === i);
            itemsToRender.push(existing || { index: i, name: '[VAZIO]', isEmpty: true });
        }
    } else {
        itemsToRender = sortedScenes.filter(s => s && s.index > 0);
    }

    // --- Renderiza botões ---
    itemsToRender.forEach(scene => {
        grid.appendChild(_buildSceneBtn(scene, action, modal));
    });

    // --- Busca fuzzy (search.js) ---
    createFuzzySearch({
        container:   grid.parentNode,
        targetEl:    grid,
        placeholder: '🔍  Buscar cena...',
        inputId:     'sceneSearchInput',
        onFilter: (query) => {
            grid.querySelectorAll('button').forEach(btn => {
                const isEmpty = btn.dataset.sceneEmpty === '1';
                // Slots vazios somem quando há query ativa
                if (isEmpty && query) { btn.style.display = 'none'; return; }
                // Busca por nome + número do slot
                const searchText = `${btn.dataset.sceneIndex} ${btn.dataset.sceneName}`;
                btn.style.display = fuzzyMatch(query, searchText) ? 'flex' : 'none';
            });
        }
    });

    modal.style.display = 'flex';
};

// ---------------------------------------------------------------------------
// Funções internas (prefixo _ para indicar escopo do módulo)
// ---------------------------------------------------------------------------

/**
 * Constrói o botão de uma cena individual no grid.
 * @param {Object}      scene
 * @param {'save'|'load'} action
 * @param {Element}     modal  - Referência ao modal pai (para fechar ao confirmar)
 * @returns {HTMLButtonElement}
 */
function _buildSceneBtn(scene, action, modal) {
    const btn = document.createElement('button');
    btn.className = 'btn-connect';
    btn.style.cssText = 'margin:0; height:60px; display:flex; flex-direction:column; justify-content:center; align-items:center;';
    btn.style.background = scene.isEmpty ? '#111' : '#222';
    btn.style.border     = scene.isEmpty ? '1px dashed #444' : '1px solid #444';
    btn.style.opacity    = scene.isEmpty ? '0.7' : '1';

    // Dados para o filtro de busca
    btn.dataset.sceneIndex = scene.index;
    btn.dataset.sceneName  = scene.name || '';
    btn.dataset.sceneEmpty = scene.isEmpty ? '1' : '0';

    const spanNum = document.createElement('span');
    spanNum.innerText = String(scene.index).padStart(2, '0');
    spanNum.style.cssText = 'font-size:10px; color:#888;';

    const spanName = document.createElement('span');
    spanName.innerText = scene.name;
    spanName.style.cssText = `font-size:14px; font-weight:bold; color:${scene.isEmpty ? '#555' : '#ffcc00'};`;

    btn.appendChild(spanNum);
    btn.appendChild(spanName);

    // --- Long press → deletar cena ---
    let longPressTimer = null;
    let isLongPress    = false;

    const handleLongPress = () => {
        isLongPress = true;
        if (scene.isEmpty) return;
        const deleteModal = document.getElementById('sceneDeleteModal');
        const deleteText  = document.getElementById('sceneDeleteText');
        const deleteBtn   = document.getElementById('sceneDeleteActionBtn');

        deleteText.innerHTML = `Deseja DELETAR a cena <b>${scene.index} (${scene.name})</b>?<br><br>Todos os dados desta cena serão removidos permanentemente.`;
        deleteBtn.onclick = () => {
            socket.emit('deleteScene', { index: scene.index });
            deleteModal.style.display = 'none';
            modal.style.display = 'none';
            window.scenesLibrary = window.scenesLibrary.filter(s => s.index !== scene.index);
        };
        deleteModal.style.display = 'flex';
    };

    const startLP  = () => { if (!scene.isEmpty) { isLongPress = false; longPressTimer = setTimeout(handleLongPress, 600); } };
    const cancelLP = () => { if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null; } };

    btn.addEventListener('mousedown',  startLP);
    btn.addEventListener('mouseup',    cancelLP);
    btn.addEventListener('mouseleave', cancelLP);
    btn.addEventListener('touchstart', startLP,  { passive: true });
    btn.addEventListener('touchmove',  cancelLP, { passive: true });
    btn.addEventListener('touchend',   cancelLP);
    btn.addEventListener('touchcancel',cancelLP);

    // --- Click → confirmar ação ---
    btn.onclick = () => {
        if (isLongPress) return;
        _openConfirmModal(scene, action, modal);
    };

    return btn;
}

/**
 * Abre o modal de confirmação de salvar/carregar.
 * @param {Object}      scene
 * @param {'save'|'load'} action
 * @param {Element}     gridModal
 */
function _openConfirmModal(scene, action, gridModal) {
    const confirmModal   = document.getElementById('sceneConfirmModal');
    const actionBtn      = document.getElementById('sceneConfirmActionBtn');
    const renameContainer = document.getElementById('sceneRenameContainer');
    const renameInput    = document.getElementById('sceneRenameInput');
    const confirmText    = document.getElementById('sceneConfirmText');
    const confirmTitle   = document.getElementById('sceneConfirmTitle');

    if (action === 'load') {
        confirmTitle.innerText    = 'CARREGAR CENA?';
        confirmTitle.style.color  = '#ffcc00';
        confirmText.innerHTML     = `Deseja CARREGAR a cena <b>${scene.index} (${scene.name})</b>?<br><br>ISSO SUBSTITUIRÁ A MIXAGEM ATUAL.`;
        renameContainer.style.display = 'none';
        actionBtn.style.background = '#28a745';
        actionBtn.innerText = 'SIM, CARREGAR';
        actionBtn.onclick = () => {
            socket.emit('recallScene', { index: scene.index });
            confirmModal.style.display = 'none';
            gridModal.style.display   = 'none';
            OverlayInfo.show('sync', 'CARREGANDO CENA...');
        };
    } else {
        confirmTitle.innerText    = 'SALVAR CENA?';
        confirmTitle.style.color  = '#dc3545';
        confirmText.innerHTML     = `Deseja SALVAR a mixagem atual no slot <b>${scene.index}</b>?`;
        renameContainer.style.display = 'block';
        renameInput.value = (!scene.isEmpty && scene.name) ? scene.name : (window.currentSceneName || '');
        actionBtn.style.background = '#dc3545';
        actionBtn.innerText = 'SIM, SALVAR';
        actionBtn.onclick = () => {
            const newName = renameInput.value.trim().toUpperCase();
            socket.emit('saveScene', { index: scene.index, newName });
            confirmModal.style.display = 'none';
            gridModal.style.display   = 'none';
        };
    }

    confirmModal.style.display = 'flex';
}
