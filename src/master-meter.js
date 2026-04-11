/**
 * MASTER METER MODULE
 * Handles independent logic for the Master meter (CH 33).
 */

let config = {
    group: 33,
    offset: 16
};

function setConfig(newConf) {
    if (newConf.master_meter_group !== undefined) config.group = parseInt(newConf.master_meter_group);
    if (newConf.master_meter_offset !== undefined) config.offset = parseInt(newConf.master_meter_offset);
}

function buildRequest() {
    // Retorna o SysEx de Meter Request para o grupo configurado
    // F0 43 30 3E 7F [GROUP] 00 00 00 00 32 F7
    return [240, 67, 48, 62, 127, config.group, 0, 0, 0, 0, 32, 247];
}

function parse(message) {
    if (!message || message.length < 20) return null;
    
    // Verifica se é uma resposta de meter (Type 0x1n ou 0x3n que o loopMIDI ecoa? No protocol.js ignoramos se não for 0x1n)
    // Para simplificar, verificamos apenas se o grupo coincide com o configurado
    if (message[5] !== config.group) return null;

    const dataStart = 9;
    const idx = dataStart + (config.offset * 2);

    if (idx < message.length - 1) {
        return message[idx] || 0;
    }
    return null;
}

module.exports = { setConfig, buildRequest, parse };
