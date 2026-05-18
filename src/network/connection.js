// ============================================================================
// connection.js — Gerenciamento de Conexão MIDI e Sincronismo
// ============================================================================
// Orquestra todo o ciclo de vida da conexão com a mesa Yamaha 01V96:
// - Busca automática de portas MIDI (radar USB / loopMIDI)
// - Validação de portas (Porteiro) antes de conectar
// - Cooldown estratégico de 5s antes da sincronia pós-conexão
// - Configuração do SyncManager e MidiScheduler
// - Loop de meters com watchdog de inatividade
// - Reconexão automática em caso de timeout
// - Sync manual (triggerSync, syncNames)
// ============================================================================

let ctx;

// --- FUNÇÕES DE APOIO E BUSCA ---

// Radar automático: varre portas MIDI a cada 1s procurando Yamaha ou loopMIDI.
// Para quando encontra e conecta, ou se já estiver conectado.
function iniciarBuscaAutomatica() {
    if (ctx.buscaInterval) clearInterval(ctx.buscaInterval);

    ctx.atualizarMenuTray();

    console.log("");

    // Extrai a função de busca para melhorar legibilidade
    const buscarPortaYamaha = () => {
        const horaAtual = new Date().toLocaleTimeString('pt-BR');
        const config = ctx.loadConfig();
        const searchMonitor = config["loopmidi-monitor"];

        const msg = searchMonitor ? '🔍 Buscando portas com "monitor" no nome...' : '🔍 Buscando Yamaha 01V96 na porta USB...';
        process.stdout.write(`\r[${horaAtual}] ${msg} \x1b[K`);
        ctx.linhaBuscaAtiva = true;

        const portas = ctx.midiEngine.getAvailablePorts();
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
            ctx.linhaBuscaAtiva = false;

            const targetName = searchMonitor ? "loopMIDI (Monitor)" : "Yamaha 01V96";
            console.log(`[${horaAtual}] 🎯 ${targetName} encontrada! (In: ${foundInIdx}, Out: ${foundOutIdx}). Conectando...`);

            clearInterval(ctx.buscaInterval);
            // Atualizamos o config mantendo o flag de monitor
            config.inIdx = foundInIdx;
            config.outIdx = foundOutIdx;
            ctx.saveConfig(config);
            executarConexao(foundInIdx, foundOutIdx);
            return true; // Indica que encontrou e conectou
        }
        return false; // Ainda não encontrou
    };

    ctx.buscaInterval = setInterval(() => {
        if (ctx.isConnected) {
            clearInterval(ctx.buscaInterval);
            if (ctx.linhaBuscaAtiva) {
                process.stdout.write("\n");
                ctx.linhaBuscaAtiva = false;
            }
            return;
        }

        buscarPortaYamaha();
    }, 1000);
}

// Conecta às portas MIDI especificadas, validando antes os critérios.
// Após sucesso, agenda cooldown de 5s e inicia sincronia completa.
// targetSocket (opcional): socket do cliente que solicitou a conexão via web.
function executarConexao(inIdx, outIdx, targetSocket = null) {
    const config = ctx.loadConfig();
    const searchMonitor = config["loopmidi-monitor"];

    // --- O PORTEIRO: Verifica se a porta solicitada (pelo radar ou pela WEB) corresponde ao equipamento esperado ---
    const portas = ctx.midiEngine.getAvailablePorts();
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
        if (ctx.linhaBuscaAtiva) { process.stdout.write("\n"); ctx.linhaBuscaAtiva = false; }
        console.log(`🚫 Conexão bloqueada: A porta [${inName || 'Desconhecida'}] não corresponde aos critérios (${searchMonitor ? 'Monitor' : 'Yamaha'}).`);
        return { success: false, error: searchMonitor ? "A porta não contém 'monitor' no nome." : "Equipamento não é uma Yamaha 01V96." };
    }
    // ------------------------------------------------------------------------------------------------

    const result = ctx.midiEngine.connectPorts(inIdx, outIdx, ctx.handleMIDIData);

    if (ctx.linhaBuscaAtiva) { process.stdout.write("\n"); ctx.linhaBuscaAtiva = false; }

    if (result.success) {
        ctx.isConnected = true;
        console.log(`✅ Conexão MIDI estabelecida com sucesso! (${inName})`);
        ctx.atualizarMenuTray();

        // --- COOLDOWN ESTRATÉGICO E SINCRONIA GERAL ---
        // Aguardamos 5s para os buffers residuais assentarem antes de iniciar a carga massiva
        ctx.sceneManager.setIO(ctx.io);
        setTimeout(async () => {
            if (ctx.isConnected) {
                if (!ctx.syncManager) ctx.syncManager = new ctx.SyncManager(ctx.midiEngine.getScheduler(), ctx.io, ctx.sceneManager);

                // Configura a taxa de tick do scheduler baseado na configuração
                ctx.midiEngine.setSchedulerTickMs(ctx.configConstants.scheduler_tick_ms);

                // Reinicia flags de sincronismo
                ctx.isFullySynced = false;
                ctx.isSyncing = true;

                // Callback executado quando SyncManager termina de baixar todos os parâmetros
                if (!ctx.syncManager.onSyncComplete) {
                    ctx.syncManager.onSyncComplete = function () {
                        ctx.isFullySynced = true;
                        ctx.isSyncing = false;
                        ctx.saveNames();
                        try { ctx.io.emit('sync', ctx.stateManager.getState()); } catch { }
                        try { ctx.io.emit('syncStatus', { active: false }); } catch { }
                        console.log('✅ [SERVER] SyncManager sinalizou conclusão (Cenas + Parâmetros + Nomes).');
                    };
                }

                // O fire() agora é async e cuida de baixar as cenas antes dos parâmetros
                ctx.syncManager.fire(targetSocket);
            }
        }, 5000);

        ctx.io.emit('connectionState', { connected: true, demo_mode: ctx.loadConfig().demo_mode });

        // Loop contínuo de requests do Meter (Heartbeat)
        if (global.meterInterval) clearInterval(global.meterInterval);
        ctx.lastActivityTime = Date.now();

        global.meterInterval = setInterval(() => {
            if (!ctx.isConnected) return;

            // Watchdog: se a mesa não responde por watchdog_timeout_ms, desconecta
            if (Date.now() - ctx.lastActivityTime > ctx.configConstants.watchdog_timeout_ms) {
                console.log("\n⚠️ Watchdog: Timeout de conexão. A mesa parou de responder.");
                handleDisconnection();
                return;
            }

            // Meters só rodam após sincronia completa
            if (!ctx.isFullySynced) return;

            // [NATIVE METER] Stereo Master (Point 4) via MasterMeter module (AirFader Approach)
            const sMaster = ctx.midiEngine.send(ctx.masterMeter.buildRequest(), 2);

            // [NATIVE METER] Input Channels (Group 32/33) via Parameter Request (Classic approach)
            ctx.midiEngine.send([240, 67, 48, 62, 127, 33, 0, 0, 0, 0, 31, 247], 2);
            ctx.midiEngine.send([240, 67, 48, 62, 127, 32, 0, 0, 0, 0, 31, 247], 2);
            ctx.midiEngine.send([240, 67, 48, 62, 26, 33, 0, 0, 0, 0, 31, 247], 2);
            ctx.midiEngine.send([240, 67, 48, 62, 13, 33, 0, 0, 0, 0, 31, 247], 2);
            ctx.midiEngine.send([240, 67, 48, 62, 13, 32, 0, 0, 0, 0, 31, 247], 2);

            // Não tratamos falha de enfileiramento como erro se estivermos usando o MidiScheduler,
            // pois o scheduler rejeita requests de priority 2 quando q0/q1 estão ocupadas (comportamento esperado).
            const sched = ctx.midiEngine.getScheduler ? ctx.midiEngine.getScheduler() : null;
            const allFailed = (!sMaster); // Simplificado: Se o principal falhar e não houver scheduler ativo
            if (allFailed && (!sched || !sched.isRunning)) {
                console.log("\n⚠️ Watchdog: Falha crítica no driver MIDI.");
                handleDisconnection();
            }
        }, ctx.configConstants.meter_poll_interval_ms); // Otimizado: Studio Manager Native Polling Rate (~24fps)
    } else {
        handleDisconnection(false);
    }
    return result;
}

// Limpa estado de conexão, para meters e emite evento de desconexão aos clientes.
// Se retry=true, inicia busca automática para reconectar.
function handleDisconnection(retry = true) {
    if (!ctx.isConnected && retry) return; // Evita duplicação se já estiver buscando

    ctx.isConnected = false;
    // Tenta enviar o comando de parada de meter para limpar o tráfego na mesa física (se ainda houver conexão física)
    try {
        ctx.midiEngine.send(ctx.masterMeter.buildStopRequest());
    } catch {
        // Ignora erro de envio no disconnect
    }

    if (global.meterInterval) clearInterval(global.meterInterval);
    if (ctx.dummyMeterInterval) {
        clearInterval(ctx.dummyMeterInterval);
        ctx.dummyMeterInterval = null;
    }

    ctx.io.emit('connectionState', { connected: false, demo_mode: ctx.loadConfig().demo_mode });

    if (retry) {
        console.log("❌ Conexão perdida. Tentando reconectar automaticamente...");
        iniciarBuscaAutomatica();
    }
}

// Dispara sincronia completa de parâmetros via SyncManager.
// forceNames: força reenvio de nomes; type: 'normal' ou 'is_scene'
async function triggerSync(targetSocket = null, forceNames = false, type = 'normal') {
    if (ctx.syncManager) {
        ctx.isSyncing = true;
        ctx.isFullySynced = false;
        return ctx.syncManager.fire(targetSocket, forceNames, type);
    }
    console.warn('⚠️ [Sync] Tentativa de sync sem SyncManager ativo ou conexão MIDI.');
}

// Sincroniza apenas os nomes dos canais com a mesa (mais leve que triggerSync completo).
async function syncNames() {
    if (ctx.syncManager) {
        ctx.isSyncing = true;
        ctx.isFullySynced = false;
        return ctx.syncManager.syncNamesOnly();
    }
    console.warn('⚠️ [Sync] Tentativa de sync de nomes sem SyncManager ativo.');
}

function initConnection(appCtx) {
    ctx = appCtx;
    ctx.iniciarBuscaAutomatica = iniciarBuscaAutomatica;
    ctx.executarConexao = executarConexao;
    ctx.handleDisconnection = handleDisconnection;
    ctx.triggerSync = triggerSync;
    ctx.syncNames = syncNames;
}

module.exports = { initConnection };
