function renderEQ(ch) {
    const body = document.querySelector('.ch-modal-body');
    body.innerHTML = `
        <div style="text-align:center; padding:20px;">
            <h1 style="color:#007bff;">🎚️ EQUALIZADOR DE 4 BANDAS</h1>
            <p style="color:#888;">Renderizando controles do Canal ${ch + 1}...</p>
            <!-- Futuros knobs e gráficos de EQ aqui -->
        </div>
    `;
}
