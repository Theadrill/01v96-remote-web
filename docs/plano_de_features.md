# Plano de Features

## 1. Sistema de Cenas de Nomes Customizados

Permite salvar nomes customizados como cenas e vinculá-los às cenas físicas
da mesa Yamaha 01V96. No app, os nomes podem ter até 10 caracteres — a mesa
continua limitada a 4.

### 1.1. Funcionamento

| Local           | Limite         | Exemplo      |
|-----------------|----------------|--------------|
| Mesa (hardware) | 4 caracteres   | `MAUR`       |
| App (interface) | 10 caracteres  | `MAURICIO`   |

As cenas de nomes customizados são arquivos JSON salvos localmente e
sincronizados via Ninja Sync (Git). Ao carregar uma cena física na mesa, o
servidor localiza a custom scene correspondente, compara canal por canal e
envia apenas os nomes que divergem — evitando tráfego MIDI desnecessário.

O algoritmo de comparação usa os 4 primeiros caracteres de cada nome
customizado contra o nome atual do canal na mesa. Se os valores coincidirem,
o canal é pulado. Se divergirem, o servidor emite o comando de rename apenas
para aquele canal, com delay de 30ms entre comandos.

### 1.2. Estrutura de arquivos

#### `custom_names_scenes-{nome_da_mesa}.json`

Arquivo central de registro. Mapeia cada custom scene a uma cena física.

```json
{
  "mesa_nome": "igreja-central",
  "scenes": [
    {
      "physical_scene": "carlos",
      "physical_id": 8,
      "file": "custom_names_scene-carlos-igreja-central.json"
    },
    {
      "physical_scene": "joao",
      "physical_id": 15,
      "file": "custom_names_scene-joao-igreja-central.json"
    }
  ]
}
```

| Campo                      | Tipo   | Descrição                              |
|----------------------------|--------|----------------------------------------|
| `mesa_nome`                | string | Nome do servidor/mesa (vindo do `.env`)|
| `scenes[].physical_scene`  | string | Nome da cena física na mesa            |
| `scenes[].physical_id`     | number | ID numérico da cena na mesa (1-99)     |
| `scenes[].file`            | string | Arquivo JSON com os nomes customizados |

#### `custom_names_scene-{nome_cena}-{nome_da_mesa}.json`

Arquivo com os nomes estendidos por canal. O sufixo `{nome_da_mesa}` evita
colisão quando múltiplos servidores compartilham o mesmo repositório Ninja
Sync e possuem cenas físicas com nomes iguais.

```json
{
  "scene_name": "carlos",
  "scene_id": 8,
  "description": "Música 1 - Carlos",
  "channels": {
    "1":  { "name": "MAURICIO", "short": "MAUR" },
    "2":  { "name": "VIOLAO",   "short": "VIOL" },
    "3":  { "name": "GUITARRA", "short": "GUIT" },
    "32": { "name": "BATERIA",  "short": "BATE" },
    "33": { "name": "ST IN 1",  "short": "ST1 " },
    "35": { "name": "ST IN 2",  "short": "ST2 " },
    "37": { "name": "ST IN 3",  "short": "ST3 " },
    "39": { "name": "ST IN 4",  "short": "ST4 " },
    "master": { "name": "MASTER", "short": "MAST" }
  }
}
```

| Chave      | Cobertura                     |
|------------|-------------------------------|
| `1` a `32` | Canais mono (inputs 1-32)     |
| `33`       | ST IN 1 L                     |
| `34`       | ST IN 1 R                     |
| `35`       | ST IN 2 L                     |
| `36`       | ST IN 2 R                     |
| `37`       | ST IN 3 L                     |
| `38`       | ST IN 3 R                     |
| `39`       | ST IN 4 L                     |
| `40`       | ST IN 4 R                     |
| `master`   | Canal master                  |

O índice no JSON começa em **1** (canal 1 = primeiro canal físico). A mesa
usa índice baseado em zero. O servidor converte:
`json_id = mesa_channel + 1`.

### 1.3. Cena default

O arquivo `custom_names_scene-default-{nome_da_mesa}.json` atua como falback.
Ele é aplicado automaticamente a qualquer cena física que não tenha uma
custom scene própria. Assim, se várias cenas compartilham os mesmos nomes, o
operador mantém apenas a default — sem duplicar arquivos.

Ordem de busca ao carregar uma cena:

1. Procura custom scene vinculada por `physical_id`.
2. Se não encontrar, busca por `physical_scene`.
3. Se ainda não encontrar, tenta `custom_names_scene-default.json`.
4. Se nenhuma existir, encerra sem carregar nomes customizados.

### 1.4. Criação de nomes customizados

#### 1.4.1. Acessar a edição

1. Na tela principal, toque no canal desejado.
2. A tela de configuração do canal abre.
3. Clique no nome do canal (visor atual de 4 caracteres).

#### 1.4.2. Modal de edição

O modal exibe:

- **Input de texto** com o nome atual do canal.
- **Checkbox** `"Criar nome customizado"` (desmarcada por padrão).
- **Preview em tempo real** com duas linhas que atualizam a cada caractere:

  ```
  App:  MAURICIO
  Mesa: MAUR
  ```

**Caso 1 — Checkbox desmarcada:**

- Fluxo legado mantido. O input tem limite de 4 caracteres.
- Ao salvar, o nome é enviado diretamente para a mesa via MIDI.
- Nenhum arquivo de custom scene é criado ou alterado.

**Caso 2 — Checkbox marcada:**

- O limite do input sobe para **10 caracteres**.
- Validação em tempo real:
  - Permite letras (A-Z, a-z), números e underline.
  - Acentos são normalizados automaticamente
    (ex: `MÚSICA` se torna `MUSICA`).
  - Símbolos especiais são removidos.
  - O input mostra borda vermelha se houver caracteres inválidos.
- Se o `.env` não define o nome do servidor, o sistema exige o
  cadastro primeiro (ver Feature 2).
- Ao confirmar:

#### 1.4.3. Salvamento

1. **Descobre a cena física ativa**: o servidor lê `sceneName` e
   `sceneNumber` do `GlobalState`.
2. **Extrai o nome base da cena**: se a cena se chama `"08 - carlos"`,
   extrai `"carlos"`. O sistema usa o texto após o primeiro `" - "` se
   existir; caso contrário, usa o nome completo.
3. **Cria o arquivo** `custom_names_scene-{nome_base}-{nome_da_mesa}.json`
   (se não existir):
   - Varre todos os canais do `GlobalState` e coleta os nomes atuais de 4
     caracteres.
   - Para o canal editado, salva o nome estendido (até 10 caracteres) e
     calcula o `short` com os 4 primeiros caracteres, maiúsculo, completando
     com espaços se o nome for menor que 4.
4. **Atribuição automática**: se a cena física atual ainda não está vinculada
   a nenhuma custom scene, o sistema já faz o vínculo automaticamente,
   adicionando o registro no `custom_names_scenes-{nome_da_mesa}.json`. O
   operador não precisa acessar a tela de gerenciamento para isso.
5. **Envia para a mesa**: o `short` (4 caracteres) é transmitido via
   `build_name_change`.

### 1.5. Tela de gerenciamento

#### 1.5.1. Lista de cenas

Exibe todas as custom scenes encontradas localmente (`custom_names_scene-*.json`),
com:

- Nome da custom scene.
- Cena física vinculada (se houver).
- Data da última modificação.

#### 1.5.2. Modal de atribuição

Ao clicar em uma custom scene, abre um modal com:

- **Lista de cenas físicas** detectadas na mesa (nome + ID), obtidas do
  `SceneManager`.
- O usuário seleciona **apenas uma** cena para vincular.
- Botões: **Confirmar** / **Cancelar**.

#### 1.5.3. Tabela de comparação

Ao abrir os detalhes de uma custom scene, exiba uma tabela com três colunas:

| Canal | Nome Customizado | Nome Atual na Mesa |
|-------|------------------|--------------------|
| 1     | MAURICIO         | MAUR               |
| 2     | VIOLAO           | VIOL               |
| 3     | GUIT             | GUIT               |

Linhas onde os nomes diferem ficam destacadas (fundo amarelo). O operador
identifica rapidamente quais canais serão alterados ao carregar aquela
custom scene.

#### 1.5.4. Remover canal individual

No modal de edição de nome (item 1.4.2), quando o canal já possui um nome
customizado salvo, adicione um botão **Remover nome customizado**. Ao clicar:

- Remove a chave `channels[id]` do JSON da custom scene.
- O canal volta a usar o nome padrão da mesa.
- Se todos os canais forem removidos, o arquivo da custom scene é deletado e
  o registro no `custom_names_scenes-{nome_da_mesa}.json` é removido.

### 1.6. Carregamento ao trocar cena na mesa

Quando o servidor detecta o carregamento de uma cena física (`SceneNumber`
ou `PhysicalSceneRecall`):

1. **Aguarda** o dump completo da cena (delay de ~2s).
2. **Localiza** a custom scene nesta ordem:
   1. Busca por `physical_id` no `custom_names_scenes-{nome_da_mesa}.json`.
   2. Se não encontrar, busca por `physical_scene`.
   3. Se ainda não encontrar, tenta
      `custom_names_scene-default-{nome_da_mesa}.json`.
   4. Se nenhuma for encontrada, encerra.
3. **Carrega** o arquivo JSON da custom scene.
4. **Compara e sincroniza**:

   ```
   PARA CADA canal no JSON:
       esperado = short (4 chars, maiúsculo, preenchido com espaços)
       atual = mesa.getChannelName(canal)

       SE esperado != atual:
           build_name_change(canal, esperado)
           delay 30ms
       SENÃO:
           pula
   ```

5. **Atualiza o frontend**: emite `"updateName"` para todos os clientes com
   o `name` completo de cada canal modificado.

### 1.7. Indicador visual de custom scene ativa

Quando uma custom scene está carregada, a interface exibe um indicador
(ícone, badge ou texto) informando ao operador que os nomes são
customizados.

> **ATENÇÃO**: O local exato do indicador **deve ser perguntado
> obrigatoriamente ao usuário** antes da implementação. Esta é a última
> etapa do desenvolvimento da feature — o usuário definirá o posicionamento
> nesse momento.

### 1.8. Integração com Ninja Sync

Os arquivos `custom_names_scene-*.json` e `custom_names_scenes-*.json`
integram o fluxo do Ninja Sync (Git auto push/pull):

- **Pull automático**: na inicialização do servidor, sincroniza do remoto.
- **Push automático**: após qualquer alteração, faz commit e push.

Isso mantém as cenas de nomes disponíveis em todos os dispositivos.

### 1.9. Casos de borda

| Situação                                         | Comportamento                                                            |
|--------------------------------------------------|--------------------------------------------------------------------------|
| Cena física renomeada na mesa                    | O `physical_id` é a chave principal. O nome é fallback.                  |
| Canal não encontrado no JSON                     | Mantém o nome atual da mesa (não altera).                                |
| JSON mal formatado ou ausente                    | Log de erro. Segue sem custom scene. Nenhum nome é alterado.             |
| Nome estendido menor que 4 caracteres            | Preenche com espaços. Ex: `"AX"` se torna `"AX  "`.                      |
| Usuário desmarca checkbox com nome > 4 chars     | Input volta a 4 chars e trunca o valor. Salvamento segue fluxo legado.   |
| Múltiplas cenas físicas com mesmo nome           | Match primeiro por `physical_id`, depois por `physical_scene`.           |
| Todos os canais removidos da custom scene        | Arquivo deletado. Registro removido do `custom_names_scenes-*.json`.     |

---

## 2. Atribuição de Nome ao Servidor/Mesa

Sistema de cadastro que identifica unicamente cada servidor/mesa, vinculando
configurações (como custom scenes) a uma mesa específica.

### 2.1. Motivação

Com suporte a múltiplas mesas (igrejas, eventos, locais diferentes), cada
servidor precisa de uma identidade única para:

- Vincular custom scenes à mesa correta (sufixo no nome do arquivo).
- Evitar conflitos no Ninja Sync (cada mesa tem seu próprio
  `custom_names_scenes-{nome}.json`).
- Exibir na interface qual mesa está sendo controlada.

### 2.2. Estrutura do `.env`

Arquivo na raiz do projeto:

```env
SERVER_PASSWORD=2107
SERVER_NAME=igreja-central
```

| Variável          | Obrigatório | Descrição                                      |
|-------------------|-------------|------------------------------------------------|
| `SERVER_PASSWORD` | Sim         | Senha de 4 dígitos para acesso modo Técnico    |
| `SERVER_NAME`     | Sim         | Nome amigável do servidor/mesa                 |

### 2.3. Fluxo de cadastro

#### 2.3.1. Detecção

Na inicialização do servidor, verifique a situação do `.env`:

1. `.env` **não existe** — cadastro completo obrigatório.
2. `.env` existe mas **faltam** `SERVER_PASSWORD` ou `SERVER_NAME` —
   cadastro parcial (apenas o que falta).
3. `.env` está completo — segue direto para a splash screen.

#### 2.3.2. Tela de cadastro

Exibida na splash screen **após** clicar em **TÉCNICO**, somente quando o
cadastro é necessário.

**Cenário 1 — Cadastro completo** (`.env` não existe):

```
+----------------------------------+
|  CONFIGURAÇÃO INICIAL DO SERVIDOR |
|                                  |
|  Nome do servidor/mesa:          |
|  [___________________________]   |
|  placeholder: "ex: mesa-do-joao"|
|                                  |
|  Senha de acesso (4 dígitos):    |
|  [____]                          |
|                                  |
|  Confirmar senha:                |
|  [____]                          |
|                                  |
|  [ CONTINUAR ]                   |
+----------------------------------+
```

- O campo de nome inicia com o placeholder `ex: mesa-do-joao` (texto cinza).
- Ao clicar no input, o placeholder some e o campo fica em branco.
- Se o operador **não clicar** e tentar continuar, o placeholder é tratado
  como valor inválido: o sistema exibe o erro `"Digite um nome para o
  servidor"` e foca automaticamente no input.
- O campo é **obrigatório** — não pode ficar vazio nem conter o placeholder
  como valor final.

**Cenário 2 — Cadastro parcial** (`.env` existe mas falta campo):

- Apenas os campos faltantes são exibidos.
- Os campos já preenchidos aparecem como texto somente leitura.

#### 2.3.3. Validações

| Campo             | Regra                                                                   |
|-------------------|-------------------------------------------------------------------------|
| Nome do servidor  | Mínimo 3, máximo 30 caracteres. Letras minúsculas, números e hífen.     |
| Senha             | Exatamente 4 dígitos numéricos (0-9).                                   |
| Confirmar senha   | Deve ser idêntica à senha.                                              |

#### 2.3.4. Salvamento

Ao confirmar, o servidor:

1. Cria ou atualiza o `.env` na raiz do projeto.
2. Recarrega as configurações em memória.
3. Redireciona para a tela principal de mixagem (modo técnico).

#### 2.3.5. Bloqueio de acesso

Enquanto o cadastro não estiver concluído:

- O botão **TÉCNICO** redireciona para a tela de cadastro.
- O modo **Músico** (sem senha) permanece acessível.

### 2.4. Edição do nome pós-setup

O operador pode alterar o `SERVER_NAME` pela tela de configurações.
Ao renomear:

1. O novo nome é validado pelas mesmas regras (item 2.3.3).
2. O sistema varre `custom_names_scenes-{nome_antigo}.json` e coleta todas
   as custom scenes vinculadas.
3. Para cada custom scene:
   - Atualiza o campo `mesa_nome` no JSON de registro.
   - Renomeia o arquivo físico (ex:
     `custom_names_scene-carlos-casa_antiga.json` →
     `custom_names_scene-carlos-casa_nova.json`).
   - Atualiza o campo `file` no registro para refletir o novo nome.
4. Se existir, renomeia
   `custom_names_scenes-{nome_antigo}.json` para
   `custom_names_scenes-{nome_novo}.json`.
5. Atualiza o `.env` com o novo `SERVER_NAME`.

### 2.5. Exibição na interface

O `SERVER_NAME` substitui o texto **01V96** na sidebar da interface
principal. Isso dá identidade visual à mesa controlada e ajuda o operador a
identificar imediatamente qual servidor está ativo — especialmente útil com
Ninja Sync entre múltiplos dispositivos.

### 2.6. Reset de configuração

Um botão **Resetar configuração** na tela de configurações:

1. Apaga o arquivo `.env`.
2. Redireciona para a splash screen.
3. Força o fluxo de cadastro completo novamente.

Útil para testes, mudança definitiva de máquina ou correção de erros de
digitação.

### 2.7. Impacto

| Feature                            | Relação                                                                 |
|------------------------------------|-------------------------------------------------------------------------|
| Custom scenes                      | `SERVER_NAME` é sufixo do arquivo `custom_names_scenes-{name}.json`.    |
| Ninja Sync                         | Múltiplas mesas no mesmo repositório Git sem conflito de nomes.         |
| Interface                          | `SERVER_NAME` substitui **01V96** na sidebar.                           |

### 2.8. Segurança

- O `.env` deve ser incluído no `.gitignore` — a senha não pode vazar em
  repositórios públicos.
- `SERVER_NAME` não contém informação sensível e pode ser versionado.
