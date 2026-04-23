let dynNudgeInterval = null;
let dynNudgeTimeout = null;

window.startDynNudge = function(sliderId, dir, ch, type) {
    const doNudge = (step = dir) => {
        const sl = document.getElementById(sliderId);
        if (!sl) return;
        
        let val = parseInt(sl.value);
        val += step;
        
        if (val < parseInt(sl.min)) val = parseInt(sl.min);
        if (val > parseInt(sl.max)) val = parseInt(sl.max);
        
        sl.value = val;
        // Dispara o oninput para atualizar o label local
        sl.dispatchEvent(new Event('input'));
        // Envia para a mesa
        if (typeof socket !== 'undefined' && socket) {
            socket.emit('control', { type, channel: ch, value: val });
        }
    };

    stopDynNudge();
    doNudge();

    // Delay inicial de 500ms antes de começar a repetir
    dynNudgeTimeout = setTimeout(() => {
        dynNudgeInterval = setInterval(() => {
            doNudge();
        }, 100);
    }, 500);
};

window.stopDynNudge = function() {
    if (dynNudgeTimeout) {
        clearTimeout(dynNudgeTimeout);
        dynNudgeTimeout = null;
    }
    if (dynNudgeInterval) {
        clearInterval(dynNudgeInterval);
        dynNudgeInterval = null;
    }
};

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
    
    // Pede as dinâmicas à mesa sempre que abrir a aba dyn de um canal
    if (typeof socket !== 'undefined' && socket) {
        socket.emit('requestDynamics', { channel: ch });
    }
}
