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
            const statusText = guardianNames.length > 0 ? `🛡️ ${guardianNames.join(', ')}` : '🛡️ Nenhum';
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
                        message: 'Mutar todos os canais?\n(Você pode selecionar os canais que ficarão protegidos na engrenagem de configuração)',
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
        banner.style.gridColumn = '1 / -1';
        banner.style.width = '100%';
        banner.style.display = 'flex';
        banner.style.justifyContent = 'space-between';
        banner.style.alignItems = 'center';
        banner.style.background = '#222';
        banner.style.border = '1px solid #444';
        banner.style.borderRadius = '8px';
        banner.style.padding = '10px 14px';
        banner.style.marginBottom = '8px';
        banner.style.boxSizing = 'border-box';
        
        const statusInfo = document.createElement('div');
        
        const statusTitle = document.createElement('div');
        statusTitle.style.fontSize = '11px';
        statusTitle.style.fontWeight = '600';
        
        const statusDetails = document.createElement('div');
        statusDetails.style.fontSize = '10px';
        statusDetails.style.color = '#aaa';
        
        if (modData.snapshot.active) {
            const mutedCount = modData.snapshot.channels_to_restore.length;
            statusTitle.textContent = '🔴 CORTE ATIVO';
            statusTitle.style.color = '#d32f2f';
            statusDetails.textContent = `${mutedCount} canais mutados na memória`;
        } else {
            statusTitle.textContent = '⚪ EM REPOUSO';
            statusTitle.style.color = '#888';
            statusDetails.textContent = 'Nenhum canal mutado pela macro';
        }
        
        statusInfo.appendChild(statusTitle);
        statusInfo.appendChild(statusDetails);
        
        const resetBtn = document.createElement('button');
        resetBtn.className = 'btn-connect';
        resetBtn.textContent = '↺ Limpar Memória do Toggle';
        resetBtn.style.background = 'transparent';
        resetBtn.style.border = '1px solid #f59e0b';
        resetBtn.style.color = '#f59e0b';
        resetBtn.style.fontSize = '10px';
        resetBtn.style.padding = '6px 10px';
        resetBtn.style.borderRadius = '6px';
        resetBtn.style.cursor = 'pointer';
        resetBtn.onclick = async () => {
            modData.snapshot = createDefaultModData().snapshot;
            try {
                await MixerAPI.storage.saveModConfig(MOD_ID, modData, true);
            } catch (e) {
                console.error(`[${MOD_ID}] Erro ao limpar memória:`, e);
            }
            statusTitle.textContent = '⚪ EM REPOUSO';
            statusTitle.style.color = '#888';
            statusDetails.textContent = 'Nenhum canal mutado pela macro';
            updatePadVisual(slotIndex, modData);
        };
        
        banner.appendChild(statusInfo);
        banner.appendChild(resetBtn);
        grid.appendChild(banner);

        // Título da seção de guardiões
        const guardiansTitle = document.createElement('div');
        guardiansTitle.className = 'section-title';
        guardiansTitle.textContent = 'Canais Protegidos (não serão mutados)';
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
            btn.className = 'btn-connect';
            btn.style.height = '50px';
            btn.style.margin = '0';
            btn.style.fontSize = '10px';
            btn.style.textTransform = 'uppercase';
            btn.style.borderRadius = '8px';
            btn.style.position = 'relative';
            
            if (isGuardian) {
                btn.style.background = '#2e7d32';
                btn.style.color = '#fff';
                btn.style.border = '1px solid #4caf50';
            } else {
                btn.style.background = '#333';
                btn.style.color = isOnMixer ? '#fff' : '#888';
                btn.style.border = '1px solid #444';
            }
            
            if (isOnMixer) {
                btn.style.border = '2px solid #ffcc00';
                btn.style.boxShadow = 'inset 0 0 5px rgba(255, 204, 0, 0.5)';
            }
            
            btn.innerHTML = `<span style="display:block; font-size:8px; opacity:0.5;">${i+1}</span> ${chName}`;
            
            if (isPaired) {
                const pairBadge = document.createElement('span');
                pairBadge.style.position = 'absolute';
                pairBadge.style.top = '2px';
                pairBadge.style.right = '4px';
                pairBadge.style.fontSize = '8px';
                pairBadge.style.color = '#ffcc00';
                pairBadge.textContent = '🔗';
                btn.appendChild(pairBadge);
            }
            
            const updateButtonVisual = (buttonEl, chIdx) => {
                if (!buttonEl) return;
                const isG = modData.guardians.includes(chIdx);
                const isOn = (typeof channelStates !== 'undefined' && channelStates[chIdx] && channelStates[chIdx].on === true);
                buttonEl.style.background = isG ? '#2e7d32' : '#333';
                buttonEl.style.color = isG ? '#fff' : (isOn ? '#fff' : '#888');
                if (isOn) {
                    buttonEl.style.border = '2px solid #ffcc00';
                    buttonEl.style.boxShadow = 'inset 0 0 5px rgba(255, 204, 0, 0.5)';
                } else {
                    buttonEl.style.border = isG ? '1px solid #4caf50' : '1px solid #444';
                    buttonEl.style.boxShadow = 'none';
                }
            };

            btn.onclick = () => {
                const idx = modData.guardians.indexOf(i);
                if (idx === -1) {
                    modData.guardians.push(i);
                    updateButtonVisual(btn, i);
                    
                    if (isPaired) {
                        const partner = window.MixerAPI.state.getPairPartner(i);
                        if (!modData.guardians.includes(partner)) {
                            modData.guardians.push(partner);
                            const partnerBtn = grid.querySelector(`button[data-channel="${partner}"]`);
                            updateButtonVisual(partnerBtn, partner);
                        }
                    }
                } else {
                    modData.guardians.splice(idx, 1);
                    updateButtonVisual(btn, i);
                    
                    if (isPaired) {
                        const partner = window.MixerAPI.state.getPairPartner(i);
                        const partnerIdx = modData.guardians.indexOf(partner);
                        if (partnerIdx !== -1) {
                            modData.guardians.splice(partnerIdx, 1);
                            const partnerBtn = grid.querySelector(`button[data-channel="${partner}"]`);
                            updateButtonVisual(partnerBtn, partner);
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
        info.textContent = 'Canais verdes estão protegidos contra o corte. Canais com borda amarela estão ligados na mesa física. Canais estéreo são vinculados automaticamente.';
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
        color: '#1976d2',
        onInit,
        execute,
        onConfigure,
        onSave,
        onClear,
        onDelete
    });
})();