# Plano de Refatoração — Migração para Web Components com Shadow DOM

> ⚠️ **Este plano é para a v2 do sistema (public_new).** Não modificar nada no `public/` original sem decisão explícita.
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

---

## Contexto e Motivação

O sistema atual (`public/`) usa DOM aberto com `querySelector` global para sincronização de VU Meters e faders via `socket.js`. Isso funciona, mas cria acoplamento estrutural entre o motor de sincronização e a estrutura HTML dos componentes — qualquer refatoração visual exige atenção ao `socket.js`.

A v2 (`public_new/`) resolve isso com:

1. **Web Components com Shadow DOM** — encapsulamento real de estilo e estrutura
2. **MeterBus pub/sub central** — o motor de meters deixa de varrer o DOM e passa a publicar dados por canal
3. **CSS 100% via Custom Properties** — temas funcionam atravessando o Shadow boundary sem `adoptedStyleSheets` complexos
4. **Strangler Fig Pattern** — `/new` coexiste com `/` até validação completa, depois o novo vira padrão

---

## Estratégia de Coexistência

- `public/` — sistema atual, intocado, continua sendo a URL padrão (`/`)
- `public_new/` — cópia completa do `public/`, ponto de partida da v2, exposta em `/new`
- Bugfixes críticos no `public/` são aplicados em ambos até a migração estar completa
- O servidor roteia `/new` para `public_new/` — configurar desde o início (ver seção de Servidor abaixo)
- Quando `public_new/` for validado em produção: `/new` vira `/`, `public/` vira legado

---

## Decisões Arquiteturais a Tomar (Pré-Implementação)

Estas questões precisam ser respondidas **antes** de começar a escrever código no `public_new/`. São as perguntas que, se ignoradas, criam o mesmo problema que estamos resolvendo.

### 1. MeterBus — contrato da API

O `socket.js` hoje faz:
```javascript
document.querySelectorAll('.desk-meter-curtain')
document.querySelector(`[data-ch="${ch}"] .desk-meter-curtain`)
```

Na v2, precisa fazer:
```javascript
MeterBus.publish(ch, { level: 0.72, peak: false })
```

**Decisões abertas:**
- [ ] `MeterBus` é um singleton global (`window.MeterBus`) ou um módulo ES importado?
- [ ] O contrato de dados é `{ level, peak }` ou precisamos de mais campos (GR meter, stereo L/R)?
- [ ] Como o `MeterBus` lida com canais que ainda não foram montados (strip não está no DOM)?

### 2. Web Component — API pública do `<channel-strip>`

**Decisões abertas:**
- [ ] Atributos HTML vs. propriedades JS: `<channel-strip data-ch="1" data-type="input">` ou `strip.config = { ch: 1, type: 'input' }`?
- [ ] Como o preset é passado para o componente? Via atributo serializado, via propriedade JS, ou via elemento filho?
- [ ] O componente suporta `update()` parcial (só muda o que mudou) ou re-renderiza tudo?

### 3. CSS Custom Properties — cobertura total

Para que o Shadow DOM seja transparente para o sistema de temas, **100% das variações visuais** precisam ser expressas como CSS Custom Properties no `:root`. Zero seletores de classe de strips no CSS global.

**Decisões abertas:**
- [ ] Auditar o `style.css` atual e mapear todos os seletores que afetam elementos internos dos strips
- [ ] Definir o namespace completo das variáveis (`--strip-*`) antes de escrever o primeiro componente
- [ ] O ThemeEditor injeta variáveis no `:root` ou usa `adoptedStyleSheets`? (recomendado: `:root`, mais simples)

### 4. Ciclo de vida e destruição

**Decisões abertas:**
- [ ] Quem gerencia o array de instâncias ativas por tela?
- [ ] `disconnectedCallback()` do Web Component é suficiente para limpar listeners do MeterBus, ou precisa de um `destroy()` explícito?
- [ ] Como lidar com strips que são removidos e re-adicionados ao DOM (ex: troca de tela)?

### 5. Compatibilidade com socket.js / WASM

O `socket.js` tem calibração empírica acumulada (`steps.json`, `wasmMeterEngine`). Na v2:

**Decisões abertas:**
- [ ] O `socket.js` é copiado intacto para `public_new/` e só a camada de DOM update é refatorada?
- [ ] Ou criamos um `socket_v2.js` que separa explicitamente: protocolo MIDI | calibração | publicação no MeterBus?
- [ ] Como garantir que a calibração empírica não se perde na migração?

---

## Servidor — Roteamento `/new`

> 🔴 **Configurar antes de qualquer desenvolvimento no `public_new/`.**

- [ ] Identificar onde o servidor (Rust/Axum ou equivalente) define a pasta estática servida
- [ ] Adicionar rota `/new` apontando para `public_new/`
- [ ] Garantir que assets compartilhados (se houver) não criam conflito de path

---

## Sequência de Implementação (rascunho — detalhar após fechar as decisões acima)

```
[ ] 0. Criar public_new/ (cópia completa de public/)
[ ] 0. Configurar rota /new no servidor
[ ] 0. Validar que /new funciona identicamente a / antes de qualquer mudança

[ ] 1. Criar MeterBus (módulo, API, testes manuais)
[ ] 2. Refatorar socket.js para publicar no MeterBus em vez de querySelector
[ ] 3. Validar meters em /new com MeterBus (60 FPS, calibração intacta)

[ ] 4. Criar <channel-strip> Web Component (Shadow DOM, CSS Variables)
[ ] 5. Criar sistema de temas 100% via Custom Properties
[ ] 6. Montar test_strip.html com Web Components e validar visualmente

[ ] 7. Migrar telas uma a uma (Aux/Sends → Principal → Mobile)
[ ] 8. Validar /new em produção com técnico de confiança
[ ] 9. /new vira /, public/ vira legado
```

---

## Critério de Conclusão

`public_new/` está pronto para virar padrão quando:

- [ ] Todos os meters funcionam em 60 FPS com a mesma calibração da v1
- [ ] Todos os presets de Channel Strip renderizam corretamente (input, master, aux, mini, mix, mobile)
- [ ] O ThemeEditor aplica temas em tempo real sem re-renderizar os strips
- [ ] Long press, swap, copy, lock, rename funcionam conforme especificado no `plano_de_implementacao_componente_CHANNEL_STRIP.md`
- [ ] Zero regressões identificadas em sessão de uso real com a 01V96

---

## Referências

- `docs/plano_de_implementacao_componente_CHANNEL_STRIP.md` — branches em aberto documentados no final do arquivo
- `public/modules/socket.js` — motor de sincronização a ser refatorado
- `public/steps.json` — calibração empírica a ser preservada
- `docs/PLANO_MIGRACAO_RUST.md` — precedente do padrão Strangler Fig usado neste projeto
