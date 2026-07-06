# Plano de Implementação: Página de Status do Servidor

## 1. Modificar `server_rust/src/main.rs`
- Adicionar uma variável estática `lazy_static` (usando a dependência existente `lazy_static`) para manter um `Option<tokio::sync::mpsc::Sender<()>>` para o sinal de desligamento.
- Após criar o canal de desligamento (`let (shutdown_tx, shutdown_rx)`), armazenar um clone de `shutdown_tx` na variável estática (por exemplo, `*SHUTDOWN_TX.lock().unwrap() = Some(shutdown_tx.clone())`).
- Passar o original `shutdown_tx` para `async_main` como antes (inalterado).
- Nenhuma outra alteração necessária em `main.rs`.

## 2. Criar `server_rust/src/api/status.rs`
- Definir um handler `get_log` que lê o arquivo de log:
  - Caminho: `<project_root>/log/server_rust_log.txt` (use `crate::config::get_project_root()` para obter a raiz).
  - Retornar o conteúdo do arquivo como texto puro (`text/plain`).
- Definir um handler `post_restart`:
  - Adquirir o remetente de desligamento da variável `lazy_static`, cloná-lo e enviar um sinal `()` (se presente).
  - Retornar uma resposta JSON de sucesso.
- Ambos os handlers devem ser `async` e retornar respostas apropriadas do Axum (`Json`, `String` em `Response`).

## 3. Atualizar `server_rust/src/api/mod.rs`
- Adicionar `pub mod status;`.
- Na função `router`, aninhar uma nova rota sob `/api`:
  ```rust
  .route("/log", axum::routing::get(status::get_log))
  .route("/restart", axum::routing::post(status::post_restart))
  ```
- Garantir que o roteador ainda tenha acesso ao estado necessário (estado global, gerenciador de cenas personalizadas, etc.) - os novos handlers não exigem estado adicional além do remetente de desligamento (que é acessado via lazy static).

## 4. Criar `public/status.html`
- Estrutura básica de HTML vinculando ao existing `public/style.css` para consistência visual.
- Incluir uma `<div id="log-view" style="white-space: pre-wrap; overflow:auto; height:80vh; border:1px solid #444; background:#222; color:#fff; padding:10px;">` para exibir o log.
- Adicionar um botão abaixo da div: `<button id="restart-btn" class="btn-outs">Reiniciar Servidor</button>` (reutilizar o estilo de botão existente de `style.css`).
- JavaScript:
  - Ao carregar a página, iniciar um intervalo (por exemplo, a cada 2 segundos) que busca `/api/log` via `fetch`, atualiza o `textContent` da div com a resposta e rola a div para o fundo (`div.scrollTop = div.scrollHeight`).
  - Anexar um ouvinte de clique ao botão que envia um `POST` para `/api/restart` (usando `fetch` com método `'POST'`). Opcionalmente desativar o botão e mostrar um estado de carregamento, depois reativar após a resposta.
- Garantir que a página use a mesma fonte e cores do restante da UI (herdado de `style.css`).

## 5. Verificar e testar
- Construir o servidor Rust (`cargo build --release`).
- Executar o servidor via `run_hidden.vbs` (ou diretamente para teste).
- Abrir `http://localhost:<port>/status.html` (ou `http://localhost:<port>/status` se preferir uma rota mais limpa; ajustar conforme necessário).
- Verificar que a visualização do log seja atualizada e role para as linhas mais recentes.
- Clicar no botão de reinicialização e verificar se o servidor reinicia (a janela de console ocultada deve desaparecer e uma nova iniciar, conforme o script VBS).

## 6. Opcional: Adicionar alias de rota
- Se desejar uma URL mais limpa como `/status` em vez de `/status.html`, adicionar um fallback no roteador:
  ```rust
  .fallback_service(tower_http::services::ServeDir::new(public_dir))
  ```
  já serve `public/status.html` em `/status.html`. Para servir em `/status`, adicione:
  ```rust
  .route("/status", axum::routing::get(|| async { 
      axum::response::Redirect::to("/status.html") 
  }))
  ```
  ou servir o HTML diretamente via um handler que lê o arquivo.