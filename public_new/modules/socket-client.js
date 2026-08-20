/**
 * Módulo de Conexão WebSocket / Socket.io (v2) - 01v96 Remote Web
 * Centraliza a instância do Socket e funções auxiliares de comunicação com o servidor Rust.
 */

export const socket = (typeof io !== 'undefined') ? io({
    transports: ['websocket'],
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    timeout: 20000
}) : null;

/**
 * Emite um evento via Socket.io com validação de conexão
 * @param {string} event
 * @param {*} data
 */
export function emit(event, data) {
    if (socket && socket.connected) {
        socket.emit(event, data);
    } else if (socket) {
        // Envia mesmo se estiver em processo de reconexão
        socket.emit(event, data);
    } else {
        console.warn(`[SocketClient] Impossível emitir '${event}': socket não inicializado.`);
    }
}

/**
 * Registra um ouvinte para evento Socket.io
 * @param {string} event
 * @param {Function} handler
 */
export function on(event, handler) {
    if (socket) {
        socket.on(event, handler);
    }
}

/**
 * Remove um ouvinte de evento Socket.io
 * @param {string} event
 * @param {Function} handler
 */
export function off(event, handler) {
    if (socket) {
        socket.off(event, handler);
    }
}

/**
 * Retorna se o socket está atualmente conectado
 * @returns {boolean}
 */
export function isConnected() {
    return socket ? Boolean(socket.connected) : false;
}

// ==========================================
// Bridge de Compatibilidade Global (Transição v2)
// ==========================================
if (typeof window !== 'undefined') {
    window.socket = socket;
}
