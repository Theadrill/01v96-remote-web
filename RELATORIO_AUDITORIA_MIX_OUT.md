# 📋 RELATÓRIO DE AUDITORIA — TELA MIX/OUT (public_new)

---

## Resumo Executivo

Realizada auditoria completa dos callbacks da tela MIX/OUT (`public_new`) contra o dicionário de protocolos (`dictionary.json`), módulos `protocol.rs`, `pan.rs` e `state.rs`. A auditoria identificou **2 achados CRÍTICOS CONFIRMADOS** envolvendo solo de MIX/BUS e pan de BUS, ambos resultando em comportamento incorreto no envio de comandos MIDI para a mesa:

1. **MIX 1-8 solo_toggle (channels 36-43)**: Comandos enviados para build_change que não remapeiam canais globais 36-43, causando aroso de solo na entrada ao invés da saída (elemento 46 vs 47)
2. **BUS 1-4 solo_toggle (channels 44-47)**: Falem na faixa 40-47 que é interpretada como MIX outputs, causando canais incorretos (canais 12-15 = MIX 5-8 ao invés de BUS 1-4 com canais 0-3)

Um achado foi **REFUTADO** (BUS pan_change setPan / build_pan_change), pois representa um design intencional do código original que não foi portado corretamente para Rust — o comportamento de retornar None para canais não suportados é consistente com o Node.js original, não comporta um bug de portagem.

**Lacunas de cobertura identificados**:
- Falta de protocolos Master On/Off (kMixMasterOn/kChannelOn, kBusMasterOn/kChannelOn, kStInOn/kChannelOn) que não existem no dictionary.json
- Não verificado: macros Core, Volume Geral, Smart Channel Toggler, Channel Setup Routing, Aux Sends, elementos não callbacks, rate limiting
- Master Solo não implementado via MIDI

---

## 📊 Detalhamento por Seção (MIX, BUS, ST IN, Master)

### MIX 1-8 (global channels 36-43)

**Callbacks auditados:**
- `fader_change` → kAUXFader/kFader → Elemento 30 (AUX fader)
- `on_toggle` → kAUXChannelOn/kChannelOn → Elemento 32 (AUX channel on/off)
- `solo_toggle` → kSetupSoloChOn/kSoloChOn → Elemento 46 (INPUT SOLO) **[INCORRETO]**

**Detalhe do achado:**
O MIX solo_toggle envia canais globais 36-43 (ex: MIX 1 → 36, MIX 8 → 43). O server só remapeia canais 40-47 (MIX outputs) e 48-55 (BUS outputs) para solo de saída (elemento 47). Os canais 36-43 (MIX 1-4) não atendem a nenhuma condição de remapeamento, passam direto para elemento 46 (solo de entrada) em vez de 47 (solo de saída). Enquanto fader_change e on_toggle funcionam porque usam prefixos kAUX que disparam o bloco de remapeamento 36-43→0-7 no `build_change`.

---

### BUS 1-8 (global channels 44-51)

**Callbacks auditados:**
- `solo_toggle` → kSetupSoloChOn/kSoloChOn → Elemento **[INCORRETO para 44-47]**
- `pan_change` → kPan via build_pan_change → kInputChannelPan/kChannelPan (elemento 27) → **[None (bool)]**

**Detalhes dos achados:**

#### BUS 1-4 solo_toggle (channels 44-47) — **CRÍTICO**
Canais 44-47 (BUS 1-4) caem na faixa 40-47 que o `build_change` interpreta como MIX outputs. Isso remapeia para elemento 47 com o canal-32 (ex: BUS 1 com global 44 → elemento 47, canal 12 = MIX 6 no hardware). O esperado seria elemento 47 com canal-48 (ex: elemento 47, canal 0 = BUS 1). Não existe discriminação entre MIX 44-47 e BUS 44-47 no server porque a faixa 40-47 está hardcodeada para MIX.

#### BUS 1-8 pan_change setPan — **REFUTADO (design original)**
O frontend emite `setPan` com canais 44-51, que não são suportados por `global_channel_to_pan_index` (apenas 0-31 inputs, 52 master, 60-67 ST IN). No código Rust, `build_pan_change` retorna None, nenhum pacote MIDI enviado. O achado sugere que BUS pan deveria usar `kBusBalance/kBalance` (elemento 42, section 127, group 1) via `build_change`.

**CRÍTICA DE REFUTAÇÃO:**
Este achado é falso positivo — o code Rust replica fielmente o Node.js original. Em `outs_view.js` (linhas 224-231), BUS pan_change emite `setPan` exatamente como em `pan.js` original. Em `socket_handlers.rs`, `build_pan_change` retorna None para 44-51 exatamente como `globalChannelToPanIndex` retornava null para BUS/AUX/MATRIX no Node.js original. O resultado de nenhum envio de SysEx é intencional em ambos os sistemas. O dicionário possui `kBusBalance/kBalance`, mas esse é usado apenas pelo caminho `control`, nunca pelo evento `setPan`. Portanto, não é um bug de portagem.

---

### ST IN 1-4 (global channels 60-67)

**Status:** Não identificado achados críticos durante esta auditoria. Este elemento usa a faixa 60-67 que é corretamente remapeada pelo `build_change` (linhas 162-167 em protocol.rs).

**Nota:** Callbacks não verificados nesta auditoria: Solo Replace, Smart Channel Toggler.

---

### Master (global channel 52)

**Status:** Não identificado achados críticos. Elemento Master não possui callbacks auditados (SL, MUTE, SOLO/MIX solo não foram verificadas transitivamente).

**Lacuna:** Falta verificação de protocolos Master On/Off (kMixMasterOn/kChannelOn, kBusMasterOn/kChannelOn, kStInOn/kChannelOn) que não apareceram nem no dicionário nem nos callbacks verificados.

---

## 🔍 Achados Críticos (CONFIRMADOS)

### Achado 1: MIX 1-4 Solo Não Mapeado → Solo de Entrada
- **Tipo:** seati 46 (INPUT SOLO) ao invés de 47 (OUTPUT SOLO)
- **Área:** MIX 1-8 fader_change, on_toggle, solo_toggle
- **Canais globais:** 36-43
- **Protocolo:** kSetupSoloChOn/kSoloChOn
- **Marque commit:** protocol.rs linhas 148-157
- **Evidência:** outs_view.js linha 106, `socket.emit('control', { type: 'kSetupSoloChOn/kSoloChOn', channel: gId })` com `gId = 36 + m` (m=0..7)

**Correção sugerida:**
Add branch de remapeamento para 36-43 em build_change:
```rust
(36..=43).contains(&channel) => {
    element = 47;
    final_channel = channel - 28; // 36→8, 43→15
}
```

Ou, alternativamente, mudar o frontend MIX solo_toggle para emitir channels 40-47 em vez de 36-43 (como em outs_view.js linha 106, mudar `gId`)

---

### Achado 2: BUS 1-4 Solo Confundido com MIX 1-4 Solo
- **Tipo:** Solo remapeado como MIX outputs (canais 12-15 = MIX 5-8) ao invés de BUS outputs (canais 0-3)
- **Área:** BUS 1-4 solo_toggle
- **Canais globais:** 44-47
- **Protocolo:** kSetupSoloChOn/kSoloChOn
- **Evidência:** protocol.rs linhas 148-157, outs_view.js linha 211

**Correção sugerida:**
O server precisa discriminar MIX vs BUS. Opções:
(a) Frontend envia solo com canais remapeados: 44-47 para MIX 1-4 e 48-55 para BUS 1-8
(b) Server recebe hint de tipo distinguindo MIX de BUS

---

## ⚠️ Achados Suspeitos

**Nenhum** — todos os achados foram verificados e 1 foi refutado.

---

## ✅ Callbacks Corretos (Superiores)

As seguintes callbacks foram validados como CORRETAS durante a auditoria cruzada entre frontend, dictionary.json, protocol.rs e pan.rs:

- `MIX fader_change` → kAUXFader/kFader (elemento 30) — Remapeia corretamente 36-43 para 0-7
- `MIX on_toggle` → kAUXChannelOn/kChannelOn (elemento 32) — Remapeia corretamente 36-43 para 0-7
- `BUS 5-8 fader_change` → kBusFader/kFader (elemento 42) — Remapeia corretamente 48-55 para 0-7
- `BUS 5-8 on_toggle` → kBusChannelOn/kChannelOn (elemento 42) — Remapeia corretamente 48-55 para 0-7
- `ST IN 1-4 solo_replace` → kSetupSoloReplace/kSoloReplace (elemento 29) — Testado em state.rs linha 671-682
- `Solo Replace` com Channel 52 (Master) — Reconhecido como intenção correta

---

## 📌 Observações sobre Send-on-Faders

- **Status:** Não verificado explicitamente
- **Pértinentes:**
  - Missing MUTE (Master Mute solo mode toggle)
  - Missing Output SOLO (Clear Solo solo mode toggle)
  - FX Sync timeout handling não verificado (FX sync pode expulsar comandos não acked)

---

## 🎯 Recomendações Prioritárias

### 🔴 ALTA PRIORIDADE (Esta sessão)
1. **Implementar correção para MIX 1-4 solo** (channels 36-43)
   - Adicionar branch remapeamento 36-43 → elemento 47, canal-28 (que mapeia para MIX 1-8 outputs)
   - Ou alterar frontend MIX solo_toggle para emitir 40-47

2. **Resolver conflito BUS 1-4 vs MIX 1-4 solo** (channels 44-47)
   - Definir strategy de discriminação: frontend type hint ou remap de canais

3. **Implementar Master Solo via MIDI** (clearAllSolos)
   - Atualmente não envia kSetupSoloChOn/kSoloChOn, apenas atualiza UI

4. **Investigar build_pan_sync_requests**
   - Ver por que não existe kBusBalance/kBalance em build_pan_sync_requests
   - Se BUS pan é implícito como "não suportado", adicionar comment/discussion

### 🟡 MÉDIA PRIORIDADE (Próxima sessão)
5. **Auditar protocolos Master On/Off**
   - Verificar se kMixMasterOn/kChannelOn, kBusMasterOn/kChannelOn, kStInOn/kChannelOn devem existir em dictionary.json

6. **Auditar macros e componentes extras não callbacks**
   - plugins/macro/core.js
   - plugins/volume_geral/
   - plugins/smart_channel_toggler/
   - plugins/channel_setup_routing/
   - plugins/auxs_sends.js

7. **Verificar rate limiting e flood prevention**
   - Concorrência múltiplas cópia/uso de setPan
   - Buffer MIDI congestion
   - Timeout de MIDI

8. **Cobrir rate limiting e flood prevention**
   - Sem verificação de concurrency para setPan duplicate
   - Sem delay inter-comando entre packets MIDI, sem verificações explícitas

---

## 📏 Limitações da Auditoria

A auditoria não verificou:
- **Callback não auditados** (macros core, volume geral, smart channel toggler, channel setup routing, aux sends)
- **Elementos não callbacks** (setpoints SFX y sends, pre-point selector, meter audit)
- **Token Managers** (no build_change)
- **Rate Limiting e Flood Prevention** (sem verificações explícitas)
- **Bus Balance Sync** (kBusBalance/kBalance não implementado em build_pan_sync_requests)

**Apertos com ST IN:**
- Estilos Copy-paste (setPan vs kSetupSoloChOn usam tipos e canais corretos para ST IN?)
- Performance Notifier (flood control)
- Outliers Detector (peak/avg/30s origem não verificada)
- Compressor Control / EQ Control (timer de controlamento)
- Notifier (slirping vs notificar múltiplos com delay)
- Bypass All (kBusBypassAll/kBypassAll)
- Insert FX (`kSetupInsertFXOn/kInsertFXOn` com canal global ou token manager?)
- Layer FX (similar ao Insert)
- Copy All Layers / Delete / Copy All FX / Delete FX (sinônimos)

**Achados false positives:**
- BUS pan_change (setPan → build_pan_change → None): Real é design original, não bug de portagem

---

*Gerado em: 06-09-2026*
*Autor: Claude Code (subagent de auditoria)*
*Área de foco: MIX/OUT screen (public_new)*