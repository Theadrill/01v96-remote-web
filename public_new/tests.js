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
        faderValue: 680,
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
        faderValue: 820,
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
        id: 'desk_bus_paired',
        title: '7. BUS Pareado (BUS 1+2)',
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
        isPaired: true
    },
    {
        id: 'desk_st_in',
        title: '8. Stereo In (ST IN 1)',
        type: 'st_in',
        chNumber: 'ST IN 1',
        name: 'REVERB VOZ',
        colorBand: 'blue',
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
        title: '9. Sends on Faders (AUX 4)',
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
        title: '10. Macro Envio Geral (AUX)',
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
        title: '11. Desktop TRAVADO (🔒)',
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
        title: '12. Desktop FIXED / Disabled',
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
        chNumber: 'STEREO',
        name: 'ST',
        faderValue: 820,
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
        id: 'mob_macro_tech',
        title: '5. Macro Fader Técnico',
        type: 'macro',
        chNumber: 'MACRO',
        name: 'MACRO FADER',
        deltaDb: '--',
        mode: 'macro'
    },
    {
        id: 'mob_macro_aux',
        title: '6. Volume Geral de AUX',
        type: 'macro_aux',
        chNumber: 'AUX',
        name: 'AUX GERAL',
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
// 2. Renderização do Catálogo no Sandbox
// ============================================================================

function initWorkbench() {
    renderDesktopDeck();
    renderMobileDeck();
    logWbEvent('sys', 'Workbench 01V96 V2 inicializado com sucesso.');
}

/**
 * Renderiza os channel strips do deck Desktop
 */
function renderDesktopDeck() {
    const deck = document.getElementById('desktopCatalogDeck');
    if (!deck) return;
    deck.innerHTML = '';

    DESKTOP_VARIATIONS.forEach((cfg, idx) => {
        const stripEl = createStripCard(cfg, 'desktop');
        deck.appendChild(stripEl);
    });
}

/**
 * Renderiza os channel strips do deck Mobile (com agrupamento a cada 8 canais)
 */
function renderMobileDeck() {
    const deck = document.getElementById('mobileCatalogDeck');
    if (!deck) return;
    deck.innerHTML = '';

    MOBILE_VARIATIONS.forEach((cfg, idx) => {
        // Insere separador a cada 8 canais
        if (idx > 0 && idx % 8 === 0) {
            const sep = document.createElement('div');
            sep.className = 'wb-mobile-group-separator';
            deck.appendChild(sep);
        }

        const stripEl = createStripCard(cfg, 'mobile');
        deck.appendChild(stripEl);
    });
}

/**
 * Cria o elemento HTML de um Channel Strip de teste
 */
function createStripCard(cfg, layout) {
    const card = document.createElement('div');
    card.id = `wb_strip_${cfg.id}`;
    card.className = `channel-strip-wrapper ${layout === 'desktop' ? 'desk-strip' : 'mob-strip'} ${cfg.isPaired ? 'paired-channel' : ''} ${cfg.isLocked ? 'is-locked' : ''} ${cfg.isDisabled ? 'is-disabled' : ''} ${cfg.colorBand ? 'band-' + cfg.colorBand : ''}`;
    card.dataset.id = cfg.id;
    card.dataset.layout = layout;
    card.dataset.type = cfg.type;

    // Constrói HTML representativo das 7 Zonas Modulares
    if (layout === 'desktop') {
        card.innerHTML = buildDesktopStripHTML(cfg);
    } else {
        card.innerHTML = buildMobileStripHTML(cfg);
    }

    attachStripEvents(card, cfg, layout);
    return card;
}

/**
 * Construtor HTML Desktop das 7 Zonas Modulares
 */
function buildDesktopStripHTML(cfg) {
    const isMacro = cfg.mode && cfg.mode.startsWith('macro');
    const isMaster = cfg.isMaster;
    const isPaired = cfg.isPaired;

    if (isMacro) {
        return `
            <div class="desk-label-wrapper">
                <span class="desk-ch-num">${cfg.chNumber}</span>
            </div>
            <div class="desk-ch-name-zone">
                <span class="desk-ch-name">${cfg.name}</span>
            </div>
            <div class="desk-macro-feature-zone" style="padding: 4px; text-align: center;">
                <button class="macro-config-btn" style="background: #6b21a8; color:#fff; border:none; border-radius:4px; padding:3px 6px; font-size:10px; font-weight:bold; cursor:pointer;">[ CONFIG ]</button>
                <div class="macro-delta-display" style="background:#000; color:#00ff00; font-family:monospace; font-size:12px; margin-top:4px; padding:2px; border-radius:3px;">${cfg.deltaDb || '--'}</div>
            </div>
            <div class="desk-fader-core macro-fader-core" style="padding: 10px 6px; display:flex; flex-direction:column; gap:8px;">
                <button class="desk-big-nudge btn-nudge-plus" style="height: 60px; font-size: 20px; font-weight: bold; background:#fff; color:#000; border-radius:6px; cursor:pointer;">+</button>
                <button class="desk-big-nudge btn-nudge-minus" style="height: 60px; font-size: 20px; font-weight: bold; background:#fff; color:#000; border-radius:6px; cursor:pointer;">-</button>
            </div>
            ${cfg.hasResetBtn ? `
                <div style="padding: 4px; text-align: center;">
                    <button class="btn-zerar-sends" style="background:#dc2626; color:#fff; border:none; border-radius:4px; padding:4px 8px; font-size:10px; font-weight:bold; cursor:pointer;">[ ZERAR ]</button>
                </div>
            ` : ''}
            <div class="desk-footer-zone" style="text-align:center; padding:4px; font-size:11px; background:#111; color:#888;">
                ${cfg.chNumber}
            </div>
        `;
    }

    return `
        <!-- ZONA 1: Header Tripartite -->
        <div class="desk-label-wrapper">
            <span class="desk-slot-left"></span>
            <span class="desk-ch-num">${cfg.chNumber}</span>
            <span class="desk-slot-right">${cfg.isLocked ? '🔒' : ''}</span>
        </div>

        <!-- ZONA 2: Top Action / Solo -->
        <div class="desk-top-action-zone">
            ${cfg.prePost ? `
                <button class="btn-pre-post ${cfg.prePost.toLowerCase()}">${cfg.prePost}</button>
            ` : `
                <button class="desk-btn-solo ${cfg.soloState ? 'active' : ''}">SOLO</button>
            `}
        </div>

        <!-- ZONA 3: Display OLED -->
        <div class="desk-ch-name-zone">
            <span class="desk-ch-name">${cfg.name}</span>
        </div>

        <!-- ZONA 4: Middle Feature (Medidores no Master / Info) -->
        ${isMaster ? `
            <div class="desk-master-meters-toggle" style="font-size: 9px; text-align: center; padding: 2px; color: #888;">
                <div>MEDIDORES</div>
                <div>POST / PREEQ</div>
            </div>
        ` : ''}

        <!-- ZONA 5: Primary Action (ON) & Nudge Superior -->
        <div class="desk-primary-action-zone">
            <button class="desk-btn-on ${cfg.onState ? 'active' : ''}">ON</button>
            <button class="desk-nudge-btn desk-nudge-plus" title="Nudge + (Clique ou segure)">+</button>
        </div>

        <!-- ZONA 6: Fader Core (dB, Régua, Fader Rail, VU Meter & Peak LED) -->
        <div class="desk-fader-core">
            <div class="desk-db-readout">${cfg.dbValue || '-10.00'}</div>
            <div class="desk-fader-track-area" style="position: relative; display: flex; height: 180px; align-items: stretch; justify-content: center;">

                <!-- Régua de dB -->
                <div class="desk-db-ruler" style="width: 28px; font-size: 8px; color: #666; display: flex; flex-direction: column; justify-content: space-between;">
                    <span>+10</span><span>0</span><span>-10</span><span>-30</span><span>-∞</span>
                </div>

                <!-- Trilho do Fader (Desabilitado para clique direto) -->
                <div class="desk-fader-rail" style="width: 20px; position: relative; display: flex; justify-content: center;">
                    <div class="desk-rail-groove" style="width: 4px; height: 100%; background: #111; border-radius: 2px;"></div>
                    <div class="desk-fader-thumb" style="width: 24px; height: 38px; background: linear-gradient(180deg, #555, #222); border: 1px solid #777; border-radius: 3px; position: absolute; bottom: ${((cfg.faderValue || 0) / 1023) * 100}%; cursor: grab; box-shadow: 0 2px 5px rgba(0,0,0,0.5);">
                        <div style="width: 100%; height: 2px; background: #fff; position: absolute; top: 50%; margin-top: -1px;"></div>
                    </div>
                </div>

                <!-- VU Meter 60FPS + Peak LED -->
                <div class="desk-meter-column" style="width: ${isPaired ? '16px' : '10px'}; display: flex; flex-direction: column; align-items: center; gap: 2px; margin-left: 4px;">
                    <!-- Peak LED Circular -->
                    <div class="desk-peak-led-group" style="display: flex; gap: 2px;">
                        <div class="desk-peak-led" id="peak_${cfg.id}_L" style="width: 6px; height: 6px; border-radius: 50%; background: #252525; border: 1px solid #111;"></div>
                        ${isPaired ? `<div class="desk-peak-led" id="peak_${cfg.id}_R" style="width: 6px; height: 6px; border-radius: 50%; background: #252525; border: 1px solid #111;"></div>` : ''}
                    </div>

                    <!-- Barra de Medidor VU -->
                    <div class="desk-meter-bar-track" style="flex: 1; width: 100%; background: #111; border-radius: 2px; display: flex; gap: 2px; padding: 1px; box-sizing: border-box;">
                        <div class="desk-vu-fill" id="vu_${cfg.id}_L" style="flex: 1; background: #10b981; border-radius: 1px; height: 0%; margin-top: auto; transition: height 0.05s linear;"></div>
                        ${isPaired ? `<div class="desk-vu-fill" id="vu_${cfg.id}_R" style="flex: 1; background: #10b981; border-radius: 1px; height: 0%; margin-top: auto; transition: height 0.05s linear;"></div>` : ''}
                    </div>
                </div>

            </div>

            <!-- Nudge Inferior (-) -->
            <button class="desk-nudge-btn desk-nudge-minus" title="Nudge - (Clique ou segure)">-</button>
        </div>

        <!-- ZONA 7: Footer Routing & Panpot -->
        <div class="desk-footer-zone">
            ${isPaired ? `
                <div class="desk-dual-pan" style="padding: 2px 4px; font-size: 8px;">
                    <div class="pan-line">L: [ ${cfg.panL || -32} ]</div>
                    <div class="pan-line">R: [ ${cfg.panR || 32} ]</div>
                </div>
            ` : `
                <div class="desk-single-pan" style="padding: 2px 4px; font-size: 8px; text-align: center;">
                    L [ | ] R
                </div>
            `}
            ${cfg.patch ? `
                <div class="desk-patch-badge" style="background: #111; color: #aaa; font-size: 9px; padding: 2px 4px; text-align: center; overflow: hidden; white-space: nowrap;">
                    <span class="marquee-text">${cfg.patch}</span>
                </div>
            ` : ''}
        </div>

        <!-- Overlay de Bloqueio se Travado (Locked) -->
        ${cfg.isLocked ? `
            <div class="desk-lock-overlay" style="position: absolute; inset: 0; background: rgba(255, 0, 0, 0.15); border: 2px solid #ff4444; border-radius: 6px; display: flex; flex-direction: column; justify-content: flex-end; align-items: center; padding-bottom: 8px; z-index: 50; pointer-events: auto;">
                <div class="lock-badge-btn" style="background: #ff4444; color: #fff; width: 26px; height: 26px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 13px; cursor: pointer; box-shadow: 0 0 10px rgba(255,68,68,0.6);" title="Clique para destravar">🔒</div>
            </div>
        ` : ''}
    `;
}

/**
 * Construtor HTML Mobile das Variações Padronizadas
 */
function buildMobileStripHTML(cfg) {
    const isMacro = cfg.mode && cfg.mode.startsWith('macro');
    const isPaired = cfg.isPaired;

    if (isMacro) {
        return `
            <div class="mob-card-header">
                <span class="mob-ch-num">${cfg.chNumber}</span>
            </div>
            <div class="mob-display-name">
                <span>${cfg.name}</span>
            </div>
            <div style="padding: 4px; text-align: center;">
                <button style="background:#6b21a8; color:#fff; border:none; border-radius:4px; padding:4px 8px; font-size:11px; font-weight:bold;">[ CONFIG ]</button>
                <div style="background:#000; color:#00ff00; font-family:monospace; font-size:14px; margin-top:6px; padding:4px; border-radius:4px;">${cfg.deltaDb || '--'}</div>
            </div>
            <div style="display: flex; flex-direction: column; gap: 8px; padding: 12px 6px;">
                <button class="mob-big-nudge btn-nudge-plus" style="height: 70px; font-size: 24px; font-weight: bold; background: #fff; color: #000; border-radius: 8px; border: none; cursor: pointer;">+</button>
                <button class="mob-big-nudge btn-nudge-minus" style="height: 70px; font-size: 24px; font-weight: bold; background: #fff; color: #000; border-radius: 8px; border: none; cursor: pointer;">-</button>
            </div>
            ${cfg.hasResetBtn ? `
                <div style="padding: 6px; text-align: center;">
                    <button style="background: #dc2626; color: #fff; border: none; border-radius: 6px; padding: 6px 12px; font-size: 11px; font-weight: bold;">[ ZERAR ]</button>
                </div>
            ` : ''}
        `;
    }

    return `
        <!-- Cortina de Medidor VU de Fundo Integral (100% da área do card) -->
        <div class="mob-meter-curtain-container" style="position: absolute; inset: 0; z-index: 0; pointer-events: none; overflow: hidden; border-radius: 10px; display: flex;">
            <div class="mob-meter-curtain" id="mob_vu_${cfg.id}_L" style="flex: 1; height: 0%; margin-top: auto; background: linear-gradient(180deg, #ff0000 0%, #ffbb00 25%, #22c55e 60%, #10b981 100%); opacity: 0.35; transition: height 0.05s linear;"></div>
            ${isPaired ? `<div class="mob-meter-curtain" id="mob_vu_${cfg.id}_R" style="flex: 1; height: 0%; margin-top: auto; background: linear-gradient(180deg, #ff0000 0%, #ffbb00 25%, #22c55e 60%, #10b981 100%); opacity: 0.35; transition: height 0.05s linear; border-left: 1px solid rgba(255,255,255,0.1);"></div>` : ''}
        </div>

        <!-- Conteúdo dos Controles sobre a Cortina -->
        <div class="mob-card-content" style="position: relative; z-index: 1; display: flex; flex-direction: column; height: 100%; justify-content: space-between; padding: 8px 4px; box-sizing: border-box;">

            <!-- Zona 1: Header Centralizado -->
            <div class="mob-card-header" style="text-align: center; font-weight: 800; font-size: 13px; color: #fff;">
                ${cfg.chNumber}
            </div>

            <!-- Zona 3: Display do Canal -->
            <div class="mob-display-name" style="background: #000; border: 1px solid #333; border-radius: 4px; padding: 4px; text-align: center; color: #00ff00; font-weight: 700; font-size: 11px;">
                ${cfg.name}
            </div>

            <!-- Zona 2: Top Action / Solo / Pre -->
            <div class="mob-top-action" style="text-align: center;">
                ${cfg.prePost ? `
                    <button class="mob-btn-pre" style="background: #6b21a8; color: #fff; border: none; border-radius: 4px; padding: 4px 8px; font-size: 10px; font-weight: bold; width: 80%;">${cfg.prePost}</button>
                ` : `
                    <button class="mob-btn-solo ${cfg.soloState ? 'active' : ''}" style="background: #222; color: #eab308; border: 1px solid #444; border-radius: 4px; padding: 4px 8px; font-size: 10px; font-weight: bold; width: 80%;">SOLO</button>
                `}
            </div>

            <!-- Zona 5: Botão ON (Mute) -->
            <div class="mob-primary-action" style="text-align: center;">
                <button class="mob-btn-on ${cfg.onState ? 'active' : ''}" style="background: ${cfg.onState ? '#f59e0b' : '#333'}; color: #000; border: none; border-radius: 4px; padding: 6px 12px; font-size: 11px; font-weight: 800; width: 80%;">ON</button>
            </div>

            <!-- Nudge Superior (+) -->
            <div style="text-align: center;">
                <button class="mob-nudge-btn mob-nudge-plus" style="background: #252a38; color: #fff; border: 1px solid #444; border-radius: 4px; width: 36px; height: 28px; font-size: 14px; font-weight: bold; cursor: pointer;">+</button>
            </div>

            <!-- Fader Rail Central (Sem salto ao toque direto) -->
            <div class="mob-fader-track-area" style="position: relative; height: 160px; display: flex; justify-content: center; align-items: stretch; margin: 4px 0;">
                <div class="mob-fader-groove" style="width: 6px; height: 100%; background: #111; border-radius: 3px;"></div>
                <div class="mob-fader-thumb" style="width: 38px; height: 44px; background: linear-gradient(180deg, #666, #222); border: 1px solid #888; border-radius: 6px; position: absolute; bottom: ${((cfg.faderValue || 0) / 1023) * 100}%; cursor: grab; box-shadow: 0 4px 10px rgba(0,0,0,0.6);">
                    <div style="width: 100%; height: 3px; background: #00e5ff; position: absolute; top: 50%; margin-top: -1.5px; border-radius: 1px;"></div>
                </div>
            </div>

            <!-- Nudge Inferior (-) -->
            <div style="text-align: center;">
                <button class="mob-nudge-btn mob-nudge-minus" style="background: #252a38; color: #fff; border: 1px solid #444; border-radius: 4px; width: 36px; height: 28px; font-size: 14px; font-weight: bold; cursor: pointer;">-</button>
            </div>

            <!-- Zona 6: Leitura Numérica Neon em dB -->
            <div class="mob-db-readout" style="text-align: center; font-size: 12px; font-weight: 800; color: #00e5ff; font-family: monospace;">
                ${cfg.dbValue || '-17.50 dB'}
            </div>

        </div>

        <!-- Overlay de Travamento Mobile -->
        ${cfg.isLocked ? `
            <div class="mob-lock-overlay" style="position: absolute; inset: 0; background: rgba(255, 0, 0, 0.15); border: 1px solid #ff4444; border-radius: 10px; display: flex; flex-direction: column; justify-content: flex-end; align-items: center; padding-bottom: 8px; z-index: 50;">
                <div class="lock-badge-btn" style="background: #ff4444; color: #fff; width: 28px; height: 28px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 14px; cursor: pointer; box-shadow: 0 0 10px rgba(255,68,68,0.6);" title="Toque para destravar">🔒</div>
            </div>
        ` : ''}
    `;
}

// ============================================================================
// 3. Event Listeners & Auditoria no Console de Testes
// ============================================================================

function attachStripEvents(stripEl, cfg, layout) {
    // 1. Bloqueio de Salto de Trilho ao clicar direto
    const rail = stripEl.querySelector(layout === 'desktop' ? '.desk-fader-rail' : '.mob-fader-track-area');
    if (rail) {
        rail.addEventListener('mousedown', (e) => {
            if (e.target.classList.contains('desk-fader-thumb') || e.target.classList.contains('mob-fader-thumb')) return;
            logWbEvent('fader', `[${layout.toUpperCase()}] ${cfg.name} (${cfg.chNumber}): Trilho protegido (Salto de toque bloqueado).`);
        });
    }

    // 2. Roda do Mouse (Desktop Apenas)
    if (layout === 'desktop') {
        stripEl.addEventListener('wheel', (e) => {
            e.preventDefault();
            const step = (cfg.type === 'master' || cfg.type === 'mix' || cfg.type === 'bus_paired') ? '0.50 dB' : '0.10 dB';
            const dir = e.deltaY < 0 ? '+' : '-';
            logWbEvent('nudge', `[DESKTOP WHEEL] ${cfg.name}: ${dir}${step} (DeltaY: ${e.deltaY})`);
        }, { passive: false });
    }

    // 3. Nudges (+) e (-)
    const btnPlus = stripEl.querySelector('.btn-nudge-plus, .desk-nudge-plus, .mob-nudge-plus');
    if (btnPlus) {
        btnPlus.addEventListener('click', () => {
            logWbEvent('nudge', `[NUDGE +] ${cfg.name} (${cfg.chNumber}): Incremento disparado.`);
        });
    }

    const btnMinus = stripEl.querySelector('.btn-nudge-minus, .desk-nudge-minus, .mob-nudge-minus');
    if (btnMinus) {
        btnMinus.addEventListener('click', () => {
            logWbEvent('nudge', `[NUDGE -] ${cfg.name} (${cfg.chNumber}): Decremento disparado.`);
        });
    }

    // 4. Botão ON / Mute
    const btnOn = stripEl.querySelector('.desk-btn-on, .mob-btn-on');
    if (btnOn) {
        btnOn.addEventListener('click', () => {
            btnOn.classList.toggle('active');
            logWbEvent('mute', `[ON/MUTE] ${cfg.name}: Estado alternado para ${btnOn.classList.contains('active') ? 'LIGADO' : 'MUTADO'}.`);
        });
    }

    // 5. Botão SOLO
    const btnSolo = stripEl.querySelector('.desk-btn-solo, .mob-btn-solo');
    if (btnSolo) {
        btnSolo.addEventListener('click', () => {
            btnSolo.classList.toggle('active');
            logWbEvent('solo', `[SOLO] ${cfg.name}: Estado alternado para ${btnSolo.classList.contains('active') ? 'ATIVO' : 'DESATIVADO'}.`);
        });
    }

    // 6. Cadeado / Lock
    const lockBtn = stripEl.querySelector('.lock-badge-btn, .desk-slot-right');
    if (lockBtn) {
        lockBtn.addEventListener('click', () => {
            logWbEvent('lock', `[LOCK/TRAVA] ${cfg.name} (${cfg.chNumber}): Evento de trava/destrava solicitado.`);
        });
    }
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
    const isPeak = p >= 98;

    // 1. Atualiza Desktop Strips (Barras e Peak LEDs)
    DESKTOP_VARIATIONS.forEach(cfg => {
        const vuL = document.getElementById(`vu_${cfg.id}_L`);
        const vuR = document.getElementById(`vu_${cfg.id}_R`);
        const peakL = document.getElementById(`peak_${cfg.id}_L`);
        const peakR = document.getElementById(`peak_${cfg.id}_R`);

        if (vuL) vuL.style.height = `${p}%`;
        if (vuR) vuR.style.height = `${p}%`;

        // Gradiente de cor por altura
        const color = p > 85 ? '#ef4444' : (p > 60 ? '#f59e0b' : '#10b981');
        if (vuL) vuL.style.background = color;
        if (vuR) vuR.style.background = color;

        if (isPeak) {
            if (peakL) triggerPeakHold(peakL, cfg.id + '_L');
            if (peakR) triggerPeakHold(peakR, cfg.id + '_R');
        }
    });

    // 2. Atualiza Mobile Strips (Cortina de Fundo e Contorno Peak Glow)
    MOBILE_VARIATIONS.forEach(cfg => {
        const mobVuL = document.getElementById(`mob_vu_${cfg.id}_L`);
        const mobVuR = document.getElementById(`mob_vu_${cfg.id}_R`);
        const card = document.getElementById(`wb_strip_${cfg.id}`);

        if (mobVuL) mobVuL.style.height = `${p}%`;
        if (mobVuR) mobVuR.style.height = `${p}%`;

        if (isPeak && card) {
            triggerPeakGlowMobile(card, cfg.id);
        }
    });
}

/**
 * Dispara Peak Hold de 1000ms no LED circular Desktop
 */
function triggerPeakHold(ledEl, id) {
    ledEl.style.background = '#ff0000';
    ledEl.style.boxShadow = '0 0 8px #ff4444';

    if (window.wbState.peakHoldTimers[id]) {
        clearTimeout(window.wbState.peakHoldTimers[id]);
    }

    window.wbState.peakHoldTimers[id] = setTimeout(() => {
        if (window.wbState.meterLevel < 98) {
            ledEl.style.background = '#252525';
            ledEl.style.boxShadow = 'none';
        }
    }, 1000);
}

/**
 * Dispara contorno vermelho brilhante (.peak-glow) por 1000ms no Mobile
 */
function triggerPeakGlowMobile(cardEl, id) {
    cardEl.style.borderColor = '#ff0000';
    cardEl.style.boxShadow = '0 0 15px rgba(255, 0, 0, 0.4)';

    if (window.wbState.peakHoldTimers['mob_' + id]) {
        clearTimeout(window.wbState.peakHoldTimers['mob_' + id]);
    }

    window.wbState.peakHoldTimers['mob_' + id] = setTimeout(() => {
        if (window.wbState.meterLevel < 98) {
            cardEl.style.borderColor = '';
            cardEl.style.boxShadow = '';
        }
    }, 1000);
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
