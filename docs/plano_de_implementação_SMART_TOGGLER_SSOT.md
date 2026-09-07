# Plano de implementação — Smart Toggler com SSOT no servidor (via Macro API)

> ⛔ REGRA MAIS IMPORTANTE DESTE PROJETO: NÃO FAZER COMMITS SEM O USUÁRIO PEDIR. E quando o usuário
> pedir um commit, fazer aquele commit e AGUARDAR ele pedir novamente para commitar de novo. Nunca
> commitar em sequência por conta própria, nunca emendar push automático, nunca antecipar o próximo commit.

> Nota de paths e arquitetura (auditoria externa consolidada):
> - `macros.js` do core client é `public/modules/macros.js` (+ espelho `public_new/modules/macros/macros.js`).
> - `core.js` é `public/modules/macros/core.js` (+ espelho `public_new/modules/macros/core.js` — mantidos **estritamente idênticos** usando wrapper agnóstico de fetch).
> - Macro é `public/modules/macros/smart_channel_toggler/main.js` (+ espelho `public_new/modules/macros/smart_channel_toggler/main.js` — mantidos idênticos).
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
   de outro client (`smart_channel_toggler/main.js:91-98`). BLOQUEADOR — corrigido na Fase 2 item 4.
4. Roteamento de preset frágil: `macro_last_preset`/`macro_sync_shared_*` (`public/modules/macros.js:59,502,524`)
   têm precedência sem validação de sanidade; `detectCurrentPreset` (`public/modules/macros.js:46-79`) pode cair
   noutro preset → macro lê outro arquivo `smart_channel_toggler_{outroPreset}.json` → "resetado".
   `local`/`shared` são pastas **do servidor** (globais a todos browsers), não "deste PC".
5. `get_mod_config` ignora `syncShared` e lê `local` antes de `shared` (`macros.rs:663-688`), enquanto
   `get_slots` respeita a flag (`macros.rs:297-313`). Pior: `save_mod_config:707-717` escreve `local` SEMPRE e
   `shared` só se `syncShared=true` — leitura `local-first` cega gera o "caso sombra" em máquinas secundárias
   que sincronizaram `shared` via Git mas mantêm um `local` antigo. Corrigir com resolução inteligente por
   data de modificação (`mtime`) com fallback de leitura no backend.
6. TTL só no client com `Date.now()` (`smart_channel_toggler/main.js:7,26-45`) — dois dispositivos nunca
   possuem relógios 100% idênticos. Resolver calibrando o offset de relógio via timestamp numérico `payload.ts`
   no socket e header HTTP `Date` com validação estrita anti-NaN na `MixerAPI`.
7. Concorrência: `isExecuting` é por aba (`main.js:8`); `POST` é last-writer-wins no arquivo. A escrita
   atômica no disco deve usar sufixo único por processo/thread para evitar bloqueios de arquivo temporário
   no Windows (`std::io::ErrorKind::PermissionDenied`).
8. `guard` de desk/cena furado no pré-handshake: `window.serverName` inicia como `null` e `window.currentSceneNumber`
   inicia como `undefined`. As funções em `core.js` mascaravam isso retornando `0` e `'01V96'`. Se a macro
   estiver na Cena 3 ou em mesa com nome customizado, qualquer F5 declarava o snapshot inválido prematuramente.
   A `MixerAPI.state` deve informar quando o estado está pronto (`isStateReady()`) ou retornar `null` enquanto
   não houver handshake concluído.
9. `onSave`, `resetBtn` e `onClear` clobberam snapshot/guardians se salvarem closures locais antigas sem re-GET
   (`smart_channel_toggler/main.js:418-431`, `:291-302`, `:434-443`). Re-GET fresco antes de salvar.
10. Duplicação `public/` × `public_new/`: servidor só lê/escreve `public/.../profiles` (`macros.rs:670,702`).
    Espelhos em `public_new/.../profiles` são peso-morto e devem ser removidos. O código JS das macros em
    `public_new/modules/macros/` deve ser estritamente mantido idêntico ao de `public/`.
11. Bônus achados: `public/modules/macros.js:822` (e espelho) chama `loadSlotsManifest()` inexistente
    (é `loadGlobalSlotsManifest:500` — `ReferenceError` a cada `completeMacroMove`);
    fallback `get_hosts` retorna `{match}` mas client lê `h.matches` (`macros.rs:268-271` vs `macros.js:54,400`);
    `onDelete:446-452` grava literal `"null"` (`JSON.stringify(null)`);
    `save_mod_config` usa `fs::write` não-atômico (`macros.rs:711,717`).

---

## Fase 0 — Adição agnóstica no servidor: broadcast genérico, CORS e escrita atômica

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
        // ATENÇÃO: passar &body diretamente (body já é serde_json::Value desestruturado)
        crate::custom_scenes::save_json_atomic(&local_path, &body);

        if sync_shared {
            if let Some(p) = shared_path.parent() {
                let _ = std::fs::create_dir_all(p);
            }
            crate::custom_scenes::save_json_atomic(&shared_path, &body);

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

### 2. Exposição de Headers no CORS em `server_rust/src/main.rs`

Para que clientes no app desktop Tauri (`tauri://localhost`) ou em IPs locais distintos consigam ler o header `Date` das respostas HTTP sem bloqueio da Fetch API:

```rust
// server_rust/src/main.rs:228-232
let cors = tower_http::cors::CorsLayer::new()
    .allow_origin(tower_http::cors::Any)
    .allow_methods(tower_http::cors::Any)
    .allow_headers(tower_http::cors::Any)
    .expose_headers([axum::http::header::DATE]);
```

### 3. Escrita Atômica Segura no Windows em `server_rust/src/custom_scenes.rs`

Para evitar colisão de concorrência (`PermissionDenied` no Windows quando duas threads usam o mesmo `.json.tmp`):

```rust
// server_rust/src/custom_scenes.rs:939
pub fn save_json_atomic(path: &Path, data: &impl Serialize) {
    let unique_id = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();
    let tmp_path = path.with_extension(format!("tmp.{}", unique_id));
    match serde_json::to_string_pretty(data) {
        Ok(json) => {
            if let Err(e) = fs::write(&tmp_path, &json) {
                tracing::error!("failed to write temp file {:?}: {}", tmp_path, e);
                return;
            }
            if let Err(e) = fs::rename(&tmp_path, path) {
                tracing::error!("failed to rename {:?} -> {:?}: {}", tmp_path, path, e);
                let _ = fs::remove_file(&tmp_path);
            }
        }
        Err(e) => {
            tracing::error!("failed to serialize: {}", e);
        }
    }
}
```

---

## Fase 1 — Core client agnóstico (`public/.../core.js` e `public_new/.../core.js`)

Arquivos: `public/modules/macros/core.js` + espelho `public_new/modules/macros/core.js`.
**Regra de ouro:** Manter ambos os arquivos 100% idênticos usando o wrapper agnóstico:
```javascript
const apiFetch = (typeof window !== 'undefined' && window.apiFetch) ? window.apiFetch : fetch.bind(window);
```

### 1. `storage.getModConfig` e `storage.saveModConfig` limpos
- Usa `apiFetch` uniformemente.
- Rota: `/api/macros/config/{modId}?preset={preset}`.
- O servidor decide a fonte SSOT com base nos arquivos em disco (`shared` vs `local`).

### 2. Novo `MixerAPI.storage.watch(modId, cb)` genérico, sem vazamentos e anti-tempestade
Implementado uma única vez no `core.js`:
- **Assinatura:** `storage.watch(modId, callback)` retorna uma função `unsubscribe()`.
- **Registry Centralizado:** Um `Map` interno em `core.js`: `modId -> Set of callbacks`.
- **Listener Socket Único:** Um único `socket.on('macro_config_changed', payload)` registrado no `core.js`:
  - Verifica se o `payload.mod` coincide com algum `modId` registrado no Map.
  - Se `payload.preset !== MixerAPI.utils.getPreset()`, descarta silenciosamente.
  - Atualiza o relógio do cliente se `payload.ts` for válido: `updateClockOffset(payload.ts)`.
  - Se trouxer `payload.data`, propaga diretamente aos callbacks do Set **sem fazer nenhum HTTP GET**!
  - Se não trouxer dados, dispara uma única requisição GET compartilhada (`inFlightPromise`) para todos os ouvintes daquele `modId`.
- **Fallback Poll Seguro e Desacoplado:**
  - O polling (`setInterval` de 30s) é ativado **exclusivamente se o WebSocket estiver desconectado** (`!window.socket?.connected`).
  - Adicionado listener de `document.addEventListener('visibilitychange')`: ao voltar a ficar visível (`document.visibilityState === 'visible'`), dispara uma verificação imediata para atualizar o estado caso o dispositivo estivesse suspenso.
- **Calibração de Relógio Segura Anti-NaN:**
  - Expõe `MixerAPI.utils.getServerNow()`:
    ```javascript
    function updateClockOffset(serverEpochMs) {
        if (typeof serverEpochMs === 'number' && Number.isFinite(serverEpochMs)) {
            window.MixerAPI._clockOffset = serverEpochMs - Date.now();
        }
    }
    // Na resposta de todo fetch:
    const dateHeader = res.headers.get('date');
    if (dateHeader) {
        const parsed = Date.parse(dateHeader);
        if (Number.isFinite(parsed)) updateClockOffset(parsed);
    }
    ```
    ```javascript
    getServerNow: () => Date.now() + (window.MixerAPI._clockOffset || 0)
    ```

### 3. Proteção de Pré-Handshake no `MixerAPI.state`
Evita que a ausência de resposta da mesa seja confundida com "Cena 0" ou "Mesa 01V96":
```javascript
state: {
    getChannel: (ch) => typeof getChannelStateById === 'function' ? getChannelStateById(ch) : window.channelStates?.[ch],
    isPaired: (ch) => window.channelStates?.[ch]?.paired || false,
    getPairPartner: (ch) => {
        const id = parseInt(ch);
        return (id % 2 === 0) ? id + 1 : id - 1;
    },
    // Retorna o número da cena ou null se o socket ainda não recebeu a cena da mesa
    getCurrentScene: () => (window.currentSceneNumber !== undefined ? window.currentSceneNumber : null),
    // Retorna o nome da mesa ou null se o handshake inicial ainda não ocorreu
    getDeskName: () => (window.serverName || null),
    // Informa se os dados de hardware da mesa já estão disponíveis
    isStateReady: () => (window.currentSceneNumber !== undefined && window.serverName !== null)
}
```

---

## Fase 2 — Macro `smart_channel_toggler` (`main.js` nos dois diretórios)

Arquivos: `public/modules/macros/smart_channel_toggler/main.js` + `public_new/modules/macros/smart_channel_toggler/main.js` (mantidos idênticos).

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
- Em `onDelete` (`main.js:446-452`): enviar `{}` limpo em vez de `null` literal.

### 5. `isSnapshotValid` imune a falso pré-handshake
- Corrigir `main.js:37-42`:
  ```javascript
  const currentDesk = window.MixerAPI.state.getDeskName();
  if (currentDesk !== null && snapshot.desk_name !== null && snapshot.desk_name !== currentDesk) {
      return false;
  }
  const currentScene = window.MixerAPI.state.getCurrentScene();
  if (currentScene !== null && snapshot.scene_id !== null && snapshot.scene_id !== currentScene) {
      return false;
  }
  ```
  Se `currentDesk` ou `currentScene` forem `null` (handshake com a mesa ainda em andamento), a macro **não invalida** o corte prematuramente.

### 6. Semântica de expiração de 12h com relógio sincronizado
- Validar o TTL usando `MixerAPI.utils.getServerNow()` com fallback seguro:
  ```javascript
  const now = (window.MixerAPI.utils.getServerNow ? window.MixerAPI.utils.getServerNow() : Date.now());
  if (now - snapshot.timestamp > TTL_MS) return false;
  ```
- Se expirado, o snapshot é inativo para restauração, mas os **guardiões são preservados**.

### 7. `execute` com tratamento inequívoco de corte vs restauração
- Decisão clara e sem ambiguidade:
  ```javascript
  const isCutActive = snapshot && snapshot.active === true && isSnapshotValid(snapshot);
  if (!isCutActive) {
      // MODO REPOUSO OU CORTE EXPIRADO -> Inicia novo corte limpo
      if (modData.guardians.length === 0) {
          const confirmed = await MixerAPI.ui.confirm({
              title: 'Atenção',
              message: 'Mutar todos os canais?\n(Você pode selecionar os canais protegidos na engrenagem)',
              type: 'warning'
          });
          if (!confirmed) { isExecuting = false; return; }
      }
      // Coleta canais ligados e não protegidos...
      snapshot.active = true;
      snapshot.channels_to_restore = channelsToRestore;
      snapshot.timestamp = (window.MixerAPI.utils.getServerNow ? window.MixerAPI.utils.getServerNow() : Date.now());
      snapshot.scene_id = window.MixerAPI.state.getCurrentScene();
      snapshot.desk_name = window.MixerAPI.state.getDeskName();

      await MixerAPI.storage.saveModConfig(MOD_ID, modData, true);

      for (const ch of channelsToRestore) {
          MixerAPI.mixer.toggleOn(ch, false);
          await new Promise(r => setTimeout(r, 20));
      }
      updatePadVisual(slotIndex, modData);
  } else {
      // MODO ATIVO VÁLIDO -> Restaura canais
      const channelsToRestore = snapshot.channels_to_restore || [];
      for (const ch of channelsToRestore) {
          const state = MixerAPI.state.getChannel(ch);
          if (state && state.on === false) {
              MixerAPI.mixer.toggleOn(ch, true);
              await new Promise(r => setTimeout(r, 20));
          }
      }
      snapshot.active = false;
      snapshot.channels_to_restore = [];
      snapshot.timestamp = null;
      snapshot.scene_id = null;
      snapshot.desk_name = null;

      await MixerAPI.storage.saveModConfig(MOD_ID, modData, true);
      updatePadVisual(slotIndex, modData);
  }
  ```

### 8. `onSave`, `resetBtn` e `onConfigure` protegidos contra sobrescrita cega
- Ao abrir a configuração (`onConfigure`) ou salvar guardiões (`onSave`):
  - Fazer re-GET dos dados frescos do servidor.
  - Em `onSave`, mesclar apenas a lista `guardians` sobre o objeto fresco do servidor, preservando o `snapshot` existente.
- No `resetBtn` (`↺ Limpar Memória do Toggle`):
  - Fazer re-GET fresco, limpar apenas `modData.snapshot = createDefaultModData().snapshot;` e salvar de volta, preservando os guardiões configurados.

### 9. Assinatura do `watch` com suporte a Multi-Slot e Drag/Drop
- Em `main.js`, usar um `Set` de slots ativos para atualizar todos os pads onde a macro estiver instalada:
  ```javascript
  const activeSlots = new Set();
  let unwatchHandler = null;

  async function onInit(slotIndex, slotConfig) {
      activeSlots.add(slotIndex);

      let modData = createDefaultModData();
      try {
          const loaded = await MixerAPI.storage.getModConfig(MOD_ID);
          if (loaded && typeof loaded === 'object') modData = { ...modData, ...loaded };
      } catch (e) {
          console.error(`[${MOD_ID}] Erro ao carregar config:`, e);
      }
      currentModData = modData;
      updatePadVisual(slotIndex, modData);

      if (!unwatchHandler && window.MixerAPI.storage.watch) {
          unwatchHandler = window.MixerAPI.storage.watch(MOD_ID, (latest) => {
              currentModData = latest;
              for (const sIdx of activeSlots) {
                  updatePadVisual(sIdx, latest);
              }
              updateConfigUIIfOpen(slotIndex, latest);
          });
      }
      return modData;
  }

  async function onDelete(slotIndex) {
      activeSlots.delete(slotIndex);
      if (activeSlots.size === 0 && unwatchHandler) {
          unwatchHandler();
          unwatchHandler = null;
      }
      try {
          await MixerAPI.storage.saveModConfig(MOD_ID, createDefaultModData(), true);
      } catch (e) {
          console.error(`[${MOD_ID}] Erro ao deletar config:`, e);
      }
  }
  ```

### 10. Banner diagnóstico no modal de configuração
- Exibir estado detalhado com suporte a atualizações remotas em tempo real:
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
- Servidor Rust grava e lê exclusivamente em `public/modules/macros/profiles`.

### 14. Resolução Definitiva de Presets e SSOT no Servidor

#### a. Resolução Inteligente por `mtime` com Fallback em `server_rust/src/api/macros.rs`
Substituir a função `get_mod_config` atual ([`macros.rs:663-688`](file:///c:/PROJETOS/01v96-remote-web/server_rust/src/api/macros.rs#L663-L688)) por leitura atômica comparativa com fallback seguro:

```rust
async fn get_mod_config(Path(mod_id): Path<String>, Query(q): Query<PresetQuery>) -> Json<Value> {
    let preset = q.preset.unwrap_or_else(|| "default".to_string());
    let filename = if preset == "default" {
        format!("{}.json", mod_id)
    } else {
        format!("{}_{}.json", mod_id, preset)
    };
    let macros_dir = root_dir().join("public/modules/macros/profiles");

    let local_path = macros_dir.join("local").join(&filename);
    let shared_path = macros_dir.join("shared").join(&filename);

    let read_json = |p: &std::path::Path| -> Option<Value> {
        if !p.exists() { return None; }
        let c = std::fs::read_to_string(p).ok()?;
        serde_json::from_str(&c).ok()
    };

    let local_mtime = std::fs::metadata(&local_path).and_then(|m| m.modified()).ok();
    let shared_mtime = std::fs::metadata(&shared_path).and_then(|m| m.modified()).ok();

    let (primary, secondary) = match (local_mtime, shared_mtime) {
        (Some(l), Some(s)) => {
            if l >= s { (&local_path, &shared_path) } else { (&shared_path, &local_path) }
        }
        (Some(_), None) => (&local_path, &shared_path),
        (None, Some(_)) => (&shared_path, &local_path),
        (None, None) => return Json(json!({})),
    };

    if let Some(v) = read_json(primary) {
        return Json(v);
    }
    if let Some(v) = read_json(secondary) {
        return Json(v);
    }
    Json(json!({}))
}
```

#### b. Validação de Preset em `detectCurrentPreset` (`macros.js:46-79`)
Ao validar `saved = localStorage.getItem('macro_last_preset')` contra a lista do servidor, garantir que `'default'` seja sempre considerado válido. Se o preset salvo for desconhecido e diferente de `'default'`, descarta o valor stale e assume o preset descoberto via host/IP.

---

## Verificação e Critérios de Aceite

1. **Compilação e Tipagem:**
   - Executar `cargo check` no diretório `server_rust` — deve compilar com 0 erros e 0 warnings novos.
2. **Sincronização em Tempo Real Multi-Dispositivo:**
   - Abrir Navegador A e Navegador B (ou aba anônima / celular) apontando para o servidor.
   - Navegador A aciona o Smart Toggler: canais físicos desligam na mesa, pad no Navegador A fica vermelho (`MUTED`).
   - **Critério:** Em menos de 200ms, sem recarregar a página, o Navegador B atualiza o pad visual para vermelho (`MUTED`) via push do socket.
   - Navegador B clica no pad: canais desmutam, e ambos os navegadores voltam ao estado verde/repouso (`🛡️`).
3. **Persistência e Independência de `localStorage`:**
   - No Navegador B, limpar completamente cookies, dados de navegação e `localStorage`.
   - Fazer recarregamento forçado (`Ctrl+F5`).
   - **Critério:** O Navegador B deve carregar exibindo exatamente o corte ativo registrado no servidor, sem resetar a mesa e sem apagar o snapshot remoto.
4. **Resistência contra Re-render, Drag/Drop e Vazamento:**
   - Arrastar e trocar posições de pads repetidas vezes na interface.
   - **Critério:** Nenhum `ReferenceError` no console (`loadSlotsManifest` corrigido) e todos os pads do toggler continuam respondendo a eventos em tempo real.
5. **Calibração de Relógio no TTL:**
   - Simular um client com relógio adiantado/atrasado.
   - **Critério:** A macro calcula o tempo restante de 12h ancorada no horário do servidor, sem NaN e sem declarar expiração indevida de corte recente.

---

## Registro Detalhado de Revisão e Auditoria Técnica (Original × Modificação × Porquê)

Abaixo estão registradas todas as alterações consolidadas nesta revisão técnica:

### 1. Chamada a `save_json_atomic` no Servidor Rust
- **Original (Fase 0, linhas 133 e 139):**
  `crate::custom_scenes::save_json_atomic(&local_path, &body.0);`
- **Modificação:**
  `crate::custom_scenes::save_json_atomic(&local_path, &body);`
- **Por quê:**
  `body` é extraído na assinatura como `Json(body): Json<Value>`. Em Axum/Rust, o pattern matching desestrutura a struct `Json`, tornando `body` uma instância direta de `serde_json::Value`. O acesso `.0` causava erro fatal de compilação `error[E0609]: no field 0 on type serde_json::Value`.

### 2. Exposição de Headers de Relógio no CORS
- **Original (Fase 0):**
  O plano assumia que o header HTTP `Date` estaria disponível para qualquer client ler via `res.headers.get('date')`.
- **Modificação:**
  Adicionada configuração explícita no `CorsLayer` em `server_rust/src/main.rs`: `.expose_headers([axum::http::header::DATE]);`.
- **Por quê:**
  Na especificação da Fetch API do navegador, acessos cross-origin ou originários do desktop app Tauri (`tauri://localhost`) bloqueiam a leitura de headers de resposta não safelisted a menos que o servidor os declare em `Access-Control-Expose-Headers`. Sem isso, `res.headers.get('date')` retorna `null`.

### 3. Escrita Concorrente em Arquivo Temporário
- **Original (Fase 0):**
  Uso de `save_json_atomic` com caminho estático fixo `let tmp_path = path.with_extension("json.tmp");`.
- **Modificação:**
  Geração de sufixo único baseado em timestamp de nanossegundos (`path.with_extension(format!("tmp.{}", unique_id))`).
- **Por quê:**
  No Windows, se dois requests concorrentes gravarem no mesmo arquivo temporário `.tmp`, o sistema operacional bloqueia o arquivo com `PermissionDenied` ao tentar renomear. O sufixo único garante que cada thread/processo opere em seu próprio arquivo antes do rename atômico.

### 4. Unificação de `core.js` entre `public/` e `public_new/`
- **Original (Fase 1):**
  Instrução deliberada para manter os arquivos divergentes: `(Em public_new usar window.apiFetch || fetch; em public usar fetch)`.
- **Modificação:**
  Uso padronizado de `const apiFetch = (typeof window !== 'undefined' && window.apiFetch) ? window.apiFetch : fetch.bind(window);` em ambos os arquivos, tornando-os **100% idênticos byte a byte**.
- **Por quê:**
  Manter diferenças manuais entre `public/` e `public_new/` é a causa primária de erros de sincronização e regressões em ambientes mistos Web/Tauri. O wrapper agnóstico detecta o runtime automaticamente sem divergência de código.

### 5. Blindagem contra `NaN` no Cálculo de Offset de Relógio
- **Original (Fase 1):**
  `window.MixerAPI._clockOffset = serverTimeMs - Date.now();` sem validação.
- **Modificação:**
  Validação estrita com `Number.isFinite(serverTimeMs)`, e calibração prioritária a partir de `payload.ts` do WebSocket (já numérico e em milissegundos).
- **Por quê:**
  Se o header `Date` viesse nulo ou malformatado, `Date.parse()` gerava `NaN`. Com `_clockOffset = NaN`, a expressão `now - snapshot.timestamp > TTL_MS` na macro passava a avaliar `false` perpetuamente, impedindo que o corte expirasse após 12h.

### 6. Desacoplamento do Polling de 30s
- **Original (Fase 1):**
  Um `setInterval` incondicional de 30s fazendo HTTP GET em segundo plano.
- **Modificação:**
  O polling passa a ser executado apenas quando `!window.socket?.connected`. Adicionado listener de `visibilitychange` para re-sync imediato apenas ao reabrir/focar a janela.
- **Por quê:**
  Como o evento de socket já transmite `"data": body` no push, fazer polling HTTP periódico enquanto o WebSocket está 100% saudável causa tráfego desnecessário e risco de oscilação visual no pad. O evento `visibilitychange` cobre o único caso real de perda de mensagens (suspensão de aba em dispositivos móveis).

### 7. Proteção contra Falso Pré-Handshake de Cena e Mesa
- **Original (Fase 2, item 5):**
  Verificação imediata `snapshot.scene_id !== currentScene` e `snapshot.desk_name !== currentDesk`, onde `core.js` retornava `0` e `'01V96'` por padrão.
- **Modificação:**
  `MixerAPI.state.getCurrentScene()` e `getDeskName()` retornam `null` enquanto o socket não tiver recebido o handshake real da mesa física. `isSnapshotValid` só invalida por cena/mesa se o valor atual for não-nulo e divergente.
- **Por quê:**
  Na carga ou recarregamento da página (F5), `onInit` roda antes do socket receber os dados do hardware. Retornar `0` e `'01V96'` fazia com que qualquer corte registrado na Cena 1+ ou com nome customizado fosse falsamente invalidado na hora, revertendo o pad para repouso.

### 8. Watcher Multi-Slot e Resistente a Drag/Drop
- **Original (Fase 2, item 9):**
  `let unwatchHandler = null` no escopo do módulo da macro com amarração fixa a um `slotIndex`.
- **Modificação:**
  Rastreamento de slots ativos via `const activeSlots = new Set()`. O callback do watcher itera sobre todos os slots do conjunto. `onDelete(slotIndex)` remove o slot do Set e só cancela a inscrição quando não restar nenhum slot ativo.
- **Por quê:**
  O design original quebrava se o usuário tivesse a mesma macro em 2 slots diferentes ou se movesse o pad de lugar (drag & drop), já que `renderMacros()` recria o DOM e deixava a closure antiga amarrada ao slot anterior.

### 9. Decisão Explícita de Corte vs Restauração no `execute`
- **Original (Fase 2, item 7):**
  O código original testava apenas `if (!snapshot.active)`, e o plano dizia genericamente "Avalia isSnapshotValid... Se inativo... Se ativo...".
- **Modificação:**
  Definição explícita: `const isCutActive = snapshot && snapshot.active === true && isSnapshotValid(snapshot);`. Se `isCutActive` for falso, inicia novo corte limpo; se verdadeiro, restaura.
- **Por quê:**
  Se um corte passasse de 12 horas (expirado), `snapshot.active` ainda seria `true` no arquivo do servidor. O teste `if (!snapshot.active)` cairia no branch de restauração e desmutaria canais de um evento ocorrido horas antes. A validação combinada garante que corte expirado reinicie o ciclo como repouso.

### 10. Implementação Completa de `get_mod_config` com Resolução de `mtime`
- **Original (Fase 3, item 14.a):**
  Apenas descrição conceitual de que o servidor deveria comparar `mtime` entre `local` e `shared`.
- **Modificação:**
  Fornecido o snippet Rust completo com comparação de timestamps de modificação e leitura segura com fallback entre os arquivos caso um deles esteja temporariamente inacessível.
- **Por quê:**
  Elimina a ambiguidade de implementação, prevenindo panics no backend e assegurando que um client recém-conectado leia o estado mais atualizado independentemente de parâmetros voláteis de `localStorage`.
