export const curve = [
    {r:1,d:-138},{r:50,d:-74.6},{r:75,d:-69.6},
    {r:100,d:-64.6},{r:200,d:-44.6},{r:403,d:-22},
    {r:423,d:-20},{r:523,d:-15},{r:603,d:-11},
    {r:723,d:-5},{r:823,d:0},{r:1023,d:10}
];

export function interpolateFaderY(rawValue, startY, trackHeight) {
    const pct = rawValue / 1023;
    return startY + (trackHeight * (1 - pct));
}

export function getChannelColor(index) {
    if (index >= 0 && index <= 15) return '#001f3f';
    if (index >= 16 && index <= 31) return '#013220';
    if (index === 52) return '#4a0000';
    if (index >= 36 && index <= 51) return '#4a4a00';
    if (index === -1) return '#6a1b9a';
    return '#111';
}

export function roundRect(ctx, x, y, w, h, r) {
    if (w < 2 * r) r = w / 2;
    if (h < 2 * r) r = h / 2;
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
}
