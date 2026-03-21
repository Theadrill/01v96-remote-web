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

function switchTab(tabId) {
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
    if (tabId === 'eq') renderEQ(activeConfigChannel);
    if (tabId === 'dyn') renderDynamics(activeConfigChannel);
    if (tabId === 'aux') renderAuxs(activeConfigChannel);
}
