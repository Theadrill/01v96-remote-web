// O app.js agora atua apenas como Bootstrapper final.
// Responsabilidades removidas daqui:
//   - scenesLibrary / showSceneGrid → modules/scene_grid.js
initUI();

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
