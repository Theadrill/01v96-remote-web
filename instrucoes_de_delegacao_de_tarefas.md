# Instruções de Delegação de Tarefas de Código (Antigravity ➔ OpenCode / Orca)

Este documento especifica o procedimento padronizado para delegação sob demanda de tarefas de desenvolvimento do **Antigravity (Orquestrador/Arquiteto)** para execução de código.

---

## 🧠 Papel do Orquestrador (Economia Crítica de Tokens)

O objetivo central de delegar para o **OpenCode** via Orca ou CLI é economizar os tokens de contexto e de saída do Antigravity:

1. **Delegação Enxuta**: O Antigravity **NÃO DEVE** ler arquivos de código inteiros nem fazer varreduras exploratórias no codebase antes de despachar. Toda a investigação aprofundada e o "trabalho duro" de codificação pertencem ao **OpenCode**.
2. **Leitura Restrita ao Plano**: O Antigravity deve ler unicamente o plano/especificação da etapa a ser executada e montar uma especificação técnica objetiva no prompt da tarefa.
3. **Foco em Coordenação e Revisão**: A atuação do Antigravity resume-se a:
   - Despachar a tarefa com regras claras e contexto essencial.
   - Aguardar a conclusão via `worker_done`.
   - Validar sintaxe/compilação (`node --check`, `cargo check`) e inspecionar superficialmente o diff (`git status`, `git diff`).
   - Apresentar o resumo ao usuário e solicitar o próximo passo.
   - *Tratamento de Falhas:* Se o resultado da validação falhar ou divergir do esperado, aí sim o Antigravity assume o papel analítico para investigar o problema pontual, diagnosticar a causa raiz e repassar ao OpenCode a solução/orientação de ajuste precisa.
4. **Compaction Obrigatória Entre Etapas**: Sempre que uma etapa, passo ou fase termina e formos iniciar outra no OpenCode, o orquestrador **DEVE** enviar o comando `/compact` para o terminal do OpenCode (e aguardar ficar ocioso via `tui-idle`) antes de despachar a nova tarefa, evitando acúmulo desnecessário de tokens de contexto na sessão do coder.

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
2. **Verificar ou Iniciar Terminal do OpenCode & Aplicar `/compact`**:
   * Se já houver terminal ativo do OpenCode ocioso, reutilize seu `<handle>` e envie `/compact` para limpar o contexto acumulado:
     ```powershell
     orca terminal send --terminal <handle> --text "/compact" --enter --json
     orca terminal wait --terminal <handle> --for tui-idle --timeout-ms 20000 --json
     ```
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
