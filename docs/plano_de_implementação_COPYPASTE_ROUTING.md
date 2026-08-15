# Plano de Implementação — Copiar / Colar Contextual na Aba ROUTING / ETC

## 🎯 Goal Description
Expandir o sistema modular de **Copiar e Colar Contextual** para a aba **ROUTING / ETC** da tela de configuração de canais (`activeConfigTab === 'etc'`).

Nesse contexto, o usuário copia os parâmetros de endereçamento, patch, pan e insert de um canal de origem (ex: `CH 1 (Voz)`) e cola em outro canal de destino (ex: `CH 2 (Backing Vocal)` ou barramento):
- **Canais de Entrada (`0..31`)**: Copia **Input Patch**, **Pan**, **Bus Assignments (1 a 8)**, **Stereo Master L/R** e **Insert Config** (ON, Posição e Patch In).
- **Canais ST IN (`60..67`)**: Copia **Input Patch**, **Pan**, **Bus Assignments (1 a 8)** e **Stereo Master L/R**.
- **Canais BUS (`44..51`)**: Copia **Stereo Master L/R** e **Insert Config** (ON, Posição e Patch In).
- **Regra do Insert Out**: O *Insert Out* depende de um Output Patch físico exclusivo da mesa 01V96 e **não é copiado** (o sistema verifica `window.globalOutPatches` e avisa o usuário se o canal de origem tiver um Insert Out configurado).

---

## 🔍 Contexto & Parâmetros de Routing

### 1. Parâmetros por Tipo de Canal:
| Parâmetro | Canais Suportados | Comando Socket | Descrição |
| :--- | :--- | :--- | :--- |
| **Input Patch** | Inputs (`0..31`), ST IN (`60..67`) | `kChannelInput/kChannelIn` | Fonte física (AD, ADAT, Slot, FX, etc.) |
| **Pan** | Inputs (`0..31`), ST IN (`60..67`) | `setPan` / `kPan` | Posição no campo estéreo (-63 a +63) |
| **Bus 1 a 8** | Inputs (`0..31`), ST IN (`60..67`) | `kInputBus/kBus{1..8}` | Atribuição aos barramentos de BUS |
| **Stereo L/R** | Inputs (`0..31`), ST IN, Buses (`44..51`) | `kInputBus/kStereo` ou `kBusToStereo/kBusToStereoOn` | Envio para o Master Stereo L/R |
| **Insert ON** | Inputs (`0..31`), Buses (`44..51`) | `kInputInsert/kInsertOn` ou `kBusInsert/kInsertOn` | Liga/desliga o ponto de insert |
| **Insert Pos** | Inputs (`0..31`), Buses (`44..51`) | `kInputInsert/kInsertLocInsert` ou `kBusInsert/kInsertLocInsert` | Posição (Pre-EQ, Pre-Fader, Post-Fader) |
| **Insert In** | Inputs (`0..31`), Buses (`44..51`) | `kChannelInsertIn/kInsertIn` | Patch de retorno do Insert (fonte física) |
| **Insert Out** | *Físico único* | *N/A (Não copiado)* | Porta física de saída da mesa (aviso ao usuário) |

---

## 🏗️ Formato do Buffer Contextual (`window.contextClipboard`)

```javascript
window.contextClipboard = {
    type: 'routing',
    sourceId: ch,
    sourceName: getChannelDisplayName(ch),
    expectedScreen: 'ROUTING / ETC',
    data: {
        patch: state.patch !== undefined ? state.patch : null,
        pan: state.pan !== undefined ? state.pan : 0,
        buses: state.buses ? [...state.buses] : new Array(8).fill(false),
        stereo: state.stereo !== undefined ? !!state.stereo : true,
        insert: state.insert ? {
            on: !!state.insert.on,
            position: state.insert.position || 0,
            patch_in: state.insert.patch_in || 0
        } : null
    },
    validateTarget: function() {
        return (
            typeof activeConfigTab !== 'undefined' &&
            activeConfigTab === 'etc' &&
            typeof activeConfigChannel !== 'undefined' &&
            activeConfigChannel !== null &&
            ((activeConfigChannel >= 0 && activeConfigChannel <= 31) ||
             (activeConfigChannel >= 44 && activeConfigChannel <= 51) ||
             (activeConfigChannel >= 60 && activeConfigChannel <= 67))
        );
    },
    pasteHandler: function(targetCh) {
        executePasteRouting(targetCh);
    }
};
```

---

## ⚡ Despachante Global com Delay Seguro de 20ms (`dispatchThrottledCommands`)
Para proteger o processador e os buffers da 01V96 contra sobrecargas e garantir consistência:
- Todos os comandos da fila são executados através da função utilitária `dispatchThrottledCommands(commands, onComplete, 20)`.
- O envio ocorre sequencialmente a cada **20ms**.

---

## 📊 Fluxograma de Operação (ASCII)

```text
========================================================================================
                          1. COPIAR NA ABA ROUTING / ETC
========================================================================================

  [ Usuário em Channel Config: CH 1 na aba ROUTING / ETC ]
                          │
                          ▼
             [ Clica no botão 'COPIAR' ]
                          │
                          ▼
            [ copyActiveContext() ]
                          │
                          ▼
      [ Detecta: activeConfigTab = 'etc', activeConfigChannel = 0 ]
                          │
                          ▼
      [ Executa copyRouting(0) ]
        • Captura patch, pan, buses[1..8], stereo, insert
        • Verifica se canal possui Insert Out ativo em globalOutPatches
        • Preenche window.contextClipboard com type 'routing'
                          │
         ┌────────────────┴────────────────┐
         ▼                                 ▼
   [ hasInsertOut == true ]          [ hasInsertOut == false ]
         │                                 │
         ▼                                 ▼
   [ OverlayInfo / ConfirmModal:     [ OverlayInfo:
     "ROUTING COPIADO!                "ROUTING DE CH 1 COPIADO
      (Insert Out não copiado...)" ]   COM SUCESSO!" ]
         │                                 │
         └────────────────┬────────────────┘
                          ▼
      [ Botão [ COLAR ] torna-se ATIVO e DESTACADO ]


========================================================================================
                          2. COLAR NA ABA ROUTING DE OUTRO CANAL
========================================================================================

  [ Usuário navega para CH 2 na aba ROUTING / ETC ]
                          │
                          ▼
             [ Clica no botão 'COLAR' ]
                          │
                          ▼
            [ pasteActiveContext() ]
                          │
           ┌──────────────┴──────────────┐
           ▼                             ▼
    [ validateTarget() == false ]  [ validateTarget() == true ]
           │                             │
           ▼                             ▼
   [ OverlayInfo:                [ ConfirmModal:
     "ERRO: DADOS NA MEMÓRIA       "Deseja colar as definições de Routing
      SÃO DO CH 1.                  de CH 1 em CH 2?" ]
      ABRA ROUTING..." ]                         │
                                   ┌─────────────┴─────────────┐
                                   ▼ CANCELAR                  ▼ CONFIRMAR
                              [ Aborta ]                  [ Aplica state local ]
                                                                 │
                                                                 ▼
                                                          [ Emite comandos Socket
                                                            via dispatchThrottledCommands
                                                            (20ms de intervalo) ]
                                                                 │
                                                                 ▼
                                                          [ Re-renderiza renderRouting ]
                                                                 │
                                                                 ▼
                                                          [ OverlayInfo:
                                                            "ROUTING DE CH 2
                                                             COLADO COM SUCESSO!" ]
========================================================================================
```

---

## 📐 Proposed Changes

### Componente 1: Motor Contextual (`public/modules/copy_paste.js`)

#### [MODIFY] `public/modules/copy_paste.js`
- Implementar `copyRouting(ch)`:
  - Captura os parâmetros de patch, pan, buses, stereo e insert.
  - Verifica se o canal possui Insert Out ativo através de `window.globalOutPatches`.
  - Alimenta `window.contextClipboard` com tipo `'routing'`.
  - Exibe feedback visual com `OverlayInfo` (e aviso sobre Insert Out se aplicável).
- Implementar `executePasteRouting(targetCh)`:
  - Exibe `ConfirmModal` com nomes de origem e destino e resumo dos itens que serão aplicados.
  - Monta lista de comandos socket compatíveis com o canal destino (`targetCh`):
    - Se canal destino suportar patch/pan (inputs e ST IN): emite patch e pan.
    - Se canal destino suportar buses (inputs e ST IN): emite os 8 buses.
    - Se canal destino suportar stereo (inputs, ST IN, buses): emite stereo master.
    - Se canal destino suportar insert (inputs e buses): emite insert on, position e patch in.
  - Atualiza o estado em memória local (`channelStates[targetCh]` ou `busesState[targetCh - 44]`).
  - Despacha os comandos via `dispatchThrottledCommands(commands, onComplete, 20)`.
  - Ao concluir o despacho, se `activeConfigChannel === targetCh && activeConfigTab === 'etc'`, chama `renderRouting(targetCh)` para sincronizar a interface visual.
- Atualizar os Despachantes Globais:
  - `window.copyActiveContext()`: adiciona caso para `activeConfigTab === 'etc'`.
  - `window.pasteActiveContext()`: adiciona caso para `type === 'routing'` passando `activeConfigChannel`.

---

### Componente 2: Renderização da UI, Dock, Bottom Bar & Mobile (`public/modules/sidebar.js`)

#### [MODIFY] `public/modules/sidebar.js`
- **Suporte Unificado a Desktop (Sidebar Lateral), Mobile Retrato (Bottom Bar) e Mobile Menu Modal**:
  - No `renderDock('channelConfig')`:
    - Atualizar a condição para incluir a aba `etc` quando o canal for compatível com routing (`inputs 0..31`, `buses 44..51` e `ST IN 60..67`).
  - No `renderMobileMenu('channelConfig')`:
    - Incluir botões `COPIAR` e `COLAR` para a aba `etc` nos canais compatíveis.

---

## 🧪 Verification Plan

### Testes Automatizados
```bash
node --check public/modules/copy_paste.js
node --check public/modules/sidebar.js
cargo check
```

### Validação Manual
1. **Copiar no CH 1 (Input)**:
   - Configurar Patch (ex: AD 1), Pan (ex: L30), Bus 1 e 2 ON, Stereo ON e Insert ON no CH 1.
   - Clicar em `COPIAR` ➔ Toast *"ROUTING DE CH 1 COPIADO COM SUCESSO!"*.
2. **Colar no CH 2 (Input)**:
   - Abrir CH 2 na aba ROUTING / ETC ➔ Clicar em `COLAR`.
   - Confirmar modal ➔ Verificar que Patch, Pan, Bus 1/2, Stereo e Insert são aplicados instantaneamente na tela.
3. **Teste do Aviso de Insert Out**:
   - Configurar um Insert Out no CH 1 (ex: OMNI 1).
   - Clicar em `COPIAR` ➔ Verificar toast/aviso informando que o Insert Out foi ignorado por ser porta física única.
4. **Colar em Canal BUS (Ex: BUS 1)**:
   - Abrir BUS 1 na aba ROUTING ➔ Clicar em `COLAR` ➔ Verificar que Stereo e Insert são aplicados com segurança (ignorando patch de input e buses).
5. **Validação em Smartphone / Modo Retrato**:
   - Verificar presença e funcionamento dos botões `COPIAR` e `COLAR` na **Bottom Bar** inferior.
