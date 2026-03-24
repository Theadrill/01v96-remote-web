function conn() { 
    socket.emit('requestConnect', { 
        inIdx: parseInt(document.getElementById('sin').value, 10), 
        outIdx: parseInt(document.getElementById('sout').value, 10) 
    }); 
    document.getElementById('configModal').style.display='none'; 
}

function forceSync() { 
    socket.emit('forceSync'); 
}

function toggleFullScreen() {
    if (!document.fullscreenElement && !document.webkitFullscreenElement) {
        const docElm = document.documentElement;
        if (docElm.requestFullscreen) docElm.requestFullscreen();
        else if (docElm.webkitRequestFullscreen) docElm.webkitRequestFullscreen();
    } else {
        if (document.exitFullscreen) document.exitFullscreen();
        else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
    }
}

function setOrientation(o) {
    appOrientation = o;
    localStorage.setItem('mixer_orientation', o);
    if (o === 'horizontal') {
        document.body.classList.add('layout-horizontal');
    } else {
        document.body.classList.remove('layout-horizontal');
    }
    document.getElementById('configModal').style.display = 'none';
}

// Carregar orientação salva
const savedOrientation = localStorage.getItem('mixer_orientation');
if (savedOrientation) setOrientation(savedOrientation);

function switchTab(tabId) {
    // Para animações pesadas se existirem
    if (window.stopEQAnimation) stopEQAnimation();

    // Muda visual dos botões na sidebar
    document.querySelectorAll('.btn-tab').forEach(btn => btn.classList.remove('active-tab'));
    
    // Se a função foi chamada por um evento, destaca o botão clicado. 
    // Caso contrário (chamada automática ao abrir), destaca o primeiro por padrão.
    if (window.event && window.event.currentTarget && window.event.currentTarget.classList.contains('side-btn')) {
        window.event.currentTarget.classList.add('active-tab');
    } else {
        const btn = document.querySelector(`#chNav .side-btn:nth-child(${tabId === 'eq' ? 1 : (tabId === 'dyn' ? 2 : 3)})`);
        if (btn) btn.classList.add('active-tab');
    }
    
    // Altera o conteúdo do corpo do modal delegando para os novos módulos
    const modeEl = document.getElementById('chSideMode');
    if (tabId === 'eq') { 
        if(modeEl) modeEl.innerText = 'EQUALIZADOR'; 
        renderEQ(activeConfigChannel); 
    }
    
    if (tabId === 'dyn') { if(modeEl) modeEl.innerText = 'DYNAMICS'; renderDynamics(activeConfigChannel); }
    if (tabId === 'aux') { if(modeEl) modeEl.innerText = 'AUX SENDS'; renderAuxs(activeConfigChannel); }
}
function initDraggableFS() {
    const fsBtn = document.getElementById('fsBtn');
    if (!fsBtn) return;

    let isDragging = false;
    let startX, startY;
    let initialRight, initialBottom;

    // Carregar posição salva
    const savedPos = JSON.parse(localStorage.getItem('fs_btn_pos')) || { bottom: 20, right: 120 };
    fsBtn.style.bottom = `${savedPos.bottom}px`;
    fsBtn.style.right = `${savedPos.right}px`;

    fsBtn.addEventListener('pointerdown', (e) => {
        isDragging = false;
        startX = e.clientX;
        startY = e.clientY;
        const style = window.getComputedStyle(fsBtn);
        initialRight = parseInt(style.right, 10);
        initialBottom = parseInt(style.bottom, 10);
        fsBtn.setPointerCapture(e.pointerId);
    });

    fsBtn.addEventListener('pointermove', (e) => {
        if (!fsBtn.hasPointerCapture(e.pointerId)) return;

        const dx = startX - e.clientX;
        const dy = startY - e.clientY;

        if (Math.abs(dx) > 5 || Math.abs(dy) > 5) {
            isDragging = true;
            const newRight = initialRight + dx;
            const newBottom = initialBottom + dy;

            // Limites da tela
            const maxRight = window.innerWidth - fsBtn.offsetWidth - 10;
            const maxBottom = window.innerHeight - fsBtn.offsetHeight - 10;

            const finalRight = Math.max(10, Math.min(maxRight, newRight));
            const finalBottom = Math.max(10, Math.min(maxBottom, newBottom));

            fsBtn.style.right = `${finalRight}px`;
            fsBtn.style.bottom = `${finalBottom}px`;
        }
    });

    fsBtn.addEventListener('pointerup', (e) => {
        if (isDragging) {
            const pos = {
                bottom: parseInt(fsBtn.style.bottom, 10),
                right: parseInt(fsBtn.style.right, 10)
            };
            localStorage.setItem('fs_btn_pos', JSON.stringify(pos));
        }
        fsBtn.releasePointerCapture(e.pointerId);
    });

    fsBtn.addEventListener('click', (e) => {
        if (isDragging) {
            e.preventDefault();
            e.stopPropagation();
            return;
        }
        toggleFullScreen();
    });
}

function updateViewportInfo() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const isPortrait = h > w;

    if (isPortrait) {
        document.body.classList.add('is-portrait');
        document.body.classList.remove('is-landscape');
    } else {
        document.body.classList.add('is-landscape');
        document.body.classList.remove('is-portrait');
    }

    // Compatibilidade extra para iOS (força reflow se necessário)
    // console.log(`Viewport: ${w}x${h} (${isPortrait ? 'Retrato' : 'Paisagem'})`);
}

// Listeners para mudança de viewport (incluindo iOS)
window.addEventListener('resize', updateViewportInfo);
window.addEventListener('orientationchange', () => {
    // Timeout curto para o iOS atualizar as dimensões internas após o giro
    setTimeout(updateViewportInfo, 200);
});
window.addEventListener('load', updateViewportInfo);
// Inicialização Global
window.addEventListener('DOMContentLoaded', () => {
    initDraggableFS();
    updateViewportInfo();
});

// Controle de Nomes dos Canais
window.openNameEditor = function() {
    const ch = activeConfigChannel;
    if (ch === null) return;
    
    const currentName = document.getElementById(`name${ch}`).innerText.trim();
    const input = document.getElementById('inputChName');
    input.value = currentName === '...' ? '' : currentName;
    document.getElementById('nameEditorModal').style.display = 'flex';
    input.focus();
    input.select();
};

window.autoScaleTitle = function() {
    const el = document.getElementById('chSideTitle');
    if (!el) return;
    const txt = el.innerText;
    // Se o texto for muito longo (número + nome), diminui a fonte para não quebrar feio
    if (txt.length > 9) {
        el.style.fontSize = '12px';
    } else if (txt.length > 13) {
        el.style.fontSize = '10px';
    } else {
        el.style.fontSize = '15px';
    }
};

window.saveChannelName = function() {
    const ch = activeConfigChannel;
    if (ch === null) return;

    const newName = document.getElementById('inputChName').value.trim().toUpperCase();
    
    // Emitir para o servidor
    socket.emit('updateName', { channel: ch, name: newName });
    
    const finalName = newName || `CH ${ch + 1}`;
    // Feedback local imediato
    document.getElementById(`name${ch}`).innerText = finalName;
    const sideTitle = document.getElementById('chSideTitle');
    if (sideTitle) {
        sideTitle.innerText = `${ch + 1} - ${finalName}`;
        autoScaleTitle(); // Ajusta fonte após mudar texto
    }
    
    document.getElementById('nameEditorModal').style.display = 'none';
};

// Listener imediato para capturar estado inicial antes do load completo
updateViewportInfo();
