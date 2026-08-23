/**
 * ============================================================================
 * 01V96 V2 — Testbed & Component Workbench Catalog Script (tests.js)
 * ============================================================================
 *
 * Gerencia a instanciação programática, injeção de sinal de teste de VU meter,
 * simulação de balística e log de eventos em tempo real no Sandbox.
 */

// Estado global do Workbench
window.wbState = {
    viewport: 'both',       // 'both' | 'desktop' | 'mobile'
    meterLevel: 0,          // 0 a 100%
    isAnimating: false,
    animTimer: null,
    peakHoldTimers: {},
    instances: {
        desktop: [],
        mobile: []
    }
};

// ============================================================================
// 1. Catálogo Declarativo de Variações de Canais
// ============================================================================

const DESKTOP_VARIATIONS = [
    {
        id: 'desk_ch1',
        title: '1. Input Mono (1-16 Azul)',
        type: 'input',
        chNumber: 7,
        name: 'VIOLAO',
        colorBand: 'blue',
        faderValue: 623,
        dbValue: '-10.00',
        onState: true,
        soloState: false,
        isLocked: false,
        isDisabled: false,
        panL: 0,
        panR: null,
        patch: 'AD 7',
        isPaired: false
    },
    {
        id: 'desk_ch17',
        title: '2. Input Mono (17-32 Verde)',
        type: 'input',
        chNumber: 17,
        name: 'BUMBO',
        colorBand: 'green',
        faderValue: 780,
        dbValue: '-2.00',
        onState: true,
        soloState: true,
        isLocked: false,
        isDisabled: false,
        panL: 0,
        panR: null,
        patch: 'ADAT 1',
        isPaired: false
    },
    {
        id: 'desk_ch_paired',
        title: '3. Input Pareado (21+22)',
        type: 'input_paired',
        chNumber: '21 + 22',
        name: 'TECLADO',
        colorBand: 'paired_green',
        faderValue: 840,
        dbValue: '+2.20',
        onState: true,
        soloState: false,
        isLocked: false,
        isDisabled: false,
        panL: -32,
        panR: 32,
        patch: 'ADAT 7 / NONE',
        isPaired: true
    },
    {
        id: 'desk_master',
        title: '4. Master LR Stereo',
        type: 'master',
        chNumber: 'MASTER',
        name: 'ST',
        colorBand: 'wine',
        faderValue: 1023,
        dbValue: '0.00',
        onState: true,
        soloState: false,
        isLocked: false,
        isDisabled: false,
        panL: 0,
        panR: null,
        patch: '',
        isMaster: true
    },
    {
        id: 'desk_macro',
        title: '5. Macro Fader Técnico',
        type: 'macro',
        chNumber: 'MACRO',
        name: 'MACRO FADER',
        colorBand: 'macro_silver',
        faderValue: null,
        deltaDb: '--',
        onState: null,
        soloState: null,
        isLocked: false,
        isDisabled: false,
        mode: 'macro'
    },
    {
        id: 'desk_mix_mono',
        title: '6. MIX / Aux Mono (MIX 2)',
        type: 'mix',
        chNumber: 'MIX 2',
        name: 'AUX2',
        colorBand: 'amber',
        faderValue: 920,
        dbValue: '+10.00',
        onState: true,
        soloState: false,
        isLocked: false,
        isDisabled: false,
        patch: 'OMNI 2 + ADAT 2',
        isPaired: false
    },
    {
        id: 'desk_mix_dock_position',
        title: '6.1 Mini-Fader Master Auxiliar com POSIÇÃO (MIX 7)',
        type: 'mix',
        chNumber: 'MIX 7',
        name: 'AUX7',
        colorBand: 'amber',
        faderValue: 1023,
        dbValue: '10.00',
        onState: true,
        soloState: false,
        isLocked: false,
        isDisabled: false,
        hasPositionPanel: true,
        positionGlobal: 'PRE',
        positionPrePoint: 'PRE ON',
        patch: 'ADAT 7',
        isPaired: false
    },
    {
        id: 'desk_bus_mono',
        title: '7. BUS Mono (BUS 3)',
        type: 'bus',
        chNumber: 'BUS 3',
        name: 'GUIT',
        colorBand: 'cyan',
        faderValue: 804,
        dbValue: '0.00',
        onState: true,
        soloState: false,
        isLocked: false,
        isDisabled: false,
        panL: 0,
        panR: null,
        patch: 'FX 2-1',
        isPaired: false
    },
    {
        id: 'desk_bus_paired',
        title: '8. BUS Pareado (BUS 1+2)',
        type: 'bus_paired',
        chNumber: 'BUS 1 + 2',
        name: 'VHIGH',
        colorBand: 'cyan',
        faderValue: 920,
        dbValue: '+10.00',
        onState: true,
        soloState: false,
        isLocked: false,
        isDisabled: false,
        patch: 'FX 1-1 | FX 1-2',
        panL: -32,
        panR: 32,
        isPaired: true
    },
    {
        id: 'desk_st_in',
        title: '9. Stereo In (ST IN 1)',
        type: 'st_in',
        chNumber: 'ST IN 1',
        name: 'REVERB VOZ',
        colorBand: 'st',
        faderValue: 0,
        dbValue: '-∞',
        onState: true,
        soloState: false,
        isLocked: false,
        isDisabled: false,
        panL: -32,
        panR: 32,
        patch: 'FX2-1 / FX2-2',
        isPaired: true
    },
    {
        id: 'desk_aux_send',
        title: '10. Sends on Faders (AUX 4)',
        type: 'aux_send',
        chNumber: 'AUX 4',
        name: 'AUX4',
        colorBand: 'purple',
        faderValue: 700,
        dbValue: '-8.05 dB',
        onState: true,
        soloState: false,
        prePost: 'PRE',
        isLocked: false,
        isDisabled: false,
        patch: 'OMNI 4 + ADAT 4'
    },
    {
        id: 'desk_aux_geral',
        title: '11. Macro Envio Geral (AUX)',
        type: 'macro_aux',
        chNumber: 'AUX',
        name: 'AUX GERAL',
        colorBand: 'macro_silver',
        faderValue: null,
        deltaDb: '--',
        onState: null,
        soloState: null,
        isLocked: false,
        isDisabled: false,
        mode: 'macro_aux',
        hasResetBtn: true
    },
    {
        id: 'desk_locked',
        title: '12. Desktop TRAVADO (🔒)',
        type: 'input',
        chNumber: 8,
        name: 'VIOL AGUDO',
        colorBand: 'blue',
        faderValue: 750,
        dbValue: '-4.00',
        onState: true,
        soloState: false,
        isLocked: true,
        isDisabled: false,
        patch: 'AD 8'
    },
    {
        id: 'desk_disabled',
        title: '13. Desktop FIXED / Disabled',
        type: 'aux_send',
        chNumber: 'AUX 1',
        name: 'AUX1',
        colorBand: 'gray',
        faderValue: 820,
        dbValue: '0.00 dB',
        onState: true,
        soloState: false,
        prePost: 'FIXED',
        isLocked: false,
        isDisabled: true,
        patch: 'FIXED'
    }
];

const MOBILE_VARIATIONS = [
    {
        id: 'mob_mono',
        title: '1. Canal Mono Normal (CH 13)',
        type: 'input',
        chNumber: 'CH 13',
        name: 'SURDAO',
        faderValue: 620,
        dbValue: '-17.50 dB',
        onState: true,
        soloState: false,
        isLocked: false,
        isDisabled: false
    },
    {
        id: 'mob_paired',
        title: '2. Canal Pareado (CH 21+22)',
        type: 'input_paired',
        chNumber: 'CH 21 + 22',
        name: 'TECLADO',
        faderValue: 840,
        dbValue: '2.20 dB',
        onState: true,
        soloState: false,
        isLocked: false,
        isDisabled: false,
        isPaired: true
    },
    {
        id: 'mob_master',
        title: '3. Master LR Stereo',
        type: 'master',
        chNumber: 'MASTER',
        name: 'ST',
        colorBand: 'wine',
        faderValue: 1023,
        dbValue: '0.00 dB',
        onState: true,
        soloState: false,
        isLocked: false,
        isDisabled: false,
        isMaster: true
    },
    {
        id: 'mob_aux_send',
        title: '4. Envio Auxiliar (CH 5 BAIXO)',
        type: 'aux_send',
        chNumber: 'CH 5',
        name: 'BAIXO',
        faderValue: 0,
        dbValue: '-∞ dB',
        onState: true,
        soloState: false,
        prePost: 'PRE',
        isLocked: false,
        isDisabled: false
    },
    {
        id: 'mob_mix_master',
        title: '4.1 Master Auxiliar com POSIÇÃO (MIX 7)',
        type: 'mix',
        chNumber: 'MIX 7',
        name: 'AUX7',
        faderValue: 1023,
        dbValue: '10.00 dB',
        onState: true,
        soloState: false,
        isLocked: false,
        isDisabled: false,
        hasPositionPanel: true
    },
    {
        id: 'mob_macro_tech',
        title: '5. Macro Fader Técnico',
        type: 'macro',
        chNumber: 'MACRO',
        name: 'MACRO FADER',
        colorBand: 'silver',
        deltaDb: '--',
        mode: 'macro'
    },
    {
        id: 'mob_macro_aux',
        title: '6. Volume Geral de AUX',
        type: 'macro_aux',
        chNumber: 'AUX',
        name: 'AUX GERAL',
        colorBand: 'silver',
        deltaDb: '--',
        mode: 'macro_aux',
        hasResetBtn: true
    },
    {
        id: 'mob_macro_musician',
        title: '7. Volume Geral do Músico',
        type: 'macro_musician',
        chNumber: 'GERAL',
        name: 'VOLUME GERAL',
        colorBand: 'silver',
        deltaDb: '--',
        mode: 'macro_musician'
    },
    {
        id: 'mob_locked',
        title: '8. Canal Mobile TRAVADO (🔒)',
        type: 'input',
        chNumber: 'CH 8',
        name: 'VIOL AGUDO',
        faderValue: 750,
        dbValue: '-4.00 dB',
        onState: true,
        soloState: false,
        isLocked: true,
        isDisabled: false
    },
    {
        id: 'mob_disabled',
        title: '9. Mobile FIXED / Disabled',
        type: 'aux_send',
        chNumber: 'AUX 1',
        name: 'AUX1',
        faderValue: 820,
        dbValue: '0.00 dB',
        onState: true,
        soloState: false,
        prePost: 'FIXED',
        isLocked: false,
        isDisabled: true
    }
];

// ============================================================================
// 2. Renderização do Catálogo no Sandbox usando a Classe ChannelStrip Real
// ============================================================================

function initWorkbench() {
    window.wbState.instances.desktop = [];
    window.wbState.instances.mobile = [];

    renderDesktopDeck();
    renderMobileDeck();
    logWbEvent('sys', '🔬 Workbench 01V96 V2: Instâncias reais de ChannelStrip inicializadas.');
}

/**
 * Renderiza os channel strips do deck Desktop
 */
function renderDesktopDeck() {
    const deck = document.getElementById('desktopCatalogDeck');
    if (!deck) return;
    deck.innerHTML = '';
    window.wbState.instances.desktop = [];

    DESKTOP_VARIATIONS.forEach((cfg) => {
        const stripConfig = Object.assign({}, cfg, {
            layout: 'desktop',
            callbacks: {
                fader_change: (data, strip) => {
                    logWbEvent('fader', `[DESKTOP FADER] ${strip.config.name} (${strip.config.chNumber}): Raw ${data.value} (${data.dbText || ''})`);
                },
                rail_blocked: (data, strip) => {
                    logWbEvent('fader', `[DESKTOP RAIL] ${strip.config.name}: ${data.message}`);
                },
                wheel: (data, strip) => {
                    if (data.type === 'pan') {
                        logWbEvent('nudge', `[DESKTOP PAN WHEEL] ${strip.config.name} (${strip.config.chNumber}): ${data.dir > 0 ? '+R' : '-L'}${data.step} -> ${data.value} ${data.side ? `(${data.side})` : ''}`);
                    } else {
                        logWbEvent('nudge', `[DESKTOP WHEEL] ${strip.config.name}: ${data.dir > 0 ? '+' : '-'}${data.step?.toFixed ? data.step.toFixed(2) : data.step} dB`);
                    }
                },
                nudge: (data, strip) => {
                    logWbEvent('nudge', `[DESKTOP NUDGE] ${strip.config.name}: ${data.direction > 0 ? '+' : '-'}${data.step.toFixed(2)} dB`);
                },
                on_toggle: (data, strip) => {
                    logWbEvent('mute', `[DESKTOP ON] ${strip.config.name}: ${data.state ? 'LIGADO' : 'MUTADO'}`);
                },
                solo_toggle: (data, strip) => {
                    logWbEvent('solo', `[DESKTOP SOLO] ${strip.config.name}: ${data.state ? 'ATIVO' : 'DESATIVADO'}`);
                },
                pre_post_toggle: (data, strip) => {
                    logWbEvent('solo', `[DESKTOP PRE/POST] ${strip.config.name} (${data.channel}): Comutado para ${data.mode}`);
                },
                lock_click: (data, strip) => {
                    logWbEvent('lock', `[DESKTOP LOCK] ${strip.config.name}: Ação de trava/destrava solicitada`);
                },
                pan_change: (data, strip) => {
                    logWbEvent('nudge', `[DESKTOP PAN] ${strip.config.name} (${strip.config.chNumber}): L=${data.panL} ${data.panR !== null && data.panR !== undefined ? `R=${data.panR}` : ''} ${data.side ? `(${data.side})` : ''}`);
                },
                pan_reset: (data, strip) => {
                    logWbEvent('nudge', `[DESKTOP PAN RESET] ${strip.config.name}: Pan centralizado em 0 (Centro) ${data.side ? `(${data.side})` : ''}`);
                },
                meters_config_click: (data, strip) => {
                    logWbEvent('lock', `[DESKTOP MEDIDORES] ${strip.config.name}: Modal de configuração de medidores aberto`);
                },
                position_config_click: (data, strip) => {
                    logWbEvent('lock', `[DESKTOP POSIÇÃO] ${strip.config.name} (${data.chNumber}): openAuxConfigModal(${data.mixIdx}) acionado`);
                },
                macro_config_click: (data, strip) => {
                    logWbEvent('lock', `[DESKTOP MACRO CONFIG] ${strip.config.name}: Modal de configuração de canais do Macro aberto`);
                },
                zerar_sends_click: (data, strip) => {
                    logWbEvent('mute', `[DESKTOP ZERAR ENVIOS] ${strip.config.name} (${data.channel}): Solicitação para zerar todos os envios`);
                }
            }
        });

        const strip = new ChannelStrip(stripConfig);
        const stripEl = strip.render();
        deck.appendChild(stripEl);
        window.wbState.instances.desktop.push(strip);
    });
}

/**
 * Renderiza os channel strips do deck Mobile (com agrupamento a cada 8 canais)
 */
function renderMobileDeck() {
    const deck = document.getElementById('mobileCatalogDeck');
    if (!deck) return;
    deck.innerHTML = '';
    window.wbState.instances.mobile = [];

    MOBILE_VARIATIONS.forEach((cfg, idx) => {
        // Insere separador a cada 8 canais
        if (idx > 0 && idx % 8 === 0) {
            const sep = document.createElement('div');
            sep.className = 'wb-mobile-group-separator';
            deck.appendChild(sep);
        }

        const stripConfig = Object.assign({}, cfg, {
            layout: 'mobile',
            callbacks: {
                fader_change: (data, strip) => {
                    logWbEvent('fader', `[MOBILE FADER] ${strip.config.name} (${strip.config.chNumber}): Raw ${data.value} (${data.dbText || ''})`);
                },
                rail_blocked: (data, strip) => {
                    logWbEvent('fader', `[MOBILE RAIL] ${strip.config.name}: ${data.message}`);
                },
                nudge: (data, strip) => {
                    logWbEvent('nudge', `[MOBILE NUDGE] ${strip.config.name}: ${data.direction > 0 ? '+' : '-'}${data.step.toFixed(2)} dB`);
                },
                on_toggle: (data, strip) => {
                    logWbEvent('mute', `[MOBILE ON] ${strip.config.name}: ${data.state ? 'LIGADO' : 'MUTADO'}`);
                },
                solo_toggle: (data, strip) => {
                    logWbEvent('solo', `[MOBILE SOLO] ${strip.config.name}: ${data.state ? 'ATIVO' : 'DESATIVADO'}`);
                },
                lock_click: (data, strip) => {
                    logWbEvent('lock', `[MOBILE LOCK] ${strip.config.name}: Ação de trava/destrava solicitada`);
                },
                meters_config_click: (data, strip) => {
                    logWbEvent('lock', `[MOBILE MEDIDORES] ${strip.config.name}: Modal de configuração de medidores aberto`);
                },
                macro_config_click: (data, strip) => {
                    logWbEvent('lock', `[MOBILE MACRO CONFIG] ${strip.config.name}: Modal de configuração de canais do Macro aberto`);
                },
                zerar_sends_click: (data, strip) => {
                    logWbEvent('mute', `[MOBILE ZERAR ENVIOS] ${strip.config.name} (${data.channel}): Solicitação para zerar todos os envios`);
                }
            }
        });

        const strip = new ChannelStrip(stripConfig);
        const stripEl = strip.render();
        deck.appendChild(stripEl);
        window.wbState.instances.mobile.push(strip);
    });
}

// ============================================================================
// 4. Simulador de Áudio & VU Meter (Injeção de Nível & Peak Hold 1000ms)
// ============================================================================

function setSimulatorLevel(percent) {
    const p = parseFloat(percent);
    window.wbState.meterLevel = p;
    const valDisplay = document.getElementById('wbMeterVal');
    if (valDisplay) valDisplay.innerText = `${Math.round(p)}%`;

    applyMeterLevelsToAll(p);
}

function applyMeterLevelsToAll(p) {
    // 1. Atualiza instâncias reais Desktop
    if (window.wbState.instances.desktop) {
        window.wbState.instances.desktop.forEach(strip => {
            strip.setMeterLevel(p, p);
        });
    }

    // 2. Atualiza instâncias reais Mobile
    if (window.wbState.instances.mobile) {
        window.wbState.instances.mobile.forEach(strip => {
            strip.setMeterLevel(p, p);
        });
    }
}

function triggerSimulatorPeak() {
    const slider = document.getElementById('wbMeterSlider');
    if (slider) slider.value = 100;
    setSimulatorLevel(100);
    logWbEvent('sys', '💥 Pulso de PEAK (100%) injetado — Peak Hold de 1000ms ativado.');
}

/**
 * Onda senoidal automática para testes contínuos de balística
 */
function toggleSimulatorAnimation() {
    const btn = document.getElementById('btnWbAnim');
    window.wbState.isAnimating = !window.wbState.isAnimating;

    if (window.wbState.isAnimating) {
        if (btn) btn.classList.add('active');
        let step = 0;
        window.wbState.animTimer = setInterval(() => {
            step += 0.1;
            const level = Math.round((Math.sin(step) + 1) * 50); // 0 a 100%
            const slider = document.getElementById('wbMeterSlider');
            if (slider) slider.value = level;
            setSimulatorLevel(level);
        }, 50);
        logWbEvent('sys', '🌊 Animação automática de VU Meter iniciada.');
    } else {
        if (btn) btn.classList.remove('active');
        clearInterval(window.wbState.animTimer);
        logWbEvent('sys', '⏹️ Animação automática de VU Meter interrompida.');
    }
}

// ============================================================================
// 5. Controles de Viewport, Temas e Logs
// ============================================================================

function setWbViewport(mode) {
    window.wbState.viewport = mode;
    const secDesk = document.getElementById('sectionDesktop');
    const secMob = document.getElementById('sectionMobile');

    document.querySelectorAll('.wb-btn-toggle').forEach(b => b.classList.remove('active'));

    if (mode === 'both') {
        if (secDesk) secDesk.style.display = 'block';
        if (secMob) secMob.style.display = 'block';
        document.getElementById('btnViewBoth').classList.add('active');
    } else if (mode === 'desktop') {
        if (secDesk) secDesk.style.display = 'block';
        if (secMob) secMob.style.display = 'none';
        document.getElementById('btnViewDesktop').classList.add('active');
    } else if (mode === 'mobile') {
        if (secDesk) secDesk.style.display = 'none';
        if (secMob) secMob.style.display = 'block';
        document.getElementById('btnViewMobile').classList.add('active');
    }
}

function changeWbTheme(themeName) {
    logWbEvent('sys', `🎨 Tema alterado para: ${themeName}`);
    document.body.dataset.theme = themeName;
}

function toggleWbConsole() {
    const p = document.getElementById('wbConsolePanel');
    const btn = document.getElementById('btnToggleConsole');
    if (!p) return;
    p.classList.toggle('collapsed');
    if (btn) btn.classList.toggle('active', !p.classList.contains('collapsed'));
}

function logWbEvent(type, message) {
    const logs = document.getElementById('wbConsoleLogs');
    if (!logs) return;

    const emptyMsg = logs.querySelector('.wb-empty-logs');
    if (emptyMsg) emptyMsg.remove();

    const now = new Date();
    const timeStr = now.toTimeString().split(' ')[0] + '.' + String(now.getMilliseconds()).padStart(3, '0');

    const entry = document.createElement('div');
    entry.className = `wb-log-entry log-${type}`;
    entry.innerHTML = `<span class="wb-log-time">${timeStr}</span><span>${message}</span>`;

    logs.appendChild(entry);
    logs.scrollTop = logs.scrollHeight;
}

function clearWbLogs() {
    const logs = document.getElementById('wbConsoleLogs');
    if (logs) {
        logs.innerHTML = '<div class="wb-empty-logs">Nenhum evento registrado ainda.<br>Interaja com os canais para auditar eventos.</div>';
    }
}

// Inicializa quando o DOM estiver pronto
document.addEventListener('DOMContentLoaded', initWorkbench);
