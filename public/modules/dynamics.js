function renderDynamics(ch) {
    const body = document.querySelector('.ch-modal-body');
    const chName = document.getElementById(`name${ch}`).innerText;
    const titleText = `${ch+1} - ${chName === '...' ? `CH ${ch+1}` : chName}`;

    body.style.flexDirection = 'column';
    body.style.alignItems = 'stretch';
    body.innerHTML = `

        <div style="text-align:center; padding:20px; flex:1; display:flex; flex-direction:column; justify-content:center;">
            <p style="color:#888;">Configure Limiares e Ratios para o Canal.</p>
            <!-- Futuros sliders de dinâmica aqui -->
        </div>
    `;
}
