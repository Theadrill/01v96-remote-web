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
  - [ ] **FASE 1** — Criação do Componente (INDEPENDENTE)
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
- [ ] Baixar `js-yaml.min.js` → `public/vendor/js-yaml.min.js`
- [ ] Baixar FontAwesome Solid (all.min.css + webfonts/) → `public/vendor/fontawesome/`
- [ ] Adicionar script tags no `index.html`

### 1.2 Criar estrutura de temas
- [ ] Criar pasta `public/themes/`
- [ ] Criar arquivo `public/themes/default.yaml` com variáveis globais
- [ ] Variáveis organizadas por componente (confirm_modal, sidebar, faders, etc.)
- [ ] Seção `confirm_modal:` com todas as variáveis `--confirm-modal-*`
- [ ] Z-index dentro do componente confirm_modal

### 1.3 Criar classes CSS do componente
- [ ] `.confirm-modal-overlay` — overlay de fundo
- [ ] `.confirm-modal-content` — card do modal
- [ ] `.confirm-modal-content--danger` — variante com borda vermelha
- [ ] `.confirm-modal-content--warning` — variante com borda amarela
- [ ] `.confirm-modal-content--info` — variante com borda azul
- [ ] `.confirm-modal-header` — título
- [ ] `.confirm-modal-body` — mensagem/conteúdo
- [ ] `.confirm-modal-footer` — container dos botões
- [ ] `.confirm-modal-btn` — botão base
- [ ] `.confirm-modal-btn--primary` — verde (ação positiva)
- [ ] `.confirm-modal-btn--danger` — vermelho (ação destrutiva)
- [ ] `.confirm-modal-btn--warning` — amarelo (atenção)
- [ ] `.confirm-modal-btn--info` — azul (informativo)
- [ ] `.confirm-modal-btn--secondary` — cinza (cancelar)
- [ ] `.confirm-modal-icon` — ícone (suporta FA ou emoji)

### 1.4 Criar módulo JS (`confirm-modal.js`)
- [ ] Classe `ConfirmModal` com método estático `show(options)`
- [ ] Options: `{ title, message, confirmText, cancelText, type, icon, onConfirm, onCancel }`
- [ ] Retorna `Promise<boolean>` (true = confirmou, false = cancelou)
- [ ] Função `loadTheme(yamlContent)` que parseia YAML e aplica variáveis CSS
- [ ] Gerencia estado: fecha modal anterior antes de abrir novo
- [ ] Cria DOM dinamicamente (sem HTML estático no index.html)
- [ ] Suporte a fechar com ESC e clique no overlay

### 1.5 Incluir no index.html
- [ ] Adicionar `<script src="vendor/js-yaml.min.js">`
- [ ] Adicionar `<link href="vendor/fontawesome/all.min.css" rel="stylesheet">`
- [ ] Adicionar `<script src="modules/confirm-modal.js">`

### 1.6 Testes manuais
- [ ] Testar todos os tipos: primary, danger, warning, info
- [ ] Testar fechamento com ESC
- [ ] Testar fechamento com clique no overlay
- [ ] Testar Promise resolve/reject
- [ ] Testar que modal anterior fecha ao abrir novo
- [ ] Testar carregamento do tema YAML
- [ ] Testar aplicação das variáveis CSS
- [ ] Testar ícones FA e emojis

### 1.7 Rodar verificação de qualidade
- [ ] Rodar linter (se existir)
- [ ] Verificar erros no console do browser
- [ ] Corrigir qualquer problema encontrado

---

## FASE 2 — Refatoração dos Modais Existentes
> ⚠️ **PARADA EXPLÍCITA** — Só iniciar após Fase 1 completa e aprovada.

### Modais a refatorar (por prioridade):

| # | Modal ID | Arquivo | Tipo | Complexidade | Status |
|---|----------|---------|------|--------------|--------|
| 1 | `customConfirmModal` | copy_paste.js | Sim/Não | Baixa | [ ] |
| 2 | `restoreConfirmModal` | index.html | Sim/Não perigo | Baixa | [ ] |
| 3 | `logoutConfirmModal` | index.html | Sim/Não | Baixa | [ ] |
| 4 | `masterOnConfirmModal` | channel_strip.js | Sim/Não perigo | Média | [ ] |
| 5 | `macroDeleteConfirmModal` | index.html | Sim/Não perigo | Baixa | [ ] |
| 6 | `sceneDeleteModal` | index.html | Sim/Não perigo | Baixa | [ ] |
| 7 | `sceneConfirmModal` | index.html | Sim/Não + input | Alta | [ ] |
| 8 | `macroSyncConfirmModal` | index.html | Sim/Não | Baixa | [ ] |
| 9 | `macroSyncDisableModal` | index.html | 3 opções | Média | [ ] |
| 10 | `copyOptionsModal` | index.html | 3 opções | Média | [ ] |
| 11 | `insertConfirmModal` | inserts.js | Sim/Não perigo | Baixa | [ ] |

### Processo de refatoração (para cada modal):
1. [ ] Localizar HTML do modal no `index.html` (ou criação dinâmica no JS)
2. [ ] Substituir lógica de abrir/fechar por `ConfirmModal.show()`
3. [ ] Remover HTML estático do `index.html` (se aplicável)
4. [ ] Remover classes CSS órfãs do `style.css` (se aplicável)
5. [ ] Testar funcionalidade
6. [ ] Rodar linter/verificação de qualidade

---

## FASE 3 — Painel de Configuração de Temas
> ⚠️ **PARADA EXPLÍCITA** — Só iniciar após Fase 2 completa e aprovada.

### 3.1 Criar interface de temas
- [ ] Adicionar seção "Temas" nas configurações
- [ ] Listar temas disponíveis (pasta `public/themes/`)
- [ ] Botão "Criar Novo Tema" (copia default.yaml)
- [ ] Botão "Editar Tema" (abre editor)
- [ ] Botão "Aplicar Tema" (carrega e aplica)
- [ ] Botão "Excluir Tema" (remove, exceto default)

### 3.2 Editor de temas
- [ ] Editor YAML simples com syntax highlighting
- [ ] Preview das cores em tempo real
- [ ] Validação de sintaxe YAML
- [ ] Botão "Salvar" e "Cancelar"

### 3.3 Gerenciamento de temas
- [ ] Salvar tema editado (persiste no backend/config.json)
- [ ] Carregar tema selecionado ao iniciar
- [ ] Restaurar tema default

---

## Arquivos envolvidos

| Arquivo | Ação |
|---------|------|
| `public/vendor/js-yaml.min.js` | **NOVO** — lib YAML |
| `public/vendor/fontawesome/` | **NOVO** — ícones |
| `public/style.css` | Adicionar classes `.confirm-modal-*` |
| `public/modules/confirm-modal.js` | **NOVO** — componente |
| `public/themes/default.yaml` | **NOVO** — tema global |
| `public/index.html` | Adicionar script/link tags + remover modais refatorados |
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

  # Z-index
  z_index: "9999"


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
