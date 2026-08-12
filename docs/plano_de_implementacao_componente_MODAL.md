# Plano de Implementação — Componente ConfirmModal + Sistema de Temas

## Visão Geral
Criar um componente reutilizável de modal de confirmação com sistema de temas global em YAML, padronizando cores, layouts e botões do projeto.

---

## REGRAS EXPLÍCITAS

### 1. Commits
- **NÃO FAZER COMMIT** sem pedido explícito do usuário
- Se continuar a conversa após push, **NÃO** repetir push a cada alteração — aguardar novo pedido

### 2. Linters e Qualidade
- Rodar `npm run lint` (se existir) após cada alteração de código
- Rodar `cargo check` (se aplicável) para verificar compilação
- Corrigir todos os warnings/erros antes de prosseguir

### 3. Fases
- Cada fase tem **PARADA EXPLÍCITA** — aguardar aprovação do usuário
- Ao completar uma fase, marcar como `[X]` no checklist abaixo
- **NÃO** prosseguir para a próxima fase sem autorização
- Fases:
  - [X] **FASE 1** — Criação do Componente (INDEPENDENTE)
  - [ ] **FASE 2** — Refatoração dos Modais Existentes
  - [ ] **FASE 3** — Painel de Configuração de Temas

---

## Decisões de Design

| Decisão | Escolha |
|---------|---------|
| Prefixo CSS | `confirm-modal-*` |
| Variáveis CSS | `--confirm-modal-*` |
| YAML seção | `confirm_modal:` |
| Dependência js-yaml | `public/vendor/js-yaml.min.js` |
| Ícones | FontAwesome Solid (~185KB) em `public/vendor/fontawesome/` |
| Formato do tema | YAML com comentários (para não-devs) |
| API do ConfirmModal | Só `show()` com Promise |
| Ícones no modal | Suporta emoji OU classe FA |
| Z-index | Dentro do componente `confirm_modal:` |
| Tema | Global, carrega no boot |
| Persistência | Backend/config.json |
| Faseamento | 3 fases com parada explícita |

---

## FASE 1 — Criação do Componente (INDEPENDENTE)
> ⚠️ **PARADA EXPLÍCITA** — Aguardar aprovação do usuário antes de prosseguir para Fase 2.

### 1.1 Instalar dependências
- [X] Baixar `js-yaml.min.js` → `public/vendor/js-yaml.min.js`
- [X] Baixar FontAwesome Solid (all.min.css + webfonts/) → `public/vendor/fontawesome/`
- [X] Adicionar script tags no `index.html`

### 1.2 Criar estrutura de temas
- [X] Criar pasta `public/themes/`
- [X] Criar arquivo `public/themes/default.yaml` com variáveis globais
- [X] Variáveis organizadas por componente (confirm_modal, sidebar, faders, etc.)
- [X] Seção `confirm_modal:` com todas as variáveis `--confirm-modal-*`
- [X] Z-index dentro do componente confirm_modal

### 1.3 Criar classes CSS do componente
- [X] `.confirm-modal-overlay` — overlay de fundo
- [X] `.confirm-modal-content` — card do modal
- [X] `.confirm-modal-content--danger` — variante com borda vermelha
- [X] `.confirm-modal-content--warning` — variante com borda amarela
- [X] `.confirm-modal-content--info` — variante com borda azul
- [X] `.confirm-modal-header` — título
- [X] `.confirm-modal-body` — mensagem/conteúdo
- [X] `.confirm-modal-footer` — container dos botões
- [X] `.confirm-modal-btn` — botão base
- [X] `.confirm-modal-btn--primary` — verde (ação positiva)
- [X] `.confirm-modal-btn--danger` — vermelho (ação destrutiva)
- [X] `.confirm-modal-btn--warning` — amarelo (atenção)
- [X] `.confirm-modal-btn--info` — azul (informativo)
- [X] `.confirm-modal-btn--secondary` — cinza (cancelar)
- [X] `.confirm-modal-icon` — ícone (suporta FA ou emoji)

### 1.4 Criar módulo JS (`confirm-modal.js`)
- [X] Classe `ConfirmModal` com método estático `show(options)`
- [X] Options: `{ title, message, confirmText, cancelText, type, icon, onConfirm, onCancel }`
- [X] Retorna `Promise<boolean>` (true = confirmou, false = cancelou)
- [X] Função `loadTheme(yamlContent)` que parseia YAML e aplica variáveis CSS
- [X] Gerencia estado: fecha modal anterior antes de abrir novo
- [X] Cria DOM dinamicamente (sem HTML estático no index.html)
- [X] Suporte a fechar com ESC e clique no overlay

### 1.5 Incluir no index.html
- [X] Adicionar `<script src="vendor/js-yaml.min.js">`
- [X] Adicionar `<link href="vendor/fontawesome/all.min.css" rel="stylesheet">`
- [X] Adicionar `<script src="modules/confirm-modal.js">`

### 1.6 Testes manuais
- [X] Testar todos os tipos: primary, danger, warning, info
- [X] Testar fechamento com ESC
- [X] Testar fechamento com clique no overlay
- [X] Testar Promise resolve/reject
- [X] Testar que modal anterior fecha ao abrir novo
- [X] Testar carregamento do tema YAML
- [X] Testar aplicação das variáveis CSS
- [X] Testar ícones FA e emojis

### 1.7 Rodar verificação de qualidade
- [X] Rodar linter (se existir)
- [X] Verificar erros no console do browser
- [X] Corrigir qualquer problema encontrado

---

## FASE 2 — Refatoração dos Modais Existentes
> ⚠️ **PARADA EXPLÍCITA** — Só iniciar após Fase 1 completa e aprovada.
>
> **Flow:** Refatorar 1 modal por vez → aguardar teste do usuário → próximo modal.

### Modais a refatorar (por prioridade):

| # | Modal ID | Arquivo | Tipo | Complexidade | Status |
|---|----------|---------|------|--------------|--------|
| 1 | `masterOnConfirmModal` | channel_strip.js | Sim/Não perigo | Média | [X] |
| 2 | `customConfirmModal` | copy_paste.js | Sim/Não | Baixa | [X] |
| 3 | `restoreConfirmModal` | index.html | Sim/Não perigo | Baixa | [X] |
| 4 | `logoutConfirmModal` | index.html | Sim/Não | Baixa | [X] |
| 5 | `macroDeleteConfirmModal` | index.html | Sim/Não perigo | Baixa | [X] |
| 6 | `sceneDeleteModal` | index.html | Sim/Não perigo | Baixa | [X] |
| 7 | `sceneConfirmModal` | index.html | Sim/Não + input | Alta | [X] |
| 8 | `macroSyncConfirmModal` | index.html | Sim/Não | Baixa | [X] |
| 9 | `macroSyncDisableModal` | index.html | 3 opções | Média | [X] |
| 10 | `copyOptionsModal` | index.html | 3 opções | Média | [X] |
| 11 | `insertConfirmModal` | inserts.js | Sim/Não perigo | Baixa | [X] |

### Pré-requisito: Componente VirtualKeyboard

O `sceneConfirmModal` requer input de texto + teclado virtual. Para suportar isso:

#### Arquitetura

```
VirtualKeyboard (componente puro, reutilizável)
├── Usado por ConfirmModal (quando option.input está presente)
├── Usado por SceneSearch (campo de pesquisa de cenas)
└── Usado por qualquer outro lugar no futuro
```

#### Etapas

1. [X] **YAML `default.yaml`** — Nova seção `virtual_keyboard:` com variáveis CSS
2. [X] **`virtual-keyboard.js`** — Componente puro que gera teclado dinamicamente
   - `VirtualKeyboard.create(targetInputId)` → HTMLElement
   - Funções `vkType`, `vkBackspace` ficam internas (não poluem global)
   - Usa classes `.vk-btn`, `.vk-backspace`, `.vk-space` com variáveis CSS
3. [X] **`confirm-modal.js`** — Estender `show()` com opção `input`
   - `{ label, defaultValue, maxLength }` → renderiza input + VirtualKeyboard
   - Retorna `{ confirmed: boolean, value?: string }` quando tem input
   - Sem input → retorna `boolean` (compatibilidade)
4. [X] **`scene_grid.js`** — Refatorar `_openConfirmModal()`
   - LOAD → `ConfirmModal.show()` simples
   - SAVE → `ConfirmModal.show()` com `input`
5. [X] **`index.html`** — Limpar
   - Remover `#virtualKeyboard` (dentro do sceneConfirmModal)
   - Remover `#virtualKeyboardSearch` (substituir por uso do componente)
   - Remover scripts inline `vkType`, `vkBackspace`, `startVkBackspace`, `stopVkBackspace`
6. [X] **`style.css`** — `.vk-btn` usa variáveis CSS; `.confirm-modal-input` + label

#### Variáveis CSS do VirtualKeyboard (YAML)

```yaml
virtual_keyboard:
  key_bg: "#333"
  key_border: "1px solid #555"
  key_color: "#fff"
  key_height: "40px"
  key_radius: "6px"
  key_font_size: "16px"
  key_font_weight: "bold"
  backspace_bg: "#c62828"
  backspace_border: "1px solid #e53935"
  space_font_size: "14px"
  row_gap: "4px"
  keyboard_gap: "4px"
```

CSS variables: `--virtual-keyboard-*` (ex: `--virtual-keyboard-key-bg`)

### Processo de refatoração (para cada modal):
1. [ ] Localizar HTML do modal no `index.html` (ou criação dinâmica no JS)
2. [ ] Substituir lógica de abrir/fechar por `ConfirmModal.show()`
3. [ ] Remover HTML estático do `index.html` (se aplicável)
4. [ ] Remover classes CSS órfãs do `style.css` (se aplicável)
5. [ ] **PARADA — Aguardar teste do usuário**
6. [ ] Só prosseguir para o próximo modal após aprovação

---

## FASE 3 — Painel de Configuração de Temas, Ninja Sync & Backend Integrado
> ⚠️ **PARADA EXPLÍCITA** — Só iniciar após Fase 2 completa e aprovada.

### 3.1 Endpoints Backend (Rust)
- [X] Criar handler para listar temas na pasta `public/themes/` (`GET /api/themes`)
- [X] Criar handler para obter o conteúdo de um tema (`GET /api/themes/:name`)
- [X] Criar handler para salvar/criar um tema (`POST /api/themes/:name`)
- [X] Criar handler para excluir um tema (`DELETE /api/themes/:name`)
- [X] Criar handler para obter e persistir o tema ativo no `config.json` (`GET/POST /api/themes/active`)
- [X] Adicionar suporte a sincronização no servidor para integração com o **Ninja Sync** (armazenando na pasta `shared/` / nuvem)

### 3.2 Componente Customizado `ColorPicker` (iOS / Touch Friendly)
- [ ] Criar `public/modules/color-picker.js` (componente reutilizável de seleção de cor)
- [ ] Desenvolver paleta com swatches predefinidos + seletor visual de tonalidades/HEX
- [ ] Implementar exibição responsiva: Dropdown/Popover em Desktop e Modal Full-Screen em Mobile (`<= 600px`)
- [ ] Testar em navegadores WebKit/iOS (iPhone/iPad) para garantir 100% de compatibilidade sem usar o `<input type="color">` nativo

### 3.3 Painel de Gerenciamento de Temas (UI)
- [ ] Criar modal/seção "🎨 Temas & Aparência" no menu de configurações
- [ ] Exibir o tema ativo com selo visual
- [ ] Listar todos os temas disponíveis carregados dinamicamente via `GET /api/themes`
- [ ] Adicionar controle Toggle Switch `☁️ Sincronizar Temas na Nuvem (Ninja Sync)`
- [ ] Implementar botões de ação: `Novo Tema`, `Duplicar`, `Editar`, `Aplicar`, `Excluir`, `Restaurar Padrão`

### 3.4 Editor Visual Auto-Categorizado via YAML
- [ ] Criar parser no JS que lê as chaves principais do YAML (`global:`, `confirm_modal:`, `virtual_keyboard:`, etc.)
- [ ] Extrair os comentários `#` posicionados acima de cada chave de primeiro nível no YAML para utilizar como descrição da categoria
- [ ] Implementar fallback gracioso caso não haja comentário `#`: formatar a chave de `snake_case` para **Title Case** e omitir o subtítulo de descrição suavemente
- [ ] Renderizar automaticamente seções/cards (Accordions) por categoria com Título formatado + Descrição do comentário
- [ ] Integrar campos de cor ao componente `ColorPicker` customizado
- [ ] Implementar validação de sintaxe YAML via `js-yaml` antes de salvar
- [ ] Garantir arquitetura 100% data-driven: novos componentes adicionados no `default.yaml` aparecem automaticamente no editor sem alterar o JS

### 3.5 Proteção Inviolável do Tema Default (`default.yaml`)
- [ ] Frontend: Ocultar/desabilitar os botões "Editar" e "Excluir" quando o tema `default.yaml` estiver selecionado
- [ ] Frontend: Exibir o botão "Duplicar Tema" no lugar de editar para forçar a criação de uma cópia personalizável
- [ ] Frontend: Caso o `default.yaml` seja aberto no editor, forçar formulário em modo somente-leitura (Read-Only) com aviso de proteção
- [ ] Backend: Retornar HTTP 403 Forbidden caso haja qualquer tentativa de `POST` ou `DELETE` no endpoint `/api/themes/default`
- [ ] Garantir que a ação "Restaurar Padrão" sempre aplique o `default.yaml` original como rota de segurança

### 3.6 Persistência, Sincronização Ninja Sync e Reload
- [ ] Salvar a escolha do tema ativo e a preferência do Ninja Sync na API do backend
- [ ] Quando o Ninja Sync estiver ativo, espelhar a criação/edição/exclusão de temas no repositório compartilhado/nuvem
- [ ] Executar `window.location.reload()` imediatamente após aplicar um novo tema para recarregar toda a aplicação com estilo limpo
- [ ] Ao inicializar o app no boot, consultar a API para obter o tema ativo e carregar as variáveis CSS antes de renderizar a UI

---

## Arquivos envolvidos

| Arquivo | Ação |
|---------|------|
| `public/vendor/js-yaml.min.js` | **NOVO** — lib YAML |
| `public/vendor/fontawesome/` | **NOVO** — ícones |
| `public/style.css` | Adicionar classes `.confirm-modal-*` + `.vk-btn` variáveis |
| `public/modules/confirm-modal.js` | **NOVO** — componente |
| `public/modules/virtual-keyboard.js` | **NOVO** — componente de teclado |
| `public/themes/default.yaml` | **NOVO** — tema global |
| `public/index.html` | Adicionar script/link tags + remover modais/teclados refatorados |
| `public/modules/copy_paste.js` | Refatorar uso de `customConfirmModal` |
| `public/modules/channel_strip.js` | Refatorar uso de `masterOnConfirmModal` |
| `public/modules/inserts.js` | Refatorar uso de `insertConfirmModal` |

---

## Estrutura YAML do Tema Global

```yaml
# ════════════════════════════════════════════════════════════════
# TEMA GLOBAL — 01V96 Remote Web
# ════════════════════════════════════════════════════════════════
#
# Este arquivo define TODAS as variáveis CSS do projeto.
# Para criar um novo tema, copie este arquivo, renomeie e edite.
#
# Estrutura por componente:
#   - confirm_modal: Modal de confirmação reutilizável
#   - sidebar:       Sidebar de navegação (futuro)
#   - faders:        Área de faders (futuro)
#   - header:        Cabeçalho (futuro)
#   - eq:            Equalizador (futuro)
#   - dynamics:      Gate/Compressor (futuro)
#
# Adicione novos componentes conforme forem sendo refatorados.
# ════════════════════════════════════════════════════════════════


# ─── OVERLAY GLOBAL ────────────────────────────────────────────
# Usado por todos os modais do sistema
global:
  bg_overlay: "rgba(0, 0, 0, 0.85)"
  z_index_base: "9999"


# ─── CONFIRM MODAL ─────────────────────────────────────────────
# Modal de confirmação reutilizável (ConfirmModal)
# Uso: ConfirmModal.show({ title, message, type })
confirm_modal:
  # Fundo do card
  bg_content: "#1a1a1a"
  border_color: "#333"
  border_radius: "12px"
  padding: "24px"
  max_width: "380px"

  # Tipografia
  text_primary: "#fff"
  text_secondary: "#ccc"
  text_muted: "#888"

  # Botões - Cores
  btn_primary: "#28a745"      # verde - ação positiva (SIM, CONFIRMAR)
  btn_danger: "#dc3545"       # vermelho - ação destrutiva (DELETAR)
  btn_warning: "#ffc107"      # amarelo - atenção
  btn_info: "#1976d2"         # azul - informativo
  btn_secondary: "#2b2b2b"    # cinza escuro - cancelar/voltar

  # Botões - Dimensões
  btn_height: "44px"
  btn_radius: "8px"
  btn_gap: "10px"
  btn_font_weight: "800"
  btn_letter_spacing: "0.5px"

  # Ícones
  icon_danger_color: "#dc3545"
  icon_warning_color: "#ffc107"
  icon_info_color: "#1976d2"
  icon_success_color: "#28a745"
  icon_size: "24px"

  # Z-index (sempre alto pois é última etapa do fluxo)
  z_index: "15000"


# ─── FUTUROS COMPONENTES ──────────────────────────────────────
# Adicione novas seções conforme refatorar:
#
# sidebar:
#   ...
#
# faders:
#   ...
#
# prompt_modal:       # Modal de prompt (input)
#   ...
#
# alert_modal:        # Modal de alerta (só OK)
#   ...
```

---

## Exemplo de Uso

```js
// Carregar tema
const response = await fetch('themes/default.yaml');
const yamlText = await response.text();
ConfirmModal.loadTheme(yamlText);

// Usar o modal
const ok = await ConfirmModal.show({
  title: 'Deletar Cena?',
  message: 'Esta ação não pode ser desfeita.',
  icon: 'danger',
  confirmText: 'DELETAR',
  type: 'danger'
});
if (ok) deletarCena();
```
