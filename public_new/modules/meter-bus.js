/**
 * MeterBus (v2) - 01v96 Remote Web
 * Barramento Pub/Sub Zero-Copy para Medidores de Nível (VU Meters).
 *
 * Permite que componentes (ex: <channel-strip>) se inscrevam diretamente para receber
 * os níveis de áudio decodificados pelo motor WebAssembly a 60 FPS sem tocar no DOM global.
 */

class MeterBusManager {
    constructor() {
        /** @type {Map<number, Set<Function>>} Inscrições ativas por canal */
        this._subscribers = new Map();

        /** @type {Array<{type: 'reg'|'unreg', ch: number, callback?: Function}>} Fila de mutações pendentes durante o frame */
        this._pending = [];

        /** @type {boolean} Flag indicando se estamos dentro da execução de um frame */
        this._isDispatching = false;
    }

    /**
     * Inscreve um callback para receber os níveis de um canal específico
     * @param {number} ch ID global do canal (0-79 mapeado no buffer WASM)
     * @param {Function} callback Assinatura: (level: number, peak: number, now: number) => void
     */
    register(ch, callback) {
        if (typeof callback !== 'function') return;

        if (this._isDispatching) {
            this._pending.push({ type: 'reg', ch, callback });
        } else {
            this._applyRegister(ch, callback);
        }
    }

    /**
     * Remove a inscrição de um callback ou de todos os callbacks de um canal
     * @param {number} ch ID global do canal
     * @param {Function} [callback] Se omitido, remove todos os inscritos deste canal
     */
    unregister(ch, callback) {
        if (this._isDispatching) {
            this._pending.push({ type: 'unreg', ch, callback });
        } else {
            this._applyUnregister(ch, callback);
        }
    }

    /**
     * Despacha um frame de dados vindo da memória WebAssembly para os inscritos
     * @param {Float32Array} wasmMeterView Ponteiro de memória Float32Array(80) do WASM
     * @param {number} now Timestamp do frame (performance.now())
     */
    frame(wasmMeterView, now) {
        if (!wasmMeterView || wasmMeterView.length === 0) return;

        this._isDispatching = true;

        for (const [ch, callbacks] of this._subscribers.entries()) {
            if (ch >= 0 && ch < wasmMeterView.length) {
                const level = wasmMeterView[ch];
                // Em canais de áudio, level é a porcentagem calculada (0 a 100)
                for (const cb of callbacks) {
                    try {
                        cb(level, now);
                    } catch (err) {
                        console.error(`[MeterBus] Erro ao executar callback do canal ${ch}:`, err);
                    }
                }
            }
        }

        this._isDispatching = false;

        // Processa mutações que ocorreram durante o frame
        if (this._pending.length > 0) {
            for (const item of this._pending) {
                if (item.type === 'reg') {
                    this._applyRegister(item.ch, item.callback);
                } else if (item.type === 'unreg') {
                    this._applyUnregister(item.ch, item.callback);
                }
            }
            this._pending.length = 0;
        }
    }

    /**
     * Retorna a quantidade de ouvintes registrados para um canal
     * @param {number} ch
     * @returns {number}
     */
    subscriberCount(ch) {
        const list = this._subscribers.get(ch);
        return list ? list.size : 0;
    }

    /**
     * Limpa todas as inscrições do barramento
     */
    clearAll() {
        this._subscribers.clear();
        this._pending.length = 0;
    }

    _applyRegister(ch, callback) {
        let set = this._subscribers.get(ch);
        if (!set) {
            set = new Set();
            this._subscribers.set(ch, set);
        }
        set.add(callback);
    }

    _applyUnregister(ch, callback) {
        const set = this._subscribers.get(ch);
        if (!set) return;

        if (callback) {
            set.delete(callback);
            if (set.size === 0) {
                this._subscribers.delete(ch);
            }
        } else {
            this._subscribers.delete(ch);
        }
    }
}

// Instância singleton exportada
export const MeterBus = new MeterBusManager();

// Bridge de Compatibilidade Global (Transição v2)
if (typeof window !== 'undefined') {
    window.MeterBus = MeterBus;
}
