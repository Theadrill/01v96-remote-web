// Função genérica para habilitar rolagem por arrasto e roda do mouse
function enableDragScroll(el) {
    if (!el) return;

    let isDragging = false;
    let startX, startScrollLeft;

    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    
    // Mouse Wheel
    el.addEventListener('wheel', (evt) => {
        if (evt.deltaY !== 0) {
            if (!isMobile) evt.preventDefault();
            el.scrollLeft += evt.deltaY * 1.0;
        }
    }, { passive: isMobile });

    // Drag to scroll
    el.addEventListener('mousedown', (e) => {
        if (['INPUT', 'BUTTON', 'SELECT'].includes(e.target.tagName)) return;
        if (window.isCanvasFaderDragging) return; // Prevent horizontal scroll if dragging a fader in canvas
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
