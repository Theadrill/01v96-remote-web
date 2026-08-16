# Plano de Implementação: Redimensionamento e Exibição de Patch no Channel Strip Desktop

> **Ordem de Execução**: **ETAPA 2 (CONDICIONADA À ETAPA 1)**  
> **Status**: Aguardando Conclusão da Etapa 1  
> **Dependência Obrigatória**: [plano_de_refatoracao_ROUTING_patch_registry.md](file:///C:/PROJETOS/01v96-remote-web/docs/plano_de_refatoracao_ROUTING_patch_registry.md) **deve estar 100% implementado e validado pelo usuário antes de iniciar este plano.**  
> **Módulos Afetados**: `public/style.css`, `public/modules/channel_strip.js`  
> **Objetivo**: Redimensionar verticalmente os cabeçalhos e botões dos canais não-Master no modo desktop e adicionar o badge de patch consumindo os dados diretamente de `window.PatchRegistry`.

---

> [!IMPORTANT]
> ### 📌 HIERARQUIA E ORDEM DE EXECUÇÃO
> 1. **ETAPA 1 (`plano_de_refatoracao_ROUTING_patch_registry.md`)**: Criação do `PatchRegistry`, da Tela de Roteamento Geral e refatoração dos módulos de roteamento/efeitos/inserts.
> 2. **ETAPA 2 (ESTE DOCUMENTO)**: Redimensionamento dos faders desktop (-25% cabeçalho, -25% SOLO, -10% ON) e inclusão do badge de patch. **Só pode ser iniciado após a Etapa 1 estar 100% concluída e validada.**

---

> [!NOTE]
> **Canal MASTER Intocado**: O canal Master possui a seção exclusiva de `MEDIDORES` e layout próprio. O channel strip do Master **NÃO** sofrerá nenhuma alteração de layout, alturas ou inclusão de área de patch. A área de patch é aplicada em **todos os demais canais**.

---

## 1. Diagnóstico e Estrutura de Alturas

### 1.1 Elementos e Alturas Atuais no CSS (`public/style.css`)
- **Cabeçalho superior (Número do Canal)**: `.desk-label-wrapper` / `.desk-label` = `35px`
- **Botão SOLO**: `.btn-cue` / `.btn-cue-placeholder` = `38px`
- **Botão ON**: `.btn-on-desk` = `48px`

### 1.2 Cálculo das Novas Alturas (Descontos nos canais não-Master)
- **Cabeçalho superior (-25%)**: $35\text{px} \times 0.75 = 26.25\text{px} \rightarrow \mathbf{26\text{px}}$ *(Economia de 9px)*
- **Botão SOLO (-25%)**: $38\text{px} \times 0.75 = 28.5\text{px} \rightarrow \mathbf{28\text{px}}$ *(Economia de 10px)*
- **Botão ON (-10%)**: $48\text{px} \times 0.90 = 43.2\text{px} \rightarrow \mathbf{43\text{px}}$ *(Economia de 5px)*
- **Altura Total Liberada para a Nova Área de Patch**: $9\text{px} + 10\text{px} + 5\text{px} = \mathbf{24\text{px}}$

---

## 2. Especificação da Área de Patch no Strip Desktop

- **Posição**: Entre o cabeçalho superior do número do canal e o botão SOLO.
- **Fonte de Dados**: Consulta direta em tempo constante $O(1)$ à API `window.PatchRegistry` (criada na Etapa 1).
- **Canais Individuais (CH 1–32)**: `PatchRegistry.getChannelInput(i)` (ex.: `AD 1`, `ADAT 5`, `S1-1`, `FX1-1`, `2TD-L` ou `--`).
- **Canais Pareados (CH 1 + 2)**: `PatchRegistry.getPairedChannelInput(i, i+1)` $\rightarrow$ `"AD 1 + AD 2"`.
- **ST IN (ST1..ST4)**: `PatchRegistry.getPairedChannelInput(32 + i*2, 32 + i*2 + 1)` $\rightarrow$ `"ADAT 1 + ADAT 2"`.
- **MIX (1..8) e BUS (1..8)**: `PatchRegistry.getMixOutput(i)` / `PatchRegistry.getBusOutput(i)` $\rightarrow$ `"OMNI 1"`, `"ADAT 3"`, etc., ou `--` se não roteado.
- **Master**: Permanece 100% inalterado (sem área de patch e com dimensões originais intactas).
- **Interação**: Clicar no badge de patch abre diretamente a aba de roteamento do canal correspondente.

---

## 3. Mudanças Propostas no Código

### 3.1 Componente de Channel Strip Desktop (`public/modules/channel_strip.js`)
1. **Renderização Condicional no HTML (`createDesktopStrip`)**:
```javascript
${!isMaster ? `
<div class="desk-patch-zone" id="${patchId}" onclick="${configAction}">
    <span class="desk-patch-name" id="${patchNameId}">${patchText}</span>
</div>
` : ''}
```

2. **Obtenção do Texto de Patch via `PatchRegistry`**:
   - Para CH 1–32 (`createDesktopChannelStrip`):
     ```javascript
     const patchText = s.paired && s.pairedWith !== null
         ? window.PatchRegistry.getPairedChannelInput(i, s.pairedWith)
         : window.PatchRegistry.getChannelInput(i);
     ```
   - Para ST IN 1–4 (`createDesktopOutputStrip`):
     ```javascript
     const patchText = window.PatchRegistry.getPairedChannelInput(ch, ch + 1);
     ```
   - Para MIX 1–8 e BUS 1–8:
     ```javascript
     const patchText = type === 'mix'
         ? window.PatchRegistry.getMixOutput(i)
         : window.PatchRegistry.getBusOutput(i);
     ```

---

### 3.2 Estilos CSS (`public/style.css`)
```css
/* Cabeçalho superior nos canais normais: 35px -> 26px (-25%) */
.fader-card-desktop:not(.master-card-desktop) .desk-label {
    height: 26px;
    font-size: 11px;
    font-weight: 800;
    display: flex;
    align-items: center;
    justify-content: center;
    border-bottom: 1px solid #111;
}

.fader-card-desktop:not(.master-card-desktop) .desk-label-wrapper {
    height: 26px;
    position: relative;
    display: flex;
    align-items: center;
    border-bottom: 1px solid #111;
}

/* Nova Área de Patch: 20px de altura com 2px de margem = total 24px */
.desk-patch-zone {
    height: 20px;
    margin: 2px 4px;
    background: #14171c;
    border: 1px solid #282e3a;
    border-radius: 3px;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    overflow: hidden;
    transition: background 0.15s ease, border-color 0.15s ease;
}

.desk-patch-zone:hover {
    background: #1c222c;
    border-color: #5cacee;
}

.desk-patch-name {
    color: #5cacee;
    font-family: 'Consolas', 'Menlo', 'Courier New', monospace;
    font-size: 10px;
    font-weight: 700;
    text-align: center;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    text-transform: uppercase;
    letter-spacing: -0.2px;
}

/* Botão SOLO nos canais normais: 38px -> 28px (-25%) */
.fader-card-desktop:not(.master-card-desktop) .btn-cue,
.fader-card-desktop:not(.master-card-desktop) .btn-cue-placeholder {
    height: 28px;
    margin: 2px 4px;
    font-size: 10px;
    line-height: 26px;
}

/* Botão ON nos canais normais: 48px -> 43px (-10%) */
.fader-card-desktop:not(.master-card-desktop) .btn-on-desk {
    height: 43px;
    margin: 3px 4px;
    font-size: 11px;
}

/* MASTER CARD Permanece Inalterado */
.master-card-desktop .desk-label-wrapper,
.master-card-desktop .desk-label {
    height: 35px;
}
.master-card-desktop .btn-cue {
    height: 38px;
}
.master-card-desktop .btn-on-desk {
    height: 48px;
}
```

---

## 4. Plano de Verificação da Etapa 2

1. Carregar o modo Desktop e validar visualmente todos os canais CH 1–32, ST IN, MIX, BUS e MASTER.
2. Confirmar que o alinhamento horizontal dos botões e faders está 100% perfeito.
3. Confirmar que os badges de patch mostram as informações consistentes vindas do `PatchRegistry`.
4. Alterar patch via modal de routing e verificar se o badge do canal atualiza em tempo real.
