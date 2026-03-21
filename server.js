const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const os = require('os');

const midiEngine = require('./src/midi-engine');
const protocol = require('./src/protocol');
const stateManager = require('./src/state-manager');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

// 1. ESCUTA MIDI (Mesa -> Servidor)
midiEngine.initMIDI((data) => {
    console.log(`📥 MIDI da Mesa: ${data.type} Canal:${data.channel} Valor:${data.value}`);
    stateManager.updateState(data.type, data.channel, data.value);
    io.emit('update', data);
});

// 2. COMUNICAÇÃO WEBSOCKET (Navegador <-> Servidor)
io.on('connection', (socket) => {
    console.log(`📱 Novo Celular Conectado! ID: ${socket.id}`);
    
    // Envia o estado atual assim que conecta
    socket.emit('sync', stateManager.getState());

    socket.on('control', (data) => {
        console.log(`📤 Navegador pediu: Mover Canal ${data.channel} para ${data.value}`);
        
        // Constrói o comando Yamaha baseado no mapeamento
        const sysex = protocol.buildChange(
            'FADER_INPUT', 
            data.channel, 
            data.value, 
            protocol.CONVERTERS.faderToBytes // Usa o deslocamento de bits (>> 7)
        );

        if (sysex) {
            midiEngine.send(sysex);
        }
    });
});

const PORT = 3000;
server.listen(PORT, '0.0.0.0', () => { // O '0.0.0.0' libera acesso para outros IPs na rede
    const hostname = os.hostname();
    console.log(`\n🚀 SERVIDOR EM MODO TESTE DIRETO`);
    console.log(`👉 Link PC: http://localhost:${PORT}`);
    console.log(`👉 Link Celular: http://${hostname}.local:${PORT}\n`);
});