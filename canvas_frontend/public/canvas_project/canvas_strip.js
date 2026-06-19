/**
 * Curva Piecewise Linear copiada de globals.js (steps.json equivalente)
 * Mapeia os 1024 passos (RAW) do fader para decibéis (dB).
 */
const curve = [
    {r:1,d:-138},{r:50,d:-74.6},{r:75,d:-69.6},
    {r:100,d:-64.6},{r:200,d:-44.6},{r:403,d:-22},
    {r:423,d:-20},{r:523,d:-15},{r:603,d:-11},
    {r:723,d:-5},{r:823,d:0},{r:1023,d:10}
];

/**
 * Interpola um valor RAW (0-1023) para a altura física (Pixels) no canvas.
 * Utilizamos a mesma lógica do dbToRaw/rawToDb para manter a consistência da física da mesa.
 * 
 * @param {number} rawValue - Valor de volume bruto (0 a 1023).
 * @param {number} startY - Ponto Y superior da trilha do fader (valor máximo, +10dB).
 * @param {number} trackHeight - Altura total da trilha em pixels.
 * @returns {number} - A coordenada Y absoluta onde o botão do fader deve ser desenhado.
 */
export function interpolateFaderY(rawValue, startY, trackHeight) {
    // rawValue = 0 (silêncio) -> knob no fundo (startY + trackHeight)
    // rawValue = 1023 (+10dB) -> knob no topo (startY)
    
    // Matemática simples linear por enquanto, baseada apenas no RAW (0 a 1023)
    // Caso queiramos o Knob subindo de forma *visual* linear para o RAW,
    // usamos uma proporção inversa (pois Y=0 é no topo da tela).
    
    const pct = rawValue / 1023; // de 0.0 a 1.0
    // Invertemos o percentual pois Y cresce para baixo
    return startY + (trackHeight * (1 - pct));
}

/**
 * Retorna a cor de fundo dinamicamente baseada no índice do canal.
 */
function getChannelColor(index) {
    // 0-15 (Azul), 16-31 (Verde), Master (Vermelho), Aux/Bus (Amarelo)
    if (index >= 0 && index <= 15) return '#001f3f'; // Azul escuro
    if (index >= 16 && index <= 31) return '#013220'; // Verde escuro
    // Master tipicamente será o índice 52 no globals.js, mas no layout direto pode variar.
    if (index === 52) return '#4a0000'; // Vermelho escuro
    if (index >= 36 && index <= 51) return '#4a4a00'; // Amarelo/Ocre para Aux e Bus
    if (index === -1) return '#6a1b9a'; // Roxo para MACRO
    return '#111'; // Padrão
}

/**
 * Desenha um channel strip único na tela.
 */
export function drawChannelStrip(ctx, channelIndex, x, y, width, height, state, meterValueDb, isMacro = false) {
    // --- 1. Fundo do Canal ---
    ctx.fillStyle = getChannelColor(channelIndex);
    ctx.fillRect(x, y, width, height);
    
    // Borda separadora
    ctx.strokeStyle = '#222';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x + width, y);
    ctx.lineTo(x + width, y + height);
    ctx.stroke();

    // Geometria da trilha do fader
    const paddingY = 80; // espaço para os botões em cima
    const trackHeight = height - paddingY - 50; // 50px de espaço embaixo para o nome
    const trackY = y + paddingY;
    const trackX = x + width/2 - 10;

    // --- 2. Track do Fader (A fenda onde o botão desliza) ---
    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(trackX, trackY, 6, trackHeight);

    // --- 3. Fader Knob (Botão) ---
    // Interpola a posição Y baseada no valor do fader no estado global
    const knobY = interpolateFaderY(state.value, trackY, trackHeight);
    
    // Desenha o botão centralizado na trilha
    ctx.fillStyle = '#cccccc';
    const knobWidth = 36;
    const knobHeight = 40;
    ctx.fillRect(x + width/2 - knobWidth/2 - 7, knobY - knobHeight/2, knobWidth, knobHeight);
    // Linha de detalhe no meio do knob
    ctx.fillStyle = '#000';
    ctx.fillRect(x + width/2 - knobWidth/2 - 7, knobY - 1, knobWidth, 2);

    // --- 4. Medidor de Pico (Meter) ---
    // Mapeamento do db (ex: -138 a 0) para altura em pixels
    const meterX = x + width - 15;
    const meterW = 8;
    
    // Fundo do meter (apagado)
    ctx.fillStyle = '#111';
    ctx.fillRect(meterX, trackY, meterW, trackHeight);
    
    // O valor que vem do wasmMeterEngine (meterValueDb) na verdade é um percentual de 0 a 100.
    let displayPct = Math.max(0, Math.min(100, meterValueDb));
    let meterPct = displayPct / 100; // 0.0 a 1.0
    let meterBarHeight = trackHeight * meterPct;
    let meterTopY = trackY + trackHeight - meterBarHeight;

    // Gradiente dinâmico baseado no dB para simular LEDs
    // Verde (< -18dB), Amarelo (-18 a 0dB), Vermelho (> 0dB)
    if (meterBarHeight > 0) {
        let grad = ctx.createLinearGradient(meterX, trackY, meterX, trackY + trackHeight);
        grad.addColorStop(0, '#ff0000'); // Topo (+10dB)
        grad.addColorStop(0.14, '#ff0000'); // > 0dB
        grad.addColorStop(0.15, '#ffff00'); // 0dB
        grad.addColorStop(0.4, '#ffff00');  // -18dB
        grad.addColorStop(0.41, '#00ff00'); // < -18dB
        grad.addColorStop(1, '#005500'); // Fundo
        
        ctx.fillStyle = grad;
        ctx.fillRect(meterX, meterTopY, meterW, meterBarHeight);
    }

    // --- 5. Botões Visuais (ON e SOLO) ---
    // Botão ON
    const btnW = 30;
    const btnH = 20;
    ctx.fillStyle = state.on ? '#00ff00' : '#333';
    ctx.fillRect(x + width/2 - btnW - 5, y + 10, btnW, btnH);
    ctx.fillStyle = '#000';
    ctx.font = '10px Arial';
    ctx.fillText("ON", x + width/2 - btnW + 2, y + 24);

    // Botão SOLO
    ctx.fillStyle = state.solo ? '#ffff00' : '#333';
    ctx.fillRect(x + width/2 + 5, y + 10, btnW, btnH);
    ctx.fillStyle = '#000';
    ctx.fillText("SOLO", x + width/2 + 6, y + 24);

    // --- 6. Caixas de Texto (Nome do Canal) ---
    ctx.fillStyle = '#fff';
    ctx.font = '12px Arial';
    ctx.textAlign = 'center';
    
    // Nome do canal, se tiver `name` definido usa ele, senão o índice
    let label = state.name || `CH ${channelIndex + 1}`;
    if (channelIndex === 52) label = "MASTER";
    if (isMacro) label = "MACRO FADER";
    
    ctx.fillText(label, x + width/2, y + height - 20);
    
    // O dB também pode ser impresso para feedback do drag
    // ctx.font = '10px Arial';
    // ctx.fillStyle = '#aaa';
    // ctx.fillText(`${(pct*100).toFixed(0)}%`, x + width/2, y + height - 5);
}
