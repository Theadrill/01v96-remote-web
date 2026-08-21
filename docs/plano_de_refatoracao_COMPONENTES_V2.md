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
✅ 0. Validar que /new responde no navegador

── FASE 1: Fundação Modular (Decomposição de globals.js) ─────────────────────
✅ 1.1 Criar public_new/modules/state.js
✅ 1.2 Criar public_new/modules/socket-client.js
✅ 1.3 Criar public_new/modules/utils.js
✅ 1.4 Criar public_new/modules/ui-utils.js
✅ 1.5 Ajustar index.html para carregar módulos via <script type="module">

── FASE 2: Motor de Meters Desacoplado (MeterBus) ────────────────────────────
✅ 2.1 Criar public_new/modules/meter-bus.js com fila de pendências
✅ 2.2 Refatorar public_new/modules/socket.js para módulo ES:
      - Importar MeterBus, socket-client e state
      - Remover faderCardsCache, buildMeterCache e querySelectors contínuos
      - Despachar wasmMeterView via MeterBus.frame(wasmMeterView, now)
      - Refatorar steps.js para carregar calibração assíncrona sem polling
✅ 2.3 Validar recepção de dados a 60 FPS no test_validation.html

── FASE 3: Componente Base <channel-strip> ──────────────────────────────────
✅ 3.1 Criar public_new/modules/channel_strip_component.js com Custom Elements (Light DOM)
✅ 3.2 Implementar ciclo de vida (IntersectionObserver próprio + MeterBus register/unregister)
✅ 3.3 Implementar sistema de Presets (mainInput, master, output, auxSend, mixMatrix, mini, macro, volumeGeral, auxVolumeGeral)
✅ 3.4 Criar public_new/test_strip.html para teste visual isolado com switcher Desktop / Mobile
✅ 3.5 Refinar fidelidade visual e interativa Desktop e Mobile:
      - Escala de dB lateral precisa (+10 até -inf dB via dbToRaw) [OK]
      - Barra interativa de Pan independente para canais estéreo pareados (L e R com tracks separadas, duplo clique e drag) [OK]
      - Rodapé de Patch colorido por grupo (AD 1-16, AD 17-32, ST IN, MIX, BUS) [OK]
      - Proteção contra tap no trilho do fader (estilo console físico, apenas arrasto no knob) [OK]
      - Estados representados: Ativo, Mute, Pareado Estéreo (21+22), Disabled (mantendo botão ON ativo), Locked, Master [OK]
      - Layout Desktop contínuo (gap: 0, bordas de grupo contínuas no topo e base) [OK]
      - Botão SOLO do Master com alerta visual piscante (Solo Blinking) e ação de "UNSOLO ALL" ao clicar [OK]
      - Botões de Nudge (+ e -) com passos de dB contextuais (0.05 dB principal, 0.10 dB mix/out, 0.25 dB sends on faders, 0.50 dB aux individual) e Auto-Repeat contínuo ao segurar [OK]
      - Sistema de Channel Lock com clique único no mobile abrindo menu de 3 opções (TRAVAR/DESTRAVAR, RENOMEAR, CANCELAR) e tempo ágil de 450ms [OK]
      - Macro Fader e Volume Geral unificados no Custom Element com versão normal e compacta (68px), display de delta dB com reset de 5s, botão ZERAR e modal de canais protegidos no Modo Músico [OK]

── FASE 4: Integração com Sistema de Temas YAML ──────────────────────────────
✅ 4.1 Integrar seção channel_strip no default.yaml (cores, gaps, tipografia, patch, pan, master solo alert)
✅ 4.2 Mapear variáveis CSS no style.css
✅ 4.3 Validar sincronização completa de temas em runtime no test_strip.html

── FASE 5: Migração de Telas do Sistema ──────────────────────────────────────
[ ] 5.1 Migrar tela de Auxiliares e Sends (public_new/modules/auxs_sends.js) — Piloto:
      - Modo 1 (Sends on Fader: MIX 1-8): canais 1-32 enviando para o Mix + Card de Volume Geral do Mix (compact 68px) + Mini-Fader de contexto do próprio MIX à direita
      - Modo 2 (Envios do Canal: CH 1-32): 8 cards de AUX Send + Card de Volume Geral dos Auxiliares (compact 68px) + Mini-Fader de contexto do próprio Canal à direita
      - Sincronização e controle reativo dos Mini-Faders via MeterBus
[ ] 5.2 Migrar tela Principal Desktop (canais 1-32, ST IN, Mix, Bus, Master)
[ ] 5.3 Migrar Mini-Faders dos Modais (EQ, Dynamics, FX, Routing)
[ ] 5.4 Implementar renderização Mobile (<channel-strip> layout mobile)
[ ] 5.5 Remover channel_strip.js e módulos legados em public_new/modules/ e aposentar globals.js

── FASE 6: Validação Final e Promoção a Padrão ───────────────────────────────
[ ] 6.1 Teste de estresse com a mesa física em tempo real
[ ] 6.2 Validação em dispositivos de palco (celulares e tablets)
[ ] 6.3 Promover public_new/ para public/ (virando a versão padrão do sistema)
```

---

## 📌 Guia de Continuação da Sessão (Hand-off para Próxima IA)

### Onde paramos exatamente:
1. **Fases 1, 2, 3 e 4:** 100% concluídas, testadas e integradas no `public_new/test_strip.html`.
2. **Funcionalidades Consolidadas no Custom Element `<channel-strip>`:**
   - **Pan Independente Pareado:** Em canais vinculados (ex: CH 21 + 22), as faixas verticais superior e inferior controlam independentemente os canais `_ch` e `_partnerCh`, emitindo os parâmetros corretos.
   - **Isolamento de Estado Disabled:** Em canais inativos ou auxiliares no modo FIXED, faders, nudges, cues e pans são desabilitados visualmente (`opacity: 0.45`, `pointer-events: none`), mas o botão **ON** permanece 100% ativo e clicável (`opacity: 1`, `pointer-events: auto`).
   - **Master SOLO Alert & Unsolo All:** Se qualquer canal estiver com SOLO ativo, o botão SOLO do Master passa a pulsar em vermelho. Clicar no botão SOLO do Master desmarca o solo de todos os canais de uma vez só (`UNSOLO ALL`).
   - **Botões Nudge (+ / -) com Auto-Repeat e Resolução Contextual:**
     - Tela Principal (Inputs / Faders normais): `0.05 dB`.
     - Mix / Out (Mixes 1-8 e Buses 1-8): `0.10 dB`.
     - Sends on Faders (8 auxiliares): `0.25 dB`.
     - Aux dos Canais Individuais (aba interna): `0.50 dB`.
     - Ao segurar o botão (+350ms), inicia repetição automática a cada 60ms.
   - **Channel Lock Aprimorado:**
     - Toque simples no topo do card no mobile abre o modal de 3 opções (`[TRAVAR CANAL / DESTRAVAR CANAL]`, `[RENOMEAR CANAL]`, `[CANCELAR]`) sem o prefixo "SIM, ".
     - Tempo de long press reduzido para `450ms` (configurado em `default.yaml`, `state.js`, `globals.js` e `channel_lock.js`).
     - Clique no cadeado no desktop mantém a confirmação direta.
   - **Macro Faders & Volume Geral Unificados:**
     - Presets `preset="macro"`, `preset="volumeGeral"`, `preset="auxVolumeGeral"` e `preset="mixVolumeGeral"`.
     - Versão padrão para tela principal e versão `compact` (68px) para abas de aux e Volume Geral no Modo Músico (`channel-strip[preset="volumeGeral"][musician-mode]`).
     - Display de delta dB com `--` em repouso e valor ativo acumulado que reseta em 5s.
     - Botão ZERAR com modal de confirmação padronizado (`ConfirmModal.show`) antes de zerar os envios do canal ou mix.
     - Botão de Configuração presente no Macro Fader da tela principal e no Volume Geral quando em Modo Músico (`macro_locked_channels`).
     - Modal de configuração com exibição correta do número (`CH X`) no topo e nome resolvido na base respeitando a hierarquia (`resolvedNames` / `globalNames` > `customName` > `name` > `CH X`), além de ícone de cadeado de proteção visual no modo músico.
   - **Fidelidade Visual de Canais Pareados (Estéreo):**
     - **Desktop:** Card com largura proporcional (`110px`) perfeitamente integrado no grid contínuo, com fundo ON contextual por grupo (`#1a2633` para G1, `#1a2b22` para G2 e `#14283d` para ST IN).
     - **Mobile:** Largura padrão de `110px` com borda verde Yamaha de destaque (`border: 2px solid #00ff88`).
   - **Indicadores de Peak (Desktop & Mobile):**
     - **Desktop:** LED de Peak dedicado (`.desk-peak-led`) posicionado com espaçamento elevado acima das trilhas do medidor, acendendo em vermelho com glow (`#ff0000`, `box-shadow: 0 0 8px #ff4444`) quando qualquer canal (L ou R) atinge $\ge 98\%$ (0 dBFS / passo 32), com hold time de 1000ms.
     - **Mobile:** Indicação puramente por contorno perimetral do card (`.fader-card.peak-glow`), acendendo em vermelho com glow luminoso e sem elementos de LED redundantes no topo.
   - **Controle de Faders e Macros pela Roda do Mouse (Desktop):**
     - Rolar a roda do mouse sobre os faders (ou no corpo dos macro faders) ajusta o volume nos passos de dB contextuais (0.05 dB, 0.10 dB, 0.25 dB, 0.50 dB), bloqueando o scroll vertical indesejado da página e preservando total compatibilidade touch no Mobile.
3. **Plano de Desacoplamento do `globals.js`:**
   - O `globals.js` é temporário para a fase de transição. Na Fase 5.5, todos os arquivos passarão a ser ES Modules com `import/export` diretos, removendo as pontes globais e eliminando o `globals.js`.

### Próximos Passos Imediatos:
1. Iniciar a **Fase 5.1:** Migração de `public_new/modules/auxs_sends.js` para renderizar instâncias do Custom Element `<channel-strip>` com os presets de `auxSend`, `sendsOnFader`, `auxVolumeGeral`/`mixVolumeGeral` compactos e o Mini-Fader de contexto à direita (`#miniFaderContext`).
2. Migrar a tela principal (`index.html`) para utilizar os componentes `<channel-strip>` de forma declarativa e reativa via `MeterBus`.

---

## Critério de Aceitação e Conclusão

A refatoração da v2 é considerada concluída e pronta para substituir a v1 quando:
1. **Zero Globals:** Nenhum módulo no `public_new/` define ou consome variáveis globais implícitas no `window`.
2. **Alta Performance:** Meters e faders operam a 60 FPS suaves via `MeterBus` e WebAssembly, sem garbage collection excessivo.
3. **Cobertura Total:** Todos os tipos de canal (Inputs 1-32, ST IN, Mixes 1-8, Buses 1-8, Master, Aux Sends, Mini-Faders e Mobile) renderizam fielmente com comportamento idêntico ou superior ao legado.
4. **Temas em Tempo Real:** Edições no `ThemeEditor` refletem imediatamente em todos os componentes sem recriar elementos DOM.
5. **Zero Regressões:** Todas as funções de MIDI, SysEx, cenas, nomes customizados e operações de canal funcionam perfeitamente na 01v96 física.
