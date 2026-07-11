# Plano: Volume Geral no Modo Técnico

## Contexto

O Volume Geral do músico (`volume_geral.js`) usa a factory `createMacroFaderInstance` de `macro_fader.js`. A factory itera sobre canais e ajusta `channelStates[ch].auxN` ou `channelStates[ch].value`. Para o novo AUX Volume Geral (cenário 2), a lógica é diferente: iterar sobre AUX 1-8 de um canal, não sobre 32 canais. A factory não suporta isso nativamente, então o AUX Volume Geral terá HTML próprio (mesmo padrão visual) e funções de nudge customizadas.

## Dois Cenários

### Cenário 1: Technician Mix Mode (sends-on-faders)

- **Fluxo:** Tela principal > MIX/BUS > OUTS > Clica em um MIX > Entra no modo de envios (32 canais)
- **Volume Geral:** No final dos 32 faders de canais (antes do master), como o Macro Fader na tela principal
- **Controla:** Todos os 32 canais > MIX ativo
- **Sempre visível**, sem botão de toggle

### Cenário 2: Aba AUX de canal individual

- **Fluxo:** Tela principal > Clica em um canal > Modal de config > Aba AUX
- **Volume Geral:** No final dos 8 faders AUX, dentro do `ch-modal-body`
- **Controla:** AUX 1-8 daquele canal
- **Sempre visível**, sem botão de toggle

## Comportamento

- Aparelho visual igual ao do músico: nudge +/-, título "AUX GERAL" / "VOLUME GERAL", display de dB
- Sem botão CONFIG
- Ignora canais/AUXs que estão em 0/-inf quando diminuindo (mesma lógica do músico)
- Step de 1 raw unit (como o modo técnico do macro fader existente)

## Alterações por Arquivo

### 1. `public/modules/volume_geral.js`

**Não alterar** o `volumeGeral` existente — já suporta `technicianMixMode` via `macro_fader.js:74,86`.

**Adicionar:** Funções para o AUX Volume Geral:

- `getAuxVolumeGeralHtml()` — Gera HTML no mesmo padrão visual do macro fader (desktop e mobile), cardId `cardAuxVolumeGeral`, title `AUX GERAL`, dbDisplayId `aux-volume-geral-db-display`, sem botão CONFIG
- `nudgeAuxVolumeGeral(dir)` — Itera AUX 1-8 do `activeConfigChannel`, para cada AUX lê `channelStates[ch].auxN`, aplica step, chama `updateAuxManual()` e emite `kInputAUX/kAUX{N}Level`
- `startAuxVolumeGeralNudge(dir)` / `stopAuxVolumeGeralNudge()` — Mesmo padrão de aceleração do `macro_fader.js:100-124`
- Tracking de deltaSteps e dbDisplay (mesmo padrão)

### 2. `public/modules/channel_strip.js` — `initUI()`

**Inserir Volume Geral no final dos faders quando `technicianMixMode`:**

Após o bloco do Macro Fader (linha 752), adicionar:

```javascript
// Volume Geral para Technician Mix Mode
if (typeof getVolumeGeralHtml === 'function' && technicianMixMode && !musicianMode) {
    html += '<div style="flex: 0 0 55px !important; width: 55px !important; background: transparent !important;"></div>';
    html += getVolumeGeralHtml();
    html += '<div style="flex: 0 0 55px !important; width: 55px !important; background: transparent !important;"></div>';
}
```

**Não alterar** a lógica do `master-container` para musicianMode (linhas 755-762).

### 3. `public/modules/auxs_sends.js` — `renderAuxs(ch)`

**Injetar AUX Volume Geral no final do modo canal (CH 1-32):**

No bloco `else` (linha 55), após o loop dos 8 AUX faders (após linha 85, antes do `body.innerHTML` na linha 90):

```javascript
if (ch <= 31 && typeof getAuxVolumeGeralHtml === 'function') {
    html += getAuxVolumeGeralHtml();
}
```

### 4. `public/style.css`

**Estilo para o card AUX Volume Geral dentro do modal de config:**

```css
#cardAuxVolumeGeral {
    min-width: 80px;
    flex-shrink: 0;
    border-left: 1px solid #333;
}
```

## Resumo

| Cenário | Onde aparece | Onde é injetado | Controla |
|---|---|---|---|
| Technician Mix Mode | Após os 32 faders de canais | `initUI()` > `html +=` | 32 canais > MIX ativo |
| Aba AUX canal CH 1-32 | Após os 8 faders AUX | `renderAuxs()` > `html +=` | AUX 1-8 daquele canal |
