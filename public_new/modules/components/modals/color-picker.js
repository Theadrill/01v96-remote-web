/**
 * ColorPicker — Componente customizado de seleção de cor Touch-Friendly & iOS Ready
 * Modos:
 *   - 'full': Exibe Paleta Rápida + HEX Input + Barras de Ajuste RGB (ideal para Editor de Temas)
 *   - 'lite': Exibe Paleta Rápida + HEX Input (sem barras RGB, ideal para Botões de Macro)
 *
 * Uso:
 *   ColorPicker.open({ initialColor: "#28a745", mode: "lite", title: "Cor da Macro" }) → Promise<string | null>
 */
var ColorPicker = (function () {
    'use strict';

    var _root = null;
    var _content = null;
    var _resolve = null;
    var _isOpen = false;
    var _currentHex = '#ffffff';

    var DEFAULT_PRESETS = [
        '#28a745', '#dc3545', '#ffc107', '#1976d2', '#e67e22',
        '#9b59b6', '#1abc9c', '#e91e63', '#00bcd4', '#8e44ad',
        '#2ecc71', '#e74c3c', '#f39c12', '#34495e', '#ffffff',
        '#cccccc', '#888888', '#444444', '#222222', '#000000'
    ];

    function _injectStyles() {
        if (document.getElementById('color-picker-styles')) return;

        var style = document.createElement('style');
        style.id = 'color-picker-styles';
        style.textContent = `
            .color-picker-overlay {
                position: fixed;
                top: 0;
                left: 0;
                width: 100vw;
                height: 100vh;
                background: rgba(0, 0, 0, 0.75);
                backdrop-filter: blur(4px);
                -webkit-backdrop-filter: blur(4px);
                z-index: 16000;
                display: flex;
                align-items: center;
                justify-content: center;
                opacity: 0;
                transition: opacity 0.2s ease-in-out;
                pointer-events: none;
                box-sizing: border-box;
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            }

            .color-picker-overlay.cp-visible {
                opacity: 1;
                pointer-events: auto;
            }

            .color-picker-card {
                background: #1e1e1e;
                border: 1px solid #333;
                border-radius: 12px;
                width: 90%;
                max-width: 420px;
                padding: 20px;
                box-shadow: 0 10px 30px rgba(0,0,0,0.8);
                color: #fff;
                display: flex;
                flex-direction: column;
                gap: 16px;
                max-height: 90vh;
                overflow-y: auto;
                box-sizing: border-box;
            }

            .color-picker-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                font-size: 1.1rem;
                font-weight: 700;
                border-bottom: 1px solid #333;
                padding-bottom: 10px;
            }

            .color-picker-close-btn {
                background: transparent;
                border: none;
                color: #aaa;
                font-size: 1.4rem;
                cursor: pointer;
                padding: 4px 8px;
                line-height: 1;
            }
            .color-picker-close-btn:hover { color: #fff; }

            .color-picker-preview-row {
                display: flex;
                align-items: center;
                gap: 12px;
            }

            .color-picker-preview-box {
                width: 50px;
                height: 50px;
                border-radius: 8px;
                border: 2px solid #444;
                box-shadow: inset 0 0 5px rgba(0,0,0,0.5);
                flex-shrink: 0;
                transition: background-color 0.15s ease;
            }

            .color-picker-hex-input {
                flex: 1;
                background: #2b2b2b;
                border: 1px solid #444;
                border-radius: 8px;
                color: #fff;
                font-size: 1.1rem;
                font-weight: bold;
                padding: 10px;
                text-transform: uppercase;
                letter-spacing: 1px;
                box-sizing: border-box;
            }
            .color-picker-hex-input:focus {
                outline: none;
                border-color: #1976d2;
            }

            .color-picker-section-title {
                font-size: 0.85rem;
                color: #aaa;
                text-transform: uppercase;
                letter-spacing: 0.5px;
                margin-bottom: 6px;
                font-weight: 600;
            }

            .color-picker-swatches {
                display: grid;
                grid-template-columns: repeat(5, 1fr);
                gap: 8px;
            }

            .color-picker-swatch {
                aspect-ratio: 1;
                min-height: 44px;
                border-radius: 8px;
                border: 2px solid transparent;
                cursor: pointer;
                touch-action: manipulation;
                transition: transform 0.1s ease, border-color 0.1s ease;
                box-shadow: inset 0 0 4px rgba(0,0,0,0.3);
            }
            .color-picker-swatch:active {
                transform: scale(0.92);
            }
            .color-picker-swatch.cp-selected {
                border-color: #fff;
                box-shadow: 0 0 8px rgba(255,255,255,0.8);
            }

            .color-picker-sliders {
                display: flex;
                flex-direction: column;
                gap: 10px;
            }

            .color-picker-slider-group {
                display: flex;
                align-items: center;
                gap: 10px;
            }

            .color-picker-slider-label {
                width: 20px;
                font-weight: bold;
                color: #aaa;
                font-size: 0.9rem;
            }

            .color-picker-slider {
                flex: 1;
                -webkit-appearance: none;
                height: 10px;
                border-radius: 5px;
                background: #333;
                outline: none;
            }
            .color-picker-slider::-webkit-slider-thumb {
                -webkit-appearance: none;
                width: 22px;
                height: 22px;
                border-radius: 50%;
                background: #fff;
                cursor: pointer;
                box-shadow: 0 2px 5px rgba(0,0,0,0.5);
            }

            .color-picker-actions {
                display: flex;
                gap: 10px;
                margin-top: 10px;
            }

            .color-picker-btn {
                flex: 1;
                height: 46px;
                border-radius: 8px;
                border: none;
                font-size: 1rem;
                font-weight: 800;
                cursor: pointer;
                touch-action: manipulation;
                transition: transform 0.1s ease, filter 0.1s ease;
            }
            .color-picker-btn:active {
                transform: scale(0.96);
            }
            .color-picker-btn-confirm {
                background: #28a745;
                color: #fff;
            }
            .color-picker-btn-cancel {
                background: #333;
                color: #ccc;
            }

            /* Responsive Fullscreen / Bottom-sheet Mobile */
            @media screen and (max-width: 600px) {
                .color-picker-overlay {
                    align-items: flex-end;
                }
                .color-picker-card {
                    width: 100%;
                    max-width: 100%;
                    border-radius: 16px 16px 0 0;
                    padding: 20px;
                    max-height: 90vh;
                    animation: cpSlideUp 0.25s ease-out;
                }
                @keyframes cpSlideUp {
                    from { transform: translateY(100%); }
                    to { transform: translateY(0); }
                }
            }
        `;
        document.head.appendChild(style);
    }

    function _hexToRgb(hex) {
        var c = hex.replace('#', '');
        if (c.length === 3) {
            c = c[0] + c[0] + c[1] + c[1] + c[2] + c[2];
        }
        var num = parseInt(c, 16);
        if (isNaN(num)) return { r: 255, g: 255, b: 255 };
        return {
            r: (num >> 16) & 255,
            g: (num >> 8) & 255,
            b: num & 255
        };
    }

    function _rgbToHex(r, g, b) {
        return '#' + [r, g, b].map(function (x) {
            var hex = Math.max(0, Math.min(255, x)).toString(16);
            return hex.length === 1 ? '0' + hex : hex;
        }).join('');
    }

    function _buildDOM() {
        if (_root) return;
        _injectStyles();

        _root = document.createElement('div');
        _root.className = 'color-picker-overlay';

        _content = document.createElement('div');
        _content.className = 'color-picker-card';

        _root.appendChild(_content);
        document.body.appendChild(_root);

        _root.addEventListener('click', function (e) {
            if (e.target === _root) {
                _close(null);
            }
        });

        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape' && _isOpen) {
                _close(null);
            }
        });
    }

    function _updateUI(hex) {
        _currentHex = hex.startsWith('#') ? hex : '#' + hex;
        var rgb = _hexToRgb(_currentHex);

        var preview = _content.querySelector('.color-picker-preview-box');
        if (preview) preview.style.backgroundColor = _currentHex;

        var input = _content.querySelector('.color-picker-hex-input');
        if (input && document.activeElement !== input) {
            input.value = _currentHex.toUpperCase();
        }

        var rSlider = _content.querySelector('.cp-slider-r');
        var gSlider = _content.querySelector('.cp-slider-g');
        var bSlider = _content.querySelector('.cp-slider-b');

        if (rSlider) rSlider.value = rgb.r;
        if (gSlider) gSlider.value = rgb.g;
        if (bSlider) bSlider.value = rgb.b;

        var swatches = _content.querySelectorAll('.color-picker-swatch');
        swatches.forEach(function (swatch) {
            var swHex = swatch.getAttribute('data-hex');
            if (swHex && swHex.toLowerCase() === _currentHex.toLowerCase()) {
                swatch.classList.add('cp-selected');
            } else {
                swatch.classList.remove('cp-selected');
            }
        });
    }

    function _open(options) {
        options = options || {};
        var mode = options.mode || 'full'; // 'full' | 'lite'
        var showSliders = (options.showSliders !== undefined) ? !!options.showSliders : (mode === 'full');
        var autoConfirmSwatch = (options.autoConfirmSwatch !== undefined) ? !!options.autoConfirmSwatch : false;
        var initialColor = options.initialColor || '#ffffff';
        var presets = options.presets || DEFAULT_PRESETS;
        var title = options.title || (mode === 'lite' ? 'Escolher Cor da Macro' : 'Escolher Cor');

        _buildDOM();

        var slidersHTML = showSliders ? `
            <div>
                <div class="color-picker-section-title">Ajuste RGB</div>
                <div class="color-picker-sliders">
                    <div class="color-picker-slider-group">
                        <span class="color-picker-slider-label" style="color:#ef5350;">R</span>
                        <input type="range" class="color-picker-slider cp-slider-r" min="0" max="255" value="255" />
                    </div>
                    <div class="color-picker-slider-group">
                        <span class="color-picker-slider-label" style="color:#66bb6a;">G</span>
                        <input type="range" class="color-picker-slider cp-slider-g" min="0" max="255" value="255" />
                    </div>
                    <div class="color-picker-slider-group">
                        <span class="color-picker-slider-label" style="color:#42a5f5;">B</span>
                        <input type="range" class="color-picker-slider cp-slider-b" min="0" max="255" value="255" />
                    </div>
                </div>
            </div>
        ` : '';

        _content.innerHTML = `
            <div class="color-picker-header">
                <span>${title}</span>
                <button class="color-picker-close-btn">&times;</button>
            </div>

            <div class="color-picker-preview-row">
                <div class="color-picker-preview-box" style="background-color: ${initialColor};"></div>
                <input type="text" class="color-picker-hex-input" value="${initialColor.toUpperCase()}" maxlength="7" spellcheck="false" />
            </div>

            <div>
                <div class="color-picker-section-title">Paleta Rápida</div>
                <div class="color-picker-swatches">
                    ${presets.map(function (hex) {
                        return `<div class="color-picker-swatch" data-hex="${hex}" style="background-color: ${hex};"></div>`;
                    }).join('')}
                </div>
            </div>

            ${slidersHTML}

            <div class="color-picker-actions">
                <button class="color-picker-btn color-picker-btn-cancel">Cancelar</button>
                <button class="color-picker-btn color-picker-btn-confirm">Confirmar</button>
            </div>
        `;

        // Event listeners
        var closeBtn = _content.querySelector('.color-picker-close-btn');
        var cancelBtn = _content.querySelector('.color-picker-btn-cancel');
        var confirmBtn = _content.querySelector('.color-picker-btn-confirm');
        var hexInput = _content.querySelector('.color-picker-hex-input');

        closeBtn.addEventListener('click', function () { _close(null); });
        cancelBtn.addEventListener('click', function () { _close(null); });
        confirmBtn.addEventListener('click', function () { _close(_currentHex); });

        hexInput.addEventListener('input', function () {
            var val = hexInput.value.trim();
            if (!val.startsWith('#')) val = '#' + val;
            if (/^#[0-9A-Fa-f]{6}$/.test(val)) {
                _updateUI(val);
            }
        });

        if (showSliders) {
            var rSlider = _content.querySelector('.cp-slider-r');
            var gSlider = _content.querySelector('.cp-slider-g');
            var bSlider = _content.querySelector('.cp-slider-b');

            function onSliderChange() {
                var r = parseInt(rSlider.value, 10) || 0;
                var g = parseInt(gSlider.value, 10) || 0;
                var b = parseInt(bSlider.value, 10) || 0;
                _updateUI(_rgbToHex(r, g, b));
            }

            if (rSlider) rSlider.addEventListener('input', onSliderChange);
            if (gSlider) gSlider.addEventListener('input', onSliderChange);
            if (bSlider) bSlider.addEventListener('input', onSliderChange);
        }

        var swatches = _content.querySelectorAll('.color-picker-swatch');
        swatches.forEach(function (swatch) {
            swatch.addEventListener('click', function () {
                var hex = swatch.getAttribute('data-hex');
                if (hex) {
                    _updateUI(hex);
                    if (autoConfirmSwatch) {
                        _close(hex);
                    }
                }
            });
        });

        _updateUI(initialColor);

        _root.style.display = 'flex';
        setTimeout(function () {
            _root.classList.add('cp-visible');
            _isOpen = true;
        }, 10);

        return new Promise(function (resolve) {
            _resolve = resolve;
        });
    }

    function _close(result) {
        if (!_isOpen && !_root) return;
        _isOpen = false;
        if (_root) _root.classList.remove('cp-visible');

        setTimeout(function () {
            if (_root) _root.style.display = 'none';
            if (_resolve) {
                _resolve(result);
                _resolve = null;
            }
        }, 200);
    }

    return {
        open: _open
    };
})();
