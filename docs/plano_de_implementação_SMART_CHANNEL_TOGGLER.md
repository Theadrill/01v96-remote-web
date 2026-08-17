# 🎛️ Plano de Implementação: Macro Smart Channel Toggler

## 1. Visão Geral e Objetivo

A macro **Smart Channel Toggler** é um mod desenvolvido sobre a nova **Arquitetura Modular de Macros (Manifest-Driven)** para a mesa digital **Yamaha 01V96**. Ela permite silenciar instantaneamente múltiplos canais (ex: instrumentos, microfones de apoio), preservando canais essenciais configurados como **Guardiões** (ex: canal de DJ, voz principal, microfone de avisos).

Ao ser acionada novamente para religar, o sistema restaura com precisão cirúrgica **apenas os canais que estavam ligados antes do corte**, respeitando alterações manuais ocorridas no palco durante o intervalo e mantendo desligados canais que já estavam mutados.

> **Pré-requisito**: Execução prévia do [`docs/plano_de_refatoração_MACROS.md`](file:///C:/PROJETOS/01v96-remote-web/docs/plano_de_refatora%C3%A7%C3%A3o_MACROS.md).

---

## 2. Estrutura do Pacote da Macro

Seguindo o padrão de pacotes modulares isolados:

```text
public/modules/macros/smart_channel_toggler/
├── manifest.json                 ← Manifesto declarativo da macro
├── main.js                       ← Lógica de execução, corte, restauração e modal
└── style.css                     ← Estilos encapsulados do modal de guardiões
```

### 2.1. Manifesto (`manifest.json`)
```json
{
  "id": "smart_channel_toggler",
  "name": "Smart Toggler",
  "version": "1.0.0",
  "author": "Theadrill",
  "description": "Corte inteligente de banda preservando canais guardiões e restauração com memória",
  "entry": "main.js",
  "color": "#6a1b9a",
  "icon": "shield",
  "style": "style.css",
  "singleSlot": true
}
```

---

## 3. Estrutura de Dados (JSON Único e Centralizado)

Toda a persistência da macro reside em um **único arquivo JSON global compartilhado** gerenciado através de `MixerAPI.storage.getModConfig` e `MixerAPI.storage.saveModConfig('smart_channel_toggler', data, true)`:

```json
{
  "guardians": [1, 16],
  "snapshot": {
    "active": false,
    "channels_to_restore": [],
    "timestamp": null,
    "scene_id": null,
    "desk_name": null
  }
}
```

### 3.1. Regras dos Campos
* **`guardians` (Array de Canais Permanentes):**
  * **Persistência Eterna**: Nunca expira por TTL e nunca é limpo por troca de cena (*Scene Recall*).
  * Canais definidos (ex: DJ no canal 16, voz principal no canal 1) ficam salvos indefinidamente até edição manual pelo operador.
  * **Gerenciamento Híbrido de Canais Estéreo (Stereo Pairing):**
    * **No Modal:** Ao selecionar um canal pareado, a interface marca automaticamente o par correspondente e exibe o indicador visual `[🔗 L/R]`.
    * **No Runtime:** No momento do corte, a macro consulta `MixerAPI.state.isPaired(ch)`. Se um canal guardião estiver pareado com outro canal na mesa física, seu par é automaticamente protegido contra mutação acidental, preservando a imagem estéreo balanceada mesmo se o link tiver sido feito direto no hardware durante o evento.
* **`snapshot` (Estado Temporário de Execução):**
  * `active`: `true` quando a macro está em estado de corte ativo; `false` quando em repouso.
  * `channels_to_restore`: Lista com os índices dos canais que estavam `ON` no momento do corte e que deverão ser restaurados.
  * `timestamp`: Momento Unix do acionamento do corte.
  * `scene_id`: Identificador da cena ativa na 01V96 no momento do corte.
  * `desk_name`: Identificador da mesa configurado no `.env` do servidor.

---

## 4. Escopo, Regras de Negócio e Concorrência

* **Instância Única (`singleSlot: true`)**: Permite no máximo uma instância da macro em uso no grid de pads, compartilhando o mesmo estado global entre todos os clientes conectados no modo técnico.
* **Escopo de Canais**: Estritamente **Canais 1 a 32** (canais físicos de entrada primários).
* **Isolamento de UI**: O `channel_strip.js` permanece 100% intocado. Todo o feedback visual e de controle vive exclusivamente no **Pad da Macro** através do `dyn_status` e da cor dinâmica.
* **Proteção contra Concorrência (Execution Lock)**: Trava booleana (`isExecuting`) que ignora cliques rápidos sucessivos no pad durante o envio sequencial dos comandos SysEx/MIDI.
* **Extensão de API no `core.js` (`MixerAPI.ui.confirm`)**: Exposição de wrapper para `ConfirmModal.show` permitindo que macros invoquem modais nativos de confirmação/alerta com estilo e promessas consistentes.

---

## 5. Fluxo de Execução e Algoritmo

### 5.1. Momento 1: Acionamento do Corte (Smart Mute)
1. O operador clica no pad da macro no grid.
2. Se `isExecuting === true`, ignora a solicitação.
3. Se a lista `guardians` estiver vazia:
   * Dispara `const ok = await MixerAPI.ui.confirm({ title: 'Atenção', message: 'Mutar todos os canais?\\n(Você pode configurar os canais que não serão mutados na engrenagem de configuração)', type: 'warning' })`.
   * Se `ok === false`, aborta o fluxo.
4. Ativa `isExecuting = true`.
5. A macro lê o estado atual dos canais 1 a 32 via `MixerAPI.state.getChannel(i)`.
6. Identifica todos os canais que estão com status **`ON`** (desmutados) e que **NÃO** pertencem à lista `guardians` (nem aos seus parceiros estéreo verificados via `isPaired`).
7. Salva a lista desses canais em `snapshot.channels_to_restore`.
8. Preenche `snapshot.active = true`, `snapshot.timestamp = Date.now()`, `snapshot.scene_id = MixerAPI.state.getCurrentScene()`, `snapshot.desk_name = MixerAPI.state.getDeskName()`.
9. Grava atomicamente o JSON compartilhado via `MixerAPI.storage.saveModConfig('smart_channel_toggler', data, true)`.
10. Itera sobre `channels_to_restore` chamando `MixerAPI.mixer.toggleOn(chIdx, false)` com intervalos de segurança de 20ms entre cada canal.
11. Ao concluir o envio, libera `isExecuting = false`.
12. Atualiza o visual do pad:
    * Aplica cor dinâmica temporária para **Vermelho Alerta** (`#d32f2f`) via `MixerAPI.ui.setDynamicColor(slotIndex, '#d32f2f')`.
    * Campo `dyn_status` para a animação marquee e exibe o texto **`MUTED` estático/fixo** via `MixerAPI.ui.setSlotStatus(slotIndex, 'MUTED')`.

---

### 5.2. Durante o Intervalo / Ações Manuais na Mesa Física
* Se o operador ligar um canal manualmente na 01V96 (ex: para afinar instrumento ou teste prévio), o canal passa a estar `ON` no mixer.
* Os canais guardiões permanecem intocados e abertos durante todo o tempo.

---

### 5.3. Momento 2: Restauração Inteligente (Smart Restore)
1. O operador clica novamente no pad da macro.
2. Se `isExecuting === true`, ignora a solicitação. Caso contrário, ativa `isExecuting = true`.
3. A macro lê o estado atual dos canais na mesa via `MixerAPI.state.getChannel(i)`.
4. Para cada canal em `snapshot.channels_to_restore`:
   * Se o canal ainda estiver **`OFF`** $\rightarrow$ Dispara `MixerAPI.mixer.toggleOn(chIdx, true)` com delay de 20ms.
   * Se o canal já estiver **`ON`** (aberto manualmente) $\rightarrow$ **Não mexe** (ignora o envio, poupando tráfego MIDI).
5. Canais que não estavam na lista (que já estavam `OFF` antes do corte) **permanecem `OFF`**.
6. Limpa o bloco `snapshot` no JSON (`active: false`, `channels_to_restore: []`, `timestamp: null`, etc.).
7. Grava o JSON atualizado via `MixerAPI.storage.saveModConfig('smart_channel_toggler', data, true)`.
8. Ao concluir o envio, libera `isExecuting = false`.
9. Atualiza o visual do pad:
   * Restaura a **cor estática** original definida no perfil via `MixerAPI.ui.setDynamicColor(slotIndex, null)`.
   * Campo `dyn_status` volta a exibir os guardiões formatados com nomes amigáveis ou números (ex: `G: VOZ, DJ` / `G: CH 1, 16`) com **letreiro marquee animado** caso o texto ultrapasse a largura do pad.

---

### 5.4. Invalidação Automática & Resets

O bloco `snapshot` é automaticamente descartado (mantendo a lista `guardians` intacta e permanente) sob as seguintes condições:

1. **TTL de 12 Horas:**
   * Se `Date.now() - snapshot.timestamp > 12 * 3600 * 1000`, o snapshot é descartado ao inicializar ou consultar a macro.
2. **Troca de Cena (*Scene Recall* na 01V96):**
   * Ao detectar mudança de cena na mesa (`scene_change` / atualização de `currentSceneNumber`), se a nova cena $\neq$ `snapshot.scene_id`, o snapshot é descartado imediatamente de forma silenciosa. O pad volta ao visual de repouso e o áudio da nova cena é integralmente respeitado.
3. **Mesa Diferente:**
   * Se o `desk_name` atual for diferente do registrado no snapshot, o snapshot é descartado.
4. **Reset Manual pelo Usuário:**
   * Acionado através do botão **`[ ↺ Limpar Memória do Toggle ]`** dentro do modal de configurações da macro.
   * Dá feedback visual imediato no modal, restaura o pad para o estado de repouso e não altera o áudio da mesa física (assume o estado atual do palco).

---

## 6. Especificações de UI/UX & Acessibilidade do Modal

Ao abrir a configuração da macro (via clique de engrenagem / menu de macros no container `#macroSettingsGrid`):

### 6.1. Banner de Status e Reset de Memória (Topo do Modal)
* Uma barra informativa antes do grid:
  * Se corte ativo: `🔴 Memória Ativa: X canais mutados` com botão `[ ↺ Limpar Memória ]` em destaque outline.
  * Se em repouso: `⚪ Sem corte ativo na memória` com botão desabilitado ou neutro.
* Ao clicar em limpar memória: feedback imediato no banner e restauração síncrona do visual do pad.

### 6.2. Estados Visuais dos 32 Botões de Canal (Consistência de Design)
Cada botão representa 3 dimensões simultâneas de estado com altura mínima de 48px (Touch Target WCAG):
1. **Canal Guardião**: Fundo Verde `#2e7d32`, texto branco.
2. **Canal Aberto na Mesa Física (`ON`)**: Borda amarela/dourada `#ffcc00` com glow interno sutil `box-shadow: inset 0 0 5px rgba(255, 204, 0, 0.5)`.
3. **Canal Fechado na Mesa (`OFF`)**: Fundo cinza `#333`, borda `#444`.
4. **Canal Mutado Especificamente pela Macro (Corte Ativo)**: Fundo cinza médio `#4a4a4a` diferenciando do mute padrão.
5. **Canais Pareados em Estéreo**: Badge textual `[🔗 L]` / `[🔗 R]` no topo direito do botão, auto-selecionando o par ao clicar.

### 6.3. Responsividade Total (Mobile / Tablet / Desktop)
* **iPhone SE 3 Landscape (~667x375) e Telas Curtas:**
  * Grid em 8 colunas (`grid-template-columns: repeat(8, 1fr)`).
  * Container do modal com `max-height: 80vh`, `overflow-y: auto`, `overscroll-behavior: contain`.
  * Rodapé de ação (Salvar/Limpar) acessível sem quebra de layout.
* **Modo Retrato / Mobile Vertical:**
  * Grid em 4 colunas (`grid-template-columns: repeat(4, 1fr)`).

---

## 7. Plano de Execução Passo a Passo

- [x] **Etapa 1 (Primeiro Passo): Integração do `ConfirmModal` no `core.js` (`MixerAPI.ui.confirm` / `MixerAPI.ui.alert`)**
  * Expandir o objeto `MixerAPI.ui` em `public/modules/macros/core.js` adicionando `confirm(options)` e `alert(options)` que invocam de forma segura `ConfirmModal.show(options)`.
- [x] **Etapa 2: Criação do Pacote `smart_channel_toggler`**
  * Criar pasta `public/modules/macros/smart_channel_toggler/`.
  * Criar `manifest.json` com `singleSlot: true`, metadados e configuração de estilo.
  * Criar `style.css` com estilos encapsulados para o modal responsivo, badges de pareamento e banner de status.
  * Criar `main.js` implementando ciclo de vida (`onInit`, `execute`, `onConfigure`, `onSave`, `onClear`, `onDelete`), algoritmo de corte/restauração, snapshot e modal de 32 canais.
- [x] **Etapa 3: Validação de UI/UX, Acessibilidade e Responsividade**
  * Validar funcionamento em desktop e simulação de iPhone SE 3 landscape.
  * Testar cenários de borda: corte sem guardiões (com modal de confirmação), clique rápido concorrente, troca de cena e limpeza manual de memória.
