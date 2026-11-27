# 🔍 Relatório Técnico: Investigação de Sync — EQ do Master, HPF nos Outs e Pontos Relacionados

**Data:** 27/11/2026  
**Escopo:** `public_new`, `public` e `server_rust`  
**Status:** Investigação concluída (aguardando aplicação das correções)

---

## 1. Resumo Executivo

| # | Severidade | Camada | Problema | Requer reiniciar servidor? |
|---|---|---|---|---|
| **1** | **Alta** | Frontend (`public_new` e `public`) | EQ (e Compressor) do canal **MASTER** não sincroniza entre PCs | **Não** (apenas F5) |
| **2** | **Alta** | Frontend + Backend (`sync_manager.rs`) | **HPF dos Outs (AUX/BUS/Master)** exibindo ON no início quando na mesa está OFF | Parcial (Frontend não; Master/ST IN no sync inicial sim) |
| **3** | **Média** | Frontend (`socket.js`) | Echo de **ATT (Atenuador)** dos Outs (MIX/BUS) não atualiza o slider em outro PC | **Não** (apenas F5) |
| **4** | **Média** | Backend (`state.rs`, `sync_manager.rs`, `pan.rs`) | **ATT e Pan** de MIX/BUS não persistem no estado do servidor | **Sim** |
| **5** | **Baixa** | Frontend (`socket.js`) | Botão `#sideBtnEQOn` não atualiza visualmente ao receber `kEQOn` remoto | **Não** (apenas F5) |
| **6** | **Baixa** | Frontend (`socket.js`) | ID global do **ST IN** calculado como `60 + (i - 32) * 2` no `sync` (deveria ser `60 + (i - 32)`) | **Não** (apenas F5) |
| **7** | **Baixa** | Backend (`sync_manager.rs`) | Loop `kSTIn*` é código morto (chaves inexistentes no `dictionary.json`) | **Sim** (limpeza opcional) |

---

## 2. Investigação Detalhada

### 2.1. EQ (e Compressor) do Canal MASTER não sincroniza entre PCs

* **Arquivos afetados:**
  * `public_new/modules/services/socket.js` (linhas 172–181)
  * `public/modules/socket.js` (linhas 164–173)

* **Causa raiz confirmada:**
  No listener `socket.on('update', (d) => ...)`, existe um bloco de retorno antecipado logo no início:
  ```javascript
  if (d.channel === 'master' || d.type.startsWith('kStereo')) {
      if (d.type === 'kStereoFader/kFader') updateUI('master', d.value, undefined, undefined);
      if (d.type === 'kStereoChannelOn/kChannelOn') updateUI('master', undefined, isTrue, undefined);
      if (d.type === 'kStereoAttenuator/kAtt') {
          if (masterState) masterState.att = d.value;
          const activeIsMaster = activeConfigChannel === 'master' || activeConfigChannel === 52;
          if (activeIsMaster && window.updateATTUI) window.updateATTUI(d.value);
      }
      return;
  }
  ```
* **Fluxo do bug:**
  1. O PC 1 altera um parâmetro de EQ do Master e envia `control` com `{ type: 'kStereoEQ/kEQ...', channel: 52, value: ... }`.
  2. O backend (`server_rust`) funciona corretamente: atualiza `self.master.eq`, envia o SysEx (elemento `82`) para a mesa física e faz broadcast de `update` para todos os clientes.
  3. O PC 2 recebe o evento `update`. Como `d.type.startsWith('kStereo')` é **`true`**, ele entra no `if`, não bate em Fader/ChannelOn/Attenuator e cai no **`return;`**, descartando o evento antes de chegar em `updateEQParam` (linhas 255 e 458) e `updateCompFromSocket` (linha 481).
* **Nota sobre Insert do Master:** O Insert do Master (`kStereoInsert/*`) **não** é afetado por esse `return;`, pois `patch_registry.js` (linha 1045) registra um listener próprio de `update`.
* **Detalhe secundário de UI:** Em `channel_setup_eq.js` (linha 641) e `public/modules/eq.js` (linha 626), `updateEQParam` atualiza `chState.eq.on`, mas não atualiza a classe `on-active` do botão `#sideBtnEQOn` da sidebar quando o `kEQOn` chega de outro cliente.

---

### 2.2. HPF dos Canais Auxiliares / Outs aparecendo ON no início quando na mesa está OFF

* **Arquivos afetados:**
  * `public_new/modules/screens/channel_setup/channel_setup_eq.js` (linhas 107–115 e 673–681)
  * `public/modules/eq.js` (linhas 92–100 e 658–666)
  * `server_rust/src/network/sync_manager.rs` (linhas 575–585 e 651–659)

* **Causa A — Regra de detecção da banda LOW no frontend:**
  ```javascript
  // Banda LOW (atual):
  if (lowQRaw === 41) {
      lowMode = 'lowshelf';
  } else if (lowQRaw >= 42 || lowHPFOn === 1) {
      lowMode = 'highpass';
  }
  ```
  Compare com a banda **HIGH (LPF)** logo abaixo (já corrigida no commit `db82b59` — *"fix: EQ LPF display mismatch"*):
  ```javascript
  // Banda HIGH:
  if (highQRaw === 41 || highQRaw === 42) {
      highMode = 'highshelf';
  } else if (highQRaw >= 43) {
      highMode = 'lowpass';
  }
  ```
  * O operador `||` (`lowQRaw >= 42 || lowHPFOn === 1`), introduzido no commit `f2fbb4f`, gera falso positivo de HPF ON em dois cenários:
    1. A mesa devolve `lowQRaw >= 42` (ex.: `42` ou `44`) com `lowHPFOn === 0` (HPF desligado na mesa), mas o `||` ignora `hpfOn === 0`.
    2. A mesa devolve `lowQRaw <= 40` (Peaking) com `lowHPFOn === 1` (mesmo problema que ocorria no `kEQLPFOn` antes do commit `db82b59`).

* **Causa B — Lacuna no sync inicial do backend (`sync_manager.rs`):**
  * Para **AUX 1–8** (linhas 597–604) e **BUS 1–8** (linhas 623–630), o servidor **solicita** `kEQHPFOn`, `kEQLPFOn` e `kEQLowQ`, e armazena corretamente em `mixes[i].eq.low` e `buses[i].eq.low`.
  * Porém, para **MASTER** (linhas 654–659) e **ST IN 1–4** (linhas 579–585), `sync_manager.rs` **não solicita** `kEQHPFOn`, `kEQLPFOn` nem `kEQMode`.
  * **Risco importante:** Se mudarmos a detecção do frontend para exigir `lowHPFOn === 1` sem antes adicionar o request de `kStereoEQ/kEQHPFOn` no backend, o HPF do Master deixará de aparecer no sync inicial (pois o servidor inicializa `master.eq.low.hpf_on` como `0.0`).

* **Comando de confirmação no Console (F12) com a mesa conectada:**
  ```javascript
  console.table(mixesState.map((m, i) => ({ mix: i + 1, q: m.eq?.low?.q, hpfOn: m.eq?.low?.hpfOn, hiQ: m.eq?.high?.q, lpfOn: m.eq?.high?.lpfOn })));
  console.table(busesState.map((b, i) => ({ bus: i + 1, q: b.eq?.low?.q, hpfOn: b.eq?.low?.hpfOn })));
  ```
  * Se aparecer `hpfOn = 0` com `q` entre 42 e 44 → confirma que a regra precisa respeitar `hpfOn === 1`.
  * Se aparecer `hpfOn = 1` com `q <= 40` → confirma que o parâmetro 4 da mesa está vindo `1` em Peaking (igual ao bug antigo do LPF).

---

### 2.3. Outros Achados no `public_new` e Backend

1. **Echo de ATT (Atenuador) dos Outs não atualiza o slider em outro PC (`socket.js` linhas 193–214):**
   * Quando outro PC altera ATT de MIX ou BUS, o servidor repassa o `control` com o canal global (`36..43` ou `44..51`).
   * O handler faz `activeConfigChannel === (36 + d.channel)` e `activeConfigChannel === (44 + d.channel)`. Com canal global isso vira `72..79` / `88..95`, nunca batendo com `activeConfigChannel`.
2. **ATT e Pan de MIX/BUS não persistem no estado do servidor:**
   * `MixBusState` em `server_rust/src/state.rs` não possui campo `att` (e `set_att` / `set_pan` nas linhas 1281–1282 são no-op).
   * `sync_manager.rs` não pede `kAUXAttenuator/kAtt` nem `kBusAttenuator/kAtt` (embora existam no `dictionary.json`).
   * `pan.rs` só mapeia Input (`0..31`, `60..67`) e Master (`52`).
3. **ID global do ST IN no `sync` (`socket.js` linha 741):**
   * Usa `60 + (i - 32) * 2` em vez de `60 + (i - 32)`. Hoje é mascarado pelo `initUI()` ao final do `sync`, mas escreve no canal errado durante o loop.
4. **Loop `kSTIn*` morto em `sync_manager.rs` (linhas 480–512):**
   * Nenhuma chave `kSTIn*` existe em `dictionary.json`; os requests são descartados por `push_req` (os ST IN são sincronizados de fato pelo loop de `kInput*` para canais `32..39`). Apenas os requests de nome nesse bloco são efetivos.

---

## 3. O que pode ser corrigido SEM reiniciar o servidor (Ao Vivo)

Alterações **100% frontend** (basta dar F5 / recarregar a aba nos clientes, zero impacto no servidor Rust rodando):

1. **Corrigir o `return;` do bloco `kStereo` em `socket.js`** (`public_new` e `public`) → resolve imediatamente a sincronização entre PCs do **EQ do Master** e do **Compressor do Master**.
2. **Atualizar `#sideBtnEQOn` dentro de `updateEQParam`** → botão EQ ON da sidebar sincroniza em tempo real entre PCs.
3. **Normalizar o canal de `kAUXAttenuator/kAtt` e `kBusAttenuator/kAtt` em `socket.js`** → slider de ATT dos Outs passa a sincronizar entre PCs.
4. **Corrigir o cálculo do ID global de ST IN no `sync` (`socket.js:741`)**.
5. **HPF dos Outs (AUX/BUS) no frontend** *(após confirmar os valores com `console.table`)*: pode ser ajustado no frontend para `mixes`/`buses` (e sem quebrar o Master se respeitarmos a condição adequada).

## 4. O que deve ficar para depois do show (requer rebuild/restart do `server_rust`)

1. Adicionar `kStereoEQ/kEQHPFOn`, `kStereoEQ/kEQLPFOn`, `kStereoEQ/kEQMode` e equivalentes dos ST IN no `sync_manager.rs`.
2. Persistência e sync de `att` (e eventual `pan`) em `MixBusState` (`state.rs` + `sync_manager.rs`).
3. Limpeza do loop morto `kSTIn*` em `sync_manager.rs`.
