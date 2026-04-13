# 🗺️ Plano de Implementação: GitHub Sync Wizard

Este documento detalha a estratégia para automatizar a sincronização de macros para usuários externos, permitindo que qualquer pessoa utilize o **Ninja Sync** em seu próprio Fork do projeto.

## 1. Escopo de Funcionalidades
- **Auto-Check na Inicialização**: O servidor verifica se o Git está configurado e se o repositório remoto aceita pushes.
- **Detecção de Permissão**: Se o `git push` falhar por falta de permissão, a UI avisa o usuário.
- **Assistente de Setup (Modal)**: Um fluxo guiado para quem ainda não tem a nuvem configurada.

## 2. Fluxo do Usuário (Wizard)
1.  **Verificação**: O app detecta que o Auto-Sync está falhando.
2.  **Passo 1 (Fork)**: Botão que abre `https://github.com/Theadrill/01v96-remote-web/fork`.
3.  **Passo 2 (Auth)**: Instruções para gerar um *Personal Access Token (PAT)* com link direto para as permissões `repo`.
4.  **Passo 3 (Config)**: Usuário cola seu Token e o nome de usuário do GitHub.
5.  **Passo 4 (Vínculo)**: O servidor executa os comandos para trocar a URL do repositório remoto e testar a conexão.

## 3. Comandos Técnicos (Backend)
O servidor deverá ser capaz de executar:
```bash
# Alterar o remote para usar o token (Autenticação silenciosa)
git remote set-url origin https://<TOKEN>@github.com/<USUARIO>/01v96-remote-web.git

# Testar se a conexão está OK
git push origin main --dry-run
```

## 4. Onde Implementar (Reminders inseridos no código)
- `server.js`: Novo endpoint `GET /api/sync/check` e `POST /api/sync/setup`.
- `public/modules/macros.js`: Listener para o status do check e ativação do modal de aviso.

---
> [!IMPORTANT]
> **ESTADO ATUAL:** Pendente de implementação conforme solicitação do usuário para evitar riscos antes de evento ao vivo.
