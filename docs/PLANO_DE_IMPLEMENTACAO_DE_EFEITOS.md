# Status do Parâmetro HOLD (Gate Reverb)
- [x] 0 - 150 (Manual Audit - Done)
- [x] 151 - 175 (Manual Audit - Done)
- [x] 176 - 215 (Manual Audit - Done)
- [x] DECAY (Gate Sync - Done)
- **Progresso Atual:** 100.0% (Mapeamento Completo de HOLD e DECAY)
- **Última Verificação:** DECAY Step 159 (42.3s) - Mapeamento de Reverbs Finalizado

| Range | Status | Comentário |
|-------|--------|------------|
| 0-10  | ✅ OK | Linear (0.02ms a 0.52ms) |
| 11-150| ✅ OK | Progressão geométrica verificada (20.6ms a 117ms) |
| 151-215| ✅ OK | **Auditoria 1:1 Completa** - Mapeamento individual de cada step (122ms a 1.96s) |

---

# Plano de Implementação de Efeitos - Yamaha 01V96

Este documento descreve a estratégia de engenharia reversa, arquitetura e interface para a integração completa dos 4 processadores de efeitos da Yamaha 01V96 no ecossistema web.

---

## 1. Documentação Técnica

### 1.1. Endereçamento de Parâmetros (Controle Direto)
*   **Estrutura:** `F0 43 10 3E 7F 01 58 [PARAM] [SLOT] 00 00 00 [VAL] F7`
*   **Slot:** `00` (FX1), `01` (FX2), `02` (FX3), `03` (FX4)

### 1.2. Controles Comuns (Presentes em todos os efeitos)
*   **Mix Balance (0x30 / 48 dec)**: Range `00-64` HEX (0-100%).
*   **Effect Type (0x31 / 49 dec)**: ID do Algoritmo.
*   **Bypass (0x34 / 52 dec)**: `00` = Ativo (ON), `01` = Mudo (Bypass).

---

## 2. Estrutura e Arquitetura Proposta

### 2.1. Conversão de Frequências (Padrão Yamaha)
Tabela de 1/12 oitava usada por HPF/LPF:
`[20.0, 21.2, 22.4, 23.6, 25.0, 26.5, 28.0, 30.0, 31.5, 33.5, 35.5, 37.5, 40.0, 42.5, 45.0, 47.5, 50.0, 53.0, 56.0, 60.0, 63.0, 67.0, 71.0, 75.0, 80.0, 85.0, 90.0, 95.0, 100, 106, 112, 118, 125, 132, 140, 150, 160, 170, 180, 190, 200, 212, 224, 236, 250, 265, 280, 300, 315, 335, 355, 375, 400, 425, 450, 475, 500, 530, 560, 600, 630, 670, 710, 750, 800, 850, 900, 950, 1.00k, 1.06k, 1.12k, 1.18k, 1.25k, 1.32k, 1.40k, 1.50k, 1.60k, 1.70k, 1.80k, 1.90k, 2.00k, 2.12k, 2.24k, 2.36k, 2.50k, 2.65k, 2.80k, 3.00k, 3.15k, 3.35k, 3.55k, 3.75k, 4.00k, 4.25k, 4.50k, 4.75k, 5.00k, 5.30k, 5.60k, 6.00k, 6.30k, 6.70k, 7.10k, 7.50k, 8.00k, 8.50k, 9.00k, 9.50k, 10.0k, 10.6k, 11.2k, 11.8k, 12.5k, 13.2k, 14.0k, 15.0k, 16.0k, 17.0k, 18.0k, 19.0k, 20.0k]`

---

## 3. Mapeamento de Algoritmos

### 3.1. Reverb Standard (IDs 0, 1, 2, 3)
*Abrange: Hall, Room, Stage, Plate.*
*   **Status de Calibração:** ✅ **PRONTO PARA IMPLEMENTAÇÃO** (HOLD/DECAY Verificados)

| Parâmetro | Hex | Nome | Lógica de Conversão |
|---|---|---|---|
| 1 | 10 | **INI. DLY** | `Combined / 10` (0.0ms a 500.0ms) |
| 2 | 11 | **Rev Time** | Tabela não-linear (0.3s a 99s) |
| 3 | 12 | **HI.RATIO** | `(val + 1) / 10` (0.1 a 1.0) |
| 4 | 13 | **LO.RATIO** | `(val + 1) / 10` (0.1 a 2.4) |
| 5 | 14 | **DIFF.** | `val` (0 a 10) |
| 6 | 15 | **DENSITY** | `val` (0 a 100) |
| 7 | 16 | **HPF** | FreqTable[val] (0=Thru, 1=21.2Hz...) |
| 8 | 17 | **LPF** | FreqTable[val+16] (105=Thru/16.0kHz) |
| 9 | 18 | **E/R DLY** | `Combined / 10` (0.0ms a 100.0ms) |
| 10 | 19 | **E/R BAL.** | `val` (0 a 100%) |
| 11 | 1A | **GATE** | `0=OFF`, `1-61 = val - 61` (-60 a 0dB) |
| 12 | 1B | **ATTACK** | `val` (0 a 120ms) |
| 13 | 1C | **HOLD** | Tabela de Lookup `holdPoints` (0.02ms a 1.96s) |
| 14 | 1D | **DECAY** | `val` (0 a 120ms) |

#### Detalhes do HOLD (0x1C):
- **Estratégia:** Mapeamento granular de 216 pontos para eliminar drift de interpolação.
- **Auditoria 1:1:** Implementada para os ranges críticos (76-150 e 151-215).
- **Pontos de Verificação Críticos:**
  - Step 50: **1.52ms** (Confirmado via frame_0050.png)
  - Step 76: **4.69ms** (Corrigido para neutralizar erro de cascata)
  - Step 160: **170ms**
  - Step 200: **1.02s**
  - Step 215: **1.96s** (Valor Máximo)
- **Implementação:** O sistema agora utiliza a tabela `holdPoints` com 216 entradas para garantir paridade total com o hardware.

#### Detalhes do Rev Time (0x11):
- `0-47`: `val * 0.1 + 0.3` (0.3s a 5.0s)
- `48-57`: `(val - 47) * 0.5 + 5.0` (5.5s a 10.0s)
- `58-67`: `(val - 57) * 1.0 + 10.0` (11.0s a 20.0s)
- `68-82`: `(val - 67) * 5.0 + 20.0` (25.0s a 95.0s)
- `83`: Fixo 99.0s

---

## 4. Tabela de Referência: HOLD (0x1C)

Esta tabela contém o mapeamento absoluto verificado via auditoria manual de todos os 216 passos do parâmetro HOLD.

| Step (Dec) | Value (ms) | | Step (Dec) | Value (ms) | | Step (Dec) | Value (ms) | | Step (Dec) | Value (ms) |
|---|---|---|---|---|---|---|---|---|---|---|
| 0 | 0.02 | | 54 | 1.84 | | 108 | 18.6 | | 162 | 192 |
| 1 | 0.04 | | 55 | 1.93 | | 109 | 19.3 | | 163 | 202 |
| 2 | 0.06 | | 56 | 2.01 | | 110 | 20.0 | | 164 | 213 |
| 3 | 0.08 | | 57 | 2.10 | | 111 | 20.6 | | 165 | 224 |
| 4 | 0.10 | | 58 | 2.18 | | 112 | 21.3 | | 166 | 234 |
| 5 | 0.13 | | 59 | 2.27 | | 113 | 22.6 | | 167 | 245 |
| 6 | 0.15 | | 60 | 2.35 | | 114 | 24.0 | | 168 | 256 |
| 7 | 0.17 | | 61 | 2.44 | | 115 | 25.3 | | 169 | 266 |
| 8 | 0.19 | | 62 | 2.52 | | 116 | 26.6 | | 170 | 277 |
| 9 | 0.21 | | 63 | 2.60 | | 117 | 28.0 | | 171 | 288 |
| 10 | 0.23 | | 64 | 2.69 | | 118 | 29.3 | | 172 | 298 |
| 11 | 0.25 | | 65 | 2.85 | | 119 | 30.6 | | 173 | 309 |
| 12 | 0.27 | | 66 | 3.02 | | 120 | 32.0 | | 174 | 320 |
| 13 | 0.29 | | 67 | 3.19 | | 121 | 33.3 | | 175 | 330 |
| 14 | 0.31 | | 68 | 3.35 | | 122 | 34.6 | | 176 | 341 |
| 15 | 0.33 | | 69 | 3.52 | | 123 | 36.0 | | 177 | 362 |
| 16 | 0.35 | | 70 | 3.69 | | 124 | 37.3 | | 178 | 384 |
| 17 | 0.38 | | 71 | 3.85 | | 125 | 38.6 | | 179 | 405 |
| 18 | 0.40 | | 72 | 4.02 | | 126 | 40.0 | | 180 | 426 |
| 19 | 0.42 | | 73 | 4.19 | | 127 | 41.3 | | 181 | 448 |
| 20 | 0.44 | | 74 | 4.35 | | 128 | 42.6 | | 182 | 469 |
| 21 | 0.46 | | 75 | 4.52 | | 129 | 45.3 | | 183 | 490 |
| 22 | 0.48 | | 76 | 4.69 | | 130 | 48.0 | | 184 | 512 |
| 23 | 0.50 | | 77 | 4.85 | | 131 | 50.6 | | 185 | 533 |
| 24 | 0.52 | | 78 | 5.02 | | 132 | 53.3 | | 186 | 554 |
| 25 | 0.54 | | 79 | 5.19 | | 133 | 56.0 | | 187 | 576 |
| 26 | 0.56 | | 80 | 5.35 | | 134 | 58.6 | | 188 | 597 |
| 27 | 0.58 | | 81 | 5.69 | | 135 | 61.3 | | 189 | 618 |
| 28 | 0.60 | | 82 | 6.02 | | 136 | 64.0 | | 190 | 640 |
| 29 | 0.63 | | 83 | 6.35 | | 137 | 66.6 | | 191 | 661 |
| 30 | 0.65 | | 84 | 6.69 | | 138 | 69.3 | | 192 | 682 |
| 31 | 0.67 | | 85 | 7.02 | | 139 | 72.0 | | 193 | 725 |
| 32 | 0.69 | | 86 | 7.35 | | 140 | 74.6 | | 194 | 768 |
| 33 | 0.73 | | 87 | 7.69 | | 141 | 77.3 | | 195 | 810 |
| 34 | 0.77 | | 88 | 8.02 | | 142 | 80.0 | | 196 | 853 |
| 35 | 0.81 | | 89 | 8.35 | | 143 | 82.6 | | 197 | 896 |
| 36 | 0.85 | | 90 | 8.69 | | 144 | 85.3 | | 198 | 938 |
| 37 | 0.90 | | 91 | 9.02 | | 145 | 90.6 | | 199 | 981 |
| 38 | 0.94 | | 92 | 9.35 | | 146 | 96.0 | | 200 | 1020 |
| 39 | 0.98 | | 93 | 9.69 | | 147 | 101 | | 201 | 1060 |
| 40 | 1.02 | | 94 | 10.0 | | 148 | 106 | | 202 | 1100 |
| 41 | 1.06 | | 95 | 10.3 | | 149 | 112 | | 203 | 1150 |
| 42 | 1.10 | | 96 | 10.6 | | 150 | 117 | | 204 | 1190 |
| 43 | 1.15 | | 97 | 11.3 | | 151 | 122 | | 205 | 1230 |
| 44 | 1.19 | | 98 | 12.0 | | 152 | 128 | | 206 | 1280 |
| 45 | 1.23 | | 99 | 12.6 | | 153 | 133 | | 207 | 1320 |
| 46 | 1.27 | | 100 | 13.3 | | 154 | 138 | | 208 | 1360 |
| 47 | 1.31 | | 101 | 14.0 | | 155 | 144 | | 209 | 1450 |
| 48 | 1.35 | | 102 | 14.6 | | 156 | 149 | | 210 | 1530 |
| 49 | 1.44 | | 103 | 15.3 | | 157 | 154 | | 211 | 1620 |
| 50 | 1.52 | | 104 | 16.0 | | 158 | 160 | | 212 | 1700 |
| 51 | 1.60 | | 105 | 16.6 | | 159 | 165 | | 213 | 1790 |
| 52 | 1.68 | | 106 | 17.3 | | 160 | 170 | | 214 | 1870 |
| 53 | 1.76 | | 107 | 18.0 | | 161 | 181 | | 215 | 1960 |

---

## 5. Tabela de Referência: DECAY (0x1D)

Esta tabela contém o mapeamento absoluto para o parâmetro DECAY, herdado da lógica verificada do processador GATE da 01V96.

| Step (Dec) | Value | | Step (Dec) | Value | | Step (Dec) | Value | | Step (Dec) | Value |
|---|---|---|---|---|---|---|---|---|---|---|
| 0 | 5ms | | 40 | 261ms | | 80 | 1.37s | | 120 | 8.19s |
| 1 | 11ms | | 41 | 272ms | | 81 | 1.45s | | 121 | 8.53s |
| 2 | 16ms | | 42 | 283ms | | 82 | 1.54s | | 122 | 8.87s |
| 3 | 21ms | | 43 | 293ms | | 83 | 1.62s | | 123 | 9.21s |
| 4 | 27ms | | 44 | 304ms | | 84 | 1.71s | | 124 | 9.56s |
| 5 | 32ms | | 45 | 315ms | | 85 | 1.79s | | 125 | 9.90s |
| 6 | 37ms | | 46 | 325ms | | 86 | 1.88s | | 126 | 10.2s |
| 7 | 43ms | | 47 | 336ms | | 87 | 1.96s | | 127 | 10.5s |
| 8 | 48ms | | 48 | 347ms | | 88 | 2.05s | | 128 | 10.9s |
| 9 | 53ms | | 49 | 368ms | | 89 | 2.13s | | 129 | 11.6s |
| 10 | 59ms | | 50 | 389ms | | 90 | 2.22s | | 130 | 12.2s |
| 11 | 64ms | | 51 | 411ms | | 91 | 2.30s | | 131 | 12.9s |
| 12 | 69ms | | 52 | 432ms | | 92 | 2.39s | | 132 | 13.6s |
| 13 | 75ms | | 53 | 453ms | | 93 | 2.47s | | 133 | 14.3s |
| 14 | 80ms | | 54 | 475ms | | 94 | 2.56s | | 134 | 15.0s |
| 15 | 85ms | | 55 | 496ms | | 95 | 2.65s | | 135 | 15.7s |
| 16 | 91ms | | 56 | 517ms | | 96 | 2.73s | | 136 | 16.3s |
| 17 | 96ms | | 57 | 539ms | | 97 | 2.90s | | 137 | 17.0s |
| 18 | 101ms | | 58 | 560ms | | 98 | 3.07s | | 138 | 17.7s |
| 19 | 107ms | | 59 | 581ms | | 99 | 3.24s | | 139 | 18.4s |
| 20 | 112ms | | 60 | 603ms | | 100 | 3.41s | | 140 | 19.1s |
| 21 | 117ms | | 61 | 624ms | | 101 | 3.58s | | 141 | 19.7s |
| 22 | 123ms | | 62 | 645ms | | 102 | 3.75s | | 142 | 20.4s |
| 23 | 128ms | | 63 | 667ms | | 103 | 3.93s | | 143 | 21.1s |
| 24 | 133ms | | 64 | 688ms | | 104 | 4.10s | | 144 | 21.8s |
| 25 | 139ms | | 65 | 730ms | | 105 | 4.27s | | 145 | 23.2s |
| 26 | 144ms | | 66 | 773ms | | 106 | 4.44s | | 146 | 24.5s |
| 27 | 149ms | | 67 | 816ms | | 107 | 4.61s | | 147 | 25.9s |
| 28 | 155ms | | 68 | 858ms | | 108 | 4.78s | | 148 | 27.3s |
| 29 | 160ms | | 69 | 901ms | | 109 | 4.95s | | 149 | 28.6s |
| 30 | 165ms | | 70 | 944ms | | 110 | 5.12s | | 150 | 30.0s |
| 31 | 171ms | | 71 | 986ms | | 111 | 5.29s | | 151 | 31.4s |
| 32 | 176ms | | 72 | 1.02s | | 112 | 5.46s | | 152 | 32.7s |
| 33 | 187ms | | 73 | 1.07s | | 113 | 5.80s | | 153 | 34.1s |
| 34 | 197ms | | 74 | 1.11s | | 114 | 6.14s | | 154 | 35.4s |
| 35 | 208ms | | 75 | 1.15s | | 115 | 6.48s | | 155 | 36.8s |
| 36 | 219ms | | 76 | 1.20s | | 116 | 6.83s | | 156 | 38.2s |
| 37 | 229ms | | 77 | 1.24s | | 117 | 7.17s | | 157 | 39.5s |
| 38 | 240ms | | 78 | 1.28s | | 118 | 7.51s | | 158 | 40.9s |
| 39 | 251ms | | 79 | 1.32s | | 119 | 7.85s | | 159 | 42.3s |



## REPRESENTAÇÃO EM TEXTO DO LAYOUT DA TELA DE MÁQUINAS DE EFEITOS DA MESA

      [IN PATCH]                       [PROCESSOR]                       [OUT PATCH]

     [   -   ] -- IN1 --.   .-------------------------------.   .-- OUT1 -- [   -   ]
                        |---| 1     EFFECT1       [>]     L |---|
     [   -   ] -- IN2 --'   |       REVERB HALL           R |   '-- OUT2 -- [   -   ]
                            '-------------------------------'

     [INS BUS8]-- IN1 --.   .-------------------------------.   .-- OUT1 -- [INS CH29]
                        |---| L     EFFECT2       [>]     L |---|
     [   -   ] -- IN2 --'   | R     M.BAND DYNA.          R |   '-- OUT2 -- [   -   ]
                            '-------------------------------'

     [   -   ] -- IN1 --.   .-------------------------------.   .-- OUT1 -- [   -   ]
                        |---| 1     EFFECT3       [>]     L |---|
     [   -   ] -- IN2 --'   |       REVERB STAGE          R |   '-- OUT2 -- [   -   ]
                            '-------------------------------'

     [   -   ] -- IN1 --.   .-------------------------------.   .-- OUT1 -- [   -   ]
                        |---| 1     EFFECT4       [>]     L |---|
     [   -   ] -- IN2 --'   |       REVERB PLATE          R |   '-- OUT2 -- [   -   ]
                            '-------------------------------'

---

## 6. Progresso da Implementação (Frontend)

### 6.1. Tela de Máquinas de Efeitos — Etapa 1 (Mockada)

**Status:** ✅ Concluída

**Arquivos criados:**
- `public/modules/efeitos.js` — Módulo com dados mockados dos 4 slots FX (FX1–FX4), renderização do layout e funções `openEffectsModal()` / `closeEffectsModal()`.

**Arquivos modificados:**
- `public/index.html` — Modal `<div id="efeitosModal">` e `<script>` tag para `efeitos.js`.
- `public/modules/sidebar.js` — Botão "EFEITOS" no dock (modo main), no menu mobile (bottom bar), e handlers de fechamento (backdrop click + Escape).
- `public/style.css` — ~200 linhas de CSS dedicado ao layout de efeitos, incluindo media query mobile.

**Funcionalidades implementadas:**
- Botão "EFEITOS" na sidebar dock (roxo, classe `dock-efeitos`).
- Botão "EFEITOS" no menu mobile/bottom bar (roxo, `menu-btn-solid-purple`).
- Modal fullscreen com o mesmo padrão do `chConfigModal`.
- Layout de 3 blocos: IN (L/R + patches + wires) → Processador único → OUT (wires + patches + L/R).
- Header com labels IN PATCH / PROCESSOR / OUT PATCH alinhados ao layout.
- Título "MÁQUINAS DE EFEITOS (EM CONSTRUÇÃO)".
- Botão "FECHAR" no rodapé (vermelho, padrão SAIR).
- Patches com `min-width: 75px`, visual diferenciado (off = cinza, active = azul).
- Processador e patches com `cursor: pointer` e feedback visual no toque.
- Media query mobile: fios ocultos, processador com `min-width: auto` e `padding: 10px` + `margin: 0 10px`.

**Próxima etapa:** Conectar com dados reais do servidor (socket) e implementar a tela de detalhes de cada máquina de efeitos ao clicar no processador.

---

## 7. Plano de Implementação: Recuperar Nomes dos Efeitos nos Slots FX

### 7.1. Contexto e Descobertas via Engenharia Reversa

Durante a sessão de engenharia reversa (monitor.js), capturamos as seguintes mensagens ao realizar um "Recall" de um preset de efeito pelo Studio Manager:

```
💻 S→Y (12b): F0 43 10 3E 7F 10 04 00 39 00 00 F7    ← Recall do preset índice 0x39=57 no Slot FX1
🎹 Y→S (15b): F0 43 10 3E 7F 50 04 00 39 00 00 00 00 00 F7  ← Mesa confirma
💻 S→Y (15b): F0 43 10 3E 7F 50 04 00 39 00 00 00 00 00 F7  ← Loopback
```

No log de sincronização inicial (`log/monitor_log(sincronização inicial).txt`), identificamos que o Studio Manager faz um **Bulk Dump** da biblioteca de presets usando o protocolo `F0 43 00 7E` (Identity + Dump Request). As respostas contêm blocos com os nomes dos presets em ASCII nos bytes de offset `[20..28]` de cada entrada. Exemplo capturado:

```
💻 S→Y (16b): F0 43 20 7E 4C 4D 20 20 38 43 39 33 6D 00 01 F7  ← Request preset #1 da library
🎹 Y→S (623b): F0 43 00 7E 04 67 ... 54 45 53 54 45 32 20 00 ... ← "TESTE2 " (nome do preset)
```

**Conclusão crítica:** A mesa Yamaha 01V96 possui dois conceitos distintos:
- **Algorithm Type (`param 0x31`)**: O motor de efeito em uso (ex.: 0=Hall, 1=Room, 3=Plate). Não é o nome — é o tipo.
- **Preset Index (`param 0x39`)**: O índice (0-based) na biblioteca de presets que foi carregado no slot. **Este é o link para o nome.**

A biblioteca de presets contém tanto os **presets de fábrica** quanto os **presets customizados do usuário**, todos com seus nomes completos acessíveis via Bulk Dump.

---

### 7.2. Arquitetura da Solução

O fluxo completo para obter os nomes dos efeitos nos slots FX1–FX4 é:

```
[Boot / Reconexão do Studio Manager]
          │
          ▼
1. Enviar Bulk Dump Request da Library de Presets de Efeito
          │
          ▼
2. Receber e parsear os ~100 presets
   → Construir mapa: { preset_index: "NOME DO PRESET" }
          │
          ▼
3. Para cada slot FX (FX1=0, FX2=1, FX3=2, FX4=3):
   Enviar Parameter Request para o Preset Index (param 0x39)
          │
          ▼
4. Resposta da mesa → índice N
   → fxSlotName[slot] = library[N]
   → Se N não encontrado: fallback = algorithmName[type]
          │
          ▼
5. Emitir evento Socket.IO "fxSlotsUpdated" para o frontend
```

---

### 7.3. Mensagens MIDI Necessárias

#### 7.3.1. Bulk Dump Request — Biblioteca de Presets de Efeito

O Studio Manager usa o seguinte padrão para solicitar um preset da library por índice (`IDX` = 0-based):

```
F0 43 20 7E 4C 4D 20 20 38 43 39 33 6D [BANK] [IDX] F7
```

- `4C 4D 20 20 38 43 39 33` = ASCII "LM  8C93" (ID do modelo 01V96)
- `6D` = Tipo de objeto (Effect Library)
- `[BANK]` = `00` para User presets
- `[IDX]` = índice do preset (01 a 64 hex = presets 1–100)

A mesa responde com um bloco que começa em:
```
F0 43 00 7E [SIZE_H] [SIZE_L] 4C 4D 20 20 38 43 39 33 6D [BANK] [IDX] 00 00 00
[NOME: 7 bytes ASCII + 00] [padding] [dados dos parâmetros encodados...]
F7
```

**O nome do preset está nos bytes de offset 20 a 27 da resposta (após o header `F0 43 00 7E ... 6D [BANK] [IDX] 00 00 00`), como 7 caracteres ASCII + null terminator.**

Para fazer o dump completo:
- Iterar `IDX` de `01` a `64` (hex) = 100 presets de usuário
- Ou usar o bulk dump global com `IDX = 7F` (0x7F = "todos") se suportado

#### 7.3.2. Parameter Request — Preset Index no Slot Ativo

Para saber qual preset está carregado **atualmente** em cada slot FX:

```
Request (S→Y):
F0 43 10 3E 7F 10 04 [SLOT] 39 00 00 F7

Resposta (Y→S):
F0 43 10 3E 7F 50 04 [SLOT] 39 00 00 00 00 [IDX] F7
```

Onde:
- `[SLOT]`: `00`=FX1, `01`=FX2, `02`=FX3, `03`=FX4
- `[IDX]` = byte final da resposta = índice do preset na library (0-based)

#### 7.3.3. Parameter Request — Algorithm Type (fallback)

Para obter o tipo de algoritmo rodando no slot (usado como fallback):

```
Request (S→Y):
F0 43 10 3E 7F 10 04 [SLOT] 31 00 00 F7

Resposta (Y→S):
F0 43 10 3E 7F 50 04 [SLOT] 31 00 00 00 00 [ALGO_ID] F7
```

Tabela de `ALGO_ID` → Nome do Algoritmo (a catalogar conforme manual / reverse engineering):

| ALGO_ID (hex) | Nome |
|---|---|
| 00 | REVERB HALL |
| 01 | REVERB ROOM |
| 02 | REVERB STAGE |
| 03 | REVERB PLATE |
| 04 | REVERB HALL 2 |
| 05 | REVERB ROOM 2 |
| ... | *(continuar mapeamento via monitor.js)* |

---

### 7.4. Implementação no Servidor Rust

#### 7.4.1. Novo Estado Global — `FxSlotState`

Em `server_rust/src/state.rs`, adicionar:

```rust
#[derive(Debug, Clone, serde::Serialize, Default)]
pub struct FxSlotInfo {
    pub preset_index: Option<u8>,     // índice na library (None se desconhecido)
    pub preset_name: Option<String>,  // nome resolvido da library
    pub algorithm_id: Option<u8>,     // fallback: tipo de algoritmo
    pub algorithm_name: Option<String>,
}

// No GlobalState, adicionar:
pub fx_slots: [FxSlotInfo; 4],  // FX1=0, FX2=1, FX3=2, FX4=3
pub fx_library: HashMap<u8, String>,  // preset_index -> nome
```

#### 7.4.2. Novo Módulo — `fx_manager.rs`

Criar `server_rust/src/fx_manager.rs` com:

```rust
/// Envia bulk dump request para todos os presets da library (índices 1..=100)
pub async fn fetch_fx_library(midi_out: &MidiOut) { ... }

/// Parseia a resposta do bulk dump e extrai o nome do preset
/// Offset do nome na resposta: bytes 20..27 após F0 43 00 7E header
pub fn parse_library_entry(msg: &[u8]) -> Option<(u8, String)> { ... }

/// Solicita o preset_index ativo em cada um dos 4 slots FX
pub async fn fetch_fx_slot_presets(midi_out: &MidiOut) { ... }

/// Solicita o algorithm_id de cada slot (fallback)
pub async fn fetch_fx_slot_algorithms(midi_out: &MidiOut) { ... }

/// Resolve nomes: cruza preset_index com fx_library, fallback p/ algorithm_name
pub fn resolve_fx_slot_names(state: &mut GlobalState) { ... }
```

#### 7.4.3. Integração no Boot

Em `server_rust/src/boot.rs` (ou equivalente de inicialização), após a conexão MIDI ser estabelecida:

```rust
fx_manager::fetch_fx_library(&midi_out).await;
// aguardar 500ms para respostas
fx_manager::fetch_fx_slot_presets(&midi_out).await;
fx_manager::fetch_fx_slot_algorithms(&midi_out).await;
fx_manager::resolve_fx_slot_names(&mut state);
// emitir evento Socket.IO
```

#### 7.4.4. Parsing de Mensagens Recebidas

Em `server_rust/src/midi/protocol.rs`, adicionar ao enum `ParsedMidi` e à função `parse_message`:

```rust
// Novo variant:
FxLibraryEntry { preset_index: u8, name: String },
FxSlotPresetIndex { slot: u8, preset_index: u8 },
FxSlotAlgorithm { slot: u8, algorithm_id: u8 },

// No parse_message, detectar:
// Bulk dump response: msg[0]=0xF0, msg[1]=0x43, msg[2]=0x00, msg[3]=0x7E
//   + verificar bytes 6..14 = "LM  8C93" + 0x6D
// Parameter change response: section=0x7F, group=0x50, element=0x04
//   + param=0x39 → FxSlotPresetIndex
//   + param=0x31 → FxSlotAlgorithm
```

---

### 7.5. Evento Socket.IO para o Frontend

Emitir após resolver todos os slots:

```json
{
  "event": "fxSlotsUpdated",
  "data": {
    "slots": [
      { "slot": 1, "presetIndex": 56, "name": "MEU PRESET CUSTOMIZADO", "algorithmId": 0, "algorithmName": "REVERB HALL" },
      { "slot": 2, "presetIndex": 3,  "name": "REVERB PLATE", "algorithmId": 3, "algorithmName": "REVERB PLATE" },
      { "slot": 3, "presetIndex": null, "name": null, "algorithmId": 2, "algorithmName": "REVERB STAGE" },
      { "slot": 4, "presetIndex": 10, "name": "DELAY STEREO", "algorithmId": 8, "algorithmName": "STEREO DELAY" }
    ]
  }
}
```

**Regra de display no frontend:**
- Se `name != null` → exibir `name` (vem da library, inclui presets customizados)
- Se `name == null` e `algorithmName != null` → exibir `algorithmName + " (?)"` (parâmetros editados manualmente, sem vínculo com preset)
- Se ambos null → exibir `"FX? (carregando...)"` enquanto aguarda resposta da mesa

---

### 7.6. Integração com Frontend (efeitos.js)

Em `public/modules/efeitos.js`, escutar o evento:

```javascript
socket.on('fxSlotsUpdated', (data) => {
    data.slots.forEach(slot => {
        const displayName = slot.name ?? (slot.algorithmName ? `${slot.algorithmName} (?)` : 'Carregando...');
        updateFxSlotDisplay(slot.slot, displayName, slot.algorithmName);
    });
});
```

Atualizar o elemento do processador no layout (ver Seção 6.1 deste documento) para mostrar o nome dinâmico no lugar do texto estático "REVERB HALL", "M.BAND DYNA." etc.

---

### 7.7. Observações e Riscos

- **O preset index `0x39` precisa ser confirmado experimentalmente:** com o monitor.js rodando, fazer um Recall de um preset conhecido pelo Studio Manager e verificar se a resposta do slot retorna o índice correto.
- **A numeração da library é 0-based ou 1-based?** No log, o Studio Manager pediu `IDX=01` para o primeiro preset e recebeu "TESTE2" — pode ser que `IDX=00` seja um preset especial (sem recall / "init"). Testar requestando `IDX=00`.
- **Capacidade da library:** A 01V96 suporta 100 User Presets + presets de fábrica (factory). Mapear se os factory presets usam um bank diferente (`[BANK] != 00`).
- **Sincronização assíncrona:** O Bulk Dump pode chegar em múltiplas mensagens fragmentadas (o monitor.js já remonta SysEx fragmentados — usar a mesma lógica).
- **Trigger de re-fetch:** Quando o Studio Manager fizer um Recall de cena (`PhysicalSceneRecall`), re-executar os passos de fetch dos slots (os efeitos podem ter mudado junto com a cena).