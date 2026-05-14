// ============================================================================
// systray.js — Bandeja do Sistema (System Tray)
// ============================================================================
// Gerencia o ícone na bandeja do Windows (systray2).
// - Exibe status de conexão (Conectado/Aguardando)
// - Menu com opções: Reconectar, Abrir Navegador, Sair
// - Atualização dinâmica do menu conforme estado da conexão
// ============================================================================

const path = require('path');
const { exec } = require('child_process');
const os = require('os');
const SysTray = require('systray2').default;

let ctx;

// --- LÓGICA DA SYSTEM TRAY ---
// Gera a estrutura do menu com base no estado atual de conexão.
// O tooltip e o texto do primeiro item mudam conforme isConnected.
function gerarConfigMenu() {
    return {
        menu: {
            icon: path.join(ctx.rootDir, 'public/favicon.ico'),
            title: "01V96 Control",
            tooltip: ctx.isConnected ? "Conectado à 01V96" : "Aguardando Conexão",
            items: [
                {
                    title: ctx.isConnected ? "🔄 Reconectar à Mesa" : "🔌 Conectar à Mesa",
                    enabled: true
                },
                {
                    title: "🌐 Abrir no Navegador",
                    enabled: true
                },
                { title: "---", enabled: false },
                {
                    title: "❌ Sair e Encerrar",
                    enabled: true
                }
            ]
        },
        debug: false,
        copyDir: true
    };
}

// Envia ação de update-menu ao processo da bandeja.
// Só funciona se o ícone já estiver pronto (isTrayReady) e o processo filho existir.
function atualizarMenuTray() {
    if (ctx.systrayInstance && ctx.isTrayReady && ctx.systrayInstance._process) {
        ctx.systrayInstance.sendAction({
            type: 'update-menu',
            menu: gerarConfigMenu().menu
        });
    }
}

function initSystray(appCtx) {
    ctx = appCtx;

    try {
        ctx.systrayInstance = new SysTray(gerarConfigMenu());

        ctx.systrayInstance.ready(() => {
            console.log("✅ Ícone da bandeja carregado.");
            ctx.isTrayReady = true;
        });

        // Callback de clique nos itens do menu da bandeja
        ctx.systrayInstance.onClick((action) => {
            const tituloClicado = action.item.title;

            if (tituloClicado.includes("Conectar") || tituloClicado.includes("Reconectar")) {
                console.log("\n▶️ Comando Recebido: Tentar Conexão MIDI");
                ctx.iniciarBuscaAutomatica();
            }
            else if (tituloClicado.includes("Abrir no Navegador")) {
                console.log("\n▶️ Comando Recebido: Abrindo Navegador");
                const url = `http://${os.hostname()}.local:4000`;
                exec(`start ${url}`);
            }
            else if (tituloClicado.includes("Sair e Encerrar")) {
                console.log("\n▶️ Comando Recebido: Encerrando o Servidor");
                if (ctx.midiEngine.close) ctx.midiEngine.close();
                process.exit(0);
            }
        });

    } catch (e) {
        console.error("Erro ao instanciar Systray:", e);
    }

    ctx.atualizarMenuTray = atualizarMenuTray;
}

module.exports = { initSystray };
