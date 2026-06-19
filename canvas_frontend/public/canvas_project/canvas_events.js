/**
 * Gerencia os eventos de pointerdown/move/up (Mouse e Touch).
 * Traduz toques na tela (Pixel X/Y) para lógica de canal e fader.
 */
export function setupCanvasEvents(canvas, channelStates, stripWidth, channels, socket) {
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
        const rect = canvas.getBoundingClientRect();
        // devicePixelRatio deve ser levado em conta se o canvas tiver transform scale.
        // O offsetX e offsetY ou e.clientX representam os pixels da TELA (CSS pixels).
        // Se a largura da strip é CSS 80px, podemos usar CSS pixels direto.
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        
        const colIndex = Math.floor(x / stripWidth);
        if (colIndex < 0 || colIndex >= channels.length) return;
        const channelIndex = channels[colIndex];
        const state = channelStates[channelIndex];
        if (!state) return;

        // --- Detecção de Hitboxes ---
        const paddingY = 80;
        const btnW = 30;
        const btnH = 20;
        
        // Coordenadas absolutas X e Y do strip deste canal
        const startX = colIndex * stripWidth;
        // Hitbox ON
        const onX = startX + stripWidth/2 - btnW - 5;
        const onY = 10; // offset do topo de canvas_strip.js
        if (x >= onX && x <= onX + btnW && y >= onY && y <= onY + btnH) {
            if (typeof window.toggleState === 'function') {
                window.toggleState('kInputChannelOn/kChannelOn', channelIndex);
            } else {
                state.on = !state.on;
            }
            return;
        }

        // Hitbox SOLO
        const soloX = startX + stripWidth/2 + 5;
        if (x >= soloX && x <= soloX + btnW && y >= onY && y <= onY + btnH && channelIndex !== -1) {
            if (typeof window.toggleState === 'function') {
                window.toggleState('kSetupSoloChOn/kSoloChOn', channelIndex);
            } else {
                state.solo = !state.solo;
            }
            return;
        }

        // Se for MACRO (-1), ignorar ON/SOLO
        if (channelIndex === -1) {
            activeTouches.set(e.pointerId, { 
                channelIndex, 
                startY: y,
                lastRaw: 512
            });
            canvas.setPointerCapture(e.pointerId);
            return;
        }

        // Se não clicou num botão, é início de arrasto do fader.
        activeTouches.set(e.pointerId, { 
            channelIndex, 
            startY: y 
        });
        
        // Captura o pointer para não perdermos o evento se o dedo sair da tela
        canvas.setPointerCapture(e.pointerId);
    });

    canvas.addEventListener('pointermove', (e) => {
        if (!activeTouches.has(e.pointerId)) return;
        
        const touchInfo = activeTouches.get(e.pointerId);
        const state = channelStates[touchInfo.channelIndex];
        if (!state) return;

        const rect = canvas.getBoundingClientRect();
        const y = e.clientY - rect.top;

        // Altura física configurada no canvas_strip.js
        const h = canvas.clientHeight || 600;
        const paddingY = 80; 
        const trackHeight = h - paddingY - 50; 
        const trackY = paddingY;

        // Calcula novo RAW (0-1023)
        const newRaw = interpolateYToRaw(y, trackY, trackHeight);

        // Lógica customizada para MACRO (-1)
        if (touchInfo.channelIndex === -1) {
            const diff = newRaw - touchInfo.lastRaw;
            if (Math.abs(diff) > 20) {
                // Arrasto suficiente para disparar um "Nudge"
                if (typeof window.nudgeMacro === 'function') {
                    window.nudgeMacro(diff > 0 ? 1 : -1);
                }
                touchInfo.lastRaw = newRaw;
            }
            return;
        }
        
        // Se o valor mudou, atualiza e avisa o servidor
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
        if (!activeTouches.has(e.pointerId)) return;
        canvas.releasePointerCapture(e.pointerId);
        activeTouches.delete(e.pointerId);
    });

    canvas.addEventListener('pointercancel', (e) => {
        if (!activeTouches.has(e.pointerId)) return;
        canvas.releasePointerCapture(e.pointerId);
        activeTouches.delete(e.pointerId);
    });

    canvas.addEventListener('pointerup', (e) => {
        if (activeTouches.has(e.pointerId)) {
            activeTouches.delete(e.pointerId);
            canvas.releasePointerCapture(e.pointerId);
        }
    });

    // Caso o dedo saia fisicamente do touch (cancelado pelo SO)
    canvas.addEventListener('pointercancel', (e) => {
        if (activeTouches.has(e.pointerId)) {
            activeTouches.delete(e.pointerId);
            canvas.releasePointerCapture(e.pointerId);
        }
    });
}
