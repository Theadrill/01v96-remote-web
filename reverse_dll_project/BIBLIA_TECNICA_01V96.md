# 📖 BÍBLIA TÉCNICA — Yamaha 01V96 Studio Manager Protocol
> Engenharia Reversa das DLLs `01V96.dll` e `SM2DLL.dll`  
> Gerado em: 2026-04-13 | Passes: 1 ao 7 | Status: **Completo**

---

# ÍNDICE

1. [Arquitetura do Sistema](#1-arquitetura-do-sistema)
2. [Sistema de Propriedades — O Property Map](#2-sistema-de-propriedades--o-property-map)
3. [Grupos de Parâmetros (Tabela GG)](#3-grupos-de-parâmetros-tabela-gg)
4. [Canal de Input — Estrutura Completa (87 params)](#4-canal-de-input--estrutura-completa-87-params)
5. [Descritores FE — Endereçamento Hierárquico](#5-descritores-fe--endereçamento-hierárquico)
6. [SysEx — Montagem de Pacotes](#6-sysex--montagem-de-pacotes)
7. [Cenas — Scene Management](#7-cenas--scene-management)
8. [Meters — VU, Peak, GR](#8-meters--vu-peak-gr)
9. [Dynamics — Gate e Compressor](#9-dynamics--gate-e-compressor)
10. [EQ — Equalização](#10-eq--equalização)
11. [Efeitos — DSP Algorithms](#11-efeitos--dsp-algorithms)
12. [Sincronização Real-Time](#12-sincronização-real-time)
13. [Implementação Node.js — Código de Referência](#13-implementação-nodejs--código-de-referência)
14. [Arquivos de Dados (JSONs)](#14-arquivos-de-dados-jsons)

---

## 1. ARQUITETURA DO SISTEMA

### 1.1 As Duas DLLs e seus Papéis

| DLL | Papel | Tamanho |
|---|---|---|
| `01V96.dll` | **Data Engine** — Schema de parâmetros, Estado, Lógica de protocolo | 3,39 MB |
| `SM2DLL.dll` | **Transport Engine** — Gerenciamento de portas MIDI, Sincronização, Bulk Dump | 507 KB |

**Tecnologia**: 32-bit PE32, Qt Framework, Visual C++ 8.0, COM (Component Object Model)

### 1.2 Diagrama de Comunicação

```
Studio Manager UI (Qt Widgets)
         │
         ▼
     SM2DLL.dll  ←── Gerencia: portas MIDI, timers, threads, bulk,  sync
         │
         ▼
     01V96.dll   ←── Gerencia: parâmetros, buffers de estado, codificação SysEx
         │
         ▼
 TMIDIPortAccessor  (driver MIDI)
         │
         ▼
     Mesa 01V96  (hardware físico)
```

### 1.3 Interface COM (não chamadas diretas)

Ambas as DLLs exportam apenas **4 funções padrão COM**:
```
DllCanUnloadNow
DllGetClassObject  ← Ponto de entrada real para criar objetos
DllRegisterServer
DllUnregisterServer
```

> O SM acessa internamente via `DllGetClassObject(CLSID, IID, ppv)`. Tudo passa pela interface `IUnknown`. Não é possível chamar funções diretamente.

### 1.4 Registro Windows
```
HKEY_LOCAL_MACHINE\Software\Yamaha\SM2\Plugins
```
Aqui o Studio Manager registra os plugins (como `01V96.dll`) que deve carregar.

### 1.5 Classes Internas Principais

| Classe | DLL | Papel |
|---|---|---|
| `CSceneMemory` | 01V96.dll | Gerenciador de memória de cenas (dual-buffer) |
| `TBulkTaskThread` | 01V96.dll | Thread dedicada para bulk transfers |
| `TSceneMemoryAccessor` | 01V96.dll | Acesso controlado à memória de cena |
| `TSimpleSyncThread` | 01V96.dll | Thread de sincronização simples |
| `synchronization` | SM2DLL.dll | Classe principal de orquestração de sync |
| `CMeter` | 01V96.dll | Widget de meter (UI) |
| `CMeterObserverElement` | 01V96.dll | Recebe dados raw de meter do hardware |
| `TMeterObserverProxy` | 01V96.dll | Proxy entre data engine e CMeter |
| `CThresholdMeter` | 01V96.dll | Meter com indicador de threshold |
| `CCompCurve` | 01V96.dll | Renderização da curva de compressor |
| `TBulkTaskThread` | 01V96.dll | Thread de bulk dump em background |

---

## 2. SISTEMA DE PROPRIEDADES — O PROPERTY MAP

### 2.1 Anatomia de um ID de Propriedade

```
ID Hex: 0xIIGG  ou  0xIIII00GG

  GG   = Código do Grupo (1 byte, byte baixo)
  IIII = Índice dentro do grupo (bytes altos)
```

**Exemplos reais:**

| Nome | ID Hex | Grupo GG | Índice |
|---|---|---|---|
| `kGateOn` | `ffffffff` | — | Raiz de grupo |
| `kGateLink` | `1d` | `0x1d` = Gate | 0 |
| `kGateKeyIn` | `1001d` | `0x1d` = Gate | 1 |
| `kGateThreshold` | `9001d` | `0x1d` = Gate | 9 |
| `kCompOn` | `1e` | `0x1e` = Comp | 0 |
| `kCompAttack` | `3001e` | `0x1e` = Comp | 3 |
| `kCompThreshold` | `8001e` | `0x1e` = Comp | 8 |
| `kEQLowQ` | `1f` | `0x1f` = EQ | 0 |
| `kEQHiG` | `c001f` | `0x1f` = EQ | 12 |
| `kRoutingBus1` | `20021` | `0x21` = Routing | 2 |

> **IDs `ffffffff`**: São propriedades "Raiz" que apontam para o início de um grupo. Não são enviadas diretamente via SysEx — servem como âncora para o array que segue.

### 2.2 Estatísticas do Mapeamento

| Categoria | Count |
|---|---|
| REMOTE | 222 |
| NAME | 216 |
| HUI (Mackie Control) | 205 |
| AUX | 147 |
| CHANNEL/FADER | ~100 |
| BUS | ~60 |
| EQ | ~50 |
| SCENE | ~45 |
| COMP | ~30 |
| GATE | ~30 |
| EFFECT | ~85 |
| PATCH | ~40 |
| **Total Mapeado** | **2.676** |

### 2.3 Arquivos de Dados Gerados

| Arquivo | Descrição |
|---|---|
| `01v96_property_map.json` | Mapa bruto de 2.676 propriedades com IDs |
| `categorized_properties.json` | Propriedades agrupadas em 11 categorias |
| `detailed_prop_map.json` | Propriedades com metadados de boundary (min/max) |
| `sync_properties.json` | Apenas propriedades de sincronização/memória |

---

## 3. GRUPOS DE PARÂMETROS (TABELA GG)

| GG Hex | Categoria | Parâmetros Principais |
|---|---|---|
| `0x03` | Módulos (contagem) | `kBusModuleNum`, `kAUXModuleNum`, `kEffectModuleNum`, `kRemoteModuleNum` |
| `0x09` | Memória de Cenas | `kMemSceneNow`, `kMemSceneLast`, `kMemSceneEditFlag`, `kMemSceneUndoStatus` |
| `0x0a` | Memória Input Patch | `kMemInPatchNow`, `kMemInPatchLast`, `kMemInPatchEditFlag` |
| `0x0b` | Memória Output Patch + MeterSetup | `kMemOutPatchNow`, `kMeterSetupModeMaster`, `kMeterSetupModeInput`, `kMeterSetupPeakHold`, `kMeterSetupFastFall` |
| `0x0c–0x13` | Memória Libraries | CH, EQ, GT, CO, EF, GEQ, B2S, Mon (cada um tem Now/Last/EditFlag/UndoStatus) |
| `0x0e` | Recall Safe | `kRecallSafeMode`, `kRecallSafeIndMode` |
| `0x10` | Pan Mode AUX | `kPanModeAUX0102`..`kPanModeChannel` |
| `0x14` | Grupos de Input | FaderGroups 1-8, MuteGroups 1-8, DynamicsGroups 1-4, EQGroups 1-4 |
| `0x15` | Grupos de Output | FaderGroups 1-4, MuteGroups 1-4, DynamicsGroups 1-4, EQGroups 1-4 |
| `0x1b` | Fade Time | `kFadeTime` |
| `0x1c` | Att | `kAttBitShift` |
| `0x1d` | Gate | `kGateLink`, `kGateKeyIn`, `kGateKeyAUX`, `kGateKeyCh`, `kGateType`, `kGateAttack`, `kGateRange`, `kGateHold`, `kGateDecay`, `kGateThreshold` |
| `0x1e` | Compressor | `kCompOn`, `kCompLink`, `kCompType`, `kCompAttack`, `kCompRelease`, `kCompRatio`, `kCompGain`, `kCompKnee`, `kCompThreshold` |
| `0x1f` | EQ (15 params) | `kEQLowQ`, `kEQLowF`, `kEQLowG`, `kEQHPFOn`, `kEQLowMidQ`, `kEQLowMidF`, `kEQLowMidG`, `kEQHiMidQ`, `kEQHiMidF`, `kEQHiMidG`, `kEQHiQ`, `kEQHiF`, `kEQHiG`, `kEQLPFOn`, `kEQOn` |
| `0x20` | Input Delay | `kInDelayOn`, `kInDelayMix`, `kInDelayFBGain`, `kInDelayTime` |
| `0x21` | Routing | `kRoutingStereo`, `kRoutingPan`, `kRoutingDirect`, `kRoutingBus1`..`kRoutingBus8` |
| `0x24` | Library/BULK Selection | `kBULKLibraryType`, `kSceneSelection`, `kEQLibSelection`, `kGateLibSelection`, `kCompLibSelection` |
| `0x38` | AutoMix Sync | `kAutomixSyncDropSMPTE`, `kAutomixSyncLockMTC`, `kAutomixSyncJumpMTC` |
| `0x41` | Edit Flags | `kEditScene`, `kEditEQLib`, `kEditGateLib`, `kEditCompLib` |
| `0x4d` | Lock Safe | `kLockSafeSceneMemory`, `kLockSafeChFader`, `kLockSafeAuxSelect`, `kLockSafeChOn`, `kLockSafeChSolo`, `kLockSafeLayer`, `kLockSafeSelectedCh` |
| `0x54` | Bulk Transmit | `kTxEnableBulk` (ID: `20054`), `kTxBulkInterval` (ID: `50054`), `kTxEnablePrmChange`, `kTxEnableCtlChange` |
| `0x55` | Bulk Receive | `kRxEnableBulk` (ID: `20055`), `kRxEnablePrmChange` |
| `0x56` | Bulk Omni | `kOmniEnableBulk` |
| `0x57` | Bulk Echo | `kEchoEnableBulk` |
| `0x70` | Gate GR Meters | `kMeterGateOut` (ID: `30070`), `kMeterGateGR` (ID: `40070`) |
| `0x72` | High-Res Meter Out | `kMeterCompOutH` (ID: `10072`), `kMeterGateOutH` (ID: `20072`) |
| `0x73` | Comp GR Meters | `kMeterEQOut` (ID: `73`), `kMeterCompOut` (ID: `10073`), `kMeterCompGR` (ID: `20073`) |
| `0x81` | Effect Meters | `kMeterIn1`..`kMeterIn8`, `kMeterOut1`..`kMeterOut8`, `kMeterGR1`..`kMeterGR8`, `kMeterVU1`..`kMeterVU8` |

---

## 4. CANAL DE INPUT — ESTRUTURA COMPLETA (87 params)

A ordem exata dos parâmetros de um canal de input na memória:

```
kFader           → Nível do fader (0-1023, 10-bit)
kPhase           → Inversão de fase (0/1)
kInsertOn        → Insert habilitado (0/1)
kChannelOn       → Canal ligado/desligado (0/1)
kChannelPan      → Panorâmica (-63..+63)
kAtt             → Atenuador digital
kInDelayOn       → Delay do canal ON (0/1)
kInDelayMix      → Mix do delay         ─┐ Grupo 0x20
kInDelayFBGain   → Feedback do delay     │ idx 0-2
kInDelayTime     → Tempo do delay       ─┘

── GATE (Grupo 0x1d, 9 params) ──
kGateOn          → Gate ON/OFF
kGateLink        → Link estéreo
kGateKeyIn       → Fonte do key (self)
kGateKeyAUX      → Fonte do key (AUX)
kGateKeyCh       → Fonte do key (canal)
kGateType        → GATE / DUCKING / EXPANDER
kGateAttack      → Attack time
kGateRange       → Range de atenuação
kGateHold        → Hold time
kGateDecay       → Decay time
kGateThreshold   → Threshold (muda ponto de ação)

── COMP (Grupo 0x1e, 9 params) ──
kCompOn          → Compressor ON/OFF
kCompLink        → Link estéreo
kCompType        → COMP/LIMITER/COMPANDER(H)/COMPANDER(S)/EXPANDER
kCompAttack      → Attack time
kCompRelease     → Release time
kCompRatio       → Ratio
kCompGain        → Output gain (makeup)
kCompKnee        → Knee (Soft/Hard)
kCompThreshold   → Threshold

── EQ (Grupo 0x1f, 15 params) ──
kEQLowQ, kEQLowF, kEQLowG    → Low shelf/bell: Q, Frequência, Gain
kEQHPFOn                     → High Pass Filter ON/OFF
kEQLowMidQ, kEQLowMidF, kEQLowMidG → Low-Mid: Q, Freq, Gain
kEQHiMidQ, kEQHiMidF, kEQHiMidG   → Hi-Mid: Q, Freq, Gain
kEQHiQ, kEQHiF, kEQHiG       → High shelf/bell: Q, Freq, Gain
kEQLPFOn                     → Low Pass Filter ON/OFF
kEQOn                        → EQ ON/OFF

── ROUTING (Grupo 0x21, 10 params) ──
kRoutingStereo   → Roteado para Stereo Out
kRoutingPan      → Panorâmica de roteamento
kRoutingDirect   → Direct Out
kRoutingBus1     → Bus 1 ON
kRoutingBus2     → Bus 2 ON
...
kRoutingBus8     → Bus 8 ON

── AUX SENDS (Grupo 0x22, 24 params) ──
kAUX1On..kAUX12On       → AUX 1-12 send ON/OFF
kAUX1Level..kAUX12Level → AUX 1-12 send level

── AUX PAN (Grupo 0x23, 6 params) ──
kAUX0102Pan..kAUX1112Pan → Pan dos AUX stereo pairs 1-2, 3-4, 5-6, 7-8, 9-10, 11-12
```

> **Total: ~87 parâmetros por canal de input.**  
> Para 32 canais: **~2.784 parâmetros** só na seção de input.

---

## 5. DESCRITORES FE — ENDEREÇAMENTO HIERÁRQUICO

### 5.1 Formato do Descritor FE

```
FEkModuleName/kParamName;CountHex;FEkNextModule/kParam;CountHex;...
```

Os números hexadecimais definem **quantos canais** cada módulo possui:

| Count Hex | Módulo | Canais |
|---|---|---|
| (default) | Input | 32 |
| `08` | Bus | 8 |
| `0C` | AUX | 12 |
| `08` | Matrix | 8 |
| `02` | Stereo | 2 |
| `04` | Effects | 4 |

### 5.2 FE Paths Completas — Parâmetros de Canal

**Faders (todos os módulos):**
```
FEkInputFader
;08FEkBusFader
;0CFEkAUXFader
;08FEkMatrixFader
;02FEkStereoFader
;60FE#kRemote/kRemoteFader1
;08FEkInFaderGrpMaster/kFader
;04FEkOutFaderGrpMaster/kFader
```

**Channel ON (todos os módulos):**
```
FEkInputChannelOn;08FEkBusChannelOn;0CFEkAUXChannelOn
;08FEkMatrixChannelOn;02FEkStereoChannelOn
;60FE#kRemote/kRemoteChannelOn1
;08FEkInFaderGrpMaster/kMasterOn
```

**Gate ON/OFF (só inputs):**
```
FEkInputGate/kGateOn
```

**Comp ON/OFF (todos exceto inputs que é implícito):**
```
FEkInputComp/kCompOn;08FEkBusComp/kCompOn;0CFEkAUXComp/kCompOn
;08FEkMatrixComp/kCompOn;02FEkStereoComp/kCompOn
```

**EQ (todas as bandas, todos os módulos — mesmo padrão):**
```
FEkInputEQ/kEQLowF
;08FEkBusEQ/kEQLowF
;0CFEkAUXEQ/kEQLowF
;08FEkMatrixEQ/kEQLowF
;02FEkStereoEQ/kEQLowF
```
*(Repete para: kEQHiF, kEQLowMidF, kEQHiMidF, kEQLowQ, kEQHiQ, todas as Gains, kEQOn, kEQHPFOn, kEQLPFOn, kEQMode)*

**Gate parâmetros (só inputs):**
```
FEkInputGate/kGateThreshold
FEkInputGate/kGateKeyIn
FEkInputGate/kGateKeyAUX
FEkInputGate/kGateKeyCh
FEkInputGate/kGateType
FEkInputGate/kGateHold
FEkInputGate/kGateLink
FEkInputGate/kGateDecay
FEkInputGate/kGateAttack
FEkInputGate/kGateRange
```

**Comp parâmetros (todos os módulos):**
```
FEkInputComp/kCompThreshold;08FEkBusComp/kCompThreshold;0CFEkAUXComp/kCompThreshold
;08FEkMatrixComp/kCompThreshold;02FEkStereoComp/kCompThreshold
(Mesmo padrão para: kCompGain, kCompAttack, kCompRelease, kCompLink, kCompKnee, kCompRatio, kCompLocComp, kCompType)
```

### 5.3 FE Paths para Cenas (Hier. kScene/kBackup)

```
00kBackupMemoryScene/kMemSceneEditFlag   → Flag de edição ativa
00kBackupMemoryScene/kMemSceneLast       → Última cena salva
00kScenePairMode/kPairMode               → Modo de par dentro da cena
01kScenePairMode/kPairMode               → Id 01 = segundo módulo
00kScenePanMode/kPanModeAUX0102          → Pan AUX 1-2 na cena
00kScenePanMode/kPanModeChannel          → Pan channels na cena
00kSceneDelayMode/kDelayMode             → Modo de delay na cena
00kSceneSurroundMode/kSurroundMode       → Modo surround na cena
00kBackupCurrentFs/kCurrentFs            → Frequência de sampling atual
```

---

## 6. SYSEX — MONTAGEM DE PACOTES

### 6.1 Conclusão Crítica — Sem Pacotes Hardcoded

> Nenhum pacote SysEx completo `F0 43 ... 3E ... F7` foi encontrado hardcoded nas DLLs.

Os pacotes são **montados dinamicamente em runtime** a partir das tabelas de parâmetros. A DLL recebe um nome de parâmetro (ex: `kFader`), consulta o ID no mapa, e constrói o pacote byte a byte.

### 6.2 Formato Geral SysEx Yamaha 01V96

```
F0  → SysEx Start
43  → Yamaha Manufacturer ID
1n  → Command + Device Number (n = device ID, default 0)
3E  → Model ID (01V96 = 0x3E)
0E  → Sub-model / Category (0x0E para parâmetros normais)
[address_high] [address_mid] [address_low]
[data...]
[checksum]
F7  → SysEx End
```

### 6.3 Checksum Yamaha (obrigatório em todos os pacotes)

```javascript
function yamahaChecksum(data) {
    // Soma todos os bytes de dado, pega o byte baixo,
    // subtrai de 128, AND com 0x7F
    const sum = data.reduce((acc, b) => acc + b, 0);
    return (128 - (sum & 0x7F)) & 0x7F;
}
```

### 6.4 Handshake de Versão

String de identificação enviada/recebida na conexão:
```
"Version;1.00;Console;"        ← Mesa responde com isso
"Version;2.00;Application Name;" ← SM2DLL responde com a versão do software
```

### 6.5 Tipos de Biblioteca para Recall/Store

```
Scene;Channel;Gate;Compressor;Equalizer;Input Patch;Output Patch;Effect;GEQ;Automix
```

Versão para Recall (sem GEQ e Automix):
```
Scene;Channel;Gate;Compressor;Equalizer;Input Patch;Output Patch;Effect
```

---

## 7. CENAS — SCENE MANAGEMENT

### 7.1 Propriedades de State Tracking

| Propriedade | ID | Descrição |
|---|---|---|
| `kMemSceneNow` | `ff` | **Cena ATIVA na mesa** (fonte da verdade) |
| `kMemSceneLast` | `9` | Última cena que o SM registrou localmente |
| `kMemSceneEditFlag` | `10009` | `1` = cena editada sem salvar / `0` = limpa |
| `kMemSceneUndoStatus` | `20009` | Estado do undo disponível |
| `kMemSceneUndoKind` | `30009` | Tipo de operação de undo |
| `kMemSceneUndoNum` | `40009` | Número de undos disponíveis |
| `kSceneSelection` | `24` | Cena selecionada na lista da UI |
| `kSceneCheckSum` | — | Checksum de validade da cena |

### 7.2 Metadados de uma Cena em Memória

```
kSceneTitle          → Nome da cena
kSceneVersion        → Versão do formato
kSceneAttribute      → Atributos especiais
kScenePairMode       → Modo de par de canais
kSceneDirectOutPre   → Direct Out pre/post
kSceneMatrixSend     → Send Matrix
kScenePanMode        → Modo de pan
kScenePanLink        → Link de pan
kSceneDelayMode      → Modo de delay
kSceneSurroundMode   → Modo surround
kSceneInputGroup     → Grupos de input
kSceneOutputGroup    → Grupos de output
kSceneCheckSum       → Checksum (validação)
kSceneReserved       → Padding
```

### 7.3 Recall Safe (Proteção por Parâmetro)

**Por Cena (aplica-se a um recall específico):**
```
kSceneRecallSafeIn               → Proteger Input channels
kSceneRecallSafeAUX              → Proteger AUX sends
kSceneRecallSafeBus              → Proteger Bus
kSceneRecallSafeMatrix           → Proteger Matrix
kSceneRecallSafeStereo           → Proteger Stereo Out
kSceneRecallSafeEffect           → Proteger Effects
kSceneRecallSafeGEQ              → Proteger GEQ
kSceneRecallSafeRemote           → Proteger Remote
kSceneRecallSafeEnable           → Master enable
kSceneRecallSafeInMasterFader    → Proteger master fader input
kSceneRecallSafeInMasterMute     → Proteger master mute input
kSceneRecallSafeOutMasterFader   → Proteger master fader output
kSceneRecallSafeOutMasterMute    → Proteger master mute output
```

**Global (aplica-se sempre):**
```
kGlobalRecallSafeIn / kGlobalRecallSafeBus / kGlobalRecallSafeAUX
kGlobalRecallSafeMatrix / kGlobalRecallSafeStereo
kGlobalRecallSafeEffect / kGlobalRecallSafeGEQ
kGlobalRecallSafeEnable
kGlobalRecallSafeInMasterFader / kGlobalRecallSafeOutMasterFader
```

### 7.4 Classes de Scene Management

```cpp
CSceneMemory         → Gerenciador de memória de cenas (dual-buffer hardware/local)
TSceneMemoryAccessor → Acesso controlado (get/set thread-safe)
InternalRecallUndoObject → Sistema de undo para recall
CLibOperatorFileScene → Operações de arquivo (salvar/carregar .scn)
CLibOperatorIntScene  → Operações internas de biblioteca
handleSceneChange(int) → Chamado quando cena muda no hardware
```

---

## 8. METERS — VU, PEAK, GR

### 8.1 Fluxo de Meter Data

```
postMeterRequest()  → Solicita à mesa que comece a enviar meter data
Mesa envia          → Pacotes SysEx com raw meter values (0-127 per channel)
updateMeter()       → Chamado a cada update recebido
meterUpdate()       → Notifica a UI que os valores mudaram
meterReset()        → Reseta todos os meters para 0
postMeterStopRequest() → Para o polling de meters
```

### 8.2 FE Paths para Meter Data por Módulo

| O que medir | FE Path | Canais |
|---|---|---|
| **Input level** | `FEkMeterInputRaw/kMeterChannel` | 32 |
| **Bus level** | `kMeterBusRaw/kMeterChannel` | 8 |
| **AUX level** | `kMeterAUXRaw/kMeterChannel` | 12 |
| **Matrix level** | `kMeterMatrixRaw/kMeterChannel` | 8 |
| **Stereo L** | `kMeterStereoRaw/kMeterChannel` | index 0 |
| **Stereo R** | `kMeterStereoRaw/kMeterChannel` | index 1 |
| **Input Comp GR** | `FEkMeterInputRaw/kMeterCompGR` | 32 |
| **Bus Comp GR** | `;08FEkMeterBusRaw/kMeterCompGR` | 8 |
| **AUX Comp GR** | `;0CFEkMeterAUXRaw/kMeterCompGR` | 12 |
| **Stereo Comp GR** | `;02FEkMeterStereoRaw/kMeterCompGR` | 2 |
| **Input Gate GR** | `FEkMeterInputRaw/kMeterGateGR` | 32 |
| **Gate Output** | `FEkMeterInputRaw/kMeterGateOut` | 32 |
| **Comp Output** | `FEkMeterInputRaw/kMeterCompOut` | 32 |
| **Effect Input** | `FEkMeterEffectRaw/kMeterIn1..8` | por slot |
| **Effect Output** | `FEkMeterEffectRaw/kMeterOut1..8` | por slot |
| **Effect GR** | `FEkMeterEffectRaw/kMeterGR1..3` | por slot |

### 8.3 Propriedades de Meter Setup

| Propriedade | ID | Descrição |
|---|---|---|
| `kMeterSetupInpPoint` | — | Ponto de medição Input (Pre/Post EQ) |
| `kMeterSetupOutPoint` | `0x0b` | Ponto de medição Output (Pre/Post fader) |
| `kMeterSetupPeakHold` | `0x5000b` | Peak Hold ON/OFF |
| `kMeterSetupFastFall` | `0x4000b` | Queda rápida ON/OFF |
| `kMeterSetupModeInput` | `0x6000b` | Modo Input: 12-seg ou 32-seg |
| `kMeterSetupModeMaster` | `0x7000b` | Modo Master: 12-seg ou 32-seg |

### 8.4 Modos de Exibição

| Modo | Props Peak/Hold | Resolução |
|---|---|---|
| **12-segmentos** | `kMeterStereo12P` / `kMeterStereo12H` | Para meter bridge físico |
| **32-segmentos** | `kMeterStereo32P` / `kMeterStereo32H` | Alta resolução (TV output) |

### 8.5 Tabelas de Stepping (Raw → Posição Visual)

**Tabela 12-segmentos (37 pontos, 0-127):**
```javascript
const meter12Seg = [
    0, 3, 6, 9, 13, 16, 19, 22, 25, 28, 31, 34, 38, 41, 44, 47,
    50, 53, 56, 59, 63, 66, 69, 72, 75, 78, 81, 84, 88, 91, 94,
    97, 100, 103, 109, 116, 122
];
```

**Tabela 32-segmentos (47 pontos, 0-127):**
```javascript
const meter32Seg = [
    2, 4, 6, 8, 10, 13, 15, 17, 19, 21, 23, 25, 27, 29, 31, 33,
    35, 38, 40, 42, 44, 46, 48, 50, 52, 54, 56, 58, 60, 63, 65,
    67, 69, 73, 77, 81, 85, 90, 94, 98, 102, 106, 110, 115, 119,
    123, 127
];
```

### 8.6 Escala dB dos Segmentos (Padrão 01V96)

```
raw=0   → -∞ dB (silêncio)
raw=100 → -6 dB (amarelo)
raw=109 → -3 dB
raw=116 →  0 dB (referência nominal)
raw=122 → +3 dB
raw=127 → +6 dB (clip!)
```

### 8.7 Conversão Raw → Posição Visual (JS)

```javascript
function meterRawToPosition(raw, table = meter32Seg) {
    if (raw <= table[0]) return 0;
    if (raw >= table[table.length - 1]) return 1;
    for (let i = 1; i < table.length; i++) {
        if (raw <= table[i]) {
            const fraction = (raw - table[i - 1]) / (table[i] - table[i - 1]);
            return (i - 1 + fraction) / (table.length - 1);
        }
    }
    return 1;
}
```

---

## 9. DYNAMICS — GATE E COMPRESSOR

### 9.1 Os 3 Estados Visuais do LED

| Estado | Gate | Comp | Visual |
|---|---|---|---|
| `'off'` | `CS_GateOff.png` | `CS_CompOff.png` | Cinza — dynamics desativado |
| `'on'` | `CS_GateOn.png` | `CS_CompOn.png` | Verde estático — ativo, sem ação |
| `'tracking'` | `CS_Gatetrack.png` | `CS_Comptrack.png` | Verde animado — atuando ativamente |

Arquivo sprite de 3 estados para o indicador GT:
```
CS_GTOff.png   → Cinza  = Gate DESATIVADO
CS_GTGreen.png → Verde  = Gate habilitado + sinal acima do threshold
CS_GTRed.png   → Vermelho = Gate FECHADO (sinal abaixo do threshold)
```

### 9.2 Lógica de Estado do LED

```javascript
function getDynamicsLEDState(isOn, grRaw) {
    if (!isOn) return 'off';        // Cinza
    if (grRaw > 4) return 'tracking'; // Verde animado (threshold: >4 evita flicker)
    return 'on';                    // Verde estático
}

const ledColors = {
    'off':      '#666666',  // Cinza
    'on':       '#22CC44',  // Verde sólido
    'tracking': '#FF6600',  // Laranja/vermelho (como na mesa física)
};
```

### 9.3 Propriedades de Gate (Completo)

| Propriedade | ID | Descrição |
|---|---|---|
| `kGateOn` | `ffffffff` | Gate ON/OFF → determina cor do LED |
| `kMeterGateGR` | `0x40070` | **GR do gate** (0-127) → aciona `tracking` |
| `kMeterGateOut` | `0x30070` | Sinal saída do gate (pós-gate) |
| `kMeterGateOutH` | `0x20072` | Sinal saída (alta resolução) |
| `kGateThreshold` | `0x9001d` | Threshold → posição da seta na barra |
| `kGateRange` | `0x6001d` | Range máximo de atenuação |
| `kGateAttack` | `0x5001d` | Attack time |
| `kGateHold` | `0x7001d` | Hold time |
| `kGateDecay` | `0x8001d` | Decay time |
| `kGateLink` | `0x1d` | Link estéreo |
| `kGateType` | `0x4001d` | GATE / DUCKING / EXPANDER |
| `kGateKeyIn` | `0x1001d` | Key source: Self |
| `kGateKeyAUX` | `0x2001d` | Key source: AUX |
| `kGateKeyCh` | `0x3001d` | Key source: Canal específico |

### 9.4 Propriedades de Compressor (Completo)

| Propriedade | ID | Descrição |
|---|---|---|
| `kCompOn` | `0x1e` | Comp ON/OFF → determina cor do LED |
| `kMeterCompGR` | `0x20073` | **GR do comp** (0-127) → aciona `tracking` |
| `kMeterCompOut` | `0x10073` | Sinal saída do comp (pós-compressão) |
| `kMeterCompOutH` | `0x10072` | Sinal saída (alta resolução) |
| `kCompThreshold` | `0x8001e` | Threshold → posição da seta na barra |
| `kCompRatio` | `0x5001e` | Ratio de compressão |
| `kCompKnee` | `0x7001e` | Knee: Soft / Hard |
| `kCompAttack` | `0x3001e` | Attack time |
| `kCompRelease` | `0x4001e` | Release time |
| `kCompGain` | `0x6001e` | Makeup gain |
| `kCompLink` | `0x1001e` | Link estéreo |
| `kCompType` | `0x2001e` | COMP / LIMIT / COMPANDER(H) / COMPANDER(S) / EXPANDER |
| `kCompLocComp` | `ffffffff` | Posição na cadeia (pre/pós EQ) |

### 9.5 Interpretação do GR Raw (0-127)

```
GR raw = 0   → Sem redução (0 dB) → Gate aberto / Comp não agindo
GR raw = 64  → ~-12 dB de redução (meio caminho)
GR raw = 127 → Máximo de redução (Gate fechado / Comp no limite)
```

### 9.6 A Barra de GR Inversa

A barra de GR cresce de **cima para baixo** (inverso do meter normal):
```
0 dB  ████ (top)      ← Gate aberto / Comp não agindo
-6 dB ████████
-12dB ████████████
-∞ dB ████████████████ ← Gate fechado / Comp máximo
```

```javascript
// Altura da barra de GR (0.0=nada, 1.0=máximo)
function getGRBarHeight(isOn, grRaw) {
    if (!isOn) return 0;
    return grRaw / 127;
}

// Posição do threshold marker (0.0=topo, 1.0=base)
function getThresholdPosition(threshRaw) {
    return threshRaw / 127;
}
```

### 9.7 Tipos de Vintage Compressor (Slots de Efeito)

```
SSComp (COMP276/COMP276S) → Emulação SSL G-Bus Compressor
DBX160 (COMP260/COMP260S) → Emulação DBX 160 Compressor
```

### 9.8 Dynamics Groups

Os dynamics podem ser agrupados para atuarem juntos:

| Grupo | ID (Input) | ID (Bus) |
|---|---|---|
| DynamicsGroup 1 | `kInDynamicsGroup1` = `0xf0014` | `kBusGroupDynamics1` = `0x70032` |
| DynamicsGroup 2 | `kInDynamicsGroup2` = `0x100014` | `kBusGroupDynamics2` = `0x80032` |
| DynamicsGroup 3 | `kInDynamicsGroup3` = `0x110014` | `0x90032` |
| DynamicsGroup 4 | `kInDynamicsGroup4` = `0x120014` | `0xa0032` |

---

## 10. EQ — EQUALIZAÇÃO

### 10.1 As 15 Propriedades de EQ por Canal (Grupo 0x1f)

```
idx 0: kEQLowQ      → Low band Q
idx 1: kEQLowF      → Low band Frequency
idx 2: kEQLowG      → Low band Gain
idx 3: kEQHPFOn     → High Pass Filter ON/OFF
idx 4: kEQLowMidQ   → Low-Mid band Q
idx 5: kEQLowMidF   → Low-Mid band Frequency
idx 6: kEQLowMidG   → Low-Mid band Gain
idx 7: kEQHiMidQ    → Hi-Mid band Q
idx 8: kEQHiMidF    → Hi-Mid band Frequency
idx 9: kEQHiMidG    → Hi-Mid band Gain
idx 10: kEQHiQ      → High band Q
idx 11: kEQHiF      → High band Frequency
idx 12: kEQHiG      → High band Gain
idx 13: kEQLPFOn    → Low Pass Filter ON/OFF
idx 14: kEQOn       → EQ ON/OFF
```

### 10.2 FE Address para EQ Completo

```
# Para um parâmetro específico (ex: Low Freq) em todos os módulos:
FEkInputEQ/kEQLowF
;08FEkBusEQ/kEQLowF
;0CFEkAUXEQ/kEQLowF
;08FEkMatrixEQ/kEQLowF
;02FEkStereoEQ/kEQLowF
```

---

## 11. EFEITOS — DSP ALGORITHMS

### 11.1 Tabela Completa de 61 Algoritmos

| # | Nome | Categoria |
|---|---|---|
| 1 | REVERB HALL | Reverb |
| 2 | REVERB ROOM | Reverb |
| 3 | REVERB STAGE | Reverb |
| 4 | REVERB PLATE | Reverb |
| 5 | EARLY REF. | Reverb |
| 6 | GATE REVERB | Reverb |
| 7 | REVERSE GATE | Reverb |
| 8 | MONO DELAY | Delay |
| 9 | STEREO DELAY | Delay |
| 10 | MOD.DELAY | Delay |
| 11 | DELAY LCR | Delay |
| 12 | ECHO | Delay |
| 13 | CHORUS | Modulation |
| 14 | FLANGE | Modulation |
| 15 | SYMPHONIC | Modulation |
| 16 | PHASER | Modulation |
| 17 | AUTO PAN | Modulation |
| 18 | TREMOLO | Modulation |
| 19 | HQ.PITCH | Pitch |
| 20 | DUAL PITCH | Pitch |
| 21 | ROTARY | Modulation |
| 22 | RING MOD. | Modulation |
| 23 | MOD.FILTER | Filter |
| 24 | DISTORTION | Amp |
| 25 | AMP SIMULATE | Amp |
| 26 | DYNA.FILTER | Dynamics |
| 27 | DYNA.FLANGE | Dynamics |
| 28 | DYNA.PHASER | Dynamics |
| 29 | REV+CHORUS | Combo |
| 30 | REV→CHORUS | Combo |
| 31 | REV+FLANGE | Combo |
| 32 | REV→FLANGE | Combo |
| 33 | REV→PAN | Combo |
| 34 | DELAY+ER. | Combo |
| 35 | DELAY→ER. | Combo |
| 36 | DELAY+REV | Combo |
| 37 | DELAY→REV | Combo |
| 38 | DIST→DELAY | Combo |
| 39 | MULTI FILTER | Filter |
| 40 | FREEZE | Special |
| 41 | ST REVERB | Reverb |
| 42 | REVERB 5.1 | Surround |
| 43 | OCTA REVERB | Surround |
| 44 | AUTO PAN 5.1 | Surround |
| 45 | CHORUS 5.1 | Surround |
| 46 | FLANGE 5.1 | Surround |
| 47 | M.BAND DYNA. | Dynamics |
| 48 | COMP 5.1 | Surround |
| 49 | COMPAND 5.1 | Surround |
| 50 | COMP276 | Vintage (SSL) |
| 51 | COMP276S | Vintage (SSL) Stereo |
| 52 | COMP260 | Vintage (DBX) |
| 53 | COMP260S | Vintage (DBX) Stereo |
| 54 | REV-X HALL | Premium Reverb |
| 55 | REV-X ROOM | Premium Reverb |
| 56 | REV-X PLATE | Premium Reverb |
| 57 | M.BAND COMP. | Dynamics |
| 58 | ROOM ER | Reverb |
| 59 | AUTO DOPPLER | Special |
| 60 | VNTG PHASER | Vintage |
| 61 | DUAL PHASER | Modulation |

**Presets de Reverb:** Large Hall, Medium Hall, Warm Room, Woody Room, Plate 1, Plate 2, S-Hall, L-Hall, Spring

### 11.2 Meters de Efeito

```
FEkMeterEffectRaw/kMeterIn1..kMeterIn8    → Input meters (até 8 entradas por efeito)
FEkMeterEffectRaw/kMeterOut1..kMeterOut8  → Output meters
FEkMeterEffectRaw/kMeterGR1..kMeterGR3   → GR meters (dynamics effects)
FEkMeterEffectRaw/kMeterVU1..kMeterVU6   → VU meters
```

---

## 12. SINCRONIZAÇÃO REAL-TIME

### 12.1 Por que o Studio Manager é Tão Rápido

| Fator | Studio Manager | Node.js típico |
|---|---|---|
| **Arquitetura** | DLL in-process → chamadas de função em nanossegundos | MIDI virtual → Node.js → WebSocket → Browser → múltiplos hops |
| **Sync inicial** | Bulk Dump: 1 pacote SysEx com TODO o estado | Parameter-by-parameter: milhares de pacotes individuais |
| **Threading** | `TBulkTaskThread` dedicada, não bloqueia UI | Single-threaded (event loop compartilhado) |
| **Meter polling** | Timer a **41ms** (~24fps) via COM callback direto | 100ms com overhead de serialização JSON |
| **Anti-loop** | `m_plSyncCounter` atômico (`InterlockedIncrement`) | Timeout-based (impreciso) |

### 12.2 O Timer de 41ms — A Chave da Fluidez

O valor **41ms** aparece repetidamente próximo de TODOS os timers:
```
setSysexInterval() → 41ms
updateInterval     → 41ms
timerUpdate()      → 41ms
interval           → 41ms
resetFlatTimer     → 41ms
```

> **41ms ≈ 24.39 fps** — exatamente a taxa de atualização para meter UI  
> Nosso polling de 100ms é **2.4× mais lento** que o SM nativo.

**Outros intervalos encontrados:**
```
48ms  → Timer de UI update (~20 fps)
100ms → Tick genérico
107ms → kTxBulkInterval (gap entre pacotes bulk, evita overflow)
```

### 12.3 O Bulk Dump — Sync Completo em ~2 Segundos

```
kTxEnableBulk    ID: 20054 → Habilitar recepção de bulk (mesa → SM)
kRxEnableBulk    ID: 20055 → Habilitar transmissão de bulk (SM → mesa)
kTxBulkInterval  ID: 50054 → Intervalo entre pacotes bulk (~107ms)
```

**Sequência de Re-Sync:**
```
1. Usuário clica "Re-Synchronize..."
   → SM mostra "Synchronization Progress" (QProgressDialog)

2. SM envia "Bulk Request" para a mesa
   → Equivalente a: kTxEnableBulk = 1

3. Mesa responde com TUDO de uma vez (~2.784 params):
   ├─ 32 canais de input (fader, pan, EQ, dynamics, routing, AUX)
   ├─ 8 bus + 12 AUX + 8 matrix + 2 stereo
   ├─ Effects 1-4 com parâmetros
   ├─ Cena atual (kMemSceneNow)
   ├─ Nomes de canais
   └─ Setup e configuração

4. TBulkTaskThread processa em background
   → Dados vão para o cache (shadow buffer)
   → UI é notificada via Qt signal valueChanged()

5. handleSceneChange(int) é chamado
   → Compara kMemSceneNow vs kMemSceneLast
   → Se kMemSceneEditFlag → "*" no título

6. "Library Synchronization..." finaliza
```

### 12.4 O SyncCounter — Anti-Loop Atômico

**A asserção exata encontrada na SM2DLL.dll:**
```cpp
m_plSyncCounter && ( 0 < *m_plSyncCounter ) && pbSyncError
```

**Como funciona:**
```
Ao ENVIAR um param para a mesa → InterlockedIncrement(m_plSyncCounter)
Ao RECEBER resposta da mesa   → se counter > 0: InterlockedDecrement && IGNORAR (é eco)
                                 se counter == 0: processar (mudança real da mesa)
```

**APIs Windows usadas:**
```
QMutex                    → Exclusão mútua para acesso ao state buffer
QSemaphore                → Coordenação producer/consumer
InterlockedIncrement       → Incremento atômico do sync counter
InterlockedDecrement       → Decremento atômico
InterlockedCompareExchange → CAS lock-free
QThread::msleep()          → Sleep preciso para a bulk thread
```

### 12.5 Scene Recall — Por que os Faders se Movem Instantaneamente

```
1. Mesa recebe Program Change → Recall Scene N
2. Mesa carrega toda a cena N para a RAM "Now"
3. Mesa envia Bulk Dump automático (se kTxEnableBulk ativo)
4. SM recebe o bulk inteiro em rajada
5. handleSceneChange(int) atualiza TODOS os params de uma vez
6. Qt propagates valueChanged() para TODOS os widgets simultaneamente
```

> **A chave**: A mesa envia bulk dump **automático** após scene recall quando `kTxEnableBulk` está habilitado. O SM não precisa pedir nada — os dados chegam sozinhos!

### 12.6 State Buffer — Dual-Buffer (Now vs Last)

O SM mantém buffers separados para cada tipo de dado:

| Dado | Now (ativo) | Last (salvo) | EditFlag |
|---|---|---|---|
| **Scene** | `kMemSceneNow` | `kMemSceneLast` | `kMemSceneEditFlag` |
| Input Patch | `kMemInPatchNow` | `kMemInPatchLast` | `kMemInPatchEditFlag` |
| Output Patch | `kMemOutPatchNow` | `kMemOutPatchLast` | `kMemOutPatchEditFlag` |
| Ch Library | `kMemChLibNow` | `kMemChLibLast` | `kMemChLibEditFlag` |
| EQ Library | `kMemEQLibNow` | `kMemEQLibLast` | `kMemEQLibEditFlag` |
| Gate Library | `kMemGtLibNow` | `kMemGtLibLast` | `kMemGtLibEditFlag` |
| Comp Library | `kMemCoLibNow` | `kMemCoLibLast` | `kMemCoLibEditFlag` |
| Effect Library | `kMemEfLibNow` | `kMemEfLibLast` | `kMemEfLibEditFlag` |
| GEQ Library | `kMemGEQLibNow` | `kMemGEQLibLast` | `kMemGEQLibEditFlag` |

**Lógica:**
```
EditFlag == 1 → Dados alterados desde o último recall/store → mostrar "*"
EditFlag == 0 → Dados idênticos ao último recall/store → limpo
Now != Last   → Mudança pendente → sincronizar
```

### 12.7 Checklist de Otimização para o Nosso App

- [ ] Reduzir meter polling de 100ms → **41ms** (de 10fps para 24fps)
- [ ] Implementar **Bulk Dump request** em vez de parameter-by-parameter
- [ ] Implementar **SyncCounter** atômico para anti-loop
- [ ] Usar **batch UI updates** via requestAnimationFrame
- [ ] Habilitar `kTxEnableBulk` na mesa para receber bulk automático em scene recall
- [ ] Handler de scene recall que aguarda e processa o bulk completo
- [ ] Usar **WebSocket binário** em vez de JSON (reduz overhead de serialização)
- [ ] Respeitar o **intervalo entre SysEx** de ~41ms para não overflowear a mesa
- [ ] Pipeline MIDI: enviar próxima mensagem sem esperar ACK da anterior

---

## 13. IMPLEMENTAÇÃO NODE.JS — CÓDIGO DE REFERÊNCIA

### 13.1 Checksum Yamaha

```javascript
function yamahaChecksum(data) {
    const sum = data.reduce((acc, b) => acc + b, 0);
    return (128 - (sum & 0x7F)) & 0x7F;
}
```

### 13.2 SyncCounter — Anti-Loop

```javascript
class SyncCounter {
    constructor() { this._counter = 0; }
    
    // Chamar ANTES de enviar para a mesa
    beginSync() { this._counter++; }
    
    // Chamar ao RECEBER do MIDI
    // true = é eco, ignorar | false = mudança real, processar
    shouldIgnore() {
        if (this._counter > 0) { this._counter--; return true; }
        return false;
    }
}
const syncCounter = new SyncCounter();

function sendToMixer(sysex) {
    syncCounter.beginSync();
    midi.send(sysex);
}

function onMIDIMessage(data) {
    if (syncCounter.shouldIgnore()) return; // Eco do nosso envio
    updateState(data); // Mudança real do hardware
}
```

### 13.3 Dual-Buffer State Management

```javascript
const state = {
    hardware: {},  // kMemSceneNow — fonte da verdade (o que a mesa tem)
    local: {}      // kMemSceneLast — o que o server pensa ter
};

function onSysExReceived(data) {
    if (syncCounter.shouldIgnore()) return;
    
    const param = parseParam(data);
    state.hardware[param.name] = param.value;
    
    // Só notifica clientes se realmente mudou
    if (state.hardware[param.name] !== state.local[param.name]) {
        state.local[param.name] = param.value;
        broadcastToClients({ param: param.name, value: param.value });
    }
}
```

### 13.4 Meter Polling Otimizado

```javascript
// Polling suave a 41ms (24fps — igual ao SM nativo)
function startMeterPolling() {
    let lastTime = 0;
    function meterLoop(timestamp) {
        if (timestamp - lastTime >= 41) {
            lastTime = timestamp;
            requestMeterData();
        }
        requestAnimationFrame(meterLoop);
    }
    requestAnimationFrame(meterLoop);
}
```

### 13.5 Meter Raw → Display

```javascript
const meter32Seg = [
    2, 4, 6, 8, 10, 13, 15, 17, 19, 21, 23, 25, 27, 29, 31, 33,
    35, 38, 40, 42, 44, 46, 48, 50, 52, 54, 56, 58, 60, 63, 65,
    67, 69, 73, 77, 81, 85, 90, 94, 98, 102, 106, 110, 115, 119,
    123, 127
];

function meterRawToPosition(raw, table = meter32Seg) {
    if (raw <= table[0]) return 0;
    if (raw >= table[table.length - 1]) return 1;
    for (let i = 1; i < table.length; i++) {
        if (raw <= table[i]) {
            const f = (raw - table[i - 1]) / (table[i] - table[i - 1]);
            return (i - 1 + f) / (table.length - 1);
        }
    }
    return 1;
}

// Aproximação dB a partir do raw (0-127)
const dbScale = {
    0: '-∞', 50: '-∞', 75: '-18',
    88: '-12', 100: '-6', 109: '-3',
    116: '0', 122: '+3', 127: '+6'
};
```

### 13.6 Dynamics Indicator

```javascript
function getDynamicsState(isOn, grRaw) {
    if (!isOn) return { state: 'off', color: '#666' };
    if (grRaw > 4) return { state: 'tracking', color: '#FF6600' }; // Agindo
    return { state: 'on', color: '#22CC44' }; // Ativo mas sem ação
}

function getGRBarHeight(isOn, grRaw) {
    return (!isOn) ? 0 : grRaw / 127;
}

function getThresholdMarkerPos(threshRaw) {
    return threshRaw / 127; // 0.0 (topo) → 1.0 (base)
}
```

---

## 14. ARQUIVOS DE DADOS (JSONs)

Os arquivos JSON são **a fonte primária de verdade** para implementação. A DLL os gera; eles mapeiam tudo.

| Arquivo | Tamanho | Conteúdo |
|---|---|---|
| `01v96_property_map.json` | 219 KB | 2.676 propriedades: name → ID |
| `categorized_properties.json` | 246 KB | Propriedades agrupadas por categoria (11 grupos) |
| `detailed_prop_map.json` | 354 KB | Propriedades + metadados (min/max, formato, tipo) |
| `sync_properties.json` | 12 KB | Apenas propriedades de sync/memória (subset) |

### Uso no Node.js

```javascript
const propMap = require('./reverse_dll_project/01v96_property_map.json');

// Resolver ID de um parâmetro pelo nome
function getParamId(name) {
    const prop = propMap.find(p => p.name === name);
    return prop ? prop.id : null;
}

// Exemplo:
getParamId('kGateThreshold'); // → '9001d'
getParamId('kCompOn');        // → '1e'
getParamId('kMeterCompGR');   // → '20073'
```

---

> *Este documento representa o conhecimento completo extraído das DLLs do Yamaha Studio Manager 2 via engenharia reversa (7 passes). Para implementar qualquer funcionalidade do Studio Manager em JavaScript puro, este documento é suficiente. Análise adicional das DLLs via disassembly (Ghidra/IDA) ou análise dinâmica (debugger) seria necessária apenas para: (a) lógica matemática exata de conversões de valor específicas, ou (b) captura do handshake exato de conexão nível-de-bytes.*
