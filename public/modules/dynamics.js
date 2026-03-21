function renderDynamics(ch) {
    const body = document.querySelector('.ch-modal-body');
    body.innerHTML = `
        <div style="text-align:center; padding:20px;">
            <h1 style="color:#28a745;">📉 DYNAMICS (GATE & COMP)</h1>
            <p style="color:#888;">Configure Limiares e Ratios para o Canal ${ch + 1}.</p>
            <!-- Futuros sliders de dinâmica aqui -->
        </div>
    `;
}
