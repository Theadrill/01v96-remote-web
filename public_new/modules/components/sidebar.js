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
    console.log('🔄 [MANUAL SYNC] Botão MANUAL SYNC clicado!');
    if (typeof OverlayInfo !== 'undefined' && OverlayInfo.show) {
        OverlayInfo.show('sync', 'SINCRONIZANDO...');
    }
    if (typeof socket !== 'undefined' && socket && socket.emit) {
        socket.emit('forceSync', {});
    } else {
        console.error('⚠️ [MANUAL SYNC] Socket não está disponível.');
    }
}
window.forceSync = forceSync;

function toggleOuts() {
    const efeitosModal = document.getElementById('efeitosModal');
    if (efeitosModal && efeitosModal.style.display === 'flex') {
        if (typeof closeEffectsModal === 'function') {
            closeEffectsModal();
        }
        outsMode = true;
    } else {
        outsMode = !outsMode;
    }
    technicianMixMode = false;
    const btn = document.getElementById('dockBtnOuts');
    if (btn) {
        btn.classList.toggle('active-tab', outsMode);
        btn.innerText = outsMode ? 'SAIR' : 'MIX/BUS';
        btn.style.backgroundColor = '';
        btn.style.color = '';
    }
    socket.emit('set_active_view', { view: outsMode ? 'outs' : 'ins' });
    initUI();
}

function enterTechnicianMixMode(mixIdx) {
    activeMix = mixIdx + 1;
    technicianMixMode = true;
    outsMode = false;
    socket.emit('set_active_view', { view: 'techMix' });
    initUI();
}

function exitTechnicianMixMode() {
    technicianMixMode = false;
    outsMode = true;
    socket.emit('set_active_view', { view: 'outs' });
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
    if (window.stopGrPolling) window.stopGrPolling();

    const vgSlot = document.getElementById('miniFaderVolumeGeral');
    if (vgSlot) vgSlot.remove();

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

    if (typeof renderDock === 'function' && activeConfigChannel !== null) renderDock('channelConfig');
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
// Alternância do texto do cabeçalho da sidebar #scn (Nome da Mesa 3s / Relógio 7s)
window.sidebarScnDisplayMode = 'name';
window.currentScnNameText = window.currentScnNameText || '01V96';

function getFormattedSidebarTime() {
    const now = new Date();
    const hrs = String(now.getHours()).padStart(2, '0');
    const mins = String(now.getMinutes()).padStart(2, '0');
    const secs = String(now.getSeconds()).padStart(2, '0');
    return `${hrs}:${mins}:${secs}`;
}

function startScnHeaderToggle() {
    const scn = document.getElementById('scn');
    if (!scn) return;

    setInterval(() => {
        if (window.sidebarScnDisplayMode === 'clock') {
            const scnEl = document.getElementById('scn');
            if (scnEl) {
                scnEl.innerText = getFormattedSidebarTime();
            }
        }
    }, 1000);

    function step() {
        const scnEl = document.getElementById('scn');
        if (!scnEl) return;

        if (window.sidebarScnDisplayMode === 'name') {
            window.sidebarScnDisplayMode = 'clock';
            scnEl.innerText = getFormattedSidebarTime();
            autoScaleElement(scnEl);
            setTimeout(step, 7000);
        } else {
            window.sidebarScnDisplayMode = 'name';
            scnEl.innerText = window.currentScnNameText || '01V96';
            autoScaleElement(scnEl);
            setTimeout(step, 3000);
        }
    }

    window.sidebarScnDisplayMode = 'name';
    scn.innerText = window.currentScnNameText || '01V96';
    autoScaleElement(scn);
    setTimeout(step, 3000);
}

// Inicialização Global
window.addEventListener('DOMContentLoaded', () => {
    updateViewportInfo();
    updateLayoutButtons();
    autoScaleElement(document.getElementById('scn'));
    startScnHeaderToggle();
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
    const cbGlobal = document.getElementById('chkGlobalName');
    if (isChecked) {
        cbGlobal.checked = false;
        input.setAttribute('maxlength', '10');
        updateNamePreview();
        preview.style.display = 'block';
    } else {
        if (!cbGlobal.checked) {
            const val = input.value;
            if (val.length > 4) input.value = val.substring(0, 4);
            input.setAttribute('maxlength', '4');
            preview.style.display = 'none';
        }
    }
};

window.toggleGlobalNameEditor = function () {
    const input = document.getElementById('inputChName');
    const preview = document.getElementById('namePreview');
    const isChecked = document.getElementById('chkGlobalName').checked;
    const cbCustom = document.getElementById('chkCustomName');
    if (isChecked) {
        cbCustom.checked = false;
        input.setAttribute('maxlength', '10');
        updateNamePreview();
        preview.style.display = 'block';
    } else {
        if (!cbCustom.checked) {
            const val = input.value;
            if (val.length > 4) input.value = val.substring(0, 4);
            input.setAttribute('maxlength', '4');
            preview.style.display = 'none';
        }
    }
};

window.removeCustomName = function () {
    const ch = activeConfigChannel;
    if (ch === null) return;
    const isGlobal = document.getElementById('chkGlobalName').checked;
    if (isGlobal) {
        socket.emit('removeGlobalName', { channel: ch, syncShared: window.customScenesSyncEnabled });
        if (window.globalNames) {
            delete window.globalNames[ch];
        }
    } else {
        socket.emit('removeCustomName', { channel: ch, syncShared: window.customScenesSyncEnabled });
        if (window.customNamesEnabled && window.activeCustomSceneChannels) {
            delete window.activeCustomSceneChannels[ch];
        }
    }
    if (window.resolvedNames) {
        delete window.resolvedNames[ch];
    }
    const state = typeof getChannelStateById === 'function' ? getChannelStateById(ch) : null;
    const fallbackName = (state && state.physicalName) || '';
    if (typeof window.updateNameUI === 'function') {
        window.updateNameUI(ch, fallbackName);
    }
    document.getElementById('nameEditorModal').style.display = 'none';
};

window.openNameEditor = function () {
    const ch = activeConfigChannel;
    if (ch === null) return;

    const resolvedObj = window.resolvedNames && window.resolvedNames[ch];
    const chState = typeof getChannelStateById === 'function' ? getChannelStateById(ch) : null;
    const currentName = (resolvedObj && resolvedObj.name) || (chState && chState.name) || '';
    const input = document.getElementById('inputChName');
    input.value = currentName === '...' ? '' : currentName;

    const checkboxCustom = document.getElementById('chkCustomName');
    const checkboxGlobal = document.getElementById('chkGlobalName');
    const preview = document.getElementById('namePreview');
    const removeBtn = document.getElementById('btnRemoveCustomName');

    const customCh = window.customNamesEnabled && window.activeCustomSceneChannels && window.activeCustomSceneChannels[ch];
    const hasCustomName = !!(customCh && typeof customCh.name === 'string');

    const globalCh = window.globalNames && window.globalNames[ch];
    const hasGlobalName = !!(globalCh && typeof globalCh.name === 'string');

    checkboxCustom.checked = hasCustomName && !hasGlobalName;
    checkboxGlobal.checked = hasGlobalName;
    removeBtn.style.display = (hasCustomName || hasGlobalName) ? 'block' : 'none';
    removeBtn.innerText = hasGlobalName ? 'Remover nome global' : (hasCustomName ? 'Remover nome customizado' : '');

    if (hasGlobalName) {
        input.setAttribute('maxlength', '10');
        input.value = globalCh.name;
        updateNamePreview();
        preview.style.display = 'block';
    } else if (hasCustomName) {
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
    const isGlobal = document.getElementById('chkGlobalName').checked;
    let newName = input.value.trim();

    if (isGlobal) {
        newName = normalizeNameEditor(newName).substring(0, 10);
        if (!window.globalNames) window.globalNames = {};
        window.globalNames[ch] = { name: newName, short: newName.substring(0, 4).padEnd(4) };
        if (!window.resolvedNames) window.resolvedNames = {};
        window.resolvedNames[ch] = { name: newName, short: newName.substring(0, 4).padEnd(4), source: 'global' };
        socket.emit('saveGlobalName', { channel: ch, name: newName, syncShared: window.customScenesSyncEnabled });
        if (typeof window.updateNameUI === 'function') {
            window.updateNameUI(ch, newName);
        }
    } else if (isCustom) {
        newName = normalizeNameEditor(newName).substring(0, 10);
        if (!window.activeCustomSceneChannels) window.activeCustomSceneChannels = {};
        window.activeCustomSceneChannels[ch] = { name: newName, short: newName.substring(0, 4).padEnd(4) };
        if (!window.resolvedNames) window.resolvedNames = {};
        window.resolvedNames[ch] = { name: newName, short: newName.substring(0, 4).padEnd(4), source: 'custom' };
        socket.emit('saveCustomName', { channel: ch, name: newName, syncShared: window.customScenesSyncEnabled });
        if (typeof window.updateNameUI === 'function') {
            window.updateNameUI(ch, newName.substring(0, 4));
        }
    } else {
        newName = newName.toUpperCase().substring(0, 4);
        if (!window.resolvedNames) window.resolvedNames = {};
        window.resolvedNames[ch] = { name: newName, short: newName, source: 'physical' };
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
// Usa 'click' em vez de 'pointerdown': no touch, o pointerdown fecha o overlay
// antes do click sintético, que atravessa para o botão por baixo e o dispara.
// Com 'click', o overlay ainda está visível no momento do clique.
window.addEventListener('click', (e) => {
    let closedAny = false;
    if (e.target.classList.contains('modal-overlay')) {
        if (e.target.id === 'routingOverviewModal' && typeof closeRoutingOverviewModal === 'function') {
            closeRoutingOverviewModal();
        } else if (e.target.id === 'assignSceneModal' && typeof closeAssignSceneModal === 'function') {
            closeAssignSceneModal();
        } else {
            e.target.style.display = 'none';
        }
        closedAny = true;
    }
    if (e.target.classList.contains('ch-modal-overlay')) {
        if (e.target.id === 'efeitosModal' && typeof closeEffectsModal === 'function') {
            closeEffectsModal();
        } else if (typeof closeChannelConfig === 'function') {
            closeChannelConfig();
        } else {
            e.target.style.display = 'none';
        }
        closedAny = true;
    }
    if (e.target.classList.contains('mobile-menu-modal-overlay')) {
        e.target.classList.remove('active');
        closedAny = true;
    }

    if (closedAny) {
        e.stopPropagation();
        e.preventDefault();
    }
}, true);

// Navegação por Teclado (Enter/Escape) para Modais
(function () {
    function getTopmostVisibleModal() {
        const selectors = ['.modal-overlay', '.ch-modal-overlay', '.mobile-menu-modal-overlay'];
        let best = null;
        let bestZ = -1;

        selectors.forEach(sel => {
            document.querySelectorAll(sel).forEach(el => {
                const isVisible = window.getComputedStyle(el).display !== 'none' || el.classList.contains('active');
                if (isVisible) {
                    const z = parseInt(window.getComputedStyle(el).zIndex) || 0;
                    if (z > bestZ) {
                        bestZ = z;
                        best = el;
                    }
                }
            });
        });

        return best;
    }

    function closeTopmostModal(topmost) {
        if (topmost.id === 'routingOverviewModal' && typeof closeRoutingOverviewModal === 'function') {
            closeRoutingOverviewModal();
            return;
        }
        if (topmost.classList.contains('ch-modal-overlay')) {
            if (topmost.id === 'efeitosModal' && typeof closeEffectsModal === 'function') {
                closeEffectsModal();
            } else if (typeof closeChannelConfig === 'function') {
                closeChannelConfig();
            } else {
                topmost.style.display = 'none';
            }
            return;
        }
        if (topmost.classList.contains('mobile-menu-modal-overlay')) {
            if (typeof closeMobileMenu === 'function') {
                closeMobileMenu();
            } else {
                topmost.classList.remove('active');
            }
            return;
        }
        topmost.style.display = 'none';
    }

    document.addEventListener('keydown', function (e) {
        const topmost = getTopmostVisibleModal();
        if (!topmost) return;

        if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            closeTopmostModal(topmost);
            return;
        }

        if (e.key === 'Enter' && topmost.id === 'nameEditorModal') {
            e.preventDefault();
            e.stopPropagation();
            if (typeof saveChannelName === 'function') {
                saveChannelName();
            }
        }
    }, true);
})();

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

window.toggleLayerNav = function (enabled) {
    try { localStorage.setItem('01v96_layer_nav', enabled ? 'true' : 'false'); } catch (e) { }
    layerNavEnabled = enabled;
    activeLayerStart = 0;
    if (typeof initUI === 'function') initUI();
};

function setLayer(start) {
    activeLayerStart = start;
    if (typeof initUI === 'function') initUI();
    if (typeof renderDock === 'function') renderDock(window.currentDockMode || 'main');
    const mobileModal = document.getElementById('mobileMenuModal');
    if (mobileModal && !mobileModal.classList.contains('active') && typeof renderMobileMenu === 'function') {
        renderMobileMenu(window.currentDockMode || 'main');
    }
}
window.setLayer = setLayer;

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

window.toggleDesktopScrollbar = function (enabled) {
    localStorage.setItem('01v96_desktop_scrollbar', enabled ? 'true' : 'false');
    if (enabled) {
        document.body.classList.remove('hide-desktop-scrollbar');
    } else {
        document.body.classList.add('hide-desktop-scrollbar');
    }
};

function updateDesktopScrollbarState() {
    const showScrollbar = localStorage.getItem('01v96_desktop_scrollbar') !== 'false';
    const toggleChk = document.getElementById('toggleDesktopScrollbar');
    if (toggleChk) {
        toggleChk.checked = showScrollbar;
    }
    if (showScrollbar) {
        document.body.classList.remove('hide-desktop-scrollbar');
    } else {
        document.body.classList.add('hide-desktop-scrollbar');
    }
}

// Inicializa estado da barra de rolagem imediatamente
updateDesktopScrollbarState();

// Atualiza o display do nome do servidor e endereços de rede sempre que o configModal abrir
document.addEventListener('DOMContentLoaded', () => {
    updateMacrosState();
    updateDesktopScrollbarState();
    const configModal = document.getElementById('configModal');
    if (!configModal) return;
    const observer = new MutationObserver(() => {
        if (configModal.style.display === 'flex') {
            refreshServerNameDisplay();
            updateMacrosState();
            updateDesktopScrollbarState();
            fetchAndRenderNetworkInfo();
            const toggleChk = document.getElementById('toggleLayerNav');
            if (toggleChk) toggleChk.checked = !!layerNavEnabled;
        }
    });
    observer.observe(configModal, { attributes: true, attributeFilter: ['style'] });
});

async function fetchAndRenderNetworkInfo() {
    const listContainer = document.getElementById('networkInfoList');
    if (!listContainer) return;

    listContainer.innerHTML = '<div class="network-info-loading">🔍 Buscando endereços da rede...</div>';

    try {
        const response = await fetch('/api/network-info');
        if (!response.ok) throw new Error('Falha HTTP');
        const data = await response.json();

        if (!data.urls || data.urls.length === 0) {
            listContainer.innerHTML = '<div class="network-info-empty">Nenhum endereço de rede ativo.</div>';
            return;
        }

        const escapeHtml = (str) => String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

        let html = '';
        data.urls.forEach(item => {
            const categoryClass = 'badge-' + (item.category || 'localhost');
            const label = item.label || 'Endereço';
            const url = item.url || '';

            html += `
                <div class="network-card" onclick="copyNetworkUrl('${escapeHtml(url)}', this.querySelector('.network-copy-btn'), event, '${escapeHtml(label)}', '${categoryClass}')" title="Clique para copiar e ver QR Code de ${escapeHtml(url)}">
                    <div class="network-card-details">
                        <span class="network-card-badge ${categoryClass}">${escapeHtml(label)}</span>
                        <span class="network-card-url">${escapeHtml(url)}</span>
                    </div>
                    <button class="network-copy-btn" onclick="copyNetworkUrl('${escapeHtml(url)}', this, event, '${escapeHtml(label)}', '${categoryClass}')">
                        COPIAR
                    </button>
                </div>
            `;
        });

        listContainer.innerHTML = html;
    } catch (err) {
        console.error('[NETWORK] Erro ao buscar endereços do servidor:', err);
        listContainer.innerHTML = '<div class="network-info-empty">⚠️ Não foi possível carregar os endereços do servidor.</div>';
    }
}

window.fetchAndRenderNetworkInfo = fetchAndRenderNetworkInfo;

window.copyNetworkUrl = function (url, btnElement, event, label, categoryClass) {
    if (event) {
        event.stopPropagation();
    }

    const triggerCopySuccess = () => {
        if (typeof OverlayInfo !== 'undefined' && OverlayInfo.show) {
            OverlayInfo.show('copied', 'ENDEREÇO COPIADO!');
        }
        showCopiedFeedback(btnElement);
        openQrCodeModal(url, label, categoryClass);
    };

    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(url).then(triggerCopySuccess).catch(() => fallbackCopy(url, triggerCopySuccess));
    } else {
        fallbackCopy(url, triggerCopySuccess);
    }
};

window.openQrCodeModal = function (url, label, categoryClass) {
    const modal = document.getElementById('qrCodeModal');
    if (!modal) return;

    const qrBadge = document.getElementById('qrBadge');
    const qrLabelText = document.getElementById('qrLabelText');
    const qrUrlText = document.getElementById('qrUrlText');
    const container = document.getElementById('qrCodeCanvasContainer');

    if (qrBadge) {
        qrBadge.className = 'network-card-badge ' + (categoryClass || 'badge-lan');
        qrBadge.innerText = (label || 'REDE LOCAL').toUpperCase();
    }
    if (qrLabelText) qrLabelText.innerText = 'Escaneie para Conectar';
    if (qrUrlText) qrUrlText.innerText = url;

    if (container) {
        container.innerHTML = '';
        if (typeof QRCode !== 'undefined') {
            const size = window.innerWidth <= 480 ? 220 : 200;
            new QRCode(container, {
                text: url,
                width: size,
                height: size,
                colorDark: '#000000',
                colorLight: '#ffffff'
            });
        }
    }

    modal.style.display = 'flex';
};

window.closeQrCodeModal = function (event) {
    if (event && event.target && event.target.closest('.qr-modal-card') && !event.target.classList.contains('qr-modal-close-icon') && !event.target.classList.contains('qr-modal-close-btn')) {
        return;
    }
    const modal = document.getElementById('qrCodeModal');
    if (modal) {
        modal.style.display = 'none';
    }
};

function fallbackCopy(url, onSuccess) {
    const textArea = document.createElement('textarea');
    textArea.value = url;
    textArea.style.position = 'fixed';
    textArea.style.opacity = '0';
    document.body.appendChild(textArea);
    textArea.select();
    try {
        document.execCommand('copy');
        if (typeof onSuccess === 'function') onSuccess();
    } catch (e) {
        console.error('[COPY] Erro no fallback de cópia', e);
    }
    document.body.removeChild(textArea);
}

function showCopiedFeedback(btnElement) {
    if (!btnElement) return;
    const originalText = btnElement.innerText;
    btnElement.innerText = 'COPIADO!';
    btnElement.classList.add('copied');
    setTimeout(() => {
        btnElement.innerText = originalText;
        btnElement.classList.remove('copied');
    }, 1500);
}

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
            buttons.push({ label: 'OUVIR', action: "document.getElementById('monitoringModal').style.display='flex'; refreshMonitoringDevices()", cls: 'dock-monitoring' });
            buttons.push({ label: 'EFEITOS', action: 'openEffectsModal()', cls: 'dock-efeitos' });
            buttons.push({ label: 'ROTEAMENTO', action: 'openRoutingOverviewModal()', cls: 'dock-routing' });
            buttons.push({ label: 'MEDIDORES', action: "if(typeof openMeterConfigModal==='function') openMeterConfigModal('master')", cls: 'dock-meter-config' });
            if (typeof layerNavEnabled !== 'undefined' && layerNavEnabled) {
                buttons.push({ label: '1-16', action: 'setLayer(0)', cls: 'dock-layer' + (activeLayerStart === 0 ? ' active-tab' : '') });
                buttons.push({ label: '17-32', action: 'setLayer(16)', cls: 'dock-layer' + (activeLayerStart === 16 ? ' active-tab' : '') });
            }
            buttons.push({ label: 'SAIR', action: "triggerExitActiveMode()", cls: 'dock-exit' });
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
                cls: 'dock-tab' + (tab === 'etc' ? ' dock-tab-etc' : '') + (tab === activeConfigTab ? ' active-tab' : '')
            }));
            const isValidEtc = (activeConfigChannel >= 0 && activeConfigChannel <= 31) || (activeConfigChannel >= 44 && activeConfigChannel <= 51) || (activeConfigChannel >= 60 && activeConfigChannel <= 67);
            const showCopyPaste = (
                (activeConfigTab === 'aux') ||
                (activeConfigTab === 'dyn' && !(activeConfigChannel >= 60 && activeConfigChannel <= 67)) ||
                (activeConfigTab === 'etc' && isValidEtc)
            );
            if (activeConfigChannel !== null && showCopyPaste) {
                buttons.push({ label: 'COPIAR', action: 'copyActiveContext()', cls: 'dock-copy' });
                buttons.push({ label: 'COLAR', action: 'pasteActiveContext()', id: 'dockBtnPasteMix', cls: 'dock-paste disabled' });
            }
            buttons.push({ label: 'OUVIR', action: "document.getElementById('monitoringModal').style.display='flex'; refreshMonitoringDevices()", cls: 'dock-monitoring' });
            buttons.push({ label: 'SAIR', action: 'closeChannelConfig()', cls: 'dock-close' });
            break;
        }
        case 'outs': {
            buttons = [
                { label: 'OUVIR', action: "document.getElementById('monitoringModal').style.display='flex'; refreshMonitoringDevices()", cls: 'dock-monitoring' },
                { label: 'SAIR', action: 'toggleOuts()', cls: 'dock-close' }
            ];
            break;
        }
        case 'techMix': {
            buttons = [
                { label: 'COPIAR', action: 'copyActiveContext()', cls: 'dock-copy' },
                { label: 'COLAR', action: 'pasteActiveContext()', id: 'dockBtnPasteMix', cls: 'dock-paste disabled' },
                { label: 'OUVIR', action: "document.getElementById('monitoringModal').style.display='flex'; refreshMonitoringDevices()", cls: 'dock-monitoring' },
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
            buttons.push({ label: 'OUVIR', action: "document.getElementById('monitoringModal').style.display='flex'; refreshMonitoringDevices()", cls: 'dock-monitoring' });
            buttons.push({ label: 'SAIR', action: 'showLogoutConfirm()', cls: 'dock-close' });
            break;
        }
    }

    if (mode !== 'main' && mode !== 'musician') {
        buttons.unshift({ label: 'CONFIG', action: "document.getElementById('configModal').style.display='flex'", cls: 'dock-config' });
    }

    dock.innerHTML = buttons.map(b =>
        `<button class="dock-btn ${b.cls || ''}" onclick="${b.action}"${b.id ? ` id="${b.id}"` : ''}>${b.label}</button>`
    ).join('');

    if (typeof window.updateCopyPasteUIState === 'function') {
        window.updateCopyPasteUIState();
    }

    // Sincroniza o novo menu mobile se ele não estiver ativo
    if (typeof renderMobileMenu === 'function' && document.getElementById('mobileMenuModal') && !document.getElementById('mobileMenuModal').classList.contains('active')) {
        renderMobileMenu(mode);
    }
}

function isModalOpen(el) {
    if (!el) return false;
    if (el.style.display === 'flex' || el.style.display === 'block') return true;
    return window.getComputedStyle(el).display !== 'none';
}

function showLogoutConfirm() {
    ConfirmModal.show({
        title: 'Confirmação',
        message: 'Deseja realmente sair e voltar para a tela inicial?',
        type: 'danger',
        confirmText: 'SIM, SAIR',
        cancelText: 'CANCELAR'
    }).then(function(ok) {
        if (ok) {
            clearRole();
            location.reload();
        }
    });
}

function triggerExitActiveMode() {
    const fxEditorModal = document.getElementById('fxEditorModal');
    if (isModalOpen(fxEditorModal)) {
        if (window.ReverbEditor && typeof window.ReverbEditor.close === 'function') {
            window.ReverbEditor.close();
            return;
        }
    }
    const efeitosModal = document.getElementById('efeitosModal');
    if (isModalOpen(efeitosModal)) {
        if (typeof closeEffectsModal === 'function') {
            closeEffectsModal();
            return;
        }
    }
    const chModal = document.getElementById('chConfigModal');
    if (isModalOpen(chModal) || (typeof activeConfigChannel !== 'undefined' && activeConfigChannel !== null)) {
        if (typeof closeChannelConfig === 'function') {
            closeChannelConfig();
            return;
        }
    }
    const mode = window.currentDockMode;
    if (mode === 'channelConfig') {
        if (typeof closeChannelConfig === 'function') closeChannelConfig();
    } else if (mode === 'outs') {
        if (typeof toggleOuts === 'function') toggleOuts();
    } else if (mode === 'techMix') {
        if (typeof exitTechnicianMixMode === 'function') exitTechnicianMixMode();
    } else if (mode === 'main' || mode === 'musician') {
        showLogoutConfirm();
    } else {
        showLogoutConfirm();
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

    const ch = (typeof activeConfigChannel !== 'undefined' && activeConfigChannel !== null)
        ? activeConfigChannel
        : (typeof window.activeConfigChannel !== 'undefined' && window.activeConfigChannel !== null
            ? window.activeConfigChannel
            : (typeof ChannelSetupCore !== 'undefined' && typeof ChannelSetupCore.getActiveChannel === 'function' ? ChannelSetupCore.getActiveChannel() : null));

    if (ch !== null) {
        let targetId = `name${ch}`;
        let displayTitle = `${ch + 1}`;

        if (ch >= 0 && ch <= 31) {
            const s = typeof channelStates !== 'undefined' ? channelStates[ch] : null;
            targetId = `name${ch}`;
            displayTitle = (s && s.paired) ? `CH ${ch + 1} + ${ch + 2}` : `CH ${ch + 1}`;
        } else if (ch >= 36 && ch <= 43) {
            targetId = `namem${ch - 36}`;
            displayTitle = `MIX ${ch - 35}`;
        } else if (ch >= 44 && ch <= 51) {
            targetId = `nameb${ch - 44}`;
            displayTitle = `BUS ${ch - 43}`;
        } else if (ch === 52) {
            targetId = `namemaster`;
            displayTitle = `MASTER`;
        } else if (ch >= 60 && ch <= 67) {
            const stIdx = (ch - 60) / 2;
            targetId = `namest${stIdx}`;
            displayTitle = `ST IN ${stIdx + 1}`;
        }

        const nameEl = document.getElementById(targetId);
        const stateRef = typeof getChannelStateById === 'function' ? getChannelStateById(ch) : null;
        let name = (window.resolvedNames && window.resolvedNames[ch] && window.resolvedNames[ch].name) || (nameEl ? nameEl.innerText.trim() : '');
        if (!name && stateRef && stateRef.name) name = stateRef.name;

        if (chTitle) {
            chTitle.style.display = 'flex';
            chTitle.innerText = `${displayTitle} - ${name || '...'}`;
            if (window.autoScaleTitle) window.autoScaleTitle();
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

/* ==========================================================================
   REESTRUTURAÇÃO MOBILE RETRATO - DOCK E MENU MODAL
   ========================================================================== */

document.addEventListener("DOMContentLoaded", () => {
    const menuBtn = document.getElementById("mobileMenuBtn");
    const sairBtn = document.getElementById("mobileSairBtn");

    if (menuBtn) {
        menuBtn.addEventListener("click", () => {
            toggleMobileMenu();
        });
    }

    if (sairBtn) {
        sairBtn.addEventListener("click", () => {
            handleMobileSairAction();
        });
    }
});

function handleMobileSairAction() {
    const modal = document.getElementById("mobileMenuModal");

    // PRIORIDADE 1: Se o menu estiver aberto, apenas fecha o menu
    if (modal && modal.classList.contains("active")) {
        closeMobileMenu();
        return;
    }

    // Unificado com a ação geral de saída do aplicativo
    triggerExitActiveMode();
}

function toggleMobileMenu() {
    const modal = document.getElementById("mobileMenuModal");
    if (!modal) return;

    if (modal.classList.contains("active")) {
        closeMobileMenu();
    } else {
        // Renderiza as opções atualizadas com base no modo ativo antes de exibir
        const currentMode = window.currentDockMode || 'main';
        renderMobileMenu(currentMode);
        modal.classList.add("active");
    }
}

function closeMobileMenu() {
    const modal = document.getElementById("mobileMenuModal");
    if (modal) {
        modal.classList.remove("active");
    }
}

function renderMobileMenu(mode) {
    const menuList = document.getElementById("mobileMenuList");
    if (!menuList) return;

    // Limpa os itens anteriores
    menuList.innerHTML = "";

    let buttonsConfig = [];

    // Definição dos botões baseado no escopo aprovado
    switch (mode) {
        case 'main':
            buttonsConfig = [
                { label: 'Configurações do App', isConfig: true, action: "document.getElementById('configModal').style.display='flex';" },
            ];
            if (typeof layerNavEnabled !== 'undefined' && layerNavEnabled) {
                buttonsConfig.push({ label: 'LAYER 1-16', cls: activeLayerStart === 0 ? 'menu-btn-solid-blue' : '', action: "if(typeof setLayer === 'function') setLayer(0);" });
                buttonsConfig.push({ label: 'LAYER 17-32', cls: activeLayerStart === 16 ? 'menu-btn-solid-blue' : '', action: "if(typeof setLayer === 'function') setLayer(16);" });
            }
            buttonsConfig.push({ label: 'MIX / BUS', cls: 'menu-btn-solid-green', action: "if(typeof toggleOuts === 'function') { toggleOuts(); }" });
            buttonsConfig.push({ label: 'EFEITOS', cls: 'menu-btn-solid-purple', action: "if(typeof openEffectsModal === 'function') { openEffectsModal(); }" });
            buttonsConfig.push({ label: 'ROTEAMENTO GERAL', cls: 'menu-btn-solid-blue', action: "if(typeof openRoutingOverviewModal === 'function') { openRoutingOverviewModal(); }" });
            buttonsConfig.push({ label: 'MEDIDORES', cls: 'menu-btn-solid-blue', action: "if(typeof openMeterConfigModal === 'function') { openMeterConfigModal('master'); }" });
            break;

        case 'channelConfig':
            buttonsConfig = [
                { label: 'Configurações do App', isConfig: true, action: "document.getElementById('configModal').style.display='flex';" },
                { label: 'EQ', cls: 'menu-btn-solid-blue', action: "if(typeof switchTab === 'function') { switchTab('eq'); }" },
                { label: 'DYN', action: "if(typeof switchTab === 'function') { switchTab('dyn'); }" },
                { label: 'AUX', cls: 'menu-btn-solid-green', action: "if(typeof switchTab === 'function') { switchTab('aux'); }" },
                { label: 'ROUTING / ETC', cls: 'menu-btn-solid-red', action: "if(typeof switchTab === 'function') { switchTab('etc'); }" }
            ];
            const isValidEtc = (activeConfigChannel >= 0 && activeConfigChannel <= 31) || (activeConfigChannel >= 44 && activeConfigChannel <= 51) || (activeConfigChannel >= 60 && activeConfigChannel <= 67);
            const showCopyPasteMobile = (
                (activeConfigTab === 'aux') ||
                (activeConfigTab === 'dyn' && !(activeConfigChannel >= 60 && activeConfigChannel <= 67)) ||
                (activeConfigTab === 'etc' && isValidEtc)
            );
            if (typeof activeConfigTab !== 'undefined' && typeof activeConfigChannel !== 'undefined' && activeConfigChannel !== null && showCopyPasteMobile) {
                buttonsConfig.push({ label: 'COPIAR', id: 'mobileMenuBtnCopy', cls: 'dock-copy', action: 'copyActiveContext()' });
                buttonsConfig.push({ label: 'COLAR', id: 'mobileMenuBtnPaste', cls: 'dock-paste disabled', action: 'pasteActiveContext()' });
            }
            break;

        case 'techMix': // O modo de edição de barramento herda a mesma estrutura de canal
            buttonsConfig = [
                { label: 'Configurações do App', isConfig: true, action: "document.getElementById('configModal').style.display='flex';" },
                { label: 'EQ', cls: 'menu-btn-solid-blue', action: "if(typeof switchTab === 'function') { switchTab('eq'); }" },
                { label: 'DYN', action: "if(typeof switchTab === 'function') { switchTab('dyn'); }" },
                { label: 'AUX', cls: 'menu-btn-solid-green', action: "if(typeof switchTab === 'function') { switchTab('aux'); }" },
                { label: 'ROUTING / ETC', cls: 'menu-btn-solid-red', action: "if(typeof switchTab === 'function') { switchTab('etc'); }" },
                { label: 'COPIAR', id: 'mobileMenuBtnCopy', cls: 'dock-copy', action: 'copyActiveContext()' },
                { label: 'COLAR', id: 'mobileMenuBtnPaste', cls: 'dock-paste disabled', action: 'pasteActiveContext()' }
            ];
            break;

        case 'outs':
            buttonsConfig = [
                { label: 'Configurações do App', isConfig: true, action: "document.getElementById('configModal').style.display='flex';" }
            ];
            break;

        default:
            buttonsConfig = [
                { label: 'Configurações do App', isConfig: true, action: "document.getElementById('configModal').style.display='flex';" }
            ];
            break;
    }

    // SEMPRE adiciona a opção Fullscreen no final de qualquer menu
    buttonsConfig.push({
        label: 'FULLSCREEN',
        action: "if(typeof toggleFullScreen === 'function') { toggleFullScreen(); } else { if(!document.fullscreenElement) { document.documentElement.requestFullscreen(); } else { document.exitFullscreen(); } }"
    });

    // Injeta os elementos HTML mapeados no container do modal
    buttonsConfig.forEach(btn => {
        const buttonElement = document.createElement("button");
        buttonElement.innerText = btn.label;
        buttonElement.className = "mobile-menu-item";

        if (btn.isConfig) {
            buttonElement.classList.add("menu-btn-solid-yellow"); // Aplica a cor de fundo amarela
        }

        if (btn.cls) {
            btn.cls.split(/\s+/).forEach(c => {
                if (c) buttonElement.classList.add(c);
            });
        }

        if (btn.id) {
            buttonElement.id = btn.id;
        }

        // Configura o evento de clique injetando a ação string ou função nativa correspondente
        buttonElement.onclick = () => {
            // Fecha o menu antes de disparar a ação para limpar o fluxo visual
            closeMobileMenu();

            // Executa a ação
            if (typeof btn.action === 'string') {
                new Function(btn.action)();
            } else if (typeof btn.action === 'function') {
                btn.action();
            }
        };

        menuList.appendChild(buttonElement);
    });

    if (typeof window.updateCopyPasteUIState === 'function') {
        window.updateCopyPasteUIState();
    }
}

/**
 * Reset de Cache e Forçar Recarregamento da Aplicação
 * Limpa CacheStorage e ServiceWorkers preservando 100% o localStorage.
 */
window.resetAppCacheAndReload = async function () {
    try {
        console.log("🧹 Iniciando limpeza de cache da aplicação...");

        // 1. Limpa todas as instâncias da CacheStorage API
        if ('caches' in window) {
            const cacheKeys = await caches.keys();
            await Promise.all(cacheKeys.map(key => caches.delete(key)));
            console.log("✅ Caches da CacheStorage API limpos:", cacheKeys);
        }

        // 2. Desregistra Service Workers se existirem
        if ('serviceWorker' in navigator) {
            const registrations = await navigator.serviceWorker.getRegistrations();
            for (let registration of registrations) {
                await registration.unregister();
            }
            console.log("✅ Service Workers desregistrados:", registrations.length);
        }
    } catch (err) {
        console.warn("⚠️ Erro ao limpar alguns caches:", err);
    } finally {
        console.log("🔄 Recarregando página com cache-busting...");
        // 3. Força o recarregamento da página com parâmetro timestamp na URL
        const cleanPath = window.location.pathname;
        window.location.href = cleanPath + '?reload=' + Date.now();
    }
};
