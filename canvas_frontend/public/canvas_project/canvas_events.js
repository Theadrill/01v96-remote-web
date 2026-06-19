import { getStripWidth } from './canvas_strip.js';

/**
 * Gerencia os eventos de pointerdown/move/up (Mouse e Touch).
 * Traduz toques na tela (Pixel X/Y) para lógica de canal e fader.
 */
export function setupCanvasEvents(canvas, channelStates, channels, socket) {
    const activeTouches = new Map();

    /**
     * Auxiliar: Mapeia o clique Y reverso para o rawValue.
     * Deve ser o exato inverso da `interpolateFaderY` no `canvas_strip.js`.
     */
    function interpolateYToRaw(y, startY, trackHeight) {
        // clamp para não passar da trilha física visual
        let clampedY = Math.max(startY, Math.min(y, startY + trackHeight));
        
        let pct = 1 - ((clampedY - startY) / trackHeight); // 0.0 no fundo, 1.0 no topo
        let raw = Math.round(pct * 1023);
        
        return Math.max(0, Math.min(1023, raw));
    }

    canvas.addEventListener('pointerdown', (e) => {
        const stripWidth = getStripWidth();
        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        
        const colIndex = Math.floor(x / stripWidth);
        if (colIndex < 0 || colIndex >= channels.length) return;
        const channelIndex = channels[colIndex];
        const state = channelStates[channelIndex];
        if (!state) return;

        const startX = colIndex * stripWidth;
        const localX = x - startX;
        const mode = typeof window !== 'undefined' && window.layoutMode ? window.layoutMode : 'desktop';
        const h = canvas.clientHeight || 600;

        let isThumbHit = false;

        if (mode === 'desktop') {
            const trackY = 219;
            const trackHeight = h - 296;
            const pct = state.value / 1023;
            const knobY = trackY + (trackHeight * (1 - pct));
            const faderCenterX = stripWidth / 2 + 3;
            if (localX >= faderCenterX - 20 && localX <= faderCenterX + 20 &&
                y >= knobY - 25 && y <= knobY + 25) {
                isThumbHit = true;
            }
        } else {
            const trackY = 80;
            const trackHeight = h - 130;
            const pct = state.value / 1023;
            const knobY = trackY + (trackHeight * (1 - pct));
            const faderCenterX = stripWidth / 2 - 7;
            if (localX >= faderCenterX - 25 && localX <= faderCenterX + 25 &&
                y >= knobY - 30 && y <= knobY + 30) {
                isThumbHit = true;
            }
        }

        if (isThumbHit || channelIndex === -1) {
            activeTouches.set(e.pointerId, { 
                type: 'fader',
                channelIndex, 
                startY: y,
                startRaw: state ? state.value : 512,
                lastRaw: 512
            });
            canvas.setPointerCapture(e.pointerId);
            return;
        }

        let pendingAction = null;

        if (mode === 'desktop') {
            const btnPadding = 6;
            const inBtnX = localX >= btnPadding && localX <= stripWidth - btnPadding;

            if (y >= 0 && y <= 30) {
                pendingAction = () => { if (typeof window.openChannelConfig === 'function' && channelIndex !== -1) window.openChannelConfig(e, channelIndex === 52 ? 52 : channelIndex); };
            } else if (y >= 38 && y <= 66 && inBtnX) {
                pendingAction = () => {
                    if (channelIndex !== -1 && channelIndex !== 52) {
                        if (typeof window.toggleState === 'function') {
                            let actionCh = channelIndex;
                            if (channelIndex >= 36 && channelIndex <= 43) actionCh = `'m${channelIndex-36}'`;
                            else if (channelIndex >= 44 && channelIndex <= 51) actionCh = `'b${channelIndex-44}'`;
                            window.toggleState('kSetupSoloChOn/kSoloChOn', actionCh);
                        } else {
                            state.solo = !state.solo;
                        }
                    }
                };
            } else if (y >= 74 && y <= 102 && inBtnX) {
                pendingAction = () => { if (typeof window.openChannelConfig === 'function' && channelIndex !== -1) window.openChannelConfig(e, channelIndex === 52 ? 52 : channelIndex); };
            } else if (y >= 110 && y <= 145 && inBtnX) {
                pendingAction = () => {
                    if (channelIndex !== -1) {
                        if (typeof window.toggleState === 'function') {
                            let cmd = 'kInputChannelOn/kChannelOn';
                            let actionCh = channelIndex;
                            if (channelIndex === 52) {
                                cmd = 'kStereoChannelOn/kChannelOn';
                                actionCh = "'master'"; 
                            } else if (channelIndex >= 36 && channelIndex <= 43) {
                                cmd = 'kAUXChannelOn/kChannelOn';
                                actionCh = `'m${channelIndex-36}'`;
                            } else if (channelIndex >= 44 && channelIndex <= 51) {
                                cmd = 'kBusChannelOn/kChannelOn';
                                actionCh = `'b${channelIndex-44}'`;
                            }
                            if (typeof actionCh === 'string' && actionCh.startsWith("'")) {
                                actionCh = actionCh.replace(/'/g, "");
                            }
                            window.toggleState(cmd, actionCh);
                        } else {
                            state.on = !state.on;
                        }
                    }
                };
            } else if (y >= 157 && y <= 181 && inBtnX) {
                pendingAction = () => {
                    if (channelIndex !== -1 && typeof window.startNudge === 'function') {
                        const evtCh = channelIndex === 52 ? "'master'" : channelIndex;
                        window.startNudge(evtCh, 1);
                    }
                };
            } else {
                const minusY = h - 62;
                if (y >= minusY && y <= minusY + 24 && inBtnX) {
                    pendingAction = () => {
                        if (channelIndex !== -1 && typeof window.startNudge === 'function') {
                            const evtCh = channelIndex === 52 ? "'master'" : channelIndex;
                            window.startNudge(evtCh, -1);
                        }
                    };
                }
            }
        } else {
            const btnW = 30;
            const btnH = 20;
            const onX = stripWidth/2 - btnW - 5;
            const onY = 10;
            
            if (localX >= onX && localX <= onX + btnW && y >= onY && y <= onY + btnH) {
                pendingAction = () => {
                    if (typeof window.toggleState === 'function') {
                        window.toggleState('kInputChannelOn/kChannelOn', channelIndex);
                    } else {
                        state.on = !state.on;
                    }
                };
            } else {
                const soloX = stripWidth/2 + 5;
                if (localX >= soloX && localX <= soloX + btnW && y >= onY && y <= onY + btnH && channelIndex !== -1) {
                    pendingAction = () => {
                        if (typeof window.toggleState === 'function') {
                            window.toggleState('kSetupSoloChOn/kSoloChOn', channelIndex);
                        } else {
                            state.solo = !state.solo;
                        }
                    };
                }
            }
        }

        if (pendingAction) {
            activeTouches.set(e.pointerId, {
                type: 'button',
                startX: e.clientX,
                startY: e.clientY,
                action: pendingAction
            });
        }
    });

    canvas.addEventListener('pointermove', (e) => {
        if (!activeTouches.has(e.pointerId)) return;
        const touchInfo = activeTouches.get(e.pointerId);

        if (touchInfo.type === 'button') {
            const dx = e.clientX - touchInfo.startX;
            const dy = e.clientY - touchInfo.startY;
            if (dx*dx + dy*dy > 100) {
                activeTouches.delete(e.pointerId);
            }
            return;
        }

        const state = channelStates[touchInfo.channelIndex];
        if (!state) return;

        const rect = canvas.getBoundingClientRect();
        const y = e.clientY - rect.top;

        const h = canvas.clientHeight || 600;
        const mode = typeof window !== 'undefined' && window.layoutMode ? window.layoutMode : 'desktop';
        
        let trackHeight;
        if (mode === 'desktop') {
            trackHeight = h - 296;
        } else {
            trackHeight = h - 130;
        }

        if (touchInfo.channelIndex === -1) {
            const trackY = mode === 'desktop' ? 219 : 80;
            const absoluteRaw = interpolateYToRaw(y, trackY, trackHeight);
            const diff = absoluteRaw - touchInfo.lastRaw;
            if (Math.abs(diff) > 20) {
                if (typeof window.nudgeMacro === 'function') {
                    window.nudgeMacro(diff > 0 ? 1 : -1);
                }
                touchInfo.lastRaw = absoluteRaw;
            }
            return;
        }

        const deltaY = y - touchInfo.startY;
        const rawDelta = -(deltaY / trackHeight) * 1023;
        const newRaw = Math.max(0, Math.min(1023, Math.round(touchInfo.startRaw + rawDelta)));
        
        if (state.value !== newRaw) {
            if (typeof window.commitFaderChange === 'function') {
                window.commitFaderChange(touchInfo.channelIndex, newRaw);
            } else {
                state.value = newRaw;
                if (window.socket) {
                    let paramType = 'kInput';
                    if (touchInfo.channelIndex >= 36 && touchInfo.channelIndex <= 43) paramType = 'kAUX';
                    if (touchInfo.channelIndex >= 44 && touchInfo.channelIndex <= 51) paramType = 'kBus';
                    if (touchInfo.channelIndex === 52) paramType = 'kStereo';
                    
                    window.socket.emit('control', { type: paramType, channel: touchInfo.channelIndex, value: newRaw });
                }
            }
        }
    });

    canvas.addEventListener('pointerup', (e) => {
        if (typeof window.stopNudge === 'function') window.stopNudge();

        if (!activeTouches.has(e.pointerId)) return;
        
        const touchInfo = activeTouches.get(e.pointerId);
        
        if (touchInfo.type === 'button' && touchInfo.action) {
            touchInfo.action();
        } else if (touchInfo.type === 'fader') {
            try { canvas.releasePointerCapture(e.pointerId); } catch(err) {}
        }

        activeTouches.delete(e.pointerId);
    });

    canvas.addEventListener('pointercancel', (e) => {
        if (typeof window.stopNudge === 'function') window.stopNudge();

        if (!activeTouches.has(e.pointerId)) return;
        
        const touchInfo = activeTouches.get(e.pointerId);
        if (touchInfo.type === 'fader') {
            try { canvas.releasePointerCapture(e.pointerId); } catch(err) {}
        }
        
        activeTouches.delete(e.pointerId);
    });

    // Evento de Wheel (Mouse Scroll) para alterar o volume quando em cima do Fader
    canvas.addEventListener('wheel', (e) => {
        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        const colIndex = Math.floor(x / stripWidth);
        if (colIndex < 0 || colIndex >= channels.length) return;
        
        const channelIndex = channels[colIndex];
        const state = channelStates[channelIndex];
        if (!state) return;

        const h = canvas.clientHeight || 600;
        const mode = typeof window !== 'undefined' && window.layoutMode ? window.layoutMode : 'desktop';
        
        let trackY, trackHeight;
        if (mode === 'desktop') {
            trackY = 219;
            trackHeight = h - 296;
        } else {
            trackY = 80;
            trackHeight = h - 130;
        }

        // Permitir folga de 20px pra cima e baixo no track para ser mais amigável
        if (y >= trackY - 20 && y <= trackY + trackHeight + 20) {
            e.preventDefault(); // Interrompe o scroll lateral ou da página

            // Se for MACRO
            if (channelIndex === -1) {
                if (typeof window.nudgeMacro === 'function') {
                    window.nudgeMacro(e.deltaY < 0 ? 1 : -1);
                }
                return;
            }

            // Repassa para a lógica global do Fader
            if (typeof window.handleWheelFader === 'function') {
                const evtCh = channelIndex === 52 ? "'master'" : channelIndex;
                window.handleWheelFader(e, evtCh);
            }
        }
    }, { passive: false });
}
