# 🎚️ Yamaha 01V96 Remote Web Interface

Uma interface web ultra-responsiva, de baixa latência e rica em recursos para controle remoto total da mesa digital **Yamaha 01V96**. Projetada para técnicos de som e músicos que buscam mobilidade, agilidade e automação avançada.

![Tech Stack](https://img.shields.io/badge/Stack-Rust%20|%20Node.js%20|%20Socket.io-blue?style=for-the-badge)
![Status](https://img.shields.io/badge/Status-Active%20Development-success?style=for-the-badge)

> [!IMPORTANT]
> **Aviso de Migração**: O core do servidor foi migrado para a linguagem **Rust** (`server_rust`), que agora é o foco principal do desenvolvimento visando performance máxima, estabilidade e baixíssima latência. O servidor legado em **Node.js** continua funcional, porém possui menos features e em breve será considerado obsoleto.

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
*   **Auto-Connect & Auto-Reload**: Identificação automática da mesa Yamaha via USB e facilidade para reiniciar o servidor em segundo plano.
*   **Mini Server Tray**: O servidor remoto de MIDI também possui sua própria aplicação de bandeja minimalista, permitindo reiniciar ou encerrar o serviço sem necessidade de terminal ativo.

### 🌐 Remote MIDI over Network (Bridge de Rede)
*   **Arquitetura Client-Server**: Separação física entre o hardware da mesa e o servidor principal de aplicação. O mini-servidor `remote_midi_server` age como gateway de rede TCP (porta `4200`) e despacha pacotes SysEx e MIDI brutos.
*   **Reconexão Robusta & Heartbeat**: Mecanismo ativo de batimento cardíaco (Heartbeat) a cada 3 segundos com timeout para detecção imediata de quedas de rede e auto-recuperação sem criar conexões órfãs.
*   **Redundância**: Suporte para definição de um array de IPs/Hosts (`remote_midi_networks`) no `config.json` para tentativa de conexão fallback sequencial.

---

## 🛠️ Tecnologias Utilizadas

*   **Backend Principal (Rust)**: Desenvolvido em Rust (`server_rust`) utilizando `tokio` para E/S assíncrona, `axum` para servir páginas e `socket.io-parser` para comunicação via WebSockets.
*   **Remote MIDI Bridge (Rust)**: Mini-servidor portátil (`remote_midi_server`) e crate comum `midi_common` para gerenciamento de pacotes MIDI/SysEx em rede TCP de alto desempenho.
*   **Backend Legado (Node.js)**: Servidor Node.js com Express e Socket.io (opcional).
*   **MIDI Bridge Física**: `midir` (em Rust) e `easymidi` (em Node.js) para interface direta com o driver USB da Yamaha.
*   **Frontend**: Vanilla JS (ES6+), CSS3 Moderno (Glassmorphism), HTML5 Semantic.
*   **Automação**: Integração Git via subprocesso para o Ninja Sync.

---

## 🚀 Como Iniciar

1.  **Pré-requisitos**:
    *   Ambiente Rust instalado (se for rodar o servidor Rust moderno).
    *   Node.js instalado (se for rodar o front ou servidor legados).
    *   Driver MIDI da Yamaha instalado e mesa conectada via USB.
    *   Git configurado (para as funções de Auto-Sync).

2.  **Instalação**:
    ```bash
    git clone https://github.com/Theadrill/01v96-remote-web.git
    cd 01v96-remote-web
    # Instalação das dependências do painel e servidor node
    npm install
    ```

3.  **Execução (Servidor Rust Moderno)**:
    *   Acesse a pasta `server_rust` e inicie:
        ```bash
        cargo run --release
        ```
    *   Para o servidor de rede MIDI física (caso a mesa esteja em outro PC):
        ```bash
        cargo run --bin remote_midi_server --release
        ```

---

## 🧭 Roadmap de Desenvolvimento

- [x] Refatoração do motor de Faders Mobile.
- [x] Sistema de Multi-Presets com detecção de Host.
- [x] Modo "Sends on Faders" para Mixes.
- [x] Ninja Sync (Auto-Git push/pull).
- [x] **MIDI Bridge over Network**: Bridge de rede TCP ultra-rápida (com heartbeat, reconnect dinâmico e tray autônomo).
- [ ] Implementação de Meters GPU-Accelerated (Curtain Rendering).
- [ ] Suporte a múltiplos usuários com controle de permissão (Admin/Musician).
- [ ] Fazer o meter do master funcionar.


---

## 🤝 Contribuição

Contribuições são o que fazem a comunidade open source um lugar incrível para aprender, inspirar e criar. Qualquer contribuição que você fizer será **muito apreciada**.

---

## 📄 Licença

Distribuído sob a licença MIT. Veja `LICENSE` para mais informações.

## 💡 Créditos e Referências

O módulo de integração DMX deste projeto utiliza o motor de tradução ArtNet para DMX baseado no projeto open-source [ArtNetDMX](https://github.com/nt2ds/ArtNetDMX) de **nt2ds**. O executável incluído foi adaptado para suportar o fluxo de auto-recuperação e reset forçado de hardware FTDI integrados à interface da Yamaha 01V96.

---
**Desenvolvido por Rodrigo (Theadrill) usando Antigravity**  
*Transformando o controle de áudio ao vivo em uma experiência moderna e conectada.*
