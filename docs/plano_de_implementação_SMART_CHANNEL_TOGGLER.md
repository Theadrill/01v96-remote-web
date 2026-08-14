# 🎛️ Plano de Implementação: Macro Smart Channel Toggler

## 1. Visão Geral e Objetivo

A macro **Smart Channel Toggler** é uma automação inteligente de corte e restauração rápida de canais para a mesa **Yamaha 01V96**. Ela permite silenciar instantaneamente múltiplos canais (ex: instrumentos, microfones de apoio), preservando canais essenciais configurados como **Guardiões** (ex: canal de DJ, voz principal, microfone de avisos).

Ao ser acionada novamente para religar, o sistema restaura com precisão cirúrgica **apenas os canais que estavam ligados antes do corte**, respeitando alterações manuais ocorridas no palco durante o intervalo e mantendo desligados canais que já estavam mutados.

---

## 2. Estrutura de Dados (JSON Único e Centralizado)

Toda a persistência da funcionalidade reside em um **único arquivo JSON** (ex: `config/smart_toggler.json` ou integrado à estrutura de macros/presets existente):

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

### 2.1. Regras dos Campos
* **`guardians` (Array de Canais Permanentes):**
  * **Persistência Eterna**: Nunca expira por TTL e nunca é limpo por troca de cena (*Scene Recall*).
  * Canais definidos (ex: DJ no canal 16, voz principal no canal 1) ficam salvos indefinidamente até edição manual pelo operador.
* **`snapshot` (Estado Temporário de Execução):**
  * `active`: `true` quando a macro está em estado de corte ativo; `false` quando em repouso.
  * `channels_to_restore`: Lista com os índices dos canais que estavam `ON` no momento do corte e que deverão ser restaurados.
  * `timestamp`: Momento Unix do acionamento do corte.
  * `scene_id`: Identificador da cena ativa na 01V96 no momento do corte.
  * `desk_name`: Identificador da mesa configurado no `.env` do servidor.

---

## 3. Fluxo de Execução e Algoritmo

### 3.1. Momento 1: Acionamento do Corte (Smart Mute)
1. O operador clica no botão da macro na interface web.
2. O backend consulta o mapa de canais da 01V96.
3. Identifica todos os canais que estão com status **`ON`** (desmutados) e que **NÃO** pertencem à lista `guardians`.
4. Salva a lista desses canais em `snapshot.channels_to_restore`.
5. Preenche `snapshot.active = true`, `snapshot.timestamp = now()`, `snapshot.scene_id = current_scene`, `snapshot.desk_name = env_desk_name`.
6. Grava atomicamente o JSON em disco.
7. Envia rajada SysEx/MIDI para a 01V96 mutando (`OFF`) apenas os canais de `channels_to_restore`.
8. Emite evento WebSocket `smart_toggler:status` para a UI indicando que a macro está ativa (modo corte).

---

### 3.2. Durante o Intervalo / Ações Manuais na Mesa Física
* O operador ou músicos podem interagir fisicamente com a mesa.
* Se um canal que estava na lista de corte for ligado manualmente na mesa física (ex: para afinar instrumento ou teste prévio de microfone), ele passa a estar `ON` na mesa.
* Os canais guardiões permanecem intocados e abertos durante todo o tempo.

---

### 3.3. Momento 2: Restauração Inteligente (Smart Restore)
1. O operador clica novamente no botão da macro.
2. O backend lê o estado atual dos canais na mesa física.
3. Para cada canal em `snapshot.channels_to_restore`:
   * Se o canal ainda estiver **`OFF`** $\rightarrow$ Dispara comando SysEx para ligar (**`ON`**).
   * Se o canal já estiver **`ON`** (aberto manualmente) $\rightarrow$ **Não mexe** (ignora o envio, economizando buffer MIDI).
4. Canais que não estavam na lista (ex: canais que já estavam `OFF` antes do corte inicial) **permanecem `OFF`**.
5. Limpa o bloco `snapshot` no JSON (`active: false`, `channels_to_restore: []`, `timestamp: null`, etc.).
6. Grava o JSON atualizado em disco.
7. Emite evento WebSocket `smart_toggler:status` para atualizar a UI.

---

### 3.4. Invalidação Automática & Resets

O bloco `snapshot` é automaticamente descartado (mantendo `guardians` intactos) sob as seguintes condições:

1. **TTL de 12 Horas:**
   * Se `now() - snapshot.timestamp > 12 * 3600`, o snapshot é descartado ao iniciar o servidor ou ao receber novo comando.
2. **Troca de Cena (*Scene Recall* na 01V96):**
   * Ao detectar `Program Change` / `Scene Recall` via SysEx na mesa, se a cena atual $\neq$ `snapshot.scene_id`, o snapshot é resetado imediatamente.
3. **Mesa Diferente:**
   * Se o `desk_name` atual no `.env` for diferente do registrado no snapshot, o snapshot é descartado.
4. **Reset Manual pelo Usuário:**
   * Acionado dentro do modal de configurações do sistema de macros.
   * Não altera o estado atual de áudio/mutes na mesa física (assume o som atual do palco) e limpa a memória de restauração.

---

## 4. Integração WebSocket & API (Rust Backend)

### Eventos do Socket:
* `smart_toggler:toggle`: Aciona a alternância (Mute $\leftrightarrow$ Restore).
* `smart_toggler:reset`: Descarta o snapshot atual sem alterar o áudio da mesa.
* `smart_toggler:set_guardians`: Atualiza o array permanente de canais guardiões (`[1, 16]`).
* `smart_toggler:status`: Broadcast com o payload:
  ```json
  {
    "active": true,
    "guardians": [1, 16],
    "saved_count": 8,
    "scene_id": 1
  }
  ```

---

## 5. Interface Web (Frontend)

* **Botão da Macro no Grid de Macros:**
  * **Estado Ocioso/Desarmado:** Estilo padrão da macro.
  * **Estado Ativo (Corte Ativo):** Cor de destaque (ex: vermelho/alerta com badge indicando quantidade de canais silenciados).
* **Modal de Configurações das Macros:**
  * Seleção visual dos canais guardiões (Checkboxes dos 32 canais de entrada + ST INs).
  * Botão de ação: **`[ ↺ Resetar Memória do Toggle ]`** para descarte manual do snapshot.
* **Preservação de Comportamento:**
  * O *Long-Press* no botão continua dedicado à abertura do modal geral de configurações de macros.

---

## 6. Próximos Passos (Para Discussão e Refinamento)

1. Validação dos canais estéreo pareados (se um canal guardião for parte de um par, ambos são protegidos automaticamente).
2. Validação da integração com o arquivo de preset de macros ativo.
