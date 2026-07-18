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
| Stereo Master (kBusToStereo/kBusToStereoOn) | **SIM** | Atribui bus ao master L/R |
| Insert On/Position | **SIM** | `kBusInsert/kInsertOn`, `kBusInsert/kInsertLocInsert` |
| Insert Input Patch | **SIM** | `kBusInsertInput/kBusInsertIn` (element 7) |
| Pair (estereo) | **SIM** | Ja implementado em `kBusPair/kPair` |

---

## 2. Enderecos SysEx (Tabela de Mapeamento)

| Comando | Endereço (Dec) | Endereço (Hex) | Canal | Valores | Status |
|---------|----------------|----------------|-------|---------|--------|
| `kBusInsert/kInsertOn` | `[127, 1, 40, 0]` | `7F 01 28 00` | `00-07` | `0` = OFF, `1` = ON | ✅ **Confirmado por monitoramento** |
| `kBusInsert/kInsertLocInsert` | `[127, 1, 40, 2]` | `7F 01 28 02` | `00-07` | `0` = Pre EQ, `1` = Pre Fader, `2` = Post Fader | ✅ **Confirmado por monitoramento** |
| `kBusInsert/kInsertLocInsertFirst` | `[127, 1, 40, 1]` | `7F 01 28 01` | `00-07` | Geralmente `0` ou `1` | ⏳ *Pendente de confirmação* |
| `kBusInsertInput/kBusInsertIn` | `[13, 2, 7, 0]` | `0D 02 07 00` | `00-07` | Mapeamento de fontes (AD, Slot, ADAT, FX) | ✅ **Confirmado por monitoramento** |
| `kBusToStereo/kBusToStereoOn` | `[127, 1, 50, 0]` | `7F 01 32 00` | `00-07` | `0` = OFF, `1` = ON | ✅ **Confirmado por monitoramento** |

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

**Adicionar campos `insert` e `stereo` ao `MixBusState`** (linha ~110):
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
    pub stereo: bool,         // <-- NOVO (para Buses, default false para Mixes)
}
```

**Inicializar** no construtor de `MixBusState` (linha ~287):
```rust
insert: InsertState { on: false, position: 0.0, patch_in: 0.0 },
stereo: false,
```

**Adicionar handlers** na funcao `apply_midi` (proximo a linha 600-690):
```rust
} else if mt == "kBusInsert/kInsertOn" {
    if let Some(bus) = self.buses.get_mut(channel) {
        bus.insert.on = cv;
    }
} else if mt == "kBusInsert/kInsertLocInsert" {
    if let Some(bus) = self.buses.get_mut(channel) {
        bus.insert.position = cv;
    }
} else if mt == "kBusToStereo/kBusToStereoOn" {
    if let Some(bus) = self.buses.get_mut(channel) {
        bus.stereo = cv;
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

**Para the Insert Input Patch**: O `setInsertIn()` atual envia `kChannelInsertIn/kInsertIn`. Para buses, enviar `kBusInsertInput/kBusInsertIn` — MAS ver secao 3 sobre a colisao com element 7.

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

1. **Element 7 colisao**: `kBusInsertInput/kBusInsertIn` e `FxOutputUpdate` element 7 usam o mesmo endereco MIDI. Fica decidido pela **Opcao A**: Reaproveitar o two-pass de FX Outputs que ja consulta element 7. Tanto em `state.rs` quanto em `efeitos.js` (applyFxOutputs), mapear as atualizacoes do element 7 para atualizar `insert.patch_in` do respectivo barramento.

2. **Mapeamento de Stereo**: Confirmado que `kInputBus/kStereo` e exclusivo de inputs. Para buses, usar **`kBusToStereo/kBusToStereoOn`** (`[127, 1, 50, 0]`). A funcao `toggleStereoAssignment()` em `routing.js` deve tratar buses separadamente, manipulando `busesState[chIdx - 44].stereo` e emitindo `kBusToStereo/kBusToStereoOn`.

3. **Mapeamento Generalizado de Canais em `protocol.rs`**: O build de SysEx (`build_change` e `build_request`) precisa de alteracao para que qualquer comando com prefixo `"kBus"` aplique o offset de canal (`channel - 44`) e `"kAUX"` aplique (`channel - 36`) de forma automatica, garantindo que comandos como `kBusInsert` e `kBusToStereo` cheguem na mesa com o canal físico correto (0-7).

4. **Fórmulas de Patch de Saída em `inserts.js`**: As funções `setInsertOut`, `openInsertModal` e `clearPreviousInsertOut` precisam ser atualizadas para usar as seguintes fórmulas de Source ID para barramentos (Buses):
   - Saída Física: `(chIdx - 44) + 1` (IDs 1 a 8)
   - Entrada de FX: `(chIdx - 44) + 109` (IDs 109 a 116)
   - ✅ **Confirmado por monitoramento**: Ao mapear o Insert Out do Bus 1 para o FX4 R (destino `[13, 2, 3, 1, 3]`), a mesa enviou o valor `0x6D` (`109`), validando exatamente a fórmula `busIdx + 109`.
   - **Nota de Sincronização**: Como o sync inicial do app já varre todos os destinos de saída e lê suas fontes ativas, a inicialização lerá automaticamente esses patches. Não há necessidade de adicionar novos comandos de sincronização de saída.
