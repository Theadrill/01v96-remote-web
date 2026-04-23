// O app.js agora atua apenas como Bootstrapper final
initUI();

// Inicializamos o socket APÓS a UI estar pronta (já ocorre em globals.js)

// Aguardamos um breve momento para estabilizar a renderização e o sync inicial antes de permitir envios
setTimeout(() => {
    appReady = true;
    console.log("🚀 App pronto e protegido contra restauração de estado do browser.");
}, 1000);

window.scenesLibrary = [];

window.showSceneGrid = (action) => {
    const modal = document.getElementById('sceneGridModal');
    const grid = document.getElementById('sceneGrid');
    const title = document.getElementById('sceneGridTitle');
    
    if (!modal || !grid) return;
    
    title.innerText = action === 'save' ? "SALVAR CENA EM..." : "CARREGAR CENA...";
    grid.innerHTML = '';
    
    const sortedScenes = window.scenesLibrary.sort((a, b) => a.index - b.index);
    
    let itemsToRender = [];
    if (action === 'save') {
        for (let i = 1; i <= 99; i++) {
            const existing = sortedScenes.find(s => s.index === i);
            if (existing) {
                itemsToRender.push(existing);
            } else {
                itemsToRender.push({ index: i, name: '[VAZIO]', isEmpty: true });
            }
        }
    } else {
        itemsToRender = sortedScenes.filter(s => s && s.index > 0);
    }
    
    itemsToRender.forEach(scene => {
        const btn = document.createElement('button');
        btn.className = 'btn-connect';
        btn.style.margin = '0';
        btn.style.height = '60px';
        btn.style.display = 'flex';
        btn.style.flexDirection = 'column';
        btn.style.justifyContent = 'center';
        btn.style.alignItems = 'center';
        btn.style.background = scene.isEmpty ? '#111' : '#222';
        btn.style.border = scene.isEmpty ? '1px dashed #444' : '1px solid #444';
        btn.style.opacity = scene.isEmpty ? '0.7' : '1';
        
        const spanNum = document.createElement('span');
        spanNum.innerText = String(scene.index).padStart(2, '0');
        spanNum.style.fontSize = '10px';
        spanNum.style.color = '#888';
        
        const spanName = document.createElement('span');
        spanName.innerText = scene.name;
        spanName.style.fontSize = '14px';
        spanName.style.fontWeight = 'bold';
        spanName.style.color = scene.isEmpty ? '#555' : '#ffcc00';

        
        btn.appendChild(spanNum);
        btn.appendChild(spanName);
        
        let longPressTimer = null;
        let isLongPress = false;
        
        const handleLongPress = () => {
            isLongPress = true;
            if (!scene.isEmpty) {
                const deleteModal = document.getElementById('sceneDeleteModal');
                const deleteText = document.getElementById('sceneDeleteText');
                const deleteBtn = document.getElementById('sceneDeleteActionBtn');
                
                deleteText.innerHTML = `Deseja DELETAR a cena <b>${scene.index} (${scene.name})</b>?<br><br>Todos os dados desta cena serão removidos permanentemente.`;
                
                deleteBtn.onclick = () => {
                    socket.emit('deleteScene', { index: scene.index });
                    deleteModal.style.display = 'none';
                    modal.style.display = 'none';
                    window.scenesLibrary = window.scenesLibrary.filter(s => s.index !== scene.index);
                };
                
                deleteModal.style.display = 'flex';
            }
        };
        
        const cancelLongPress = () => {
            if (longPressTimer) {
                clearTimeout(longPressTimer);
                longPressTimer = null;
            }
        };
        
        btn.addEventListener('mousedown', (e) => {
            if (scene.isEmpty) return;
            isLongPress = false;
            longPressTimer = setTimeout(handleLongPress, 600);
        });
        
        btn.addEventListener('mouseup', cancelLongPress);
        btn.addEventListener('mouseleave', cancelLongPress);
        
        btn.addEventListener('touchstart', (e) => {
            if (scene.isEmpty) return;
            isLongPress = false;
            longPressTimer = setTimeout(handleLongPress, 600);
        }, { passive: true });
        
        btn.addEventListener('touchmove', cancelLongPress, { passive: true });
        
        btn.addEventListener('touchend', (e) => {
            cancelLongPress();
        });
        
        btn.addEventListener('touchcancel', cancelLongPress);
        
        btn.onclick = () => {
            if (isLongPress) return;
            
            const confirmModal = document.getElementById('sceneConfirmModal');
            const actionBtn = document.getElementById('sceneConfirmActionBtn');
            const renameContainer = document.getElementById('sceneRenameContainer');
            const renameInput = document.getElementById('sceneRenameInput');
            const confirmText = document.getElementById('sceneConfirmText');

            if (action === 'load') {
                document.getElementById('sceneConfirmTitle').innerText = "CARREGAR CENA?";
                document.getElementById('sceneConfirmTitle').style.color = "#ffcc00";
                confirmText.innerHTML = `Deseja CARREGAR a cena <b>${scene.index} (${scene.name})</b>?<br><br>ISSO SUBSTITUIRÁ A MIXAGEM ATUAL.`;
                renameContainer.style.display = 'none';
                
                actionBtn.style.background = "#28a745";
                actionBtn.innerText = "SIM, CARREGAR";
                actionBtn.onclick = () => {
                    socket.emit('recallScene', { index: scene.index });
                    confirmModal.style.display = 'none';
                    modal.style.display = 'none';
                    const shield = document.getElementById('syncShield');
                    if (shield) shield.style.display = 'flex';
                };
            } else {
                document.getElementById('sceneConfirmTitle').innerText = "SALVAR CENA?";
                document.getElementById('sceneConfirmTitle').style.color = "#dc3545";
                confirmText.innerHTML = `Deseja SALVAR a mixagem atual no slot <b>${scene.index}</b>?`;
                
                renameContainer.style.display = 'block';
                renameInput.value = window.currentSceneName || scene.name || "";
                
                actionBtn.style.background = "#dc3545";
                actionBtn.innerText = "SIM, SALVAR";
                actionBtn.onclick = () => {
                    const newName = renameInput.value.trim().toUpperCase();
                    socket.emit('saveScene', { 
                        index: scene.index, 
                        newName: newName 
                    });
                    confirmModal.style.display = 'none';
                    modal.style.display = 'none';
                };
            }
            confirmModal.style.display = 'flex';
        };
        
        grid.appendChild(btn);
    });
    
    modal.style.display = 'flex';
};
