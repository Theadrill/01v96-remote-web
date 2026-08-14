# Instruções de Delegação de Tarefas de Código (Antigravity ➔ OpenCode / Orca)

Este documento especifica o procedimento padronizado para delegação sob demanda de tarefas de desenvolvimento do **Antigravity (Orquestrador/Arquiteto)** para execução de código.

---

## 📌 Passo 1: Seleção da Estratégia de Execução

Sempre que o usuário solicitar a delegação de uma tarefa (ex: *"use as instruções de delegação para implementar X"*), o **Antigravity** deve verificar se o usuário já especificou a via de execução. Caso não tenha especificado, deve **perguntar ao usuário** qual estratégia prefere utilizar:

1. **Opção A: Orca Orchestration (`orca-cli`)**
   * *Quando usar:* Quando desejar visibilidade nos terminais do Orca ADE, acompanhamento interativo de TUI, rastreamento formal de tarefas e eventos de ciclo de vida (`worker_done`, `heartbeat`).
2. **Opção B: OpenCode Direto (Headless CLI)**
   * *Quando usar:* Para execuções rápidas e diretas em segundo plano no próprio shell/terminal, sem necessidade de interface visual ou overhead de coordenação.

*(Nota: Se o usuário já declarar explicitamente no prompt inicial como deseja executar, esta pergunta é pulada e o fluxo segue diretamente para o Passo 2).*

---

## 📌 Passo 2: Execução Técnica e Validação

### Modalidade A: Via Orca Orchestration (`orca-cli`)

1. **Garantir/Vincular Run**:
   ```powershell
   orca orchestration run-create --objective "Descrição objetiva da tarefa" --json
   ```
2. **Verificar ou Iniciar Terminal do OpenCode**:
   * Se já houver terminal ativo do OpenCode ocioso, reutilize seu `<handle>`.
   * Caso contrário, crie um novo terminal e aguarde ficar pronto:
     ```powershell
     orca terminal create --worktree active --title "opencode-worker" --command "opencode" --json
     orca terminal wait --terminal <handle> --for tui-idle --timeout-ms 30000 --json
     ```
3. **Criar a Tarefa**:
   ```powershell
   orca orchestration task-create --spec "Instruções técnicas detalhadas com regras rígidas..." --json
   ```
4. **Despachar a Tarefa (com injeção de preâmbulo de orquestração)**:
   ```powershell
   orca orchestration dispatch --task <task_id> --to <handle> --inject --json
   ```
5. **Monitorar e Confirmar Conclusão**:
   ```powershell
   orca orchestration check --wait --types worker_done --timeout-ms 900000 --json
   orca orchestration check --ack <delivery_id> --json
   ```

---

### Modalidade B: Via OpenCode Direto (Headless CLI)

> **Pergunta Obrigatória (se não especificado previamente):**
> Antes de executar no modo OpenCode Direto, o Antigravity deve perguntar ao usuário:
> *"Deseja executar mantendo o **CONTEXTO** da sessão anterior (`-c`) ou em uma sessão **SEM CONTEXTO** (limpa)?"*

1. **Execução COM CONTEXTO (Mantém histórico da sessão / flag `-c`)**:
   * *Primeira chamada:*
     ```powershell
     echo "REGRAS RÍGIDAS DE EXECUÇÃO... [Instrução técnica detalhada]" | opencode run --auto --format json
     ```
   * *Chamadas sequenciais acumulando contexto:*
     ```powershell
     echo "Próxima instrução..." | opencode run -c --auto --format json
     ```
2. **Execução SEM CONTEXTO (Sessão limpa e isolada / sem flag `-c`)**:
   * *Ideal para modelos locais (Ollama/LM Studio) ou tarefas independentes para evitar estouro de tokens:*
     ```powershell
     echo "REGRAS RÍGIDAS DE EXECUÇÃO... [Instrução técnica detalhada]" | opencode run --auto --format json
     ```

---

## 📌 Passo 3: Validação & Code Review Obrigatório

Independentemente da modalidade escolhida:
1. **Revisão de Código**: Inspecionar as alterações com `git diff` / `git status`.
2. **Checagem de Sintaxe/Compilação**:
   * Rust: executar `cargo check` (NUNCA `cargo build --release`).
   * JavaScript / Node: validar com `node --check <arquivo.js>`.
3. **Apresentação**: Reportar claramente ao usuário o que foi alterado e o resultado dos testes.

---

## ⚠️ Regras Rígidas de Execução (Obrigatório Incluir nos Prompts)

Sempre que uma instrução for enviada ao **OpenCode** (seja via Orca ou Headless CLI), o prompt DEVE conter no cabeçalho a seguinte seção explícita:

```text
REGRAS RÍGIDAS DE EXECUÇÃO:
- NÃO rode `cargo build --release` ou `cargo build`. Se precisar verificar o código Rust, use APENAS `cargo check`.
- Valide os arquivos JavaScript usando `node --check`.
- NÃO faça commit nem push do git (`git commit` e `git push` são proibidos para o coder).
```
