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
- A ordem das fases foi definida para que o conhecimento acumulado em cada etapa alimente a próxima (temas vêm depois do piloto para não serem reescritos):
  - [ ] **FASE 1** — Arquitetura da Classe Base `ChannelStrip` e Presets
  - [ ] **FASE 3** — Migração Piloto: Tela de Auxiliares e Sends (`auxs_sends.js`)
  - [ ] **FASE 2** — Integração com Sistema de Temas YAML e `ThemeEditor`
  - [ ] **FASE 4** — Migração da Tela Principal Desktop (Inputs 1-32, ST IN, Mix, Bus e Master)
  - [ ] **FASE 5** — Migração dos Mini-Faders em Modais (EQ, Dynamics, FX, Routing)
  - [ ] **FASE 6** — Suporte ao Modo Mobile & Validação de Sincronização

---

## Anatomia Modular do Channel Strip Universal

Cada Channel Strip é renderizado a partir de **7 Zonas Modulares**:

```
┌────────────────────────────────────────────────────────┐
│ 1. HEADER / IDENTIFICAÇÃO (Rótulo CH 1, Badge Lock)    │
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

---

## Tabela de Recursos por Tela / Contexto (Feature Matrix)

| Contexto / Tela | Header | Lock | Top Slot | Name | Middle Slot | ON | Nudges | Fader & Scale | Meter & Peak | Panpot | Patch |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **Main Input (1-32)** | Sim | Sim | SOLO | Sim | — | Sim | Sim | Sim (+10dB a -∞) | Sim | Sim | Sim |
| **Main Master** | Sim | Opcional | Clear All Solos | Sim | Painel Medidores | Sim (Confirmação) | Sim | Sim (0dB a -∞) | Sim (Stereo) | Sim (Balance) | — |
| **Main Mix / Bus** | Sim | Sim | SOLO | Sim | — | Sim | Sim | Sim (+10dB a -∞) | Sim | — | Sim (Out) |
| **Main ST IN (1-4)** | Sim | Sim | SOLO | Sim | — | Sim | Sim | Sim (+10dB a -∞) | Sim (Stereo) | Sim | Sim |
| **Aux Send (no canal)** | Sim | — | PRE / POST | Sim | — | Sim | Sim | Sim (+10dB a -∞) | — | — | — |
| **Mix Matrix (quem envia)**| Sim | — | PRE / POST | Sim | — | Sim | Sim | Sim (+10dB a -∞) | — | — | Sim |
| **Mini-Fader (Modais)** | Sim | — | SoloReplace | Sim (Editor) | Opcional (Aux Pos) | Sim | Sim | Sim | Sim | — | — |

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
| **Lock (cadeado)** | SVG explícito dentro do header do strip | Não existe no markup; `channel_lock.js` age via overlay externo |
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

  # Patch Zone
  patch_bg: "#141414"
  patch_text_color: "#888888"
```

---

## FASE 1 — Arquitetura da Classe Base `ChannelStrip` e Presets
> ⚠️ **PARADA EXPLÍCITA** — Aguardar aprovação do usuário antes de prosseguir para a Fase 2.

- [ ] 1.1 Criar a estrutura da classe base universal `ChannelStrip` em `public/modules/channel_strip_component.js` (ou módulo dedicado compatível com ES5/ES6).
- [ ] 1.2 Implementar o resolvedor de opções e gerador das 7 zonas modulares (Header, Top Slot, Name, Middle Slot, ON, Fader/Meters, Pan/Patch).
- [ ] 1.3 Implementar a fábrica de Presets declarativos:
  - `presets.mainInput(chIndex, options)`
  - `presets.master(options)`
  - `presets.output(index, type, options)` (Mix / Bus / ST IN)
  - `presets.auxSend({ ch, auxIdx, isPre, options })`
  - `presets.mixMatrix({ ch, mixIdx, isFixed, isPre, options })`
  - `presets.mini(chIndex, options)`
- [ ] 1.4 Garantir compatibilidade total dos identificadores gerados (`ids`, `data-ch`, `data-pan-ch`, etc.) com as rotinas de sincronização existentes (`updateUI`, `socket.js`, `meter_canvas`/meters).
- [ ] 1.5 **Critério de aceitação manual:** Montar um canal de cada preset em uma página de teste isolada (`public/test_strip.html`) e verificar visualmente no browser se a estrutura HTML/DOM, IDs e atributos estão corretos — antes de qualquer integração nas telas reais.

---

## FASE 2 — Integração com Sistema de Temas YAML e `ThemeEditor`
> ⚠️ **PARADA EXPLÍCITA** — Aguardar aprovação do usuário antes de prosseguir para a Fase 3.

- [ ] 2.1 Adicionar a seção `channel_strip:` em `public/themes/default.yaml` com comentários explicativos para cada chave.
- [ ] 2.2 Replicar as propriedades da nova seção nos temas de teste (`teste_copia.yaml`, etc.).
- [ ] 2.3 Mapear o carregamento das variáveis CSS (`--strip-*`) no método `loadTheme` e injetar dinamicamente no `:root`.
- [ ] 2.4 Atualizar `public/modules/theme-editor.js` para categorizar e permitir edição visual em tempo real da seção `channel_strip`.
- [ ] 2.5 Atualizar o arquivo de estilos `public/style.css` para consumir as variáveis CSS do tema.

---

## FASE 3 — Migração Piloto: Tela de Auxiliares e Sends (`auxs_sends.js`)
> ⚠️ **PARADA EXPLÍCITA** — Aguardar aprovação do usuário antes de prosseguir para a Fase 4.

- [ ] 3.1 Refatorar a renderização dos 8 sends individuais de um canal (`renderAuxs` Modo 2) para utilizar `ChannelStrip.presets.auxSend()`.
- [ ] 3.2 Refatorar a renderização dos 32 canais enviando para uma Mix (`renderAuxs` Modo 1) para utilizar `ChannelStrip.presets.mixMatrix()`.
- [ ] 3.3 Validar comportamento dos botões PRE/POST, nível do fader, botão ON, estado de canal travado (FIXED) e atualização via socket.
- [ ] 3.4 Verificar se os badges de patch e nomes customizados continuam sendo refletidos dinamicamente.

---

## FASE 4 — Migração da Tela Principal Desktop (Inputs 1-32, ST IN, Mix, Bus e Master)
> ⚠️ **PARADA EXPLÍCITA** — Aguardar aprovação do usuário antes de prosseguir para a Fase 5.

- [ ] 4.1 Migrar a renderização dos Canais 1 a 32 na tela principal desktop para `ChannelStrip.presets.mainInput()`.
- [ ] 4.2 Migrar a renderização das saídas (MIX 1-8, BUS 1-8, ST IN 1-4) para `ChannelStrip.presets.output()`.
- [ ] 4.3 Migrar o canal MASTER da tela principal desktop para `ChannelStrip.presets.master()`.
- [ ] 4.4 Validar emparelhamento estéreo (Canais com largura dupla, faders linkados, panpot estéreo duplo).
- [ ] 4.5 Validar suporte ao sistema de Lock de canal (`channel_lock.js`) e menu de contexto/configurações.

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
- [ ] 6.4 Validar sincronização de VU Meters em Canvas e WebSockets sob alta carga (60 FPS).
- [ ] 6.5 Limpeza de código legado obsoleto em `channel_strip.js` (remoção das funções `createDesktopStrip`, `createMobileStrip`, `createDesktopOutputStrip` e similares).
- [ ] 6.6 Teste completo fim-a-fim em todos os navegadores/resoluções suportados.
