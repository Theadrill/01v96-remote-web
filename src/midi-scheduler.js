class MidiScheduler {
    constructor(midiEngine) {
        this.midiEngine = midiEngine;
        this.q0 = [];
        this.q1 = [];
        this.q2 = [];
        this.interval = null;
        this.tickMs = 15;
        this.isRunning = false;
        this.totalProcessed = 0;
        this.onQ1Empty = null;
        this._q1WasProcessing = false;
    }

    enqueue(bytesArray, priority) {
        if (!bytesArray || bytesArray.length === 0) return false;

        switch (priority) {
            case 0: return this._enqueueP0(bytesArray);
            case 1: return this._enqueueP1(bytesArray);
            case 2: return this._enqueueP2(bytesArray);
            default: return false;
        }
    }

    _enqueueP0(bytes) {
        const addr = this._extractAddress(bytes);
        if (addr) {
            const idx = this.q0.findIndex(item => this._extractAddress(item) === addr);
            if (idx !== -1) {
                this.q0[idx] = bytes;
                return true;
            }
        }
        this.q0.push(bytes);
        return true;
    }

    _enqueueP1(bytes) {
        this.q1.push(bytes);
        return true;
    }

    _enqueueP2(bytes) {
        if (this.q0.length > 0 || this.q1.length > 0) {
            return false;
        }
        this.q2.push(bytes);
        return true;
    }

    _extractAddress(bytes) {
        if (bytes.length >= 6 && bytes[0] === 0xF0 && bytes[1] === 0x43) {
            const dev = bytes[3] & 0x0F;
            const addr = bytes.slice(4, 7);
            return `${dev}-${addr.map(b => b.toString(16)).join('-')}`;
        }
        return null;
    }

    start() {
        if (this.isRunning) return;
        this.isRunning = true;
        this.interval = setInterval(() => this._tick(), this.tickMs);
    }

    stop() {
        if (this.interval) {
            clearInterval(this.interval);
            this.interval = null;
        }
        this.isRunning = false;
    }

    _tick() {
        let packet = null;

        if (this.q0.length > 0) {
            packet = this.q0.shift();
        } else if (this.q1.length > 0) {
            packet = this.q1.shift();
            this._q1WasProcessing = true;
        } else if (this.q2.length > 0) {
            packet = this.q2.shift();
        }

        if (packet) {
            try {
                if (this.midiEngine && typeof this.midiEngine.send === 'function') {
                    this.midiEngine.send(packet);
                }
            } catch (e) {
                console.error('MidiScheduler send error', e);
            }
            this.totalProcessed++;
        } else {
            if (this._q1WasProcessing && this.onQ1Empty) {
                try { this.onQ1Empty(); } catch (e) { console.error('onQ1Empty callback error', e); }
                this._q1WasProcessing = false;
            }
        }
    }

    clear(priority) {
        switch (priority) {
            case 0: this.q0 = []; break;
            case 1: this.q1 = []; break;
            case 2: this.q2 = []; break;
            default:
                this.q0 = [];
                this.q1 = [];
                this.q2 = [];
        }
    }

    getStats() {
        return {
            q0: this.q0.length,
            q1: this.q1.length,
            q2: this.q2.length,
            totalProcessed: this.totalProcessed,
            isRunning: this.isRunning
        };
    }
}

module.exports = MidiScheduler;
