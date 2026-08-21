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

    function open(themeName) {
        _currentThemeName = themeName || 'default.yaml';
        _isReadOnly = (
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
            var res = await fetch('/api/themes/' + encodeURIComponent(themeName));
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

            var fieldsHtml = Object.keys(sectionData).map(function (fieldKey) {
                var val = sectionData[fieldKey];
                var fieldLabel = _snakeToTitleCase(fieldKey);
                var isColor = _isColorValue(val, fieldKey);

                var inputId = `te_field_${sIdx}_${fieldKey}`;

                if (isColor) {
                    var colorHex = (typeof val === 'string' && val.startsWith('#')) ? val : '#ffffff';
                    return `
                        <div class="te-field-row">
                            <label class="te-field-label" for="${inputId}">${fieldLabel}</label>
                            <div class="te-color-picker-input-wrap">
                                <div class="te-color-swatch-box" id="${inputId}_swatch" style="background-color: ${val};"
                                    ${_isReadOnly ? '' : `onclick="ThemeEditor.pickColor('${sectionKey}', '${fieldKey}', '${inputId}')"`}></div>
                                <input type="text" id="${inputId}" class="te-field-input te-color-hex" value="${val}"
                                    ${_isReadOnly ? 'readonly' : ''}
                                    onchange="ThemeEditor.onFieldChange('${sectionKey}', '${fieldKey}', this.value)" />
                            </div>
                        </div>
                    `;
                } else {
                    return `
                        <div class="te-field-row">
                            <label class="te-field-label" for="${inputId}">${fieldLabel}</label>
                            <input type="text" id="${inputId}" class="te-field-input" value="${val}"
                                ${_isReadOnly ? 'readonly' : ''}
                                onchange="ThemeEditor.onFieldChange('${sectionKey}', '${fieldKey}', this.value)" />
                        </div>
                    `;
                }
            }).join('');

            return `
                <div class="te-accordion-card">
                    <div class="te-accordion-header" onclick="ThemeEditor.toggleAccordion('te_acc_${sIdx}')">
                        <div class="te-accordion-title-wrap">
                            <span class="te-accordion-title">🎨 ${title}</span>
                            ${subtitle ? `<span class="te-accordion-subtitle">${subtitle}</span>` : ''}
                        </div>
                        <span class="te-accordion-arrow" id="te_acc_${sIdx}_arrow">▼</span>
                    </div>
                    <div class="te-accordion-body" id="te_acc_${sIdx}" style="display: flex;">
                        ${fieldsHtml}
                    </div>
                </div>
            `;
        }).join('');

        container.innerHTML = html;
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

    function onFieldChange(sectionKey, fieldKey, newValue) {
        if (_isReadOnly) return;
        if (!_parsedData[sectionKey]) _parsedData[sectionKey] = {};
        _parsedData[sectionKey][fieldKey] = newValue;

        // Atualizar cor da swatch box se for campo de cor
        var swatchBox = document.getElementById(`te_field_${sectionKey}_${fieldKey}_swatch`);
        if (swatchBox) swatchBox.style.backgroundColor = newValue;

        // Live Preview das variáveis CSS
        if (typeof jsyaml !== 'undefined') {
            try {
                var liveYaml = jsyaml.dump(_parsedData);
                if (typeof ConfirmModal !== 'undefined' && ConfirmModal.loadTheme) {
                    ConfirmModal.loadTheme(liveYaml);
                }
            } catch (e) {}
        }
    }

    async function pickColor(sectionKey, fieldKey, inputId) {
        if (_isReadOnly) return;
        var currentVal = (_parsedData[sectionKey] && _parsedData[sectionKey][fieldKey]) || '#ffffff';

        if (typeof ColorPicker !== 'undefined' && ColorPicker.open) {
            var chosen = await ColorPicker.open({
                mode: 'full', // Editor usa modo completo com barras RGB!
                initialColor: currentVal,
                title: `Cor: ${_snakeToTitleCase(fieldKey)}`
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

            var res = await fetch('/api/themes/' + encodeURIComponent(_currentThemeName), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ content: yamlString })
            });

            if (!res.ok) {
                var err = await res.json();
                throw new Error(err.error || 'Erro ao salvar tema');
            }

            if (typeof ConfirmModal !== 'undefined' && ConfirmModal.loadTheme) {
                ConfirmModal.loadTheme(yamlString);
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

    return {
        open: open,
        close: close,
        toggleAccordion: toggleAccordion,
        onFieldChange: onFieldChange,
        pickColor: pickColor,
        saveTheme: saveTheme
    };
})();
