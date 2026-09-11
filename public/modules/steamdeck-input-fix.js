// SteamDeckInputFix — Corrige duplicação do teclado virtual da Valve no Steam Deck (SteamOS)
// Bug: em inputs type!=password o Deck envia cada caractere duplicado (aa/oo) ou 2 inputs idênticos <30ms.
// Este wrapper roda globalmente, só ativa em Linux e só corrige quando tem certeza do bug.
// - Se data === "aa" (1 evento com 2 chars iguais) → corrige para "a" (beforeinput + preventDefault)
// - Se 2 eventos "a" em <35ms na mesma posição → bloqueia o 2º
// - Autocomplete/palavra inteira (data variada / length>2), isComposing e type=password → deixa passar
// - Auto-ativação: em UA de Deck ativa na hora; em Linux genérico só após 2 duplicações em 3s (evita afetar Ubuntu/Fedora)
// - Opt-out: localStorage.setItem('steamdeck_input_fix','off') desativa
(function () {
    'use strict';
    try {
        if (localStorage.getItem('steamdeck_input_fix') === 'off') return;
    } catch (e) {}

    var ua = (navigator.userAgent || '').toLowerCase();
    var platform = (navigator.platform || '').toLowerCase();
    // navigator.userAgentData (Chromium) — melhor sinal em Deck
    var uaDataPlatform = '';
    try { uaDataPlatform = (navigator.userAgentData && navigator.userAgentData.platform || '').toLowerCase(); } catch (e) {}
    var isLinux = /linux/.test(platform) || /linux/.test(ua);
    if (!isLinux) return;

    var isDeckUA = /steam/.test(ua) || /valve/.test(ua) || /steam deck/.test(ua) || /steam deck/.test(uaDataPlatform);

    var forceEnabled = isDeckUA; // Deck → liga direto
    var observing = !forceEnabled;
    var duplicateCount = 0;
    var lastDupeTime = 0;
    var OBSERVE_THRESHOLD = 2;
    var OBSERVE_WINDOW_MS = 3000;
    var RAPID_THRESHOLD_MS = 32; // bug ~5-15ms; hold de tecla ~30-50ms → 32 evita bloquear hold

    var lastInput = { ch: null, time: 0, target: null };
    var pendingOld = new WeakMap(); // el -> {value, start, end}

    function isPassword(el) {
        return !!el && el.tagName === 'INPUT' && el.type === 'password';
    }
    function shouldIgnore(el) {
        if (!el) return true;
        if (isPassword(el)) return true;
        if (el.readOnly || el.disabled) return true;
        var tag = el.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || el.isContentEditable) return false;
        return true; // ignora divs, etc
    }

    function registerDupeHit(now) {
        if (now - lastDupeTime > OBSERVE_WINDOW_MS) duplicateCount = 0;
        duplicateCount += 1;
        lastDupeTime = now;
        if (duplicateCount >= OBSERVE_THRESHOLD && !forceEnabled) {
            forceEnabled = true;
            console.info('[SteamDeckFix] Ativado após detectar duplicação repetida (observação). isDeckUA=' + isDeckUA);
        }
        return forceEnabled || duplicateCount > 0;
    }

    function isAllSame(s) {
        if (!s || s.length < 2) return false;
        var c0 = s[0];
        for (var i = 1; i < s.length; i++) if (s[i] !== c0) return false;
        return true;
    }

    document.addEventListener('beforeinput', function (e) {
        var el = e.target;
        if (shouldIgnore(el)) return;
        if (e.isComposing) return;

        if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
            pendingOld.set(el, { value: el.value, start: el.selectionStart, end: el.selectionEnd });
        } else if (el.isContentEditable) {
            try { pendingOld.set(el, { value: el.innerText, start: 0, end: 0 }); } catch (err) {}
        }

        var inputType = e.inputType;
        // só tratamos inserção de texto simples; paste/replacement/history etc deixam passar
        if (inputType !== 'insertText' && inputType !== 'insertCompositionText') return;
        var data = e.data;
        if (data == null) return;

        // Autocomplete / predição / paste que caiu como insertText mas com palavra inteira:
        // Deixa passar se length>2 e chars variados (ex: "House", "typescript")
        if (data.length > 2) {
            if (!isAllSame(data)) return; // palavra variada → autocomplete → ignora
            // se length>2 e tudo igual ("aaa") é anomalia, mas tratamos só o caso "aa"
            if (data.length !== 2) return;
        }
        // também deixa passar se length>3 geral (reduz falso positivo)
        if (data.length > 3 && !isAllSame(data)) return;

        var now = Date.now();
        var isDupePair = data.length === 2 && data[0] === data[1]; // "aa" num único evento — assinatura do bug
        var isSingle = data.length === 1;

        if (isDupePair) {
            var shouldFix = forceEnabled ? true : registerDupeHit(now);
            if (!shouldFix) return;
            // corrige: insere só 1 char e bloqueia o original
            e.preventDefault();
            var single = data[0];
            if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
                var start = el.selectionStart != null ? el.selectionStart : el.value.length;
                var end = el.selectionEnd != null ? el.selectionEnd : start;
                var before = el.value.slice(0, start);
                var after = el.value.slice(end);
                var maxLen = el.maxLength > 0 ? el.maxLength : Infinity;
                if ((before + single + after).length <= maxLen) {
                    el.value = before + single + after;
                    var np = start + 1;
                    try { el.selectionStart = el.selectionEnd = np; } catch (err) {}
                    el.dispatchEvent(new Event('input', { bubbles: true }));
                    el.dispatchEvent(new Event('change', { bubbles: true }));
                }
            } else if (el.isContentEditable) {
                try { document.execCommand('insertText', false, single); } catch (err) {}
            }
            lastInput = { ch: single, time: now, target: el };
            return;
        }

        if (isSingle) {
            // segundo evento idêntico ultra-rápido (Deck disparou 2 inputs de "a")
            if (lastInput.target === el && lastInput.ch === data && (now - lastInput.time) < RAPID_THRESHOLD_MS) {
                var enabled = forceEnabled || duplicateCount >= OBSERVE_THRESHOLD;
                if (!enabled) {
                    // em observação conta como hit e já bloqueia este 2º repetido
                    registerDupeHit(now);
                    enabled = true; // bloqueia mesmo no primeiro hit observado
                }
                if (enabled) {
                    e.preventDefault();
                    return;
                }
            }
            lastInput = { ch: data, time: now, target: el };
        }
    }, true);

    // Fallback pós-input caso o beforeinput não tenha conseguido prevenir (ex: browser sem beforeinput)
    document.addEventListener('input', function (e) {
        var el = e.target;
        if (shouldIgnore(el)) return;
        if (e.isComposing) return;
        if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) return;
        var old = pendingOld.get(el);
        if (!old) return;
        var newVal = el.value;
        var oldVal = old.value;
        if (newVal.length === oldVal.length + 1) return; // inserção normal
        if (newVal.length === oldVal.length + 2) {
            var start = old.start != null ? old.start : 0;
            var inserted = newVal.slice(start, start + 2);
            if (inserted.length === 2 && inserted[0] === inserted[1]) {
                // possível bug que escapou
                var now = Date.now();
                var isRapid = lastInput.target === el && lastInput.ch === inserted[0] && (now - lastInput.time) < 120;
                if (!forceEnabled && (isRapid || inserted[0] === inserted[1])) {
                    registerDupeHit(now);
                }
                if (forceEnabled || duplicateCount > 0) {
                    var corrected = oldVal.slice(0, start) + inserted[0] + newVal.slice(start + 2);
                    el.value = corrected;
                    try { el.selectionStart = el.selectionEnd = start + 1; } catch (err) {}
                    lastInput = { ch: inserted[0], time: now, target: el };
                }
            }
        }
    }, true);

    window.SteamDeckInputFix = {
        enable: function () { forceEnabled = true; duplicateCount = 99; try { localStorage.removeItem('steamdeck_input_fix'); } catch (err) {} },
        disable: function () { forceEnabled = false; duplicateCount = 0; try { localStorage.setItem('steamdeck_input_fix', 'off'); } catch (err) {} },
        get state() { return { isLinux: isLinux, isDeckUA: isDeckUA, forceEnabled: forceEnabled, observing: observing, duplicateCount: duplicateCount, lastInput: lastInput }; }
    };

    console.info('[SteamDeckFix] carregado. isLinux=' + isLinux + ' isDeckUA=' + isDeckUA + ' enabled=' + forceEnabled + ' observing=' + observing);
})();
