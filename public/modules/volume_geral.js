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
        if (musicianMode) {
            return Array.from({length: 32}, (_, i) => i).filter(i => !macroLockedChannels.includes(i));
        }
        const all = [];
        for (let i = 0; i < 32; i++) all.push(i);
        return all;
    },
    showConfig: true,
    cardId: 'cardVolumeGeral',
    dbDisplayId: 'volume-geral-db-display',
    nudgeStartFn: 'startVolumeGeralNudge',
    nudgeStopFn: 'stopVolumeGeralNudge',
});

window.getVolumeGeralHtml = () => volumeGeral.getHtml();
window.startVolumeGeralNudge = (dir) => volumeGeral.startNudge(dir);
window.stopVolumeGeralNudge = () => volumeGeral.stopNudge();
