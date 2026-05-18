// ============================================================================
// config.js — Gerenciamento de Configurações, Nomes e Steps
// ============================================================================
// Centraliza toda a lógica de persistência de dados do servidor:
// - config.json: portas MIDI, flags (demo_mode, loopmidi-monitor, etc.)
// - names.json: nomes dos canais (Inputs, ST INs, Mixes, Buses, Master)
// - steps.json: calibração do medidor master (Master Meter)
// - configConstants: valores de tuning (FPS, timeouts, delays)
// ============================================================================

const fs = require('fs');
const path = require('path');

let saveNamesTimer = null;

function initConfig(ctx) {
    const { logInfo, logError, rootDir } = ctx;

    const configFile = path.join(rootDir, 'config.json');
    const namesFile = path.join(rootDir, 'names.json');

    // Carregar calibração do steps.json para sincronizar com o frontend
    function loadStepsCalibration() {
        try {
            const stepsPath = path.join(rootDir, 'public', 'steps.json');
            if (fs.existsSync(stepsPath)) {
                const stepsData = JSON.parse(fs.readFileSync(stepsPath, 'utf8'));
                ctx.masterMeter.setSteps(stepsData.master);
                logInfo('✅ [SERVER] Calibração de steps carregada com sucesso do steps.json para o Master Meter');
            }
        } catch (e) {
            logError('❌ [SERVER] Erro ao carregar steps.json para o Master Meter:', e.message);
        }
    }

    // Valores padrão usados como fallback caso config.json não exista
    const DEFAULT_CONSTANTS = {
        meter_fps_desktop: 30,
        watchdog_timeout_ms: 5000,
        meter_poll_interval_ms: 41,
        name_save_debounce_ms: 1000,
        scene_recall_delay_ms: 2000,
        scene_save_delay_ms: 500,
        scene_resync_delay_ms: 700,
        name_update_char_delay_ms: 30,
        scheduler_tick_ms: 15,
        boot_delay_ms: 1500,
        dmx_boot_delay_ms: 3000
    };

    // Carregar configurações do config.json
    function loadConfigConstants() {
        try {
            if (fs.existsSync(configFile)) {
                const loadedConfig = JSON.parse(fs.readFileSync(configFile, 'utf8'));
                ctx.configConstants = {
                    meter_fps_desktop: loadedConfig.meter_fps_desktop !== undefined ? loadedConfig.meter_fps_desktop : 30,
                    watchdog_timeout_ms: loadedConfig.watchdog_timeout_ms || 5000,
                    meter_poll_interval_ms: loadedConfig.meter_poll_interval_ms || 41,
                    name_save_debounce_ms: loadedConfig.name_save_debounce_ms || 1000,
                    scene_recall_delay_ms: loadedConfig.scene_recall_delay_ms || 2000,
                    scene_save_delay_ms: loadedConfig.scene_save_delay_ms || 500,
                    scene_resync_delay_ms: loadedConfig.scene_resync_delay_ms || 700,
                    name_update_char_delay_ms: loadedConfig.name_update_char_delay_ms || 30,
                    scheduler_tick_ms: loadedConfig.scheduler_tick_ms || 15,
                    boot_delay_ms: loadedConfig.boot_delay_ms || 1500,
                    dmx_boot_delay_ms: loadedConfig.dmx_boot_delay_ms || 3000
                };
            } else {
                ctx.configConstants = { ...DEFAULT_CONSTANTS };
            }
        } catch (err) {
            logError('❌ [SERVER] Erro ao carregar config.json para constantes:', err.message);
            ctx.configConstants = { ...DEFAULT_CONSTANTS };
        }
    }

    // Configurações serão carregadas do config.json
    function loadConfig() {
        let config = { inIdx: null, outIdx: null, "loopmidi-monitor": false, open_browser_startup: true };
        if (fs.existsSync(configFile)) {
            try {
                const loaded = JSON.parse(fs.readFileSync(configFile, 'utf8'));
                config = { ...config, ...loaded };
            } catch {
                // Ignora erro de parsing
            }
        }
        return config;
    }

    function saveConfig(configData) {
        try { fs.writeFileSync(configFile, JSON.stringify(configData, null, 2)); } catch {
            // Ignora erro de escrita
        }
    }

    // Carregar nomes salvos imediatamente para que os clients vejam os nomes
    // mesmo antes da sincronização completa com a mesa física.
    function loadNames() {
        try {
            logInfo(`🔍 [NAMES] Tentando carregar: ${namesFile}`);
            if (!fs.existsSync(namesFile)) {
                logInfo("⚠️ [NAMES] Arquivo names.json não encontrado no boot.");
                return false;
            }
            const data = fs.readFileSync(namesFile, 'utf8');
            const names = JSON.parse(data);
            let count = 0;
            for (const key in names) {
                const idx = parseInt(key);
                if (!isNaN(idx)) {
                    ctx.stateManager.setChannelName(idx, names[key]);
                    count++;
                }
            }
            logInfo(`✅ [NAMES] ${count} nomes injetados no State Manager com sucesso.`);
            return true;
        } catch (err) {
            logError("❌ [NAMES] Erro fatal no loadNames:", err);
        }
        return false;
    }

    // Persiste os nomes de canais no names.json com debounce
    // para agrupar escritas de múltiplas letras consecutivas.
    function saveNames() {
        if (saveNamesTimer) clearTimeout(saveNamesTimer);
        saveNamesTimer = setTimeout(() => {
            const s = ctx.stateManager.getState();
            const names = {};
            // Inputs (0-31)
            for (let i = 0; i < 32; i++) { names[i] = s.channels[i].name; }
            // ST INs (60-67)
            for (let i = 0; i < 8; i++) { names[60 + i] = s.channels[32 + i].name; }
            // Mixes (36-43)
            for (let i = 0; i < 8; i++) { if (s.mixes[i]) names[36 + i] = s.mixes[i].name; }
            // Buses (44-51)
            for (let i = 0; i < 8; i++) { if (s.buses[i]) names[44 + i] = s.buses[i].name; }
            // Stereo (52)
            if (s.master) names[52] = s.master.name;
            try {
                fs.writeFileSync(namesFile, JSON.stringify(names, null, 2));
                logInfo("💾 [NAMES] Nomes persistidos em names.json");
            } catch (err) {
                logError("❌ [NAMES] Erro ao salvar nomes:", err);
            }
            saveNamesTimer = null;
        }, ctx.configConstants.name_save_debounce_ms); // 1s de debounce para agrupar as 16 letras
    }

    function triggerSaveNames() {
        saveNames();
    }

    ctx.configFile = configFile;
    ctx.namesFile = namesFile;
    ctx.loadStepsCalibration = loadStepsCalibration;
    ctx.loadConfigConstants = loadConfigConstants;
    ctx.loadConfig = loadConfig;
    ctx.saveConfig = saveConfig;
    ctx.loadNames = loadNames;
    ctx.saveNames = saveNames;
    ctx.triggerSaveNames = triggerSaveNames;
}

module.exports = { initConfig };
