# Plano: Botão de Alternar/Esconder Teclado Virtual no Scene Grid Modal

## 1. Diagnóstico do Problema

No `#sceneGridModal`, o `#virtualKeyboardSearch` contém um teclado QWERTY de 5 linhas (10+10+9+7+espaço) que ocupa ~250px de altura vertical. Como o modal tem altura limitada (`95vh`), o VK "come" espaço precioso do grid de cenas, impedindo scroll e visualização.

O VK só é automaticamente escondido via CSS quando:
- `max-width: 767px` (celular)
- `max-height: 500px` (landscape curto)

Em telas como Steam Deck (1280×800) ou tablets em landscape, nenhum desses breakpoints bate, e o VK fica sempre visível, sem opção de fechar.

### Estrutura Atual do HTML

```
#sceneGridModal (.modal-overlay)
└── .modal-content (.inline-style-50) — flex column, height:95vh
    ├── #sceneGridTitle
    ├── #sceneGrid (.styled-sceneGrid) — flex:1, overflow-y:auto, grid 2 colunas
    ├── #virtualKeyboardSearch (.styled-virtualKeyboardSearch) — flex-shrink:0, 5 linhas de botões
    └── .btn-close (CANCELAR)
```

### Inline VK Functions (index.html:1609-1654)

O VK usa funções inline (`vkType`, `vkBackspace`, `startVkBackspace`, `stopVkBackspace`) — não usa o módulo `virtual-keyboard.js`. São chamadas diretamente via `onclick`/`onmousedown` nos botões.

## 2. Estratégia: Botão de Toggle com Persistência de Estado

Adicionar um botão "fechar" (toggle) ao `#virtualKeyboardSearch` que:

1. **Ao clicar**: esconde o VK (`display: none`), recuperando o espaço para o grid
2. **Mostra um indicador visual**: um botão fixo/visível que permite reabrir o VK
3. **Persists state**: usa `localStorage` para lembrar a preferência do usuário entre aberturas do modal
4. **Auto-fecha ao fechar o modal**: quando o modal é fechado, o VK volta a `display: flex` (estado padrão)

### 2.1. HTML — Botão de Toggle

Adicionar um botão toggle na primeira linha do VK (ao lado ou antes do primeiro botão), com `onclick="toggleSceneVk()"`:

```html
<div class="inline-style-51">
    <button class="virtual-keyboard-btn vk-toggle-btn" 
            onclick="toggleSceneVk()" 
            title="Mostrar/Ocultar teclado"
            type="button">⌨︎</button>
    <!-- ... restante dos botões da primeira linha ... -->
</div>
```

### 2.2. CSS — Classe para VK Oculto

```css
/* Estado oculto: VK sumiu, espaço recuperado */
#virtualKeyboardSearch.vk-hidden {
    display: none !important;
}

/* Botão toggle sempre visível quando VK está oculto */
.styled-sceneGridModal .vk-toggle-btn {
    flex: 0 0 auto;
    width: 40px;
    min-width: 40px;
    background: #444;
    border-color: #666;
    color: #ffcc00;
    font-size: 16px;
}
```

O grid (`#sceneGrid`) já tem `flex: 1` e `overflow-y: auto`, então quando o VK sumir, o grid automaticamente expande e ocupa todo o espaço disponível — **sem necessidade de mudar CSS adicional**.

### 2.3. JavaScript — Função `toggleSceneVk()`

```javascript
/**
 * Alterna a visibilidade do teclado virtual no scene grid modal.
 * Persiste o estado no localStorage para reaberturas futuras.
 */
function toggleSceneVk(forceState) {
    const vk = document.getElementById('virtualKeyboardSearch');
    if (!vk) return;

    const isCurrentlyHidden = vk.classList.contains('vk-hidden');
    const shouldHide = forceState !== undefined ? forceState : isCurrentlyHidden;

    if (shouldHide) {
        vk.classList.remove('vk-hidden');
        localStorage.setItem('sceneVkHidden', 'false');
    } else {
        vk.classList.add('vk-hidden');
        localStorage.setItem('sceneVkHidden', 'true');
    }
}

/**
 * Restaura o estado salvo do VK ao abrir o scene grid modal.
 */
function restoreSceneVkState() {
    const vk = document.getElementById('virtualKeyboardSearch');
    if (!vk) return;
    const wasHidden = localStorage.getItem('sceneVkHidden') === 'true';
    if (wasHidden) {
        vk.classList.add('vk-hidden');
    } else {
        vk.classList.remove('vk-hidden');
    }
}
```

### 2.4. Integração com `scene_grid.js`

No final de `showSceneGrid()`, após montar todos os elementos, chamar:

```javascript
restoreSceneVkState();
```

### 2.5. Botão de Reabrir VK (quando oculto)

Quando o VK está `.vk-hidden`, o espaço dele some. Mas o usuário precisa de um botão para reabri-lo. Duas opções:

**Opção A (simples)**: Adicionar um pequeno botão fixo na parte inferior do grid que aparece apenas quando o VK está oculto:

```css
/* Botão "mostrar teclado" visível apenas quando VK está oculto */
.vk-show-hint {
    display: none;
    flex-shrink: 0;
    padding: 8px;
    justify-content: center;
}
#virtualKeyboardSearch.vk-hidden ~ .vk-show-hint {
    display: flex;
}
```

**Opção B (recomendada)**: O próprio toggle button (`#vkToggleBtn`) pode ficar visível fora do VK, como um botão fixo no canto inferior do modal. Quando o VK está visível, o botão diz "Esconder" (ou mostra ícone de teclado fechado 👆); quando oculto, diz "Mostrar" (ou ícone de teclado aberto ⌨︎).

## 3. Arquivos e Mudanças

| Passo | Ação | Arquivo | Linhas |
|---|---|---|---|
| 1 | Adicionar função `toggleSceneVk()` e `restoreSceneVkState()` inline | `index.html` | ~1609 (junto com `vkType`) |
| 2 | Adicionar botão toggle `⌨︎` no início da primeira linha do VK | `index.html` | ~753 (início do primeiro `.inline-style-51`) |
| 3 | Adicionar CSS `.vk-hidden` e `.vk-toggle-btn` | `style.css` | ~5880 (após media queries do VK) |
| 4 | Chamada `restoreSceneVkState()` em `showSceneGrid()` | `scene_grid.js` | ~149 (após montagem dos elementos) |
| 5 | Garantir VK volta a `display: flex` ao fechar modal (reset default) | `index.html` | — (opcional: o HTML tem `display: flex` por padrão via CSS) |

## 4. Fluxo de Uso

1. **Usuário abre o scene grid modal** → `showSceneGrid()` roda → `restoreSceneVkState()` aplica o estado salvo (VK visível ou oculto)
2. **Usuário clica no botão `⌨︎` (toggle)** → `toggleSceneVk()` adiciona/remove `.vk-hidden` no `#virtualKeyboardSearch`
3. **VK desaparece** → `#sceneGrid` (que já tem `flex: 1` e `overflow-y: auto`) expande automaticamente, ocupando todo o espaço → scroll funciona
4. **Usuário clica novamente no botão** → VK reaparece no mesmo estado
5. **Estado persiste** → `localStorage` salva `sceneVkHidden = "true"/"false"`
6. **Reabre o modal** → `restoreSceneVkState()` aplica o último estado

## 5. Benefícios

| Scenario | Antes | Depois |
|---|---|---|
| **Steam Deck 1280×800** | VK sempre visível, ~250px bloqueados | Usuário esconde com 1 clique, grid expande |
| **Tablets landscape** | VK sempre visível | Usuário controla visibilidade |
| **Celular (VK já oculto via CSS)** | VK sempre `display: none` | Botão toggle não interfere (VK já é escondido pelo media query) |
| **Desktop** | VK visível por padrão | Usuário pode esconder para mais espaço no grid |
| **Reabertura do modal** | Sempre reset | Estado persistido via localStorage |

## 6. Considerações de Design

- O botão toggle (`⌨︎`) usa a mesma classe `.virtual-keyboard-btn` para consistência visual com os outros botões do VK
- O toggle está na **primeira linha** do VK, então quando o VK está oculto, o toggle some junto (solução alternativa: manter um botão fixo separado)
- A persistencia via `localStorage` é por scoped key (`sceneVkHidden`), não afeta outros VKs
- A classe `.vk-hidden` usa `display: none !important` para garantir que sobrescreva qualquer regra de media query
