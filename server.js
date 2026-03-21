const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const os = require('os');
const fs = require('fs');
const path = require('path');

const midiEngine = require('./src/midi-engine');
const protocol = require('./src/protocol');
const stateManager = require('./src/state-manager');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));
const configFile = path.join(__dirname, 'config.json');

let isConnected = false;

function loadConfig() {
    if (fs.existsSync(configFile)) {
        try { return JSON.parse(fs.readFileSync(configFile, 'utf8')); } catch (err) {}
    }
    return { inIdx: null, outIdx: null };
}

function saveConfig(configData) {
    try { fs.writeFileSync(configFile, JSON.stringify(configData, null, 2)); } catch (err) {}
}

io.on('connection', (socket) => {
    const currentConfig = loadConfig();
    socket.emit('portsList', { available: midiEngine.getAvailablePorts(), savedConfig: currentConfig });
    socket.emit('sync', stateManager.getState());

    socket.on('requestConnect', async (data) => {
        saveConfig({ inIdx: data.inIdx, outIdx: data.outIdx });

        const result = midiEngine.connectPorts(data.inIdx, data.outIdx, (midiData) => {
            if (!midiData) return;

            // Se for letra de canal, monta a palavra e avisa a tela dinamicamente
            if (midiData.type === 'CH_NAME_CHAR') {
                stateManager.updateChannelNameChar(midiData.channel, midiData.charIndex, midiData.char);
                const updatedName = stateManager.getState().channels[midiData.channel].name;
                io.emit('updateName', { channel: midiData.channel, name: updatedName });
                return;
            }

            stateManager.updateState(midiData.type, midiData.channel, midiData.value);
            io.emit('update', midiData);
        });

        if (result.success) isConnected = true;
        if (result.success || isConnected) triggerSync();
        
        socket.emit('connectResult', result);
    });

    socket.on('forceSync', () => triggerSync());

    async function triggerSync() {
        console.log("🔄 Puxando Faders e Botões vitais...");
        for (let i = 0; i < 32; i++) {
            const fReq = protocol.buildRequest('FADER_INPUT', i);
            const mReq = protocol.buildRequest('MUTE_INPUT', i);
            const sReq = protocol.buildRequest('SOLO_INPUT', i);
            
            if (fReq) midiEngine.send(fReq); await new Promise(r => setTimeout(r, 10)); 
            if (mReq) midiEngine.send(mReq); await new Promise(r => setTimeout(r, 10)); 
            if (sReq) midiEngine.send(sReq); await new Promise(r => setTimeout(r, 10)); 
        }

        // A LÓGICA ANTERIOR AQUI: Espera a mesa responder e já libera a tela!
        await new Promise(r => setTimeout(r, 600)); 
        io.emit('sync', stateManager.getState());
        console.log("✅ Botões e Faders sincronizados na tela!");

        // AGORA SIM, em segundo plano, pede as letras sem travar nada
        console.log("📝 Puxando Nomes dos Canais em segundo plano...");
        for (let i = 0; i < 32; i++) {
            for (let c = 0; c < 16; c++) {
                const nameReq = protocol.buildNameRequest(i, c);
                if (nameReq) midiEngine.send(nameReq);
                await new Promise(r => setTimeout(r, 4)); // Pausa de segurança entre letras
            }
        }
    }

    socket.on('control', (data) => {
        const isBinary = (data.type === 'MUTE_INPUT' || data.type === 'SOLO_INPUT');
        const converter = isBinary ? protocol.CONVERTERS.onToBytes : protocol.CONVERTERS.faderToBytes;
        
        const sysex = protocol.buildChange(data.type, data.channel, data.value, converter);
        if (sysex) {
            midiEngine.send(sysex);
            socket.broadcast.emit('update', data);
        }
    });
});

server.listen(3000, '0.0.0.0', () => {
    console.log(`\n🚀 SERVIDOR ONLINE em http://${os.hostname()}.local:3000\n`);
});