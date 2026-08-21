// VirtualKeyboard — Componente reutilizável de teclado virtual
// Uso: VirtualKeyboard.create(targetInputId) → HTMLElement

var VirtualKeyboard = (function () {
    'use strict';

    var _keyLayout = [
        ['1','2','3','4','5','6','7','8','9','0'],
        ['Q','W','E','R','T','Y','U','I','O','P'],
        ['A','S','D','F','G','H','J','K','L'],
        ['Z','X','C','V','B','N','M']
    ];

    // ─── DOM helper ─────────────────────────────────────────────

    function _el(tag, attrs, text) {
        var e = document.createElement(tag);
        if (attrs) {
            Object.keys(attrs).forEach(function (k) {
                if (k === 'className') {
                    e.className = attrs[k];
                } else {
                    e.setAttribute(k, attrs[k]);
                }
            });
        }
        if (text) e.textContent = text;
        return e;
    }

    // ─── Input helpers ──────────────────────────────────────────

    function _typeChar(targetId, char) {
        var input = document.getElementById(targetId);
        if (!input) return;
        if (input.maxLength && input.maxLength > 0 && input.value.length >= input.maxLength) return;

        var start = input.selectionStart || input.value.length;
        var end = input.selectionEnd || input.value.length;
        input.value = input.value.substring(0, start) + char + input.value.substring(end);
        input.selectionStart = input.selectionEnd = start + 1;
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.focus();
    }

    function _backspace(targetId) {
        var input = document.getElementById(targetId);
        if (!input) return;
        var start = input.selectionStart || input.value.length;
        var end = input.selectionEnd || input.value.length;

        if (start === end && start > 0) {
            input.value = input.value.substring(0, start - 1) + input.value.substring(end);
            input.selectionStart = input.selectionEnd = start - 1;
        } else if (start !== end) {
            input.value = input.value.substring(0, start) + input.value.substring(end);
            input.selectionStart = input.selectionEnd = start;
        }

        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.focus();
    }

    // ─── Backspace repeat ───────────────────────────────────────

    function _startBackspaceRepeat(targetId, e) {
        if (e && e.type === 'touchstart') e.preventDefault();
        _backspace(targetId);

        var timer = setTimeout(function () {
            var interval = setInterval(function () {
                _backspace(targetId);
            }, 80);
            e.target._vkInterval = interval;
        }, 400);

        e.target._vkTimer = timer;
    }

    function _stopBackspaceRepeat(e) {
        if (e.target._vkTimer) {
            clearTimeout(e.target._vkTimer);
            e.target._vkTimer = null;
        }
        if (e.target._vkInterval) {
            clearInterval(e.target._vkInterval);
            e.target._vkInterval = null;
        }
    }

    // ─── Criar teclado ──────────────────────────────────────────

    function _create(targetId) {
        var keyboard = _el('div', { className: 'virtual-keyboard-container' });

        _keyLayout.forEach(function (row) {
            var rowEl = _el('div', { className: 'virtual-keyboard-row' });
            row.forEach(function (key) {
                var btn = _el('button', {
                    className: 'virtual-keyboard-btn',
                    type: 'button'
                }, key);
                btn.addEventListener('click', function () {
                    _typeChar(targetId, key);
                });
                rowEl.appendChild(btn);
            });

            // Backspace na última linha
            if (row === _keyLayout[_keyLayout.length - 1]) {
                var bsBtn = _el('button', {
                    className: 'virtual-keyboard-btn virtual-keyboard-backspace',
                    type: 'button'
                }, '\u232B');
                bsBtn.addEventListener('mousedown', function (e) {
                    _startBackspaceRepeat(targetId, e);
                });
                bsBtn.addEventListener('mouseup', _stopBackspaceRepeat);
                bsBtn.addEventListener('mouseleave', _stopBackspaceRepeat);
                bsBtn.addEventListener('touchstart', function (e) {
                    _startBackspaceRepeat(targetId, e);
                }, { passive: false });
                bsBtn.addEventListener('touchend', _stopBackspaceRepeat);
                bsBtn.addEventListener('touchcancel', _stopBackspaceRepeat);
                rowEl.appendChild(bsBtn);
            }

            keyboard.appendChild(rowEl);
        });

        // Barra de espaço
        var spaceRow = _el('div', { className: 'virtual-keyboard-row' });
        var spaceBtn = _el('button', {
            className: 'virtual-keyboard-btn virtual-keyboard-space',
            type: 'button'
        }, 'ESPAÇO');
        spaceBtn.addEventListener('click', function () {
            _typeChar(targetId, ' ');
        });
        spaceRow.appendChild(spaceBtn);
        keyboard.appendChild(spaceRow);

        return keyboard;
    }

    // ─── API pública ────────────────────────────────────────────

    return {
        create: _create
    };
})();
