function showSplashStep(step) {
    const splashInitial = document.getElementById('splashInitial');
    const splashTecnico = document.getElementById('splashTecnico');
    const splashMusico = document.getElementById('splashMusico');
    const tecnicoPass = document.getElementById('tecnicoPass');

    splashInitial.style.display = 'none';
    splashTecnico.style.display = 'none';
    splashMusico.style.display = 'none';

    if (step === 'initial') {
        splashInitial.style.display = 'flex';
    } else if (step === 'tecnico') {
        splashTecnico.style.display = 'flex';
        tecnicoPass.value = '';
        setTimeout(() => tecnicoPass.focus(), 150);
    } else if (step === 'musico') {
        splashMusico.style.display = 'flex';
    }
}

function checkTecnicoPass() {
    const pass = document.getElementById('tecnicoPass').value;
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

    // Lógica de Auto-Login
    const savedRole = localStorage.getItem('01v96_role');
    if (savedRole === 'technician') {
        document.getElementById('splashScreen').style.display = 'none';
        // O app inicia por padrão como técnico no app.js
    } else if (savedRole === 'musician') {
        const savedMix = localStorage.getItem('01v96_mix');
        if (savedMix) {
            document.getElementById('splashScreen').style.display = 'none';
            enterMusicianMode(parseInt(savedMix));
        }
    }
});
