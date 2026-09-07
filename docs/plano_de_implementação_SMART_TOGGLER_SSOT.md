# Plano de implementação — Smart Toggler com SSOT no servidor (via Macro API)

> ⛔ REGRA MAIS IMPORTANTE DESTE PROJETO: NÃO FAZER COMMITS SEM O USUÁRIO PEDIR. E quando o usuário
> pedir um commit, fazer aquele commit e AGUARDAR ele pedir novamente para commitar de novo. Nunca
> commitar em sequência por conta própria, nunca emendar push automático, nunca antecipar o próximo commit.

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
   com reload (`macros.rs:690-736`, `main.js:48-64`, `macros.js:671-738`).
3. `onInit` faz escrita corretiva destrutiva: se valida como inválido, dá `POST` de reset e apaga corte válido
   de outro client (`main.js:91-98`).
4. Ctrl+Shift+R não apaga o JSON — apaga `macro_last_preset`/`macro_sync_shared_*` (`macros.js:59,502,524`);
   `detectCurrentPreset` (`macros.js:46-79`) cai noutro preset → macro lê outro arquivo
   `smart_channel_toggler_{outroPreset}.json` → "resetado".
5. `get_mod_config` ignora `syncShared` e lê `local` antes de `shared` (`macros.rs:663-688`), enquanto
   `get_slots` respeita a flag (`macros.rs:297-313`). `local`/`shared` são pastas do servidor (globais).
6. TTL só no client com `Date.now()` (`main.js:7,26-45`) — dois clients nunca concordam; sem enforcement no server.
7. Race sem lock: `isExecuting` é closure por aba (`main.js:8`); `POST` é last-writer-wins cego
   (`core.js:149-162`, sem ETag/CAS).
8. `guard` de desk furado: `main.js:40` testa `!== null` mas ausente pré-handshake é `undefined` → invalidação
   prematura. Gate (`window.*`) e valor (`MixerAPI.state`) vêm de fontes distintas (`main.js:34-40`).
9. `onSave` clobbera snapshot: posta `currentModData` stale sem re-GET (`main.js:418-431`).
10. Duplicação `public/` × `public_new/`: servidor só lê/escreve `public/...` (`macros.rs:670,702`); espelhos em
    `public_new/.../profiles` são peso-morto e já divergiram. `core.js` das duas árvores já divergiu
    (`fetch` vs `window.apiFetch`, `core.js:151,156,169,177`).
11. Bônus achados: `macros.js:822` chama `loadSlotsManifest()` inexistente (é `loadGlobalSlotsManifest`);
    fallback `get_hosts` retorna `{match}` mas client lê `h.matches` (`macros.rs:268-271` vs `macros.js:54`);
    `onDelete:448` grava literal `"null"` em vez de deletar; `save_mod_config` usa `fs::write` não-atômico
    (repo tem `save_json_atomic` em `custom_scenes.rs:939-955`, macros não usam).

## Fase 0 (PRIMEIRO item) — Adição agnóstica no servidor: broadcast genérico

Emitir em TODO `save_mod_config`, para qualquer `mod_id`, sem conhecer toggler/preset específico.
O `io` já está disponível no router (`main.rs:139,235`, `api/mod.rs:10-18`, `macros.rs:140-143,180-182`);
padrão já existe em `custom_scene_history.rs:253-257,336-342`.

```rust
// topo de server_rust/src/api/macros.rs — adicionar:
use socketioxide::SocketIo;

async fn save_mod_config(
    Path(mod_id): Path<String>,
    Query(q): Query<PresetQuery>,
    Extension(io): Extension<SocketIo>, // io já fornecido pelo .layer(Extension(io)) da linha 182
    Json(body): Json<Value>,
) -> Json<Value> {
    // ... corpo inalterado até depois dos writes ...
    let _ = io.emit(
        "macro_config_changed",
        &json!({ "mod": mod_id.clone(), "preset": preset.clone(), "synced": sync_shared }),
    ).await;
    Json(json!({ "success": true, "mod": mod_id, "preset": preset, "synced": sync_shared }))
}
```

Efeito: evento é só o "sino" (`mudou mod X do preset Y`); o dado continua vindo pelo `GET` existente.
1 GET por mudança real (ms), em vez de poll por intervalo. Nada no router muda. `let _` para nunca quebrar o POST.

## Fase 1 — Core client (agnóstico, serve a qualquer macro)

Arquivos: `public/modules/macros/core.js` + espelho `public_new/modules/macros/core.js` (manter idênticos;
em `public_new` usar `window.apiFetch`, em `public` usar `fetch` — não copiar o transporte errado).

1. `storage.getModConfig` continua o único caminho de leitura. Sem `fetch` direto nas macros.
2. Novo `storage.watch(modId, cb, opts)` genérico, UMA vez no core:
   - Escuta `socket.on('macro_config_changed')` filtrando por `modId + preset` (push, ms).
   - Fallback: poll lento (default 30s, só com aba visível), refetch throttled em `focus`/`visibilitychange`
     (máx 1/5s), reconciliação no reconnect.
   - NUNCA atrelar a `socket 'update'` por-canal (tempestade: corte de 15 canais = 15 updates em ~300ms;
     hash não evita a rede, só o callback).
   - Dedupe por hash do JSON (só chama `cb` se mudou). Coalescing: um poller por `modId::preset`, N callbacks.
   - Lifecycle com `unsubscribe` de verdade (padrão `connection_service.js:23-28`): `watch()` idempotente,
     `Map` em escopo de módulo, unsubscribe em `removeMacroFromSlot`/`switchPreset`. Pausa em `hidden`
     (coerente com `app.js:15-28`), `AbortController` por tick, backoff em erro.
   - Re-resolver `getPreset()` + URL a cada tick (preset muda via `switchPreset`/`saveAs` sem evento).
3. Higiene `state`: macro usa SÓ `MixerAPI.state` (`getChannel().name`, `getCurrentScene`, `getDeskName`,
   `isPaired`, `getPairPartner`). Estender `state` para `resolvedNames` ou documentar fallback.
   Formalizar exceções: DOM do próprio modal permitido; estado do mixer, proibido. Prover
   `MixerAPI.ui.closeSettings()` ou formalizar o fechamento do modal.

## Fase 2 — Macro smart_channel_toggler (espelhos idênticos)

Arquivos: `public/modules/macros/smart_channel_toggler/main.js` +
`public_new/modules/macros/smart_channel_toggler/main.js` (465 linhas cada; aplicar igual + diff-gate).

4. `onInit` read-only: GET → valida → `updatePadVisual`. DELETAR o `saveModConfig(reset)` (`main.js:91-98`).
   Expirado renderiza `🛡️ repouso` localmente, sem tocar no servidor.
5. `isSnapshotValid` unificado: mesma fonte (só `MixerAPI.state`) para gate e valor; teste simétrico `== null`;
   corrigir `main.js:40` (`undefined` hoje fura o guard). Migrar `getChannelName (L68,71)` e botões
   (`L319,363`, hoje lêem `channelStates` nu) para `MixerAPI.state`.
6. Semântica de expirado = "inválido para restore, preserva guardians": expirado mostra repouso; próximo
   `execute` faz corte NOVO (nunca restore de lista velha). Reset real no servidor só em ação explícita
   (restore OK, `↺ Limpar Memória`, `onClear`/`onDelete`). TTL 12h avaliado no client (best-effort, relógio
   local) até backend carimbar `serverNow/updatedAt` (futuro agnóstico).
7. `execute` cooperativo: GET fresco → CUT (coleta `ON - guardians` via `state`, POST snapshot, muta com
   stagger 20ms) ou RESTORE (desmuta só ainda-OFF, POST zerado preservando `guardians`) → re-GET pós-POST;
   união (`A ∪ B`) SOMENTE em `CUT×CUT` de mesma base; `CUT×RESTORE` resolve por última intenção explícita
   + aviso, nunca união cega. Limitação honesta: sem CAS no server, race de ms é best-effort.
8. `onSave`/`resetBtn` unificados: re-GET fresco → mesclar `{guardians: local, snapshot: remoto-fresco}` →
   POST. Regra explícita se snapshot remoto mudou desde `onConfigure` (avisar em vez de sobrescrever).
9. Assinatura do watch em `onInit`: `(latest) => updatePadVisual(slotIndex, latest)` + atualizar banner do
   modal se aberto (patch incremental, sem `innerHTML=''` full-rebuild; pintar `isMuted` — hoje `L320`
   computa e nunca estiliza). Definir política local-dirty × remoto-fresco antes do watch.
10. Banner diagnóstico: `preset + arquivo efetivo + timestamp/cena/desk` (ex.
    `🔴 CORTE ATIVO · pcmaria (shared) · 13 canais · cena 5`). Se GET → `{}` e preset ≠ `default`:
    `SEM ARQUIVO PARA ESTE PRESET — em repouso`.

## Fase 3 — Higiene agnóstica barata (mesmo PR ou seguinte)

11. `macros.js:822`: `loadSlotsManifest()` → `loadGlobalSlotsManifest()`.
12. `macros.rs:268-271`: fallback `{match}` → `{matches}`.
13. Decidir destino do espelho `public_new/.../profiles` (deletar ou bridge como `themes.rs` faz).
14. Documentar `local-first` vs `syncShared` (ou um dia igualar `get_mod_config` a `get_slots:299-313`);
    trocar `fs::write` por `save_json_atomic` nas rotas de macros; `onDelete` deletar em vez de gravar `"null"`.

## Verificação

- `cargo check` (Fase 0; sem `build --release` por `AGENTS.md`).
- Manual 2 browsers: A corta → B vê `MUTED` em ms sem reload; B restaura → A volta a `🛡️`;
  Ctrl+Shift+R em B mantém preset (conferir banner) e `MUTED` reaparece; `timestamp` -13h = repouso e próximo
  toque inicia corte novo; `guardians` intactos após expiração.
- Arquivos de prova: `public/.../profiles/shared/smart_channel_toggler_{preset}.json` (+ `local`).
- Race: A+B clicam juntos → sem pad divergente; `channels_to_restore` final cobre a união em `CUT×CUT`.

## Fora de escopo (futuro)

- `serverNow/updatedAt` agnóstico no `GET` (TTL com relógio do servidor para todas as macros).
- `If-Match`/versão agnóstica no `POST` (CAS para qualquer macro).
- Normalização de preset (`trim/lowercase`, validar contra `GET /api/macros/slots` + `hosts.json`).

> ⛔ REGRA MAIS IMPORTANTE DESTE PROJETO (repetição): NÃO FAZER COMMITS SEM O USUÁRIO PEDIR. E quando
> o usuário pedir um commit, fazer aquele commit e AGUARDAR ele pedir novamente para commitar de novo.
> Nunca commitar em sequência por conta própria, nunca emendar push automático, nunca antecipar o próximo commit.
