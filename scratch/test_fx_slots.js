const midi = require('midi');
const fs = require('fs');
const path = require('path');

const input = new midi.Input();
const LOG_PATH = path.join(__dirname, '../log/fx_test_log.txt');

// Certifica que o diretório de log existe
if (!fs.existsSync(path.dirname(LOG_PATH))) {
    fs.mkdirSync(path.dirname(LOG_PATH), { recursive: true });
}

// Limpa o log ao iniciar
fs.writeFileSync(LOG_PATH, '');


let targetInIdx = -1;
for (let i = 0; i < input.getPortCount(); i++) {
    const name = input.getPortName(i);
    if (name.toLowerCase().includes('monitor')) targetInIdx = i;
}

if (targetInIdx === -1) {
    console.error('Porta "Monitor" não encontrada!');
    process.exit(1);
}

input.openPort(targetInIdx);
input.ignoreTypes(false, false, false);

console.log('\n====================================================');
console.log('   🔍 01V96 FX DEEP SCANNER v2.0 (HOLD FIX)');
console.log('====================================================');
console.log(`Logs: ${LOG_PATH}\n`);

input.on('message', (deltaTime, message) => {
    // Filtro SysEx Yamaha 01V96 (Efeitos Section 0x7F, Element 0x58)
    // F0 43 10 3E 7F 01 58 [PARAM] [SLOT] 00 00 00 [V3] [V4] F7
    if (message.length < 14 || message[4] !== 0x7F || message[6] !== 0x58) return;

    const param = message[7];
    const slot = message[8];
    const v3 = message[11];
    const v4 = message[12];

    // Calcula valor combinado (14-bit: v3 é MSB, v4 é LSB)
    const combined = (v3 << 7) | v4;

    // Filtra o ruído 4095 (0x7F 0x7F) ou similar que o console envia em repouso

    if (combined === 4095 || combined === 16383) return;

    let humanValue = '';
    
    // Lógica de conversão baseada no parâmetro (Reverb Standard)
    if (param === 0x10) { // INI. DLY
        humanValue = ` -> ${(combined / 10).toFixed(1)}ms`;
    } else if (param === 0x11) { // REV TIME
        let val = combined;
        let s = 0;
        if (val <= 47) s = val * 0.1 + 0.3;
        else if (val <= 57) s = (val - 47) * 0.5 + 5.0;
        else if (val <= 67) s = (val - 57) * 1.0 + 10.0;
        else if (val <= 82) s = (val - 67) * 5.0 + 20.0;
        else s = 99.0;
        humanValue = ` -> ${s.toFixed(1)}s`;
    } else if (param === 0x1C) { // HOLD (Reverb Gate)
        const holdPoints = [
            { c: 0, v: 0.02 },
            { c: 1, v: 0.04 },
            { c: 2, v: 0.06 },
            { c: 3, v: 0.08 },
            { c: 4, v: 0.10 },
            { c: 5, v: 0.13 },
            { c: 6, v: 0.15 },
            { c: 7, v: 0.17 },
            { c: 8, v: 0.19 },
            { c: 9, v: 0.21 },
            { c: 10, v: 0.23 },
            { c: 11, v: 0.25 },
            { c: 12, v: 0.27 },
            { c: 13, v: 0.29 },
            { c: 14, v: 0.31 },
            { c: 15, v: 0.33 },
            { c: 16, v: 0.35 },
            { c: 17, v: 0.38 },
            { c: 18, v: 0.40 },
            { c: 19, v: 0.42 },
            { c: 20, v: 0.44 },
            { c: 21, v: 0.46 },
            { c: 22, v: 0.48 },
            { c: 23, v: 0.50 },
            { c: 24, v: 0.52 },
            { c: 25, v: 0.54 },
            { c: 26, v: 0.56 },
            { c: 27, v: 0.58 },
            { c: 28, v: 0.60 },
            { c: 29, v: 0.63 },
            { c: 30, v: 0.65 },
            { c: 31, v: 0.67 },
            { c: 32, v: 0.69 },
            { c: 33, v: 0.73 },
            { c: 34, v: 0.77 },
            { c: 35, v: 0.81 },
            { c: 36, v: 0.85 },
            { c: 37, v: 0.90 },
            { c: 38, v: 0.94 },
            { c: 39, v: 0.98 },
            { c: 40, v: 1.02 },
            { c: 41, v: 1.06 },
            { c: 42, v: 1.10 },
            { c: 43, v: 1.15 },
            { c: 44, v: 1.19 },
            { c: 45, v: 1.23 },
            { c: 46, v: 1.27 },
            { c: 47, v: 1.31 },
            { c: 48, v: 1.35 },
            { c: 49, v: 1.44 },
            { c: 50, v: 1.52 },  // Confirmado via frame_0050.png
            { c: 51, v: 1.60 },
            { c: 52, v: 1.68 },
            { c: 53, v: 1.76 },
            { c: 54, v: 1.84 },
            { c: 55, v: 1.93 },
            { c: 56, v: 2.01 },
            { c: 57, v: 2.10 },
            { c: 58, v: 2.18 },
            { c: 59, v: 2.27 },
            { c: 60, v: 2.35 },
            { c: 61, v: 2.44 },
            { c: 62, v: 2.52 },
            { c: 63, v: 2.60 },
            { c: 64, v: 2.69 },
            { c: 65, v: 2.85 },
            { c: 66, v: 3.02 },
            { c: 67, v: 3.19 },
            { c: 68, v: 3.35 },
            { c: 69, v: 3.52 },
            { c: 70, v: 3.69 },
            { c: 71, v: 3.85 },
            { c: 72, v: 4.02 },
            { c: 73, v: 4.19 },
            { c: 74, v: 4.35 },
            { c: 75, v: 4.52 },
            { c: 76, v: 4.69 },
            { c: 77, v: 4.85 },
            { c: 78, v: 5.02 },
            { c: 79, v: 5.19 },
            { c: 80, v: 5.35 },
            { c: 81, v: 5.69 },
            { c: 82, v: 6.02 },
            { c: 83, v: 6.35 },
            { c: 84, v: 6.69 },
            { c: 85, v: 7.02 },
            { c: 86, v: 7.35 },
            { c: 87, v: 7.69 },
            { c: 88, v: 8.02 },
            { c: 89, v: 8.35 },
            { c: 90, v: 8.69 },
            { c: 91, v: 9.02 },
            { c: 92, v: 9.35 },
            { c: 93, v: 9.69 },
            { c: 94, v: 10.0 },
            { c: 95, v: 10.3 },
            { c: 96, v: 10.6 },
            { c: 97, v: 11.3 },
            { c: 98, v: 12.0 },
            { c: 99, v: 12.6 },
            { c: 100, v: 13.3 },
            { c: 101, v: 14.0 },
            { c: 102, v: 14.6 },
            { c: 103, v: 15.3 },
            { c: 104, v: 16.0 },
            { c: 105, v: 16.6 },
            { c: 106, v: 17.3 },
            { c: 107, v: 18.0 },
            { c: 108, v: 18.6 },
            { c: 109, v: 19.3 },
            { c: 110, v: 20.0 },
            { c: 111, v: 20.6 },
            { c: 112, v: 21.3 },
            { c: 113, v: 22.6 },
            { c: 114, v: 24.0 },
            { c: 115, v: 25.3 },
            { c: 116, v: 26.6 },
            { c: 117, v: 28.0 },
            { c: 118, v: 29.3 },
            { c: 119, v: 30.6 },
            { c: 120, v: 32.0 },
            { c: 121, v: 33.3 },
            { c: 122, v: 34.6 },
            { c: 123, v: 36.0 },
            { c: 124, v: 37.3 },
            { c: 125, v: 38.6 },
            { c: 126, v: 40.0 },
            { c: 127, v: 41.3 },
            { c: 128, v: 42.6 },
            { c: 129, v: 45.3 },
            { c: 130, v: 48.0 },
            { c: 131, v: 50.6 },
            { c: 132, v: 53.3 },
            { c: 133, v: 56.0 },
            { c: 134, v: 58.6 },
            { c: 135, v: 61.3 },
            { c: 136, v: 64.0 },
            { c: 137, v: 66.6 },
            { c: 138, v: 69.3 },
            { c: 139, v: 72.0 },
            { c: 140, v: 74.6 },
            { c: 141, v: 77.3 },
            { c: 142, v: 80.0 },
            { c: 143, v: 82.6 },
            { c: 144, v: 85.3 },
            { c: 145, v: 90.6 },
            { c: 146, v: 96.0 },
            { c: 147, v: 101 },
            { c: 148, v: 106 },
            { c: 149, v: 112 },
            { c: 150, v: 117 },
            { c: 151, v: 122 },
            { c: 152, v: 128 },
            { c: 153, v: 133 },
            { c: 154, v: 138 },
            { c: 155, v: 144 },
            { c: 156, v: 149 },
            { c: 157, v: 154 },
            { c: 158, v: 160 },
            { c: 159, v: 165 },
            { c: 160, v: 170.0 },
            { c: 161, v: 181 },
            { c: 162, v: 192 },
            { c: 163, v: 202.0 },
            { c: 164, v: 213.0 },
            { c: 165, v: 224 },
            { c: 166, v: 234 },
            { c: 167, v: 245.0 },
            { c: 168, v: 256 },
            { c: 169, v: 266 },
            { c: 170, v: 277 },
            { c: 171, v: 288 },
            { c: 172, v: 298 },
            { c: 173, v: 309 },
            { c: 174, v: 320 },
            { c: 175, v: 330.0 },
            { c: 176, v: 341 },
            { c: 177, v: 362 },
            { c: 178, v: 384 },
            { c: 179, v: 405 },
            { c: 180, v: 426 },
            { c: 181, v: 448 },
            { c: 182, v: 469 },
            { c: 183, v: 490 },
            { c: 184, v: 512 },
            { c: 185, v: 533 },
            { c: 186, v: 554 },
            { c: 187, v: 576 },
            { c: 188, v: 597 },
            { c: 189, v: 618 },
            { c: 190, v: 640 },
            { c: 191, v: 661 },
            { c: 192, v: 682 },
            { c: 193, v: 725 },
            { c: 194, v: 768 },
            { c: 195, v: 810 },
            { c: 196, v: 853 },
            { c: 197, v: 896 },
            { c: 198, v: 938 },
            { c: 199, v: 981 },
            { c: 200, v: 1020 },
            { c: 201, v: 1060 },
            { c: 202, v: 1100 },
            { c: 203, v: 1150 },
            { c: 204, v: 1190 },
            { c: 205, v: 1230 },
            { c: 206, v: 1280 },
            { c: 207, v: 1320 },
            { c: 208, v: 1360 },
            { c: 209, v: 1450 },
            { c: 210, v: 1530 },
            { c: 211, v: 1620 },
            { c: 212, v: 1700 },
            { c: 213, v: 1790 },
            { c: 214, v: 1870 },
            { c: 215, v: 1960 }
        ];

        let valMs = 0;
        if (combined <= 0) valMs = holdPoints[0].v;
        else if (combined >= 215) valMs = holdPoints[holdPoints.length - 1].v;
        else {
            // Encontra o intervalo para interpolação
            for (let i = 0; i < holdPoints.length - 1; i++) {
                const p1 = holdPoints[i];
                const p2 = holdPoints[i + 1];
                if (combined >= p1.c && combined <= p2.c) {
                    const ratio = (combined - p1.c) / (p2.c - p1.c);
                    valMs = p1.v + ratio * (p2.v - p1.v);
                    console.log(`DEBUG: c=${combined} p1=${p1.c} p2=${p2.c} ratio=${ratio.toFixed(4)} valMs=${valMs.toFixed(2)}`);
                    break;
                }
            }
        }

        if (valMs < 1000) {
            humanValue = ` -> ${valMs.toFixed(2)}ms`;
        } else {
            humanValue = ` -> ${(valMs / 1000).toFixed(2)}s`;
        }
    } else if (param === 0x1D) { // DECAY (Reverb Gate)
        const decayPoints = [
            { c: 0, v: 5 }, { c: 1, v: 11 }, { c: 2, v: 16 }, { c: 3, v: 21 }, { c: 4, v: 27 },
            { c: 5, v: 32 }, { c: 6, v: 37 }, { c: 7, v: 43 }, { c: 8, v: 48 }, { c: 9, v: 53 },
            { c: 10, v: 59 }, { c: 11, v: 64 }, { c: 12, v: 69 }, { c: 13, v: 75 }, { c: 14, v: 80 },
            { c: 15, v: 85 }, { c: 16, v: 91 }, { c: 17, v: 96 }, { c: 18, v: 101 }, { c: 19, v: 107 },
            { c: 20, v: 112 }, { c: 21, v: 117 }, { c: 22, v: 123 }, { c: 23, v: 128 }, { c: 24, v: 133 },
            { c: 25, v: 139 }, { c: 26, v: 144 }, { c: 27, v: 149 }, { c: 28, v: 155 }, { c: 29, v: 160 },
            { c: 30, v: 165 }, { c: 31, v: 171 }, { c: 32, v: 176 }, { c: 33, v: 187 }, { c: 34, v: 197 },
            { c: 35, v: 208 }, { c: 36, v: 219 }, { c: 37, v: 229 }, { c: 38, v: 240 }, { c: 39, v: 251 },
            { c: 40, v: 261 }, { c: 41, v: 272 }, { c: 42, v: 283 }, { c: 43, v: 293 }, { c: 44, v: 304 },
            { c: 45, v: 315 }, { c: 46, v: 325 }, { c: 47, v: 336 }, { c: 48, v: 347 }, { c: 49, v: 368 },
            { c: 50, v: 389 }, { c: 51, v: 411 }, { c: 52, v: 432 }, { c: 53, v: 453 }, { c: 54, v: 475 },
            { c: 55, v: 496 }, { c: 56, v: 517 }, { c: 57, v: 539 }, { c: 58, v: 560 }, { c: 59, v: 581 },
            { c: 60, v: 603 }, { c: 61, v: 624 }, { c: 62, v: 645 }, { c: 63, v: 667 }, { c: 64, v: 688 },
            { c: 65, v: 730 }, { c: 66, v: 773 }, { c: 67, v: 816 }, { c: 68, v: 858 }, { c: 69, v: 901 },
            { c: 70, v: 944 }, { c: 71, v: 986 }, { c: 72, v: 1020 }, { c: 73, v: 1070 }, { c: 74, v: 1110 },
            { c: 75, v: 1150 }, { c: 76, v: 1200 }, { c: 77, v: 1240 }, { c: 78, v: 1280 }, { c: 79, v: 1320 },
            { c: 80, v: 1370 }, { c: 81, v: 1450 }, { c: 82, v: 1540 }, { c: 83, v: 1620 }, { c: 84, v: 1710 },
            { c: 85, v: 1790 }, { c: 86, v: 1880 }, { c: 87, v: 1960 }, { c: 88, v: 2050 }, { c: 89, v: 2130 },
            { c: 90, v: 2220 }, { c: 91, v: 2300 }, { c: 92, v: 2390 }, { c: 93, v: 2470 }, { c: 94, v: 2560 },
            { c: 95, v: 2650 }, { c: 96, v: 2730 }, { c: 97, v: 2900 }, { c: 98, v: 3070 }, { c: 99, v: 3240 },
            { c: 100, v: 3410 }, { c: 101, v: 3580 }, { c: 102, v: 3750 }, { c: 103, v: 3930 }, { c: 104, v: 4100 },
            { c: 105, v: 4270 }, { c: 106, v: 4440 }, { c: 107, v: 4610 }, { c: 108, v: 4780 }, { c: 109, v: 4950 },
            { c: 110, v: 5120 }, { c: 111, v: 5290 }, { c: 112, v: 5460 }, { c: 113, v: 5800 }, { c: 114, v: 6140 },
            { c: 115, v: 6480 }, { c: 116, v: 6830 }, { c: 117, v: 7170 }, { c: 118, v: 7510 }, { c: 119, v: 7850 },
            { c: 120, v: 8190 }, { c: 121, v: 8530 }, { c: 122, v: 8870 }, { c: 123, v: 9210 }, { c: 124, v: 9560 },
            { c: 125, v: 9900 }, { c: 126, v: 10200 }, { c: 127, v: 10500 }, { c: 128, v: 10900 }, { c: 129, v: 11600 },
            { c: 130, v: 12200 }, { c: 131, v: 12900 }, { c: 132, v: 13600 }, { c: 133, v: 14300 }, { c: 134, v: 15000 },
            { c: 135, v: 15700 }, { c: 136, v: 16300 }, { c: 137, v: 17000 }, { c: 138, v: 17700 }, { c: 139, v: 18400 },
            { c: 140, v: 19100 }, { c: 141, v: 19700 }, { c: 142, v: 20400 }, { c: 143, v: 21100 }, { c: 144, v: 21800 },
            { c: 145, v: 23200 }, { c: 146, v: 24500 }, { c: 147, v: 25900 }, { c: 148, v: 27300 }, { c: 149, v: 28600 },
            { c: 150, v: 30000 }, { c: 151, v: 31400 }, { c: 152, v: 32700 }, { c: 153, v: 34100 }, { c: 154, v: 35400 },
            { c: 155, v: 36800 }, { c: 156, v: 38200 }, { c: 157, v: 39500 }, { c: 158, v: 40900 }, { c: 159, v: 42300 }
        ];

        let valMs = 0;
        if (combined <= 0) valMs = decayPoints[0].v;
        else if (combined >= 159) valMs = decayPoints[decayPoints.length - 1].v;
        else {
            for (let i = 0; i < decayPoints.length - 1; i++) {
                const p1 = decayPoints[i];
                const p2 = decayPoints[i + 1];
                if (combined >= p1.c && combined <= p2.c) {
                    const ratio = (combined - p1.c) / (p2.c - p1.c);
                    valMs = p1.v + ratio * (p2.v - p1.v);
                    break;
                }
            }
        }

        if (valMs < 1000) {
            humanValue = ` -> ${valMs.toFixed(0)}ms`;
        } else {
            humanValue = ` -> ${(valMs / 1000).toFixed(2)}s`;
        }
    }

    const hexString = message.map(b => b.toString(16).padStart(2, '0').toUpperCase()).join(' ');
    const logLine = `[FX ${slot + 1}] Param ${param.toString(16).toUpperCase()} | Combined: ${combined}${humanValue} | Hex: ${hexString}`;

    console.log(`✨ ${logLine}`);

    
    fs.appendFileSync(LOG_PATH, logLine + '\n');
});


