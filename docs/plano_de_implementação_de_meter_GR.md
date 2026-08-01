# Plano de Implementação de Meter de Gain Reduction (GR) nos Dinâmicos

Este documento contém o planejamento arquitetural e as instruções de delegação para o **OpenCode** implementar os medidores verticais/horizontais de **Gain Reduction (GR)** nos cards de **GATE** e **COMPRESSOR** da tela de Dinâmicos dos canais individuais.

---

## 1. Visão Geral da Funcionalidade

Na tela de Dinâmicos de cada canal individual:
* **Meter Superior (Novo - GR):** Medidor de Gain Reduction atuando da **direita para a esquerda** ($0\text{ dB}$ à direita, atenuação avançando para a esquerda).
  * **Card de GATE:** Conectado ao parâmetro SysEx **Gate GR Meter** (`Sub-canal 0x03` do `Element 0x00`).
  * **Card de COMPRESSOR:** Conectado ao parâmetro SysEx **Comp GR Meter** (`Sub-canal 0x05` do `Element 0x00`).
* **Meter Inferior (Existente - Output Level):** Permanece atuando da **esquerda para a direita** (saída do módulo).
  * **Card de GATE:** `Sub-canal 0x02` (Gate Level Meter).
  * **Card de COMPRESSOR:** `Sub-canal 0x04` (Comp Level Meter).

---

## 2. Arquitetura e Arquivos Modificados

### Frontend (Interface e Estilos)
1. **`public/modules/gate.js`**:
   * Adicionar a estrutura HTML do meter de GR acima do meter existente.
   * Elemento ID: `gateGrMeter`
   * Container/Trilha com classe para inversão visual (`dyn-meter-track-gr` / `dyn-meter-fill-gr`).
   * Escala numérica/marcadores de GR (ex: `-18`, `-12`, `-6`, `0`).

2. **`public/modules/compressor.js`**:
   * Adicionar a estrutura HTML do meter de GR acima do meter existente.
   * Elemento ID: `compGrMeter`
   * Container/Trilha com classe para inversão visual (`dyn-meter-track-gr` / `dyn-meter-fill-gr`).
   * Escala numérica/marcadores de GR (ex: `-18`, `-12`, `-6`, `0`).

3. **`public/style.css` / CSS dos Dinâmicos**:
   * Definir a estilização do `.dyn-meter-fill-gr`:
     * Posicionamento/âncora à direita (`right: 0`, `left: auto`) ou `direction: rtl` para que a largura (`width %`) cresça da direita para a esquerda.
     * Gradiente de cor característico de Gain Reduction (ex: amarelo/laranja/vermelho vindo da direita).

4. **`public/modules/socket.js`**:
   * No listener `socket.on('meterDataRaw')` ou evento de atualização dos meters:
   * Calcular e atualizar a largura (`style.width`) dos elementos `gateGrMeter` e `compGrMeter` com base no nível recebido do backend/WASM.

### Backend Rust (Se necessário ajustes de Polling / Messages)
* **`server_rust/src/midi_receiver.rs` / `socket_handlers.rs` / `sync_manager.rs`**:
  * Garantir que, quando o modal de Dinâmicos do canal ativo estiver aberto, as requisições SysEx `0D 21 00` contemplem os sub-canais `0x03` (Gate GR) e `0x05` (Comp GR) e retransmitam para o frontend.

---

## 3. Instruções de Delegação para o OpenCode (Prompt de Execução)

As instruções abaixo devem ser passadas via terminal para o **OpenCode** conforme o arquivo `instrucoes_de_delegacao_de_tarefas.md`.

```powershell
echo '
Você é o executor do projeto 01v96-remote-web. Implemente a barra de Gain Reduction (GR) nos cards de GATE e COMPRESSOR da tela de Dinâmicos dos canais.

REGRAS RÍGIDAS DE EXECUÇÃO:
- NÃO rode `cargo build --release` ou `cargo build`. Se precisar verificar o código Rust, use APENAS `cargo check`.
- Valide os arquivos JavaScript usando `node --check`.
- NÃO faça commit do git (`git commit` é proibido).

TAREFAS A REALIZAR:
1. Em `public/modules/gate.js`:
   - Adicionar o meter de Gain Reduction (GR) ACIMA do meter de saída atual.
   - Usar a ID `gateGrMeter` para o elemento de preenchimento.
   - Configurar o layout para que a barra cresça da direita para a esquerda (0dB à direita, atenuação para a esquerda).

2. Em `public/modules/compressor.js`:
   - Adicionar o meter de Gain Reduction (GR) ACIMA do meter de saída atual.
   - Usar a ID `compGrMeter` para o elemento de preenchimento.
   - Configurar o layout para que a barra cresça da direita para a esquerda (0dB à direita, atenuação para a esquerda).

3. Em `public/style.css` (ou CSS relevante dos dinâmicos):
   - Criar as classes estilizadas para os meters de GR invertidos (`.dyn-meter-track-gr`, `.dyn-meter-fill-gr`), garantindo visual limpo, alta legibilidade e preenchimento `right-to-left`.

4. Em `public/modules/socket.js`:
   - Atualizar a lógica de recebimento de dados de medição para atualizar em tempo real `gateGrMeter` e `compGrMeter`.

5. Validação:
   - Execute `node --check public/modules/gate.js`, `node --check public/modules/compressor.js` e `node --check public/modules/socket.js`.
   - Se algum arquivo Rust for alterado, execute `cargo check`.
' | opencode run --auto --format json
```

---

## 4. Validação Prévia e Próximos Passos

1. O documento foi gerado em `docs/plano_de_implementação_de_meter_GR.md`.
2. **Aguardando análise e autorização do usuário** antes de disparar o comando de delegação ao **OpenCode**.
