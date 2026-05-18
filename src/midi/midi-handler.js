// ============================================================================
// midi-handler.js — Tratamento de Dados MIDI + Modo Demo
// ============================================================================
// Callback central para todo tráfego MIDI recebido da mesa física.
// Responsabilidades:
// - Watchdog: reseta timer de inatividade a cada mensagem
// - Interceptação de scene dumps (repassa ao SceneManager)
// - Processamento de METER_DATA com throttle por FPS
// - Atualização de estado via StateManager + broadcast via Socket.IO
// - Modo Demo: simula tráfego SysEx via meter_dummy.js
// ============================================================================

const Buffer = require('buffer').Buffer;

let ctx;

// Callback principal de dados MIDI — registrado no midiEngine.connectPorts()
function handleMIDIData(midiData, rawMessage = null) {
    // Qualquer tráfego MIDI (incluindo scene dumps) reseta o watchdog
    ctx.lastActivityTime = Date.now();

    // Intercepta cenas (Bulk Dumps grandes Type 00 e 02)
    if (ctx.sceneManager.handleMIDIData(rawMessage)) {
        return; // É um dump de cena, o Scene Manager já lidou com ele
    }

    if (!midiData) return;

    if (midiData.type === 'kSceneNumber') {
        console.log(`🎬 [SCENE CHANGE] Mudança de cena detectada pela mesa: ${midiData.value}`);
        ctx.sceneManager.setActiveScene(midiData.value);
    }

    // METER_DATA - processa channels 1-32 e Master
    if (midiData.type === 'METER_DATA') {
        // Meters só são emitidos após sincronia completa (ou em modo demo)
        if (!ctx.isFullySynced && !ctx.isDemoMode) return;

        if (midiData.isMaster) {
            // Master Meter (Stereo L/R) - Point 4 (Comando 0x21)
            // Usamos a lógica de calibração do master-meter.js que segue o steps.json
            if (rawMessage) {
                const mLevel = ctx.masterMeter.parse(rawMessage);
                if (mLevel !== null) {
                    ctx.meterDataBuffer[32] = mLevel;
                }
            }
        } else {
            // Processa todos os níveis recebidos (Inputs, Mixes, Buses, etc)
            for (const chIdx in midiData.levels) {
                let level = midiData.levels[chIdx];
                if (level > 32) level = 32;
                ctx.meterDataBuffer[chIdx] = level;
            }
        }

        // Emissão Dinâmica baseada em FPS (config.json)
        if (ctx.configConstants.meter_fps_desktop <= 0) return;
        const throttleMs = 1000 / ctx.configConstants.meter_fps_desktop;

        const now = Date.now();
        if (now - ctx.lastMeterTime >= throttleMs) {
            ctx.io.emit('meterData', ctx.meterDataBuffer);
            ctx.lastMeterTime = now;
        }
        return;
    }

    if (midiData.type === 'HEARTBEAT') return;

    if (midiData.type === 'kChannelInput/kChannelIn') {
        const hex = midiData.raw ? Buffer.from(midiData.raw).toString('hex').toUpperCase() : 'N/A';
        console.log(`🎯 [PATCH CHANGE] Canal ${midiData.channel + 1}: Patch = ${midiData.value} ${midiData.value === 0 ? `(DEBUG HEX: ${hex})` : ''}`);
    }

    // Repassa o objeto INTEIRO para o gerenciador de estado (incluindo letras de nomes)
    ctx.stateManager.updateState(midiData);
    ctx.io.emit('update', midiData);

    // Se recebermos letras de nomes via MIDI (ex: mudança feita na mesa física),
    // garantimos que o names.json seja atualizado para manter a sincronia.
    if (midiData.type === 'updateNameChar' || midiData.type === 'updateSceneChar') {
        ctx.saveNames();
    }
}

// Modo Demo: gera tráfego SysEx fictício via meter_dummy.js
// Útil para testar a interface sem uma mesa física conectada.
function iniciarDummy() {
    console.log("🛠️ [MODO DEMO] Ativando simulação automática de SysEx...");
    if (ctx.dummyMeterInterval) clearInterval(ctx.dummyMeterInterval);
    ctx.dummyMeterInterval = ctx.dummy.startMeterSimulation((sysex) => {
        // Log para conferência técnica
        if (Math.random() < 0.01) {
            const hex = Buffer.from(sysex).toString('hex').toUpperCase();
            console.log(`📥 [DUMMY MIDI] SysEx: ${hex.substring(0, 32)}...`);
        }

        const parsed = ctx.protocol.parseIncoming(sysex);
        if (parsed) handleMIDIData(parsed, sysex);
    });
}

function initMidiHandler(appCtx) {
    ctx = appCtx;
    ctx.handleMIDIData = handleMIDIData;
    ctx.iniciarDummy = iniciarDummy;
}

module.exports = { initMidiHandler };
