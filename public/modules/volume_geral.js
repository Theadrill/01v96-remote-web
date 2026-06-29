function toggleVolumeGeral() {
    window.showVolumeGeral = !window.showVolumeGeral;
    const btn = document.getElementById('volumeGeralBtn');
    if (btn) {
        btn.classList.toggle('active', window.showVolumeGeral);
    }
    if (typeof initUI === 'function') initUI();
}
window.toggleVolumeGeral = toggleVolumeGeral;

const volumeGeral = createMacroFaderInstance({
    title: 'GERAL',
    titleLong: 'VOLUME GERAL',
    getChannelIds: () => {
        const all = [];
        for (let i = 0; i < 32; i++) all.push(i);
        return all;
    },
    showConfig: false,
    cardId: 'cardVolumeGeral',
    dbDisplayId: 'volume-geral-db-display',
    nudgeStartFn: 'startVolumeGeralNudge',
    nudgeStopFn: 'stopVolumeGeralNudge',
});

window.getVolumeGeralHtml = () => volumeGeral.getHtml();
window.startVolumeGeralNudge = (dir) => volumeGeral.startNudge(dir);
window.stopVolumeGeralNudge = () => volumeGeral.stopNudge();
