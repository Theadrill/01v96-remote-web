/**
 * ThemeManager — Módulo de Gerenciamento do Painel de Temas (Fase 3.3)
 */
var ThemeManager = (function () {
    'use strict';

    var _activeTheme = 'default.yaml';
    var _ninjaSync = false;
    var _themes = [];

    function openModal() {
        var modal = document.getElementById('themeManagerModal');
        if (!modal) return;
        modal.style.display = 'flex';
        loadThemeList();
    }

    function closeModal() {
        var modal = document.getElementById('themeManagerModal');
        if (modal) modal.style.display = 'none';
    }

    async function loadThemeList() {
        var container = document.getElementById('themeListContainer');
        if (container) {
            container.innerHTML = '<div class="theme-loading">⏳ Carregando temas...</div>';
        }

        try {
            // Carregar tema ativo e status do Ninja Sync
            var activeRes = await window.apiFetch('/api/themes/active');
            if (activeRes.ok) {
                var activeData = await activeRes.json();
                _activeTheme = activeData.active_theme || 'default.yaml';
                _ninjaSync = !!activeData.ninja_sync_themes;

                var toggleSync = document.getElementById('toggleNinjaSyncThemes');
                if (toggleSync) toggleSync.checked = _ninjaSync;
            }

            // Carregar lista de temas
            var listRes = await window.apiFetch('/api/themes');
            if (listRes.ok) {
                _themes = await listRes.json();
                renderThemeList();
            } else {
                throw new Error('Falha ao carregar lista de temas');
            }
        } catch (e) {
            console.error('[ThemeManager] Erro ao carregar temas:', e);
            if (container) {
                container.innerHTML = '<div class="theme-error">❌ Erro ao carregar temas. Verifique a conexão com o servidor.</div>';
            }
        }
    }

    function renderThemeList() {
        var container = document.getElementById('themeListContainer');
        if (!container) return;

        if (!_themes || _themes.length === 0) {
            container.innerHTML = '<div class="theme-empty">Nenhum tema encontrado.</div>';
            return;
        }

        var html = _themes.map(function (theme) {
            var isAct = theme.is_active || theme.name === _activeTheme || theme.name + '.yaml' === _activeTheme;
            var isDef = theme.is_default || theme.name === 'default.yaml' || theme.name === 'default';

            var cardClass = 'theme-card' + (isAct ? ' theme-card-active' : '');
            var badgeHTML = '';

            if (isAct) {
                badgeHTML += '<span class="theme-badge theme-badge-active">★ ATIVO</span> ';
            }
            if (isDef) {
                badgeHTML += '<span class="theme-badge theme-badge-default">🛡️ PADRÃO</span> ';
            }

            var applyBtn = isAct
                ? '<button class="theme-btn theme-btn-active-label" disabled>EM USO</button>'
                : `<button class="theme-btn theme-btn-apply" onclick="ThemeManager.applyTheme('${theme.name}')">APLICAR</button>`;

            var editBtn = `<button class="theme-btn theme-btn-edit" onclick="ThemeManager.editTheme('${theme.name}')">${isDef ? 'VISUALIZAR' : 'EDITAR'}</button>`;
            var dupBtn = `<button class="theme-btn theme-btn-dup" onclick="ThemeManager.duplicateTheme('${theme.name}')">DUPLICAR</button>`;

            var delBtn = isDef
                ? '<button class="theme-btn theme-btn-del" disabled title="Tema padrão não pode ser excluído">EXCLUIR</button>'
                : `<button class="theme-btn theme-btn-del" onclick="ThemeManager.deleteTheme('${theme.name}')">EXCLUIR</button>`;

            return `
                <div class="${cardClass}">
                    <div class="theme-card-info">
                        <div class="theme-card-name">${theme.name} ${badgeHTML}</div>
                    </div>
                    <div class="theme-card-actions">
                        ${applyBtn}
                        ${editBtn}
                        ${dupBtn}
                        ${delBtn}
                    </div>
                </div>
            `;
        }).join('');

        container.innerHTML = html;
    }

    async function applyTheme(themeName) {
        try {
            var res = await window.apiFetch('/api/themes/active', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ active_theme: themeName })
            });

            if (!res.ok) throw new Error('Erro ao definir tema ativo');

            // Recarregar o conteúdo do tema para aplicar instantaneamente
            var themeRes = await window.apiFetch('/api/themes/' + encodeURIComponent(themeName));
            if (themeRes.ok) {
                var data = await themeRes.json();
                if (data && data.content && typeof ThemeEngine !== 'undefined' && ThemeEngine.apply) {
                    ThemeEngine.apply(data.content);
                }
            }

            _activeTheme = themeName;
            await loadThemeList();

            // Modal de confirmação com reload para estilização total limpa
            if (typeof ConfirmModal !== 'undefined' && ConfirmModal.show) {
                var confirm = await ConfirmModal.show({
                    title: 'Tema Aplicado!',
                    message: `O tema "${themeName}" foi ativado com sucesso. Recarregar a página para atualizar toda a interface?`,
                    type: 'info',
                    confirmText: 'RECARREGAR',
                    cancelText: 'CONTINUAR'
                });
                if (confirm) {
                    window.location.reload();
                }
            }
        } catch (e) {
            console.error('[ThemeManager] Erro ao aplicar tema:', e);
            if (typeof ConfirmModal !== 'undefined' && ConfirmModal.alert) {
                ConfirmModal.alert('Erro ao aplicar tema: ' + e.message, 'ERRO', 'danger');
            }
        }
    }

    async function createNewTheme() {
        if (typeof ConfirmModal === 'undefined' || !ConfirmModal.show) return;

        var res = await ConfirmModal.show({
            title: 'Novo Tema',
            message: 'Digite o nome do novo tema:',
            type: 'info',
            input: {
                label: 'Nome do arquivo (ex: meu_tema):',
                defaultValue: '',
                maxLength: 30
            }
        });

        if (!res || !res.confirmed || !res.value) return;

        var cleanName = res.value.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '_');
        if (!cleanName) return;

        if (!cleanName.endsWith('.yaml') && !cleanName.endsWith('.yml')) {
            cleanName += '.yaml';
        }

        try {
            // Obter tema padrão como base
            var defaultRes = await window.apiFetch('/api/themes/default.yaml');
            var baseContent = '';
            if (defaultRes.ok) {
                var defData = await defaultRes.json();
                baseContent = defData.content || '';
            }

            if (!baseContent) {
                baseContent = '# Novo Tema Customizado\nglobal:\n  bg_overlay: "rgba(0,0,0,0.7)"\n';
            }

            var saveRes = await window.apiFetch('/api/themes/' + encodeURIComponent(cleanName), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ content: baseContent })
            });

            if (!saveRes.ok) {
                var errJson = await saveRes.json();
                throw new Error(errJson.error || 'Erro ao criar tema');
            }

            await loadThemeList();

            // Abrir editor para o novo tema se disponível (Fase 3.4)
            if (typeof ThemeEditor !== 'undefined' && ThemeEditor.open) {
                ThemeEditor.open(cleanName);
            }
        } catch (e) {
            if (typeof ConfirmModal !== 'undefined' && ConfirmModal.alert) {
                ConfirmModal.alert('Erro ao criar novo tema: ' + e.message, 'ERRO', 'danger');
            }
        }
    }

    async function duplicateTheme(themeName) {
        if (typeof ConfirmModal === 'undefined' || !ConfirmModal.show) return;

        var defaultCopyName = themeName.replace(/(\.yaml|\.yml)$/i, '') + '_copia';

        var res = await ConfirmModal.show({
            title: 'Duplicar Tema',
            message: `Criar uma cópia personalizável do tema "${themeName}":`,
            type: 'info',
            input: {
                label: 'Nome da cópia:',
                defaultValue: defaultCopyName,
                maxLength: 35
            }
        });

        if (!res || !res.confirmed || !res.value) return;

        var cleanName = res.value.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '_');
        if (!cleanName) return;

        if (!cleanName.endsWith('.yaml') && !cleanName.endsWith('.yml')) {
            cleanName += '.yaml';
        }

        try {
            var origRes = await window.apiFetch('/api/themes/' + encodeURIComponent(themeName));
            if (!origRes.ok) throw new Error('Erro ao obter conteúdo do tema de origem');
            var origData = await origRes.json();

            var saveRes = await window.apiFetch('/api/themes/' + encodeURIComponent(cleanName), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ content: origData.content })
            });

            if (!saveRes.ok) {
                var errJson = await saveRes.json();
                throw new Error(errJson.error || 'Erro ao salvar cópia do tema');
            }

            await loadThemeList();
        } catch (e) {
            if (typeof ConfirmModal !== 'undefined' && ConfirmModal.alert) {
                ConfirmModal.alert('Erro ao duplicar tema: ' + e.message, 'ERRO', 'danger');
            }
        }
    }

    async function deleteTheme(themeName) {
        if (typeof ConfirmModal === 'undefined' || !ConfirmModal.show) return;

        var confirm = await ConfirmModal.show({
            title: 'Excluir Tema?',
            message: `Tem certeza que deseja excluir o tema "${themeName}"? Esta ação não pode ser desfeita.`,
            type: 'danger',
            confirmText: 'EXCLUIR',
            cancelText: 'CANCELAR'
        });

        if (!confirm) return;

        try {
            var res = await window.apiFetch('/api/themes/' + encodeURIComponent(themeName), {
                method: 'DELETE'
            });

            if (!res.ok) {
                var errJson = await res.json();
                throw new Error(errJson.error || 'Erro ao excluir tema');
            }

            await loadThemeList();
        } catch (e) {
            if (typeof ConfirmModal !== 'undefined' && ConfirmModal.alert) {
                ConfirmModal.alert('Erro ao excluir tema: ' + e.message, 'ERRO', 'danger');
            }
        }
    }

    async function toggleNinjaSyncThemes(enabled) {
        var toggleSync = document.getElementById('toggleNinjaSyncThemes');

        if (!enabled) {
            // Confirmar desativação do Ninja Sync
            if (typeof ConfirmModal !== 'undefined' && ConfirmModal.show) {
                var confirmDisable = await ConfirmModal.show({
                    title: 'DESATIVAR SINCRONIZAÇÃO',
                    message: 'Deseja desativar a sincronização dos temas na nuvem (Ninja Sync)? Os temas locais serão preservados.',
                    type: 'warning',
                    confirmText: 'DESATIVAR',
                    cancelText: 'CANCELAR'
                });

                if (!confirmDisable) {
                    if (toggleSync) toggleSync.checked = true;
                    return;
                }
            }

            try {
                var res = await window.apiFetch('/api/themes/active', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ ninja_sync_themes: false })
                });
                if (!res.ok) throw new Error('Erro ao desativar Ninja Sync');
                _ninjaSync = false;
            } catch (e) {
                console.error('[ThemeManager] Erro ao alternar Ninja Sync:', e);
                if (typeof ConfirmModal !== 'undefined' && ConfirmModal.alert) {
                    ConfirmModal.alert('Erro ao alternar Ninja Sync: ' + e.message, 'ERRO', 'danger');
                }
                if (toggleSync) toggleSync.checked = true;
            }
            return;
        }

        // Ativação: Verificar se há diferenças/conflitos entre temas locais e nuvem
        try {
            var compareRes = await window.apiFetch('/api/themes/compare');
            if (!compareRes.ok) throw new Error('Erro ao comparar temas');
            var compareData = await compareRes.json();

            if (compareData.identical) {
                // Idênticos: Apenas confirma e ativa
                if (typeof ConfirmModal !== 'undefined' && ConfirmModal.show) {
                    var confirmActivate = await ConfirmModal.show({
                        title: 'ATIVAR SINCRONIZAÇÃO',
                        message: 'Os temas locais e da nuvem são idênticos. Deseja ativar a sincronização Ninja Sync?',
                        type: 'info',
                        confirmText: 'SIM, ATIVAR',
                        cancelText: 'CANCELAR'
                    });

                    if (!confirmActivate) {
                        if (toggleSync) toggleSync.checked = false;
                        return;
                    }
                }

                await window.apiFetch('/api/themes/sync_direction', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ direction: 'upload' })
                });
                _ninjaSync = true;
                await loadThemeList();
            } else {
                // Conflito detectado: Oferecer opções Upload / Download / Cancelar
                if (typeof ConfirmModal !== 'undefined' && ConfirmModal.show) {
                    var conflictRes = await ConfirmModal.show({
                        title: '☁️ Conflito de Temas Detectado',
                        message: `Existem ${compareData.differences.length} arquivo(s) de tema com diferenças entre a versão local e a nuvem.\n\nEscolha o sentido da sincronização:`,
                        type: 'warning',
                        buttons: [
                            { label: 'ENVIAR LOCAL PARA A NUVEM', action: 'upload', type: 'primary' },
                            { label: 'BAIXAR DA NUVEM PARA O LOCAL', action: 'download', type: 'info' },
                            { label: 'CANCELAR', action: 'cancel', type: 'secondary' }
                        ]
                    });

                    if (conflictRes === 'upload' || conflictRes === 'download') {
                        await window.apiFetch('/api/themes/sync_direction', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ direction: conflictRes })
                        });
                        _ninjaSync = true;
                        await loadThemeList();
                    } else {
                        if (toggleSync) toggleSync.checked = false;
                    }
                }
            }
        } catch (e) {
            console.error('[ThemeManager] Erro na sincronização:', e);
            if (typeof ConfirmModal !== 'undefined' && ConfirmModal.alert) {
                ConfirmModal.alert('Erro ao ativar Ninja Sync: ' + e.message, 'ERRO', 'danger');
            }
            if (toggleSync) toggleSync.checked = false;
        }
    }

    async function restoreDefaultTheme() {
        if (typeof ConfirmModal === 'undefined' || !ConfirmModal.show) return;

        var confirm = await ConfirmModal.show({
            title: 'Restaurar Tema Padrão?',
            message: 'Deseja redefinir o tema ativo para o default.yaml original do sistema?',
            type: 'warning',
            confirmText: 'RESTAURAR',
            cancelText: 'CANCELAR'
        });

        if (confirm) {
            await applyTheme('default.yaml');
        }
    }

    function editTheme(themeName) {
        if (typeof ThemeEditor !== 'undefined' && ThemeEditor.open) {
            ThemeEditor.open(themeName);
        }
    }

    return {
        openModal: openModal,
        closeModal: closeModal,
        loadThemeList: loadThemeList,
        applyTheme: applyTheme,
        createNewTheme: createNewTheme,
        duplicateTheme: duplicateTheme,
        deleteTheme: deleteTheme,
        toggleNinjaSyncThemes: toggleNinjaSyncThemes,
        restoreDefaultTheme: restoreDefaultTheme,
        editTheme: editTheme
    };
})();
