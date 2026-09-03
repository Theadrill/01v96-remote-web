# Plano: Minifader Clicável em MIX 1-8 com Retorno ao Contexto Correto

**Data**: 2026-09-03  
**Autor**: Planejamento via análise de código  
**Status**: Aprovado para implementação

## 🎯 Objetivo

Permitir que o minifader à direita, **apenas quando estamos dentro da config de um MIX 1-8** (canais 36-43), seja clicável e reabra a tela de configurações individual daquele mix. Ao fechar (SAIR/ESC), **deve voltar para a mesma tela de outs/mix** de onde veio.

## 🔍 Contexto

Atualmente estamos usando `public_new` para desenvolver um frontend mais voltado a componentes. O problema identificado:

- Ao entrar em **mix/outs** → selecionar um dos **MIX 1-8** → aparece o **minifader à direita**
- Ao clicar nesse minifader, **nada acontece** (esperado: abrir tela de config individual daquele mix)
- O problema existe porque estamos em contexto nested (várias telas empilhadas)

## 📊 Diagnóstico Consolidado

### ✅ Comportamento Atual Correto

1. **Flags globais são preservadas**: `outsMode`, `activeMix`, `technicianMixMode` **permanecem intactos** durante todo o ciclo de abrir/fechar modal
2. **`initUI()` toma decisões corretas**: Detecta `outsMode=true` após fechar e re-renderiza `OutsView` corretamente
3. **View de faders volta certa**: Após fechar, a `OutsView` é renderizada novamente

### ❌ Problemas Identificados

#### PROBLEMA 1: Minifader não tem callbacks de clique

- **Arquivo**: `public_new/modules/screens/channel_setup/channel_setup_core.js`
- **Função**: `renderMiniFader()` (linhas ~214-260)
- **Causa**: O objeto `callbacks` só registra: `fader_change`, `on_toggle`, `solo_toggle`, `nudge`
- **Faltam**: `header_click` e `name_click`
- **Motivo histórico**: Foi intencional no código legado para evitar "recursão modal-sobre-modal"

#### PROBLEMA 2: Dock volta errado após fechar modal

- **Arquivo**: `public_new/modules/screens/channel_setup/channel_setup_core.js`
- **Função**: `close()` linha 469
- **Causa**: `renderDock('main')` **sobrescreve** o dock correto que `initUI()` havia setado na linha 468
- **Resultado**: Faders de OutsView + botões de MainView (inconsistência UI)
- **Sintoma adicional**: Botão SAIR vai para logout em vez de `toggleOuts()`

### 🔬 Análise Técnica Detalhada

**Fluxo atual de fechamento**:
```javascript
// close() em channel_setup_core.js:443-475
function close() {
    // ... cleanup ...
    _activeChannel = null;
    activeConfigChannel = null;
    // ... cleanup minifader ...

    initUI();                    // L468: renderiza OutsView + renderDock('outs') ✅
    renderDock('main');          // L469: SOBRESCREVE para 'main' ❌
    updateSidebarInfo();
}
```

**Por que `outsMode` é preservado**:
- `open()` **não toca** em `outsMode`, `technicianMixMode` ou `activeMix`
- Apenas seta `activeConfigChannel = ch`
- `close()` apenas zera `activeConfigChannel`
- As flags de modo ficam intactas durante todo o ciclo

**Decisão de renderização em `initUI()`**:
```javascript
// channel_strip.js:2441-2454
const isConfig = activeConfigChannel !== null;
let dockMode;
if (musicianMode) dockMode = 'musician';
else if (isConfig) dockMode = 'channelConfig';  // prioridade máxima
else if (technicianMixMode) dockMode = 'techMix';
else if (outsMode) dockMode = 'outs';           // ✅ correto
else dockMode = 'main';
```

## 🛠️ Solução Proposta

### ALTERAÇÃO 1: Adicionar callbacks de clique ao minifader (APENAS para MIX 36-43)

**Arquivo**: `public_new/modules/screens/channel_setup/channel_setup_core.js`  
**Função**: `renderMiniFader()` (aproximadamente linhas 214-260)  
**Localização exata**: Dentro do objeto `callbacks` do `stripConfig`

```javascript
callbacks: {
    fader_change: function (data) {
        /* código existente */
    },
    on_toggle: function () {
        /* código existente */
    },
    solo_toggle: function () {
        /* código existente */
    },
    nudge: function (data) {
        /* código existente */
    },

    // ✨ NOVO: permitir clique apenas quando é MIX 36-43
    header_click: isMix ? function() {
        if (typeof openChannelConfig === 'function') {
            openChannelConfig(null, ch);
        }
    } : undefined,

    name_click: isMix ? function() {
        if (typeof openChannelConfig === 'function') {
            openChannelConfig(null, ch);
        }
    } : undefined
}
```

**Comportamento**:
- ✅ Funciona **somente** quando `isMix = true` (canais 36-43)
- ✅ Não afeta minifaders de outros tipos (inputs, buses, master)
- ✅ Reabre o modal com `openChannelConfig(null, ch)` → re-renderiza com as configs do MIX clicado

### ALTERAÇÃO 2: Remover chamada que força dock='main' ao fechar

**Arquivo**: `public_new/modules/screens/channel_setup/channel_setup_core.js`  
**Função**: `close()` linha 469  
**Ação**: **REMOVER** a linha `renderDock('main')`

**Antes** (linhas 468-470):
```javascript
if (typeof initUI === 'function') initUI();
if (typeof renderDock === 'function') renderDock('main');  // ❌ REMOVER ESTA LINHA
if (typeof updateSidebarInfo === 'function') updateSidebarInfo();
```

**Depois**:
```javascript
if (typeof initUI === 'function') initUI();
if (typeof updateSidebarInfo === 'function') updateSidebarInfo();
```

**Justificativa**:
- `initUI()` **já chama `renderDock()` internamente** com o modo correto (`outs`, `techMix`, ou `main`)
- A linha 469 estava **sobrescrevendo** desnecessariamente
- Remover = deixar `initUI()` fazer seu trabalho sem interferência

## ✅ Checklist de Validação

### Funcionalidade do Minifader
- [ ] Clicar no minifader quando em MIX 1-8 → reabre config daquele mix
- [ ] Clicar no minifader quando em outros canais (input, bus, master) → nada acontece (preservado)
- [ ] Minifaders em outras telas (MainView, OutsView principal) → não afetados

### Retorno ao Contexto Correto
- [ ] Fechar modal via botão SAIR → volta para OutsView com dock='outs'
- [ ] Fechar modal via tecla ESC → volta para OutsView com dock='outs'
- [ ] Fechar modal via clique no backdrop → volta para OutsView com dock='outs'
- [ ] Botão SAIR do dock após voltar → executa `toggleOuts()` (não logout)
- [ ] `activeMix` preservado durante todo o ciclo

### Cenários de Teste
1. **Caso base**: `Main → toggleOuts() → OutsView → click MIX 3 → modal abre → click minifader → re-renderiza para MIX 3 → SAIR → volta OutsView`
2. **Fechamentos**: Testar SAIR, ESC, backdrop todos voltando para OutsView
3. **Outros canais**: Abrir config de INPUT 1 → verificar minifader não clicável
4. **TechMix mode**: Se existir fluxo similar em `technicianMixMode`, testar também

## 📁 Arquivos Envolvidos

### Para edição:
1. **`public_new/modules/screens/channel_setup/channel_setup_core.js`**
   - Adicionar `header_click` e `name_click` condicionais em `renderMiniFader()`
   - Remover linha 469 `renderDock('main')` em `close()`

### Para referência (não editar):
- `public_new/modules/components/channel_strip.js` (componente visual)
- `public_new/modules/screens/outs_view.js` (tela de outs)
- `public_new/modules/components/sidebar.js` (dock e triggerExitActiveMode)
- `public_new/modules/core/globals.js` (flags de estado)

## ⚠️ Observações Importantes

1. **Comportamento visual ao clicar no minifader**: Como o modal é único (não há stack), o efeito será "re-renderizar o mesmo modal" com as informações do mix. Visualmente pode ser sutil, mas as tabs (EQ/DYN/AUX/ETC) e conteúdos serão atualizados para aquele canal.

2. **Guards de segurança preservados**: Os guards existentes em `ChannelStrip._bindEvents()` continuam ativos:
   - `musicianMode` bloqueia abertura de config
   - `isLocked` desabilita clique
   - `closest('button')` / `closest('input')` evitam conflitos

3. **Compatibilidade com código legado**: As alterações não afetam o fallback legado (`createChannelStrip`, `createDesktopChannelStrip`), que já tinha a lógica de "evitar recursão no mini-fader".

## 🔄 Fluxo de Implementação

1. ✅ Análise completa do código (coder-muse)
2. ✅ Criação deste documento de planejamento
3. ⏳ Push do documento
4. ⏳ Implementação das alterações (coder-muse)
5. ⏳ Validação do código gerado
6. ⏳ Aprovação final e push

## 📚 Referências Técnicas

- Análise detalhada fornecida pelo sub-agent coder-muse em 2026-09-03
- Código base: branch atual de `public_new/`
- Sistema de navegação: flags globais + `initUI()` dispatcher
