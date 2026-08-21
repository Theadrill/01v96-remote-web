# Plano Geral de Refatoração de Arquitetura & Componentes (Frontend V2)

## 1. Visão Geral e Objetivo Estratégico

Este documento é o **Plano Mestre de Refatoração do Frontend** do projeto `01v96-remote-web`.

O objetivo geral é transformar a base de código do frontend em uma **Arquitetura Modular Limpa**, organizada por camadas claras de responsabilidade (**Componentes**, **Telas**, **Serviços**, **Núcleo de Estado** e **Utilitários**). Isso elimina acoplamentos históricos, código duplicado e arquivos monolíticos, criando uma base sólida, extensível e profissional para as próximas evoluções do sistema.

### Princípios da Refatoração (Estratégia de Passos Seguros):
1. **Refatoração Segura em Pequenos Passos Verificáveis (*"Make the change easy, then make the easy change"*):**
   - **Passo 1 (Organização Física Zero-Risk):** Primeiro organizamos todos os arquivos legados existentes em suas respectivas pastas (`core/`, `services/`, `components/`, `screens/`, `utils/`) e atualizamos as referências de `<script>` em `public_new/index.html` **sem alterar a lógica interna de nenhum arquivo**. Isso estabelece uma "Linha de Base Verde", garantindo que a rota `/new` continue 100% funcional e sem erros 404 antes de refatorar código.
   - **Passo 2 (Refatoração Granular Arquivo por Arquivo):** Após a organização física validada, iniciamos a refatoração arquivo por arquivo (começando pela classe `ChannelStrip` modular no Épico 1), testando cada módulo isoladamente para garantir contexto total e zero suposições.
2. **Ambiente Isolado (`public_new/`):** Todo o trabalho de refatoração ocorre exclusivamente dentro de `public_new/`, acessível pela rota `/new`. A pasta `public/` original permanece 100% intacta como ambiente funcional de produção e fallback.
3. **Separação Estrita de Responsabilidades:** Componentes visuais (`components/`) não sabem detalhes de rede; Telas (`screens/`) orquestram a visão sem reimplementar física de controles; Serviços (`services/`) operam em background sem desenhar interface.
4. **Controle Estrito de Versionamento:** Nenhum commit é realizado sem solicitação explícita.
5. **Evolução Gradual por Épicos:** Começamos pelo núcleo visual mais crítico (o **Channel Strip Universal** e suas telas consumidoras) e, à medida que avançamos para outros subsistemas (Channel Setup, Routing, Cenas, etc.), novas fases e detalhamentos serão incorporados a este mesmo plano.

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
    ├── components/            <-- [COMPONENTES & WIDGETS VISUAIS REUTILIZÁVEIS]
    │   ├── channel_strip.js   <-- Classe Única ChannelStrip (7 Zonas, Fader, VU, Nudges, dB)
    │   ├── macro_fader.js     <-- Macro Fader diferencial de grupo
    │   ├── volume_geral.js    <-- Widget de Volume Geral / Fone
    │   ├── eq.js              <-- Gráfico e Controles do Equalizador Paramétrico de 4 Bandas
    │   ├── compressor.js      <-- Gráfico e Controles de Compressão Dinâmica
    │   ├── gate.js            <-- Gráfico e Controles de Noise Gate
    │   ├── dynamics.js        <-- Orquestrador de Dinâmica (Comp/Gate)
    │   ├── inserts.js         <-- Painel de seleção e roteamento de Inserts
    │   ├── routing.js         <-- Painel de Roteamento de Canal (Direct Out, Bus, Stereo)
    │   ├── rta.js             <-- Gráfico do Analisador de Espectro em Tempo Real (RTA)
    │   ├── sidebar.js         <-- Barra lateral de ferramentas / Dock de navegação
    │   ├── search.js          <-- Barra de busca e filtro rápido de canais
    │   ├── theme-editor.js    <-- Editor visual de temas em tempo real
    │   └── modals/            <-- [MODAIS E DIÁLOGOS DE SISTEMA]
    │       ├── confirm-modal.js   <-- Modal genérico de confirmação / Wizard
    │       ├── bubble-modal.js    <-- Modais tipo balão contextual
    │       ├── virtual-keyboard.js<-- Teclado virtual na tela
    │       └── color-picker.js    <-- Seletor visual de cores
    │
    ├── screens/               <-- [CONTROLADORES DE TELAS / VISÕES]
    │   ├── main_view.js       <-- Tela Principal do Mixer (32 CHs de Entrada, ST IN e Master PA)
    │   ├── auxs_sends.js      <-- Tela de Envios Auxiliares (Sends on Faders & Mix Matrix)
    │   ├── channel_setup.js   <-- Central de Edição (Host de EQ/Comp/Gate/Routing + Mini-Fader)
    │   ├── outs_view.js       <-- Tela de Barramentos de Saída (MIX 1-8 Masters e BUS 1-8)
    │   ├── musician_view.js   <-- Tela simplificada do Músico (Envios de Fone + Bloqueio)
    │   ├── routing_overview.js<-- Visão geral matricial de Roteamento
    │   └── scenes_view.js     <-- Tela de Gerenciamento de Cenas e Presets
    │
    ├── services/              <-- [SERVIÇOS DE REDE, ÁUDIO, SEGURANÇA E DADOS]
    │   ├── socket.js          <-- Comunicação WebSocket / MIDI com a mesa 01V96
    │   ├── monitoring.js      <-- Streaming de Áudio em Tempo Real (WebCodecs / PCM / Opus)
    │   ├── patch_registry.js  <-- Registro e resolução de Patch I/O (ADAT, OMNI, SLOT)
    │   ├── theme-manager.js   <-- Carregador e injetor de variáveis CSS de temas YAML
    │   ├── channel_lock.js    <-- Serviço de trava de segurança e proteção de canais
    │   └── contextual_copy_paste.js <-- Serviço de cópia e colagem de parâmetros de contexto
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

## 3. ÉPICO 1: Refatoração do Channel Strip & Telas Consumidoras

O ponto de partida da refatoração é o componente mais utilizado em todo o mixer: o **Channel Strip**.

### 3.1 Arquitetura da Classe Única Modular `ChannelStrip`
Em `public_new/modules/components/channel_strip.js`:
- Centraliza a física completa do fader (range 0-1023), auto-repeat acelerado em nudges (+/-), conversão de decibéis e integração com `MeterBus` a 60 FPS via WebAssembly.
- Monta o canal a partir de **7 Zonas Modulares** (`Header`, `TopAction`, `Display`, `MiddleFeature`, `PrimaryButton`, `FaderCore`, `FooterRouting`).
- Emite `CustomEvents` nativos para desacoplar a apresentação da camada de rede.

### 3.2 Integração com as Telas (`screens/`)
- **`screens/channel_setup.js`:** Host modular das abas (EQ, Comp, Gate, Routing) com o Mini-Fader de inspeção lateral (`isMini: true`) e Solo Replace.
- **`screens/auxs_sends.js`:** Lógica de barramento (Fixed/Variable, Pre/Post global) consumindo `ChannelStrip` do tipo `aux_send`.
- **`screens/main_view.js`:** Grade de 32 inputs e Master Stereo.
- **`screens/outs_view.js`:** Barramentos MIX 1-8 e BUS 1-8.
- **`screens/musician_view.js`:** Faders de envio do retorno e Volume Geral.

---

## 4. Roteiro de Execução (Fases do Projeto)

### FASE 1 — Organização Estrutural de Diretórios em `public_new/`
- [ ] Criar pastas `components/`, `components/modals/`, `screens/`, `services/`, `core/` e `utils/`.
- [ ] Distribuir os arquivos de `public_new/modules/` para suas respectivas pastas.
- [ ] Atualizar todas as tags `<script>` em `public_new/index.html` para refletir os novos caminhos.
- [ ] Testar no endpoint `/new` garantindo zero erros de carregamento 404 no console.

### FASE 2 — Construção da Classe `ChannelStrip` Universal
- [ ] Criar `public_new/modules/components/channel_strip.js` com os métodos modulares das 7 zonas.
- [ ] Implementar cache de nós DOM em `this.elements` para updates cirúrgicos $O(1)$.
- [ ] Implementar bindings de eventos (Fader, Nudges acelerados, ON, SOLO, Panpot, Touch/Pointer).
- [ ] Integrar conexão direta com `MeterBus` / WASM sem querySelectors globais repetitivos.

### FASE 3 — Migração Piloto: Tela de Auxiliares (`screens/auxs_sends.js`)
- [ ] Refatorar `auxs_sends.js` para instanciar `ChannelStrip` com `type: 'aux_send'`.
- [ ] Remover do arquivo as funções legadas de faders, nudges e strings HTML duplicadas.
- [ ] Validar modos MIX (32 canais enviando) e CANAL (8 envios) com Pre/Post e modo FIXED.

### FASE 4 — Criação do Host de Edição `channel_setup.js`
- [ ] Criar `public_new/modules/screens/channel_setup.js` para gerenciar abas (`EQ`, `GATE`, `COMP`, `INSERTS`, `ROUTING`) e navegação ◀ / ▶.
- [ ] Integrar o Mini-Fader de contexto lateral com comportamento de `soloReplace`.
- [ ] Chamar os componentes existentes (`eq.js`, `dynamics.js`, etc.) no painel central sem necessidade de reescrevê-los.

### FASE 5 — Migração das Telas Restantes (`main_view.js`, `outs_view.js`, `musician_view.js`)
- [ ] Migrar Tela Principal (`screens/main_view.js`) para instanciar os 32 inputs e Master fixo via `ChannelStrip`.
- [ ] Migrar Tela de Saídas (`screens/outs_view.js`) para MIX 1-8 e BUS 1-8.
- [ ] Migrar Modo Músico (`screens/musician_view.js`) para faders de envio e Volume Geral.

### FASE 6 — Integração com Sistema de Temas YAML & Validação Final
- [ ] Mapear variáveis CSS `--strip-*` nos estilos e validar com `ThemeEditor` e `default.yaml`.
- [ ] Realizar bateria completa de testes de regressão no endpoint `/new`.

---

## 5. Próximos Épicos (Expansões Futuras do Plano)

Conforme a refatoração do Épico 1 for concluída e validada, este plano receberá novas seções detalhadas para:
- **ÉPICO 2:** Refatoração interna dos componentes de processamento de áudio (`eq.js`, `dynamics.js`, `inserts.js`).
- **ÉPICO 3:** Refatoração do sistema matricial de roteamento (`routing_overview.js` e `routing.js`).
- **ÉPICO 4:** Unificação e modernização do sistema de Cenas e Presets (`scenes_view.js`).
