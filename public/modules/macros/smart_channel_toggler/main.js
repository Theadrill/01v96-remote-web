/**
 * MOD: SMART CHANNEL TOGGLER
 * Corte inteligente de banda preservando canais guardiões e restauração com memória.
 */
(function() {
    const MOD_ID = 'smart_channel_toggler';
    const TTL_MS = 12 * 60 * 60 * 1000; // 12 horas em milissegundos
    let isExecuting = false;
    let currentModData = createDefaultModData();

    // Estrutura de dados padrão
    function createDefaultModData() {
        return {
            guardians: [],
            snapshot: {
                active: false,
                channels_to_restore: [],
                timestamp: null,
                scene_id: null,
                desk_name: null
            }
        };
    }

    // Valida snapshot (TTL, scene_id, desk_name)
    function isSnapshotValid(snapshot) {
        if (!snapshot || !snapshot.active) return false;
        if (!snapshot.timestamp || !snapshot.scene_id || !snapshot.desk_name) return false;
        const now = Date.now();
        if (now - snapshot.timestamp > TTL_MS) return false;
        // Verifica se a cena e a mesa são as mesmas
        const currentScene = window.MixerAPI.state.getCurrentScene();
        const currentDesk = window.MixerAPI.state.getDeskName();
        return snapshot.scene_id === currentScene && snapshot.desk_name === currentDesk;
    }

    // Atualiza visual do pad
    function updatePadVisual(slotIndex, modData, colorOverride) {
        const snapshot = modData.snapshot;
        if (snapshot.active) {
            MixerAPI.ui.setDynamicColor(slotIndex, '#d32f2f');
            MixerAPI.ui.setSlotStatus(slotIndex, 'MUTED');
        } else {
            // Restaura cor original ou usa cor do manifest
            if (colorOverride) MixerAPI.ui.setDynamicColor(slotIndex, colorOverride);
            MixerAPI.ui.resetDynamicSlot(slotIndex);
            const guardianNames = modData.guardians.map(ch => {
                const name = getChannelName(ch);
                return name;
            });
            const statusText = guardianNames.length > 0 ? `G: ${guardianNames.join(', ')}` : 'G: Nenhum';
            MixerAPI.ui.setSlotStatus(slotIndex, statusText);
        }
    }

    // Obtém nome do canal
    function getChannelName(chIndex) {
        if (window.channelStates && window.channelStates[chIndex]) {
            return window.channelStates[chIndex].name || `CH ${chIndex+1}`;
        }
        if (window.resolvedNames && window.resolvedNames[chIndex]) {
            return window.resolvedNames[chIndex].name || `CH ${chIndex+1}`;
        }
        return `CH ${chIndex+1}`;
    }

    // Inicialização
    async function onInit(slotIndex, slotConfig) {
        let modData = createDefaultModData();
        try {
            const loaded = await MixerAPI.storage.getModConfig(MOD_ID);
            if (loaded && typeof loaded === 'object') {
                modData = { ...modData, ...loaded };
            }
        } catch (e) {
            console.error(`[${MOD_ID}] Erro ao carregar config:`, e);
        }
        currentModData = modData;

        // Valida snapshot
        if (!isSnapshotValid(modData.snapshot)) {
            modData.snapshot = createDefaultModData().snapshot;
            try {
                await MixerAPI.storage.saveModConfig(MOD_ID, modData, true);
            } catch (e) {
                console.error(`[${MOD_ID}] Erro ao salvar snapshot inválido:`, e);
            }
        }

        // Atualiza visual do pad
        updatePadVisual(slotIndex, modData);
        return modData;
    }

    // Função principal de execução
    async function execute(slotIndex, slotConfig) {
        if (isExecuting) return;
        isExecuting = true;
        try {
            // Carrega dados atuais
            let modData = createDefaultModData();
            try {
                const loaded = await MixerAPI.storage.getModConfig(MOD_ID);
                if (loaded && typeof loaded === 'object') {
                    modData = { ...modData, ...loaded };
                }
            } catch (e) {
                console.error(`[${MOD_ID}] Erro ao carregar config:`, e);
            }

            const snapshot = modData.snapshot;

            if (!snapshot.active) {
                // Modo repouso -准备 mutar canais
                if (modData.guardians.length === 0) {
                    // Pede confirmação
                    const confirmed = await MixerAPI.ui.confirm({
                        title: 'Atenção',
                        message: 'Mutar todos os canais?\n(Você pode configurar os canais que não serão mutados na engrenagem de configuração)',
                        type: 'warning'
                    });
                    if (!confirmed) {
                        isExecuting = false;
                        return;
                    }
                }

                // Coleta canais ON que não são guardiões
                const channelsToRestore = [];
                for (let ch = 0; ch < 32; ch++) {
                    const state = MixerAPI.state.getChannel(ch);
                    if (state && state.on === true) {
                        // Verifica se é guardião
                        if (modData.guardians.includes(ch)) continue;
                        // Verifica se é parceiro estéreo de um guardião
                        const isGuardianPartner = modData.guardians.some(g => {
                            if (!window.MixerAPI.state.isPaired(g)) return false;
                            const partner = window.MixerAPI.state.getPairPartner(g);
                            return partner === ch;
                        });
                        if (isGuardianPartner) continue;
                        channelsToRestore.push(ch);
                    }
                }

                if (channelsToRestore.length === 0) {
                    isExecuting = false;
                    return;
                }

                // Atualiza snapshot
                snapshot.active = true;
                snapshot.channels_to_restore = channelsToRestore;
                snapshot.timestamp = Date.now();
                snapshot.scene_id = window.MixerAPI.state.getCurrentScene();
                snapshot.desk_name = window.MixerAPI.state.getDeskName();

                // Salva config
                try {
                    await MixerAPI.storage.saveModConfig(MOD_ID, modData, true);
                } catch (e) {
                    console.error(`[${MOD_ID}] Erro ao salvar snapshot:`, e);
                }

                // Muta canais
                for (const ch of channelsToRestore) {
                    MixerAPI.mixer.toggleOn(ch, false);
                    await new Promise(r => setTimeout(r, 20));
                }

                // Atualiza visual
                updatePadVisual(slotIndex, modData);
            } else {
                // Modo ativo - restaura canais
                const channelsToRestore = snapshot.channels_to_restore;
                for (const ch of channelsToRestore) {
                    const state = MixerAPI.state.getChannel(ch);
                    if (state && state.on === false) {
                        MixerAPI.mixer.toggleOn(ch, true);
                        await new Promise(r => setTimeout(r, 20));
                    }
                }

                // Limpa snapshot
                snapshot.active = false;
                snapshot.channels_to_restore = [];
                snapshot.timestamp = null;
                snapshot.scene_id = null;
                snapshot.desk_name = null;

                // Salva config
                try {
                    await MixerAPI.storage.saveModConfig(MOD_ID, modData, true);
                } catch (e) {
                    console.error(`[${MOD_ID}] Erro ao salvar snapshot limpo:`, e);
                }

                // Atualiza visual
                updatePadVisual(slotIndex, modData);
            }
        } catch (e) {
            console.error(`[${MOD_ID}] Erro na execução:`, e);
        } finally {
            isExecuting = false;
        }
    }

    // Configuração da macro
    async function onConfigure(slotIndex, slotConfig) {
        // Carrega dados
        let modData = createDefaultModData();
        try {
            const loaded = await MixerAPI.storage.getModConfig(MOD_ID);
            if (loaded && typeof loaded === 'object') {
                modData = { ...modData, ...loaded };
            }
        } catch (e) {
            console.error(`[${MOD_ID}] Erro ao carregar config:`, e);
        }
        currentModData = modData;
        renderConfigurationUI(slotIndex, currentModData);
    }

    // Renderiza UI de configuração
    async function renderConfigurationUI(slotIndex, modData) {
        const grid = document.getElementById('macroSettingsGrid');
        const title = document.getElementById('settingsMacroTitle');
        if (!grid) return;

        title.innerText = `Smart Toggler - Slot ${slotIndex + 1}`;
        grid.innerHTML = '';

        // Banner de status de memória
        const banner = document.createElement('div');
        banner.className = 'macro-status-banner';
        
        const statusInfo = document.createElement('div');
        statusInfo.className = 'status-info';
        
        const statusTitle = document.createElement('div');
        statusTitle.className = 'status-title';
        statusTitle.textContent = 'Memória de Toggle';
        
        const statusDetails = document.createElement('div');
        statusDetails.className = 'status-details';
        
        if (modData.snapshot.active) {
            const mutedCount = modData.snapshot.channels_to_restore.length;
            const timestamp = new Date(modData.snapshot.timestamp).toLocaleString();
            statusDetails.textContent = `Ativo: ${mutedCount} canais mutados desde ${timestamp}`;
        } else {
            statusDetails.textContent = 'Nenhum toggle ativo';
        }
        
        statusInfo.appendChild(statusTitle);
        statusInfo.appendChild(statusDetails);
        
        const resetBtn = document.createElement('button');
        resetBtn.className = 'btn-reset-memory';
        resetBtn.textContent = '↺ Limpar Memória do Toggle';
        resetBtn.onclick = async () => {
            modData.snapshot = createDefaultModData().snapshot;
            try {
                await MixerAPI.storage.saveModConfig(MOD_ID, modData, true);
            } catch (e) {
                console.error(`[${MOD_ID}] Erro ao limpar memória:`, e);
            }
            // Atualiza banner
            statusDetails.textContent = 'Nenhum toggle ativo';
            // Atualiza visual do pad
            updatePadVisual(slotIndex, modData);
        };
        
        banner.appendChild(statusInfo);
        banner.appendChild(resetBtn);
        grid.appendChild(banner);

        // Título da seção de guardiões
        const guardiansTitle = document.createElement('div');
        guardiansTitle.className = 'section-title';
        guardiansTitle.textContent = 'Canais Guardiões (não serão mutados)';
        guardiansTitle.style.gridColumn = '1 / -1';
        grid.appendChild(guardiansTitle);

        // Botões dos canais
        for (let i = 0; i < 32; i++) {
            const chName = getChannelName(i);
            const isGuardian = modData.guardians.includes(i);
            const isOnMixer = (typeof channelStates !== 'undefined' && channelStates[i] && channelStates[i].on === true);
            const isMuted = modData.snapshot.active && modData.snapshot.channels_to_restore.includes(i);
            const isPaired = window.MixerAPI.state.isPaired(i);
            
            const btn = document.createElement('button');
            btn.className = 'channel-btn guardian-btn';
            if (isGuardian) btn.classList.add('is-guardian');
            if (isOnMixer) btn.classList.add('is-mixer-on');
            if (isMuted) btn.classList.add('is-muted-by-macro');
            
            const label = document.createElement('span');
            label.className = 'ch-label';
            label.textContent = i + 1;
            
            const nameSpan = document.createElement('span');
            nameSpan.className = 'ch-name';
            nameSpan.textContent = chName;
            
            btn.appendChild(label);
            btn.appendChild(nameSpan);
            
            // Badge de par estéreo
            if (isPaired) {
                const pairBadge = document.createElement('span');
                pairBadge.className = 'pair-badge';
                pairBadge.textContent = '🔗 L/R';
                btn.appendChild(pairBadge);
            }
            
            btn.onclick = () => {
                // Lógica de seleção de guardião
                const idx = modData.guardians.indexOf(i);
                if (idx === -1) {
                    // Adiciona como guardião
                    modData.guardians.push(i);
                    btn.classList.add('is-guardian');
                    
                    // Se pareado, adiciona parceiro também
                    if (isPaired) {
                        const partner = window.MixerAPI.state.getPairPartner(i);
                        if (!modData.guardians.includes(partner)) {
                            modData.guardians.push(partner);
                            // Atualiza visual do parceiro (encontra o botão correspondente)
                            const partnerBtn = grid.querySelector(`button[data-channel="${partner}"]`);
                            if (partnerBtn) partnerBtn.classList.add('is-guardian');
                        }
                    }
                } else {
                    // Remove guardião
                    modData.guardians.splice(idx, 1);
                    btn.classList.remove('is-guardian');
                    
                    // Se pareado, remove parceiro também
                    if (isPaired) {
                        const partner = window.MixerAPI.state.getPairPartner(i);
                        const partnerIdx = modData.guardians.indexOf(partner);
                        if (partnerIdx !== -1) {
                            modData.guardians.splice(partnerIdx, 1);
                            const partnerBtn = grid.querySelector(`button[data-channel="${partner}"]`);
                            if (partnerBtn) partnerBtn.classList.remove('is-guardian');
                        }
                    }
                }
            };
            
            btn.setAttribute('data-channel', i);
            grid.appendChild(btn);
        }

        // Texto informativo
        const info = document.createElement('div');
        info.className = 'info-text';
        info.textContent = 'Canais amarelos estão ligados na mesa. Guardiões não serão mutados. Canais pareados são selecionados automaticamente.';
        info.style.gridColumn = '1 / -1';
        grid.appendChild(info);
    }

    // Salva configuração
    async function onSave(slotIndex) {
        // Salva guardian preservando snapshot ativo
        try {
            await MixerAPI.storage.saveModConfig(MOD_ID, currentModData, true);
        } catch (e) {
            console.error(`[${MOD_ID}] Erro ao salvar config:`, e);
        }

        // Atualiza visual do pad
        updatePadVisual(slotIndex, currentModData);

        // Fecha modal
        document.getElementById('macroSettingsModal').style.display = 'none';
    }

    // Limpa configuração
    async function onClear(slotIndex) {
        let modData = createDefaultModData();
        try {
            await MixerAPI.storage.saveModConfig(MOD_ID, modData, true);
        } catch (e) {
            console.error(`[${MOD_ID}] Erro ao limpar config:`, e);
        }
        // Re-renderiza
        onConfigure(slotIndex);
    }

    // Deleta macro
    async function onDelete(slotIndex) {
        try {
            await MixerAPI.storage.saveModConfig(MOD_ID, null, true);
        } catch (e) {
            console.error(`[${MOD_ID}] Erro ao deletar config:`, e);
        }
    }

    // Registra macro
    MixerAPI.registerMacro(MOD_ID, {
        name: 'Smart Toggler',
        color: '#6a1b9a',
        onInit,
        execute,
        onConfigure,
        onSave,
        onClear,
        onDelete
    });
})();