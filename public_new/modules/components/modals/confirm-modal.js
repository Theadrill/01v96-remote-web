// ConfirmModal — Componente reutilizável de modal de confirmação
// Uso: ConfirmModal.show({ title, message, type }) → Promise<boolean>
// Uso com input: ConfirmModal.show({ ..., input: { label, maxLength } }) → Promise<{ confirmed, value }>

var ConfirmModal = (function () {
    'use strict';

    var _root = null;
    var _content = null;
    var _iconEl = null;
    var _headerEl = null;
    var _bodyEl = null;
    var _footerEl = null;
    var _resolve = null;
    var _isOpen = false;
    var _hasInput = false;
    var _customResult = null;
    var _inputId = 'confirm-modal-input-' + Date.now();

    // ─── DOM helpers ────────────────────────────────────────────

    function _el(tag, attrs) {
        var e = document.createElement(tag);
        if (attrs) {
            Object.keys(attrs).forEach(function (k) {
                if (k === 'className') {
                    e.className = attrs[k];
                } else if (k === 'textContent') {
                    e.textContent = attrs[k];
                } else {
                    e.setAttribute(k, attrs[k]);
                }
            });
        }
        return e;
    }

    // ─── Criar estrutura DOM ────────────────────────────────────

    function _buildDOM() {
        if (_root) return;

        _root = _el('div', { className: 'confirm-modal-overlay', id: 'confirmModalOverlay' });
        _content = _el('div', { className: 'confirm-modal-content' });
        _iconEl = _el('div', { className: 'confirm-modal-icon' });
        _headerEl = _el('div', { className: 'confirm-modal-header' });
        _bodyEl = _el('div', { className: 'confirm-modal-body' });
        _footerEl = _el('div', { className: 'confirm-modal-footer' });

        _content.appendChild(_iconEl);
        _content.appendChild(_headerEl);
        _content.appendChild(_bodyEl);
        _content.appendChild(_footerEl);
        _root.appendChild(_content);
        document.body.appendChild(_root);

        // Fechar com clique no overlay
        _root.addEventListener('click', function (e) {
            if (e.target === _root) {
                _close(false);
            }
        });

        // Fechar com ESC
        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape' && _isOpen) {
                _close(false);
            }
        });
    }

    // ─── Fechar modal ───────────────────────────────────────────

    function _close(result) {
        if (!_isOpen) return;
        _isOpen = false;
        _root.classList.remove('confirm-modal-visible');

        setTimeout(function () {
            _root.style.display = 'none';

            if (_resolve) {
                if (_customResult !== null) {
                    // Botões customizados: retorna o action
                    _resolve(_customResult);
                } else if (_hasInput) {
                    // Com input: retorna { confirmed, value }
                    var input = document.getElementById(_inputId);
                    var value = input ? input.value : '';
                    _resolve({ confirmed: !!result, value: value });
                } else {
                    // Padrão: retorna boolean
                    _resolve(result);
                }
                _resolve = null;
            }

            _hasInput = false;
            _customResult = null;
        }, 200);
    }

    // ─── Mapear tipo para ícone FA ──────────────────────────────

    function _typeIcon(type, icon) {
        if (icon) return icon;

        switch (type) {
            case 'danger':  return '<i class="fas fa-exclamation-triangle"></i>';
            case 'warning': return '<i class="fas fa-exclamation-circle"></i>';
            case 'info':    return '<i class="fas fa-info-circle"></i>';
            case 'primary': return '<i class="fas fa-check-circle"></i>';
            default:        return '<i class="fas fa-question-circle"></i>';
        }
    }

    // ─── Abrir modal ────────────────────────────────────────────

    function _show(options) {
        _buildDOM();

        // Fechar modal anterior se aberto
        if (_isOpen) {
            _root.style.display = 'none';
            _root.classList.remove('confirm-modal-visible');
        }

        var opts = options || {};
        var title    = opts.title    || 'Confirmação';
        var message  = opts.message  || '';
        var type     = opts.type     || 'info';
        var icon     = opts.icon     || null;
        var confirmText  = opts.confirmText  || 'CONFIRMAR';
        var cancelText   = opts.cancelText   || 'CANCELAR';
        var btnType      = opts.btnType      || type;
        var showCancel   = opts.showCancel !== false;
        var inputOpts    = opts.input || null;

        // Ícone
        _iconEl.innerHTML = _typeIcon(type, icon);
        _iconEl.className = 'confirm-modal-icon confirm-modal-icon--' + type;

        // Título
        _headerEl.textContent = title;

        // Variante de borda
        _content.className = 'confirm-modal-content confirm-modal-content--' + type;

        // Body: mensagem + opcionalmente input + keyboard
        _bodyEl.innerHTML = '';
        _hasInput = false;

        if (message) {
            var msgEl = _el('div', { className: 'confirm-modal-message' });
            msgEl.innerHTML = message;
            _bodyEl.appendChild(msgEl);
        }

        if (inputOpts) {
            _hasInput = true;

            if (inputOpts.label) {
                var labelEl = _el('label', {
                    className: 'confirm-modal-input-label',
                    textContent: inputOpts.label
                });
                labelEl.setAttribute('for', _inputId);
                _bodyEl.appendChild(labelEl);
            }

            var inputEl = _el('input', {
                className: 'confirm-modal-input',
                id: _inputId,
                type: 'text'
            });
            if (inputOpts.maxLength) inputEl.setAttribute('maxlength', inputOpts.maxLength);
            if (inputOpts.placeholder) inputEl.setAttribute('placeholder', inputOpts.placeholder);
            if (inputOpts.defaultValue) inputEl.value = inputOpts.defaultValue;
            _bodyEl.appendChild(inputEl);

            // Virtual Keyboard
            if (typeof VirtualKeyboard !== 'undefined') {
                var keyboard = VirtualKeyboard.create(_inputId);
                _bodyEl.appendChild(keyboard);
            }

            // Focar no input após render
            requestAnimationFrame(function () {
                inputEl.focus();
                inputEl.select();
            });
        }

        // Botões
        _footerEl.innerHTML = '';
        _customResult = null;

        var customButtons = opts.buttons || null;

        if (customButtons && customButtons.length > 0) {
            // Botões customizados: cada um tem { label, type, action }
            _footerEl.style.flexDirection = 'column';
            customButtons.forEach(function (btnDef) {
                var btn = _el('button', {
                    className: 'confirm-modal-btn confirm-modal-btn--' + (btnDef.type || 'info'),
                    textContent: btnDef.label || 'OK'
                });
                btn.style.flex = 'none';
                btn.addEventListener('click', function () {
                    _customResult = btnDef.action || btnDef.label || 'ok';
                    _close(true);
                });
                _footerEl.appendChild(btn);
            });
        } else {
            // Padrão: confirm + cancel
            _footerEl.style.flexDirection = '';

            var confirmBtn = _el('button', {
                className: 'confirm-modal-btn confirm-modal-btn--' + btnType,
                textContent: confirmText
            });
            confirmBtn.addEventListener('click', function () {
                _close(true);
            });
            _footerEl.appendChild(confirmBtn);

            if (showCancel) {
                var cancelBtn = _el('button', {
                    className: 'confirm-modal-btn confirm-modal-btn--secondary',
                    textContent: cancelText
                });
                cancelBtn.addEventListener('click', function () {
                    _close(false);
                });
                _footerEl.appendChild(cancelBtn);
            }
        }

        // Mostrar
        _root.style.display = 'flex';
        _isOpen = true;
        requestAnimationFrame(function () {
            _root.classList.add('confirm-modal-visible');
        });

        return new Promise(function (resolve) {
            _resolve = resolve;
        });
    }

    // ─── Carregar tema YAML ─────────────────────────────────────

    function _loadTheme(yamlContent) {
        if (typeof jsyaml === 'undefined') {
            console.warn('[ConfirmModal] js-yaml não carregado. Tema não aplicado.');
            return;
        }

        var theme = jsyaml.load(yamlContent);
        if (!theme) return;

        var root = document.documentElement;
        var g = theme.global || {};
        var cm = theme.confirm_modal || {};

        // Overlay
        if (g.bg_overlay)      root.style.setProperty('--confirm-modal-bg-overlay', g.bg_overlay);

        // Card
        if (cm.bg_content)     root.style.setProperty('--confirm-modal-bg-content', cm.bg_content);
        if (cm.border_color)   root.style.setProperty('--confirm-modal-border-color', cm.border_color);
        if (cm.border_radius)  root.style.setProperty('--confirm-modal-border-radius', cm.border_radius);
        if (cm.padding)        root.style.setProperty('--confirm-modal-padding', cm.padding);
        if (cm.max_width)      root.style.setProperty('--confirm-modal-max-width', cm.max_width);

        // Tipografia
        if (cm.text_primary)   root.style.setProperty('--confirm-modal-text-primary', cm.text_primary);
        if (cm.text_secondary) root.style.setProperty('--confirm-modal-text-secondary', cm.text_secondary);
        if (cm.text_muted)     root.style.setProperty('--confirm-modal-text-muted', cm.text_muted);

        // Botões - Cores
        if (cm.btn_primary)    root.style.setProperty('--confirm-modal-btn-primary', cm.btn_primary);
        if (cm.btn_danger)     root.style.setProperty('--confirm-modal-btn-danger', cm.btn_danger);
        if (cm.btn_warning)    root.style.setProperty('--confirm-modal-btn-warning', cm.btn_warning);
        if (cm.btn_info)       root.style.setProperty('--confirm-modal-btn-info', cm.btn_info);
        if (cm.btn_secondary)  root.style.setProperty('--confirm-modal-btn-secondary', cm.btn_secondary);

        // Botões - Dimensões
        if (cm.btn_height)         root.style.setProperty('--confirm-modal-btn-height', cm.btn_height);
        if (cm.btn_radius)         root.style.setProperty('--confirm-modal-btn-radius', cm.btn_radius);
        if (cm.btn_gap)            root.style.setProperty('--confirm-modal-btn-gap', cm.btn_gap);
        if (cm.btn_font_weight)    root.style.setProperty('--confirm-modal-btn-font-weight', cm.btn_font_weight);
        if (cm.btn_letter_spacing) root.style.setProperty('--confirm-modal-btn-letter-spacing', cm.btn_letter_spacing);

        // Ícones
        if (cm.icon_danger_color)  root.style.setProperty('--confirm-modal-icon-danger-color', cm.icon_danger_color);
        if (cm.icon_warning_color) root.style.setProperty('--confirm-modal-icon-warning-color', cm.icon_warning_color);
        if (cm.icon_info_color)    root.style.setProperty('--confirm-modal-icon-info-color', cm.icon_info_color);
        if (cm.icon_success_color) root.style.setProperty('--confirm-modal-icon-success-color', cm.icon_success_color);
        if (cm.icon_size)          root.style.setProperty('--confirm-modal-icon-size', cm.icon_size);

        // Z-index
        if (cm.z_index) root.style.setProperty('--confirm-modal-z-index', cm.z_index);

        // Virtual Keyboard
        var vk = theme.virtual_keyboard || {};
        if (vk.key_bg)              root.style.setProperty('--virtual-keyboard-key-bg', vk.key_bg);
        if (vk.key_border)          root.style.setProperty('--virtual-keyboard-key-border', vk.key_border);
        if (vk.key_color)           root.style.setProperty('--virtual-keyboard-key-color', vk.key_color);
        if (vk.key_height)          root.style.setProperty('--virtual-keyboard-key-height', vk.key_height);
        if (vk.key_radius)          root.style.setProperty('--virtual-keyboard-key-radius', vk.key_radius);
        if (vk.key_font_size)       root.style.setProperty('--virtual-keyboard-key-font-size', vk.key_font_size);
        if (vk.key_font_weight)     root.style.setProperty('--virtual-keyboard-key-font-weight', vk.key_font_weight);
        if (vk.backspace_bg)        root.style.setProperty('--virtual-keyboard-backspace-bg', vk.backspace_bg);
        if (vk.backspace_border)    root.style.setProperty('--virtual-keyboard-backspace-border', vk.backspace_border);
        if (vk.space_font_size)     root.style.setProperty('--virtual-keyboard-space-font-size', vk.space_font_size);
        if (vk.row_gap)             root.style.setProperty('--virtual-keyboard-row-gap', vk.row_gap);
        if (vk.keyboard_gap)        root.style.setProperty('--virtual-keyboard-gap', vk.keyboard_gap);

        // Bubble Modal
        var bm = theme.bubble_modal || {};
        if (bm.bg_color)               root.style.setProperty('--bm-bg', bm.bg_color);
        if (bm.border_color)           root.style.setProperty('--bm-border', bm.border_color);
        if (bm.border_radius)          root.style.setProperty('--bm-radius', bm.border_radius);
        if (bm.text_color)             root.style.setProperty('--bm-text', bm.text_color);
        if (bm.font_size)              root.style.setProperty('--bm-font-size', bm.font_size);
        if (bm.padding)                root.style.setProperty('--bm-padding', bm.padding);
        if (bm.shadow)                 root.style.setProperty('--bm-shadow', bm.shadow);
        if (bm.z_index)                root.style.setProperty('--bm-z-index', bm.z_index);
        if (bm.arrow_color)            root.style.setProperty('--bm-arrow-color', bm.arrow_color);
        if (bm.duration !== undefined) root.style.setProperty('--bm-duration', bm.duration);
        if (bm.delay !== undefined)    root.style.setProperty('--bm-delay', bm.delay);

        // Channel Lock Configuration
        var cl = theme.channel_lock || {};
        window.themeChannelLockConfig = {
            hold_duration_ms: cl.hold_duration_ms !== undefined ? parseInt(cl.hold_duration_ms, 10) : 1500,
            icon_class: cl.icon_class || 'fas fa-lock',
            z_index: cl.z_index !== undefined ? cl.z_index : 100
        };
        if (cl.z_index !== undefined) root.style.setProperty('--channel-lock-z-index', cl.z_index);
        if (cl.overlay_bg) root.style.setProperty('--channel-lock-overlay-bg', cl.overlay_bg);
        if (cl.overlay_backdrop_filter) root.style.setProperty('--channel-lock-overlay-backdrop-filter', cl.overlay_backdrop_filter);
        if (cl.icon_color) root.style.setProperty('--channel-lock-icon-color', cl.icon_color);
        if (cl.icon_size) root.style.setProperty('--channel-lock-icon-size', cl.icon_size);
        if (cl.border_locked) root.style.setProperty('--channel-lock-border-locked', cl.border_locked);
        if (cl.border_color) root.style.setProperty('--channel-lock-border-color', cl.border_color);
        if (cl.badge_bg) root.style.setProperty('--channel-lock-badge-bg', cl.badge_bg);
        if (cl.badge_text_color) root.style.setProperty('--channel-lock-badge-text-color', cl.badge_text_color);

        // Channel Strip & Faders (Injeção de Variáveis CSS)
        var cs = theme.channel_strip || {};
        if (cs.card_bg)             root.style.setProperty('--strip-card-bg', cs.card_bg);
        if (cs.card_border)         root.style.setProperty('--strip-card-border', cs.card_border);
        if (cs.card_radius)         root.style.setProperty('--strip-card-radius', cs.card_radius);
        if (cs.card_on_bg)          root.style.setProperty('--strip-card-on-bg', cs.card_on_bg);
        if (cs.group_1_color)       root.style.setProperty('--strip-group-1-color', cs.group_1_color);
        if (cs.group_2_color)       root.style.setProperty('--strip-group-2-color', cs.group_2_color);
        if (cs.group_st_color)      root.style.setProperty('--strip-group-st-color', cs.group_st_color);
        if (cs.group_mix_color)     root.style.setProperty('--strip-group-mix-color', cs.group_mix_color);
        if (cs.group_bus_color)     root.style.setProperty('--strip-group-bus-color', cs.group_bus_color);
        if (cs.master_color)        root.style.setProperty('--strip-master-color', cs.master_color);
        if (cs.btn_on_bg)           root.style.setProperty('--strip-btn-on-bg', cs.btn_on_bg);
        if (cs.btn_on_text)         root.style.setProperty('--strip-btn-on-text', cs.btn_on_text);
        if (cs.btn_on_active_bg)    root.style.setProperty('--strip-btn-on-active-bg', cs.btn_on_active_bg);
        if (cs.btn_on_active_text)  root.style.setProperty('--strip-btn-on-active-text', cs.btn_on_active_text);
        if (cs.btn_on_active_glow)  root.style.setProperty('--strip-btn-on-active-glow', cs.btn_on_active_glow);
        if (cs.btn_on_radius)       root.style.setProperty('--strip-btn-on-radius', cs.btn_on_radius);
        if (cs.btn_solo_bg)         root.style.setProperty('--strip-btn-solo-bg', cs.btn_solo_bg);
        if (cs.btn_solo_text)       root.style.setProperty('--strip-btn-solo-text', cs.btn_solo_text);
        if (cs.btn_solo_active_bg)  root.style.setProperty('--strip-btn-solo-active-bg', cs.btn_solo_active_bg);
        if (cs.btn_solo_active_text) root.style.setProperty('--strip-btn-solo-active-text', cs.btn_solo_active_text);
        if (cs.btn_solo_radius)     root.style.setProperty('--strip-btn-solo-radius', cs.btn_solo_radius);
        if (cs.btn_nudge_bg)        root.style.setProperty('--strip-btn-nudge-bg', cs.btn_nudge_bg);
        if (cs.btn_nudge_text)      root.style.setProperty('--strip-btn-nudge-text', cs.btn_nudge_text);
        if (cs.btn_nudge_radius)    root.style.setProperty('--strip-btn-nudge-radius', cs.btn_nudge_radius);
        if (cs.name_display_bg)     root.style.setProperty('--strip-name-display-bg', cs.name_display_bg);
        if (cs.name_display_color)  root.style.setProperty('--strip-name-display-color', cs.name_display_color);
        if (cs.name_display_radius) root.style.setProperty('--strip-name-display-radius', cs.name_display_radius);
        if (cs.db_val_color)        root.style.setProperty('--strip-db-val-color', cs.db_val_color);
        if (cs.fader_track_color)   root.style.setProperty('--strip-fader-track-color', cs.fader_track_color);
        if (cs.scale_text_color)    root.style.setProperty('--strip-scale-text-color', cs.scale_text_color);
        if (cs.pan_track_bg)        root.style.setProperty('--strip-pan-track-bg', cs.pan_track_bg);
        if (cs.pan_thumb_color)     root.style.setProperty('--strip-pan-thumb-color', cs.pan_thumb_color);
        if (cs.pan_center_color)    root.style.setProperty('--strip-pan-center-color', cs.pan_center_color);
        if (cs.peak_led_color)      root.style.setProperty('--strip-peak-led-color', cs.peak_led_color);
        if (cs.peak_led_glow)       root.style.setProperty('--strip-peak-led-glow', cs.peak_led_glow);
    }

    function _alert(message, title, type) {
        return _show({
            title: title || 'AVISO',
            message: message || '',
            type: type || 'info',
            confirmText: 'OK',
            showCancel: false
        });
    }

    // ─── API pública ────────────────────────────────────────────

    return {
        show: _show,
        alert: _alert,
        loadTheme: _loadTheme
    };
})();

// Auto-carregar tema ativo no boot
document.addEventListener('DOMContentLoaded', function () {
    fetch('/api/themes/active')
        .then(function (r) {
            if (!r.ok) throw new Error('Erro ao buscar tema ativo');
            return r.json();
        })
        .then(function (data) {
            if (data && data.content && typeof ConfirmModal !== 'undefined' && ConfirmModal.loadTheme) {
                ConfirmModal.loadTheme(data.content);
            } else {
                throw new Error('Conteúdo do tema ativo vazio');
            }
        })
        .catch(function (e) {
            console.warn('[ConfirmModal] Fallback para default.yaml:', e);
            fetch('themes/default.yaml')
                .then(function (r) { return r.text(); })
                .then(function (yaml) { ConfirmModal.loadTheme(yaml); });
        });
});
