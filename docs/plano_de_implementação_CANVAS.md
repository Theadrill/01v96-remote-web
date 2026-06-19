# Canvas Channel Strip Feature Implementation Plan

> **For Claude / AI Agents:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Create a reusable "Canvas Channel Strip" to render faders and meters on an HTML5 `<canvas>` using `requestAnimationFrame` and WASM output, achieving 60fps.

**Architecture:** We will bifurcate the frontend by creating `canvas_frontend/public` and copying all existing `public` assets there. We will add a feature flag `useCanvas: false` in `config.json` and a toggle in the UI. Inside the new frontend, we build three core files in `canvas_project/`: `canvas_engine.js` (main loop), `canvas_strip.js` (drawing logic), and `canvas_events.js` (interactivity and math).

**Tech Stack:** Vanilla JS, HTML5 Canvas, WebAssembly (WASM), Pointer Events.

---

### Task 1: Create Canvas Frontend Bifurcation & Feature Flag

**Files:**
- Modify: `c:\PROJETOS\01v96-remote-web\config.json`
- Create: `c:\PROJETOS\01v96-remote-web\canvas_frontend\public\` (Directory)
- Modify: `c:\PROJETOS\01v96-remote-web\public\index.html` (or equivalent routing/config UI to add toggle)

**Step 1: Update config.json**

```json
{
  "useCanvas": false,
  ... // keep existing keys
}
```

**Step 2: Bifurcate Frontend**

Run: `cp -r c:\PROJETOS\01v96-remote-web\public c:\PROJETOS\01v96-remote-web\canvas_frontend\public`
Expected: Folder is cloned.

---

### Task 2: Create Canvas Engine (`canvas_engine.js`)

**Files:**
- Create: `c:\PROJETOS\01v96-remote-web\canvas_frontend\public\canvas_project\canvas_engine.js`

**Step 1: Write minimal implementation**

```javascript
/**
 * Inicializa e gerencia o loop de requestAnimationFrame do Canvas.
 * Responsável por obter o array Float32Array do WASM (MeterEngine).
 */
export function initCanvas(containerId, meterEngine) {
    const container = document.getElementById(containerId);
    container.style.overflowX = 'auto'; // scroll nativo

    const canvas = document.createElement('canvas');
    container.appendChild(canvas);
    const ctx = canvas.getContext('2d', { alpha: false }); // Otimização de performance

    let lastTime = performance.now();

    function loop(timestamp) {
        const delta = timestamp - lastTime;
        lastTime = timestamp;

        // 1. Limpa o canvas
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // 2. Extrai picos do WASM
        const meterValues = meterEngine.render_frame(delta);

        // 3. TODO: iterar pelos canais e chamar drawChannelStrip(ctx, ...)

        requestAnimationFrame(loop);
    }

    requestAnimationFrame(loop);
    return { canvas, ctx };
}
```

**Step 2: Commit**

```bash
git add canvas_frontend/public/canvas_project/canvas_engine.js
git commit -m "feat: canvas engine loop and WASM integration"
```

---

### Task 3: Create Render Engine (`canvas_strip.js`)

**Files:**
- Create: `c:\PROJETOS\01v96-remote-web\canvas_frontend\public\canvas_project\canvas_strip.js`

**Step 1: Write minimal implementation**

```javascript
/**
 * Desenha um channel strip único na tela.
 * Regras: Cores dinâmicas, Fader Y via interpolação, Meters via WASM float array.
 */
export function drawChannelStrip(ctx, channelIndex, x, y, width, height, state, meterValue) {
    // 1. Fundo do Canal
    ctx.fillStyle = getChannelColor(channelIndex);
    ctx.fillRect(x, y, width, height);

    // 2. Track do Fader
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(x + width/2 - 5, y + 50, 10, height - 100);

    // 3. Fader Knob (Interpolação de dbToRaw / steps.json)
    const knobY = interpolateFaderY(state.value, y + 50, height - 100);
    ctx.fillStyle = '#cccccc';
    ctx.fillRect(x + width/2 - 20, knobY, 40, 20);

    // 4. Medidor de Pico (MeterValue do WASM)
    // Calcula a altura baseado no meterValue
    drawMeter(ctx, x + width - 15, y + 50, 10, height - 100, meterValue);

    // 5. Botões ON e SOLO
    drawButton(ctx, "ON", x + 5, y + 10, state.on ? '#00ff00' : '#444');
    drawButton(ctx, "SOLO", x + 35, y + 10, state.solo ? '#ffff00' : '#444');

    // 6. Nome
    ctx.fillStyle = '#fff';
    ctx.fillText(`CH ${channelIndex + 1}`, x + 5, y + height - 20);
}

function getChannelColor(index) {
    if (index >= 0 && index <= 15) return '#001f3f'; // Azul
    if (index >= 16 && index <= 31) return '#013220'; // Verde
    if (index === 52) return '#8b0000'; // Master: Vermelho
    return '#8b8000'; // Aux/Bus: Amarelo
}

function drawMeter(ctx, mx, my, mw, mh, peakDb) {
    // Lógica para colorir verde/amarelo/vermelho com base no DB
}

function interpolateFaderY(rawValue, startY, trackHeight) {
    // Matemática do steps.json para posicionar o fader
    return startY + trackHeight; // placeholder
}

function drawButton(ctx, label, bx, by, color) {
    ctx.fillStyle = color;
    ctx.fillRect(bx, by, 25, 15);
    ctx.fillStyle = '#000';
    ctx.fillText(label, bx + 2, by + 10);
}
```

**Step 2: Commit**

```bash
git add canvas_frontend/public/canvas_project/canvas_strip.js
git commit -m "feat: canvas strip rendering math and UI"
```

---

### Task 4: Create Interactivity Engine (`canvas_events.js`)

**Files:**
- Create: `c:\PROJETOS\01v96-remote-web\canvas_frontend\public\canvas_project\canvas_events.js`

**Step 1: Write minimal implementation**

```javascript
/**
 * Gerencia os eventos de pointerdown/move/up.
 * Traduz toques no canvas para lógica de fader e detecta colisões.
 */
export function setupCanvasEvents(canvas, channelStates, stripWidth) {
    const activeTouches = new Map();

    canvas.addEventListener('pointerdown', (e) => {
        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        
        const channelIndex = Math.floor(x / stripWidth);
        const state = channelStates[channelIndex];

        // Lógica de colisão para botão ON/SOLO
        if (isHitOnButton(x, y, channelIndex, stripWidth)) {
            // Emite evento para toggle ON
            return;
        }

        activeTouches.set(e.pointerId, { channelIndex, startY: y });
        canvas.setPointerCapture(e.pointerId);
    });

    canvas.addEventListener('pointermove', (e) => {
        if (!activeTouches.has(e.pointerId)) return;
        
        const touchInfo = activeTouches.get(e.pointerId);
        const rect = canvas.getBoundingClientRect();
        const y = e.clientY - rect.top;

        // Atualizar estado e emitir websocket socket.emit('...', ...)
        updateFaderLogic(touchInfo.channelIndex, y);
    });

    canvas.addEventListener('pointerup', (e) => {
        activeTouches.delete(e.pointerId);
        canvas.releasePointerCapture(e.pointerId);
    });
}

function isHitOnButton(x, y, channelIndex, width) {
    // Math to detect hit
    return false;
}

function updateFaderLogic(ch, newY) {
    // Interpola Y para dbRaw e envia
}
```

**Step 2: Commit**

```bash
git add canvas_frontend/public/canvas_project/canvas_events.js
git commit -m "feat: canvas interactivity pointer events and collision"
```

---

## Execution Handoff

Plan complete and saved. Execute this by deploying agents for each task.
