// ============================================================================
// socket-handler.js — Comunicação Web via Socket.IO
// ============================================================================
// Registra todos os handlers de eventos Socket.IO para o frontend.
// Responsabilidades por grupo de eventos:
// - Estado inicial: portsList, sync, scenesUpdated, syncStatus, connectionState
// - Conexão MIDI: requestConnect, pairChannel
// - Cenas: recallScene, saveScene, deleteScene, forceSync
// - Nomes: updateName, refreshNames, syncNamesOnly
// - Modo Demo: toggleDemo
// - Configurações: updateMeterConfig, updateOpenBrowser
// - Controle MIDI: control (faders, EQ, dynamics, etc.), sysex (raw)
// - DMX: resetDmx
// - Servidor: restartServer
// - Consultas: requestDynamics, requestEqAtt
// ============================================================================

const Buffer = require('buffer').Buffer;
const panModule = require('../midi/pan');

let ctx;

// --- COMUNICAÇÃO WEB (SOCKET.IO) ---

function setupSocketHandlers() {
    ctx.io.on('connection', (socket) => {
        // Envia estado completo para o cliente que acabou de conectar
        const currentConfig = ctx.loadConfig();
        socket.emit('portsList', { available: ctx.midiEngine.getAvailablePorts(), savedConfig: currentConfig });
        socket.emit('sync', ctx.stateManager.getState());
        socket.emit('scenesUpdated', ctx.sceneManager.getState());
        socket.emit('syncStatus', { active: ctx.isSyncing });
        socket.emit('connectionState', { connected: ctx.isConnected, demo_mode: currentConfig.demo_mode });

        // --- PAREAMENTO DE CANAIS ---
        socket.on('pairChannel', (data) => {
            if (!ctx.midiEngine || !ctx.isConnected) return;
            const { action, chA, chB, sourceCh } = data;
            const outputProxy = { sendMessage: (msg) => ctx.midiEngine.send(msg) };

            if (action === 'pair') {
                ctx.pairModule.pairChannels(outputProxy, chA, chB, sourceCh);
                ctx.stateManager.updateState({ type: 'kInputPair/kPair', channel: chA, value: 1 });
            }
            if (action === 'unpair') {
                ctx.pairModule.unpairChannels(outputProxy, chA, chB);
                ctx.stateManager.updateState({ type: 'kInputPair/kPair', channel: chA, value: 0 });
            }
            if (action === 'reset') {
                ctx.pairModule.resetBothChannels(outputProxy, chA, chB);
                ctx.stateManager.updateState({ type: 'kInputPair/kPair', channel: chA, value: 1 });
            }
        });

        // --- CONEXÃO MIDI ---
        socket.on('requestConnect', async (data) => {
            const config = ctx.loadConfig();
            // Se já estivermos conectados na mesma porta, não precisamos disparar um triggerSync global
            if (ctx.isConnected && config.inIdx === data.inIdx && config.outIdx === data.outIdx) {
                console.log("🔌 Cliente reconectando, mas MIDI já está ativo nestas portas. Enviando apenas sync local...");
                socket.emit('sync', ctx.stateManager.getState());
                socket.emit('scenesUpdated', ctx.sceneManager.getState());
                socket.emit('connectResult', { success: true });
                return;
            }

            config.inIdx = data.inIdx;
            config.outIdx = data.outIdx;
            ctx.saveConfig(config);
            // Se a web pedir para conectar, passa pelo mesmo porteiro!
            const result = ctx.executarConexao(data.inIdx, data.outIdx, socket);
            socket.emit('connectResult', result);
        });

        // --- SINC ---
        socket.on('forceSync', () => {
            return ctx.triggerSync(null, true, 'is_scene');
        }); // Agora forceSync também força nomes e bloqueia a UI

        socket.on('refreshNames', () => {
            console.log("🔄 Solicitação manual de atualização de nomes...");
            return ctx.syncNames();
        });

        socket.on('syncNamesOnly', () => {
            console.log("🔄 Solicitação manual de SINCRONIA DE NOMES...");
            ctx.syncNames();
        });

        // --- CENAS ---
        socket.on('recallScene', (data) => {
            const index = data.index;
            if (!ctx.isConnected || index === undefined) return;

            console.log(`🎬 [SCENE] Comando recebido: RECALL Cena ${index}`);
            // Sysex Recall: F0 43 10 3E 7F 10 00 00 [INDEX] 02 00 F7
            const sysex = [0xF0, 0x43, 0x10, 0x3E, 0x7F, 0x10, 0x00, 0x00, index, 0x02, 0x00, 0xF7];
            ctx.midiEngine.send(sysex);

            // Previne override do index 0 do Edit Buffer
            ctx.sceneManager.setActiveScene(index);

            // Copia localmente o nome da biblioteca para o Edit Buffer sem precisar baixar tudo de novo
            const cachedParams = ctx.sceneManager.getScenes().find(s => s && s.index === index);
            if (cachedParams && ctx.sceneManager.currentScene) {
                ctx.sceneManager.currentScene.name = cachedParams.name;
            }

            // Os motores dos faders demoram cerca de 1 a 1.5s para realizar as viagens físicas longas.
            // A CPU da 01V96 ignora tráfego SysEx moderado/pesado enquanto opera motores massivamente.
            // Esperamos 2000ms cravados para o desk assentar antes de pedir a avalanche de updates.
            setTimeout(() => {
                if (ctx.isConnected) {
                    ctx.io.emit('scenesUpdated', {
                        scenes: ctx.sceneManager.getScenes(),
                        currentScene: ctx.sceneManager.getCurrentScene()
                    });

                    // ⚠️ Usamos fireParamsOnly() e NÃO triggerSync() aqui.
                    // As cenas já estão em cache — um fetchScenes() aqui competiria com os
                    // requests de parâmetros no scheduler MIDI, causando gargalo e pulando
                    // os primeiros canais (bug: sync começava no canal 12).
                    // +1200ms extra para garantir que a mesa não descarte o canal 1.
                    // O Canal 1 é o mais sensível pois é o primeiro da fila após o recall.
                    setTimeout(() => {
                        if (ctx.syncManager) {
                            ctx.isSyncing = true;
                            ctx.isFullySynced = false;
                            ctx.syncManager.fireParamsOnly(null, false, 'is_scene');
                        }
                    }, 1200);
                }
            }, ctx.configConstants.scene_recall_delay_ms);
        });

        socket.on('saveScene', (data) => {
            const { index, newName } = data;
            if (!ctx.isConnected || index === undefined || !ctx.sceneManager.currentScene) return;

            const originalName = (ctx.sceneManager.currentScene.name || "").trim();
            const targetNameRaw = (newName || originalName).trim();
            const targetName = targetNameRaw.padEnd(16, ' ').substring(0, 16);

            console.log(`\n🎬 [SCENE SAVE] Iniciando salvamento no slot ${index}`);
            console.log(`📝 Nome original: "${originalName}" | Nome escolhido: "${targetName.trim()}"`);

            // Estágio 1: STORE (Sempre salva com o nome que está no Edit Buffer da mesa)
            // Sysex Store: F0 43 10 3E 7F 10 20 00 [INDEX] 02 00 F7
            const storeSysex = [0xF0, 0x43, 0x10, 0x3E, 0x7F, 0x10, 0x20, 0x00, index, 0x02, 0x00, 0xF7];
            ctx.midiEngine.send(storeSysex);
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
                    ctx.midiEngine.send(renameSysex);
                    console.log(`✅ Estágio 2: Enviado comando RENAME para "${normalizedTarget}" no slot ${index}.`);

                    // Atualiza biblioteca local para refletir a mudança imediatamente no UI
                    ctx.sceneManager.scenes[index] = { index, name: normalizedTarget };

                    // Marca o slot como ativo no gerenciador local para atualizar o ID exibido
                    if (index > 0) {
                        ctx.sceneManager.setActiveScene(index);
                        ctx.io.emit('currentScene', ctx.sceneManager.getCurrentScene());
                        console.log(`📡 [SCENE] Atualizado activeSceneIndex para slot ${index} após save.`);
                    }

                    // Se salvou na cena atual, atualiza o nome da cena ativa (mesmo se for diferente do original)
                    if (ctx.sceneManager.activeSceneIndex === index || index === 0) {
                        ctx.sceneManager.currentScene = { index, name: normalizedTarget };
                        ctx.io.emit('currentScene', ctx.sceneManager.currentScene);
                        console.log(`📡 [SCENE] Emitido 'currentScene' com novo nome: ${normalizedTarget}`);
                    }

                    ctx.io.emit('scenesUpdated', ctx.sceneManager.getState());

                    // Força uma re-leitura da biblioteca de cenas a partir da mesa
                    // após pequenas latências do hardware para garantir consistência
                    setTimeout(() => {
                        if (typeof ctx.sceneManager.fetchScenes === 'function' && ctx.midiEngine) {
                            ctx.sceneManager.fetchScenes(ctx.midiEngine).catch(err => {
                                console.log('⚠️ [SCENE] Falha ao re-sincronizar cenas:', err && err.message ? err.message : err);
                            });
                        }
                    }, ctx.configConstants.scene_resync_delay_ms);
                }, ctx.configConstants.scene_save_delay_ms); // Delay de meio segundo conforme solicitado
            } else {
                console.log(`✅ Nomes são idênticos (ignorando case/espaços). Salvamento concluído.`);
                // Atualiza biblioteca local mesmo se for igual (para garantir consistência caso o slot estivesse vazio)
                ctx.sceneManager.scenes[index] = { index, name: normalizedOriginal };

                // Se salvou na cena atual, garante que o currentScene esteja sincronizado
                if (ctx.sceneManager.activeSceneIndex === index || index === 0) {
                    ctx.sceneManager.currentScene = { index, name: normalizedOriginal };
                    ctx.io.emit('currentScene', ctx.sceneManager.currentScene);
                    console.log(`📡 [SCENE] Emitido 'currentScene' com nome original: ${normalizedOriginal}`);
                } else if (index > 0) {
                    // Mesmo que não fosse a cena ativa, atualizamos o activeSceneIndex para refletir o slot salvo
                    ctx.sceneManager.setActiveScene(index);
                    ctx.io.emit('currentScene', ctx.sceneManager.getCurrentScene());
                    console.log(`📡 [SCENE] activeSceneIndex atualizado para slot ${index} (igual ao save).`);
                }

                ctx.io.emit('scenesUpdated', ctx.sceneManager.getState());

                // Re-lê a biblioteca da mesa para garantir que o slot salvo apareça corretamente
                // (mesmo sem rename, o slot pode ter sido sobrescrito ou estar em posição diferente)
                setTimeout(() => {
                    if (typeof ctx.sceneManager.fetchScenes === 'function' && ctx.midiEngine) {
                        ctx.sceneManager.fetchScenes(ctx.midiEngine).catch(err => {
                            console.log('⚠️ [SCENE] Falha ao re-sincronizar cenas após save:', err && err.message ? err.message : err);
                        });
                    }
                }, ctx.configConstants.scene_resync_delay_ms);
            }
        });

        socket.on('deleteScene', (data) => {
            const index = data.index;
            if (!ctx.isConnected || index === undefined || index < 1 || index > 99) return;

            console.log(`🗑️ [SCENE DELETE] Comando recebido: DELETAR Cena ${index}`);

            // Comando de Clear Library: F0 43 10 3E 7F 10 60 00 [INDEX] F7
            const deleteSysex = [0xF0, 0x43, 0x10, 0x3E, 0x7F, 0x10, 0x60, 0x00, index, 0xF7];
            ctx.midiEngine.send(deleteSysex);
            console.log(`✅ [SCENE DELETE] Comando enviado para deletar slot ${index}.`);

            // Atualiza a biblioteca local
            ctx.sceneManager.scenes[index] = null;

            ctx.io.emit('scenesUpdated', ctx.sceneManager.getState());

            // Re-sincroniza após pequeno delay
            setTimeout(() => {
                if (typeof ctx.sceneManager.fetchScenes === 'function' && ctx.midiEngine) {
                    ctx.sceneManager.fetchScenes(ctx.midiEngine).catch(err => {
                        console.log('⚠️ [SCENE DELETE] Falha ao re-sincronizar cenas:', err && err.message ? err.message : err);
                    });
                }
            }, ctx.configConstants.scene_resync_delay_ms);
        });

        // --- MODO DEMO ---
        socket.on('toggleDemo', (data) => {
            const config = ctx.loadConfig();
            config.demo_mode = data.enabled;
            ctx.isDemoMode = data.enabled;
            ctx.saveConfig(config);

            // Notify all clients about the demo_mode change so overlay updates
            ctx.io.emit('connectionState', { connected: ctx.isConnected, demo_mode: data.enabled });

            if (data.enabled) {
                // Para a busca automática na USB — não precisamos da mesa física
                if (ctx.buscaInterval) {
                    clearInterval(ctx.buscaInterval);
                    ctx.buscaInterval = null;
                    console.log('🛑 [DEMO] Busca automática na USB suspensa.');
                }
                ctx.iniciarDummy();
            } else {
                console.log("🛑 Parando Simulação de Meters...");
                if (ctx.dummyMeterInterval) clearInterval(ctx.dummyMeterInterval);
                ctx.dummyMeterInterval = null;

                // Pequeno delay para garantir que a zeragem ocorra após os últimos pulsos
                setTimeout(() => {
                    const zeros = new Array(32).fill(0);
                    ctx.meterDataBuffer = zeros;
                    ctx.io.emit('meterData', zeros);
                    console.log("🧹 Meters zerados com sucesso.");
                }, 100);

                // Retoma a busca pela mesa física
                if (!ctx.isConnected) {
                    console.log('🔍 [DEMO OFF] Retomando busca automática na USB...');
                    ctx.iniciarBuscaAutomatica();
                }
            }
        });

        // --- CONFIGURAÇÕES ---
        socket.on('updateMeterConfig', (data) => {
            const config = ctx.loadConfig();
            config.meter_opacity = data.opacity;
            ctx.saveConfig(config);
        });

        socket.on('updateOpenBrowser', (data) => {
            const config = ctx.loadConfig();
            config.open_browser_startup = data.enabled;
            ctx.saveConfig(config);
        });

        socket.on('restartServer', () => {
            console.log('🔁 [SERVER] Reinício solicitado via interface WEB.');
            if (typeof ctx.restartServer === 'function') {
                ctx.restartServer('interface WEB');
            }
        });

        // --- NOMES ---
        socket.on('updateName', (data) => {
            const { channel, name } = data;
            const limitedName = (name || '').substring(0, 16);
            // Suporta Inputs(0-31), Mixes(36-43), Buses(44-51) e Master(52)
            const channelState = ctx.stateManager.getChannelStateById(channel);
            if (channelState) {
                // 1. Atualiza e salva o estado no servidor
                ctx.stateManager.setChannelName(channel, limitedName);
                ctx.saveNames();

                // 2. BROADCAST: Envia para TODOS os clientes (Socket.io) para atualizar o UI em tempo real sem refresh
                ctx.io.emit('updateName', { channel, name: limitedName });

                // 3. MIDI SYNC: Envia para a mesa física com Debounce e Intervalo de Segurança
                if (ctx.isConnected) {
                    if (ctx.nameUpdateTimers.has(channel)) clearTimeout(ctx.nameUpdateTimers.get(channel));

                    const timer = setTimeout(async () => {
                        console.log(`📝 [NAMES] Sincronizando com Yamaha Ch:${channel + 1} -> "${limitedName}"`);
                        const paddedName = limitedName.padEnd(16, ' ').substring(0, 16);

                        // Envia cada caractere do nome sequencialmente (16 bytes para o display da mesa)
                        for (let i = 0; i < 16; i++) {
                            const charCode = paddedName.charCodeAt(i);
                            const msg = ctx.protocol.buildNameChange(channel, i, charCode);
                            if (msg) ctx.midiEngine.send(msg);
                            await new Promise(r => setTimeout(r, ctx.configConstants.name_update_char_delay_ms)); // 30ms para estabilidade do visor da mesa
                        }

                        // Após enviar todas as letras, solicita uma confirmação da mesa para garantir sincronia total
                        const numChars = (channel >= 36) ? 16 : 4; // Canais de input usam 4 chars no visor curto, saídas 16
                        for (let i = 0; i < numChars; i++) {
                            const req = ctx.protocol.buildNameRequest(channel, i);
                            if (req) ctx.midiEngine.send(req);
                        }

                        ctx.nameUpdateTimers.delete(channel);
                    }, 500); // Debounce de 500ms facilita a digitação fluida

                    ctx.nameUpdateTimers.set(channel, timer);
                }
            }
        });

        // --- CONSULTAS DE ESTADO ---
        socket.on('requestDynamics', (data) => {
            const { channel } = data;
            if (channel === undefined || !ctx.isConnected) return;

            // USA O BUSCADOR INTELIGENTE PARA PEGAR O ESTADO (INPUT, MIX, BUS OU MASTER)
            const currentState = ctx.stateManager.getChannelStateById(channel);
            if (!currentState) return;

            socket.emit('dynamicsState', {
                channel,
                gate: currentState.gate || { on: false },
                comp: currentState.comp || { on: false }
            });
        });

        socket.on('requestEqAtt', (data) => {
            const { channel } = data;
            if (channel === undefined || !ctx.isConnected) return;

            const req = ctx.protocol.buildRequest('kInputAttenuator/kAtt', channel);
            if (req) ctx.midiEngine.send(req);
        });

        // --- INJETOR DE MODS (SYSEX DIRETO) ---
        socket.on('sysex', (rawBytes) => {
            if (!ctx.isConnected || !rawBytes) return;
            // Espera um array de números [240, 67, ...]
            ctx.midiEngine.send(rawBytes);
        });

        // --- PAN ---
        // Evento: { channel: <globalId>, value: <-63..+63> }
        socket.on('setPan', (data) => {
            const { channel, value } = data || {};
            if (value === undefined || channel === undefined) return;

            const panModule = require('../midi/pan');

            // 1. Atualiza o estado no servidor
            ctx.stateManager.updateState({ type: 'kPan', channel, value });

            // 2. Broadcast para todos os clientes (inclui quem enviou para feedback imediato)
            ctx.io.emit('update', { type: 'kPan', channel, value });

            // 3. Envia para a mesa física (se conectada)
            if (ctx.isConnected) {
                const sysex = panModule.buildPanChange(channel, value);
                if (sysex) {
                    console.log(`🎛️ [PAN] CH:${channel} Val:${value}`);
                    ctx.midiEngine.send(sysex);
                }
            }
        });

        // Solicita leitura de todos os pans na sincronização manual
        socket.on('syncPan', () => {
            if (!ctx.isConnected) return;
            const panModule = require('../midi/pan');
            const requests = panModule.buildPanSyncRequests();
            console.log(`🔄 [PAN SYNC] Enviando ${requests.length} requests de Pan...`);
            requests.forEach((req, i) => {
                setTimeout(() => ctx.midiEngine.send(req), i * 20); // 20ms entre cada request
            });
        });

        // --- CONTROLE MIDI (FADERS, EQ, DYNAMICS, PAN, ETC.) ---
        socket.on('control', (data) => {
            if (data && data.type !== 'HEARTBEAT') {
                console.log(`📡 [WEB -> MESA] Comando: ${data.type} Ch:${data.channel} Val:${data.value}`);
            }
            if (data.type === 'kChannelInput/kChannelIn') {
                console.log(`🌐 [BROWSER -> SERVER] Mudança de Patch Solicitada: Canal ${data.channel + 1} -> Patch ${data.value}`);
            }

            // Atualiza o estado na memória do servidor
            ctx.stateManager.updateState(data);
            ctx.io.emit('update', data);

            // Seleciona o conversor de valor adequado (fader linear, on/off binário, ou dB assinado)
            const isBinary = data.type.includes('On') || data.type.includes('Solo');
            let converter = isBinary ? ctx.protocol.CONVERTERS.onToBytes : ctx.protocol.CONVERTERS.faderToBytes;

            // Se for EQ Gain (termina em G), Gains em geral, Attenuator ou Dynamics (Threshold/Range), usa conversor de assinado (28-bit)
            if (data.type.toLowerCase().includes('att') ||
                (data.type.includes('EQ/') && data.type.endsWith('G')) ||
                data.type.includes('Gain') ||
                data.type.includes('Threshold') ||
                data.type.includes('Range')) {
                converter = ctx.protocol.CONVERTERS.signedToBytes;
            }

            const sysex = ctx.protocol.buildChange(data.type, data.channel, data.value, converter);
            if (sysex) {
                const hex = Buffer.from(sysex).toString('hex').toUpperCase();
                console.log(`📤 [MIDI OUT] ${data.type} (CH ${data.channel + 1}): Val ${data.value} -> SysEx: ${hex}`);
                ctx.midiEngine.send(sysex);
            }
        });

        // --- DMX ---
        socket.on('resetDmx', () => {
            console.log('💡 [DMX] Reset solicitado via interface WEB.');
            ctx.resetDmxSystem();
        });
    });
}

function initSocketHandler(appCtx) {
    ctx = appCtx;
    ctx.setupSocketHandlers = setupSocketHandlers;
}

module.exports = { initSocketHandler };
