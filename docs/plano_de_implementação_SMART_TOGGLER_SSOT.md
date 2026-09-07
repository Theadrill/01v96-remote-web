# Plano de implementação — Smart Toggler com SSOT no servidor (via Macro API)

> ⛔ REGRA MAIS IMPORTANTE DESTE PROJETO: NÃO FAZER COMMITS SEM O USUÁRIO PEDIR. E quando o usuário
> pedir um commit, fazer aquele commit e AGUARDAR ele pedir novamente para commitar de novo. Nunca
> commitar em sequência por conta própria, nunca emendar push automático, nunca antecipar o próximo commit.

> Nota de paths (auditoria externa, manter): `macros.js` do core client é `public/modules/macros.js`
> (+ espelho `public_new/modules/macros/macros.js`) — NÃO `public/modules/macros/macros.js`.
> `core.js` é `public/modules/macros/core.js` (+ espelho `public_new/modules/macros/core.js` — **198 linhas cada, não 465**; a nota original dizia "465" por engano ao confundir com `main.js`).
> Macro é `public/modules/macros/smart_channel_toggler/main.js` (+ espelho `public_new/modules/macros/smart_channel_toggler/main.js` — 465 linhas cada, **idênticas até hoje**).
> `save_json_atomic` vive em `server_rust/src/custom_scenes.rs:939-955` como `pub fn` (não `pub(crate)`) — portanto `macros.rs` pode chamá-lo diretamente via `crate::custom_scenes::save_json_atomic`. A Fase 3 item 14c original proposta "tornar `pub(crate)` ou extrair helper" é **desnecessária**; removida essa etapa de refatoração de visibilidade.
> Diretório de espelho é **`public_new`** (com underscore duplo), não `pub_new`.

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
é avaliada de forma inconsistente entre clients diferentes.

## Objetivo

Que os canais desligados persistam no servidor como única fonte da verdade, e que qualquer client que se
conecte ao servidor enxergue o mesmo estado verdadeiro: se houver um corte ativo, ele mostra quais canais
foram mutados; se não houver, mostra que está em repouso. Após 12 horas, o estado deixa de ser válido e
passa a ser tratado como resetado. Tudo isso sem depender do armazenamento local do navegador.

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

## Diagnóstico (resumo do que foi auditado)

1. Snapshot JÁ persiste via `POST /api/macros/config/smart_channel_toggler?preset=X&syncShared=true`
   em `public/modules/macros/profiles/{local,shared}/smart_channel_toggler_{preset}.json` — o problema nunca
   foi "não salva" (`server_rust/src/api/macros.rs:690-736`, `smart_channel_toggler/main.js:170,203`).
2. `save_mod_config` não emite nenhum evento socket — visual `MUTED` é DOM-local, outro client só descobre
   com reload (`macros.rs:690-736`, `smart_channel_toggler/main.js:48-64`, `public/modules/macros.js:671-738`).
3. `onInit` faz escrita corretiva destrutiva: se valida como inválido, dá `POST` de reset e apaga corte válido
   de outro client (`smart_channel_toggler/main.js:91-98`). BLOQUEADOR — corrigir na Fase 2 item 4.
4. Roteamento de preset frágil: `macro_last_preset`/`macro_sync_shared_*` (`public/modules/macros.js:59,502,524`)
   têm precedência absoluta e sem validação; `detectCurrentPreset` (`public/modules/macros.js:46-79`) pode cair
   noutro preset → macro lê outro arquivo `smart_channel_toggler_{outroPreset}.json` → "resetado".
   Nuance: `Ctrl+Shift+R` sozinho preserva `localStorage`; quem apaga as chaves é "limpar dados de navegação /
   esvaziar cache + hard reload" ou limpeza manual. Testar os dois casos separados (ver Verificação).
   `local`/`shared` são pastas **do servidor** (globais a todos browsers), não "deste PC".
5. `get_mod_config` ignora `syncShared` e lê `local` antes de `shared` (`macros.rs:663-688`), enquanto
   `get_slots` respeita a flag (`macros.rs:297-313`). Pior: `save_mod_config:707-717` escreve `local` SEMPRE e
   `shared` só se `syncShared=true` — leitura `local-first` + escrita write-through = `local` zerado/stale
   sombrea `shared` ativo para sempre (caso sombra). `storage.getModConfig` (`core.js:149-153`) hoje nem envia
   a flag — equalar só o servidor não resolve; precisa do lado client (Fase 1 item 1b + Fase 3 item 14).
6. TTL só no client com `Date.now()` (`smart_channel_toggler/main.js:7,26-45`) — dois clients nunca concordam;
   sem enforcement no server e sem `serverNow/updatedAt` no `GET`. Até lá, TTL é best-effort explícito e NUNCA
   pode deletar o servidor por expiração (hoje deleta via item 3 — corrigir junto).
7. Race sem lock: `isExecuting` é closure por aba (`smart_channel_toggler/main.js:8`); `POST` é last-writer-wins
   cego (`core.js:149-163`, sem ETag/CAS). Sem CAS, concorrência de ms é best-effort honesto (Fase 2 item 7).
8. `guard` de desk furado: `smart_channel_toggler/main.js:40` testa `window.serverName !== null` mas ausente
   pré-handshake é `undefined` (`undefined !== null === true`) → invalidação prematura. Gate (`window.*`) e valor
   (`MixerAPI.state`, cujo `getDeskName()` dá fallback `'01V96'` em `core.js:52`) vêm de fontes distintas
   (`smart_channel_toggler/main.js:34-40`). BLOQUEADOR — unificar na Fase 2 item 5.
9. `onSave`/`resetBtn`/`onClear` clobberam snapshot: postam closure stale sem re-GET
   (`smart_channel_toggler/main.js:418-431`, `:291-302`, `:434-443`). BLOQUEADOR — re-GET+merge na Fase 2 item 8.
10. Duplicação `public/` × `public_new/`: servidor só lê/escreve `public/...` (`macros.rs:670,702`) e o ninja-sync
    só enfileira paths `public/...` (`macros.rs:456-464,718-729`); espelhos em `public_new/.../profiles` são
    peso-morto e já divergiram (ex. `public/.../profiles/local` só tem `pcfavela`, `public_new/...` só `pcmaria`).
    `core.js` diverge SÓ no transporte por design (`fetch` vs `window.apiFetch`, `core.js:151,156,169,177`) —
    não copiar o transporte errado; manter diff-gate. Decisão no item 13: deletar espelho, NÃO bridge `themes.rs`.
11. Bônus achados: `public/modules/macros.js:822` (e espelho) chama `loadSlotsManifest()` inexistente
    (é `loadGlobalSlotsManifest:500` — `ReferenceError` a cada `completeMacroMove`, corrigir primeiro);
    fallback `get_hosts` retorna `{match}` mas client lê `h.matches` (`macros.rs:268-271` vs `macros.js:54,400`;
    com `hosts.json` real funciona, sem arquivo cai no fallback morto); `onDelete:446-452` grava literal `"null"`
    (`JSON.stringify(null)`, via `core.js:159`) em vez de deletar — e não existe `DELETE /api/macros/config/{mod}`
    (só `DELETE /slots` e `DELETE /sync`), definir na Fase 3; `save_mod_config` usa `fs::write` não-atômico
    (`macros.rs:711,717`; idem `:449,455,541`) — repo tem `save_json_atomic` em
    `server_rust/src/custom_scenes.rs:939-955`, macros não usam; `delete_slots:472-490` apaga `local+shared` sem
    `enqueue_git_sync`; `swap_slots:521-544` ignora array (`:527`) + `fs::write :541` sem lock.

## Fase 0 (PRIMEIRO item) — Adição agnóstica no servidor: broadcast genérico

Emitir em TODO `save_mod_config`, para qualquer `mod_id`, sem conhecer toggler/preset específico.
O `io` já está disponível no router (`server_rust/src/main.rs:139` + `:235`, `server_rust/src/api/mod.rs:10-18`,
`server_rust/src/api/macros.rs:140-143,180-182`); o transporte socket.io é habilitado em `main.rs:244`
(`.layer(layer)`). Padrão já existe em `custom_scene_history.rs:253-257,336-342`.
Nota: `Extension` já é importado em `macros.rs:3` (hoje inutilizado fora dos `.layer()` de `:181-182`;
a Fase 0 inclusive elimina o warning).

```rust
// server_rust/src/api/macros.rs — sem import novo (usar fully-qualified como na linha 143):
async fn save_mod_config(
    Path(mod_id): Path<String>,
    Query(q): Query<PresetQuery>,
    Extension(io): Extension<socketioxide::SocketIo>, // io já fornecido pelo .layer(Extension(io)) da linha 182; Json continua por último (axum 0.8)
    Json(body): Json<Value>,
) -> Json<Value> {
    // ... corpo inalterado ...
    // DENTRO do `if let Ok(content)` (macros.rs:707), APÓS ambos os writes (:711,:717), ANTES do Json(:732):
    if let Err(e) = io.emit(
        "macro_config_changed",
        &json!({ "mod": mod_id, "preset": preset, "synced": sync_shared, "ts": chrono::Utc::now().timestamp_millis() }),
    ).await {
        tracing::warn!("macro_config_changed emit falhou mod={} preset={}: {}", mod_id, preset, e);
    }
    Json(json!({ "success": true, "mod": mod_id, "preset": preset, "synced": sync_shared }))
}
```

Regras do snippet: emit SÓ no ramo de sucesso (nunca no `else` de `:733-735`); resposta `:732` intacta;
nada no router muda (`Extension(io)` já é injetado via `.layer(Extension(io))` em `:182`, o que significa
que o extractor `Extension<SocketIo>` funciona em qualquer handler sem tocar em `router()`); `ts` é aditivo
(não quebra clients antigos) e alimenta dedupe/backoff da Fase 1 e futuro CAS. Ressalvas honestas: payload
ecoa `mod_id`/`preset` sem o `sanitize_file_name` que `custom_scene_history.rs:29-41` usa (pré-existente,
agravado pelo eco); "emitir sempre" vale enquanto a leitura for `local-first` (`macros.rs:675-686`) —
se o item 14mudar para `shared-first`, reavaliar sino espúrio.
No mesmo PR, trocar `fs::write` (`:711,:717`) por `crate::custom_scenes::save_json_atomic(&path, &body)`
(`body` é `axum::Json<Value>`, que dereferencia para `&Value`; `save_json_atomic` recebe `&impl Serialize`
e `Value: Serialize`, então passar `&*body` ou `&body.0` funciona sem conversão) — elimina `GET` concorrente
lendo JSON truncado. **`save_json_atomic` já é `pub fn` (`custom_scenes.rs:939`) — NÃO precisa de mudança
de visibilidade.**

Efeito: evento é só o "sino" (`mudou mod X do preset Y`); o dado continua vindo pelo `GET` existente.
1 GET por mudança real (ms), em vez de poll por intervalo. Nada no router muda. Falha de emit nunca quebra o POST
(loga em vez de engolir com `let _` puro).

## Fase 1 — Core client (agnóstico, serve a qualquer macro)

Arquivos: `public/modules/macros/core.js` + espelho `public_new/modules/macros/core.js` (manter idênticos;
em `public_new` usar `window.apiFetch`, em `public` usar `fetch` — não copiar o transporte errado; diff-gate).
`macros.js` do host é `public/modules/macros.js` (+ espelho `public_new/modules/macros/macros.js`).

1. `storage.getModConfig` continua o único caminho de leitura. Sem `fetch` direto nas macros.
   a. Transporte: `public_new` usa `window.apiFetch` (definido só em `public_new`, `connection_service.js:88-98`);
      `public` usa `fetch` direto. Adicionar fallback `window.apiFetch || fetch` para não quebrar em race de load
      (`core.js` carregado antes de `connection_service.js`).
   b. Assinar a flag fim-a-fim (pré-requisito do item 14): `storage.getModConfig(modId, { syncShared })` passa
      `&syncShared=` lendo `localStorage macro_sync_shared_{preset}` (espelhar
      `loadGlobalSlotsManifest:502`/`saveGlobalSlotsManifest:524` de `public/modules/macros.js`). Sem isso,
      equalar `get_mod_config` a `get_slots:299-313` no servidor é inócuo.
2. Novo `storage.watch(modId, cb, opts)` genérico, UMA vez no core:
   - Escuta `socket.on('macro_config_changed')` filtrando por `modId + preset` (push, ms).
   - Fallback: poll lento (default 30s, só com aba visível), refetch throttled em `focus`/`visibilitychange`
     (máx 1/5s), reconciliação no reconnect.
   - NUNCA atrelar a `socket 'update'` por-canal (tempestade: corte de 15 canais = 15 updates em ~300ms;
     hash não evita a rede, só o callback).
   - Dedupe por hash do JSON (só chama `cb` se mudou). Coalescing: um poller por `modId::preset`, N callbacks
     (`key → { callbacks:Set, timer, controller, prevHash }`).
   - **Registry de coalescência:** `const __macroWatchRegistry = new Map()` no topo do IIFE de `core.js`
     (ambos `public/` e `public_new/`). Chave: `modId::preset` → `{ callbacks:Set, timer, controller, prevHash }`.
     **NÃO** expor no `window` — mantém encapsulamento.
   - Re-resolver `getPreset()` + URL a cada tick (preset muda via `switchPreset`/`saveAs` sem evento;
     re-resolver base via `window.HostManager.getHttpUrl()` se disponível).
   - **Nota sobre `getPreset()` em load race:** `window.MixerAPI.utils.getPreset()` (`core.js:189`) depende de
     `window.getCurrentMacroPreset()` estar definido. Como `core.js` carrega via `<script>` na `<head>` (antes
     do host definir `window.getCurrentMacroPreset`), `getPreset()` retorna `'default'` até o host inicializar.
     Isso é **aceitável** para o fallback inicial, mas `watch` deve tratar `preset === 'default'` como sinal
     para re-GET forçado (usuário ainda não escolheu preset realmente).
3. Higiene `state`: macro usa SÓ `MixerAPI.state` (`getChannel().name`, `getCurrentScene`, `getDeskName`,
   `isPaired`, `getPairPartner`). Estender `state` para `resolvedNames` ou documentar fallback.
   Formalizar exceções: DOM do próprio modal permitido; estado do mixer, proibido. Prover
   `MixerAPI.ui.closeSettings()` ou formalizar o fechamento do modal.

## Fase 2 — Macro smart_channel_toggler (espelhos idênticos)

Arquivos: `public/modules/macros/smart_channel_toggler/main.js` +
`public_new/modules/macros/smart_channel_toggler/main.js` (464 linhas cada; aplicar igual + diff-gate).

4. `onInit` read-only: GET → valida → `updatePadVisual`. DELETAR o `saveModConfig(reset)` (`main.js:91-98`).
   Expirado renderiza `🛡️ repouso` localmente, sem tocar no servidor. Auditar no mesmo PR `onClear:434-443`
   e **`onDelete:446-452`** (hoje POSTa `null` que vira string literal `"null"` — **PROMOVIDO de Fase 3 para
   Fase 2**: corrigido para `POST {}` em vez de `null`/`JSON.stringify(null)`). Ver item 14d para a rota DELETE.
5. `isSnapshotValid` unificado: mesma fonte (só `MixerAPI.state`) para gate e valor; teste simétrico `== null`
   (cobre `null+undefined`; ausência `scene_id/desk_name == null` = ausência, não invalidação);
   corrigir `main.js:40` (`undefined` hoje fura o guard). Migrar `getChannelName (L68,71)` e botões
   (`L319,363`, hoje lêem `channelStates` nu via `typeof channelStates !== 'undefined'`) para
   `MixerAPI.state.getChannel(i)?.name`.
6. Semântica de expirado = "inválido para restore, preserva guardians": expirado mostra repouso; próximo
   `execute` faz corte NOVO (nunca restore de lista velha; máquina `if(!active)` em `:123` já faz isso).
   Reset real no servidor só em ação explícita (restore OK `:194-206`, `↺ Limpar Memória :291-302`,
   `onClear`/`onDelete`). TTL 12h (`TTL_MS :7`, `now - timestamp :29-30`, `timestamp=Date.now() :164`)
   avaliado no client como best-effort explícito (relógio local; dois clients nunca concordam) até backend
   carimbar `serverNow/updatedAt` (futuro agnóstico) — e NUNCA deletar servidor por expiração.
7. `execute` cooperativo: GET fresco (já existe `:111-119`) e decidir CUT/RESTORE por `isSnapshotValid(fresco)`
   (não pelo stale) → CUT (coleta `ON - guardians` via `state :141-143` + parceiro estéreo `:146-150`, POST
   snapshot, muta com stagger 20ms `:176-179`) ou RESTORE (desmuta só ainda-OFF `:187-188`, POST zerado
   preservando `guardians :194-199`) → **re-GET pós-POST** → `updatePadVisual` com fresco. Ordem POST-antes-de-mutar
   está certa; assumir a janela do stagger (~300ms p/ 15 canais) como race documentada, não inferir estado pelo
   mixer nela. União (`A ∪ B`) SOMENTE em `CUT×CUT` de mesma base; `CUT×RESTORE` resolve por última intenção
   explícita + aviso (`ui.alert`), nunca união cega. Limitação honesta: sem CAS no server, race de ms é best-effort.
8. `onSave`/`resetBtn`/**`onConfigure`**/ unificados: re-GET fresco → mesclar `{guardians: local, snapshot: remoto-fresco}` →
   POST. Regra explícita se snapshot remoto mudou desde `onConfigure` (`:88,:230`): avisar em vez de sobrescrever.
   Vale para `onSave :418-431`, `resetBtn :291-302`, `onClear :434-443` (POST default cego hoje) **e `onConfigure`**
   — abrir o modal de configuração também deve re-GET, senão mostra dados stale de outro client.
9. Assinatura do watch em `onInit` (só após Fase 1 existir — hoje `core.js:147-163` nem expõe `watch`):
   `(latest) => updatePadVisual(slotIndex, latest)` + atualizar banner do modal se aberto (patch incremental,
   sem `innerHTML=''` full-rebuild de `:241` que destrói banner+32 botões, perde foco/scroll e gera churn;
   pintar `isMuted` — hoje `L320` computa e nunca estiliza, e `:332-345`/`updateButtonVisual :360-373` ignoram).
   Definir política local-dirty × remoto-fresco ANTES do watch: edição local de guardians (`:375-403`, in-place
   sem autosave) vence até `onSave`; `latest` remoto só repinta pad+banner, nunca o grid em edição (ou merge
   explícito). `unsubscribe` em `removeMacroFromSlot`/`switchPreset`.
10. Banner diagnóstico: `preset + arquivo efetivo + timestamp/cena/desk` (ex.
    `🔴 CORTE ATIVO · pcmaria (shared) · 13 canais · cena 5`). Se GET → `{}` e preset ≠ `default`:
    `SEM ARQUIVO PARA ESTE PRESET — em repouso`. Sem isso o "preset errado lido como reset" (item 4) continua
    indiagnosticável. Estender `:267-276` (hoje só `🔴/⚪ + N canais`) com `utils.getPreset()`,
    `timestamp→locale`, `scene_id/desk_name`.

## Fase 3 — Higiene agnóstica barata (mesmo PR ou seguinte; ordem importa)

11. `public/modules/macros.js:822` (e espelho): `loadSlotsManifest()` → `loadGlobalSlotsManifest()`.
    Fazer PRIMEIRO — é crash (`ReferenceError`) a cada `completeMacroMove`, não "higiene".
12. `macros.rs:268-271`: fallback `{match}` → `{matches}` (alinhar com `macros.js:54,400` e `hosts.json` real).
13. Espelho `public_new/modules/macros/profiles`: DELETAR (manter só `.gitkeep` se o build exigir) e documentar
    `public/` como SSOT servido pelo Rust. NÃO replicar o bridge `?source=` de `themes.rs:52-57,319,391`
    (dirs `:114-130`, proteção `default.yaml :367-375,440-445`, `sync_direction :557-610`) — pesado, feito para
    YAML com admin-save, não para `local/shared + preset + syncShared`, e o próprio `themes.rs:81,92,394,405`
    usa `fs::write` não-atômico. Se `public_new` precisa rodar standalone, fazer build-step unidirecional
    `public → public_new`, nunca escrita dupla. Alternativa mínima: `.gitignore` + README marcando peso-morto.
14. Preset routing fim-a-fim + writes atômicos + delete definido:
    a. Doc: `local`/`shared` = disco do servidor, não do browser; `local-first` atual (`macros.rs:675-686`) vs
       `shared-first` condicional de `get_slots:299-313`. Só mudar `get_mod_config` para branchar igual
       (`syncShared=true → shared-first`) JUNTO com Fase 1 item 1b (client passando a flag) — servidor sozinho é inócuo.
    b. `detectCurrentPreset` (`public/modules/macros.js:46-79` + espelho): após `:59-64`, validar `saved` contra
       chaves de `GET /api/macros/slots` + normalizar; se desconhecido, descartar e usar `found`. `switchPreset
       :443-459` e `savePresetAs :467-481` já persistem `macro_last_preset`; falta o descarte do stale.
       (Normalização completa `trim/lowercase` geral continua futuro — ver Fora de escopo.)
    c. Trocar os 5 `fs::write` de `macros.rs` (`:449,455,541,711,717`) por `crate::custom_scenes::save_json_atomic`
       (já `pub fn` em `custom_scenes.rs:939` — **não precisa de mudança de visibilidade**). Passar `&*body`
       (dereference `axum::Json<Value>` para `&Value`, que implementa `Serialize`). Usa
       `with_extension("json.tmp")` por arquivo (atomic temp + rename), sem colisão entre `profile_X.json`
       e `mod_preset.json` — cada um tem `.tmp` único por nome base.
       Pontas soltas no mesmo arquivo, corrigir junto: `delete_slots:472-490` sem `enqueue_git_sync` do `shared`;
       `swap_slots:521-544` ignora array (`:527`).

## Verificação

- `cargo check` (Fase 0; sem `build --release` por `AGENTS.md`).
- Manual 2 browsers: A corta → B vê `MUTED` em ms sem reload (conferir `macro_config_changed` no socket);
  B restaura → A volta a `🛡️`; `timestamp` -13h = repouso e próximo toque inicia corte novo; `guardians`
  intactos após expiração.
- Preset/roteamento (prova do item 14): aba Network conferindo `syncShared=` no `GET config` e qual arquivo
  (`local` vs `shared`) responde; caso sombra (criar `local/smart_channel_toggler_{preset}.json` zerado com
  `shared` ativo e mostrar que a leitura correta prevalece); `Ctrl+Shift+R` VS "limpar localStorage + reload"
  como dois casos; banner deve acusar `SEM ARQUIVO PARA ESTE PRESET` quando `GET {}` e preset ≠ `default`.
- Arquivos de prova: `public/modules/macros/profiles/shared/smart_channel_toggler_{preset}.json` (+ `local`).
- Race: A+B clicam juntos → inspecionar `channels_to_restore` final no JSON (união só em `CUT×CUT` mesma base);
  aceitar divergência com aviso em `CUT×RESTORE` — sem CAS é best-effort honesto.
- Move de pad (cobre o `ReferenceError :822`); kill -9 durante POST não deixa JSON truncado (prova do atômico);
  `io.emit` com 0 clients ainda retorna `success:true`.

## Changelog de auditoria externa

As seguintes correções foram aplicadas nesta auditoria:

- **Nota de paths (linha 9-12):** Corrigido "465 linhas" para "198 linhas" em `core.js`;
  especificado que `save_json_atomic` já é `pub fn` (visibilidade não precisa ser alterada);
  corrigido `pub_new` → `public_new` no nome do diretório.
- **Fase 0 (save_json_atomic):** Removida a proposta de "tornar `pub(crate)`" — a função já é `pub fn`
  em `custom_scenes.rs:939` e acessível diretamente.
- **Fase 1 item 1b (getPreset race):** Adicionada nota sobre race de load: `getPreset()` retorna
  `"default"` até `window.getCurrentMacroPreset` estar definido; `watch` deve tratar isso.
- **Fase 1 item 2 (registry):** Especificado onde viverá o `Map` de coalescência — no topo do IIFE
  de `core.js`, não exposto no `window`.
- **Fase 2 item 4 (onDelete):** Promovido de Fase 3 para Fase 2 — POSTar `{}` em vez de `null`
  é um crash de função, não "higiene".
- **Fase 2 item 8 (onConfigure):** Incluído `onConfigure` no re-GET — não apenas `onSave`/`resetBtn`/`onClear`,
  senão abrir o modal mostra dados stale de outro client.
- **Fase 3 item 14c (atomic writes):** Removida referência a "tornar `pub(crate)`";
  adicionado nota sobre passar `&*body` (dereference `axum::Json<Value>` para `&Value`).

## Fora de escopo (futuro)

- `serverNow/updatedAt` agnóstico no `GET` (TTL com relógio do servidor para todas as macros).
- `If-Match`/versão agnóstica no `POST` (CAS para qualquer macro).
- Normalização geral de preset (`trim/lowercase` em todas as rotas, validar contra `GET /api/macros/slots` + `hosts.json`).

> ⛔ REGRA MAIS IMPORTANTE DESTE PROJETO (repetição): NÃO FAZER COMMITS SEM O USUÁRIO PEDIR. E quando
> o usuário pedir um commit, fazer aquele commit e AGUARDAR ele pedir novamente para commitar de novo.
> Nunca commitar em sequência por conta própria, nunca emendar push automático, nunca antecipar o próximo commit.
