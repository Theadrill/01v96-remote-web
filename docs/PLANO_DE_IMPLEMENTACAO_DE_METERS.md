# Plano de Implementação de Meters (Níveis de Sinal e Gain Reduction) — Yamaha 01V96

Este documento descreve a arquitetura de engenharia reversa, protocolo MIDI SysEx, mapeamento de elementos e a estratégia de implementação prioritária para os medidores de nível de áudio (Level Meters) e atenuamento de compressão/gate (Gain Reduction Meters) dos canais da mesa (exceto máquinas de efeitos).

---

## 1. FASE 1 (PRIORITÁRIA): Painel de Controle de Medidores no Modo Desktop

Esta é a **primeira tarefa** de implementação visual de controle de medidores. O objetivo é integrar o bloco de seletores no painel Desktop, permitindo alternar a captação de sinal dos medidores tanto do **MASTER** quanto dos **CANAIS** usando os comandos SysEx globais descobertos.

> [!IMPORTANT]
> **RESTRICAO DE ESCOPO DE LAYOUT:**
> Este bloco de seletores será implementado **SOMENTE no modo Desktop**. No modo Mobile, estas opções serão tratadas futuramente em um modal à parte (não fazer nenhuma implementação para mobile nesta etapa).

### 1.1. Estrutura Visual do Bloco (Modo Desktop)

No painel do Master no layout Desktop, teremos um bloco compacto de **indicadores de posição atual dos medidores**:

```text
MEDIDORES

MASTER:
[ PRE ]    <-- Botão indicador refletindo a posição do Master (PRE / POST / PRE EQ)

CANAIS:
[ PRE ]    <-- Botão indicador refletindo a posição dos Canais (PRE / POST / PRE EQ)
```

> [!NOTE]
> **Comportamento dos Botões Indicadores:**
> Cada botão exibe o rótulo da posição atual sincronizada com a mesa (`PRE`, `POST` ou `PRE EQ`). Ao clicar no botão, ele servirá no futuro para abrir um modal de configuração global de medidores (o modal não será construído nesta etapa).

### 1.2. Mapeamento de Ações e SysEx Correspondente

#### 1. Sincronização Inicial (`0x30 Read Request`)
Ao conectar à mesa, o backend enviará estritamente os dois comandos essenciais de leitura:
- **Inputs (Canais)**: `F0 43 30 3E 0D 03 0C 00 00 F7`
- **Outputs (Master)**: `F0 43 30 3E 0D 03 0C 01 00 F7`

#### 2. Atualizações em Tempo Real (Mesa -> Servidor -> Frontend)
Ao alterar a posição diretamente na mesa física, a mesa transmitirá:
- `F0 43 10 3E 0D 03 0C [TARGET] 00 00 00 00 [VALUE] F7`
  - `TARGET = 00` (Inputs) / `TARGET = 01` (Outputs)
  - `VALUE = 00` (Pre-EQ) / `01` (Pre-Fader) / `02` (Post-Fader)

### 1.3. Passo a Passo da Implementação Técnica

#### Passo 1: Frontend (`public/modules/channel_strip.js` e `socket.js`)
1. **Renderização dos Indicadores no Fader Master (Desktop):**
   - Renderizar o bloco **MEDIDORES** no Master com os botões indicadores `MASTER:` e `CANAIS:`.
   - Atualizar dinamicamente o texto/rótulo dos botões (`PRE EQ`, `PRE`, `POST`) de acordo com o estado recebido.
   - Logar no `console.log` do navegador os valores recebidos no sync inicial e nas alterações em tempo real.

#### Passo 2: Backend Rust (`server_rust/src/...`) [APÓS APROVAÇÃO DO FRONT]
1. **Sync Inicial Mínimo e Seguro:**
   - Adicionar estritamente as requisições `0x30` de `0D 03 0C 00` e `0D 03 0C 01` na sequência de inicialização, sem alterar a estrutura existente.
   - Armazenar no state local e retransmitir via WebSocket para o frontend.

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

A 01V96 organiza o polling de medidores (`0D 21`) por **Elemento SysEx** de acordo com a família do barramento selecionado (Selected Channel):

| Elemento SysEx | Família de Barramentos | Sub-canal `0x00` | Sub-canal `0x02` | Sub-canal `0x03` (Comp GR) | Sub-canal `0x04` | Sub-canal `0x05` (Gate GR) |
|:---:|:---|:---|:---|:---:|:---|:---:|
| **`0x00`** | **Inputs (CH1-32)** | Fader Level Meter | Gate Level Out | **Comp GR Meter** | Comp Level Out | **Gate GR Meter** |
| **`0x01`** | **BUS (BUS 1-8)** | Bus Level Meter L | Bus Level Meter R/Sub | **Comp GR Meter** | Bus Level Out | *(Sem Gate)* |
| **`0x02`** | **AUX (AUX 1-8)** | Aux Level Meter L | Aux Level Meter R/Sub | **Comp GR Meter** | Aux Level Out | *(Sem Gate)* |
| **`0x04`** | **Master Stereo** | Master L Level | Master R Level | **Comp GR Meter** | Master Level Out | *(Sem Gate)* |

### 3.1. Elemento `0x00`: Inputs (Canais 1-32)

Quando a tela de edição detalhada de um canal de entrada (CH1-32) está ativa:

| Sub-canal (`PARAM`) | Tipo de Meter | Descrição / Localização Visual |
|---|---|---|
| `0x00` | **Fader Level Meter** | Barra principal de nível do canal ao lado do Fader (`-∞` a `+10`) |
| `0x02` | **Gate Level Meter** | Barra de nível de sinal de saída do Gate |
| `0x03` | **Comp GR Meter** | **Gain Reduction do Compressor** (`0` a `-18dB`) |
| `0x04` | **Comp Level Meter** | Barra de nível de sinal de saída do Compressor (`OUT`) |
| `0x05` | **Gate GR Meter** | **Gain Reduction do Gate** (`0` a `-18dB`) |

### 3.2. Elemento `0x01`: BUS (BUS 1 ao 8)

Quando o canal selecionado é um Barramento BUS (BUS 1-8):

| Sub-canal (`PARAM`) | Tipo de Meter | Descrição / Canal Lido |
|---|---|---|
| `0x00` | **BUS Level L** | Leitura principal de nível de saída do BUS |
| `0x02` | **BUS Level R/Sub** | Leitura estéreo / sub do BUS |
| `0x03` | **BUS Comp GR Meter** | **Gain Reduction do Compressor do BUS** (`0` a `-18dB`) |

### 3.3. Elemento `0x02`: AUX (AUX 1 ao 8)

Quando o canal selecionado é uma Saída Auxiliar (AUX 1-8):

| Sub-canal (`PARAM`) | Tipo de Meter | Descrição / Canal Lido |
|---|---|---|
| `0x00` | **AUX Level L** | Leitura principal de nível de saída do AUX |
| `0x02` | **AUX Level R/Sub** | Leitura estéreo / sub do AUX |
| `0x03` | **AUX Comp GR Meter** | **Gain Reduction do Compressor do AUX** (`0` a `-18dB`) |

### 3.4. Elemento `0x04`: Stereo Master Bus Output & Comp GR Meters

Quando o canal selecionado é o Master Stereo (`STEREO-L` / `STEREO-R`):

| Sub-canal (`PARAM`) | Tipo de Meter | Descrição / Canal Lido |
|---|---|---|
| `0x00` | **Master L Level** | Leitura do canal **Left** do barramento Stereo Master |
| `0x02` | **Master R Level** | Leitura do canal **Right** do barramento Stereo Master |
| `0x03` | **Master Comp GR** | **Gain Reduction do Compressor do Master** (`0` a `-18dB`) |

> [!IMPORTANT]
> **Padronização Universal do Comp GR:**
> O **Compressor Gain Reduction** opera impreterivelmente no **`Sub-canal 0x03`** em todas as 4 famílias de barramentos da 01V96. Apenas o **Elemento SysEx** altera (`0x00` para CH, `0x01` para BUS, `0x02` para AUX e `0x04` para Master).

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

---

## 6. Descobertas de Engenharia Reversa — Sync de Posição dos Medidores (0x30 Read & 0x10 Write)

### 6.1. Protocolo Confirmado em Mesa Física (100% Validado)
Após testes em tempo real na mesa Yamaha 01V96, foi confirmado que o registrador **`0D 03 0C`** funciona perfeitamente para **tanto LEITURA (`0x30`) quanto ESCRITA (`0x10`)** em ambos os alvos:

| Alvo | Operação | Opcode | SysEx |
|:---|:---|:---|:---|
| **INPUTS (Canais 1-32 / StIn)** | **Leitura** | `0x30` | `F0 43 30 3E 0D 03 0C 00 00 F7` |
| **INPUTS (Canais 1-32 / StIn)** | **Escrita** | `0x10` | `F0 43 10 3E 0D 03 0C 00 00 00 00 00 [VAL] F7` |
| **OUTPUTS (Master L/R, Bus, Aux)** | **Leitura** | `0x30` | `F0 43 30 3E 0D 03 0C 01 00 F7` |
| **OUTPUTS (Master L/R, Bus, Aux)** | **Escrita** | `0x10` | `F0 43 10 3E 0D 03 0C 01 00 00 00 00 [VAL] F7` |

### 6.2. Parsing da Resposta de Leitura (`0x30`)
```text
F0 43 10 3E 0D 03 0C [TARGET] 00 00 00 00 [VALUE] F7
                     ↑                    ↑
                  Byte 7:              Byte 12:
               00 = INPUTS          00 = Pre-EQ
               01 = OUTPUTS         01 = Pre-Fader
                                    02 = Post-Fader
```

### 6.3. Conclusão Final de Implementação
- ✅ **INPUTS position (`param=0x00`)**: Lê via `0x30` e escreve via `0x10` (`0D 03 0C 00`).
- ✅ **OUTPUTS position (`param=0x01`)**: Lê via `0x30` entre todos os alvos e escreve via `0x10` (`0D 03 0C 01`).
- 🔧 **Sincronização Inicial**: No boot/conexão do app Rust, enviar os dois comandos `0x30` acima para descobrir o estado real atual da mesa física.

---

## 7. Status da Implementação (Concluído e Testado em Mesa Física)

### 7.1. Backend Rust (`server_rust`)
- **`sync_manager.rs`**: Integradas as requisições `0x30` (`0D 03 0C 00` e `0D 03 0C 01`) na rotina cirúrgica do `initial_sync` sem causar nenhum efeito colateral nos demais parâmetros.
- **`protocol.rs`**: Criada a variante `ParsedMidi::GlobalMeterPosition { target, mode }` e o parser correspondente para interceptar SysEx do registrador `0D 03 0C`.
- **`state.rs`**: Adicionados os campos `global_meter_pos_master` e `global_meter_pos_channels` ao `GlobalState`.
- **`midi_receiver.rs`**: Emissão em tempo real do evento WebSocket `globalMeterPositionUpdated` para todos os clientes conectados ao receber alterações físicas na mesa.

### 7.2. Frontend Web (`public/modules/channel_strip.js` e `style.css`)
- **Visual Desktop (Master Card)**: Implementados botões indicadores para `MASTER:` e `CANAIS:` com largura retangular alinhada de `35px` para os rótulos e `38px` para os botões.
- **Exibição Dinâmica**: Rótulos `PREEQ`, `PRE` e `POST` mapeados diretamente do estado sincronizado e preservados na memória global JS (`window.currentMeterPosMasterLabel` e `window.currentMeterPosChannelsLabel`).
- **Placeholder de Modal**: Criada a função `openMeterConfigModal(target)` pronta para acionar o futuro modal de configuração de medidores.
