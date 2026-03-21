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

    const result = midiEngine.connectPorts(inIdx, outIdx, (midiData) => {
        if (!midiData) return;

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
    } else {
        isConnected = false;
        console.log("❌ Falha ao conectar. Retomando busca...");
        iniciarBuscaAutomatica(); 
        io.emit('connectionState', { connected: false });
    }
    return result;
}

async function triggerSync() {
    console.log("🔄 Sincronizando faders e botões vitais...");
    for (let i = 0; i < 32; i++) {
        const fReq = protocol.buildRequest('kInputFader/kFader', i);
        const mReq = protocol.buildRequest('kInputChannelOn/kChannelOn', i);
        const sReq = protocol.buildRequest('kSetupSoloChOn/kSoloChOn', i);
        
        if (fReq) midiEngine.send(fReq); await new Promise(r => setTimeout(r, 10)); 
        if (mReq) midiEngine.send(mReq); await new Promise(r => setTimeout(r, 10)); 
        if (sReq) midiEngine.send(sReq); await new Promise(r => setTimeout(r, 10)); 
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

    socket.on('control', (data) => {
        const isBinary = data.type.includes('On') || data.type.includes('Solo');
        const converter = isBinary ? protocol.CONVERTERS.onToBytes : protocol.CONVERTERS.faderToBytes;
        const sysex = protocol.buildChange(data.type, data.channel, data.value, converter);
        
        if (sysex) {
            // Log do comando para debug (converte array de bytes em string HEX para melhor leitura)
            const hexArr = sysex.map(b => b.toString(16).toUpperCase().padStart(2, '0')).join(' ');
            console.log(`📤 Enviando: [${data.type}] Canal: ${data.channel + 1} Valor: ${data.value} -> SYSEX: ${hexArr}`);
            
            midiEngine.send(sysex);
            socket.broadcast.emit('update', data);
        }
    });
});

server.listen(3000, '0.0.0.0', () => {
    console.log(`🚀 SERVIDOR ONLINE em http://${os.hostname()}.local:3000`);
    setTimeout(() => { iniciarBuscaAutomatica(); }, 2000);
});