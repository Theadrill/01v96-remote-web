# Plano de Implementação: Otimização de Layout Mobile para Telas Compactas (iPhone SE 2)

Este documento estabelece o plano técnico e arquitetural para adaptação responsiva do Channel Strip (`public_new`) para smartphones compactos com altura vertical limitada (como o iPhone SE 2, iPhone 8 e viewports com altura útil reduzida), mantendo **100% inalterado** o comportamento e a estética em desktops, notebooks, tablets e smartphones de 6+ polegadas.

---

## 1. 🎯 Contexto e Motivação

### 1.1 Dispositivo Alvo: iPhone SE (2ª e 3ª Geração)
- **Viewport Nominal:** `375px × 667px` (Retrato / Portrait).
- **Altura Útil Real no Safari/Chrome Mobile:** Entre `520px` e `560px` devido às barras de status, endereço e toolbar de navegação inferior do iOS, além da barra de gestos do sistema (*Home Indicator*).
- **Sintoma Observado:** 
  A base do Channel Strip desaparece (fica cortada). O botão de **Nudge `-`**, o **visor de dB** (`-17.5 dB`) e a **leitura do Patch** (`AD1`, `OMNI 1`, etc.) são empurrados para fora da área visível do card e truncados pelo `overflow: hidden`.

---

## 2. 🔍 Diagnóstico Técnico (Auditoria Impeccable - Modo Operate)

### 2.1 A Causa Raiz
No arquivo [`public_new/styles/components/channel_strip.css`](../public_new/styles/components/channel_strip.css), a pilha vertical dos elementos no card mobile acumula alturas mínimas fixas:

1. **Header do Canal:** ~22px
2. **Display OLED do Nome:** 24px fixos
3. **Top Action (SOLO / PRE):** ~32px
4. **Primary Action (ON):** ~42px
5. **Feature Action (Medidores / Posição - quando ativo):** ~30px
6. **Nudge Superior (+):** ~34px
7. **Trilho do Fader (`.mobile-fader-track-area`):** **184px rígidos (`min-height: 180px`)**
8. **Nudge Inferior (-):** ~34px
9. **Visor de dB:** ~24px
10. **Leitura de Patch:** ~20px
11. **Paddings e gaps verticais:** ~25px

**Soma acumulada:** **~430px a 470px**.  
Quando combinada com o padding de [`.faders-area`](../public_new/style.css) (`10px 20px`), safe-areas e barras do navegador, o card ultrapassa a altura do viewport. O fader com `min-height: 180px` se recusa a encolher, empurrando o rodapé para o overflow.

---

## 3. 📐 Diretrizes de Design & Princípios

1. **Isolamento de Impacto (Zero Regressão):**
   - **Desktop & Notebook (`layout-desktop`):** Não sofre nenhuma alteração.
   - **Tablets (iPads / Android Tabs):** Mantêm altura ampla (> 800px) e o layout mobile padrão atual.
   - **Smartphones de 6+ polegadas (iPhone 13/14/15, Galaxy S/A):** Mantêm o layout mobile atual com Nudge `+` no topo e `-` na base.
   - **Smartphones Compactos (`max-height <= 700px`):** Ativam automaticamente as regras do Modo Compacto.

2. **Nudges Lado a Lado no Rodapé (Ergonomia Impeccable):**
   - Remove o Nudge `+` do topo em telas pequenas, liberando **~35px verticais diretos** para o curso útil do fader.
   - Posiciona o par de botões de ajuste fino `[-]  [+]` lado a lado na base do fader, dentro da *Thumb Zone* (zona de alcance natural do polegar).

3. **Ocultação Inteligente do Patch (*Progressive Disclosure*):**
   - Em telas pequenas, a informação de Patch é estática e secundária em relação ao fader e botões de mixagem em tempo real.
   - Ocultar o texto de Patch no modo compacto economiza **~20px verticais**. O técnico continua tendo acesso ao Patch abrindo o modal de *Channel Setup*.

4. **Trilho do Fader Elástico:**
   - O trilho do fader passa a utilizar dimensionamento adaptável: `min-height: clamp(80px, 24vh, 180px)`, permitindo flexibilidade sem nunca colapsar.

---

## 4. 🛠️ Plano de Ação Passo a Passo

### Etapa 1: Estruturação dos Nudges no Template Mobile
- **Arquivo:** [`public_new/modules/components/channel_strip.js`](../public_new/modules/components/channel_strip.js)
- **Ação:**
  - Manter o container do Nudge Superior com a classe `.mobile-nudge-top`.
  - No container inferior, organizar o cluster de nudges `.mobile-nudge-cluster` contendo tanto o botão `.mobile-nudge-minus` quanto uma réplica do `.mobile-nudge-plus` (ou renderização adaptativa).
  - Atualizar o cache O(1) de seletores e listeners de pointer events para vincular os eventos aos botões de forma transparente em ambas as posições.

### Etapa 2: Regras de Estilo Padrão vs Modo Compacto
- **Arquivo:** [`public_new/styles/components/channel_strip.css`](../public_new/styles/components/channel_strip.css)
- **Ação:**
  - **Comportamento Padrão (Telas amplas):**
    - `.mobile-nudge-top`: `display: flex;`
    - `.mobile-nudge-cluster .mobile-nudge-plus`: `display: none;` (mantém layout clássico)
    - `.mobile-patch-readout`: `display: block;`
  - **Media Query Compacta (`@media (max-height: 700px) and (max-width: 600px)`):**
    - `.mobile-nudge-top`: `display: none;`
    - `.mobile-nudge-cluster`: `display: flex; flex-direction: row; justify-content: center; gap: 8px; width: 100%;`
    - `.mobile-nudge-cluster .mobile-nudge-btn`: `flex: 1; max-width: 44px; height: 32px;`
    - `.mobile-patch-readout`: `display: none;`
    - `.mobile-fader-track-area`: `min-height: clamp(80px, 22vh, 160px); margin: 2px 0;`
    - `.mobile-card-content`: `padding: 4px 4px 4px 4px;`
    - Respeito à `env(safe-area-inset-bottom)`.

### Etapa 3: Ajustes Globais da Área de Faders no Mobile
- **Arquivo:** [`public_new/style.css`](../public_new/style.css)
- **Ação:**
  - Em telas compactas, reduzir levemente o padding de `.faders-area` de `10px 20px` para `6px 12px` para garantir respiro vertical máximo.

---

## 5. 🧪 Critérios de Aceite e Verificação

1. **iPhone SE 2 (Emulador / Safari 375x667):**
   - Todos os elementos (Header, Nome, Solo, On, Fader, Nudges `[-] [+]`, dB) ficam visíveis sem corte.
   - O Patch fica oculto sem deixar espaço em branco vazio.
   - Nudges `[-]` e `[+]` funcionam com toque único e toque contínuo (incremento/decremento dB).
   - O Fader responde suavemente a arrastos verticais com a nova altura elástica.
2. **iPhone 13/14/15 Pro (Viewport 390x844 ou maior):**
   - O Nudge `+` permanece no topo;
   - O Nudge `-` permanece na base;
   - O Patch permanece visível;
   - Nenhum estilo compacto interfere.
3. **Desktop (`layout-desktop`):**
   - 100% inalterado.
