/**
 * MOD: FUZZY SEARCH ENGINE
 *
 * Algoritmo de busca fuzzy por subsequência de caracteres, palavra por palavra.
 * Cada palavra do query deve ter suas letras aparecendo em ordem
 * em pelo menos uma palavra do texto alvo.
 *
 * Ex: "pgd online" bate com "PAGODE ONLINE"
 *     porque p→g→d aparecem em ordem dentro de "PAGODE"
 *     e "online" bate diretamente.
 *
 * Exporta (globais):
 *   fuzzyMatch(query, text) → boolean
 *   createFuzzySearch({ container, targetEl, placeholder, inputId, onFilter }) → { input, destroy }
 */

/**
 * Normaliza string: lowercase + remove acentos.
 * @param {string} str
 * @returns {string}
 */
function normalizeStr(str) {
    return (str || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

/**
 * Função global do módulo para detectar se é tela de celular
 * @returns {boolean}
 */
function isPhoneSize() {
    return window.innerWidth <= 767 || window.innerHeight <= 500;
}

/**
 * Verifica se qWord é subsequência de nWord (caracteres em ordem).
 * Ex: "pgd" é subsequência de "pagode" → true
 * @param {string} qWord
 * @param {string} nWord
 * @returns {boolean}
 */
function isSubsequence(qWord, nWord) {
    let pos = 0;
    for (const ch of qWord) {
        const found = nWord.indexOf(ch, pos);
        if (found === -1) return false;
        pos = found + 1;
    }
    return true;
}

/**
 * Verifica se todas as palavras do query batem com pelo menos
 * uma palavra do texto alvo (por subsequência de caracteres).
 *
 * @param {string} query - Texto digitado pelo usuário
 * @param {string} text  - Texto a ser testado (nome da cena, canal, etc.)
 * @returns {boolean}
 */
function fuzzyMatch(query, text) {
    if (!query) return true;
    const qWords = normalizeStr(query).split(/\s+/).filter(Boolean);
    const tWords = normalizeStr(text).split(/\s+/).filter(Boolean);
    return qWords.every(qw => tWords.some(tw => isSubsequence(qw, tw)));
}

/**
 * Cria e insere uma caixa de busca fuzzy no DOM, conectada a um callback de filtro.
 * Reutilizável por qualquer modal que precise de busca.
 *
 * @param {Object}   options
 * @param {Element}  options.container   - Elemento pai onde o input será inserido
 * @param {Element}  options.targetEl    - Referência: o input é inserido antes deste elemento
 * @param {string}   [options.placeholder] - Placeholder do input
 * @param {string}   [options.inputId]   - ID do input (evita duplicação em reaberturas)
 * @param {function} options.onFilter    - Chamado a cada keystroke com a query atual
 * @returns {{ input: HTMLInputElement, destroy: function }}
 */
function createFuzzySearch({ container, targetEl, placeholder = '🔍  Buscar...', inputId, onFilter }) {
    // Reutiliza o input se o modal for reaberto (evita duplicação)
    let input = inputId ? document.getElementById(inputId) : null;

    if (!input) {
        input = document.createElement('input');
        if (inputId) input.id = inputId;
        input.type = 'text';
        input.autocomplete = 'off';

        if (!isPhoneSize()) {
            input.inputMode = 'none'; // Suppress native keyboard in tablet/desktop
        }
        input.style.cssText = [
            'width:100%',
            'box-sizing:border-box',
            'padding:10px 14px',
            'background:#1a1a1a',
            'border:1px solid #555',
            'border-radius:8px',
            'color:#fff',
            'font-size:14px',
            'outline:none',
            'flex-shrink:0',
            'transition:border-color 0.2s',
        ].join(';');

        input.addEventListener('focus', () => { input.style.borderColor = '#ffcc00'; });
        input.addEventListener('blur',  () => { input.style.borderColor = '#555'; });

        if (container && targetEl) {
            container.insertBefore(input, targetEl);
        }

        // Prevenir teclado nativo no Android (apenas se não for celular)
        input.addEventListener('touchstart', function(e) {
            if (!isPhoneSize()) {
                e.preventDefault();
                this.focus();
            }
        }, { passive: false });
    }

    input.placeholder = placeholder;
    input.value = '';

    // Remove listener anterior antes de adicionar novo (evita duplicação em reaberturas)
    const handler = () => onFilter(input.value.trim());
    input.removeEventListener('input', input._fuzzyHandler);
    input._fuzzyHandler = handler;
    input.addEventListener('input', handler);

    // Foca com leve delay para aguardar a animação do modal (mas evita no celular para não abrir teclado nativo na cara)
    if (!isPhoneSize() && !('ontouchstart' in window && navigator.maxTouchPoints > 0)) {
        setTimeout(() => input.focus(), 80);
    }

    function destroy() {
        input.removeEventListener('input', input._fuzzyHandler);
    }

    return { input, destroy };
}
