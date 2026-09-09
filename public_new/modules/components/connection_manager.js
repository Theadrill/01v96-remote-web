/**
 * =========================================================================================
 * COMPONENT: Connection Manager UI (connection_manager.js)
 * =========================================================================================
 * Responsabilidade:
 * - Interface visual completa do gerenciador de conexões multi-host.
 * - UX simplificada para operadores: auto-seleção, 1-click connect e gerenciamento de mesas.
 *
 * MODOS DE OPERAÇÃO:
 * - select:  selectHost(id) apenas marca o perfil como ativo (activeHost) sem navegar.
 *            Clique no card da lista.
 * - navigate (B): navigateToHost(id, uiVariant) / navigateActive(uiVariant) faz navegação
 *            real via window.location.href = url. uiVariant='new' => /new/ , 'classic' => /.
 *            Preferência do usuário para browser puro (Steam Deck) sem digitar na barra.
 *            Usa HostManager.getNavigateUrl(profile, uiVariant) se existir, senão monta
 *            `${proto}://${host}:${port}${uiVariant==='new'?'/new/':'/'}` limpo (sem search/hash).
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

            this._checkInitialLaunch();
            this._bindHostLowercase();
        }

        _bindHostLowercase() {
            try {
                var hostEl = document.getElementById('connFormHost');
                if (!hostEl || hostEl._vkLowerBound) return;
                hostEl._vkLowerBound = true;
                hostEl.addEventListener('input', function () {
                    var s = this.selectionStart;
                    var e = this.selectionEnd;
                    var lower = this.value.toLowerCase();
                    if (lower !== this.value) {
                        this.value = lower;
                        try { this.selectionStart = s; this.selectionEnd = e; } catch (_) {}
                    }
                });
                // Normaliza valor inicial se já houver
                if (hostEl.value) hostEl.value = hostEl.value.toLowerCase();
            } catch (_) {}
        }

        _isTauriEnv() {
            return typeof window !== 'undefined' && (
                Boolean(window.isTauriEnv) ||
                Boolean(window.__TAURI__) ||
                Boolean(window.__TAURI_INTERNALS__) ||
                (window.location && (
                    window.location.hostname === 'tauri.localhost' ||
                    window.location.protocol === 'tauri:' ||
                    window.location.protocol === 'asset:'
                ))
            );
        }

        _checkInitialLaunch() {
            const isTauriEnv = this._isTauriEnv();
            const active = window.HostManager ? window.HostManager.getActiveHost() : null;
            const profiles = window.HostManager ? window.HostManager.getProfiles() : [];

            if (isTauriEnv) {
                if (!active) {
                    this.open();
                } else if (active.autoConnect) {
                    this.connectToHost(active.id);
                } else {
                    this.open();
                }
                return;
            }

            // Browser puro: nunca auto-navega (evita loop de redirect).
            // - Se só existe default_local, já está no origin => nada a fazer.
            // - Se activeHost.host/port diverge do origin, apenas reflete estado via banner em render().
            // - Auto-connect via socket swap não é feito aqui; usuário escolhe navegar (B) ou conectar (CORS).
            const onlyDefault = profiles.length === 1 && profiles[0] && profiles[0].id === 'default_local';
            if (onlyDefault) return;
            // Não abre modal automaticamente no browser para não bloquear quem já está no origin correto;
            // render() cuidará do banner "Você está em X mas sua mesa ativa é Y".
        }

        // Compat: alias legado
        _checkInitialTauriLaunch() {
            return this._checkInitialLaunch();
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
            let classicBtn = document.getElementById('connNavigateClassicBtn');
            const banner = document.getElementById('connStatusBanner');
            const bannerText = document.getElementById('connStatusBannerText');

            // Garante botão clássico (cria se não existir) — compat com connConnectBtn existente
            if (connectBtn && !classicBtn) {
                classicBtn = document.createElement('button');
                classicBtn.id = 'connNavigateClassicBtn';
                classicBtn.className = 'conn-btn-secondary-large';
                classicBtn.setAttribute('onclick', "window.ConnectionManagerUI.navigateActive('classic')");
                classicBtn.style.marginTop = '8px';
                connectBtn.insertAdjacentElement('afterend', classicBtn);
            }
            // Remove qualquer vestígio do botão socket swap (connSocketBtn/connConnectInPlaceBtn)
            var _oldInplace = document.getElementById('connConnectInPlaceBtn') || document.getElementById('connSocketBtn');
            if (_oldInplace && _oldInplace.parentElement) _oldInplace.parentElement.removeChild(_oldInplace);
            // Banner de divergência de origin (browser puro)
            let mismatchBanner = document.getElementById('connOriginMismatchBanner');
            if (!mismatchBanner && connectBtn && connectBtn.parentElement) {
                mismatchBanner = document.createElement('div');
                mismatchBanner.id = 'connOriginMismatchBanner';
                mismatchBanner.style.display = 'none';
                mismatchBanner.style.marginTop = '8px';
                mismatchBanner.style.fontSize = '12px';
                mismatchBanner.style.padding = '8px 10px';
                mismatchBanner.style.borderRadius = '6px';
                mismatchBanner.style.background = 'rgba(255,193,7,0.15)';
                mismatchBanner.style.border = '1px solid rgba(255,193,7,0.35)';
                mismatchBanner.style.color = 'inherit';
                if (banner) banner.insertAdjacentElement('beforebegin', mismatchBanner);
                else connectBtn.parentElement.appendChild(mismatchBanner);
            }

            if (activeHost) {
                if (activeNameEl) activeNameEl.textContent = activeHost.name || '01V96 Console';
                if (activeAddrEl) activeAddrEl.textContent = `${activeHost.useSsl ? 'https://' : 'http://'}${activeHost.host}:${activeHost.port || 4000}`;
                const safeName = this._escapeHtml(activeHost.name || '01V96').toUpperCase();
                if (connectBtn) {
                    connectBtn.disabled = false;
                    // Compat: connConnectBtn vira ABRIR UI NOVA (B)
                    connectBtn.innerHTML = `<span>ABRIR UI NOVA (/new) — ${safeName}</span> ➔`;
                    connectBtn.setAttribute('onclick', "window.ConnectionManagerUI.navigateActive('new')");
                    connectBtn.title = 'Navegar para /new/ deste host (B)';
                }
                if (classicBtn) {
                    classicBtn.disabled = false;
                    classicBtn.style.display = '';
                    classicBtn.textContent = 'ABRIR UI CLÁSSICA (/)';
                    classicBtn.title = 'Navegar para / deste host';
                }
                if (mismatchBanner) {
                    if (!this._isTauriEnv() && this._isOriginMismatch(activeHost)) {
                        const locHost = window.location.hostname;
                        const locPort = window.location.port || (window.location.protocol === 'https:' ? '443' : '80');
                        const locOrigin = `${locHost}:${locPort}`;
                        const activeOrigin = `${activeHost.host}:${activeHost.port || 4000}`;
                        mismatchBanner.style.display = '';
                        mismatchBanner.innerHTML = `Você está em <b>${this._escapeHtml(locOrigin)}</b> mas sua mesa ativa é <b>${this._escapeHtml(activeOrigin)}</b> — use os botões acima para navegar.`;
                    } else {
                        mismatchBanner.style.display = 'none';
                        mismatchBanner.textContent = '';
                    }
                }
                if (banner && bannerText && !banner.classList.contains('connecting') && !banner.classList.contains('error') && !banner.classList.contains('success')) {
                    bannerText.textContent = 'Escolha UI NOVA (/new) ou CLÁSSICA (/) para navegar.';
                }
            } else {
                if (activeNameEl) activeNameEl.textContent = 'Nenhuma Mesa Selecionada';
                if (activeAddrEl) activeAddrEl.textContent = 'Adicione ou selecione uma mesa abaixo';
                if (connectBtn) {
                    connectBtn.disabled = true;
                    connectBtn.innerHTML = `<span>SELECIONE UMA MESA</span>`;
                    connectBtn.removeAttribute('onclick');
                }
                if (classicBtn) { classicBtn.disabled = true; classicBtn.style.display = ''; classicBtn.textContent = 'ABRIR UI CLÁSSICA (/)'; }
                if (mismatchBanner) { mismatchBanner.style.display = 'none'; mismatchBanner.textContent = ''; }
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
                const pid = this._escapeAttr(p.id);

                return `
                    <div class="conn-host-item ${isSelected ? 'selected' : ''}" onclick="window.ConnectionManagerUI.selectHost('${pid}')">
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
                        <div class="conn-host-item-right" style="display:flex;gap:6px;align-items:center;">
                            <button class="conn-host-nav-btn" title="Abrir UI Nova (/new) deste host" style="font-size:11px;padding:4px 8px;border-radius:6px;border:1px solid rgba(255,255,255,0.2);background:rgba(99,102,241,0.2);cursor:pointer;" onclick="event.stopPropagation(); window.ConnectionManagerUI.navigateToHost('${pid}','new')">NOVA</button>
                            <button class="conn-host-nav-btn" title="Abrir UI Clássica (/) deste host" style="font-size:11px;padding:4px 6px;border-radius:6px;border:1px solid rgba(255,255,255,0.15);background:transparent;cursor:pointer;" onclick="event.stopPropagation(); window.ConnectionManagerUI.navigateToHost('${pid}','classic')">/</button>
                            <button class="conn-host-actions-btn" title="Editar Perfil" onclick="event.stopPropagation(); window.ConnectionManagerUI.openEditModal('${pid}')">
                                &#9999;&#65039;
                            </button>
                        </div>
                    </div>
                `;
            }).join('');
        }

        _buildNavigateUrl(profile, uiVariant) {
            if (!profile) return null;
            // Preferred: delegate to HostManager if it exposes helper (future compat)
            if (window.HostManager && typeof window.HostManager.getNavigateUrl === 'function') {
                try {
                    const delegated = window.HostManager.getNavigateUrl(profile, uiVariant);
                    if (delegated) return delegated;
                } catch (_e) { /* fallback to local build */ }
            }
            const proto = profile.useSsl ? 'https' : 'http';
            const host = profile.host;
            const port = profile.port || 4000;
            const suffix = uiVariant === 'classic' ? '/' : '/new/';
            return `${proto}://${host}:${port}${suffix}`;
        }

        _isOriginMismatch(profile) {
            if (!profile || typeof window === 'undefined' || !window.location) return false;
            try {
                const locHost = window.location.hostname;
                const locPort = window.location.port ? parseInt(window.location.port, 10) : (window.location.protocol === 'https:' ? 443 : 80);
                const pHost = String(profile.host || '').toLowerCase();
                const pPort = parseInt(profile.port || 4000, 10);
                // Compare hostname case-insensitively; port compare normalizes default ports
                const locPortNorm = locPort;
                // For default_local the mismatch check is still valid; tauri origin never mismatches (handled elsewhere)
                return pHost !== String(locHost).toLowerCase() || pPort !== locPortNorm;
            } catch (_e) { return false; }
        }

        navigateToHost(id, uiVariant) {
            const variant = uiVariant === 'classic' ? 'classic' : 'new';
            let profile = null;
            if (window.HostManager) {
                profile = window.HostManager.getProfileById(id) || window.HostManager.getActiveHost();
            }
            if (!profile) return;
            // Marca como ativa antes de navegar para que o próximo origin já reflita a escolha
            if (window.HostManager && profile.id) {
                try { window.HostManager.setActiveHost(profile.id); } catch (_e) {}
            }
            const url = this._buildNavigateUrl(profile, variant);
            if (!url) return;
            // Navegação real (B): limpa search/hash para evitar carregar estado errado
            window.location.href = url;
        }

        navigateActive(uiVariant) {
            const active = window.HostManager ? window.HostManager.getActiveHost() : null;
            if (!active) return;
            this.navigateToHost(active.id, uiVariant);
        }

        _escapeAttr(str) {
            return String(str).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
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
            var _cvkA = document.getElementById('connFormHostVkWrap');
            if (_cvkA) _cvkA.classList.add('is-hidden');
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
            var _cvkE = document.getElementById('connFormHostVkWrap');
            if (_cvkE) _cvkE.classList.add('is-hidden');
        }

        closeFormModal() {
            const modal = document.getElementById('connectionFormModal');
            if (modal) modal.classList.remove('active');
            this._editingHostId = null;
            var _cvk = document.getElementById('connFormHostVkWrap');
            if (_cvk) _cvk.classList.add('is-hidden');
        }

        saveForm() {
            const nameEl = document.getElementById('connFormName');
            const hostEl = document.getElementById('connFormHost');
            const portEl = document.getElementById('connFormPort');
            const sslEl = document.getElementById('connFormSsl');
            const autoEl = document.getElementById('connFormAuto');

            const rawHost = hostEl ? hostEl.value.trim() : '';
            if (!rawHost) {
                if (hostEl) hostEl.focus();
                return;
            }
            const hostVal = rawHost.toLowerCase();

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
