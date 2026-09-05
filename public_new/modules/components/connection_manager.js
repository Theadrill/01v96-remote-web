/**
 * =========================================================================================
 * COMPONENT: Connection Manager UI (connection_manager.js)
 * =========================================================================================
 * Responsabilidade:
 * - Interface visual completa do gerenciador de conexões multi-host.
 * - UX simplificada para operadores: auto-seleção, 1-click connect e gerenciamento de mesas.
 * =========================================================================================
 */

(function () {
    'use strict';

    class ConnectionManagerUI {
        constructor() {
            this._editingHostId = null;
            this._unsubscribeState = null;
            this._initialized = false;
        }

        init() {
            if (this._initialized) return;
            this._initialized = true;

            // Inscreve no HostManager para atualizar UI sob alterações
            if (window.HostManager && typeof window.HostManager.subscribe === 'function') {
                this._unsubscribeState = window.HostManager.subscribe(() => this.render());
            }

            // Auto-check de inicialização para ambiente Tauri
            this._checkInitialTauriLaunch();
        }

        _checkInitialTauriLaunch() {
            const isTauriEnv = typeof window !== 'undefined' && (
                Boolean(window.isTauriEnv) ||
                Boolean(window.__TAURI__) ||
                Boolean(window.__TAURI_INTERNALS__) ||
                (window.location && (
                    window.location.hostname === 'tauri.localhost' ||
                    window.location.protocol === 'tauri:' ||
                    window.location.protocol === 'asset:'
                ))
            );
            if (!isTauriEnv) return;

            const active = window.HostManager ? window.HostManager.getActiveHost() : null;
            if (!active) {
                // Nenhuma mesa cadastrada, abre a tela de conexão como primeiro passo
                this.open();
            } else if (active.autoConnect) {
                // Auto-conecta diretamente
                this.connectToHost(active.id);
            } else {
                // Abre para o operador confirmar a mesa
                this.open();
            }
        }

        open() {
            const overlay = document.getElementById('connectionScreenModal');
            if (overlay) {
                overlay.classList.add('active');
                this.render();
            }
        }

        close() {
            const overlay = document.getElementById('connectionScreenModal');
            if (overlay) {
                overlay.classList.remove('active');
            }
        }

        render() {
            const profiles = window.HostManager ? window.HostManager.getProfiles() : [];
            const activeHost = window.HostManager ? window.HostManager.getActiveHost() : null;

            // Atualiza o Display da Mesa Ativa (Destaque Principal)
            const activeNameEl = document.getElementById('connActiveHostName');
            const activeAddrEl = document.getElementById('connActiveHostAddress');
            const connectBtn = document.getElementById('connConnectBtn');

            if (activeHost) {
                if (activeNameEl) activeNameEl.textContent = activeHost.name || '01V96 Console';
                if (activeAddrEl) activeAddrEl.textContent = `${activeHost.useSsl ? 'https://' : 'http://'}${activeHost.host}:${activeHost.port || 4000}`;
                if (connectBtn) {
                    connectBtn.disabled = false;
                    connectBtn.innerHTML = `<span>CONECTAR EM ${this._escapeHtml(activeHost.name || '01V96').toUpperCase()}</span> ➔`;
                }
            } else {
                if (activeNameEl) activeNameEl.textContent = 'Nenhuma Mesa Selecionada';
                if (activeAddrEl) activeAddrEl.textContent = 'Adicione ou selecione uma mesa abaixo';
                if (connectBtn) {
                    connectBtn.disabled = true;
                    connectBtn.innerHTML = `<span>SELECIONE UMA MESA</span>`;
                }
            }

            // Renderiza a lista de mesas cadastradas
            const listEl = document.getElementById('connHostsList');
            if (!listEl) return;

            if (profiles.length === 0) {
                listEl.innerHTML = `
                    <div class="conn-empty-state">
                        <div class="conn-empty-icon">🎛️</div>
                        <div class="conn-empty-title">Nenhuma mesa configurada</div>
                        <p class="conn-empty-desc">Para conectar ao seu console 01V96, cadastre o endereço IP da mesa na sua rede local ou VPN.</p>
                        <button class="conn-btn-add-highlight" onclick="window.ConnectionManagerUI.openAddModal()">
                            <span>+ ADICIONAR MESA</span> ➔
                        </button>
                    </div>
                `;
                return;
            }

            listEl.innerHTML = profiles.map(p => {
                const isSelected = activeHost && activeHost.id === p.id;

                return `
                    <div class="conn-host-item ${isSelected ? 'selected' : ''}" onclick="window.ConnectionManagerUI.selectHost('${p.id}')">
                        <div class="conn-host-item-left">
                            <div class="conn-host-radio"></div>
                            <div class="conn-host-details">
                                <div class="conn-host-title-wrap">
                                    <span class="conn-host-name">${this._escapeHtml(p.name || 'Console')}</span>
                                    ${p.autoConnect ? '<span class="conn-host-badge conn-badge-auto">AUTO</span>' : ''}
                                    ${p.useSsl ? '<span class="conn-host-badge conn-badge-ssl">SSL</span>' : ''}
                                </div>
                                <span class="conn-host-address">${this._escapeHtml(p.host)}:${p.port || 4000}</span>
                            </div>
                        </div>
                        <div class="conn-host-item-right">
                            <button class="conn-host-actions-btn" title="Editar Perfil" onclick="event.stopPropagation(); window.ConnectionManagerUI.openEditModal('${p.id}')">
                                ✏️
                            </button>
                        </div>
                    </div>
                `;
            }).join('');
        }

        selectHost(id) {
            if (window.HostManager) {
                window.HostManager.setActiveHost(id);
                this.render();
            }
        }

        async connectToHost(id) {
            const hostId = id || (window.HostManager && window.HostManager.getActiveHost() ? window.HostManager.getActiveHost().id : null);
            if (!hostId) return;

            const banner = document.getElementById('connStatusBanner');
            const bannerText = document.getElementById('connStatusBannerText');
            const connectBtn = document.getElementById('connConnectBtn');

            if (banner) {
                banner.className = 'conn-status-banner connecting';
                if (bannerText) bannerText.textContent = 'Conectando ao console 01V96...';
            }
            if (connectBtn) connectBtn.disabled = true;

            try {
                if (window.ConnectionService) {
                    await window.ConnectionService.connectToProfile(hostId);
                }
                if (banner) {
                    banner.className = 'conn-status-banner success';
                    if (bannerText) bannerText.textContent = 'Conectado com sucesso! Entrando...';
                }
                setTimeout(() => {
                    this.close();
                    if (banner) banner.className = 'conn-status-banner';
                    if (connectBtn) connectBtn.disabled = false;
                }, 600);
            } catch (err) {
                console.error('[ConnectionManagerUI] Erro ao conectar:', err);
                if (banner) {
                    banner.className = 'conn-status-banner error';
                    if (bannerText) bannerText.textContent = `Falha na conexão: ${err.message || 'Mesa inacessível'}`;
                }
                if (connectBtn) connectBtn.disabled = false;
            }
        }

        connectActive() {
            const active = window.HostManager ? window.HostManager.getActiveHost() : null;
            if (active) {
                this.connectToHost(active.id);
            }
        }

        openAddModal() {
            this._editingHostId = null;
            const titleEl = document.getElementById('connFormTitle');
            const nameEl = document.getElementById('connFormName');
            const hostEl = document.getElementById('connFormHost');
            const portEl = document.getElementById('connFormPort');
            const sslEl = document.getElementById('connFormSsl');
            const autoEl = document.getElementById('connFormAuto');
            const delBtn = document.getElementById('connFormDeleteBtn');

            if (titleEl) titleEl.textContent = 'Adicionar Mesa 01V96';
            if (nameEl) nameEl.value = 'Mesa Principal';
            if (hostEl) hostEl.value = '';
            if (portEl) portEl.value = '4000';
            if (sslEl) sslEl.checked = false;
            if (autoEl) autoEl.checked = true;
            if (delBtn) delBtn.style.display = 'none';

            const modal = document.getElementById('connectionFormModal');
            if (modal) modal.classList.add('active');
            if (hostEl) setTimeout(() => hostEl.focus(), 80);
        }

        openEditModal(id) {
            const profile = window.HostManager ? window.HostManager.getProfileById(id) : null;
            if (!profile) return;

            this._editingHostId = id;
            const titleEl = document.getElementById('connFormTitle');
            const nameEl = document.getElementById('connFormName');
            const hostEl = document.getElementById('connFormHost');
            const portEl = document.getElementById('connFormPort');
            const sslEl = document.getElementById('connFormSsl');
            const autoEl = document.getElementById('connFormAuto');
            const delBtn = document.getElementById('connFormDeleteBtn');

            if (titleEl) titleEl.textContent = 'Editar Mesa 01V96';
            if (nameEl) nameEl.value = profile.name || '';
            if (hostEl) hostEl.value = profile.host || '';
            if (portEl) portEl.value = String(profile.port || 4000);
            if (sslEl) sslEl.checked = Boolean(profile.useSsl);
            if (autoEl) autoEl.checked = Boolean(profile.autoConnect);
            if (delBtn) delBtn.style.display = 'block';

            const modal = document.getElementById('connectionFormModal');
            if (modal) modal.classList.add('active');
        }

        closeFormModal() {
            const modal = document.getElementById('connectionFormModal');
            if (modal) modal.classList.remove('active');
            this._editingHostId = null;
        }

        saveForm() {
            const nameEl = document.getElementById('connFormName');
            const hostEl = document.getElementById('connFormHost');
            const portEl = document.getElementById('connFormPort');
            const sslEl = document.getElementById('connFormSsl');
            const autoEl = document.getElementById('connFormAuto');

            const hostVal = hostEl ? hostEl.value.trim() : '';
            if (!hostVal) {
                if (hostEl) hostEl.focus();
                return;
            }

            const profileData = {
                id: this._editingHostId,
                name: (nameEl && nameEl.value.trim()) || 'Console 01V96',
                host: hostVal,
                port: parseInt((portEl && portEl.value) || 4000, 10) || 4000,
                useSsl: Boolean(sslEl && sslEl.checked),
                autoConnect: Boolean(autoEl && autoEl.checked)
            };

            if (window.HostManager) {
                const saved = window.HostManager.saveProfile(profileData);
                if (saved) {
                    window.HostManager.setActiveHost(saved.id);
                }
            }

            this.closeFormModal();
            this.render();
        }

        deleteCurrentFormHost() {
            if (!this._editingHostId) return;

            if (window.HostManager) {
                window.HostManager.deleteProfile(this._editingHostId);
            }
            this.closeFormModal();
            this.render();
        }

        _escapeHtml(str) {
            if (!str) return '';
            return String(str)
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#039;');
        }
    }

    window.ConnectionManagerUI = new ConnectionManagerUI();

    document.addEventListener('DOMContentLoaded', () => {
        window.ConnectionManagerUI.init();
    });
})();
