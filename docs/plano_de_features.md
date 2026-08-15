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

- [x] Passo 1: Módulo Rust de custom scenes
- [x] Passo 2: Integração com troca de cena da mesa
- [x] Passo 3: Salvamento de nome customizado
- [x] Passo 4: Frontend — Modal de edição de nome
- [x] Passo 5: Frontend — Tela de gerenciamento
- [x] Passo 6: Backend — Renomeação de servidor
- [x] Passo 7: Integração Ninja Sync + Cache Invalidation

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

---

## Status Atual da Implementação

### O que foi feito recentemente
- Tentativa de correção de reatividade no frontend para que a interface reflita imediatamente as mudanças de nome de cenas físicas.
- O handler `saveScene` no backend (`socket_handlers.rs`) agora atualiza o `CustomSceneManager` usando `update_physical_scene_name` e emite os eventos `scenesUpdated` e `customScenesList`.

### Onde paramos e Problema Atual
**Problema:** Quando o operador edita o nome de uma cena física e a salva, e logo em seguida abre o modal de "Atribuir Cena" na tela de Custom Scenes, a lista de cenas físicas ainda mostra o **nome antigo** da cena modificada. A interface só atualiza para o nome correto se a página for recarregada (F5) ou se o navegador perder e ganhar foco (o que aciona um `requestSync` forçado pelo evento `visibilitychange`).

**Diagnóstico pendente:**
Sabemos que o servidor emite o evento `scenesUpdated` após o salvamento, e o arquivo `socket.js` escuta esse evento e atualiza `window.scenesLibrary`. Como o modal de atribuição utiliza `window.scenesLibrary` ao ser aberto, o dado já deveria estar correto. Existe uma suspeita de condição de corrida (Race Condition): o processo de salvamento na mesa via MIDI (`saveScene`) pode estar causando a recepção de dados desatualizados do hardware (a mesa pode ecoar o nome antigo durante o save_sysex antes do rename_sysex finalizar), sobrescrevendo a memória no backend momentaneamente e emitindo um `scenesUpdated` com o nome antigo. Outra possibilidade é o comportamento das modais sobrescrevendo/ignorando variáveis globais no frontend.
