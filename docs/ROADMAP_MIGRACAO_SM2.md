# 🗺️ Roadmap de Transição — Arquitetura Studio Manager

Este documento servirá como nosso guia de rastreabilidade (checklist) para refatorar gradualmente a comunicação MIDI e o sincronismo da mesa 01V96 para a arquitetura performática descoberta nas DLLs do Yamaha Studio Manager.

---

### Fase 1: Quick Wins — Resolução de Timers e Fluidez Visual (Risco Baixo)
**Objetivo**: Igualar a agilidade de leitura da mesa via portas MIDI reduzindo os engasgos da interface atual.

- [x] Modificar o polling de meters global no `server.js` (passar de 100ms para 41ms exatos, equivalentes aos 24.39fps do SM).
- [x] Implementar conversores matemáticos exatos no Frontend/Backend baseados nas "Tabelas de Stepping" da DLL (37 e 47 pontos) para tradução de dB e posições dos Meters.
- [x] Sincronizar painel HUD/Frontend em `requestAnimationFrame` em cima do novo ritmo de 41ms.

### Fase 2: O Escudo Anti-Loop Atômico — SyncCounter (Risco Baixo)
**Objetivo**: Matar qualquer *feedback loop* (Mesa->Web->Mesa) descartando ecos de MIDI instantaneamente, sem travar a interface do usuário com truques de "timeout ou disable puro".

- [x] Criar o módulo independente `src/sync-counter.js` com a exata lógica algorítmica de decremendo do SM2 (`InterlockedIncrement/Decrement`).
- [x] Integrar `syncCounter.beginSync()` imediatamente antes de cada disparo no `midiEngine.send()`.
- [x] Passar todo MIDI SysEx de entrada pelo teste `syncCounter.shouldIgnore()` para descarte invisível e sem custo de ecos de envio.

### Fase 3: Migração para o Mapa Estático de Propriedades (Risco Médio)
**Objetivo**: Abandonar a "adivinhação" ou conversões baseadas em hardcode substituindo por mapeamento absoluto da interface.

- [x] Incorporar o arquivo base `01v96_property_map.json` na leitura do núcleo do Node (`src/protocol.js` ou novo parser).
- [x] Refatorar os métodos de gerência de status para ler o mapa (Name -> Hex ID / Hex ID -> Name) ativamente antes de tentar serializar ou desserializar arrays.

- [ ] Correlacionar `Tabela GG` aos métodos que parseiam grupos inteiros.

### Fase 4: O Fim do Polling de Boot — Pipeline Sequencial (ESCOLHIDO)
**Objetivo**: Abandonar o processo de Sincronização bloqueante canal a canal pelo gerenciamento assíncrono em Pipeline.

- [x] Refatorar a mecânica da função `triggerSync` para uso do `MidiPipeline`.
- [ ] Implementar envio de handshake que solicita habilitar a Transferência Massiva (`kTxEnableBulk` etc).

- [ ] Ensinar o `protocol.js` e o `state-manager.js` a absorverem e decodificarem lotes (buffers) gigantes com tudo de uma só vez.

### Fase 5: Dual Buffer & Gerenciador Completo de Cenas (Risco Alto)
**Objetivo**: Sincronização impecável como a do App oficial onde "Mexeu na mesa, mexe no app" e visuais sofisticados de Scene Edit.

- [ ] Separar a lógica de estado do Servidor para um Buffer Duplo (`estado da mesa/hardware` versus `estado não-salvo/local`).
- [ ] Configurar leitura das Flags de Edição (`kMemSceneEditFlag`) e mostrar os "asteriscos" nas cenas não salvas na interface.
- [ ] Habilitar o App para capturar pacotes automáticos vindo organicamente no momento de um `Scene Recall` pela mesa sem precisar enviar requisições de consulta manual.
