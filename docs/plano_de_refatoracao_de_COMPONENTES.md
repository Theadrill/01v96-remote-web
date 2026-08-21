# Plano Geral de Refatoração de Arquitetura & Componentes (Frontend V2)

## 1. Visão Geral e Objetivo Estratégico

Este documento é o **Plano Mestre de Refatoração do Frontend** do projeto `01v96-remote-web`.

O objetivo geral é transformar a base de código do frontend em uma **Arquitetura Modular Limpa**, organizada por camadas claras de responsabilidade (**Componentes**, **Telas / Visões**, **Controladores de Setup**, **Serviços**, **Núcleo de Estado** e **Utilitários**). Isso elimina acoplamentos históricos, código duplicado e arquivos monolíticos, criando uma base sólida, extensível e profissional para as próximas evoluções do sistema.

### Princípios da Refatoração (Estratégia de Passos Seguros):
1. **Refatoração Segura em Pequenos Passos Verificáveis (*"Make the change easy, then make the easy change"*):**
   - **Passo 1 (Organização Física Zero-Risk):** Primeiro organizamos todos os arquivos legados existentes em suas respectivas pastas (`core/`, `services/`, `components/`, `screens/`, `screens/channel_setup/`, `utils/`) e atualizamos as referências de `<script>` em `public_new/index.html` **sem alterar a lógica interna de nenhum arquivo**. Isso estabelece uma "Linha de Base Verde", garantindo que a rota `/new` continue 100% funcional e sem erros 404 antes de refatorar código.
   - **Passo 2 (Refatoração Granular Arquivo por Arquivo):** Após a organização física validada, iniciamos a refatoração arquivo por arquivo (começando pela classe `ChannelStrip` modular universal), testando cada módulo isoladamente para garantir contexto total e zero suposições.
2. **Ambiente Isolado (`public_new/`):** Todo o trabalho de refatoração ocorre exclusivamente dentro de `public_new/`, acessível pela rota `/new`. A pasta `public/` original permanece 100% intacta como ambiente funcional de produção e fallback.
3. **Separação Estrita entre "Componente Visual Puro" e "Controlador de Tela":**
   - **Componentes (`components/`):** Widgets gráficos reutilizáveis (Canvas de EQ, medidores, faders, modal base). Não conhecem canais específicos nem regras de tela; recebem parâmetros e emitem eventos/callbacks.
   - **Telas de Canal (`screens/channel_setup/`):** Orquestram o estado da mesa, pegam o canal ativo (`activeConfigChannel`), conectam ao socket/MIDI e montam a aba consumindo os componentes puros.
   - **Nomenclatura Explícita (`channel_setup_*.js`):** Arquivos dentro de `screens/channel_setup/` usam o prefixo para clareza semântica imediata e economia de tokens.
4. **Controle Estrito de Versionamento:** Nenhum commit é realizado sem solicitação explícita.
5. **Evolução Gradual por Épicos:** Começamos pelo núcleo visual mais crítico (o **Channel Strip Universal** e suas telas consumidoras) e avançamos para os subsistemas especializados de processamento e roteamento.

---

## 2. Estrutura Canônica de Diretórios (`public_new/`)

```text
public_new/
├── index.html
├── style.css
├── app.js
├── steps.json
│
├── themes/                    <-- Definições de Temas YAML (default.yaml)
│   └── default.yaml
│
├── wasm/                      <-- Motor de Áudio/Meters em WebAssembly
│   ├── client_wasm.js
│   └── client_wasm_bg.wasm
│
├── vendor/                    <-- Bibliotecas de Terceiros
│   ├── fontawesome/
│   ├── js-yaml/
│   ├── qrcode.min.js
│   └── socket.io.min.js
│
└── modules/
    │
    ├── components/            <-- [COMPONENTES & WIDGETS VISUAIS PUROS REUTILIZÁVEIS]
    │   ├── channel_strip.js   <-- Classe Única ChannelStrip (Canais Padrão & Macros Diferenciais)
    │   ├── eq.js              <-- Componente Visual Puro: Canvas/Curva Biquad 4 Bandas & Balão de Q
    │   ├── compressor.js      <-- Componente Visual Puro: Curva de Dinâmica & Medidor de GR
    │   ├── gate.js            <-- Componente Visual Puro: Medidores Input/GR & Controles de Gate
    │   ├── dynamics.js        <-- Widget Integrador: Layout e física unificada Gate + Compressor
    │   ├── inserts.js         <-- Widget Visual: Grid de seleção e chaveamento de slots de Insert
    │   ├── routing.js         <-- Widget Visual: Matriz de atribuição BUS 1-8, Direct Out e Stereo
    │   ├── rta.js             <-- Gráfico do Analisador de Espectro em Tempo Real (RTA)
    │   ├── sidebar.js         <-- Barra lateral de ferramentas / Dock de navegação
    │   ├── search.js          <-- Barra de busca e filtro rápido de canais
    │   ├── theme-editor.js    <-- Editor visual de temas em tempo real
    │   ├── overlay_info.js    <-- Tooltips e overlays de feedback
    │   └── modals/            <-- [MODAIS E DIÁLOGOS DE SISTEMA]
    │       ├── confirm-modal.js   <-- Modal genérico de confirmação / Wizard
    │       ├── bubble-modal.js    <-- Modais tipo balão contextual
    │       ├── virtual-keyboard.js<-- Teclado virtual na tela
    │       └── color-picker.js    <-- Seletor visual de cores
    │
    ├── screens/               <-- [CONTROLADORES DE TELAS / VISÕES GERAIS]
    │   ├── main_view.js       <-- Tela Principal do Mixer (32 CHs de Entrada, ST IN e Master PA)
    │   ├── auxs_sends.js      <-- Tela de Envios Auxiliares (Sends on Faders & Mix Matrix)
    │   ├── outs_view.js       <-- Tela de Barramentos de Saída (MIX 1-8 Masters e BUS 1-8)
    │   ├── musician_view.js   <-- Tela simplificada do Músico (Envios de Fone + Bloqueio)
    │   ├── routing_overview.js<-- Visão geral matricial de Roteamento
    │   ├── scenes_view.js     <-- Tela de Gerenciamento de Cenas e Presets
    │   │
    │   └── channel_setup/     <-- [SUBSISTEMA DA CENTRAL DE EDIÇÃO DO CANAL]
    │       ├── channel_setup_core.js       <-- Host orquestrador (abas, navegação ◀ ▶, mini-fader)
    │       ├── channel_setup_eq.js         <-- Controlador da aba de Equalização
    │       ├── channel_setup_dynamics.js   <-- Controlador da aba de Dinâmica (Gate + Comp)
    │       ├── channel_setup_gate.js       <-- Painel de Gate do canal ativo
    │       ├── channel_setup_compressor.js <-- Painel de Compressor do canal ativo
    │       ├── channel_setup_aux.js        <-- Aba de 8 envios AUX + Volume Geral do canal
    │       ├── channel_setup_inserts.js    <-- Aba de seleção de Inserts do canal
    │       └── channel_setup_routing.js    <-- Aba de Roteamento (Direct Out, Bus 1-8, Stereo)
    │
    ├── services/              <-- [SERVIÇOS DE REDE, ÁUDIO, SEGURANÇA E DADOS]
    │   ├── socket.js          <-- Comunicação WebSocket / MIDI com a mesa 01V96
    │   ├── monitoring.js      <-- Streaming de Áudio em Tempo Real (WebCodecs / PCM / Opus)
    │   ├── patch_registry.js  <-- Registro e resolução de Patch I/O (ADAT, OMNI, SLOT)
    │   ├── theme-manager.js   <-- Carregador e injetor de variáveis CSS de temas YAML
    │   ├── channel_lock.js    <-- Serviço de trava de segurança e proteção de canais
    │   └── copy_paste.js      <-- Serviço de cópia e colagem de parâmetros de contexto
    │
    ├── core/                  <-- [ESTADO GLOBAL E INFRAESTRUTURA DE EXECUÇÃO]
    │   ├── globals.js         <-- Estado da mesa em memória (channelStates, mixesState, etc.)
    │   ├── events.js          <-- Hub e Barramento central de eventos de interface
    │   ├── steps.js           <-- Calibração dB / Range de Medidores da 01V96
    │   ├── setup.js           <-- Configurações gerais da aplicação
    │   └── splash_screen.js   <-- Tela de carregamento e inicialização
    │
    ├── utils/                 <-- [UTILITÁRIOS E HELPERS GERAIS]
    │   ├── scroll.js          <-- Algoritmos de rolagem suave e touch
    │   └── fps_meter.js       <-- Medidor de taxa de quadros (60 FPS)
    │
    ├── FXS/                   <-- [SUBSISTEMA DE PROCESSADORES DE EFEITOS]
    │   ├── fx_core.js
    │   ├── fx_components.js
    │   ├── fx_registry.js
    │   ├── fx_routing.js
    │   ├── fx_utils.js
    │   ├── reverb.js
    │   ├── multiband_compressor.js
    │   ├── efeitos.js
    │   └── fx.css
    │
    └── macros/                <-- [SUBSISTEMA DE MACROS & AUTOMAÇÃO]
        ├── core.js
        ├── lumikit/
        ├── channel_toggler/
        ├── smart_channel_toggler/
        └── profiles/
```

---

## 3. Especificação do Channel Strip Universal (Canais & Macros)

O `ChannelStrip` é o componente universal que centraliza a renderização, a física e os eventos de qualquer faixa de controle do mixer.

### 3.1 Variações Suportadas:
1. **Modo Canal (`mode: 'channel'`):**
   - Tipos: `input` (1–32), `st_in` (1–4), `aux_send` (Sends on Faders), `mix_master` (MIX 1–8), `bus_master` (BUS 1–8), `master` (Stereo Out), `isMini: true` (Mini-Fader de inspeção).
   - Elementos: Fader (0–1023), Escala em dB, VU Meter 60 FPS (WASM/Peak LED), Nudges finos (+/-), ON, SOLO, Panpot e Badges de Patch.

2. **Modo Macro Diferencial (`mode: 'macro'`):**
   - **`macro` (Técnico / Tela Principal):** Altera apenas os canais selecionados no grid de configuração. Botão `[CONFIG]`.
   - **`volume_geral` (Músico / Tela Principal):** Altera todos os 32 canais menos os que estão protegidos com cadeado 🔒 no grid. Botão `[CONFIG]`.
   - **`aux_volume_geral` (Setup do Canal / Aba AUX & Visão MIX):** Altera envios em bloco para os auxiliares. Sem botão de config; possui botão vermelho **`[ZERAR]`** com modal de confirmação.
   - Elementos: Big Nudges (+ / -) com auto-repeat acelerado, visor temporário de Delta dB (`--` → `+X.XX dB` resetando após inatividade) e botão de ação (`CONFIG` ou `ZERAR`).

---

## 4. Roteiro de Execução por Fases

### FASE 1 — Organização Estrutural Base em `public_new/` (CONCLUÍDA ✅)
- [x] Criar pastas `components/`, `components/modals/`, `screens/`, `services/`, `core/` e `utils/`.
- [x] Distribuir arquivos legados e ajustar `<base href="/new/" />`.
- [x] Ordenar scripts em camadas no final do `<body>` em `public_new/index.html`.
- [x] Testar endpoint `/new` garantindo zero erros 404 e baseline funcional 100% preservada (Commit `b8f226e`).

### FASE 2 — Organização Estrutural do Channel Setup & Placeholders de Componentes (CONCLUÍDA ✅)
- [x] Criar a pasta `public_new/modules/screens/channel_setup/`.
- [x] Mover os arquivos de controle da tela de edição para `screens/channel_setup/`:
  - `components/eq.js` → `screens/channel_setup/channel_setup_eq.js`
  - `components/dynamics.js` → `screens/channel_setup/channel_setup_dynamics.js`
  - `components/gate.js` → `screens/channel_setup/channel_setup_gate.js`
  - `components/compressor.js` → `screens/channel_setup/channel_setup_compressor.js`
  - `components/inserts.js` → `screens/channel_setup/channel_setup_inserts.js`
  - `components/routing.js` → `screens/channel_setup/channel_setup_routing.js`
- [x] Inserir em cada arquivo de `screens/channel_setup/` o cabeçalho descritivo com seu papel atual e transição futura.
- [x] Criar arquivos esqueleto (placeholders com documentação) em `public_new/modules/components/`:
  - `components/eq.js` (Componente visual puro)
  - `components/gate.js` (Componente visual puro)
  - `components/compressor.js` (Componente visual puro)
  - `components/dynamics.js` (Widget integrador)
  - `components/inserts.js` (Widget visual)
  - `components/routing.js` (Widget visual)
- [x] Atualizar tags `<script>` em `public_new/index.html`.
- [x] Validar ausência de erros 404 em `/new`.

### FASE 3 — Construção da Classe `ChannelStrip` Universal
- [ ] Criar classe `ChannelStrip` modular em `public_new/modules/components/channel_strip.js`.
- [ ] Implementar as 7 zonas modulares (`Header`, `TopAction`, `Display`, `MiddleFeature`, `PrimaryButton`, `FaderCore`, `FooterRouting`).
- [ ] Implementar suporte nativo a `mode: 'channel'` e `mode: 'macro'` (Big Nudges, Delta dB, botões CONFIG e ZERAR).
- [ ] Implementar cache $O(1)$ de nós DOM em `this.elements`.
- [ ] Implementar física de fader, retenção e auto-repeat acelerado em nudges.
- [ ] Integrar conexão direta com `MeterBus` / WASM.

### FASE 4 — Migração Piloto: Tela de Auxiliares (`screens/auxs_sends.js`)
- [ ] Refatorar `auxs_sends.js` para instanciar `ChannelStrip` com `type: 'aux_send'`.
- [ ] Remover do arquivo as funções legadas de faders e strings HTML duplicadas.
- [ ] Validar modos MIX e CANAL com Pre/Post e modo FIXED.

### FASE 5 — Criação do Host de Edição `channel_setup_core.js`
- [ ] Criar `public_new/modules/screens/channel_setup/channel_setup_core.js` para gerenciar abas (`EQ`, `DYN`, `AUX`, `INSERTS`, `ROUTING`), navegação ◀ / ▶ e Mini-Fader lateral com Solo Replace.
- [ ] Integrar e acionar as sub-telas (`channel_setup_*.js`).

### FASE 6 — Migração das Telas Restantes (`main_view.js`, `outs_view.js`, `musician_view.js`)
- [ ] Migrar Tela Principal (`screens/main_view.js`) para instanciar 32 inputs, Master e Macro Fader via `ChannelStrip`.
- [ ] Migrar Tela de Saídas (`screens/outs_view.js`) para MIX 1-8 e BUS 1-8.
- [ ] Migrar Modo Músico (`screens/musician_view.js`) para faders de envio e Volume Geral.

### FASE 7 — Construção dos Componentes Puros de Áudio
- [ ] Implementar `components/eq.js` (Canvas puro com BiquadFilter desacoplado de IDs globais).
- [ ] Implementar `components/gate.js` e `components/compressor.js` (Widgets puros de dinâmica).
- [ ] Implementar `components/inserts.js` e `components/routing.js`.
- [ ] Conectar os novos componentes aos controladores em `screens/channel_setup/`.

### FASE 8 — Integração com Sistema de Temas YAML & Validação Final
- [ ] Mapear variáveis CSS `--strip-*` nos estilos e validar com `ThemeEditor` e `default.yaml`.
- [ ] Realizar bateria completa de testes de regressão no endpoint `/new`.
