// ============================================================================
// logger.js — Sistema de Logs (console + file stream)
// ============================================================================
// Centraliza toda a lógica de logging do servidor.
// - Intercepta console.log e console.error para gravar em server_log.txt
// - Mantém as referências originais do console para output no terminal
// - Cada linha de log é prefixada com timestamp ISO 8601 e nível (INFO/ERROR)
// ============================================================================

const fs = require('fs');
const path = require('path');

// Armazenar referências originais antes de sobrescrever
const originalConsoleLog = console.log;
const originalConsoleError = console.error;

// Sistema de Logs melhorado com proper error handling
function setupLogger() {
    const logDir = path.join(__dirname, '..', 'log');
    if (!fs.existsSync(logDir)) {
        fs.mkdirSync(logDir, { recursive: true });
    }
    const logFile = path.join(logDir, 'server_log.txt');
    const logStream = fs.createWriteStream(logFile, { flags: 'a' });

    return {
        info: (...args) => {
            const timestamp = new Date().toISOString();
            const message = args.map(arg => typeof arg === 'object' ? JSON.stringify(arg, null, 2) : arg).join(' ');
            logStream.write(`[${timestamp}] INFO: ${message}\n`);
            originalConsoleLog.apply(console, args);
        },
        error: (...args) => {
            const timestamp = new Date().toISOString();
            const message = args.map(arg => typeof arg === 'object' ? JSON.stringify(arg, null, 2) : arg).join(' ');
            logStream.write(`[${timestamp}] ERROR: ${message}\n`);
            originalConsoleError.apply(console, args);
        }
    };
}

// Wrapper functions to maintain compatibility
// Override console methods for backward compatibility
function overrideConsole(logInfo, logError) {
    console.log = function (...args) {
        logInfo(...args);
    };

    console.error = function (...args) {
        logError(...args);
    };
}

module.exports = { setupLogger, overrideConsole };
