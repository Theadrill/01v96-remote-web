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

| Estado | Valor MIDI 01V96 | Significado | Comportamento | Visual do Botão |
|---|---|---|---|---|
| **PRE** (default) | `0x01` (`1`) | Sinal capturado **antes** do fader | Envio independente do fader de canal | Neutro / Cinza escuro (Inativo) |
| **POST** | `0x00` (`0`) | Sinal capturado **depois** do fader | Envio proporcional ao fader de canal | **Azul** (Ativo/Colorido) |

> 🔬 **Validação de Hardware (01V96 ao vivo):**
> O mapeamento de valores foi confirmado via engenharia reversa com a mesa física:
> - Ao ativar **PRE** no console: SysEx `F0 43 10 3E 7F 01 23 [Param] [Ch] 00 00 00 01 F7` (Valor = `1`).
> - Ao ativar **POST** no console: SysEx `F0 43 10 3E 7F 01 23 [Param] [Ch] 00 00 00 00 F7` (Valor = `0`).

- **Localização:** No channel strip, posicionado entre o cabeçalho/número do canal e o nome do canal.
- **Padrão Visual:** Mesma base estrutural e tipográfica dos botões `.btn-on-desk` / `.btn-state`.
- **Modos de Visualização:**
  - **Modo 1 (Mixer do Barramento - MIX 1..8):** Exibido em cada um dos 32 canais de entrada enviados ao auxiliar ativo.
  - **Modo 2 (Envios do Canal - CH 1..32):** Exibido em cada um dos 8 strips de auxiliares para o canal selecionado.

### 2.2 Modo do Barramento (FIXED vs VARIABLE)

| Modo | Valor MIDI | Comportamento na 01V96 | Comportamento na Interface Web |
|---|---|---|---|
| **VARIABLE** (default) | `0x01` | Cada canal possui fader de envio independente | Faders ajustáveis normalmente (0 a 1023) |
| **FIXED** | `0x00` | Níveis de envio fixos em nível nominal (0 dB) | Faders travados/desabilitados visualmente em 0 dB com badge `FIXED`, permitindo apenas ON/OFF e PRE/POST |

### 2.3 Posição e Inserção do Barramento Auxiliar

| Campo | Opção Inativa / Default | Opção Ativa / Alternativa | Descrição |
|---|---|---|---|
| **GLOBAL** | `PRE` (`1`) | `POST` (`0`) | Ponto de inserção global do barramento auxiliar. Na mesa física, disparar essa chave altera em lote os 40 canais |
| **PRE-POINT** | `PRE ON` (`0`) | `POST ON` (`1`) | Ponto de captura do sinal pré-fader no canal (Elemento 96 / 0x60) |
| **ALL NOMINAL** | *Botão de Ação* | *One-shot Trigger* | Reseta instantaneamente o ponto de envio de todos os 32 canais para **PRE** (`1`) naquele auxiliar (sem alterar os volumes) |

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

## 4. Engenharia Reversa e Protocolo MIDI (Validado em Hardware)

### 4.1 Estrutura do Elemento 35 (`0x23` - `kInputAUX`)
Na Yamaha 01V96, cada canal possui uma matriz contínua de **tripletos** (3 parâmetros por auxiliar):
- **Fórmula de Parâmetro:** $\text{Param} = (\text{AuxIdx} - 1) \times 3 + \text{Offset}$
  - $\text{Offset } 0$: `Send ON/OFF` ($0 = \text{OFF}, 1 = \text{ON}$)
  - $\text{Offset } 1$: `Send PRE/POST` (**$1 = \text{PRE}, 0 = \text{POST}$**)
  - $\text{Offset } 2$: `Send Level` ($0 \dots 1023$, Fader de 10 bits)

#### Tabela de Endereçamento dos 8 Auxiliares:
| Auxiliar | Offset 0 (ON/OFF) | Offset 1 (PRE/POST) | Offset 2 (LEVEL) |
|---|---|---|---|
| **AUX 1** | `0x00` (0) | `0x01` (1) | `0x02` (2) |
| **AUX 2** | `0x03` (3) | `0x04` (4) | `0x05` (5) |
| **AUX 3** | `0x06` (6) | `0x07` (7) | `0x08` (8) |
| **AUX 4** | `0x09` (9) | `0x0A` (10) | `0x0B` (11) |
| **AUX 5** | `0x0C` (12) | `0x0D` (13) | `0x0E` (14) |
| **AUX 6** | `0x0F` (15) | `0x10` (16) | `0x11` (17) |
| **AUX 7** | `0x12` (18) | `0x13` (19) | `0x14` (20) |
| **AUX 8** | `0x15` (21) | `0x16` (22) | `0x17` (23) |

#### Mapeamento de Canais de Entrada (40 canais no total):
- `0x00` a `0x1F` ($0 \dots 31$): Entradas Mono **CH 01** a **CH 32**.
- `0x20` a `0x27` ($32 \dots 39$): Entradas Estéreo **ST IN 1L, 1R, 2L, 2R, 3L, 3R, 4L, 4R** (mapeadas como canais 60..67 no app).

### 4.2 Módulos Auxiliares de Barramento (Elementos 52 a 57)
- **Elemento 52** (`0x34`): `kAUXPair` (Stereo Pair dos Auxiliares)
- **Elemento 53** (`0x35`): `kAUXInsert` (Insert do Auxiliar: On, LocFirst, Loc)
- **Elemento 54** (`0x36`): `kAUXChannelOn` (Master ON do Auxiliar)
- **Elemento 55** (`0x37`): `kAUXType` (Modo: `0 = FIXED`, `1 = VARIABLE`)
- **Elemento 56** (`0x38`): `kAUXBalance` (Pan/Balance do Auxiliar)
- **Elemento 57** (`0x39`): `kAUXFader` (Fader Master do Auxiliar)
- **Elemento 96** (`0x60`): `kAuxSendPrePoint/kPrePoint` (Console Pre-Point: `0 = PRE ON`, `1 = POST ON`)

### 4.3 Ferramenta de Sondagem Criada
O script [`aux_position_probe.js`](file:///C:/PROJETOS/01v96-remote-web/aux_position_probe.js) está disponível no root para testes de leitura não-destrutivos (**100% READ ONLY**, apenas `0x30` requests, com filtro para descartar stream contínuo de meters `0D 21`).

---

## 5. Estrutura de Dados no Backend Rust (`server_rust`)

### 5.1 `ChannelState` (`server_rust/src/state.rs`)
Adição dos campos de PRE/POST por canal:
```rust
pub struct ChannelState {
    // ...
    #[serde(rename = "aux1Pre")]
    pub aux1_pre: bool, // true = PRE (1), false = POST (0)
    #[serde(rename = "aux2Pre")]
    pub aux2_pre: bool,
    // ... até aux8_pre
}
```

### 5.2 `MixBusState` (`server_rust/src/state.rs`)
Adição das propriedades de configuração do Auxiliar:
```rust
pub struct MixBusState {
    // ...
    pub mode: u8,       // 0 = FIXED, 1 = VARIABLE (kAUXType/kAUXTypeIndex)
    pub global: u8,     // 1 = PRE, 0 = POST
    pub pre_point: u8,  // 0 = PRE ON, 1 = POST ON (kAuxSendPrePoint/kPrePoint)
}
```

### 5.3 Sincronização Inicial (`sync_manager.rs`)
- Consulta de `kInputAUX/kAUX{1..8}Pre` para canais 0..31 e 32..39 (ST IN).
- Consulta de `kAUXType/kAUXTypeIndex` para barramentos 0..7.
- Consulta de `kAuxSendPrePoint/kPrePoint`.

---

## 6. Plano de Implementação (Próximos Passos)

### Fase 1: Backend Rust (`server_rust`)
1. Atualizar structs `ChannelState` e `MixBusState` em `state.rs`.
2. Adicionar tratamento de `offset == 1` em `protocol.rs` (`kInputAUX/kAUX*Pre`), respeitando `1 = PRE` e `0 = POST`.
3. Adicionar handlers para `kAUXType/kAUXTypeIndex` e `kAuxSendPrePoint/kPrePoint` em `state.rs`.
4. Incluir as requisições no `sync_manager.rs`.
5. Validar compilação com `cargo check`.

### Fase 2: Frontend - Camada de Dados e Eventos
1. Atualizar `auxs_sends.js` para manipular `aux{N}Pre` e emitir comandos de socket (`kInputAUX/kAUX{N}Pre`).
2. Implementar função `toggleAuxPre(ch, auxIdx)` e sincronização reativa.
3. Atualizar `copy_paste.js` para incluir o campo `pre` no clipboard de auxiliares.

### Fase 3: Frontend - Interface Visual e Componentes
1. Atualizar `channel_strip.js` (`createDesktopStrip` e `createMobileStrip`) e `auxs_sends.js` com o botão PRE/POST (Azul quando POST, Neutro quando PRE).
2. Adicionar o bloco de `POSIÇÃO` dentro do Mini Fader Strip do Auxiliar.
3. Implementar o Modal de Configuração do Auxiliar (`aux_config.js`).
4. Implementar o travamento visual de faders em 0 dB quando o auxiliar estiver em modo `FIXED`.
5. Implementar a ação `ALL NOMINAL` (disparo de 32 comandos com throttling).

### Fase 4: Estilização e Validação Final
1. Adicionar estilos CSS em `style.css`.
2. Validar bidirecionalmente com a mesa 01V96 física.
