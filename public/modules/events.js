function openChannelConfig(e, ch) {
    if (musicianMode) return; // Apenas Músico é bloqueado de abrir config base
    if (e.target.closest('button') || e.target.closest('input')) return;

    activeConfigChannel = ch;
    updateConfigUIForChannel(ch);
    activeConfigTab = 'aux'; // Sempre abre em Aux por padrão
    switchTab(activeConfigTab);
}

function updateConfigUIForChannel(ch) {
    const chName = document.getElementById(`name${ch}`).innerText;
    document.getElementById('chSideTitle').innerText = `${ch + 1} - ${chName === '...' ? `CH ${ch + 1}` : chName}`;

    document.getElementById('chConfigModal').style.display = 'flex';
    document.getElementById('mainNav').style.display = 'none';
    document.getElementById('chNav').style.display = 'flex';
    document.getElementById('chContext').style.display = 'flex';

    const miniFader = document.getElementById('miniFaderContext');
    if (miniFader && typeof createChannelStrip === 'function') {
        miniFader.innerHTML = createChannelStrip(ch, false, "mini-");
    }

    // Esconde botões de logout ao entrar na config do canal
    const mExit = document.getElementById('musicianExitBtn');
    if (mExit) mExit.style.display = 'none';
    const tExit = document.getElementById('tecnicoExitBtn');
    if (tExit) tExit.style.display = 'none';

    if (window.autoScaleTitle) autoScaleTitle();

    const cards = document.querySelectorAll('.fader-card');
    cards.forEach(c => c.style.background = '');
    if (cards[ch]) cards[ch].style.background = '#15304d';
}

function changeConfigChannel(delta) {
    let nextCh = activeConfigChannel + delta;
    if (nextCh < 0) nextCh = NUM_CHANNELS - 1;
    if (nextCh >= NUM_CHANNELS) nextCh = 0;

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

    if (ch === 'master') s = masterState;
    else if (typeof ch === 'string' && ch.startsWith('m')) s = mixesState[ch.substring(1)];
    else if (typeof ch === 'string' && ch.startsWith('b')) s = busesState[ch.substring(1)];
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
    if (!e.isTrusted || !appReady) return;
    commitFaderChange(ch, parseInt(e.target.value));
}

function handleWheelFader(e, ch) {
    if (layoutMode !== 'desktop') return;

    // Interromper scroll da tela
    e.preventDefault();
    e.stopPropagation();

    // Incremento de volume
    const delta = e.deltaY < 0 ? 10 : -10;

    let currentVal = 0;
    const isMaster = ch === 'master';
    const stateRef = isMaster ? masterState : (typeof ch === 'string' ? (ch.startsWith('m') ? mixesState[ch.substring(1)] : busesState[ch.substring(1)]) : channelStates[ch]);

    if (stateRef) {
        if ((musicianMode || technicianMixMode) && typeof ch === 'number') currentVal = stateRef[`aux${activeMix}`] || 0;
        else currentVal = stateRef.value || 0;
    }

    let newVal = currentVal + delta;
    if (newVal < 0) newVal = 0;
    if (newVal > 1023) newVal = 1023;

    commitFaderChange(ch, newVal);
}

// Bloqueio AGRESSIVO de scroll por roda do mouse no modo Desktop 
// para priorizar controle de faders e permitir rolagem horizontal apenas por clique-arrasto ou barra
window.addEventListener('wheel', (e) => {
    if (layoutMode === 'desktop') {
        const area = document.getElementById('faders-container');
        if (area && (area === e.target || area.contains(e.target))) {
            e.preventDefault();
            e.stopPropagation();
        }
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
