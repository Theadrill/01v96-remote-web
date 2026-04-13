# 🎚️ Yamaha 01V96 Remote Web Interface

Uma interface web ultra-responsiva, de baixa latência e rica em recursos para controle remoto total da mesa digital **Yamaha 01V96**. Projetada para técnicos de som e músicos que buscam mobilidade, agilidade e automação avançada.

![Project Preview](https://img.shields.io/badge/Aesthetics-Premium-blueviolet?style=for-the-badge)
![Tech Stack](https://img.shields.io/badge/Stack-Node.js%20|%20Socket.io%20|%20Express-blue?style=for-the-badge)
![Status](https://img.shields.io/badge/Status-Active%20Development-success?style=for-the-badge)

---

## 🔥 Principais Características

### 📱 Design Híbrido & Responsivo
*   **Versatilidade Total**: Layouts otimizados para **Desktop**, **Mobile Portrait** (Vertical) e **Mobile Landscape** (Horizontal).
*   **Aparência Premium**: Interface inspirada em hardwares topo de linha, com modo escuro, micro-animações e feedback visual em tempo real.

### 🎛️ Sends on Faders (Mixer de Monitoração)
*   **Controle de Auxiliares**: Transforme sua interface mobile em um mixer de monitoração completo.
*   **Modo Dual**: Alterne entre o envio de um canal para todos os auxiliares ou o modo "Mix Master", onde você controla todos os envios de entrada para um único barramento usando faders verticais.

### ⚡ Sistema de Macros "Ninja Sync"
*   **Presets por Ambiente**: O sistema detecta automaticamente o host/IP e carrega o preset de macros específico daquela igreja ou bar.
*   **Sincronização em Nuvem**: Alterações feitas em um dispositivo são automaticamente salvas e enviadas para o GitHub (via integração Git automática), garantindo que suas macros estejam sempre seguras e atualizadas.
*   **Integração Lumikit**: Controle sistemas de iluminação Lumikit diretamente da interface da mesa.

### 📊 Monitoramento em Tempo Real
*   **Meters de Áudio**: Visualização fluida dos níveis de entrada e saída (Master) via SysEx.
*   **Dynamics & EQ**: Interface visual para ajuste de Gate, Compressores e Equalizador Paramétrico de 4 bandas com gráfico iterativo.

### 🖥️ Windows Tray Application
*   **Acesso Rápido**: Gerencie conexões MIDI e abra a interface no navegador diretamente da bandeja do sistema Windows.
*   **Auto-Connect**: Identificação automática da mesa Yamaha via USB.

---

## 🛠️ Tecnologias Utilizadas

*   **Backend**: Node.js com Express para o servidor web.
*   **Comunicação**: Socket.io para troca de mensagens SysEx de baixa latência.
*   **MIDI Bridge**: `easymidi` para interface direta com o hardware Yamaha.
*   **Frontend**: Vanilla JS (ES6+), CSS3 Moderno (Glassmorphism), HTML5 Semantic.
*   **Automação**: Integração Git via `child_process` para o Ninja Sync.

---

## 🚀 Como Iniciar

1.  **Pré-requisitos**:
    *   Node.js instalado.
    *   Driver MIDI da Yamaha instalado e mesa conectada via USB.
    *   Git configurado (para as funções de Auto-Sync).

2.  **Instalação**:
    ```bash
    git clone https://github.com/Theadrill/01v96-remote-web.git
    cd 01v96-remote-web
    npm install
    ```

3.  **Execução**:
    ```bash
    npm start
    ```
    *   O servidor iniciará na porta `4000`.
    *   Acesse `http://localhost:4000` ou `http://[seu-ip]:4000`.

---

## 🧭 Roadmap de Desenvolvimento

- [x] Refatoração do motor de Faders Mobile.
- [x] Sistema de Multi-Presets com detecção de Host.
- [x] Modo "Sends on Faders" para Mixes.
- [x] Ninja Sync (Auto-Git push/pull).
- [ ] Implementação de Meters GPU-Accelerated (Curtain Rendering).
- [ ] Suporte a múltiplos usuários com controle de permissão (Admin/Musician).

---

## 🤝 Contribuição

Contribuições são o que fazem a comunidade open source um lugar incrível para aprender, inspirar e criar. Qualquer contribuição que você fizer será **muito apreciada**.

---

## 📄 Licença

Distribuído sob a licença MIT. Veja `LICENSE` para mais informações.

---
**Desenvolvido por Rodrigo (Theadrill)**  
*Transformando o controle de áudio ao vivo em uma experiência moderna e conectada.*
