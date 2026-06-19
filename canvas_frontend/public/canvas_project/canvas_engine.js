import { drawChannelStrip, getStripWidth } from './canvas_strip.js';

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
        const w = stripWidth * numChannels;
        
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

    function loop(now) {
        const delta = now - lastTime;
        lastTime = now;

        // Extrai níveis de pico (meters) do WASM (Float32Array)
        let meterValues = null;
        if (meterEngine && typeof meterEngine.render_frame === 'function') {
            meterValues = meterEngine.render_frame(delta);
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
            const x = i * stripWidth;

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
            if (meterValues) {
                if (chIndex === 52) {
                    // MASTER usa geralmente o meterIdx 32 e 33 (L e R). Vamos usar o L para simplificar visual.
                    meterIdx = 32;
                    meterVal = meterValues[32] !== undefined ? meterValues[32] : 0;
                } else if (chIndex < 64) {
                    meterVal = meterValues[chIndex] !== undefined ? meterValues[chIndex] : 0;
                }
            }

            let isPeaking = meterVal >= 98;
            if (isPeaking) {
                canvasLastPeakTime[meterIdx] = now;
            } else if (now - canvasLastPeakTime[meterIdx] <= 100) {
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
