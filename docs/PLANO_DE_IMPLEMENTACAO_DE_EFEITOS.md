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

## 6. Mapeamento de Patch Source — FX Inputs

Tabela de referência completa dos valores MIDI para os inputs dos efeitos (FX Input Patch Source), validada via script de teste direto na porta MIDI da mesa.

**Endereço SysEx:** `F0 43 30 3E 0D 02 03 [LR] [SLOT] F7`
- LR: `00`=L, `01`=R
- SLOT: `00`=FX1, `01`=FX2, `02`=FX3, `03`=FX4

**Resposta:** `F0 43 10 3E 0D 02 03 [LR] [SLOT] [VAL...] F7`

| ID (dec) | Label | Status | Observação |
|---|---|---|---|
| 0 | OFF | ✅ Confirmado | Sem fonte atribuída |
| 1-8 | AUX 1-8 | ✅ Confirmado | Aux Sends (id=1=AUX1) |
| 9-12 | *(gap)* | — | Não mapeado / não usado como input |
| 13-44 | INS CH1-CH32 | ✅ Confirmado | Insert do canal N (id=14=CH2) |
| 45-108 | *(gap)* | — | Não mapeado / não usado como input |
| 109-112 | INS BUS1-4 | ✅ Confirmado | Insert Bus 1-4 |
| 113-116 | INS RET1-2 L/R | Assumido | Insert Return 1-4 L/R |
| 117-124 | INS AUX1-8 | ✅ Confirmado | Insert Aux 1-8 (id=117=AUX1) |
| 125-136 | *(gap)* | — | Não mapeado |
| 137 | INS ST-L | ✅ Confirmado | Insert Stereo Left (master L) |
| 138 | INS ST-R | ✅ Confirmado | Insert Stereo Right (master R) |
| 139+ | *(desconhecido)* | — | Não testado |

**Nota:** O encoding de FX Input é diferente do Channel Input. Valores como 137/138 significam INS ST-L/R para FX inputs, mas FX3 Out1/2 para channel inputs (routing.js fxMap).

---

## 7. Progresso da Implementação (Frontend)

### 7.1. Tela de Máquinas de Efeitos — Etapa 1 (Mockada)

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

