/**
 * meter_dummy.js
 * Simula dados de Level Meter (VU) da 01V96 para stress test de frontend.
 * Todos os 32 canais + Master enviam dados a alta frequência (~24fps por grupo),
 * replicando o volume real de tráfego MIDI de uma mesa com banda ao vivo.
 */

function startMeterSimulation(callback) {
    console.log("🚀 [DEMO] Simulação de Meters Iniciada (Stress Mode — 32ch + Master @ 30fps)");

    // Fase aleatória por canal para dessincronizar as ondas
    const phases = new Array(32).fill(0).map(() => Math.random() * Math.PI * 2);
    const phases2 = new Array(32).fill(0).map(() => Math.random() * Math.PI * 2);
    const speeds = new Array(32).fill(0).map(() => 0.8 + Math.random() * 4.0);

    // Todos os canais com níveis altos e variação significativa
    // Níveis base aumentados para ficarem mais "quentes" (perto do topo)
    const bases = [
        26, 24, 22, 23,   // 1-4:   Bateria (kick, snare, hh, oh)
        25, 23, 21, 20,   // 5-8:   Baixo, guit rítmica, guit solo, teclado
        26, 24, 19, 18,   // 9-12:  Vocal principal, vocal 2, BV1, BV2
        20, 21, 17, 18,   // 13-16: BV3, BV4, sopro1, sopro2
        22, 19, 20, 18,   // 17-20: FX ret 1-4
        18, 20, 17, 21,   // 21-24: Ambiente, pad, DI, click
        22, 19, 20, 18,   // 25-28: Sub, perc, strings, aux
        16, 21, 19, 17,   // 29-32: Extra channels
    ];

    let t = 0;
    let energy = 0.9; // Começa com energia alta
    let energyTarget = 0.9;

    return setInterval(() => {
        t += 0.15;

        // Energia global muda lentamente, mas se mantém em patamares altos (0.7 a 1.0)
        if (Math.random() < 0.008) {
            energyTarget = 0.7 + Math.random() * 0.3;
        }
        energy += (energyTarget - energy) * 0.03;

        // ---- CANAIS 1-32 (Universal Metering SysEx) ----
        const sysex = [0xF0, 0x43, 0x10, 0x3E, 13, 33, 0, 0, 0];
        for (let i = 0; i < 32; i++) {
            const s = speeds[i];
            // Onda principal + sub-harmônico + ruído
            const w1 = Math.sin(t * s + phases[i]);
            const w2 = Math.sin(t * s * 2.3 + phases2[i]) * 0.35;
            const w3 = Math.sin(t * s * 0.4 + phases[i] * 0.7) * 0.25;
            const noise = (Math.random() - 0.5) * 3;

            // Multiplicador de onda aumentado de 6 para 9 para mais dinâmica no topo
            const level = (bases[i] * energy) + ((w1 + w2 + w3) * 9 * energy) + noise;
            const clamped = Math.floor(Math.min(31, Math.max(0, level)));

            sysex.push(clamped);  // High byte = step
            sysex.push(0x7F);     // Low byte = padding
        }
        sysex.push(0xF7);
        callback(sysex);

        // ---- STEREO MASTER (Point 4) ----
        const mw = Math.sin(t * 0.9) * 2.5 + Math.sin(t * 1.7) * 2;
        const masterLevel = Math.floor(Math.min(31, Math.max(0, 26 * energy + mw + (Math.random() - 0.5) * 2)));
        const rawM = Math.floor((masterLevel * 3.96875 / 0.031170805879371516) + 37);
        const highM = (rawM >> 7) & 0x7F;
        const lowM = rawM & 0x7F;

        const masterSysex = [0xF0, 0x43, 0x10, 0x3E, 13, 33, 4, 0, 0, highM, lowM, highM, lowM, 0xF7];
        callback(masterSysex);

    }, 33); // ~30fps — acima do polling real da mesa (41ms/24fps) para estressar o frontend
}

module.exports = { startMeterSimulation };
