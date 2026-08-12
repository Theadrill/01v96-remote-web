# Plano de Implementação Incremental: Componente Bubble Modal de Aviso de Pan (Desktop)

## Visão Geral e Estratégia de Execução Incremental

Para acomodar a janela de contexto reduzida (~16k tokens) do modelo local **Qwen 3.5 4B** rodando via Ollama no **OpenCode**, a execução **NÃO será enviada em lote**. 

Utilizaremos uma **estratégia estritamente atômica e passo a passo (Step-by-Step Interactive Loop)**:
1. **Instrução Cirúrgica**: Enviar ao OpenCode um prompt focado em **um único arquivo/função por vez**.
2. **Aguardar Execução Background**: Aguardar a conclusão do comando `opencode run`.
3. **Validação & Diff (Code Review)**: Inspecionar o `git diff` e rodar validações sintáticas (`node --check` / `cargo check`).
4. **Apresentação ao Usuário**: Mostrar as alterações realizadas ao usuário.
5. **Correção ou Avanço**:
   - Se houver falha/erro: instruir o OpenCode a corrigir o arquivo atual antes de avançar.
   - Se estiver correto: passar para a próxima etapa incremental reutilizando o contexto com `opencode run -c`.

---

## 1. Contexto & Regras do Negócio (Bubble Modal no Desktop)

- **Problema de UX**: No modo **DESKTOP**, para alterar o Pan de um canal o usuário precisa **tocar/clicar, segurar por 350ms e arrastar**. Operadores iniciantes tentam dar apenas um clique/arrasto rápido e não entendem por que o Pan não mexe.
- **Solução**: Quando for detectado um toque/clique simples no Pan (< 350ms, sem disparo de drag), exibir uma **Bubble (balão de dica contextual)** apontando para o Pan clicado com a mensagem: `"💡 Clique e segure para ajustar o Pan"`.
- **Tema YAML**: As propriedades visuais da Bubble serão configuradas no `public/themes/default.yaml` sob a chave `bubble_modal`.

---

## 2. Fases de Execução Atômica (Passo a Passo)

### Etapa 1: Atualização do Tema Base (`default.yaml`)
- **Alvo**: `public/themes/default.yaml`
- **Ação**: Adicionar as variáveis CSS e a estrutura da chave `bubble_modal` no tema base.
- **Validação Antigravity**: Verificar parsing do arquivo e integridade das chaves YAML.

---

### Etapa 2: Criação do Módulo Visual `BubbleModal` (`bubble-modal.js`)
- **Alvo**: `public/modules/bubble-modal.js` [NEW FILE]
- **Ação**: Criar o componente `BubbleModal` (padrão IIFE similar ao `ConfirmModal`), com métodos `.show({ targetEl, message, duration })` e `.hide()`, calculando a posição física do elemento com `getBoundingClientRect()`.
- **Validação Antigravity**: Executar `node --check public/modules/bubble-modal.js`.

---

### Etapa 3: Registro do Script no HTML Principal (`index.html`)
- **Alvo**: `index.html` (ou entry point do frontend)
- **Ação**: Incluir a tag `<script src="modules/bubble-modal.js"></script>` na ordem de carregamento correta (antes de `events.js`).
- **Validação Antigravity**: Verificar se a tag de script foi inserida corretamente.

---

### Etapa 4: Integração dos Eventos de Pan (`events.js`)
- **Alvo**: `public/modules/events.js`
- **Ação**: Modificar a lógica em `startPanLongPress` e `stopPanLongPress`:
  - Registrar o timestamp de início da pressão no Pan.
  - No `stopPanLongPress`, se a duração for curta (< 300ms) e `!isPanDragging` no modo `desktop`, acionar `BubbleModal.show({ targetEl: activePanTrack, message: '💡 Clique e segure para ajustar o Pan' })`.
- **Validação Antigravity**: Executar `node --check public/modules/events.js`.

---

### Etapa 5: Validação Final e Suíte de Checagens
- **Ação**: Executar `cargo check`, inspecionar o `git diff` completo e validar a experiência do usuário.

---

## 3. Workflow de Delegação (Comandos CLI em Background)

### A. Para a Etapa 1 (Primeira chamada):
```powershell
echo "REGRAS RÍGIDAS DE EXECUÇÃO:
- NÃO rode `cargo build --release` ou `cargo build`. Se precisar verificar o código Rust, use APENAS `cargo check`.
- Valide os arquivos JavaScript usando `node --check`.
- NÃO faça commit do git (`git commit` é proibido).

TAREFA ATÔMICA 1: Modifique o arquivo public/themes/default.yaml adicionando a nova seção bubble_modal..." | opencode run --auto --format json
```

### B. Para as Etapas Sequenciais (Etapas 2, 3 e 4):
```powershell
echo "REGRAS RÍGIDAS DE EXECUÇÃO:
...
TAREFA ATÔMICA N: [Instrução cirúrgica da próxima etapa]" | opencode run -c --auto --format json
```

---

## Plano de Verificação

### Validação por Etapa
1. **Após Etapa 1**: Antigravity checa `git diff public/themes/default.yaml`.
2. **Após Etapa 2**: Antigravity roda `node --check public/modules/bubble-modal.js`.
3. **Após Etapa 3**: Antigravity verifica script importado no `index.html`.
4. **Após Etapa 4**: Antigravity roda `node --check public/modules/events.js` e exibe a alteração acumulada ao usuário.
