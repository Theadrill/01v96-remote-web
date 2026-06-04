# Feature 1: Cenas de Nomes Customizados — Análise Técnica

Análise da proposta no [plano_de_features.md](file:///c:/PROJETOS/01v96-remote-web/docs/plano_de_features.md) comparada com a arquitetura real do servidor Rust.

Fundamentada nas regras da skill [rust-skills](file:///c:/PROJETOS/01v96-remote-web/.agents/skills/rust-skills/SKILL.md) (guia com 179 boas práticas para programar em Rust).

---

## Decisões Já Tomadas

| Questão | Decisão |
|---------|---------|
| Onde ficam os JSONs | Pasta `data/custom_scenes/` |
| Ordem de implementação | **V1** (funcionalidade principal + frontend) primeiro, **V2** (sync Git) depois |
| Auto-apply ao trocar de cena | Sempre ativa — pra desativar, é só tirar a atribuição na tela de gerenciamento |

---

## Veredicto Geral

Seu plano está **bem pensado nos dados e no fluxo**. A estrutura dos JSONs, a lógica de busca (ID → nome → default), e a cobertura de canais estão corretas. Porém, encontrei **7 problemas potenciais** que, se não forem tratados antes de programar, vão causar bugs difíceis de achar quando estiver usando de verdade.

---

## ✅ O que está BEM no plano

1. **Formato dos JSONs** — limpo, legível. Se precisar editar na mão, é fácil.
2. **Lógica de busca em cascata** (primeiro busca pelo ID da cena física → depois pelo nome da cena → depois tenta a "default") — robusto, cobre todos os casos.
3. **Comparação inteligente** — só manda comando MIDI pra mesa se o nome realmente mudou. Isso é essencial porque a 01V96 é lenta pra processar MIDI.
4. **Esperar 30ms entre cada comando** — a mesa precisa desse tempo pra digerir um comando antes de receber o próximo. O servidor já faz isso no handler de renomear canal.
5. **Esperar 2 segundos após trocar de cena** — correto, porque quando você troca de cena na mesa, ela manda um "dump" de todos os parâmetros via MIDI, e isso leva uns 2 segundos. Não podemos injetar nomes durante esse processo.

---

## ⚠️ Problemas e Soluções

### Problema 1: Ler/escrever arquivo do disco no meio de uma operação

> **O que o plano diz:** Toda vez que precisar de uma custom scene, lê do disco. Toda vez que salvar, escreve no disco.

**Por que é ruim:** Imagina que o usuário troca de cena na mesa. O servidor precisa carregar o JSON da custom scene do disco. Se o disco estiver lento (antivírus escaneando, USB, etc.), isso atrasa tudo — e aquele delay de 30ms entre comandos MIDI fica irregular, podendo confundir a mesa.

É como se, no Node, toda vez que você fizesse um `fs.readFileSync()` dentro de um loop que precisa ser rápido, o loop "engasga" esperando o disco.

> [!IMPORTANT]
> **Solução: Carregar tudo na memória quando o servidor liga, e trabalhar só na memória.**
>
> Quando o servidor inicia, ele lê todos os JSONs de `data/custom_scenes/` e guarda na memória (como um objeto JavaScript ficaria na RAM). Depois, durante o uso normal, tudo é lido/escrito nessa cópia em memória — rápido, sem esperar disco.
>
> A escrita no disco real acontece "por baixo dos panos", com um delay (tipo um debounce de 1 segundo): se o usuário fizer 5 alterações em 2 segundos, o servidor junta tudo e salva uma vez só.
>
> **Isso já é o padrão do projeto** — o salvamento de nomes dos canais (`save_names_to_disk`) já funciona assim.

---

### Problema 2: Dados da custom scene separados dos dados da mesa

> **O que o plano diz:** O módulo de custom scenes é independente, com suas próprias funções de carregar/salvar.

**Por que é ruim:** Para aplicar nomes customizados, o servidor precisa ler dois conjuntos de dados ao mesmo tempo:
- Os nomes **atuais** de cada canal na mesa (pra saber quais mudaram)
- Os nomes **da custom scene** (pra saber o que aplicar)

Se esses dois conjuntos ficam em "caixas" separadas, existe o risco de que, entre o momento em que você lê um e lê o outro, algo mude — como o usuário renomear um canal exatamente naquele instante. É uma "condição de corrida" (race condition): dois processos tentando acessar/modificar dados ao mesmo tempo.

> [!IMPORTANT]
> **Solução: Colocar a custom scene dentro do mesmo "cofre" que os dados da mesa.**
>
> Em Rust, o servidor usa um sistema chamado `RwLock` que funciona como uma porta de cofre: só uma pessoa pode escrever por vez, mas várias podem ler ao mesmo tempo. Os dados dos canais já estão dentro desse cofre (no `GlobalState`).
>
> A solução é colocar o gerenciador de custom scenes **dentro do mesmo cofre**. Assim, quando o servidor abre o cofre pra ler os nomes dos canais, ele também consegue ler a custom scene na mesma operação — sem risco de algo mudar no meio.

> [!WARNING] **RESSALVA DA REVISÃO — 04/06/2026**
>
> Colocar o `CustomSceneManager` **dentro** do `GlobalState` (mesmo `RwLock`) tem uma consequência importante: qualquer operação que precise escrever no `CustomSceneManager` (ex: `saveCustomName`, `assignCustomScene`) vai **bloquear o `GlobalState` inteiro** durante a operação.
>
> O `CustomSceneManager` tem operações de I/O (salvar JSON no disco), que são lentas. Se isso estiver dentro do `RwLock<GlobalState>`, o lock fica retido por milissegundos preciosos — e o frontend para de responder (faders, mutes, etc.).
>
> **Sugestão alternativa**: `Arc<RwLock<CustomSceneManager>>` **separado** do `GlobalState`. A consistência entre os dois é garantida pelo padrão de **snapshot** (descrito no Problema 6): você tira uma foto dos dados que precisa num lock curto, solta, e trabalha em cima da foto. Isso evita contenção entre o tráfego MIDI intenso e as operações de custom scenes.
>
> ```rust
// GlobalState (no state.rs) — APENAS uma referência
pub struct GlobalState {
    pub custom_scene_manager: Arc<RwLock<CustomSceneManager>>,  // referência, não o struct
    // ... outros campos ...
}

// Em main.rs — criado separadamente
let custom_scene_manager = Arc::new(RwLock::new(CustomSceneManager::load_all("data/custom_scenes/")));
```

---

### Problema 3: Trocar de cena duas vezes rápido

> **O que o plano diz:** Quando troca de cena, espera 2 segundos e depois aplica os nomes customizados um por um (com 30ms entre cada).

**Por que é ruim:** Se a mesa tem 40 canais com nomes diferentes, são 40 comandos × 4 caracteres cada × 30ms = uns 5 segundos. Se o usuário trocar de cena de novo antes desses 5 segundos acabarem, o servidor vai estar mandando nomes da cena **antiga** ao mesmo tempo que deveria estar mandando da **nova**. Resultado: nomes misturados na mesa.

> [!WARNING]
> **Solução: "Token de cancelamento" — como um botão de STOP.**
>
> Funciona assim: quando o servidor começa a aplicar nomes, ele cria um "token" (tipo um sinalizador). Antes de cada comando de 30ms, ele confere se o token ainda está ativo. Se alguém trocar de cena, o token anterior é "cancelado" e um novo é criado.
>
> É como se você tivesse uma fila de impressão e, ao mandar imprimir algo novo, o sistema cancela a impressão anterior automaticamente.

---

### Problema 4: Servidor crasha no meio de um salvamento

> **O que o plano diz:** Salva o JSON diretamente no arquivo.

**Por que é ruim:** Se o servidor for fechado (pelo tray, pela falta de energia, pelo Windows) exatamente durante a escrita do arquivo, o JSON pode ficar "cortado pela metade" — arquivo corrompido, ilegível. Na próxima vez que o servidor abrir, não vai conseguir carregar aquela custom scene.

> [!TIP]
> **Solução: Escrever num arquivo temporário primeiro, depois "trocar" pelo original.**
>
> O truque é simples:
> 1. Escrever o JSON num arquivo chamado `custom_scene.json.tmp`
> 2. Só quando a escrita terminar com sucesso, renomear `.tmp` → `.json`
>
> O sistema operacional garante que o "renomear" é uma operação "tudo-ou-nada" (atômica) — não existe meio-renomeado. Então ou o arquivo é o antigo completo, ou o novo completo. Nunca um corrompido.

---

### Problema 5: Chaves dos canais como texto livre

> **O que o plano diz:** No JSON, os canais são identificados por strings: `"1"`, `"32"`, `"master"`.

**Por que é ruim (em Rust):** Em JavaScript/Node, usar strings como chaves é normal e funciona bem. Mas em Rust, o compilador é muito mais rígido — e a filosofia é aproveitar essa rigidez pra pegar erros antes de rodar o programa.

Se alguém (ou o próprio código) escrever `"mastr"` em vez de `"master"`, ou `"41"` (canal que não existe), o Rust não vai reclamar — é uma string válida. Só vai dar erro quando rodar, e vai ser difícil de achar.

> [!IMPORTANT]
> **Solução: Criar um tipo especial que só aceita valores válidos.**
>
> Em Rust, podemos criar um "tipo personalizado" chamado `ChannelKey` que só pode ser criado a partir de valores válidos (`"1"` a `"40"` ou `"master"`). Se alguém tentar criar um com `"41"` ou `"mastr"`, o código retorna erro imediatamente, no momento em que lê o JSON — em vez de falhar misteriosamente depois.
>
> O JSON continua sendo strings normais (pra você poder editar na mão), mas no momento em que o Rust lê o arquivo, ele valida cada chave.

---

### Problema 6: Servidor "trava" enquanto manda os nomes MIDI

> **O que o plano diz:** Lê os dados da mesa e da custom scene, e depois faz um loop mandando comandos MIDI com 30ms entre cada.

**Por que é ruim:** Em Rust (e em Node também), o servidor é "assíncrono" — ele faz várias coisas ao mesmo tempo. Mas se durante o loop de 30ms × 40 canais = 1.2 segundos, o servidor ficar "segurando a chave do cofre" (o lock do GlobalState), **nenhum outro comando do frontend funciona** durante esse tempo. Fader? Não atualiza. Mute? Não responde. Parece que o app travou.

É como se no Node você fizesse um `while` síncrono de 1.2 segundos dentro do callback de um WebSocket — tudo mais fica parado.

> [!WARNING]
> **Solução: Copiar os dados necessários, soltar a chave, e só depois fazer o loop.**
>
> O fluxo correto é:
> 1. Abre o cofre (lock), copia rapidamente uma "foto" (snapshot) dos nomes atuais e da custom scene (~microsegundos)
> 2. Fecha o cofre (release) — agora outros comandos voltam a funcionar
> 3. Compara a "foto" com a custom scene (sem lock, sem bloquear ninguém)
> 4. Manda os comandos MIDI dos canais que são diferentes (com os 30ms de delay)
>
> O cofre fica aberto por microsegundos em vez de 1.2 segundos.

> [!NOTE] **RELAÇÃO COM O PROBLEMA 2**
>
> Este padrão de snapshot **torna desnecessário** colocar o `CustomSceneManager` dentro do mesmo `RwLock` do `GlobalState`. Se você vai copiar os dados num lock curto e depois trabalhar sem lock, tanto faz se eles estão no mesmo cofre ou em cofres separados — a consistência é garantida pelo snapshot, não pelo lock compartilhado.
>
> **Recomendação**: `CustomSceneManager` em `Arc<RwLock<>>` separado (ver ressalva do Problema 2). Assim você:
> - Abre `GlobalState` → copia nomes dos canais (lock curto) → solta
> - Abre `CustomSceneManager` → copia custom scene (lock curto) → solta
> - Compara os snapshots sem nenhum lock retido
> - Nenhuma outra operação (fader, mute, etc.) fica bloqueada durante todo o processo

---

### Problema 7: Campo `description` no JSON que ninguém usa

> **O que o plano diz:** O JSON da cena individual tem um campo `description: ""`.

**Por que é ruim (mas menor):** Esse campo não é usado em nenhum passo do plano — nem no backend, nem no frontend. Adicionar código e estrutura pra algo que não vai ser usado agora só adiciona complexidade sem benefício.

> [!NOTE]
> **Solução: Não incluir agora. Quando precisar, é fácil adicionar depois.**
>
> Se no futuro quiser adicionar descrições, é só criar o campo na hora. O Rust permite marcar campos como opcionais — assim, JSONs antigos (sem o campo) continuam funcionando normalmente quando o campo for adicionado.

---

### Problema 8: Pipeline `normalize_name` → `to_short_name` incompleto

> **O que o plano diz:** `to_short_name` pega os 4 primeiros caracteres, maiúsculo, preenche com espaços.

**Por que precisa de ajuste:** Se o usuário digitar `"mauricio"`, o `short` vira `"maur"` (minúsculo), mas a mesa espera ASCII maiúsculo. Além disso, o plano fala em "4 primeiros caracteres" mas o SysEx da mesa espera **4 bytes**, não 4 chars — para nomes sem acento (garantido pelo `normalize_name`), é a mesma coisa, mas a diferença precisa ser explícita no código.

> [!IMPORTANT]
> **Solução: Pipeline completo e explícito.**
>
> ```rust
> pub fn normalize_name(input: &str) -> String {
>     input
>         .to_uppercase()              // 1. Maiúsculo primeiro
>         .chars()
>         .map(|c| remove_accent(c))   // 2. Remove acentos
>         .filter(|c| c.is_ascii_alphanumeric() || c.is_ascii_whitespace())
>         .take(10)                    // 3. Trunca em 10 chars
>         .collect()
> }
>
> pub fn to_short_name(name: &str) -> String {
>     let normalized = name.to_uppercase();
>     let truncated: String = normalized
>         .chars()
>         .filter(|c| c.is_ascii_alphanumeric())
>         .take(4)
>         .collect();
>     format!("{: <4}", truncated)  // Padding com espaços à direita
> }
> ```
>
> **Regra:** `short` deve ter **exatamente 4 bytes** (`short.len()` deve ser 4). A mesa não aceita menos que 4 nem mais que 4.

---

### Problema 9: `remove_channel` não limpa o registro quando o arquivo é deletado

> **O que o plano diz:** Se `channels` ficar vazio após `remove_channel`, retorna `true` indicando que o arquivo deve ser deletado.

**Por que é incompleto:** Deletar o arquivo sem remover a entrada do registro faz o registro apontar para um arquivo que não existe. Na próxima vez que o servidor buscar uma custom scene, ele vai tentar carregar um arquivo ausente — e o fallback (default scene) pode nunca ser alcançado porque o registro encontrou uma entrada.

> [!IMPORTANT]
> **Solução: Remover entrada do registro junto com o arquivo.**
>
> O fluxo correto de `remove_channel`:
> 1. Remove `channels[channel_id]`
> 2. Se `channels` ficar vazio:
>    a. Deleta o arquivo JSON
>    b. **Remove a `SceneEntry` correspondente do registro**
>    c. Salva o registro (`persist` com debounce)
>    d. Retorna `true`
> 3. Senão:
>    a. Salva a cena (com o canal removido)
>    b. Retorna `false`

---

### Problema 10: Concorrência entre `saveCustomName` e aplicação automática de cena

> **O que o plano diz:** Quando o usuário salva um nome, chama `build_name_change` e emite `updateName`.

**Por que é perigoso:** Se o usuário editar um nome no frontend **enquanto** o servidor está aplicando os nomes de uma custom scene (loop de 30ms × 40 canais = 1.2s), duas operações estarão disputando o mesmo estado:
- A aplicação de cena está sobrescrevendo nomes baseada no snapshot antigo
- O `saveCustomName` está modificando a custom scene e emitindo `build_name_change`

Resultado: a mesa pode terminar com nomes inconsistentes (parte de uma cena, parte de outra).

> [!WARNING]
> **Solução: Fila serializada de operações + CancellationToken.**
>
> Toda operação que modifica nomes na mesa (aplicar custom scene, `saveCustomName`, `removeCustomName`) deve passar por uma **fila FIFO**. Cada operação recebe um `CancellationToken`. Se uma nova operação chegar, a anterior na fila é cancelada.
>
> ```rust
> // Estrutura conceitual da fila
> struct CustomSceneOpQueue {
>     current_token: CancellationToken,
>     pending_ops: Vec<CustomSceneOp>,
> }
> 
> enum CustomSceneOp {
>     ApplyScene { scene_name: String, scene_id: u8 },
>     SaveCustomName { channel: u8, name: String, short: String },
>     RemoveCustomName { channel: u8 },
> }
> ```

---

### Problema 11: Cache fica obsoleto após Git pull externo

> **O que o plano diz (Passo 7):** No boot, após o pull Git, recarrega o registro e todas as custom scenes em memória.

**Por que é insuficiente:** O Git sync do projeto (`api/macros.rs` → `trigger_git_sync`) é **fire-and-forget**: ele dispara um commit/push e termina. Não há listener que avise quando arquivos foram alterados por um pull externo (ex: outro computador fez push de mudanças). O cache em RAM fica **obsoleto** até o próximo restart do servidor.

> [!IMPORTANT]
> **Solução: Recarga sob demanda via mtime.**
>
> Em vez de tentar detectar mudanças externas (watch de arquivos é complexo no Windows), use uma abordagem lazy:
>
> 1. Armazene o `mtime` (modification time) de cada arquivo quando carregar
> 2. Antes de acessar uma custom scene, compare o `mtime` atual com o armazenado
> 3. Se mudou, recarregue do disco e atualize o cache
>
> ```rust
> struct CachedScene {
>     scene: CustomScene,
>     mtime: SystemTime,
> }
>
> impl CustomSceneManager {
>     pub fn get_scene(&mut self, key: &SceneKey) -> Option<&CustomScene> {
>         let cached = self.cache.get(key)?;
>         let current_mtime = self.get_file_mtime(key)?;
>         if current_mtime != cached.mtime {
>             // Recarregar do disco
>             *cached = self.load_and_cache(key)?;
>         }
>         Some(&cached.scene)
>     }
> }
> ```

---

### Problema 12: ST IN e Master precisam de mapeamento SysEx especial

> **O que o plano diz:** Aplica o nome usando `build_name_change` com o channel ID global.

**Por que precisa de atenção:** A mesa usa coordenadas SysEx **diferentes** para cada tipo de canal. O `protocol.rs:623-635` (`name_channel_mapping`) já implementa esse mapeamento:
- Canais 0-31 → element 4
- ST IN (60-67) → element 23
- Mix (36-43) → element 16
- Bus (44-51) → element 15
- Master (52) → element 18

O código de aplicação de custom scenes **não pode construir o SysEx manualmente**. Deve sempre usar `midi::protocol::build_name_change(...)` que já encapsula esse mapeamento.

> [!TIP]
> **Solução: SEMPRE usar `build_name_change` do protocolo.**
>
> ```rust
> // ✅ Correto: delega o mapeamento para o protocolo
> if let Some(req) = midi::protocol::build_name_change(local_ch as u8, char_index, byte) {
>     scheduler.enqueue(req, 1).await;
> }
> ```
>
> **Não** construir o SysEx manualmente com `vec![0xF0, 0x43, ...]`.

---

### Problema 13: 4 bytes ≠ 4 chars (encoding do `short`)

> **O que o plano diz:** `short` tem 4 caracteres.

**Por que é diferença importante:** Em Rust, `"MUSI".chars().count() == 4` e `"MUSI".len() == 4`. Mas `"MÚSI".len() == 5` (UTF-8). Após `normalize_name` garantir ASCII, isso não é problema — mas o código precisa ser explícito sobre usar **bytes** no SysEx, não chars.

> [!IMPORTANT]
> **Solução: Usar `.bytes().take(4)` em vez de `.chars().take(4)` no momento de montar o SysEx.**
>
> ```rust
> // No código que envia o short para a mesa:
> let short_bytes: Vec<u8> = entry.short.bytes().take(4).collect();
> for (ci, &byte) in short_bytes.iter().enumerate() {
>     if let Some(req) = build_name_change(channel, ci as u8, byte) {
>         scheduler.enqueue(req, 1).await;
>     }
> }
> ```
> Isso é seguro porque `normalize_name` + `to_short_name` garantem que o `short` contém apenas ASCII alfanumérico + espaços (1 byte por char).

---

### Problema 14: Arquivos `.tmp` órfãos de crashes anteriores

> **O que o plano diz (Problema 4):** Escrever em `.tmp`, depois renomear para `.json`.

**Por que precisa de complemento:** Se o servidor crashar **exatamente entre** a escrita do `.tmp` e o rename, um arquivo `.tmp` órfão fica na pasta. Na próxima inicialização, esse `.tmp` não é lido (porque o código só procura `.json`).

> [!TIP]
> **Solução: Limpar `.tmp` órfãos na inicialização.**
>
> ```rust
> // No boot do CustomSceneManager::load_all()
> pub fn load_all(path: &Path) -> Self {
>     // Primeiro: limpar .tmp órfãos de crashes anteriores
>     if let Ok(entries) = fs::read_dir(path) {
>         for entry in entries.flatten() {
>             let path = entry.path();
>             if path.extension().map_or(false, |ext| ext == "tmp") {
>                 let _ = fs::remove_file(&path);
>                 tracing::warn!("🧹 .tmp órfão removido: {:?}", path);
>             }
>         }
>     }
>     // Depois: carregar todos os .json
>     // ...
> }
> ```

---

### Problema 15: `short` não deve ser truncado de `name` diretamente

> **O que o plano diz (Passo 3, item 5):** Ao criar uma custom scene nova, varre os canais e preenche `short` = nome atual (4 chars).

**Por que é problemático:** Se o nome atual na mesa for `"MAUR"` (4 chars), o `short` vira `"MAUR"` — ok. Mas se o usuário depois digitar um `name` longo como `"MAURICIO"`, `to_short_name("MAURICIO")` retorna `"MAUR"` (4 primeiros). O `short` **não** é editável pelo usuário — ele é sempre derivado do `name`. Isso precisa estar explícito.

> [!NOTE]
> **Solução: Documentar que `short` é DERIVADO, não independente.**
>
> O frontend **não** deve enviar `short` separadamente. O `short` é sempre calculado pelo backend via `to_short_name(name)`:
>
> ```rust
> // Handler saveCustomName — recebe apenas channel + name
> let short = to_short_name(&data.name);
> scene.channels.insert(channel_id, ChannelNameEntry {
>     name: data.name,
>     short,  // derivado automaticamente
> });
> ```
>
> Isso elimina a possibilidade de inconsistência (ex: `name = "MAURICIO"` mas `short = "BATE"`).

---

## 📐 Como vai ficar a arquitetura

```mermaid
graph TD
    subgraph COFRE_GLOBAL["GlobalState (dados da mesa)"]
        SM["SceneManager<br/>gerencia cenas da mesa"]
        CH["channels<br/>(faders, mute, EQ, etc)"]
        CSM_REF["CustomSceneManager<br/>— APENAS uma referência<br/>(Arc)"]
    end

    subgraph COFRE_CUSTOM["CustomSceneManager<br/>(Arc<RwLock> SEPARADO)"]
        REG["registro: índice de<br/>quais custom scenes existem<br/>e seus arquivos"]
        CACHE["cache em RAM:<br/>os JSONs de cada<br/>custom scene carregados"]
        MTIME["mtime de cada<br/>arquivo (pra detectar<br/>mudanças externas)"]
        DIRTY["flag dirty:<br/>precisa salvar no disco?"]
        QUEUE["fila de operações:<br/>aplicar cena, salvar nome<br/>(serializada com<br/>CancellationToken)"]
    end

    DISCO["Pasta data/custom_scenes/<br/>arquivos .json no disco"] -->|"Boot: carrega tudo<br/>+ limpa .tmp órfãos"| COFRE_CUSTOM
    COFRE_CUSTOM -->|"Debounce persist:<br/>salva no disco<br/>(temp → rename)"| DISCO
    DISCO -->|"Git pull externo<br/>muda mtime do arquivo"--> COFRE_CUSTOM
    COFRE_CUSTOM -->|"get_scene()<br/>checa mtime,<br/>recarrega se mudou"| DISCO

    TROCA["Usuário troca de cena<br/>na mesa (recallScene)"] -->|"1. Cancela operação anterior<br/>2. Snapshot: copia canais<br/>3. Busca custom scene<br/>4. Solta locks<br/>5. Compara nomes<br/>6. Loop MIDI (30ms)<br/>7. Avisa frontend"| COFRE_CUSTOM

    SALVA["Usuário salva nome<br/>customizado no app"] -->|"Enfileira na fila<br/>serializada (depois<br/>da aplicação de cena)"| COFRE_CUSTOM

    STOP["CancellationToken"] -.->|"Cancela operação anterior<br/>se trocar de cena de novo"| TROCA
    STOP -.->|"Novo token criado<br/>para a nova operação"| SALVA
```

### Os "objetos" que vão existir no código Rust

| Nome | O que é | Onde vive | Equivalente em JS |
|------|---------|-----------|-------------------|
| `ChannelId` | Enum identificando canal: `Input(u8)`, `StIn(u8)`, `Master` | Usado como chave em HashMap | `"1"`, `"33"`, `"master"` |
| `ChannelNameEntry` | Um par nome/abreviação (ex: `"MAURICIO"` / `"MAUR"`). `short` é sempre derivado de `name` | Dentro de `CustomScene` | `{ name: "MAURICIO", short: "MAUR" }` |
| `CustomScene` | Uma cena completa com todos os canais nomeados | Cache em RAM do `CustomSceneManager` | `{ scene_name: "carlos", scene_id: 8, channels: { "1": {...} } }` |
| `CachedScene` | Wrapper: `CustomScene` + `mtime` (para detectar mudanças externas) | Cache em RAM do `CustomSceneManager` | — |
| `SceneEntry` | "A cena física #8 usa o arquivo X" | Dentro de `CustomSceneRegistry` | `{ physical_scene: "carlos", physical_id: 8, file: "..." }` |
| `CustomSceneRegistry` | Índice geral — lista de `SceneEntry` | Cache em RAM do `CustomSceneManager` | `{ mesa_nome: "igreja", scenes: [...] }` |
| `CustomSceneManager` | Gerencia cache, fila de ops, persistência, detecção de stale cache | `Arc<RwLock<CustomSceneManager>>` **separado** do `GlobalState` | class com métodos |
| `CustomSceneOpQueue` | Fila serializada de operações com `CancellationToken` | Dentro de `CustomSceneManager` | — |

### O que o `CustomSceneManager` sabe fazer

| Ação | O que faz | Acessa disco? |
|------|-----------|---------------|
| `load_all` | Quando o servidor liga, limpa `.tmp` órfãos, lê todos os JSONs da pasta e guarda em cache com `mtime` | Sim (só no boot) |
| `get_scene(key)` | Busca uma custom scene no cache. Se `mtime` mudou (Git pull externo), recarrega do disco | Sim (sob demanda, lazy) |
| `find_for_physical` | Busca a custom scene certa pra uma cena física (ID → nome → default). Usa `get_scene` internamente | Sim (se cache stale) |
| `upsert_channel` | Cria ou atualiza o nome de um canal numa custom scene. `short` é derivado de `name` automaticamente | Não |
| `ensure_entry` | Garante que o registro sabe que a cena X usa o arquivo Y | Não |
| `create_scene_from_state` | Cria uma custom scene nova copiando os nomes atuais da mesa | Não |
| `remove_channel` | Remove um canal. Se `channels` ficar vazio, remove entrada do registro + marca arquivo pra deletar | Não |
| `remove_scene_entry` | Remove `SceneEntry` do registro quando o arquivo é deletado | Não |
| `list_scenes` | Lista todas as custom scenes pro frontend mostrar | Não |
| `enqueue_op(op)` | Enfileira uma operação na fila serializada, cancelando a anterior | Não |
| `persist` | Salva no disco as scenes que foram modificadas (temp → rename atômico) | Sim (com debounce) |
| `rename_mesa(old, new)` | Renomeia todos os arquivos de `old` para `new` (usado no `renameServer`) | Sim |

### Fila de operações (`CustomSceneOpQueue`)

Toda operação que modifica estado na mesa (aplicar cena, salvar nome, remover nome) passa por esta fila:

```
[ entrada ] → [ CancellationToken anterior é cancelado ]
             → [ Nova operação é spawnada com novo token ]
             → [ Snapshot dos dados (lock curto) ]
             → [ Solta locks ]
             → [ Executa loop MIDI com 30ms entre comandos ]
             → [ Se token for cancelado durante o loop, aborta ]
```

### Funções auxiliares

| Função | O que faz | Mudanças do plano original |
|--------|-----------|---------------------------|
| `normalize_name("MÚSICA!")` → `"MUSICA"` | Maiúsculo, remove acentos, símbolos, trunca 10 chars | `to_uppercase()` **antes** de filtrar |
| `to_short_name("MAURICIO")` → `"MAUR"` | Primeiros 4 **bytes**, maiúsculo, padding com espaços | Sempre derivado de `name`, nunca enviado pelo frontend |
| `save_json_atomic(path, data)` | Salva em `.tmp`, depois `rename` para `.json` | + limpeza de `.tmp` órfãos no boot |
| `cleanup_orphan_tmp(path)` | Remove arquivos `.tmp` deixados por crashes | **NOVO** |

---

## Arquivos que vão ser criados/modificados

### Novos
| Arquivo | O que é |
|---------|---------|
| `server_rust/src/custom_scenes.rs` | O módulo inteiro de custom scenes (structs + gerenciador + funções + testes) |
| `data/custom_scenes/` | Pasta criada automaticamente na primeira vez que rodar |
| `public/modules/custom_scenes.js` | Tela de gerenciamento no frontend |

### Modificados
| Arquivo | O que muda |
|---------|------------|
| [main.rs](file:///c:/PROJETOS/01v96-remote-web/server_rust/src/main.rs) | Registrar o novo módulo + carregar custom scenes no boot |
| [state.rs](file:///c:/PROJETOS/01v96-remote-web/server_rust/src/state.rs#L126-L140) | Adicionar o `CustomSceneManager` dentro do `GlobalState` |
| [socket_handlers.rs](file:///c:/PROJETOS/01v96-remote-web/server_rust/src/socket_handlers.rs) | 5 novos handlers de WebSocket: salvar, remover, listar, atribuir, preview |
| [socket_handlers.rs (recallScene)](file:///c:/PROJETOS/01v96-remote-web/server_rust/src/socket_handlers.rs#L351-L395) | Integrar a aplicação de nomes customizados na troca de cena |
| [sidebar.js](file:///c:/PROJETOS/01v96-remote-web/public/modules/sidebar.js#L254-L323) | Checkbox "Criar nome customizado" no modal de edição de nome |
| [socket.js](file:///c:/PROJETOS/01v96-remote-web/public/modules/socket.js) | Novos listeners de WebSocket para custom scenes |
| [index.html](file:///c:/PROJETOS/01v96-remote-web/public/index.html) | Novo modal de gerenciamento + indicador visual de custom scene ativa |
| [state.rs](file:///c:/PROJETOS/01v96-remote-web/server_rust/src/state.rs#L126-L140) | Adicionar `custom_scene_manager: Arc<RwLock<CustomSceneManager>>` como campo **referência** (não o struct inteiro) |
| [Cargo.toml](file:///c:/PROJETOS/01v96-remote-web/server_rust/Cargo.toml) | Duas novas dependências: `tokio-util` (pro CancellationToken) e `unicode-normalization` (pra tirar acentos) |

---

## Como vamos testar

### Testes automáticos (o compilador roda sozinho)
- `normalize_name` e `to_short_name` com casos extremos (acentos, emojis, strings vazias, padding)
- `to_short_name` com nome curto ("AX" → "AX  ") e nome longo ("MAURICIO" → "MAUR")
- `normalize_name` garante ASCII (acentos removidos, símbolos removidos)
- `ChannelId` — parse de string válida ("1", "40", "master") e inválida ("0", "41", "mastr", "")
- O gerenciador de custom scenes: carregar, buscar, atualizar, remover
- O salvamento seguro (simular crash via `.tmp` órfão)
- `remove_channel` com deleção de arquivo + remoção de registro
- A cascata de busca: ID → nome → default → nenhuma
- Cancelamento de operação (CancellationToken)
- Cache stale: simular mudança de `mtime` e verificar recarga

### Testes manuais (você na mesa + app)
- Trocar de cena na mesa → nomes customizados aplicados (só os que mudaram)
- Trocar de cena 2x rápido → a primeira aplicação é cancelada, só a segunda roda
- Editar nome com checkbox marcada → JSON criado/atualizado na pasta `data/custom_scenes/`
- Editar nome com checkbox marcada → `short` é sempre derivado de `name`
- Desmarcar checkbox → comportamento normal de 4 caracteres pra mesa
- Matar o servidor durante um salvamento → JSON não fica corrompido
- Matar o servidor durante salvamento → na próxima inicialização, `.tmp` é limpo
- Tela de gerenciamento → listar, atribuir cena, ver preview com tabela comparativa
- Remover último canal customizado → arquivo JSON é deletado + registro é limpo
- Git pull externo → cache é recarregado na próxima consulta (mtime)
