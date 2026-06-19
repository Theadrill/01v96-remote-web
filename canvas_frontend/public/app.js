import { initCanvas } from './canvas_project/canvas_engine.js';
import { setupCanvasEvents } from './canvas_project/canvas_events.js';

// O app.js agora atua apenas como Bootstrapper final.
initUI();

let engines = {
    main: null,
    macro: null,
    master: null
};

window.ensureCanvasExists = function() {
    if (window.location.pathname.startsWith('/canvas')) {
        const fadersContainer = document.getElementById('faders-container');
        const masterContainer = document.getElementById('master-container');
        
        if (fadersContainer) {
            if (fadersContainer.querySelector('canvas')) return;
            
            const checkWasm = setInterval(() => {
                if (typeof wasmMeterEngine !== 'undefined' && wasmMeterEngine) {
                    clearInterval(checkWasm);
                    if (fadersContainer.querySelector('canvas')) return; 
                    
                    if (!engines.main) {
                        // 1. Main Canvas (32 channels)
                        const mainChannels = Array.from({length: 32}, (_, i) => i);
                        engines.main = initCanvas('faders-container', wasmMeterEngine, channelStates, { channels: mainChannels });
                        setupCanvasEvents(engines.main.canvas, channelStates, mainChannels, window.socket);
                        
                        // 2. Macro Canvas
                        engines.macro = initCanvas('faders-container', wasmMeterEngine, channelStates, { channels: [-1], isMacro: true });
                        setupCanvasEvents(engines.macro.canvas, channelStates, [-1], window.socket);
                        
                        console.log("🎨 Canvas Engines (Main + Macro) inicializados!");
                    } else {
                        fadersContainer.appendChild(engines.main.canvas);
                        fadersContainer.appendChild(engines.macro.canvas);
                        engines.main.resizeCanvas();
                        engines.macro.resizeCanvas();
                    }
                    
                    // 3. Master Canvas
                    if (masterContainer) {
                        masterContainer.innerHTML = '';
                        if (!engines.master) {
                            engines.master = initCanvas('master-container', wasmMeterEngine, channelStates, { channels: [52] });
                            setupCanvasEvents(engines.master.canvas, channelStates, [52], window.socket);
                            console.log("🎨 Canvas Engine (Master) inicializado!");
                        } else {
                            masterContainer.appendChild(engines.master.canvas);
                            engines.master.resizeCanvas();
                        }
                    }
                }
            }, 100);
        }
    }
};

// INICIALIZADOR DO CANVAS
setTimeout(() => {
    window.ensureCanvasExists();
}, 500);

// Aguardamos um breve momento para estabilizar a renderização e o sync inicial antes de permitir envios.
setTimeout(() => {
    appReady = true;
    console.log("🚀 App pronto e protegido contra restauração de estado do browser.");
}, 1000);

// --- Otimização de Performance: Page Visibility & Focus API ---
// Pausa todas as atualizações de interface quando a janela perde o foco ou fica oculta.
// Eventos de Visibilidade (Troca de aba/Minimizar)
document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === 'hidden') {
        if (typeof socket !== 'undefined' && socket.connected) {
            console.log("⏸️ Aba oculta. Desconectando socket para poupar recursos.");
            socket.disconnect();
            if (window.activeConfigTab === 'eq' && typeof window.pauseRTA === 'function') {
                window.pauseRTA();
            }
        }
    } else {
        if (typeof socket !== 'undefined' && socket.disconnected) {
            console.log("▶️ Aba visível. Reconectando socket.");
            socket.connect();
        }
        
        setTimeout(() => {
            if (typeof activeConfigChannel !== 'undefined' && activeConfigChannel !== null && typeof activeConfigTab !== 'undefined' && activeConfigTab === 'eq') {
                if (typeof window.renderEQ === 'function') {
                    window.renderEQ(activeConfigChannel);
                } else {
                    if (typeof window.resumeRTA === 'function') window.resumeRTA();
                    if (typeof window.startEQAnimation === 'function') window.startEQAnimation();
                }
            }
        }, 500);
    }
});

// Criação do elemento visual para exibir o FPS
const fpsMeter = document.createElement('div');
fpsMeter.style.cssText = 'position:fixed;top:10px;right:10px;background:rgba(0,0,0,0.8);color:#0f0;padding:5px 10px;font-family:monospace;z-index:9999;border-radius:5px;pointer-events:none;';
document.body.appendChild(fpsMeter);

// Variáveis de controle de tempo e quadros
let lastTimeFps = performance.now();
let frameCountFps = 0;

// Função principal de cálculo
function updateFPS() {
    const now = performance.now();
    frameCountFps++;

    // Atualiza o display a cada 1 segundo (1000 ms)
    if (now - lastTimeFps >= 1000) {
        fpsMeter.textContent = `FPS: ${frameCountFps}`;
        frameCountFps = 0;
        lastTimeFps = now;
    }
    
    requestAnimationFrame(updateFPS);
}

// Inicia o loop
updateFPS();
