# Plano de Implementação de Meters (Níveis de Sinal e Gain Reduction) — Yamaha 01V96

Este documento descreve a arquitetura de engenharia reversa, protocolo MIDI SysEx, mapeamento de elementos e a estratégia de implementação prioritária para os medidores de nível de áudio (Level Meters) e atenuamento de compressão/gate (Gain Reduction Meters) dos canais da mesa (exceto máquinas de efeitos).

---

## 1. FASE 1 (PRIORITÁRIA): Painel de Controle de Medidores no Modo Desktop

Esta é a **primeira tarefa** de implementação visual de controle de medidores. O objetivo é integrar o bloco de seletores no painel Desktop, permitindo alternar a captação de sinal dos medidores tanto do **MASTER** quanto dos **CANAIS** usando os comandos SysEx globais descobertos.

> [!IMPORTANT]
> **RESTRICAO DE ESCOPO DE LAYOUT:**
> Este bloco de seletores será implementado **SOMENTE no modo Desktop**. No modo Mobile, estas opções serão tratadas futuramente em um modal à parte (não fazer nenhuma implementação para mobile nesta etapa).

### 1.1. Estrutura Visual do Bloco (Modo Desktop)

No painel do Master no layout Desktop, teremos o seguinte agrupamento de controles:

```text
MEDIDORES

MASTER:
[ PRE ]  [ POST ]

CANAIS:
[ PRE ]  [ POST ]
```

### 1.2. Mapeamento de Ações e SysEx Correspondente

#### 1. Seletor `MASTER:` (`PRE / POST`)
- **[ PRE ]**: Envia o SysEx Global para Saídas em modo Pre-Fader:
  `F0 43 10 3E 0D 03 0C 01 00 00 00 00 01 F7`
- **[ POST ]**: Envia o SysEx Global para Saídas em modo Post-Fader:
  `F0 43 10 3E 0D 03 0C 01 00 00 00 00 02 F7`

#### 2. Seletor `CANAIS:` (`PRE / POST`)
- **[ PRE ]**: Envia o SysEx Global para Canais em modo Pre-Fader:
  `F0 43 10 3E 0D 03 0C 00 00 00 00 00 01 F7`
- **[ POST ]**: Envia o SysEx Global para Canais em modo Post-Fader:
  `F0 43 10 3E 0D 03 0C 00 00 00 00 00 02 F7`

### 1.3. Passo a Passo da Implementação Técnica

#### Passo 1: Backend Rust (`server_rust/src/socket_handlers.rs`)
1. **Eventos WebSocket de Posição de Medidores:**
   - Registrador do evento `setGlobalMeterPosition { target: "master" | "channels", mode: "pre" | "post" }`.
   - Ao receber o evento, enviar a mensagem SysEx apropriada para a mesa via `scheduler.enqueue`.
   - Retransmitir a atualização de estado para todos os clientes conectados (`globalMeterPositionUpdated`).

#### Passo 2: Componentes do Frontend (`public/modules/channel_strip.js` e `socket.js`)
1. **Renderização dos Seletores (Apenas no Fader Master Desktop):**
   - Renderizar o bloco **MEDIDORES** com sub-rótulos **MASTER:** e **CANAIS:** e botões de pílula `[PRE]` / `[POST]`.
2. **Persistência em `localStorage`:**
   - Salvar `01v96_master_meter_pos` (`'pre'` | `'post'`) e `01v96_channels_meter_pos` (`'pre'` | `'post'`).
   - Restaurar as preferências ao carregar a página e enviá-las na reconexão (`socket.on('connect')`).

---

## 2. Filosofia de Comunicação e Polling Sob Demanda

A mesa Yamaha 01V96 opera a uma taxa física de transmissão MIDI de **31.25 kbps**. Transmitir continuamente a medição em tempo real de 32 canais + 8 buses + 8 auxs + dinâmicos de forma cega saturaria o barramento MIDI.

### Princípios do Studio Manager:
1. **Polling Inteligente Baseado em Foco (Screen-Bound Polling):** O software solicita apenas as barras de medição que estão **visíveis na tela aberta no momento**.
2. **Ciclo de Polling:** As requisições são agrupadas e disparadas periodicamente em lote (aproximadamente a cada 8 segundos ou em intervalos configurados de atualização visual).
3. **Economia de Tráfego:** Ao fechar uma tela (ex: Selected Channel ou Editor de Efeito), o polling dos meters correspondentes é imediatamente pausado.

---

## 2. Estrutura Genérica do Protocolo SysEx de Meters

### 2.1. Requisição de Medição (Host / Frontend -> Mesa)
- **Opcode:** `0x30` (Parameter Request)
- **Model ID:** `0x3E` (Yamaha 01V96)
- **Section:** `0x0D` (Patch / Routing / Meters)
- **Group:** `0x21` (Meter Level Request / Polling)
- **Estrutura (12 bytes):**
  ```text
  F0 43 30 3E 0D 21 [ELEMENT] [CHANNEL] 00 00 [LENGTH] F7
  ```

### 2.2. Resposta de Medição (Mesa -> Host / Frontend)
- **Opcode:** `0x10` (Parameter Change / Confirmation)
- **Estrutura (14 bytes):**
  ```text
  F0 43 10 3E 0D 21 [ELEMENT] [CHANNEL] [B0 B1 B2 B3] F7
  ```
- **Payload (`B0 B1 B2 B3`):** Valor codificado em 4 bytes 7-bit representando o nível de dB ou atenuação em tempo real.

---

## 3. Mapeamento de Elementos e Sub-Canais

### 3.1. Elemento `0x00`: Selected Channel (Canal Selecionado)

Quando a tela de edição detalhada de um canal (Selected Channel) está ativa no aplicativo ou Studio Manager, a requisição utiliza o `Element 0x00` (`0D 21 00`):

| Sub-canal (`CHANNEL`) | Tipo de Meter | Descrição / Localização Visual no Print |
|---|---|---|
| `0x00` | **Fader Level Meter** | Barra principal de nível do canal ao lado do Fader de volume (`-∞` a `+10`) |
| `0x02` | **Gate Level Meter** | Barra de nível de sinal de saída do Gate (`OVER 0 -3 ...`) |
| `0x03` | **Gate GR Meter** | **Gain Reduction do Gate** (Atuação da atenuação do Gate, `0` a `-18dB`) |
| `0x04` | **Comp Level Meter** | Barra de nível de sinal de saída do Compressor (`OUT`) |
| `0x05` | **Comp GR Meter** | **Gain Reduction do Compressor** (Atuação da compressão, `0` a `-18dB`) |

> [!IMPORTANT]
> **Adaptação Dinâmica do Selected Channel:**
> - Em **Canais de Entrada (CH1-CH32)**: O Gate está presente, gerando 5 requisições no `Element 0x00` (`0x00`, `0x02`, `0x03`, `0x04`, `0x05`).
> - Em **Canais Master (STEREO-L / STEREO-R)**: O Gate **não existe** (a caixa do Gate fica vazia). O Studio Manager interrompe as requisições de Gate (`0x02` e `0x03`), mantendo apenas os 2 meters do Compressor (`0x00` e `0x05`) e adicionando 3 requisições do **Elemento `0x04`** (Stereo Bus Output).

### 3.2. Elemento `0x04`: Stereo Master Bus Output Meters

Quando o canal selecionado é o Master Stereo (`STEREO-L` / `STEREO-R`), o Studio Manager faz o polling do `Element 0x04` (`0D 21 04`) solicitando pontos de leitura do barramento Master estéreo. Os sub-canais representam os **canais L e R do barramento Master**, e não pontos de medição Pre/Post:

| Sub-canal (`PARAM`) | Tipo de Meter | Descrição / Canal Lido |
|---|---|---|
| `0x00` | **Master L Level** | Leitura do canal **Left** do barramento Stereo Master |
| `0x02` | **Master R Level** | Leitura do canal **Right** do barramento Stereo Master |
| `0x03` | **Master Peak / Balance** | Leitura de pico/atuação do controle de Balance (`BAL L-R`) |

> [!NOTE]
> Mesmo que a tela do Selected Channel exiba visualmente apenas 1 barra vertical de fader, o firmware da 01V96 e o Studio Manager monitoram simultaneamente o sinal de **L (`0x00`)**, **R (`0x02`)** e **Pico/Balance (`0x03`)** para atualizar dinamicamente indicadores de clipping, LEDs de pré/pós e o medidor visual do fader.

> [!IMPORTANT]
> **Requisito de UI Desktop — Seletor Alternável PRE / POST no Canal Master:**
> O chaveamento **PRE / POST** dos medidores do Master **NÃO** é feito via troca de sub-param do Element 0x04. O ponto de leitura (Pre/Post) é controlado de forma **global** por uma chave SysEx independente (ver Seção 5.2, Alvo `0x01` — Saídas). O Element 0x04 sempre lê o ponto atualmente configurado nessa chave global para os canais L e R:
> - **Ao selecionar [PRE]:** A chave global é comutada para Pre-Fader. As requisições dos sub-params `0x00` (L) e `0x02` (R) passam a refletir o nível **antes** do fader.
> - **Ao selecionar [POST]:** A chave global é comutada para Post-Fader. As requisições dos mesmos sub-params passam a refletir o nível **após** o fader.

---

## 5. Configurações Globais de Posição de Medição (Global Meter Position Setup)

Engenharia reversa das mensagens SysEx enviadas e recebidas ao alterar os pontos globais de captação dos medidores de sinal (Pre-EQ, Pre-Fader, Post-Fader) nas telas de Setup da mesa Yamaha 01V96.

### 5.1. Estrutura das Mensagens SysEx de Meter Position
- **Formato:** `F0 43 10 3E 0D 03 0C [TARGET] 00 00 00 00 [VALUE] F7`
- **Seção / Grupo / Elemento:** `Section 0x0D` / `Group 0x03` / `Element 0x0C`

### 5.2. Mapeamento de Alvos (`TARGET`) e Posições (`VALUE`)

#### Alvo 1: Canais de Entrada (CH1-32 e Stereo Inputs) — `TARGET = 0x00`
| Posição do Medidor | Valor Hex (`VALUE`) | SysEx Capturado |
|---|---|---|
| **Pre-EQ** | `0x00` | `F0 43 10 3E 0D 03 0C 00 00 00 00 00 00 F7` |
| **Pre-Fader** | `0x01` | `F0 43 10 3E 0D 03 0C 00 00 00 00 00 01 F7` |
| **Post-Fader** | `0x02` | `F0 43 10 3E 0D 03 0C 00 00 00 00 00 02 F7` |

#### Alvo 2: Saídas (BUS 1-8, AUX 1-8 e STEREO MASTER) — `TARGET = 0x01`
| Posição do Medidor | Valor Hex (`VALUE`) | SysEx Capturado |
|---|---|---|
| **Pre-EQ** | `0x00` | `F0 43 10 3E 0D 03 0C 01 00 00 00 00 00 F7` |
| **Pre-Fader** | `0x01` | `F0 43 10 3E 0D 03 0C 01 00 00 00 00 01 F7` |
| **Post-Fader** | `0x02` | `F0 43 10 3E 0D 03 0C 01 00 00 00 00 02 F7` |

> [!NOTE]
> Ao contrário do chaveamento individual por canal, a Yamaha 01V96 gerencia o ponto de leitura de sinal da régua de LEDs de forma global para todos os canais de entrada (`TARGET 0x00`) e para todas as saídas (`TARGET 0x01`).


