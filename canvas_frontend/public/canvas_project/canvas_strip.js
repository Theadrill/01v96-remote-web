import { drawDesktopChannelStrip, DESKTOP_STRIP_WIDTH } from './canvas_strip_desktop.js';
import { drawMobileChannelStrip, MOBILE_STRIP_WIDTH } from './canvas_strip_mobile.js';

export function getStripWidth() {
    const mode = typeof window !== 'undefined' && window.layoutMode ? window.layoutMode : 'desktop';
    return mode === 'desktop' ? DESKTOP_STRIP_WIDTH : MOBILE_STRIP_WIDTH;
}

export function drawChannelStrip(ctx, channelIndex, x, y, width, height, state, meterValueDb, isMacro = false, isPeaking = false) {
    const mode = typeof window !== 'undefined' && window.layoutMode ? window.layoutMode : 'desktop';
    if (mode === 'desktop') {
        drawDesktopChannelStrip(ctx, channelIndex, x, y, width, height, state, meterValueDb, isMacro, isPeaking);
    } else {
        drawMobileChannelStrip(ctx, channelIndex, x, y, width, height, state, meterValueDb, isMacro, isPeaking);
    }
}
