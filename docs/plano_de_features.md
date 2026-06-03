# Plano de Features

Guia de implementação passo a passo para agentes de IA.

---

## Feature 1: Cenas de Nomes Customizados

Permite criar e vincular cenas de nomes customizados (até 10 caracteres) às
cenas físicas da mesa (limite de 4 caracteres), com sincronização via Ninja
Sync e comparação inteligente para minimizar tráfego MIDI.

| Local           | Limite         | Exemplo      |
|-----------------|----------------|--------------|
| Mesa (hardware) | 4 caracteres   | `MAUR`       |
| App (interface) | 10 caracteres  | `MAURICIO`   |

### Estrutura de dados

#### Registro central: `custom_names_scenes-{nome_da_mesa}.json`

```json
{
  "mesa_nome": "igreja-central",
  "scenes": [
    {
      "physical_scene": "carlos",
      "physical_id": 8,
      "file": "custom_names_scene-carlos-igreja-central.json"
    }
  ]
}
```

| Campo                      | Tipo   | Descrição                              |
|----------------------------|--------|----------------------------------------|
| `mesa_nome`                | string | Nome do servidor (vindo do `.env`)     |
| `scenes[].physical_scene`  | string | Nome da cena física na mesa            |
| `scenes[].physical_id`     | number | ID da cena na mesa (1-99)              |
| `scenes[].file`            | string | Arquivo JSON com os nomes customizados |

#### Cena individual: `custom_names_scene-{nome}-{nome_da_mesa}.json`

```json
{
  "scene_name": "carlos",
  "scene_id": 8,
  "description": "",
  "channels": {
    "1":  { "name": "MAURICIO", "short": "MAUR" },
    "2":  { "name": "VIOLAO",   "short": "VIOL" },
    "32": { "name": "BATERIA",  "short": "BATE" },
    "33": { "name": "ST IN 1",  "short": "ST1 " },
    "35": { "name": "ST IN 2",  "short": "ST2 " },
    "37": { "name": "ST IN 3",  "short": "ST3 " },
    "39": { "name": "ST IN 4",  "short": "ST4 " },
    "master": { "name": "MASTER", "short": "MAST" }
  }
}
```

| Chave      | Cobertura                 |
|------------|---------------------------|
| `1` a `32` | Canais mono (inputs 1-32) |
| `33`       | ST IN 1 L                 |
| `34`       | ST IN 1 R                 |
| `35`       | ST IN 2 L                 |
| `36`       | ST IN 2 R                 |
| `37`       | ST IN 3 L                 |
| `38`       | ST IN 3 R                 |
| `39`       | ST IN 4 L                 |
| `40`       | ST IN 4 R                 |
| `master`   | Canal master              |

> O JSON usa índice baseado em 1 (canal 1 = primeiro canal físico). A mesa
> usa índice baseado em zero. Conversão: `json_id = mesa_channel + 1`.

#### Cena default: `custom_names_scene-default-{nome_da_mesa}.json`

Mesmo formato da cena individual. Atua como fallback: qualquer cena física
sem custom scene própria herda os nomes da default.

---

### Passo 1: Módulo Rust de custom scenes

**Onde:** `server_rust/src/custom_scenes.rs` (novo arquivo)

Módulo responsável por todas as operações de leitura, escrita e
sincronização dos arquivos JSON de custom scenes. Deve conter:

1. **`struct CustomSceneRegistry`** — representa `custom_names_scenes-{nome}.json`
   - Campos: `mesa_nome: String`, `scenes: Vec<SceneEntry>`
   - `SceneEntry`: `physical_scene: String`, `physical_id: u8`,
     `file: String`

2. **`struct CustomScene`** — representa `custom_names_scene-{nome}-{mesa}.json`
   - Campos: `scene_name: String`, `scene_id: u8`,
     `channels: HashMap<String, ChannelNameEntry>`
   - `ChannelNameEntry`: `name: String`, `short: String`

3. **`fn load_registry(mesa_nome: &str) -> CustomSceneRegistry`**
   - Carrega `custom_names_scenes-{mesa_nome}.json` do disco.
   - Se não existir, retorna registro vazio.

4. **`fn save_registry(mesa_nome: &str, registry: &CustomSceneRegistry)`**
   - Salva o registro no disco.

5. **`fn load_scene(filename: &str) -> Option<CustomScene>`**
   - Carrega uma cena individual do disco.
   - Se o arquivo não existir ou estiver mal formatado, loga erro e retorna
     `None`.

6. **`fn save_scene(filename: &str, scene: &CustomScene)`**
   - Salva a cena individual no disco.
   - Usa `serde_json::to_string_pretty` para facilitar edição manual.

7. **`fn find_scene_for_physical(registry: &CustomSceneRegistry, physical_id: u8, physical_scene: &str, mesa_nome: &str) -> Option<CustomScene>`**
   - Ordem de busca (primeiro match vence):
     1. `physical_id` no registro.
     2. `physical_scene` no registro.
     3. Tenta `custom_names_scene-default-{mesa_nome}.json`.
     4. Nenhum encontrado: retorna `None`.

8. **`fn ensure_registry_entry(registry: &mut CustomSceneRegistry, physical_scene: &str, physical_id: u8, file: &str)`**
   - Se já existe entrada com mesmo `physical_id`, atualiza `file`.
   - Senão, adiciona nova entrada.

9. **`fn remove_channel(scene: &mut CustomScene, channel_id: &str)`**
   - Remove `channels[channel_id]` da cena.
   - Se `channels` ficar vazio, retorna `true` (indica que o arquivo deve ser
     deletado).

10. **`fn normalize_name(input: &str) -> String`**
    - Converte para maiúsculo.
    - Remove acentos (substitui por equivalente sem acento).
    - Remove símbolos especiais.
    - Trunca em 10 caracteres.

11. **`fn to_short_name(name: &str) -> String`**
    - Pega os 4 primeiros caracteres, maiúsculo.
    - Se menor que 4, preenche com espaços à direita.

**Verificação:** Teste unitário para cada função pública.

---

### Passo 2: Integração com troca de cena da mesa

**Onde:** `server_rust/src/state.rs` e `server_rust/src/midi/protocol.rs`

Quando o servidor detecta que uma cena física foi carregada (evento
`PhysicalSceneRecall` ou mudança de `SceneNumber` no `apply_midi`):

1. Adicione um callback/hook no `GlobalState` que é chamado quando
   `scene_number` muda para um valor > 0. O callback:
   a. Aguarda 2 segundos (tempo para o dump MIDI da cena terminar).
   b. Lê `SERVER_NAME` do `.env`.
   c. Chama `load_registry(mesa_nome)`.
   d. Chama `find_scene_for_physical(...)` para localizar a custom scene.
   e. Se encontrada, itera sobre `scene.channels` e para cada canal:
      - Lê o nome atual da mesa via `self.channels.get(&local_ch).name_chars`.
      - Compara com `entry.short` (4 primeiros caracteres da custom scene,
        maiúsculo, com espaços).
      - Se diferente, emite `build_name_change(local_ch, char_index, code)`.
      - Delay de 30ms entre comandos para não sobrecarregar a mesa.
   f. Emite evento Socket.io `"customSceneLoaded"` para o frontend com
      `{ active: true, scene_name: "...", mesa_nome: "..." }`.

2. Casos de borda:
   - Canal do JSON não encontrado no `self.channels`: pula (não altera).
   - JSON mal formatado: loga erro, encerra sem alterar nomes.
   - Nome `short` menor que 4 chars: preenche com espaços (ex: `"AX"` →
     `"AX  "`).
   - `physical_id` é a chave principal de matching; `physical_scene` é
     fallback.

**Verificação:** Trocar cena na mesa, verificar que os nomes customizados
são aplicados apenas nos canais divergentes. Logs mostram quais canais foram
alterados e quais foram pulados.

---

### Passo 3: Salvamento de nome customizado

**Onde:** `server_rust/src/socket_handlers.rs` — novo handler ou extensão do
handler `updateName`

Modifique ou crie um handler para o evento `"saveCustomName"` que o frontend
emitirá ao salvar um nome com a checkbox "Criar nome customizado" marcada.

**Dados recebidos do frontend:**
```json
{
  "channel": 2,
  "name": "MAURICIO",
  "short": "MAUR"
}
```

**Handler:**

1. Lê `sceneName` e `sceneNumber` do `GlobalState`.
2. Extrai o nome base da cena:
   - Se `sceneName` contém `" - "`, usa o texto após o primeiro `" - "`.
   - Senão, usa o nome completo.
3. Determina o nome do arquivo:
   `custom_names_scene-{nome_base}-{SERVER_NAME}.json`.
4. Verifica se o `.env` tem `SERVER_NAME`. Se não, retorna erro exigindo
   cadastro (Feature 2).
5. Carrega ou cria `CustomScene`:
   - Se o arquivo já existe, carrega.
   - Se não, varre `GlobalState.channels` (índices 0-39) e `master`,
     coleta os nomes atuais de 4 caracteres de cada canal, e preenche o
     `channels` com `name` = nome atual e `short` = nome atual.
6. Atualiza `channels["{channel}"]` com os novos `name` e `short`.
7. Salva a cena no disco.
8. Carrega o registro, chama `ensure_registry_entry(...)` com
   `physical_scene`, `physical_id` e `file`, salva o registro.
9. Se `short != nome atual na mesa`, emite `build_name_change` para a mesa.
10. Emite `"updateName"` para todos os clientes com o `name` completo.

**Verificação:** Editar nome de um canal com checkbox marcada, verificar que
o arquivo JSON é criado/atualizado corretamente e o registro é mantido.

---

### Passo 4: Frontend — Modal de edição de nome

**Onde:** `public/modules/events.js` e `public/modules/channel_strip.js`

Extenda o fluxo existente de edição de nome. Atualmente, ao clicar no nome
do canal, o sistema já está preparado para edição. Adicione:

1. **Checkbox "Criar nome customizado":**
   - Renderizada abaixo do input de nome no modal de edição.
   - Desmarcada por padrão.
   - Ao marcar:
     - O atributo `maxlength` do input muda de 4 para 10.
     - O preview em tempo real aparece abaixo do input:
       ```
       <div id="namePreview">
         <span>App: MAURICIO</span>
         <span>Mesa: MAUR</span>
       </div>
       ```
     - Aplica validação em tempo real:
       - Remove acentos automaticamente (`normalize_name` no frontend,
         espelhando a lógica do Rust).
       - Remove símbolos especiais.
       - Borda do input fica vermelha se houver caracteres inválidos.
   - Ao desmarcar:
     - Se o nome atual tem > 4 chars, trunca para 4.
     - `maxlength` volta a 4.
     - Preview some.

2. **Preview em tempo real:**
   - Evento `oninput` no campo de nome.
   - Linha "App" mostra o nome normalizado (até 10 chars).
   - Linha "Mesa" mostra os 4 primeiros caracteres, maiúsculo, com espaços
     se necessário.

3. **Botão "Remover nome customizado":**
   - Visível apenas se o canal atual já tem uma entrada na custom scene
     da cena física ativa.
   - Ao clicar, emite `"removeCustomName"` para o servidor com
     `{ channel: id }`.
   - O servidor remove a chave do JSON. Se o JSON ficar vazio, deleta o
     arquivo e remove do registro.

4. **Fluxo de salvamento:**
   - Se checkbox desmarcada: fluxo legado (`updateName`).
   - Se checkbox marcada: emite `"saveCustomName"` com `channel`, `name`
     (normalizado, até 10 chars), e `short` (4 chars).

**Verificação:**
- Digitar "MÚSICA!" → App mostra "MUSICA", Mesa mostra "MUSI".
- Desmarcar checkbox com nome "MAURICIO" → input trunca para "MAUR".
- Salvar com checkbox desmarcada → nome de 4 chars vai para a mesa (fluxo
  legado).
- Salvar com checkbox marcada → arquivo JSON criado/atualizado, nome de 4
  chars enviado para a mesa.

---

### Passo 5: Frontend — Tela de gerenciamento

**Onde:** `public/modules/custom_scenes.js` (novo) + HTML/CSS

Nova tela acessível pelo menu principal. Exibe a lista de custom scenes e
permite atribuí-las a cenas físicas.

1. **Lista de cenas:**
   - Emite `"listCustomScenes"` para o servidor.
   - Servidor retorna `{ scenes: [{ name, file, physical_scene, physical_id, modified }] }`.
   - Exibe cada cena com: nome, cena física vinculada (se houver), data de
     modificação.

2. **Modal de atribuição:**
   - Ao clicar em uma custom scene, abre modal.
   - Mostra lista de cenas físicas detectadas na mesa (obtidas do
     `SceneManager`).
   - O usuário seleciona uma (radio button, seleção única).
   - Botões **Confirmar** e **Cancelar**.
   - Ao confirmar, emite `"assignCustomScene"` com
     `{ file, physical_id, physical_scene }`.

3. **Handler `"assignCustomScene"` no servidor:**
   - Carrega o registro, chama `ensure_registry_entry(...)`, salva.
   - Responde com `{ success: true }`.

4. **Tabela de comparação (dentro do modal de detalhes):**
   - Ao clicar em "Ver detalhes" em uma custom scene, abre sub-modal com
     tabela de 3 colunas: Canal | Nome Customizado | Nome Atual na Mesa.
   - Linhas com nomes divergentes: fundo amarelo.
   - Dados obtidos via evento `"previewCustomScene"` — o servidor carrega a
     cena e retorna `{ channels: { "1": { name, short, mesa_name }, ... } }`
     com o nome atual de cada canal lido do `GlobalState`.

**Verificação:** Listar cenas, atribuir uma a uma cena física, ver detalhes
com tabela de comparação, confirmar que a atribuição persiste após reload.

---

### Passo 6: Backend — Renomeação de servidor

**Onde:** `server_rust/src/socket_handlers.rs` — handler `"renameServer"`

Handler que propaga a renomeação do servidor para todos os arquivos de
custom scenes:

1. Recebe `{ old_name: "casa-antiga", new_name: "casa-nova" }`.
2. Valida `new_name` (mesmas regras de 2.3.3).
3. Carrega `custom_names_scenes-{old_name}.json`.
4. Para cada `scene` no registro:
   a. Lê o arquivo `{scene.file}`.
   b. Atualiza `scene_name` e `scene_id` se necessário.
   c. Salva com o novo nome:
      `custom_names_scene-{scene.physical_scene}-{new_name}.json`.
   d. Atualiza `scene.file` no registro para o novo nome.
   e. Remove o arquivo antigo.
5. Salva o registro como `custom_names_scenes-{new_name}.json`.
6. Remove o registro antigo.
7. Atualiza o `.env` com `SERVER_NAME={new_name}`.
8. Se existir `custom_names_scene-default-{old_name}.json`, renomeia para
   `custom_names_scene-default-{new_name}.json`.

**Verificação:** Renomear servidor, verificar que todos os arquivos foram
renomeados e o registro atualizado.

---

### Passo 7: Integração Ninja Sync

**Onde:** `server_rust/src/network/sync_manager.rs` ou módulo existente de
Git sync

Adicione os arquivos de custom scenes ao fluxo de auto push/pull:

1. **Pull:** na inicialização do servidor, após o pull Git, recarrega o
   registro e todas as custom scenes em memória (cache para acesso rápido).
2. **Push:** após qualquer `save_scene`, `save_registry`, ou
   `remove_channel` (com deleção de arquivo), agenda um commit e push.
   - Use debounce de 5 segundos (acumula múltiplas alterações em um único
     commit).
   - Mensagem de commit: `"custom_scenes: update {filename}"`.

**Verificação:** Criar uma custom scene, verificar que após 5s o Git push é
executado. Em outro dispositivo, fazer pull e verificar que a cena aparece.

---

### Passo 8: Frontend — Indicador visual de custom scene ativa

**Onde:** `public/modules/custom_scenes.js` e sidebar/header HTML

Quando uma custom scene está carregada (evento `"customSceneLoaded"`),
exiba um indicador visual (ícone, badge ou texto) na interface.

> **IMPORTANTE:** O local exato do indicador **deve ser perguntado ao
> usuário** antes da implementação. Esta é a última etapa — implemente
> somente após receber a resposta do usuário sobre o posicionamento.

**Verificação:** Carregar uma custom scene, verificar que o indicador
aparece. Trocar para uma cena sem custom scene, verificar que o indicador
some.

---

## Feature 2: Atribuição de Nome ao Servidor/Mesa

Sistema de cadastro que identifica unicamente cada servidor/mesa. O nome e a
senha ficam no `.env` e são usados para vincular configurações (como custom
scenes) a uma mesa específica.

### Passo 1: Backend — Detecção e validação do `.env`

**Onde:** `server_rust/src/config.rs` (estender módulo existente)

1. **`fn detect_env_status() -> EnvStatus`:**
   - Retorna enum: `Complete`, `MissingPassword`, `MissingName`,
     `MissingBoth`, `NotFound`.
   - `NotFound`: arquivo `.env` não existe na raiz do projeto.
   - `MissingPassword`: arquivo existe mas `SERVER_PASSWORD` está ausente
     ou vazio.
   - `MissingName`: arquivo existe mas `SERVER_NAME` está ausente ou vazio.
   - `MissingBoth`: ambos ausentes.
   - `Complete`: tudo presente.

2. **`fn validate_server_name(name: &str) -> Result<(), String>`:**
   - Mínimo 3, máximo 30 caracteres.
   - Apenas letras minúsculas, números e hífen.
   - Sem espaços, acentos ou símbolos.

3. **`fn validate_password(password: &str) -> Result<(), String>`:**
   - Exatamente 4 dígitos numéricos (0-9).

4. **`fn save_env(name: &str, password: &str)`:**
   - Cria ou atualiza o `.env` com `SERVER_NAME={name}` e
     `SERVER_PASSWORD={password}`.

5. **`fn load_server_name() -> Option<String>`:**
   - Lê `SERVER_NAME` do `.env`.

6. **`fn load_password() -> Option<String>`:**
   - Lê `SERVER_PASSWORD` do `.env`.

**Verificação:** Testar cada cenário de `detect_env_status` com `.env`
presente, ausente, e com campos faltando.

---

### Passo 2: Backend — Bloqueio de acesso ao modo Técnico

**Onde:** `server_rust/src/main.rs` ou `server_rust/src/socket_handlers.rs`

Na conexão do cliente, após a splash screen:

1. O frontend emite `"checkSetupStatus"` ao conectar.
2. O servidor responde com `{ env_status: "complete" | "missing_password" | "missing_name" | "missing_both" | "not_found" }`.
3. O servidor armazena o status em memória.
4. Qualquer evento que exija modo Técnico (`control`, `setPan`, etc.) é
   rejeitado com erro se o status não for `"complete"`.

**Verificação:** Remover o `.env`, conectar, verificar que comandos de
controle são rejeitados.

---

### Passo 3: Frontend — Tela de cadastro

**Onde:** `public/index.html` e `public/modules/setup.js` (novo)

Tela exibida na splash screen após clicar em **TÉCNICO** quando o cadastro
é necessário.

1. **Estrutura HTML:**
   - Container centralizado com título "CONFIGURAÇÃO INICIAL DO SERVIDOR".
   - Campo de texto para nome do servidor.
   - Campo de senha (type="password", 4 dígitos).
   - Campo de confirmação de senha.
   - Botão **CONTINUAR**.

2. **Comportamento do campo de nome:**
   - Placeholder inicial: `ex: mesa-do-joao` (texto cinza).
   - Ao clicar no input, o placeholder é removido e o campo fica em branco.
   - Se o usuário não digitar nada e clicar em **CONTINUAR**, o sistema
     exibe erro `"Digite um nome para o servidor"`, foca no input, e não
     avança.
   - O campo é obrigatório.

3. **Comportamento do campo de senha:**
   - `maxlength="4"`, `inputmode="numeric"`, `pattern="[0-9]{4}"`.
   - Confirmação deve ser idêntica.

4. **Validação no frontend (antes de enviar):**
   - Nome do servidor: mesma validação do backend (mínimo 3, máximo 30,
     letras minúsculas, números, hífen).
   - Senha: exatamente 4 dígitos.
   - Confirmação igual à senha.

5. **Envio:**
   - Emite `"setupServer"` com `{ name, password }`.
   - Servidor valida, salva o `.env`, responde `{ success: true }`.
   - Frontend redireciona para a tela principal de mixagem.
   - Se falhar, exibe mensagem de erro.

6. **Cadastro parcial:**
   - Se o `.env` já existe mas falta algum campo (ex: senha definida mas
     sem nome), a tela mostra apenas o campo faltante.
   - Campos já preenchidos aparecem como texto somente leitura.

**Verificação:** Apagar `.env`, abrir app, clicar em TÉCNICO, preencher
formulário, confirmar que `.env` foi criado e a tela principal abre.
Testar também com dados inválidos e campos faltantes.

---

### Passo 4: Frontend — Exibição do nome na sidebar

**Onde:** `public/modules/sidebar.js` e `public/index.html`

1. Ao carregar a interface, emita `"getServerName"` para obter o
   `SERVER_NAME` do `.env.
2. Substitua o texto **01V96** na sidebar pelo `SERVER_NAME`.
3. Se `SERVER_NAME` não existir, mantenha **01V96**.

**Verificação:** Com `.env` definido, a sidebar mostra o nome do servidor.
Sem `.env`, mostra "01V96".

---

### Passo 5: Frontend + Backend — Configurações e reset

**Onde:** `public/modules/settings.js` (estender ou criar) e
`server_rust/src/socket_handlers.rs`

1. **Tela de configurações:**
   - Adicione seção "Servidor" com:
     - Campo para editar `SERVER_NAME`.
     - Botão **Resetar configuração**.

2. **Handler `"renameServer"` no backend:**
   - Já descrito no Passo 6 da Feature 1 (renomeação propaga para custom
     scenes).
   - Se não houver custom scenes, apenas atualiza o `.env`.

3. **Handler `"resetConfig"` no backend:**
   - Apaga o arquivo `.env`.
   - Emite `"configReset"` para o frontend.
   - Frontend redireciona para a splash screen.

**Verificação:** Alterar nome nas configurações, verificar `.env`
atualizado. Clicar em reset, verificar que `.env` foi removido e splash
screen reaparece.

---

### Passo 6: Segurança

1. Adicione `.env` ao `.gitignore` do projeto.
2. O `SERVER_NAME` pode ser versionado (não contém senha).

**Verificação:** `git status` não mostra `.env` como arquivo modificado.
