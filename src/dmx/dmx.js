// ============================================================================
// dmx.js — Sistema de Iluminação DMX (ArtNet + Lumikit)
// ============================================================================
// Gerencia a integração com o sistema de iluminação:
// - startDmxApp: inicia o ArtNetToDMX.exe (conversor ArtNet -> DMX via FTDI)
// - resetDmxSystem: reset completo (USB + software) com PowerShell elevado
// - updateLumikitConfig: atualiza o IP no arquivo "info" do ArtNetToDMX
// Fluxo típico: ArtNetToDMX.exe -> USB FTDI -> DMX -> LumikitSHOW.exe
// ============================================================================

const os = require('os');
const fs = require('fs');
const path = require('path');
const { exec, spawn } = require('child_process');

let ctx;

// Inicia (ou verifica) o ArtNetToDMX.exe.
// Se force=true, força kill e respawn. Se false, só abre se não estiver rodando.
function startDmxApp(force = false) {
    const exePath = path.join(ctx.rootDir, 'ArtNetToDMX_FTDI', 'ArtNetToDMX.exe');

    // --- AUTO-CONFIGURAÇÃO DE IP ---
    // Sempre garante que o arquivo info está com o IP correto para a rede atual,
    // independente de o aplicativo já estar aberto ou não.
    updateLumikitConfig();

    // Verifica se o processo já existe na lista do Windows
    exec('tasklist /FI "IMAGENAME eq ArtNetToDMX.exe"', (err, stdout) => {
        const isRunning = stdout.toLowerCase().includes('artnettodmx.exe');

        if (isRunning && !force) {
            console.log('💡 [DMX] Aplicativo de luz já está em execução. Nenhuma ação necessária no boot.');
            return;
        }

        if (isRunning && force) {
            console.log('♻️ [DMX] Forçando reinicialização do aplicativo...');
            exec('taskkill /F /IM ArtNetToDMX.exe', () => spawnDmx());
        } else {
            console.log('🎬 [DMX] Iniciando aplicativo de luz...');
            spawnDmx();
        }
    });

    function spawnDmx() {
        if (!fs.existsSync(exePath)) return console.error('❌ [DMX] Executável não encontrado em', exePath);

        try {
            const child = spawn(exePath, [], {
                cwd: path.dirname(exePath),
                detached: true,
                stdio: 'ignore'
            });
            child.unref();
            console.log('🚀 [DMX] Sistema de luz online!');
        } catch (e) {
            console.error('❌ [DMX] Erro ao abrir executável:', e.message);
        }
    }
}

// Procedimento completo de reset: mata processos, reseta USB via pnputil, reabre apps.
// Usado quando o DMX para de responder e precisa de um reset de hardware.
function resetDmxSystem() {
    console.log('🚀 [DMX] Iniciando procedimento de reset de hardware (USB) e software...');

    // 1. Matar o LumikitSHOW.exe
    exec('taskkill /F /IM LumikitSHOW.exe', () => {
        // 2. Matar o ArtNetToDMX.exe
        exec('taskkill /F /IM ArtNetToDMX.exe', () => {
            // 3. Delay para o Windows processar o fechamento
            setTimeout(() => {
                console.log('🔧 [DMX] Executando reset USB elevado via PowerShell (pnputil)...');
                // Adicionado -Wait para o exec() só terminar quando o reset físico for concluído.
                const psCommand = `powershell -Command "Start-Process powershell -ArgumentList '-NoProfile -Command $dev = Get-PnpDevice | Where-Object { $_.InstanceId -like ''*VID_0403&PID_6001*'' -or $_.FriendlyName -like ''*USB Serial Converter*'' } | Select-Object -First 1; if ($dev) { pnputil /restart-device $dev.InstanceId }' -Verb RunAs -WindowStyle Hidden -Wait"`;

                exec(psCommand, (psErr) => {
                    if (psErr) console.error('❌ [DMX] Erro ao disparar reset elevado:', psErr.message);
                    else console.log('✅ [DMX] Comando de reset enviado para o Windows e concluído.');

                    // 4. Aguarda 3s para o Windows re-enumerar o dispositivo USB
                    setTimeout(() => {
                        console.log('🎬 [DMX] Iniciando ArtNetToDMX...');
                        startDmxApp(true); // 'true' garante que ele force caso tenha sobrado algum zumbi

                        // 5. Aguarda mais 3s para o ArtNetToDMX carregar e escutar a porta 6454
                        setTimeout(() => {
                            const lumikitPath = "C:\\Program Files\\Lumikit\\LumikitSHOW.exe";
                            if (fs.existsSync(lumikitPath)) {
                                console.log('🎬 [DMX] Iniciando LumikitSHOW...');
                                try {
                                    const child = spawn(lumikitPath, [], {
                                        cwd: path.dirname(lumikitPath),
                                        detached: true,
                                        stdio: 'ignore'
                                    });
                                    child.unref();
                                } catch (e) {
                                    console.error('❌ [DMX] Erro ao abrir Lumikit:', e.message);
                                }
                            } else {
                                console.error('❌ [DMX] Executável Lumikit não encontrado em', lumikitPath);
                            }
                        }, 3000);
                    }, 3000);
                });
            }, 1000);
        });
    });
}

// Configura o IP local no arquivo "info" do ArtNetToDMX.
// Compara os IPs da lista lumikit_ips com as interfaces de rede ativas e
// escreve o IP correto no arquivo de configuração do conversor ArtNet->DMX.
function updateLumikitConfig() {
    const config = ctx.loadConfig();
    const lumikitIps = config.lumikit_ips || [];
    if (lumikitIps.length === 0) return;

    const infoPath = path.join(ctx.rootDir, 'ArtNetToDMX_FTDI', 'info');
    const interfaces = os.networkInterfaces();
    let localIps = [];
    for (const k in interfaces) {
        for (const k2 in interfaces[k]) {
            const address = interfaces[k][k2];
            if (address.family === 'IPv4' && !address.internal) {
                localIps.push(address.address);
            }
        }
    }

    const match = lumikitIps.find(ip => localIps.includes(ip));

    if (match) {
        try {
            // Se o arquivo não existe, cria um novo com as configurações padrão
            if (!fs.existsSync(infoPath)) {
                console.log(`📝 [DMX] Arquivo "info" não encontrado. Criando um novo para o IP ${match}...`);
                const defaultContent = `IP: ${match}\nUni: 0\nOneUni: true\nAutostart: true\n`;
                fs.writeFileSync(infoPath, defaultContent);
                return;
            }

            let infoContent = fs.readFileSync(infoPath, 'utf8');
            const newContent = infoContent.replace(/^IP:.*$/m, `IP: ${match}`);

            if (infoContent !== newContent) {
                fs.writeFileSync(infoPath, newContent);
                console.log(`🌐 [DMX] IP configurado automaticamente no arquivo info: ${match}`);
            } else {
                console.log(`🌐 [DMX] IP ${match} já estava configurado corretamente.`);
            }
        } catch (err) {
            console.error('❌ [DMX] Erro ao gravar/criar o arquivo info:', err.message);
        }
    } else {
        console.warn('⚠️ [DMX] Nenhum IP da lista "lumikit_ips" bate com as redes ativas deste PC.');
    }
}

function initDmx(appCtx) {
    ctx = appCtx;
    ctx.startDmxApp = startDmxApp;
    ctx.resetDmxSystem = resetDmxSystem;
    ctx.updateLumikitConfig = updateLumikitConfig;
}

module.exports = { initDmx };
