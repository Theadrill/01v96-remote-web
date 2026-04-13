/**
 * 01V96 REMOTE - MACRO CORE API (Master Blaster Edition)
 * Este é o "contrato" para os modders. Camada de isolamento e segurança.
 */

window.MixerAPI = {
    // 🎚️ CONTROLE DA MESA (Envio via evento 'control')
    mixer: {
        setFader: (ch, val) => {
            const id = parseInt(ch);
            let cmdPrefix = 'kInput';
            if (id === 52 || ch === 'master') cmdPrefix = 'kStereo';
            else if (id >= 36 && id <= 43) cmdPrefix = 'kAUX';
            else if (id >= 44 && id <= 51) cmdPrefix = 'kBus';

            socket.emit('control', { 
                type: `${cmdPrefix}Fader/kFader`, 
                channel: ch, 
                value: val 
            });
        },
        toggleOn: (ch, state) => {
            const id = parseInt(ch);
            let cmdPrefix = 'kInput';
            if (id === 52 || ch === 'master') cmdPrefix = 'kStereo';
            else if (id >= 36 && id <= 43) cmdPrefix = 'kAUX';
            else if (id >= 44 && id <= 51) cmdPrefix = 'kBus';

            socket.emit('control', { 
                type: `${cmdPrefix}ChannelOn/kChannelOn`, 
                channel: ch, 
                value: state ? 1 : 0 
            });
        },
        sendRawSysEx: (bytes) => {
            socket.emit('sysex', bytes); // No server o evento de sysex direto é 'sysex'
        }
    },

    // 🌐 COMUNICAÇÃO EXTERNA
    network: {
        fetch: async (url, options = {}) => {
            const res = await fetch('/api/macros/proxy/http', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url, options })
            });
            return res.json();
        },
        udpSend: async (host, port, data) => {
            return fetch('/api/macros/proxy/udp', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ host, port, data })
            });
        }
    },

    // 🛠️ UTILITÁRIOS
    utils: {
        rawToDb: (val) => window.rawToDb ? window.rawToDb(val) : val,
        dbToRaw: (db) => window.dbToRaw ? window.dbToRaw(db) : db,
        getPreset: () => window.getCurrentMacroPreset ? window.getCurrentMacroPreset() : 'default'
    }
};

console.log("💎 MacroAPI Core carregada.");
