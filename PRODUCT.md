# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- **Técnicos de Áudio / FOH / Monitores:** Operação profissional ao vivo e ensaios, ajuste rápido de ganho, faders, pan, equalização paramétrica (4 bandas), dinâmicas (gate e compressor), sends de auxiliares, barramentos (buss) e roteamento I/O.
- **Músicos (Modo Musician / Personal Monitor):** Controle restrito do seu próprio mix de monitor/auxiliar sem acesso a parâmetros críticos de FOH.

## Product Purpose

Interface de controle remoto responsiva, moderna e de altíssimo desempenho (Web + Desktop Tauri) para mesas de som digitais Yamaha 01V96 (01V96, 01V96V2, 01V96i), permitindo controle simultâneo, bidirecional e de latência ultra-baixa via MIDI/WebSockets.

## Positioning

Uma solução web/desktop moderna, responsiva (touch-friendly mobile + desktop multi-screen), modular e em tempo real para a Yamaha 01V96 que substitui e supera o antigo software proprietário Studio Manager, sem depender de drivers obsoletos ou sistemas operacionais antigos.

## Operating Context

- Ambientes ao vivo (shows, cultos, eventos), estúdios e ensaios.
- **Espectro Universal de Dispositivos Suportados:**
  - **Telas Grandes:** Smart TVs (4K/FHD), monitores ultrawide/desktop e notebooks (visão completa tipo console).
  - **Telas Médias / Handhelds:** Tablets (iPad/Android), Steam Deck (16:10 / 800p) e laptops compactos.
  - **Smartphones Standard & Compactos:** Smartphones modernos padrão (ex: Galaxy A55 ~6.6") até telas ultra-compactas (ex: iPhone SE 3 de 4.7" / 375x667px).
- Uso simultâneo em múltiplos dispositivos com sincronização de estados em tempo real.
- Hardware físico Yamaha 01V96 conectado via USB-MIDI ou portas MIDI físicas ao host do backend.

## Capabilities and Constraints

- **Controle Total dos Canais:** 32 canais mono de entrada + 4 canais estéreo (ST IN 1-4) + 8 auxiliares + 8 busses + Master Stereo Out.
- **Processamento de Sinal:** Equalizador paramétrico de 4 bandas com curva gráfica em tempo real (EQ), Gate/Ducker (CH 1-32), Compressor em todos os canais/mixes, Routing, Inversão de fase, Atenuador e Delay.
- **Sincronização Bidirecional:** Qualquer movimento na mesa física atualiza a tela instantaneamente e vice-versa, com suporte a faders motorizados virtuais e debounce de envio MIDI.
- **Suporte a Pares Estéreo:** Canais pareados movem faders e parâmetros vinculados sincronizadamente.
- **Modos de Layout (Desktop vs Mobile):**
  - **Layout Desktop:** Exibição densa de múltiplos canais com visual clássico de console.
  - **Layout Mobile:** Faders táteis largos com rolagem contínua (`touch-action: pan-x`) e sidebar retrátil/fixa. Requer refinamento contínuo em `public_new` para comportar telas mínimas (como iPhone SE 3 4.7") sem quebra de layout, truncamento de botões ou perda de ergonomia tátil.

## Evidence on Hand

- Código fonte consolidado em `public_new/` (HTML/CSS/Vanilla JS modularizado em IIFE e WebSockets).
- Backend Node.js / Rust Tauri com comunicação MIDI via SysEx e MIDI CC.
- Documentações técnicas de arquitetura em `docs/`.

## Product Principles

1. **Latência Zero e Confiabilidade Máxima:** Operação em eventos ao vivo exige resposta tátil imediata e estabilidade absoluta.
2. **Ergonomia Operacional Tátil:** Elementos de controle (faders, knobs, botões de mute/solo) grandes o suficiente para toque em telas móveis e fáceis de operar sob pressão.
3. **Fidelidade e Legibilidade:** Informações críticas (níveis de VU, ganho, frequências de EQ, status de mute/solo) com contraste claro e feedback visual instantâneo.
4. **Resiliência a Desconexões:** Reconexão automática transparente com ressincronização total de parâmetros.
