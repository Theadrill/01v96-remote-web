// Função genérica para habilitar rolagem por arrasto e roda do mouse
function enableDragScroll(el) {
    if (!el) return;

    let isDragging = false;
    let startX, startScrollLeft;

    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    
    // Mouse Wheel (ignora se estiver sobre um fader ou pan)
    el.addEventListener('wheel', (evt) => {
        if (evt.target.closest('.desk-fader-track-area, .mobile-fader-track-area, .desk-fader-core, .mobile-fader-core, .desk-pan-container, .desk-dual-pan-container, .desk-pan-track, input[type="range"]')) {
            return;
        }
        if (evt.deltaY !== 0) {
            if (!isMobile) evt.preventDefault();
            el.scrollLeft += evt.deltaY * 1.0;
        }
    }, { passive: isMobile });

    // Drag to scroll (ignora se o clique for em controles interativos ou faders/pans)
    el.addEventListener('mousedown', (e) => {
        if (['INPUT', 'BUTTON', 'SELECT'].includes(e.target.tagName)) return;
        if (e.target.closest('.desk-fader-thumb, .mobile-fader-thumb, .desk-fader-rail, .desk-fader-track-area, .mobile-fader-track-area, .mobile-fader-groove, .desk-pan-track, .desk-pan-thumb, .desk-pan-container, .desk-dual-pan-container, .desk-nudge-btn, .mobile-nudge-btn, .btn-nudge-desk, .btn-nudge, .btn-state, .desk-btn-on, .mobile-btn-on, .desk-btn-solo, .mobile-btn-solo, .btn-pre-post, .mobile-btn-pre')) return;
        isDragging = true;
        el.style.cursor = 'grabbing';
        startX = e.pageX - el.offsetLeft;
        startScrollLeft = el.scrollLeft;
    });

    const stopDragging = () => {
        isDragging = false;
        el.style.cursor = '';
    };

    el.addEventListener('mouseleave', stopDragging);
    el.addEventListener('mouseup', stopDragging);

    el.addEventListener('mousemove', (e) => {
        if (!isDragging) return;
        e.preventDefault();
        const x = e.pageX - el.offsetLeft;
        const walk = (x - startX) * 1.0;
        el.scrollLeft = startScrollLeft - walk;
    });
}

// Inicializa no container principal (faders)
enableDragScroll(container);

// Exporta para ser usado dinamicamente em modais se necessário
window.enableDragScroll = enableDragScroll;
