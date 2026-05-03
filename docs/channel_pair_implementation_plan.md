# Channel Pair — Plano de Implementação

**Data:** 2026-05-03
**Status:** Planejamento detalhado — pronto para execução por passos

---

## 1. Contexto

A mesa Yamaha 01V96 suporta "pairing" de canais adjacentes (1+2, 3+4, etc.), que copia as configurações de um canal para o outro e sincroniza os faders fisicamente. O app atual trata cada canal de forma independente, logo:

- Ao parear na mesa física, os dois faders se movem juntos no hardware, **mas no app cada fader move isolado**.
- Não há botão de pair no app — o usuário só pode parear pela mesa física.

Esta feature resolve ambos os problemas.

---

## 2. SysEx Mapeados

### 2.1 Padrão da Mensagem de 14 bytes — Estado do Link (PAIR)

```
F0 43 10 3E 7F 01 18 00 [CH_BYTE] 00 00 00 [STATE] F7
```

| Campo      | Descrição                                                      |
|------------|----------------------------------------------------------------|
| `CH_BYTE`  | Índice 0-based do canal **ímpar** do par (CH1=0x00, CH3=0x02, CH21=0x14) |
| `STATE`    | `0x01` = pair ativo · `0x00` = pair inativo (unpair)          |

**Cálculo de `CH_BYTE`:** `Math.floor(chIdx / 2) * 2` ou simplesmente `chIdx % 2 === 0 ? chIdx : chIdx - 1`

**Exemplos confirmados:**
| Par        | CH_BYTE | Mensagem (simplificada)                              |
|------------|---------|------------------------------------------------------|
| CH1 + CH2  | `0x00`  | `...01 18 00 00 00 00 00 01...`                      |
| CH3 + CH4  | `0x02`  | `...01 18 00 02 00 00 00 01...`                      |
| CH21 + CH22| `0x14`  | `...01 18 00 14 00 00 00 01...`                      |
| Unpair 1+2 | `0x00`  | `...01 18 00 00 00 00 00 00...`                      |

---

### 2.2 Padrão da Mensagem de 12 bytes — Auxiliar de Direção

```
F0 43 10 3E 7F 11 [RESET_FLAG] 00 [SOURCE_CH] 00 [TARGET_CH] F7
```

| Campo        | Descrição                                                      |
|--------------|----------------------------------------------------------------|
| `RESET_FLAG` | `0x00` = pair normal · `0x01` = reset ambos                   |
| `SOURCE_CH`  | Índice 0-based do canal **fonte** (quem copia seus dados)      |
| `TARGET_CH`  | Índice 0-based do canal **destino** (quem recebe os dados)     |

**Exemplos confirmados:**

| Ação             | RESET_FLAG | SOURCE_CH | TARGET_CH | Raw (simplificado)              |
|------------------|------------|-----------|-----------|----------------------------------|
| Pair CH1 → CH2   | `00`       | `00`      | `01`      | `...11 00 00 00 00 01 F7`       |
| Pair CH2 → CH1   | `00`       | `01`      | `00`      | `...11 00 00 01 00 00 F7`       |
| Pair CH3 → CH4   | `00`       | `02`      | `03`      | `...11 00 00 02 00 03 F7`       |
| Reset Both 1+2   | `01`       | `00`      | `01`      | `...11 01 00 00 00 01 F7`       |

> **Nota sobre Reset Both:** A mensagem de 14 bytes acompanhante do Reset Both tem `STATE = 0x01`, indicando que o reset **não desfaz** o pair — ele reseta os parâmetros de ambos os canais e mantém/recria a ligação.

---

### 2.3 Regra de Pares Válidos

Apenas canais adjacentes com o mesmo índice base (0-based):
- CH1(0) + CH2(1), CH3(2) + CH4(3), ..., CH31(30) + CH32(31)
- **Não é possível** parear CH1 com CH3, CH2 com CH4, etc.
- O canal ímpar (UI) = índice par (0-based) = sempre é o `CH_BYTE` do par.

---

## 3. Arquitetura de Estado

### 3.1 Frontend — `globals.js`

Adicionar ao objeto `channelStates[i]`:

```js
paired: false,      // bool: este canal está em pair?
pairedWith: null,   // number|null: índice do canal parceiro
pairSource: null,   // number|null: qual canal foi a fonte na última operação
```

Os dois canais do par devem ter seus estados espelhados:
```js
// Ao fazer pair de chA com chB:
channelStates[chA].paired = true;   channelStates[chA].pairedWith = chB;
channelStates[chB].paired = true;   channelStates[chB].pairedWith = chA;

// Ao desfazer:
channelStates[chA].paired = false;  channelStates[chA].pairedWith = null;
channelStates[chB].paired = false;  channelStates[chB].pairedWith = null;
```

---

### 3.2 Backend — Novo módulo `src/pair.js`

O `server.js` **não deve** montar os bytes de pair diretamente. Um novo módulo isolado `src/pair.js` será responsável por:

1. Montar os bytes SysEx corretos
2. Enviar via MIDI output
3. Exportar funções nomeadas para o `server.js` chamar

```js
// src/pair.js — interface esperada
module.exports = {
    pairChannels(midiOutput, chA, chB, sourceCh),
    unpairChannels(midiOutput, chA, chB),
    resetBothChannels(midiOutput, chA, chB),
};
```

**Implementação interna:**
```js
function buildPairAuxMsg(resetFlag, sourceCh, targetCh) {
    return [0xF0, 0x43, 0x10, 0x3E, 0x7F, 0x11,
            resetFlag, 0x00, sourceCh, 0x00, targetCh, 0xF7];
}

function buildPairStateMsg(chByte, state) {
    return [0xF0, 0x43, 0x10, 0x3E, 0x7F, 0x01, 0x18,
            0x00, chByte, 0x00, 0x00, 0x00, state, 0xF7];
}

function getChByte(chA, chB) {
    // Sempre o menor índice (canal ímpar da UI)
    return Math.min(chA, chB);
}

function pairChannels(midiOutput, chA, chB, sourceCh) {
    const targetCh = sourceCh === chA ? chB : chA;
    const chByte = getChByte(chA, chB);
    midiOutput.sendMessage(buildPairAuxMsg(0x00, sourceCh, targetCh));
    midiOutput.sendMessage(buildPairStateMsg(chByte, 0x01));
}

function unpairChannels(midiOutput, chA, chB) {
    const chByte = getChByte(chA, chB);
    midiOutput.sendMessage(buildPairStateMsg(chByte, 0x00));
}

function resetBothChannels(midiOutput, chA, chB) {
    const chByte = getChByte(chA, chB);
    midiOutput.sendMessage(buildPairAuxMsg(0x01, chA, chB));
    midiOutput.sendMessage(buildPairStateMsg(chByte, 0x01));
}
```

### 3.3 Backend — `server.js`

Adicionar um novo event listener do socket para `pairChannel`:

```js
const pairModule = require('./src/pair');

socket.on('pairChannel', (data) => {
    // data: { action: 'pair'|'unpair'|'reset', chA: number, chB: number, sourceCh?: number }
    const { action, chA, chB, sourceCh } = data;
    if (action === 'pair')   pairModule.pairChannels(midiOutput, chA, chB, sourceCh);
    if (action === 'unpair') pairModule.unpairChannels(midiOutput, chA, chB);
    if (action === 'reset')  pairModule.resetBothChannels(midiOutput, chA, chB);
});
```

---

## 4. Arquivos a Modificar

| Arquivo | Tipo | O que muda |
|---------|------|-----------|
| `src/pair.js` | **[NOVO]** | Módulo de montagem e envio de SysEx de pair |
| `server.js` | Modificar | Importar `pair.js` + adicionar handler `pairChannel` |
| `public/modules/globals.js` | Modificar | Adicionar `paired`, `pairedWith`, `pairSource` ao `channelStates` |
| `public/modules/routing.js` | Modificar | Seção Pair na aba ETC + funções `openPairModal`, `pairChannels`, `unpairChannel`, `resetBothChannels` |
| `public/modules/channel_strip.js` | Modificar | `createPairedChannelStrip()` + ajuste no `initUI()` |
| `public/modules/socket.js` | Modificar | Handler para pair vindo do hardware (`kChannelPair`) |
| `public/index.html` | Modificar | Adicionar `pairModal` e `pairConfirmModal` |
| `public/style.css` | Modificar | Classes `.fader-card-paired` (desktop e mobile) |

---

## 5. UI — Fluxo de Interação

### 5.1 Botão na aba ETC

**Canal não pareado:**
```
[ ♥ PAIR  CH X + CH Y ]   ← botão estilo "link", cor azul suave
```

**Canal pareado:**
```
┌─ 🔗 PAREADO ─────────────────┐
│ CH X + CH Y        [UNPAIR] │
└──────────────────────────────┘
```

### 5.2 Modal de Pair (`pairModal`)

Abre ao clicar no botão PAIR. Contém 3 botões empilhados:

```
PAIR DE CANAIS
CH X + CH Y
─────────────────────────────────
[  CH X → Y  ]   Copiar CH X para CH Y
[  CH Y → X  ]   Copiar CH Y para CH X
[  RESETAR AMBOS  ]
[  CANCELAR  ]
```

### 5.3 Modal de Confirmação (`pairConfirmModal`)

Aparece ao clicar em qualquer das 3 opções do modal anterior:

**Para pair X→Y:**
> "Parear canal X + Y, copiando as informações do canal X"

**Para pair Y→X:**
> "Parear canal X + Y, copiando as informações do canal Y"

**Para Reset Both:**
> "Resetar as informações do canal X e Y completamente?"

Botões: `[CONFIRMAR]` · `[CANCELAR]`

---

## 6. UI — Fader Pareado (Channel Strip)

### 6.1 Estratégia

Ao invés de sincronizar dois faders em tempo real no app (complexo, propenso a lag), a abordagem é:

- **Renderizar um único card "wide"** que ocupa o espaço de dois canais
- O fader dentro do card **controla apenas `chA`** (canal ímpar)
- A mesa física já propaga o movimento para `chB` automaticamente
- O nome no topo exibe `CH X + CH Y` (ou os nomes customizados)

### 6.2 Renderização em `initUI()`

```js
for (let i = 0; i < NUM_CHANNELS; i++) {
    const s = channelStates[i];

    // Canal par que já foi renderizado pelo seu parceiro ímpar → pular
    if (s.paired && s.pairedWith !== null && i % 2 !== 0) continue;

    // Canal ímpar com pair ativo → renderizar card duplo
    if (s.paired && s.pairedWith !== null && i % 2 === 0) {
        html += createPairedChannelStrip(i, s.pairedWith);
        continue;
    }

    // Canal normal
    html += createChannelStrip(i, false);
}
```

### 6.3 Função `createPairedChannelStrip(chA, chB)`

```js
function createPairedChannelStrip(chA, chB) {
    const sA = channelStates[chA];
    const sB = channelStates[chB];
    const nameA = sA.name || `CH ${chA + 1}`;
    const nameB = sB.name || `CH ${chB + 1}`;
    const pairedTitle = `${nameA}+${nameB}`;
    // ...
    // Layout Desktop: usa createDesktopStrip() com customClass "fader-card-paired"
    // Layout Mobile: usa createMobileStrip() com customClass "fader-card-paired"
    // Em ambos os casos, evtCh = chA, fader controla apenas o canal A
}
```

### 6.4 CSS do Card Pareado

```css
/* Desktop */
.fader-card-desktop.fader-card-paired {
    flex: 2;
    min-width: 130px;
    border: 1px solid #34c759;
    background: linear-gradient(180deg, #0a1f10 0%, #111 100%);
    position: relative;
}

.fader-card-desktop.fader-card-paired::after {
    content: '🔗';
    position: absolute;
    top: 4px;
    right: 6px;
    font-size: 9px;
    opacity: 0.6;
}

/* Mobile */
.fader-card.fader-card-paired {
    min-width: calc(85px * 2 + 8px);
    border: 1px solid #34c759;
}
```

---

## 7. Recepcionar Pair Iniciado pelo Hardware

Quando o técnico faz pair **diretamente na mesa física**, o servidor recebe os SysEx de volta via MIDI input. O servidor deve:

1. Detectar os bytes `01 18 00 [CH_BYTE] ... [STATE]`
2. Emitir para o frontend via socket: `socket.emit('update', { type: 'kChannelPair', channel: chByte, value: state })`

O frontend (`socket.js`) trata:

```js
// Dentro do socket.on('update', ...):
if (d.type === 'kChannelPair') {
    const chA = d.channel; // CH_BYTE = índice do canal ímpar (0-based)
    const chB = chA + 1;
    const isPaired = !!d.value;
    channelStates[chA].paired = isPaired;
    channelStates[chA].pairedWith = isPaired ? chB : null;
    channelStates[chB].paired = isPaired;
    channelStates[chB].pairedWith = isPaired ? chA : null;
    initUI();
}
```

---

## 8. Passos de Implementação

> Seguir a ordem exata. Cada passo é autossuficiente e testável antes de avançar.

---

### PASSO 1 — Estado Base + UI (Modais e Botões)

**Arquivos:** `globals.js` · `index.html` · `style.css`

**Objetivo:** Preparar o estado e toda a interface visual antes de qualquer lógica.

#### 1.1 — `public/modules/globals.js`

No loop `for (let i = 0; i < NUM_CHANNELS; i++)`, dentro do objeto `channelStates.push({...})`, adicionar **três novos campos** ao final:

```js
paired: false,      // bool: este canal está em pair?
pairedWith: null,   // number|null: índice 0-based do canal parceiro
pairSource: null,   // number|null: qual canal foi a fonte na última operação de pair
```

#### 1.2 — `public/index.html`

Adicionar **dois novos modais** antes do fechamento de `</body>`. Usar z-index 20500 e 21000 (acima de todos os existentes).

**Modal 1 — `pairModal`** (seleção de direção):
- Título: "PAIR DE CANAIS"
- Subtítulo dinâmico `id="pairModalSubtitle"` que mostrará "CH X + CH Y"
- Botão 1: `id="pairBtn_AtoB"` — texto dinâmico "CH X → Y" com subtexto "Copiar CH X para CH Y" — `onclick="confirmPairDirection('a_to_b')"`
- Botão 2: `id="pairBtn_BtoA"` — texto dinâmico "CH Y → X" com subtexto "Copiar CH Y para CH X" — `onclick="confirmPairDirection('b_to_a')"`
- Botão 3: `id="pairBtn_reset"` — texto "RESETAR AMBOS" — fundo `#555` — `onclick="confirmPairDirection('reset')"`
- Botão fechar: `onclick="document.getElementById('pairModal').style.display='none'"`

**Modal 2 — `pairConfirmModal`** (confirmação):
- Título: `id="pairConfirmTitle"` (preenchido via JS)
- Texto: `id="pairConfirmText"` (preenchido via JS)
- Botão OK: `id="pairConfirmOkBtn"` — fundo verde — `onclick` atribuído via JS
- Botão cancelar: fecha o modal

#### 1.3 — `public/style.css`

Adicionar ao final do arquivo:

```css
/* === FADER CARD PAREADO === */

/* Desktop: ocupa espaço de dois canais */
.fader-card-desktop.fader-card-paired {
    flex: 2;
    min-width: 130px;
    border: 1px solid #34c759;
    background: linear-gradient(180deg, #0a1f10 0%, #111 100%);
    position: relative;
}
.fader-card-desktop.fader-card-paired::after {
    content: '🔗';
    position: absolute;
    top: 4px;
    right: 6px;
    font-size: 9px;
    opacity: 0.6;
}
/* Nome no card pareado */
.fader-card-desktop.fader-card-paired .desk-label,
.fader-card-desktop.fader-card-paired .desk-footer-label {
    color: #34c759;
    font-size: 9px;
    letter-spacing: 0;
}

/* Mobile: largura de dois cards + gap */
.fader-card.fader-card-paired {
    min-width: calc(85px * 2 + 8px);
    border: 1px solid #34c759;
    background: linear-gradient(180deg, #0a1f10 0%, #111 100%);
}
```

---

### PASSO 2 — Módulo `src/pair.js` (Backend)

**Arquivo:** `src/pair.js` (NOVO)

**Objetivo:** Centralizar 100% da lógica de montagem e envio de SysEx de pair. O `server.js` nunca deve montar bytes manualmente.

**Criar o arquivo `src/pair.js` com o seguinte conteúdo completo:**

```js
'use strict';

/**
 * Monta a mensagem auxiliar de 12 bytes (indica direção e flags)
 * F0 43 10 3E 7F 11 [RESET_FLAG] 00 [SOURCE] 00 [TARGET] F7
 */
function buildAuxMsg(resetFlag, sourceCh, targetCh) {
    return [0xF0, 0x43, 0x10, 0x3E, 0x7F, 0x11,
            resetFlag, 0x00, sourceCh, 0x00, targetCh, 0xF7];
}

/**
 * Monta a mensagem de estado de 14 bytes (liga/desliga o pair)
 * F0 43 10 3E 7F 01 18 00 [CH_BYTE] 00 00 00 [STATE] F7
 * CH_BYTE = sempre o menor índice do par (ex: CH1=0, CH3=2)
 */
function buildStateMsg(chByte, state) {
    return [0xF0, 0x43, 0x10, 0x3E, 0x7F, 0x01, 0x18,
            0x00, chByte, 0x00, 0x00, 0x00, state, 0xF7];
}

/** Retorna o CH_BYTE = menor índice (canal ímpar da UI) */
function getChByte(chA, chB) {
    return Math.min(chA, chB);
}

/**
 * Ativa pair entre chA e chB, copiando dados de sourceCh para o outro.
 * Envia: mensagem auxiliar (12b) + mensagem de estado ON (14b)
 */
function pairChannels(midiOutput, chA, chB, sourceCh) {
    const targetCh = sourceCh === chA ? chB : chA;
    const chByte = getChByte(chA, chB);
    midiOutput.sendMessage(buildAuxMsg(0x00, sourceCh, targetCh));
    midiOutput.sendMessage(buildStateMsg(chByte, 0x01));
}

/**
 * Desativa pair entre chA e chB.
 * Envia apenas: mensagem de estado OFF (14b)
 */
function unpairChannels(midiOutput, chA, chB) {
    const chByte = getChByte(chA, chB);
    midiOutput.sendMessage(buildStateMsg(chByte, 0x00));
}

/**
 * Reseta ambos os canais e mantém o pair ativo.
 * Envia: mensagem auxiliar com RESET_FLAG=1 (12b) + mensagem de estado ON (14b)
 */
function resetBothChannels(midiOutput, chA, chB) {
    const chByte = getChByte(chA, chB);
    midiOutput.sendMessage(buildAuxMsg(0x01, chA, chB));
    midiOutput.sendMessage(buildStateMsg(chByte, 0x01));
}

module.exports = { pairChannels, unpairChannels, resetBothChannels };
```

---

### PASSO 3 — Conectar Backend e Lógica Frontend

**Arquivos:** `server.js` · `public/modules/routing.js` · `public/modules/socket.js`

**Objetivo:** Ligar o botão da UI ao módulo `pair.js`, e detectar pair feito diretamente no hardware.

#### 3.1 — `server.js`

**3.1.a — Importar o módulo** (adicionar perto dos outros `require` no topo):
```js
const pairModule = require('./src/pair');
```

**3.1.b — Handler de eventos do socket** (adicionar junto aos outros `socket.on`):
```js
socket.on('pairChannel', (data) => {
    // data: { action: 'pair'|'unpair'|'reset', chA: number, chB: number, sourceCh?: number }
    if (!midiOutput) return;
    const { action, chA, chB, sourceCh } = data;
    if (action === 'pair')   pairModule.pairChannels(midiOutput, chA, chB, sourceCh);
    if (action === 'unpair') pairModule.unpairChannels(midiOutput, chA, chB);
    if (action === 'reset')  pairModule.resetBothChannels(midiOutput, chA, chB);
});
```

**3.1.c — Parser de SysEx de entrada** (no handler que processa mensagens MIDI recebidas da mesa):

Localizar onde o `server.js` processa os bytes recebidos do MIDI input. Adicionar detecção do padrão `01 18 00`:
```js
// Detectar pair vindo do hardware (14 bytes: ...01 18 00 CH_BYTE ... STATE...)
if (msg.length === 14 &&
    msg[5] === 0x01 && msg[6] === 0x18 && msg[7] === 0x00) {
    const chByte = msg[8];   // índice 0-based do canal ímpar
    const state  = msg[12];  // 0x01 = paired, 0x00 = unpaired
    io.emit('update', { type: 'kChannelPair', channel: chByte, value: state });
    return;
}
```

#### 3.2 — `public/modules/routing.js`

Adicionar ao final da função `window.renderRouting` (após a seção de BUS/STEREO existente), uma nova seção de Pair **somente para canais de input (chIdx 0–31)**:

```js
// Dentro de renderRouting(), após o HTML existente, concatenar:
if (chIdx >= 0 && chIdx <= 31) {
    container.querySelector('.routing-container').innerHTML += renderPairSection(chIdx);
}
```

**Nova função `renderPairSection(chIdx)`** (adicionar como função privada no arquivo):
```js
function renderPairSection(chIdx) {
    const partnerIdx = chIdx % 2 === 0 ? chIdx + 1 : chIdx - 1;
    const state = channelStates[chIdx];
    const isPaired = state && state.paired;

    if (isPaired) {
        return `
        <div class="routing-section" style="border-top:1px solid #333; padding-top:20px;">
            <p style="font-size:10px;color:#666;text-transform:uppercase;letter-spacing:1px;margin-bottom:15px;">Pair de Canal</p>
            <div style="background:#0a1f10;border:1px solid #34c759;border-radius:10px;padding:16px;display:flex;align-items:center;justify-content:space-between;">
                <div>
                    <span style="color:#34c759;font-size:13px;font-weight:bold;">🔗 PAREADO</span><br>
                    <span style="color:#aaa;font-size:11px;margin-top:4px;display:block;">CH ${chIdx+1} + CH ${state.pairedWith+1}</span>
                </div>
                <button onclick="openUnpairConfirm(${chIdx})"
                    style="background:#c62828;color:#fff;border:none;border-radius:8px;padding:10px 16px;font-size:12px;font-weight:bold;cursor:pointer;">
                    🔌 UNPAIR
                </button>
            </div>
        </div>`;
    } else {
        return `
        <div class="routing-section" style="border-top:1px solid #333; padding-top:20px;">
            <p style="font-size:10px;color:#666;text-transform:uppercase;letter-spacing:1px;margin-bottom:15px;">Pair de Canal</p>
            <button onclick="openPairModal(${chIdx})"
                style="width:100%;height:55px;background:#1a1f2e;border:1px solid #5cacee;color:#5cacee;border-radius:10px;font-size:14px;font-weight:bold;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:10px;">
                ♥ PAIR &nbsp; CH ${chIdx+1} + CH ${partnerIdx+1}
            </button>
        </div>`;
    }
}
```

**Novas funções globais** (adicionar como `window.xxx` no `routing.js`):

```js
// Variável de contexto do modal (armazena chA/chB enquanto modal está aberto)
let _pairCtx = { chA: null, chB: null };

window.openPairModal = function(chIdx) {
    const partnerIdx = chIdx % 2 === 0 ? chIdx + 1 : chIdx - 1;
    _pairCtx = { chA: Math.min(chIdx, partnerIdx), chB: Math.max(chIdx, partnerIdx) };
    document.getElementById('pairModalSubtitle').innerText = `CH ${_pairCtx.chA+1} + CH ${_pairCtx.chB+1}`;
    document.getElementById('pairBtn_AtoB').innerHTML = `CH ${_pairCtx.chA+1} → ${_pairCtx.chB+1}<br><small style="font-size:10px;font-weight:normal;">Copiar CH ${_pairCtx.chA+1} para CH ${_pairCtx.chB+1}</small>`;
    document.getElementById('pairBtn_BtoA').innerHTML = `CH ${_pairCtx.chB+1} → ${_pairCtx.chA+1}<br><small style="font-size:10px;font-weight:normal;">Copiar CH ${_pairCtx.chB+1} para CH ${_pairCtx.chA+1}</small>`;
    document.getElementById('pairModal').style.display = 'flex';
};

window.confirmPairDirection = function(direction) {
    const { chA, chB } = _pairCtx;
    const confirmModal = document.getElementById('pairConfirmModal');
    const title = document.getElementById('pairConfirmTitle');
    const text = document.getElementById('pairConfirmText');
    const okBtn = document.getElementById('pairConfirmOkBtn');

    if (direction === 'a_to_b') {
        title.innerText = 'CONFIRMAR PAIR';
        text.innerText = `Parear canal ${chA+1} + ${chB+1}, copiando as informações do canal ${chA+1}.`;
        okBtn.onclick = () => { executePair(chA, chB, chA); confirmModal.style.display='none'; document.getElementById('pairModal').style.display='none'; };
    } else if (direction === 'b_to_a') {
        title.innerText = 'CONFIRMAR PAIR';
        text.innerText = `Parear canal ${chA+1} + ${chB+1}, copiando as informações do canal ${chB+1}.`;
        okBtn.onclick = () => { executePair(chA, chB, chB); confirmModal.style.display='none'; document.getElementById('pairModal').style.display='none'; };
    } else { // reset
        title.innerText = 'RESETAR AMBOS?';
        text.innerText = `Resetar as informações do canal ${chA+1} e ${chB+1} completamente. O pair será mantido.`;
        okBtn.style.background = '#e65100';
        okBtn.onclick = () => { executeResetBoth(chA, chB); confirmModal.style.display='none'; document.getElementById('pairModal').style.display='none'; };
    }
    confirmModal.style.display = 'flex';
};

window.openUnpairConfirm = function(chIdx) {
    const partnerIdx = channelStates[chIdx].pairedWith;
    _pairCtx = { chA: Math.min(chIdx, partnerIdx), chB: Math.max(chIdx, partnerIdx) };
    const { chA, chB } = _pairCtx;
    const title = document.getElementById('pairConfirmTitle');
    const text = document.getElementById('pairConfirmText');
    const okBtn = document.getElementById('pairConfirmOkBtn');
    title.innerText = 'DESFAZER PAIR?';
    text.innerText = `Deseja desparear o canal ${chA+1} e ${chB+1}? Os canais voltarão a ser independentes.`;
    okBtn.style.background = '#c62828';
    okBtn.innerText = 'SIM, UNPAIR';
    okBtn.onclick = () => { executeUnpair(chA, chB); document.getElementById('pairConfirmModal').style.display='none'; };
    document.getElementById('pairConfirmModal').style.display = 'flex';
};

function executePair(chA, chB, sourceCh) {
    if (!appReady) return;
    socket.emit('pairChannel', { action: 'pair', chA, chB, sourceCh });
    channelStates[chA].paired = true; channelStates[chA].pairedWith = chB;
    channelStates[chB].paired = true; channelStates[chB].pairedWith = chA;
    channelStates[chA].pairSource = sourceCh;
    renderRouting(activeConfigChannel);
    initUI();
}

function executeUnpair(chA, chB) {
    if (!appReady) return;
    socket.emit('pairChannel', { action: 'unpair', chA, chB });
    channelStates[chA].paired = false; channelStates[chA].pairedWith = null; channelStates[chA].pairSource = null;
    channelStates[chB].paired = false; channelStates[chB].pairedWith = null; channelStates[chB].pairSource = null;
    renderRouting(activeConfigChannel);
    initUI();
}

function executeResetBoth(chA, chB) {
    if (!appReady) return;
    socket.emit('pairChannel', { action: 'reset', chA, chB });
    // Pair permanece ativo — apenas parâmetros foram resetados na mesa
}
```

#### 3.3 — `public/modules/socket.js`

No listener `socket.on('update', (d) => {...})`, **dentro do bloco de inputs (0–31)**, adicionar antes do fechamento `} // FIM DO BLOCO DE INPUTS`:

```js
// Pair iniciado pelo hardware físico
if (d.type === 'kChannelPair') {
    const chA = d.channel;       // CH_BYTE = índice ímpar (0-based)
    const chB = chA + 1;
    const isPaired = !!d.value;
    channelStates[chA].paired = isPaired;
    channelStates[chA].pairedWith = isPaired ? chB : null;
    channelStates[chB].paired = isPaired;
    channelStates[chB].pairedWith = isPaired ? chA : null;
    if (typeof initUI === 'function') initUI();
    return;
}
```

> **Atenção:** Este handler deve estar **fora** do guard `if (typeof d.channel === 'number' && d.channel < NUM_CHANNELS)` ou garantir que `d.channel` seja verificado antes de acessar `channelStates[chB]` para não estourar o array (chB max = 31).

---

### PASSO 4 — Fader Unificado para Canais Pareados

**Arquivo:** `public/modules/channel_strip.js`

**Objetivo:** Ao invés de renderizar dois cards separados para canais pareados, renderizar um único card "wide" que controla apenas o canal ímpar (chA). A mesa propaga o movimento ao chB automaticamente.

#### 4.1 — Ajuste no loop de `initUI()`

Localizar o loop principal de renderização de canais:
```js
for (let i = 0; i < NUM_CHANNELS; i++) {
    html += createChannelStrip(i, false);
}
```

Substituir por:
```js
for (let i = 0; i < NUM_CHANNELS; i++) {
    const s = channelStates[i];
    // Canal par já renderizado pelo ímpar → pular
    if (s && s.paired && s.pairedWith !== null && i % 2 !== 0) continue;
    // Canal ímpar com pair → card duplo
    if (s && s.paired && s.pairedWith !== null && i % 2 === 0) {
        html += createPairedChannelStrip(i, s.pairedWith);
        continue;
    }
    html += createChannelStrip(i, false);
}
```

> **Atenção:** O código acima está dentro de um bloco `else` que verifica `!outsMode`. Localizar o trecho correto em `initUI()` (aproximadamente linha 525 do arquivo atual) antes de modificar.

#### 4.2 — Nova função `createPairedChannelStrip(chA, chB)`

Adicionar após `createChannelStrip()`:

```js
function createPairedChannelStrip(chA, chB) {
    const sA = channelStates[chA];
    const nameA = (sA.name || `CH ${chA+1}`).substring(0, 4);
    const nameB = (channelStates[chB].name || `CH ${chB+1}`).substring(0, 4);
    const pairedLabel = `${nameA}+${nameB}`;
    const val = sA.value || 0;
    const isOn = sA.on || false;

    if (layoutMode === 'desktop') {
        return createDesktopStrip({
            id: chA,
            evtCh: chA,
            title: `${chA+1}+${chB+1}`,
            name: pairedLabel,
            customClass: 'fader-card-paired',
            isMaster: false,
            hasSolo: false,
            onAction: `toggleState('kInputChannelOn/kChannelOn', ${chA})`,
            configAction: `openChannelConfig(event, ${chA})`,
            val,
            isOn,
            dbLabel: rawToDb(val, false, false),
            type: 'main'
        });
    }

    // Mobile
    return createMobileStrip({
        id: chA,
        evtCh: chA,
        title: `CH ${chA+1}+${chB+1}`,
        name: pairedLabel,
        customClass: 'fader-card-paired',
        isMaster: false,
        hasSolo: false,
        onAction: `toggleState('kInputChannelOn/kChannelOn', ${chA})`,
        configAction: `openChannelConfig(event, ${chA})`,
        val,
        isOn,
        dbLabel: rawToDb(val, true, false)
    });
}
```

#### 4.3 — Atualização de UI ao receber fader do canal par

No `socket.js`, no handler `kInputFader/kFader`, quando o canal recebido for o `chB` de um par, atualizar também o elemento de UI do `chA` (que é o fader renderizado):

```js
if (d.type === 'kInputFader/kFader') {
    const s = channelStates[d.channel];
    // Se este é o canal par (chB) e está pareado, atualizar o fader do chA
    if (s && s.paired && d.channel % 2 !== 0) {
        updateUI(s.pairedWith, d.value, undefined, undefined);
    }
    updateUI(d.channel, d.value, undefined, undefined);
}
```

> **Nota:** Esta modificação é no `socket.js`, não no `channel_strip.js`. Adicionar junto ao handler existente de `kInputFader/kFader` (linha ~49 do socket.js atual).

---

## 9. Verificação

| Cenário | Resultado Esperado |
|---------|-------------------|
| Abrir aba ETC de CH1 (não pareado) | Botão PAIR CH1+CH2 aparece |
| Clicar PAIR → CH1→CH2 → Confirmar | SysEx enviados, fader duplo renderizado, nome "CH1+CH2" |
| Abrir aba ETC de CH2 (pareado) | Botão UNPAIR aparece |
| Clicar UNPAIR → Confirmar | SysEx de unpair, faders separados voltam |
| Parear na mesa física | App detecta e re-renderiza |
| Mover fader de canal pareado no app | Apenas chA é emitido; mesa move chB automaticamente |
| Abrir aba ETC de canal ímpar (CH3, CH5...) | Botão PAIR com o parceiro correto |
| Tentar parear CH1 com CH3 | Não permitido — UI não oferece essa opção |

---

## 10. Notas Finais

- **Sem polling / sync extra:** A estratégia de fader único evita toda a complexidade de manter dois faders em sync no frontend.
- **Estado local vs. hardware:** O estado de pair é mantido no `channelStates` local. Se o servidor reiniciar, o estado é resetado. Uma sincronização inicial via `sync` event pode ser adicionada futuramente.
- **Reset Both:** Mantém o pair ativo e reseta os parâmetros dos dois canais. Não é o mesmo que unpair.
- **Canais de saída (Mix/Bus/Master):** Pair não é aplicável — o botão não aparece na aba ETC desses canais.
