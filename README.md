# 🎚️ Yamaha 01V96 Remote Web Interface

Uma interface web ultra-responsiva, de baixa latência e rica em recursos para controle remoto total da mesa digital **Yamaha 01V96**. Projetada para técnicos de som e músicos que buscam mobilidade, agilidade e automação avançada.

![Tech Stack](https://img.shields.io/badge/Stack-Rust%20|%20Node.js%20|%20Socket.io-blue?style=for-the-badge)
![Status](https://img.shields.io/badge/Status-Active%20Development-success?style=for-the-badge)

> [!IMPORTANT]
> **Aviso de Migração**: O core do servidor foi migrado para a linguagem **Rust** (`server_rust`), que agora é o foco principal do desenvolvimento visando performance máxima, estabilidade e baixíssima latência. O servidor legado em **Node.js** continua funcional, porém possui menos features e em breve será considerado obsoleto. O frontendcontinua em Vanilla JS.

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
*   **Conexão remota a mesa**: Agora você pode rodar o mini-servidor `remote_midi_server` do computador local onde a mesa está conectada fisicamente e o servidor principal rodar em outro computador, na mesma rede, ou até mesmo em uma VM.
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

### 🦀 Rust (Recomendado)

O servidor em Rust oferece performance superior, baixíssima latência e é o foco principal do desenvolvimento atual. O projeto é estruturado em um **Cargo Workspace** unificado na raiz.

**Pré-requisitos:**
* **Ambiente Rust** instalado (necessário para compilar/rodar via Cargo).
* **Driver MIDI da Yamaha** instalado e a mesa conectada via USB.
* **Git** configurado (para as funções de Auto-Sync/Ninja Sync).

#### ⚡ Inicialização Rápida (Recomendado)
Você pode iniciar os servidores diretamente através dos executáveis na raiz do projeto (não requer terminal aberto):

* **No Windows**:
  * **Servidor Principal**: Dê um duplo clique no arquivo `iniciar_server_rust.bat`.
  * **Servidor MIDI Remoto**: Dê um duplo clique no arquivo `iniciar_remote_midi_server.bat`.

> [!NOTE]
> **Suporte a macOS (Experimental / Não Testado)**:
> Foram incluídos os scripts `iniciar_server_rust.command` e `iniciar_remote_midi_server.command` para inicialização via Finder no macOS. Como o desenvolvimento é focado primariamente no Windows, **não há garantias de funcionamento completo ou de suporte ao driver MIDI da Yamaha no macOS**.
> * **Para rodar no macOS**: Dê um duplo clique nos arquivos `.command` correspondentes. (Se necessário, dê permissão via terminal com `chmod +x *.command`).

> [!IMPORTANT]
> **Driver MIDI USB da Yamaha**:
> É indispensável instalar o **Yamaha USB-MIDI Driver** oficial no sistema onde a mesa 01V96 estiver conectada via cabo USB, garantindo que o programa reconheça a porta MIDI da mesa.

---

#### 💻 Inicialização via Terminal (Modo Desenvolvimento)
Como o projeto utiliza um Workspace, você pode executar os comandos diretamente na raiz do projeto:

1. **Inicie o servidor principal**:
   ```bash
   cargo run
   ```
   *(Ou especifique o pacote: `cargo run -p server_rust`)*

2. **Inicie o servidor de rede MIDI física (opcional)**:
   Se a mesa estiver conectada fisicamente em outro PC na mesma rede, execute no root:
   ```bash
   cargo run -p remote_midi_server
   ```

---

#### 🛠️ Compilação e Geração de Releases
Para compilar a versão final otimizada dos servidores:
1. **Via Script (Fácil)**: Execute o arquivo `cargo build release.bat` na raiz.
2. **Via Terminal**: Execute o comando abaixo no root do projeto:
   ```bash
   cargo build --release
   ```
Os executáveis finais (`server_rust.exe` e `remote_midi_server.exe`) serão gerados em `target/release/` e estarão prontos para serem iniciados pelos atalhos do root.

---

### 🎤 Usando o Microfone do Dispositivo para o RTA do Equalizador (Acesso Seguro via Tailscale)

Para que o operador de áudio consiga usar o **Microfone do seu próprio Celular/Tablet/PC** para alimentar o gráfico do **RTA (Real-Time Analyzer)** direto na tela do Equalizador, os navegadores modernos exigem que o site seja acessado de forma totalmente segura (HTTPS). Sem o HTTPS, o navegador bloqueia a caixinha que pede permissão para acessar o microfone.

Para resolver isso de forma mágica, sem precisar abrir porta no roteador da igreja ou pagar por domínios, nós integramos a mesa ao **Tailscale**. Abaixo está o passo a passo detalhado, feito para que qualquer técnico consiga fazer:

**Passo 1: Instalar o Tailscale no computador da mesa de som**
1. Acesse o site oficial [tailscale.com](https://tailscale.com/) e crie uma conta gratuita.
2. Baixe o instalador para o Windows e instale como qualquer outro programa (basta ir clicando em "Next" ou "Avançar").
3. Após instalar, procure pelo ícone do Tailscale escondido perto do relógio do Windows, no canto inferior direito da tela.
4. Clique com o botão direito nesse ícone e escolha "Log in" para entrar com a conta que você acabou de criar.

**Passo 2: Ativar o HTTPS no Painel do Tailscale (Apenas na primeira vez)**
1. Pelo computador, acesse sua conta no site do Tailscale pelo navegador.
2. No menu que fica do lado esquerdo da tela, procure e clique na aba chamada **DNS**.
3. Role a página para baixo até ver uma opção chamada **MagicDNS** e clique no botão para **Ativar (Enable)**.
4. Quase na mesma tela, um pouco mais abaixo, procure pela área **HTTPS Certificates** e clique também em **Enable HTTPS**.
*(Isso diz para a VPN que ela tem permissão de criar aquele cadeado verde de segurança para nós).*

**Passo 3: Instalar e Conectar o Tailscale nos Dispositivos Clientes (Celular, Tablet ou outro PC)**
Para que os dispositivos consigam se comunicar de forma segura e o redirecionamento automático para HTTPS funcione, **todos os aparelhos clientes que acessarão a mesa de som também precisam ter o Tailscale instalado e ativo**.

1. **A Regra de Ouro (Mesma Conta):** Ao instalar o Tailscale em qualquer dispositivo novo (seja o celular Android do operador, um iPad/iPhone ou outro notebook Windows), você deve **fazer login usando a mesma conta** que criou no Passo 1. Isso garante que todos eles sejam adicionados automaticamente à mesma rede privada virtual (sua *tailnet*).
2. **Instalação nos diferentes sistemas:**
   * **Android:**
     * Baixe o aplicativo **Tailscale** na **Google Play Store**.
     * Abra o app, toque em **Get Started** / **Log In** e entre com a mesma conta do servidor.
     * Ative a chave de conexão principal. O Android solicitará permissão para configurar uma conexão VPN local; aceite e confirme.
   * **iOS (iPhone / iPad):**
     * Instale o aplicativo **Tailscale** na **Apple App Store**.
     * Abra o app e faça login com a mesma conta.
     * Ative a conexão no interruptor principal. O sistema iOS solicitará permissão para adicionar configurações de VPN; insira sua senha ou use o FaceID/TouchID para autorizar.
   * **Windows (Outro PC/Notebook):**
     * Baixe o instalador oficial em [tailscale.com/download/windows](https://tailscale.com/download/windows).
     * Siga o assistente de instalação padrão.
     * Clique com o botão direito no ícone do Tailscale na bandeja do sistema (perto do relógio) e selecione **Log in...**. Realize a autenticação com a mesma conta no navegador.
3. Certifique-se de que a conexão VPN do Tailscale está marcada como conectada/ativa em ambos os lados (no PC da mesa e no dispositivo do operador).

**Passo 4: Abrir o Servidor da Mesa de Som**
1. Inicie o nosso servidor normalmente (clicando duas vezes no atalho ou rodando o terminal).
2. O servidor é muito inteligente e vai perceber sozinho que o Tailscale está lá. Ele vai solicitar e configurar tudo sozinho nos bastidores.
3. Fique de olho na tela preta (terminal), lá vai aparecer uma mensagem de sucesso, parecida com isso:
   `✅ [TAILSCALE] Tudo pronto! O Microfone esta liberado pelo link: https://...`
4. **A Mágica:** O operador pode continuar acessando pelo endereço local normal da rede (exemplo: `http://192.168.0.X:3000`). O nosso sistema vai entender a situação e a página vai "piscar" rapidamente, redirecionando o celular sozinho para o link seguro (`https`) do Tailscale! O celular vai pedir a permissão de usar o microfone e estará pronto para o uso.

---

### 🟢 Node.js (Obsoleto)

O servidor legado em Node.js continua funcional para testes básicos, mas possui menos recursos e não recebe novas atualizações. Seus arquivos de código e configuração foram compactados para manter a raiz limpa.

**Pré-requisitos:**
* **Node.js** instalado.
* **Driver MIDI da Yamaha** instalado e a mesa conectada via USB.
* **Git** configurado (para as funções de Auto-Sync/Ninja Sync).

**Passos para Execução:**
1. **Extraia os arquivos do servidor legado**:
   Extraia todo o conteúdo do arquivo `_legacy_node_server.zip` diretamente na raiz do projeto (isso restaurará o arquivo `server.js`, a pasta `src/`, o `package.json` e o `package-lock.json`).
2. **Instale as dependências na raiz do projeto**:
   ```bash
   npm install
   ```
3. **Inicie o servidor legado**:
   ```bash
   npm start
   ```

---

## 🧭 Roadmap de Desenvolvimento

- [x] Refatoração do motor de Faders Mobile.
- [x] Sistema de Multi-Presets com detecção de Host.
- [x] Modo "Sends on Faders" para Mixes.
- [x] Ninja Sync (Auto-Git push/pull).
- [x] **MIDI Bridge over Network**: Bridge de rede TCP ultra-rápida (com heartbeat, reconnect dinâmico e tray autônomo).
- [ ] Suporte a múltiplos usuários com controle de permissão (Admin/Musician).
- [x] Fazer o meter do master funcionar.
- [x] Sistema de cenas de nomes customizados.
- [x] Atribuição de nome ao servidor/mesa.
- [x] Patch de INSERTS nos canais.
- [ ] Tela de EFEITOS.


---

## 🤝 Contribuição

Qualquer contribuição que você fizer será **muito apreciada**.

---

## 📄 Licença

Distribuído sob a licença MIT. Veja `LICENSE` para mais informações.

## 💡 Créditos e Referências

O módulo de integração DMX deste projeto utiliza o motor de tradução ArtNet para DMX baseado no projeto open-source [ArtNetDMX](https://github.com/nt2ds/ArtNetDMX) de **nt2ds**. O executável incluído foi adaptado para suportar o fluxo de auto-recuperação e reset forçado de hardware FTDI integrados à interface da Yamaha 01V96.

### Opus Codec (Fork Vendorizado)

O servidor Rust utiliza o codec **Opus** para compressão de áudio no sistema de monitoramento. Como a implementação pura em Rust — [`opus-rs`](https://github.com/restsend/opus-rs) v0.1.23 de **jinti** — utiliza instruções AVX/AVX2 que causam `STATUS_ILLEGAL_INSTRUCTION` em CPUs sem suporte (Celeron, Pentium, VMs), nós **vendorizamos um fork** em `server_rust/vendor/opus-rs/`.

**O que foi alterado no fork:**
- Todas as 26 chamadas a `is_x86_feature_detected!("avx"|"avx2"|"avx2,fma")` foram prefixadas com `false &&`, forçando o caminho escalar (sem SIMD). As funções com `#[target_feature]` continuam compilando como código morto, mas nunca são executadas em tempo real.
- `Cargo.toml` simplificado (apenas a lib, sem testes/exemplos/benches).

**Por que vendorizado:** garantia de que qualquer máquina que clonar o projeto terá o fork disponível imediatamente, sem depender de registry externo ou de suporte AVX na CPU.

**Licença:** O código original do `opus-rs` é distribuído sob **BSD-3-Clause** (mantida no fork).

---
**Desenvolvido por Rodrigo (Theadrill) usando Antigravity**  
*Fazendo sua velha 01v96 soar como 'nova' 😉*
