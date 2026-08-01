# Instruções de Delegação de Tarefas de Código (Antigravity ➔ OpenCode)

Este documento especifica o procedimento automatizado para delegação sob demanda de tarefas de desenvolvimento do **Antigravity (Orquestrador/Arquiteto)** para o **OpenCode (Coder/Executor)** em segundo plano.

---

## 1. Fluxo de Execução Sob Demanda

Quando o usuário solicitar o uso deste procedimento (ex: *"use as instruções de delegação para implementar X"*):

1. **Antigravity (Orquestrador & Arquiteto)**:
   * Analisa a arquitetura do projeto, arquivos envolvidos e regras de negócio.
   * Cria o plano/prompt técnico cirúrgico e com zero ambiguidades.
   * Dispara a execução não-interativa do OpenCode em segundo plano no terminal (`run_command`).

2. **OpenCode (Coder & Executor)**:
   * Processa a instrução em background usando o modo *Headless* (`--format json --auto`).
   * Executa a edição/criação dos arquivos no disco.
   * Preserva a memória e o contexto entre chamadas sequenciais usando a flag `-c` (`--continue`).

3. **Validação & Finalização (Antigravity)**:
   * Assim que a tarefa em background conclui, inspeciona o `git diff` para Code Review.
   * Executa testes e validações de compilação/sintaxe (`cargo check`, `node --check`).
   * Reporta o resultado ao usuário e/ou realiza o `git push`.

---

## 2. Comandos CLI de Execução

### A) Início de uma Nova Tarefa (Primeira Chamada):
```powershell
echo "Instrução técnica detalhada..." | opencode run --auto --format json
```

### B) Chamadas Sequenciais (Reutilizando a Mesma Sessão/Contexto):
```powershell
echo "Próxima instrução..." | opencode run -c --auto --format json
```

---

## 3. Regras de Qualidade e Segurança
* **Reutilização de Contexto (`-c`)**: Sempre utilizar a flag `-c` para evitar que o OpenCode precise re-analisar a estrutura do projeto do zero a cada comando.
* **Validação Obrigatória**: Todo código gerado pelo OpenCode deve ser revisado via `git diff` e validado via compilação antes de ser considerado pronto.
