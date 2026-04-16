const protocol = require('./protocol');
const stateManager = require('./state-manager');
const masterMeter = require('./master-meter');

class SyncManager {
    constructor(scheduler, io, sceneManager) {
        this.scheduler = scheduler;
        this.io = io;
        this.sceneManager = sceneManager;
        this.isSyncing = false;
        this.isFullySynced = true;
        this.hasSyncedNamesThisSession = false;
        this.onSyncComplete = null;
    }

    // fire(targetSocket, forceNames)
    // targetSocket: socket específico para receber o estado ao final (opcional)
    // forceNames: força re-sincronização de nomes mesmo que já feito nesta sessão
    fire(targetSocket = null, forceNames = false) {
        if (this.isSyncing) return;

        this.isSyncing = true;
        this.isFullySynced = false;

        if (this.io) {
            this.io.emit('syncStatus', true);
        }

        this._queueAllParams(forceNames, targetSocket);
    }

    _queueAllParams(forceNames, targetSocket) {
        const priority = 1;

        // Para os meters antes do sync
        this.scheduler.enqueue(masterMeter.buildStopRequest(), priority);

        // Fader e On do Stereo Master
        this.scheduler.enqueue(protocol.buildRequest('kStereoFader/kFader', 0), priority);

        // 32 Canais de Input
        for (let i = 0; i < 32; i++) {
            this.scheduler.enqueue(protocol.buildRequest('kInputFader/kFader', i), priority);
            this.scheduler.enqueue(protocol.buildRequest('kInputChannelOn/kChannelOn', i), priority);
            this.scheduler.enqueue(protocol.buildRequest('kSetupSoloChOn/kSoloChOn', i), priority);
            this.scheduler.enqueue(protocol.buildRequest('kInputPhase/kPhase', i), priority);
            this.scheduler.enqueue(protocol.buildRequest('kInputAttenuator/kAtt', i), priority);

            // EQ
            this.scheduler.enqueue(protocol.buildRequest('kInputEQ/kEQOn', i), priority);
            this.scheduler.enqueue(protocol.buildRequest('kInputEQ/kEQMode', i), priority);
            this.scheduler.enqueue(protocol.buildRequest('kInputEQ/kEQHPFOn', i), priority);
            this.scheduler.enqueue(protocol.buildRequest('kInputEQ/kEQLPFOn', i), priority);
            ['Low', 'LowMid', 'HiMid', 'Hi'].forEach(b => {
                this.scheduler.enqueue(protocol.buildRequest(`kInputEQ/kEQ${b}F`, i), priority);
                this.scheduler.enqueue(protocol.buildRequest(`kInputEQ/kEQ${b}G`, i), priority);
                this.scheduler.enqueue(protocol.buildRequest(`kInputEQ/kEQ${b}Q`, i), priority);
            });

            // AUX Sends (8 bandas)
            for (let a = 1; a <= 8; a++) {
                this.scheduler.enqueue(protocol.buildRequest(`kInputAUX/kAUX${a}Level`, i), priority);
                this.scheduler.enqueue(protocol.buildRequest(`kInputAUX/kAUX${a}On`, i), priority);
            }

            // Gate
            ['kGateOn', 'kGateAttack', 'kGateRange', 'kGateHold', 'kGateDecay', 'kGateThreshold'].forEach(p => {
                this.scheduler.enqueue(protocol.buildRequest(`kInputGate/${p}`, i), priority);
            });

            // Comp
            ['kCompOn', 'kCompAttack', 'kCompRelease', 'kCompRatio', 'kCompGain', 'kCompKnee', 'kCompThreshold'].forEach(p => {
                this.scheduler.enqueue(protocol.buildRequest(`kInputComp/${p}`, i), priority);
            });

            // Patch e Bus Assignments
            this.scheduler.enqueue(protocol.buildRequest('kChannelInput/kChannelIn', i), priority);
            this.scheduler.enqueue(protocol.buildRequest('kInputBus/kStereo', i), priority);
            for (let b = 1; b <= 8; b++) {
                this.scheduler.enqueue(protocol.buildRequest(`kInputBus/kBus${b}`, i), priority);
            }
        }

        // AUX Masters e Bus Masters (8 cada)
        for (let i = 0; i < 8; i++) {
            this.scheduler.enqueue(protocol.buildRequest('kAUXFader/kFader', i), priority);
            this.scheduler.enqueue(protocol.buildRequest('kAUXChannelOn/kChannelOn', i), priority);
            this.scheduler.enqueue(protocol.buildRequest('kBusFader/kFader', i), priority);
            this.scheduler.enqueue(protocol.buildRequest('kBusChannelOn/kChannelOn', i), priority);
        }

        // Stereo Master completo
        this.scheduler.enqueue(protocol.buildRequest('kStereoFader/kFader', 0), priority);
        this.scheduler.enqueue(protocol.buildRequest('kStereoChannelOn/kChannelOn', 0), priority);
        this.scheduler.enqueue(protocol.buildRequest('kStereoAttenuator/kAtt', 0), priority);
        this.scheduler.enqueue(protocol.buildRequest('kStereoEQ/kEQOn', 0), priority);
        ['Low', 'LowMid', 'HiMid', 'Hi'].forEach(b => {
            this.scheduler.enqueue(protocol.buildRequest(`kStereoEQ/kEQ${b}F`, 0), priority);
            this.scheduler.enqueue(protocol.buildRequest(`kStereoEQ/kEQ${b}G`, 0), priority);
            this.scheduler.enqueue(protocol.buildRequest(`kStereoEQ/kEQ${b}Q`, 0), priority);
        });
        ['kCompOn', 'kCompAttack', 'kCompRelease', 'kCompRatio', 'kCompGain', 'kCompKnee', 'kCompThreshold'].forEach(p => {
            this.scheduler.enqueue(protocol.buildRequest(`kStereoComp/${p}`, 0), priority);
        });

        // Nomes de canais (apenas na primeira sync da sessão, ou se forceNames=true)
        if (forceNames || !this.hasSyncedNamesThisSession) {
            for (let i = 0; i < 32; i++) {
                for (let c = 0; c < 4; c++) {
                    this.scheduler.enqueue(protocol.buildNameRequest(i, c), priority);
                }
            }
            // Outputs: AUX 36-43, Bus 44-51, Master 52
            const outIndices = [];
            for (let i = 36; i <= 43; i++) outIndices.push(i);
            for (let i = 44; i <= 51; i++) outIndices.push(i);
            outIndices.push(52);
            for (const idx of outIndices) {
                for (let c = 0; c < 8; c++) {
                    this.scheduler.enqueue(protocol.buildNameRequest(idx, c), priority);
                }
            }
        }

        this.hasSyncedNamesThisSession = true;

        // Registra callback para quando a q1 esvaziar
        const self = this;
        this.scheduler.onQ1Empty = function () {
            self._onQueueEmpty(targetSocket);
        };
    }

    _onQueueEmpty(targetSocket) {
        this.isSyncing = false;
        this.isFullySynced = true;

        if (this.io) {
            this.io.emit('syncStatus', false);
            this.io.emit('sync', stateManager.getState());
        }

        if (targetSocket && typeof targetSocket.emit === 'function') {
            targetSocket.emit('sync', stateManager.getState());
        }

        console.log('✅ [SyncManager] Sincronização concluída!');

        if (this.onSyncComplete) {
            this.onSyncComplete();
        }
    }

    // Sync apenas de nomes (para o evento 'refreshNames' do socket)
    syncNamesOnly() {
        if (this.isSyncing) return;

        this.isSyncing = true;
        this.isFullySynced = false;

        this.scheduler.enqueue(masterMeter.buildStopRequest(), 1);

        for (let i = 0; i < 32; i++) {
            for (let c = 0; c < 4; c++) {
                this.scheduler.enqueue(protocol.buildNameRequest(i, c), 1);
            }
        }

        const outIndices = [];
        for (let i = 36; i <= 43; i++) outIndices.push(i);
        for (let i = 44; i <= 51; i++) outIndices.push(i);
        outIndices.push(52);
        for (const idx of outIndices) {
            for (let c = 0; c < 8; c++) {
                this.scheduler.enqueue(protocol.buildNameRequest(idx, c), 1);
            }
        }

        const self = this;
        this.scheduler.onQ1Empty = function () {
            self.isSyncing = false;
            self.isFullySynced = true;
            if (self.io) {
                self.io.emit('sync', stateManager.getState());
            }
            console.log('✅ [SyncManager] Nomes sincronizados!');
        };
    }

    get isBusy() { return this.isSyncing; }
    get isReady() { return this.isFullySynced; }

    reset() {
        this.hasSyncedNamesThisSession = false;
    }
}

module.exports = SyncManager;
