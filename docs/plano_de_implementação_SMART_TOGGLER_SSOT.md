# Plano de implementação — Smart Toggler com SSOT no servidor (via Macro API)

> ⛔ REGRA MAIS IMPORTANTE DESTE PROJETO: NÃO FAZER COMMITS SEM O USUÁRIO PEDIR. E quando o usuário
> pedir um commit, fazer aquele commit e AGUARDAR ele pedir novamente para commitar de novo. Nunca
> commitar em sequência por conta própria, nunca emendar push automático, nunca antecipar o próximo commit.

> Nota de paths e arquitetura (auditoria externa):
> - `macros.js` do core client é `public/modules/macros.js` (+ espelho `public_new/modules/macros/macros.js`).
> - `core.js` é `public/modules/macros/core.js` (+ espelho `public_new/modules/macros/core.js` — 201 linhas cada).
> - Macro é `public/modules/macros/smart_channel_toggler/main.js` (+ espelho `public_new/modules/macros/smart_channel_toggler/main.js` — 465 linhas cada, idênticas).
> - `save_json_atomic` vive em `server_rust/src/custom_scenes.rs:939-955` como `pub fn`.
> - `public_new` é a distribuição frontend do app desktop Tauri (`src-tauri/tauri.conf.json:7` aponta para `../public_new`) e servida em `/new` no Axum (`main.rs:237`). O código das macros em `public/` e `public_new/` deve ser estritamente sincronizado.
> - `public/modules/macros/profiles` é o **único diretório de perfis** persistido pelo servidor (`macros.rs:670,702`).

## O problema

A macro Smart Toggler desliga um conjunto de canais preservando alguns canais guardiões, guarda
quais canais foram desligados e, depois, religa exatamente esses canais. O problema que enfrentamos
é que somente o client que disparou a macro sabe quais canais foram desligados: qualquer outro client
que se conecte ao servidor enxerga o estado como se nada tivesse acontecido, e um recarregamento com
limpeza do armazenamento local faz até o próprio client que disparou perder a referência do que foi feito.

As causas estão na forma como o estado circula hoje. O conhecimento do corte vive no client que executou,
e os demais clients não tomam ciência automaticamente do que mudou. A leitura inicial do estado pode
interpretar ausência ou divergência de informações como "nada mutado" e, com isso, sobrescrever uma memória
ainda válida. O roteamento até o conjunto certo de dados pode levar o client a ler um conjunto errado,
indistinguível de um estado zerado. E a validade temporal do corte, que deveria expirar após 12 horas,
é avaliada de forma inconsistente entre clients diferentes devido ao desvio de relógio local.

## Objetivo

Que os canais desligados persistam no servidor como única fonte da verdade (SSOT), e que qualquer client que se
conecte ao servidor enxergue o mesmo estado verdadeiro: se houver um corte ativo, ele mostra quais canais
foram mutados; se não houver, mostra que está em repouso. Após 12 horas, o estado deixa de ser válido e
passa a ser tratado como resetado. Tudo isso sem depender de `localStorage` para a descoberta do corte.

## Regras do sistema de macros (isolamento total — modelo World of Warcraft)

O sistema de macros é completamente isolado do resto da aplicação, nos moldes do sistema de macros
do World of Warcraft: a macro vive dentro de uma "caixa de areia" e não sabe que existe um servidor,
um banco de dados, um protocolo de rede ou qualquer outro subsistema. Por questões de segurança, ela
nunca fala diretamente com o servidor — não abre conexão, não monta requisição, não conhece endereço,
rota ou formato de transporte. Tudo o que a macro precisa passa exclusivamente pela API de macros
(`window.MixerAPI`): ler estado (`state`), atuar na mesa (`mixer`), mostrar coisas na tela (`ui`),
guardar/carregar dados (`storage`) e utilidades (`utils`). Se algo não existe na API de macros, a macro
simplesmente não tem acesso a isso — e qualquer capacidade nova que uma macro precise deve nascer como
uma capacidade genérica da API, disponível para todas as macros, nunca como um atalho específico de uma
macro para dentro do servidor.

## Regra de escopo: não mexer na lógica da macro em si

NÃO modificar nada da lógica da macro Smart Toggler em si — o corte, a restauração, os guardiões,
as confirmações e o comportamento do pad continuam exatamente como estão. O único objeto deste plano
é a forma como o estado MUTED ou não-MUTED é lido: de onde ele vem, quando ele é considerado válido
e como todos os clients enxergam o mesmo valor. Nada além da leitura do estado entra no escopo.

> Restrição arquitetural: macros são inconscientes do resto do app. A macro só fala com `window.MixerAPI`
> (`storage`, `state`, `mixer`, `ui`, `utils`). Nenhum `fetch`/`socket`/`localStorage`/`window.*` direto na macro.
> Server só recebe adição agnóstica que sirva a qualquer macro. Nada específico do toggler no Rust.
> Não introduzir regras de união (`A ∪ B`) ou modais de conflito na máquina de corte da macro.

## Diagnóstico (resumo do que foi auditado)

1. Snapshot JÁ persiste via `POST /api/macros/config/smart_channel_toggler?preset=X&syncShared=true`
   em `public/modules/macros/profiles/{local,shared}/smart_channel_toggler_{preset}.json` — o problema nunca
   foi "não salva" (`server_rust/src/api/macros.rs:690-736`, `smart_channel_toggler/main.js:170,203`).
2. `save_mod_config` não emite nenhum evento socket — visual `MUTED` é DOM-local, outro client só descobre
   com reload (`macros.rs:690-736`, `smart_channel_toggler/main.js:48-64`, `public/modules/macros.js:671-738`).
3. `onInit` faz escrita corretiva destrutiva: se valida como inválido, dá `POST` de reset e apaga corte válido
   de outro client (`smart_channel_toggler/main.js:91-98`). BLOQUEADOR — corrigir na Fase 2 item 4.
4. Roteamento de preset frágil: `macro_last_preset`/`macro_sync_shared_*` (`public/modules/macros.js:59,502,524`)
   têm precedência sem validação de sanidade; `detectCurrentPreset` (`public/modules/macros.js:46-79`) pode cair
   noutro preset → macro lê outro arquivo `smart_channel_toggler_{outroPreset}.json` → "resetado".
   `local`/`shared` são pastas **do servidor** (globais a todos browsers), não "deste PC".
5. `get_mod_config` ignora `syncShared` e lê `local` antes de `shared` (`macros.rs:663-688`), enquanto
   `get_slots` respeita a flag (`macros.rs:297-313`). Pior: `save_mod_config:707-717` escreve `local` SEMPRE e
   `shared` só se `syncShared=true` — leitura `local-first` cega gera o "caso sombra" em máquinas secundárias
   que sincronizaram `shared` via Git mas mantêm um `local` antigo. Corrigir com resolução inteligente por
   data de modificação (`mtime`) ou precedência `shared` no backend, sem depender de `localStorage` do browser.
6. TTL só no client com `Date.now()` (`smart_channel_toggler/main.js:7,26-45`) — dois dispositivos nunca
   possuem relógios 100% idênticos, gerando falsas expirações imediatas. Resolver calibrando o offset de relógio
   via header HTTP `Date` na `MixerAPI` de forma agnóstica.
7. Concorrência: `isExecuting` é por aba (`main.js:8`); `POST` é last-writer-wins no arquivo. Sem CAS no servidor,
   concorrência de ms é best-effort documentada. A ordem POST-antes-de-mutar está correta.
8. `guard` de desk furado: `smart_channel_toggler/main.js:40` testa `window.serverName !== null` mas ausente
   pré-handshake é `undefined` (`undefined !== null === true`) → invalidação prematura. Gate e valor devem vir
   exclusivamente de `MixerAPI.state.getDeskName()`.
9. `onSave`/`resetBtn`/`onClear` clobberam snapshot: postam closure local antiga sem re-GET
   (`smart_channel_toggler/main.js:418-431`, `:291-302`, `:434-443`). Re-GET fresco antes de salvar guardiões.
10. Duplicação `public/` × `public_new/`: servidor só lê/escreve `public/.../profiles` (`macros.rs:670,702`).
    Espelhos em `public_new/.../profiles` são peso-morto e devem ser removidos. O código JS das macros em
    `public_new/modules/macros/` deve ser mantido sincronizado porque é usado pelo Tauri (`frontendDist`).
11. Bônus achados: `public/modules/macros.js:822` (e espelho) chama `loadSlotsManifest()` inexistente
    (é `loadGlobalSlotsManifest:500` — `ReferenceError` a cada `completeMacroMove`);
    fallback `get_hosts` retorna `{match}` mas client lê `h.matches` (`macros.rs:268-271` vs `macros.js:54,400`);
    `onDelete:446-452` grava literal `"null"` (`JSON.stringify(null)`);
    `save_mod_config` usa `fs::write` não-atômico (`macros.rs:711,717`).

---

## Fase 0 — Adição agnóstica no servidor: broadcast genérico e escrita atômica

Emitir em TODO `save_mod_config`, para qualquer `mod_id`, sem conhecer toggler/preset específico.
O `io` já está disponível no router (`server_rust/src/api/macros.rs:182` via `.layer(Extension(io))`).
O transporte socket.io é habilitado em `main.rs:244` (`.layer(layer)`).

### 1. Snippet do broadcast genérico em `server_rust/src/api/macros.rs`

```rust
// server_rust/src/api/macros.rs
async fn save_mod_config(
    Path(mod_id): Path<String>,
    Query(q): Query<PresetQuery>,
    Extension(io): Extension<socketioxide::SocketIo>, // Extractor injetado pelo router (linha 182)
    Json(body): Json<Value>,                          // Json SEMPRE por último no Axum 0.8
) -> Json<Value> {
    let preset = q.preset.unwrap_or_else(|| "default".to_string());
    let sync_shared = q.sync_shared.as_deref() == Some("true");
    let filename = if preset == "default" {
        format!("{}.json", mod_id)
    } else {
        format!("{}_{}.json", mod_id, preset)
    };
    let macros_dir = root_dir().join("public/modules/macros/profiles");

    let local_path = macros_dir.join("local").join(&filename);
    let shared_path = macros_dir.join("shared").join(&filename);

    if let Ok(content) = serde_json::to_string_pretty(&body) {
        if let Some(p) = local_path.parent() {
            let _ = std::fs::create_dir_all(p);
        }
        crate::custom_scenes::save_json_atomic(&local_path, &body.0);

        if sync_shared {
            if let Some(p) = shared_path.parent() {
                let _ = std::fs::create_dir_all(p);
            }
            crate::custom_scenes::save_json_atomic(&shared_path, &body.0);

            if let Ok(rel) = shared_path.strip_prefix(root_dir()) {
                let rel_str = rel.to_string_lossy().to_string();
                enqueue_git_sync(
                    vec![rel_str],
                    format!("auto-sync: mod config '{}' for '{}' updated", mod_id, preset),
                    10000,
                ).await;
            }
        }

        // Timestamp padrão via std::time (NÃO usar crate chrono, inexistente no Cargo.toml)
        let now_ts = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis() as i64;

        // Broadcast agnóstico: inclui data para evitar tempestade de GETs nos clients
        if let Err(e) = io.emit(
            "macro_config_changed",
            &json!({
                "mod": mod_id,
                "preset": preset,
                "synced": sync_shared,
                "ts": now_ts,
                "data": body
            }),
        ).await {
            tracing::warn!("macro_config_changed emit falhou mod={} preset={}: {}", mod_id, preset, e);
        }

        Json(json!({ "success": true, "mod": mod_id, "preset": preset, "synced": sync_shared }))
    } else {
        Json(json!({ "error": "Erro ao salvar config do mod" }))
    }
}
```

### Regras do snippet da Fase 0:
1. **Sem crates extras:** Uso estrito de `std::time::SystemTime` para timestamp epoch em milissegundos.
2. **Criação de diretórios:** `create_dir_all` preservado antes de `save_json_atomic`, pois o helper não cria pastas pai.
3. **Prevenção de thundering herd:** O evento inclui `"data": body`. Os clients ouvintes atualizam seu estado em memória diretamente sem disparar uma avalanche de requisições HTTP GET simultâneas contra o disco do servidor.
4. **Header de data para calibração de relógio:** No Axum, toda resposta HTTP já traz o header `Date` padrão, servindo de âncora para calibração de TTL nos clientes.

---

## Fase 1 — Core client agnóstico (`public/.../core.js` e `public_new/.../core.js`)

Arquivos: `public/modules/macros/core.js` + espelho `public_new/modules/macros/core.js`.
(Em `public_new` usar `window.apiFetch || fetch`; em `public` usar `fetch`).

### 1. `storage.getModConfig` limpo e agnóstico
- Continua como porta de entrada oficial da macro para leitura de configuração.
- **NÃO** depende de `localStorage` para injetar `syncShared`. O servidor decide a fonte SSOT com base nos arquivos do disco (`shared` vs `local`).
- Rota: `/api/macros/config/{modId}?preset={preset}`.

### 2. Novo `MixerAPI.storage.watch(modId, cb)` genérico e sem vazamentos
Implementado uma única vez no `core.js`:
- **Assinatura:** `storage.watch(modId, callback)` retorna uma função `unsubscribe()`.
- **Registry Centralizado:** Um `Map` interno em `core.js`: `modId -> Set of callbacks`.
- **Listener Socket Único:** Um único `socket.on('macro_config_changed', payload)` registrado no `core.js` (não por slot):
  - Verifica se o `payload.mod` coincide com algum `modId` registrado.
  - Se `payload.preset !== MixerAPI.utils.getPreset()`, descarta (evento pertence a outro preset).
  - Se trouxer `payload.data`, propaga diretamente aos callbacks sem fazer HTTP GET!
  - Se não trouxer dados, faz GET com throttle (coalescido para múltiplos ouvintes do mesmo mod).
- **Fallback Poll Seguro e Centralizado:**
  - Um único `setInterval` central (30s, ativo apenas com `document.visibilityState === 'visible'`).
  - Quando a lista de callbacks de todos os mods estiver vazia, o intervalo é pausado.
- **Calibração de Relógio Agnóstica:**
  - Em cada requisição feita pelo `core.js`, intercepta o header `Date` (ou `payload.ts` do socket) e calcula:
    `window.MixerAPI._clockOffset = serverTimeMs - Date.now();`
  - Expõe `MixerAPI.utils.getServerNow()`:
    ```javascript
    getServerNow: () => Date.now() + (window.MixerAPI._clockOffset || 0)
    ```
  - Isso garante que qualquer macro avalie TTLs pelo relógio do servidor, sem violar o sandboxing e sem conhecer detalhes de infraestrutura.

---

## Fase 2 — Macro `smart_channel_toggler` (`main.js` nos dois diretórios)

Arquivos: `public/modules/macros/smart_channel_toggler/main.js` + `public_new/modules/macros/smart_channel_toggler/main.js` (manter idênticos).

### 4. `onInit` estritamente read-only (Eliminação do Reset Destrutivo)
- Fazer GET da configuração -> validar snapshot -> atualizar visual do pad.
- **DELETAR COMPLETAMENTE** o bloco de `main.js:91-98` que salvava reset em caso de snapshot inválido:
  ```javascript
  // REMOVER ESTE BLOCO DELETÉRIO:
  // if (!isSnapshotValid(modData.snapshot)) {
  //     modData.snapshot = createDefaultModData().snapshot;
  //     await MixerAPI.storage.saveModConfig(MOD_ID, modData, true);
  // }
  ```
  Se o snapshot for inválido ou expirado, apenas renderiza visual de `🛡️ repouso` localmente. O servidor **NUNCA** é sobrescrito na inicialização de um client.
- Em `onDelete` (`main.js:446-452`): corrigir para enviar `{}` ou objeto limpo em vez de `null` literal.

### 5. `isSnapshotValid` unificado e seguro contra pré-handshake
- Corrigir `main.js:37-42`:
  - Usar estritamente `MixerAPI.state.getCurrentScene()` e `MixerAPI.state.getDeskName()`.
  - Checagem segura de nulidade:
    ```javascript
    const currentDesk = window.MixerAPI.state.getDeskName();
    if (snapshot.desk_name && currentDesk && snapshot.desk_name !== currentDesk) {
        return false;
    }
    const currentScene = window.MixerAPI.state.getCurrentScene();
    if (snapshot.scene_id !== null && snapshot.scene_id !== undefined && snapshot.scene_id !== currentScene) {
        return false;
    }
    ```
  - Unificar leitura de nomes de canais para `MixerAPI.state.getChannel(ch)?.name || 'CH ' + (ch + 1)`.

### 6. Semântica de expiração de 12h com relógio sincronizado
- Validar o TTL usando `MixerAPI.utils.getServerNow()`:
  ```javascript
  const now = (window.MixerAPI.utils.getServerNow ? window.MixerAPI.utils.getServerNow() : Date.now());
  if (now - snapshot.timestamp > TTL_MS) return false;
  ```
- Se expirado, o snapshot é considerado inativo para restauração, mas os **guardiões são preservados**. O próximo `execute` iniciará um corte novo limpo.
- Reset no servidor somente ocorre por ação deliberada do usuário (conclusão do RESTORE, clique no botão `↺ Limpar Memória do Toggle` ou exclusão da macro).

### 7. `execute` estritamente atômico (Sem alteração na lógica de corte)
- Respeito à Regra Inviolável 3: **nenhuma lógica de união `A ∪ B` ou diálogos de conflito no corte**.
- Fluxo:
  1. Carrega snapshot fresco do servidor.
  2. Avalia `isSnapshotValid(snapshot)`.
  3. Se inativo (`!active`):
     - Confirmação se guardiões estiverem vazios.
     - Coleta canais ligados (`on === true`) que não sejam guardiões nem parceiros estéreo de guardiões.
     - Monta novo snapshot ativo, grava no servidor via `saveModConfig(..., true)` e executa `toggleOn(ch, false)` com stagger de 20ms.
  4. Se ativo (`active`):
     - Desmuta os canais salvos em `channels_to_restore`.
     - Reseta o snapshot para inativo e salva a memória limpa no servidor via `saveModConfig(..., true)`.
  5. Atualiza o visual do pad.

### 8. `onSave`, `resetBtn` e `onConfigure` protegidos contra sobrescrita cega
- Ao abrir a configuração (`onConfigure`) ou salvar (`onSave`):
  - Fazer re-GET dos dados frescos do servidor.
  - Ao salvar guardiões em `onSave`, atualizar apenas o campo `guardians` do objeto fresco vindo do servidor, preservando o `snapshot` que possa ter sido alterado remotamente por outro client.

### 9. Assinatura do `watch` à prova de re-renders
- Em `main.js`, manter o handle `unwatchConfig` no escopo do módulo para evitar registros duplicados quando `renderMacros()` chamar `onInit` repetidas vezes:
  ```javascript
  let unwatchHandler = null;

  async function onInit(slotIndex, slotConfig) {
      // ... carregar dados e atualizar pad ...
      if (!unwatchHandler && window.MixerAPI.storage.watch) {
          unwatchHandler = window.MixerAPI.storage.watch(MOD_ID, (latest) => {
              currentModData = latest;
              updatePadVisual(slotIndex, latest);
              updateConfigUIIfOpen(slotIndex, latest);
          });
      }
      return modData;
  }
  ```
- Adicionar helper para atualizar o banner de status se o modal de configuração estiver aberto no momento do recebimento do push remoto, sem recriar os botões do grid (`innerHTML = ''`).

### 10. Banner diagnóstico no modal de configuração
- Estender o banner (`main.js:267-276`) para exibir:
  - `🔴 CORTE ATIVO · {preset} · {N} canais · Cena {cena} · {hora do corte}`
  - `⚪ EM REPOUSO · {preset} · Protegendo {N} guardiões`
  - Se snapshot for nulo/vazio: `⚪ EM REPOUSO · Sem corte registrado para este preset`.

---

## Fase 3 — Higiene agnóstica do sistema de macros e roteamento SSOT

### 11. Correção do crash `loadSlotsManifest` (Prioridade Máxima de Estabilidade)
- Arquivos: `public/modules/macros.js:822` e `public_new/modules/macros/macros.js:822`.
- Trocar `await loadSlotsManifest();` por `await loadGlobalSlotsManifest();`.
- Elimina o `ReferenceError` disparado ao mover/arrastar qualquer pad de macro.

### 12. Correção do fallback em `server_rust/src/api/macros.rs:268-271`
- Trocar a chave do JSON de fallback de `"match"` para `"matches"`:
  ```rust
  Json(json!([
      { "matches": ["192.168.15.99"], "preset": "pcmaria" },
      { "matches": ["pcfavela"], "preset": "pcfavela" }
  ]))
  ```
  Alinha a resposta do backend com a expectativa do parser em `macros.js:54`.

### 13. Eliminação dos perfis mortos em `public_new`
- Deletar arquivos JSON residuais em `public_new/modules/macros/profiles/{local,shared}/*.json` (manter apenas `.gitkeep` se necessário).
- Documentar no README do módulo que o servidor Rust grava e lê exclusivamente em `public/modules/macros/profiles`.

### 14. Resolução de Presets e SSOT Definitivo no Servidor
a. **Eliminação do "Caso Sombra" no Backend (`macros.rs:663-688`):**
   - No `get_mod_config`, o servidor não deve depender de parâmetros de query voláteis do browser para decidir se lê de `shared` ou `local`.
   - Se existirem ambos os arquivos (`local/smart_channel_toggler_X.json` e `shared/smart_channel_toggler_X.json`), o servidor compara `std::fs::metadata().modified()` e retorna **o arquivo com data de modificação mais recente**. Se apenas um existir, retorna o existente.
   - Isso garante que um client recém-conectado (mobile, aba anônima ou pós-limpeza de cache) veja imediatamente o estado mais atual da mesa.
b. **Validação de Preset em `detectCurrentPreset` (`macros.js:46-79`):**
   - Ao validar `saved = localStorage.getItem('macro_last_preset')` contra a lista do servidor, garantir que `'default'` seja **sempre considerado válido**.
   - Se o preset salvo for desconhecido e diferente de `'default'`, descarta o valor stale e assume o preset descoberto via host/IP.

---

## Verificação e Critérios de Aceite

1. **Compilação e Tipagem:**
   - Executar `cargo check` no diretório `server_rust` — deve compilar com 0 erros e 0 warnings novos.
2. **Sincronização em Tempo Real Multi-Dispositivo:**
   - Abrir Navegador A e Navegador B (ou aba anônima / celular) apontando para o servidor.
   - Navegador A aciona o Smart Toggler: os canais físicos desligam na mesa, o pad no Navegador A fica vermelho (`MUTED`).
   - **Critério:** Em menos de 200ms, sem recarregar a página, o Navegador B atualiza o pad visual para vermelho (`MUTED`) via push do socket.
   - Navegador B clica no pad: canais desmutam, e ambos os navegadores voltam ao estado verde/repouso (`🛡️`).
3. **Persistência e Independência de `localStorage`:**
   - No Navegador B, limpar completamente cookies, dados de navegação e `localStorage`.
   - Fazer recarregamento forçado (`Ctrl+F5`).
   - **Critério:** O Navegador B deve carregar exibindo exatamente o corte ativo registrado no servidor, sem resetar a mesa e sem apagar o snapshot remoto.
4. **Resistência contra Re-render e Vazamento:**
   - Arrastar e trocar posições de pads repetidas vezes na interface.
   - **Critério:** Nenhum `ReferenceError` no console (`loadSlotsManifest` corrigido) e o número de listeners cadastrados em `core.js` permanece estável (1 por macro ativa).
5. **Calibração de Relógio no TTL:**
   - Simular um client com relógio adiantado/atrasado.
   - **Critério:** A macro calcula o tempo restante de 12h ancorada no horário do servidor, sem declarar expiração indevida de corte recente.

---

## Changelog da Auditoria Externa e Revisão Técnica

- **Fase 0 — Correção de Crate Inexistente:** Removida a chamada à crate `chrono` (não declarada no `Cargo.toml`). Substituída por `std::time::SystemTime` nativo da standard library do Rust.
- **Fase 0 — Prevenção de Thundering Herd:** Inclusão de `"data": body` no evento `macro_config_changed`, permitindo que os clients façam atualização direta via push sem avalanche de requisições HTTP GET.
- **Fase 0 — Segurança de Diretórios:** Garantida a preservação de `create_dir_all` antes da chamada a `save_json_atomic`.
- **Fase 1 — Eliminação de Vazamento de Watchers:** `storage.watch` passa a retornar `unsubscribe()`, com barramento centralizado em `core.js` para poll e socket, evitando o acúmulo de timers e closures a cada render de slot.
- **Fase 1 — Calibração Temporal Transparente:** Adicionado cálculo de offset de relógio via header HTTP `Date` com helper `MixerAPI.utils.getServerNow()`, garantindo precisão do TTL de 12h sem violar o sandboxing.
- **Fase 2 — Preservação Estrita da Regra Inviolável 3:** Eliminada a proposta de introduzir lógica de conjuntos (`A ∪ B`) ou diálogos de concorrência em tempo de execução dentro de `execute()`. A macro permanece com sua lógica original de corte e restore.
- **Fase 2 — Prevenção de Múltiplos Listeners na Macro:** Implementado controle de `unwatchHandler` em `main.js` para evitar re-assinaturas a cada invocação de `onInit`.
- **Fase 3 — Desacoplamento de `localStorage` no SSOT:** O servidor passa a arbitrar entre `shared` e `local` baseado no `mtime` dos arquivos, assegurando que qualquer client novo veja o corte sem precisar de chaves prévias em `localStorage`.
- **Fase 3 — Correção de Validação de Presets:** Protegido o preset `'default'` para não ser descartado na checagem de slots.
