/**
 * CAPTURE-STEPS.JS - Screenshot por rolagem do mouse
 * Usa PowerShell + .NET para capturar a tela inteira (incluindo Chrome/Edge com GPU)
 * 
 * F6 = Ativar/Desativar captura
 * F7 = Encerrar
 */

const { uIOhook, UiohookKey } = require('uiohook-napi');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const PRINTS_DIR = path.join(__dirname, 'prints');
if (!fs.existsSync(PRINTS_DIR)) fs.mkdirSync(PRINTS_DIR);

let capturing = false;
let frameCount = 0;
let busy = false;

// Captura via PowerShell usando .NET CopyFromScreen (captura TUDO, incluindo GPU)
function captureScreen(filepath) {
    const ps = `
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
$bounds = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
$bmp = New-Object System.Drawing.Bitmap($bounds.Width, $bounds.Height)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.CopyFromScreen($bounds.Location, [System.Drawing.Point]::Empty, $bounds.Size)
$g.Dispose()
$bmp.Save('${filepath.replace(/\\/g, '\\\\')}', [System.Drawing.Imaging.ImageFormat]::Png)
$bmp.Dispose()
`.trim();
    execSync(`powershell -NoProfile -Command "${ps.replace(/"/g, '\\"').replace(/\n/g, '; ')}"`, { windowsHide: true });
}

// --- MOUSE WHEEL: cada tick = 1 screenshot ---
uIOhook.on('wheel', async (e) => {
    if (!capturing || busy) return;
    busy = true;
    try {
        const filename = `frame_${String(frameCount).padStart(4, '0')}.png`;
        const filepath = path.join(PRINTS_DIR, filename);
        captureScreen(filepath);
        frameCount++;
        process.stdout.write(`\r📸 Frames: ${frameCount}`);
    } catch (err) {
        console.error('\nErro ao capturar:', err.message);
    }
    busy = false;
});

// --- F6 = Toggle, F7 = Sair ---
uIOhook.on('keydown', (e) => {
    if (e.keycode === UiohookKey.F6) {
        capturing = !capturing;
        if (capturing) {
            frameCount = 0;
            console.log('\n🟢 CAPTURA ATIVADA — cada rolagem = 1 screenshot');
        } else {
            console.log(`\n🔴 CAPTURA PARADA — ${frameCount} frames em ./prints/`);
        }
    }
    if (e.keycode === UiohookKey.F7) {
        console.log('\n👋 Encerrando...');
        uIOhook.stop();
        process.exit(0);
    }
});

uIOhook.start();

console.log('');
console.log('=================================================');
console.log('📷 CAPTURE-STEPS — PowerShell CopyFromScreen');
console.log('=================================================');
console.log('  F6  →  Ativar / Desativar captura');
console.log('  F7  →  Encerrar script');
console.log('  🖱️   →  Cada rolagem = 1 screenshot');
console.log('=================================================');
console.log('');
console.log('⏳ Pressione F6 para ativar a captura...');
