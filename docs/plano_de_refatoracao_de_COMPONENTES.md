# Plano de Refatoração de COMPONENTES (Channel Strip Universal & Telas)

## 1. Contexto e Ambiente de Trabalho

- **Diretório de Trabalho Isolado:** `public_new/` (cópia de trabalho servida na rota `/new`).
- **Diretório Original:** `public/` permanece 100% intacto como referência funcional e fallback de segurança.
- **Objetivo Central:** Unificar a criação e ciclo de vida de faders e channel strips em uma **Classe Única Modular (`ChannelStrip`)**, eliminando as 6 funções de concatenação de strings HTML legadas e dezenas de `if/else` espalhados, e organizar o frontend em uma arquitetura limpa com separação por **Componentes (`components/`)**, **Telas (`screens/`)**, **Serviços (`services/`)**, **Núcleo de Estado (`core/`)** e **Utilitários (`utils/`)**.

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

## 3. Arquitetura da Classe Única Modular `ChannelStrip`

Em vez de dispersar heranças rígidas em múltiplos arquivos, o componente `ChannelStrip` (`public_new/modules/components/channel_strip.js`) opera como uma fábrica de alta performance orientada a eventos:

```javascript
export class ChannelStrip {
    constructor(config = {}) {
        this.config = config;           // ch, auxIdx, type, layoutMode, isMini, isPaired, etc.
        this.state = { value: 0, on: false, solo: false, pan: 0, patchText: '--', ... };
        this.elements = {};             // Cache de referências DOM para atualizações O(1)
        this.container = null;
        this.abortController = new AbortController();
    }

    // --- Ciclo de Vida ---
    render() { /* Monta elemento raiz chamando os métodos das 7 zonas */ }
    mount(parentEl, position = 'beforeend') { /* Insere no DOM, cacheia nós e liga listeners */ }
    update(partialState) { /* Atualizações cirúrgicas sem recriar o DOM */ }
    destroy() { /* Aborta listeners via AbortController, limpa timers e remove do DOM */ }

    // --- Métodos Modulares das 7 Zonas ---
    buildZone1_Header() { /* Rótulo, ícones de lock e ações rápidas */ }
    buildZone2_TopAction() { /* Solo normal, Master Solo com alerta ou Botão PRE/POST */ }
    buildZone3_Display() { /* Scribble strip / Nome verde resolvido */ }
    buildZone4_MiddleFeature() { /* Medidores Master ou Badges de Posição Auxiliar */ }
    buildZone5_PrimaryButton() { /* Botão ON / Mute iluminado */ }
    buildZone6_FaderCore() { /* Fader vertical, Nudges com auto-repeat acelerado, dB, Cortina VU */ }
    buildZone7_FooterRouting() { /* Panpot interativo com duplo thumb estéreo e Patch Marquee */ }

    // --- Atualizações de Alta Performance (60 FPS) ---
    updateFader(val) { ... }
    updateMeter(levelPercent, isPeak) { ... }
    updateOnState(isOn) { ... }
    updateSoloState(isSolo) { ... }
    updatePan(panValue) { ... }
    updatePatch(text) { ... }
}
```

---

## 4. Integração das Telas (`screens/`) com os Componentes (`components/`)

Cada tela mantém **100% de suas regras de negócio e telas de edição**, consumindo a classe `ChannelStrip` apenas quando precisa renderizar um fader:

1. **`screens/channel_setup.js` (Host do Setup do Canal):**
   - Gerencia cabeçalho de navegação (◀ CH ANTERIOR / CH SEGUINTE ▶) e abas (`EQ`, `GATE`, `COMP`, `INSERTS`, `ROUTING`).
   - Instancia na barra lateral o `ChannelStrip` compacto (`isMini: true`, com Solo Replace automático).
   - Ao trocar de aba, apenas instancia o componente correspondente (`components/eq.js`, `components/compressor.js`, `components/gate.js`, `components/routing.js`) na área central sem reescrever o código desses gráficos.

2. **`screens/auxs_sends.js` (Tela de Auxiliares):**
   - Gerencia modos `VARIABLE / FIXED`, chave global `PRE / POST` e ponto de envio `PRE ON / POST ON`.
   - Renderiza a grade de canais instanciando `new ChannelStrip({ ch, auxIdx, type: 'aux_send' })`.

3. **`screens/main_view.js` (Tela Principal):**
   - Gerencia Layers (1-16, 17-32, Master).
   - Renderiza os 32 inputs e o Master Stereo fixo via `ChannelStrip`.

4. **`screens/outs_view.js` (Tela de Saídas):**
   - Renderiza os 8 MIX Masters e 8 BUS Masters via `ChannelStrip`.

5. **`screens/musician_view.js` (Modo Músico):**
   - Renderiza os canais do retorno do músico e posiciona o `components/volume_geral.js` no topo.

---

## 5. Roteiro de Implementação em Fases

- [ ] **FASE 1 — Estruturação de Diretórios em `public_new/`**
  - Mover arquivos para `components/`, `screens/`, `services/`, `core/` e `utils/`.
  - Atualizar os caminhos dos `<script>` em `public_new/index.html`.
- [ ] **FASE 2 — Construção da Classe `ChannelStrip` Universal**
  - Implementar métodos modulares das 7 zonas em `public_new/modules/components/channel_strip.js`.
  - Implementar física do fader (0-1023), auto-repeat acelerado em nudges e integração com `MeterBus`/WASM a 60 FPS.
- [ ] **FASE 3 — Migração Piloto: Tela de Auxiliares (`screens/auxs_sends.js`)**
  - Adaptar tela de auxiliares para instanciar `ChannelStrip`.
  - Eliminar código legado de geradores manuais de fader e nudges em `auxs_sends.js`.
- [ ] **FASE 4 — Migração da Central de Setup do Canal (`screens/channel_setup.js`)**
  - Criar `channel_setup.js` como host modular das abas (EQ, Comp, Gate, Routing) com o Mini-Fader de contexto lateral.
- [ ] **FASE 5 — Migração da Tela Principal (`screens/main_view.js`), Saídas (`screens/outs_view.js`) e Modo Músico (`screens/musician_view.js`)**
- [ ] **FASE 6 — Integração com Sistema de Temas YAML e Validação Fim-a-Fim no Endpoint `/new`**
