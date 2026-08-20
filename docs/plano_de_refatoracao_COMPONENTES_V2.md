# Plano de Refatoração — Arquitetura Modular v2 (Custom Elements + MeterBus + ES Modules)

> ⚠️ **Este plano é para a v2 do sistema (`public_new/`).** Não modificar nada no `public/` original sem decisão explícita.
>
> 📎 **Referência:** Este plano centraliza a reescrita estrutural do frontend para a v2, tornando o sistema ultra-modular, reativo e livre de acoplamentos legados.

---

## Princípio Fundamental — Sem Anti-Patterns

> **Esta regra se sobrepõe a qualquer decisão de conveniência ou velocidade.**
>
> O `public_new/` é uma reescrita profissional de alto desempenho. Toda decisão técnica segue o padrão adotado por empresas e sistemas líderes em áudio profissional e design systems (Yamaha, Allen & Heath, Google, Microsoft, Adobe).
>
> Anti-patterns explicitamente proibidos neste projeto:
> - `window.algo` — globals implícitas. Usar módulos ES nativos com `import/export`.
> - `querySelector` global para sincronização contínua de meters — usar pub/sub via `MeterBus`.
> - Strings HTML concatenadas com dezenas de `if/else` — usar componentes Custom Elements semânticos (`<channel-strip>`) com presets declarativos.
> - Lógica de negócio e protocolo MIDI dentro de componentes de apresentação visual — separar estritamente View / Logic / Data.
> - Sufixos `_v2` em arquivos dentro do `public_new/` — o contexto já é a v2. Usar nomes semânticos e canônicos.

---

## Contexto e Motivação

O sistema legado (`public/`) utilizava renderização via concatenação de strings HTML gigantescas no `channel_strip.js` e busca manual de elementos via `document.querySelectorAll` no `socket.js` a cada frame ou alteração de estado.

A v2 (`public_new/`) resolve isso com uma arquitetura de alta performance focada no contexto de áudio profissional:

1. **Custom Elements com Light DOM (`<channel-strip>`)** — tags semânticas com ciclo de vida nativo (`connectedCallback` / `disconnectedCallback`), renderização limpa e custo mínimo de CPU/memória para compatibilidade máxima com dispositivos móveis e tablets no palco.
2. **MeterBus (Pub/Sub Zero-Copy)** — o motor de meters lê os níveis direto do ponteiro de memória do WebAssembly (`Float32Array(80)`) e despacha em tempo real para os componentes inscritos, sem tocar no DOM global.
3. **Módulos ES Nativos (`import`/`export`)** — arquitetura limpa, desacoplada e testável, sem poluição do `window`.
4. **Sistema de Temas Reativo YAML via CSS Custom Properties** — estilização natural no `:root`, permitindo atualizações de cores e layout em tempo real com zero re-renders.
5. **Strangler Fig Pattern (`/new`)** — ambiente novo coexiste com o legado em paralelo até validação completa.

---

## Estratégia de Coexistência

- `public/` — sistema atual, intocado, continua sendo a URL padrão (`/`)
- `public_new/` — ponto de partida da v2, exposto em `/new` (roteado nativamente pelo servidor Rust)
- Bugfixes críticos no `public/` são replicados no `public_new/` se aplicável durante a transição
- Ao final da validação em produção: `/new` torna-se `/`, e o `public/` original é arquivado como legado

---

## Requisitos Mínimos de Dispositivo

O piso técnico da v2 é definido pelo suporte nativo a **Custom Elements** e **ES Modules**:

| Dispositivo | Versão Mínima | Hardware Equivalente |
|---|---|---|
| **iPhone** | iOS 10.3+ | iPhone 5 (2012) ou superior |
| **iPad** | iPadOS 10.3+ | iPad 4ª geração (2012) ou superior |
| **iPad mini** | iPadOS 10.3+ | iPad mini 2 (2013) ou superior |
| **Android** | Android 5.0+ | Chrome 61+ atualizado |
| **Desktop** | Chrome 61+ / Firefox 60+ / Safari 10.1+ | Qualquer navegador moderno |

---

## Arquitetura e Decisões Consolidadas

### 1. Sistema de Módulos ES e Decomposição do `globals.js`

O arquivo monolítico `globals.js` é decomposto em módulos de responsabilidade única:
- `modules/state.js`: Exporta e gerencia o estado reativo (`channelStates`, `mixesState`, `busesState`, `masterState`, `layoutMode`, `musicianMode`, etc.).
- `modules/socket-client.js`: Instancia e exporta a conexão Socket.io (`export const socket = io(...)`).
- `modules/utils.js`: Funções utilitárias puras (`rawToDb`, `dbToRaw`, `getSteppedRaw`, `getChannelStateById`, `getChannelParamPrefix`, `getChannelLabel`).
- `modules/ui-utils.js`: Funções auxiliares de atualização de interface (`updateNameUI`, `mapDynDbToPercent`).

### 2. MeterBus — Barramento Pub/Sub de Meters

- **Arquivo:** `modules/meter-bus.js`
- **Contrato:**
  - `MeterBus.register(ch, callback)`: Inscreve um componente para receber atualizações de VU meter.
  - `MeterBus.unregister(ch)`: Remove a inscrição de forma segura.
  - `MeterBus.frame(wasmMeterView, now)`: Chamado a cada frame pelo `wasmRenderLoop` passando o `Float32Array(80)` da memória WASM.
  - Utiliza fila de pendências (`_pending`) para que adições/remoções durante a execução de um frame não causem mutação concorrente no `Map`.

### 3. Componente Universal `<channel-strip>` (Custom Element)

- **Arquivo:** `modules/channel_strip_component.js`
- **Registro:** `customElements.define('channel-strip', ChannelStripComponent)`
- **Renderização (Light DOM):**
  - O HTML é gerado diretamente no nó do elemento, mantendo total integração com o CSS global e as ferramentas de inspeção.
  - O componente possui instâncias de presets (`ChannelStripComponent.presets.mainInput(ch)`, `master()`, `output()`, `auxSend()`, `mixMatrix()`, `mini()`).
- **Ciclo de Vida:**
  - `connectedCallback()`:
    1. Instancia seu próprio `IntersectionObserver` para pausar rendering quando fora da tela visível.
    2. Inscreve seu callback no `MeterBus` para o canal correspondente.
    3. Registra eventos de interação (toque, arrasto, fader, botões).
  - `disconnectedCallback()`:
    1. Desconecta o `IntersectionObserver`.
    2. Cancela a inscrição no `MeterBus`.
- **Setters Reativos de Alta Frequência:**
  - Métodos como `strip.faderValue = val`, `strip.name = 'Voz'`, `strip.on = true`, `strip.solo = false` realizam atualizações cirúrgicas no DOM local sem re-renderizar o card.

### 4. Sistema de Temas YAML e CSS

- `public_new/themes/default.yaml` fornece os valores estruturais e visuais.
- `public_new/modules/theme-manager.js` injeta as variáveis no `:root` (`--strip-card-bg`, `--strip-meter-color`, `--strip-header-color-input-1`, etc.).
- `public_new/style.css` estiliza os `<channel-strip>` usando classes semânticas e variáveis CSS nativas sem necessidade de bridges complexas.

---

## Sequência de Implementação

```
✅ 0. Criar public_new/ (cópia completa de public/)
✅ 0. Configurar rota /new no servidor Rust
✅ 0. Atualizar build_wasm.bat para sincronizar public_new/wasm
[ ] 0. Validar que /new responde no navegador

── FASE 1: Fundação Modular (Decomposição de globals.js) ─────────────────────
[ ] 1.1 Criar public_new/modules/state.js
[ ] 1.2 Criar public_new/modules/socket-client.js
[ ] 1.3 Criar public_new/modules/utils.js
[ ] 1.4 Criar public_new/modules/ui-utils.js
[ ] 1.5 Ajustar index.html para carregar módulos via <script type="module">

── FASE 2: Motor de Meters Desacoplado (MeterBus) ────────────────────────────
[ ] 2.1 Criar public_new/modules/meter-bus.js com fila de pendências
[ ] 2.2 Refatorar public_new/modules/socket.js para módulo ES:
      - Importar MeterBus, socket-client e state
      - Remover faderCardsCache, buildMeterCache e querySelectors contínuos
      - Despachar wasmMeterView via MeterBus.frame(wasmMeterView, now)
      - Refatorar steps.js para carregar calibração assíncrona sem polling
[ ] 2.3 Validar recepção de dados a 60 FPS sem erros no console

── FASE 3: Componente Base <channel-strip> ──────────────────────────────────
[ ] 3.1 Criar public_new/modules/channel_strip_component.js com Custom Elements (Light DOM)
[ ] 3.2 Implementar ciclo de vida (IntersectionObserver próprio + MeterBus register/unregister)
[ ] 3.3 Implementar sistema de Presets (mainInput, master, output, auxSend, mixMatrix, mini)
[ ] 3.4 Criar public_new/test_strip.html para teste visual isolado de todos os presets

── FASE 4: Integração com Sistema de Temas YAML ──────────────────────────────
[ ] 4.1 Integrar seção channel_strip no default.yaml
[ ] 4.2 Mapear variáveis CSS no theme-manager.js e style.css
[ ] 4.3 Validar troca de tema em tempo real no test_strip.html

── FASE 5: Migração de Telas do Sistema ──────────────────────────────────────
[ ] 5.1 Migrar tela de Auxiliares e Sends (public_new/modules/auxs_sends.js) — Piloto
[ ] 5.2 Migrar tela Principal Desktop (canais 1-32, ST IN, Mix, Bus, Master)
[ ] 5.3 Migrar Mini-Faders dos Modais (EQ, Dynamics, FX, Routing)
[ ] 5.4 Implementar renderização Mobile (<channel-strip> layout mobile)
[ ] 5.5 Remover channel_strip.js legado em public_new/modules/

── FASE 6: Validação Final e Promoção a Padrão ───────────────────────────────
[ ] 6.1 Teste de estresse com a mesa física em tempo real
[ ] 6.2 Validação em dispositivos de palco (celulares e tablets)
[ ] 6.3 Promover public_new/ para public/ (virando a versão padrão do sistema)
```

---

## Critério de Aceitação e Conclusão

A refatoração da v2 é considerada concluída e pronta para substituir a v1 quando:
1. **Zero Globals:** Nenhum módulo no `public_new/` define ou consome variáveis globais implícitas no `window`.
2. **Alta Performance:** Meters e faders operam a 60 FPS suaves via `MeterBus` e WebAssembly, sem garbage collection excessivo.
3. **Cobertura Total:** Todos os tipos de canal (Inputs 1-32, ST IN, Mixes 1-8, Buses 1-8, Master, Aux Sends, Mini-Faders e Mobile) renderizam fielmente com comportamento idêntico ou superior ao legado.
4. **Temas em Tempo Real:** Edições no `ThemeEditor` refletem imediatamente em todos os componentes sem recriar elementos DOM.
5. **Zero Regressões:** Todas as funções de MIDI, SysEx, cenas, nomes customizados e operações de canal funcionam perfeitamente na 01v96 física.
