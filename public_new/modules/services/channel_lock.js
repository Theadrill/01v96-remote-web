/**
 * MÓDULO: Sistema de Lock Manual e Sincronizado de Canais
 * public/modules/channel_lock.js
 *
 * Mobile (.ch-clickable-zone.top e .channel-lock-badge):
 *   - Tap rápido: abre a configuração normal do canal.
 *   - Arrasto (> 10px): cancela o long press e permite o scroll.
 *   - Long press: abre modal com [TRAVAR/DESTRAVAR] [RENOMEAR] [CANCELAR].
 *
 * Desktop: apenas click no cadeado (cabeçalho abre config).
 */

(function () {
    let longPressTimeout = null;
    let longPressLockId = null;
    let startX = 0;
    let startY = 0;
    let suppressClick = false;

    let lastTapTime = 0;
    let lastTapLockId = null;
    const DOUBLE_TAP_DELAY = 350;

    function getLockIdForDataCh(dataCh) {
        if (dataCh === null || dataCh === undefined) return null;
        if (typeof dataCh === 'string') {
            const upper = dataCh.trim().toUpperCase();
            if (upper === 'MASTER' || upper === '52' || upper === "'MASTER'") return 'MASTER';
            if (upper.startsWith('CH') || upper.startsWith('MIX') || upper.startsWith('BUS')) return upper;
        }
        if (dataCh === 'master' || dataCh === '52' || dataCh === 52) return 'MASTER';
        const val = parseInt(dataCh, 10);
        if (isNaN(val)) return null;
        if (val >= 0 && val <= 31) return 'CH' + (val + 1);
        if (val >= 36 && val <= 43) return 'MIX' + (val - 35);
        if (val >= 44 && val <= 51) return 'BUS' + (val - 43);
        return null;
    }

    window.getChannelLockId = getLockIdForDataCh;

    function getLockIdFromElement(el) {
        if (!el) return null;
        const badge = el.closest('.channel-lock-badge');
        if (badge) return badge.getAttribute('data-lock-id') || null;
        const card = el.closest('.fader-card, .fader-card-desktop');
        if (!card) return null;
        return getLockIdForDataCh(card.getAttribute('data-ch'));
    }

    function getChannelIdFromLockId(lockId) {
        if (!lockId) return null;
        if (lockId === 'MASTER') return 52;
        if (lockId.startsWith('CH')) {
            const n = parseInt(lockId.substring(2), 10);
            return (!isNaN(n) && n >= 1 && n <= 32) ? n - 1 : null;
        }
        if (lockId.startsWith('MIX')) {
            const n = parseInt(lockId.substring(3), 10);
            return (!isNaN(n) && n >= 1 && n <= 8) ? 35 + n : null;
        }
        if (lockId.startsWith('BUS')) {
            const n = parseInt(lockId.substring(3), 10);
            return (!isNaN(n) && n >= 1 && n <= 8) ? 43 + n : null;
        }
        return null;
    }

    function isLockZone(el) {
        return el && el.closest('.desk-label, .desk-label-wrapper, .channel-lock-overlay, .ch-name, .ch-clickable-zone');
    }

    // No mobile:
    // - Se o canal estiver travado (locked), qualquer área do overlay/card responde ao long press.
    // - Se estiver destravado, apenas a zona clicável superior (.ch-clickable-zone.top) responde.
    function isMobileLongPressZone(el) {
        if (!el) return false;
        if (el.closest('.channel-lock-overlay, .channel-locked')) return true;
        return !!el.closest('.ch-clickable-zone.top');
    }

    function isDesktop() {
        return typeof layoutMode !== 'undefined' && layoutMode === 'desktop';
    }

    function getHoldDuration() {
        return (window.themeChannelLockConfig && window.themeChannelLockConfig.hold_duration_ms) || 1500;
    }

    // ── Confirmação de toggle ──────────────────────────────────
    window.confirmToggleChannelLock = function (lockId) {
        if (!lockId) return;
        const isLocked = window.lockedChannels && window.lockedChannels.includes(lockId);

        const config = isLocked ? {
            title: `DESTRAVAR CANAL ${lockId}`,
            message: `Deseja <strong>DESTRAVAR</strong> o canal <strong>${lockId}</strong> no aplicativo?`,
            type: 'info',
            confirmText: 'SIM, DESTRAVAR',
            cancelText: 'CANCELAR'
        } : {
            title: `TRAVAR CANAL ${lockId}`,
            message: `Deseja <strong>TRAVAR</strong> o canal <strong>${lockId}</strong> para evitar cliques ou movimentos por engano na tela?<div class="lock-modal-notice">⚠️ <strong>Atenção:</strong> Esta trava protege apenas o aplicativo (a mesa física continua liberada e funcionando normalmente).</div>`,
            type: 'warning',
            confirmText: 'SIM, TRAVAR',
            cancelText: 'CANCELAR'
        };

        if (typeof ConfirmModal !== 'undefined' && ConfirmModal.show) {
            ConfirmModal.show(config).then(function (ok) {
                if (ok) {
                    socket.emit('toggle_channel_lock', { channel: lockId });
                }
            });
        }
    };

    // ── Long press ─────────────────────────────────────────────
    function cancelLongPress() {
        if (longPressTimeout) {
            clearTimeout(longPressTimeout);
            longPressTimeout = null;
        }
        longPressLockId = null;
    }

    function startLongPress(lockId, clientX, clientY) {
        if (isDesktop()) return;
        cancelLongPress();
        startX = clientX;
        startY = clientY;
        longPressLockId = lockId;

        longPressTimeout = setTimeout(() => {
            const target = longPressLockId;
            cancelLongPress();
            suppressClick = true; // evita que o click subsequente abra a config
            window.openChannelActionsModal(target);
        }, getHoldDuration());
    }

    function onPointerDown(e) {
        if (isDesktop()) return;
        if (e.button && e.button !== 0) return;
        if (!isMobileLongPressZone(e.target)) return;

        const lockId = getLockIdFromElement(e.target);
        if (!lockId) return;

        suppressClick = false;
        startLongPress(lockId, e.clientX, e.clientY);
    }

    function onPointerMove(e) {
        if (!longPressTimeout) return;
        const dist = Math.hypot(e.clientX - startX, e.clientY - startY);
        if (dist > 10) {
            cancelLongPress();
            suppressClick = true;
        }
    }

    function onPointerUp(e) {
        if (!longPressTimeout) return;
        cancelLongPress();
    }

    // ── Modal de ações (travar/destravar/renomear) ──────────────
    window.openChannelActionsModal = function (lockId) {
        if (lockId === null || lockId === undefined) return;
        const normalizedLockId = (typeof lockId === 'string' && (lockId.startsWith('CH') || lockId.startsWith('MIX') || lockId.startsWith('BUS') || lockId === 'MASTER'))
            ? lockId
            : getLockIdForDataCh(lockId);

        if (!normalizedLockId) return;

        const isLocked = window.lockedChannels && window.lockedChannels.includes(normalizedLockId);
        const chId = getChannelIdFromLockId(normalizedLockId);

        const config = {
            title: isLocked ? `DESTRAVAR / RENOMEAR — ${normalizedLockId}` : `TRAVAR / RENOMEAR — ${normalizedLockId}`,
            message: isLocked
                ? `O canal <strong>${normalizedLockId}</strong> está <strong>TRAVADO</strong> neste aplicativo. Escolha uma ação:`
                : `Deseja travar o canal <strong>${normalizedLockId}</strong> para evitar toques por engano na tela?<div class="lock-modal-notice">⚠️ <strong>Atenção:</strong> Esta trava protege apenas o aplicativo (a mesa física continua liberada e funcionando normalmente).</div>`,
            type: isLocked ? 'warning' : 'info',
            buttons: [
                { label: isLocked ? 'SIM, DESTRAVAR' : 'SIM, TRAVAR', type: isLocked ? 'info' : 'warning', action: 'toggle' },
                { label: 'RENOMEAR CANAL', type: 'primary', action: 'rename' },
                { label: 'CANCELAR', type: 'secondary', action: 'cancel' }
            ]
        };

        if (typeof ConfirmModal !== 'undefined' && ConfirmModal.show) {
            ConfirmModal.show(config).then(function (action) {
                if (action === 'toggle') {
                    if (typeof socket !== 'undefined' && socket.emit) {
                        socket.emit('toggle_channel_lock', { channel: normalizedLockId });
                    }
                } else if (action === 'rename') {
                    openNameEditorForLockId(normalizedLockId);
                }
            });
        }
    };

    function openNameEditorForLockId(lockId) {
        const chId = getChannelIdFromLockId(lockId);
        if (chId === null) return;

        activeConfigChannel = chId;
        if (typeof window.openNameEditor === 'function') {
            window.openNameEditor();
        }

        // Limpa o estado de config ao fechar o editor de nome,
        // evitando efeitos colaterais na tela principal.
        const modal = document.getElementById('nameEditorModal');
        if (modal && typeof MutationObserver !== 'undefined') {
            const obs = new MutationObserver(function () {
                if (modal.style.display === 'none' || modal.style.display === '') {
                    activeConfigChannel = null;
                    obs.disconnect();
                }
            });
            obs.observe(modal, { attributes: true, attributeFilter: ['style'] });
        }
    }

    // Impede que o click seguinte ao long press / arrasto abra a config por engano
    function onDocumentClickCapture(e) {
        if (isDesktop()) return;
        if (!suppressClick) return;
        suppressClick = false;
        const zone = e.target && e.target.closest && e.target.closest('.ch-clickable-zone.top, .channel-lock-badge, .channel-lock-overlay');
        if (!zone) return;
        if (zone.closest('#faders-container, #master-container')) {
            e.preventDefault();
            e.stopPropagation();
        }
    }

    // Evita menu de contexto nativo durante/logo após o long press
    function onContextMenu(e) {
        if (isDesktop()) return;
        if (longPressLockId === null && !suppressClick) return;
        const zone = e.target && e.target.closest && e.target.closest('.ch-clickable-zone.top, .channel-lock-badge, .channel-lock-overlay');
        if (zone && zone.closest('#faders-container, #master-container')) {
            e.preventDefault();
            e.stopPropagation();
        }
    }

    // ── Double-tap ─────────────────────────────────────────────
    function onTap(e) {
        if (isDesktop()) return;
        if (!isLockZone(e.target)) return;

        const lockId = getLockIdFromElement(e.target);
        if (!lockId) return;

        if (!window.lockedChannels || !window.lockedChannels.includes(lockId)) return;

        const now = Date.now();
        if (lastTapLockId === lockId && (now - lastTapTime) < DOUBLE_TAP_DELAY) {
            lastTapTime = 0;
            lastTapLockId = null;
            e.preventDefault();
            e.stopPropagation();
            window.confirmToggleChannelLock(lockId);
        } else {
            lastTapTime = now;
            lastTapLockId = lockId;
        }
    }

    // ── Click no badge (todas as plataformas) ──────────────────
    function onBadgeClick(e) {
        const badge = e.target.closest('.channel-lock-badge');
        if (!badge) return;

        const lockId = badge.getAttribute('data-lock-id');
        if (!lockId) return;

        e.preventDefault();
        e.stopPropagation();
        window.confirmToggleChannelLock(lockId);
    }

    // ── Click no cadeado do header (desktop) ───────────────────
    function onHeaderLockClick(e) {
        const lockIcon = e.target.closest('.desk-label-lock');
        if (!lockIcon) return;

        e.preventDefault();
        e.stopPropagation();

        const dataCh = lockIcon.getAttribute('data-ch');
        if (!dataCh) return;
        const lockId = getLockIdForDataCh(dataCh);
        if (!lockId) return;

        window.confirmToggleChannelLock(lockId);
    }

    // ── Delegação de eventos ───────────────────────────────────
    let delegationInitialized = false;

    function initEventDelegation() {
        if (delegationInitialized) return;
        delegationInitialized = true;

        document.addEventListener('contextmenu', onContextMenu, true);
    }

    // ── Objeto ChannelLock Global para Integração Modular ──────
    window.ChannelLock = {
        isLocked: function (ch) {
            const lockId = getLockIdForDataCh(ch);
            return !!(lockId && window.lockedChannels && window.lockedChannels.includes(lockId));
        },
        toggleLock: function (ch) {
            const lockId = getLockIdForDataCh(ch);
            if (lockId) {
                window.confirmToggleChannelLock(lockId);
            }
        },
        getLockId: getLockIdForDataCh,
        openActionsModal: function (ch) {
            const lockId = typeof ch === 'string' && (ch.startsWith('CH') || ch.startsWith('MIX') || ch.startsWith('BUS') || ch === 'MASTER') ? ch : getLockIdForDataCh(ch);
            if (lockId) {
                window.openChannelActionsModal(lockId);
            }
        }
    };

    // ── Renderização do overlay ────────────────────────────────
    window.updateLockedChannelsUI = function () {
        const lockedList = window.lockedChannels || [];

        // 1. Atualiza MainView (CH 1-32 + STEREO Master)
        if (typeof MainView !== 'undefined' && typeof MainView.updateLock === 'function') {
            for (let i = 0; i < 32; i++) {
                const isLocked = lockedList.includes('CH' + (i + 1));
                MainView.updateLock(i, isLocked);
            }
            MainView.updateLock('master', lockedList.includes('MASTER'));
        }

        // 2. Atualiza OutsView (MIX 1-8 e BUS 1-8)
        if (typeof OutsView !== 'undefined' && typeof OutsView.getStrip === 'function') {
            for (let m = 1; m <= 8; m++) {
                const gId = 35 + m;
                const isLocked = lockedList.includes('MIX' + m);
                const strip = OutsView.getStrip(gId);
                if (strip && strip.setLockState) strip.setLockState(isLocked);
            }
            for (let b = 1; b <= 8; b++) {
                const gId = 43 + b;
                const isLocked = lockedList.includes('BUS' + b);
                const strip = OutsView.getStrip(gId);
                if (strip && strip.setLockState) strip.setLockState(isLocked);
            }
        }

        // 3. Atualiza wrappers DOM
        const cards = document.querySelectorAll('.channel-strip-wrapper, .fader-card, .fader-card-desktop');
        cards.forEach(card => {
            const dataCh = card.getAttribute('data-ch');
            if (!dataCh) return;
            const lockId = getLockIdForDataCh(dataCh);
            const isLocked = !!(lockId && lockedList.includes(lockId));
            card.classList.toggle('is-locked', isLocked);
            card.classList.toggle('channel-locked', isLocked);
        });
    };

    // ── Init ───────────────────────────────────────────────────
    document.addEventListener('DOMContentLoaded', () => {
        initEventDelegation();
    });

    const originalInitUI = window.initUI;
    window.initUI = function () {
        if (typeof originalInitUI === 'function') {
            originalInitUI.apply(this, arguments);
        }
        initEventDelegation();
        window.updateLockedChannelsUI();
    };
})();
