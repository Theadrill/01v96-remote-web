(function () {
  let overlayEl = null;
  let autoDismissTimer = null;

  function closeOnOutsideClick(e) {
    if (overlayEl && !overlayEl.contains(e.target)) {
      hide();
    }
  }

  function show({ targetEl, message, duration }) {
    console.log('[BubbleModal] show chamado:', { targetEl, message, duration });
    // Se já existir uma bubble visível, remove imediatamente antes de criar a nova
    if (overlayEl) {
      if (autoDismissTimer) clearTimeout(autoDismissTimer);
      if (overlayEl.parentNode) overlayEl.parentNode.removeChild(overlayEl);
      overlayEl = null;
      removeGlobalListener();
    }

    const rect = targetEl.getBoundingClientRect();
    const overlay = document.createElement('div');
    overlay.className = 'bubble-modal-overlay';
    overlay.style.position = 'fixed';
    overlay.style.opacity = '0';
    overlay.style.transition = 'opacity 200ms ease-in-out';
    overlay.style.zIndex = '999999';
    
    const container = document.createElement('div');
    container.classList.add('bubble-container');
    container.innerHTML = message;

    const bubbleArrow = document.createElement('span');
    bubbleArrow.className = 'bubble-arrow';
    container.appendChild(bubbleArrow);

    overlay.appendChild(container);
    document.body.appendChild(overlay);
    overlayEl = overlay;
    currentBubble = true;

    // Estilos dinâmicos oriundos dos tokens do tema YAML (public/themes/default.yaml -> bubble_modal)
    const computed = window.getComputedStyle(document.documentElement);
    const getCssVar = (name, fallback) => computed.getPropertyValue(name).trim() || fallback;

    overlay.style.backgroundColor = getCssVar('--bm-bg', '#1e293b');
    overlay.style.color = getCssVar('--bm-text', '#f8fafc');
    overlay.style.border = `1px solid ${getCssVar('--bm-border', '#3b82f6')}`;
    overlay.style.borderRadius = getCssVar('--bm-radius', '8px');
    overlay.style.padding = getCssVar('--bm-padding', '8px 12px');
    overlay.style.fontSize = getCssVar('--bm-font-size', '12px');
    overlay.style.boxShadow = getCssVar('--bm-shadow', '0 10px 25px -5px rgba(0, 0, 0, 0.5)');
    overlay.style.zIndex = getCssVar('--bm-z-index', '999999');
    overlay.style.pointerEvents = 'none';

    // Position bubble just above target element
    let yPos = rect.top - 45;
    if (yPos < 10) yPos = rect.bottom + 10;

    overlay.style.left = `${Math.max(10, rect.left)}px`;
    overlay.style.top = `${yPos}px`;
    overlay.style.opacity = '1';

    // Add fade-in class to trigger transition
    requestAnimationFrame(() => {
      overlay.classList.add('fade-in');
    });

    const effectiveDuration = duration || parseInt(getCssVar('--bm-duration', '5000'), 10);

    if (effectiveDuration && effectiveDuration > 0) {
      if (autoDismissTimer) clearTimeout(autoDismissTimer);
      autoDismissTimer = setTimeout(hide, effectiveDuration);
    }

    addGlobalListener(targetEl);
  }

  function hide() {
    if (!overlayEl) return;
    if (autoDismissTimer) clearTimeout(autoDismissTimer);
    autoDismissTimer = null;

    overlayEl.classList.remove('fade-in');
    overlayEl.classList.add('fade-out');

    setTimeout(() => {
      if (overlayEl && overlayEl.parentNode) {
        overlayEl.parentNode.removeChild(overlayEl);
      }
      overlayEl = null;
      removeGlobalListener();
    }, 200);
  }

  function addGlobalListener(targetEl) {
    document.removeEventListener('click', closeOnOutsideClick);
    setTimeout(() => {
      document.addEventListener('click', closeOnOutsideClick);
    }, 100);
  }

  function removeGlobalListener() {
    document.removeEventListener('click', closeOnOutsideClick);
  }

  // Expose global BubbleModal object
  window.BubbleModal = {
    show: show,
    hide: hide
  };
})();