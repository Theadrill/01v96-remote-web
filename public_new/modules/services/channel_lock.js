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
            message: `Deseja DESTRAVAR as interações do canal ${lockId}?`,
            type: 'info',
            confirmText: 'SIM, DESTRAVAR',
            cancelText: 'CANCELAR'
        } : {
            title: `TRAVAR CANAL ${lockId}`,
            message: `Deseja TRAVAR as interações do canal ${lockId}? Isso impedirá movimentos acidentais de fader, mute ou solo.`,
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
        if (!lockId) return;
        const isLocked = window.lockedChannels && window.lockedChannels.includes(lockId);
        const chId = getChannelIdFromLockId(lockId);

        const config = {
            title: isLocked ? `DESTRAVAR / RENOMEAR — ${lockId}` : `TRAVAR / RENOMEAR — ${lockId}`,
            message: isLocked
                ? `O canal ${lockId} está TRAVADO. Escolha uma ação:`
                : `O canal ${lockId} está destravado. Escolha uma ação:`,
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
                    socket.emit('toggle_channel_lock', { channel: lockId });
                } else if (action === 'rename') {
                    openNameEditorForLockId(lockId);
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

        document.addEventListener('click', onDocumentClickCapture, true);
        document.addEventListener('contextmenu', onContextMenu, true);

        const containers = ['#faders-container', '#master-container'];
        containers.forEach(selector => {
            const el = document.querySelector(selector);
            if (!el) return;

            el.addEventListener('pointerdown', onPointerDown);
            el.addEventListener('pointermove', onPointerMove);
            el.addEventListener('pointerup', onPointerUp);
            el.addEventListener('pointercancel', onPointerUp);

            el.addEventListener('pointerup', onTap, true);

            el.addEventListener('click', onBadgeClick, true);
            el.addEventListener('click', onHeaderLockClick);
        });
    }

    // ── Renderização do overlay ────────────────────────────────
    window.updateLockedChannelsUI = function () {
        const lockedList = window.lockedChannels || [];
        const cards = document.querySelectorAll('.fader-card, .fader-card-desktop');

        cards.forEach(card => {
            const dataCh = card.getAttribute('data-ch');
            const lockId = getLockIdForDataCh(dataCh);
            let overlay = card.querySelector('.channel-lock-overlay');

            if (lockId && lockedList.includes(lockId)) {
                if (!overlay) {
                    overlay = document.createElement('div');
                    overlay.className = 'channel-lock-overlay';
                    overlay.innerHTML = `
                        <div class="channel-lock-badge" data-lock-id="${lockId}">
                            <svg class="channel-lock-svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#000000" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                                <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                            </svg>
                        </div>
                    `;
                    // Bloqueia seleções e arrastos nativos no overlay, permitindo
                    // que PointerEvents borbulhem para os listeners de long press e double-tap
                    const eventsToBlock = ['selectstart', 'dragstart'];
                    eventsToBlock.forEach(evt => {
                        overlay.addEventListener(evt, (e) => {
                            e.preventDefault();
                        });
                    });

                    card.appendChild(overlay);
                }
                card.classList.add('channel-locked');
            } else {
                if (overlay) overlay.remove();
                card.classList.remove('channel-locked');
            }
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
