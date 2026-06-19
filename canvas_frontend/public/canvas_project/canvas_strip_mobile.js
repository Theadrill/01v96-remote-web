import { interpolateFaderY, getChannelColor } from './canvas_strip_utils.js';

export const MOBILE_STRIP_WIDTH = 90;

export function drawMobileChannelStrip(ctx, channelIndex, x, y, width, height, state, meterValueDb, isMacro = false, isPeaking = false) {
    // --- 1. Fundo do Canal ---
    ctx.fillStyle = getChannelColor(channelIndex);
    ctx.fillRect(x, y, width, height);
    
    if (isPeaking) {
        ctx.strokeStyle = '#ff0000';
        ctx.lineWidth = 2;
        ctx.shadowColor = 'rgba(255, 0, 0, 0.8)';
        ctx.shadowBlur = 15;
        ctx.strokeRect(x + 1, y + 1, width - 2, height - 2);
        ctx.shadowBlur = 0;
    } else {
        // Borda separadora normal
        ctx.strokeStyle = '#222';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x + width, y);
        ctx.lineTo(x + width, y + height);
        ctx.stroke();
    }

    // Geometria da trilha do fader
    const paddingY = 80;
    const trackHeight = height - paddingY - 50;
    const trackY = y + paddingY;
    const trackX = x + width/2 - 10;

    // --- 2. Track do Fader ---
    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(trackX, trackY, 6, trackHeight);

    // --- 3. Fader Knob (Botão) ---
    const knobY = interpolateFaderY(state.value, trackY, trackHeight);
    ctx.fillStyle = '#cccccc';
    const knobWidth = 36;
    const knobHeight = 40;
    ctx.fillRect(x + width/2 - knobWidth/2 - 7, knobY - knobHeight/2, knobWidth, knobHeight);
    ctx.fillStyle = '#000';
    ctx.fillRect(x + width/2 - knobWidth/2 - 7, knobY - 1, knobWidth, 2);

    // --- 4. Medidor de Pico (Meter) ---
    const meterX = x + width - 15;
    const meterW = 8;
    ctx.fillStyle = '#111';
    ctx.fillRect(meterX, trackY, meterW, trackHeight);
    
    let displayPct = Math.max(0, Math.min(100, meterValueDb));
    let meterPct = displayPct / 100;
    let meterBarHeight = trackHeight * meterPct;
    let meterTopY = trackY + trackHeight - meterBarHeight;

    if (meterBarHeight > 0) {
        let grad = ctx.createLinearGradient(meterX, trackY, meterX, trackY + trackHeight);
        grad.addColorStop(0, '#ff0000');
        grad.addColorStop(0.14, '#ff0000');
        grad.addColorStop(0.15, '#ffff00');
        grad.addColorStop(0.4, '#ffff00');
        grad.addColorStop(0.41, '#00ff00');
        grad.addColorStop(1, '#005500');
        
        ctx.fillStyle = grad;
        ctx.fillRect(meterX, meterTopY, meterW, meterBarHeight);
    }

    // Peak LED (Mobile)
    ctx.beginPath();
    ctx.arc(meterX + meterW/2, trackY - 8, 2.5, 0, Math.PI * 2);
    ctx.fillStyle = '#222';
    if (isPeaking) {
        ctx.fillStyle = '#ff0000';
        ctx.shadowColor = '#ff0000';
        ctx.shadowBlur = 4;
    }
    ctx.fill();
    ctx.shadowBlur = 0; // reset shadow

    // --- 5. Botões Visuais (ON e SOLO) ---
    const btnW = 30;
    const btnH = 20;
    ctx.fillStyle = state.on ? '#00ff00' : '#333';
    ctx.fillRect(x + width/2 - btnW - 5, y + 10, btnW, btnH);
    ctx.fillStyle = '#000';
    ctx.font = '10px Arial';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText("ON", x + width/2 - btnW + 2, y + 24);

    ctx.fillStyle = state.solo ? '#ffff00' : '#333';
    ctx.fillRect(x + width/2 + 5, y + 10, btnW, btnH);
    ctx.fillStyle = '#000';
    ctx.fillText("SOLO", x + width/2 + 6, y + 24);

    // --- 6. Caixas de Texto (Nome do Canal) ---
    ctx.fillStyle = '#fff';
    ctx.font = '12px Arial';
    ctx.textAlign = 'center';
    
    let label = state.name || `CH ${channelIndex + 1}`;
    if (channelIndex === 52) label = "MASTER";
    if (isMacro) label = "MACRO FADER";
    
    ctx.fillText(label, x + width/2, y + height - 20);
}
