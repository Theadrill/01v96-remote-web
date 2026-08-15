# Plano de Implementação — Copiar / Colar Contextual na Aba DYNAMICS (Gate & Compressor)

## 🎯 Goal Description
Expandir o sistema modular de **Copiar e Colar Contextual** para a aba **DYNAMICS (DYN)** da tela de configuração de canais (`activeConfigTab === 'dyn'`).

Nesse contexto, o usuário copia os parâmetros de dinâmica de um canal de origem (ex: `CH 1 (Bumbo)`) e cola em um canal de destino (ex: `CH 2 (Caixa)` ou barramento/master):
- **Canais de Entrada (`0..31`)**: Copia **Gate** (ON, Threshold, Range, Attack, Hold, Decay) e **Compressor** (ON, Threshold, Ratio, Attack, Release, OutGain, Knee).
- **Canais de Saída (`Mix 36..43`, `Bus 44..51`, `Master 52`)**: Copia **Compressor** (ON, Threshold, Ratio, Attack, Release, OutGain, Knee).

---

## 🔍 Contexto & Parâmetros de Dinâmica

### 1. Parâmetros do Gate (Apenas Canais de Entrada 0..31):
| Parâmetro | Comando Socket | Range / Tipo |
| :--- | :--- | :--- |
| **ON / OFF** | `kInputGate/kGateOn` | `0` ou `1` |
| **Threshold** | `kInputGate/kGateThreshold` | `-540` a `0` (step 1 = -54.0dB a 0dB) |
| **Range** | `kInputGate/kGateRange` | `-60` a `0` (step 1 = -60dB a 0dB) |
| **Attack** | `kInputGate/kGateAttack` | `0` a `120` (index na tabela) |
| **Hold** | `kInputGate/kGateHold` | `0` a `186` (index na tabela) |
| **Decay** | `kInputGate/kGateDecay` | `0` a `179` (index na tabela) |

### 2. Parâmetros do Compressor (Inputs, Mixes, Buses e Master):
| Parâmetro | Comando Socket | Range / Tipo |
| :--- | :--- | :--- |
| **ON / OFF** | `${prefix}Comp/kCompOn` | `0` ou `1` |
| **Threshold** | `${prefix}Comp/kCompThreshold` | `-540` a `0` (step 1 = -54.0dB a 0dB) |
| **Ratio** | `${prefix}Comp/kCompRatio` | `0` a `15` (1:1 a inf:1) |
| **Attack** | `${prefix}Comp/kCompAttack` | `0` a `120` |
| **Release** | `${prefix}Comp/kCompRelease` | `0` a `119` |
| **OutGain** | `${prefix}Comp/kCompGain` | `0` a `180` (0dB a +18.0dB) |
| **Knee** | `${prefix}Comp/kCompKnee` | `0` a `5` (hard a soft 5) |

*(Onde `${prefix}` é `kInput` para canais 0..31, `kAUX` para 36..43, `kBus` para 44..51 e `kStereo` para Master).*

---

## 🏗️ Formato do Buffer Contextual (`window.contextClipboard`)

```javascript
window.contextClipboard = {
    type: 'dynamics',
    sourceId: ch,
    sourceName: 'CH 1 (Bumbo)',
    expectedScreen: 'DYNAMICS (GATE / COMPRESSOR)',
    data: {
        gate: state.gate ? { ...state.gate } : null,
        comp: state.comp ? { ...state.comp } : null
    },
    validateTarget: function() {
        return (
            typeof activeConfigTab !== 'undefined' &&
            activeConfigTab === 'dyn' &&
            typeof activeConfigChannel !== 'undefined' &&
            activeConfigChannel !== null &&
            (activeConfigChannel <= 31 || (activeConfigChannel >= 36 && activeConfigChannel <= 52))
        );
    },
    pasteHandler: function(targetCh) {
        executePasteDynamics(targetCh);
    }
};
```

---

## ⚡ Proteção do Processador da 01V96 (Rate Limiting de 15ms)
Ao colar as configurações de dinâmica:
- São enviados de 7 a 13 comandos sequenciais (Gate + Comp).
- Cada comando é enfileirado com `setTimeout(..., index * 15ms)` para garantir que o processador MIDI da mesa não seja sobrecarregado.

---

## 📊 Fluxograma de Operação (ASCII)

```text
========================================================================================
                          1. COPIAR NA ABA DYNAMICS
========================================================================================

  [ Usuário em Channel Config: CH 1 (Bumbo) na aba DYN ]
                          │
                          ▼
             [ Clica no botão 'COPIAR' ]
                          │
                          ▼
            [ copyActiveContext() ]
                          │
                          ▼
      [ Detecta: activeConfigTab = 'dyn', activeConfigChannel = 0 ]
                          │
                          ▼
      [ Executa copyDynamics(0) ]
        • Captura state.gate e state.comp
        • Preenche window.contextClipboard com type 'dynamics'
        • sourceName: 'CH 1 (Bumbo)'
        • expectedScreen: 'DYNAMICS (GATE / COMPRESSOR)'
                          │
                          ▼
      [ OverlayInfo: "DYNAMICS DE CH 1 (BUMBO) COPIADO COM SUCESSO!" ]
      [ Botão [ COLAR ] torna-se ATIVO e DESTACADO ]


========================================================================================
                          2. COLAR NA ABA DYNAMICS DE OUTRO CANAL
========================================================================================

  [ Usuário navega para CH 2 (Caixa) na aba DYN ]
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
     "ERRO: DADOS NA MEMÓRIA       "Deseja colar as definições de Dinâmica
      SÃO DO CH 1 (BUMBO).          de CH 1 (Bumbo) em CH 2 (Caixa)?" ]
      ABRA DYNAMICS..." ]                        │
                                   ┌─────────────┴─────────────┐
                                   ▼ CANCELAR                  ▼ CONFIRMAR
                              [ Aborta ]                  [ Aplica state local ]
                                                                 │
                                                                 ▼
                                                          [ Emite comandos Socket
                                                            (Gate/Comp) a cada 15ms ]
                                                                 │
                                                                 ▼
                                                          [ Atualiza Sliders, ONs e
                                                            Thresh na UI ]
                                                                 │
                                                                 ▼
                                                          [ OverlayInfo:
                                                            "DYNAMICS DE CH 2 (CAIXA)
                                                             COLADO COM SUCESSO!" ]
========================================================================================
```

---

## 📐 Proposed Changes

### Componente 1: Motor Contextual (`public/modules/copy_paste.js`)

#### [MODIFY] `public/modules/copy_paste.js`
- Implementar `copyDynamics(ch)`:
  - Extrai `state.gate` (se canal de entrada `0..31`) e `state.comp` (se suportado).
  - Alimenta `window.contextClipboard` com tipo `'dynamics'`.
- Implementar `executePasteDynamics(targetCh)`:
  - Exibe `ConfirmModal` com nomes de origem e destino e descrição das seções que serão coladas.
  - Envia os comandos de Gate (se `targetCh <= 31` e houver dados de gate) e Compressor (se houver dados de comp) com intervalo de 15ms.
  - Atualiza sliders (`gateThreshSl`, `compThreshSl`, etc.), botões ON (`gateOn`, `compOn`) e dispara eventos de input para sincronizar a interface visual se a aba DYN estiver visível.
- Atualizar `window.copyActiveContext()`:
  - Adicionar condição para `activeConfigTab === 'dyn'`.
- Atualizar `window.pasteActiveContext()`:
  - Repassar `activeConfigChannel` para `pasteHandler` quando `type === 'dynamics'`.

---

### Componente 2: Renderização da UI, Dock, Bottom Bar & Mobile (`public/modules/sidebar.js`)

#### [MODIFY] `public/modules/sidebar.js`
- **Suporte Unificado a Desktop (Sidebar Lateral), Mobile Retrato (Bottom Bar) e Mobile Menu Modal**:
  - Na arquitetura da aplicação, o elemento `#buttonDock` (`.button-dock`) é compartilhado:
    - **Desktop / Landscape**: Opera como a **Sidebar Lateral**.
    - **Mobile Retrato (`body:not(.layout-desktop).is-portrait`)**: É posicionado na parte inferior como a **Bottom Bar Horizontal** com scroll por toque e botões responsivos (`.dock-btn`).
  - Atualizar `renderDock('channelConfig')`:
    - Adicionar condição para renderizar `COPIAR` e `COLAR` quando `(activeConfigTab === 'aux' || activeConfigTab === 'dyn') && activeConfigChannel !== null && !(activeConfigChannel >= 60 && activeConfigChannel <= 67)`.
    - Isso garante que, ao estar na aba `DYN`, os botões `COPIAR` e `COLAR` aparecerão perfeitamente tanto na **Sidebar Lateral** quanto na **Bottom Bar** em smartphones em modo retrato.
  - Sincronização em `switchTab(tabId)`:
    - Como `switchTab` já chama `renderDock('channelConfig')`, a alternância para a aba `DYN` re-renderizará a Bottom Bar instantaneamente com os botões contextuais habilitados.
  - No `renderMobileMenu('channelConfig')`:
    - Incluir botões `COPIAR` e `COLAR` no menu mobile suspenso quando `activeConfigTab === 'dyn'`.

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
   - Configurar Gate e Compressor no CH 1.
   - Clicar em `COPIAR` na Sidebar/Bottom Bar ➔ Toast *"DYNAMICS DE CH 1 COPIADO COM SUCESSO!"*.
2. **Colar no CH 2 (Input)**:
   - Abrir o CH 2 na aba DYN ➔ Botão `COLAR` ativo na Bottom Bar.
   - Clicar em `COLAR` ➔ Confirmar modal ➔ Verificar que Gate e Compressor atualizam instantaneamente com sliders e botões ON.
3. **Colar em Canal de Saída (Ex: MIX 1 ou MASTER)**:
   - Abrir MIX 1 na aba DYN.
   - Clicar em `COLAR` ➔ Confirmar modal ➔ Verificar que o Compressor do MIX 1 recebe os parâmetros copiados (e a ausência de Gate é tratada com segurança).
4. **Validação em Smartphone / Modo Retrato**:
   - Redimensionar para formato retrato de celular e confirmar que os botões `COPIAR` e `COLAR` estão visíveis e clicáveis na **Bottom Bar** inferior.
5. **Validação de Bloqueio**:
   - Abrir aba não compatível (ex: ST IN ou tela principal) e verificar bloqueio correto do botão `COLAR` ou mensagem amigável.
