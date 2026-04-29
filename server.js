// Node.js built-in modules
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const os = require('os');
const fs = require('fs');
const path = require('path');
const { exec, spawn } = require('child_process');

// Armazenar referências originais antes de sobrescrever
const originalConsoleLog = console.log;
const originalConsoleError = console.error;

// Sistema de Logs melhorado com proper error handling
const setupLogger = () => {
    const logDir = path.join(__dirname, 'log');
    if (!fs.existsSync(logDir)) {
        fs.mkdirSync(logDir, { recursive: true });
    }
    const logFile = path.join(logDir, 'server_log.txt');
    const logStream = fs.createWriteStream(logFile, { flags: 'a' });

    return {
        info: (...args) => {
            const timestamp = new Date().toISOString();
            const message = args.map(arg => typeof arg === 'object' ? JSON.stringify(arg, null, 2) : arg).join(' ');
            logStream.write(`[${timestamp}] INFO: ${message}\n`);
            originalConsoleLog.apply(console, args);
        },
        error: (...args) => {
            const timestamp = new Date().toISOString();
            const message = args.map(arg => typeof arg === 'object' ? JSON.stringify(arg, null, 2) : arg).join(' ');
            logStream.write(`[${timestamp}] ERROR: ${message}\n`);
            originalConsoleError.apply(console, args);
        }
    };
};

const logger = setupLogger();

// Wrapper functions to maintain compatibility
const logInfo = logger.info.bind(logger);
const logError = logger.error.bind(logger);

// Override console methods for backward compatibility
console.log = function (...args) {
    logInfo(...args);
};

console.error = function (...args) {
    logError(...args);
};

console.log('🚀 [SERVER] Iniciando servidor e sistema de logs...');
console.log('📂 [SERVER] Log gravando em:', path.join(__dirname, 'log', 'server_log.txt'));

// Carregar calibração do steps.json para sincronizar com o frontend
try {
    const stepsPath = path.join(__dirname, 'public', 'steps.json');
    if (fs.existsSync(stepsPath)) {
        const stepsData = JSON.parse(fs.readFileSync(stepsPath, 'utf8'));
        const masterMeter = require('./src/master-meter');
        masterMeter.setSteps(stepsData.master);
        console.log('✅ [SERVER] Calibração de steps carregada com sucesso do steps.json para o Master Meter');
    }
} catch (e) {
    console.error('❌ [SERVER] Erro ao carregar steps.json para o Master Meter:', e.message);
}

const SysTray = require('systray2').default;
// const dgram = require('dgram');

const midiEngine = require('./src/midi-engine');
const protocol = require('./src/protocol');
const stateManager = require('./src/state-manager');
const dummy = require('./src/meter_dummy');
const masterMeter = require('./src/master-meter');
// MidiPipeline legacy removed — use SyncManager instead
const sceneManager = require('./src/scene_manager');
const SyncManager = require('./src/sync-manager');

let dummyMeterInterval = null;
let syncManager = null;
let isDemoMode = false;

// Configurações serão carregadas do config.json
let configConstants = {};

const configFile = path.join(__dirname, 'config.json');
const namesFile = path.join(__dirname, 'names.json');

// Carregar configurações do config.json
const loadConfigConstants = () => {
  try {
    if (fs.existsSync(configFile)) {
      const loadedConfig = JSON.parse(fs.readFileSync(configFile, 'utf8'));
      // Extrair apenas as constantes de configuração (excluindo as configurações de conexão)
      configConstants = {
        meter_throttle_demo_ms: loadedConfig.meter_throttle_demo_ms || 33,
        meter_throttle_real_ms: loadedConfig.meter_throttle_real_ms || 50,
        watchdog_timeout_ms: loadedConfig.watchdog_timeout_ms || 5000,
        meter_poll_interval_ms: loadedConfig.meter_poll_interval_ms || 41,
        name_save_debounce_ms: loadedConfig.name_save_debounce_ms || 1000,
        scene_recall_delay_ms: loadedConfig.scene_recall_delay_ms || 2000,
        scene_save_delay_ms: loadedConfig.scene_save_delay_ms || 500,
        scene_resync_delay_ms: loadedConfig.scene_resync_delay_ms || 700,
        name_update_char_delay_ms: loadedConfig.name_update_char_delay_ms || 30,
        scheduler_tick_ms: loadedConfig.scheduler_tick_ms || 15,
        boot_delay_ms: loadedConfig.boot_delay_ms || 1500,
        dmx_boot_delay_ms: loadedConfig.dmx_boot_delay_ms || 3000
      };
    } else {
      // Valores padrão se o arquivo não existir
      configConstants = {
        meter_throttle_demo_ms: 33,
        meter_throttle_real_ms: 50,
        watchdog_timeout_ms: 5000,
        meter_poll_interval_ms: 41,
        name_save_debounce_ms: 1000,
        scene_recall_delay_ms: 2000,
        scene_save_delay_ms: 500,
        scene_resync_delay_ms: 700,
        name_update_char_delay_ms: 30,
        scheduler_tick_ms: 15,
        boot_delay_ms: 1500,
        dmx_boot_delay_ms: 3000
      };
    }
  } catch (err) {
    console.error('❌ [SERVER] Erro ao carregar config.json para constantes:', err.message);
    // Valores padrão em caso de erro
    configConstants = {
      meter_throttle_demo_ms: 33,
      meter_throttle_real_ms: 50,
      watchdog_timeout_ms: 5000,
      meter_poll_interval_ms: 41,
      name_save_debounce_ms: 1000,
      scene_recall_delay_ms: 2000,
      scene_save_delay_ms: 500,
      scene_resync_delay_ms: 700,
      name_update_char_delay_ms: 30,
      scheduler_tick_ms: 15,
      boot_delay_ms: 1500,
      dmx_boot_delay_ms: 3000
    };
  }
};

// Carregar nomes salvos imediatamente para que os clients vejam os nomes
// mesmo antes da sincronização completa com a mesa física.
loadNames();
// Carregar constantes de configuração
loadConfigConstants();


let meterDataBuffer = new Array(33).fill(0);
let lastMeterTime = 0;

const handleMIDIData = (midiData, rawMessage = null) => {
    // Qualquer tráfego MIDI (incluindo scene dumps) reseta o watchdog
    lastActivityTime = Date.now();

    // Intercepta cenas (Bulk Dumps grandes Type 00 e 02)
    if (sceneManager.handleMIDIData(rawMessage)) {
        return; // É um dump de cena, o Scene Manager já lidou com ele
    }

    if (!midiData) return;

    if (midiData.type === 'kSceneNumber') {
        console.log(`🎬 [SCENE CHANGE] Mudança de cena detectada pela mesa: ${midiData.value}`);
        sceneManager.setActiveScene(midiData.value);
    }

    // METER_DATA - processa channels 1-32 e Master
    if (midiData.type === 'METER_DATA') {
        if (!isFullySynced && !isDemoMode) return;

        if (midiData.isMaster) {
            // Master Meter (Stereo L/R) - Point 4 (Comando 0x21)
            // Usamos a lógica de calibração do master-meter.js que segue o steps.json
            if (rawMessage) {
                const mLevel = masterMeter.parse(rawMessage);
                if (mLevel !== null) {
                    meterDataBuffer[32] = mLevel;
                }
            }
        } else {
            for (let i = 0; i < 32; i++) {
                if (midiData.levels[i] !== undefined) {
                    // Nos grupos 13/26/127 (Universal Metering) a Yamaha já envia o valor escalonado (0-31) no byte alto
                    let level = midiData.levels[i];
                    if (level > 32) level = 32;
                    meterDataBuffer[i] = level;
                }
            }
        }

        // Emissão Throttled para a Web: METER_THROTTLE_DEMO_MS (~30fps) em demo, METER_THROTTLE_REAL_MS (~20fps) com mesa real
        const now = Date.now();
        const throttleMs = isDemoMode ? configConstants.meter_throttle_demo_ms : configConstants.meter_throttle_real_ms;
        if (now - lastMeterTime > throttleMs) {
            io.emit('meterData', meterDataBuffer);
            lastMeterTime = now;
        }
        return;
    }


    if (midiData.type === 'HEARTBEAT') return;

    if (midiData.type === 'kChannelInput/kChannelIn') {
        const hex = midiData.raw ? Buffer.from(midiData.raw).toString('hex').toUpperCase() : 'N/A';
        console.log(`🎯 [PATCH CHANGE] Canal ${midiData.channel + 1}: Patch = ${midiData.value} ${midiData.value === 0 ? `(DEBUG HEX: ${hex})` : ''}`);
    }

    // Repassa o objeto INTEIRO para o gerenciador de estado (incluindo letras de nomes)
    // if (midiData.type === 'updateNameChar') {
    //     console.log(`🌐 [EMIT -> WEB] Name update for Ch:${midiData.channel} Pos:${midiData.charIndex} Char:'${midiData.char}'`);
    // }
    stateManager.updateState(midiData);
    io.emit('update', midiData);

    // Se recebermos letras de nomes via MIDI (ex: mudança feita na mesa física),
    // garantimos que o names.json seja atualizado para manter a sincronia.
    if (midiData.type === 'updateNameChar' || midiData.type === 'updateSceneChar') {
        saveNames();
    }
}

function iniciarDummy() {
    console.log("🛠️ [MODO DEMO] Ativando simulação automática de SysEx...");
    if (dummyMeterInterval) clearInterval(dummyMeterInterval);
    dummyMeterInterval = dummy.startMeterSimulation((sysex) => {
        // Log para conferência técnica
        if (Math.random() < 0.01) {
            const hex = Buffer.from(sysex).toString('hex').toUpperCase();
            console.log(`📥 [DUMMY MIDI] SysEx: ${hex.substring(0, 32)}...`);
        }

        const parsed = protocol.parseIncoming(sysex);
        if (parsed) handleMIDIData(parsed, sysex);
    });
}

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Variáveis Globais de Estado
let isConnected = false;
let systrayInstance = null;
let isTrayReady = false;
let buscaInterval = null;
let linhaBuscaAtiva = false;
let lastActivityTime = 0; // Timestamp da última mensagem recebida da mesa
let isSyncing = false; // Flag para evitar múltiplas sincronias simultâneas
let isFullySynced = false; // Flag para liberar os meters apenas após carga total
const nameUpdateTimers = new Map();

process.title = "01V96-BRIDGE-SERVER";

app.use(express.static('public'));

const macroRoutes = require('./src/api/macros');
app.use('/api', macroRoutes);



// Os endpoints /api/names e /api/proxy foram movidos para src/api/macros.js
// para centralizar a lógica de API de macros e permitir acesso ao estado live.


// --- LÓGICA DA SYSTEM TRAY ---

function gerarConfigMenu() {
    return {
        menu: {
            icon: path.join(__dirname, 'public/favicon.ico'),
            title: "01V96 Control",
            tooltip: isConnected ? "Conectado à 01V96" : "Aguardando Conexão",
            items: [
                {
                    title: isConnected ? "🔄 Reconectar à Mesa" : "🔌 Conectar à Mesa",
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

try {
    systrayInstance = new SysTray(gerarConfigMenu());

    systrayInstance.ready(() => {
        console.log("✅ Ícone da bandeja carregado.");
        isTrayReady = true;
    });

    systrayInstance.onClick((action) => {
        const tituloClicado = action.item.title;

        if (tituloClicado.includes("Conectar") || tituloClicado.includes("Reconectar")) {
            console.log("\n▶️ Comando Recebido: Tentar Conexão MIDI");
            iniciarBuscaAutomatica();
        }
        else if (tituloClicado.includes("Abrir no Navegador")) {
            console.log("\n▶️ Comando Recebido: Abrindo Navegador");
            const url = `http://${os.hostname()}.local:4000`;
            require('child_process').exec(`start ${url}`);
        }
        else if (tituloClicado.includes("Sair e Encerrar")) {
            console.log("\n▶️ Comando Recebido: Encerrando o Servidor");
            if (midiEngine.close) midiEngine.close();
            process.exit(0);
        }
    });

} catch (e) {
    console.error("Erro ao instanciar Systray:", e);
}

function atualizarMenuTray() {
    if (systrayInstance && isTrayReady && systrayInstance._process) {
        systrayInstance.sendAction({
            type: 'update-menu',
            menu: gerarConfigMenu().menu
        });
    }
}


// --- FUNÇÕES DE APOIO E BUSCA ---

function loadConfig() {
    let config = { inIdx: null, outIdx: null, "loopmidi-monitor": false, open_browser_startup: true };
    if (fs.existsSync(configFile)) {
        try {
            const loaded = JSON.parse(fs.readFileSync(configFile, 'utf8'));
            config = { ...config, ...loaded };
        } catch (err) {
            // Ignora erro de parsing
        }
    }
    return config;
}

function saveConfig(configData) {
    try { fs.writeFileSync(configFile, JSON.stringify(configData, null, 2)); } catch (err) {
        // Ignora erro de escrita
    }
}

function loadNames() {
    try {
        console.log(`🔍 [NAMES] Tentando carregar: ${namesFile}`);
        if (!fs.existsSync(namesFile)) {
            console.log("⚠️ [NAMES] Arquivo names.json não encontrado no boot.");
            return false;
        }
        const data = fs.readFileSync(namesFile, 'utf8');
        const names = JSON.parse(data);
        let count = 0;
        for (const key in names) {
            const idx = parseInt(key);
            if (!isNaN(idx)) {
                stateManager.setChannelName(idx, names[key]);
                count++;
            }
        }
        console.log(`✅ [NAMES] ${count} nomes injetados no State Manager com sucesso.`);
        return true;
    } catch (err) {
        console.error("❌ [NAMES] Erro fatal no loadNames:", err);
    }
    return false;
}

let saveNamesTimer = null;
function saveNames() {
    if (saveNamesTimer) clearTimeout(saveNamesTimer);
    saveNamesTimer = setTimeout(() => {
        const s = stateManager.getState();
        const names = {};
        // Inputs (0-31)
        for (let i = 0; i < 32; i++) { names[i] = s.channels[i].name; }
        // Mixes (36-43)
        for (let i = 0; i < 8; i++) { if (s.mixes[i]) names[36 + i] = s.mixes[i].name; }
        // Buses (44-51)
        for (let i = 0; i < 8; i++) { if (s.buses[i]) names[44 + i] = s.buses[i].name; }
        // Stereo (52)
        if (s.master) names[52] = s.master.name;
        try {
            fs.writeFileSync(namesFile, JSON.stringify(names, null, 2));
            console.log("💾 [NAMES] Nomes persistidos em names.json");
        } catch (err) {
            console.error("❌ [NAMES] Erro ao salvar nomes:", err);
        }
        saveNamesTimer = null;
    }, configConstants.name_save_debounce_ms); // 1s de debounce para agrupar as 16 letras
}

function iniciarBuscaAutomatica() {
    if (buscaInterval) clearInterval(buscaInterval);

    atualizarMenuTray();

    console.log("");

    // Extrai a função de busca para melhorar legibilidade
    const buscarPortaYamaha = () => {
        const horaAtual = new Date().toLocaleTimeString('pt-BR');
        const config = loadConfig();
        const searchMonitor = config["loopmidi-monitor"];

        const msg = searchMonitor ? '🔍 Buscando portas com "monitor" no nome...' : '🔍 Buscando Yamaha 01V96 na porta USB...';
        process.stdout.write(`\r[${horaAtual}] ${msg} \x1b[K`);
        linhaBuscaAtiva = true;

        const portas = midiEngine.getAvailablePorts();
        const inputs = portas.inputs || portas;
        const outputs = portas.outputs || portas;

        let foundInIdx = -1;
        let foundOutIdx = -1;

        const matchesCriteria = (port) => {
            const name = port.name || port;
            if (!name) return false;
            const lower = String(name).toLowerCase();
            if (searchMonitor) {
                return lower.includes('monitor');
            }
            // Critério específico para Yamaha física: deve ter 'yamaha' e terminar com '-1' (ou conter '-1')
            return lower.includes('yamaha') && lower.includes('-1');
        };

        for (let i = 0; i < inputs.length; i++) {
            if (matchesCriteria(inputs[i])) { foundInIdx = i; break; }
        }

        for (let i = 0; i < outputs.length; i++) {
            if (matchesCriteria(outputs[i])) { foundOutIdx = i; break; }
        }

        if (foundInIdx !== -1 && foundOutIdx !== -1) {
            process.stdout.write("\n");
            linhaBuscaAtiva = false;

            const targetName = searchMonitor ? "loopMIDI (Monitor)" : "Yamaha 01V96";
            console.log(`[${horaAtual}] 🎯 ${targetName} encontrada! (In: ${foundInIdx}, Out: ${foundOutIdx}). Conectando...`);

            clearInterval(buscaInterval);
            // Atualizamos o config mantendo o flag de monitor
            config.inIdx = foundInIdx;
            config.outIdx = foundOutIdx;
            saveConfig(config);
            executarConexao(foundInIdx, foundOutIdx);
            return true; // Indica que encontrou e conectou
        }
        return false; // Ainda não encontrou
    };

    buscaInterval = setInterval(() => {
        if (isConnected) {
            clearInterval(buscaInterval);
            if (linhaBuscaAtiva) {
                process.stdout.write("\n");
                linhaBuscaAtiva = false;
            }
            return;
        }

        buscarPortaYamaha();
    }, 1000);
}

function executarConexao(inIdx, outIdx, targetSocket = null) {
    const config = loadConfig();
    const searchMonitor = config["loopmidi-monitor"];

    // --- O PORTEIRO: Verifica se a porta solicitada (pelo radar ou pela WEB) corresponde ao equipamento esperado ---
    const portas = midiEngine.getAvailablePorts();
    const inputs = portas.inputs || portas;
    const outputs = portas.outputs || portas;

    let inName = inputs[inIdx];
    let outName = outputs[outIdx];

    if (inName && inName.name) inName = inName.name;
    if (outName && outName.name) outName = outName.name;

    // Extrai a função de validação para melhorar legibilidade
    const ehPortaValida = (name) => {
        if (!name) return false;
        const lower = String(name).toLowerCase();
        if (searchMonitor) {
            return lower.includes('monitor');
        }
        // Critério específico para Yamaha física: deve ter 'yamaha' e terminar com '-1' (ou conter '-1')
        return lower.includes('yamaha') && lower.includes('-1');
    };

    if (!ehPortaValida(inName) || !ehPortaValida(outName)) {
        if (linhaBuscaAtiva) { process.stdout.write("\n"); linhaBuscaAtiva = false; }
        console.log(`🚫 Conexão bloqueada: A porta [${inName || 'Desconhecida'}] não corresponde aos critérios (${searchMonitor ? 'Monitor' : 'Yamaha'}).`);
        return { success: false, error: searchMonitor ? "A porta não contém 'monitor' no nome." : "Equipamento não é uma Yamaha 01V96." };
    }
    // ------------------------------------------------------------------------------------------------

    const result = midiEngine.connectPorts(inIdx, outIdx, handleMIDIData);

    if (linhaBuscaAtiva) { process.stdout.write("\n"); linhaBuscaAtiva = false; }

    if (result.success) {
        isConnected = true;
        console.log(`✅ Conexão MIDI estabelecida com sucesso! (${inName})`);
        atualizarMenuTray();

        // --- COOLDOWN ESTRATÉGICO E SINCRONIA GERAL ---
        // Aguardamos 5s para os buffers residuais assentarem antes de iniciar a carga massiva
        sceneManager.setIO(io);
        setTimeout(async () => {
            if (isConnected) {
                if (!syncManager) syncManager = new SyncManager(midiEngine.getScheduler(), io, sceneManager);
                
                // Configura a taxa de tick do scheduler baseado na configuração
                midiEngine.setSchedulerTickMs(configConstants.scheduler_tick_ms);
                
                // Reinicia flags de sincronismo
                isFullySynced = false;
                isSyncing = true;

                if (!syncManager.onSyncComplete) {
                    syncManager.onSyncComplete = function () {
                        isFullySynced = true;
                        isSyncing = false;
                        saveNames(); 
                        try { io.emit('sync', stateManager.getState()); } catch (e) { }
                        try { io.emit('syncStatus', { active: false }); } catch (e) { }
                        console.log('✅ [SERVER] SyncManager sinalizou conclusão (Cenas + Parâmetros + Nomes).');
                    };
                }
                
                // O fire() agora é async e cuida de baixar as cenas antes dos parâmetros
                syncManager.fire(targetSocket);
            }
        }, 5000);


        io.emit('connectionState', { connected: true, demo_mode: loadConfig().demo_mode });

        // Loop contínuo de requests do Meter (Heartbeat)
        if (global.meterInterval) clearInterval(global.meterInterval);
        lastActivityTime = Date.now();

        global.meterInterval = setInterval(() => {
            if (!isConnected) return;

            if (Date.now() - lastActivityTime > configConstants.watchdog_timeout_ms) {
                console.log("\n⚠️ Watchdog: Timeout de conexão. A mesa parou de responder.");
                handleDisconnection();
                return;
            }

            // Meters só rodam após sincronia completa
            if (!isFullySynced) return;

            // [NATIVE METER] Stereo Master (Point 4) via MasterMeter module (AirFader Approach)
            const sMaster = midiEngine.send(masterMeter.buildRequest(), 2);

            // [NATIVE METER] Input Channels (Group 32/33) via Parameter Request (Classic approach)
            midiEngine.send([240, 67, 48, 62, 127, 33, 0, 0, 0, 0, 31, 247], 2);
            midiEngine.send([240, 67, 48, 62, 127, 32, 0, 0, 0, 0, 31, 247], 2);
            midiEngine.send([240, 67, 48, 62, 26, 33, 0, 0, 0, 0, 31, 247], 2);
            midiEngine.send([240, 67, 48, 62, 13, 33, 0, 0, 0, 0, 31, 247], 2);
            midiEngine.send([240, 67, 48, 62, 13, 32, 0, 0, 0, 0, 31, 247], 2);

            // Não tratamos falha de enfileiramento como erro se estivermos usando o MidiScheduler,
            // pois o scheduler rejeita requests de priority 2 quando q0/q1 estão ocupadas (comportamento esperado).
            const sched = midiEngine.getScheduler ? midiEngine.getScheduler() : null;
            const allFailed = (!sMaster); // Simplificado: Se o principal falhar e não houver scheduler ativo
            if (allFailed && (!sched || !sched.isRunning)) {
                console.log("\n⚠️ Watchdog: Falha crítica no driver MIDI.");
                handleDisconnection();
            }
        }, configConstants.meter_poll_interval_ms); // Otimizado: Studio Manager Native Polling Rate (~24fps)
    } else {
        handleDisconnection(false);
    }
    return result;
}

function handleDisconnection(retry = true) {
    if (!isConnected && retry) return; // Evita duplicação se já estiver buscando

    isConnected = false;
    // Tenta enviar o comando de parada de meter para limpar o tráfego na mesa física (se ainda houver conexão física)
    try {
        midiEngine.send(masterMeter.buildStopRequest());
    } catch (err) {
        // Ignora erro de envio no disconnect
    }

    if (global.meterInterval) clearInterval(global.meterInterval);
    if (dummyMeterInterval) {
        clearInterval(dummyMeterInterval);
        dummyMeterInterval = null;
    }

    io.emit('connectionState', { connected: false, demo_mode: loadConfig().demo_mode });

    if (retry) {
        console.log("❌ Conexão perdida. Tentando reconectar automaticamente...");
        iniciarBuscaAutomatica();
    }
}

async function triggerSync(targetSocket = null, forceNames = false, type = 'normal') {
    if (syncManager) {
        isSyncing = true;
        isFullySynced = false;
        return syncManager.fire(targetSocket, forceNames, type);
    }
    console.warn('⚠️ [Sync] Tentativa de sync sem SyncManager ativo ou conexão MIDI.');
}

async function syncNames() {
    if (syncManager) {
        isSyncing = true;
        isFullySynced = false;
        return syncManager.syncNamesOnly();
    }
    console.warn('⚠️ [Sync] Tentativa de sync de nomes sem SyncManager ativo.');
}


// --- COMUNICAÇÃO WEB (SOCKET.IO) ---

io.on('connection', (socket) => {
    const currentConfig = loadConfig();
    socket.emit('portsList', { available: midiEngine.getAvailablePorts(), savedConfig: currentConfig });
    socket.emit('sync', stateManager.getState());
    socket.emit('scenesUpdated', sceneManager.getState());
    socket.emit('syncStatus', { active: isSyncing });
    socket.emit('connectionState', { connected: isConnected, demo_mode: currentConfig.demo_mode });

    socket.on('requestConnect', async (data) => {
        const config = loadConfig();
        // Se já estivermos conectados na mesma porta, não precisamos disparar um triggerSync global
        if (isConnected && config.inIdx === data.inIdx && config.outIdx === data.outIdx) {
            console.log("🔌 Cliente reconectando, mas MIDI já está ativo nestas portas. Enviando apenas sync local...");
            socket.emit('sync', stateManager.getState());
            socket.emit('scenesUpdated', sceneManager.getState());
            socket.emit('connectResult', { success: true });
            return;
        }

        config.inIdx = data.inIdx;
        config.outIdx = data.outIdx;
        saveConfig(config);
        // Se a web pedir para conectar, passa pelo mesmo porteiro!
        const result = executarConexao(data.inIdx, data.outIdx, socket);
        socket.emit('connectResult', result);
    });

    socket.on('forceSync', () => {
        return triggerSync(null, true, 'is_scene');
    }); // Agora forceSync também força nomes e bloqueia a UI

    socket.on('refreshNames', () => {
        console.log("🔄 Solicitação manual de atualização de nomes...");
        return syncNames();
    });

    socket.on('syncNamesOnly', () => {
        console.log("🔄 Solicitação manual de SINCRONIA DE NOMES...");
        syncNames();
    });

    socket.on('recallScene', (data) => {
        const index = data.index;
        if (!isConnected || index === undefined) return;

        console.log(`🎬 [SCENE] Comando recebido: RECALL Cena ${index}`);
        const sysex = [0xF0, 0x43, 0x10, 0x3E, 0x7F, 0x10, 0x00, 0x00, index, 0x02, 0x00, 0xF7];
        midiEngine.send(sysex);

        // Previne override do index 0 do Edit Buffer
        sceneManager.setActiveScene(index);

        // Copia localmente o nome da biblioteca para o Edit Buffer sem precisar baixar tudo de novo
        const cachedParams = sceneManager.getScenes().find(s => s && s.index === index);
        if (cachedParams && sceneManager.currentScene) {
            sceneManager.currentScene.name = cachedParams.name;
        }

        // Os motores dos faders demoram cerca de 1 a 1.5s para realizar as viagens físicas longas.
        // A CPU da 01V96 ignora tráfego SysEx moderado/pesado enquanto opera motores massivamente.
        // Esperamos 2000ms cravados para o desk assentar antes de pedir a avalanche de updates.
        setTimeout(() => {
            if (isConnected) {
                io.emit('scenesUpdated', {
                    scenes: sceneManager.getScenes(),
                    currentScene: sceneManager.getCurrentScene()
                });

                // Manda sync para recarregar todos os faders na nova view
                // Usamos o tipo 'is_scene' para que a UI bloqueie interações
                triggerSync(null, false, 'is_scene');
            }
        }, configConstants.scene_recall_delay_ms);
    });

    socket.on('saveScene', (data) => {
        const { index, newName } = data;
        if (!isConnected || index === undefined || !sceneManager.currentScene) return;

        const originalName = (sceneManager.currentScene.name || "").trim();
        const targetNameRaw = (newName || originalName).trim();
        const targetName = targetNameRaw.padEnd(16, ' ').substring(0, 16);

        console.log(`\n🎬 [SCENE SAVE] Iniciando salvamento no slot ${index}`);
        console.log(`📝 Nome original: "${originalName}" | Nome escolhido: "${targetName.trim()}"`);

        // Estágio 1: STORE (Sempre salva com o nome que está no Edit Buffer da mesa)
        // Sysex Store: F0 43 10 3E 7F 10 20 00 [INDEX] 02 00 F7
        const storeSysex = [0xF0, 0x43, 0x10, 0x3E, 0x7F, 0x10, 0x20, 0x00, index, 0x02, 0x00, 0xF7];
        midiEngine.send(storeSysex);
        console.log(`✅ Estágio 1: Cena salva no slot ${index} com o nome original.`);

        // Verifica se precisa de RENAME (Estágio 2)
        // Normaliza para comparação (Case-Insensitive e Trim)
        const normalizedOriginal = originalName.toUpperCase().trim();
        const normalizedTarget = targetNameRaw.toUpperCase().trim();

        if (normalizedTarget !== normalizedOriginal) {
            console.log(`⚠️ Nomes diferentes detectados ("${normalizedOriginal}" vs "${normalizedTarget}")! Aguardando delay de segurança...`);

            setTimeout(() => {
                // Sysex Rename: F0 43 10 3E 7F 10 40 00 [INDEX] [16 BYTES NAME] F7
                const nameBytes = [];
                const finalName = normalizedTarget.padEnd(16, ' ').substring(0, 16);
                for (let i = 0; i < 16; i++) {
                    nameBytes.push(finalName.charCodeAt(i) || 0x20);
                }

                const renameSysex = [0xF0, 0x43, 0x10, 0x3E, 0x7F, 0x10, 0x40, 0x00, index, ...nameBytes, 0xF7];
                midiEngine.send(renameSysex);
                console.log(`✅ Estágio 2: Enviado comando RENAME para "${normalizedTarget}" no slot ${index}.`);

                // Atualiza biblioteca local para refletir a mudança imediatamente no UI
                sceneManager.scenes[index] = { index, name: normalizedTarget };

                // Marca o slot como ativo no gerenciador local para atualizar o ID exibido
                if (index > 0) {
                    sceneManager.setActiveScene(index);
                    io.emit('currentScene', sceneManager.getCurrentScene());
                    console.log(`📡 [SCENE] Atualizado activeSceneIndex para slot ${index} após save.`);
                }

                // Se salvou na cena atual, atualiza o nome da cena ativa (mesmo se for diferente do original)
                if (sceneManager.activeSceneIndex === index || index === 0) {
                    sceneManager.currentScene = { index, name: normalizedTarget };
                    io.emit('currentScene', sceneManager.currentScene);
                    console.log(`📡 [SCENE] Emitido 'currentScene' com novo nome: ${normalizedTarget}`);
                }

                io.emit('scenesUpdated', sceneManager.getState());

                // Força uma re-leitura da biblioteca de cenas a partir da mesa
                // após pequenas latências do hardware para garantir consistência
                setTimeout(() => {
                    if (typeof sceneManager.fetchScenes === 'function' && midiEngine) {
                        sceneManager.fetchScenes(midiEngine).catch(err => {
                            console.log('⚠️ [SCENE] Falha ao re-sincronizar cenas:', err && err.message ? err.message : err);
                        });
                    }
                }, configConstants.scene_resync_delay_ms);
            }, configConstants.scene_save_delay_ms); // Delay de meio segundo conforme solicitado
        } else {
            console.log(`✅ Nomes são idênticos (ignorando case/espaços). Salvamento concluído.`);
            // Atualiza biblioteca local mesmo se for igual (para garantir consistência caso o slot estivesse vazio)
            sceneManager.scenes[index] = { index, name: normalizedOriginal };

            // Se salvou na cena atual, garante que o currentScene esteja sincronizado
            if (sceneManager.activeSceneIndex === index || index === 0) {
                sceneManager.currentScene = { index, name: normalizedOriginal };
                io.emit('currentScene', sceneManager.currentScene);
                console.log(`📡 [SCENE] Emitido 'currentScene' com nome original: ${normalizedOriginal}`);
            } else if (index > 0) {
                // Mesmo que não fosse a cena ativa, atualizamos o activeSceneIndex para refletir o slot salvo
                sceneManager.setActiveScene(index);
                io.emit('currentScene', sceneManager.getCurrentScene());
                console.log(`📡 [SCENE] activeSceneIndex atualizado para slot ${index} (igual ao save).`);
            }

            io.emit('scenesUpdated', sceneManager.getState());
        }
    });

    socket.on('deleteScene', (data) => {
        const index = data.index;
        if (!isConnected || index === undefined || index < 1 || index > 99) return;

        console.log(`🗑️ [SCENE DELETE] Comando recebido: DELETAR Cena ${index}`);

        // Comando de Clear Library: F0 43 10 3E 7F 10 60 00 [INDEX] F7
        const deleteSysex = [0xF0, 0x43, 0x10, 0x3E, 0x7F, 0x10, 0x60, 0x00, index, 0xF7];
        midiEngine.send(deleteSysex);
        console.log(`✅ [SCENE DELETE] Comando enviado para deletar slot ${index}.`);

        // Atualiza a biblioteca local
        sceneManager.scenes[index] = null;

        io.emit('scenesUpdated', sceneManager.getState());

        // Re-sincroniza após pequeno delay
        setTimeout(() => {
            if (typeof sceneManager.fetchScenes === 'function' && midiEngine) {
                sceneManager.fetchScenes(midiEngine).catch(err => {
                    console.log('⚠️ [SCENE DELETE] Falha ao re-sincronizar cenas:', err && err.message ? err.message : err);
                });
            }
        }, configConstants.scene_resync_delay_ms);
    });

    socket.on('toggleDemo', (data) => {
        const config = loadConfig();
        config.demo_mode = data.enabled;
        isDemoMode = data.enabled;
        saveConfig(config);

        // Notify all clients about the demo_mode change so overlay updates
        io.emit('connectionState', { connected: isConnected, demo_mode: data.enabled });

        if (data.enabled) {
            // Para a busca automática na USB — não precisamos da mesa física
            if (buscaInterval) {
                clearInterval(buscaInterval);
                buscaInterval = null;
                console.log('🛑 [DEMO] Busca automática na USB suspensa.');
            }
            iniciarDummy();
        } else {
            console.log("🛑 Parando Simulação de Meters...");
            if (dummyMeterInterval) clearInterval(dummyMeterInterval);
            dummyMeterInterval = null;

            // Pequeno delay para garantir que a zeragem ocorra após os últimos pulsos
            setTimeout(() => {
                const zeros = new Array(32).fill(0);
                meterDataBuffer = zeros;
                io.emit('meterData', zeros);
                console.log("🧹 Meters zerados com sucesso.");
            }, 100);

            // Retoma a busca pela mesa física
            if (!isConnected) {
                console.log('🔍 [DEMO OFF] Retomando busca automática na USB...');
                iniciarBuscaAutomatica();
            }
        }
    });

    socket.on('updateMeterConfig', (data) => {
        const config = loadConfig();
        config.meter_opacity = data.opacity;
        saveConfig(config);
    });

    socket.on('updateOpenBrowser', (data) => {
        const config = loadConfig();
        config.open_browser_startup = data.enabled;
        saveConfig(config);
    });

    socket.on('updateName', (data) => {
        const { channel, name } = data;
        const limitedName = (name || '').substring(0, 16);
        // Suporta Inputs(0-31), Mixes(36-43), Buses(44-51) e Master(52)
        const channelState = stateManager.getChannelStateById(channel);
        if (channelState) {
            // 1. Atualiza e salva o estado no servidor
            stateManager.setChannelName(channel, limitedName);
            saveNames();

            // 2. BROADCAST: Envia para TODOS os clientes (Socket.io) para atualizar o UI em tempo real sem refresh
            io.emit('updateName', { channel, name: limitedName });

            // 3. MIDI SYNC: Envia para a mesa física com Debounce e Intervalo de Segurança
            if (isConnected) {
                if (nameUpdateTimers.has(channel)) clearTimeout(nameUpdateTimers.get(channel));

                const timer = setTimeout(async () => {
                    console.log(`📝 [NAMES] Sincronizando com Yamaha Ch:${channel + 1} -> "${limitedName}"`);
                    const paddedName = limitedName.padEnd(16, ' ').substring(0, 16);

                    for (let i = 0; i < 16; i++) {
                        const charCode = paddedName.charCodeAt(i);
                        const msg = protocol.buildNameChange(channel, i, charCode);
                        if (msg) midiEngine.send(msg);
                        await new Promise(r => setTimeout(r, configConstants.name_update_char_delay_ms)); // 30ms para estabilidade do visor da mesa
                    }

                    // Após enviar todas as letras, solicita uma confirmação da mesa para garantir sincronia total
                    const numChars = (channel >= 36) ? 16 : 4; // Canais de input usam 4 chars no visor curto, saídas 16
                    for (let i = 0; i < numChars; i++) {
                        const req = protocol.buildNameRequest(channel, i);
                        if (req) midiEngine.send(req);
                    }

                    nameUpdateTimers.delete(channel);
                }, 500); // Debounce de 500ms facilita a digitação fluida

                nameUpdateTimers.set(channel, timer);
            }
        }
    });

    socket.on('requestDynamics', (data) => {
        const { channel } = data;
        if (channel === undefined || !isConnected) return;

        // USA O BUSCADOR INTELIGENTE PARA PEGAR O ESTADO (INPUT, MIX, BUS OU MASTER)
        const currentState = stateManager.getChannelStateById(channel);
        if (!currentState) return;

        socket.emit('dynamicsState', {
            channel,
            gate: currentState.gate || { on: false },
            comp: currentState.comp || { on: false }
        });
    });

    socket.on('requestEqAtt', (data) => {
        const { channel } = data;
        if (channel === undefined || !isConnected) return;

        const req = protocol.buildRequest('kInputAttenuator/kAtt', channel);
        if (req) midiEngine.send(req);
    });

    // --- INJETOR DE MODS (SYSEX DIRETO) ---
    socket.on('sysex', (rawBytes) => {
        if (!isConnected || !rawBytes) return;
        // Espera um array de números [240, 67, ...]
        midiEngine.send(rawBytes);
    });

    socket.on('control', (data) => {
        if (data && data.type !== 'HEARTBEAT') {
            console.log(`📡 [WEB -> MESA] Comando: ${data.type} Ch:${data.channel} Val:${data.value}`);
        }
        if (data.type === 'kChannelInput/kChannelIn') {
            console.log(`🌐 [BROWSER -> SERVER] Mudança de Patch Solicitada: Canal ${data.channel + 1} -> Patch ${data.value}`);
        }

        // Bloqueio Total Offline (COMENTADO PARA DEBUG)
        // if (!isConnected) return;

        // Atualiza o estado na memória do servidor
        stateManager.updateState(data);
        io.emit('update', data);

        const isBinary = data.type.includes('On') || data.type.includes('Solo');
        let converter = isBinary ? protocol.CONVERTERS.onToBytes : protocol.CONVERTERS.faderToBytes;

        // Se for EQ Gain (termina em G), Gains em geral, Attenuator ou Dynamics (Threshold/Range), usa conversor de assinado (28-bit)
        if (data.type.toLowerCase().includes('att') ||
            (data.type.includes('EQ/') && data.type.endsWith('G')) ||
            data.type.includes('Gain') ||
            data.type.includes('Threshold') ||
            data.type.includes('Range')) {
            converter = protocol.CONVERTERS.signedToBytes;
        }

        const sysex = protocol.buildChange(data.type, data.channel, data.value, converter);
        if (sysex) {
            const hex = Buffer.from(sysex).toString('hex').toUpperCase();
            console.log(`📤 [MIDI OUT] ${data.type} (CH ${data.channel + 1}): Val ${data.value} -> SysEx: ${hex}`);
            midiEngine.send(sysex);
        }
    });

    socket.on('resetDmx', () => {
        console.log('💡 [DMX] Reset solicitado via interface WEB.');
        resetDmxSystem();
    });
});

function startDmxApp(force = false) {
    const exePath = path.join(__dirname, 'ArtNetToDMX_FTDI', 'ArtNetToDMX.exe');
    
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

function resetDmxSystem() {
    console.log('🚀 [DMX] Iniciando procedimento de reset de hardware (USB) e software...');

    // 1. Matar o processo para liberar o handle do USB
    exec('taskkill /F /IM ArtNetToDMX.exe', () => {
        // 2. Delay para o Windows processar o fechamento
        setTimeout(() => {
            console.log('🔧 [DMX] Executando reset USB elevado via PowerShell (pnputil)...');
            const psCommand = `powershell -Command "Start-Process powershell -ArgumentList '-NoProfile -Command $dev = Get-PnpDevice | Where-Object { $_.InstanceId -like ''*VID_0403&PID_6001*'' -or $_.FriendlyName -like ''*USB Serial Converter*'' } | Select-Object -First 1; if ($dev) { pnputil /restart-device $dev.InstanceId }' -Verb RunAs -WindowStyle Hidden"`;
            
            exec(psCommand, (psErr) => {
                if (psErr) console.error('❌ [DMX] Erro ao disparar reset elevado:', psErr.message);
                else console.log('✅ [DMX] Comando de reset enviado para o Windows.');

                // 3. Reabrir o app após o reset do hardware
                setTimeout(() => {
                    startDmxApp(true); // 'true' para garantir que ele abra mesmo que o tasklist demore a atualizar
                }, 1500);
            });
        }, 1000);
    });
}

function updateLumikitConfig() {
    const config = loadConfig();
    const lumikitIps = config.lumikit_ips || [];
    if (lumikitIps.length === 0) return;

    const infoPath = path.join(__dirname, 'ArtNetToDMX_FTDI', 'info');
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

    const config = loadConfig();

    // Abrir o navegador automaticamente apenas se a flag estiver ativa
    if (config.open_browser_startup !== false) {
        const url = `http://localhost:${PORT}`;
        exec(`start ${url}`);
    } else {
        console.log(`ℹ️ [CONFIG] Auto-abertura do navegador desativada. Acesse manualmente: http://localhost:${PORT}`);
    }

    if (config.demo_mode) {
        isDemoMode = true;
        iniciarDummy();
        console.log('ℹ️ [DEMO] Modo Demo ativo — busca na USB desativada.');
    } else {
        console.log("ℹ️ [INFO] Modo Demo desativado. Aguardando conexão física com Yamaha...");
    }

    // loadNames() movido para o início para agilizar o boot dos clients

    // Busca automática na USB apenas se NÃO estiver em demo mode
    if (!config.demo_mode) {
        setTimeout(() => iniciarBuscaAutomatica(), configConstants.boot_delay_ms);
        
        // --- AUTO-START DMX (INTELIGENTE) ---
        // Apenas abre o app se ele não estiver rodando. Não mexe no USB no boot.
        setTimeout(() => {
            console.log('💡 [BOOT] Verificando sistema de iluminação...');
            startDmxApp(false);
        }, configConstants.dmx_boot_delay_ms);
    }
});