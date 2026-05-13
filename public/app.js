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
const handlePause = () => {
    if (typeof socket !== 'undefined' && socket.connected) {
        console.log("⏸️ Janela fora de foco. Desconectando socket para poupar CPU.");
        socket.disconnect();
    }
};

const handleResume = () => {
    if (typeof socket !== 'undefined' && socket.disconnected) {
        console.log("▶️ Janela focada. Reconectando socket e sincronizando estado.");
        socket.connect();
    }
};

// Eventos de Visibilidade (Troca de aba/Minimizar)
document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === 'hidden') handlePause();
    else handleResume();
});

// Eventos de Foco (Clicar em outra janela/aplicativo)
window.addEventListener("blur", handlePause);
window.addEventListener("focus", handleResume);
