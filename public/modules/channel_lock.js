/**
 * MÓDULO: Sistema de Lock Manual e Sincronizado de Canais
 * public/modules/channel_lock.js
 *
 * 3 formas de ativar/desativar lock:
 *   1) Long press no header/overlay (mobile)
 *   2) Double-tap no header/overlay (mobile)
 *   3) Click no ícone do cadeado (mobile + desktop)
 *
 * Desktop: apenas click no cadeado.
 */

(function () {
    let longPressTimeout = null;
    let longPressLockId = null;
    let startX = 0;
    let startY = 0;

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
        const card = el.closest('.fader-card, .fader-card-desktop');
        if (!card) return null;
        return getLockIdForDataCh(card.getAttribute('data-ch'));
    }

    function isLockZone(el) {
        return el && el.closest('.desk-label, .desk-label-wrapper, .channel-lock-overlay, .ch-name, .ch-clickable-zone');
    }

    function isDesktop() {
        return window.layoutMode === 'desktop';
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
            window.confirmToggleChannelLock(target);
        }, getHoldDuration());
    }

    function onPointerDown(e) {
        if (isDesktop()) return;
        if (e.button && e.button !== 0) return;
        if (!isLockZone(e.target)) return;

        const lockId = getLockIdFromElement(e.target);
        if (!lockId) return;

        startLongPress(lockId, e.clientX, e.clientY);
    }

    function onPointerMove(e) {
        if (!longPressTimeout) return;
        const dist = Math.hypot(e.clientX - startX, e.clientY - startY);
        if (dist > 10) cancelLongPress();
    }

    function onPointerUp(e) {
        if (!longPressTimeout) return;
        cancelLongPress();
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
                    const eventsToBlock = [
                        'mousedown', 'mouseup', 'mousemove',
                        'touchstart', 'touchmove', 'touchend', 'contextmenu', 'dblclick', 'click'
                    ];
                    eventsToBlock.forEach(evt => {
                        overlay.addEventListener(evt, (e) => {
                            if (!e.target.closest('.channel-lock-badge')) {
                                e.stopPropagation();
                                e.preventDefault();
                            }
                        }, { passive: false });
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
