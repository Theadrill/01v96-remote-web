# Plano de Implementação: Controle de Fluxo de Dados (Throttling e Pacing)

Este documento registra o detalhamento técnico e passo a passo da solução desenvolvida para mitigar o problema de "Buffer Bloat" na sincronização remota com a mesa Yamaha 01V96. A implementação dividiu-se entre Back-End (Rust) e Front-End (WebAssembly).

## 1. Contexto do Problema
O sistema sofria com engarrafamentos no buffer MIDI de hardware durante dois momentos principais:
- **Sincronização Inicial**: Disparo em massa de ~2880 requisições simultâneas.
- **Operação de Faders**: O frontend emitia eventos `control` em uma frequência maior que a capacidade de resposta da rede/mesa.

---

## 2. Passo a Passo da Solução Implementada

### 2.1. Configurações Globais Centralizadas
Para garantir controle e ajuste fino dos ritmos de transmissão sem a necessidade de recompilar o código, criamos variáveis acessíveis via arquivo `config.json` e serializadas na struct `AppConfig` no `server_rust/src/config.rs`.
- `sync_chunk_size` (Padrão: 50): Tamanho de cada lote enviado na sincronização.
- `sync_chunk_delay_ms` (Padrão: 25): Tempo de repouso em milissegundos entre cada lote.
- `wasm_throttle_ms` (Padrão: 16): Janela de limitação de taxa (throttle) em milissegundos para o disparo de eventos de interface.

### 2.2. Prevenção de Pacotes Órfãos (Flush)
Para impedir que pacotes MIDI não processados da conexão anterior causassem anomalias logo no início da sincronização:
1. No **ConnectionManager** (`server_rust/src/network/connection.rs`), modificamos a rotina de reconexão para emitir um array de bytes especial `[0xFF, 0xFE, 0xFD]` pelo canal interno do sistema (`tx`).
2. Isso ocorre imediatamente antes do cooldown de 5 segundos.
3. No lado de recebimento, **MidiReceiver** (`server_rust/src/midi_receiver.rs`), adicionamos a captura desse padrão. Ao encontrá-lo, é disparado um laço `try_recv()` não bloqueante que lê e descarta instantaneamente todas as mensagens da fila. 

### 2.3. Pacing (Cadência) na Sincronização de Massa
Em vez de depender unicamente da enfileiração massiva, reconstruímos a cadência do Phase 5 (Queue all params) no `SyncManager` (`server_rust/src/network/sync_manager.rs`):
1. Alteramos o loop para iterar a matriz de requisições inteira usando iteradores paginados (`.chunks(chunk_size)`).
2. Para cada lote enfileirado no `MidiScheduler`, executamos um `tokio::time::sleep(chunk_delay_ms)` para desacelerar ritmadamente a entrega.
3. **Cálculo de Progresso Fiel**: O envio contínuo para o Front-End das porcentagens de sincronização foi atualizado. O progresso passou a somar exatamente o número de instâncias de requisições processadas *(Total - Fila Pendente - Fila Não Processada)*, impedindo que o indicador de 100% aparecesse na tela antes da real conclusão da tarefa.

### 2.4. Throttling de Interface Otimizado com WebAssembly (WASM)
Para lidar com a latência de operação sem engasgar o Front-End, desenvolvemos um limitador de tempo nativo em `client_wasm/src/lib.rs`.
1. Criamos a struct **MidiDispatcher** mantendo o histórico de timestamps (`HashMap`) agrupado por tipo e canal físico.
2. Em sua função `push_event`, caso novos valores entrem dentro da janela especificada (`wasm_throttle_ms`), a variável apenas é retida e atualizada em memória, poupando a rede.
3. A cada tick do Frame (`requestAnimationFrame`), o despachante é chamado. Somente as requisições que amadureceram fora do tempo de Throttle são liberadas via Socket (`socket.emit('control')`).

### 2.5. Integração WASM x Frontend
No entrypoint do cliente (`public/modules/socket.js`):
1. O despachante é instanciado em conjunto com a Engine de Meters.
2. O interceptor customizado substitui o `socket.emit` padrão. Quando requisitado o modo `control`, o dado passa primeiramente pela aprovação em memória do WebAssembly.
3. Toda vez que a configuração é lida do Back-End pelo Socket IO (`portsList`), a constante de `wasm_throttle_ms` é atualizada dinamicamente.

---

## 3. Considerações Finais
As modificações garantiram alívio profundo da sobrecarga sobre a mesa de som mantendo as arquiteturas já consolidadas e introduzindo uma forma padronizada, performática (WASM) e unificada de controle de latência no projeto 01V96-Remote.
