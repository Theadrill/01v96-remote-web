# 🏗️ Plano Diretor de Refatoração Arquitetural (01v96-Bridge)

Este documento foi criado para guiar a reestruturação profunda do servidor Node.js que controla a Yamaha 01V96. Ele contém as especificações exatas que **qualquer IA baseada em LLM (mesmo as de menor contexto/tokens)** consiga entender e executar passo a passo.

## 📌 O Problema
Atualmente, o `server.js` é um "Arquivo Deus" (God Object) com +1300 linhas. Ele mistura banco de dados (fs), Git, Express, WebSockets, e lida com leitura bruta (Raw) do MIDI. 
Devido às limitações de velocidade do cabo USB-MIDI da 01V96, **ocorre colisão de pacotes** no buffer quando recebemos as `Cenas/Sync` e os `Meters` ao mesmo tempo. 
Isso faz com que fragmentos de leitura se misturem, corrompendo variáveis de sistema nas funções do `protocol.js` e jogando a mesa no caos (ex: Posição de Canal errada durante o Sync).

## 🚀 A Solução (A Nova Arquitetura)
Vamos implementar um **Monolito Modular com Motor Híbrido** focado em blindagem de SysEx e Despacho Tático (Smart Scheduler). Em vez de Clean Architecture pura, usaremos proceduralidade modular com Fila de Prioridades Auto-Destrutível para o MIDI.

---

## 🗺️ Fluxograma do Novo Sistema (Visualizar no Mermaid)

```mermaid
graph TD
    subgraph HARDWARE (USB-MIDI)
        YAMAHA(Yamaha 01V96)
    end

    subgraph ENGINE DE SEGURANÇA MIDI
        MA[SysEx Assembler Guard]
        PR[Protocol Parser / Dictionary]
        MS[Global MIDI Scheduler - Fila]
    end

    subgraph MÓDULOS DE NEGÓCIO
        SM[Sync Manager]
        SC[Scene Manager]
        MM[Master / Channel Meters]
        API[Express Macros / Git API]
    end

    subgraph SERVER.JS (O Coordenador 100 linhas)
        WS(Socket.io / HTTP)
    end

    %% Leitura segura (Volta do hardware)
    YAMAHA -- "(Muitos Bytes Picotados)" --> MA
    MA -- "{Array [F0...F7] Perfeito}" --> PR
    PR -- "(Objeto Traduzido)" --> WS
    PR -- "(Atualiza Memória)" --> SC

    %% Escrita e Roteamento  (Ida pro Hardware)
    WS -- "Usuário mexeu fader (Prio 0)" ----> MS
    SM -- "Inicia Bulk Dump (Prio 1)" ----> MS
    MM -- "- Loop Invisível (Prio 2)" -...-> MS
    
    MS -- "Executa estritamente 1 por vez" --> YAMAHA

    %% Alertas
    style MA fill:#4caf50,stroke:#388e3c,stroke-width:2px,color:#fff
    style MS fill:#ff9800,stroke:#f57c00,stroke-width:2px,color:#fff
```

---

## 🛠️ O Plano de Execução em Fases

Qualquer LLM assistente deve focar e concluir **UMA FASE de cada vez**. Não pule para a Fase 2 se a Fase 1 estiver com bugs.

### FASE 1: O Escudo Anti-Colisão (SysEx Assembler)
**Objetivo:** Impedir que fragmentos corrompidos do cabo de USB entrem no `protocol.js`.
1. **Arquivo a Criar**: `src/midi-assembler.js`
2. **Lógica Exata (Para o LLM codar)**:
   - Uma classe contendo um array de buffer interno (ex: `buffer = []`).
   - Um método `processInput(rawBytesArray)` e um callback de saúde.
   - Se ver `0xF0` (Start SysEx), limpa o buffer e o adiciona.
   - Todo byte subseqüente preenche o buffer. **AVISO ABSOLUTO:** A Yamaha 01v96 lança Active Sensing ou Clocks (0xFE, 0xFD, 0xF8) de 300 em 300ms. Se esses bytes caírem no array no meio da extração SysEx, eles devem ser ignorados silenciosamente (Não entram no buffer).
   - Quando receber `0xF7` (End SysEx), insere no buffer, chama o `callback(ArrayLimpo)` com o array completo, e reseta o buffer.
3. **Integração Básica**: Modifique o lugar onde o Node.js lê do hardware (`midiEngine`). Quando a porta mandar tráfego `input.on('message'...)`, não repasse para o App. Apenas chame o método do Assembler. O Assembler só avisa o App quando a frase 100% pronta sem corrupção existir. Fim da colisão de propriedades fada/eq erradas.

### FASE 2: O Despachador Superior (Smart Priority Scheduler)
**Objetivo:** Assumir controle ABSOLUTO de envio MIDI. Ninguém chama `midi.send()` na unha. Tudo entra em fila de Prioridades inteligente.
1. **Arquivo a Modificar**: Renomear ou refatorar o `src/midi-pipeline.js` para `src/midi-scheduler.js`.
2. **As Regras de Lógica Intertravada (A joia da coroa)**:
   - **As 3 Filas:** O objeto conterá `q0` (Usuários / Ações de Mão Própria), `q1` (Bulk Dumps / Synchronização Total) e `q2` (Meters / Telemetria Secundária).
   - **O Método Enqueue(`bytesArray`, `priority`)**:
      - Se Prio 2 (Meter) chegar, a função esbarra na parede: `se q0.length > 0 ou q1.length > 0`, ela faz um `return false` ali mesmo. Ela dropa no chão, matando o gargalo dos Meters enquanto se faz Sync ou Move Faders.
      - **A Coalescência (Debouncing em Q0)**: Se Músico fizer "arraste brutal (Flood)" no iPad, gera 30 SysEx de Fader pra Q0 num segundo. O Scheduler deve olhar: "O SysEx a ser inserido tem o mesmo Endereço (Target Channel Element) de um cara que já tá em repouso no Q0?". Se sim, não `push()`. Ele apenas substitui o array da variável estacionada no Q0 pelo novo array. Esmaga 30 ações em 1 pacote sem alterar o tráfego da rede.
3. **Loop de Disparo**: Usa um loop contínuo (Tick ~15-20ms) que resolve o processamento (`shift`) estritamente nessa ordem: se Q0 tem, Q1 espera. Se Q1 tem, Q2 nunca roda. E executa o famigerado `midiEngine.send(pacote)`.
4. **Integração:** Varre o `server.js` em todo canto removendo `midiEngine.send()` ou `midi.send()` hard coded. Tudo passa a ser `scheduler.enqueue(comando, X)`. O timer `setInterval` solto no `server.js` (rodando em 41ms) pode continuar existindo enviando pedidos Prio2! Porque agora o Scheduler é inteligente o suficiente pra calar e descartar ele quando a Fila Prio1 (Sync) e Prio0 forem preenchidas.

### FASE 3: Implodir o Módulo Monolito (Refatoração de Pastas server.js)
**Objetivo:** O arquivo `server.js` fará apenas a configuração dos túneis principais (Instanciar Express, Sockets, MidiEngine com o Assembler da Fase1, Scheduler da Fase2) e passará o bastão.
1. **Separar Sincronização (`src/sync-manager.js`)**
   - Importar o `triggerSync()` quilométrico do server.
   - Sua única e exclusiva missão: montar um arquivo de receita Yamaha. Quando for chamado pelo `server.js` via `SyncManager.fire(scheduler)`, ele monta os SysEx para Canal 1 a 32, EQs, e os subentende empurrando para `scheduler.enqueue(comando, 1)`. As flags booleanas de `isFullySynced` ou bloqueios no `server.js` perdem razão de existir, delete.
2. **Separar a API HTTP (`src/api/macros.js`)**
   - Configurar via `express.Router()`.
   - Mudança física estrita de escopo de `/api/macros` e do infame `gitSyncQueue` & `exec(...)` do server para ali. O server só faz `app.use('/api', macroRoutes)`.

---

## 🤖 Como dar as instruções Iniciais ao "Modelo Subordinado" (Prompt Guide)

Copie blocos da lista acima aos poucos e cole no "Gemini Flash/Outro Modelo Menor", junto deste prompt:

> **PROMPT ESTRUTURAL 1 (FASE 1): O Assembler Seguro**
> *"Aja como Cientista de Dados Sênior. Preciso implementar exatamente a FASE 1 descrita abaixo no meu sistema Node.js que sofre de MIDI fragmentation. O input da porta vem com Lixo entre Bytes (como Clocks de Sync de Relógio da Mesa e USB truncado). Foque APENAS em criar o arquivo `src/midi-assembler.js` conforme as regras. Produza Apenas Código".*

*(Teste e Verifique O Assembler Funcionar antes de passar pra Fase 2)*

> **PROMPT ESTRUTURAL 2 (FASE 2): O Coração Scheduler**
> *"Senhor Bot, agora passaremos à FASE 2, o Scheduler. Nós já usamos um `[MidiPipeline.js]` ingênuo e queremos transformar num Tático. Crie o `src/midi-scheduler.js` conforme este manifesto... Tome extremo cuidado na Lógica de Coalescência em Prio 0 (Debounce em fila) e Drop de Prio 2 (Metros descartáveis). Use um `setInterval` ou Recursivo que mande 1 pacotinho pro `midiEngine.send` a cada 20ms mantendo os limites sem paralisar o hardware"*.

*(Com o coração instalado, teste o Mix! Os meters na tela vão parar magicamente SE você mover Fader, provando que o tráfego está priorizado).*

> **PROMPT ESTRUTURAL 3 (FASE 3): Implodir Burocracia**
> *"Finalmente, Fase 3. Meu server.js chegou no limite. Eu enviarei para você o código brutal do meu server.js atual (vou dar upload nele) para o seu contexto. Extraia apenas as lógicas do 'triggerSync', remova todas as variáveis goblais relativas a isso e jogue em uma Classe purista em `src/sync-manager.js`. Lembre que ele agora apenas usará a instância superior `scheduler.enqueue(syx, 1)`"*.
