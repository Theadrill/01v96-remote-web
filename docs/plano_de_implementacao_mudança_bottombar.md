# ESPECIFICAÇÃO TÉCNICA: REESTRUTURAÇÃO DA BOTTOM BAR E MENU MODAL (MOBILE RETRATO)

Este documento contém as diretrizes exatas e trechos de código para implementar a reestruturação da interface do usuário no modo mobile retrato (`body:not(.layout-desktop).is-portrait`). O objetivo é limpar a barra inferior (antiga sidebar) e mover as opções secundárias para um Menu Modal dedicado em tela cheia, mantendo a modularidade do código em Vanilla JS e sem impactar o Modo Desktop ou o Modo Músico.

---

## 1. ARQUITETURA E COMPORTAMENTO VISUAL (ASCII)

### 1.1 Estado Normal (Menu Fechado)
A Bottom Bar exibe o painel de informações fixo à esquerda, dois botões de texto puro no meio ("MENU" e "SAIR"), e apenas o botão "MACROS" à direita.

```text
=========================================================
| (Área dos Faders / Conteúdo da tela atual)            |
|                                                       |
|                                                       |
|                                                       |
|                                                       |
=========================================================
| 01V96 LIVE    |                       |               |
| 1 - BUMBO     |  [ MENU ]   [ SAIR ]  |  [ MACROS ]   |
| FONE 1        |  (amarelo)            |  (roxo)       |
=========================================================
```

### 1.2 Tela Principal (Menu Aberto)

Ao clicar em MENU, o modal sobrepõe o conteúdo superior. A barra inferior continua visível por cima ou abaixo, mas o botão SAIR passa a fechar o modal.

```text
=========================================================
|                                                     | |
|  [ CONFIGURAÇÕES DO APP ]                           |=|
|                                                     |=|
|  [ MIX / BUS ]                                      |=|
|                                                     | |
|  [ FULLSCREEN ]                                     | |
|                                                     | |
=========================================================
| 01V96 LIVE    |                       |               |
| MESA-MARIA    |  [ MENU ]   [ SAIR ]  |  [ MACROS ]   |
=========================================================
```

### 1.3 Tela de Canal Individual ou Edição de Mix/Bus (Menu Aberto)

Herda as opções completas do canal individual (`channelConfig` ou modo `techMix` ativo em um barramento). A barra de rolagem estilizada `[=]` surge na direita se a lista transbordar.

```text
=========================================================
|                                                     | |
|  [ CONFIGURAÇÕES DO APP ]                           |=|
|                                                     |=|
|  [ EQ ]                                             |=|
|                                                     | |
|  [ DYN ]                                            | |
|                                                     | |
|  [ AUX ]                                            | |
|                                                     | |
|  [ ROUTING / ETC ]                                  | |
|                                                     | |
|  [ FULLSCREEN ]                                     | |
|                                                     | |
=========================================================
| 01V96 LIVE    |                       |               |
| 1 - BUMBO     |  [ MENU ]   [ SAIR ]  |  [ MACROS ]   |
=========================================================
```

### 1.4 Tela Overview de Mix/Bus (Modo Outs - Menu Aberto)

Quando a tela geral de barramentos masters está ativa.

```text
=========================================================
|                                                     | |
|  [ CONFIGURAÇÕES DO APP ]                           |=|
|                                                     |=|
|  [ FULLSCREEN ]                                     | |
|                                                     | |
=========================================================
| 01V96 LIVE    |                       |               |
| MIX / BUS     |  [ MENU ]   [ SAIR ]  |  [ MACROS ]   |
=========================================================
```

---

## 2. MODIFICAÇÕES NO HTML (`index.html`)

### 2.1 Alteração na Estrutura da Estrutura da Barra Central (`.sidebar`)

Abaixo ou dentro da estrutura atual da `.sidebar`, insira o novo container de ações fixas do mobile retrato ao lado do `#sidebarDock` original.

```html
<div class="sidebar-panel sidebar-dock" id="sidebarDockContainer">
    <div class="button-dock" id="buttonDock"></div>
    
    <div id="mobilePortraitActions" class="mobile-portrait-actions-container">
        <button id="mobileMenuBtn" class="mobile-action-btn btn-menu-yellow">MENU</button>
        <button id="mobileSairBtn" class="mobile-action-btn">SAIR</button>
    </div>
</div>
```

### 2.2 Estrutura do Novo Modal de Menu (`index.html`)

Adicione o código do modal de tela cheia no final do arquivo `index.html`, junto aos outros modais existentes.

```html
<div id="mobileMenuModal" class="mobile-menu-modal-overlay">
    <div class="mobile-menu-content">
        <div id="mobileMenuList" class="mobile-menu-list">
            </div>
    </div>
</div>
```

---

## 3. MODIFICAÇÕES NO CSS (`style.css` ou bloco correspondente)

Aplique as regras de estilização e visibilidade baseadas estritamente nas condições de mídia para o modo retrato do mobile.

```css
/* ==========================================================================
   REESTRUTURAÇÃO MOBILE RETRATO - NOVO FLUXO DE DOCK
   ========================================================================== */

/* Por padrão, esconde os novos elementos no desktop e landscape */
#mobilePortraitActions,
#mobileMenuModal {
    display: none;
}

/* Regra aplicada estritamente no Mobile Retrato */
body:not(.layout-desktop).is-portrait #sidebarDock {
    display: none !important; /* Esconde a dock antiga em formato de scroll horizontal */
}

body:not(.layout-desktop).is-portrait #mobilePortraitActions {
    display: flex !important; /* Exibe os botões Menu e Sair fixos */
    gap: 10px;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 100%;
}

/* Ocultar botões extras da área de macros (mantendo apenas o botão mestre MACROS) */
body:not(.layout-desktop).is-portrait #sidebarMacros .fsBtnMacros,
body:not(.layout-desktop).is-portrait #sidebarMacros .exitBtnMacros,
body:not(.layout-desktop).is-portrait #sidebarMacros button:not(.btn-macros) {
    display: none !important;
}

/* Estilo dos novos botões da Bottom Bar */
.mobile-action-btn {
    background: #222;
    border: 1px solid #444;
    color: #fff;
    padding: 10px 16px;
    font-weight: bold;
    font-size: 14px;
    text-transform: uppercase;
    cursor: pointer;
    border-radius: 4px;
    flex: 1;
    text-align: center;
    min-height: 42px;
}

/* Cor amarela específica para o botão MENU combinando com o Config */
.btn-menu-yellow {
    color: #ffcc00 !important;
    border-color: #ffcc00 !important;
}

/* Estilo do Modal de Menu em Tela Cheia */
.mobile-menu-modal-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    /* Deixa o modal exatamente acima da bottom bar baseando-se no z-index ou na altura */
    bottom: 60px; /* Ajuste para a altura exata da sua bottom bar se necessário */
    background: rgba(10, 10, 10, 0.95);
    z-index: 9999; /* Garanta que fique abaixo apenas da bottom bar se ela for fixa por cima */
    display: none;
    flex-direction: column;
    justify-content: flex-end; /* Inicia os botões de baixo para cima para facilitar o alcance do dedão */
    padding: 20px;
    box-sizing: border-box;
}

.mobile-menu-modal-overlay.active {
    display: flex !important;
}

/* Lista de botões dispostos verticalmente */
.mobile-menu-content {
    width: 100%;
    max-height: 100%;
    overflow-y: auto;
    padding-right: 8px;
    box-sizing: border-box;
}

.mobile-menu-list {
    display: flex;
    flex-direction: column;
    gap: 12px;
    width: 100%;
}

/* Botões de Opção dentro do Modal */
.mobile-menu-item {
    width: 100%;
    background: #1a1a1a;
    border: 1px solid #333;
    color: #fff;
    padding: 18px;
    font-size: 16px;
    font-weight: bold;
    text-transform: uppercase;
    text-align: center;
    border-radius: 6px;
    cursor: pointer;
    box-sizing: border-box;
}

/* Destaque para o botão de Configurações por extenso */
.mobile-menu-item.menu-config {
    color: #ffcc00;
    border-color: #ffcc00;
}

/* Barra de rolagem estilizada para indicar mais conteúdo */
.mobile-menu-content::-webkit-scrollbar {
    width: 6px;
    display: block !important;
}

.mobile-menu-content::-webkit-scrollbar-track {
    background: #111;
}

.mobile-menu-content::-webkit-scrollbar-thumb {
    background: #ffcc00; /* Cor de destaque para indicar a presença da barra */
    border-radius: 3px;
}
```

---

## 4. MODIFICAÇÕES NO JAVASCRIPT

Mantenha a modularidade criando novas funções isoladas para não quebrar a lógica de renderização do desktop.

### 4.1 Inicialização dos Eventos Listeners

Adicione os ouvintes de clique nos novos botões assim que a aplicação carregar (na função de inicialização global).

```javascript
document.addEventListener("DOMContentLoaded", () => {
    const menuBtn = document.getElementById("mobileMenuBtn");
    const sairBtn = document.getElementById("mobileSairBtn");

    if (menuBtn) {
        menuBtn.addEventListener("click", () => {
            toggleMobileMenu();
        });
    }

    if (sairBtn) {
        sairBtn.addEventListener("click", () => {
            handleMobileSairAction();
        });
    }
});
```

### 4.2 Lógica do Botão Sair com Verificação de Prioridade

A regra de ouro: se o modal do menu estiver aberto, o botão "SAIR" da bottom bar apenas fecha o modal. Caso contrário, ele executa a ação nativa da tela atual.

```javascript
function handleMobileSairAction() {
    const modal = document.getElementById("mobileMenuModal");
    
    // PRIORIDADE 1: Se o menu estiver aberto, apenas fecha o menu
    if (modal && modal.classList.contains("active")) {
        closeMobileMenu();
        return;
    }

    // PRIORIDADE 2: Executa o fechamento/desconexão contextual com base no estado atual da aplicação
    const currentMode = window.currentDockMode || 'main';

    switch (currentMode) {
        case 'main':
            // Abre o modal padrão de confirmação de logout/desconexão
            if (document.getElementById('logoutConfirmModal')) {
                document.getElementById('logoutConfirmModal').style.display = 'flex';
            }
            break;
            
        case 'channelConfig':
            // Executa a função nativa para fechar a tela individual do canal
            if (typeof closeChannelConfig === 'function') {
                closeChannelConfig();
            }
            break;
            
        case 'outs':
            // Executa a função nativa para fechar a tela de mix/bus masters
            if (typeof toggleOuts === 'function') {
                toggleOuts();
            }
            break;
            
        case 'techMix':
            // Executa a função nativa para fechar o modo técnico/Sends on Faders
            if (typeof exitTechnicianMixMode === 'function') {
                exitTechnicianMixMode();
            }
            break;

        default:
            console.log("Ação de Sair executada para o modo: " + currentMode);
            break;
    }
}
```

### 4.3 Função Modular de Renderização do Menu Vertical (`renderMobileMenu`)

Modifique ou intercepte a função `renderDock(mode)` original. Sempre que a aplicação atualizar o estado da dock, ela deve espelhar e montar os botões do novo Menu Modal se estiver no modo mobile retrato.

```javascript
function toggleMobileMenu() {
    const modal = document.getElementById("mobileMenuModal");
    if (!modal) return;

    if (modal.classList.contains("active")) {
        closeMobileMenu();
    } else {
        // Renderiza as opções atualizadas com base no modo ativo antes de exibir
        const currentMode = window.currentDockMode || 'main';
        renderMobileMenu(currentMode);
        modal.classList.add("active");
    }
}

function closeMobileMenu() {
    const modal = document.getElementById("mobileMenuModal");
    if (modal) {
        modal.classList.remove("active");
    }
}

function renderMobileMenu(mode) {
    const menuList = document.getElementById("mobileMenuList");
    if (!menuList) return;

    // Limpa os itens anteriores
    menuList.innerHTML = "";

    let buttonsConfig = [];

    // Definição dos botões baseado no escopo aprovado
    switch (mode) {
        case 'main':
            buttonsConfig = [
                { label: 'Configurações do App', isConfig: true, action: "document.getElementById('configModal').style.display='flex';" },
                { label: 'MIX / BUS', action: "if(typeof toggleOuts === 'function') { toggleOuts(); }" }
            ];
            break;

        case 'channelConfig':
        case 'techMix': // O modo de edição de barramento herda a mesma estrutura de canal
            buttonsConfig = [
                { label: 'Configurações do App', isConfig: true, action: "document.getElementById('configModal').style.display='flex';" },
                { label: 'EQ', action: "if(typeof showTab === 'function') { showTab('eq'); }" },
                { label: 'DYN', action: "if(typeof showTab === 'function') { showTab('dyn'); }" },
                { label: 'AUX', action: "if(typeof showTab === 'function') { showTab('aux'); }" },
                { label: 'ROUTING / ETC', action: "if(typeof showTab === 'function') { showTab('routing'); }" }
            ];
            break;

        case 'outs':
            buttonsConfig = [
                { label: 'Configurações do App', isConfig: true, action: "document.getElementById('configModal').style.display='flex';" }
            ];
            break;

        default:
            buttonsConfig = [
                { label: 'Configurações do App', isConfig: true, action: "document.getElementById('configModal').style.display='flex';" }
            ];
            break;
    }

    // SEMPRE adiciona a opção Fullscreen no final de qualquer menu
    buttonsConfig.push({
        label: 'FULLSCREEN',
        action: "if(typeof toggleFullscreen === 'function') { toggleFullscreen(); } else { if(!document.fullscreenElement) { document.documentElement.requestFullscreen(); } else { document.exitFullscreen(); } }"
    });

    // Injeta os elementos HTML mapeados no container do modal
    buttonsConfig.forEach(btn => {
        const buttonElement = document.createElement("button");
        buttonElement.innerText = btn.label;
        buttonElement.className = "mobile-menu-item";
        
        if (btn.isConfig) {
            buttonElement.classList.add("menu-config"); // Aplica a cor amarela por extenso
        }

        // Configura o evento de clique injetando a ação string ou função nativa correspondente
        buttonElement.onclick = () => {
            // Fecha o menu antes de disparar a ação para limpar o fluxo visual
            closeMobileMenu();
            
            // Executa a ação
            if (typeof btn.action === 'string') {
                new Function(btn.action)();
            } else if (typeof btn.action === 'function') {
                btn.action();
            }
        };

        menuList.appendChild(buttonElement);
    });
}
```

---

## 5. INTEGRAÇÃO COM O FLUXO EXISTENTE

Para garantir que a lógica seja respeitada, sincronize as funções:

1. Localize a função onde o estado da tela muda (`renderDock`).
2. No final dessa função, insira uma chamada de atualização para o modal manter-se alinhado:
```javascript
function renderDock(mode) {
    window.currentDockMode = mode;

    /* ... código original ... */

    // Sincroniza o novo menu mobile se ele não estiver ativo
    if (typeof renderMobileMenu === 'function' && document.getElementById('mobileMenuModal') && !document.getElementById('mobileMenuModal').classList.contains('active')) {
        renderMobileMenu(mode);
    }
}
```
