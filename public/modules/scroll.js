// Rolagem horizontal com a roda do mouse otimizada
container.addEventListener('wheel', (evt) => {
    if (evt.deltaY !== 0) {
        evt.preventDefault();
        // Aumentando a velocidade para eliminar a sensação de peso
        container.scrollLeft += evt.deltaY * 3.5; 
    }
}, { passive: false });

// Arrastar com o mouse (Click & Drag)
let isDragging = false;
let startX, startScrollLeft;

container.addEventListener('mousedown', (e) => {
    if (['INPUT', 'BUTTON', 'SELECT'].includes(e.target.tagName)) return;
    
    isDragging = true;
    container.style.cursor = 'grabbing';
    startX = e.pageX - container.offsetLeft;
    startScrollLeft = container.scrollLeft;
});

container.addEventListener('mouseleave', () => {
    isDragging = false;
    container.style.cursor = '';
});

container.addEventListener('mouseup', () => {
    isDragging = false;
    container.style.cursor = '';
});

container.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    e.preventDefault();
    const x = e.pageX - container.offsetLeft;
    const walk = (x - startX) * 1.5; 
    container.scrollLeft = startScrollLeft - walk;
});
