/**
 * =========================================================================================
 * SERVICE: Host Manager (host_manager.js)
 * =========================================================================================
 * Responsabilidade:
 * - Gerenciamento de Perfis de Conexão (CRUD).
 * - Rastreamento do Host Ativo e preferência de Auto-Conexão.
 * - Fornece resolução inteligente de URLs (HTTP/WS) para o ConnectionService.
 * =========================================================================================
 */

(function () {
    class HostManager {
        constructor() {
            this.STORAGE_KEY_PROFILES = 'host_profiles';
            this.STORAGE_KEY_ACTIVE_ID = 'active_host_id';
            this._listeners = new Set();
            this._profiles = [];
            this._activeHostId = null;

            this._load();
        }

        /**
         * Notifica ouvintes de mudanças nos perfis ou host ativo
         */
        _notify() {
            const state = {
                profiles: this.getProfiles(),
                activeHost: this.getActiveHost()
            };
            this._listeners.forEach(fn => {
                try { fn(state); } catch (e) { console.error('[HostManager] Listener error:', e); }
            });
        }

        subscribe(fn) {
            if (typeof fn === 'function') {
                this._listeners.add(fn);
                // Executa imediatamente com o estado atual
                fn({ profiles: this.getProfiles(), activeHost: this.getActiveHost() });
            }
            return () => this._listeners.delete(fn);
        }

        _load() {
            const raw = window.StorageService ? window.StorageService.getJson(this.STORAGE_KEY_PROFILES, []) : [];
            this._profiles = Array.isArray(raw) ? raw : [];
            this._activeHostId = window.StorageService ? window.StorageService.getItem(this.STORAGE_KEY_ACTIVE_ID, null) : null;

            // Se for navegador padrão e a lista estiver vazia, cria o perfil correspondente à origem
            if (this._profiles.length === 0 && typeof window !== 'undefined' && window.location && window.location.hostname) {
                const isTauriOrigin = (
                    window.location.hostname === 'tauri.localhost' ||
                    window.location.protocol === 'tauri:' ||
                    window.location.protocol === 'asset:' ||
                    Boolean(window.__TAURI__) ||
                    Boolean(window.__TAURI_INTERNALS__)
                );
                const isLocalOrigin = !isTauriOrigin && window.location.protocol.startsWith('http');
                if (isLocalOrigin) {
                    const defaultProfile = {
                        id: 'default_local',
                        name: 'Servidor Local (Origem)',
                        host: window.location.hostname,
                        port: window.location.port ? parseInt(window.location.port, 10) : (window.location.protocol === 'https:' ? 443 : 4000),
                        useSsl: window.location.protocol === 'https:',
                        autoConnect: true,
                        lastConnected: new Date().toISOString(),
                        notes: 'Detectado automaticamente pelo navegador'
                    };
                    this._profiles.push(defaultProfile);
                    this._activeHostId = defaultProfile.id;
                    this._save();
                }
            }
        }

        _save() {
            if (window.StorageService) {
                window.StorageService.setJson(this.STORAGE_KEY_PROFILES, this._profiles);
                if (this._activeHostId) {
                    window.StorageService.setItem(this.STORAGE_KEY_ACTIVE_ID, this._activeHostId);
                } else {
                    window.StorageService.removeItem(this.STORAGE_KEY_ACTIVE_ID);
                }
            }
            this._notify();
        }

        getProfiles() {
            return [...this._profiles];
        }

        getProfileById(id) {
            return this._profiles.find(p => p.id === id) || null;
        }

        getActiveHost() {
            if (this._activeHostId) {
                const found = this.getProfileById(this._activeHostId);
                if (found) return found;
            }
            // Fallback para auto-connect ou primeiro perfil
            const auto = this._profiles.find(p => p.autoConnect);
            if (auto) return auto;
            return this._profiles[0] || null;
        }

        setActiveHost(id) {
            const target = this.getProfileById(id);
            if (target) {
                this._activeHostId = id;
                target.lastConnected = new Date().toISOString();
                this._save();
                return true;
            }
            return false;
        }

        saveProfile(profileData) {
            const isNew = !profileData.id;
            const profile = {
                id: profileData.id || `host_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
                name: (profileData.name || '01V96 Console').trim(),
                host: (profileData.host || '127.0.0.1').trim().replace(/^(https?:\/\/)/, ''),
                port: parseInt(profileData.port, 10) || 4000,
                useSsl: Boolean(profileData.useSsl),
                autoConnect: Boolean(profileData.autoConnect),
                notes: (profileData.notes || '').trim(),
                lastConnected: profileData.lastConnected || null
            };

            // Se autoConnect estiver marcado, desmarca os outros
            if (profile.autoConnect) {
                this._profiles.forEach(p => {
                    if (p.id !== profile.id) p.autoConnect = false;
                });
            }

            if (isNew) {
                this._profiles.push(profile);
            } else {
                const idx = this._profiles.findIndex(p => p.id === profile.id);
                if (idx !== -1) {
                    this._profiles[idx] = profile;
                } else {
                    this._profiles.push(profile);
                }
            }

            if (!this._activeHostId || profile.autoConnect) {
                this._activeHostId = profile.id;
            }

            this._save();
            return profile;
        }

        deleteProfile(id) {
            const idx = this._profiles.findIndex(p => p.id === id);
            if (idx === -1) return false;

            this._profiles.splice(idx, 1);

            // Limpa dados escopados do storage
            if (window.StorageService) {
                window.StorageService.clearHostData(id);
            }

            if (this._activeHostId === id) {
                const auto = this._profiles.find(p => p.autoConnect);
                this._activeHostId = auto ? auto.id : (this._profiles[0] ? this._profiles[0].id : null);
            }

            this._save();
            return true;
        }

        /**
         * Gera URL HTTP base para um perfil ou host ativo
         */
        getHttpUrl(profile) {
            const p = profile || this.getActiveHost();
            if (!p) {
                if (typeof window !== 'undefined' && window.location && window.location.protocol.startsWith('http')) {
                    return window.location.origin;
                }
                return 'http://127.0.0.1:4000';
            }
            const proto = p.useSsl ? 'https' : 'http';
            return `${proto}://${p.host}:${p.port || 4000}`;
        }

        /**
         * Gera URL WebSocket base para um perfil ou host ativo
         */
        getSocketUrl(profile) {
            const p = profile || this.getActiveHost();
            if (!p) {
                if (typeof window !== 'undefined' && window.location && window.location.protocol.startsWith('http')) {
                    return window.location.origin;
                }
                return 'http://127.0.0.1:4000';
            }
            const proto = p.useSsl ? 'https' : 'http';
            return `${proto}://${p.host}:${p.port || 4000}`;
        }
    }

    window.HostManager = new HostManager();
})();
