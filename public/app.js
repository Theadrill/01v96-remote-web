// O app.js agora atua apenas como Bootstrapper final.
// Responsabilidades removidas daqui:
//   - scenesLibrary / showSceneGrid → modules/scene_grid.js
initUI();

// Aguardamos um breve momento para estabilizar a renderização e o sync inicial antes de permitir envios.
setTimeout(() => {
    appReady = true;
    console.log("🚀 App pronto e protegido contra restauração de estado do browser.");
}, 1000);
