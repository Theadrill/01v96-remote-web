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
            socket.emit('sysex', bytes);
        }
    },

    // 📊 ESTADO E CONSULTAS DO HARDWARE
    state: {
        getChannel: (ch) => typeof getChannelStateById === 'function' ? getChannelStateById(ch) : window.channelStates?.[ch],
        isPaired: (ch) => {
            const st = window.channelStates?.[ch];
            return st?.paired || false;
        },
        getPairPartner: (ch) => {
            const id = parseInt(ch);
            return (id % 2 === 0) ? id + 1 : id - 1;
        },
        getCurrentScene: () => window.currentSceneNumber ?? 0,
        getDeskName: () => window.serverName || '01V96'
    },

    // 🎨 MANIPULAÇÃO DINÂMICA DE UI (PADS DE MACRO)
    ui: {
        setSlotStatus: (slotIndex, text, options = {}) => {
            if (window.setMacroSlotStatus) {
                window.setMacroSlotStatus(slotIndex, text, options);
            }
        },
        setDynamicColor: (slotIndex, color) => {
            if (window.setMacroDynamicColor) {
                window.setMacroDynamicColor(slotIndex, color);
            }
        },
        resetDynamicSlot: (slotIndex) => {
            if (window.resetMacroDynamicSlot) {
                window.resetMacroDynamicSlot(slotIndex);
            }
        },
        confirm: async (options) => {
            if (typeof ConfirmModal !== 'undefined' && ConfirmModal.show) {
                return await ConfirmModal.show(options);
            }
            return window.confirm(typeof options === 'string' ? options : (options?.message || options?.title || 'Confirmar?'));
        },
        alert: async (options) => {
            const opt = (typeof options === 'string') ? { title: 'Aviso', message: options, type: 'info' } : (options || {});
            if (typeof ConfirmModal !== 'undefined' && ConfirmModal.show) {
                return await ConfirmModal.show(opt);
            }
            window.alert(opt.message || opt.title || '');
        }
    },

    // 🧹 GERENCIAMENTO DE ESTILOS COM CSS CLEANER
    styles: {
        loadScopedCSS: async (modId, cssPath) => {
            const url = `modules/macros/${modId}/${cssPath}`;
            try {
                const res = await fetch(url);
                if (!res.ok) return;
                const rawCSS = await res.text();

                // Parse CSS rules from raw text
                const ruleRegex = /([^{}]+)\{([^}]+)\}/g;
                const scopedRules = [];
                let match;

                while ((match = ruleRegex.exec(rawCSS)) !== null) {
                    const selector = match[1].trim();
                    const body = match[2].trim();

                    // Blacklist: discard rules targeting dangerous selectors
                    const forbidden = ['body', 'html', ':root', '*', 'main',
                        '.channel-strip', '.fader', '.meter', '.desk-db-scale',
                        '.topbar', '.bottombar'];
                    const selectorLower = selector.toLowerCase();
                    const isForbidden = forbidden.some(f => selectorLower === f || selectorLower.startsWith(f + ' ') || selectorLower.includes(', ' + f) || selectorLower.includes(', ' + f + ' '));
                    if (isForbidden) continue;

                    // Auto-scope: prefix with .mod-${modId} if not already scoped
                    const scope = `.mod-${modId}`;
                    const scopedSelector = selector.startsWith(scope)
                        ? selector
                        : `${scope} ${selector}`;

                    scopedRules.push(`${scopedSelector} { ${body} }`);
                }

                if (scopedRules.length === 0) return;

                const scopedCSS = scopedRules.join('\n');

                // Inject or replace <style> tag in <head>
                const styleId = `style-macro-${modId}`;
                let styleEl = document.getElementById(styleId);
                if (styleEl) {
                    styleEl.textContent = scopedCSS;
                } else {
                    styleEl = document.createElement('style');
                    styleEl.id = styleId;
                    styleEl.textContent = scopedCSS;
                    document.head.appendChild(styleEl);
                }
            } catch (e) {
                console.warn(`[MixerAPI.styles] Failed to load CSS for ${modId}:`, e);
            }
        },
        removeScopedCSS: (modId) => {
            const el = document.getElementById(`style-macro-${modId}`);
            if (el) el.remove();
        }
    },

    // 💾 ARMAZENAMENTO E PERSISTÊNCIA DE MODS
    storage: {
        getModConfig: async (modId) => {
            const preset = window.MixerAPI.utils.getPreset();
            const res = await window.apiFetch(`/api/macros/config/${encodeURIComponent(modId)}?preset=${encodeURIComponent(preset)}`);
            return res.json();
        },
        saveModConfig: async (modId, data, syncShared = false) => {
            const preset = window.MixerAPI.utils.getPreset();
            const res = await window.apiFetch(`/api/macros/config/${encodeURIComponent(modId)}?preset=${encodeURIComponent(preset)}&syncShared=${syncShared}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });
            return res.json();
        }
    },

    // 🌐 COMUNICAÇÃO EXTERNA
    network: {
        fetch: async (url, options = {}) => {
            const { fireAndForget, ...httpOptions } = options;
            const res = await window.apiFetch('/api/macros/proxy/http', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url, options: httpOptions, fireAndForget: !!fireAndForget })
            });
            return res.json();
        },
        udpSend: async (host, port, data) => {
            return window.apiFetch('/api/macros/proxy/udp', {
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
    },

    // 📝 REGISTRO FORMAL & CICLO DE VIDA
    registerMacro: (id, definition) => {
        if (window.registerMacro) {
            window.registerMacro(id, definition);
        }
    }
};

console.log("💎 MacroAPI Core carregada.");
