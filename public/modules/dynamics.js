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

let grPollingInterval = null;

window.startGrPolling = function(ch) {
    window.stopGrPolling();
    if (ch === null || ch === undefined) return;
    const isMaster = ch === 'master' || ch === 52;
    const isSupported = isMaster
        || (typeof ch === 'number' && (ch <= 31 || (ch >= 36 && ch <= 51)));
    if (!isSupported) return;

    const request = () => {
        if (typeof socket !== 'undefined' && socket) {
            socket.emit('requestDynamics', { channel: ch });
        }
    };

    request();

    grPollingInterval = setInterval(() => {
        if (typeof activeConfigTab !== 'undefined' && activeConfigTab === 'dyn' && activeConfigChannel === ch) {
            request();
        } else {
            window.stopGrPolling();
        }
    }, 100);
};

window.stopGrPolling = function() {
    if (grPollingInterval) {
        clearInterval(grPollingInterval);
        grPollingInterval = null;
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
    
    // Inicia o polling contínuo de dinâmicas/GR para o canal selecionado
    if (typeof window.startGrPolling === 'function') {
        window.startGrPolling(ch);
    }
}
