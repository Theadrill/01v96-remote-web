const IGNORED_BYTES = new Set([0xFE, 0xFD, 0xF8]);

class MidiAssembler {
  constructor(callback) {
    this.buffer = [];
    this.callback = callback;
    this.inSysEx = false;
  }

  processInput(rawBytesArray) {
    for (const byte of rawBytesArray) {
      if (byte === 0xF0) {
        this.buffer = [0xF0];
        this.inSysEx = true;
        continue;
      }

      if (!this.inSysEx) continue;

      if (IGNORED_BYTES.has(byte)) continue;

      this.buffer.push(byte);

      if (byte === 0xF7) {
        const completeMessage = [...this.buffer];
        this.buffer = [];
        this.inSysEx = false;
        if (this.callback) {
          try { this.callback(completeMessage); } catch (e) { console.error('MidiAssembler callback error', e); }
        }
      }
    }
  }

  reset() {
    this.buffer = [];
    this.inSysEx = false;
  }
}

module.exports = MidiAssembler;
