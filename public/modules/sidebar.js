function conn() {
    socket.emit('requestConnect', {
        inIdx: parseInt(document.getElementById('sin').value, 10),
        outIdx: parseInt(document.getElementById('sout').value, 10)
    });
    document.getElementById('configModal').style.display = 'none';
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
    technicianMixMode = false;
    const btn = document.getElementById('dockBtnOuts');
    if (btn) {
        btn.classList.toggle('active-tab', outsMode);
        btn.innerText = outsMode ? 'SAIR' : 'MIX/BUS';
        btn.style.backgroundColor = '';
        btn.style.color = '';
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
    // Detecta se é iOS (iPhone, iPad, iPod)
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;

    // Verifica se já está rodando como um app "Standalone" (instalado na Home Screen do iOS)
    const isStandalone = window.navigator.standalone === true;

    if (isIOS) {
        if (isStandalone) {
            alert("Você já está no Modo App Nativo em Tela Cheia!");
            return;
        }

        // Verifica se é Safari (Safari tem 'Safari' no UA, mas Chrome tem 'CriOS' e Firefox 'FxiOS')
        const ua = navigator.userAgent;
        const isSafari = /Safari/.test(ua) && !/CriOS|FxiOS|OPiOS|EdgiOS/.test(ua);

        const modal = document.getElementById('iosInstallModal');
        const safariInst = document.getElementById('iosSafariInstructions');
        const otherInst = document.getElementById('iosOtherBrowserInstructions');

        if (modal) {
            modal.style.display = 'flex';
            if (isSafari) {
                safariInst.style.display = 'block';
                otherInst.style.display = 'none';
            } else {
                safariInst.style.display = 'none';
                otherInst.style.display = 'block';
            }
        }
        return; // Interrompe para não tentar executar a API padrão que falha no iOS
    }

    // Comportamento original para Android e Desktop
    if (!document.fullscreenElement && !document.webkitFullscreenElement) {
        const docElm = document.documentElement;
        if (docElm.requestFullscreen) docElm.requestFullscreen();
        else if (docElm.webkitRequestFullscreen) docElm.webkitRequestFullscreen();
    } else {
        if (document.exitFullscreen) document.exitFullscreen();
        else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
    }
}

window.copyAppUrl = function () {
    const textToCopy = window.location.href;

    // Tenta usar a API moderna primeiro (só funciona em HTTPS ou localhost)
    if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(textToCopy).then(() => {
            alert("Link copiado! Abra o navegador Safari e cole este link.");
        }).catch(err => {
            fallbackCopyTextToClipboard(textToCopy);
        });
    } else {
        // Fallback para HTTP (redes locais) usando método tradicional
        fallbackCopyTextToClipboard(textToCopy);
    }
};

function fallbackCopyTextToClipboard(text) {
    var textArea = document.createElement("textarea");
    textArea.value = text;

    // Evita o scroll pro fim da pagina no iOS
    textArea.style.top = "0";
    textArea.style.left = "0";
    textArea.style.position = "fixed";

    // Evita que o teclado virtual do celular abra
    textArea.setAttribute('readonly', '');

    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();

    try {
        var successful = document.execCommand('copy');
        if (successful) {
            alert("Link copiado! Abra o navegador Safari e cole este link.");
        } else {
            alert("Não foi possível copiar o link automaticamente. Por favor, copie da barra de endereços.");
        }
    } catch (err) {
        alert("Falha ao copiar o link. Por favor, copie da barra de endereços.");
    }
    document.body.removeChild(textArea);
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
    activeConfigTab = tabId;
    if (window.stopEQAnimation) stopEQAnimation();

    document.querySelectorAll('.dock-tab').forEach(btn => btn.classList.remove('active-tab'));

    if (window.event && window.event.currentTarget && window.event.currentTarget.classList.contains('dock-tab')) {
        window.event.currentTarget.classList.add('active-tab');
    } else {
        const tabIndex = tabId === 'eq' ? 0 : (tabId === 'dyn' ? 1 : (tabId === 'aux' ? 2 : 3));
        const btns = document.querySelectorAll('.dock-tab');
        if (btns[tabIndex]) btns[tabIndex].classList.add('active-tab');
    }

    const modeEl = document.getElementById('chSideMode');
    if (tabId === 'eq') {
        if (modeEl) modeEl.innerText = 'EQUALIZADOR';
        renderEQ(activeConfigChannel);
    }

    if (tabId === 'dyn') { if (modeEl) modeEl.innerText = 'DYNAMICS'; renderDynamics(activeConfigChannel); }
    if (tabId === 'aux') { if (modeEl) modeEl.innerText = 'AUX SENDS'; renderAuxs(activeConfigChannel); }
    if (tabId === 'etc') { if (modeEl) modeEl.innerText = 'ROUTING / ETC'; renderRouting(activeConfigChannel); }
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

    if (typeof updateDockScrollIndicators === 'function') {
        updateDockScrollIndicators();
        setTimeout(updateDockScrollIndicators, 100);
        setTimeout(updateDockScrollIndicators, 300);
    }
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
    autoScaleElement(document.getElementById('scn'));
});

// Controle de Nomes dos Canais
function normalizeNameEditor(str) {
    return str
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^A-Za-z0-9 ]/g, '')
        .toUpperCase();
}

function updateNamePreview() {
    const input = document.getElementById('inputChName');
    const preview = document.getElementById('namePreview');
    if (!input || !preview) return;
    const upper = normalizeNameEditor(input.value).substring(0, 10);
    preview.querySelector('.preview-app').textContent = 'App: ' + (upper || '(vazio)');
    preview.querySelector('.preview-mesa').textContent = 'Mesa: ' + (upper.substring(0, 4).padEnd(4) || '    ');
}

window.toggleCustomNameEditor = function () {
    const input = document.getElementById('inputChName');
    const preview = document.getElementById('namePreview');
    const isChecked = document.getElementById('chkCustomName').checked;
    if (isChecked) {
        input.setAttribute('maxlength', '10');
        updateNamePreview();
        preview.style.display = 'block';
    } else {
        const val = input.value;
        if (val.length > 4) input.value = val.substring(0, 4);
        input.setAttribute('maxlength', '4');
        preview.style.display = 'none';
    }
};

window.removeCustomName = function () {
    const ch = activeConfigChannel;
    if (ch === null) return;
    socket.emit('removeCustomName', { channel: ch, syncShared: window.customScenesSyncEnabled });
    if (window.customNamesEnabled && window.activeCustomSceneChannels) {
        delete window.activeCustomSceneChannels[ch];
    }
    document.getElementById('nameEditorModal').style.display = 'none';
};

window.openNameEditor = function () {
    const ch = activeConfigChannel;
    if (ch === null) return;

    let targetId = `name${ch}`;
    if (ch >= 0 && ch <= 31) {
        targetId = `name${ch}`;
    } else if (ch >= 36 && ch <= 43) {
        targetId = `namem${ch - 36}`;
    } else if (ch >= 44 && ch <= 51) {
        targetId = `nameb${ch - 44}`;
    } else if (ch === 52) {
        targetId = `namemaster`;
    }

    const nameEl = document.getElementById(targetId);
    const currentName = nameEl ? nameEl.innerText.trim() : '';
    const input = document.getElementById('inputChName');
    input.value = currentName === '...' ? '' : currentName;

    const checkbox = document.getElementById('chkCustomName');
    const preview = document.getElementById('namePreview');
    const removeBtn = document.getElementById('btnRemoveCustomName');

    const customCh = window.customNamesEnabled && window.activeCustomSceneChannels && window.activeCustomSceneChannels[ch];
    const hasCustomName = !!(customCh && customCh.name);

    checkbox.checked = hasCustomName;
    removeBtn.style.display = hasCustomName ? 'block' : 'none';

    if (hasCustomName) {
        input.setAttribute('maxlength', '10');
        input.value = customCh.name;
        updateNamePreview();
        preview.style.display = 'block';
    } else {
        input.setAttribute('maxlength', '4');
        preview.style.display = 'none';
    }

    document.getElementById('nameEditorModal').style.display = 'flex';
    input.focus();
    input.select();
};

function autoScaleElement(el) {
    if (!el) return;
    const parent = el.parentElement;
    if (!parent) return;
    const cs = window.getComputedStyle(el);
    const maxSize = parseInt(cs.fontSize, 10) || 15;
    el.style.width = '100%';
    el.style.maxWidth = '100%';
    el.style.boxSizing = 'border-box';
    el.style.whiteSpace = 'nowrap';
    el.style.overflow = 'visible';
    void el.offsetHeight;
    const availableWidth = parent.clientWidth;
    let size = maxSize;
    el.style.setProperty('font-size', size + 'px', 'important');
    void el.offsetWidth;
    while (el.scrollWidth > availableWidth && size > 6) {
        size--;
        el.style.setProperty('font-size', size + 'px', 'important');
        void el.offsetWidth;
    }
}

window.autoScaleTitle = function () {
    autoScaleElement(document.getElementById('chSideTitle'));
};

window.saveChannelName = function () {
    const ch = activeConfigChannel;
    if (ch === null) return;

    const input = document.getElementById('inputChName');
    const isCustom = document.getElementById('chkCustomName').checked;
    let newName = input.value.trim();

    if (isCustom) {
        newName = normalizeNameEditor(newName).substring(0, 10);
        socket.emit('saveCustomName', { channel: ch, name: newName, syncShared: window.customScenesSyncEnabled });
        if (typeof window.updateNameUI === 'function') {
            window.updateNameUI(ch, newName.substring(0, 4));
        }
        if (!window.activeCustomSceneChannels) window.activeCustomSceneChannels = {};
        window.activeCustomSceneChannels[ch] = { name: newName, short: newName.substring(0, 4).padEnd(4) };
    } else {
        newName = newName.toUpperCase().substring(0, 4);
        socket.emit('updateName', { channel: ch, name: newName });
        if (typeof window.updateNameUI === 'function') {
            window.updateNameUI(ch, newName);
        }
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

function resetDmx() {
    document.getElementById('dmxResetConfirmModal').style.display = 'flex';
    document.getElementById('dmxResetConfirmBtn').onclick = () => {
        socket.emit('resetDmx');
        document.getElementById('dmxResetConfirmModal').style.display = 'none';
        document.getElementById('configModal').style.display = 'none';
    };
}

function restartServer() {
    document.getElementById('serverRestartConfirmModal').style.display = 'flex';
    document.getElementById('serverRestartConfirmBtn').onclick = () => {
        socket.emit('restartServer');
        document.getElementById('serverRestartConfirmModal').style.display = 'none';
        document.getElementById('configModal').style.display = 'none';
    };
}

function setServerConfigStatus(msg, color) {
    const el = document.getElementById('serverConfigStatus');
    if (!el) return;
    el.textContent = msg || '';
    el.style.color = color || '#aaa';
}

function refreshServerNameDisplay() {
    const el = document.getElementById('configServerNameDisplay');
    const input = document.getElementById('inputServerName');
    const name = window.serverName || '01V96';
    if (el) el.textContent = name;
    if (input && (!input.value || input.value === window.serverName)) {
        input.value = name;
    }
    autoScaleElement(document.getElementById('scn'));
}

window.saveServerName = function () {
    const input = document.getElementById('inputServerName');
    if (!input) return;
    const newName = input.value.trim();
    if (!newName) {
        setServerConfigStatus('Digite um nome.', '#ff6b6b');
        input.focus();
        return;
    }
    if (!/^[a-z0-9-]+$/.test(newName)) {
        setServerConfigStatus('Use apenas letras minúsculas, números e hífen.', '#ff6b6b');
        input.focus();
        return;
    }
    if (newName.length < 3 || newName.length > 30) {
        setServerConfigStatus('Nome deve ter entre 3 e 30 caracteres.', '#ff6b6b');
        input.focus();
        return;
    }
    if (typeof socket === 'undefined' || !socket.connected) {
        setServerConfigStatus('Sem conexão com o servidor.', '#ff6b6b');
        return;
    }
    socket.emit('renameServer', { new_name: newName, syncShared: window.customScenesSyncEnabled });
    setServerConfigStatus('Salvando...', '#aaa');
};

window.confirmResetConfig = function () {
    document.getElementById('resetConfigConfirmModal').style.display = 'flex';
    document.getElementById('resetConfigConfirmBtn').onclick = () => {
        if (typeof socket !== 'undefined' && socket.connected) {
            socket.emit('resetConfig');
        }
        document.getElementById('resetConfigConfirmModal').style.display = 'none';
        document.getElementById('configModal').style.display = 'none';
    };
};

window.onRenameResult = function (data) {
    if (!data) return;
    if (data.success) {
        setServerConfigStatus('Nome atualizado.', '#5cacee');
        window.serverName = data.server_name || window.serverName;
        refreshServerNameDisplay();
        // Re-busca para garantir consistência
        if (typeof socket !== 'undefined') socket.emit('getServerName');
    } else {
        setServerConfigStatus(data.error || 'Erro ao renomear.', '#ff6b6b');
    }
};

window.onServerRenamed = function (data) {
    if (data && data.server_name) {
        window.serverName = data.server_name;
        refreshServerNameDisplay();
    }
};

window.onResetResult = function (data) {
    if (data && data.success) {
        // Espera o configReset broadcast chegar para redirecionar
    } else if (data && data.error) {
        setServerConfigStatus('Erro ao resetar: ' + data.error, '#ff6b6b');
    }
};

window.onConfigReset = function () {
    window.envStatus = 'not_found';
    window.serverName = null;
    try {
        localStorage.removeItem('01v96_role');
        localStorage.removeItem('01v96_mix');
    } catch (e) { /* localStorage indisponível */ }
    if (typeof window.showSetupScreen === 'function') {
        const splash = document.getElementById('splashScreen');
        if (splash) {
            splash.style.display = 'flex';
            splash.style.opacity = '1';
            splash.style.transform = 'scale(1)';
            splash.style.pointerEvents = 'auto';
        }
        window.showSetupScreen();
    }
    // Fecha qualquer modal aberto
    document.querySelectorAll('.modal-overlay').forEach(m => { m.style.display = 'none'; });
};

window.toggleMacrosPanel = function (enabled) {
    console.log("🛠️ toggleMacrosPanel chamando com:", enabled);
    localStorage.setItem('01v96_show_macros', enabled ? 'true' : 'false');
    if (enabled) {
        document.body.classList.remove('hide-macros');
    } else {
        document.body.classList.add('hide-macros');
    }
};

function updateMacrosState() {
    const showMacros = localStorage.getItem('01v96_show_macros') !== 'false';
    console.log("🛠️ updateMacrosState lido showMacros de localStorage:", showMacros);
    const toggleCheckbox = document.getElementById('toggleMacrosEnable');
    if (toggleCheckbox) {
        toggleCheckbox.checked = showMacros;
        console.log("🛠️ Configurado checkbox toggleMacrosEnable para checked =", showMacros);
    } else {
        console.warn("⚠️ Checkbox toggleMacrosEnable não encontrado na DOM!");
    }
    if (showMacros) {
        document.body.classList.remove('hide-macros');
    } else {
        document.body.classList.add('hide-macros');
    }
    console.log("🛠️ Class hide-macros ativa no body:", document.body.classList.contains('hide-macros'));
}

// Atualiza o display do nome do servidor sempre que o configModal abrir
document.addEventListener('DOMContentLoaded', () => {
    updateMacrosState();
    const configModal = document.getElementById('configModal');
    if (!configModal) return;
    const observer = new MutationObserver(() => {
        if (configModal.style.display === 'flex') {
            refreshServerNameDisplay();
            updateMacrosState();
        }
    });
    observer.observe(configModal, { attributes: true, attributeFilter: ['style'] });
});

function renderDock(mode) {
    window.currentDockMode = mode;
    const dock = document.getElementById('buttonDock');
    if (!dock) return;

    let buttons = [];

    switch (mode) {
        case 'main': {
            buttons.push({ label: 'CONFIG', action: "document.getElementById('configModal').style.display='flex'", cls: 'dock-config' });
            const isOutsOn = typeof window.outsMode !== 'undefined' && outsMode;
            buttons.push({ label: isOutsOn ? 'SAIR' : 'MIX/BUS', action: 'toggleOuts()', id: 'dockBtnOuts', cls: 'dock-outs' });
            buttons.push({ label: 'SAIR', action: "document.getElementById('logoutConfirmModal').style.display='flex'", cls: 'dock-exit' });
            const isStandalone = window.navigator.standalone === true;
            if (!isStandalone) {
                const fsSvg = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display: block; margin: auto;"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"></path></svg>`;
                buttons.push({ label: fsSvg, action: 'toggleFullScreen()', cls: 'dock-fs' });
            }
            break;
        }
        case 'channelConfig': {
            const tabs = ['eq', 'dyn', 'aux', 'etc'];
            buttons = tabs.map(tab => ({
                label: tab.toUpperCase(),
                action: `switchTab('${tab}')`,
                cls: 'dock-tab' + (tab === activeConfigTab ? ' active-tab' : '')
            }));
            buttons.push({ label: 'SAIR', action: 'closeChannelConfig()', cls: 'dock-close' });
            break;
        }
        case 'outs': {
            buttons = [
                { label: 'SAIR', action: 'toggleOuts()', cls: 'dock-close' }
            ];
            break;
        }
        case 'techMix': {
            buttons = [
                { label: 'SAIR', action: 'exitTechnicianMixMode()', cls: 'dock-close' }
            ];
            break;
        }
        case 'musician': {
            buttons = [];
            const isStandalone = window.navigator.standalone === true;
            if (!isStandalone) {
                const fsSvg = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display: block; margin: auto;"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"></path></svg>`;
                buttons.push({ label: fsSvg, action: 'toggleFullScreen()', cls: 'dock-fs' });
            }
            buttons.push({ label: 'SAIR', action: "document.getElementById('logoutConfirmModal').style.display='flex'", cls: 'dock-close' });
            break;
        }
    }

    dock.innerHTML = buttons.map(b =>
        `<button class="dock-btn ${b.cls || ''}" onclick="${b.action}"${b.id ? ` id="${b.id}"` : ''}>${b.label}</button>`
    ).join('');
}

function triggerExitActiveMode() {
    const mode = window.currentDockMode;
    if (mode === 'main' || mode === 'musician') {
        const modal = document.getElementById('logoutConfirmModal');
        if (modal) modal.style.display = 'flex';
    } else if (mode === 'channelConfig') {
        if (typeof closeChannelConfig === 'function') closeChannelConfig();
    } else if (mode === 'outs') {
        if (typeof toggleOuts === 'function') toggleOuts();
    } else if (mode === 'techMix') {
        if (typeof exitTechnicianMixMode === 'function') exitTechnicianMixMode();
    }
}
window.triggerExitActiveMode = triggerExitActiveMode;


function updateSidebarInfo() {
    // Sync active screen classes on body to allow CSS targeting
    document.body.classList.remove('screen-main', 'screen-config', 'screen-techmix', 'screen-outs', 'screen-musician');
    if (musicianMode) {
        document.body.classList.add('screen-musician');
    } else if (activeConfigChannel !== null) {
        document.body.classList.add('screen-config');
    } else if (technicianMixMode) {
        document.body.classList.add('screen-techmix');
    } else if (outsMode) {
        document.body.classList.add('screen-outs');
    } else {
        document.body.classList.add('screen-main');
    }

    const chTitle = document.getElementById('chSideTitle');
    const tmTitle = document.getElementById('techMixTitle');
    const fiSidebar = document.getElementById('foneIndicatorSidebar');
    const sidebarNav = document.getElementById('sidebarNav');
    const navPrev = document.getElementById('navPrev');
    const navNext = document.getElementById('navNext');

    if (activeConfigChannel !== null) {
        const ch = activeConfigChannel;
        const stateRef = channelStates[ch];
        const name = stateRef ? stateRef.name : '';
        if (chTitle) {
            chTitle.style.display = 'block';
            chTitle.innerText = `${ch + 1} - ${name || `CH ${ch + 1}`}`;
        }
        if (tmTitle) tmTitle.style.display = 'none';
        if (fiSidebar) fiSidebar.style.display = 'none';
        if (sidebarNav) {
            sidebarNav.style.display = 'flex';
            if (navPrev) navPrev.onclick = function () { changeConfigChannel(-1); };
            if (navNext) navNext.onclick = function () { changeConfigChannel(1); };
        }
        if (typeof window.autoScaleTitle === 'function') window.autoScaleTitle();
    } else if (technicianMixMode) {
        if (chTitle) chTitle.style.display = 'none';
        if (tmTitle) {
            tmTitle.style.display = 'block';
            const mixData = typeof mixesState !== 'undefined' && mixesState[activeMix - 1];
            tmTitle.innerText = `${activeMix} - ${mixData ? mixData.name : `MIX ${activeMix}`}`;
        }
        if (fiSidebar) {
            fiSidebar.style.display = 'block';
            fiSidebar.innerText = `MIX ${activeMix}`;
            fiSidebar.style.color = '#ffcc00';
        }
        if (sidebarNav) {
            sidebarNav.style.display = 'flex';
            if (navPrev) navPrev.onclick = function () { changeTechnicianMix(-1); };
            if (navNext) navNext.onclick = function () { changeTechnicianMix(1); };
        }
    } else if (musicianMode) {
        if (chTitle) chTitle.style.display = 'none';
        if (tmTitle) tmTitle.style.display = 'none';
        if (fiSidebar) {
            fiSidebar.style.display = 'block';
            fiSidebar.innerText = `FONE ${activeMix}`;
            fiSidebar.style.color = 'white';
        }
        if (sidebarNav) sidebarNav.style.display = 'none';
    } else {
        if (chTitle) chTitle.style.display = 'none';
        if (tmTitle) tmTitle.style.display = 'none';
        if (fiSidebar) fiSidebar.style.display = 'none';
        if (sidebarNav) sidebarNav.style.display = 'none';
    }
}

// Função para atualizar os indicadores de rolagem da dock
function updateDockScrollIndicators() {
    const parent = document.getElementById('sidebarDock');
    const el = document.getElementById('buttonDock');
    if (!parent || !el) return;

    const isPortrait = document.body.classList.contains('is-portrait');
    const isDesktop = document.body.classList.contains('layout-desktop');

    if (isDesktop || parent.style.display === 'none' || parent.offsetParent === null) {
        parent.classList.remove('has-scroll-top', 'has-scroll-bottom', 'has-scroll-left', 'has-scroll-right');
        return;
    }

    if (isPortrait) {
        const scrollLeft = el.scrollLeft;
        const scrollWidth = el.scrollWidth;
        const clientWidth = el.clientWidth;

        if (scrollLeft > 2) {
            parent.classList.add('has-scroll-left');
        } else {
            parent.classList.remove('has-scroll-left');
        }

        if (scrollLeft + clientWidth < scrollWidth - 2) {
            parent.classList.add('has-scroll-right');
        } else {
            parent.classList.remove('has-scroll-right');
        }

        parent.classList.remove('has-scroll-top', 'has-scroll-bottom');
    } else {
        const scrollTop = el.scrollTop;
        const scrollHeight = el.scrollHeight;
        const clientHeight = el.clientHeight;

        if (scrollTop > 2) {
            parent.classList.add('has-scroll-top');
        } else {
            parent.classList.remove('has-scroll-top');
        }

        if (scrollTop + clientHeight < scrollHeight - 2) {
            parent.classList.add('has-scroll-bottom');
        } else {
            parent.classList.remove('has-scroll-bottom');
        }

        parent.classList.remove('has-scroll-left', 'has-scroll-right');
    }
}

// Inicializa eventos para os indicadores
document.addEventListener('DOMContentLoaded', () => {
    const el = document.getElementById('buttonDock');
    if (el) {
        el.addEventListener('scroll', updateDockScrollIndicators);
        el.addEventListener('touchmove', updateDockScrollIndicators, { passive: true });
    }
    window.addEventListener('resize', updateDockScrollIndicators);

    // Configura um MutationObserver para monitorar mudanças nos botões da dock
    const observer = new MutationObserver(updateDockScrollIndicators);
    if (el) {
        observer.observe(el, { childList: true });
    }

    setTimeout(updateDockScrollIndicators, 100);
});

// Exporta para ser chamada manualmente se necessário
window.updateDockScrollIndicators = updateDockScrollIndicators;

var inputChName = document.getElementById('inputChName');
if (inputChName) {
    inputChName.addEventListener('input', function () {
        var cb = document.getElementById('chkCustomName');
        if (cb && cb.checked) {
            var raw = this.value;
            var normalized = raw.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Za-z0-9 ]/g, '');
            if (raw !== normalized) {
                this.value = normalized;
            }
            updateNamePreview();
        }
    });
}
