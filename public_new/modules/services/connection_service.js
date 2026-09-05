/**
 * =========================================================================================
 * SERVICE: Connection Service (connection_service.js)
 * =========================================================================================
 * Responsabilidade:
 * - Resolução dinâmica de URLs para APIs REST (window.apiFetch).
 * - Gerenciamento de ciclo de vida de conexão com o SocketProxy.
 * - Teste e diagnóstico de Ping HTTP com suporte a AbortController.
 * =========================================================================================
 */

(function () {
    class ConnectionService {
        constructor() {
            this._listeners = new Set();
            this._isConnecting = false;
            this._currentPing = null;
            this._pingInterval = null;

            this._setupGlobalApiFetch();
        }

        subscribe(fn) {
            if (typeof fn === 'function') {
                this._listeners.add(fn);
            }
            return () => this._listeners.delete(fn);
        }

        _notify(event, payload) {
            this._listeners.forEach(fn => {
                try { fn(event, payload); } catch (e) { console.error('[ConnectionService] Listener error:', e); }
            });
        }

        /**
         * Retorna a URL base HTTP do host ativo
         */
        getHttpBase() {
            if (window.HostManager && typeof window.HostManager.getHttpUrl === 'function') {
                return window.HostManager.getHttpUrl();
            }
            if (typeof window !== 'undefined' && window.location && window.location.protocol.startsWith('http')) {
                return window.location.origin;
            }
            return 'http://127.0.0.1:4000';
        }

        /**
         * Retorna a URL base do WebSocket do host ativo
         */
        getWsBase() {
            if (window.HostManager && typeof window.HostManager.getSocketUrl === 'function') {
                return window.HostManager.getSocketUrl();
            }
            if (typeof window !== 'undefined' && window.location && window.location.protocol.startsWith('http')) {
                return window.location.origin;
            }
            return 'http://127.0.0.1:4000';
        }

        /**
         * Resolve caminhos relativos de API para a URL do host ativo
         */
        resolveApiUrl(pathOrUrl) {
            if (!pathOrUrl || typeof pathOrUrl !== 'string') return pathOrUrl;

            // Se for URL absoluta externa (http://, https://, blob:, data:), mantém intacta
            if (/^(https?:|\/\/|blob:|data:)/i.test(pathOrUrl)) {
                return pathOrUrl;
            }

            // Assets estáticos locais bundled no Tauri (steps.json, wasm, temas locais relativos)
            if (pathOrUrl.startsWith('steps.json') || pathOrUrl.startsWith('wasm/') || pathOrUrl.startsWith('./') || pathOrUrl.startsWith('vendor/')) {
                return pathOrUrl;
            }

            const baseUrl = this.getHttpBase().replace(/\/+$/, '');
            const cleanPath = pathOrUrl.startsWith('/') ? pathOrUrl : `/${pathOrUrl}`;
            return `${baseUrl}${cleanPath}`;
        }

        /**
         * Inicializa window.apiFetch para roteamento dinâmico e transparente
         */
        _setupGlobalApiFetch() {
            const self = this;
            window.apiFetch = function (input, init) {
                if (typeof input === 'string') {
                    const resolved = self.resolveApiUrl(input);
                    return fetch(resolved, init);
                } else if (input instanceof Request) {
                    const resolvedUrl = self.resolveApiUrl(input.url);
                    const newRequest = new Request(resolvedUrl, input);
                    return fetch(newRequest, init);
                }
                return fetch(input, init);
            };
        }

        /**
         * Conecta o SocketProxy ao host atualmente selecionado no HostManager
         */
        connectToActiveHost() {
            const host = window.HostManager ? window.HostManager.getActiveHost() : null;
            return this.connectToHost(host);
        }

        /**
         * Conecta a um perfil específico ou objeto de host
         */
        connectToHost(hostProfile) {
            const socketUrl = window.HostManager ? window.HostManager.getSocketUrl(hostProfile) : this.getWsBase();
            console.log(`[ConnectionService] Connecting to 01V96 server at: ${socketUrl}`);

            this._notify('connecting', { host: hostProfile, url: socketUrl });

            if (window.socket && typeof window.socket.connect === 'function') {
                window.socket.connect(socketUrl, {
                    transports: ['websocket'],
                    timeout: 8000,
                    reconnection: true,
                    reconnectionAttempts: 10,
                    reconnectionDelay: 1000
                });
            }

            return socketUrl;
        }

        /**
         * Desconecta o socket
         */
        disconnect() {
            if (window.socket && typeof window.socket.disconnect === 'function') {
                window.socket.disconnect();
            }
            this._notify('disconnected', null);
        }

        /**
         * Executa um teste de Ping HTTP em um host específico
         */
        async testPing(hostProfile, timeoutMs = 3000) {
            const baseUrl = window.HostManager ? window.HostManager.getHttpUrl(hostProfile) : this.getHttpBase();
            const targetUrl = `${baseUrl.replace(/\/+$/, '')}/api/network-info?_t=${Date.now()}`;

            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

            const startTime = performance.now();
            try {
                const response = await fetch(targetUrl, {
                    method: 'GET',
                    signal: controller.signal,
                    cache: 'no-store'
                });
                clearTimeout(timeoutId);

                const latency = Math.round(performance.now() - startTime);

                if (response.ok) {
                    let data = null;
                    try { data = await response.json(); } catch (e) { }
                    return { success: true, latency, data, status: response.status };
                } else {
                    return { success: false, latency, error: `HTTP ${response.status}`, status: response.status };
                }
            } catch (err) {
                clearTimeout(timeoutId);
                const isAbort = err.name === 'AbortError';
                return {
                    success: false,
                    latency: isAbort ? timeoutMs : Math.round(performance.now() - startTime),
                    error: isAbort ? 'Timeout' : (err.message || 'Offline')
                };
            }
        }
    }

    window.ConnectionService = new ConnectionService();
})();
