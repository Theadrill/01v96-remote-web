# Feature: Posição e Ponto de Inserção nos Auxiliares (Yamaha 01V96)

Controle de **insert point** (PRE/POST) para envios de canais individuais e configuração de **posição e modo** (FIXED/VARIABLE, PRE-POINT, GLOBAL e ALL NOMINAL) nos barramentos auxiliares, replicando a funcionalidade disponível na Yamaha 01V96 com fidelidade visual e operacional.

---

## 1. Visão Geral e Escopo

A implementação abrange duas camadas principais de controle na interface web:

1. **Insert Point por canal (Aux Send PRE/POST)** — Botão toggle em cada channel strip da tela de auxiliar (tanto no Modo 1: Mixer do Barramento, quanto no Modo 2: Envios do Canal), alternando entre envio pré-fader (**PRE**) e pós-fader (**POST**).
2. **Configuração e Posição do Barramento Auxiliar** — Painel indicador no mini fader do auxiliar (seção POSIÇÃO, idêntico ao padrão da seção MEDIDORES do Master) que ao clicar abre um modal com os controles de **MODE** (FIXED / VARIABLE), **GLOBAL** (PRE / POST), **PRE-POINT** (PRE ON / POST ON) e **ALL NOMINAL** (ação de reset para PRE).
3. **Integração com Sistema de Copiar/Colar** — O estado PRE/POST de cada envio é incluído no buffer do clipboard de auxiliares (`copy_paste.js`), preservando as configurações entre mixes.

---

## 2. Conceitos e Comportamentos

### 2.1 Aux Send PRE / POST (Por Canal)

| Estado | Significado | Comportamento | Visual do Botão |
|---|---|---|---|
| **PRE** (default) | Sinal capturado **antes** do fader | Envio independente do fader de canal | Neutro / Cinza escuro (Inativo) |
| **POST** | Sinal capturado **depois** do fader | Envio proporcional ao fader de canal | **Azul** (Ativo/Colorido) |

- **Localização:** No channel strip, posicionado entre o cabeçalho/número do canal e o nome do canal.
- **Padrão Visual:** Mesma base estrutural e tipográfica dos botões `.btn-on-desk` / `.btn-state`.
- **Modos de Visualização:**
  - **Modo 1 (Mixer do Barramento - MIX 1..8):** Exibido em cada um dos 32 canais de entrada enviados ao auxiliar ativo.
  - **Modo 2 (Envios do Canal - CH 1..32):** Exibido em cada um dos 8 strips de auxiliares para o canal selecionado.

### 2.2 Modo do Barramento (FIXED vs VARIABLE)

| Modo | Comportamento na 01V96 | Comportamento na Interface Web |
|---|---|---|
| **VARIABLE** (default) | Cada canal possui fader de envio independente | Faders ajustáveis normalmente (0 a 1023) |
| **FIXED** | Níveis de envio fixos em nível nominal (0 dB) | Faders travados/desabilitados visualmente em 0 dB com badge `FIXED`, permitindo apenas ON/OFF e PRE/POST |

### 2.3 Posição e Inserção do Barramento Auxiliar

| Campo | Opção Inativa / Default | Opção Ativa / Alternativa | Descrição |
|---|---|---|---|
| **GLOBAL** | `PRE` | `POST` | Ponto de inserção global do barramento auxiliar |
| **PRE-POINT** | `PRE ON` | `POST ON` | Ponto de captura do sinal pré-fader no canal |
| **ALL NOMINAL** | *Botão de Ação* | *One-shot Trigger* | Reseta instantaneamente o ponto de envio de todos os 32 canais para **PRE** naquele auxiliar (sem alterar os volumes) |

---

## 3. Elementos da Interface

### 3.1 Botão PRE/POST no Channel Strip

```
┌─────────────┐
│     01      │  ← Cabeçalho / Número do Canal
│   [ PRE ]   │  ← Botão Toggle PRE/POST (Azul quando POST, Neutro quando PRE)
│   VOZ 1     │  ← Nome do Canal
│    [ON]     │  ← Botão ON
│   [fader]   │  ← Fader de envio
└─────────────┘
```

### 3.2 Indicador de Posição no Mini Fader do Auxiliar

Localizado diretamente dentro do Mini Fader Strip do Auxiliar (no mesmo espaço vertical onde o Master Fader exibe a seção MEDIDORES):

```
┌────────────────────────┐
│      MINI FADER        │
│        AUX 1           │
│ ┌────────────────────┐ │
│ │      POSIÇÃO       │ │  ← Título centralizado
│ │  GLOBAL:    PRE    │ │  ← Badge de status
│ │  PRE-POINT: PRE ON │ │  ← Badge de status
│ └────────────────────┘ │
│         [ON]           │
│       [Fader]          │
└────────────────────────┘
```

### 3.3 Modal de Configuração do Auxiliar

Aberto ao clicar no indicador de POSIÇÃO:

```
┌────────────────────────────────────────┐
│     CONFIGURAÇÃO DO AUXILIAR 1         │
│                                        │
│  ALL NOMINAL                 [RESET]   │  ← Botão de ação (One-shot)
│  ────────────────────────────────────  │
│  MODE                                  │
│  [ FIXED ]   [ VARIABLE ]              │  ← Seletor de Modo
│                                        │
│  GLOBAL                                │
│  [ PRE ]     [ POST ]                  │  ← Toggle Global Insert
│                                        │
│  PRE-POINT                             │
│  [ PRE ON ]  [ POST ON ]               │  ← Toggle Pre-Point
│                                        │
│               [ FECHAR ]               │
└────────────────────────────────────────┘
```

---

## 4. Estrutura de Dados e Protocolo MIDI

### 4.1 Backend Rust (`server_rust`)

#### 4.1.1 `ChannelState` (`server_rust/src/state.rs`)
Adição dos campos de PRE/POST por canal:
```rust
pub struct ChannelState {
    // ...
    #[serde(rename = "aux1Pre")]
    pub aux1_pre: bool, // false = PRE, true = POST (ou mapeado conforme mesa)
    #[serde(rename = "aux2Pre")]
    pub aux2_pre: bool,
    // ... até aux8_pre
}
```

#### 4.1.2 `MixBusState` (`server_rust/src/state.rs`)
Adição das propriedades de configuração do Auxiliar:
```rust
pub struct MixBusState {
    // ...
    pub mode: u8,       // 0 = FIXED, 1 = VARIABLE (kAUXType/kAUXTypeIndex)
    pub global: u8,     // 0 = PRE, 1 = POST
    pub pre_point: u8,  // 0 = PRE ON, 1 = POST ON (kAuxSendPrePoint/kPrePoint)
}
```

#### 4.1.3 Mapeamento de Comandos MIDI (`dictionary.json` & `protocol.rs`)
- `kInputAUX/kAUX{1..8}Pre` (Elemento 35, Sub 1, 4, 7, 10, 13, 16, 19, 22)
- `kAUXType/kAUXTypeIndex` (Elemento 55, Sub 0, Channel 0..7 para Aux 1..8)
- `kAuxSendPrePoint/kPrePoint` (Elemento 96, Sub 0)
- `kAUXInsert/kInsertLocInsert` (Elemento 53, Sub 2)

#### 4.1.4 Sincronização Inicial (`sync_manager.rs`)
- Consulta automática de `kInputAUX/kAUX{1..8}Pre` para canais 0..31 e 60..67.
- Consulta de `kAUXType/kAUXTypeIndex` para mixes 0..7.
- Consulta de `kAuxSendPrePoint/kPrePoint`.

---

## 5. Plano de Implementação

### Fase 1: Backend Rust (`server_rust`)
1. Atualizar structs `ChannelState` e `MixBusState` em `state.rs`.
2. Adicionar handlers de mensagens MIDI em `state.rs` para `kInputAUX/kAUX*Pre`, `kAUXType/kAUXTypeIndex` e `kAuxSendPrePoint`.
3. Adicionar requisições na fila de sincronização em `sync_manager.rs`.
4. Verificar compilação com `cargo check`.

### Fase 2: Frontend - Camada de Dados e Eventos
1. Atualizar `auxs_sends.js` para manipular `aux{N}Pre` e emitir comandos de socket (`kInputAUX/kAUX{N}Pre`).
2. Implementar função de `toggleAuxPre(ch, auxIdx)` e sincronização reativa.
3. Atualizar `copy_paste.js` para copiar e colar o campo `pre` em `copySendsOnFaders` e `copyChannelAuxSends`.

### Fase 3: Frontend - Interface Visual e Componentes
1. Atualizar `channel_strip.js` (`createDesktopStrip` e `createMobileStrip`) e `auxs_sends.js` com o botão PRE/POST estilizado com azul quando POST.
2. Adicionar bloco de POSIÇÃO (GLOBAL / PRE-POINT) dentro do Mini Fader Strip do Auxiliar.
3. Implementar o Modal de Configuração do Auxiliar (`openAuxConfigModal` / `auxConfigModal`).
4. Implementar a lógica de travamento de faders quando o auxiliar estiver em modo `FIXED`.
5. Implementar a ação `ALL NOMINAL` com envio sequencial throttled.

### Fase 4: Estilização e Validação
1. Adicionar classes CSS em `style.css` para `.btn-aux-pre`, `.btn-aux-post`, `.aux-config-section`, badges e modal.
2. Testar responsividade desktop e mobile.
3. Validar consistência de sincronização em tempo real via WebSocket e MIDI.
