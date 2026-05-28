# Auditoria de Migração Completa: Node.js → Rust
**Data:** 28 de Maio de 2026

Esta auditoria apresenta uma análise minuciosa comparando o servidor Node.js original (código-fonte de referência) com a implementação atualizada em Rust (`server_rust`). O objetivo é identificar a cobertura de portabilidade de features, onde a migração parou, o que foi resolvido e os gaps remanescentes que precisam ser sanados para alcançar 100% de paridade e funcionamento correto.

---

## 1. O Que a IA Fez e Evolução Recente

Desde a última auditoria, houve um progresso massivo no codebase Rust, com a portabilidade das principais pendências de rede e orquestração:
- **Socket.IO Event Handlers:** Praticamente todos os 20 handlers originais do Node.js foram implementados no `main.rs` em Rust (incluindo pareamento de canais `pairChannel`, exclusão de cenas `deleteScene`, atualização de nomes `updateName`, etc.).
- **Orquestração e Radar MIDI (`ConnectionManager`):** Implementado em `network/connection.rs`, contendo a busca automática por dispositivos USB, o cooldown antes de iniciar a sincronia e o loop de meters que envia requests reais à mesa.
- **SyncManager Completo (`SyncManager`):** Portado em `network/sync_manager.rs`, orquestrando a sincronização completa de cenas (de 1 a 99) e todos os parâmetros de canais e mixes de forma sequencial e sem bloquear o processamento MIDI.
- **Parser de Mensagens MIDI:** O `parse_message()` em `protocol.rs` foi completamente reescrito para abranger dezenas de parâmetros Yamaha (EQ, Gate, Comp, Faders, Nomes de canais/cenas, Bus Assignments, etc.).
- **Debounce de Config/Names:** O salvamento de nomes alterados agora possui o mesmo comportamento de debouncing nativo em Rust.

---

## 2. Onde a IA Parou / Gaps e Gargas Remanescentes

Apesar de a migração estar **~95% concluída**, existem alguns detalhes sutis que causam falhas críticas no funcionamento do sistema e impedem que a migração seja dada como terminada.

### 🔴 Gaps Críticos de Funcionamento

#### A. O Feedback de Loopback e stucking de toggle (SyncCounter Inativo)
- **O Problema:** O `SyncCounter` foi criado no Rust, mas seu método `begin_sync()` nunca é disparado ao enviar comandos para a mesa. Com isso, os comandos enviados pela própria aplicação são recebidos de volta pelo loopback MIDI e processados como se fossem ações físicas na mesa, anulando ou travando (stuck) comandos como toggles rápidos (ex: canal liga/desliga).
- **A Solução:** Passar a referência do `SyncCounter` ao `MidiScheduler` e chamar `sync_counter.begin_sync()` sempre que o scheduler enviar um SysEx de alteração de parâmetro (começando com `0xF0 0x43 0x10`).

#### B. Falta de Calibração do Master Meter
- **O Problema:** O `MasterMeter` em `midi/master_meter.rs` está com a lógica de steps/dB baseada no `steps.json` totalmente desenvolvida, mas os métodos de parse e calibração nunca são chamados no `main.rs`. O sistema está apenas mapeando o byte cru do meter, o que ignora a escala correta do VU Master.
- **A Solução:** Injetar e usar a instância global de `MasterMeter` na tarefa de recepção de MIDI do `main.rs` para parsear e calibrar a leitura das mensagens do Master Meter.

#### C. IP Config do Lumikit Incompleto (DMX)
- **O Problema:** O método `update_lumikit_config()` no arquivo `dmx.rs` é um stub vazio. Ele deveria ler o arquivo `config.json`, descobrir os IPs locais das placas de rede e gravar o IP correto no arquivo de configuração do conversor `ArtNetToDMX_FTDI/info`, igual ao Node.js.
- **A Solução:** Ler as interfaces de rede locals no Windows (rodando `ipconfig` e capturando a saída) para achar o IP de rede que bate com a lista `lumikit_ips`, escrevendo-o no arquivo de configuração `info`.

#### D. Configuração Não Persistida nos Handlers do Socket
- **O Problema:** Os eventos do socket `updateMeterConfig` e `updateOpenBrowser` no `main.rs` apenas emitem mensagens no terminal indicando que o salvamento está "pendente". Eles não salvam as novas configurações no disco.
- **A Solução:** Fazer com que esses handlers carreguem o `AppConfig`, alterem a respectiva chave e chamem `.save()` para persistir de volta no `config.json`.

---

## 3. Warnings de Código Morto (Unused Warns)

O compilador Rust acusa 11 warnings de funções/métodos não utilizados que precisam ser limpos (seja conectando-os ou silenciando com `#[allow(dead_code)]` para manter o mapeamento estrito da migração):
1. `AppConfig::save`: Passará a ser usada nas rotas de alteração de config.
2. `SyncCounter::begin_sync`: Passará a ser usada no scheduler.
3. `MasterMeter::parse`/`convert_value`/`unstuff`: Passará a ser usada na decodificação do master meter no `main.rs`.
4. `Converter::Signed14`/`DynOn`: Mapeamentos importados fiéis do Node.js, adicionar `#[allow(dead_code)]`.
5. `bytes_to_dyn_on`: Adicionar `#[allow(dead_code)]`.
6. `MidiAssembler::reset`: Adicionar `#[allow(dead_code)]`.
7. `MidiScheduler::set_q1_empty_callback`, `stop`, `clear`: Adicionar `#[allow(dead_code)]`.
8. `SyncCounter::begin_sync` e `SyncCounter::begin_sync` / `begin_sync`: Passará a ser utilizada.
9. `start_meter_simulation`: Usada para testes isolados de meter, adicionar `#[allow(dead_code)]`.
10. `SyncManager::is_busy`/`reset`: Adicionar `#[allow(dead_code)]`.
11. `SceneManager::build_bulk_request`/`fetch_scenes`: Adicionar `#[allow(dead_code)]`.
12. `save_names_trigger`: Remover de `state.rs` (redundante).

---

## 4. Próximos Passos (Plano de Ação)

1. Ajustar o `MidiScheduler` para receber e acionar o `SyncCounter`.
2. Habilitar calibração de `MasterMeter` no loop do `main.rs`.
3. Portar o parser de rede `ipconfig` para atualizar o Lumikit no `dmx.rs`.
4. Persistir alterações do socket nos arquivos de config do sistema.
5. Limpar todos os warnings de código morto para entregar um log limpo no boot.
