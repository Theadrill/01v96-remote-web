# Diretrizes de Responsividade Universal e Suporte a Dispositivos

Este documento formaliza a visão de design e arquitetura de interface para o projeto **01V96 Remote Web** (`public_new`), detalhando o suporte a diferentes classes de dispositivos e os princípios de responsividade.

---

## 🎯 Visão do Projeto

O objetivo fundamental da interface é proporcionar uma experiência de operação rápida, ergonômica e sem atritos em **qualquer dispositivo**, independentemente da resolução, proporção de aspecto ou tamanho físico da tela:

1. **Smart TVs / Grandes Monitores (4K / 1080p / Ultrawide):**
   - Visão completa tipo console digital com todos os faders e canais visíveis simultaneamente.
   - Espaçamento muscular a cada 8 canais para orientação tátil rápida.

2. **Notebooks e Workstations (13" a 17"):**
   - Operação via mouse, trackpad ou tela touch com atalhos de teclado e faders densos.

3. **Tablets e Handhelds (iPads, Android Tablets, Steam Deck ~7" 1280x800):**
   - Ergonomia touch-first com botões de tamanho intermediário e resposta imediata.

4. **Smartphones Padrão (ex: Samsung Galaxy A55 ~6.6", iPhones modernos 6.1" - 6.7"):**
   - Modo mobile com faders largos (touch-targets generosos), rolagem horizontal fluida e acesso rápido à sidebar.

5. **Smartphones Ultra-Compactos (ex: iPhone SE 3 ~4.7" / 375x667 viewport):**
   - Desafio crítico de altura e largura de tela.
   - Todas as 7 zonas modulares do channel strip (Header, TopAction, Display, MiddleFeature, PrimaryButton, FaderCore, FooterRouting), bem como os modais de canal (EQ, Dynamics, Aux Sends, Routing) devem se auto-ajustar sem cortar botões, encavalar textos ou exigir rolagem vertical na tela principal.

---

## 📐 Modos de Layout Atuais

O sistema divide a renderização em dois modos principais:

| Modo de Layout | Propósito | Dispositivos Alvo |
|---|---|---|
| **DESKTOP** | Visão simultânea de todos os canais do bloco/banco ativo em tela cheia | Monitores, Notebooks, TVs, Telas > 1200px |
| **MOBILE** | Faders individuais largos com deslizamento horizontal (`pan-x`) e navegação por sidebar | Smartphones (iPhone SE, Galaxy A55), Tablets em retrato, Steam Deck |

---

## 🔄 Transição Legacy (`public`) para `public_new`

- **Código Legado (`public/`):** Contém media queries e regras específicas para cálculo de altura (`100dvh`), ajustes para iPhone SE e telas pequenas espalhadas em arquivos CSS legados.
- **Modernizado (`public_new/`):** Deve consolidar e refinar essas regras de responsividade em componentes modulares (CSS variables `--strip-*`), garantindo que:
  - O cálculo de proporção do fader mantenha precisão mesmo com pouca altura vertical (viewport de 667px ou menor).
  - Os botões de ação (`ON`, `SOLO`, `PRE/POST`, Nudges) mantenham a área mínima de toque recomendada (mínimo 32px a 44px de altura tátil).
  - Modais de Equalizador e Dinâmica adaptem os gráficos SVG e curvas sem overflow.

---

*Nota: Este documento reflete a diretriz estratégica e o compromisso de design do projeto e deve ser consultado antes de qualquer refatoração de layout ou estilização de componentes.*
