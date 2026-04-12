/**
 * Simula dados de Level Meter (VU) da 01V96 para fins de teste de UI.
 */
function startMeterSimulation(callback) {
    console.log("🚀 Simulação de SysEx Bruto Iniciada (Modo Realista)");

    let offsets = new Array(32).fill(0).map(() => Math.random() * 2 * Math.PI);
    let time = 0;

    return setInterval(() => {
        time += 0.2;

        // Cabeçalho da 01V96 (Meters): F0 43 10 3E 7F 21 00 00 00
        let sysex = [0xF0, 0x43, 0x10, 0x3E, 0x7F, 0x21, 0x00, 0x00, 0x00];

        for (let i = 0; i < 32; i++) {
            const wave = Math.sin(time + offsets[i]) * 15 + 15; // 0-30
            const rawValue = Math.floor(Math.min(32, Math.max(0, wave + (Math.random() * 2))));

            // A mesa manda 2 bytes por canal. O primeiro é o nível (0-32). O segundo ignoramos.
            sysex.push(rawValue);
            sysex.push(0x00);
        }

        sysex.push(0xF7); // Fim do SysEx

        // No modo realista, passamos os BYTES brutos para o servidor processar
        callback(sysex);
    }, 100); // 10 FPS para não travar o console de log
}

module.exports = { startMeterSimulation };
