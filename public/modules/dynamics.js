function renderDynamics(ch) {
    const body = document.querySelector('.ch-modal-body');
    
    // Configura o contêiner principal para Dynamics
    body.style.flexDirection = 'column';
    body.style.alignItems = 'stretch';
    body.style.overflowY = 'auto';
    
    body.innerHTML = ''; // Limpa o corpo
    
    const container = document.createElement('div');
    container.className = 'dyn-container';
    body.appendChild(container);

    // Chama os módulos específicos para renderizar dentro do contêiner
    if (typeof renderGate === 'function') {
        renderGate(container, ch);
    }

    if (typeof renderCompressor === 'function') {
        renderCompressor(container, ch);
    }
}
