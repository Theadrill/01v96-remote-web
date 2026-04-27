const { exec } = require('child_process');

console.log('--- TESTE DE ELEVAÇÃO (POWERSHELL) ---');
console.log('Solicitando permissão ao Windows...');

// Comando para resetar USB (simulado com 'net session')
const targetCommand = 'net session'; 

// Este comando abre um novo processo PowerShell como Administrador
// O '-Verb RunAs' é o que dispara o UAC (Sim/Não)
const psCommand = `powershell -Command "Start-Process powershell -ArgumentList '-NoProfile -NoExit -Command ${targetCommand}' -Verb RunAs"`;

exec(psCommand, (err, stdout, stderr) => {
    if (err) {
        console.error('❌ Erro ao tentar disparar a permissão:', err.message);
        return;
    }
    console.log('🚀 Janela de permissão disparada!');
    console.log('Verifique se apareceu um aviso na sua tela e uma nova janela de terminal.');
});
