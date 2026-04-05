// O app.js agora atua apenas como Bootstrapper final, 
// assumindo que os scripts dos módulos em index.html já foram carregados sequencialmente.

// Rodamos imediatamente para que os elementos existam antes do Socket inicial
initUI();
