function showSplashStep(step) {
    const splashInitial = document.getElementById('splashInitial');
    const splashTecnico = document.getElementById('splashTecnico');
    const splashMusico = document.getElementById('splashMusico');
    const splashSetup = document.getElementById('splashSetup');
    const tecnicoPass = document.getElementById('tecnicoPass');

    if (splashInitial) splashInitial.style.display = 'none';
    if (splashTecnico) splashTecnico.style.display = 'none';
    if (splashMusico) splashMusico.style.display = 'none';
    if (splashSetup) splashSetup.style.display = 'none';

    if (step === 'initial') {
        splashInitial.style.display = 'flex';
    } else if (step === 'tecnico') {
        const status = (typeof window !== 'undefined' && window.envStatus) || 'not_found';
        if (status !== 'complete') {
            if (typeof window.showSetupScreen === 'function') {
                window.showSetupScreen();
                return;
            }
        }
        splashTecnico.style.display = 'flex';
        tecnicoPass.value = '';
        setTimeout(() => tecnicoPass.focus(), 150);
    } else if (step === 'musico') {
        splashMusico.style.display = 'flex';
    } else if (step === 'setup') {
        if (typeof window.showSetupScreen === 'function') {
            window.showSetupScreen();
        }
    }
}

function checkTecnicoPass() {
    const pass = document.getElementById('tecnicoPass').value;
    if (!tecnicoPassword) {
        alert('SENHA NÃO CONFIGURADA — faça a configuração inicial primeiro.');
        document.getElementById('tecnicoPass').value = '';
        document.getElementById('tecnicoPass').focus();
        return;
    }
    if (pass === tecnicoPassword) {
        localStorage.setItem('01v96_role', 'technician');
        const splash = document.getElementById('splashScreen');
        splash.style.pointerEvents = 'none';
        splash.style.transition = 'opacity 0.4s ease, transform 0.4s ease';
        splash.style.opacity = '0';
        splash.style.transform = 'scale(1.1)';
        setTimeout(() => {
            splash.style.display = 'none';
        }, 400);
    } else {
        alert('SENHA INCORRETA!');
        document.getElementById('tecnicoPass').value = '';
        document.getElementById('tecnicoPass').focus();
    }
}

function enterMusicianMode(foneId) {
    musicianMode = true;
    activeMix = foneId;
    localStorage.setItem('01v96_role', 'musician');
    localStorage.setItem('01v96_mix', foneId);

    window.showMetersInMusicianMode = false;
    const mBtn = document.getElementById('musicianMetersBtn');
    if (mBtn) {
        mBtn.textContent = 'MOSTRAR NÍVEIS';
        mBtn.classList.remove('active');
    }

    // Fecha a splash (se estiver visível)
    const splash = document.getElementById('splashScreen');
    if (splash.style.display !== 'none') {
        splash.style.transition = 'opacity 0.2s ease, transform 0.2s ease';
        splash.style.opacity = '0';
        splash.style.transform = 'scale(1.1)';
        splash.style.pointerEvents = 'none';
        setTimeout(() => splash.style.display = 'none', 300);
    }
    
    // Garante que a sidebar esteja visível (agora adaptada pelo initUI)
    const side = document.querySelector('.sidebar');
    if (side) side.style.display = 'flex';
    
    // Re-inicializa os faders focados no AUX (MIX)
    initUI();
}

function musicoAlert(foneId) {
    enterMusicianMode(foneId);
}

function clearRole() {
    localStorage.removeItem('01v96_role');
    localStorage.removeItem('01v96_mix');
}

// Inicializa eventos e auto-login ao carregar
document.addEventListener('DOMContentLoaded', () => {
    const tecnicoPass = document.getElementById('tecnicoPass');
    if (tecnicoPass) {
        tecnicoPass.addEventListener('input', (e) => {
            if (e.target.value.length === 4) checkTecnicoPass();
        });
        tecnicoPass.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') checkTecnicoPass();
        });
    }

    // A decisão de mostrar tela de cadastro vs. auto-login é tomada pelo socket.js
    // quando o `setupStatus` (via `socket.on('connect')` → `checkSetupStatus`) ou o
    // `portsList` chega com o envStatus real. Apenas garantimos que a splash está
    // visível (caso o socket ainda não tenha conectado) e deixamos o usuário
    // escolher TÉCNICO/MÚSICO pela splash normal.
    const splash = document.getElementById('splashScreen');
    if (splash) {
        // Mantém splash visível (CSS já é display:flex). socket.js vai trocar para
        // showSetupScreen ou auto-login quando o setupStatus/portsList chegar.
        splash.style.display = 'flex';
    }
});
