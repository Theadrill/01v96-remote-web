const IGNORED_BYTES: &[u8] = &[0xFE, 0xFD, 0xF8];

pub struct MidiAssembler {
    buffer: Vec<u8>,
    in_sysex: bool,
}

impl MidiAssembler {
    pub fn new() -> Self {
        Self {
            buffer: Vec::new(),
            in_sysex: false,
        }
    }

    /// Processa o buffer de entrada e retorna mensagens MIDI/SysEx completas.
    pub fn process_input(&mut self, raw_bytes: &[u8]) -> Vec<Vec<u8>> {
        let mut completed_messages = Vec::new();

        for &byte in raw_bytes {
            if byte == 0xF0 {
                self.buffer.clear();
                self.buffer.push(0xF0);
                self.in_sysex = true;
                continue;
            }

            if !self.in_sysex {
                // Se não está num SysEx e não é um byte ignorado, nós o retornamos diretamente
                // como uma mensagem MIDI curta (ex: Note On, Control Change).
                if !IGNORED_BYTES.contains(&byte) {
                    // Para mensagens de 1 byte como Clock, ou ignorar se quisermos estritamente SysEx.
                    // Na Yamaha 01v96 o mais crítico é SysEx, mas vamos manter compatibilidade.
                    // O Assembler do Node.js ignorava dados fora do SysEx.
                    // Vamos manter o comportamento original do Node.js e ignorar bytes fora de SysEx.
                }
                continue;
            }

            if IGNORED_BYTES.contains(&byte) {
                continue;
            }

            self.buffer.push(byte);

            if byte == 0xF7 {
                let complete_message = std::mem::take(&mut self.buffer);
                self.in_sysex = false;
                completed_messages.push(complete_message);
            }
        }

        completed_messages
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_assembler() {
        let mut assembler = MidiAssembler::new();
        // F0 43 10 3E 7F 01 02 F7 -> A complete message
        let out = assembler.process_input(&[0xF0, 0x43, 0x10, 0x3E, 0x7F, 0x01, 0x02, 0xF7]);
        assert_eq!(out.len(), 1);
        assert_eq!(out[0], vec![0xF0, 0x43, 0x10, 0x3E, 0x7F, 0x01, 0x02, 0xF7]);

        // Ignored bytes and fragmentation
        let out1 = assembler.process_input(&[0xF0, 0x43]);
        assert_eq!(out1.len(), 0);
        let out2 = assembler.process_input(&[0xFE, 0x10]); // FE is ignored
        assert_eq!(out2.len(), 0);
        let out3 = assembler.process_input(&[0x3E, 0xF7]);
        assert_eq!(out3.len(), 1);
        assert_eq!(out3[0], vec![0xF0, 0x43, 0x10, 0x3E, 0xF7]);
    }
}
