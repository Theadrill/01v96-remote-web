(function () {
    function showSetupError(msg) {
        const errorBox = document.getElementById('setupError');
        if (!errorBox) return;
        errorBox.textContent = msg;
        errorBox.style.display = 'block';
    }

    function clearSetupError() {
        const errorBox = document.getElementById('setupError');
        if (errorBox) errorBox.style.display = 'none';
    }

    function validateNameClient(name) {
        if (name.length < 3) return 'Nome deve ter no mínimo 3 caracteres';
        if (name.length > 30) return 'Nome deve ter no máximo 30 caracteres';
        if (!/^[a-z0-9-]+$/.test(name)) return 'Use apenas letras minúsculas, números e hífen';
        return null;
    }

    function validatePasswordClient(pass) {
        if (pass.length !== 4) return 'Senha deve ter exatamente 4 dígitos';
        if (!/^[0-9]{4}$/.test(pass)) return 'Senha deve conter apenas dígitos numéricos';
        return null;
    }

    function hideSplash() {
        const splash = document.getElementById('splashScreen');
        if (!splash) return;
        splash.style.pointerEvents = 'none';
        splash.style.transition = 'opacity 0.4s ease, transform 0.4s ease';
        splash.style.opacity = '0';
        splash.style.transform = 'scale(1.1)';
        setTimeout(() => { splash.style.display = 'none'; }, 400);
    }

    window.showSetupScreen = function () {
        const splashInitial = document.getElementById('splashInitial');
        const splashTecnico = document.getElementById('splashTecnico');
        const splashMusico = document.getElementById('splashMusico');
        const splashSetup = document.getElementById('splashSetup');
        if (splashInitial) splashInitial.style.display = 'none';
        if (splashTecnico) splashTecnico.style.display = 'none';
        if (splashMusico) splashMusico.style.display = 'none';
        if (!splashSetup) return;
        splashSetup.style.display = 'flex';

        const nameInput = document.getElementById('setupName');
        const passInput = document.getElementById('setupPassword');
        const passConfirmInput = document.getElementById('setupPasswordConfirm');

        clearSetupError();
        nameInput.value = '';
        passInput.value = '';
        passConfirmInput.value = '';
        nameInput.readOnly = false;
        passInput.readOnly = false;
        passConfirmInput.readOnly = false;

        const status = window.envStatus || 'not_found';
        const existingName = window.serverName || null;
        const passwordPresent = !!window.tecnicoPassword;

        if (existingName) {
            nameInput.value = existingName;
            nameInput.readOnly = true;
        }
        if (passwordPresent) {
            passInput.value = '••••';
            passInput.readOnly = true;
            passConfirmInput.value = '••••';
            passConfirmInput.readOnly = true;
        }

        const helpText = document.getElementById('setupHelpText');
        if (helpText) {
            if (status === 'complete') {
                helpText.textContent = 'Configuração completa. Use Configurações para alterar.';
            } else if (status === 'missing_name') {
                helpText.textContent = 'Defina o nome do servidor. A senha já está cadastrada.';
            } else if (status === 'missing_password') {
                helpText.textContent = 'Defina uma nova senha. O nome já está cadastrado.';
            } else {
                helpText.textContent = 'Cadastre o nome e a senha de acesso (4 dígitos).';
            }
        }

        setTimeout(() => {
            if (!nameInput.readOnly) nameInput.focus();
            else if (!passInput.readOnly) passInput.focus();
        }, 150);
    };

    window.submitSetup = function () {
        const nameInput = document.getElementById('setupName');
        const passInput = document.getElementById('setupPassword');
        const passConfirmInput = document.getElementById('setupPasswordConfirm');

        if (typeof socket === 'undefined' || !socket.connected) {
            showSetupError('Sem conexão com o servidor');
            return;
        }

        const nameEditable = !nameInput.readOnly;
        const passEditable = !passInput.readOnly;

        // Caso 1: usuário só pode editar o NOME (senha já existe no .env).
        // O backend preserva a senha atual — não precisa enviá-la.
        if (nameEditable && !passEditable) {
            const name = nameInput.value.trim();
            if (!name) {
                showSetupError('Digite um nome para o servidor');
                nameInput.focus();
                return;
            }
            const nameErr = validateNameClient(name);
            if (nameErr) {
                showSetupError(nameErr);
                nameInput.focus();
                return;
            }
            socket.emit('renameServer', { new_name: name, syncShared: window.customScenesSyncEnabled });
            return;
        }

        // Caso 2: usuário só pode editar a SENHA (nome já existe no .env).
        // Passamos o nome atual + nova senha via setupServer (o backend sobrescreve o .env).
        if (!nameEditable && passEditable) {
            const name = (window.serverName || '').trim();
            const pass = passInput.value;
            const passConfirm = passConfirmInput.value;
            if (!name) {
                showSetupError('Nome do servidor ausente — não é possível atualizar a senha');
                return;
            }
            if (pass !== passConfirm) {
                showSetupError('A confirmação da senha não confere');
                passConfirmInput.focus();
                return;
            }
            const passErr = validatePasswordClient(pass);
            if (passErr) {
                showSetupError(passErr);
                passInput.focus();
                return;
            }
            socket.emit('setupServer', { name, password: pass });
            return;
        }

        // Caso 3: setup inicial (ambos editáveis).
        if (nameEditable && passEditable) {
            const name = nameInput.value.trim();
            const pass = passInput.value;
            const passConfirm = passConfirmInput.value;
            if (!name) {
                showSetupError('Digite um nome para o servidor');
                nameInput.focus();
                return;
            }
            const nameErr = validateNameClient(name);
            if (nameErr) {
                showSetupError(nameErr);
                nameInput.focus();
                return;
            }
            if (pass !== passConfirm) {
                showSetupError('A confirmação da senha não confere');
                passConfirmInput.focus();
                return;
            }
            const passErr = validatePasswordClient(pass);
            if (passErr) {
                showSetupError(passErr);
                passInput.focus();
                return;
            }
            socket.emit('setupServer', { name, password: pass });
            return;
        }

        // Caso 4: nada editável (não deveria acontecer na splash de cadastro).
        showSetupError('Nada para atualizar. Use o menu Configurações para alterar o nome.');
    };

    window.cancelSetup = function () {
        const splashSetup = document.getElementById('splashSetup');
        const splashInitial = document.getElementById('splashInitial');
        if (splashSetup) splashSetup.style.display = 'none';
        if (splashInitial) splashInitial.style.display = 'flex';
        clearSetupError();
    };

    window.onSetupResult = function (data) {
        if (!data) return;
        if (data.success) {
            window.envStatus = 'complete';
            window.serverName = data.server_name || window.serverName;
            if (data.password) {
                window.tecnicoPassword = data.password;
            } else {
                // Pede ao servidor a senha atual (caso o backend decida não ecoar)
                if (typeof socket !== 'undefined' && socket.connected) {
                    socket.emit('getServerName');
                }
            }
            try {
                localStorage.setItem('01v96_role', 'technician');
            } catch (e) { /* localStorage indisponível */ }
            hideSplash();
            if (typeof initUI === 'function') initUI();
        } else {
            showSetupError(data.error || 'Erro ao salvar configuração');
        }
    };

    // Intercepta o onRenameResult (definido pelo sidebar.js) para tratar o caso
    // em que o rename foi disparado a partir da tela de cadastro: nesse caso,
    // fechamos a splash e entramos na tela principal em vez de mostrar o status
    // no modal de configurações.
    (function wrapRenameResult() {
        const original = window.onRenameResult;
        window.onRenameResult = function (data) {
            if (!data) return;
            const splashSetup = document.getElementById('splashSetup');
            const isSetupScreenVisible = splashSetup && splashSetup.style.display !== 'none';
            if (isSetupScreenVisible) {
                if (data.success) {
                    window.envStatus = 'complete';
                    window.serverName = data.server_name || window.serverName;
                    try {
                        localStorage.setItem('01v96_role', 'technician');
                    } catch (e) { /* localStorage indisponível */ }
                    hideSplash();
                    if (typeof initUI === 'function') initUI();
                } else {
                    showSetupError(data.error || 'Erro ao renomear');
                }
                return;
            }
            if (typeof original === 'function') original(data);
        };
    })();

    window.onSetupCompleted = function (data) {
        if (!data) return;
        window.envStatus = data.env_status || 'complete';
        window.serverName = data.server_name || window.serverName;
    };

    document.addEventListener('DOMContentLoaded', () => {
        const ids = ['setupName', 'setupPassword', 'setupPasswordConfirm'];
        ids.forEach(id => {
            const el = document.getElementById(id);
            if (!el) return;
            el.addEventListener('keypress', (e) => {
                if (e.key === 'Enter' && typeof window.submitSetup === 'function') {
                    window.submitSetup();
                }
            });
            el.addEventListener('input', clearSetupError);
        });
    });
})();
