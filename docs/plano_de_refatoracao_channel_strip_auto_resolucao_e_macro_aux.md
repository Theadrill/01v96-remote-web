# Plano de Refatoração: Auto-Resolução do ChannelStrip & Migração do Volume Geral

## 1. Visão Geral e Contexto

No processo de migração da arquitetura v1 (`public/`) para a arquitetura modular v2 (`public_new/`), diversas telas consumidoras (`main_view.js`, `outs_view.js`, `auxs_sends.js`, `channel_setup_core.js`) passaram a instanciar a classe única `ChannelStrip`. 

No entanto, lógicas de apresentação cruciais — como resolução de nomes resolvidos da mesa, dedução de faixas de cores, formatação de títulos/números de canais e renderização de faders de Volume Geral de Auxiliares — continuam duplicadas de forma dispersa em cada tela ou acopladas a arquivos legados (`volume_geral.js`).

Este plano estabelece as etapas para consolidar a autonomia do componente `ChannelStrip` e desacoplar o Volume Geral.

---

## 2. Escopo da Refatoração

### Itens Incluídos:
1. **Auto-Resolução Central de Nomes (`ChannelStrip.resolveName`):**
   - Eliminar a checagem repetida em `main_view.js`, `outs_view.js`, `channel_setup_core.js` e `auxs_sends.js`.
   - O `ChannelStrip` auto-resolve seu próprio nome no `render()` ou `constructor` caso `cfg.name` venha nulo, vazio ou omitido, consultando `window.resolvedNames` ou os arrays de estado local (`channelStates`, `mixesState`, `busesState`, `stInState`, `masterState`).
   - Forçar sempre formatação em MAIÚSCULO.

2. **Dedução Automática de Cores de Faixa (`ChannelStrip.resolveColorBand`):**
   - O `ChannelStrip` deduz autonomamente a cor de banda canônica da Yamaha caso `cfg.colorBand` não seja fornecido:
     - Canais 0 a 15 (`CH 1-16`): `blue` (Azul Yamaha)
     - Canais 16 a 31 (`CH 17-32`): `green` (Verde Esmeralda)
     - Pares Estéreo Linkados de Input: `paired_green` (Verde Neon com borda)
     - MIX 1 a 8: `amber` (Amarelo Dourado)
     - BUS 1 a 8: `cyan` (Azul Claro / Ciano)
     - ST IN 1 a 4: `blue` (Azul Yamaha)
     - MASTER Stereo: `wine` (Vinho / Bordô)
     - MACROS Técnicos: `macro_silver` (Prata / Cinza Metálico)

3. **Auto-Resolução de Título e Numeração (`ChannelStrip.resolveTitle`):**
   - Eliminar concatenações manuais (`isPaired ? ((i + 1) + ' + ' + (i + 2)) : ('' + (i + 1))`) espalhadas pelas telas.
   - O `ChannelStrip` infere o título canônico baseado em `ch`, `type` e `isPaired`.

4. **Migração do Volume Geral em `auxs_sends.js` (Aposentadoria de `volume_geral.js`):**
   - Substituir a injeção legada de HTML via string (`getMixVolumeGeralHtml()` e `getAuxVolumeGeralHtml()`) no dock do mini-fader por uma instância real de `new ChannelStrip(...)` com `type: 'macro_aux'`, `mode: 'macro_aux'`, botões de Big Nudge (+/- 0.10 dB), Delta dB e botão vermelho `[ZERAR]`.
   - Limpar dependências de funções globais brutas.

### Itens Fora de Escopo (Postergados):
- Ponto 5 (Conversão e formatação interna de dB `rawToDb` no strip): mantido como está por enquanto, utilizando as funções globais consolidadas.

---

## 3. Passo a Passo de Implementação

### Etapa 1: Métodos Estáticos e Auto-Resolução no `ChannelStrip` (`channel_strip.js`)
- [ ] Adicionar método estático `ChannelStrip.resolveName(ch, type, fallback)` com leitura de `window.resolvedNames` e estados locais da 01V96, aplicando `.toUpperCase()`.
- [ ] Adicionar método estático `ChannelStrip.resolveColorBand(ch, type, isPaired)`.
- [ ] Adicionar método estático `ChannelStrip.resolveTitle(ch, type, isPaired, partnerId)`.
- [ ] Integrar no ciclo de vida `constructor` / `render()` do `ChannelStrip`:
  - Se `cfg.name` não for passado, auto-resolver via `ChannelStrip.resolveName`.
  - Se `cfg.colorBand` não for passado, auto-resolver via `ChannelStrip.resolveColorBand`.
  - Se `cfg.chNumber` não for passado, auto-resolver via `ChannelStrip.resolveTitle`.

### Etapa 2: Limpeza e Simplificação nas Telas Consumidoras
- [ ] **`screens/main_view.js`:**
  - Remover a função local `_getResolvedName(ch)`.
  - Simplificar a criação dos 32 canais e do Master confiando na auto-resolução do `ChannelStrip`.
- [ ] **`screens/outs_view.js`:**
  - Remover a função local `_getResolvedName(globalId, defaultName)`.
  - Simplificar as definições de `colorBand`, `chNumber` e `name` para MIX, BUS, ST IN e MASTER.
- [ ] **`screens/channel_setup/channel_setup_core.js`:**
  - Remover as leituras redundantes de `window.resolvedNames` em cada condicional de canal.
  - Delegar a inicialização do mini-fader para as resoluções do `ChannelStrip`.

### Etapa 3: Migração do Volume Geral em `auxs_sends.js`
- [ ] Refatorar a injeção do mini-fader de Volume Geral em `screens/auxs_sends.js`.
- [ ] Utilizar a classe `ChannelStrip` com `type: 'macro_aux'`, `mode: 'macro_aux'`, vinculando os callbacks de delta nudge e zerar diretamente ao componente modular.
- [ ] Validar compatibilidade visual e operacional com o modal de confirmação ao zerar.

---

## 4. Critérios de Validação e Verificação

1. **Validação de Nomes:** Abrir as telas Principal, Saídas, Auxiliares e Channel Setup, garantindo que todos os nomes customizados e globais continuem aparecendo e em MAIÚSCULO.
2. **Validação Cromática:** Conferir se as faixas de cores (Azul 1-16, Verde 17-32, Pareados Verde Neon, Âmbar Mix, Ciano Bus e Vinho Master) são renderizadas com precisão pixel-perfect.
3. **Validação do Volume Geral Auxiliar:** Abrir a tela de Sends on Faders e verificar o fader de Volume Geral funcional, operando os Big Nudges e acionando o botão ZERAR com confirmação.
4. **Verificação de Regressão:** `node -c` em todos os scripts modificados e ausência de erros no console do navegador.
