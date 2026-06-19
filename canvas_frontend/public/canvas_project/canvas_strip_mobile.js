import { interpolateFaderY, roundRect } from './canvas_strip_utils.js';

export const MOBILE_STRIP_WIDTH = 90;

export function drawMobileChannelStrip(ctx, channelIndex, x, y, width, height, state, meterValueDb, isMacro = false, isPeaking = false) {
    const isMaster = channelIndex === 52;
    const w = width - 4; // 4px gap between channels
    
    // 1. Calculate meter height
    let displayPct = Math.max(0, Math.min(100, meterValueDb));
    let meterPct = displayPct / 100;
    let meterBarHeight = height * meterPct;
    let meterTopY = y + height - meterBarHeight;

    // --- 1. Fundo do Canal ---
    ctx.fillStyle = '#1a1a1a'; // Dark grey background
    ctx.fillRect(x, y, w, height);

    // Meter Fill (acting as channel background)
    if (meterBarHeight > 0) {
        let grad = ctx.createLinearGradient(x, y, x, y + height);
        grad.addColorStop(0, '#ff0000'); 
        grad.addColorStop(0.14, '#ff0000'); 
        grad.addColorStop(0.15, '#ffff00'); 
        grad.addColorStop(0.4, '#ffff00');  
        grad.addColorStop(0.41, '#00ff00'); 
        grad.addColorStop(1, '#005500'); 
        
        ctx.fillStyle = grad;
        ctx.fillRect(x, meterTopY, w, meterBarHeight);
    }

    if (isPeaking) {
        ctx.strokeStyle = '#ff0000';
        ctx.lineWidth = 2;
        ctx.shadowColor = 'rgba(255, 0, 0, 0.8)';
        ctx.shadowBlur = 10;
        ctx.strokeRect(x + 1, y + 1, w - 2, height - 2);
        ctx.shadowBlur = 0;
    } else {
        ctx.strokeStyle = '#222';
        ctx.lineWidth = 1;
        ctx.strokeRect(x, y, w, height);
    }

    let currentY = y + 5;

    // 2. Title Box (CH + Name)
    const titleBoxH = 34;
    ctx.fillStyle = '#222222';
    roundRect(ctx, x + 4, currentY, w - 8, titleBoxH, 4);
    ctx.fill();
    
    let chTitle = `CH ${channelIndex + 1}`;
    if (isMaster) chTitle = "MASTER";
    if (isMacro) chTitle = "MACRO";
    
    ctx.fillStyle = '#aaaaaa';
    ctx.font = '9px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(chTitle, x + w / 2, currentY + 10);
    
    let dispName = state.name || "...";
    if (window.resolvedNames && window.resolvedNames[channelIndex]) {
        dispName = window.resolvedNames[channelIndex].name;
    }
    if (isMaster) dispName = "MASTER";
    
    ctx.fillStyle = '#00ff00';
    ctx.font = 'bold 11px Arial';
    ctx.fillText(dispName.substring(0, 8), x + w / 2, currentY + 24);

    currentY += titleBoxH + 5;

    // 3. SOLO Button
    const soloHeight = 26;
    if (state.solo) {
        ctx.fillStyle = '#00ff00'; // Green when active
        roundRect(ctx, x + 4, currentY, w - 8, soloHeight, 4);
        ctx.fill();
        ctx.fillStyle = '#ffffff';
    } else {
        ctx.fillStyle = '#333333';
        roundRect(ctx, x + 4, currentY, w - 8, soloHeight, 4);
        ctx.fill();
        ctx.strokeStyle = '#222';
        ctx.stroke();
        ctx.fillStyle = '#888888';
    }
    ctx.font = 'bold 11px Arial';
    ctx.fillText("SOLO", x + w / 2, currentY + soloHeight / 2);

    currentY += soloHeight + 5;

    // 4. ON Button
    const onHeight = 26;
    if (state.on) {
        ctx.fillStyle = '#ffcc00'; // ON Active
        roundRect(ctx, x + 4, currentY, w - 8, onHeight, 4);
        ctx.fill();
        ctx.fillStyle = '#000000';
    } else {
        ctx.fillStyle = '#333333'; // OFF
        roundRect(ctx, x + 4, currentY, w - 8, onHeight, 4);
        ctx.fill();
        ctx.strokeStyle = '#222';
        ctx.stroke();
        ctx.fillStyle = '#888888';
    }
    ctx.font = 'bold 12px Arial';
    ctx.fillText("ON", x + w / 2, currentY + onHeight / 2);

    currentY += onHeight + 10;

    // 5. "+" Nudge Button
    const circleRadius = 12;
    ctx.fillStyle = '#333333';
    ctx.beginPath();
    ctx.arc(x + w / 2, currentY + circleRadius, circleRadius, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#222';
    ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 16px Arial';
    ctx.fillText("+", x + w / 2, currentY + circleRadius + 1);

    currentY += 2 * circleRadius + 5;

    // Calculate bottom fixed elements
    let bottomY = y + height - 5;
    
    // dB text
    let dbStr = "-∞ dB";
    if (typeof window.rawToDb === 'function') {
        dbStr = window.rawToDb(state.value, false, isMaster) + " dB";
    }
    ctx.fillStyle = '#1e90ff'; // Light blue text
    ctx.font = 'bold 11px Arial';
    ctx.fillText(dbStr, x + w / 2, bottomY - 6);
    bottomY -= 15;
    
    // "-" Nudge Button
    bottomY -= 2 * circleRadius;
    const minusY = bottomY;
    ctx.fillStyle = '#333333';
    ctx.beginPath();
    ctx.arc(x + w / 2, minusY + circleRadius, circleRadius, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#222';
    ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 16px Arial';
    ctx.fillText("-", x + w / 2, minusY + circleRadius + 1);

    bottomY -= 10;
    
    // Fader Track
    const trackY = currentY;
    const trackHeight = bottomY - trackY;
    const trackX = x + w / 2 - 1.5;
    const trackW = 3;

    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(trackX, trackY, trackW, trackHeight);

    // Fader Thumb
    const knobY = interpolateFaderY(state.value, trackY, trackHeight);
    const knobW = 20;
    const knobH = 26;
    ctx.fillStyle = '#1e90ff';
    roundRect(ctx, x + w / 2 - knobW/2, knobY - knobH/2, knobW, knobH, 4);
    ctx.fill();
    
    // Inner thumb line
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(x + w / 2 - knobW/2 + 2, knobY - 1, knobW - 4, 2);
}
