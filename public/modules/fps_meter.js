(function () {
    const STORAGE_KEY = '01v96_show_fps';

    let fpsMeterEl = null;
    let lastTimeFps = 0;
    let frameCountFps = 0;
    let rafId = null;
    let isRunning = false;

    function createElement() {
        const el = document.createElement('div');
        el.style.cssText = 'position:fixed;top:10px;right:10px;background:rgba(0,0,0,0.8);color:#0f0;padding:5px 10px;font-family:monospace;z-index:9999;border-radius:5px;pointer-events:none;display:none;';
        document.body.appendChild(el);
        return el;
    }

    function updateFPS() {
        if (!isRunning) return;
        const now = performance.now();
        frameCountFps++;
        if (now - lastTimeFps >= 1000) {
            fpsMeterEl.textContent = `FPS: ${frameCountFps}`;
            frameCountFps = 0;
            lastTimeFps = now;
        }
        rafId = requestAnimationFrame(updateFPS);
    }

    function startMeter() {
        if (isRunning) return;
        isRunning = true;
        lastTimeFps = performance.now();
        frameCountFps = 0;
        rafId = requestAnimationFrame(updateFPS);
    }

    function stopMeter() {
        isRunning = false;
        if (rafId) {
            cancelAnimationFrame(rafId);
            rafId = null;
        }
    }

    window.toggleFpsMeter = function (enabled) {
        try {
            localStorage.setItem(STORAGE_KEY, enabled ? 'true' : 'false');
        } catch (e) {}

        if (!fpsMeterEl) {
            fpsMeterEl = createElement();
        }

        if (enabled) {
            fpsMeterEl.style.display = '';
            startMeter();
        } else {
            fpsMeterEl.style.display = 'none';
            stopMeter();
        }
    };

    window.initFpsMeter = function () {
        if (!fpsMeterEl) {
            fpsMeterEl = createElement();
        }

        const showFps = localStorage.getItem(STORAGE_KEY) === 'true';
        const toggle = document.getElementById('toggleFpsMeter');
        if (toggle) {
            toggle.checked = showFps;
        }

        if (showFps) {
            fpsMeterEl.style.display = '';
            startMeter();
        } else {
            fpsMeterEl.style.display = 'none';
        }
    };
})();
