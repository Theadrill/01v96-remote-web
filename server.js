
const os = require('os');
os.networkInterfaces = () => {
  return {
    lo: [
      {
        address: '127.0.0.1',
        netmask: '255.0.0.0',
        family: 'IPv4',
        mac: '00:00:00:00:00:00',
        internal: true,
        cidr: '127.0.0.1/8'
      }
    ]
  };
};

// ============================================================================
// server.js — Orquestrador Principal do 01V96 Bridge Server
// ============================================================================
// Ponto de entrada do servidor. Responsável por:
// 1. Inicializar o sistema de logs (console -> file)
// 2. Importar módulos do core (MIDI, protocolo, cenas, estado, meters)
// 3. Criar servidor Express + HTTP + Socket.IO
// 4. Montar o objeto de contexto compartilhado (ctx) com todo estado global
// 5. Inicializar subsistemas na ordem correta:
//    - Config/Nomes/Steps (config.js)
//    - Bandeja do sistema (systray.js)
//    - Handlers MIDI (midi-handler.js)
//    - Gerenciamento de conexão (connection.js)
//    - Handlers Socket.IO (socket-handler.js)
//    - Sistema DMX (dmx.js)
// 6. Subir o servidor HTTP na porta configurada
// 7. Iniciar busca automática de mesa ou modo demo
// ============================================================================

// Node.js built-in modules
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const os = require('os');
const path = require('path');
const { exec } = require('child_process');

// --- INICIALIZAÇÃO DO LOGGER ---
const { setupLogger, overrideConsole } = require('./src/utils/logger');

const logger = setupLogger();
const logInfo = logger.info.bind(logger);
const logError = logger.error.bind(logger);

overrideConsole(logInfo, logError);

console.log('🚀 [SERVER] Iniciando servidor e sistema de logs...');
console.log('📂 [SERVER] Log gravando em:', path.join(__dirname, 'log', 'server_log.txt'));

// --- IMPORTAÇÃO DOS MÓDULOS CORE ---
// MidiPipeline legacy removed — use SyncManager instead
const midiEngine = require('./src/midi/midi-engine');
const protocol = require('./src/midi/protocol');
const stateManager = require('./src/state/state-manager');
const dummy = require('./src/state/meter_dummy');
const masterMeter = require('./src/state/master-meter');
const sceneManager = require('./src/state/scene_manager');
const SyncManager = require('./src/network/sync-manager');
const pairModule = require('./src/state/pair');

// --- SETUP DO SERVIDOR WEB ---
const app = express();
const server = http.createServer(app);
const io = new Server(server);

// ============================================================================
// OBJETO DE CONTEXTO COMPARTILHADO (ctx)
// ============================================================================
// Todos os subsistemas leem/escrevem neste objeto, eliminando variáveis
// globais e permitindo inicialização explícita na ordem correta.
// ============================================================================

const ctx = {
    // Raiz do projeto (__dirname do server.js)
    rootDir: __dirname,

    // Logger
    logInfo,
    logError,

    // Servidor Web
    io,

    // Variáveis Globais de Estado
    isConnected: false,          // Conexão MIDI ativa com a mesa
    isDemoMode: false,           // Modo demo (simulação sem mesa física)
    isSyncing: false,            // Flag para evitar múltiplas sincronias simultâneas
    isFullySynced: false,        // Flag para liberar os meters apenas após carga total

    // Buffers e timers de meter
    meterDataBuffer: new Array(64).fill(0),
    lastMeterTime: 0,            // Throttle de emissão de meters baseado em FPS
    lastActivityTime: 0,         // Timestamp da última mensagem recebida da mesa (watchdog)

    // Portas e busca
    buscaInterval: null,
    linhaBuscaAtiva: false,

    // Modo demo
    dummyMeterInterval: null,

    // Bandeja do sistema
    systrayInstance: null,
    isTrayReady: false,

    // Timers de debounce para nomes
    nameUpdateTimers: new Map(),

    // SyncManager (instanciado sob demanda na conexão)
    syncManager: null,

    // Configurações carregadas do config.json
    configConstants: {},

    // Módulos core (referências imutáveis)
    midiEngine,
    protocol,
    stateManager,
    dummy,
    masterMeter,
    sceneManager,
    SyncManager,
    pairModule
};

process.title = "01V96-BRIDGE-SERVER";

// --- INICIALIZAÇÃO DOS SUBSISTEMAS (ordem importa!) ---

// 1. Gerenciamento de configurações, nomes e steps
const { initConfig } = require('./src/core/config');
initConfig(ctx);

// Carregar nomes salvos imediatamente para que os clients vejam os nomes
// mesmo antes da sincronização completa com a mesa física.
ctx.loadNames();
// Carregar constantes de configuração
ctx.loadConfigConstants();

ctx.loadStepsCalibration();

// 2. Bandeja do sistema (ícone no tray do Windows)
const { initSystray } = require('./src/utils/systray');
initSystray(ctx);

// 3. Handler de dados MIDI (callback do midiEngine + modo demo)
const { initMidiHandler } = require('./src/midi/midi-handler');
initMidiHandler(ctx);

// 4. Gerenciamento de conexão/busca/sincronia
const { initConnection } = require('./src/network/connection');
initConnection(ctx);

// 5. Handlers Socket.IO (comunicação com frontend)
const { initSocketHandler } = require('./src/network/socket-handler');
initSocketHandler(ctx);

// 6. Sistema de iluminação DMX (ArtNet + Lumikit)
const { initDmx } = require('./src/dmx/dmx');
initDmx(ctx);

// --- ROTAS EXPRESS ---

app.use(express.static('public'));

// Os endpoints /api/names e /api/proxy foram movidos para src/api/macros.js
// para centralizar a lógica de API de macros e permitir acesso ao estado live.
const macroRoutes = require('./src/api/macros');
app.use('/api', macroRoutes);

// --- REGISTRO DOS HANDLERS SOCKET.IO ---
ctx.setupSocketHandlers();

// --- INICIALIZAÇÃO DO SERVIDOR ---
const PORT = process.env.PORT || 4000;
server.listen(PORT, '0.0.0.0', () => {
    const interfaces = os.networkInterfaces();
    const addresses = [];
    for (const k in interfaces) {
        for (const k2 in interfaces[k]) {
            const address = interfaces[k][k2];
            if (address.family === 'IPv4' && !address.internal) addresses.push(address.address);
        }
    }

    console.log(`\n=================================================`);
    console.log(`🚀 SERVIDOR 01V96 BRIDGE ATIVO`);
    console.log(`🌍 Disponível em: http://localhost:${PORT}`);
    addresses.forEach(addr => console.log(`   - Rede: http://${addr}:${PORT}`));
    console.log(`=================================================\n`);

    const config = ctx.loadConfig();

    // Abrir o navegador automaticamente apenas se a flag estiver ativa
    if (config.open_browser_startup !== false) {
        const url = `http://localhost:${PORT}`;
        exec(`start ${url}`);
    } else {
        console.log(`ℹ️ [CONFIG] Auto-abertura do navegador desativada. Acesse manualmente: http://localhost:${PORT}`);
    }

    if (config.demo_mode) {
        ctx.isDemoMode = true;
        ctx.iniciarDummy();
        console.log('ℹ️ [DEMO] Modo Demo ativo — busca na USB desativada.');
    } else {
        console.log("ℹ️ [INFO] Modo Demo desativado. Aguardando conexão física com Yamaha...");
    }

    // Busca automática na USB apenas se NÃO estiver em demo mode
    if (!config.demo_mode) {
        setTimeout(() => ctx.iniciarBuscaAutomatica(), ctx.configConstants.boot_delay_ms);

        // --- AUTO-START DMX (INTELIGENTE) ---
        // Apenas abre o app se ele não estiver rodando. Não mexe no USB no boot.
        setTimeout(() => {
            console.log('💡 [BOOT] Verificando sistema de iluminação...');
            ctx.startDmxApp(false);
        }, ctx.configConstants.dmx_boot_delay_ms);
    }
});
