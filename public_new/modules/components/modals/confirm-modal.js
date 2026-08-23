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

        // Channel Strip & Faders (Injeção de Variáveis CSS com suporte a global, desktop e mobile)
        var cs = theme.channel_strip || {};
        var csG = cs.global || {};
        var csD = cs.desktop || {};
        var csM = cs.mobile || {};

        function getVal(section, key, fallbackKey) {
            if (section && section[key] !== undefined) return section[key];
            if (fallbackKey && section && section[fallbackKey] !== undefined) return section[fallbackKey];
            if (csG && csG[key] !== undefined) return csG[key];
            if (fallbackKey && csG && csG[fallbackKey] !== undefined) return csG[fallbackKey];
            if (cs && cs[key] !== undefined) return cs[key];
            if (fallbackKey && cs && cs[fallbackKey] !== undefined) return cs[fallbackKey];
            return undefined;
        }

        // Global Properties
        var g1 = getVal(csG, 'group_1_color'); if (g1) root.style.setProperty('--strip-group-1-color', g1);
        var g2 = getVal(csG, 'group_2_color'); if (g2) root.style.setProperty('--strip-group-2-color', g2);
        var gst = getVal(csG, 'group_st_color'); if (gst) root.style.setProperty('--strip-group-st-color', gst);
        var gmix = getVal(csG, 'group_mix_color'); if (gmix) root.style.setProperty('--strip-group-mix-color', gmix);
        var gbus = getVal(csG, 'group_bus_color'); if (gbus) root.style.setProperty('--strip-group-bus-color', gbus);
        var gaux = getVal(csG, 'group_aux_color'); if (gaux) root.style.setProperty('--strip-group-aux-color', gaux);
        var gmst = getVal(csG, 'master_color'); if (gmst) root.style.setProperty('--strip-master-color', gmst);

        var btnOnBg = getVal(csG, 'btn_on_bg'); if (btnOnBg) root.style.setProperty('--strip-btn-on-bg', btnOnBg);
        var btnOnText = getVal(csG, 'btn_on_text'); if (btnOnText) root.style.setProperty('--strip-btn-on-text', btnOnText);
        var btnOnActBg = getVal(csG, 'btn_on_active_bg'); if (btnOnActBg) root.style.setProperty('--strip-btn-on-active-bg', btnOnActBg);
        var btnOnActText = getVal(csG, 'btn_on_active_text'); if (btnOnActText) root.style.setProperty('--strip-btn-on-active-text', btnOnActText);
        var btnOnActGlow = getVal(csG, 'btn_on_active_glow'); if (btnOnActGlow) root.style.setProperty('--strip-btn-on-active-glow', btnOnActGlow);

        var btnSoloBg = getVal(csG, 'btn_solo_bg'); if (btnSoloBg) root.style.setProperty('--strip-btn-solo-bg', btnSoloBg);
        var btnSoloText = getVal(csG, 'btn_solo_text'); if (btnSoloText) root.style.setProperty('--strip-btn-solo-text', btnSoloText);
        var btnSoloActBg = getVal(csG, 'btn_solo_active_bg'); if (btnSoloActBg) root.style.setProperty('--strip-btn-solo-active-bg', btnSoloActBg);
        var btnSoloActText = getVal(csG, 'btn_solo_active_text'); if (btnSoloActText) root.style.setProperty('--strip-btn-solo-active-text', btnSoloActText);
        var btnSoloActGlow = getVal(csG, 'btn_solo_active_glow'); if (btnSoloActGlow) root.style.setProperty('--strip-btn-solo-active-glow', btnSoloActGlow);

        var btnPreBg = getVal(csG, 'btn_pre_bg'); if (btnPreBg) root.style.setProperty('--strip-btn-pre-bg', btnPreBg);
        var btnPreText = getVal(csG, 'btn_pre_text'); if (btnPreText) root.style.setProperty('--strip-btn-pre-text', btnPreText);
        var btnPreBorder = getVal(csG, 'btn_pre_border'); if (btnPreBorder) root.style.setProperty('--strip-btn-pre-border', btnPreBorder);

        var btnNudgeBg = getVal(csG, 'btn_nudge_bg'); if (btnNudgeBg) root.style.setProperty('--strip-btn-nudge-bg', btnNudgeBg);
        var btnNudgeText = getVal(csG, 'btn_nudge_text'); if (btnNudgeText) root.style.setProperty('--strip-btn-nudge-text', btnNudgeText);

        var hdrFont = getVal(csG, 'header_font_family'); if (hdrFont) root.style.setProperty('--strip-header-font-family', hdrFont);
        var patchFont = getVal(csG, 'patch_font_family'); if (patchFont) root.style.setProperty('--strip-patch-font-family', patchFont);
        var nameBg = getVal(csG, 'name_display_bg'); if (nameBg) root.style.setProperty('--strip-name-display-bg', nameBg);
        var nameColor = getVal(csG, 'name_display_color'); if (nameColor) root.style.setProperty('--strip-name-display-color', nameColor);
        var dbColor = getVal(csG, 'db_val_color'); if (dbColor) root.style.setProperty('--strip-db-val-color', dbColor);

        var faderTrack = getVal(csG, 'fader_track_color'); if (faderTrack) root.style.setProperty('--strip-fader-track-color', faderTrack);
        var scaleColor = getVal(csG, 'scale_text_color'); if (scaleColor) root.style.setProperty('--strip-scale-text-color', scaleColor);

        var panBg = getVal(csG, 'pan_track_bg'); if (panBg) root.style.setProperty('--strip-pan-track-bg', panBg);
        var panThumb = getVal(csG, 'pan_thumb_color'); if (panThumb) root.style.setProperty('--strip-pan-thumb-color', panThumb);
        var panCenter = getVal(csG, 'pan_center_color'); if (panCenter) root.style.setProperty('--strip-pan-center-color', panCenter);

        var peakColor = getVal(csG, 'peak_led_color'); if (peakColor) root.style.setProperty('--strip-peak-led-color', peakColor);
        var peakGlow = getVal(csG, 'peak_led_glow'); if (peakGlow) root.style.setProperty('--strip-peak-led-glow', peakGlow);

        var mBoxBg = getVal(csG, 'meters_box_bg'); if (mBoxBg) root.style.setProperty('--strip-meters-box-bg', mBoxBg);
        var mBoxBorder = getVal(csG, 'meters_box_border'); if (mBoxBorder) root.style.setProperty('--strip-meters-box-border', mBoxBorder);
        var mBoxRadius = getVal(csG, 'meters_box_radius'); if (mBoxRadius) root.style.setProperty('--strip-meters-box-radius', mBoxRadius);
        var mBadgeBg = getVal(csG, 'meters_badge_bg'); if (mBadgeBg) root.style.setProperty('--strip-meters-badge-bg', mBadgeBg);
        var mBadgeText = getVal(csG, 'meters_badge_text'); if (mBadgeText) root.style.setProperty('--strip-meters-badge-text', mBadgeText);
        var mBadgeBorder = getVal(csG, 'meters_badge_border'); if (mBadgeBorder) root.style.setProperty('--strip-meters-badge-border', mBadgeBorder);
        var posBorder = getVal(csG, 'position_box_border'); if (posBorder) root.style.setProperty('--strip-position-box-border', posBorder);
        var posColor = getVal(csG, 'position_title_color'); if (posColor) root.style.setProperty('--strip-position-title-color', posColor);

        var macBg = getVal(csG, 'macro_bg'); if (macBg) root.style.setProperty('--strip-macro-bg', macBg);
        var macBorder = getVal(csG, 'macro_border'); if (macBorder) root.style.setProperty('--strip-macro-border', macBorder);
        var macHdrBg = getVal(csG, 'macro_header_bg'); if (macHdrBg) root.style.setProperty('--strip-macro-header-bg', macHdrBg);
        var macHdrText = getVal(csG, 'macro_header_text'); if (macHdrText) root.style.setProperty('--strip-macro-header-text', macHdrText);
        var macCfgBg = getVal(csG, 'macro_config_bg'); if (macCfgBg) root.style.setProperty('--strip-macro-config-bg', macCfgBg);
        var macCfgHov = getVal(csG, 'macro_config_hover_bg'); if (macCfgHov) root.style.setProperty('--strip-macro-config-hover-bg', macCfgHov);
        var macCfgText = getVal(csG, 'macro_config_text'); if (macCfgText) root.style.setProperty('--strip-macro-config-text', macCfgText);
        var macCfgRad = getVal(csG, 'macro_config_radius'); if (macCfgRad) root.style.setProperty('--strip-macro-config-radius', macCfgRad);
        var macDeltaBg = getVal(csG, 'macro_delta_bg'); if (macDeltaBg) root.style.setProperty('--strip-macro-delta-bg', macDeltaBg);
        var macDeltaText = getVal(csG, 'macro_delta_text'); if (macDeltaText) root.style.setProperty('--strip-macro-delta-text', macDeltaText);
        var macDeltaAct = getVal(csG, 'macro_delta_active_text'); if (macDeltaAct) root.style.setProperty('--strip-macro-delta-active-text', macDeltaAct);
        var macBigBg = getVal(csG, 'macro_big_nudge_bg'); if (macBigBg) root.style.setProperty('--strip-macro-big-nudge-bg', macBigBg);
        var macBigText = getVal(csG, 'macro_big_nudge_text'); if (macBigText) root.style.setProperty('--strip-macro-big-nudge-text', macBigText);
        var macBigBrd = getVal(csG, 'macro_big_nudge_border'); if (macBigBrd) root.style.setProperty('--strip-macro-big-nudge-border', macBigBrd);
        var macBigRad = getVal(csG, 'macro_big_nudge_radius'); if (macBigRad) root.style.setProperty('--strip-macro-big-nudge-radius', macBigRad);
        var macBigShd = getVal(csG, 'macro_big_nudge_shadow'); if (macBigShd) root.style.setProperty('--strip-macro-big-nudge-shadow', macBigShd);
        var macRstBg = getVal(csG, 'macro_reset_bg'); if (macRstBg) root.style.setProperty('--strip-macro-reset-bg', macRstBg);
        var macRstHov = getVal(csG, 'macro_reset_hover_bg'); if (macRstHov) root.style.setProperty('--strip-macro-reset-hover-bg', macRstHov);
        var macRstText = getVal(csG, 'macro_reset_text'); if (macRstText) root.style.setProperty('--strip-macro-reset-text', macRstText);
        var macRstRad = getVal(csG, 'macro_reset_radius'); if (macRstRad) root.style.setProperty('--strip-macro-reset-radius', macRstRad);

        var lockBrd = getVal(csG, 'lock_border_color'); if (lockBrd) root.style.setProperty('--strip-lock-border-color', lockBrd);
        var lockBdg = getVal(csG, 'lock_badge_bg'); if (lockBdg) root.style.setProperty('--strip-lock-badge-bg', lockBdg);
        var lockTxt = getVal(csG, 'lock_badge_text'); if (lockTxt) root.style.setProperty('--strip-lock-badge-text', lockTxt);
        var lockOvl = getVal(csG, 'lock_overlay_bg'); if (lockOvl) root.style.setProperty('--strip-lock-overlay-bg', lockOvl);
        var disOp = getVal(csG, 'disabled_opacity'); if (disOp) root.style.setProperty('--strip-disabled-opacity', disOp);
        var disFl = getVal(csG, 'disabled_filter'); if (disFl) root.style.setProperty('--strip-disabled-filter', disFl);

        // Desktop Properties
        var dCardBg = getVal(csD, 'card_bg'); if (dCardBg) root.style.setProperty('--strip-card-bg', dCardBg);
        var dCardBrd = getVal(csD, 'card_border'); if (dCardBrd) root.style.setProperty('--strip-card-border', dCardBrd);
        var dCardBrdW = getVal(csD, 'card_border_width'); if (dCardBrdW) root.style.setProperty('--strip-card-border-width', dCardBrdW);
        var dDeskBrd = getVal(csD, 'desk_card_border'); if (dDeskBrd) root.style.setProperty('--strip-desk-card-border', dDeskBrd);
        var dDeskBrdW = getVal(csD, 'desk_card_border_width'); if (dDeskBrdW !== undefined) root.style.setProperty('--strip-desk-card-border-width', dDeskBrdW);
        var dDeskDiv = getVal(csD, 'desk_card_divider'); if (dDeskDiv !== undefined) root.style.setProperty('--strip-desk-card-divider', dDeskDiv);
        var dCardRad = getVal(csD, 'card_radius'); if (dCardRad) root.style.setProperty('--strip-card-radius', dCardRad);
        var dCardOnBg = getVal(csD, 'card_on_bg'); if (dCardOnBg) root.style.setProperty('--strip-card-on-bg', dCardOnBg);
        var dBtnOnH = getVal(csD, 'btn_on_height'); if (dBtnOnH) root.style.setProperty('--strip-btn-on-height', dBtnOnH);
        var dBtnOnRad = getVal(csD, 'btn_on_radius'); if (dBtnOnRad) root.style.setProperty('--strip-btn-on-radius', dBtnOnRad);
        var dBtnSoloH = getVal(csD, 'btn_solo_height'); if (dBtnSoloH) root.style.setProperty('--strip-btn-solo-height', dBtnSoloH);
        var dBtnSoloRad = getVal(csD, 'btn_solo_radius'); if (dBtnSoloRad) root.style.setProperty('--strip-btn-solo-radius', dBtnSoloRad);
        var dBtnPreH = getVal(csD, 'btn_pre_height'); if (dBtnPreH) root.style.setProperty('--strip-btn-pre-height', dBtnPreH);
        var dBtnPreRad = getVal(csD, 'btn_pre_radius'); if (dBtnPreRad) root.style.setProperty('--strip-btn-pre-radius', dBtnPreRad);
        var dBtnNudgeSize = getVal(csD, 'btn_nudge_size'); if (dBtnNudgeSize) root.style.setProperty('--strip-desk-nudge-size', dBtnNudgeSize);
        var dBtnNudgeRad = getVal(csD, 'btn_nudge_radius'); if (dBtnNudgeRad) root.style.setProperty('--strip-btn-nudge-radius', dBtnNudgeRad);
        var dMacroCfgH = getVal(csD, 'macro_config_btn_height'); if (dMacroCfgH) root.style.setProperty('--strip-macro-config-btn-height', dMacroCfgH);
        var dMacroRstH = getVal(csD, 'macro_reset_btn_height'); if (dMacroRstH) root.style.setProperty('--strip-macro-reset-btn-height', dMacroRstH);
        var dNameRad = getVal(csD, 'name_display_radius'); if (dNameRad) root.style.setProperty('--strip-name-display-radius', dNameRad);
        var dNameSize = getVal(csD, 'name_display_font_size'); if (dNameSize) root.style.setProperty('--strip-name-display-font-size', dNameSize);
        var dNameFont = getVal(csD, 'name_display_font_family'); if (dNameFont) root.style.setProperty('--strip-name-display-font-family', dNameFont);
        var dVolWidth = getVal(csD, 'volume_geral_width'); if (dVolWidth) root.style.setProperty('--strip-volume-geral-width', dVolWidth);

        // Mobile Properties
        var mCardW = getVal(csM, 'card_width', 'mob_card_width'); if (mCardW) root.style.setProperty('--strip-mob-card-width', mCardW);
        var mCardPW = getVal(csM, 'card_paired_width', 'mob_card_paired_width'); if (mCardPW) root.style.setProperty('--strip-mob-card-paired-width', mCardPW);
        var mCardRad = getVal(csM, 'card_radius', 'mob_card_radius'); if (mCardRad) root.style.setProperty('--strip-mob-card-radius', mCardRad);
        var mCardBrd = getVal(csM, 'card_border', 'mob_card_border'); if (mCardBrd) root.style.setProperty('--strip-mob-card-border', mCardBrd);
        var mCardBrdW = getVal(csM, 'card_border_width', 'mob_card_border_width'); if (mCardBrdW !== undefined) root.style.setProperty('--strip-mob-card-border-width', mCardBrdW);
        var mCardTopW = getVal(csM, 'card_border_top_width', 'mob_card_border_top_width'); if (mCardTopW !== undefined) root.style.setProperty('--strip-mob-card-border-top-width', mCardTopW);
        var mBtnH = getVal(csM, 'btn_height', 'mob_btn_height'); if (mBtnH) root.style.setProperty('--strip-mob-btn-height', mBtnH);
        var mBtnOnH = getVal(csM, 'btn_on_height'); if (mBtnOnH) root.style.setProperty('--strip-mob-btn-on-height', mBtnOnH);
        var mBtnSoloH = getVal(csM, 'btn_solo_height'); if (mBtnSoloH) root.style.setProperty('--strip-mob-btn-solo-height', mBtnSoloH);
        var mBtnPreH = getVal(csM, 'btn_pre_height'); if (mBtnPreH) root.style.setProperty('--strip-mob-btn-pre-height', mBtnPreH);
        var mBtnMedH = getVal(csM, 'btn_medidores_height'); if (mBtnMedH) root.style.setProperty('--strip-mob-btn-medidores-height', mBtnMedH);
        var mBtnRad = getVal(csM, 'btn_radius', 'mob_btn_radius'); if (mBtnRad) root.style.setProperty('--strip-mob-btn-radius', mBtnRad);
        var mNudgeSize = getVal(csM, 'nudge_btn_size', 'mob_nudge_btn_size'); if (mNudgeSize) root.style.setProperty('--strip-mob-nudge-size', mNudgeSize);
        var mMacroCfgH = getVal(csM, 'macro_config_btn_height'); if (mMacroCfgH) root.style.setProperty('--strip-mob-macro-config-btn-height', mMacroCfgH);
        var mMacroRstH = getVal(csM, 'macro_reset_btn_height'); if (mMacroRstH) root.style.setProperty('--strip-mob-macro-reset-btn-height', mMacroRstH);
        var mDbSize = getVal(csM, 'db_font_size', 'mob_db_font_size'); if (mDbSize) root.style.setProperty('--strip-mob-db-font-size', mDbSize);
        var mNameSize = getVal(csM, 'name_display_font_size', 'mob_name_display_font_size'); if (mNameSize) root.style.setProperty('--strip-mob-name-display-font-size', mNameSize);
        var mNameFont = getVal(csM, 'name_display_font_family', 'mob_name_display_font_family'); if (mNameFont) root.style.setProperty('--strip-mob-name-display-font-family', mNameFont);
        var mThumbW = getVal(csM, 'fader_thumb_width', 'mob_fader_thumb_width'); if (mThumbW) root.style.setProperty('--strip-mob-thumb-width', mThumbW);
        var mThumbH = getVal(csM, 'fader_thumb_height', 'mob_fader_thumb_height'); if (mThumbH) root.style.setProperty('--strip-mob-thumb-height', mThumbH);
        var mThumbRad = getVal(csM, 'fader_thumb_radius', 'mob_fader_thumb_radius'); if (mThumbRad) root.style.setProperty('--strip-mob-thumb-radius', mThumbRad);

        // Main View (Layout da Tela Principal)
        var mv = theme.main_view || {};
        if (mv.faders_gap !== undefined)              root.style.setProperty('--main-faders-gap', mv.faders_gap);
        if (mv.faders_padding !== undefined)          root.style.setProperty('--main-faders-padding', mv.faders_padding);
        if (mv.group_separator_width !== undefined)   root.style.setProperty('--main-group-separator-width', mv.group_separator_width);
        if (mv.group_separator_bg !== undefined)      root.style.setProperty('--main-group-separator-bg', mv.group_separator_bg);
        if (mv.macro_spacer_width !== undefined)      root.style.setProperty('--main-macro-spacer-width', mv.macro_spacer_width);
        if (mv.macro_spacer_bg !== undefined)         root.style.setProperty('--main-macro-spacer-bg', mv.macro_spacer_bg);
        if (mv.mobile_faders_gap !== undefined)       root.style.setProperty('--main-mob-faders-gap', mv.mobile_faders_gap);
        if (mv.mobile_group_gap !== undefined)        root.style.setProperty('--main-mob-group-gap', mv.mobile_group_gap);
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

// Auto-carregar tema no boot relativo ao escopo da aplicação
document.addEventListener('DOMContentLoaded', function () {
    var basePath = window.location.pathname.includes('/new') ? '/new/themes/' : 'themes/';
    fetch(basePath + 'default.yaml?t=' + Date.now())
        .then(function (r) {
            if (!r.ok) throw new Error('Falha ao carregar tema local (' + r.status + ')');
            return r.text();
        })
        .then(function (yaml) {
            if (typeof ConfirmModal !== 'undefined' && ConfirmModal.loadTheme) {
                ConfirmModal.loadTheme(yaml);
            }
        })
        .catch(function (e) {
            console.warn('[ConfirmModal] Fallback de carregamento de tema:', e);
            fetch('/api/themes/active')
                .then(function (r) { return r.json(); })
                .then(function (data) {
                    if (data && data.content && typeof ConfirmModal !== 'undefined' && ConfirmModal.loadTheme) {
                        ConfirmModal.loadTheme(data.content);
                    }
                })
                .catch(function (err) {
                    console.error('[ConfirmModal] Erro final ao carregar tema:', err);
                });
        });
});
