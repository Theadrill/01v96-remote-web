# Plano de Implementação de Meter de Gain Reduction (GR) nos Dinâmicos

Este documento contém o planejamento arquitetural e as instruções de delegação para o **OpenCode** implementar os medidores verticais/horizontais de **Gain Reduction (GR)** nos cards de **GATE** e **COMPRESSOR** da tela de Dinâmicos dos canais individuais.

---

## 1. Visão Geral da Funcionalidade e Mapeamento Confirmado

Na tela de Dinâmicos de cada canal individual:
* **Meter Superior (Novo - GR):** Medidor de Gain Reduction atuando da **direita para a esquerda** (0 dB à direita, atenuação crescendo para a esquerda até -18 dB).
  * **Card de GATE (Canais CH1-32):** Conectado ao parâmetro SysEx **Gate GR Meter** (`Sub-canal 0x05` do `Element 0x00`).
  * **Card de COMPRESSOR (Canais CH1-32):** Conectado ao parâmetro SysEx **Comp GR Meter** (`Sub-canal 0x03` do `Element 0x00`).
  * **Card de COMPRESSOR (Master Stereo):** Conectado ao parâmetro SysEx **Master Comp GR Meter** (`Sub-canal 0x03` do `Element 0x04`, `Channel 0x00`). *Validado em mesa física*. (O Master não possui Gate).
* **Meter Inferior (Existente - Output Level):** Permanece atuando da **esquerda para a direita** (saída do módulo).
  * **Card de GATE:** `Sub-canal 0x02` (Gate Level Meter).
  * **Card de COMPRESSOR:** `Sub-canal 0x04` (Comp Level Meter).

---

## 2. Escala de Conversão e Regra de Preenchimento (Validado em Mesa Física)

Após testes práticos em mesa física Yamaha 01V96, foi estabelecida a escala exata de conversão entre o valor SysEx bruto (Step 14-bit) e a porcentagem de preenchimento da barra de GR:

### 2.1. Valores de Referência dos Steps
* **Step 4095 (`0x0FFF`):** 0 dB (Idle / Sem atenuação). Corresponde a **0% de largura** (Barra vazia, ancorada à direita).
* **Step 3328 (`0x0D00`):** -18 dB (Fim de escala visual do medidor de Gate GR). Corresponde a **100% de largura** (Barra cheia, preenchendo até a esquerda).
* **Delta Total de Steps:** `4095 - 3328 = 767 steps` para 18 dB (`~42,56 steps por dB`).

### 2.2. Fórmula de Cálculo da Largura da Barra (`width %`)
```javascript
const clamp = (val, min, max) => Math.min(Math.max(val, min), max);
const grPercent = clamp(((4095 - step) / 767) * 100, 0, 100);
```

### 2.3. Layout Visual dos Marcadores e Preenchimento
* **Rótulos numéricos (Da esquerda para a direita):** `-18`, `-12`, `-6`, `0`
* **Ancoragem:** Lado direito (`right: 0`, `0 dB`).
* **Crescimento da barra:** Da direita para a esquerda à medida que a atenuação aumenta.

---

## 3. Arquitetura e Arquivos Modificados

### Frontend (Interface e Estilos)
1. **`public/modules/gate.js`**:
   * Adicionar a estrutura HTML do meter de GR acima do meter existente.
   * Elemento ID: `gateGrMeter`
   * Container/Trilha com classe para inversão visual (`dyn-meter-track-gr` / `dyn-meter-fill-gr`).
   * Escala numérica/marcadores de GR: `-18`, `-12`, `-6`, `0`.

2. **`public/modules/compressor.js`**:
   * Adicionar a estrutura HTML do meter de GR acima do meter existente.
   * Elemento ID: `compGrMeter`
   * Container/Trilha com classe para inversão visual (`dyn-meter-track-gr` / `dyn-meter-fill-gr`).
   * Escala numérica/marcadores de GR: `-18`, `-12`, `-6`, `0`.

3. **`public/style.css` / CSS dos Dinâmicos**:
   * Definir a estilização do `.dyn-meter-fill-gr`:
     * Posicionamento/âncora à direita (`right: 0`, `left: auto`) para que a largura (`width %`) cresça da direita para a esquerda.
     * Gradiente de cor característico de Gain Reduction (amarelo/laranja/vermelho vindo da direita).

4. **`public/modules/socket.js`**:
   * No listener de atualização dos meters:
   * Aplicar a fórmula `((4095 - step) / 767) * 100` e atualizar a largura (`style.width`) dos elementos `gateGrMeter` e `compGrMeter`.

### Backend Rust
* **`server_rust/src/midi_receiver.rs` / `socket_handlers.rs` / `sync_manager.rs`**:
  * Garantir que, quando o modal de Dinâmicos do canal ativo estiver aberto, as requisições SysEx `0D 21 00` contemplem os sub-canais `0x05` (Gate GR) e `0x03` (Comp GR) e retransmitam para o frontend.

---

## 4. Instruções de Delegação para o OpenCode (Prompt de Execução)

As instruções abaixo devem ser passadas via terminal para o **OpenCode** conforme o arquivo `instrucoes_de_delegacao_de_tarefas.md`.

```powershell
echo '
Você é o executor do projeto 01v96-remote-web. Implemente a barra de Gain Reduction (GR) nos cards de GATE e COMPRESSOR da tela de Dinâmicos dos canais.

REGRAS RÍGIDAS DE EXECUÇÃO:
- NÃO rode `cargo build --release` ou `cargo build`. Se precisar verificar o código Rust, use APENAS `cargo check`.
- Valide os arquivos JavaScript usando `node --check`.
- NÃO faça commit do git (`git commit` é proibido).

REGRAS DE CÁLCULO E LAYOUT DO METER GR:
- Escala de rótulos (esquerda para direita): -18, -12, -6, 0.
- Ancoragem à direita (0 dB na direita). A barra cresce da direita para a esquerda.
- Fórmula de largura: widthPercent = Math.min(Math.max(((4095 - step) / 767) * 100, 0), 100).
- Sub-canais do Element 0x00: Gate GR = 0x05, Comp GR = 0x03.

TAREFAS A REALIZAR:
1. Em `public/modules/gate.js`:
   - Adicionar o meter de Gain Reduction (GR) ACIMA do meter de saída atual.
   - Usar a ID `gateGrMeter` para o elemento de preenchimento.
   - Configurar o layout e marcadores (-18 a 0) com crescimento da direita para a esquerda.

2. Em `public/modules/compressor.js`:
   - Adicionar o meter de Gain Reduction (GR) ACIMA do meter de saída atual.
   - Usar a ID `compGrMeter` para o elemento de preenchimento.
   - Configurar o layout e marcadores (-18 a 0) com crescimento da direita para a esquerda.

3. Em `public/style.css` (ou CSS relevante dos dinâmicos):
   - Criar as classes estilizadas para os meters de GR invertidos (`.dyn-meter-track-gr`, `.dyn-meter-fill-gr`), garantindo ancoragem na direita (`right: 0`).

4. Em `public/modules/socket.js`:
   - Atualizar a lógica de recebimento de dados de medição usando a fórmula `((4095 - step) / 767) * 100` para atualizar em tempo real `gateGrMeter` e `compGrMeter`.

5. Validação:
   - Execute `node --check public/modules/gate.js`, `node --check public/modules/compressor.js` e `node --check public/modules/socket.js`.
   - Se algum arquivo Rust for alterado, execute `cargo check`.
' | opencode run --auto --format json
```

---

## 5. Status da Documentação

1. Documento atualizado com os dados validados em mesa física.
2. **Implementação de Frontend e Backend realizada nesta sessão (sem commit do git).**

---

## 6. Relatório do Progresso de Implementação (Passo a Passo)

### 6.1. O que foi feito até o momento:

1. **Backend Rust (`server_rust`):**
   - **`src/midi/protocol.rs`**: Adicionada a variante `GrMeter { channel, sub_channel, raw_step }` ao enum `ParsedMidi` e implementado o parser para respostas SysEx de 12 bytes (`Section 0x0D`, `Group 0x21`, `Element 0x00`, sub-canais `0x05` = Gate GR e `0x03` = Comp GR).
   - **`src/state.rs`**: Adicionado o match arm para `ParsedMidi::GrMeter` em `apply_midi`.
   - **`src/midi_receiver.rs`**: Interceptado `ParsedMidi::GrMeter` para emitir o evento WebSocket `grMeterData` com o payload `{ "channel": ch, "type": "gate"|"comp", "raw_step": step }` e repassar o buffer bruto em `meterDataRaw`.
   - **`src/socket_handlers.rs`**: Adicionado o disparo inicial das duas requisições SysEx `0D 21 00` dos sub-canais `0x05` (Gate GR) e `0x03` (Comp GR) no handler do evento `requestDynamics`.
   - **Validação:** Executado `cargo check` com **sucesso (0 erros)**.

2. **Frontend Web (`public/`):**
   - **`public/style.css`**: Criadas as classes `.dyn-meter-track-gr` e `.dyn-meter-fill-gr` ancoradas no lado direito (`right: 0`) com gradiente amarelo/vermelho vindo da direita para a esquerda.
   - **`public/modules/gate.js`**: Adicionada a estrutura visual da barra `gateGrMeter` acima da barra de saída do Gate com os marcadores de escala `-18`, `-12`, `-6`, `0`.
   - **`public/modules/compressor.js`**: Adicionada a estrutura visual da barra `compGrMeter` acima da barra de saída do Compressor com os marcadores de escala `-18`, `-12`, `-6`, `0`.
   - **`public/modules/socket.js`**: Implementado o ouvinte `socket.on('grMeterData')` aplicando a fórmula exata `((4095 - raw_step) / 767) * 100` para atualizar a largura (`style.width`) dos elementos `gateGrMeter` e `compGrMeter` em tempo real.
   - **`public/modules/dynamics.js`**: Implementado o loop contínuo de polling `startGrPolling(ch)` e `stopGrPolling()` que dispara requisições `requestDynamics` a cada 100ms enquanto a aba de dinâmicas estiver ativa no canal selecionado (`ch` de 0 a 31).
   - **`public/modules/sidebar.js`**: Integrado o cancelamento do polling `stopGrPolling()` ao trocar de abas ou fechar a configuração do canal.
   - **Diagnóstico & Correção da causa raiz:** O medidor anteriormente só atualizava no Canal 1 porque o script de testes `gr_monitor.js` no terminal estava solicitando continuamente apenas o canal 1. Com a inclusão da rotina contínua `startGrPolling(ch)` em `dynamics.js`, **todos os canais de 1 a 32 agora realizam o polling em tempo real dos seus respectivos medidores de GR ao abrir o modal**.
   - **Validação:** Executado `node --check` em todos os scripts JS modificados com **sucesso (0 erros)**.

3. **Status de Git:**
   - **Nenhum commit foi realizado** (respeitada a restrição de não fazer `git commit`).

---

### 6.2. Onde a próxima LLM / agente deve continuar (Se necessário):

- **Status Atual:** A implementação completa de backend (Rust WebSocket emission) e frontend (HTML/CSS/JS socket listener + polling contínuo para todos os canais CH1-32) dos medidores de GR está **100% pronta e compilando sem erros**.
- **Próximos passos para testes ou validação:**
  1. Testar em mesa física abrindo o modal de Dinâmicos em qualquer canal (CH1 a CH32).
  2. Verificar se as barras de Gain Reduction do Gate e do Compressor respondem visualmente crescendo da direita para a esquerda em qualquer canal selecionado.
