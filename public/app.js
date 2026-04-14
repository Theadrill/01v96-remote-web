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
        
        btn.onclick = () => {
            if (action === 'load') {
                document.getElementById('sceneConfirmTitle').innerText = "CARREGAR CENA?";
                document.getElementById('sceneConfirmTitle').style.color = "#ffcc00";
                document.getElementById('sceneConfirmText').innerHTML = `Deseja CARREGAR a cena <b>${scene.index} (${scene.name})</b>?<br><br>ISSO SUBSTITUIRÁ A MIXAGEM ATUAL.`;
                
                const actionBtn = document.getElementById('sceneConfirmActionBtn');
                actionBtn.style.background = "#28a745";
                actionBtn.innerText = "SIM, CARREGAR";
                actionBtn.onclick = () => {
                    socket.emit('recallScene', { index: scene.index });
                    document.getElementById('sceneConfirmModal').style.display = 'none';
                    modal.style.display = 'none';
                    const shield = document.getElementById('syncShield');
                    if (shield) shield.style.display = 'flex';
                };
                
                document.getElementById('sceneConfirmModal').style.display = 'flex';
            } else {
                alert(`Ação de ${action} para a cena ${scene.index} (${scene.name}) ainda não implementada neste escopo!`);
                modal.style.display = 'none';
            }
        };
        
        grid.appendChild(btn);
    });
    
    modal.style.display = 'flex';
};
