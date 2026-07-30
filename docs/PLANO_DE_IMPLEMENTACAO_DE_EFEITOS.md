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

Catálogo completo das fontes de **IN** dos processadores FX, alinhado ao seletor do Studio Manager / 01V96 (print 2026-07-17) e validado via query SysEx na mesa.

### 6.1. Endereço do parâmetro (qual IN está sendo lido/escrito)

Não existe um endereço SysEx diferente por botão da lista.  
O endereço identifica **qual jack de input do FX** (FX1–4 × L/R). O botão escolhido vira apenas o **valor** (source ID).

| Campo | Hex | Significado |
|---|---|---|
| Section | `0D` | Patch |
| Group | `02` | Patch group |
| Element | `03` | Effect Input |
| Parameter (LR) | `00` / `01` | `00` = IN L · `01` = IN R |
| Channel (SLOT) | `00`–`03` | FX1 / FX2 / FX3 / FX4 |

**Query (Parameter Request `0x30`):**
```text
F0 43 30 3E 0D 02 03 [LR] [SLOT] F7
```

**Resposta (Parameter Change `0x10` vindo da mesa):**
```text
F0 43 10 3E 0D 02 03 [LR] [SLOT] [B0 B1 B2 B3] F7
```
- `[B0 B1 B2 B3]` = source ID em encoding fader Yamaha (28-bit / 7-bit chunks).  
  Exemplos reais: `109` → `00 00 00 6D` · `137` → `00 00 01 09`.

**Change (escrita — ✅ validado via capture SM 2026-07-17):**
```text
F0 43 10 3E 0D 02 03 [LR] [SLOT] [B0 B1 B2 B3] F7
```
Mesmo envelope da resposta; host → mesa.  
Dicionário SM: `kEffectInput/kEffectIn1`…`kEffectIn8` = coords `[13, 2, 3, 0…7]` (índice flat 0–7 = slot×2+LR).

**Captures reais (Studio Manager → mesa):**

| Ação | SysEx (14 bytes) |
|---|---|
| FX1 L → AUX3 | `F0 43 10 3E 0D 02 03 00 00 00 00 00 03 F7` |
| FX1 L → INSCH1 | `F0 43 10 3E 0D 02 03 00 00 00 00 00 0D F7` |

Conclusão: write = Parameter Change `0x10` no endereço do jack + source ID em 4 bytes fader. Vale para todas as 59 opções (só muda `[B0..B3]`).

| Jack | LR | SLOT | Query | Change (template) |
|---|---|---|---|---|
| FX1 L | `00` | `00` | `F0 43 30 3E 0D 02 03 00 00 F7` | `F0 43 10 3E 0D 02 03 00 00 [VAL] F7` |
| FX1 R | `01` | `00` | `F0 43 30 3E 0D 02 03 01 00 F7` | `F0 43 10 3E 0D 02 03 01 00 [VAL] F7` |
| FX2 L | `00` | `01` | `F0 43 30 3E 0D 02 03 00 01 F7` | `F0 43 10 3E 0D 02 03 00 01 [VAL] F7` |
| FX2 R | `01` | `01` | `F0 43 30 3E 0D 02 03 01 01 F7` | `F0 43 10 3E 0D 02 03 01 01 [VAL] F7` |
| FX3 L | `00` | `02` | `F0 43 30 3E 0D 02 03 00 02 F7` | `F0 43 10 3E 0D 02 03 00 02 [VAL] F7` |
| FX3 R | `01` | `02` | `F0 43 30 3E 0D 02 03 01 02 F7` | `F0 43 10 3E 0D 02 03 01 02 [VAL] F7` |
| FX4 L | `00` | `03` | `F0 43 30 3E 0D 02 03 00 03 F7` | `F0 43 10 3E 0D 02 03 00 03 [VAL] F7` |
| FX4 R | `01` | `03` | `F0 43 30 3E 0D 02 03 01 03 F7` | `F0 43 10 3E 0D 02 03 01 03 [VAL] F7` |

### 6.2. Catálogo UI → Source ID (todas as opções do seletor)

Ordem idêntica ao grid do Studio Manager (8 colunas). **59 opções.**  
Todos os **valores (source IDs)** abaixo já foram confirmados por **leitura** SysEx.  
O **change** usa o mesmo ID; o que falta é só validar 1 write ponta a ponta (não re-mapear cada botão).

#### Grid visual (labels do print)

```text
NONE    AUX1    AUX2    AUX3    AUX4    AUX5    AUX6    AUX7
AUX8    INSCH1  INSCH2  INSCH3  INSCH4  INSCH5  INSCH6  INSCH7
INSCH8  INSCH9  INSCH10 INSCH11 INSCH12 INSCH13 INSCH14 INSCH15
INSCH16 INSCH17 INSCH18 INSCH19 INSCH20 INSCH21 INSCH22 INSCH23
INSCH24 INSCH25 INSCH26 INSCH27 INSCH28 INSCH29 INSCH30 INSCH31
INSCH32 INSBUS1 INSBUS2 INSBUS3 INSBUS4 INSBUS5 INSBUS6 INSBUS7
INSBUS8 INSAUX1 INSAUX2 INSAUX3 INSAUX4 INSAUX5 INSAUX6 INSAUX7
INSAUX8 INSSTL  INSSTR
```

#### Tabela completa: label UI → source ID → status

| # | Label UI (print) | Source ID (dec) | ID hex (7-bit) | Valor 4 bytes típico | Status valor | Status change |
|---|------------------|-----------------|----------------|----------------------|--------------|---------------|
| 1 | NONE | 0 | `00` | `00 00 00 00` | ✅ Confirmado (read) | ✅ Formato write validado (mesmo envelope) |
| 2 | AUX1 | 1 | `01` | `00 00 00 01` | ✅ Confirmado (read) | ✅ Formato write validado (mesmo envelope) |
| 3 | AUX2 | 2 | `02` | `00 00 00 02` | ✅ Confirmado (read) | ✅ Formato write validado (mesmo envelope) |
| 4 | AUX3 | 3 | `03` | `00 00 00 03` | ✅ Confirmado (read) | ✅ **Capture SM write** |
| 5 | AUX4 | 4 | `04` | `00 00 00 04` | ✅ Confirmado (read) | ✅ Formato write validado (mesmo envelope) |
| 6 | AUX5 | 5 | `05` | `00 00 00 05` | ✅ Confirmado (read) | ✅ Formato write validado (mesmo envelope) |
| 7 | AUX6 | 6 | `06` | `00 00 00 06` | ✅ Confirmado (read) | ✅ Formato write validado (mesmo envelope) |
| 8 | AUX7 | 7 | `07` | `00 00 00 07` | ✅ Confirmado (read) | ✅ Formato write validado (mesmo envelope) |
| 9 | AUX8 | 8 | `08` | `00 00 00 08` | ✅ Confirmado (read) | ✅ Formato write validado (mesmo envelope) |
| 10 | INSCH1 | 13 | `0D` | `00 00 00 0D` | ✅ Confirmado (read) | ✅ **Capture SM write** |
| 11 | INSCH2 | 14 | `0E` | `00 00 00 0E` | ✅ Confirmado (read) | ✅ Formato write validado (mesmo envelope) |
| 12 | INSCH3 | 15 | `0F` | `00 00 00 0F` | ✅ Confirmado (read) | ✅ Formato write validado (mesmo envelope) |
| 13 | INSCH4 | 16 | `10` | `00 00 00 10` | ✅ Confirmado (read) | ✅ Formato write validado (mesmo envelope) |
| 14 | INSCH5 | 17 | `11` | `00 00 00 11` | ✅ Confirmado (read) | ✅ Formato write validado (mesmo envelope) |
| 15 | INSCH6 | 18 | `12` | `00 00 00 12` | ✅ Confirmado (read) | ✅ Formato write validado (mesmo envelope) |
| 16 | INSCH7 | 19 | `13` | `00 00 00 13` | ✅ Confirmado (read) | ✅ Formato write validado (mesmo envelope) |
| 17 | INSCH8 | 20 | `14` | `00 00 00 14` | ✅ Confirmado (read) | ✅ Formato write validado (mesmo envelope) |
| 18 | INSCH9 | 21 | `15` | `00 00 00 15` | ✅ Confirmado (read) | ✅ Formato write validado (mesmo envelope) |
| 19 | INSCH10 | 22 | `16` | `00 00 00 16` | ✅ Confirmado (read) | ✅ Formato write validado (mesmo envelope) |
| 20 | INSCH11 | 23 | `17` | `00 00 00 17` | ✅ Confirmado (read) | ✅ Formato write validado (mesmo envelope) |
| 21 | INSCH12 | 24 | `18` | `00 00 00 18` | ✅ Confirmado (read) | ✅ Formato write validado (mesmo envelope) |
| 22 | INSCH13 | 25 | `19` | `00 00 00 19` | ✅ Confirmado (read) | ✅ Formato write validado (mesmo envelope) |
| 23 | INSCH14 | 26 | `1A` | `00 00 00 1A` | ✅ Confirmado (read) | ✅ Formato write validado (mesmo envelope) |
| 24 | INSCH15 | 27 | `1B` | `00 00 00 1B` | ✅ Confirmado (read) | ✅ Formato write validado (mesmo envelope) |
| 25 | INSCH16 | 28 | `1C` | `00 00 00 1C` | ✅ Confirmado (read) | ✅ Formato write validado (mesmo envelope) |
| 26 | INSCH17 | 29 | `1D` | `00 00 00 1D` | ✅ Confirmado (read) | ✅ Formato write validado (mesmo envelope) |
| 27 | INSCH18 | 30 | `1E` | `00 00 00 1E` | ✅ Confirmado (read) | ✅ Formato write validado (mesmo envelope) |
| 28 | INSCH19 | 31 | `1F` | `00 00 00 1F` | ✅ Confirmado (read) | ✅ Formato write validado (mesmo envelope) |
| 29 | INSCH20 | 32 | `20` | `00 00 00 20` | ✅ Confirmado (read) | ✅ Formato write validado (mesmo envelope) |
| 30 | INSCH21 | 33 | `21` | `00 00 00 21` | ✅ Confirmado (read) | ✅ Formato write validado (mesmo envelope) |
| 31 | INSCH22 | 34 | `22` | `00 00 00 22` | ✅ Confirmado (read) | ✅ Formato write validado (mesmo envelope) |
| 32 | INSCH23 | 35 | `23` | `00 00 00 23` | ✅ Confirmado (read) | ✅ Formato write validado (mesmo envelope) |
| 33 | INSCH24 | 36 | `24` | `00 00 00 24` | ✅ Confirmado (read) | ✅ Formato write validado (mesmo envelope) |
| 34 | INSCH25 | 37 | `25` | `00 00 00 25` | ✅ Confirmado (read) | ✅ Formato write validado (mesmo envelope) |
| 35 | INSCH26 | 38 | `26` | `00 00 00 26` | ✅ Confirmado (read) | ✅ Formato write validado (mesmo envelope) |
| 36 | INSCH27 | 39 | `27` | `00 00 00 27` | ✅ Confirmado (read) | ✅ Formato write validado (mesmo envelope) |
| 37 | INSCH28 | 40 | `28` | `00 00 00 28` | ✅ Confirmado (read) | ✅ Formato write validado (mesmo envelope) |
| 38 | INSCH29 | 41 | `29` | `00 00 00 29` | ✅ Confirmado (read) | ✅ Formato write validado (mesmo envelope) |
| 39 | INSCH30 | 42 | `2A` | `00 00 00 2A` | ✅ Confirmado (read) | ✅ Formato write validado (mesmo envelope) |
| 40 | INSCH31 | 43 | `2B` | `00 00 00 2B` | ✅ Confirmado (read) | ✅ Formato write validado (mesmo envelope) |
| 41 | INSCH32 | 44 | `2C` | `00 00 00 2C` | ✅ Confirmado (read) | ✅ Formato write validado (mesmo envelope) |
| 42 | INSBUS1 | 109 | `6D` | `00 00 00 6D` | ✅ Confirmado (read) | ✅ Formato write validado (mesmo envelope) |
| 43 | INSBUS2 | 110 | `6E` | `00 00 00 6E` | ✅ Confirmado (read) | ✅ Formato write validado (mesmo envelope) |
| 44 | INSBUS3 | 111 | `6F` | `00 00 00 6F` | ✅ Confirmado (read) | ✅ Formato write validado (mesmo envelope) |
| 45 | INSBUS4 | 112 | `70` | `00 00 00 70` | ✅ Confirmado (read) | ✅ Formato write validado (mesmo envelope) |
| 46 | INSBUS5 | 113 | `71` | `00 00 00 71` | ✅ Confirmado (read) | ✅ Formato write validado (mesmo envelope) |
| 47 | INSBUS6 | 114 | `72` | `00 00 00 72` | ✅ Confirmado (read) | ✅ Formato write validado (mesmo envelope) |
| 48 | INSBUS7 | 115 | `73` | `00 00 00 73` | ✅ Confirmado (read) | ✅ Formato write validado (mesmo envelope) |
| 49 | INSBUS8 | 116 | `74` | `00 00 00 74` | ✅ Confirmado (read) | ✅ Formato write validado (mesmo envelope) |
| 50 | INSAUX1 | 117 | `75` | `00 00 00 75` | ✅ Confirmado (read) | ✅ Formato write validado (mesmo envelope) |
| 51 | INSAUX2 | 118 | `76` | `00 00 00 76` | ✅ Confirmado (read) | ✅ Formato write validado (mesmo envelope) |
| 52 | INSAUX3 | 119 | `77` | `00 00 00 77` | ✅ Confirmado (read) | ✅ Formato write validado (mesmo envelope) |
| 53 | INSAUX4 | 120 | `78` | `00 00 00 78` | ✅ Confirmado (read) | ✅ Formato write validado (mesmo envelope) |
| 54 | INSAUX5 | 121 | `79` | `00 00 00 79` | ✅ Confirmado (read) | ✅ Formato write validado (mesmo envelope) |
| 55 | INSAUX6 | 122 | `7A` | `00 00 00 7A` | ✅ Confirmado (read) | ✅ Formato write validado (mesmo envelope) |
| 56 | INSAUX7 | 123 | `7B` | `00 00 00 7B` | ✅ Confirmado (read) | ✅ Formato write validado (mesmo envelope) |
| 57 | INSAUX8 | 124 | `7C` | `00 00 00 7C` | ✅ Confirmado (read) | ✅ Formato write validado (mesmo envelope) |
| 58 | INSSTL | 137 | `89` | `00 00 01 09` | ✅ Confirmado (read) | ✅ Formato write validado (mesmo envelope) |
| 59 | INSSTR | 138 | `8A` | `00 00 01 0A` | ✅ Confirmado (read) | ✅ Formato write validado (mesmo envelope) |

#### Resumo por faixa

| Faixa ID | Labels | Fórmula |
|---|---|---|
| 0 | NONE | fixo |
| 1–8 | AUX1–AUX8 | `id = n` |
| 13–44 | INSCH1–INSCH32 | `id = 12 + n` |
| 109–116 | INSBUS1–INSBUS8 | `id = 108 + n` |
| 117–124 | INSAUX1–INSAUX8 | `id = 116 + n` |
| 137 | INSSTL | fixo |
| 138 | INSSTR | fixo |

#### Gaps (não aparecem no seletor UI)

| IDs | Motivo |
|---|---|
| 9–12 | gap — não usados como FX input |
| 45–108 | gap — não usados como FX input |
| 125–136 | gap — não usados como FX input |
| 139+ | fora do catálogo do seletor |

### 6.3. Notas de encoding

- Labels do SM usam `NONE` / `INSCH` / `INSBUS` / `INSAUX` / `INSSTL` / `INSSTR` (sem espaços). O frontend atual usa aliases (`OFF`, `INS CH`, `INS ST-L`…) — unificar na UI de edição.
- O encoding de **FX Input** é **diferente** do Channel Input / Insert In:  
  ex. `137`/`138` = **INSSTL/INSSTR** no FX Input, mas **FX3 Out1/Out2** no patch de canal (`routing.js` / inserts).
- **Não é necessário** capturar 59 changes no Studio Manager para descobrir IDs: os source IDs já estão 100% mapeados por read.
- **Write validado (2026-07-17):** captures SM de FX1 L → AUX3 e FX1 L → INSCH1 confirmaram Parameter Change `0x10` puro (14 bytes), sem bulk/assign extra. Vale para **todas** as 59 opções.

### 6.4. Status de implementação — FX Input change

| Item | Status |
|---|---|
| Catálogo de 59 source IDs | ✅ Completo |
| Query / read | ✅ Implementado (`requestFxInputs`) |
| Formato write SysEx | ✅ Validado com SM |
| Builder write no server (`build_fx_input_change` / control) | ❌ Ainda não |
| UI seletor de IN na tela de efeitos | ❌ Ainda não |

**FX Input está pronto para implementação de edição.** Não falta engenharia reversa.

---

### 7.1. Tela de Máquinas de Efeitos — Etapa 1 e Refatoração Modular (Concluídas)

**Status:** ✅ Concluída (Visão Geral + Arquitetura Schema-Driven em `public/modules/FXS/`)

**Estrutura de Arquivos Criada (`public/modules/FXS/`):**
- `public/modules/FXS/efeitos.js` — Módulo de visão geral dos 4 slots FX (FX1–FX4), com renderização do diagrama de fluxo de sinal (IN Patch → Processador → OUT Patch), decodificação de roteamento e abertura do modal de edição.
- `public/modules/FXS/fx_core.js` — Motor genérico de efeitos. Gerencia o estado local (`fxParamsState`, `syncedSlots`), controle de Lazy-Sync, manipulação de drag/wheel/stepper, troca de layout Desktop/Mobile e escuta de eventos WebSocket em tempo real.
- `public/modules/FXS/fx_registry.js` — Catálogo declarativo (Schema-Driven) de algoritmos. Mapeia IDs de efeitos Yamaha para suas categorias, parâmetros SysEx, limites e funções de formatação.
- `public/modules/FXS/fx_components.js` — Biblioteca de componentes visuais reaproveitáveis (Knobs rotativos, Stepper Cards -/+, Switch Cards ON/OFF, Headers, Card Groups e Tab Bars).
- `public/modules/FXS/fx_routing.js` — Utilitários de roteamento e decodificação de patch (IN e OUT).
- `public/modules/FXS/fx_utils.js` — Funções utilitárias de formatação de valores (ms, s, Hz, kHz, %, dB, ratios).
- `public/modules/FXS/fx.css` — Estilos dedicados para o editor de efeitos, suportando temas visuais por tipo de algoritmo e responsividade mobile.

**Arquivos Modificados na Integração:**
- `public/index.html` — Modal `<div id="efeitosModal">`, modal `<div id="fxEditorModal">` com overlay de sync, e tags `<script>` para todos os módulos de `FXS/`.
- `public/modules/sidebar.js` — Integração dos botões "EFEITOS" (dock e mobile bottom bar) com handlers de fechamento.
- `public/style.css` — Estilos globais e compatibilidade visual.

**Funcionalidades Implementadas:**
- **Overview dos 4 Slots (FX1-FX4):** Modal fullscreen com layout de 3 blocos (IN Patch → Processor → OUT Patch) e fios visuais.
- **Arquitetura Reutilizável (Schema-Driven):** Separação total entre catálogo de parâmetros, componentes de interface e motor de estado.
- **Lazy-Sync por Slot:** Solicitação em lote sob demanda ao abrir o editor de um slot e cache em memória.
- **Interface Dual (Desktop / Mobile):** Grid de cartões por categoria em telas grandes e navegação por abas com botões Stepper touch em dispositivos móveis.
- **Atualização Direta do DOM:** Atualizações de parâmetros alteram pontualmente os seletores do DOM sem causar perda de foco, saltos de scroll ou travamentos.

---

## 8. Mapeamento de Patch Destination — FX Outputs

Tabela de referência completa dos destinos do output patch (FX Output Patch Destination), validada via script de teste direto na porta MIDI da mesa.

### 8.1. Conceito

O “OUT do FX” **não tem endereço próprio no processador**.  
É endereçamento **destination-indexed**: o SysEx aponta para o **DESTINO** (ex. CH1), e o **valor** diz qual fonte alimenta esse destino — inclusive um slot de saída de FX (`FX1 Out1` = 121, etc.).

| Lado | Endereço | Valor |
|---|---|---|
| **FX Input (IN)** | jack do FX (FX1 L, …) | fonte (AUX3, INSCH1, …) |
| **FX Output (OUT)** | destino (CH1, INSCH…, …) | slot FX (121 = FX1 Out1, …) |

Por isso, ao “colocar OUT L do FX1 em CH1”, o que o SM manda é **mudança do patch de entrada do CH1** (`kChannelInput`), não um parâmetro “FX1 Out”.

### 8.2. Formato SysEx

**Query:** `F0 43 30 3E 0D 02 [ELEMENT] [PARAM] [CHANNEL] F7`  
**Resposta / Change:** `F0 43 10 3E 0D 02 [ELEMENT] [PARAM] [CHANNEL] [B0 B1 B2 B3] F7`

Para **CH1–32** (element `01`, param `00`, channel = índice 0–31):

```text
Change CH n → FX slot:  F0 43 10 3E 0D 02 01 00 [CH] [VAL 4 bytes] F7
Query  CH n:            F0 43 30 3E 0D 02 01 00 [CH] F7
```

Comando de app já existente: `kChannelInput/kChannelIn` (`dictionary` `[13, 2, 1, 0]`).

### 8.2.1. Capture SM — FX1 Out L → CH1 (2026-07-17)

Ação no SM: OUT L do FX1 apontado para CH1 (CH1 já era destino de patch).

| # | Dir | SysEx | Decode |
|---|-----|-------|--------|
| 1 | 💻→mesa | `F0 43 10 3E 0D 02 01 00 00 00 00 00 79 F7` | **Change** CH1 (ch=`00`) = valor `0x79` = **121** = **FX1 Out1** |
| 2 | 💻→mesa | `F0 43 30 3E 0D 02 01 00 00 F7` | **Request** re-query do patch de CH1 |
| 3 | 🎹→host | `F0 43 10 3E 0D 02 01 00 00 00 00 00 79 F7` | **Resposta** da mesa confirmando 121 |
| 4 | 💻→mesa | `F0 43 10 3E 0D 02 01 00 00 00 00 00 79 F7` | SM **reenvia** o mesmo change (eco/sync) |

Capture real informado:

```text
[18:07:37] 💻 SY (14b): F0 43 10 3E 0D 02 01 00 00 00 00 00 79 F7
[18:07:37] 💻 SY (10b): F0 43 30 3E 0D 02 01 00 00 F7
[18:07:37] 🎹 YS (14b): F0 43 10 3E 0D 02 01 00 00 00 00 00 79 F7
[18:07:37] 💻 SY (14b): F0 43 10 3E 0D 02 01 00 00 00 00 00 79 F7
```

**Conclusão write OUT→CH:**

- Element `01` = channel input patch (não element `03` de FX input)
- Channel `00` = CH1
- Valor `79` hex = **121** = FX1 Out1 (OUT L do FX1)
- Padrão SM: **Change + Request + eco da mesa** (request/eco opcionais no nosso app; o essencial é o change `0x10`)
- **Write validado** para destino CH via `kChannelInput`

### 8.3. Catálogo UI de destinos (print SM 2026-07-17)

Seletor ao clicar no **OUT** de um FX. Catálogo completo alinhado ao Studio Manager.
Cada opção (exceto NONE) é um **destino** cujo patch recebe o **valor do slot FX** (ex. 121 = FX1 Out1).

#### Grid visual (labels do print)

```text
NONE    CH1     CH2     CH3     CH4     CH5     CH6     CH7
CH8     CH9     CH10    CH11    CH12    CH13    CH14    CH15
CH16    CH17    CH18    CH19    CH20    CH21    CH22    CH23
CH24    CH25    CH26    CH27    CH28    CH29    CH30    CH31
CH32    STIN1L  STIN1R  STIN2L  STIN2R  STIN3L  STIN3R  STIN4L
STIN4R  INSCH1  INSCH2  INSCH3  INSCH4  INSCH5  INSCH6  INSCH7
INSCH8  INSCH9  INSCH10 INSCH11 INSCH12 INSCH13 INSCH14 INSCH15
INSCH16 INSCH17 INSCH18 INSCH19 INSCH20 INSCH21 INSCH22 INSCH23
INSCH24 INSCH25 INSCH26 INSCH27 INSCH28 INSCH29 INSCH30 INSCH31
INSCH32 INSBUS1 INSBUS2 INSBUS3 INSBUS4 INSBUS5 INSBUS6 INSBUS7
INSBUS8 INSAUX1 INSAUX2 INSAUX3 INSAUX4 INSAUX5 INSAUX6 INSAUX7
INSAUX8 INSSTL  INSSTR
```

**Total:** 91 opções = NONE(1) + CH(32) + STIN(8) + INSCH(32) + INSBUS(8) + INSAUX(8) + INSST(2).

**Observação:** o seletor de OUT **não lista MASTER L/R** com esse nome; o equivalente no SM é **INSSTL / INSSTR** (insert stereo, element 10). Em reads antigos o element 10 apareceu como "MASTER L/R" — mesmo endereço SysEx, labels diferentes.

#### 8.3.1. Elementos SysEx por família de destino

| Element | Param | Channel | Destinos UI | Comando dicionário | Status write |
|---|---|---|---|---|---|
| `01` | `00` | 0–31 | CH1–CH32 | `kChannelInput/kChannelIn` | ✅ Validado (CH1) |
| `01` | `00` | 32–39 | STIN1L…STIN4R | `kChannelInput/kChannelIn` | ⏳ Mesmo comando (ch 32–39) |
| `02` | `00` | 0–31 | INSCH1–INSCH32 | `kChannelInsertIn/kInsertIn` | ⏳ Esperado (insert já no app) |
| `07` | `00` | 0–7 | INSBUS1–INSBUS8 | `kBusInsertInput/kBusInsertIn` | ⏳ Esperado (read ok) |
| `08` | `00` | 0–7 | INSAUX1–INSAUX8 | `kAUXInsertInput/kAUXInsertIn` | ⏳ Esperado |
| `10` | `00` | 0–1 | INSSTL, INSSTR | `kStereoInsertInput/kStereoInsertIn` | ⏳ Esperado (read ok) |

**Change genérico:**

```text
F0 43 10 3E 0D 02 [ELEMENT] 00 [CHANNEL] [B0 B1 B2 B3] F7
```

onde `[B0..B3]` = slot FX (ex. FX1 Out1 = 121 → `00 00 00 79`).

**NONE:** não é um destino com endereço próprio. Significa **desconectar** o OUT do FX (gravar OFF/`0` no destino que atualmente tem esse slot, ou restaurar fonte anterior — UX a definir).

#### 8.3.2. Tabela completa destino UI → endereço de change

Template: `F0 43 10 3E 0D 02 [EL] 00 [CH] [VAL_FX] F7`  
Exemplo de VAL_FX para FX1 Out1: `00 00 00 79` (121).

| # | Label UI | Element (hex) | Channel (dec) | Channel (hex) | Status |
|---|---|---|---|---|---|
| 0 | NONE | — | — | — | ⏳ UX (limpar destino anterior) |
| 1 | CH1 | `01` | 0 | `00` | ✅ Write SM capturado |
| 2 | CH2 | `01` | 1 | `01` | ✅ Mesmo modelo CH |
| 3 | CH3 | `01` | 2 | `02` | ✅ Mesmo modelo CH |
| 4 | CH4 | `01` | 3 | `03` | ✅ Mesmo modelo CH |
| 5 | CH5 | `01` | 4 | `04` | ✅ Mesmo modelo CH |
| 6 | CH6 | `01` | 5 | `05` | ✅ Mesmo modelo CH |
| 7 | CH7 | `01` | 6 | `06` | ✅ Mesmo modelo CH |
| 8 | CH8 | `01` | 7 | `07` | ✅ Mesmo modelo CH |
| 9 | CH9 | `01` | 8 | `08` | ✅ Mesmo modelo CH |
| 10 | CH10 | `01` | 9 | `09` | ✅ Mesmo modelo CH |
| 11 | CH11 | `01` | 10 | `0A` | ✅ Mesmo modelo CH |
| 12 | CH12 | `01` | 11 | `0B` | ✅ Mesmo modelo CH |
| 13 | CH13 | `01` | 12 | `0C` | ✅ Mesmo modelo CH |
| 14 | CH14 | `01` | 13 | `0D` | ✅ Mesmo modelo CH |
| 15 | CH15 | `01` | 14 | `0E` | ✅ Mesmo modelo CH |
| 16 | CH16 | `01` | 15 | `0F` | ✅ Mesmo modelo CH |
| 17 | CH17 | `01` | 16 | `10` | ✅ Mesmo modelo CH |
| 18 | CH18 | `01` | 17 | `11` | ✅ Mesmo modelo CH |
| 19 | CH19 | `01` | 18 | `12` | ✅ Mesmo modelo CH |
| 20 | CH20 | `01` | 19 | `13` | ✅ Mesmo modelo CH |
| 21 | CH21 | `01` | 20 | `14` | ✅ Mesmo modelo CH |
| 22 | CH22 | `01` | 21 | `15` | ✅ Mesmo modelo CH |
| 23 | CH23 | `01` | 22 | `16` | ✅ Mesmo modelo CH |
| 24 | CH24 | `01` | 23 | `17` | ✅ Mesmo modelo CH (read ok) |
| 25 | CH25 | `01` | 24 | `18` | ✅ Mesmo modelo CH |
| 26 | CH26 | `01` | 25 | `19` | ✅ Mesmo modelo CH |
| 27 | CH27 | `01` | 26 | `1A` | ✅ Mesmo modelo CH |
| 28 | CH28 | `01` | 27 | `1B` | ✅ Mesmo modelo CH |
| 29 | CH29 | `01` | 28 | `1C` | ✅ Mesmo modelo CH |
| 30 | CH30 | `01` | 29 | `1D` | ✅ Mesmo modelo CH |
| 31 | CH31 | `01` | 30 | `1E` | ✅ Mesmo modelo CH |
| 32 | CH32 | `01` | 31 | `1F` | ✅ Mesmo modelo CH |
| 33 | STIN1L | `01` | 32 | `20` | ⏳ el.1 ch 32–39 |
| 34 | STIN1R | `01` | 33 | `21` | ⏳ el.1 ch 32–39 |
| 35 | STIN2L | `01` | 34 | `22` | ⏳ el.1 ch 32–39 |
| 36 | STIN2R | `01` | 35 | `23` | ⏳ el.1 ch 32–39 |
| 37 | STIN3L | `01` | 36 | `24` | ⏳ el.1 ch 32–39 |
| 38 | STIN3R | `01` | 37 | `25` | ⏳ el.1 ch 32–39 |
| 39 | STIN4L | `01` | 38 | `26` | ⏳ el.1 ch 32–39 |
| 40 | STIN4R | `01` | 39 | `27` | ⏳ el.1 ch 32–39 |
| 41 | INSCH1 | `02` | 0 | `00` | ⏳ insert path |
| 42 | INSCH2 | `02` | 1 | `01` | ⏳ |
| 43 | INSCH3 | `02` | 2 | `02` | ⏳ |
| 44 | INSCH4 | `02` | 3 | `03` | ⏳ |
| 45 | INSCH5 | `02` | 4 | `04` | ⏳ |
| 46 | INSCH6 | `02` | 5 | `05` | ⏳ |
| 47 | INSCH7 | `02` | 6 | `06` | ⏳ |
| 48 | INSCH8 | `02` | 7 | `07` | ⏳ |
| 49 | INSCH9 | `02` | 8 | `08` | ⏳ |
| 50 | INSCH10 | `02` | 9 | `09` | ⏳ |
| 51 | INSCH11 | `02` | 10 | `0A` | ⏳ |
| 52 | INSCH12 | `02` | 11 | `0B` | ⏳ |
| 53 | INSCH13 | `02` | 12 | `0C` | ⏳ |
| 54 | INSCH14 | `02` | 13 | `0D` | ⏳ |
| 55 | INSCH15 | `02` | 14 | `0E` | ⏳ |
| 56 | INSCH16 | `02` | 15 | `0F` | ⏳ |
| 57 | INSCH17 | `02` | 16 | `10` | ⏳ |
| 58 | INSCH18 | `02` | 17 | `11` | ⏳ |
| 59 | INSCH19 | `02` | 18 | `12` | ⏳ |
| 60 | INSCH20 | `02` | 19 | `13` | ⏳ |
| 61 | INSCH21 | `02` | 20 | `14` | ⏳ |
| 62 | INSCH22 | `02` | 21 | `15` | ⏳ |
| 63 | INSCH23 | `02` | 22 | `16` | ⏳ |
| 64 | INSCH24 | `02` | 23 | `17` | ⏳ |
| 65 | INSCH25 | `02` | 24 | `18` | ⏳ |
| 66 | INSCH26 | `02` | 25 | `19` | ⏳ |
| 67 | INSCH27 | `02` | 26 | `1A` | ⏳ |
| 68 | INSCH28 | `02` | 27 | `1B` | ⏳ |
| 69 | INSCH29 | `02` | 28 | `1C` | ⏳ |
| 70 | INSCH30 | `02` | 29 | `1D` | ⏳ |
| 71 | INSCH31 | `02` | 30 | `1E` | ⏳ |
| 72 | INSCH32 | `02` | 31 | `1F` | ⏳ |
| 73 | INSBUS1 | `07` | 0 | `00` | ⏳ (read ok) |
| 74 | INSBUS2 | `07` | 1 | `01` | ⏳ (read ok) |
| 75 | INSBUS3 | `07` | 2 | `02` | ⏳ (read ok) |
| 76 | INSBUS4 | `07` | 3 | `03` | ⏳ (read ok) |
| 77 | INSBUS5 | `07` | 4 | `04` | ⏳ |
| 78 | INSBUS6 | `07` | 5 | `05` | ⏳ |
| 79 | INSBUS7 | `07` | 6 | `06` | ⏳ |
| 80 | INSBUS8 | `07` | 7 | `07` | ⏳ |
| 81 | INSAUX1 | `08` | 0 | `00` | ⏳ |
| 82 | INSAUX2 | `08` | 1 | `01` | ⏳ |
| 83 | INSAUX3 | `08` | 2 | `02` | ⏳ |
| 84 | INSAUX4 | `08` | 3 | `03` | ⏳ |
| 85 | INSAUX5 | `08` | 4 | `04` | ⏳ |
| 86 | INSAUX6 | `08` | 5 | `05` | ⏳ |
| 87 | INSAUX7 | `08` | 6 | `06` | ⏳ |
| 88 | INSAUX8 | `08` | 7 | `07` | ⏳ |
| 89 | INSSTL | `0A` | 0 | `00` | ⏳ (read como MASTER L) |
| 90 | INSSTR | `0A` | 1 | `01` | ⏳ (read como MASTER R) |

#### 8.3.3. Exemplos de SysEx por família (FX1 Out1 = 121)

| Destino | Change |
|---|---|
| CH1 | `F0 43 10 3E 0D 02 01 00 00 00 00 00 79 F7` ✅ capturado |
| STIN1L | `F0 43 10 3E 0D 02 01 00 20 00 00 00 79 F7` |
| INSCH1 | `F0 43 10 3E 0D 02 02 00 00 00 00 00 79 F7` |
| INSBUS1 | `F0 43 10 3E 0D 02 07 00 00 00 00 00 79 F7` |
| INSAUX1 | `F0 43 10 3E 0D 02 08 00 00 00 00 00 79 F7` |
| INSSTL | `F0 43 10 3E 0D 02 0A 00 00 00 00 00 79 F7` |

### 8.4. Valores gravados no destino (= slot de saída do FX)

| Slot (dec) | Bytes (4) | Label OUT | Status |
|---|---|---|---|
| 121 | `00 00 00 79` | FX1 Out1 / OUT L | ✅ read + **write SM→CH1** |
| 122 | `00 00 00 7A` | FX1 Out2 / OUT R | ✅ read |
| 129 | `00 00 01 01` | FX2 Out1 | ✅ read |
| 130 | `00 00 01 02` | FX2 Out2 | ✅ read |
| 137 | `00 00 01 09` | FX3 Out1 | ✅ read |
| 138 | `00 00 01 0A` | FX3 Out2 | ✅ read |
| 139 | `00 00 01 0B` | FX4 Out1 | ✅ read |
| 140 | `00 00 01 0C` | FX4 Out2 | ✅ read (padrão +1) |

```
FX1 Out1 = 121    FX1 Out2 = 122
FX2 Out1 = 129    FX2 Out2 = 130    (+8 por FX)
FX3 Out1 = 137    FX3 Out2 = 138
FX4 Out1 = 139    FX4 Out2 = 140    (+2 a partir de FX3, não +8)
```

Outros valores podem existir no mesmo endereço de destino (OFF, BUS, MATRIX…) no patch geral da mesa. A UI de efeitos só precisa dos **8 slots FX + NONE**.

### 8.5. Validação read (script vs mesa)

| Destino | Esperado | Resultado |
|---------|----------|-----------|
| INSBUS1 | FX1 Out1 | FX1 Out1 ✅ |
| INSBUS2 | FX1 Out2 | FX1 Out2 ✅ |
| CH24 | FX2 Out1 | FX2 Out1 ✅ |
| INSBUS3 | FX3 Out1 | FX3 Out1 ✅ |
| INSBUS4 | FX3 Out2 | FX3 Out2 ✅ |
| INSSTL (el.10 ch0) | FX4 Out1 | FX4 Out1 ✅ |
| INSSTR (el.10 ch1) | FX4 Out2 | FX4 Out2 ✅ |

### 8.6. Notas importantes

- **IN do FX** e **OUT do FX** usam modelos opostos: IN = endereço no FX + valor fonte; OUT = endereço no destino + valor slot FX.
- Escolher CH n **substitui** a fonte atual daquele canal (AD → FX out, etc.).
- Overview no app = reverse lookup (quem tem valor 121–140).
- **Não é necessário** capturar 90 writes: o envelope é o mesmo; só mudam element/channel e o valor do slot.
- Captures opcionais (1 por família): STIN1L, INSCH1, INSBUS1, INSAUX1, INSSTL — só se quiser carimbo SM extra. CH já está fechado.

### 8.7. Status de implementação — FX Output change

| Item | Status |
|---|---|
| Catálogo UI completo (print) | ✅ 91 opções documentadas |
| Modelo destination-indexed | ✅ Confirmado |
| Valores FX Out 121–140 | ✅ Confirmados |
| Write CH1–32 | ✅ Validado SM (CH1); modelo para CH2–32 |
| Write STIN / INSCH / INSBUS / INSAUX / INSST | ⏳ Endereços mapeados; write por família não capturado (baixa prioridade) |
| UI seletor OUT | ❌ Ainda não |
| Lógica NONE / mover OUT | ❌ Ainda não (UX) |

**Catálogo de destinos de OUT está completo para implementação da UI.** Write de canal já validado; demais famílias seguem o mesmo SysEx com element diferente.

---

## 9. Sincronização de Efeitos (Filtros de Latência e Pipeline)

Durante a fase de sincronização completa da mesa (sync de nomes, faders, etc.), implementamos uma pipeline dedicada para atualizar o estado dos Processadores de Efeitos (FX Inputs e FX Outputs) respeitando os tempos de resposta físicos da Yamaha 01V96.

### 9.1. Arquitetura da Sincronização Sequencial
- **Fase 1: FX Inputs (Modo Batch):**
  - Solicita o patch de entrada dos efeitos (`kEffectInput/kEffectIn`) para todos os 4 slots (L/R, total de 8 requisições).
  - Executado em lote com throttle de hardware configurável.
- **Fase 2: FX Outputs (Modo Batch):**
  - Envia requisições de patch de saída (`build_fx_output_request`) para todos os destinos mapeados (canais, insert inputs, etc.).
  - Executado em lote com throttle de hardware configurável.
  - Ativa temporariamente `is_output_patch_active = true` para que o parser possa discriminar respostas de output patch versus inputs comuns.
  - Coleta as confirmações (acks) em background por até 5.0 segundos antes de restaurar o estado normal.

### 9.2. Ajuste Fino de Latência de Hardware
- Descobrimos que a mesa 01V96 possui um processamento de MIDI que pode atrasar respostas sob estresse (como no sync inicial).
- Para evitar packet loss e timeouts, a latência de envio foi parametrizada dinamicamente através do arquivo `config.json` no campo `time_between_fxs_requests`.
- O valor é lido na inicialização do servidor e propagado com segurança para o `SyncManager`.
- Valor padrão calibrado pelo usuário: **150** (150ms), garantindo sincronização estável em lote para Inputs e Outputs.

---

## 10. IMPLEMENTAÇÃO DE TELAS DE EFEITOS

Nesta seção documentamos a arquitetura de comunicação MIDI SysEx, sincronização sob demanda (Lazy-Sync por Slot), filtragem por tipo de algoritmo e o plano passo a passo de implementação técnica para o editor de efeitos.

---

### 10.1. Comportamento do Protocolo MIDI SysEx e Estratégia Lazy-Sync

#### 10.1.1. Natureza das Requisições SysEx (Parâmetro por Parâmetro)
- Na Yamaha 01V96, as requisições diretas de controle de efeito (`Parameter Request` — opcode `0x30`) operam estritamente no modelo **1 para 1** (um parâmetro por mensagem):
  ```text
  Requisição (Host -> Mesa): F0 43 30 3E 7F 01 58 [PARAM] [SLOT] F7
  Resposta   (Mesa -> Host): F0 43 10 3E 7F 01 58 [PARAM] [SLOT] 00 00 00 [VAL] F7
  ```
- **Não existe** um comando `0x30` que retorne todos os 14 parâmetros internos de uma máquina de efeitos de uma só vez.
- O **Bulk Dump** (`0x20` / `0x00`) executado durante a inicialização traz o mapa da cena geral (canais, EQs, auxs, panning, Patch In/Out e o ID do `Effect Type`), mas não popula decodificadamente todos os 14 parâmetros detalhados dos 4 processadores FX.

#### 10.1.2. Fluxo da Sincronização Sob Demanda (Lazy-Sync por Slot)
Para economizar tráfego MIDI (31.25 kbps) e acelerar a inicialização:
1. **Boot Inicial do App:** Sincroniza faders, mutes, EQs, auxs, panning, o ID do `Effect Type` (`0x31`) e os Patch Inputs/Outputs dos 4 slots FX.
2. **Ao Abrir o Editor de Efeito (`openFxEditor(slotIdx)`):**
   - Obtém o `Effect Type` (ID do algoritmo) já salvo no cache do slot.
   - **Verificação de Suporte:**
     - **Se o algoritmo for SUPORTADO (IDs 0, 1, 2, 3 - Reverbs):**
       - Verifica se o slot já foi sincronizado (`syncedSlots[slotIdx] === true`).
       - Se `false`: Envia em lote (*batch request* com throttling) os 16 `Parameter Requests` (`0x30`) referentes aos parâmetros `0x10`..`0x1D`, Mix Balance `0x30` e Bypass `0x34`.
       - Marca `syncedSlots[slotIdx] = true` e armazena os valores na RAM.
       - Se `true`: Lê instantaneamente do cache na RAM.
     - **Se o algoritmo NÃO for suportado (REV-X, Delays, Modulações, etc.):**
       - **Ignora** o disparo de requisições de parâmetros internos para evitar tráfego MIDI desnecessário.
       - Abre a tela em modo **"EFEITO EM CONSTRUÇÃO"** (exibe slot, nome e tipo de efeito com mensagem amigável de desenvolvimento).
3. **Atualização em Tempo Real (Event-Driven):**
   - Após sincronizado, o app escuta `Parameter Change` (`0x10`) do `Element 0x58` para atualizar a UI em tempo real quando o operador físico mexer na mesa.

---

### 10.2. Algoritmo Suportado: Reverb Standard (IDs 0, 1, 2, 3)

Os 4 Reverbs Padrão (*Reverb Hall*, *Reverb Room*, *Reverb Stage*, *Reverb Plate*) compartilham a mesma estrutura de 14 parâmetros internos + Mix Balance + Bypass:

#### Endereço de Parâmetros (`Element 0x58`, Slot `0x00` a `0x03`):
- `0x10`: **INI.DLY** (Initial Delay: 0.0ms a 500.0ms)
- `0x11`: **REV TIME** (Reverb Time: 0.3s a 99.0s)
- `0x12`: **HI.RATIO** (High Damping: 0.1 a 1.0)
- `0x13`: **LO.RATIO** (Low Damping: 0.1 a 2.0)
- `0x14`: **DIFF** (Diffusion: 0 a 10)
- `0x15`: **DENSITY** (Density: 0% a 100%)
- `0x16`: **HPF** (High Pass Filter: Thru / 20Hz a 8.00kHz)
- `0x17`: **LPF** (Low Pass Filter: 1.00kHz a 20.0kHz / Thru)
- `0x18`: **E/R DLY** (Early Reflection Delay: 0.0ms a 100.0ms)
- `0x19`: **E/R BAL** (Early Reflection Balance: 0% a 100%)
- `0x1A`: **GATE LVL** (Gate Threshold: OFF / -60dB a 0dB)
- `0x1B`: **ATTACK** (Gate Attack Time: 0ms a 120ms)
- `0x1C`: **HOLD** (Gate Hold Time: 0.02ms a 1.96s - Tabela `holdPoints` 216 passos)
- `0x1D`: **DECAY** (Gate Decay Time: 5ms a 42.3s - Tabela `decayPoints` 160 passos)
- `0x30`: **MIX BALANCE** (Wet/Dry Ratio: 0% a 100%)
- `0x34`: **BYPASS** (State: 0 = ON, 1 = BYPASS)

#### Organização da Interface (Desktop vs Mobile)
- **Layout Desktop:** Grid de 4 cartões lado a lado (*Saída & Filtros*, *Tempo & Espectro*, *Reflexões & Difusão*, *Envelope do Gate*).
- **Layout Mobile:** Abas com botões touch e stepper cards (*TEMPO*, *REFLEXÕES*, *FILTROS*, *GATE*).

---

### 10.3. Status de Suporte de Algoritmos

| ID Hex / Dec | Nome do Algoritmo | Status | Ação no Editor |
|---|---|---|---|
| 0 | REVERB HALL | ✅ Suportado | Lazy-Sync + Editor Completo |
| 1 | REVERB ROOM | ✅ Suportado | Lazy-Sync + Editor Completo |
| 2 | REVERB STAGE | ✅ Suportado | Lazy-Sync + Editor Completo |
| 3 | REVERB PLATE | ✅ Suportado | Lazy-Sync + Editor Completo |
| 4+ | REV-X, Delays, Modulações, Dinâmicos, etc. | ⏳ A Mapear | Exibe "Efeito em Construção" (Ignora Sync) |

---

### 10.4. Plano Técnico de Implementação (Passo a Passo)

#### Passo 1: Servidor Rust (`server_rust/src/midi/protocol.rs`)
- Implementar construtor de requisição individual de parâmetro de efeito:
  ```rust
  pub fn build_fx_param_request(slot: u8, param: u8) -> Option<Vec<u8>>
  ```
  Monta o pacote SysEx `F0 43 30 3E 7F 01 58 [PARAM] [SLOT] F7`.

#### Passo 2: Servidor Rust (Parser & State)
- No parser de mensagens de entrada (`Element 0x58` / `Section 0x7F`):
  - Mapear `param` (0x10..0x1D, 0x30, 0x34) e `slot` (0..3).
  - Atualizar o estado global em memória (`GlobalState`).
  - Emitir evento WebSocket `fxParamUpdate` via Socket.IO:
    `{ "slot": slot, "param": param, "value": value }`.

#### Passo 3: Frontend (`public/modules/efeitos.js`)
- Criar controle de sincronização local:
  ```javascript
  const syncedSlots = [false, false, false, false];
  const fxParams = [{}, {}, {}, {}];
  ```
- Na função `openFxEditor(slotIdx)`:
  1. Verificar o `effectType` do slot.
  2. Se `[0, 1, 2, 3].includes(effectType)`:
     - Se `syncedSlots[slotIdx] === false`: emitir evento de WebSocket para o servidor solicitar os parâmetros do slot `slotIdx` à mesa, e marcar `syncedSlots[slotIdx] = true`.
     - Renderizar os cartões e controles do Reverb.
  3. Se não for Reverb:
     - Renderizar o container com aviso de "EFEITO EM CONSTRUÇÃO" para aquele algoritmo.
- Adicionar escuta do evento `fxParamUpdate`:
  - Atualizar `fxParams[slotIdx][param]` e ajustar a posição dos knobs/steppers na tela em tempo real.
- Adicionar manipuladores de envio de alteração (Knobs/Steppers):
  - Enviar evento Socket.IO `changeFxParam` para o servidor gravar a mudança no hardware.

---

### 10.5. Atualização em Tempo Real via FX Library Recall (Mesa → Frontend)

#### Cenário:
Quando o operador executa um **Recall de Biblioteca de Efeitos (FX Library)** diretamente na mesa Yamaha 01V96, a mesa envia comandos SysEx (`0D 04 09...` / `7F 10...`).

#### Requisito de Sincronização Dinâmica:
- Se o modal do editor (`fxEditorModal`) estiver **aberto no navegador**:
  1. O listener de `fxTypesUpdate` invalida o cache local (`syncedSlots[slot] = false` e limpa `fxParamsState[slot]`).
  2. Se o slot modificado for o slot **atualmente visível na tela**, o frontend dispara imediatamente `socket.emit('requestFxSlotParams', { slot: currentSlotIdx })` e exibe o overlay de sincronização (`showEditorSyncOverlay()`).
  3. Ao receber `fxSlotParamsUpdate`, os novos parâmetros da biblioteca selecionada são aplicados e a interface é re-renderizada automaticamente sem exigir que o usuário feche e reabra o modal.

---

### 10.6. Arquitetura Modular e Generalizada (Schema-Driven Frontend — `public/modules/FXS/`)

Para evitar a duplicação de código HTML/JS a cada novo efeito mapeado (ex: Delays, Compressores Multibanda, Modulações, Dinâmicos), o frontend de efeitos foi completamente refatorado para uma **Arquitetura Orientada a Esquemas (Schema-Driven)**.

#### 10.6.1. Divisão de Responsabilidades dos Módulos

```text
public/modules/FXS/
├── fx_registry.js    -> Catálogo declarativo de esquemas por Algorithm ID
├── fx_components.js  -> Biblioteca pura de componentes visuais reutilizáveis
├── fx_core.js        -> Motor genérico de estado, eventos, Lazy-Sync e renderização
├── fx_routing.js     -> Utilitários de patch e conversores de seletores IN/OUT
├── fx_utils.js       -> Formatadores visuais de valores (ms, Hz, dB, ratios, tables)
└── efeitos.js        -> Visão geral dos 4 slots (IN Patch -> Processador -> OUT Patch)
```

#### 10.6.2. Catálogo Declarativo de Efeitos (`FXRegistry`)
- Cada efeito da Yamaha 01V96 possui um ID de Algoritmo único (ex: Reverbs IDs `0..3`, Multiband Compressor ID `25`, Delays IDs `10..15`).
- Para adicionar o suporte a um novo algoritmo, **não é necessário criar nenhuma nova página HTML nem escrever manipuladores de socket ou drag**:
- Basta registrar a estrutura declarativa no `FXRegistry` com:
  1. **Propriedades Gerais:** `id`, `name`, `colorTheme`, `supported: true`.
  2. **Categorias de Agrupamento (`categories`):** Define a ordem das caixas visuais (Desktop) e das abas de navegação (Mobile). Exemplo para Compressor Multibanda: `Crossover & Saída`, `Banda Grave`, `Banda Média`, `Banda Aguda`.
  3. **Mapeamento de Parâmetros (`params`):**
     - `key`: Identificador único (ex: `'thresh_low'`, `'decay'`).
     - `name`: Rótulo exibido na UI (ex: `'THRESHOLD'`, `'REV TIME'`).
     - `sysEx`: Offset numérico SysEx (ex: `0x10`..`0x1D`, `0x30`, `0x34`).
     - `category`: ID da categoria a que pertence.
     - `min`, `max`, `defaultVal`.
     - `formatFn`: Função ou chave utilitária em `FXUtils` para formatar a unidade exibida (`formatTime`, `formatFreq`, `formatGain`, `formatDecayPoints`).

#### 10.6.3. Componentes Genéricos de Interface (`FXComponents`)
Componentes visuais agnósticos criados para atender a qualquer tipo de parâmetro:
- **Knob Rotativo (`renderKnob`):** Anel proporcional SVG + badge de valor + ponteiro rotativo para Desktop.
- **Card Touch com Stepper (`renderStepperCard`):** Controles `-` e `+` responsivos com suporte a toque contínuo (hold) para telas Mobile.
- **Card de Alternância (`renderSwitchCard`):** Botão pill estilo chave ON/OFF para parâmetros booleanos (Bypass, Gate ON/OFF, Phase, etc.).
- **Card Group (`renderCardGroup`):** Contêiner visual para grupos de controles agrupados por categoria.
- **Barra de Abas Mobile (`renderMobileTabs`):** Menu de abas responsivo.
- **Tela "Em Construção" (`renderUnderConstruction`):** Exibição amigável para efeitos ainda não calibrados sem disparar tráfego MIDI.

#### 10.6.4. Motor Central de Estado e Interatividade (`FXCore`)
- **Estado Local Inteligente:** Mantém o cache `fxParamsState` e os flags de sincronização `syncedSlots[4]`.
- **Detecção de Dispositivo:** Detecta automaticamente mobile/desktop e ajusta o layout (salvando preferência no `localStorage`).
- **Atualizações de Desempenho Cirúrgicas (`updateSingleParamDom`):**
  - Ao alterar um parâmetro (via drag no mouse, wheel, stepper hold ou atualização vinda do socket da mesa), o `FXCore` atualiza diretamente o nó específico do DOM (`data-sysex="XYZ"`).
  - Isso elimina perdas de foco, interrupções no movimento do mouse e saltos indesejados de scroll.
- **Gestão de Sincronização em Tempo Real:** Trata reconexões de socket, recalls de preset na mesa física com cooldown de segurança contra loops, e Lazy-Sync dinâmico ao abrir o editor.

---

### 10.7. Plano de Correção Técnica e Regras de Sincronização Definitivas

Nesta seção documentamos o plano passo a passo de engenharia para corrigir os problemas de sincronização, eliminar loops de resync e garantir o comportamento correto do estado dos efeitos em tempo real.

#### 10.7.1. Regras e Princípios Fundamentais da Solução
1. **Garantia de Busca Única (Single-Fetch Guarantee):**
   - O operador **NUNCA** deve abrir a tela de efeitos e ser surpreendido por um sync a cada abertura.
   - O sync dos 14+ parâmetros internos de um slot ocorre **uma única vez** ao abrir a tela (`syncedSlots[slot] = true`).
   - Os dados são salvos na RAM do servidor e na RAM do frontend. Reabrir a tela do mesmo slot lê **100% da RAM**, sem enviar nenhuma nova requisição SysEx à mesa física.
   - O resync só deve e pode ser acionado quando ocorrer um **RECALL DE PRESET** real na mesa física.
2. **Eliminação de Loops e Falsos Alarmes (Zero Resync Loop):**
   - O recebimento de parâmetros de efeito (`0x30` / `fxSlotParamsUpdate` / `fxParamUpdate`) **NUNCA** deve reinvalidar a flag de sincronização.
   - Reconexões de WebSocket (Alt-Tab ou oscilação de rede) apenas lêem a RAM do servidor; **NUNCA** marcam slots como des-sincronizados nem forçam resyncs.
   - Botões de navegação da mesa não afetam a flag de sincronização dos efeitos.
3. **Consistência do Estado Visual em Tempo Real (Bypass & Cards):**
   - O servidor e o app permanecem 100% conscientes das alterações na mesa física em tempo real.
   - Alterações no parâmetro de Bypass (`param 52`) atualizam instantaneamente o card da máquina na tela de visão geral dos 4 slots (`efeitos.js`), aplicando contorno vermelho e o ícone indicativo de pausa.

---

#### 10.7.2. Passo a Passo de Implementação Técnica

##### Passo 1: Parser SysEx no Servidor Rust (`server_rust/src/midi/protocol.rs`)
- Adicionar no enum `ParsedMidi`:
  ```rust
  FxLibraryRecall { slot: u8, preset: u8 }
  ```
- No parser de mensagens SysEx de entrada, capturar o comando de Recall de Preset de Efeito (`Section 0x7F`, `Opcode 0x10`):
  ```rust
  // Mensagem capturada da mesa: F0 43 10 3E 7F 10 [SLOT] 00 [PRESET] 00 [PRESET] F7
  if section == 0x7F && opcode == 0x10 {
      let slot_idx = (slot_raw.saturating_sub(1)) & 0x03; // Mapeia 0x01..0x04 para 0..3
      return ParsedMidi::FxLibraryRecall { slot: slot_idx, preset: preset_id };
  }
  ```

##### Passo 2: Receptor MIDI & Gestor de Estado (`server_rust/src/midi_receiver.rs` & `state.rs`)
- Ao receber `ParsedMidi::FxLibraryRecall { slot, preset }`:
  1. Limpar a entrada de parâmetros daquele slot específico no estado em memória: `global_state.fx_params.get_mut(&slot).map(|map| map.clear());`.
  2. Disparar evento WebSocket Socket.IO limpo e explícito para todos os clientes conectados:
     ```rust
     socket.broadcast().emit("fxLibraryRecall", json!({ "slot": slot, "preset": preset })).await;
     ```

##### Passo 3: Manipuladores de Socket no Servidor (`server_rust/src/socket_handlers.rs`)
- Garantir que a requisição de parâmetros (`requestFxSlotParams`) retorne instantaneamente do cache `state.fx_params` se a RAM já contiver os parâmetros do slot (`if already_synced && !force`), sem enviar requisições MIDI à mesa.
- Garantir que o evento `requestFxTypes` enviado ao conectar o socket retorne apenas a lista atual de tipos para popular os nomes, sem acionar flags de resync no frontend.

##### Passo 4: Frontend Engine (`public/modules/FXS/fx_core.js`)
- **Refatorar o Handler de `fxLibraryRecall`:**
  ```javascript
  socket.on('fxLibraryRecall', function(data) {
      if (!data || data.slot === undefined) return;
      const slot = data.slot;

      // 1. Limpa o cache local do slot que sofreu o recall
      syncedSlots[slot] = false;
      fxParamsState[slot] = {};

      // 2. Se o slot modificado for O SLOT QUE ESTÁ ABERTO ATUALMENTE na tela:
      if (isModalOpen() && currentSlotIdx === slot) {
          showEditorSyncOverlay();
          isSyncingSlot[slot] = true;
          socket.emit('requestFxSlotParams', { slot: slot, force: true });
      }
      // Se o slot estiver FECHADO, nada mais é feito. Na próxima vez que o usuário abrir o slot,
      // syncedSlots[slot] estará false e o Lazy-Sync rodará 1 única vez.
  });
  ```
- **Remover a Gambiarra de Adivinhar Recall em `fxTypesUpdate`:**
  - Remover a lógica que forçava `syncedSlots` para `false` ao receber tipos iguais ou após tempo limite (cooldown hack).
  - O `fxTypesUpdate` passa a cuidar estritamente de atualizar nomes, IDs e os campos globais de Mix (`param 48`) e Bypass (`param 52`).

##### Passo 5: Atualização Visual de Bypass no Overview (`public/modules/FXS/efeitos.js`)
- Conectar o listener de `fxParamUpdate` e `fxTypesUpdate` ao renderizador do overview `efeitos.js`.
- Ao receber `param === 52` (Bypass), atualizar a propriedade `bypass` do slot em `fxSlots[slot].bypass` e chamar a atualização do card da máquina no overview (`renderProcessorCard` / `rerenderIfOpen`), adicionando a classe `fx-card-bypassed` com borda vermelha e o distintivo de pausa visual.

---

## 11. Registro de Descobertas e Soluções Implementadas

### 11.1. Decodificação Exata do Pacote SysEx de Recall de FX (`0x7F 0x10` e `0x7F 0x50`)
- **Anatomia do Pacote Enviado pela Mesa 01V96:**
  `F0 43 10 3E 7F 10 [ACTION] 00 [PRESET] 00 [SLOT] F7`
- **Mapeamento de Bytes Críticos:**
  - `message[4] = 0x7F`: Seção 127 (Biblioteca / Memória).
  - `message[5] = 0x10` / `0x50`: Opcode de Recall / Commit.
  - `message[6] = 0x04`: Sub-tipo / Ação de **FX Library Preset Recall** (`0x00` = Scene Recall, `0x20` = Scene Store, `0x04` = FX Preset Recall). Outros valores indicam bibliotecas distintas (ex: `0x26`/`0x46` = Channel Library, `0x41` = EQ, `0x42` = Comp, `0x43` = Gate).
  - `message[8]`: Número do Preset selecionado (ex: `0x03` = Preset 3).
  - `message[10]`: **Índice Real do Slot de Efeito (0-based)**:
    - `0x00` = FX1 (Slot 1)
    - `0x01` = FX2 (Slot 2)
    - `0x02` = FX3 (Slot 3)
    - `0x03` = FX4 (Slot 4)
- **Correção Aplicada (`server_rust/src/midi/protocol.rs`):**
  A regra de decodificação foi atualizada para extrair o slot diretamente de `(message[10] & 0x03)` e validar estritamente se `message[6] == 0x04`. Isso corrigiu o bug onde o recall no Slot 2 era atribuído ao Slot 4 e impediu falsos disparos quando presets de canal, EQ ou comp eram salvos na mesa.

### 11.2. Solicitação do Parâmetro 0x31 (Effect Type ID) no Servidor
- **Inclusão do Parâmetro 0x31 (`socket_handlers.rs`):**
  Adicionado o código de parâmetro `0x31` (parâmetro 49) ao array de requisições de parâmetros do slot (`requestFxSlotParams`).
- **Garantia de Suporte a Presets Customizados:**
  Permite que o aplicativo consulte diretamente a mesa sobre o ID real do algoritmo (0..63) em qualquer preset de fábrica (1..64) ou preset personalizado criado pelo usuário (65..99), definindo corretamente o nome e o tema visual do efeito.

### 11.3. Sincronização de RAM do Servidor e Atualização Dinâmica do Cabeçalho
- **Atualização na RAM do Servidor (`server_rust/src/state.rs` & `midi_receiver.rs`):**
  Ao processar o `FxLibraryRecall`, o servidor Rust atualiza imediatamente a estrutura `state.fx_types[slot]` com o novo `type_id` (`preset - 1`) e emite o evento `fxTypesUpdate`.
- **Prevenção de Reversão de Cabeçalho:**
  Anteriormente, o servidor mantinha o tipo de efeito antigo em memória durante a requisição de parâmetros e, ao concluir, sobrescrevia a tela do aplicativo de volta para o cabeçalho antigo. Com o sincronismo no servidor, o cabeçalho e o tema de cor (`theme-hall`, `theme-room`, `theme-stage`, `theme-plate`) permanecem atualizados e fixos antes, durante e após o overlay de carregamento.

### 11.4. Sincronização em Tempo Real do Estado de Bypass
- **Integração Overview x Editor (`public/modules/FXS/efeitos.js` & `fx_core.js`):**
  - Implementada a função `syncFxSlotsFromCore()` no overview (`efeitos.js`), lendo o estado atual do parâmetro 52 (Bypass) e do `fxTypeState`.
  - Atualizadas as funções `closeFxEditor()` e `sendParamChange(52)` para disparar a re-renderização do overview ao fechar o editor ou ao alterar o bypass pelo aplicativo.
  - Adicionada a função `toggleSlotBypass(idx)` permitindo acionar o bypass diretamente pelos botões `||` / `>` nos cards de máquinas na tela de visão geral.
- **Ajuste na Emissão de Socket no Backend (`socket_handlers.rs`):**
  Alterada a emissão de `changeFxParam` de `socket.broadcast().emit` para `io.emit`, garantindo que tanto os outros clientes da rede quanto a própria aba que originou o comando recebam a confirmação da mudança e mantenham o card do overview destacado em vermelho (`.fx-bypass-on`).

---

## 12. Mapeamento de Algoritmo: Multiband Compressor (M.BAND DYNA.)

Catalogação de todos os parâmetros do efeito **M.BAND DYNA.** (Compressor Multibanda), capturados interativamente via `studio.js` e Studio Manager.

### 12.1. Tabela Geral de Parâmetros

| # | Nome do Parâmetro | SysEx (Hex/Dec) | Valor Mínimo (Hex / Dec / Texto) | Valor Máximo (Hex / Dec / Texto) | Status / Lógica de Conversão |
|---|---|---|---|---|---|
| 1 | **LOW GAIN** | `0x10` (16 dec) | `0x00 00` / `0` / `-96.0dB` | `0x08 38` / `1080` / `+12.0dB` | ✅ **Linear:** `(val - 960) / 10` dB (passos de 0.1dB, 0.0dB = 960 / `0x07 40`) |
| 2 | **MID GAIN** | `0x11` (17 dec) | `0x00 00` / `0` / `-96.0dB` | `0x08 38` / `1080` / `+12.0dB` | ✅ **Linear:** `(val - 960) / 10` dB (passos de 0.1dB, 0.0dB = 960 / `0x07 40`) |
| 3 | **HI. GAIN** | `0x12` (18 dec) | `0x00 00` / `0` / `-96.0dB` | `0x08 38` / `1080` / `+12.0dB` | ✅ **Linear:** `(val - 960) / 10` dB (passos de 0.1dB, 0.0dB = 960 / `0x07 40`) |
| 4 | **PRESENCE** | `0x13` (19 dec) | `0x00 00` / `0` / `-10` | `0x00 14` / `20` / `+10` | ✅ **Linear:** `val - 10` (passos de 1, centro 0 = 10 / `0x00 0A`) |
| 5 | **CMP.THRE** | `0x18` (24 dec) | `0x00 00` / `0` / `-24.0dB` | `0x01 70` / `240` / `0.0dB` | ✅ **Linear:** `(val - 240) / 10` dB (passos de 0.1dB, 240 passos) |
| 6 | **CMP.RAT** | `0x19` (25 dec) | `0x00 00` / `0` / `1:1` | `0x00 0E` / `14` / `20:1` | ✅ **Lookup (15 pontos):** `['1:1', '1.1:1', '1.3:1', '1.5:1', '1.7:1', '2:1', '2.5:1', '3:1', '3.5:1', '4:1', '5:1', '6:1', '8:1', '10:1', '20:1']` |
| 7 | **CMP.ATK** | ⏳ | ⏳ | ⏳ | ⏳ Pendente |
| 8 | **CMP.REL** | ⏳ | ⏳ | ⏳ | ⏳ Pendente |
| 9 | **CMP.KNEE** | ⏳ | ⏳ | ⏳ | ⏳ Pendente |
| 10 | **LOOKUP** | ⏳ | ⏳ | ⏳ | ⏳ Pendente |
| 11 | **CMP.BYP** | ⏳ | ⏳ | ⏳ | ⏳ Pendente |
| 12 | **L-M XOVR** | ⏳ | ⏳ | ⏳ | ⏳ Pendente |
| 13 | **M-H XOVR** | ⏳ | ⏳ | ⏳ | ⏳ Pendente |
| 14 | **SLOPE** | ⏳ | ⏳ | ⏳ | ⏳ Pendente |
| 15 | **CEILING** | ⏳ | ⏳ | ⏳ | ⏳ Pendente |
| 16 | **EXP.THRE** | ⏳ | ⏳ | ⏳ | ⏳ Pendente |
| 17 | **EXP.RAT** | ⏳ | ⏳ | ⏳ | ⏳ Pendente |
| 18 | **EXP.REL** | ⏳ | ⏳ | ⏳ | ⏳ Pendente |
| 19 | **EXP.BYP** | ⏳ | ⏳ | ⏳ | ⏳ Pendente |
| 20 | **LIM.THRE** | ⏳ | ⏳ | ⏳ | ⏳ Pendente |
| 21 | **LIM.ATK** | ⏳ | ⏳ | ⏳ | ⏳ Pendente |
| 22 | **LIM.REL** | ⏳ | ⏳ | ⏳ | ⏳ Pendente |
| 23 | **LIM.BYP** | ⏳ | ⏳ | ⏳ | ⏳ Pendente |
| 24 | **LIM.KNEE** | ⏳ | ⏳ | ⏳ | ⏳ Pendente |
| 25 | **SOLO LOW** | ⏳ | ⏳ | ⏳ | ⏳ Pendente |
| 26 | **SOLO MID** | ⏳ | ⏳ | ⏳ | ⏳ Pendente |
| 27 | **SOLO HIGH** | ⏳ | ⏳ | ⏳ | ⏳ Pendente |
| 28 | **BYPASS (Mix)**| ⏳ | ⏳ | ⏳ | ⏳ Pendente |
| 29 | **MIX BALANCE** | ⏳ | ⏳ | ⏳ | ⏳ Pendente |





