import { drawChannelStrip, getStripWidth } from './canvas_strip.js';
import { MOBILE_STRIP_WIDTH } from './canvas_strip_mobile.js';

/**
 * Inicializa e gerencia o loop de requestAnimationFrame do Canvas.
 * Responsável por obter o array Float32Array do WASM (MeterEngine).
 */
export function initCanvas(containerId, meterEngine, channelStates, config = {}) {
    const container = document.getElementById(containerId);
    if (!container) {
        console.error(`Container ${containerId} não encontrado.`);
        return null;
    }
    
    // Preparar scroll nativo e evitar overflow Y
    container.style.overflowX = 'auto';
    container.style.overflowY = 'hidden';
    container.style.display = 'flex';

    const canvas = document.createElement('canvas');
    container.appendChild(canvas);
    canvas.style.flexShrink = '0';
    // Otimização: alpha false se o fundo for sempre sólido
    const ctx = canvas.getContext('2d', { alpha: false }); 

    // A largura será resolvida dinamicamente via getStripWidth()
    // Default para os 32 canais principais se config.channels não for fornecido
    const channels = config.channels || Array.from({length: 32}, (_, i) => i);
    const numChannels = channels.length;
    
    // Escalonamento para Retina/High-DPI
    const dpr = window.devicePixelRatio || 1;
    
    function resizeCanvas() {
        const stripWidth = getStripWidth();
        const h = container.clientHeight || 600;
        let w = stripWidth * numChannels;
        if (stripWidth === MOBILE_STRIP_WIDTH) { // mobile has gaps
            w += Math.floor((numChannels - 1) / 8) * 15; // 15px gap after 8 channels
        }
        
        canvas.width = w * dpr;
        canvas.height = h * dpr;
        
        canvas.style.width = `${w}px`;
        canvas.style.height = `${h}px`;
        
        ctx.scale(dpr, dpr);
    }
    
    window.addEventListener('resize', resizeCanvas);
    resizeCanvas();

    let lastTime = performance.now();

    let canvasLastPeakTime = new Array(64).fill(0);

    // View será construída sob demanda quando o WASM estiver pronto
    let meterView = null;

    function loop(now) {
        const delta = now - lastTime;
        lastTime = now;

        // Pega as globais dinamicamente (pois o WASM carrega assíncrono)
        const currentMeterEngine = window.wasmMeterEngine;
        if (!meterView && currentMeterEngine && window.wasmExports) {
            const ptr = currentMeterEngine.get_levels_ptr();
            meterView = new Float32Array(window.wasmExports.memory.buffer, ptr, 80);
        }

        // Executa a balística dos meters no WASM in-place (void)
        if (currentMeterEngine && typeof currentMeterEngine.render_frame === 'function') {
            currentMeterEngine.render_frame(delta);
        }

        // Limpa o canvas (agora ajustado pelo DPR via ctx.scale)
        const logicalWidth = canvas.width / dpr;
        const logicalHeight = canvas.height / dpr;
        
        ctx.fillStyle = '#0a0a0a'; // Fundo global
        ctx.fillRect(0, 0, logicalWidth, logicalHeight);

        // Iterar pelos canais mapeados e desenhar
        const stripWidth = getStripWidth();
        for (let i = 0; i < numChannels; i++) {
            const chIndex = channels[i];
            let x = i * stripWidth;
            if (stripWidth === MOBILE_STRIP_WIDTH) {
                x += Math.floor(i / 8) * 15;
            }

            // Se for o canal Macro (-1), a lógica é diferente e passamos state customizado
            if (chIndex === -1 && config.isMacro) {
                // macro_fader gerencia o macroDeltaSteps (nós vamos simular visualmente um fader em 50%)
                const state = { value: 512, on: false, solo: false, name: "MACRO" };
                drawChannelStrip(ctx, -1, x, 0, stripWidth, logicalHeight, state, 0, true);
                continue;
            }

            const state = channelStates[chIndex] || { value: 0, on: false, solo: false };
            
            // Lógica de Medidores para Master ou Canais normais
            let meterVal = 0;
            let meterIdx = chIndex;
            if (meterView) {
                if (chIndex === 52) { // MASTER (fader canvas trata como 52 mas buffer tem em 32/33)
                    meterIdx = 32;
                    meterVal = meterView[32] || 0;
                } else if (chIndex < 64) {
                    meterVal = meterView[chIndex] || 0;
                }
            } else if (meterValues) {
                // Fallback para non-WASM if needed
                meterVal = meterValues[chIndex] !== undefined ? meterValues[chIndex] : 0;
            }

            let isPeaking = meterVal >= 98;
            if (isPeaking) {
                canvasLastPeakTime[chIndex] = now;
            } else if (now - canvasLastPeakTime[chIndex] <= 100) {
                isPeaking = true;
            }
            
            drawChannelStrip(ctx, chIndex, x, 0, stripWidth, logicalHeight, state, meterVal, false, isPeaking);
        }

        requestAnimationFrame(loop);
    }

    // Iniciar loop
    requestAnimationFrame(loop);
    
    return { canvas, ctx, get stripWidth() { return getStripWidth(); }, resizeCanvas };
}
