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
└── style.css                     ← Estilos específicos do modal de guardiões
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
  "style": "style.css"
}
```

---

## 3. Estrutura de Dados (JSON Único e Centralizado)

Toda a persistência da macro reside em um **único arquivo JSON** gerenciado através de `MixerAPI.storage.getModConfig` e `MixerAPI.storage.saveModConfig`:

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
  * **Stereo Link / Pairing Automático**: Se um canal estiver pareado em estéreo na 01V96 (detectado via `MixerAPI.state.isPaired(ch)`), ambos os canais do par são automaticamente protegidos como guardiões.
* **`snapshot` (Estado Temporário de Execução):**
  * `active`: `true` quando a macro está em estado de corte ativo; `false` quando em repouso.
  * `channels_to_restore`: Lista com os índices dos canais que estavam `ON` no momento do corte e que deverão ser restaurados.
  * `timestamp`: Momento Unix do acionamento do corte.
  * `scene_id`: Identificador da cena ativa na 01V96 no momento do corte.
  * `desk_name`: Identificador da mesa configurado no `.env` do servidor.

---

## 4. Escopo e Regras de Negócio

* **Escopo de Canais**: Estritamente **Canais 1 a 32** (canais físicos de entrada primários).
* **Isolamento de UI**: O `channel_strip.js` permanece 100% intocado. Todo o feedback visual e de controle vive exclusivamente no **Pad da Macro** através do `dyn_status` e da cor dinâmica.

---

## 5. Fluxo de Execução e Algoritmo

### 5.1. Momento 1: Acionamento do Corte (Smart Mute)
1. O operador clica no pad da macro no grid.
2. A macro lê o estado atual dos canais 1 a 32 via `MixerAPI.state.getChannel(i)`.
3. Identifica todos os canais que estão com status **`ON`** (desmutados) e que **NÃO** pertencem à lista `guardians` (nem aos seus pares estéreo).
4. Salva a lista desses canais em `snapshot.channels_to_restore`.
5. Preenche `snapshot.active = true`, `snapshot.timestamp = Date.now()`, `snapshot.scene_id = MixerAPI.state.getCurrentScene()`, `snapshot.desk_name = MixerAPI.state.getDeskName()`.
6. Grava atomicamente o JSON via `MixerAPI.storage.saveModConfig('smart_channel_toggler', data)`.
7. Itera sobre `channels_to_restore` chamando `MixerAPI.mixer.toggleOn(chIdx, false)` com pequenos intervalos seguros (20ms) para não sobrecarregar a fila SysEx.
8. Atualiza o visual do pad:
   * Aplica cor dinâmica temporária para **Vermelho Alerta** (`#d32f2f`) via `MixerAPI.ui.setDynamicColor(slotIndex, '#d32f2f')`.
   * Campo `dyn_status` para a animação marquee e exibe o texto **`MUTED` estático/fixo** via `MixerAPI.ui.setSlotStatus(slotIndex, 'MUTED')`.

---

### 5.2. Durante o Intervalo / Ações Manuais na Mesa Física
* Se o operador ligar um canal manualmente na 01V96 (ex: para afinar instrumento ou teste prévio), o canal passa a estar `ON` no mixer.
* Os canais guardiões permanecem intocados e abertos durante todo o tempo.

---

### 5.3. Momento 2: Restauração Inteligente (Smart Restore)
1. O operador clica novamente no pad da macro.
2. A macro lê o estado atual dos canais na mesa via `MixerAPI.state.getChannel(i)`.
3. Para cada canal em `snapshot.channels_to_restore`:
   * Se o canal ainda estiver **`OFF`** $\rightarrow$ Dispara `MixerAPI.mixer.toggleOn(chIdx, true)`.
   * Se o canal já estiver **`ON`** (aberto manualmente) $\rightarrow$ **Não mexe** (ignora o envio, poupando tráfego MIDI).
4. Canais que não estavam na lista (que já estavam `OFF` antes do corte) **permanecem `OFF`**.
5. Limpa o bloco `snapshot` no JSON (`active: false`, `channels_to_restore: []`, `timestamp: null`, etc.).
6. Grava o JSON atualizado via `MixerAPI.storage.saveModConfig`.
7. Atualiza o visual do pad:
   * Restaura a **cor estática** original definida pelo usuário via `MixerAPI.ui.setDynamicColor(slotIndex, null)`.
   * Campo `dyn_status` volta a exibir os guardiões (com **letreiro marquee animado** caso o texto ultrapasse a largura) via `MixerAPI.ui.setSlotStatus(slotIndex, 'G: ' + guardians.join(', '))`.

---

### 5.4. Invalidação Automática & Resets

O bloco `snapshot` é automaticamente descartado (mantendo `guardians` intactos) sob as seguintes condições:

1. **TTL de 12 Horas:**
   * Se `Date.now() - snapshot.timestamp > 12 * 3600 * 1000`, o snapshot é descartado ao inicializar a macro.
2. **Troca de Cena (*Scene Recall* na 01V96):**
   * Ao detectar `scene_change` na mesa, se a nova cena $\neq$ `snapshot.scene_id`, o snapshot é resetado imediatamente.
3. **Mesa Diferente:**
   * Se o `desk_name` atual for diferente do registrado no snapshot, o snapshot é descartado.
4. **Reset Manual pelo Usuário:**
   * Acionado através do botão **`[ ↺ Limpar Memória do Toggle ]`** dentro do modal de configurações da macro.
   * Não altera o áudio da mesa física (assume o som atual do palco) e limpa a memória de restauração.

---

## 6. Modal de Configurações da Macro

Ao abrir a configuração da macro (via clique de engrenagem / menu de macros):
* **Grade de Seleção de Guardiões:** Checkboxes para os 32 canais de entrada com exibição dos nomes customizados e indicador visual de canais pareados em estéreo.
* **Botão de Reset:** **`[ ↺ Limpar Memória do Toggle ]`** para descarte manual imediato de snapshots pendentes.
* **Salvamento:** Gravação direta no arquivo JSON único através de `MixerAPI.storage.saveModConfig`.
