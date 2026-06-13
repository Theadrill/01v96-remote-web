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
     - Botão de **"X" (Excluir Grupo)** visível ao entrar no modo de edição. Excluir o grupo fará com que todos os canais dentro dele voltem ao estado inicial, desaparecendo do Custom Layer.
   - **Corpo do Grupo:**
     - Conterá um botão de **"+" (Adicionar Canal)** bem grande.
     - Clicar neste botão abrirá uma lista em formato de grid (semelhante ao grid de seleção de canais).
     - Os canais selecionados passarão a compor os faders daquele grupo.
     - A largura do grupo vai se ajustando e crescendo dinamicamente dependendo da quantidade de faders que ele possuir, sem limites.
   - **Group Master Fader (Macro de Grupo):**
     - Terá exatamente a mesma aparência e comportamento do *channel strip* do **canal macro**.
     - Ao tocar nos botões de `+` ou `-`, os valores de volume de todos os canais atrelados ao grupo serão alterados simultaneamente e em tempo real.
     - Ele já virá automaticamente atrelado aos canais presentes dentro daquele grupo, sem necessidade de configuração manual.

4. **Modo de Edição, Reordenação (Drag and Drop) e Exclusão**
   - Ao clicar em **Editar** no cabeçalho do grupo:
     - Os *meters* de áudio são desabilitados temporariamente para melhorar a performance.
     - Um botão de "X" aparece sobre cada canal do grupo e no cabeçalho do grupo.
     - O recurso de **Drag and Drop** é habilitado.
     - O usuário pode arrastar um canal para reordená-lo dentro do próprio grupo, ou soltá-lo em **outro grupo**.
     - Os próprios grupos também poderão ser reordenados via Drag and Drop na tela principal.
   
5. **Adicionando Múltiplos Grupos**
   - Ao lado de um grupo já criado, existirá sempre um botão **"Adicionar novo grupo"**.
   - Clicar nele repete o processo, criando um novo container com título, cor e a área para adicionar canais.

6. **Layout e Visualização (Aesthetics)**
   - O layout resultante será composto por blocos de faders agrupados que crescem horizontalmente.
   - Os faders na Custom Layer terão exatamente o mesmo visual e comportamento dos faders normais, adotando o modelo mobile ou desktop conforme configurado na tela principal.
   - Haverá um espaçamento visual claro separando os grupos.

## Arquitetura e Persistência de Dados

- **Refatoração Prévia:**
  - A pasta atual `data/custom_scenes` será renomeada no planejamento e código para `data/custom_names_scenes` para deixar claro seu propósito, já que agora teremos também as `custom_layer_scenes`.
- **Persistência da Custom Layer:**
  - O esquema será o mesmo "Ninja Sync" das *custom name scenes*.
  - A persistência ocorrerá em `data/custom_layer_scenes/local` (e `/shared`).
  - Nomenclatura do arquivo: `custom_layer_scene-[nome_da_cena_atual_da_mesa]-[nome_da_mesa].json`.
- **Regras do Ninja Sync Atuais (Explicação):**
  - Todas as alterações feitas pelo usuário na interface são salvas primeiramente na pasta `local`.
  - O sistema sempre tenta ler o arquivo da pasta `local` primeiro. Se ele não existir lá, ele lê da pasta `shared`.
  - Quando a sincronização remota (via Git) ocorre em *background*, os arquivos salvos em `shared` são atualizados. Dessa forma, as alterações da nuvem chegam no `shared`, mas edições pontuais do aparelho (`local`) prevalecem sobre a nuvem naquele dispositivo específico até que um sincronismo suba ou sobreescreva as modificações.

## Novas Dúvidas em Aberto
> [!NOTE]
> 1. **Visual do Macro Fader do Grupo:** Já que o *master* do grupo será o mesmo componente do Canal Macro, ele deverá exibir os botões de Mute e Solo para aplicar Mute/Solo no grupo todo, ou apenas os botões de `+` e `-` de volume junto com o nome do grupo?
> 2. **Espaço para Descarte:** Ao arrastar (Drag and Drop) um canal para retirá-lo de um grupo, haverá alguma área de "soltar" específica (como uma lixeira) no fundo da tela, ou basta soltar o canal fora da área de qualquer grupo para ele ser removido?
> 3. **Indicação Visual de Grupo Selecionado:** Quando um grupo possuir muitos canais e estiver ocorrendo um *scroll horizontal* contínuo, devemos travar o "Group Master Fader" no canto do grupo para ele estar sempre visível, ou ele "rola" junto com os canais e pode sumir da tela?
