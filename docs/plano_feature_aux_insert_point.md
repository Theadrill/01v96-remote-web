# Feature: Posição e Ponto de Inserção nos Auxiliares

Controle de **insert point** (PRE/POST) para canais individuais e configuração de
**posição e modo** de inserção nos buses auxiliares, replicando a funcionalidade
disponível na tela física da Yamaha 01V96.

---

## 1. Visão Geral e Objetivo

A tela de Auxiliar da 01V96 permite definir, para cada canal enviado a um bus auxiliar,
se o sinal é capturado **antes** (PRE) ou **depois** (POST) do fader de canal, além de
configurar o modo de inserção (FIXED/VARIABLE) e o ponto de inserção global e pré-point
do próprio bus auxiliar.

O objetivo é implementar essas duas camadas de controle na interface web:

1. **Insert Point por canal** — Um botão toggle no channel strip de cada canal dentro
   da tela de auxiliar, alternando entre PRE e POST.
2. **Configuração de inserção do bus auxiliar** — Painel de controle no mini fader do
   auxiliar (entre o macro fader e a sidebar), com as categorias **Global** e **Pre-Point**.

---

## 2. Conceitos

### 2.1 Insert Point (PRE / POST)

| Estado | Significado | Comportamento |
|--------|-------------|---------------|
| **PRE** (default) | Sinal capturado **antes** do fader | O envio ao auxiliar não é afetado pelo volume do fader do canal |
| **POST** | Sinal capturado **depois** do fader | O envio ao auxiliar é proporcional ao volume do fader do canal |

- **Default do canal:** PRE (estado DISABLED no botão)
- **Comportamento do toggle:** Clique alterna entre PRE e POST.
- **Persistência:** Estado salvo por canal, por auxiliar.

### 2.2 Configuração de Inserção do Bus Auxiliar

| Categoria | Campo | Estado DISABLED | Estado ATIVADO |
|-----------|-------|-----------------|----------------|
| **GLOBAL** | Insert Point | PRE | POST |
| **PRE-POINT** | Insert On/Off | PRE ON | POST ON |

### 2.3 Modo de Inserção

| Campo | Estado DISABLED | Estado ATIVADO |
|-------|-----------------|----------------|
| **MODE** | FIXED | VARIABLE |

### 2.4 All Nominal

| Campo | Comportamento |
|-------|---------------|
| **ALL NOMINAL** | Toggle on/off — quando ativado, todos os canais voltam ao ponto nominal (PRE) |

---

## 3. Elementos da Interface

### 3.1 Botão Insert Point no Channel Strip (Tela de Auxiliar)

**Localização:** Espaço entre o cabeçalho (número do canal) e o nome do canal no strip.

```
┌─────────────┐
│     01      │  ← cabeçalho (número do canal)
│   [PRE]     │  ← botão insert point (novo)
│   VOZ      │  ← nome do canal
│             │
│   [fader]   │
└─────────────┘
```

**Comportamento visual:**

| Estado | Aparência | Texto |
|--------|-----------|-------|
| PRE (default) | Botão DISABLED (cinza/ neutro) | `PRE` |
| POST | Botão COLORIDO (ativo) | `POST` |

**Ações:**
- Clique alterna o estado entre PRE e POST.
- Estado refletido imediatamente no backend via MIDI.

### 3.2 Indicador de Configuração no Mini Fader do Auxiliar

**Localização:** Nova área no mini fader do auxiliar, entre o macro fader de volume geral
e a sidebar. Funciona como um **botão clicável** que exibe o estado atual e, ao clicar,
abre um modal/overlay com as configurações.

**Layout:** Segue o padrão visual da `master-meter-section` (título centralizado + linhas
com label:valor).

```
┌──────────────────┬─────────┐
│   MINI FADER     │         │
│                  │         │
│  ┌────────────┐  │ SIDEBAR │
│  │  POSIÇÃO   │  │         │
│  │ GLOBAL:PRE │  │         │
│  │ PRE-POINT: │  │         │
│  │     POST   │  │         │
│  └────────────┘  │         │
│                  │         │
└──────────────────┴─────────┘
```

**Comportamento:**
- A área exibe apenas os **estados atuais** de GLOBAL e PRE-POINT (somente leitura visual).
- Ao clicar na área, abre um **modal** com todos os controles de configuração.

### 3.3 Modal de Configuração de Inserção do Auxiliar

Aberto ao clicar no indicador do mini fader. Contém:

```
┌─────────────────────────────────┐
│     CONFIGURAÇÃO DE INSERÇÃO    │
│                                 │
│  ALL NOMINAL          [toggle]  │  ← toggle on/off
│                                 │
│  ─────────────────────────────  │
│                                 │
│  MODE                          │
│  [FIXED / VARIABLE]  (toggle)  │
│                                 │
│  GLOBAL                        │
│  [PRE / POST]        (toggle)  │
│                                 │
│  PRE-POINT                     │
│  [PRE ON / POST ON]  (toggle)  │
│                                 │
│         [Fechar]                │
└─────────────────────────────────┘
```

**Campos e comportamento:**

| Campo | Tipo | Estado DISABLED | Estado ATIVADO |
|-------|------|-----------------|----------------|
| ALL NOMINAL | Toggle on/off | Desligado | Reseta todos os canais para PRE |
| MODE | Botão toggle | FIXED | VARIABLE |
| GLOBAL | Botão toggle | PRE | POST |
| PRE-POINT | Botão toggle | PRE ON | POST ON |

---

## 4. Estrutura de Dados (Proposta)

### 4.1 Estado de Insert Point por Canal

```json
{
  "auxInsertPoints": {
    "aux1": {
      "1": "POST",
      "2": "PRE",
      "3": "POST",
      "4": "PRE"
    },
    "aux2": {
      "1": "PRE",
      "2": "PRE"
    }
  }
}
```

### 4.2 Configuração de Inserção do Bus Auxiliar

```json
{
  "auxInsertConfig": {
    "aux1": {
      "mode": "FIXED",
      "global": "PRE",
      "prePoint": "PRE ON",
      "allNominal": false
    },
    "aux2": {
      "mode": "VARIABLE",
      "global": "POST",
      "prePoint": "POST ON",
      "allNominal": true
    }
  }
}
```

---

## 5. Mapeamento MIDI (Referência)

> **Nota:** Os comandos MIDI exatos para insert point na 01V96 serão confirmados
> durante a implementação. A estrutura abaixo segue o padrão SysEx da mesa.

| Ação | Direção | Descrição |
|------|---------|-----------|
| Consulta insert point | TX → RX | Pergunta o estado PRE/POST de um canal em um aux |
| Resposta insert point | RX → TX | Retorna o estado atual do canal no aux |
| Set insert point | TX → RX | Altera o estado PRE/POST de um canal em um aux |
| Consulta config aux | TX → RX | Pergunta modo, global, pre-point de um aux |
| Set config aux | TX → RX | Define modo, global, pre-point de um aux |

---

## PLANO DE IMPLEMENTAÇÃO

*A ser definido na fase de revisão.*
