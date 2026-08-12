function openChannelConfig(e, ch) {
    if (musicianMode) return; // Apenas Músico é bloqueado de abrir config base
    if (e.target.closest('button') || e.target.closest('input')) return;

    activeConfigChannel = ch;
    updateConfigUIForChannel(ch);
    activeConfigTab = 'aux'; // Sempre abre em Aux por padrão
    switchTab(activeConfigTab);
}

function updateConfigUIForChannel(ch) {
    let targetId = `name${ch}`;
    let displayTitle = `${ch + 1}`;

    if (ch >= 0 && ch <= 31) {
        const s = channelStates[ch];
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
    const chName = nameEl ? nameEl.innerText : "";
    document.getElementById('chSideTitle').innerText = `${displayTitle} - ${chName || `...`}`;

    document.getElementById('chConfigModal').style.display = 'flex';

    // Sidebar: channel config mode
    if (typeof renderDock === 'function') renderDock('channelConfig');
    if (typeof updateSidebarInfo === 'function') updateSidebarInfo();

    // Ocultar aba DYN para canais ST IN (não possuem Dynamics na 01v96)
    const dynTabBtn = document.querySelectorAll('.dock-tab')[1];
    if (dynTabBtn) {
        dynTabBtn.style.display = (ch >= 60 && ch <= 67) ? 'none' : '';
    }

    const miniFader = document.getElementById('miniFaderContext');
    if (miniFader && typeof createChannelStrip === 'function') {
        const isM = ch === 52;
        const isOut = (ch >= 36 && ch <= 51);
        if (isM) miniFader.innerHTML = createChannelStrip(0, true, "mini-");
        else if (isOut) {
            const type = (ch <= 43) ? 'mix' : 'bus';
            const idx = (ch <= 43) ? (ch - 36) : (ch - 44);
            miniFader.innerHTML = createOutputStrip(idx, type, "mini-");
        }
        else if (ch >= 60 && ch <= 67) {
            miniFader.innerHTML = createOutputStrip((ch - 60) / 2, 'stIn', "mini-");
        }
        else miniFader.innerHTML = createChannelStrip(ch, false, "mini-");
    }

    if (window.autoScaleTitle) autoScaleTitle();

    // Remove realce de todos
    document.querySelectorAll('.fader-card').forEach(c => c.style.background = '');

    // Aplica realce no card correto
    let currentCard = null;
    if (ch >= 0 && ch <= 31) {
        currentCard = document.querySelectorAll('.fader-card')[ch];
    } else if (ch >= 36 && ch <= 43) {
        const idx = ch - 36;
        currentCard = document.querySelectorAll('.fader-group-mix')[idx];
    } else if (ch >= 44 && ch <= 51) {
        const idx = ch - 44;
        currentCard = document.querySelectorAll('.fader-group-bus')[idx];
    } else if (ch === 52) {
        currentCard = document.querySelector('.master-card');
    } else if (ch >= 60 && ch <= 67) {
        const idx = (ch - 60) / 2;
        currentCard = document.querySelectorAll('.fader-group-st')[idx];
    }

    if (currentCard) currentCard.style.background = '#15304d';
}

function changeConfigChannel(delta) {
    let nextCh = activeConfigChannel;

    let safetyCounter = 0;
    do {
        if (nextCh >= 60 && nextCh <= 67) {
            nextCh += delta * 2;
        } else {
            nextCh += delta;
        }

        if (nextCh > 31 && nextCh < 36 && delta > 0) nextCh = 36;
        if (nextCh > 31 && nextCh < 36 && delta < 0) nextCh = 31;

        if (nextCh > 52 && nextCh < 60 && delta > 0) nextCh = 60;
        if (nextCh > 52 && nextCh < 60 && delta < 0) nextCh = 52;

        if (nextCh < 0) nextCh = 66;
        if (nextCh > 66) nextCh = 0;

        const s = (nextCh >= 0 && nextCh <= 31) ? channelStates[nextCh] : null;
        if (!s || !s.paired || nextCh % 2 === 0) break;

        safetyCounter++;
    } while (nextCh !== activeConfigChannel && safetyCounter < 100);

    activeConfigChannel = nextCh;
    updateConfigUIForChannel(nextCh);

    switchTab(activeConfigTab);
}

function closeChannelConfig() {
    if (window.stopEQAnimation) stopEQAnimation();
    if (typeof window.stopMixVolumeGeralNudge === 'function') window.stopMixVolumeGeralNudge();
    if (typeof window.stopAuxVolumeGeralNudge === 'function') window.stopAuxVolumeGeralNudge();
    document.getElementById('chConfigModal').style.display = 'none';

    activeConfigChannel = null;
    const miniFader = document.getElementById('miniFaderContext');
    if (miniFader) miniFader.innerHTML = '';

    const vgSlot = document.getElementById('miniFaderVolumeGeral');
    if (vgSlot) vgSlot.remove();

    initUI();

    document.querySelectorAll('.fader-card').forEach(c => c.style.background = '');
}

function toggleState(type, ch) {
    let val = false;
    const s = getChannelStateById(ch);
    if (!s) return;
    let actualType = type;

    // Se no modo músico ou técnico editando mix, o tipo base recebido (kInputChannelOn) vira o AUX ativo
    if ((musicianMode || technicianMixMode) && typeof ch === 'number' && type === 'kInputChannelOn/kChannelOn') {
        actualType = `kInputAUX/kAUX${activeMix}On`;
    }

    // Lógica Genérica de Toggle para Booleanos
    if (actualType.includes('On') || actualType.includes('Solo')) {
        let currentOn;
        if ((musicianMode || technicianMixMode) && typeof ch === 'number' && actualType.includes('kInputAUX/kAUX')) {
            currentOn = s[`aux${activeMix}On`] || false;
        } else {
            currentOn = actualType.includes('Solo') ? s.solo : s.on;
        }

        val = !currentOn;

        // Atualiza a visualização local
        if (actualType.includes('Solo')) {
            updateUI(ch, undefined, undefined, val);
        } else {
            updateUI(ch, undefined, val, undefined);
        }
    }

    // Para Mix/Bus, o canal emitido é o número após m/b. 
    // Importante: verificar 'master' primeiro para não confundir com Mixes (que começam com 'm')
    if (!appReady) return;
    let emitCh = ch;
    if (ch === 'master' || ch === 52) {
        emitCh = 0;
    } else if (typeof ch === 'string' && ch.startsWith('m')) {
        emitCh = parseInt(ch.substring(1));
        if (actualType === 'kSetupSoloChOn/kSoloChOn') emitCh += 40;
    } else if (typeof ch === 'string' && ch.startsWith('b')) {
        emitCh = parseInt(ch.substring(1));
        if (actualType === 'kSetupSoloChOn/kSoloChOn') emitCh += 48;
    } else if (typeof ch === 'string' && (ch.startsWith('st') || ch.startsWith('CH'))) {
        // Fallback or ST IN parsing if ever passed as string
        emitCh = parseInt(ch.substring(2)) || parseInt(ch.substring(1));
    }
    socket.emit('control', { type: actualType, channel: emitCh, value: val ? 1 : 0 });
}

let nudgeTimeout = null;
let nudgeInterval = null;
let nudgeMaxDuration = null;

function startNudge(ch, dir) {
    stopNudge();
    nudgeFader(ch, dir);

    nudgeTimeout = setTimeout(() => {
        nudgeInterval = setInterval(() => {
            nudgeFader(ch, dir * 3);
        }, 80);
    }, 500);

    nudgeMaxDuration = setTimeout(() => {
        stopNudge();
    }, 10000);
}

function stopNudge() {
    if (nudgeTimeout) clearTimeout(nudgeTimeout);
    if (nudgeInterval) clearInterval(nudgeInterval);
    if (nudgeMaxDuration) clearTimeout(nudgeMaxDuration);
    nudgeTimeout = null;
    nudgeInterval = null;
    nudgeMaxDuration = null;
}

function nudgeFader(ch, dir) {
    const s = getChannelStateById(ch);
    if (!s) return;

    let currentVal = ((musicianMode || technicianMixMode) && typeof ch === 'number') ? (s[`aux${activeMix}`] || 0) : s.value;

    let nRaw;
    if ((musicianMode || technicianMixMode) && typeof ch === 'number') {
        nRaw = getSteppedRaw(currentVal, dir, 0.5);
    } else {
        nRaw = currentVal + dir;
    }

    if (nRaw < 0) nRaw = 0; if (nRaw > 1023) nRaw = 1023;
    updateUI(ch, nRaw, undefined, undefined);

    const isMaster = ch === 'master' || ch === 52;
    const isMix = (typeof ch === 'string' && ch.startsWith('m')) || (typeof ch === 'number' && ch >= 36 && ch <= 43);
    const isBus = (typeof ch === 'string' && ch.startsWith('b')) || (typeof ch === 'number' && ch >= 44 && ch <= 51);
    const isStIn = typeof ch === 'number' && ch >= 60 && ch <= 67;

    let typeFader;
    if (isMaster) typeFader = 'kStereoFader/kFader';
    else if ((musicianMode || technicianMixMode) && typeof ch === 'number' && ch < 32) typeFader = `kInputAUX/kAUX${activeMix}Level`;
    else if (isMix) typeFader = 'kAUXFader/kFader';
    else if (isBus) typeFader = 'kBusFader/kFader';
    else typeFader = 'kInputFader/kFader';

    if (!appReady) return;

    let emitCh = ch;
    if (isMaster) emitCh = 0;
    else if (typeof ch === 'string') emitCh = parseInt(ch.substring(1));

    socket.emit('control', { type: typeFader, channel: emitCh, value: nRaw });
}

function commitFaderChange(ch, v) {
    updateUI(ch, v, undefined, undefined);

    const isMaster = ch === 'master' || ch === 52;
    const isMix = (typeof ch === 'string' && ch.startsWith('m')) || (typeof ch === 'number' && ch >= 36 && ch <= 43);
    const isBus = (typeof ch === 'string' && ch.startsWith('b')) || (typeof ch === 'number' && ch >= 44 && ch <= 51);
    const isStIn = typeof ch === 'number' && ch >= 60 && ch <= 67;

    let typeFader;
    if (isMaster) typeFader = 'kStereoFader/kFader';
    else if ((musicianMode || technicianMixMode) && typeof ch === 'number' && ch < 32) typeFader = `kInputAUX/kAUX${activeMix}Level`;
    else if (isMix) typeFader = 'kAUXFader/kFader';
    else if (isBus) typeFader = 'kBusFader/kFader';
    else typeFader = 'kInputFader/kFader';

    if (!appReady) return;

    let emitCh = ch;
    if (isMaster) emitCh = 0;
    else if (typeof ch === 'string') emitCh = parseInt(ch.substring(1));

    socket.emit('control', { type: typeFader, channel: emitCh, value: v });
}

function faderInput(e, ch) {
    if (!appReady) return;
    commitFaderChange(ch, parseInt(e.target.value));
}

function handleWheelFader(e, ch, auxIdx) {
    if (layoutMode !== 'desktop') return;

    // Interromper scroll da tela
    e.preventDefault();
    e.stopPropagation();

    // Determinar se estamos na "Tela Principal" (Visão de canais técnica, sem modais abertos)
    const isMainScreen = (activeConfigChannel === null && !musicianMode && !outsMode && !technicianMixMode);
    const dir = e.deltaY < 0 ? 1 : -1;

    // Caso 1: Fader de Aux Send (dentro de renderAuxs ou sidebar de mix)
    if (auxIdx !== undefined) {
        const state = getChannelStateById(ch);
        if (!state) return;
        const currentRaw = state[`aux${auxIdx}`] || 0;
        // Sempre 0.5dB para envios auxiliares/músico conforme pedido ("0.5db nos demais")
        const nRaw = getSteppedRaw(currentRaw, dir, 0.5);

        if (typeof updateAuxManual === 'function') {
            updateAuxManual(ch, auxIdx, nRaw);
            socket.emit('control', { type: `kInputAUX/kAUX${auxIdx}Level`, channel: ch, value: nRaw });
        }
        return;
    }

    // Caso 2: Fader de Canal (Input, Mix, Bus ou Master)
    let currentVal = 0;
    const isMaster = ch === 'master';
    const stateRef = getChannelStateById(ch);

    if (stateRef) {
        if ((musicianMode || technicianMixMode) && typeof ch === 'number') {
            currentVal = stateRef[`aux${activeMix}`] || 0;
        } else {
            currentVal = stateRef.value || 0;
        }
    }

    let newVal;
    if (isMainScreen) {
        // "Fine tuning" na tela principal: 2 unidades raw (~0.2% do fader)
        newVal = currentVal + (dir * 2);
    } else {
        // 0.5dB de passo nos demais casos (Modais, Modo Músico, etc)
        newVal = getSteppedRaw(currentVal, dir, 0.5);
    }

    if (newVal < 0) newVal = 0;
    if (newVal > 1023) newVal = 1023;

    commitFaderChange(ch, newVal);
}

function handleWheelPan(e, ch1, ch2) {

    // Interromper scroll da tela
    e.preventDefault();
    e.stopPropagation();

    // Decide qual canal usar (se houver dois)
    let ch = ch1;
    if (ch2 !== undefined && ch2 !== null) {
        const rect = e.currentTarget.getBoundingClientRect();
        const mid = rect.top + (rect.height / 2);
        if (e.clientY > mid) ch = ch2;
    }

    const state = getChannelStateById(ch);
    if (!state) return;

    // Valor atual ou 0 (Centro)
    let currentPan = (state.pan !== undefined) ? state.pan : 0;
    
    // Roda para cima (negativo deltaY) incrementa (move para R)
    // Roda para baixo (positivo deltaY) decrementa (move para L)
    const dir = e.deltaY < 0 ? 1 : -1;
    let newPan = currentPan + dir;

    // Limites da Yamaha 01V96 (-63 a +63)
    if (newPan < -63) newPan = -63;
    if (newPan > 63) newPan = 63;

    // Feedback imediato na UI
    if (typeof updatePanIndicator === 'function') {
        updatePanIndicator(ch, newPan);
    }

    // Atualiza estado local para consistência
    state.pan = newPan;

    // Emite para o servidor
    if (appReady) {
        socket.emit('setPan', { channel: ch, value: newPan });
    }
}

function resetPan(e, ch1, ch2) {

    e.preventDefault();
    e.stopPropagation();

    // Decide qual canal usar (se houver dois)
    let ch = ch1;
    if (ch2 !== undefined && ch2 !== null) {
        const rect = e.currentTarget.getBoundingClientRect();
        const mid = rect.top + (rect.height / 2);
        if (e.clientY > mid) ch = ch2;
    }

    const state = getChannelStateById(ch);
    if (!state) return;

    const centerValue = 0;

    // Feedback imediato na UI
    if (typeof updatePanIndicator === 'function') {
        updatePanIndicator(ch, centerValue);
    }

    // Atualiza estado local
    state.pan = centerValue;

    // Emite para o servidor
    if (appReady) {
        socket.emit('setPan', { channel: ch, value: centerValue });
    }
}

let panLongPressTimeout = null;
let isPanDragging = false;
let activePanChannel = null;
let activePanTrack = null;
let panPressStartTime;

function startPanLongPress(e, ch1, ch2) {
    e.stopPropagation();
    e.preventDefault(); // Impede o disparo de mousedown legado
    
    stopPanLongPress(e);

    const target = e.currentTarget;
    const clientX = e.clientX;
    const clientY = e.clientY;
    panPressStartTime = Date.now();
    
    // Decide qual canal usar (se houver dois)
    let ch = ch1;
    if (ch2 !== undefined && ch2 !== null) {
        const rect = target.getBoundingClientRect();
        const mid = rect.top + (rect.height / 2);
        if (clientY > mid) ch = ch2;
    }

    activePanChannel = ch;
    activePanTrack = e.currentTarget.querySelector('.desk-pan-track') || e.currentTarget;

    panLongPressTimeout = setTimeout(() => {
        isPanDragging = true;
        // Salto inicial ao ativar o modo drag
        jumpPanToPosition(activePanTrack, clientX, activePanChannel);
        // Captura o ponteiro para permitir arrastar fora da área da barra
        if (target.setPointerCapture) target.setPointerCapture(e.pointerId);
    }, 350); // 350ms para disparar o modo de arrasto
}

function handlePanPointerMove(e) {
    if (!isPanDragging || activePanChannel === null || !activePanTrack) return;
    
    e.preventDefault();
    jumpPanToPosition(activePanTrack, e.clientX, activePanChannel);
}

function stopPanLongPress(e) {
    if (!panPressStartTime && !panLongPressTimeout) return;
    
    const duration = panPressStartTime ? (Date.now() - panPressStartTime) : 0;
    console.log('[Events] stopPanLongPress:', { isPanDragging, duration, layoutMode, activePanTrack, hasBubbleModal: typeof window.BubbleModal !== 'undefined' });
    
    if (!isPanDragging && duration > 0 && duration < 350 && layoutMode === 'desktop' && activePanTrack && typeof window.BubbleModal !== 'undefined') {
        window.BubbleModal.show({ targetEl: activePanTrack, message: '💡 Clique e segure para ajustar o Pan' });
    }
    panPressStartTime = null;

    if (panLongPressTimeout) clearTimeout(panLongPressTimeout);
    panLongPressTimeout = null;
    
    if (isPanDragging && activePanTrack && e && e.pointerId) {
        if (activePanTrack.releasePointerCapture) activePanTrack.releasePointerCapture(e.pointerId);
    }
    
    isPanDragging = false;
    activePanChannel = null;
    activePanTrack = null;
}

function jumpPanToPosition(track, clickX, ch) {
    if (!track) return;

    const rect = track.getBoundingClientRect();
    const width = rect.width;
    const offsetX = clickX - rect.left;

    let pct = offsetX / width;
    if (pct < 0) pct = 0;
    if (pct > 1) pct = 1;

    // -63 a 63
    let newPan = Math.round((pct * 126) - 63);

    if (typeof updatePanIndicator === 'function') {
        updatePanIndicator(ch, newPan);
    }

    const state = getChannelStateById(ch);
    if (state) state.pan = newPan;

    if (appReady) {
        socket.emit('setPan', { channel: ch, value: newPan });
    }
}

// Bloqueio de scroll por roda do mouse no modo Desktop e manipulação global de sliders
const isMobileEvents = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

window.addEventListener('wheel', (e) => {
    if (layoutMode !== 'desktop') return;

    // NOVO: Suporte Universal para TODOS os Sliders (EQ, Dynamics, etc)
    const input = e.target.closest('input[type="range"]');
    if (input) {
        // Se o slider já for um fader gerido pelo handleWheelFader (detectado via onwheel no container pai), 
        // deixamos o evento propagar normalmente para ser capturado lá.
        const parentWithWheel = input.parentElement.closest('[onwheel]');
        if (parentWithWheel && parentWithWheel.getAttribute('onwheel').includes('handleWheelFader')) return;

        if (!isMobileEvents) e.preventDefault();
        e.stopPropagation();

        const dir = e.deltaY < 0 ? 1 : -1;
        const step = parseFloat(input.step) || 1;
        const currentVal = parseFloat(input.value) || 0;
        const min = parseFloat(input.min) || 0;
        const max = parseFloat(input.max) || 100;

        let newVal = currentVal + (dir * step);
        if (newVal < min) newVal = min;
        if (newVal > max) newVal = max;

        input.value = newVal;
        // Dispara o evento de input para que o módulo dono do slider (EQ, Comp, etc) processe a lógica
        input.dispatchEvent(new Event('input', { bubbles: true }));
        return;
    }

    // Bloqueio de scroll na área dos faders (permitindo apenas horizontal via grab)
    const area = document.getElementById('faders-container');
    if (area && (area === e.target || area.contains(e.target))) {
        if (!isMobileEvents) e.preventDefault();
        e.stopPropagation();
    }
}, { passive: isMobileEvents });

// Logica de Arrastar para Scroll (Grab to Scroll) no Desktop
let isMouseDown = false;
let startX;
let scrollLeft;

document.addEventListener('mousedown', (e) => {
    if (layoutMode !== 'desktop') return;
    const area = e.target.closest('.faders-area');
    if (area && !e.target.closest('input') && !e.target.closest('button') && !e.target.closest('.desk-pan-indicator')) {
        isMouseDown = true;
        area.classList.add('is-grabbing');
        startX = e.pageX - area.offsetLeft;
        scrollLeft = area.scrollLeft;
    }
});

document.addEventListener('mouseleave', () => {
    isMouseDown = false;
    const area = document.querySelector('.faders-area');
    if (area) area.classList.remove('is-grabbing');
});

document.addEventListener('mouseup', () => {
    isMouseDown = false;
    const area = document.querySelector('.faders-area');
    if (area) area.classList.remove('is-grabbing');
});

document.addEventListener('mousemove', (e) => {
    if (!isMouseDown) return;
    const area = e.target.closest('.faders-area') || document.querySelector('.faders-area');
    if (!area) return;
    e.preventDefault();
    const x = e.pageX - area.offsetLeft;
    const walk = (x - startX) * 1.0; // Velocidade do scroll
    area.scrollLeft = scrollLeft - walk;
});

// Proteção Global contra cliques no corpo (track) do slider
// Impede que o volume "pule" para o local clicado, permitindo apenas o arrasto do thumb
let sliderRevertState = null;

function restrictSliderTrackTap(e) {
    if (e.target.tagName === 'INPUT' && e.target.type === 'range') {
        const input = e.target;
        const rect = input.getBoundingClientRect();

        // Detecta orientação
        const isVertical = input.getAttribute('orient') === 'vertical' ||
            input.clientHeight > input.clientWidth ||
            (window.getComputedStyle(input).writingMode || "").includes('vertical');

        const min = parseFloat(input.min || 0);
        const max = parseFloat(input.max || 100);
        let val = parseFloat(input.value);
        if (isNaN(val)) val = 0;
        const percent = (val - min) / (max - min);

        let clientY = (e.touches && e.touches.length > 0) ? e.touches[0].clientY : e.clientY;
        let clientX = (e.touches && e.touches.length > 0) ? e.touches[0].clientX : e.clientX;

        let clickPosPx, thumbPosPx;
        let threshold;

        if (isVertical) {
            // Mobile (vertical): corrige posição do thumb considerando seu tamanho real
            const thumbSize = 40;
            clickPosPx = clientY - rect.top;
            thumbPosPx = (1 - percent) * (rect.height - thumbSize) + thumbSize / 2;
            threshold = thumbSize / 2 + 6; // ~26px: só permite tocar DENTRO do thumb
        } else {
            // Desktop (horizontal): mantém comportamento original
            clickPosPx = clientX - rect.left;
            thumbPosPx = percent * rect.width;
            threshold = 45;
        }

        const distance = Math.abs(clickPosPx - thumbPosPx);

        if (distance > threshold) {
            if (e.type === 'pointerdown') {
                // Previne o salto do thumb no browser (mouse E touch)
                e.preventDefault();
            }
            if (e.type === 'touchstart' || e.pointerType === 'touch') {
                // Fallback: desabilita o input temporariamente como segurança
                input.disabled = true;
                setTimeout(() => { input.disabled = false; }, 600);
            }
        }
    }
}

window.addEventListener('pointerdown', restrictSliderTrackTap, { capture: true });
window.addEventListener('touchstart', restrictSliderTrackTap, { capture: true, passive: true });

document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
        stopNudge();
    }
});
