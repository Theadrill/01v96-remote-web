# Plano de Implementacao — Bus Routing / ETC

Habilitar a aba **ROUTING / ETC** para os Buses (44-51) na tela de configuracao de canal.

---

## Regras de Ouro

1. **O sync inicial (`sync_manager.rs`) e a parte mais critica e sensivel do projeto.** Ele e responsavel por trazer o estado completo da mesa para o software. Qualquer erro ali afeta tudo. Deve ser a parte **menos modificada** possivel — so mexer quando estritamente necessario e com extrema cautela.

2. **Commits so sao permitidos quando o usuario EXPLICITAMENTE pedir**, um por um. Nunca commitar por conta propria.

## 1. O que e possivel nos Buses da 01V96

| Recursos do Canal (0-31) | Buses (44-51) | Observacao |
|--------------------------|---------------|------------|
| Input Patch (kChannelInput/kChannelIn) | **NAO** | Buses nao tem patch de entrada |
| Bus Assignment (kInputBus/kBusN) | **NAO** | Buses IS the bus |
| Stereo Master (kInputBus/kStereo) | **SIM** | Atribui bus ao master L/R |
| Insert On/Position | **SIM** | `kBusInsert/kInsertOn`, `kBusInsert/kInsertLocInsert` |
| Insert Input Patch | **SIM** | `kBusInsertInput/kBusInsertIn` (element 7) |
| Pair (estereo) | **SIM** | Ja implementado em `kBusPair/kPair` |

---

## 2. Enderecos SysEx (Ja definidos no dictionary.json)

### 2.1. Insert On/Off — `kBusInsert/kInsertOn`
- **Endereco**: `[127, 1, 40, 0]` (element 40, param 0)
- **Canal**: `00` a `07` (Bus 1-8)
- **Valores**: `0` = OFF, `1` = ON

### 2.2. Posicao do Insert — `kBusInsert/kInsertLocInsert`
- **Endereco**: `[127, 1, 40, 2]` (element 40, param 2)
- **Canal**: `00` a `07`
- **Valores**: `0` = Pre EQ, `1` = Pre Fader, `2` = Post Fader

### 2.3. Insert First (auxiliar) — `kBusInsert/kInsertLocInsertFirst`
- **Endereco**: `[127, 1, 40, 1]` (element 40, param 1)
- Parece ser um offset/auxiliar. Pode ser necessario para setar a posicao correta.

### 2.4. Insert Input Patch — `kBusInsertInput/kBusInsertIn`
- **Endereco**: `[13, 2, 7, 0]` (section 13, group 2, element 7)
- **Param MSB**: `0` ( parametro fixo )
- **Param LSB**: `0` a `7` (bus index)
- **Valores**: Mesma tabela de patches do input (1=AD1..16=AD16, 25-40=Slot, 41-48=ADAT, etc.)

---

## 3. COLISAO CRITICA — Element 7

**`kBusInsertInput/kBusInsertIn` usa element 7, que e o MESMO element usado pelo FX output patch.**

No parser atual (`protocol.rs` linha ~961):
```rust
} else if [1, 2, 7, 8, 10].contains(&element) && param_msb == 0 {
    return Some(ParsedMidi::FxOutputUpdate { ... });
}
```

Element 7 e interpretado incondicionalmente como `FxOutputUpdate`. Isso significa:
- Quando enviamos `kBusInsertInput/kBusInsertIn` (element 7), a resposta e parseada como **FxOutputUpdate**, nao como ControlChange de bus insert.
- O two-pass de FX Outputs ja consulta element 7 (INSBUS, 8 canais) — esses dados sao os mesmos que o bus insert input retornaria.

**Solucao**: Nao e necessario criar um parser separado para element 7 como bus insert input. O dado ja e coletado pelo two-pass de FX Outputs (element 7, 8 canais). Basta mapear o `FxOutputUpdate` com `element=7` como fonte de dados para o bus insert input no state.

Alternativamente, se for necessario distinguir, criar flag `BUS_INSERT_ACTIVE` (analogoa `OUTPUT_PATCH_ACTIVE`).

---

## 4. Implementacao Camada por Camada

### 4.1. Rust — `state.rs`

**Adicionar campo `insert` ao `MixBusState`** (linha ~110):
```rust
pub struct MixBusState {
    pub value: f64,
    pub on: bool,
    pub solo: bool,
    pub name: String,
    pub name_chars: Vec<String>,
    pub comp: CompState,
    pub eq: EqState,
    pub paired: bool,
    pub paired_with: Option<usize>,
    pub pair_source: Option<usize>,
    pub insert: InsertState,  // <-- NOVO
}
```

**Inicializar** no construtor de `MixBusState` (linha ~278):
```rust
insert: InsertState { on: false, position: 0.0, patch_in: 0.0 },
```

**Adicionar handlers** na funcao `apply_midi` (proximo a linha 560, apos os handlers de input insert):
```rust
} else if mt == "kBusInsert/kInsertOn" {
    if let Some(bus) = self.buses.get_mut(channel) {
        bus.insert.on = cv;
    }
} else if mt == "kBusInsert/kInsertLocInsert" {
    if let Some(bus) = self.buses.get_mut(channel) {
        bus.insert.position = v;
    }
```

Para o `kBusInsertInput/kBusInsertIn`: ver secao 4.3 (protocol.rs parser).

### 4.2. Rust — `protocol.rs` — Parser

**Adicionar parsing para element 40** (bus insert ON/position), logo apos o handler do element 25 (linha ~996):
```rust
// --- BUS INSERT ON / LOCATION (element 40) ---
if element == 40 {
    let val = *data_bytes.last().unwrap_or(&0) as f64;
    if parameter == 0 {
        return cc("kBusInsert/kInsertOn", channel, val);
    } else if parameter == 2 {
        return cc("kBusInsert/kInsertLocInsert", channel, val);
    }
}
```

**Para `kBusInsertInput/kBusInsertIn` (element 7)**: Ver secao 3. O dado ja chega como `FxOutputUpdate` com `element=7`. Duas opcoes:

- **Opcao A (recomendada)**: No handler de `FxOutputUpdate` em `state.rs`, quando `element==7`, atualizar `buses[channel].insert.patch_in` alem de `fx_outputs`.
- **Opcao B**: Criar flag `BUS_INSERT_ACTIVE` e parser separado (mais complexo, evita duplicidade de dados).

### 4.3. Rust — `protocol.rs` — Build Requests

Nenhuma mudanca necessaria. `build_request("kBusInsert/kInsertOn", channel)` e `build_request("kBusInsert/kInsertLocInsert", channel)` ja funcionam via lookup no dictionary.json.

### 4.4. Rust — `sync_manager.rs`

**Adicionar 2 requests na sync de bus** (linha ~527, apos `kBusPair/kPair`):
```rust
push_req(&mut requests, "kBusInsert/kInsertOn", i);
push_req(&mut requests, "kBusInsert/kInsertLocInsert", i);
```

**Nao adicionar** `kBusInsertInput/kBusInsertIn` — o dado ja e coletado pelo two-pass de FX Outputs (element 7).

### 4.5. JavaScript — `globals.js`

**Adicionar `insert` ao `busesState`** (linha ~30):
```javascript
busesState.push({
    value: 0,
    on: false,
    solo: false,
    name: `BUS ${i+1}`,
    eq: DEFAULT_OUT_EQ(),
    paired: false,
    pairedWith: null,
    pairSource: null,
    insert: { on: false, position: 0, patch_in: 0 }  // <-- NOVO
});
```

### 4.6. JavaScript — `socket.js`

**Adicionar handlers** para os 2 novos tipos de mensagem (proximo a linha 247, apos os handlers de input insert):
```javascript
if (msg_type === 'kBusInsert/kInsertOn') {
    const busIdx = channel; // 0-7
    if (busesState[busIdx]) {
        busesState[busIdx].insert.on = !!value;
        // Re-renderizar ETC se o bus ativo for o configurado
        if (typeof activeConfigChannel !== 'undefined' && activeConfigChannel >= 44 && activeConfigChannel <= 51) {
            if (activeConfigTab === 'etc') renderRouting(activeConfigChannel);
        }
    }
}
if (msg_type === 'kBusInsert/kInsertLocInsert') {
    const busIdx = channel;
    if (busesState[busIdx]) {
        busesState[busIdx].insert.position = value;
        if (typeof activeConfigChannel !== 'undefined' && activeConfigChannel >= 44 && activeConfigChannel <= 51) {
            if (activeConfigTab === 'etc') renderRouting(activeConfigChannel);
        }
    }
}
```

Para `kBusInsertInput/kBusInsertIn`: Mapear a partir de `FxOutputUpdate` com `element=7` (ver secao 4.1/4.2).

### 4.7. JavaScript — `inserts.js`

**Modificar `openInsertModal()`** para detectar buses (44-51) e usar command names corretos:
- Se `ch >= 44 && ch <= 51`: usar `kBusInsert/kInsertOn`, `kBusInsert/kInsertLocInsert`
- Caso contrario: manter `kInputInsert/kInsertOn`, `kInputInsert/kInsertLocInsert`

**Modificar `toggleInsertOn()`**: Enviar o tipo correto baseado no canal.

**Modificar `setInsertPosition()`**: Enviar o tipo correto baseado no canal.

**Para o Insert Input Patch**: O `setInsertIn()` atual envia `kChannelInsertIn/kInsertIn`. Para buses, enviar `kBusInsertInput/kBusInsertIn` — MAS ver secao 3 sobre a colisao com element 7.

### 4.8. JavaScript — `routing.js`

**Modificar o gate de acesso** (linha 6):
```javascript
// DE:
if ((chIdx >= 36 && chIdx <= 52) && !(chIdx >= 60 && chIdx <= 67)) {
// PARA:
if ((chIdx >= 36 && chIdx <= 43) || chIdx === 52) {
```
Isso exclui Mixes (36-43) e Master (52), mas **inclui** Buses (44-51).

**Adicionar conteudo para buses** (apos o gate, antes do HTML principal):
Para buses, renderizar apenas:
1. **Insert** (On/Off + Posicao + Input Patch)
2. **Pair** (ja existe em `renderPairSection`)

Nao renderizar:
- Patch (buses nao tem input patch)
- Bus Grid (buses IS the bus)

Manter:
- Stereo Master (atribui bus ao master L/R)
- Insert (On/Off + Posicao + Input Patch)
- Pair (estereo)

**Estrutura HTML sugerida para buses**:
```javascript
if (chIdx >= 44 && chIdx <= 51) {
    container.innerHTML = `
        <div class="routing-container" style="display:flex; flex-direction:column; gap:25px; padding:15px; height:100%; overflow-y:auto;">
            <!-- Stereo Master -->
            <div class="routing-section">
                <p>Saida Master</p>
                <button onclick="toggleStereoAssignment(${chIdx})">STEREO L/R</button>
            </div>
            <!-- Insert -->
            <div class="routing-section">
                <p>INSERTS</p>
                <button onclick="window.openInsertModal(${chIdx})">CONFIGURAR INSERT</button>
            </div>
        </div>
    `;
    // Adicionar pair section
    const routeContainer = container.querySelector('.routing-container');
    if (routeContainer) routeContainer.innerHTML += renderPairSection(chIdx);
    return;
}
```

---

## 5. Ordem de Implementacao Recomendada

| Passo | Arquivo | Complexidade |
|-------|---------|-------------|
| 1 | `state.rs` — Campo `insert` no `MixBusState` + inicializacao | Baixa |
| 2 | `protocol.rs` — Parser element 40 (bus insert ON/position) | Baixa |
| 3 | `sync_manager.rs` — Adicionar 2 requests na sync de bus | Baixa |
| 4 | `globals.js` — Adicionar `insert` ao `busesState` | Baixa |
| 5 | `socket.js` — Handlers para kBusInsert/* | Media |
| 6 | `routing.js` — Habilitar ETC para buses + conteudo | Media |
| 7 | `inserts.js` — Suporte a buses (command names corretos) | Alta |
| 8 | `protocol.rs` / `state.rs` — Mapear FxOutputUpdate element 7 para bus insert input (decidir abordagem) | Alta |

---

## 6. Pontos de Atencao

1. **Element 7 colisao**: `kBusInsertInput/kBusInsertIn` e `FxOutputUpdate` element 7 usam o mesmo endereco MIDI. Decidir se:
   - (A) Reaproveitar o two-pass de FX Outputs que ja consulta element 7
   - (B) Criar flag `BUS_INSERT_ACTIVE` para desambiguar (complexo)

2. **`toggleStereoAssignment()`** (`routing.js`): Atualmente usa `channelStates[chIdx]`. Para buses, precisa ler de `busesState[chIdx - 44]` e emitir o MIDI correto. Verificar se o command name `kInputBus/kStereo` funciona para buses (canal 0-7) ou se existe um `kBus*` equivalente.

3. **`kBusInsert/kInsertLocInsertFirst`** (element 40, param 1): Pode ser necessario para setar a posicao corretamente. Testar na mesa fisica.

3. **Copy/Paste** (`copy_paste.js`): Extender para copiar/colar insert de buses usando command names corretos.

4. **Nao tocar no two-pass de FX Outputs**: O two-pass existente ja consulta element 7 (INSBUS, 8 canais). Esses dados podem ser reaproveitados para o bus insert input.
