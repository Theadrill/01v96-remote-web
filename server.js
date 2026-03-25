const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const os = require('os');
const fs = require('fs');
const path = require('path');
const SysTray = require('systray2').default;

const midiEngine = require('./src/midi-engine');
const protocol = require('./src/protocol');
const stateManager = require('./src/state-manager');

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

process.title = "01V96-BRIDGE-SERVER";

app.use(express.static('public'));
const configFile = path.join(__dirname, 'config.json');


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
            const url = `http://${os.hostname()}.local:3000`; 
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
    if (fs.existsSync(configFile)) {
        try { return JSON.parse(fs.readFileSync(configFile, 'utf8')); } catch (err) {}
    }
    return { inIdx: null, outIdx: null };
}

function saveConfig(configData) {
    try { fs.writeFileSync(configFile, JSON.stringify(configData, null, 2)); } catch (err) {}
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
        
        process.stdout.write(`\r[${horaAtual}] 🔍 Buscando Yamaha 01V96 na porta USB... \x1b[K`);
        linhaBuscaAtiva = true;

        const portas = midiEngine.getAvailablePorts();
        const inputs = portas.inputs || portas; 
        const outputs = portas.outputs || portas;

        let foundInIdx = -1;
        let foundOutIdx = -1;

        const hasYamaha = (port) => {
            const name = port.name || port;
            if (!name) return false;
            const lower = String(name).toLowerCase();
            return lower.includes('yamaha') || lower.includes('01v96') || lower.includes('01v');
        };

        for (let i = 0; i < inputs.length; i++) {
            if (hasYamaha(inputs[i])) { foundInIdx = i; break; }
        }

        for (let i = 0; i < outputs.length; i++) {
            if (hasYamaha(outputs[i])) { foundOutIdx = i; break; }
        }

        if (foundInIdx !== -1 && foundOutIdx !== -1) {
            process.stdout.write("\n"); 
            linhaBuscaAtiva = false;
            
            console.log(`[${horaAtual}] 🎯 Mesa encontrada! (In: ${foundInIdx}, Out: ${foundOutIdx}). Conectando...`);
            
            clearInterval(buscaInterval); 
            saveConfig({ inIdx: foundInIdx, outIdx: foundOutIdx });
            executarConexao(foundInIdx, foundOutIdx);
        }
    }, 1000); 
}

function executarConexao(inIdx, outIdx) {
    // --- O PORTEIRO: Verifica se a porta solicitada (pelo radar ou pela WEB) é realmente uma Yamaha ---
    const portas = midiEngine.getAvailablePorts();
    const inputs = portas.inputs || portas; 
    const outputs = portas.outputs || portas;
    
    let inName = inputs[inIdx];
    let outName = outputs[outIdx];

    if (inName && inName.name) inName = inName.name;
    if (outName && outName.name) outName = outName.name;

    const hasYamaha = (name) => {
        if (!name) return false;
        const lower = String(name).toLowerCase();
        return lower.includes('yamaha') || lower.includes('01v96') || lower.includes('01v');
    };

    if (!hasYamaha(inName) || !hasYamaha(outName)) {
        if (linhaBuscaAtiva) { process.stdout.write("\n"); linhaBuscaAtiva = false; }
        console.log(`🚫 Conexão web bloqueada: A porta [${inName || 'Desconhecida'}] não é uma Yamaha.`);
        return { success: false, error: "Equipamento não é uma Yamaha 01V96." };
    }
    // ------------------------------------------------------------------------------------------------

    let meterDataBuffer = new Array(32).fill(0);
    let lastMeterTime = 0;

    const result = midiEngine.connectPorts(inIdx, outIdx, (midiData) => {
        if (!midiData) return;
        lastActivityTime = Date.now(); // Marca sinal de vida

        if (midiData.type === 'METER_BULK') {
            for (let i = 0; i < 32; i++) {
                meterDataBuffer[i] = midiData.levels[i];
            }
            const now = Date.now();
            if (now - lastMeterTime > 50) { // Throttling: ~20 FPS max
                io.emit('meterData', meterDataBuffer);
                lastMeterTime = now;
            }
            return; // Impede spam no log
        }

        if (midiData.type === 'CH_NAME_CHAR') {
            stateManager.updateChannelNameChar(midiData.channel, midiData.charIndex, midiData.char);
            const updatedName = stateManager.getState().channels[midiData.channel].name;
            io.emit('updateName', { channel: midiData.channel, name: updatedName });
            return;
        }

        stateManager.updateState(midiData.type, midiData.channel, midiData.value);
        io.emit('update', midiData);
    });

    if (linhaBuscaAtiva) { process.stdout.write("\n"); linhaBuscaAtiva = false; }

    if (result.success) {
        isConnected = true;
        console.log(`✅ Conexão MIDI estabelecida com sucesso! (${inName})`);
        atualizarMenuTray();
        triggerSync();
        io.emit('connectionState', { connected: true });

        // Loop contínuo de requests do Meter (Heartbeat)
        if (global.meterInterval) clearInterval(global.meterInterval);
        lastActivityTime = Date.now();
        
        global.meterInterval = setInterval(() => {
            if (!isConnected) return;

            // 1. Verificação de Time-out (Cabo puxado ou Mesa desligada)
            // Se passar mais de 2 segundos sem nenhum bit da mesa, consideramos desconectado.
            if (Date.now() - lastActivityTime > 2000) {
                console.log("\n⚠️ Watchdog: Timeout de conexão. A mesa parou de responder.");
                handleDisconnection();
                return;
            }

            // 2. Envio de solicitações de volume (Meters)
            // Se o envio falhar (ERRO FATAL MIDI), desconectamos na hora.
            const s1 = midiEngine.send([240, 67, 32, 62, 26, 33, 4, 0, 247]); // Bulk Request 1
            const s2 = midiEngine.send([240, 67, 32, 62, 26, 33, 0, 0, 247]); // Bulk Request 2
            
            if (!s1 || !s2) {
                console.log("\n⚠️ Watchdog: Falha crítica no driver MIDI. Cabo removido?");
                handleDisconnection();
            }
        }, 100); // Polling mais leve (10 FPS) para economizar processamento
    } else {
        handleDisconnection(false);
    }
    return result;
}

function handleDisconnection(retry = true) {
    if (!isConnected && retry) return; // Evita duplicação se já estiver buscando
    
    isConnected = false;
    if (global.meterInterval) clearInterval(global.meterInterval);
    
    io.emit('connectionState', { connected: false });

    if (retry) {
        console.log("❌ Conexão perdida. Tentando reconectar automaticamente...");
        iniciarBuscaAutomatica();
    }
}

async function triggerSync() {
    if (!isConnected) return;
    console.log("🔄 Sincronizando faders e botões vitais...");
    // Master Fader
    midiEngine.send(protocol.buildRequest('kStereoFader/kFader', 0)); await new Promise(r => setTimeout(r, 10));
    midiEngine.send(protocol.buildRequest('kStereoChannelOn/kChannelOn', 0)); await new Promise(r => setTimeout(r, 10));

    for (let i = 0; i < 32; i++) {
        const fReq = protocol.buildRequest('kInputFader/kFader', i);
        const mReq = protocol.buildRequest('kInputChannelOn/kChannelOn', i);
        const sReq = protocol.buildRequest('kSetupSoloChOn/kSoloChOn', i);
        
        if (fReq) midiEngine.send(fReq); await new Promise(r => setTimeout(r, 10)); 
        if (mReq) midiEngine.send(mReq); await new Promise(r => setTimeout(r, 10)); 
        if (sReq) midiEngine.send(sReq); await new Promise(r => setTimeout(r, 10)); 

        // Sincroniza Phase
        midiEngine.send(protocol.buildRequest('kInputPhase/kPhase', i)); await new Promise(r => setTimeout(r, 5));
        
        // Sincroniza Master EQ ON de cada canal
        midiEngine.send(protocol.buildRequest('kInputEQ/kEQOn', i)); await new Promise(r => setTimeout(r, 5));
        midiEngine.send(protocol.buildRequest('kInputEQ/kEQMode', i)); await new Promise(r => setTimeout(r, 5));
        midiEngine.send(protocol.buildRequest('kInputEQ/kEQHPFOn', i)); await new Promise(r => setTimeout(r, 5));
        midiEngine.send(protocol.buildRequest('kInputEQ/kEQLPFOn', i)); await new Promise(r => setTimeout(r, 5));
        
        // Sincroniza Frequências, Ganhos e Q das 4 bandas (Low, LowMid, HiMid, High)
        const bands = ['Low', 'LowMid', 'HiMid', 'Hi'];
        for (const b of bands) {
            midiEngine.send(protocol.buildRequest(`kInputEQ/kEQ${b}F`, i)); await new Promise(r => setTimeout(r, 5));
            midiEngine.send(protocol.buildRequest(`kInputEQ/kEQ${b}G`, i)); await new Promise(r => setTimeout(r, 5));
            midiEngine.send(protocol.buildRequest(`kInputEQ/kEQ${b}Q`, i)); await new Promise(r => setTimeout(r, 5));
        }

        // Requisita também os 8 auxiliares
        for (let a = 1; a <= 8; a++) {
            const auxReq = protocol.buildRequest(`kInputAUX/kAUX${a}Level`, i);
            const auxOnReq = protocol.buildRequest(`kInputAUX/kAUX${a}On`, i);
            if (auxReq) midiEngine.send(auxReq); await new Promise(r => setTimeout(r, 5));
            if (auxOnReq) midiEngine.send(auxOnReq); await new Promise(r => setTimeout(r, 5));
        }
    }

    await new Promise(r => setTimeout(r, 600)); 
    io.emit('sync', stateManager.getState());
    console.log("✅ Sincronização concluída com sucesso!");

    for (let i = 0; i < 32; i++) {
        for (let c = 0; c < 16; c++) {
            const nameReq = protocol.buildNameRequest(i, c);
            if (nameReq) midiEngine.send(nameReq);
            await new Promise(r => setTimeout(r, 4)); 
        }
    }
}


// --- COMUNICAÇÃO WEB (SOCKET.IO) ---

io.on('connection', (socket) => {
    const currentConfig = loadConfig();
    socket.emit('portsList', { available: midiEngine.getAvailablePorts(), savedConfig: currentConfig });
    socket.emit('sync', stateManager.getState());
    socket.emit('connectionState', { connected: isConnected });

    socket.on('requestConnect', async (data) => {
        saveConfig({ inIdx: data.inIdx, outIdx: data.outIdx });
        // Se a web pedir para conectar, passa pelo mesmo porteiro!
        const result = executarConexao(data.inIdx, data.outIdx);
        socket.emit('connectResult', result);
    });

    socket.on('forceSync', () => triggerSync());
    
    socket.on('updateName', (data) => {
        const { channel, name } = data;
        const s = stateManager.getState();
        if (s.channels[channel]) {
            s.channels[channel].name = name;
            console.log(`📝 [NAME CHANGE] Canal ${channel + 1}: "${name}" (Log apenas, MIDI ignorado)`);
            io.emit('updateName', { channel, name });
        }
    });

    socket.on('control', (data) => {
        // Bloqueio Total Offline (COMENTADO PARA DEBUG)
        // if (!isConnected) return;

        // Atualiza o estado na memória do servidor
        stateManager.updateState(data.type, data.channel, data.value);
        io.emit('update', data);

        const isBinary = data.type.includes('On') || data.type.includes('Solo');
        let converter = isBinary ? protocol.CONVERTERS.onToBytes : protocol.CONVERTERS.faderToBytes;
        
        // Se for EQ Gain (termina em G), usa conversor de assinado
        if (data.type.includes('kInputEQ/') && data.type.endsWith('G')) {
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

server.listen(3000, '0.0.0.0', () => {
    console.log(`🚀 SERVIDOR ONLINE em http://${os.hostname()}.local:3000`);
    setTimeout(() => { iniciarBuscaAutomatica(); }, 2000);
});