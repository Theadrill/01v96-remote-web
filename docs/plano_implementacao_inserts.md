# Plano de Implementação de Inserts — Yamaha 01V96 Remote Web

Este plano detalha o mapeamento MIDI/SysEx dos parâmetros de **Insert** (On/Off, Posição e Roteamento de Entrada/Saída) obtidos por engenharia reversa e estabelece o guia passo a passo para a implementação visual e lógica no aplicativo.

---

## 1. Mapeamento de Parâmetros (Protocolo SysEx)

Todas as mensagens abaixo seguem o formato de **Parameter Change** da Yamaha 01V96:
`F0 43 10 3E [Endereço] [Canal] [Valor] F7`

### 1.1. Insert On/Off (`kInputInsert/kInsertOn`)
*   **Endereço**: `7F 01 19 00` (decimal: `127, 1, 25, 0`)
*   **Canal**: `00` a `1F` (Canais 1 a 32, 0-indexed)
*   **Valores**:
    *   `00 00 00 00` = **OFF**
    *   `00 00 00 01` = **ON**

### 1.2. Posição do Insert (`kInputInsert/kInsertLocInsert`)
*   **Endereço**: `7F 01 19 02` (decimal: `127, 1, 25, 2`)
*   **Canal**: `00` a `1F` (Canais 1 a 32, 0-indexed)
*   **Valores**:
    *   `00 00 00 00` = **Pre EQ**
    *   `00 00 00 01` = **Pre Fader**
    *   `00 00 00 02` = **Post Fader**

### 1.3. Retorno do Insert (Insert IN Patch)
*   **Endereço Base**: `0D 02 02 00` (decimal: `13, 2, 2, 0`)
*   **SysEx Format**: `F0 43 10 3E 0D 02 02 00 {chIdx} {V3} {V2} {V1} {V0} F7` (Valor de 28 bits)
*   **Valores Base**:
    *   `1` a `16` = **AD 1** a **AD 16**
    *   `25` a `40` = **Slot 1-1** a **Slot 1-16**
    *   `41` a `48` = **ADAT 1** a **ADAT 8**
    *   `121` a `122` = **FX 1-1 / FX 1-2**
    *   `129` a `130` = **FX 2-1 / FX 2-2**
    *   `137` a `138` = **FX 3-1 / FX 3-2**
    *   `145` a `146` = **FX 4-1 / FX 4-2**

### 1.4. Saída do Insert (Insert OUT Patch)
A saída (Send) é dividida em múltiplos elementos na mesa física. Cada patch envia um SysEx raw contendo o índice destino ({Valor}):
*   **SysEx Format**: `F0 43 10 3E 0D 02 {Elemento} {Param_MSB} {Param_LSB} 00 00 00 {Valor} F7`
    *   **OMNI 1-4**: Elemento `0x06`, MSB `0x00`, LSB `0..3`.
    *   **ADAT 1-8**: Elemento `0x05`, MSB `0..7`, LSB `0x01`.
    *   **SLOT 1-16**: Elemento `0x05`, MSB `0..15`, LSB `0x00`.
    *   **FX 1-4 (L/R)**: Elemento `0x03`, MSB `0x00`, LSB com mapeamento `0, 1` (FX1), `2, 3` (FX2)...
    *   **2TR D OUT L/R**: Elemento `0x0C`, MSB `0x00`, LSB `0..1`.
    *   **NONE**: Manda um SysEx com `{Valor} = 0` para o Elemento onde o Insert estava anteriormente.

---

## 2. Passo a Passo da Implementação UI / UX

### Passo 2.1: Inserir o Botão de INSERTS na Tela do Canal (etc)
Na seção lateral ou área de configurações avançadas do canal selecionado:
1.  Localizar a seção "ENVIAR PARA BUS".
2.  Abaixo dela (antes da seção "SAÍDA MASTER"), adicionar um novo bloco/card chamado **INSERTS**.
3.  Estilizar o botão de entrada com um visual premium do app (borda arredondada, fundo cinza escuro translúcido e texto principal centralizado).
4.  Exibir no próprio botão um resumo do estado atual (ex: `INSERT: ON | OUT: FX1-1 | IN: S1-16`).

```
┌──────────────────────────────────────────┐
│              ENVIAR PARA BUS             │
│   [ BUS 1 ]   [ BUS 2 ]   ...            │
├──────────────────────────────────────────┤
│                 INSERTS                  │
│       [ CONFIGURAR INSERTS (ON) ]        │ <── Novo botão aqui
├──────────────────────────────────────────┤
│               SAÍDA MASTER               │
│               [ STEREO L/R ]             │
└──────────────────────────────────────────┘
```

### Passo 2.2: Implementar o Modal Principal de Configuração (Estilo Studio Manager)
Ao clicar no botão "CONFIGURAR INSERTS", deve ser aberto o modal principal. Este modal replicará as seções da mesa física, mas utilizando a identidade visual moderna do app:
1.  **Header**: Nome do canal atual (ex: "CONFIGURAÇÃO DE INSERT - CANAL 1").
2.  **Seção INSERT (Switch)**: Um botão de toggle/switch estilizado para ligar/desligar o insert (`kInsertOn`).
3.  **Grid de Botões**:
    *   **Botão OUT**: Mostra o patch de saída atual (ex: `OMNI 1` ou `NONE`). Ao clicar, abre o *Modal OUT*.
    *   **Botão IN**: Mostra o patch de entrada atual (ex: `AD 2`). Ao clicar, abre o *Modal IN*.
    *   **Botão POSITION**: Mostra a posição atual (ex: `Pre EQ`). Ao clicar, abre o *Modal POSITION*.
4.  **Botão FECHAR**: Para salvar temporariamente ou fechar o modal.

```
┌──────────────────────────────────────────┐
│        CONFIGURAÇÃO DE INSERT - CH 1     │
├──────────────────────────────────────────┤
│  INSERT:   [   ON / OFF (Toggle)   ]     │
│                                          │
│  [ OUT: OMNI 1 ]  [ IN: AD 2 ]           │
│                                          │
│  [ POSITION: Pre EQ ]                    │
├──────────────────────────────────────────┤
│                 [ FECHAR ]               │
└──────────────────────────────────────────┘
```

### Passo 2.3: Implementar os Modais de Patch (Submodais)
Ao clicar em qualquer um dos três botões do modal principal, abre-se um submodal específico.

#### A. Modal OUT (Definição de Saída)
Replicará o layout do modal de patches com as seguintes colunas de botões:
*   **NONE**: Botão para desativar (`value = 0`).
*   **OMNI**: OMNI 1 a OMNI 4.
*   **ADAT**: ADAT 1 a ADAT 8.
*   **EFFECTS/FX**: FX1-1, FX1-2, FX2-1, FX2-2, FX3-1, FX3-2, FX4-1, FX4-2.

#### B. Modal IN (Definição de Retorno)
Apresentará a lista completa mapeada sob o elemento `02`, organizada por colunas:
*   **MIXER / ANALOG**: AD 1 a AD 16.
*   **SLOT (S1)**: S1-1 a S1-16.
*   **ADAT (ÓPTICO)**: ADT 1 a ADT 8.
*   **EFFECTS / FX**: FX1-1 a FX4-2 (respeitando o espaçamento do hardware).
*   **DIGITAL / 2TD**: 2TD-L, 2TD-R.

#### C. Modal POSITION (Definição de Posição)
Um modal simples com 3 opções listadas na vertical para fácil toque:
*   `Pre EQ` (valor `00`)
*   `Pre Fader` (valor `01`)
*   `Post Fader` (valor `02`)

---

## 3. Fluxo de Comunicação e Sincronização

1.  **Envio ao Hardware (Client → Server → Mixer)**:
    *   Ao alternar o insert ou mudar um patch no UI, o client envia um comando via WebSocket com o formato estruturado (ex: `type: "kInputInsert/kInsertOn"`, `channel: 0`, `value: 1`).
    *   O backend em Rust monta o SysEx correspondente (usando o endereço respectivo do dicionário ou lógica de patch) e escreve na porta MIDI física.
2.  **Recebimento do Hardware (Mixer → Server → Client)**:
    *   O parser do Rust (`protocol.rs`) captura as mensagens que começam com `0D 02` (Patches) ou `7F 01 19` (Configurações de Insert).
    *   Converte os valores de volta para os tipos lógicos e envia o broadcast aos clientes para atualizar o estado do modal em tempo real.
