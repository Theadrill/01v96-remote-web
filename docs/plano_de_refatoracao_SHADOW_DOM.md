# Plano de Refatoração — Migração para Web Components com Shadow DOM

> ⚠️ **Este plano é para a v2 do sistema (`public_new/`).** Não modificar nada no `public/` original sem decisão explícita.
>
> 📎 **Referência:** Este plano foi originado durante o grill-me do `plano_de_implementacao_componente_CHANNEL_STRIP.md` — retomar os branches em aberto documentados no final daquele arquivo após a estabilização da v1.

---

## Princípio Fundamental — Sem Anti-Patterns

> **Esta regra se sobrepõe a qualquer decisão de conveniência ou velocidade.**
>
> O `public_new/` é uma reescrita profissional. Toda decisão técnica deve seguir o padrão adotado por empresas como Google, Microsoft, Adobe, Yamaha e Allen & Heath em seus sistemas de design e interfaces de controle de áudio profissional. Se a escolha correta exige mais trabalho, reescrita de arquivos existentes ou mudança de infraestrutura — fazemos. Facilidade de implementação **nunca** é critério de decisão arquitetural.
>
> Anti-patterns explicitamente proibidos neste projeto:
> - `window.algo` — globals implícitas. Usar módulos ES com `import/export`.
> - `querySelector` global para sincronização de estado — usar pub/sub (MeterBus).
> - CSS com seletores que dependem de estrutura interna de componentes — usar CSS Custom Properties.
> - Lógica de negócio dentro de componentes visuais — separar camadas View / Logic / Data.
> - `if/else` cruzando contextos diferentes num mesmo componente — usar presets declarativos.
> - Sufixos `_v2` em arquivos dentro do `public_new/` — o contexto já é a v2. Usar o nome correto.

---

## Contexto e Motivação

O sistema atual (`public/`) usa DOM aberto com `querySelector` global para sincronização de VU Meters e faders via `socket.js`. Isso funciona, mas cria acoplamento estrutural entre o motor de sincronização e a estrutura HTML dos componentes — qualquer refatoração visual exige atenção ao `socket.js`.

A v2 (`public_new/`) resolve isso com:

1. **Web Components com Shadow DOM** — encapsulamento real de estilo e estrutura
2. **MeterBus pub/sub central** — o motor de meters deixa de varrer o DOM e passa a publicar dados por canal
3. **CSS 100% via Custom Properties** — temas funcionam atravessando o Shadow boundary sem `adoptedStyleSheets`
4. **ES Modules nativos** — zero globals implícitas, dependências explícitas via `import/export`
5. **Strangler Fig Pattern** — `/new` coexiste com `/` até validação completa, depois o novo vira padrão

---

## Estratégia de Coexistência

- `public/` — sistema atual, intocado, continua sendo a URL padrão (`/`)
- `public_new/` — ponto de partida da v2, exposta em `/new` (já configurado no servidor Rust)
- Bugfixes críticos no `public/` são aplicados em ambos até a migração estar completa
- Quando `public_new/` for validado em produção: `/new` vira `/`, `public/` vira legado

---

## Requisitos Mínimos de Dispositivo

O piso é definido pelo **Shadow DOM** e **ES Modules nativos**:

| Dispositivo | Versão Mínima | Hardware equivalente |
|---|---|---|
| iPhone | iOS 10.3+ | iPhone 5 (2012) ou superior |
| iPad | iPadOS 10.3+ | iPad 4ª geração (2012) ou superior |
| iPad mini | iPadOS 10.3+ | iPad mini 2 (2013) ou superior |
| Android | Chrome atualizado (Android 5.0+) | — |
| Desktop | Chrome 73+ / Firefox 63+ / Safari 10.1+ | — |

---

## Arquitetura Definida — Decisões Consolidadas

### 1. MeterBus — módulo ES, pub/sub por frame

**Decisão:** Módulo ES com `import/export`. Singleton exportado, sem `window.MeterBus`.

**Contrato de dados:** o `socket.js` chama `MeterBus.frame(wasmMeterView, now)` uma vez por frame no `wasmRenderLoop`. O `wasmMeterView` é o `Float32Array(80)` zero-copy direto da memória WASM — sem cópia, sem alocação. Cada strip registrado recebe o array inteiro e lê seu próprio índice.

```javascript
// meter-bus.js
export const MeterBus = {
    _subscribers: new Map(),

    register(ch, callback) {
        this._subscribers.set(String(ch), callback);
    },

    unregister(ch) {
        this._subscribers.delete(String(ch));
    },

    frame(levels, now) {
        this._subscribers.forEach(cb => cb(levels, now));
    }
};
```

Strip não montado = sem entry no Map = descarte silencioso no próximo frame. Sem fila, sem buffer, sem checagem especial.

---

### 2. Web Component `<channel-strip>` — API pública

**Atributos HTML** para o que o browser precisa nativamente (CSS, IntersectionObserver):
```html
<channel-strip data-ch="1" data-type="input"></channel-strip>
```

**Propriedade JS** para o preset completo (objeto rico, não serializado em atributo):
```javascript
strip.config = ChannelStrip.presets.mainInput(0);
```

**Setters de runtime** para o que muda em alta frequência — sem re-render do template:
```javascript
strip.name = 'Voz';          // atualiza só .ch-name no shadowRoot
strip.on = true;             // atualiza só .btn-on no shadowRoot
strip.faderValue = 0.85;     // atualiza só o input range no shadowRoot
```

Re-render total do template apenas quando `config` muda (troca de tela/preset).

---

### 3. CSS Custom Properties — sistema de temas

**Decisão:** `:root` para valores globais + `host.style.setProperty()` para variações por faixa de canal. Zero `adoptedStyleSheets` — compatibilidade total com iOS 9.3+.

```javascript
// theme-manager.js — injeta valores globais
document.documentElement.style.setProperty('--strip-card-bg', '#1e1e1e');
document.documentElement.style.setProperty('--strip-header-color-input-1', '#ffffff');
document.documentElement.style.setProperty('--strip-header-color-input-2', '#00d2ff');

// connectedCallback do strip — define variação por faixa
const ch = parseInt(this.dataset.ch);
if (ch >= 0 && ch <= 15) {
    this.style.setProperty('--strip-header-color', 'var(--strip-header-color-input-1)');
} else if (ch >= 16 && ch <= 31) {
    this.style.setProperty('--strip-header-color', 'var(--strip-header-color-input-2)');
}
```

CSS interno do shadow consome apenas variáveis — zero seletores dependentes de estrutura externa:
```css
:host { background: var(--strip-card-bg); }
.desk-label-wrapper { color: var(--strip-header-color); }
```

---

### 4. Ciclo de vida — destruição automática via `disconnectedCallback`

O browser chama `disconnectedCallback()` automaticamente quando o strip é removido do DOM. O strip se destrói:

```javascript
disconnectedCallback() {
    MeterBus.unregister(this.dataset.ch);
    // remove event listeners internos
}
```

Sem gerenciador externo de instâncias. Sem array de strips para iterar manualmente.

---

### 5. `socket.js` — refatoração cirúrgica, mesmo nome

O `socket.js` é copiado do `public/` para `public_new/` e refatorado em 3 pontos cirúrgicos:

| O que muda | Por quê |
|---|---|
| Remove `faderCardsCache = document.querySelectorAll(...)` | Strips se registram no MeterBus automaticamente |
| Remove `buildMeterCache()` | Substituído pelo registro no `connectedCallback` |
| Substitui `applyMetersToDOM(wasmMeterView, now)` por `MeterBus.frame(wasmMeterView, now)` | MeterBus distribui para cada strip registrado |

**Intocados:** protocolo MIDI, calibração WASM, `MidiDispatcher`, throttle, `wasmRenderLoop`, todos os `socket.on(...)`, `steps.json`.

---

### 6. ES Modules — infraestrutura

Todos os scripts do `public_new/` usam `type="module"`. Dependências explícitas via `import`. Zero `window.algo` como canal de comunicação entre módulos.

```html
<!-- index.html -->
<script type="module" src="modules/socket.js"></script>
```

```javascript
// socket.js
import { MeterBus } from './meter-bus.js';
```

---

## Sequência de Implementação

```
✅ 0. Criar public_new/ (cópia completa de public/)
✅ 0. Configurar rota /new no servidor Rust
[ ] 0. Validar que /new funciona identicamente a / antes de qualquer mudança

[ ] 1. Criar meter-bus.js (módulo ES, API conforme contrato acima)
[ ] 2. Refatorar socket.js — 3 pontos cirúrgicos + migrar para ES Module
[ ] 3. Validar meters em /new com MeterBus (60 FPS, calibração intacta)

[ ] 4. Criar <channel-strip> Web Component (Shadow DOM, CSS Variables)
[ ] 5. Migrar theme-manager.js para CSS Custom Properties + host.style.setProperty()
[ ] 6. Montar test_strip.html com Web Components e validar visualmente

[ ] 7. Migrar todos os scripts para ES Modules (remover globals implícitas)
[ ] 8. Migrar telas uma a uma (Aux/Sends → Principal → Mobile)
[ ] 9. Validar /new em produção com técnico de confiança
[ ] 10. /new vira /, public/ vira legado
```

---

## Critério de Conclusão

`public_new/` está pronto para virar padrão quando:

- [ ] Todos os meters funcionam em 60 FPS com a mesma calibração da v1
- [ ] Todos os presets de Channel Strip renderizam corretamente (input, master, aux, mini, mix, mobile)
- [ ] O ThemeEditor aplica temas em tempo real sem re-renderizar os strips
- [ ] Cor por faixa de canal funciona corretamente (canais 1-16 vs 17-32 vs ST IN vs Mix vs Bus)
- [ ] Long press, swap, copy, lock, rename funcionam conforme especificado no `plano_de_implementacao_componente_CHANNEL_STRIP.md`
- [ ] Interface funcional em iPad 4ª geração (iOS 10.3+) e iPhone 5 (iOS 10.3+)
- [ ] Zero regressões identificadas em sessão de uso real com a 01V96
- [ ] Zero globals implícitas (`window.algo`) no código do `public_new/`

---

## Referências

- `docs/plano_de_implementacao_componente_CHANNEL_STRIP.md` — branches em aberto documentados no final do arquivo
- `public_new/modules/socket.js` — motor de sincronização a ser refatorado (3 pontos cirúrgicos)
- `public_new/steps.json` — calibração empírica a ser preservada intacta
- `docs/PLANO_MIGRACAO_RUST.md` — precedente do padrão Strangler Fig usado neste projeto
