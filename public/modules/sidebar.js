function conn() { 
    socket.emit('requestConnect', { 
        inIdx: parseInt(document.getElementById('sin').value, 10), 
        outIdx: parseInt(document.getElementById('sout').value, 10) 
    }); 
    document.getElementById('configModal').style.display='none'; 
}

function toggleDemoMode() {
    const btn = document.getElementById('demoBtn');
    const currentlyOn = btn.innerText.includes('OFF'); // Se diz OFF, é porque está ligado e quer desligar
    
    const nextStateOn = !currentlyOn;
    
    btn.innerText = nextStateOn ? 'DEMO OFF' : 'DEMO ON';
    btn.style.background = nextStateOn ? '#dc3545' : '#28a745';
    
    socket.emit('toggleDemo', { enabled: nextStateOn });
}

function updateMeterOpacity(v) {
    document.getElementById('opacityVal').innerText = v + '%';
    document.documentElement.style.setProperty('--meter-opacity', v / 100);
    socket.emit('updateMeterConfig', { opacity: v });
}

function forceSync() { 
    socket.emit('forceSync'); 
}

function toggleOuts() {
    outsMode = !outsMode;
    technicianMixMode = false; // Garante que sai do modo de edição se alternar canais
    const btn = document.getElementById('btnOuts');
    if (btn) {
        btn.classList.toggle('active-tab', outsMode);
        btn.innerText = outsMode ? 'CHANNELS' : 'OUTS';
    }
    initUI();
}

function enterTechnicianMixMode(mixIdx) {
    activeMix = mixIdx + 1;
    technicianMixMode = true;
    outsMode = false;
    initUI();
}

function exitTechnicianMixMode() {
    technicianMixMode = false;
    outsMode = true;
    initUI();
}

function changeTechnicianMix(delta) {
    let nextMix = activeMix + delta;
    if (nextMix < 1) nextMix = 8;
    if (nextMix > 8) nextMix = 1;
    
    activeMix = nextMix;
    initUI();
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

function setLayoutMode(mode) {
    layoutMode = mode;
    localStorage.setItem('mixer_layout', mode);
    document.body.classList.toggle('layout-desktop', mode === 'desktop');
    updateLayoutButtons();
    initUI();
}

function updateLayoutButtons() {
    const btnMobile = document.getElementById('btnLayoutMobile');
    const btnDesktop = document.getElementById('btnLayoutDesktop');
    if (btnMobile && btnDesktop) {
        btnMobile.style.background = layoutMode === 'mobile' ? '#007bff' : '#555';
        btnDesktop.style.background = layoutMode === 'desktop' ? '#007bff' : '#555';
    }
}

function setOrientation(o) {
    appOrientation = o;
    localStorage.setItem('mixer_orientation', o);
    if (layoutMode !== 'desktop') {
        if (o === 'horizontal') {
            document.body.classList.add('layout-horizontal');
        } else {
            document.body.classList.remove('layout-horizontal');
        }
    }
    document.getElementById('configModal').style.display = 'none';
}

// Carregar orientação salva
const savedOrientation = localStorage.getItem('mixer_orientation');
if (savedOrientation) setOrientation(savedOrientation);

function switchTab(tabId) {
    activeConfigTab = tabId; // Salva a aba atual para persistir na navegação
    // Para animações pesadas se existirem
    if (window.stopEQAnimation) stopEQAnimation();

    // Muda visual dos botões na sidebar
    document.querySelectorAll('.btn-tab').forEach(btn => btn.classList.remove('active-tab'));
    
    // Se a função foi chamada por um evento, destaca o botão clicado. 
    // Caso contrário (chamada automática ao abrir), destaca o primeiro por padrão.
    if (window.event && window.event.currentTarget && window.event.currentTarget.classList.contains('side-btn')) {
        window.event.currentTarget.classList.add('active-tab');
    } else {
        const btn = document.querySelector(`#chNav .side-btn:nth-child(${tabId === 'eq' ? 1 : (tabId === 'dyn' ? 2 : (tabId === 'aux' ? 3 : 4))})`);
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
    if (tabId === 'etc') { if(modeEl) modeEl.innerText = 'ROUTING / ETC'; renderRouting(activeConfigChannel); }
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
    updateViewportInfo();
    updateLayoutButtons();
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

    // 🚨 [CRITICAL SYNC LOGIC] - LIMITAÇÃO DE 4 CARACTERES (FRONT-END)
    // A 01V96 só exibe 4 letras. Truncamos aqui para evitar "BUMBE" (5 letras) no names.json.
    const newName = document.getElementById('inputChName').value.trim().toUpperCase().substring(0, 4);
    
    // Emitir para o servidor
    socket.emit('updateName', { channel: ch, name: newName });
    
    // Feedback local imediato (sempre limitado a 4)
    const finalName = newName || `CH ${ch + 1}`;
    document.getElementById(`name${ch}`).innerText = finalName;
    const sideTitle = document.getElementById('chSideTitle');
    if (sideTitle) {
        sideTitle.innerText = `${ch + 1} - ${finalName}`;
        autoScaleTitle(); 
    }
    
    document.getElementById('nameEditorModal').style.display = 'none';
};

// Listener imediato para capturar estado inicial antes do load completo
updateViewportInfo();

// Fechar modais ao clicar fora do conteúdo (no fundo/backdrop)
window.addEventListener('mousedown', (e) => {
    if (e.target.classList.contains('modal-overlay')) {
        e.target.style.display = 'none';
    }
    if (e.target.classList.contains('ch-modal-overlay')) {
        if (typeof closeChannelConfig === 'function') closeChannelConfig();
        else e.target.style.display = 'none';
    }
});
