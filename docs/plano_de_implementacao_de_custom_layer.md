# Plano de Implementação: Custom Layer (Visão de Grupos)

## Visão Geral
A feature "Custom Layer" (Visão de Grupos) tem como objetivo permitir que o usuário crie uma camada personalizada na interface principal, semelhante ao que é encontrado em mesas de som mais modernas. Nessa camada, será possível agrupar, reordenar e isolar apenas os canais desejados, facilitando o fluxo de trabalho (por exemplo, contornando faders com defeito ou agrupando canais específicos como "VOZES").

## Fluxo de Interação e UI

1. **Acesso à Feature**
   - Um novo botão chamado **"Custom Layer"** será adicionado à tela principal.

2. **Tela do Custom Layer (Estado Inicial Vazio)**
   - Ao clicar no botão "Custom Layer", o usuário será levado a uma tela inicialmente vazia.
   - Nesta tela, haverá um botão em destaque: **"Adicionar Grupo"**.

3. **Criação e Configuração de Grupos**
   - Ao clicar em "Adicionar Grupo", um novo "espaço" (container) de grupo será criado.
   - **Cabeçalho do Grupo:**
     - Terá um campo editável para o **Título do Grupo** (ex: "VOZES").
     - Opção para **escolher uma cor** de identificação para o grupo.
     - Botão **"Editar"** (habilita modo de edição, veja abaixo).
   - **Corpo do Grupo:**
     - Conterá um botão de **"+" (Adicionar Canal)** bem grande.
     - Clicar neste botão abrirá uma lista em formato de grid (semelhante ao grid de seleção de canais já existente na configuração de macro ou no *channel toggler*).
     - Os canais selecionados passarão a compor os faders daquele grupo.
     - Não haverá limite para o número de canais inseridos em um grupo.
   - **Group Master Fader (Macro de Grupo):**
     - Ao lado dos canais de cada grupo, existirá um fader mais fino (estilo macro, mas sem botão de engrenagem).
     - Esse fader ajustará o volume (+ ou -) de todos os canais pertencentes àquele grupo de forma relativa, ao ser movido.

4. **Modo de Edição, Reordenação (Drag and Drop) e Exclusão**
   - Ao clicar em **Editar** no cabeçalho do grupo:
     - Os *meters* de áudio são desabilitados temporariamente para melhorar a performance.
     - Um botão circular com um "X" aparece sobre cada canal do grupo. Ao clicar, um modal de confirmação é exibido antes de excluir o canal do grupo.
     - O recurso de **Drag and Drop** é habilitado.
     - O usuário pode arrastar um canal para reordená-lo dentro do próprio grupo ou soltá-lo em **outro grupo**.
     - Os próprios grupos também poderão ser reordenados via Drag and Drop na tela principal.
   
5. **Adicionando Múltiplos Grupos**
   - Ao lado de um grupo já criado, existirá sempre um botão **"Adicionar novo grupo"**.
   - Clicar nele repete o processo, criando um novo container com título, cor e a área para adicionar canais.

6. **Layout e Visualização (Aesthetics)**
   - O layout resultante será composto por blocos de faders agrupados.
   - Os faders na Custom Layer terão exatamente o mesmo visual e comportamento dos faders normais (mostrando meters, mute, solo, select), adotando o modelo mobile ou desktop conforme configurado na tela principal.
   - Haverá um espaçamento visual claro separando os grupos.

## Arquitetura e Persistência de Dados

- **Refatoração Prévia:**
  - A pasta atual `data/custom_scenes` será renomeada no planejamento e código para `data/custom_names_scenes` para deixar claro seu propósito, já que agora teremos também as `custom_layer_scenes`.
- **Persistência da Custom Layer:**
  - O esquema será o mesmo "Ninja Sync" das *custom name scenes*.
  - A persistência ocorrerá em `data/custom_layer_scenes/local` (e `/shared`).
  - Nomenclatura do arquivo: `custom_layer_scene-[nome_da_cena_atual_da_mesa]-[nome_da_mesa].json`.

## Dúvidas em Aberto (Para quando você voltar)
> [!NOTE]
> Por favor, responda a estas perguntas quando tiver um tempo para refinarmos o design da funcionalidade:

1. **Master Fader de Grupo (Macro Fader):** O fader fino do grupo vai enviar os comandos MIDI de forma contínua durante o arraste em tempo real (o que pode gerar muito tráfego dependendo do tamanho do grupo) ou só vai calcular e enviar as diferenças quando o usuário soltar o fader (on release/debounce)?
2. **Exclusão de Grupo Completo:** O botão para excluir o grupo inteiro vai ficar junto do cabeçalho durante o "Modo Editar"? Ao excluir um grupo, os canais que estavam dentro dele são apenas removidos do grupo (apagando o grupo junto) com uma única confirmação?
3. **Scroll em Dispositivos Móveis:** Em telas menores, como não há limite de canais por grupo, se o grupo for muito largo, o usuário fará *scroll horizontal* individualmente dentro do próprio grupo (cada grupo rola independente), ou a tela inteira rola para o lado com todos os grupos fixos nela?
4. **Prioridade do Ninja Sync:** Ao iniciar, as regras de conflito/prioridade entre os arquivos do diretório `shared` e `local` serão estritamente iguais as já implementadas em `custom_names_scenes`?
