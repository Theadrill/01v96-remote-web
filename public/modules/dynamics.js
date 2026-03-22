function renderDynamics(ch) {
    const body = document.querySelector('.ch-modal-body');
    const chName = document.getElementById(`name${ch}`).innerText;
    const titleText = `${ch+1} - ${chName === '...' ? `CH ${ch+1}` : chName}`;

    body.style.flexDirection = 'column';
    body.style.alignItems = 'stretch';
    body.innerHTML = `
        <div style="background:#1a1a1a; padding:10px; display:flex; justify-content:space-between; align-items:center; width:100%; box-sizing:border-box; flex-shrink:0;">
            <div style="display:flex; align-items:center; gap:10px;">
                <button class="nav-btn" onclick="changeConfigChannel(-1)">&lt;</button>
                <h2 style="margin:0; font-size:14px; color:#5cacee; min-width:140px; text-align:center;">${titleText}</h2>
                <button class="nav-btn" onclick="changeConfigChannel(1)">&gt;</button>
            </div>
        </div>
        <div style="text-align:center; padding:20px; flex:1; display:flex; flex-direction:column; justify-content:center;">
            <p style="color:#888;">Configure Limiares e Ratios para o Canal.</p>
            <!-- Futuros sliders de dinâmica aqui -->
        </div>
    `;
}
