/**
 * ThemeEditor — Editor Visual Auto-Categorizado Data-Driven via YAML (Fase 3.4 & 3.5)
 */
var ThemeEditor = (function () {
    'use strict';

    var _currentThemeName = '';
    var _rawYaml = '';
    var _parsedData = {};
    var _sectionComments = {};
    var _isReadOnly = false;
    var _adminMode = false;

    function _getThemeSource() {
        return window.location.pathname.startsWith('/new') ? 'public_new' : 'public';
    }

    function open(themeName, options) {
        _currentThemeName = themeName || 'default.yaml';
        _adminMode = (options && options.adminMode) ? true : false;
        _isReadOnly = _adminMode ? false : (
            _currentThemeName.toLowerCase() === 'default' ||
            _currentThemeName.toLowerCase() === 'default.yaml' ||
            _currentThemeName.toLowerCase() === 'default.yml'
        );

        var modal = document.getElementById('themeEditorModal');
        if (!modal) return;
        modal.style.display = 'flex';
        loadAndParseTheme(_currentThemeName);
    }

    function close() {
        var modal = document.getElementById('themeEditorModal');
        if (modal) modal.style.display = 'none';
    }

    async function loadAndParseTheme(themeName) {
        var container = document.getElementById('themeEditorSections');
        if (container) {
            container.innerHTML = '<div class="theme-loading">⏳ Carregando estrutura do tema...</div>';
        }

        var titleEl = document.getElementById('themeEditorTitle');
        if (titleEl) {
            titleEl.textContent = `✏️ Editor de Tema: ${themeName}`;
        }

        var readOnlyBanner = document.getElementById('themeEditorReadOnlyBanner');
        if (readOnlyBanner) {
            readOnlyBanner.style.display = _isReadOnly ? 'block' : 'none';
        }

        var saveBtn = document.getElementById('themeEditorSaveBtn');
        if (saveBtn) {
            if (_isReadOnly) {
                saveBtn.textContent = 'DUPLICAR PARA EDITAR';
                saveBtn.className = 'btn-connect theme-btn-dup';
            } else {
                saveBtn.textContent = 'SALVAR TEMA';
                saveBtn.className = 'btn-connect theme-btn-apply';
            }
        }

        try {
            var res = await fetch('/api/themes/' + encodeURIComponent(themeName) + '?source=' + _getThemeSource());
            if (!res.ok) throw new Error('Falha ao carregar tema');
            var data = await res.json();

            _rawYaml = data.content || '';
            _parseYamlWithComments(_rawYaml);
            renderSections();
        } catch (e) {
            console.error('[ThemeEditor] Erro ao carregar tema:', e);
            if (container) {
                container.innerHTML = '<div class="theme-error">❌ Erro ao carregar arquivo de tema.</div>';
            }
        }
    }

    // Parser data-driven: extrai chaves + comentários de cada seção
    function _parseYamlWithComments(yamlText) {
        _parsedData = {};
        _sectionComments = {};

        if (typeof jsyaml !== 'undefined') {
            try {
                _parsedData = jsyaml.load(yamlText) || {};
            } catch (e) {
                console.warn('[ThemeEditor] Erro ao parsear YAML via js-yaml:', e);
            }
        }

        var lines = yamlText.split('\n');

        // Se houver a marcação ENDOFDESCRIPTION ou ENDOFHEADER, ignora todo o bloco anterior
        var headerEndLine = -1;
        for (var h = 0; h < lines.length; h++) {
            if (lines[h].includes('ENDOFDESCRIPTION') || lines[h].includes('ENDOFHEADER')) {
                headerEndLine = h;
                break;
            }
        }

        var startLine = (headerEndLine >= 0) ? headerEndLine + 1 : 0;
        var currentComments = [];

        for (var i = startLine; i < lines.length; i++) {
            var line = lines[i].trim();

            if (line.startsWith('#')) {
                if (line.includes('════') || line.includes('ENDOFDESCRIPTION') || line.includes('ENDOFHEADER')) {
                    currentComments = [];
                    continue;
                }
                var commentText = line.replace(/^#+\s*/, '').trim();
                // Ignorar linhas puramente decorativas (ex: ─── OVERLAY GLOBAL ───)
                if (commentText.startsWith('─') || commentText.startsWith('═')) {
                    continue;
                }
                if (commentText) {
                    currentComments.push(commentText);
                }
            } else if (line.endsWith(':') && !line.startsWith('-') && !line.includes(' ')) {
                var sectionKey = line.slice(0, -1).trim();
                if (currentComments.length > 0) {
                    _sectionComments[sectionKey] = currentComments.join(' — ');
                }
                currentComments = [];
            } else if (line !== '') {
                currentComments = [];
            }
        }
    }

    function _snakeToTitleCase(str) {
        return str
            .replace(/_/g, ' ')
            .replace(/\w\S*/g, function (txt) {
                return txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase();
            });
    }

    function _isColorValue(val, keyName) {
        if (typeof val !== 'string') return false;
        var v = val.trim();
        var k = (keyName || '').toLowerCase();
        return (
            v.startsWith('#') ||
            v.startsWith('rgb') ||
            v.startsWith('hsl') ||
            k.includes('color') ||
            k.includes('bg') ||
            k.includes('primary') ||
            k.includes('danger') ||
            k.includes('warning') ||
            k.includes('info') ||
            k.includes('secondary')
        );
    }

    function renderSections() {
        var container = document.getElementById('themeEditorSections');
        if (!container) return;

        var keys = Object.keys(_parsedData);
        if (keys.length === 0) {
            container.innerHTML = '<div class="theme-empty">Nenhuma seção encontrada no YAML.</div>';
            return;
        }

        var html = keys.map(function (sectionKey, sIdx) {
            var sectionData = _parsedData[sectionKey];
            if (typeof sectionData !== 'object' || sectionData === null) return '';

            var title = _snakeToTitleCase(sectionKey);
            var subtitle = _sectionComments[sectionKey] || '';

            var fieldsHtml = renderFieldsHtml(sectionData, sectionKey, sIdx, '');

            return `
                <div class="te-accordion-card">
                    <div class="te-accordion-header" onclick="ThemeEditor.toggleAccordion('te_acc_${sIdx}')">
                        <div class="te-accordion-title-wrap">
                            <span class="te-accordion-title">🎨 ${title}</span>
                            ${subtitle ? `<span class="te-accordion-subtitle">${subtitle}</span>` : ''}
                        </div>
                        <span class="te-accordion-arrow" id="te_acc_${sIdx}_arrow">▶</span>
                    </div>
                    <div class="te-accordion-body" id="te_acc_${sIdx}" style="display: none;">
                        ${fieldsHtml}
                    </div>
                </div>
            `;
        }).join('');

        container.innerHTML = html;
    }

    /**
     * Renderiza campos recursivamente, suportando sub-objetos aninhados.
     * @param {Object} data - Objeto com os campos a renderizar
     * @param {string} sectionKey - Chave da seção pai (ex: 'channel_strip')
     * @param {number} sIdx - Índice da seção para IDs únicos
     * @param {string} prefix - Prefixo do path (ex: 'mobile.' ou 'mobile.card_width.')
     * @returns {string} HTML dos campos renderizados
     */
    function renderFieldsHtml(data, sectionKey, sIdx, prefix) {
        return Object.keys(data).map(function (fieldKey) {
            var val = data[fieldKey];
            var fullPath = prefix ? prefix + fieldKey : fieldKey;
            var fieldLabel = _snakeToTitleCase(fieldKey);
            var inputId = 'te-' + sIdx + '-' + fullPath.replace(/\./g, '_');

            // Se o valor é um objeto aninhado, renderiza sub-seção recursiva
            if (typeof val === 'object' && val !== null) {
                var nestedHtml = renderFieldsHtml(val, sectionKey, sIdx, fullPath + '.');
                return `
                    <div class="te-sub-section">
                        <div class="te-sub-section-title">${fieldLabel}</div>
                        ${nestedHtml}
                    </div>
                `;
            }

            // Valor primitivo (string/number) - renderiza campo normal
            var isColor = _isColorValue(val, fieldKey);

            if (isColor) {
                return `
                    <div class="te-field-row">
                        <label class="te-field-label" for="${inputId}">${fieldLabel}</label>
                        <div class="te-color-picker-input-wrap">
                            <div class="te-color-swatch-box" id="${inputId}_swatch" style="background-color: ${val};"
                                ${_isReadOnly ? '' : `onclick="ThemeEditor.pickColor('${sectionKey}', '${fullPath}', '${inputId}')"`}></div>
                            <input type="text" id="${inputId}" class="te-field-input te-color-hex" value="${val}"
                                ${_isReadOnly ? 'readonly' : ''}
                                oninput="ThemeEditor.onColorInput(this)"
                                onchange="ThemeEditor.onFieldChange('${sectionKey}', '${fullPath}', this.value)" />
                        </div>
                    </div>
                `;
            } else {
                return `
                    <div class="te-field-row">
                        <label class="te-field-label" for="${inputId}">${fieldLabel}</label>
                        <input type="text" id="${inputId}" class="te-field-input" value="${val}"
                            ${_isReadOnly ? 'readonly' : ''}
                            onchange="ThemeEditor.onFieldChange('${sectionKey}', '${fullPath}', this.value)" />
                    </div>
                `;
            }
        }).join('');
    }

    function toggleAccordion(id) {
        var body = document.getElementById(id);
        var arrow = document.getElementById(id + '_arrow');
        if (!body) return;

        if (body.style.display === 'none') {
            body.style.display = 'flex';
            if (arrow) arrow.textContent = '▼';
        } else {
            body.style.display = 'none';
            if (arrow) arrow.textContent = '▶';
        }
    }

    /**
     * Resolve um path com notação de ponto em um objeto (ex: 'mobile.card_width' -> obj.mobile.card_width).
     */
    function _resolveNestedValue(obj, path) {
        var parts = path.split('.');
        var current = obj;
        for (var i = 0; i < parts.length; i++) {
            if (current === null || current === undefined || typeof current !== 'object') return undefined;
            current = current[parts[i]];
        }
        return current;
    }

    /**
     * Define um valor em path aninhado com notação de ponto (ex: 'mobile.card_width' -> obj.mobile.card_width = val).
     */
    function _setNestedValue(obj, path, value) {
        var parts = path.split('.');
        var current = obj;
        for (var i = 0; i < parts.length - 1; i++) {
            if (current[parts[i]] === null || current[parts[i]] === undefined || typeof current[parts[i]] !== 'object') {
                current[parts[i]] = {};
            }
            current = current[parts[i]];
        }
        current[parts[parts.length - 1]] = value;
    }

    function onFieldChange(sectionKey, fieldKey, newValue) {
        if (_isReadOnly) return;
        if (!_parsedData[sectionKey]) _parsedData[sectionKey] = {};
        _setNestedValue(_parsedData[sectionKey], fieldKey, newValue);

        // Live Preview das variáveis CSS
        if (typeof jsyaml !== 'undefined') {
            try {
                var liveYaml = jsyaml.dump(_parsedData);
                if (typeof ThemeEngine !== 'undefined' && ThemeEngine.apply) {
                    ThemeEngine.apply(liveYaml);
                }
            } catch (e) {}
        }
    }

    /**
     * Atualiza o swatch de cor em tempo real enquanto o usuário digita no input de texto.
     * Chamado pelo evento oninput do input de cor.
     * @param {HTMLInputElement} inputEl - Elemento input de texto de cor
     */
    function onColorInput(inputEl) {
        var value = inputEl.value;
        var inputId = inputEl.id;
        var swatchBox = document.getElementById(inputId + '_swatch');
        if (swatchBox) {
            // Atualiza a cor de fundo se for um valor de cor válido
            if (value && (value.startsWith('#') || value.startsWith('rgb') || value.startsWith('hsl'))) {
                swatchBox.style.backgroundColor = value;
            }
        }

        // Atualiza também os dados internos do tema para live preview
        if (_isReadOnly) return;
        // Extrai sectionKey e fieldKey a partir do ID do input: te-{sIdx}-{fullPath}
        var idParts = inputId.split('-');
        if (idParts.length >= 3) {
            var fieldPath = idParts.slice(2).join('-').replace(/_/g, '.');
            // Encontra a sectionKey correspondente ao sIdx
            var sIdx = parseInt(idParts[1], 10);
            var keys = Object.keys(_parsedData);
            if (sIdx >= 0 && sIdx < keys.length) {
                var sectionKey = keys[sIdx];
                if (!_parsedData[sectionKey]) _parsedData[sectionKey] = {};
                _setNestedValue(_parsedData[sectionKey], fieldPath, value);
            }
        }
    }

    async function pickColor(sectionKey, fieldKey, inputId) {
        if (_isReadOnly) return;
        var currentVal = (_parsedData[sectionKey] ? _resolveNestedValue(_parsedData[sectionKey], fieldKey) : undefined) || '#ffffff';

        if (typeof ColorPicker !== 'undefined' && ColorPicker.open) {
            var chosen = await ColorPicker.open({
                mode: 'full', // Editor usa modo completo com barras RGB!
                initialColor: currentVal,
                title: `Cor: ${_snakeToTitleCase(fieldKey.split('.').pop())}`
            });

            if (chosen) {
                var input = document.getElementById(inputId);
                if (input) input.value = chosen;

                var swatchBox = document.getElementById(inputId + '_swatch');
                if (swatchBox) swatchBox.style.backgroundColor = chosen;

                onFieldChange(sectionKey, fieldKey, chosen);
            }
        }
    }

    async function saveTheme() {
        if (_isReadOnly) {
            // Redireciona para duplicar tema no modo somente leitura
            close();
            if (typeof ThemeManager !== 'undefined' && ThemeManager.duplicateTheme) {
                ThemeManager.duplicateTheme(_currentThemeName);
            }
            return;
        }

        if (typeof jsyaml === 'undefined') {
            if (typeof ConfirmModal !== 'undefined' && ConfirmModal.alert) {
                ConfirmModal.alert('js-yaml não está disponível para compilar o tema', 'ERRO', 'danger');
            }
            return;
        }

        try {
            var yamlString = jsyaml.dump(_parsedData);

            // Validação de sintaxe
            jsyaml.load(yamlString);

            if (_adminMode) {
                // Modo admin: salva o default.yaml diretamente no servidor
                var adminRes = await fetch('/api/themes/default/admin-save', {
                    method: 'POST',
                    headers: { 'Content-Type': 'text/plain' },
                    body: yamlString
                });

                if (!adminRes.ok) {
                    var adminErr = await adminRes.json().catch(function () { return {}; });
                    throw new Error(adminErr.error || 'Erro ao salvar default.yaml');
                }

                if (typeof ThemeEngine !== 'undefined' && ThemeEngine.apply) {
                    ThemeEngine.apply(yamlString);
                }

                if (typeof ConfirmModal !== 'undefined' && ConfirmModal.alert) {
                    ConfirmModal.alert('✅ default.yaml salvo com sucesso!', 'SUCESSO', 'primary');
                }

                // Mantém o editor aberto
                return;
            }

            var res = await fetch('/api/themes/' + encodeURIComponent(_currentThemeName) + '?source=' + _getThemeSource(), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ content: yamlString })
            });

            if (!res.ok) {
                var err = await res.json();
                throw new Error(err.error || 'Erro ao salvar tema');
            }

            if (typeof ThemeEngine !== 'undefined' && ThemeEngine.apply) {
                ThemeEngine.apply(yamlString);
            }

            close();
            if (typeof ConfirmModal !== 'undefined' && ConfirmModal.alert) {
                ConfirmModal.alert(`Tema "${_currentThemeName}" salvo com sucesso!`, 'SUCESSO', 'primary');
            }

            if (typeof ThemeManager !== 'undefined' && ThemeManager.loadThemeList) {
                ThemeManager.loadThemeList();
            }
        } catch (e) {
            if (typeof ConfirmModal !== 'undefined' && ConfirmModal.alert) {
                ConfirmModal.alert('Erro de sintaxe/salvamento do YAML: ' + e.message, 'ERRO', 'danger');
            }
        }
    }

    function openAdmin(themeName) {
        open(themeName, { adminMode: true });
    }

    return {
        open: open,
        openAdmin: openAdmin,
        close: close,
        toggleAccordion: toggleAccordion,
        onFieldChange: onFieldChange,
        onColorInput: onColorInput,
        pickColor: pickColor,
        saveTheme: saveTheme
    };
})();
