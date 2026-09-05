// O app.js agora atua apenas como Bootstrapper final.
// Responsabilidades removidas daqui:
//   - scenesLibrary / showSceneGrid → modules/scene_grid.js

// Execução segura da inicialização da UI (garante que o DOM está pronto)
function bootstrapApp() {
    try {
        if (typeof initUI === 'function') {
            initUI();
        }
        if (window.ConnectionManagerUI && typeof window.ConnectionManagerUI.init === 'function') {
            window.ConnectionManagerUI.init();
        }
    } catch (e) {
        console.error('[App Boot] Error during initUI:', e);
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootstrapApp);
} else {
    bootstrapApp();
}

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
        if (typeof socket !== 'undefined' && socket && socket.connected) {
            console.log("⏸️ Aba oculta. Desconectando socket para poupar recursos.");
            socket.disconnect();
            if (window.activeConfigTab === 'eq' && typeof window.pauseRTA === 'function') {
                window.pauseRTA();
            }
        }
    } else {
        if (typeof socket !== 'undefined' && socket && socket.disconnected) {
            console.log("▶️ Aba visível. Reconectando socket.");
            if (window.ConnectionService && typeof window.ConnectionService.connectToActiveHost === 'function') {
                window.ConnectionService.connectToActiveHost();
            } else if (typeof socket.connect === 'function') {
                socket.connect();
            }
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

// Inicializa o FPS meter (lê preferência do localStorage)
if (typeof initFpsMeter === 'function') {
    initFpsMeter();
}
