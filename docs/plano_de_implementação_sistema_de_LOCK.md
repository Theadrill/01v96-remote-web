# Plano de Implementação: Sistema de Lock Manual e Persistente de Canais

Este documento detalha a arquitetura e os passos de execução para a criação do **Sistema de Lock de Canais** no `01V96 Remote Web`.

---

## 📌 Visão Geral & Requisitos

O recurso permite que usuários em Modo Técnico travem manualmente canais específicos (Inputs 0-31, Master, Mixes 0-7 e Buses 0-7) para evitar qualquer tipo de alteração acidental (toques, faders, mute/solo).

### Principais Características
1. **Ativação por Gesto Long-Press**: Pressionar por `3` segundos (configurável via tema) a área do cabeçalho (número/nome do canal).
2. **Modal de Confirmação**: Exibição do `ConfirmModal` antes de alternar o estado do travamento.
3. **Módulo Frontend Dedicado**: Toda a lógica será encapsulada em `public/modules/channel_lock.js`.
4. **Customização Visual e Comportamental via Tema (YAML)**: Suporte no `default.yaml` para tempo de retenção (`hold_duration_ms`), camada de renderização (`z_index`), classe do ícone FontAwesome (`icon_class`), opacidade e cores.
5. **Bloqueio Total de Interação**: O overlay adicionado possuirá `pointer-events: auto` e `z-index` elevado, cobrindo todo o canal e impedindo qualquer interação com faders, mutes ou botões.
6. **Sincronização em Tempo Real**: Estado mantido na memória do servidor Rust (`GlobalState`), refletindo em todas as instâncias ativas conectadas via Socket.IO.
7. **Exclusão do Macro Fader (Volume Geral)**: Canais travados serão ignorados pelo controle de Volume Geral/Macro Fader e exibidos como bloqueados no grid de configuração da Macro (estilo equivalente ao Musician Mode).

---

## 🏗️ Arquitetura e Escopo de Arquivos

### 1. Backend Rust

#### `server_rust/src/state.rs`
- Adicionar `pub locked_channels: std::sync::RwLock<std::collections::HashSet<String>>` à `GlobalState`.
- O uso de `RwLock` permite leituras concorrentes (múltiplos clientes CONSULTANDO o estado simultaneamente) e escritas exclusivas (atualização do lock), otimizando performance.

#### `server_rust/src/socket_handlers.rs`
- Adicionar listener para o evento `toggle_channel_lock`.
- **Validação de Canal no Backend**: Filtrar requisições com IDs inválidos ou não suportados (`ST IN`, `FX`, etc.) antes de alterar o estado.
- Transmitir evento `locked_channels_update` apenas quando houver mudança real no `HashSet` do backend (evitando broadcast desnecessário).
- Incluir `lockedChannels` na resposta do event `fullState`.

### 2. Frontend

#### `public/modules/channel_lock.js` *(NOVO)*
- Gestão de timers, modal de confirmação, validações de canal e atualização da interface de sobreposição.
- **Helper de Validação**: Função `isValidChannel(id: string): boolean` que verifica se o ID corresponde a um canal suportado (`CH1..32`, `MASTER`, `MIX1..8`, `BUS1..8`).

#### `public/modules/channel_strip.js`
- Injeção de escutadores de eventos via **PointerEvents** nativos:
  - `pointerdown` — inicia o temporizador do long press.
  - `pointerup` / `pointercancel` — valida se o tempo mínimo foi atingido antes de confirmar o lock.
  - `pointermove` — verifica se o usuário está apenas rolando a página (`isDragging`). Se sim, cancela imediatamente o temporizador e reseta o estado visual (evita travamento acidental).

#### `public/modules/volume_geral.js` & `public/modules/macro_fader.js`
- Exclusão de canais travados no cálculo de variação da Macro.
- Grid do Macro Fader exibe o canal bloqueado e desabilitado.

#### `public/styles/channel_lock.css` *(NOVO)*
- Estilização do overlay `.channel-lock-overlay`.
- Classificadores para estados: `.channel-lock-overlay.locked`, `.channel-lock-overlay.hovering`.

---

## 🎨 Estrutura de Configuração no Tema YAML

```yaml
# ─── CHANNEL LOCK ─────────────────────────────────────────────
# Overlay visual e comportamento de bloqueio de canal (channel_lock.js)
channel_lock:
  hold_duration_ms: 3000      # Tempo em milissegundos pressionado para abrir o modal de lock
  z_index: 100                 # Camada de profundidade da sobreposição do lock
  icon_class: "fa fa-lock"     # Classe do ícone FontAwesome
  overlay_bg: "rgba(0, 0, 0, 0.78)"
  overlay_backdrop_filter: "blur(2px)"
  icon_color: "#ff4444"
  icon_size: "32px"
  border_locked: "2px solid #ff4444"
  badge_bg: "#ff4444"
  badge_text_color: "#ffffff"

# ─── VALIDATION ──────────────────────────────────────────────
# Canais permitidos para travamento (usado no backend e no frontend)
channel_lock:
  valid_channels:
    - CH1
    - CH2
    - ...
    - CH32
    - MASTER
    - MIX1
    - MIX2
    - ...
    - MIX8
    - BUS1
    - BUS2
    - ...
    - BUS8
```

---

## 🧪 Roteiro de Validação e Testes

### 1. Thread-Safety no Backend Rust
- Múltiplos clientes solicitando `toggle_channel_lock` simultaneamente devem não corromper o estado do `HashSet`.
- Leituras concorrentes (`RwLock` permite múltiplas leituras) devem retornar a mesma versão consistente do estado.

### 2. Validação de Canais Permitidos (Frontend & Backend)**
- Tentar travar CH1..32, MASTER, Mix1..8, Bus1..8 -> Funciona e atualiza o estado.
- Tentar travar ST IN ou FX -> Ignorado silenciosamente no backend; feedback visual no frontend indicando canal não suportado.

### 3. Tempo do Long-Press (PointerEvents)**
- Pressionar por menos do tempo configurado (`hold_duration_ms`) -> Nada acontece.
- Pressionar pelo tempo total -> Abre modal de confirmação e altera o estado.
- **Teste de cancelamento por dragging**: Mover o mouse no canal durante a pressão deve cancelar imediatamente o temporizador (sem travamento).

### 4. Impedimento de Interação**
- Canal travado bloqueia movimento de fader, botão Mute, Solo ou Select.
- Overlay tem `pointer-events: auto` e `z-index` elevado sobre todos os controls do canal.

### 5. Exclusão com Macro Fader**
- Canal travado não responde ao movimento do Macro Fader.
- Grid do Macro Fader exibe o canal bloqueado, desabilitado (cursor não mudável).

### 6. Sincronia Múltiplas Instâncias**
- Travar em uma instância reflete instantaneamente em outras conectadas via Socket.IO.

---

## 📋 Resumo das Mudanças Implementadas

| # | Consideração | Status no Plano |
|---|--------------|-----------------|
| 1 | Thread-Safety (`RwLock`) no Rust | ✅ Adicionado a `state.rs` |
| 2 | Estrutura de dados (`HashSet` vs `Vec`) | ✅ Substituição de `Vec<String>` por `HashSet<String>` |
| 3 | Validação de canais (frontend + backend) | ✅ Helper `isValidChannel()` e filtro no handler |
| 4 | PointerEvents & cancelamento por drag | ✅ Implementação via `pointerdown`, `pointerup`, `pointermove` |
| 5 | Otimização Socket.IO (enviar só em mudança) | ✅ Conditional broadcast baseado em `HashSet` diff |
