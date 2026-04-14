/**
 * MIDI Pipeline — Orquestrador de Sequências SysEx
 * 
 * Garante que mensagens enviadas em rajada (ex: Sync de Boot) sejam
 * transmitidas no ritmo exato que a mesa 01V96 suporta (~41ms entre mensagens),
 * sem travar o Event Loop do Node.js e sem causar buffer overflow no hardware.
 */
class MidiPipeline {
    constructor(midiEngine) {
        this.midiEngine = midiEngine;
        this.queue = [];
        this.interval = null;
        this.intervalMs = 41; // Padrão Studio Manager (24.39 fps)
        this.onComplete = null;
        this.isActive = false;
        this.totalTasks = 0;
        this.completedTasks = 0;
    }

    /**
     * Adiciona uma tarefa SysEx à fila
     * @param {Array|Buffer} sysex O pacote SysEx completo
     */
    addTask(sysex) {
        if (!sysex) return;
        this.queue.push(sysex);
        this.totalTasks++;
    }

    /**
     * Inicia o processamento da fila
     * @param {Number} ms Intervalo entre mensagens (padrão 41ms)
     * @param {Function} progressCallback Chamado a cada item processado (opcional)
     */
    start(ms = 41, progressCallback = null) {
        if (this.isActive) return;
        this.isActive = true;
        this.completedTasks = 0;
        this.intervalMs = ms;

        console.log(`🚀 [Pipeline] Iniciando processamento de ${this.queue.length} tarefas (${ms}ms delay)...`);

        this.interval = setInterval(() => {
            if (this.queue.length === 0) {
                this.stop();
                if (this.onComplete) this.onComplete();
                return;
            }

            const sysex = this.queue.shift();
            const success = this.midiEngine.send(sysex);
            this.completedTasks++;

            if (progressCallback) {
                progressCallback({
                    completed: this.completedTasks,
                    total: this.totalTasks,
                    percent: Math.round((this.completedTasks / this.totalTasks) * 100)
                });
            }

        }, this.intervalMs);
    }

    /**
     * Pára o pipeline e limpa a fila
     */
    stop() {
        if (this.interval) clearInterval(this.interval);
        this.interval = null;
        this.isActive = false;
        this.queue = [];
        this.totalTasks = 0;
        console.log(`🛑 [Pipeline] Processamento encerrado.`);
    }

    /**
     * Define o que fazer ao terminar a fila
     */
    setCompletionHandler(handler) {
        this.onComplete = handler;
    }

    /**
     * Limpa a fila e reseta contadores
     */
    clear() {
        this.queue = [];
        this.totalTasks = 0;
        this.completedTasks = 0;
    }

    get isBusy() {
        return this.isActive;
    }
}

module.exports = MidiPipeline;
