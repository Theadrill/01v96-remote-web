# Plano de Implementação: Pseudo RTA (Real-Time Analyzer)

Este documento detalha o planejamento arquitetural e a estratégia de implementação para a integração de um RTA no Equalizador da mesa 01V96, processado via microfone (Servidor ou Dispositivo Atual), sem impactar a estabilidade do fluxo de controle MIDI.

## 1. Visão Geral do Fluxo

A interface do Equalizador (EQ) ganhará um botão de "RTA". Quando ativado, o aplicativo vai renderizar um espectro de áudio ao fundo da curva atual do EQ, servindo de guia visual para a mixagem, num estilo muito parecido com os equalizadores modernos (como FabFilter Pro-Q).

### Estados e Decisões:
1. **Ativação:** Ao ligar o RTA no EQ pela primeira vez, será exibido um Modal perguntando a origem do áudio (com requisição de permissão):
   - **Microfone do Servidor** (captado pela placa padrão do PC host).
   - **Microfone do Dispositivo Atual** (captado pelo celular/tablet/PC do próprio operador no navegador).
2. **Pausa Inteligente (Timeout / Visibilidade):**
   - O estado de ativação ("ON") persiste, mas o *processamento e o tráfego de rede são interrompidos* sempre que a tela de EQ não estiver visível por mais de **5 segundos**.
   - Ao retornar à tela do EQ, o processamento retoma imediatamente usando o último microfone selecionado.

---

## 2. Implementação no Servidor (Backend Rust)

Se o "Microfone do Servidor" for o escolhido, precisamos ter a máxima cautela para que a matemática do áudio não crie engasgos na comunicação com a mesa 01V96.

### Adições Necessárias (`server_rust/Cargo.toml`):
* `cpal` (para capturar o microfone local do servidor).
* `rustfft` (para realizar o cálculo matemático da Transformada Rápida de Fourier).

### Arquitetura de Threads para Áudio:
- **Thread Dedicada:** A captura e o processamento matemático do áudio devem ser injetados em uma Thread do SO (`std::thread::spawn` ou `tokio::task::spawn_blocking`) totalmente alheia à thread principal que processa os `WebSockets` e o barramento `MIDI`.
- **Cálculo Desacoplado:** Nessa thread isolada, o áudio é processado usando a `rustfft` para transformar as ondas sonoras em um vetor de frequências (magnitudes / decibéis).
- **Comunicação Segura:** O resultado (um array simples de floats com o nível de cada frequência) será despachado de volta para o controlador de WebSocket via canal assíncrono não-bloqueante (`tokio::sync::mpsc`). O WebSocket apenas empurra esse array pronto para o frontend.
- **Suspensão Dinâmica:** A thread de áudio só será iniciada/mantida ativa se o WebSocket estiver sinalizado com `rta_server_active = true`. Caso ocorra a *Pausa Inteligente* (cliente fecha a aba de EQ), o servidor encerra o loop de captura para poupar recursos.

---

## 3. Implementação no Cliente (Frontend e WASM)

### Se o "Microfone do Dispositivo Atual" for o escolhido:
- Utilizaremos a API nativa `navigator.mediaDevices.getUserMedia({ audio: true })`.
- O aúdio capturado será enviado em blocos para nosso **Módulo WASM** existente (`client_wasm`), o qual fará a FFT localmente aproveitando a altíssima velocidade do Rust compilado no navegador.
- Assim como no servidor, o processamento será isolado (preferencialmente utilizando um `AudioWorklet` passando a referência para a instância WASM, ou por meio de processadores de background para não bloquear a UI do navegador).

### Se o "Microfone do Servidor" for o escolhido:
- O frontend simplesmente aguardará os arrays pré-calculados do backend chegando via Socket.IO, desviando de todo o processamento de áudio.

### Renderização Gráfica (`public/modules/eq.js`):
- **O Canvas do RTA:** Será adicionada uma camada de visualização (um elemento `canvas` ou a mesma tecnologia usada no atual) posicionada **logo atrás** do gráfico de EQ (usando `z-index` inferior e preenchimento cinza translúcido).
- **Smooth / Interpolação:** Para o RTA não ficar tremendo violentamente e irritar a visão, os frames precisam passar por um leve "smoothing" visual antes de pintar no canvas (onde a queda de db nas barras ocorre de forma suave).

---

## 4. Estratégia Passo a Passo

* **Fase 1: Preparação do Servidor (Rust)**
  1. Instalar `cpal` e `rustfft`.
  2. Construir um módulo interno isolado (ex: `rta_manager.rs`) que inicie e interrompa a captura do input padrão de áudio.
  3. Integrar isso aos eventos do Socket (receber o pedido de "ligar_rta_servidor", "desligar/pausar_rta_servidor" e enviar as atualizações por segundo).

* **Fase 2: Preparação do WASM (Rust) para Captação Local**
  1. No projeto `client_wasm`, adicionar biblioteca de FFT.
  2. Expor função que recebe um buffer do Microfone (do JavaScript) e cospe o array das barras de frequência.

* **Fase 3: Modificações no Frontend (UI / EQ)**
  1. Inserir botão "RTA" no design da view do equalizador.
  2. Implementar o Modal de Seleção ("Microfone do Servidor" x "Dispositivo Atual") salvando essa preferência num `localStorage` ou estado global.
  3. Adaptar o `eq.js` para inicializar a captura (remota ou local) apenas quando aberto, e gerenciar a "Pausa Inteligente" ao sair da tela/depois de 5s inativo.
  4. Escrever o loop de desenho `requestAnimationFrame` que vai pintar a forma de onda do RTA no *background* do canvas do EQ.

---

Este documento norteará as decisões arquiteturais da Feature, separando os complexos fluxos de hardware do servidor e de rendering fluido no frontend.
