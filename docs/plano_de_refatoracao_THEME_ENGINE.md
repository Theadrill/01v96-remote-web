# Plano de Refatoração — Theme Engine (`theme-engine.js`)

## Objetivo

Extrair a função `_loadTheme()` do `confirm-modal.js` para um arquivo dedicado `theme-engine.js`, criando um injector único e desacoplado responsável por aplicar todas as variáveis CSS do tema.

---

## Motivação

- `confirm-modal.js` é atualmente um "God file" (~750 linhas) misturando lógica de UI de modal com injeção de ~347 variáveis CSS
- `ThemeManager` e `ThemeEditor` dependem de `ConfirmModal.loadTheme()` — acoplamento incorreto entre camadas
- Um injector único e desacoplado facilita manutenção, testes e futuras extensões do sistema de temas

---

## Mapeamento — `_loadTheme()` em `confirm-modal.js`

- **Declaração**: linha 256
- **Corpo**: linhas 256–704 (~448 linhas)
- **Padrão de injeção**: `root.style.setProperty('--css-var', value)` onde `root = document.documentElement`
- **Helper interno**: `getVal(section, key, fallbackKey)` (linhas 360–368) — usado nos blocos de channel_strip

### Blocos de injeção

| Bloco | Seção YAML | Linhas | CSS Vars |
|-------|-----------|--------|----------|
| A | `global` | 269–270 | 1 |
| B | `confirm_modal` | 272–306 | 24 |
| C | `virtual_keyboard` | 308–321 | 12 |
| D | `bubble_modal` | 323–335 | 11 |
| E | `channel_lock` | 337–352 | 9 |
| F | `channel_strip.global` | 354–542 | 144 |
| G | `channel_strip.desktop` | 544–602 | 57 |
| H | `channel_strip.mobile` | 604–666 | 57 |
| I | `main_view` | 668–677 | 8 |
| J | `channel_setup` | 679–703 | 24 |
| **TOTAL** | | | **347** |

**Obs.**: Bloco E também define `window.themeChannelLockConfig` (objeto JS consumido por `channel_lock.js`) — deve ser preservado em `_apply()`.

### Bloco DOMContentLoaded (auto-load no boot)

- **Linhas**: 726–751 (fora da IIFE, após o fechamento do módulo)
- Determina `basePath` pelo pathname (`/new` ou raiz)
- Faz fetch de `themes/default.yaml` e chama `ConfirmModal.loadTheme(yaml)`
- Fallback para `/api/themes/active` em caso de erro

### Call sites externos de `ConfirmModal.loadTheme()`

| Arquivo | Linhas | Contexto |
|---------|--------|----------|
| `theme-manager.js` | 123–125 | `applyTheme()` após fetch da API |
| `theme-editor.js` | 307–309 | Live preview em `onFieldChange()` |
| `theme-editor.js` | 406–408 | Após admin-save em `saveTheme()` |
| `theme-editor.js` | 429–431 | Após save normal em `saveTheme()` |

---

## Solução — Novo arquivo `theme-engine.js`

**Caminho**: `public_new/modules/services/theme-engine.js`

### Estrutura (padrão IIFE do codebase)

```js
/**
 * ThemeEngine — Motor de injeção de variáveis CSS a partir de YAML de temas
 * Uso: ThemeEngine.apply(yamlString)
 */
var ThemeEngine = (function () {
    'use strict';

    function _apply(yamlContent) {
        if (typeof jsyaml === 'undefined') {
            console.warn('[ThemeEngine] js-yaml não carregado. Tema não aplicado.');
            return;
        }
        var theme = jsyaml.load(yamlContent);
        if (!theme) return;
        var root = document.documentElement;
        // ... corpo transplantado de confirm-modal.js linhas 265–703
    }

    return {
        apply: _apply
    };
})();

// Auto-carregar tema no boot
document.addEventListener('DOMContentLoaded', function () {
    var basePath = window.location.pathname.includes('/new') ? '/new/themes/' : 'themes/';
    fetch(basePath + 'default.yaml?t=' + Date.now())
        .then(function (r) {
            if (!r.ok) throw new Error('Falha ao carregar tema (' + r.status + ')');
            return r.text();
        })
        .then(function (yaml) {
            if (typeof ThemeEngine !== 'undefined' && ThemeEngine.apply) {
                ThemeEngine.apply(yaml);
            }
        })
        .catch(function (e) {
            console.warn('[ThemeEngine] Fallback:', e);
            fetch('/api/themes/active')
                .then(function (r) { return r.json(); })
                .then(function (data) {
                    if (data && data.content) ThemeEngine.apply(data.content);
                })
                .catch(function (err) {
                    console.error('[ThemeEngine] Erro final ao carregar tema:', err);
                });
        });
});
```

### Assinatura `apply(yamlString)`

Recebe string YAML (não objeto parsed) — igual ao contrato atual de todos os call sites. Mudança nos call sites é **rename puro**, sem reshaping de argumentos.

---

## Mudanças necessárias

### 1. Criar `public_new/modules/services/theme-engine.js`

Transplantar corpo de `_loadTheme()` (linhas 265–703) + helper `getVal()` para dentro de `_apply()`. Mover bloco DOMContentLoaded para cá.

### 2. Limpar `confirm-modal.js`

| O que remover | Linhas |
|---------------|--------|
| Comentário `// --- Carregar tema YAML ---` | 254 |
| Função `_loadTheme()` completa | 255–704 |
| `loadTheme: _loadTheme` no return público | 721 |
| Bloco DOMContentLoaded auto-load | 725–751 |

**Resultado**: arquivo ~230 linhas, pure UI modal com só `show` e `alert` no return.

### 3. `theme-manager.js` — 1 call site

```js
// Antes
if (data && data.content && typeof ConfirmModal !== 'undefined' && ConfirmModal.loadTheme) {
    ConfirmModal.loadTheme(data.content);
}
// Depois
if (data && data.content && typeof ThemeEngine !== 'undefined' && ThemeEngine.apply) {
    ThemeEngine.apply(data.content);
}
```

### 4. `theme-editor.js` — 3 call sites (linhas 307–309, 406–408, 429–431)

Mesmo rename: `ConfirmModal.loadTheme(x)` → `ThemeEngine.apply(x)`

### 5. `public_new/index.html`

Adicionar na **Camada 2 (Serviços)**, antes de `theme-manager.js`:

```html
<script src="modules/services/theme-engine.js"></script>
```

### 6. `public_new/themes-admin.html`

Adicionar entre `confirm-modal.js` e `theme-manager.js`:

```html
<script src="modules/services/theme-engine.js"></script>
```

---

## Ordem de implementação

1. Criar `public_new/modules/services/theme-engine.js`
2. Editar `public_new/index.html` — adicionar script tag na Camada 2
3. Editar `public_new/themes-admin.html` — adicionar script tag
4. Editar `public_new/modules/components/modals/confirm-modal.js` — remover `_loadTheme` e DOMContentLoaded
5. Editar `public_new/modules/services/theme-manager.js` — rename call site
6. Editar `public_new/modules/components/theme-editor.js` — rename 3 call sites
7. Testar: boot da app, live preview no editor, save/apply de tema, channel_lock

---

## Riscos e mitigações

| Risco | Mitigação |
|-------|-----------|
| `theme-engine.js` carregando após `theme-manager.js` | Garantir ordem no HTML: theme-engine ANTES de theme-manager |
| `jsyaml` não disponível no DOMContentLoaded | Verificar que script jsyaml não tem `async`/`defer` |
| `window.themeChannelLockConfig` sumir | Preservar o bloco de atribuição dentro de `_apply()` |
| Regressão no `public/` (build legado) | Não tocar em `public/` nesta refatoração |

---

## Resultado esperado

- `theme-engine.js`: ~480 linhas, responsabilidade única (injeção de CSS vars)
- `confirm-modal.js`: ~230 linhas, responsabilidade única (UI de modal)
- Zero regressões funcionais — é um refactor puro de organização
