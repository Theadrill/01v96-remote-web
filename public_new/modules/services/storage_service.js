/**
 * =========================================================================================
 * SERVICE: Storage Service (storage_service.js)
 * =========================================================================================
 * Responsabilidade:
 * - Persistência unificada com suporte a chaves globais (01v96_[key]) e escopadas por host.
 * - Suporta serialização segura em JSON, fallback transparente para navegador e Tauri.
 * - Isolamento de preferências por mesa (role, mix ativo, custom names, lock).
 * =========================================================================================
 */

(function () {
    class StorageService {
        constructor(globalPrefix = '01v96_') {
            this.globalPrefix = globalPrefix;
        }

        /**
         * Gera chave global padronizada
         */
        _getGlobalKey(key) {
            return key.startsWith(this.globalPrefix) ? key : `${this.globalPrefix}${key}`;
        }

        /**
         * Gera chave com escopo específico de um host
         */
        _getHostKey(hostId, key) {
            const cleanHostId = (hostId || 'default').replace(/[^a-zA-Z0-9_-]/g, '_');
            return `${this.globalPrefix}host_${cleanHostId}_${key}`;
        }

        // ── Métodos Globais ────────────────────────────────────────────────────────

        getItem(key, defaultValue = null) {
            try {
                const val = localStorage.getItem(this._getGlobalKey(key));
                if (val === null || val === undefined) return defaultValue;
                return val;
            } catch (err) {
                console.warn(`[StorageService] Failed to read key: ${key}`, err);
                return defaultValue;
            }
        }

        getJson(key, defaultValue = null) {
            const raw = this.getItem(key, null);
            if (raw === null) return defaultValue;
            try {
                return JSON.parse(raw);
            } catch (err) {
                console.warn(`[StorageService] Failed to parse JSON for key: ${key}`, err);
                return defaultValue;
            }
        }

        setItem(key, value) {
            try {
                localStorage.setItem(this._getGlobalKey(key), String(value));
                return true;
            } catch (err) {
                console.error(`[StorageService] Failed to write key: ${key}`, err);
                return false;
            }
        }

        setJson(key, value) {
            try {
                const str = JSON.stringify(value);
                return this.setItem(key, str);
            } catch (err) {
                console.error(`[StorageService] Failed to serialize JSON for key: ${key}`, err);
                return false;
            }
        }

        removeItem(key) {
            try {
                localStorage.removeItem(this._getGlobalKey(key));
                return true;
            } catch (err) {
                console.error(`[StorageService] Failed to remove key: ${key}`, err);
                return false;
            }
        }

        // ── Métodos Escopados por Host ─────────────────────────────────────────────

        getHostItem(hostId, key, defaultValue = null) {
            if (!hostId) return this.getItem(key, defaultValue);
            try {
                const val = localStorage.getItem(this._getHostKey(hostId, key));
                if (val === null || val === undefined) return defaultValue;
                return val;
            } catch (err) {
                console.warn(`[StorageService] Failed to read host key: ${hostId}.${key}`, err);
                return defaultValue;
            }
        }

        getHostJson(hostId, key, defaultValue = null) {
            const raw = this.getHostItem(hostId, key, null);
            if (raw === null) return defaultValue;
            try {
                return JSON.parse(raw);
            } catch (err) {
                console.warn(`[StorageService] Failed to parse host JSON for: ${hostId}.${key}`, err);
                return defaultValue;
            }
        }

        setHostItem(hostId, key, value) {
            if (!hostId) return this.setItem(key, value);
            try {
                localStorage.setItem(this._getHostKey(hostId, key), String(value));
                return true;
            } catch (err) {
                console.error(`[StorageService] Failed to write host key: ${hostId}.${key}`, err);
                return false;
            }
        }

        setHostJson(hostId, key, value) {
            try {
                const str = JSON.stringify(value);
                return this.setHostItem(hostId, key, str);
            } catch (err) {
                console.error(`[StorageService] Failed to serialize host JSON for: ${hostId}.${key}`, err);
                return false;
            }
        }

        removeHostItem(hostId, key) {
            if (!hostId) return this.removeItem(key);
            try {
                localStorage.removeItem(this._getHostKey(hostId, key));
                return true;
            } catch (err) {
                console.error(`[StorageService] Failed to remove host key: ${hostId}.${key}`, err);
                return false;
            }
        }

        /**
         * Remove todas as preferências vinculadas a um host
         */
        clearHostData(hostId) {
            if (!hostId) return;
            try {
                const prefix = `${this.globalPrefix}host_${hostId}_`;
                const keysToRemove = [];
                for (let i = 0; i < localStorage.length; i++) {
                    const k = localStorage.key(i);
                    if (k && k.startsWith(prefix)) {
                        keysToRemove.push(k);
                    }
                }
                keysToRemove.forEach(k => localStorage.removeItem(k));
            } catch (err) {
                console.error(`[StorageService] Failed to clear data for host: ${hostId}`, err);
            }
        }
    }

    window.StorageService = new StorageService();
})();
