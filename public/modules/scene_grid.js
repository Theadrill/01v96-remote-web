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
    const searchResult = createFuzzySearch({
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

    // Adiciona botão de limpar busca
    const input = searchResult.input;

    // Move margin-bottom do input para o grid (pai) como margin-top
    grid.style.marginTop = '12px';

    // Garante que há um wrapper único para o input e o botão
    let wrapper = document.getElementById('sceneSearchWrapper');
    if (!wrapper) {
        // Cria o wrapper caso não exista
        wrapper = document.createElement('div');
        wrapper.id = 'sceneSearchWrapper';
        wrapper.style.display = 'flex';
        wrapper.style.width = '100%';
        wrapper.style.gap = '8px'; // Espaço entre input e botão
        wrapper.style.alignItems = 'center'; // Alinha verticalmente

        // Insere o wrapper antes do input (se o input já está no DOM)
        if (input.parentNode) {
            input.parentNode.insertBefore(wrapper, input);
        } else {
            // Caso improvável: insere antes do grid no modal
            const modal = document.getElementById('sceneGridModal');
            const grid = document.getElementById('sceneGrid');
            modal.insertBefore(wrapper, grid);
        }
        // Move o input para dentro do wrapper
        wrapper.appendChild(input);
    } else {
        // Wrapper já existe – garantir que o input esteja dentro dele
        if (input.parentNode !== wrapper) {
            if (input.parentNode) {
                input.parentNode.removeChild(input);
            }
            wrapper.appendChild(input);
        }
    }

    // Ajusta o input para ocupar o espaço disponível
    input.style.flex = '1';
    input.style.paddingRight = '0'; // Remove o padding que adicionamos antes
    input.style.boxSizing = 'border-box'; // Inclui padding e border na largura total

    // Verifica ou cria o botão de limpar busca dentro do wrapper
    let clearBtn = wrapper.querySelector('button[title="Limpar busca"]');
    if (!clearBtn) {
        clearBtn = document.createElement('button');
        clearBtn.type = 'button';
        clearBtn.innerHTML = '×'; // Símbolo de multiplicação como X
        clearBtn.title = 'Limpar busca';
        clearBtn.style.cssText = `
            width: 28px;
            height: 28px;
            min-width: 28px;
            padding: 0;
            border: none;
            border-radius: 6px;
            background: rgba(220, 53, 69, 0.8); /* Vermelho semi-transparente */
            color: white;
            font-size: 18px;
            line-height: 1;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            font-weight: bold;
            flex-shrink: 0;
        `;
        // Efeito de hover
        const updateButtonStyle = (isHovered) => {
            clearBtn.style.background = isHovered ? 'rgba(220, 53, 69, 1)' : 'rgba(220, 53, 69, 0.8)';
        };
        clearBtn.addEventListener('mouseenter', () => updateButtonStyle(true));
        clearBtn.addEventListener('mouseleave', () => updateButtonStyle(false));
        // Manipulador de clique
        clearBtn.addEventListener('click', (e) => {
            e.stopPropagation(); // Evita disparar eventos de input
            input.value = '';
            if (input._fuzzyHandler) {
                input._fuzzyHandler();
            }
            input.focus();
        });
        wrapper.appendChild(clearBtn);
    }


    modal.style.display = 'flex';

    // Preenche automaticamente o campo de busca com o nome da cena atual ao abrir para salvar
    if (action === 'save') {
        const displayEl = document.getElementById('configSceneDisplay');
        if (displayEl) {
            const text = displayEl.textContent || displayEl.innerText;
            const match = text.match(/ - (.+)/);
            if (match) {
                const sceneName = match[1].trim();
                const searchInput = document.getElementById('sceneSearchInput');
                if (searchInput) {
                    searchInput.value = sceneName;
                    // Dispara o evento de busca para filtrar imediatamente
                    const inputEvent = new Event('input', { bubbles: true });
                    searchInput.dispatchEvent(inputEvent);
                }
            }
        }
    }
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
            socket.emit('saveScene', { index: scene.index, newName, syncShared: window.customScenesSyncEnabled });
            confirmModal.style.display = 'none';
            gridModal.style.display   = 'none';
        };
    }

    confirmModal.style.display = 'flex';
}
