class SyncCounter {
    constructor() {
        this._counter = 0;
    }
    
    // Chamado IMEDIATAMENTE ANTES de enviar algo para a mesa (via midiEngine.send)
    beginSync() {
        this._counter++;
    }
    
    // Chamado IMEDIATAMENTE APÓS receber algo da mesa. 
    // true = é eco do nosso próprio envio, ignora.
    // false = é alteração real (física) da mesa, processe.
    shouldIgnore() {
        if (this._counter > 0) {
            this._counter--;
            return true;
        }
        return false;
    }

    // Apenas para limpeza em caso de desconexão dura
    reset() {
        this._counter = 0;
    }
}

module.exports = new SyncCounter();
