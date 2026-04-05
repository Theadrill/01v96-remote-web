// O app.js agora atua apenas como Bootstrapper final
initUI();

// Inicializamos o socket APÓS a UI estar pronta
socket = io();
if (typeof initSocketListeners === 'function') initSocketListeners();

// Aguardamos um breve momento para estabilizar a renderização e o sync inicial antes de permitir envios
setTimeout(() => {
    appReady = true;
    console.log("🚀 App pronto e protegido contra restauração de estado do browser.");
}, 1000);
