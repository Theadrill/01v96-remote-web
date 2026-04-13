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
        targetId = `name${ch}`;
        displayTitle = `CH ${ch + 1}`;
    } else if (ch >= 36 && ch <= 43) {
        targetId = `namem${ch - 36}`;
        displayTitle = `MIX ${ch - 35}`;
    } else if (ch >= 44 && ch <= 51) {
        targetId = `nameb${ch - 44}`;
        displayTitle = `BUS ${ch - 43}`;
    } else if (ch === 52) {
        targetId = `namemaster`;
        displayTitle = `MASTER`;
    }

    const nameEl = document.getElementById(targetId);
    const chName = nameEl ? nameEl.innerText : "";
    document.getElementById('chSideTitle').innerText = `${displayTitle} - ${chName || `...`}`;

    document.getElementById('chConfigModal').style.display = 'flex';
    document.getElementById('mainNav').style.display = 'none';
    document.getElementById('chNav').style.display = 'flex';
    document.getElementById('chContext').style.display = 'flex';

    // Esconde rodapés de modo para não bugar a UI com múltiplos botões SAIR
    const outsCtx = document.getElementById('outsContext');
    if (outsCtx) outsCtx.style.display = 'none';
    const techCtx = document.getElementById('techMixContext');
    if (techCtx) techCtx.style.display = 'none';

    const miniFader = document.getElementById('miniFaderContext');
    if (miniFader && typeof createChannelStrip === 'function') {
        const isM = ch === 52;
        const isOut = (ch >= 36 && ch <= 51);
        if (isM) miniFader.innerHTML = createChannelStrip(0, true, "mini-");
        else if (isOut) {
            const type = (ch <= 43) ? 'mix' : 'bus';
            const idx = (ch <= 43) ? (ch - 36) : (ch - 44);
            miniFader.innerHTML = createOutputStrip(idx, type);
        }
        else miniFader.innerHTML = createChannelStrip(ch, false, "mini-");
    }

    // Esconde botões de logout ao entrar na config do canal
    const mExit = document.getElementById('musicianExitBtn');
    if (mExit) mExit.style.display = 'none';
    const tExit = document.getElementById('tecnicoExitBtn');
    if (tExit) tExit.style.display = 'none';

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
    }

    if (currentCard) currentCard.style.background = '#15304d';
}

function changeConfigChannel(delta) {
    let nextCh = activeConfigChannel + delta;
    
    // Pula o "gap" entre 32 e 36
    if (nextCh > 31 && nextCh < 36 && delta > 0) nextCh = 36;
    if (nextCh > 31 && nextCh < 36 && delta < 0) nextCh = 31;

    // Limites
    if (nextCh < 0) nextCh = 52;
    if (nextCh > 52) nextCh = 0;

    activeConfigChannel = nextCh;
    updateConfigUIForChannel(nextCh);

    switchTab(activeConfigTab);
}

function closeChannelConfig() {
    if (window.stopEQAnimation) stopEQAnimation();
    document.getElementById('chConfigModal').style.display = 'none';

    // Restaura o painel principal, a menos que estejamos em fones/mix
    document.getElementById('mainNav').style.display = (musicianMode || technicianMixMode) ? 'none' : 'flex';
    document.getElementById('chNav').style.display = 'none';
    document.getElementById('chContext').style.display = 'none';

    // Restaura rodapés de modo se necessário
    if (outsMode) {
        const outsCtx = document.getElementById('outsContext');
        if (outsCtx) outsCtx.style.display = 'flex';
    }
    if (technicianMixMode) {
        const techCtx = document.getElementById('techMixContext');
        if (techCtx) techCtx.style.display = 'flex';
    }

    const miniFader = document.getElementById('miniFaderContext');
    if (miniFader) miniFader.innerHTML = '';

    // Mostra botões de logout de volta ao sair (respeitando modos)
    if (musicianMode) {
        const mExit = document.getElementById('musicianExitBtn');
        if (mExit) mExit.style.display = 'block';
    } else {
        const tExit = document.getElementById('tecnicoExitBtn');
        if (tExit) tExit.style.display = (outsMode || technicianMixMode) ? 'none' : 'block';
    }

    // Reseta cores dos cards
    document.querySelectorAll('.fader-card').forEach(c => c.style.background = '');

    activeConfigChannel = null;
    initUI();
}

function toggleState(type, ch) {
    let val = false;
    let s;
    let actualType = type;

    if (ch === 'master' || ch === 52) s = masterState;
    else if ((typeof ch === 'string' && ch.startsWith('m')) || (ch >= 36 && ch <= 43)) {
        const idx = typeof ch === 'string' ? ch.substring(1) : (ch - 36);
        s = mixesState[idx];
    }
    else if ((typeof ch === 'string' && ch.startsWith('b')) || (ch >= 44 && ch <= 51)) {
        const idx = typeof ch === 'string' ? ch.substring(1) : (ch - 44);
        s = busesState[idx];
    }
    else s = channelStates[ch];

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
    const emitCh = (ch === 'master') ? 0 : ((typeof ch === 'string' && (ch.startsWith('m') || ch.startsWith('b'))) ? parseInt(ch.substring(1)) : ch);
    socket.emit('control', { type: actualType, channel: emitCh, value: val ? 1 : 0 });
}

let nudgeTimeout = null;
let nudgeInterval = null;

function startNudge(ch, dir) {
    stopNudge();
    nudgeFader(ch, dir);

    nudgeTimeout = setTimeout(() => {
        nudgeInterval = setInterval(() => {
            nudgeFader(ch, dir * 3);
        }, 80);
    }, 500);
}

function stopNudge() {
    if (nudgeTimeout) clearTimeout(nudgeTimeout);
    if (nudgeInterval) clearInterval(nudgeInterval);
    nudgeTimeout = null;
    nudgeInterval = null;
}

function nudgeFader(ch, dir) {
    let s;
    if (ch === 'master') s = masterState;
    else if (typeof ch === 'string' && ch.startsWith('m')) s = mixesState[ch.substring(1)];
    else if (typeof ch === 'string' && ch.startsWith('b')) s = busesState[ch.substring(1)];
    else s = channelStates[ch];

    let currentVal = ((musicianMode || technicianMixMode) && typeof ch === 'number') ? (s[`aux${activeMix}`] || 0) : s.value;

    let nRaw;
    if ((musicianMode || technicianMixMode) && typeof ch === 'number') {
        nRaw = getSteppedRaw(currentVal, dir, 0.5);
    } else {
        nRaw = currentVal + dir;
    }

    if (nRaw < 0) nRaw = 0; if (nRaw > 1023) nRaw = 1023;
    updateUI(ch, nRaw, undefined, undefined);

    const isMaster = ch === 'master';
    const isMixOrBus = typeof ch === 'string' && (ch.startsWith('m') || ch.startsWith('b')) && !isMaster;

    let typeFader;
    if (isMaster) typeFader = 'kStereoFader/kFader';
    else if ((musicianMode || technicianMixMode) && typeof ch === 'number') typeFader = `kInputAUX/kAUX${activeMix}Level`;
    else if (typeof ch === 'string' && ch.startsWith('m')) typeFader = 'kAUXFader/kFader';
    else if (typeof ch === 'string' && ch.startsWith('b')) typeFader = 'kBusFader/kFader';
    else typeFader = 'kInputFader/kFader';

    if (!appReady) return;
    const emitCh = isMaster ? 0 : (isMixOrBus ? parseInt(ch.substring(1)) : ch);
    socket.emit('control', { type: typeFader, channel: emitCh, value: nRaw });
}

function commitFaderChange(ch, v) {
    updateUI(ch, v, undefined, undefined);

    const isMaster = ch === 'master';
    const isMixOrBus = typeof ch === 'string' && (ch.startsWith('m') || ch.startsWith('b')) && !isMaster;

    let typeFader;
    if (isMaster) typeFader = 'kStereoFader/kFader';
    else if ((musicianMode || technicianMixMode) && typeof ch === 'number') typeFader = `kInputAUX/kAUX${activeMix}Level`;
    else if (typeof ch === 'string' && ch.startsWith('m')) typeFader = 'kAUXFader/kFader';
    else if (typeof ch === 'string' && ch.startsWith('b')) typeFader = 'kBusFader/kFader';
    else typeFader = 'kInputFader/kFader';

    if (!appReady) return;
    const emitCh = isMaster ? 0 : (isMixOrBus ? parseInt(ch.substring(1)) : ch);
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

// Bloqueio de scroll por roda do mouse no modo Desktop e manipulação global de sliders
window.addEventListener('wheel', (e) => {
    if (layoutMode !== 'desktop') return;

    // NOVO: Suporte Universal para TODOS os Sliders (EQ, Dynamics, etc)
    const input = e.target.closest('input[type="range"]');
    if (input) {
        // Se o slider já for um fader gerido pelo handleWheelFader (detectado via onwheel no container pai), 
        // deixamos o evento propagar normalmente para ser capturado lá.
        const parentWithWheel = input.parentElement.closest('[onwheel]');
        if (parentWithWheel && parentWithWheel.getAttribute('onwheel').includes('handleWheelFader')) return;

        e.preventDefault();
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
        e.preventDefault();
        e.stopPropagation();
    }
}, { passive: false });

// Logica de Arrastar para Scroll (Grab to Scroll) no Desktop
let isMouseDown = false;
let startX;
let scrollLeft;

document.addEventListener('mousedown', (e) => {
    if (layoutMode !== 'desktop') return;
    const area = e.target.closest('.faders-area');
    if (area && !e.target.closest('input') && !e.target.closest('button')) {
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

        if (isVertical) {
            clickPosPx = clientY - rect.top;
            thumbPosPx = (1 - percent) * rect.height;
        } else {
            clickPosPx = clientX - rect.left;
            thumbPosPx = percent * rect.width;
        }

        const distance = Math.abs(clickPosPx - thumbPosPx);
        const threshold = 45; // Tolerância para tocar no botão real

        if (distance > threshold) {
            if (e.type === 'pointerdown' && e.pointerType === 'mouse') {
                e.preventDefault(); // Mouse: podemos bloquear
            } else if (e.type === 'touchstart' || e.pointerType === 'touch') {
                // Em touch, se evitarmos preventDefault, a página poderá rolar (o que o usuário quer).
                // Para impedir o salto estúpido, "desativamos" o input por um flash de tempo.
                input.disabled = true;
                setTimeout(() => { input.disabled = false; }, 600);
            }
        }
    }
}

window.addEventListener('pointerdown', restrictSliderTrackTap, { capture: true });
window.addEventListener('touchstart', restrictSliderTrackTap, { capture: true, passive: true });
