# Plano de Implementação — Copiar / Colar Contextual na Aba AUX (Canais de Entrada)

## 🎯 Goal Description
Expandir o sistema modular de **Copiar e Colar Contextual** para os canais de entrada (CH 1 a 32 e ST IN) quando o usuário estiver na tela de configuração individual do canal (`channelConfig`), especificamente na aba **AUX** (`activeConfigTab === 'aux'`).

Nesse contexto, o usuário copia os **8 envios de auxiliares (AUX 1 a 8: Levels e On/Off)** de um canal de entrada de origem (ex: `CH 1 (Voz)`) e cola em outro canal de entrada de destino (ex: `CH 2 (Violão)`).

---

## 🔍 Contexto & Arquitetura

### 1. Diferença de Contextos de AUX:
- **Contexto Barramento MIX / Fone (`sends_on_faders`)**:
  - Origem/Destino: Barramento MIX 1 a 8 (`auxIdx`).
  - Dados: Os 32 canais de entrada que enviam para aquele MIX.
  - Tela esperada: `BARRAMENTO MIX / FONE`.
- **Contexto Canal de Entrada AUX (`input_channel_aux_sends`)**:
  - Origem/Destino: Canal de entrada específico (`activeConfigChannel` entre 0..31 ou 60..67).
  - Dados: Os 8 envios de AUX (AUX 1 a AUX 8: fader level e estado on/off) do canal.
  - Tela esperada: `AUX DO CANAL (INPUT)`.

### 2. Formato do Buffer Contextual (`window.contextClipboard`)
```javascript
window.contextClipboard = {
    type: 'input_channel_aux_sends',
    sourceId: ch,
    sourceName: 'CH 1 (Voz)',
    expectedScreen: 'AUX DO CANAL (INPUT)',
    data: [
        { aux: 1, level: 823, on: true },
        { aux: 2, level: 600, on: false },
        // ... até AUX 8
    ],
    validateTarget: () => {
        return activeConfigTab === 'aux' &&
               activeConfigChannel !== null &&
               ((activeConfigChannel >= 0 && activeConfigChannel <= 31) ||
                (activeConfigChannel >= 60 && activeConfigChannel <= 67));
    },
    pasteHandler: (targetCh) => executePasteInputChannelAuxSends(targetCh)
};
```

### 3. Proteção do Processador da 01V96 (Rate Limiting de 15ms)
Ao colar os 8 envios de auxiliares:
- São enviados comandos `kInputAUX/kAUX{1..8}Level` e `kInputAUX/kAUX{1..8}On`.
- O envio ocorre de forma sequencial com espaçamento de **15ms** entre cada auxiliar (`index * 15ms`), evitando flood no processador MIDI da mesa.

---

## 📊 Fluxograma de Operação (ASCII)

```text
========================================================================================
                          1. COPIAR NA ABA AUX DE UM CANAL
========================================================================================

  [ Usuário em Channel Config: CH 1 (Voz) na aba AUX ]
                          │
                          ▼
             [ Clica no botão 'COPIAR' ]
                          │
                          ▼
            [ copyActiveContext() ]
                          │
                          ▼
      [ Detecta: activeConfigChannel = 0 (CH 1), activeConfigTab = 'aux' ]
                          │
                          ▼
      [ Executa copyInputChannelAuxSends(0) ]
        • Lê state.aux1..8 e state.aux1..8On
        • Preenche window.contextClipboard com type 'input_channel_aux_sends'
        • sourceName: 'CH 1 (Voz)'
        • expectedScreen: 'AUX DO CANAL (INPUT)'
                          │
                          ▼
      [ OverlayInfo: "AUX DE CH 1 (VOZ) COPIADO COM SUCESSO!" ]
      [ Botão [ COLAR ] torna-se ATIVO e DESTACADO ]


========================================================================================
                          2. COLAR NA ABA AUX DE OUTRO CANAL
========================================================================================

  [ Usuário navega para CH 2 (Violão) na aba AUX ]
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
     "ERRO: DADOS NA MEMÓRIA       "Deseja colar os 8 envios de AUX
      SÃO DO CH 1 (VOZ).            de CH 1 (Voz) no CH 2 (Violão)?" ]
      ABRA AUX DO CANAL..." ]                    │
                                   ┌─────────────┴─────────────┐
                                   ▼ CANCELAR                  ▼ CONFIRMAR
                              [ Aborta ]                  [ Aplica state local ]
                                                                 │
                                                                 ▼
                                                          [ Emite via Socket com
                                                            delay de 15ms por AUX ]
                                                                 │
                                                                 ▼
                                                          [ Atualiza Faders/ONs na UI ]
                                                                 │
                                                                 ▼
                                                          [ OverlayInfo:
                                                            "AUX DE CH 2 (VIOLÃO)
                                                             COLADO COM SUCESSO!" ]
========================================================================================
```

---

## 📐 Proposed Changes

### Componente 1: Motor Contextual (`public/modules/copy_paste.js`)

#### [MODIFY] `public/modules/copy_paste.js`
- Adicionar helper universal `getChannelDisplayName(ch)` para resolver nomes dinâmicos tanto de Canais de Entrada quanto de Mixes/Buses.
- Implementar as funções:
  - `copyInputChannelAuxSends(ch)`: lê os 8 envios do canal e preenche o clipboard contextual.
  - `executePasteInputChannelAuxSends(targetCh)`: exibe o `ConfirmModal` com nomes de origem e destino, atualiza o estado local / UI e despacha os comandos via socket com intervalo seguro de 15ms.
- Atualizar `window.copyActiveContext()` para despachar `copyInputChannelAuxSends(activeConfigChannel)` quando em canal de entrada com aba `aux`.
- Atualizar `window.pasteActiveContext()` para despachar o `targetCh` correto para `input_channel_aux_sends`.
- Atualizar `window.updateCopyPasteUIState()` para validar o botão de colar no contexto atual.

---

### Componente 2: Renderização da UI, Dock & Bottom Bar (`public/modules/sidebar.js`)

#### [MODIFY] `public/modules/sidebar.js`
- **Suporte Unificado a Desktop (Sidebar Lateral), Mobile Retrato (Bottom Bar) e Mobile Menu Modal**:
  - Na arquitetura do app, o container `#buttonDock` (`.button-dock`) funciona tanto como a **Sidebar Lateral** (em desktop e mobile landscape) quanto como a **Bottom Bar Inferior** (em `is-portrait` em telefones).
  - Atualizar `renderDock('channelConfig')`:
    - Remover a restrição que limitava os botões apenas a barramentos (`36..43`), passando a exibir `COPIAR` e `COLAR` para qualquer canal aberto na aba AUX (`activeConfigTab === 'aux' && activeConfigChannel !== null`).
    - Com isso, os botões `COPIAR` e `COLAR` passam a ser renderizados perfeitamente na **Bottom Bar** quando em modo retrato em celulares.
  - Atualizar `switchTab(tabId)`:
    - Chamar `renderDock('channelConfig')` ao alternar abas, garantindo que os botões contextuais apareçam na Bottom Bar / Sidebar apenas quando a aba AUX estiver selecionada e sumam nas demais abas.
  - Atualizar `renderMobileMenu('channelConfig')` / `openMobileMenu`:
    - Sincronizar os botões `COPIAR` e `COLAR` no menu suspenso mobile para a aba `aux` de qualquer canal de entrada.

---

## 🧪 Verification Plan

### Testes Automatizados
```bash
node --check public/modules/copy_paste.js
node --check public/modules/sidebar.js
node --check public/modules/events.js
cargo check
```

### Validação Manual
1. **Copiar no CH 1**: Abrir o CH 1 na aba AUX. Clicar em `COPIAR` ➔ Verificar Toast *"AUX DE CH 1 COPIADO COM SUCESSO!"* e botão `COLAR` habilitado.
2. **Navegar para CH 2**: Trocar para o CH 2 (ainda na aba AUX). Clicar em `COLAR` ➔ Confirmar modal ("CH 1 no CH 2") ➔ Verificar que os 8 faders e botões ON assumem os valores copiados com o espaçamento seguro de 15ms.
3. **Validação de Incompatibilidade**:
   - Copiar AUX do CH 1.
   - Trocar de aba (ex: ir para `EQ` ou `DYN`) ou abrir um Barramento Mix.
   - Se tentar colar em contexto incompatível, verificar mensagem de erro explicativa indicando a tela esperada.
