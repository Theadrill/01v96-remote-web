import { interpolateFaderY, getChannelColor, roundRect } from './canvas_strip_utils.js';

export const DESKTOP_STRIP_WIDTH = 100;

export function drawDesktopChannelStrip(ctx, channelIndex, x, y, width, height, state, meterValueDb, isMacro = false, isPeaking = false) {
    const isMaster = channelIndex === 52;
    
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
        // Borda separadora
        ctx.strokeStyle = '#222';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x + width, y);
        ctx.lineTo(x + width, y + height);
        ctx.stroke();
    }

    let currentY = y;

    // 1. Header (Channel Title)
    let title = state.name || `CH ${channelIndex + 1}`;
    if (isMaster) title = "MASTER";
    if (isMacro) title = "MACRO";
    
    const headerHeight = 30;
    
    if (isMaster) {
        ctx.fillStyle = '#800000';
    } else if (channelIndex >= 16 && channelIndex <= 31) {
        ctx.fillStyle = '#005c3a'; // Greenish matching DOM layout
    } else {
        ctx.fillStyle = '#0055a5'; // Default Blue
    }
    
    ctx.fillRect(x, currentY, width - 1, headerHeight);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 12px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(title, x + width / 2, currentY + headerHeight / 2);
    
    currentY += headerHeight + 8;

    // 2. SOLO Button
    const soloHeight = 28;
    const btnPadding = 6;
    let hasAnySolo = false;
    if (isMaster && window.channelStates) {
        hasAnySolo = window.channelStates.some(s => s && s.solo);
    }

    if (state.solo && !isMaster) {
        ctx.fillStyle = '#ffb700'; // Active SOLO
        roundRect(ctx, x + btnPadding, currentY, width - 2 * btnPadding, soloHeight, 4);
        ctx.fill();
        ctx.fillStyle = '#000000';
    } else if (isMaster && hasAnySolo) {
        const time = performance.now();
        if (time % 1000 < 500) {
            ctx.fillStyle = '#c0000a'; 
            roundRect(ctx, x + btnPadding, currentY, width - 2 * btnPadding, soloHeight, 4);
            ctx.fill();
            ctx.shadowColor = 'rgba(220, 0, 10, 0.8)';
            ctx.shadowBlur = 10;
            ctx.fill();
            ctx.shadowBlur = 0;
            ctx.fillStyle = '#ffffff';
        } else {
            ctx.fillStyle = '#333333';
            roundRect(ctx, x + btnPadding, currentY, width - 2 * btnPadding, soloHeight, 4);
            ctx.fill();
            ctx.strokeStyle = '#444';
            ctx.stroke();
            ctx.fillStyle = '#555555';
        }
    } else {
        ctx.fillStyle = '#2a2a2a';
        roundRect(ctx, x + btnPadding, currentY, width - 2 * btnPadding, soloHeight, 4);
        ctx.fill();
        ctx.strokeStyle = '#444';
        ctx.stroke();
        ctx.fillStyle = '#888888';
    }
    ctx.font = 'bold 11px Arial';
    ctx.fillText("SOLO", x + width / 2, currentY + soloHeight / 2);

    currentY += soloHeight + 8;

    // 3. Name Label ("BUMB")
    const nameHeight = 28;
    ctx.fillStyle = '#000000';
    roundRect(ctx, x + btnPadding, currentY, width - 2 * btnPadding, nameHeight, 4);
    ctx.fill();
    ctx.fillStyle = '#00ff00';
    ctx.font = 'bold 11px Arial';
    
    let dispName = state.name || "...";
    if (window.resolvedNames && window.resolvedNames[channelIndex]) {
        dispName = window.resolvedNames[channelIndex].name;
    }
    if (isMaster) dispName = "MASTER";
    
    ctx.fillText(dispName.substring(0, 8), x + width / 2, currentY + nameHeight / 2);

    currentY += nameHeight + 8;

    // 4. ON Button
    const onHeight = 35;
    if (state.on) {
        ctx.fillStyle = '#ffcc00'; // ON Active
        roundRect(ctx, x + btnPadding, currentY, width - 2 * btnPadding, onHeight, 4);
        ctx.fill();
        ctx.fillStyle = '#000000';
    } else {
        ctx.fillStyle = '#2a2a2a'; // OFF
        roundRect(ctx, x + btnPadding, currentY, width - 2 * btnPadding, onHeight, 4);
        ctx.fill();
        ctx.strokeStyle = '#444';
        ctx.stroke();
        ctx.fillStyle = '#888888';
    }
    ctx.font = 'bold 14px Arial';
    ctx.fillText("ON", x + width / 2, currentY + onHeight / 2);

    currentY += onHeight + 12;

    // 5. "+" Nudge Button
    const circleRadius = 12;
    ctx.fillStyle = '#2a2a2a';
    ctx.beginPath();
    ctx.arc(x + width / 2, currentY + circleRadius, circleRadius, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#444';
    ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 16px Arial';
    ctx.fillText("+", x + width / 2, currentY + circleRadius + 1);

    currentY += 2 * circleRadius + 8;

    // 6. dB text
    let dbStr = "-∞";
    if (typeof window.rawToDb === 'function') {
        dbStr = window.rawToDb(state.value, false, isMaster);
    }
    ctx.fillStyle = '#5dade2'; // Light blue text
    ctx.font = 'bold 13px Arial';
    ctx.fillText(dbStr, x + width / 2, currentY + 6);

    currentY += 20;

    // Fixed elements from bottom to calculate Fader height
    let bottomY = y + height - 5;
    
    // Pan indicator
    const panHeight = 25;
    bottomY -= panHeight;
    const panY = bottomY;
    
    bottomY -= 8; // padding
    
    // "-" Nudge Button
    bottomY -= 2 * circleRadius;
    const minusY = bottomY;

    bottomY -= 15; // padding
    
    const trackY = currentY + 10;
    const trackHeight = bottomY - trackY;

    // 7. Fader Area (Scale, Track, Meter)
    const faderCenterX = x + width / 2 + 3; // shifted slightly right to make room for scale

    // Draw Scale
    const scaleX = x + 15;
    ctx.fillStyle = '#888888';
    ctx.font = '9px Arial';
    ctx.textAlign = 'right';
    
    const marks = isMaster ? [
        { d: 0, l: '0' }, { d: -5, l: '5' }, { d: -10, l: '10' },
        { d: -15, l: '15' }, { d: -20, l: '20' }, { d: -30, l: '30' },
        { d: -40, l: '40' }, { d: -50, l: '50' }, { d: -138, l: '-oo' }
    ] : [
        { d: 10, l: '+10' }, { d: 5, l: '5' }, { d: 0, l: '0' },
        { d: -5, l: '5' }, { d: -10, l: '10' }, { d: -15, l: '15' },
        { d: -20, l: '20' }, { d: -30, l: '30' }, { d: -40, l: '40' },
        { d: -50, l: '50' }, { d: -138, l: '-oo' }
    ];

    marks.forEach(m => {
        let raw = 0;
        if (typeof window.dbToRaw === 'function') {
            raw = window.dbToRaw(isMaster ? m.d + 10 : m.d);
            if (m.l === '-oo') raw = 0;
        } else {
            raw = (m.d + 138) / 148 * 1023; 
        }
        const markY = interpolateFaderY(raw, trackY, trackHeight);
        ctx.fillText(m.l, scaleX + 8, markY + 3);
        
        ctx.fillStyle = '#555555';
        ctx.fillRect(scaleX + 11, markY, 4, 1);
        ctx.fillStyle = '#888888';
    });

    // Fader Track Background
    const trackWidth = 8;
    const knobY = interpolateFaderY(state.value, trackY, trackHeight);
    
    // Top part (white/grey)
    ctx.fillStyle = '#ffffff';
    roundRect(ctx, faderCenterX - trackWidth/2, trackY, trackWidth, Math.max(knobY - trackY, 0), 4);
    ctx.fill();
    
    // Bottom part (blue)
    ctx.fillStyle = '#1e90ff'; // Dodger blue
    roundRect(ctx, faderCenterX - trackWidth/2, knobY, trackWidth, Math.max(trackY + trackHeight - knobY, 0), 4);
    ctx.fill();

    // Meter Background
    const meterX = x + width - 10;
    const meterW = 3;
    ctx.fillStyle = '#000000';
    ctx.fillRect(meterX, trackY, meterW, trackHeight);

    // Peak LED
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

    // Meter Fill
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

    // Fader Knob (Pill shape)
    const knobW = 16;
    const knobH = 30;
    ctx.fillStyle = '#1e90ff';
    roundRect(ctx, faderCenterX - knobW/2, knobY - knobH/2, knobW, knobH, 8);
    ctx.fill();
    // Inner white line
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(faderCenterX - knobW/2 + 2, knobY - 1, knobW - 4, 2);

    // 8. "-" Nudge Button
    ctx.fillStyle = '#2a2a2a';
    ctx.beginPath();
    ctx.arc(x + width / 2, minusY + circleRadius, circleRadius, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#444';
    ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 16px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText("-", x + width / 2, minusY + circleRadius + 1);

    // 9. Pan indicator
    ctx.font = '10px Arial';
    ctx.fillStyle = '#666666';
    ctx.textAlign = 'center';
    ctx.fillText("L", x + 18, panY + 12);
    ctx.fillText("R", x + width - 18, panY + 12);
    
    const panTrackX = x + 30;
    const panTrackW = width - 60;
    ctx.fillStyle = '#111';
    ctx.fillRect(panTrackX, panY + 10, panTrackW, 3);
    
    ctx.fillStyle = '#444';
    ctx.fillRect(x + width/2, panY + 7, 1, 9);

    let panVal = state.pan !== undefined ? state.pan : 0;
    let panPct = ((panVal + 63) / 126);
    let panThumbX = panTrackX + (panTrackW * panPct);
    
    ctx.fillStyle = panVal === 0 ? '#888' : '#5dade2';
    ctx.fillRect(panThumbX - 2, panY + 6, 4, 11);
}
