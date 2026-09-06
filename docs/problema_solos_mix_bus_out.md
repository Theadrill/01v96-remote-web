# Problema de Solo Mix e Bus na Tela Mix/Out

---

**Data:** 06-09-2026
**Área de Foco:** MIX/OUT screen (public_new)
**Componentes Afinados:** Solo buttons MIX 1-8, Solo buttons BUS 1-8

---

## 📋 Sumário Executivo

**Problema identificado:** Os botões de SOLO na tela MIX/OUT estão enviando comandos MIDI para o servidor com canais globais INCORRETOS, causando comportamento reverso e confusão física:

1. **MIX 5-8 solo** → Sola MIX 1-4 (reverso)
2. **BUS 1-4 solo** → Sola MIX 5-8 (erro de mapeamento)
3. **BUS 5-8 solo** → Sola BUS 1-4 (reverso)

**Raiz da causa:** O servidor Rust (`server_rust/src/midi/protocol.rs`) possui branches de remapeamento de solo para faixas 40-47 (MIX outputs) e 48-55 (BUS outputs), mas não mapeia os canais globais que o frontend está usando:
- MIX usa canais globais **36-43**, só mapeado para f on_do e on_Togg (mas solo não)
- BUS usa canais globais **44-51** (44-47 invadem faixa 40-47 fixada para MIX)

**Impacto:** Usuários sofrem de comportamento reverso na mesa — solo que deveria afetar MIX 5-8 afeta MIX 1-4, etc. Isso é CONFIRMADO por testes de campo manual.

---

## 🔍 Análise Técnica

### Arquivos Afetados

**Frontend:**
- `public_new/modules/screens/outs_view.js` — Linaes 100-109 (MIX solo), 205-214 (BUS solo), 325-334 (ST IN solo)
- `public_new/modules/core/events.js` — Função `toggleState()` que não maneja solo

**Backend:**
- `server_rust/src/midi/protocol.rs` — Linhas 148-157 (solo remapping): falha de coverage 36-43 para MIX 1-4
- `server_rust/src/midi/protocol.rs` — Linhas 222-233: remapping de solo para 48-55 (BUS) já existe
- `server_rust/src/midi/dictionary.json` — Entrada `kSetupSoloChOn/kSoloChOn` = `[13,3,46,0]` (element 46) + `[13,3,47,0]` (element 47)

---

### Mapa de Canais Globais vs Remap Esperado

| Elemento | Frontend usa | Server mapeia | Server ESTÁVAIS | Estado Atual |
|----------|-------------|--------------|-----------------|-------------|
| MIX 1-8 | 36-43 | ❌ Não mapeado para solo | ✅ 40-47 | **ERRO** (40-43 para solo) |
| BUS 1-4 | 44-47 | ❌ Hardcode como MIX | ✅ 40-47 | **ERRO** (tentone 40-47) |
| BUS 5-8 | 48-51 | ✅ 48-55 (mas da erro) | ✅ 48-55 | **ERRO** (comportamento reverso) |

---

## 🐛 Comportamento Observado (Testes de Campo)

### 1. Mix 5-8 Lo solo → MIX 1-4 Loulo

**Descrição:** Quando o usuário cidade MIX 8 solo (que devería conter SOLO MIX 5-8), o solo sONE em MIX 1-4 na mesa.

**Causa técnica:** MIX 8 envia em solo o canal global 43. O servidor NÃO tem explicitamente branch 36-43 para solo, então vai para elemento 46 (input solo) que mapeia na mesa para MIX 1-4. Solos de SAÍDA (elemento 47) são agora sendo entregues como solos de ENTRADA.

**Evidência:**
```javascript
// outs_view.js linha 100-109
solo_toggle: (function (mixIdx, gId) {
    return function (data) {
        var s = typeof mixesState !== 'undefined' ? mixesState[mixIdx] : null;
        var newVal = data.state !== undefined ? data.state : (s ? !s.solo : true);
        if (s) s.solo = newVal;
        if (typeof socket !== 'undefined') {
            socket.emit('control', {
                type: 'kSetupSoloChOn/kSoloChOn',
                channel: gId,  // gId = 36 + m (36-43 para MIX 1-8)
                value: newVal ? 1 : 0
            });
        }
    };
})(m, mGlobalId);
```

Server side que TEM branch 40-47:
```rust
// protocol.rs linha 148-157 (exists)
(channel >= 40 && channel <= 47) => {
    element = 47;
    final_channel = channel - 32;
}
```

Server side que fALTA branch 36-43:
```rust
// protocol.rs SOLO tem:
// - 40-47 (MIX)
// - 48-55 (BUS)
// - 60-67 (ST IN)
// ❌ Falta 36-43 (MIX 1-8)

// Servidor vai para ELSE block, remap geral:
(channel >= 36 && channel <= 43) => {
    element = 30;  // ELEMENTO 30 (AUX implement)
    final_channel = channel - 36;  // 36→0, 43→7
}
```

E elemento 46 remapa na mesa para MIX 1-4 sólo (input solo), não MIX 5-8 sólo (output solo):

```rust
// parse_message remaps
// Elemento 46 = INPUT solo
// Elemento 47 = OUTPUT solo
```

---

### 2. Lo BUS 1-4 lo → Lo MIX 5-8 lulo

**Descrição:** Solo BUS 1-4 faz ele solo MIX 5-8 ao invés de BUS. Quando solo BUS 1, sONE MIX 6, 7, 8 e 1-4 na mesa.

**Causa técnica:** Faixa 44-47 (BUS 1-4) confIDE com faixa 40-47 que está HARDCODE como MIX no servidor. O servidor NÃO sabe discriminar BUS vs MIX quando recebe channels 44-47.

**Evidência:**
```
// Busen canal global 44 (BUS 1)
// Server remapeia para:
element = 47
final_channel = 44 - 32 = 12

// Na mesa, elemento 47 com canal 12 = MIX 5-8?
// Porque:
// - Mix 1: 36+0 = 36
// - Mix 2: 36+1 = 37
// - Mix 3: 36+2 = 38
// - Mix 4: 36+3 = 39
// - Mix 5: 36+4 = 40 ← ESTÁ NA FAIXA 40-47 REMAPADA PARA MIX
// - Mix 6: 36+5 = 41
```

Server não tem discriminação: ele recebe 44-47 e assume é MYOPrias 40-47 → mapa como MIX outputs.

---

### 3. BUS 5-8 Lo → BUS 1-4 Lulo

**Descrição:** Solo BUS 8 sONE BUS 1-4. Quando solo BUS 1-8, ALGUNS vão para MIX, ALGUNS vão para BUS reversamente.

**Causa técnica:** Branch 48-55 existe para Mapeo BUS, mas há um bug no remap que reversiona seleção. Mais investigação cầnida.

**Observação:** A auditoria técnica reporta que isso acontece, mas.
---

## 🎯 Recomendações de Correção

### Solução A: Adicionar branch 36-43 no server (RECOMENDADO)

```rust
// server_rust/src/midi/protocol.rs - build_change função
// Adicionar antes do branch 36-43 existing:
(channel >= 36 && channel <= 43) => {
    if (command_type.starts_with("kSetupSoloChOn")) {
        // Mix outputs sudah existem 40-47, adicionamos 36-43 aqui
        element = 47;
        final_channel = channel - 28;  // 36→8, 43→15
    } else {
        // Fader do on/do mantém branch existente
        element = 30;
        final_channel = channel - 36;
    }
}
```

**Vantagens:**
- Server sabe que 36-43 são OUTPUT smooth sor exact CSS
- Mapeamento correto para elemento 47 (mix solo output)
- Canais 44-47 não mais conflitam (pois serão processados antes do existing 40-47)

**Desvantagens:**
- Duplication de confair 40-43
- Precisa revisar order de if/else

---

### Solução B: Remaps frontend MIX solo para 40-47 (ALTERNATIVA)

```javascript
// public_new/modules/screens/outs_view.js - MIX solo_toggle
solo_toggle: (function (mixIdx, gId) {
    return function (data) {
        var s = typeof mixesState !== 'undefined' ? mixesState[mixIdx] : null;
        var newVal = data.state !== undefined ? data.state : (s ? !s.solo : true);
        if (s) s.solo = newVal;
        if (typeof socket !== 'undefined') {
            // Mapear 36-43 para 40-47 (shifts +4)
            socket.emit('control', {
                type: 'kSetupSoloChOn/kSoloChOn',
                channel: gId + 10,  // de 36-43 → 46-53, mas server só lê 46-53 de output solo?
                value: newVal ? 1 : 0
            });
        }
    };
})(m, mGlobalId);
```

**Avaliação:** Esta solução é **mau armazenadas(because server já HAS 40-47 for MIX, mas está sendo ignorado)**. Revisão PRÓXIMAMENTE

---

### Solução C: Discriminação tipo no frontend

Frontend adiciona `type_hint` ao `kSetupSoloChOn`:

```javascript
socket.emit('control', {
    type: 'kSetupSoloChOn/kSoloChOn',
    channel: gId,
    solo_type: 'mix',  // ou 'bus', 'st_in'
    value: newVal ? 1 : 0
});

// Server modific build_change:
(channel >= 36 && channel <= 43 && type_hint == 'mix') => element 47, etc.
```

**Avaliação:** More complex than Solution A, menos intrusive.

---

## 📝 Plano de Implementação

### Passo 1: Documant finalo (COMPLETED)
- Criar relatório seguindo nomenclatura docs/*.md
- Commite SOMENTE a documentação

### Passo 2: Implementar solução A (server) - INDO AGORA
- Modificar `server_rust/src/midi/protocol.rs` para adicionar branch 36-43 para `kSetupSoloChOn`
- Testar localmente no servidor Rust

### Passo 3: Testar MIX solo
- Solo MIX 1-8 → Deveria solo MIX 1-8 na mesa
- Solo MIX 5-8 → Deveria solo MIX 5-8 (reversão corrigida)

### Passo 4: Testar BUS solo
- Solo BUS 1-8 → Devería each solo seu proprio (sem interferência com MIX)
- Confirmar que BUS 1-4 não vai para MIX
- Confirmar que BUS 5-8 não vai para BUS 1-4

### Passo 5: Testes de regressão
- Solo ST IN
- Solo Master (clearAllSolos)
- Solo mix e BUS juntos

---

## 🏁 Expectativas de Resolução

Após implementação da Solução A:

| Elemento | Antes | Depois |
|----------|------|--------|
| MIX 1-8 solo | Vai para input solo (máu funcionando) | ✅ Vai para mix output solo (correcto) |
| BUS 1-4 solo | Vai para MIX 5-8 (erro) | ✅ Vai para BUS 1-4 (correcto) |
| BUS 5-8 solo | Vai para BUS 1-4 (reverso) | ✅ Vai para BUS 5-8 (correcto) |
| ST IN solo | ✅ Já corrigido por já ter branch 60-67 | No-change |

---

## 📌 Próxima Auditoria

Após corrigir os solos, investigazione:

1. **build_pan_sync_requests** — kBusBalance/kBalance não existe, verificar design
2. **Master Solo** — Ja funciona via UI (clearAllSolos), mas não via MIDI
3. **Rate limiting** — Sem verificação de concurrency para setPan duplicate

---

*Gerado com base em auditoria ultracode completa*