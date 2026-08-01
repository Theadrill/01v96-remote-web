# Plano de Implementação de Meter de Gain Reduction (GR) nos Dinâmicos

Este documento contém o planejamento arquitetural e as instruções de delegação para o **OpenCode** implementar os medidores verticais/horizontais de **Gain Reduction (GR)** nos cards de **GATE** e **COMPRESSOR** da tela de Dinâmicos dos canais individuais.

---

## 1. Visão Geral da Funcionalidade e Mapeamento Confirmado

Na tela de Dinâmicos de cada canal individual:
* **Meter Superior (Novo - GR):** Medidor de Gain Reduction atuando da **direita para a esquerda** (0 dB à direita, atenuação crescendo para a esquerda até -18 dB).
  * **Card de GATE:** Conectado ao parâmetro SysEx **Gate GR Meter** (`Sub-canal 0x05` do `Element 0x00`).
  * **Card de COMPRESSOR:** Conectado ao parâmetro SysEx **Comp GR Meter** (`Sub-canal 0x03` do `Element 0x00`).
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
2. **Pronto para execução do OpenCode mediante autorização.**
