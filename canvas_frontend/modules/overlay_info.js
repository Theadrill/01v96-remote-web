/**
 * MOD: OVERLAY INFO
 *
 * Componente reutilizável de overlay de informações flutuante.
 * Substitui o syncShield antigo e pode ser usado para:
 * - Sincronizando... (spinner verde)
 * - Salvou com sucesso (check verde)
 * - Erro ao salvar (X vermelho)
 * - Informação geral (azul)
 */

const OverlayInfo = (() => {
    let timeoutId = null;
    let activeType = null;

    const TYPES = {
        sync: {
            icon: '<div class="overlay-loader"></div>',
            borderColor: '#0f0',
            textColor: '#0f0',
        },
        success: {
            icon: '<span style="font-size:18px;">&#10003;</span>',
            borderColor: '#28a745',
            textColor: '#28a745',
            autoHide: 3000,
        },
        error: {
            icon: '<span style="font-size:18px;">&#10007;</span>',
            borderColor: '#dc3545',
            textColor: '#dc3545',
            autoHide: 5000,
        },
        info: {
            icon: '<span style="font-size:16px;">&#8505;</span>',
            borderColor: '#17a2b8',
            textColor: '#17a2b8',
            autoHide: 3000,
        },
    };

    function getOrCreateEl() {
        let el = document.getElementById('overlayInfo');
        if (!el) {
            el = document.createElement('div');
            el.id = 'overlayInfo';
            document.body.appendChild(el);
        }
        el.style.position = 'fixed';
        el.style.top = '25px';
        el.style.left = '50%';
        el.style.transform = 'translateX(-50%)';
        el.style.zIndex = '10002';
        el.style.pointerEvents = 'none';
        el.style.alignItems = 'center';
        el.style.gap = '12px';
        el.style.borderRadius = '8px';
        el.style.padding = '10px 20px';
        el.style.background = '#000';
        el.style.fontWeight = 'bold';
        el.style.fontSize = '13px';
        el.style.letterSpacing = '1px';
        return el;
    }

    function show(type, message, options) {
        const el = getOrCreateEl();
        const config = TYPES[type] || TYPES.info;

        if (timeoutId) {
            clearTimeout(timeoutId);
            timeoutId = null;
        }

        el.innerHTML = config.icon + '<span>' + message + '</span>';
        el.style.borderColor = config.borderColor;
        el.style.color = config.textColor;
        el.style.display = 'flex';

        activeType = type;

        const delay = (options && options.duration) || config.autoHide;
        if (type !== 'sync' && delay) {
            timeoutId = setTimeout(hide, delay);
        }
    }

    function hide() {
        const el = document.getElementById('overlayInfo');
        if (el) {
            el.style.display = 'none';
        }
        activeType = null;
        if (timeoutId) {
            clearTimeout(timeoutId);
            timeoutId = null;
        }
    }

    function isActive() {
        return activeType !== null;
    }

    function getActiveType() {
        return activeType;
    }

    return { show, hide, isActive, getActiveType };
})();
