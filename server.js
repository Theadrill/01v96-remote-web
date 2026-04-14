const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const os = require('os');
const fs = require('fs');
const path = require('path');
const SysTray = require('systray2').default;
const dgram = require('dgram');

const midiEngine = require('./src/midi-engine');
const protocol = require('./src/protocol');
const stateManager = require('./src/state-manager');
const dummy = require('./src/meter_dummy');
const masterMeter = require('./src/master-meter');
const { exec } = require('child_process');
const MidiPipeline = require('./src/midi-pipeline');
const sceneManager = require('./src/scene_manager');

let dummyMeterInterval = null;
const syncPipeline = new MidiPipeline(midiEngine);


let meterDataBuffer = new Array(33).fill(0);
let lastMeterTime = 0;

const handleMIDIData = (midiData, rawMessage = null) => {
    // Intercepta cenas (Bulk Dumps grandes Type 00 e 02)
    if (sceneManager.handleMIDIData(rawMessage)) {
        return; // É um dump de cena, o Scene Manager já lidou com ele
    }

    if (!midiData) return;
    lastActivityTime = Date.now();

    // Processamento Independente do Master Meter
    if (rawMessage) {
        const mLevel = masterMeter.parse(rawMessage);
        if (mLevel !== null) {
            meterDataBuffer[32] = mLevel;
        }
    }

    // O METER_DATA processa canais 1-32. O 33 (Master) vem isolado.
    if (midiData.type === 'METER_DATA') {
        // Se o grupo for 32 ou 33 (padrão 01V96 para Input Channels)
        if (midiData.group === 32 || midiData.group === 33) {
            for (let i = 0; i < 32; i++) {
                if (midiData.levels[i] !== undefined) {
                    meterDataBuffer[i] = midiData.levels[i];
                }
            }
        } else if (midiData.group === config.master_meter_group) {
            // Se for o grupo configurado para o Master Meter
            const mIdx = config.master_meter_offset || 0;
            if (midiData.levels[mIdx] !== undefined) {
                meterDataBuffer[32] = midiData.levels[mIdx];
            }
        }
    }

    // Emissão Throttled para a Web (apenas se sincronizado para evitar lag no boot)
    const now = Date.now();
    if (isFullySynced && (now - lastMeterTime > 50)) {
        io.emit('meterData', meterDataBuffer);
        lastMeterTime = now;
    }

    if (midiData.type === 'METER_DATA') return;


    if (midiData.type === 'HEARTBEAT') return;

    if (midiData.type === 'kChannelInput/kChannelIn') {
        const hex = midiData.raw ? Buffer.from(midiData.raw).toString('hex').toUpperCase() : 'N/A';
        console.log(`🎯 [PATCH CHANGE] Canal ${midiData.channel + 1}: Patch = ${midiData.value} ${midiData.value === 0 ? `(DEBUG HEX: ${hex})` : ''}`);
    }

    // Repassa o objeto INTEIRO para o gerenciador de estado (incluindo letras de nomes)
    if (midiData.type === 'updateNameChar') {
        console.log(`🌐 [EMIT -> WEB] Name update for Ch:${midiData.channel} Pos:${midiData.charIndex} Char:'${midiData.char}'`);
    }
    stateManager.updateState(midiData);
    io.emit('update', midiData);
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
        if (parsed) handleMIDIData(parsed);
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
let hasSyncedNamesThisSession = false; // Flag para garantir que o server busque na mesa pelo menos 1 vez por boot
const nameUpdateTimers = new Map();

// Fila para pedidos de Dynamics, evitando encavalamento de MIDI
let dynamicsQueue = [];

process.title = "01V96-BRIDGE-SERVER";

app.use(express.static('public'));

// ===============================================
// API DE MODS / MACROS (VERSÃO MULTI-PRESET)
// ===============================================

// Endpoint de Reconhecimento de Hosts
app.get('/api/macros/hosts', (req, res) => {
    const hostsPath = path.join(__dirname, 'public/modules/macros', 'hosts.json');
    if (fs.existsSync(hostsPath)) {
        res.json(JSON.parse(fs.readFileSync(hostsPath, 'utf8')));
    } else {
        // Exemplo default se não existir
        res.json([
            { match: "192.168.15.99", preset: "pcmaria" },
            { match: "pcfavela", preset: "pcfavela" }
        ]);
    }
});

// Listar scripts de macros disponíveis (.js)
app.get('/api/macros', (req, res) => {
    const macrosDir = path.join(__dirname, 'public/modules/macros');
    if (!fs.existsSync(macrosDir)) fs.mkdirSync(macrosDir, { recursive: true });
    fs.readdir(macrosDir, (err, files) => {
        if (err) return res.status(500).json({ error: "Erro ao listar mods" });
        // Filtra para mostrar apenas macros reais, ignorando o core e o motor principal
        const jsFiles = files.filter(f => 
            f.endsWith('.js') && 
            !f.includes('.server.js') && 
            f !== 'core.js' && 
            f !== 'macros.js'
        ).map(f => f.replace('.js', ''));
        res.json(jsFiles);
    });
});

// --- LÓGICA NINJA: AUTO-GIT SYNC (DEBOUNCED) ---

/** 
 * FIXME: [FUTURE IMPLEMENTATION] 
 * Implementar Assistente de Sync para novos usuários (Wizard).
 * Precisamos de:
 * 1. GET /api/sync/check - Verifica integridade do Git e Permissões.
 * 2. POST /api/sync/setup - Configura PAT (Token) e troca URL do Remote.
 * Ref: docs/github_sync_implementation_plan.md
 */

let gitSyncTimer = null;
let gitSyncQueue = new Set();

function triggerGitSync() {
    if (gitSyncQueue.size === 0) return;
    
    const filesToSync = Array.from(gitSyncQueue).join(' ');
    const hostname = os.hostname();
    console.log(`\n☁️  [NINJA SYNC] =======================================`);
    console.log(`☁️  [NINJA SYNC] Sincronizando: ${filesToSync}`);
    
    // Sequência Master Blaster: Add -> Commit -> Pull (Rebase + Autostash) -> Push
    const cmd = `git add ${filesToSync} && git commit -m "auto-sync: profiles updated from ${hostname}" && git pull --rebase --autostash && git push`;

    exec(cmd, { cwd: __dirname }, (error, stdout, stderr) => {
        gitSyncQueue.clear();
        if (error) {
            console.error(`❌ [NINJA SYNC] Erro: ${error.message}`);
            return;
        }
        console.log(`✅ [NINJA SYNC] GitHub Atualizado com Sucesso!`);
        console.log(`☁️  [NINJA SYNC] =======================================\n`);
    });
}

/**
 * TODO: Criar endpoints de health-check do Git aqui futuramente
 * Para alimentar o 'GitHub Sync Wizard' no frontend.
 */

app.get('/api/macros/slots', (req, res) => {
    const preset = req.query.preset;
    const macrosDir = path.join(__dirname, 'public/modules/macros/profiles');
    const localDir = path.join(macrosDir, 'local');
    const sharedDir = path.join(macrosDir, 'shared');

    if (preset) {
        // Prioridade: Local (máquina atual), depois Shared (nuvem/git)
        const localPath = path.join(localDir, `profile_${preset}.json`);
        const sharedPath = path.join(sharedDir, `profile_${preset}.json`);
        
        if (fs.existsSync(localPath)) return res.json(JSON.parse(fs.readFileSync(localPath, 'utf8')));
        if (fs.existsSync(sharedPath)) return res.json(JSON.parse(fs.readFileSync(sharedPath, 'utf8')));
        
        return res.json({});
    } else {
        // Lista todos os perfis únicos das duas pastas para o seletor de presets
        const profiles = {};
        const scan = (dir) => {
            if (fs.existsSync(dir)) {
                fs.readdirSync(dir).forEach(f => {
                    if (f.startsWith('profile_') && f.endsWith('.json')) {
                        profiles[f.replace('profile_', '').replace('.json', '')] = true;
                    }
                });
            }
        };
        scan(sharedDir);
        scan(localDir);
        
        if (Object.keys(profiles).length === 0) profiles["default"] = true;
        res.json(profiles);
    }
});

app.post('/api/macros/slots', express.json(), (req, res) => {
    const preset = req.query.preset || 'default';
    const syncShared = req.query.syncShared === 'true'; // Toggle do front-end
    const macrosDir = path.join(__dirname, 'public/modules/macros/profiles');
    
    const localPath = path.join(macrosDir, 'local', `profile_${preset}.json`);
    const sharedPath = path.join(macrosDir, 'shared', `profile_${preset}.json`);

    try {
        const content = JSON.stringify(req.body, null, 2);
        
        // Sempre salva na pasta local (específica desta máquina)
        if (!fs.existsSync(path.dirname(localPath))) fs.mkdirSync(path.dirname(localPath), { recursive: true });
        fs.writeFileSync(localPath, content);
        
        // Se o Auto-Sync estiver ligado, espelha na pasta Shared (que o Git monitora)
        if (syncShared) {
            if (!fs.existsSync(path.dirname(sharedPath))) fs.mkdirSync(path.dirname(sharedPath), { recursive: true });
            fs.writeFileSync(sharedPath, content);
            
            // Ativa o Gatilho Ninja (Debounce de 10 segundos)
            const relativeSharedPath = path.relative(__dirname, sharedPath);
            gitSyncQueue.add(relativeSharedPath);
            
            if (gitSyncTimer) clearTimeout(gitSyncTimer);
            gitSyncTimer = setTimeout(triggerGitSync, 10000); 
            console.log(`☁️  [NINJA SYNC] Mudança em [${preset}]. Sincronização automática agendada para daqui a 10s...`);
        }
        res.json({ success: true, preset, synced: syncShared });
    } catch (e) { res.status(500).json({ error: "Erro ao salvar perfil" }); }
});

app.post('/api/macros/swap', express.json(), (req, res) => {
    const preset = req.query.preset || 'default';
    const fromIndex = parseInt(req.body.from);
    const toIndex = parseInt(req.body.to);
    const macrosDir = path.join(__dirname, 'public/modules/macros/profiles');

    const handleSwap = (dir) => {
        const pPath = path.join(dir, `profile_${preset}.json`);
        if (fs.existsSync(pPath)) {
            try {
                let config = JSON.parse(fs.readFileSync(pPath, 'utf8'));
                const tFrom = config[fromIndex];
                const tTo = config[toIndex];
                delete config[fromIndex]; delete config[toIndex];
                if (tTo) config[fromIndex] = tTo;
                if (tFrom) config[toIndex] = tFrom;
                fs.writeFileSync(pPath, JSON.stringify(config, null, 2));
            } catch (e) { }
        }
    };

    handleSwap(path.join(macrosDir, 'local'));
    handleSwap(path.join(macrosDir, 'shared'));

    // --- CORREÇÃO: Ativa o Gatilho Ninja no SWAP também ---
    const sharedPath = path.join(macrosDir, 'shared', `profile_${preset}.json`);
    if (fs.existsSync(sharedPath)) {
        const relativeSharedPath = path.relative(__dirname, sharedPath);
        gitSyncQueue.add(relativeSharedPath);
        
        if (gitSyncTimer) clearTimeout(gitSyncTimer);
        gitSyncTimer = setTimeout(triggerGitSync, 10000); 
        console.log(`☁️  [NINJA SYNC] Mudança detects no SWAP de [${preset}]. Sync agendado (10s)...`);
    }

    res.json({ success: true });
});

app.delete('/api/macros/slots', (req, res) => {
    const preset = req.query.preset;
    if (!preset || preset === 'default') return res.status(400).json({ error: "Preset inválido ou protegido" });

    const localPath = path.join(__dirname, 'public/modules/macros/profiles/local', `profile_${preset}.json`);
    const sharedPath = path.join(__dirname, 'public/modules/macros/profiles/shared', `profile_${preset}.json`);
    
    try {
        if (fs.existsSync(localPath)) fs.unlinkSync(localPath);
        if (fs.existsSync(sharedPath)) fs.unlinkSync(sharedPath);
        res.json({ success: true, deleted: preset });
    } catch (e) { res.status(500).json({ error: "Erro ao deletar perfil" }); }
});

// 2. Banco de Configuração do Mod por Preset (Busca no novo sistema de profiles)
app.get('/api/macros/config/:modId', (req, res) => {
    const preset = req.query.preset || 'default';
    const modId = req.params.modId;
    const filename = preset === 'default' ? `${modId}.json` : `${modId}_${preset}.json`;
    
    const macrosDir = path.join(__dirname, 'public/modules/macros/profiles');
    const localPath = path.join(macrosDir, 'local', filename);
    const sharedPath = path.join(macrosDir, 'shared', filename);

    if (fs.existsSync(localPath)) return res.json(JSON.parse(fs.readFileSync(localPath, 'utf8')));
    if (fs.existsSync(sharedPath)) return res.json(JSON.parse(fs.readFileSync(sharedPath, 'utf8')));
    
    res.json({});
});

app.post('/api/macros/config/:modId', express.json(), (req, res) => {
    const preset = req.query.preset || 'default';
    const modId = req.params.modId;
    const syncShared = req.query.syncShared === 'true';
    const filename = preset === 'default' ? `${modId}.json` : `${modId}_${preset}.json`;

    const macrosDir = path.join(__dirname, 'public/modules/macros/profiles');
    const localPath = path.join(macrosDir, 'local', filename);
    const sharedPath = path.join(macrosDir, 'shared', filename);

    try {
        const content = JSON.stringify(req.body, null, 2);
        if (!fs.existsSync(path.dirname(localPath))) fs.mkdirSync(path.dirname(localPath), { recursive: true });
        fs.writeFileSync(localPath, content);
        
        if (syncShared) {
            if (!fs.existsSync(path.dirname(sharedPath))) fs.mkdirSync(path.dirname(sharedPath), { recursive: true });
            fs.writeFileSync(sharedPath, content);
            
            // Ativa o Ninja Sync para a config do mod também
            const relativeSharedPath = path.relative(__dirname, sharedPath);
            gitSyncQueue.add(relativeSharedPath);
            if (gitSyncTimer) clearTimeout(gitSyncTimer);
            gitSyncTimer = setTimeout(triggerGitSync, 10000);
        }
        res.json({ success: true, mod: modId, preset, synced: syncShared });
    } catch (e) { res.status(500).json({ error: "Erro ao salvar config do mod" }); }
});

// --- GENERIC PROXY GATEWAY (Security & Power for Modders) ---

app.post('/api/macros/proxy/http', express.json(), async (req, res) => {
    const { url, options } = req.body;
    if (!url) return res.status(400).json({ error: "URL inválida" });
    
    // Filtro de segurança básico: Impede acesso a arquivos locais do sistema
    if (url.startsWith('file://')) return res.status(403).json({ error: "Acesso a arquivos locais negado" });

    console.log(`🌐 [PROXY HTTP] -> ${url}`);

    try {
        const response = await fetch(url, options);
        let rawData = await response.text();
        let data;
        
        // Tenta converter para JSON de forma agressiva (resiliente a cabeçalhos mal formados)
        try {
            data = JSON.parse(rawData);
        } catch (e) {
            data = rawData;
        }

        res.json({ status: response.status, data });
    } catch (e) { 
        console.error(`❌ [PROXY HTTP] Erro ao acessar ${url}: ${e.message}`);
        res.status(500).json({ error: e.message }); 
    }
});

app.post('/api/macros/proxy/udp', express.json(), (req, res) => {
    const { host, port, data } = req.body;
    if (!host || !port || !data) return res.status(400).json({ error: "Dados UDP incompletos" });

    const client = dgram.createSocket('udp4');
    const message = Buffer.from(typeof data === 'string' ? data : JSON.stringify(data));

    client.send(message, port, host, (err) => {
        client.close();
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
    });
});

// Endpoint de Nomes para os Mods
app.get('/api/names', (req, res) => {
    if (fs.existsSync(namesFile)) {
        res.json(JSON.parse(fs.readFileSync(namesFile, 'utf8')));
    } else { res.json({}); }
});

app.get('/api/proxy', (req, res) => {
    const targetUrl = req.query.url;
    if (!targetUrl) return res.status(400).json({ error: "Falta url param" });
    const reqProxy = http.get(targetUrl, (resProxy) => {
        let body = '';
        resProxy.on('data', chunk => body += chunk);
        resProxy.on('end', () => {
            try { res.json(JSON.parse(body)); } catch (e) { res.send(body); }
        });
    });
    reqProxy.on('error', err => res.status(500).json({ error: err.message }));
});

const configFile = path.join(__dirname, 'config.json');
const namesFile = path.join(__dirname, 'names.json');


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
    let config = { inIdx: null, outIdx: null, "loopmidi-monitor": false };
    if (fs.existsSync(configFile)) {
        try {
            const loaded = JSON.parse(fs.readFileSync(configFile, 'utf8'));
            config = { ...config, ...loaded };
            // Atualiza config do Master Meter
            masterMeter.setConfig(config);
        } catch (err) { }
    }
    return config;
}

function saveConfig(configData) {
    try { fs.writeFileSync(configFile, JSON.stringify(configData, null, 2)); } catch (err) { }
}

function loadNames() {
    if (fs.existsSync(namesFile)) {
        try {
            const names = JSON.parse(fs.readFileSync(namesFile, 'utf8'));
            for (const key in names) {
                const idx = parseInt(key);
                if (!isNaN(idx)) {
                    stateManager.setChannelName(idx, names[key]);
                }
            }
            console.log("✅ [NAMES] Nomes carregados do arquivo names.json");
            return true;
        } catch (err) {
            console.error("❌ [NAMES] Erro ao carregar names.json:", err);
        }
    }
    return false;
}

function saveNames() {
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
        console.log("💾 [NAMES] Nomes salvos com sucesso em names.json");
    } catch (err) {
        console.error("❌ [NAMES] Erro ao salvar nomes:", err);
    }
}

function iniciarBuscaAutomatica() {
    if (buscaInterval) clearInterval(buscaInterval);

    atualizarMenuTray();

    console.log("");

    buscaInterval = setInterval(() => {
        if (isConnected) {
            clearInterval(buscaInterval);
            if (linhaBuscaAtiva) {
                process.stdout.write("\n");
                linhaBuscaAtiva = false;
            }
            return;
        }

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
        }
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

    const matchesCriteria = (name) => {
        if (!name) return false;
        const lower = String(name).toLowerCase();
        if (searchMonitor) {
            return lower.includes('monitor');
        }
        // Critério específico para Yamaha física: deve ter 'yamaha' e terminar com '-1' (ou conter '-1')
        return lower.includes('yamaha') && lower.includes('-1');
    };

    if (!matchesCriteria(inName) || !matchesCriteria(outName)) {
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
        
        // --- COOLDOWN ESTRATÉGICO E SINCRONIA DE CENAS ---
        // Aguardamos 5s para os buffers residuais, mas NESSE TEMPO, baixamos a biblioteca de cenas
        sceneManager.setIO(io);
        setTimeout(async () => {
            if (isConnected) {
                await sceneManager.fetchScenes(midiEngine);
                triggerSync(targetSocket);
            }
        }, 5000);


        io.emit('connectionState', { connected: true });

        // Loop contínuo de requests do Meter (Heartbeat)
        if (global.meterInterval) clearInterval(global.meterInterval);
        lastActivityTime = Date.now();

        global.meterInterval = setInterval(() => {
            if (!isConnected) return;

            if (Date.now() - lastActivityTime > 5000) {
                console.log("\n⚠️ Watchdog: Timeout de conexão. A mesa parou de responder.");
                handleDisconnection();
                return;
            }

            // Meters só rodam após sincronia completa
            if (!isFullySynced) return;

            const sMaster = midiEngine.send(masterMeter.buildRequest());
            const s1 = midiEngine.send([240, 67, 48, 62, 127, 33, 0, 0, 0, 0, 31, 247]);
            const s2 = midiEngine.send([240, 67, 48, 62, 127, 32, 0, 0, 0, 0, 31, 247]);
            const s3 = midiEngine.send([240, 67, 48, 62, 26, 33, 0, 0, 0, 0, 31, 247]);
            const s4 = midiEngine.send([240, 67, 48, 62, 13, 33, 0, 0, 0, 0, 31, 247]);
            const s5 = midiEngine.send([240, 67, 48, 62, 13, 32, 0, 0, 0, 0, 31, 247]);

            if (!s2 && !s3 && !s4 && !s5 && !sMaster) {
                console.log("\n⚠️ Watchdog: Falha crítica no driver MIDI.");
                handleDisconnection();
            }
        }, 41); // Otimizado: Studio Manager Native Polling Rate (~24fps)
    } else {
        handleDisconnection(false);
    }
    return result;
}

function handleDisconnection(retry = true) {
    if (!isConnected && retry) return; // Evita duplicação se já estiver buscando

    isConnected = false;
    if (global.meterInterval) clearInterval(global.meterInterval);
    if (dummyMeterInterval) {
        clearInterval(dummyMeterInterval);
        dummyMeterInterval = null;
    }

    io.emit('connectionState', { connected: false });

    if (retry) {
        console.log("❌ Conexão perdida. Tentando reconectar automaticamente...");
        iniciarBuscaAutomatica();
    }
}

async function triggerSync(targetSocket = null, forceNames = false) {
    if (!isConnected || isSyncing) return;
    
    isSyncing = true;
    io.emit('syncStatus', true);
    isFullySynced = false; // Reseta a flag para pausar meters
    
    console.log(`🔄 [Sync] Iniciando sincronização via Pipeline...`);
    
    syncPipeline.clear();
    
    // --- CENA ---
    // (As requisições kSceneTitle e kSceneNumber não são confiáveis via Parameter Request.
    // O tráfego de cena agora é gerenciado 100% pelo modulo SceneManager via Bulk Dump Type 0x02 e emitido via 'scenesUpdated').

    // --- MESTRE ---
    syncPipeline.addTask(protocol.buildRequest('kStereoFader/kFader', 0));

    // 2. Parâmetros de Canal (Input 1-32)
    for (let i = 0; i < 32; i++) {
        syncPipeline.addTask(protocol.buildRequest('kInputFader/kFader', i));
        syncPipeline.addTask(protocol.buildRequest('kInputChannelOn/kChannelOn', i));
        syncPipeline.addTask(protocol.buildRequest('kSetupSoloChOn/kSoloChOn', i));
        syncPipeline.addTask(protocol.buildRequest('kInputPhase/kPhase', i));
        syncPipeline.addTask(protocol.buildRequest('kInputAttenuator/kAtt', i));
        
        // EQ
        syncPipeline.addTask(protocol.buildRequest('kInputEQ/kEQOn', i));
        syncPipeline.addTask(protocol.buildRequest('kInputEQ/kEQMode', i));
        syncPipeline.addTask(protocol.buildRequest('kInputEQ/kEQHPFOn', i));
        syncPipeline.addTask(protocol.buildRequest('kInputEQ/kEQLPFOn', i));
        ['Low', 'LowMid', 'HiMid', 'Hi'].forEach(b => {
            syncPipeline.addTask(protocol.buildRequest(`kInputEQ/kEQ${b}F`, i));
            syncPipeline.addTask(protocol.buildRequest(`kInputEQ/kEQ${b}G`, i));
            syncPipeline.addTask(protocol.buildRequest(`kInputEQ/kEQ${b}Q`, i));
        });

        // Auxiliares (1-8)
        for (let a = 1; a <= 8; a++) {
            syncPipeline.addTask(protocol.buildRequest(`kInputAUX/kAUX${a}Level`, i));
            syncPipeline.addTask(protocol.buildRequest(`kInputAUX/kAUX${a}On`, i));
        }

        // Dinâmicas
        ['kGateOn', 'kGateAttack', 'kGateRange', 'kGateHold', 'kGateDecay', 'kGateThreshold'].forEach(p => {
            syncPipeline.addTask(protocol.buildRequest(`kInputGate/${p}`, i));
        });
        ['kCompOn', 'kCompAttack', 'kCompRelease', 'kCompRatio', 'kCompGain', 'kCompKnee', 'kCompThreshold'].forEach(p => {
            syncPipeline.addTask(protocol.buildRequest(`kInputComp/${p}`, i));
        });

        // Patch e Routing
        syncPipeline.addTask(protocol.buildRequest('kChannelInput/kChannelIn', i));
        syncPipeline.addTask(protocol.buildRequest('kInputBus/kStereo', i));
        for (let b = 1; b <= 8; b++) {
            syncPipeline.addTask(protocol.buildRequest(`kInputBus/kBus${b}`, i));
        }
    }

    // 3. Mixes e Buses Masters
    for (let i = 0; i < 8; i++) {
        syncPipeline.addTask(protocol.buildRequest('kAUXFader/kFader', i));
        syncPipeline.addTask(protocol.buildRequest('kAUXChannelOn/kChannelOn', i));
        syncPipeline.addTask(protocol.buildRequest('kBusFader/kFader', i));
        syncPipeline.addTask(protocol.buildRequest('kBusChannelOn/kChannelOn', i));
    }

    // 4. Stereo Master
    syncPipeline.addTask(protocol.buildRequest('kStereoFader/kFader', 0));
    syncPipeline.addTask(protocol.buildRequest('kStereoChannelOn/kChannelOn', 0));
    syncPipeline.addTask(protocol.buildRequest('kStereoAttenuator/kAtt', 0));
    syncPipeline.addTask(protocol.buildRequest('kStereoEQ/kEQOn', 0));
    ['Low', 'LowMid', 'HiMid', 'Hi'].forEach(b => {
        syncPipeline.addTask(protocol.buildRequest(`kStereoEQ/kEQ${b}F`, 0));
        syncPipeline.addTask(protocol.buildRequest(`kStereoEQ/kEQ${b}G`, 0));
        syncPipeline.addTask(protocol.buildRequest(`kStereoEQ/kEQ${b}Q`, 0));
    });
    ['kCompOn', 'kCompAttack', 'kCompRelease', 'kCompRatio', 'kCompGain', 'kCompKnee', 'kCompThreshold'].forEach(p => {
        syncPipeline.addTask(protocol.buildRequest(`kStereoComp/${p}`, 0));
    });

    // 5. Nomes (Se necessário)
    if (forceNames || !hasSyncedNamesThisSession) {
        console.log("📝 [Sync] Adicionando busca de nomes ao Pipeline...");
        // Nomes de Canais (0-31)
        for (let i = 0; i < 32; i++) {
            for (let c = 0; c < 4; c++) {
                syncPipeline.addTask(protocol.buildNameRequest(i, c));
            }
        }
        // Mixes (36-43), Buses (44-51), Master (52)
        const outIndices = [];
        for (let i = 36; i <= 43; i++) outIndices.push(i);
        for (let i = 44; i <= 51; i++) outIndices.push(i);
        outIndices.push(52);
        for (const idx of outIndices) {
            for (let c = 0; c < 8; c++) {
                syncPipeline.addTask(protocol.buildNameRequest(idx, c));
            }
        }
    }

    // Define o que fazer ao terminar
    syncPipeline.setCompletionHandler(() => {
        isSyncing = false;
        isFullySynced = true;
        hasSyncedNamesThisSession = true;
        io.emit('syncStatus', false);
        saveNames();
        
        if (targetSocket) {
            targetSocket.emit('sync', stateManager.getState());
        } else {
            io.emit('sync', stateManager.getState());
        }
        console.log("✅ [Sync] Sincronização via Pipeline concluída com sucesso!");
    });

    // Inicia o processamento rápido (10ms entre mensagens durante o Sync)
    syncPipeline.start(5, (progress) => {
        if (progress.percent % 10 === 0) {
            console.log(`⏳ [Sync] Progresso: ${progress.percent}% (${progress.completed}/${progress.total})`);
        }
    });

}

async function syncNames() {
    if (!isConnected || isSyncing) return;
    
    isSyncing = true;
    isFullySynced = false; // Pausa meters
    console.log(`🔄 [MANUAL SYNC] Iniciando busca de nomes via Pipeline...`);

    syncPipeline.clear();

    // Nomes de Canais (0-31)
    for (let i = 0; i < 32; i++) {
        for (let c = 0; c < 4; c++) {
            syncPipeline.addTask(protocol.buildNameRequest(i, c));
        }
    }

    // Saídas (Mixes 36-43, Buses 44-51, Master 52)
    const outIndices = [];
    for (let i = 36; i <= 43; i++) outIndices.push(i);
    for (let i = 44; i <= 51; i++) outIndices.push(i);
    outIndices.push(52);

    for (const idx of outIndices) {
        for (let c = 0; c < 8; c++) {
            syncPipeline.addTask(protocol.buildNameRequest(idx, c));
        }
    }

    syncPipeline.setCompletionHandler(() => {
        isSyncing = false;
        isFullySynced = true;
        saveNames();
        io.emit('sync', stateManager.getState());
        console.log("✅ [MANUAL SYNC] Concluído via Pipeline!");
    });

    syncPipeline.start(20, (progress) => {
        if (progress.percent % 20 === 0) {
            console.log(`⏳ [MANUAL SYNC] Progresso: ${progress.percent}%`);
        }
    });

}


// --- COMUNICAÇÃO WEB (SOCKET.IO) ---

io.on('connection', (socket) => {
    const currentConfig = loadConfig();
    socket.emit('portsList', { available: midiEngine.getAvailablePorts(), savedConfig: currentConfig });
    socket.emit('sync', stateManager.getState());
    socket.emit('scenesUpdated', sceneManager.getState());
    socket.emit('syncStatus', isSyncing);
    socket.emit('connectionState', { connected: isConnected });

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

    socket.on('forceSync', () => triggerSync(null, true)); // Agora forceSync também força nomes

    socket.on('refreshNames', () => {
        console.log("🔄 Solicitação manual de atualização de nomes...");
        triggerSync(null, true);
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
                triggerSync(null); 
            }
        }, 2000);
    });

    socket.on('toggleDemo', (data) => {
        const config = loadConfig();
        config.demo_mode = data.enabled;
        saveConfig(config);

        if (data.enabled) {
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
        }
    });

    socket.on('updateMeterConfig', (data) => {
        const config = loadConfig();
        config.meter_opacity = data.opacity;
        saveConfig(config);
    });

    socket.on('updateName', (data) => {
        const { channel, name } = data;
        const s = stateManager.getState();
        if (s.channels[channel] !== undefined) {
            // 1. Atualiza e salva o estado no servidor (Suporte a 16 chars)
            const limitedName = name.substring(0, 16);
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
                        await new Promise(r => setTimeout(r, 30)); // 30ms para estabilidade do visor da mesa
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
});

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

    // Abrir o navegador automaticamente
    const url = `http://localhost:${PORT}`;
    exec(`start ${url}`);

    const config = loadConfig();
    if (config.demo_mode) {
        iniciarDummy();
    } else {
        console.log("ℹ️ [INFO] Modo Demo desativado. Aguardando conexão física com Yamaha...");
    }

    loadNames(); // Carrega nomes do arquivo na inicialização do servidor

    // Sempre iniciamos pela busca automática para respeitar a regra do loopmidi-monitor
    setTimeout(() => iniciarBuscaAutomatica(), 1500);
});