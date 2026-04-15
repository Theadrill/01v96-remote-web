/**
 * Simula dados de Level Meter (VU) da 01V96 para fins de teste de UI.
 */
function startMeterSimulation(callback) {
    console.log("🚀 Simulação de SysEx Bruto Iniciada (Modo Realista)");

    let offsets = new Array(32).fill(0).map(() => Math.random() * 2 * Math.PI);
    let time = 0;

    return setInterval(() => {
        time += 0.2;

        // 1. Canais 1 a 32 (Simulando Universal Metering Group 0x21)
        // A Yamaha envia o step (0-31) no high byte e um padding no low byte.
        let sysex = [0xF0, 0x43, 0x10, 0x3E, 13, 33, 0, 0, 0];
        for (let i = 0; i < 32; i++) {
            const wave = Math.sin(time + offsets[i]) * 15 + 15;
            const level31 = Math.floor(Math.min(31, Math.max(0, wave + (Math.random() * 2))));
            sysex.push(level31); // High Byte = Step
            sysex.push(0x7F);    // Low Byte = Padding típico
        }
        sysex.push(0xF7);
        callback(sysex);

        // 2. Stereo Master (Point 4)
        const waveM = Math.sin(time * 0.7) * 15 + 15;
        const level32M = Math.floor(Math.min(32, Math.max(0, waveM + (Math.random() * 2))));
        const rawM = Math.floor((level32M * 3.96875 / 0.031170805879371516) + 37);
        const highM = (rawM >> 7) & 0x7F;
        const lowM = rawM & 0x7F;
        
        let masterSysex = [0xF0, 0x43, 0x10, 0x3E, 13, 33, 4, 0, 0, highM, lowM, highM, lowM, 0xF7];
        callback(masterSysex);

    }, 100);
}

module.exports = { startMeterSimulation };
