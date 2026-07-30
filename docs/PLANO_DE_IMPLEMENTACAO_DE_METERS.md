# Plano de Implementação de Meters (Níveis de Sinal e Gain Reduction) — Yamaha 01V96

Este documento descreve a arquitetura de engenharia reversa, protocolo MIDI SysEx, mapeamento de elementos e a estratégia de implementação prioritária para os medidores de nível de áudio (Level Meters) e atenuamento de compressão/gate (Gain Reduction Meters) dos canais da mesa (exceto máquinas de efeitos).

---

## 1. FASE 1 (PRIORITÁRIA): Meters do Canal Master Desktop (Seletor PRE / POST)

Esta é a **primeira tarefa** de implementação de meters no projeto. O objetivo é integrar os botões de alternância `[PRE]` / `[POST]` no Master do layout Desktop, com calibração cirúrgica da régua de LEDs baseada na tabela `steps.json`.

### 1.1. Passo a Passo da Implementação Técnica

#### Passo 1: Servidor Rust (`server_rust/src/midi/master_meter.rs` e `socket_handlers.rs`)
1. **Adicionar Parâmetro de Modo no `MasterMeter`:**
   - Adicionar o estado do modo (`MeterMode::PreFader` vs `MeterMode::PostFader`) na estrutura `MasterMeter`.
   - `MeterMode::PreFader`: Constrói a requisição apontando para o sub-parâmetro `0x00` (`Pre-Fader`).
   - `MeterMode::PostFader`: Constrói a requisição apontando para o sub-parâmetro `0x02` (`Post-Fader`).
2. **Integração Estrita com `steps.json`:**
   - Garantir que o valor bruto recebido da mesa (0 a 32 steps) seja processado obrigatoriamente por `MasterMeter::convert_value(&self.steps)`.
   - **Proibido utilizar interpolação linear genérica**. A conversão deve respeitar rigorosamente a curva logarítmica/não-linear da Yamaha.
3. **Handler de Socket.IO (`setMasterMeterMode`):**
   - Criar evento WebSocket `setMasterMeterMode { mode: "pre" | "post" }` para alterar o modo em tempo real sem desconectar a sessão MIDI.

#### Passo 2: Componentes do Frontend (Layout Desktop Master)
1. **Adicionar Seletor Visual PRE / POST:**
   - No contêiner visual do Fader Master no modo Desktop, inserir dois botões de chaveamento estilo pill: **`[PRE]`** e **`[POST]`**.
   - O botão ativo deve ter destaque visual (borda iluminada/cor ativa).
2. **Emissão de Evento e Estado Local:**
   - Ao clicar em `[PRE]`, emitir `socket.emit('setMasterMeterMode', { mode: 'pre' })`.
   - Ao clicar em `[POST]`, emitir `socket.emit('setMasterMeterMode', { mode: 'post' })`.
3. **Mapeamento Cirúrgico da Régua de LEDs (`-∞` a `+10dB`):**
   - Vincular os passos retornados pela tabela `steps.json` diretamente à altura da barra de LEDs SVG/CSS.
   - Garantir que a marcação de `0dB` na régua impressa na tela acenda no exato momento em que o hardware da mesa acusar `0dB`.

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

Quando o canal selecionado é o Master Stereo (`STEREO-L` / `STEREO-R`), o Studio Manager faz o polling do `Element 0x04` (`0D 21 04`) solicitando 3 pontos de leitura do fluxo de sinal do barramento Master:

| Sub-canal (`CHANNEL`) | Tipo de Meter | Descrição / Ponto de Leitura no Fluxo de Sinal |
|---|---|---|
| `0x00` | **Master Pre-Fader** | Leitura do sinal do Master antes do Fader (Pre-Fader Level) |
| `0x02` | **Master Post-Fader** | Leitura do sinal do Master após o Fader (Post-Fader Level, exibido ao lado do Fader) |
| `0x03` | **Master Peak / Balance** | Leitura de pico/atuação do controle de Balance (`BAL L-R`) |

> [!NOTE]
> Mesmo que a tela do Selected Channel exiba visualmente apenas 1 barra vertical de fader, o firmware da 01V96 e o Studio Manager monitoram simultaneamente o sinal **Pre-Fader (`0x00`)**, **Post-Fader (`0x02`)** e **Pico (`0x03`)** para atualizar dinamicamente indicadores de clipping, LEDs de pré/pós e o medidor visual do fader.

> [!IMPORTANT]
> **Requisito de UI Desktop — Seletor Alternável PRE / POST no Canal Master:**
> No modo Desktop da interface web, o Canal Master possuirá botões visuais de alternância **[PRE]** e **[POST]**:
> - **Ao selecionar [PRE]:** O aplicativo chaveia as requisições de medição para o sub-parâmetro **Pre-Fader (`0x00`)**, exibindo o nível de entrada bruto independente da posição do fader.
> - **Ao selecionar [POST]:** O aplicativo chaveia as requisições para o sub-parâmetro **Post-Fader (`0x02`)**, refletindo visualmente a posição do fader de volume em tempo real.

---

## 4. Calibração de Escala Visual via Tabela de Steps (`steps.json`)

Para que os níveis de dB lidos via SysEx reflitam com precisão cirúrgica a régua graduada do fader (`-∞`, `-50`, `-40`, `-30`, `-20`, `-15`, `-10`, `-5`, `0`, `+5`, `+10dB`):

1. **Tabela de Referência Calibrada (`steps.json` / `MasterMeter`):**
   - Os valores brutos lidos da mesa (0 a 32 steps de LED) **NÃO** devem ser renderizados usando interpolação linear genérica.
   - Devem obrigatoriamente ser passados pela tabela de lookup `steps.json` já integrada no servidor Rust (`MasterMeter::convert_value`), mapeando a curva não-linear real da Yamaha 01V96.
2. **Paridade 1:1 entre Hardware e Web:**
   - Garante que quando o LED da mesa acender no indicador de `0dB`, o LED correspondente na interface web acenda exatamente sobre a marca de `0dB` da régua visual.

