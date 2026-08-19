# Plano de Implementação — Componente ChannelStrip Universal + Integração com Temas

## Visão Geral
Centralizar a criação, renderização e ciclo de vida de todos os **Channel Strips** do sistema em uma arquitetura única, declarativa e modular (Classe / Factory com Presets e Feature Flags).

Atualmente, cada tela (Principal Desktop, Master, Saídas Mix/Bus/ST IN, Tela de Aux/Sends, Matriz de Mix, Modais com Mini-Faders e Mobile) constrói seus faders através de funções separadas ou blocos de strings HTML concatenados com dezenas de `if/else`, dificultando a manutenção, duplicação de regras e personalização visual.

Com este plano, todos os canais surgirão de uma mesma fonte padronizada (`ChannelStrip`), habilitando recursos sob demanda (slots e feature flags) e integrando-se nativamente ao sistema de temas YAML (`default.yaml` + `ThemeEditor`).

---

## REGRAS EXPLÍCITAS

### 1. Commits
- **NÃO FAZER COMMIT** sem pedido explícito do usuário.
- Se continuar a conversa após push, **NÃO** repetir push a cada alteração — aguardar novo pedido.

### 2. Linters e Qualidade
- Verificar console/erros após cada alteração de código.
- Garantir retrocompatibilidade com o motor de sincronização WebAssembly/Socket/MIDI existente.
- Corrigir warnings/erros antes de prosseguir.

### 3. Coexistência de Código Durante a Migração
- O arquivo `channel_strip.js` original será **mantido intacto e em paralelo** durante toda a migração.
- O novo componente viverá em arquivo próprio (`channel_strip_component.js`).
- As funções antigas (`createDesktopStrip`, `createMobileStrip`, etc.) só serão removidas na **Fase 6**, após validação completa.
- Isso evita bugs de ID duplicado e permite rollback seguro a qualquer momento.

### 4. Fases e Paradas
- Cada fase tem **PARADA EXPLÍCITA** — aguardar aprovação do usuário.
- Ao completar uma fase, marcar como `[X]` no checklist abaixo.
- **NÃO** prosseguir para a próxima fase sem autorização expressa.
- A ordem de execução segue o princípio **dependências antes de implementação**: renomear e estabilizar o módulo existente → criar o novo orquestrador → criar o componente visual:
  - [ ] **FASE -1** — Renomear `copy_paste.js` → `contextual_copy_paste.js` e atualizar todas as referências
  - [ ] **FASE 0** — Criação do Módulo `channel_operations.js` (dependência dos demais)
  - [ ] **FASE 1** — Arquitetura da Classe Base `ChannelStrip` e Presets
  - [ ] **FASE 2** — Migração Piloto: Tela de Auxiliares e Sends (`auxs_sends.js`)
  - [ ] **FASE 3** — Integração com Sistema de Temas YAML e `ThemeEditor`
  - [ ] **FASE 4** — Migração da Tela Principal Desktop (Inputs 1-32, ST IN, Mix, Bus e Master)
  - [ ] **FASE 5** — Migração dos Mini-Faders em Modais (EQ, Dynamics, FX, Routing)
  - [ ] **FASE 6** — Suporte ao Modo Mobile & Validação de Sincronização

---

## Anatomia Modular do Channel Strip Universal

Cada Channel Strip é renderizado a partir de **7 Zonas Modulares**:

```
┌────────────────────────────────────────────────────────┐
│ 1. HEADER ZONE (Left Slot: Swap/Copy | Label | Lock)   │
├────────────────────────────────────────────────────────┤
│ 2. TOP ACTION ZONE (Slot: SOLO | PRE/POST | Nada)      │
├────────────────────────────────────────────────────────┤
│ 3. DISPLAY / NAME TAG (Nome do canal / Scribble Strip) │
├────────────────────────────────────────────────────────┤
│ 4. MIDDLE FEATURE ZONE (Slot customizável):            │
│    - Medidores Master (PRE/POST)                       │
│    - Config Aux (Global / Pre-Point)                   │
│    - Vazio / Expansão futura                           │
├────────────────────────────────────────────────────────┤
│ 5. PRIMARY BUTTON (Botão ON com iluminação de estado)  │
├────────────────────────────────────────────────────────┤
│ 6. FADER & METER CORE (Fader vertical + Nudges +       │
│    Escala dB + VuMeter + Peak LED)                     │
├────────────────────────────────────────────────────────┤
│ 7. FOOTER / ROUTING ZONE (Panpot + Patch Input/Output) │
└────────────────────────────────────────────────────────┘
```

### Detalhamento da Zona 1 — Header Zone & Slots de Operação
O cabeçalho do card possui uma estrutura flexível de 3 colunas:
1. **Left Action Slot (Troca / Cópia):** Ícone de ação rápida (ex: `⇄` ou `swap`). No modo **Desktop**, abre o fluxo de operações de canal (orquestrado via `channel_operations.js`). No modo **Mobile**, **NÃO há ícones no cabeçalho** para manter a tela limpa e economizar espaço — no mobile, as opções de gerenciamento são disparadas via **Long Press** no cabeçalho do canal (`channel_lock.js`), exibindo o menu contextual dinâmico `[COPIAR/COLAR]` / `[TROCAR]` / `[TRAVAR CANAL ou DESTRAVAR CANAL]` (onde o botão de trava reflete dinamicamente o estado atual do canal) / `[RENOMEAR]`.
2. **Center Label:** Rótulo do canal (`CH 1`, `MIX 1`, etc.), cujo clique rápido abre o modal de configuração/equalizador do canal.
3. **Right Action Slot (Lock):** Cadeado de proteção contra alterações acidentais (`channel_lock.js`). No Desktop, exibe o ícone SVG; no Mobile, gerenciado via Long Press.

> ℹ️ **Nota de Escopo Arquitetural:** O componente `ChannelStrip` é responsável apenas por **renderizar os slots/ícones e disparar os eventos** de clique correspondentes. A inteligência das operações, orquestração dos modais via `ConfirmModal`, cópia profunda de parâmetros, comunicação MIDI/WASM e inversão de canais ficarão centralizadas no módulo dedicado `public/modules/channel_operations.js`, que será **detalhado em um plano de implementação próprio** (`plano_de_implementacao_troca_copia_canais.md`).

#### UX do Fluxo de Troca / Cópia (Wizard Linear de 3 Modais com Stack Navigation)
Pensado para máxima acessibilidade e simplicidade para operadores de qualquer nível de conhecimento:
- **Modal 1 (Escolha da Ação):** Pergunta simples: `[ 🔄 1. TROCAR CANAIS DE LUGAR ]` ou `[ 📋 2. COPIAR E COLAR NESTE CANAL ]` + `[ ❌ Cancelar / Fechar ]` (retorna para a tela principal). No mobile, esse fluxo já inicia direto a partir do clique na opção escolhida no menu de Long Press (`COPIAR` ou `TROCAR`).
- **Modal 2 (Seleção do Destino no Grid):** Exibe o grid com todos os canais (1-32, Mixes, etc.) com números e nomes customizados. O canal de origem aparece destacado/desabilitado. Botão `[ ⬅️ Voltar ]` retorna para o Modal 1 (ou menu anterior); botão `[ ❌ Fechar ]` encerra e volta para a tela principal.
- **Modal 3 (Confirmação Visual / ConfirmModal):** Exibe exatamente o que acontecerá (ex: *"CH 1 (Voz) trocará de posição com CH 5 (Baixo)"*). Botão `[ ⬅️ Cancelar ]` volta para o Grid (Modal 2); botão `[ ✅ EXECUTAR ]` aplica a operação e encerra.

---

## Tabela de Recursos por Tela / Contexto (Feature Matrix)

> ⚠️ **Atenção aos modos globais:** Os modos `musicianMode` e `technicianMixMode` alteram o comportamento dos canais da tela principal — quando ativos, o fader e o botão ON passam a controlar o **send do aux ativo** (`aux{N}` / `aux{N}On`) em vez do canal em si. O preset `mainInput` precisa receber o modo de operação atual para gerar as ações corretas.

| Contexto / Tela | Header Label | Swap/Copy (Left) | Lock (Right) | Top Slot | Name | Middle Slot | ON | Nudges | Fader & Scale | Meter & Peak | Panpot | Patch |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **Main Input (1-32)** | Sim | Sim | Sim | SOLO | Sim | — | Sim | Sim | Sim (+10dB a -∞) | Sim | Sim | Sim |
| **Main Master** | Sim | — | Opcional | Clear All Solos | Sim | Painel Medidores | Sim (Confirmação) | Sim | Sim (0dB a -∞) | Sim (Stereo) | Sim (Balance) | — |
| **Main Mix / Bus** | Sim | Sim | Sim | SOLO | Sim | — | Sim | Sim | Sim (+10dB a -∞) | Sim | — | Sim (Out) |
| **Main ST IN (1-4)** | Sim | Sim | Sim | SOLO | Sim | — | Sim | Sim | Sim (+10dB a -∞) | Sim (Stereo) | Sim | Sim |
| **Aux Send (no canal)** | Sim | — | — | PRE / POST | Sim | — | Sim | Sim | Sim (+10dB a -∞) | — | — | — |
| **Mix Matrix (quem envia)**| Sim | — | — | PRE / POST | Sim | — | Sim | Sim | Sim (+10dB a -∞) | — | — | Sim |
| **Mini-Fader (Modais)** | Sim | — | — | SoloReplace | Sim (Editor) | Opcional (Aux Pos) | Sim | Sim | Sim | Sim | — | — |

---

## Análise Comparativa: Desktop vs. Mobile

### Elementos idênticos em ambos os layouts
| Elemento | Detalhe |
| :--- | :--- |
| IDs gerados (`f0`, `v0`, `on0`, `solo0`, `name0`, `card0`) | Mesma convenção de nomenclatura |
| `data-ch` e `data-partner-ch` | Mesmos atributos para sincronização |
| Botão SOLO (com `soloReplace` no mini) | Mesma lógica, classe CSS diferente |
| Botão ON | Mesma lógica, classe CSS diferente |
| Fader `<input type="range">` | Idêntico |
| Nudges `+` e `-` | Mesma lógica |
| Slot Top (PRE/POST, etc.) via `topExtraHtml` | Mesmo mecanismo de injeção |
| Middle Slot (Medidores/Posição) | Existe em ambos, estrutura visual diferente |

### Diferenças estruturais entre layouts
| Elemento | Desktop | Mobile |
| :--- | :--- | :--- |
| **Classe do card raiz** | `fader-card-desktop` | `fader-card` |
| **VU Meter** | `desk-meter-curtain` dentro do container do fader, ao lado do track | `mobile-meter-bg / mobile-meter-curtain` como **fundo absoluto** do card inteiro |
| **Peak LED** | `desk-peak-led` (elemento separado, `id="p0"`) | **Não existe** no mobile |
| **Escala dB** | `desk-db-scale` — lista completa de marks (+10dB a -∞) | `mobile-db-scale-overlay` — apenas 3 marks (0, -10, -30) |
| **Valor dB textual** | `desk-db-val > span` — acima do fader, fora do nudge | Dentro do nudge de baixo, ao lado do botão `-` |
| **Panpot** | `desk-pan-indicator` — barra horizontal com thumb L/R | **Não existe** no mobile |
| **Patch badge** | `desk-patch-zone` com efeito marquee — rodapé do card | **Não existe** no mobile |
| **Header / Rótulo** | Zona própria `desk-label-wrapper` + cadeado SVG embutido | Dentro de `ch-clickable-zone top > h2.card-title` (sem zona separada) |
| **Lock (cadeado)** | SVG explícito dentro do header do strip | Não existe no markup; `channel_lock.js` age via overlay externo / long press |
| **Troca / Cópia (Swap/Copy)** | Ícone explícito à esquerda do rótulo no header | Não existe no markup; acionado via menu de long press |
| **Posição do botão ON** | Sempre no meio do card | Sobe para o **topo** quando em `musicianMode` via `onTop: true` |
| **Container do fader** | `desk-fader-container` com `onwheel` para scroll | `fader-rotated-container` sem `onwheel`, orientação via CSS |
| **Middle Slot Master** | Painel visual completo (`master-meter-section`) | Botão `btn-state` simples com label `MEDIDORES` |

### Como os VU Meters funcionam (pipeline de calibração)
Os meters **não são simples barras de porcentagem** — eles dependem de um pipeline de calibração manual que deve ser respeitado pelo componente:

1. **`steps.json`** (`public/steps.json`): Arquivo de calibração manual que mapeia cada **step bruto da mesa (0–32)** para um valor em **dB** real. Há duas tabelas: `inputs` (canais 1-32, Mix, Bus, ST IN) e `master`. Esse mapeamento foi ajustado empiricamente para alinhar o visual com a curva real da mesa 01V96.

2. **`steps.js`** (`public/modules/steps.js`): Carrega o `steps.json` via fetch e o expõe como `window.meterCalibration`. Disponibiliza `window.calibrateStep(step, isMaster)` — converte step bruto → porcentagem de preenchimento visual, passando pelo `dbToRaw()` para alinhar com a curva do fader.

3. **`socket.js`** (motor WASM): Ao inicializar, chama `tryLoadWasmCalibration()` que injeta as tabelas calibradas no motor WebAssembly (`wasmMeterEngine.set_calibration_tables(inputsArray, masterArray)`). O WASM processa os packets de meter em tempo real e fornece os níveis suavizados.

4. **Render dos curtains**: O motor de meters busca os elementos `.desk-meter-curtain` e `.mobile-meter-curtain` dentro de cada card (por `data-ch`) e atualiza via `scaleY(1 - percent/100)`. O Peak LED (`.desk-peak-led`) é acionado quando `percent >= 98`.

**Implicação para o componente:** O `ChannelStrip` deve gerar os elementos de meter com as classes e estrutura exatas que o motor de `socket.js` espera encontrar. Mudar nomes de classes ou estrutura dos curtains **quebra os meters em tempo real**. Os IDs dos curtains no desktop seguem o padrão `m{id}` (ex: `mm0`, `mm-master`) e os do peak LED seguem `p{id}` — ambos são buscados pelo motor de sincronização e devem ser preservados.

### Mapa de zonas: Desktop (7) vs. Mobile (5)
| Zona | Desktop | Mobile | Status |
| :--- | :--- | :--- | :--- |
| 1. Header/Label | `desk-label-wrapper` | Dentro de `ch-clickable-zone top` | Conteúdo equivalente, estrutura diferente |
| 2. Top Slot (SOLO/PRE) | `btn-cue` ou slot customizado | `btn-state` ou slot customizado | Classe CSS diferente, lógica igual |
| 3. Name Display | `desk-ch-name-zone` separado | Compartilha com a zona do header | Desktop separa, Mobile unifica |
| 4. Middle Slot | Painel visual rico | Botão simples | Simplificado no mobile |
| 5. Botão ON | `btn-on-desk` (posição fixa) | `btn-state` (posição muda no modo músico) | Posição condicional no mobile |
| 6. Fader Core | Template complexo com escala completa, meter e peak LED | Fader simples, escala mínima, meter como fundo | Muito diferente |
| 7. Pan + Patch | Presentes | **Ausentes** | Exclusivos do desktop |

### Decisão Arquitetural: um Preset, dois Renderers
Desktop e mobile compartilham lógica de **dados, IDs e estados**, mas diferem estruturalmente demais no HTML para viver num único template com `if/else` — isso recriaria o problema que estamos resolvendo.

**A solução é separar dados de apresentação:**

```
ChannelStrip.presets.mainInput(ch)
        ↓ retorna config pura (features, IDs, dados, ações)
ChannelStrip.render(config, mode)
       /                     \
renderDesktop(config)    renderMobile(config)
(7 zonas)                (5 zonas)
```

O **preset** define o **quê** (features ativas, IDs, dados, ações). O **renderer** define o **como** (HTML específico do layout). Os presets são universais; os renderers são dois arquivos/funções separadas, sem `if/else` cruzado entre eles.

---

## Padrão de Presets Declarativos

```javascript
// Exemplo de uso declarativo em qualquer módulo do sistema:
const stripInput = ChannelStrip.create(ChannelStrip.presets.mainInput(chIndex));
const stripMaster = ChannelStrip.create(ChannelStrip.presets.master());
const stripAuxSend = ChannelStrip.create(ChannelStrip.presets.auxSend({ ch, auxIdx, isPre }));
const stripMixMatrix = ChannelStrip.create(ChannelStrip.presets.mixMatrix({ ch, mixIdx, isFixed, isPre }));
const stripMini = ChannelStrip.create(ChannelStrip.presets.mini(chIndex, { auxPosition: true }));
```

---

## Integração com Sistema de Temas YAML

### Nova seção em `public/themes/default.yaml`:
```yaml
# ─── CHANNEL STRIP ────────────────────────────────────────────
# Estilização visual unificada de todos os faders/strips do sistema
channel_strip:
  # Estrutura do Card
  card_bg: "#1e1e1e"
  card_bg_on: "rgba(255, 230, 0, 0.04)"
  card_border_color: "#2a2a2a"
  card_border_radius: "6px"
  card_width: "68px"

  # Identificação / Cabeçalho
  header_bg: "#181818"
  header_text_color_input_1: "#ffffff"   # Canais 1-16
  header_text_color_input_2: "#00d2ff"   # Canais 17-32
  header_text_color_st_in:   "#ff00ff"   # ST IN 1-4
  header_text_color_mix:     "#ffcc00"   # MIX 1-8
  header_text_color_bus:     "#00ffcc"   # BUS 1-8
  header_text_color_master:  "#ff3333"   # MASTER

  # Scribble Strip (Nome Display)
  display_bg: "#0a0a0a"
  display_text_color: "#00ff66"
  display_font_size: "11px"

  # Botões de Controle
  btn_on_bg: "#333333"
  btn_on_active: "#ffb700"
  btn_solo_bg: "#2b2b2b"
  btn_solo_active: "#ff3b30"
  btn_pre_active: "#ff9500"

  # Fader e Medidores
  db_text_color: "#00ffcc"
  fader_track_bg: "#111111"
  fader_thumb_color: "#cccccc"
  meter_curtain_color: "#00ff00"
  peak_led_color: "#ff0000"

  # Ícones do Header (Swap/Copy e Lock)
  header_icon_color: "#666666"          # Cor padrão dos ícones no header
  header_icon_hover: "#ffffff"          # Cor dos ícones ao hover
  header_icon_lock_active: "#ff3b30"    # Cadeado quando canal está travado
  header_icon_swap_color: "#aaaaaa"     # Ícone de troca/cópia (canal desbloqueado)

  # Patch Zone
  patch_bg: "#141414"
  patch_text_color: "#888888"
```

---

## FASE -1 — Renomear `copy_paste.js` → `contextual_copy_paste.js`
> ⚠️ **PARADA EXPLÍCITA** — Aguardar aprovação do usuário antes de prosseguir para a Fase 0.

> ℹ️ **Por que renomear antes de tudo:** o nome `copy_paste.js` descreve o mecanismo, não o propósito. O módulo faz **cópia contextual de parâmetros da tela ativa** (EQ, Dynamics, AUX, Routing) — um sistema completamente diferente do `channel_operations.js` que fará cópia e troca **atômica entre dois canais completos**. O padrão adotado é **Intention-Revealing Names**: o nome do arquivo revela o que ele faz, não como. Isso também inclui renomear as variáveis globais que vazam o nome antigo para o resto do sistema (Opção B consciente — feito agora para evitar inconsistência acumulada).

### Impacto mapeado — todos os arquivos que referenciam `copy_paste`:

| Arquivo | Tipo de referência | O que muda |
| :--- | :--- | :--- |
| `public/index.html` | `<script src="modules/copy_paste.js">` | Atualizar para `contextual_copy_paste.js` |
| `public/modules/copy_paste.js` | O arquivo em si | Renomear para `contextual_copy_paste.js` |
| `public/modules/copy_paste.js` | `window.COPY_PASTE_BLACKLIST` | → `window.CONTEXTUAL_CLIPBOARD_BLACKLIST` |
| `public/modules/copy_paste.js` | `window.isCopyPasteAllowedForView` | → `window.isContextualClipboardAllowed` |
| `public/modules/sidebar.js` | Chama `copyActiveContext()` e `pasteActiveContext()` | Nomes públicos **não mudam** — são semânticos e corretos |
| `docs/plano_feature_aux_insert_point.md` | Menciona `copy_paste.js` | Atualizar referências textuais |
| `docs/plano_de_implementacao_componente_MODAL.md` | Menciona `copy_paste.js` | Atualizar referências textuais |
| `docs/plano_de_implementação_COPYPASTE_*.md` | Vários — histórico de feature | Atualizar referências textuais (são docs históricos, baixa prioridade) |
| `README.md` | `- [x] Refatorar Módulo copy_paste.js` | Atualizar para `contextual_copy_paste.js` |

> ℹ️ **O que NÃO muda:** as funções públicas `window.copyActiveContext()`, `window.pasteActiveContext()`, `window.copyEQ()`, `window.contextClipboard`, `window.updateCopyPasteUIState()` e `window.pasteClipboard()` mantêm seus nomes — são semânticos e corretos. Apenas as variáveis que contêm `COPY_PASTE` no nome e que descrevem o mecanismo interno (blacklist, guard de view) serão renomeadas.

### Checklist FASE -1:
- [ ] -1.1 Renomear `public/modules/copy_paste.js` → `public/modules/contextual_copy_paste.js`
- [ ] -1.2 Dentro do arquivo renomeado: `COPY_PASTE_BLACKLIST` → `CONTEXTUAL_CLIPBOARD_BLACKLIST` (2 ocorrências)
- [ ] -1.3 Dentro do arquivo renomeado: `isCopyPasteAllowedForView` → `isContextualClipboardAllowed` (2 ocorrências — definição e uso interno)
- [ ] -1.4 Atualizar `public/index.html`: `<script src="modules/copy_paste.js">` → `contextual_copy_paste.js`
- [ ] -1.5 Buscar e atualizar qualquer chamada a `window.isCopyPasteAllowedForView` ou `window.COPY_PASTE_BLACKLIST` no restante do projeto (verificar `sidebar.js` e demais módulos)
- [ ] -1.6 Atualizar referências textuais nos docs (`README.md`, `plano_feature_aux_insert_point.md`, `plano_de_implementacao_componente_MODAL.md`)
- [ ] -1.7 Verificar no browser que os botões COPIAR/COLAR continuam funcionando normalmente após o renome

---

## FASE 0 — Criação do Módulo `channel_operations.js` (Dependência dos Demais)
> ⚠️ **PARADA EXPLÍCITA** — Aguardar aprovação do usuário antes de prosseguir para a Fase 1.

> ℹ️ O `channel_operations.js` é criado **antes** do `ChannelStrip` pois o componente vai chamar `window.openChannelOperations(ch)` — essa dependência precisa existir antes para evitar erros no console desde os primeiros testes na `test_strip.html`.

### Decisões Arquiteturais Consolidadas (resultado do processo de design review)

#### 1. Separação de responsabilidades (Event-Driven Architecture / SRP)

O Long Press hoje vive incorretamente dentro do `channel_lock.js`. A arquitetura correta distribui as responsabilidades assim:

| Módulo | Responsabilidade única |
| :--- | :--- |
| `ChannelStrip` (componente) | Detecta o gesto long press (timer ~500ms) e dispara `CustomEvent('ch:longpress', { bubbles: true, detail: { ch, element } })` — só se `hasLongPress: true` no preset |
| `channel_operations.js` | Escuta `'ch:longpress'` no `document`, consulta estado do canal, monta e exibe o menu contextual dinamicamente |
| `channel_lock.js` | **Responsabilidade única:** aplicar/remover lock e overlay. Expõe `applyLock(ch)`, `removeLock(ch)`, `isLocked(ch)`. Não detecta gesto, não abre modais |

> ℹ️ **Por que `CustomEvent` e não callback?** Com callback `onLongPress(ch)` no preset, o strip conhece quem vai receber. Com `CustomEvent`, o strip não sabe — e não precisa saber. Qualquer módulo pode escutar `ch:longpress` sem mudar o strip. É testável isoladamente: basta disparar `document.dispatchEvent(new CustomEvent('ch:longpress', { detail: { ch: 0 } }))`. É extensível: analytics, logging, outros módulos se conectam sem tocar no strip.

#### 2. Estado do Wizard — `_session` interna

O `channel_operations.js` gerencia a navegação entre os 3 modais via uma variável de sessão interna ao módulo (escopo de closure/IIFE):

```javascript
// Variável de sessão — nasce quando o wizard abre, morre quando fecha ou cancela
let _session = null; // null = nenhum wizard ativo

// Abre quando o usuário clica em ⇄ (desktop) ou aciona via long press (mobile)
function openChannelOperations(ch) {
    _session = { sourceCh: ch, operation: null, targetCh: null };
    _showModal1(); // Modal 1: TROCAR / COPIAR / CANCELAR
}
```

Só um wizard pode estar ativo por vez — coerente com o uso em um mixer físico. A navegação de volta (Modal 3 → Modal 2) funciona chamando `ConfirmModal.show()` com o conteúdo anterior — o ConfirmModal fecha o atual e abre o novo automaticamente.

#### 3. ConfirmModal — sem alterações na API

O `ConfirmModal` já suporta `opts.buttons` com array `{ label, type, action }` que resolve a Promise com o `action` string. O Modal 1 (TROCAR / COPIAR / CANCELAR) já funciona com a API atual. **Zero impacto em chamadas existentes.**

#### 4. Relação com `contextual_copy_paste.js` — sistemas independentes

| | `contextual_copy_paste.js` | `channel_operations.js` |
| :--- | :--- | :--- |
| **O que opera** | Parâmetros da tela ativa (EQ, Dynamics, AUX, Routing) | Canal completo (todos os parâmetros) |
| **Gatilho** | Botão COPIAR/COLAR contextual na dock/sidebar | Ícone `⇄` no header do strip ou Long Press |
| **Destino** | A tela aberta no momento do paste | Canal escolhido no Grid (Modal 2) |
| **Paradigma** | Clipboard — copia agora, cola depois | Operação atômica — fonte e destino definidos antes de executar |

O `channel_operations.js` **reutiliza** a função `dispatchThrottledCommands` e a estrutura de snapshot de `executeCopyFullChannel` para a lógica de cópia direta (sem passar pelo clipboard). Para o **swap**, implementa lógica nova: snapshot A → snapshot B → aplica B em A → aplica A em B, tudo sequenciado via `dispatchThrottledCommands`.

#### 5. Throttle do swap — risco com a 01V96

Um swap completo entre dois canais gera ~2× os comandos de um `executePasteFullChannel`. Por precaução com o processador da 01V96, o swap usa **`2× intervalMs`** do valor padrão do `dispatchThrottledCommands` — se o padrão é 20ms, o swap usa 40ms. Sem hardcode: o `channel_operations.js` lê o valor padrão e dobra na chamada. A cópia direta (copy) mantém o intervalo padrão pois gera a mesma quantidade de comandos que um `executePasteFullChannel` já existente.

### Checklist FASE 0:
- [ ] 0.1 Criar `public/modules/channel_operations.js` como IIFE com o **stub completo** da API pública:
  - `window.openChannelOperations(ch)` — Orquestra o Wizard de 3 modais (Ação → Grid → Confirmação). No stub: `console.log('[ChannelOps] openChannelOperations:', ch)` + abre ConfirmModal com os 3 botões para validar o fluxo visual.
  - `window.channelOperationsSwap(chA, chB)` — Stub: `console.log('[ChannelOps] SWAP:', chA, '↔', chB)`.
  - `window.channelOperationsCopy(chSrc, chDst)` — Stub: `console.log('[ChannelOps] COPY:', chSrc, '→', chDst)`.
  - Listener interno: `document.addEventListener('ch:longpress', _handleLongPress)` — monta o menu contextual dinâmico (COPIAR / TROCAR / TRAVAR ou DESTRAVAR / RENOMEAR) consultando `channel_lock.isLocked(ch)`.
- [ ] 0.2 Refatorar `channel_lock.js` para remover a lógica de long press — expor apenas `applyLock(ch)`, `removeLock(ch)`, `isLocked(ch)`. A detecção de gesto migra para o `ChannelStrip` (FASE 1).
- [ ] 0.3 Documentar no cabeçalho do `channel_operations.js` que a implementação real do motor de troca/cópia será detalhada no `plano_de_implementacao_troca_copia_canais.md`.
- [ ] 0.4 Incluir `channel_operations.js` no `index.html` **após** `contextual_copy_paste.js` e **antes** de `channel_strip_component.js`.
- [ ] 0.5 Verificar no browser que não há erros de console e que o listener de long press existente (ainda no `channel_lock.js` temporariamente) não entra em conflito.

---

## FASE 1 — Arquitetura da Classe Base `ChannelStrip` e Presets
> ⚠️ **PARADA EXPLÍCITA** — Aguardar aprovação do usuário antes de prosseguir para a Fase 2.

- [ ] 1.1 Criar a estrutura da classe base universal `ChannelStrip` em `public/modules/channel_strip_component.js` (ES6+, alinhado com o padrão já usado no projeto).
- [ ] 1.2 Implementar o resolvedor de opções e gerador das 7 zonas modulares (Header com suporte a sub-slots de Swap/Copy e Lock, Top Slot, Name, Middle Slot, ON, Fader/Meters, Pan/Patch).
- [ ] 1.3 Implementar a feature flag `hasLongPress: true/false` no preset — quando `true`, o componente registra um timer de ~500ms no elemento do card e, ao expirar sem cancelamento, dispara:
  ```javascript
  element.dispatchEvent(new CustomEvent('ch:longpress', {
      bubbles: true,
      detail: { ch: config.ch, element }
  }));
  ```
  O `channel_operations.js` (já carregado) escuta este evento no `document` e orquestra o menu contextual.
- [ ] 1.4 Implementar a fábrica de Presets declarativos:
  - `presets.mainInput(chIndex, options)` — `hasSwapCopy: true`, `hasLock: true`, `hasLongPress: true`
  - `presets.master(options)` — `hasSwapCopy: false`, `hasLock: false`, `hasLongPress: false`
  - `presets.output(index, type, options)` (Mix / Bus / ST IN) — `hasSwapCopy: true`, `hasLock: true`, `hasLongPress: true`
  - `presets.auxSend({ ch, auxIdx, isPre, options })` — `hasSwapCopy: false`, `hasLock: false`, `hasLongPress: false`
  - `presets.mixMatrix({ ch, mixIdx, isFixed, isPre, options })` — `hasSwapCopy: false`, `hasLock: false`, `hasLongPress: false`
  - `presets.mini(chIndex, options)` — `hasSwapCopy: false`, `hasLock: false`, `hasLongPress: false`
- [ ] 1.5 Garantir compatibilidade total dos identificadores gerados (`ids`, `data-ch`, `data-pan-ch`, etc.) com as rotinas de sincronização existentes (`updateUI`, `socket.js`, `meter_canvas`/meters).
- [ ] 1.6 **Critério de aceitação manual:** Montar um canal de cada preset em uma página de teste isolada (`public/test_strip.html`) e verificar visualmente no browser — antes de qualquer integração nas telas reais. A página deve cobrir:
  - Canal input padrão (desbloqueado, solo, com ícone `⇄` e cadeado visíveis)
  - Canal input travado (lock ativo — ícones cobertos pelo overlay, comportamento esperado)
  - Canal estéreo emparelhado (largura dupla, sem ícone `⇄` individual ou com restrição de paridade documentada)
  - Canal Master
  - Canal Aux Send (sem ícones de operação — validar que feature flags desabilitam corretamente)
- [ ] 1.7 Confirmar no `test_strip.html` que clicar em `⇄` dispara `window.openChannelOperations(ch)` sem erros de console (stub da Fase 0 deve responder corretamente) e que o long press no card dispara o `CustomEvent` capturado pelo `channel_operations.js`.

---

## FASE 2 — Migração Piloto: Tela de Auxiliares e Sends (`auxs_sends.js`)
> ⚠️ **PARADA EXPLÍCITA** — Aguardar aprovação do usuário antes de prosseguir para a Fase 3.

- [ ] 2.1 Refatorar a renderização dos 8 sends individuais de um canal (`renderAuxs` Modo 2) para utilizar `ChannelStrip.presets.auxSend()`.
- [ ] 2.2 Refatorar a renderização dos 32 canais enviando para uma Mix (`renderAuxs` Modo 1) para utilizar `ChannelStrip.presets.mixMatrix()`.
- [ ] 2.3 Garantir que a classe `aux-mode-fixed` seja aplicada ao card quando o mix estiver em modo FIXED — comportamento crítico que desabilita interação do fader.
- [ ] 2.4 Validar comportamento dos botões PRE/POST, nível do fader, botão ON e atualização via socket.
- [ ] 2.5 Verificar se os badges de patch e nomes customizados continuam sendo refletidos dinamicamente.
- [ ] 2.6 Confirmar que as feature flags `hasSwapCopy: false` e `hasLock: false` estão ativas nos presets `auxSend` e `mixMatrix` — os ícones de operação **não devem aparecer** nesses contextos.

---

## FASE 3 — Integração com Sistema de Temas YAML e `ThemeEditor`
> ⚠️ **PARADA EXPLÍCITA** — Aguardar aprovação do usuário antes de prosseguir para a Fase 4.

- [ ] 3.1 Adicionar a seção `channel_strip:` em `public/themes/default.yaml` com comentários explicativos para cada chave (executar após Fase 2 para mapear variáveis reais usadas pelo componente).
- [ ] 3.2 Replicar as propriedades da nova seção nos temas de teste (`teste_copia.yaml`, etc.).
- [ ] 3.3 Mapear o carregamento das variáveis CSS (`--strip-*`) no método `loadTheme` e injetar dinamicamente no `:root`.
- [ ] 3.4 Atualizar `public/modules/theme-editor.js` para categorizar e permitir edição visual em tempo real da seção `channel_strip`.
- [ ] 3.5 Atualizar o arquivo de estilos `public/style.css` para consumir as variáveis CSS do tema.

---

## FASE 4 — Migração da Tela Principal Desktop (Inputs 1-32, ST IN, Mix, Bus e Master)
> ⚠️ **PARADA EXPLÍCITA** — Aguardar aprovação do usuário antes de prosseguir para a Fase 5.

- [ ] 4.1 Migrar a renderização dos Canais 1 a 32 na tela principal desktop para `ChannelStrip.presets.mainInput()`, garantindo que o preset receba o modo de operação atual (`musicianMode`, `technicianMixMode`) para gerar as ações corretas (canal vs. send do aux ativo).
- [ ] 4.2 Migrar a renderização das saídas (MIX 1-8, BUS 1-8, ST IN 1-4) para `ChannelStrip.presets.output()`.
- [ ] 4.3 Migrar o canal MASTER da tela principal desktop para `ChannelStrip.presets.master()`.
- [ ] 4.4 Validar emparelhamento estéreo (Canais com largura dupla, faders linkados, panpot estéreo duplo).
- [ ] 4.5 Validar suporte ao sistema de Lock de canal (`channel_lock.js`), slot de troca/cópia de canal e menu de contexto/configurações.
- [ ] 4.6 Atualizar o menu de contexto/ações (`channel_lock.js` / `channel_operations.js`) para suportar o estado dinâmico `[TRAVAR CANAL / DESTRAVAR CANAL]` e os novos gatilhos `[COPIAR/COLAR]` e `[TROCAR]`.
  - **Regra de paridade de links (obrigatória):** No Modal 2 (Grid de Destino), canais emparelhados/linkados em estéreo só podem ser trocados ou copiados com outro canal igualmente emparelhado/linkado. Canais solo só podem operar com canais solo. O grid deve desabilitar visualmente os destinos incompatíveis, exibindo um estado `disabled` com tooltip explicativo.

---

## FASE 5 — Migração dos Mini-Faders em Modais (EQ, Dynamics, FX, Routing)
> ⚠️ **PARADA EXPLÍCITA** — Aguardar aprovação do usuário antes de prosseguir para a Fase 6.

- [ ] 5.1 Substituir a montagem do mini-fader no modal de EQ (`eq.js`) por `ChannelStrip.presets.mini()`.
- [ ] 5.2 Substituir a montagem do mini-fader nos modais de Dynamics/Compressor/Gate (`dynamics.js`, `compressor.js`, `gate.js`).
- [ ] 5.3 Substituir a montagem do mini-fader nos modais de Efeitos/FX (`efeitos.js`, `fx_components.js`).
- [ ] 5.4 Substituir a montagem do mini-fader nos modais de Routing e Aux Position.
- [ ] 5.5 Validar que a abertura do editor de nomes e a ação de solo substitutivo (`soloReplace`) continuam funcionando normalmente.

---

## FASE 6 — Suporte ao Modo Mobile & Validação de Sincronização
> ⚠️ **PARADA EXPLÍCITA** — Aguardar aprovação do usuário antes de finalizar.

> ℹ️ A análise comparativa desktop/mobile foi realizada antecipadamente e seus resultados estão documentados na seção **"Análise Comparativa: Desktop vs. Mobile"** acima. A decisão arquitetural já está tomada: **um preset, dois renderers separados** (`renderDesktop` e `renderMobile`). O item 6.0 de análise foi incorporado ao plano desde o início e não precisa ser revisitado.

- [ ] 6.1 Implementar o renderer mobile (`renderMobile(config)`) como função separada, cobrindo as 5 zonas do mobile sem `if/else` cruzado com o desktop.
- [ ] 6.2 Integrar `renderMobile` nos presets existentes via `ChannelStrip.render(config, 'mobile')`.
- [ ] 6.3 Validar transição fluida entre modo Desktop e modo Mobile (troca de `layoutMode`).
- [ ] 6.4 Validar o comportamento de Long Press no Mobile (`channel_operations.js`), confirmando que:
  - O `ChannelStrip` dispara corretamente o `CustomEvent('ch:longpress')` após ~500ms de toque
  - O `channel_operations.js` monta o menu contextual com as opções corretas para o estado atual do canal
  - O estado dinâmico `[TRAVAR CANAL]` / `[DESTRAVAR CANAL]` reflete corretamente `channel_lock.isLocked(ch)`
  - As opções `[COPIAR/COLAR]`, `[TROCAR]` e `[RENOMEAR]` disparam os fluxos corretos
  - O `channel_lock.js` neste ponto já **não contém mais nenhuma lógica de long press** — só `applyLock`, `removeLock`, `isLocked`
- [ ] 6.5 Validar sincronização de VU Meters em Canvas e WebSockets sob alta carga (60 FPS).
- [ ] 6.6 Limpeza de código legado obsoleto em `channel_strip.js` (remoção das funções `createDesktopStrip`, `createMobileStrip`, `createDesktopOutputStrip` e similares).
- [ ] 6.7 Teste completo fim-a-fim em todos os navegadores/resoluções suportados.

---

## 🔴 Questões em Aberto — Aguardando Resposta do Usuário

> Estas decisões foram identificadas durante o processo de design review (grill-me) e bloqueiam ou influenciam a implementação do `channel_operations.js`. Responder antes de iniciar a FASE 0.

---

### ❓ Branch 6 — Grid de Destino como Componente

**Contexto:** O Modal 2 do wizard exibe um grid de canais filtrados pelo contexto do canal de origem (inputs → inputs, mix → mix, etc.). Um grid similar já existe no projeto — o `channel_toggler` monta uma grade de 32 botões com nomes customizados, estado visual ON/OFF e seleção por clique.

**Questão:** O Grid do Modal 2 vai ser:

- **A) Componente novo e genérico** criado dentro do `channel_operations.js` — monta o grid dinamicamente com os canais do contexto, sem reutilizar nada do toggler. Mais controle, mais código.
- **B) Reutilização do mecanismo do `channel_toggler`** — extrai a lógica de renderização do grid para um helper compartilhado que tanto o toggler quanto o `channel_operations` usam. Menos duplicação, requer refatoração do toggler antes.
- **C) Grid inline no ConfirmModal** — passa o HTML do grid como `message` do ConfirmModal com seleção via evento delegado. Mais simples, menos flexível para estilos futuros.

**Impacto:** A opção B exige uma refatoração adicional (extrair o grid do toggler) que vira uma FASE -2 no plano. As opções A e C podem ser feitas dentro da própria FASE 0.

---

### ❓ Branch 7 — Renomear no Canal: o `RENOMEAR` usa o ConfirmModal com input existente?

**Contexto:** O menu de Long Press inclui a opção `[RENOMEAR]`. O `ConfirmModal` já suporta `opts.input` com campo de texto e teclado virtual (`VirtualKeyboard`). O sistema de nomes já existe (`/api/names`, `resolvedNames`).

**Questão:** A ação `RENOMEAR` do menu de Long Press vai:

- **A) Chamar o modal de renomeação existente** (seja ele um modal separado que já existe no projeto, ou a abertura direta do ConfirmModal com `input:`) — sem código novo relevante.
- **B) Ser implementada do zero** dentro do `channel_operations.js` usando `ConfirmModal` com `opts.input` + `VirtualKeyboard` + chamada à API de nomes.

**Impacto:** Se já existe um modal de renomeação no projeto (ligado ao clique no nome do canal), a opção A é trivial — só chamar a função existente. Preciso saber se existe antes de planejar.

---

### ❓ Branch 8 — O throttle de 2× se aplica também à CÓPIA ou só ao SWAP?

**Contexto:** Decidimos que o swap usa `2× intervalMs` (40ms se padrão for 20ms) por gerar o dobro de comandos. A cópia de canal completo (`channelOperationsCopy`) gera a mesma quantidade de comandos que um `executePasteFullChannel` — já existe no projeto com 20ms.

**Questão:** A cópia de canal completo usa o mesmo 20ms padrão do `contextual_copy_paste.js`, ou também dobra por precaução? Não há razão técnica para dobrar (mesma quantidade de comandos), mas pode ser uma escolha de consistência.

---

---

## 🛠️ Ferramentas de Design Review

Para continuar o processo de perguntas e respostas sobre este plano, instale e execute o **grill-me**:

```bash
npx skillfish add vechain/vechain-ai-skills grill-me
```

Após instalar, no Claude Code use o comando:
```
/grill-me
```

---

### ❓ Branch 9 — Feedback visual durante a execução do swap/cópia

**Contexto:** Um swap completo com 40ms entre comandos e ~30-40 parâmetros por canal pode levar **2-3 segundos** para completar. Durante esse tempo, o operador não tem feedback de que algo está acontecendo.

**Questão:** Durante a execução do swap/cópia, o sistema deve:

- **A) Bloquear o modal com um estado de loading** (spinner no botão EXECUTAR, botão desabilitado) até o `onComplete` do `dispatchThrottledCommands`.
- **B) Fechar o modal imediatamente** e mostrar um `OverlayInfo` de progresso (já existe no projeto — `OverlayInfo.show()`).
- **C) Fechar o modal imediatamente** sem feedback intermediário — só mostrar o resultado final no `onComplete`.

**Impacto:** A opção A é mais segura (impede duplo clique), a opção B é mais consistente com o padrão visual já usado no `contextual_copy_paste.js`, a opção C é mais simples mas pode confundir o operador se a mesa demorar.
