# Plano de Implementação: Modal e Indicador de Posição no Mini-Fader do Auxiliar

Ajuste no layout e fluxo da feature de configuração dos barramentos auxiliares (**MIX 1 a 8**), movendo os controles da barra superior para um **Modal de Configuração do Auxiliar**, acionado através de uma seção visual de **POSIÇÃO** integrada ao **Mini-Fader** (idêntica à seção `MEDIDORES` do canal `MASTER`).

---

## 1. Diagnóstico do Estado Atual vs. Solicitado

| Item | Implementação Anterior | Novo Comportamento Solicitado |
|---|---|---|
| **Barra Superior** | Barra fixa com `MIX X CONFIG` no topo dos faders de envio | **Removida completamente**. A área de faders de envio volta a ocupar todo o espaço útil. |
| **Mini-Fader (MIX 1..8)** | Não exibia indicadores de posição/configuração | Exibe a seção **`POSIÇÃO`** (com `GLOBAL: PRE/POST` e `PRE-P: PRE ON/POST ON`) no mesmo estilo do `MASTER`. |
| **Abertura de Configuração** | Controles inline no topo | Clique na seção `POSIÇÃO` do mini-fader abre o **Modal de Configuração do Auxiliar**. |
| **Modal de Configuração** | Inexistente | Modal estilizado no padrão `meterConfigModal` com seletores de **MODE**, **GLOBAL**, **PRE-POINT** e ação **ALL NOMINAL**. |

---

## 2. Mudanças Visuais e Estruturais

### 2.1 Mini-Fader do Auxiliar (Seção `POSIÇÃO`)
No mesmo posicionamento onde o canal `MASTER` exibe a seção `MEDIDORES` (entre o nome do canal e o botão `ON`):

```
┌────────────────────────┐
│      MINI FADER        │
│        MIX 3           │  ← Título do canal
│        [SOLO]          │
│       VOZ AUX          │  ← Nome do canal
│ ┌────────────────────┐ │
│ │      POSIÇÃO       │ │  ← Título da seção (clicável)
│ │  GLOBAL:    PRE    │ │  ← Badge de status
│ │  PRE-P:    PRE ON  │ │  ← Badge de status
│ └────────────────────┘ │
│         [ON]           │
│       [Fader]          │
└────────────────────────┘
```

### 2.2 Modal de Configuração do Auxiliar (`auxConfigModal`)
Modal overlay com visualização limpa, seguindo a identidade visual dos modais do app:

```
┌──────────────────────────────────────────────────┐
│             CONFIGURAÇÃO - MIX 3                 │
│                                                  │
│  MODE                                            │
│  [ VARIABLE ]   [ FIXED ]                        │
│                                                  │
│  GLOBAL INSERT                                   │
│  [ PRE ]   [ POST ]                              │
│                                                  │
│  PRE-POINT                                       │
│  [ PRE ON ]   [ POST ON ]                        │
│                                                  │
│  AÇÕES                                           │
│  [ ALL NOMINAL (RESET PRE) ]                     │
│                                                  │
│                    [ FECHAR ]                    │
└──────────────────────────────────────────────────┘
```

---

## 3. Detalhamento das Alterações

### 3.1 `public/modules/auxs_sends.js`
- **Remover** `renderAuxMixBusConfig(ch)` e sua inclusão na `renderAuxs(ch)`.
- Adicionar funções de auxílio para labels:
  - `getMixBusGlobalLabel(mixIdx)` -> `'PRE'` ou `'POST'`
  - `getMixBusPrePointLabel(mixIdx)` -> `'PRE ON'` ou `'POST ON'`
- Adicionar funções de controle do Modal:
  - `window.openAuxConfigModal(mixIdx)`: Abre o modal populando com o índice do mix e sincronizando os botões.
  - `window.closeAuxConfigModal()`: Fecha o modal.
  - `window.updateAuxConfigModalUI(mixIdx)`: Atualiza o estado dos botões ativos no modal.
  - `window.updateAuxPositionBadgeUI(mixIdx)`: Atualiza os badges `aux-global-badge-${mixIdx}` e `aux-prepoint-badge-${mixIdx}` no mini-fader.
  - `window.handleAllNominal(mixIdx)`: Dispara o reset em lote para PRE nos 32 canais e atualiza os envios visíveis.

### 3.2 `public/modules/channel_strip.js`
- Atualizar `createDesktopStrip` / `createDesktopOutputStrip`:
  - Passar flag `isMix` e `mixIdx` quando `type === 'mix'`.
  - Quando `isMix === true`, renderizar a seção `.master-meter-section.aux-position-section` com chamada `openAuxConfigModal(mixIdx)`.
- Atualizar `createMobileStrip` / `createOutputStrip`:
  - Garantir que no layout mobile a seção ou botão `POSIÇÃO` seja exibido no mini-fader para acesso rápido.

### 3.3 `public/index.html`
- Adicionar o HTML do modal `#auxConfigModal` logo abaixo do `#meterConfigModal`:
  - Header com título dinâmico `auxConfigTitle` (ex: `MIX 3 - CONFIGURAÇÃO`).
  - Grupo de botões para **MODE** (`VARIABLE` / `FIXED`).
  - Grupo de botões para **GLOBAL** (`PRE` / `POST`).
  - Grupo de botões para **PRE-POINT** (`PRE ON` / `POST ON`).
  - Botão de ação para **ALL NOMINAL**.
  - Botão **FECHAR**.

### 3.4 `public/style.css`
- Remover estilos da topbar antiga `.aux-mixbus-topbar`.
- Adicionar estilos para `.aux-position-section` (reaproveitando `.master-meter-section` com ajustes de cores/badges se necessário).
- Adicionar estilos dedicados para `.styled-auxConfigModal` e `.aux-config-content`.

### 3.5 `public/modules/socket.js`
- Nos eventos de socket:
  - `kAUXType/kAUXTypeIndex`: Chamar `updateAuxPositionBadgeUI(d.channel)` e `updateAuxConfigModalUI(d.channel)`.
  - `kAuxSendPrePoint/kPrePoint`: Chamar `updateAuxPositionBadgeUI` para todos os 8 mixes e atualizar o modal se aberto.

---

## 4. Plano de Verificação

### Testes Manuais:
1. **Remoção da Barra Superior**: Abrir a janela de envios do canal Auxiliar (MIX 1..8) e verificar que o topo está limpo, com os 32 channel strips ocupando o espaço total.
2. **Exibição no Mini-Fader**:
   - Abrir o mini-fader de um MIX (ex: MIX 3 e MIX 5).
   - Verificar se a seção `POSIÇÃO` aparece estilizada idêntica à seção `MEDIDORES` do Master.
   - Conferir se os badges mostram os valores atuais (`PRE`/`POST` e `PRE ON`/`POST ON`).
3. **Abertura do Modal**:
   - Clicar na seção `POSIÇÃO` do mini-fader.
   - Verificar se o modal abre centralizado com o título correto (ex: `CONFIGURAÇÃO - MIX 3`).
4. **Interação com os Controles**:
   - Alternar entre `VARIABLE` e `FIXED` -> verificar emissão de comando socket e sincronização visual.
   - Alternar entre `PRE` e `POST` no GLOBAL -> verificar disparo e atualização dos badges e canais.
   - Alternar entre `PRE ON` e `POST ON` no PRE-POINT -> verificar atualização.
   - Clicar em `ALL NOMINAL` -> verificar se todos os botões de envio dos canais viram `PRE`.
5. **Verificação de Compilação Backend**:
   - Executar `cargo check` no `server_rust` para assegurar integridade geral.
