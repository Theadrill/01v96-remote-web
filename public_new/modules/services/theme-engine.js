/**
 * ThemeEngine — Motor de injeção de variáveis CSS a partir de YAML de temas
 * Uso: ThemeEngine.apply(yamlString)
 */
var ThemeEngine = (function () {
    'use strict';

    function _apply(yamlContent) {
        if (typeof jsyaml === 'undefined') {
            console.warn('[ThemeEngine] js-yaml não carregado. Tema não aplicado.');
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

        // Global Properties & Header Colors
        var g1 = getVal(csG, 'group_1_color'); if (g1) root.style.setProperty('--strip-group-1-color', g1);
        var g2 = getVal(csG, 'group_2_color'); if (g2) root.style.setProperty('--strip-group-2-color', g2);
        var gst = getVal(csG, 'group_st_color'); if (gst) root.style.setProperty('--strip-group-st-color', gst);
        var gmix = getVal(csG, 'group_mix_color'); if (gmix) root.style.setProperty('--strip-group-mix-color', gmix);
        var gbus = getVal(csG, 'group_bus_color'); if (gbus) root.style.setProperty('--strip-group-bus-color', gbus);
        var gaux = getVal(csG, 'group_aux_color'); if (gaux) root.style.setProperty('--strip-group-aux-color', gaux);
        var gmst = getVal(csG, 'master_color'); if (gmst) root.style.setProperty('--strip-master-color', gmst);

        // Header Backgrounds (OFF and ON)
        var g1HdrBg = getVal(csG, 'group_1_header_bg'); if (g1HdrBg) root.style.setProperty('--strip-g1-header-bg', g1HdrBg);
        var g1HdrOnBg = getVal(csG, 'group_1_header_on_bg'); if (g1HdrOnBg) root.style.setProperty('--strip-g1-header-on-bg', g1HdrOnBg);
        var g2HdrBg = getVal(csG, 'group_2_header_bg'); if (g2HdrBg) root.style.setProperty('--strip-g2-header-bg', g2HdrBg);
        var g2HdrOnBg = getVal(csG, 'group_2_header_on_bg'); if (g2HdrOnBg) root.style.setProperty('--strip-g2-header-on-bg', g2HdrOnBg);
        var gstHdrBg = getVal(csG, 'group_st_header_bg'); if (gstHdrBg) root.style.setProperty('--strip-gst-header-bg', gstHdrBg);
        var gstHdrOnBg = getVal(csG, 'group_st_header_on_bg'); if (gstHdrOnBg) root.style.setProperty('--strip-gst-header-on-bg', gstHdrOnBg);
        var gmixHdrBg = getVal(csG, 'group_mix_header_bg'); if (gmixHdrBg) root.style.setProperty('--strip-gmix-header-bg', gmixHdrBg);
        var gmixHdrOnBg = getVal(csG, 'group_mix_header_on_bg'); if (gmixHdrOnBg) root.style.setProperty('--strip-gmix-header-on-bg', gmixHdrOnBg);
        var gbusHdrBg = getVal(csG, 'group_bus_header_bg'); if (gbusHdrBg) root.style.setProperty('--strip-gbus-header-bg', gbusHdrBg);
        var gbusHdrOnBg = getVal(csG, 'group_bus_header_on_bg'); if (gbusHdrOnBg) root.style.setProperty('--strip-gbus-header-on-bg', gbusHdrOnBg);
        var mstHdrBg = getVal(csG, 'master_header_bg'); if (mstHdrBg) root.style.setProperty('--strip-master-header-bg', mstHdrBg);
        var mstHdrOnBg = getVal(csG, 'master_header_on_bg'); if (mstHdrOnBg) root.style.setProperty('--strip-master-header-on-bg', mstHdrOnBg);

        // Body Backgrounds (ON)
        var g1BodyOnBg = getVal(csG, 'group_1_body_on_bg'); if (g1BodyOnBg) root.style.setProperty('--strip-g1-body-on-bg', g1BodyOnBg);
        var g2BodyOnBg = getVal(csG, 'group_2_body_on_bg'); if (g2BodyOnBg) root.style.setProperty('--strip-g2-body-on-bg', g2BodyOnBg);
        var gstBodyOnBg = getVal(csG, 'group_st_body_on_bg'); if (gstBodyOnBg) root.style.setProperty('--strip-gst-body-on-bg', gstBodyOnBg);
        var gmixBodyOnBg = getVal(csG, 'group_mix_body_on_bg'); if (gmixBodyOnBg) root.style.setProperty('--strip-gmix-body-on-bg', gmixBodyOnBg);
        var gbusBodyOnBg = getVal(csG, 'group_bus_body_on_bg'); if (gbusBodyOnBg) root.style.setProperty('--strip-gbus-body-on-bg', gbusBodyOnBg);
        var gauxBodyOnBg = getVal(csG, 'group_aux_body_on_bg'); if (gauxBodyOnBg) root.style.setProperty('--strip-gaux-body-on-bg', gauxBodyOnBg);
        var mstBodyOnBg = getVal(csG, 'master_body_on_bg'); if (mstBodyOnBg) root.style.setProperty('--strip-master-body-on-bg', mstBodyOnBg);

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
        var btnSoloAlertBg = getVal(csG, 'btn_solo_alert_bg'); if (btnSoloAlertBg) root.style.setProperty('--strip-btn-solo-alert-bg', btnSoloAlertBg);
        var btnSoloAlertText = getVal(csG, 'btn_solo_alert_text'); if (btnSoloAlertText) root.style.setProperty('--strip-btn-solo-alert-text', btnSoloAlertText);
        var btnSoloAlertBorder = getVal(csG, 'btn_solo_alert_border'); if (btnSoloAlertBorder) root.style.setProperty('--strip-btn-solo-alert-border', btnSoloAlertBorder);
        var btnSoloAlertGlow = getVal(csG, 'btn_solo_alert_glow'); if (btnSoloAlertGlow) root.style.setProperty('--strip-btn-solo-alert-glow', btnSoloAlertGlow);

        var btnPreBg = getVal(csG, 'btn_pre_bg'); if (btnPreBg) root.style.setProperty('--strip-btn-pre-bg', btnPreBg);
        var btnPreText = getVal(csG, 'btn_pre_text'); if (btnPreText) root.style.setProperty('--strip-btn-pre-text', btnPreText);
        var btnPreBorder = getVal(csG, 'btn_pre_border'); if (btnPreBorder) root.style.setProperty('--strip-btn-pre-border', btnPreBorder);

        var btnNudgeBg = getVal(csG, 'btn_nudge_bg'); if (btnNudgeBg) root.style.setProperty('--strip-btn-nudge-bg', btnNudgeBg);
        var btnNudgeText = getVal(csG, 'btn_nudge_text'); if (btnNudgeText) root.style.setProperty('--strip-btn-nudge-text', btnNudgeText);

        // Tipografia / Font Face Global
        var hdrFont = getVal(csG, 'header_font_family'); if (hdrFont) root.style.setProperty('--strip-header-font-family', hdrFont);
        var hdrWeight = getVal(csG, 'header_font_weight'); if (hdrWeight) root.style.setProperty('--strip-header-font-weight', hdrWeight);
        var hdrSize = getVal(csG, 'header_font_size'); if (hdrSize) root.style.setProperty('--strip-header-font-size', hdrSize);

        var nameBg = getVal(csG, 'name_display_bg'); if (nameBg) root.style.setProperty('--strip-name-display-bg', nameBg);
        var nameColor = getVal(csG, 'name_display_color'); if (nameColor) root.style.setProperty('--strip-name-display-color', nameColor);
        var nameFont = getVal(csG, 'name_display_font_family'); if (nameFont) root.style.setProperty('--strip-name-display-font-family', nameFont);
        var nameWeight = getVal(csG, 'name_display_font_weight'); if (nameWeight) root.style.setProperty('--strip-name-display-font-weight', nameWeight);
        var nameSize = getVal(csG, 'name_display_font_size'); if (nameSize) root.style.setProperty('--strip-name-display-font-size', nameSize);
        var namePad = getVal(csG, 'name_display_padding'); if (namePad) root.style.setProperty('--strip-name-display-padding', namePad);
        var nameMarg = getVal(csG, 'name_display_margin'); if (nameMarg) root.style.setProperty('--strip-name-display-margin', nameMarg);
        var nameZonePad = getVal(csG, 'name_display_zone_padding'); if (nameZonePad) root.style.setProperty('--strip-name-display-zone-padding', nameZonePad);
        var nameZoneMarg = getVal(csG, 'name_display_zone_margin'); if (nameZoneMarg) root.style.setProperty('--strip-name-display-zone-margin', nameZoneMarg);
        var nameW = getVal(csG, 'name_display_width'); if (nameW) root.style.setProperty('--strip-name-display-width', nameW);

        var soloFont = getVal(csG, 'btn_solo_font_family'); if (soloFont) root.style.setProperty('--strip-btn-solo-font-family', soloFont);
        var soloWeight = getVal(csG, 'btn_solo_font_weight'); if (soloWeight) root.style.setProperty('--strip-btn-solo-font-weight', soloWeight);
        var soloSize = getVal(csG, 'btn_solo_font_size'); if (soloSize) root.style.setProperty('--strip-btn-solo-font-size', soloSize);

        var preFont = getVal(csG, 'btn_pre_font_family'); if (preFont) root.style.setProperty('--strip-btn-pre-font-family', preFont);
        var preWeight = getVal(csG, 'btn_pre_font_weight'); if (preWeight) root.style.setProperty('--strip-btn-pre-font-weight', preWeight);
        var preSize = getVal(csG, 'btn_pre_font_size'); if (preSize) root.style.setProperty('--strip-btn-pre-font-size', preSize);

        var onFont = getVal(csG, 'btn_on_font_family'); if (onFont) root.style.setProperty('--strip-btn-on-font-family', onFont);
        var onWeight = getVal(csG, 'btn_on_font_weight'); if (onWeight) root.style.setProperty('--strip-btn-on-font-weight', onWeight);
        var onSize = getVal(csG, 'btn_on_font_size'); if (onSize) root.style.setProperty('--strip-btn-on-font-size', onSize);

        var nudgeFont = getVal(csG, 'btn_nudge_font_family'); if (nudgeFont) root.style.setProperty('--strip-btn-nudge-font-family', nudgeFont);
        var nudgeWeight = getVal(csG, 'btn_nudge_font_weight'); if (nudgeWeight) root.style.setProperty('--strip-btn-nudge-font-weight', nudgeWeight);
        var nudgeSize = getVal(csG, 'btn_nudge_font_size'); if (nudgeSize) root.style.setProperty('--strip-btn-nudge-font-size', nudgeSize);

        var dbColor = getVal(csG, 'db_val_color'); if (dbColor) root.style.setProperty('--strip-db-val-color', dbColor);
        var dbFont = getVal(csG, 'db_val_font_family'); if (dbFont) root.style.setProperty('--strip-db-val-font-family', dbFont);
        var dbWeight = getVal(csG, 'db_val_font_weight'); if (dbWeight) root.style.setProperty('--strip-db-val-font-weight', dbWeight);
        var dbSize = getVal(csG, 'db_val_font_size'); if (dbSize) root.style.setProperty('--strip-db-val-font-size', dbSize);

        var faderTrack = getVal(csG, 'fader_track_color'); if (faderTrack) root.style.setProperty('--strip-fader-track-color', faderTrack);
        var scaleColor = getVal(csG, 'scale_text_color'); if (scaleColor) root.style.setProperty('--strip-scale-text-color', scaleColor);
        var scaleFont = getVal(csG, 'scale_font_family'); if (scaleFont) root.style.setProperty('--strip-scale-font-family', scaleFont);
        var scaleWeight = getVal(csG, 'scale_font_weight'); if (scaleWeight) root.style.setProperty('--strip-scale-font-weight', scaleWeight);
        var scaleSize = getVal(csG, 'scale_font_size'); if (scaleSize) root.style.setProperty('--strip-scale-font-size', scaleSize);

        var panBg = getVal(csG, 'pan_track_bg'); if (panBg) root.style.setProperty('--strip-pan-track-bg', panBg);
        var panThumb = getVal(csG, 'pan_thumb_color'); if (panThumb) root.style.setProperty('--strip-pan-thumb-color', panThumb);
        var panCenter = getVal(csG, 'pan_center_color'); if (panCenter) root.style.setProperty('--strip-pan-center-color', panCenter);
        var panFont = getVal(csG, 'pan_font_family'); if (panFont) root.style.setProperty('--strip-pan-font-family', panFont);
        var panWeight = getVal(csG, 'pan_font_weight'); if (panWeight) root.style.setProperty('--strip-pan-font-weight', panWeight);
        var panSize = getVal(csG, 'pan_font_size'); if (panSize) root.style.setProperty('--strip-pan-font-size', panSize);

        var patchFont = getVal(csG, 'patch_font_family'); if (patchFont) root.style.setProperty('--strip-patch-font-family', patchFont);
        var patchWeight = getVal(csG, 'patch_font_weight'); if (patchWeight) root.style.setProperty('--strip-patch-font-weight', patchWeight);
        var patchSize = getVal(csG, 'patch_font_size'); if (patchSize) root.style.setProperty('--strip-patch-font-size', patchSize);
        var patchColor = getVal(csG, 'patch_color'); if (patchColor) root.style.setProperty('--strip-patch-color', patchColor);

        var peakColor = getVal(csG, 'peak_led_color'); if (peakColor) root.style.setProperty('--strip-peak-led-color', peakColor);
        var peakGlow = getVal(csG, 'peak_led_glow'); if (peakGlow) root.style.setProperty('--strip-peak-led-glow', peakGlow);

        var mBoxBg = getVal(csG, 'meters_box_bg'); if (mBoxBg) root.style.setProperty('--strip-meters-box-bg', mBoxBg);
        var mBoxBorder = getVal(csG, 'meters_box_border'); if (mBoxBorder) root.style.setProperty('--strip-meters-box-border', mBoxBorder);
        var mBoxRadius = getVal(csG, 'meters_box_radius'); if (mBoxRadius) root.style.setProperty('--strip-meters-box-radius', mBoxRadius);
        var mBadgeBg = getVal(csG, 'meters_badge_bg'); if (mBadgeBg) root.style.setProperty('--strip-meters-badge-bg', mBadgeBg);
        var mBadgeText = getVal(csG, 'meters_badge_text'); if (mBadgeText) root.style.setProperty('--strip-meters-badge-text', mBadgeText);
        var mBadgeBorder = getVal(csG, 'meters_badge_border'); if (mBadgeBorder) root.style.setProperty('--strip-meters-badge-border', mBadgeBorder);
        var mTitleFont = getVal(csG, 'meters_title_font_family'); if (mTitleFont) root.style.setProperty('--strip-meters-title-font-family', mTitleFont);
        var mTitleWeight = getVal(csG, 'meters_title_font_weight'); if (mTitleWeight) root.style.setProperty('--strip-meters-title-font-weight', mTitleWeight);
        var mTitleSize = getVal(csG, 'meters_title_font_size'); if (mTitleSize) root.style.setProperty('--strip-meters-title-font-size', mTitleSize);
        var mBadgeFont = getVal(csG, 'meters_badge_font_family'); if (mBadgeFont) root.style.setProperty('--strip-meters-badge-font-family', mBadgeFont);
        var mBadgeWeight = getVal(csG, 'meters_badge_font_weight'); if (mBadgeWeight) root.style.setProperty('--strip-meters-badge-font-weight', mBadgeWeight);
        var mBadgeSize = getVal(csG, 'meters_badge_font_size'); if (mBadgeSize) root.style.setProperty('--strip-meters-badge-font-size', mBadgeSize);

        var posBorder = getVal(csG, 'position_box_border'); if (posBorder) root.style.setProperty('--strip-position-box-border', posBorder);
        var posColor = getVal(csG, 'position_title_color'); if (posColor) root.style.setProperty('--strip-position-title-color', posColor);
        var posTitleFont = getVal(csG, 'position_title_font_family'); if (posTitleFont) root.style.setProperty('--strip-position-title-font-family', posTitleFont);
        var posTitleWeight = getVal(csG, 'position_title_font_weight'); if (posTitleWeight) root.style.setProperty('--strip-position-title-font-weight', posTitleWeight);
        var posTitleSize = getVal(csG, 'position_title_font_size'); if (posTitleSize) root.style.setProperty('--strip-position-title-font-size', posTitleSize);
        var posBadgeFont = getVal(csG, 'position_badge_font_family'); if (posBadgeFont) root.style.setProperty('--strip-position-badge-font-family', posBadgeFont);
        var posBadgeWeight = getVal(csG, 'position_badge_font_weight'); if (posBadgeWeight) root.style.setProperty('--strip-position-badge-font-weight', posBadgeWeight);
        var posBadgeSize = getVal(csG, 'position_badge_font_size'); if (posBadgeSize) root.style.setProperty('--strip-position-badge-font-size', posBadgeSize);

        var macBg = getVal(csG, 'macro_bg'); if (macBg) root.style.setProperty('--strip-macro-bg', macBg);
        var macBorder = getVal(csG, 'macro_border'); if (macBorder) root.style.setProperty('--strip-macro-border', macBorder);
        var macHdrBg = getVal(csG, 'macro_header_bg'); if (macHdrBg) root.style.setProperty('--strip-macro-header-bg', macHdrBg);
        var macHdrText = getVal(csG, 'macro_header_text'); if (macHdrText) root.style.setProperty('--strip-macro-header-text', macHdrText);
        var macTitleColor = getVal(csG, 'macro_title_color'); if (macTitleColor) root.style.setProperty('--strip-macro-title-color', macTitleColor);
        var macTitleBg = getVal(csG, 'macro_title_bg'); if (macTitleBg) root.style.setProperty('--strip-macro-title-bg', macTitleBg);
        var macCfgBg = getVal(csG, 'macro_config_bg'); if (macCfgBg) root.style.setProperty('--strip-macro-config-bg', macCfgBg);
        var macCfgHov = getVal(csG, 'macro_config_hover_bg'); if (macCfgHov) root.style.setProperty('--strip-macro-config-hover-bg', macCfgHov);
        var macCfgText = getVal(csG, 'macro_config_text'); if (macCfgText) root.style.setProperty('--strip-macro-config-text', macCfgText);
        var macCfgRad = getVal(csG, 'macro_config_radius'); if (macCfgRad) root.style.setProperty('--strip-macro-config-radius', macCfgRad);
        var macCfgFont = getVal(csG, 'macro_config_font_family'); if (macCfgFont) root.style.setProperty('--strip-macro-config-font-family', macCfgFont);
        var macCfgWeight = getVal(csG, 'macro_config_font_weight'); if (macCfgWeight) root.style.setProperty('--strip-macro-config-font-weight', macCfgWeight);
        var macCfgSize = getVal(csG, 'macro_config_font_size'); if (macCfgSize) root.style.setProperty('--strip-macro-config-font-size', macCfgSize);

        var macDeltaBg = getVal(csG, 'macro_delta_bg'); if (macDeltaBg) root.style.setProperty('--strip-macro-delta-bg', macDeltaBg);
        var macDeltaText = getVal(csG, 'macro_delta_text'); if (macDeltaText) root.style.setProperty('--strip-macro-delta-text', macDeltaText);
        var macDeltaAct = getVal(csG, 'macro_delta_active_text'); if (macDeltaAct) root.style.setProperty('--strip-macro-delta-active-text', macDeltaAct);
        var macDeltaFont = getVal(csG, 'macro_delta_font_family'); if (macDeltaFont) root.style.setProperty('--strip-macro-delta-font-family', macDeltaFont);
        var macDeltaWeight = getVal(csG, 'macro_delta_font_weight'); if (macDeltaWeight) root.style.setProperty('--strip-macro-delta-font-weight', macDeltaWeight);
        var macDeltaSize = getVal(csG, 'macro_delta_font_size'); if (macDeltaSize) root.style.setProperty('--strip-macro-delta-font-size', macDeltaSize);

        var macBigBg = getVal(csG, 'macro_big_nudge_bg'); if (macBigBg) root.style.setProperty('--strip-macro-big-nudge-bg', macBigBg);
        var macBigText = getVal(csG, 'macro_big_nudge_text'); if (macBigText) root.style.setProperty('--strip-macro-big-nudge-text', macBigText);
        var macBigBrd = getVal(csG, 'macro_big_nudge_border'); if (macBigBrd) root.style.setProperty('--strip-macro-big-nudge-border', macBigBrd);
        var macBigRad = getVal(csG, 'macro_big_nudge_radius'); if (macBigRad) root.style.setProperty('--strip-macro-big-nudge-radius', macBigRad);
        var macBigShd = getVal(csG, 'macro_big_nudge_shadow'); if (macBigShd) root.style.setProperty('--strip-macro-big-nudge-shadow', macBigShd);
        var macBigFont = getVal(csG, 'macro_big_nudge_font_family'); if (macBigFont) root.style.setProperty('--strip-macro-big-nudge-font-family', macBigFont);
        var macBigWeight = getVal(csG, 'macro_big_nudge_font_weight'); if (macBigWeight) root.style.setProperty('--strip-macro-big-nudge-font-weight', macBigWeight);
        var macBigSize = getVal(csG, 'macro_big_nudge_font_size'); if (macBigSize) root.style.setProperty('--strip-macro-big-nudge-font-size', macBigSize);

        var macRstBg = getVal(csG, 'macro_reset_bg'); if (macRstBg) root.style.setProperty('--strip-macro-reset-bg', macRstBg);
        var macRstHov = getVal(csG, 'macro_reset_hover_bg'); if (macRstHov) root.style.setProperty('--strip-macro-reset-hover-bg', macRstHov);
        var macRstText = getVal(csG, 'macro_reset_text'); if (macRstText) root.style.setProperty('--strip-macro-reset-text', macRstText);
        var macRstRad = getVal(csG, 'macro_reset_radius'); if (macRstRad) root.style.setProperty('--strip-macro-reset-radius', macRstRad);
        var macRstFont = getVal(csG, 'macro_reset_font_family'); if (macRstFont) root.style.setProperty('--strip-macro-reset-font-family', macRstFont);
        var macRstWeight = getVal(csG, 'macro_reset_font_weight'); if (macRstWeight) root.style.setProperty('--strip-macro-reset-font-weight', macRstWeight);
        var macRstSize = getVal(csG, 'macro_reset_font_size'); if (macRstSize) root.style.setProperty('--strip-macro-reset-font-size', macRstSize);

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
        var dHdrH = getVal(csD, 'header_height'); if (dHdrH) root.style.setProperty('--strip-header-height', dHdrH);
        var dHdrSize = getVal(csD, 'header_font_size'); if (dHdrSize) root.style.setProperty('--strip-header-font-size', dHdrSize);
        var dHdrWeight = getVal(csD, 'header_font_weight'); if (dHdrWeight) root.style.setProperty('--strip-header-font-weight', dHdrWeight);
        var dHdrFont = getVal(csD, 'header_font_family'); if (dHdrFont) root.style.setProperty('--strip-header-font-family', dHdrFont);
        var dPatchH = getVal(csD, 'patch_height'); if (dPatchH) root.style.setProperty('--strip-patch-height', dPatchH);
        var dPatchSize = getVal(csD, 'patch_font_size'); if (dPatchSize) root.style.setProperty('--strip-patch-font-size', dPatchSize);
        var dPatchFont = getVal(csD, 'patch_font_family'); if (dPatchFont) root.style.setProperty('--strip-patch-font-family', dPatchFont);
        var dPatchMinW = getVal(csD, 'patch_min_width'); if (dPatchMinW) root.style.setProperty('--strip-patch-min-width', dPatchMinW);

        var dBtnOnH = getVal(csD, 'btn_on_height'); if (dBtnOnH) root.style.setProperty('--strip-btn-on-height', dBtnOnH);
        var dBtnOnRad = getVal(csD, 'btn_on_radius'); if (dBtnOnRad) root.style.setProperty('--strip-btn-on-radius', dBtnOnRad);
        var dBtnOnSize = getVal(csD, 'btn_on_font_size'); if (dBtnOnSize) root.style.setProperty('--strip-btn-on-font-size', dBtnOnSize);
        var dBtnOnFont = getVal(csD, 'btn_on_font_family'); if (dBtnOnFont) root.style.setProperty('--strip-btn-on-font-family', dBtnOnFont);

        var dBtnSoloH = getVal(csD, 'btn_solo_height'); if (dBtnSoloH) root.style.setProperty('--strip-btn-solo-height', dBtnSoloH);
        var dBtnSoloRad = getVal(csD, 'btn_solo_radius'); if (dBtnSoloRad) root.style.setProperty('--strip-btn-solo-radius', dBtnSoloRad);
        var dBtnSoloSize = getVal(csD, 'btn_solo_font_size'); if (dBtnSoloSize) root.style.setProperty('--strip-btn-solo-font-size', dBtnSoloSize);
        var dBtnSoloFont = getVal(csD, 'btn_solo_font_family'); if (dBtnSoloFont) root.style.setProperty('--strip-btn-solo-font-family', dBtnSoloFont);

        var dBtnPreH = getVal(csD, 'btn_pre_height'); if (dBtnPreH) root.style.setProperty('--strip-btn-pre-height', dBtnPreH);
        var dBtnPreRad = getVal(csD, 'btn_pre_radius'); if (dBtnPreRad) root.style.setProperty('--strip-btn-pre-radius', dBtnPreRad);
        var dBtnPreSize = getVal(csD, 'btn_pre_font_size'); if (dBtnPreSize) root.style.setProperty('--strip-btn-pre-font-size', dBtnPreSize);
        var dBtnPreFont = getVal(csD, 'btn_pre_font_family'); if (dBtnPreFont) root.style.setProperty('--strip-btn-pre-font-family', dBtnPreFont);

        var dBtnNudgeSize = getVal(csD, 'btn_nudge_size'); if (dBtnNudgeSize) root.style.setProperty('--strip-desk-nudge-size', dBtnNudgeSize);
        var dBtnNudgeRad = getVal(csD, 'btn_nudge_radius'); if (dBtnNudgeRad) root.style.setProperty('--strip-btn-nudge-radius', dBtnNudgeRad);
        var dBtnNudgeFontSize = getVal(csD, 'btn_nudge_font_size'); if (dBtnNudgeFontSize) root.style.setProperty('--strip-btn-nudge-font-size', dBtnNudgeFontSize);
        var dBtnNudgeFont = getVal(csD, 'btn_nudge_font_family'); if (dBtnNudgeFont) root.style.setProperty('--strip-btn-nudge-font-family', dBtnNudgeFont);

        var dMacroCfgH = getVal(csD, 'macro_config_btn_height'); if (dMacroCfgH) root.style.setProperty('--strip-macro-config-btn-height', dMacroCfgH);
        var dMacroCfgSize = getVal(csD, 'macro_config_font_size'); if (dMacroCfgSize) root.style.setProperty('--strip-macro-config-font-size', dMacroCfgSize);
        var dMacroCfgFont = getVal(csD, 'macro_config_font_family'); if (dMacroCfgFont) root.style.setProperty('--strip-macro-config-font-family', dMacroCfgFont);

        var dMacroRstH = getVal(csD, 'macro_reset_btn_height'); if (dMacroRstH) root.style.setProperty('--strip-macro-reset-btn-height', dMacroRstH);
        var dMacroRstSize = getVal(csD, 'macro_reset_font_size'); if (dMacroRstSize) root.style.setProperty('--strip-macro-reset-font-size', dMacroRstSize);
        var dMacroRstFont = getVal(csD, 'macro_reset_font_family'); if (dMacroRstFont) root.style.setProperty('--strip-macro-reset-font-family', dMacroRstFont);

        var dNameRad = getVal(csD, 'name_display_radius'); if (dNameRad) root.style.setProperty('--strip-name-display-radius', dNameRad);
        var dNameSize = getVal(csD, 'name_display_font_size'); if (dNameSize) root.style.setProperty('--strip-name-display-font-size', dNameSize);
        var dNameFont = getVal(csD, 'name_display_font_family'); if (dNameFont) root.style.setProperty('--strip-name-display-font-family', dNameFont);

        var dDbSize = getVal(csD, 'db_val_font_size'); if (dDbSize) root.style.setProperty('--strip-db-val-font-size', dDbSize);
        var dDbFont = getVal(csD, 'db_val_font_family'); if (dDbFont) root.style.setProperty('--strip-db-val-font-family', dDbFont);

        var dScaleSize = getVal(csD, 'scale_font_size'); if (dScaleSize) root.style.setProperty('--strip-scale-font-size', dScaleSize);
        var dScaleFont = getVal(csD, 'scale_font_family'); if (dScaleFont) root.style.setProperty('--strip-scale-font-family', dScaleFont);

        var dCardW = getVal(csD, 'card_width'); if (dCardW) root.style.setProperty('--strip-desk-card-width', dCardW);
        var dCardPW = getVal(csD, 'card_paired_width'); if (dCardPW) root.style.setProperty('--strip-desk-card-paired-width', dCardPW);
        var dVolWidth = getVal(csD, 'volume_geral_width'); if (dVolWidth) root.style.setProperty('--strip-desk-volume-geral-width', dVolWidth);

        // Mobile Properties
        var mCardW = getVal(csM, 'card_width', 'mobile_card_width'); if (mCardW) root.style.setProperty('--strip-mobile-card-width', mCardW);
        var mCardPW = getVal(csM, 'card_paired_width', 'mobile_card_paired_width'); if (mCardPW) root.style.setProperty('--strip-mobile-card-paired-width', mCardPW);
        var mVolW = getVal(csM, 'volume_geral_width'); if (mVolW) root.style.setProperty('--strip-mobile-volume-geral-width', mVolW);
        var mCardRad = getVal(csM, 'card_radius', 'mobile_card_radius'); if (mCardRad) root.style.setProperty('--strip-mobile-card-radius', mCardRad);
        var mCardBrd = getVal(csM, 'card_border', 'mobile_card_border'); if (mCardBrd) root.style.setProperty('--strip-mobile-card-border', mCardBrd);
        var mCardBrdW = getVal(csM, 'card_border_width', 'mobile_card_border_width'); if (mCardBrdW !== undefined) root.style.setProperty('--strip-mobile-card-border-width', mCardBrdW);
        var mCardTopW = getVal(csM, 'card_border_top_width', 'mobile_card_border_top_width'); if (mCardTopW !== undefined) root.style.setProperty('--strip-mobile-card-border-top-width', mCardTopW);

        var mStripBg = getVal(csM, 'strip_bg', 'mobile_strip_bg'); if (mStripBg) root.style.setProperty('--strip-mobile-bg', mStripBg);

        var mHdrH = getVal(csM, 'header_height'); if (mHdrH) root.style.setProperty('--strip-mobile-header-height', mHdrH);
        var mHdrSize = getVal(csM, 'header_font_size'); if (mHdrSize) root.style.setProperty('--strip-mobile-header-font-size', mHdrSize);
        var mHdrWeight = getVal(csM, 'header_font_weight'); if (mHdrWeight) root.style.setProperty('--strip-mobile-header-font-weight', mHdrWeight);
        var mHdrFont = getVal(csM, 'header_font_family'); if (mHdrFont) root.style.setProperty('--strip-mobile-header-font-family', mHdrFont);

        var mBtnH = getVal(csM, 'btn_height', 'mobile_btn_height'); if (mBtnH) root.style.setProperty('--strip-mobile-btn-height', mBtnH);
        var mBtnOnH = getVal(csM, 'btn_on_height'); if (mBtnOnH) root.style.setProperty('--strip-mobile-btn-on-height', mBtnOnH);
        var mBtnOnSize = getVal(csM, 'btn_on_font_size'); if (mBtnOnSize) root.style.setProperty('--strip-mobile-btn-on-font-size', mBtnOnSize);
        var mBtnOnFont = getVal(csM, 'btn_on_font_family'); if (mBtnOnFont) root.style.setProperty('--strip-mobile-btn-on-font-family', mBtnOnFont);

        var mBtnSoloH = getVal(csM, 'btn_solo_height'); if (mBtnSoloH) root.style.setProperty('--strip-mobile-btn-solo-height', mBtnSoloH);
        var mBtnSoloSize = getVal(csM, 'btn_solo_font_size'); if (mBtnSoloSize) root.style.setProperty('--strip-mobile-btn-solo-font-size', mBtnSoloSize);
        var mBtnSoloFont = getVal(csM, 'btn_solo_font_family'); if (mBtnSoloFont) root.style.setProperty('--strip-mobile-btn-solo-font-family', mBtnSoloFont);

        var mBtnPreH = getVal(csM, 'btn_pre_height'); if (mBtnPreH) root.style.setProperty('--strip-mobile-btn-pre-height', mBtnPreH);
        var mBtnPreSize = getVal(csM, 'btn_pre_font_size'); if (mBtnPreSize) root.style.setProperty('--strip-mobile-btn-pre-font-size', mBtnPreSize);
        var mBtnPreFont = getVal(csM, 'btn_pre_font_family'); if (mBtnPreFont) root.style.setProperty('--strip-mobile-btn-pre-font-family', mBtnPreFont);

        var mBtnMedH = getVal(csM, 'btn_medidores_height'); if (mBtnMedH) root.style.setProperty('--strip-mobile-btn-medidores-height', mBtnMedH);
        var mBtnRad = getVal(csM, 'btn_radius', 'mobile_btn_radius'); if (mBtnRad) root.style.setProperty('--strip-mobile-btn-radius', mBtnRad);
        var mNudgeSize = getVal(csM, 'nudge_btn_size', 'mobile_nudge_btn_size'); if (mNudgeSize) root.style.setProperty('--strip-mobile-nudge-size', mNudgeSize);
        var mNudgeFontSize = getVal(csM, 'nudge_font_size'); if (mNudgeFontSize) root.style.setProperty('--strip-mobile-nudge-font-size', mNudgeFontSize);
        var mNudgeFont = getVal(csM, 'nudge_font_family'); if (mNudgeFont) root.style.setProperty('--strip-mobile-nudge-font-family', mNudgeFont);

        var mMacroCfgH = getVal(csM, 'macro_config_btn_height'); if (mMacroCfgH) root.style.setProperty('--strip-mobile-macro-config-btn-height', mMacroCfgH);
        var mMacroCfgSize = getVal(csM, 'macro_config_font_size'); if (mMacroCfgSize) root.style.setProperty('--strip-mobile-macro-config-font-size', mMacroCfgSize);
        var mMacroCfgFont = getVal(csM, 'macro_config_font_family'); if (mMacroCfgFont) root.style.setProperty('--strip-mobile-macro-config-font-family', mMacroCfgFont);

        var mMacroRstH = getVal(csM, 'macro_reset_btn_height'); if (mMacroRstH) root.style.setProperty('--strip-mobile-macro-reset-btn-height', mMacroRstH);
        var mMacroRstSize = getVal(csM, 'macro_reset_font_size'); if (mMacroRstSize) root.style.setProperty('--strip-mobile-macro-reset-font-size', mMacroRstSize);
        var mMacroRstFont = getVal(csM, 'macro_reset_font_family'); if (mMacroRstFont) root.style.setProperty('--strip-mobile-macro-reset-font-family', mMacroRstFont);

        var mDbSize = getVal(csM, 'db_font_size', 'mobile_db_font_size'); if (mDbSize) root.style.setProperty('--strip-mobile-db-font-size', mDbSize);
        var mDbFont = getVal(csM, 'db_font_family'); if (mDbFont) root.style.setProperty('--strip-mobile-db-font-family', mDbFont);

        var mPatchSize = getVal(csM, 'patch_font_size', 'mobile_patch_font_size'); if (mPatchSize) root.style.setProperty('--strip-mobile-patch-font-size', mPatchSize);
        var mPatchFont = getVal(csM, 'patch_font_family'); if (mPatchFont) root.style.setProperty('--strip-mobile-patch-font-family', mPatchFont);

        var mNameSize = getVal(csM, 'name_display_font_size', 'mobile_name_display_font_size'); if (mNameSize) root.style.setProperty('--strip-mobile-name-display-font-size', mNameSize);
        var mNameFont = getVal(csM, 'name_display_font_family', 'mobile_name_display_font_family'); if (mNameFont) root.style.setProperty('--strip-mobile-name-display-font-family', mNameFont);

        var mScaleSize = getVal(csM, 'scale_font_size'); if (mScaleSize) root.style.setProperty('--strip-mobile-scale-font-size', mScaleSize);
        var mScaleFont = getVal(csM, 'scale_font_family'); if (mScaleFont) root.style.setProperty('--strip-mobile-scale-font-family', mScaleFont);
        var mDbStroke = getVal(csM, 'db_text_stroke'); if (mDbStroke) root.style.setProperty('--strip-mobile-db-stroke', mDbStroke);

        var mBigNudgeSize = getVal(csM, 'macro_big_nudge_font_size'); if (mBigNudgeSize) root.style.setProperty('--strip-mobile-macro-big-nudge-font-size', mBigNudgeSize);

        var mThumbW = getVal(csM, 'fader_thumb_width', 'mobile_fader_thumb_width'); if (mThumbW) root.style.setProperty('--strip-mobile-thumb-width', mThumbW);
        var mThumbH = getVal(csM, 'fader_thumb_height', 'mobile_fader_thumb_height'); if (mThumbH) root.style.setProperty('--strip-mobile-thumb-height', mThumbH);
        var mThumbRad = getVal(csM, 'fader_thumb_radius', 'mobile_fader_thumb_radius'); if (mThumbRad) root.style.setProperty('--strip-mobile-thumb-radius', mThumbRad);

        // Mobile VU Meter Gradient (Cortina de Medidor)
        var mGradTop = getVal(csM, 'meter_gradient_top'); if (mGradTop) root.style.setProperty('--strip-mobile-meter-gradient-top', mGradTop);
        var mGradMid = getVal(csM, 'meter_gradient_mid'); if (mGradMid) root.style.setProperty('--strip-mobile-meter-gradient-mid', mGradMid);
        var mGradLow = getVal(csM, 'meter_gradient_low'); if (mGradLow) root.style.setProperty('--strip-mobile-meter-gradient-low', mGradLow);
        var mGradBase = getVal(csM, 'meter_gradient_base'); if (mGradBase) root.style.setProperty('--strip-mobile-meter-gradient-base', mGradBase);

        // Main View (Layout da Tela Principal)
        var mv = theme.main_view || {};
        if (mv.faders_gap !== undefined)              root.style.setProperty('--main-faders-gap', mv.faders_gap);
        if (mv.faders_padding !== undefined)          root.style.setProperty('--main-faders-padding', mv.faders_padding);
        if (mv.group_separator_width !== undefined)   root.style.setProperty('--main-group-separator-width', mv.group_separator_width);
        if (mv.group_separator_bg !== undefined)      root.style.setProperty('--main-group-separator-bg', mv.group_separator_bg);
        if (mv.macro_spacer_width !== undefined)      root.style.setProperty('--main-macro-spacer-width', mv.macro_spacer_width);
        if (mv.macro_spacer_bg !== undefined)         root.style.setProperty('--main-macro-spacer-bg', mv.macro_spacer_bg);
        if (mv.mobile_faders_gap !== undefined)       root.style.setProperty('--main-mobile-faders-gap', mv.mobile_faders_gap);
        if (mv.mobile_group_gap !== undefined)        root.style.setProperty('--main-group-gap', mv.mobile_group_gap);

        // Channel Setup (Central de Edição do Canal)
        var csetup = theme.channel_setup || {};
        if (csetup.overlay_bg)         root.style.setProperty('--csetup-overlay-bg', csetup.overlay_bg);
        if (csetup.modal_bg)           root.style.setProperty('--csetup-modal-bg', csetup.modal_bg);
        if (csetup.modal_border)       root.style.setProperty('--csetup-modal-border', csetup.modal_border);
        if (csetup.modal_radius)       root.style.setProperty('--csetup-modal-radius', csetup.modal_radius);
        if (csetup.header_bg)          root.style.setProperty('--csetup-header-bg', csetup.header_bg);
        if (csetup.header_text)        root.style.setProperty('--csetup-header-text', csetup.header_text);
        if (csetup.header_font_family) root.style.setProperty('--csetup-header-font-family', csetup.header_font_family);
        if (csetup.header_font_size)   root.style.setProperty('--csetup-header-font-size', csetup.header_font_size);
        if (csetup.nav_btn_bg)         root.style.setProperty('--csetup-nav-btn-bg', csetup.nav_btn_bg);
        if (csetup.nav_btn_text)       root.style.setProperty('--csetup-nav-btn-text', csetup.nav_btn_text);
        if (csetup.nav_btn_border)     root.style.setProperty('--csetup-nav-btn-border', csetup.nav_btn_border);
        if (csetup.nav_btn_radius)     root.style.setProperty('--csetup-nav-btn-radius', csetup.nav_btn_radius);
        if (csetup.tab_active_bg)      root.style.setProperty('--csetup-tab-active-bg', csetup.tab_active_bg);
        if (csetup.tab_active_text)    root.style.setProperty('--csetup-tab-active-text', csetup.tab_active_text);
        if (csetup.tab_inactive_bg)    root.style.setProperty('--csetup-tab-inactive-bg', csetup.tab_inactive_bg);
        if (csetup.tab_inactive_text)  root.style.setProperty('--csetup-tab-inactive-text', csetup.tab_inactive_text);
        if (csetup.tab_radius)         root.style.setProperty('--csetup-tab-radius', csetup.tab_radius);
        if (csetup.tab_font_family)    root.style.setProperty('--csetup-tab-font-family', csetup.tab_font_family);
        if (csetup.tab_font_size)      root.style.setProperty('--csetup-tab-font-size', csetup.tab_font_size);
        if (csetup.mini_fader_bg)      root.style.setProperty('--csetup-mini-fader-bg', csetup.mini_fader_bg);
        if (csetup.mini_fader_border)  root.style.setProperty('--csetup-mini-fader-border', csetup.mini_fader_border);
        if (csetup.mini_fader_width)   root.style.setProperty('--csetup-mini-fader-width', csetup.mini_fader_width);
        if (csetup.mobile_mini_fader_width) root.style.setProperty('--csetup-mobile-mini-fader-width', csetup.mobile_mini_fader_width);
    }

    return {
        apply: _apply
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
            if (typeof ThemeEngine !== 'undefined' && ThemeEngine.apply) {
                ThemeEngine.apply(yaml);
            }
        })
        .catch(function (e) {
            console.warn('[ThemeEngine] Fallback de carregamento de tema:', e);
            const fetchFn = typeof window.apiFetch === 'function' ? window.apiFetch : fetch;
            fetchFn('/api/themes/active')
                .then(function (r) { return r.json(); })
                .then(function (data) {
                    if (data && data.content && typeof ThemeEngine !== 'undefined' && ThemeEngine.apply) {
                        ThemeEngine.apply(data.content);
                    }
                })
                .catch(function (err) {
                    console.error('[ThemeEngine] Erro final ao carregar tema:', err);
                });
        });
});
