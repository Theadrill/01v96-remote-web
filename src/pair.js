'use strict';

/**
 * Monta a mensagem auxiliar de 12 bytes (indica direção e flags)
 * F0 43 10 3E 7F 11 [RESET_FLAG] 00 [SOURCE] 00 [TARGET] F7
 */
function buildAuxMsg(resetFlag, sourceCh, targetCh) {
    return [0xF0, 0x43, 0x10, 0x3E, 0x7F, 0x11,
            resetFlag, 0x00, sourceCh, 0x00, targetCh, 0xF7];
}

/**
 * Monta a mensagem de estado de 14 bytes (liga/desliga o pair)
 * F0 43 10 3E 7F 01 18 00 [CH_BYTE] 00 00 00 [STATE] F7
 * CH_BYTE = sempre o menor índice do par (ex: CH1=0, CH3=2)
 */
function buildStateMsg(chByte, state) {
    return [0xF0, 0x43, 0x10, 0x3E, 0x7F, 0x01, 0x18,
            0x00, chByte, 0x00, 0x00, 0x00, state, 0xF7];
}

/** Retorna o CH_BYTE = menor índice (canal ímpar da UI) */
function getChByte(chA, chB) {
    return Math.min(chA, chB);
}

/**
 * Ativa pair entre chA e chB, copiando dados de sourceCh para o outro.
 * Envia: mensagem auxiliar (12b) + mensagem de estado ON (14b)
 */
function pairChannels(midiOutput, chA, chB, sourceCh) {
    const targetCh = (sourceCh === chA) ? chB : chA;
    const chByte = getChByte(chA, chB);
    
    // 1. Enviar mensagem auxiliar com a direção da cópia
    midiOutput.sendMessage(buildAuxMsg(0x00, sourceCh, targetCh));
    
    // 2. Enviar mensagem de ativação do Pair
    midiOutput.sendMessage(buildStateMsg(chByte, 0x01));
    
    console.log(`[MIDI] Pair Ativado: CH ${chA+1} + CH ${chB+1} (Source: CH ${sourceCh+1})`);
}

/**
 * Desativa pair entre chA e chB.
 * Envia apenas: mensagem de estado OFF (14b)
 */
function unpairChannels(midiOutput, chA, chB) {
    const chByte = getChByte(chA, chB);
    midiOutput.sendMessage(buildStateMsg(chByte, 0x00));
    console.log(`[MIDI] Pair Desativado: CH ${chA+1} + CH ${chB+1}`);
}

/**
 * Reseta ambos os canais e mantém o pair ativo.
 * Envia: mensagem auxiliar com RESET_FLAG=1 (12b) + mensagem de estado ON (14b)
 */
function resetBothChannels(midiOutput, chA, chB) {
    const chByte = getChByte(chA, chB);
    midiOutput.sendMessage(buildAuxMsg(0x01, chA, chB));
    midiOutput.sendMessage(buildStateMsg(chByte, 0x01));
    console.log(`[MIDI] Reset Both: CH ${chA+1} e CH ${chB+1}`);
}

module.exports = { pairChannels, unpairChannels, resetBothChannels };
