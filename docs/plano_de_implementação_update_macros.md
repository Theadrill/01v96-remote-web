# Plano de Implementação: Atualização do Sistema de Perfis de Macros e Sincronização Cloud

Este documento detalha o plano arquitetural e o passo a passo técnico de implementação para ajustar a gestão de perfis e sincronização em nuvem do módulo de macros.

---

## 1. Contexto e Diagnóstico

### Diagnóstico da Falha Atual
No código backend atual ([server_rust/src/api/macros.rs](file:///c:/PROJETOS/01v96-remote-web/server_rust/src/api/macros.rs#L195-L210)), a função `get_slots` busca os arquivos de perfil usando uma **prioridade hardcoded**:
1. Busca primeiro em `public/modules/macros/profiles/local/profile_<preset>.json`.
2. Se o arquivo local existir (mesmo incompleto ou truncado), retorna ele imediatamente.
3. Se não existir localmente, busca em `public/modules/macros/profiles/shared/profile_<preset>.json`.

Isso gera um problema grave quando a flag de sincronização na nuvem está ativada:
* Se a máquina possui um arquivo local desatualizado/incompleto (ex: 1 macro) e a nuvem possui o perfil completo (ex: 9 macros), o backend ignora o arquivo da nuvem e entrega a versão local incompleta.
* Ao marcar "Sincronizar com a nuvem" no frontend, a função de salvamento pega os dados incompletos carregados na memória e envia para a nuvem, **sobrescrevendo o perfil completo na nuvem com os dados truncados locais**.

---

## 2. Regras de Negócio e Princípios Arquiteturais

1. **Prioridade Dinâmica de Leitura (Fonte da Verdade)**:
   * **Se `syncShared == false` (Perfil Somente Local)**:
     * Fonte da Verdade: Diretório `local/`.
     * Ordem de leitura: `local/` ➔ Fallback para `shared/`.
   * **Se `syncShared == true` (Perfil Sincronizado na Nuvem)**:
     * Fonte da Verdade: Diretório `shared/`.
     * Ordem de leitura: `shared/` ➔ Fallback para `local/`.

2. **Fluxo da Chave de Sincronização (`chkSharedSync`)**:
   Ao clicar na checkbox para ativar a sincronização com a nuvem:
   * **Etapa 1: Pre-flight Check (Conectividade)**:
     O sistema testa a conexão com o repositório Git/nuvem. Se falhar, exibe um alerta, desmarca o checkbox e mantém o estado local.
   * **Etapa 2: Checagem de Existência Remota**:
     * **Caso A (Primeiro Sync)**: Se o arquivo na nuvem (`shared/`) não existir, faz o upload automático do perfil local e ativa o sync.
     * **Caso B (Versões Idênticas)**: Se a nuvem e o local possuem exatamente os mesmos dados, ativa o sync diretamente.
     * **Caso C (Conflito de Perfis)**: Se o perfil local e o perfil da nuvem existirem e forem diferentes, abre o **Modal de Comparação de Perfis**.

3. **Modal de Comparação de Perfis (Diff View)**:
   * Exibe lado a lado:
     * **Coluna 1**: Perfil Local (lista de macros e total de botões).
     * **Coluna 2**: Perfil na Nuvem (lista de macros e total de botões).
   * **Botão 1**: 📤 **Enviar Perfil Local** (Sobrescreve a nuvem com os dados locais).
   * **Botão 2**: 📥 **Baixar Perfil da Nuvem** (Sobrescreve o arquivo local e a memória com os dados da nuvem).
   * **Botão 3**: ✖️ **Cancelar** (Fecha o modal e mantém a sincronização desativada).

---

## 3. Passo a Passo Técnico de Implementação

---

### PASSO 1: Backend Rust (`server_rust/src/api/macros.rs`)

#### 1.1. Ajustar o Endpoint `get_slots` (Leitura Dinâmica por Sync)
* **Local do arquivo**: [server_rust/src/api/macros.rs](file:///c:/PROJETOS/01v96-remote-web/server_rust/src/api/macros.rs#L190-L212)
* **O que fazer**:
  Modificar a ordem de verificação de arquivos com base na query string `syncShared`.
* **Lógica detalhada**:
  ```rust
  let sync_shared = q.sync_shared.as_deref() == Some("true");

  if sync_shared {
      // Prioridade 1: Nuvem / Shared
      if shared_path.exists()
          && let Ok(c) = std::fs::read_to_string(&shared_path)
          && let Ok(v) = serde_json::from_str(&c)
      {
          return Json(v);
      }
      // Prioridade 2: Local
      if local_path.exists()
          && let Ok(c) = std::fs::read_to_string(&local_path)
          && let Ok(v) = serde_json::from_str(&c)
      {
          return Json(v);
      }
  } else {
      // Prioridade 1: Local
      if local_path.exists()
          && let Ok(c) = std::fs::read_to_string(&local_path)
          && let Ok(v) = serde_json::from_str(&c)
      {
          return Json(v);
      }
      // Prioridade 2: Nuvem / Shared
      if shared_path.exists()
          && let Ok(c) = std::fs::read_to_string(&shared_path)
          && let Ok(v) = serde_json::from_str(&c)
      {
          return Json(v);
      }
  }
  ```

#### 1.2. Criar Endpoint de Comparação `GET /api/macros/compare`
* **Local do arquivo**: [server_rust/src/api/macros.rs](file:///c:/PROJETOS/01v96-remote-web/server_rust/src/api/macros.rs)
* **O que fazer**:
  Criar uma função assíncrona `compare_slots(Query(q): Query<PresetQuery>) -> Json<Value>` e registrar no roteador `/api/macros/compare`.
* **Retorno JSON do endpoint**:
  ```json
  {
    "exists_local": true,
    "exists_shared": true,
    "is_identical": false,
    "local_data": { ... },
    "shared_data": { ... }
  }
  ```

#### 1.3. Criar/Verificar Endpoint de Check de Conexão `GET /api/macros/sync/check`
* **Local do arquivo**: [server_rust/src/api/macros.rs](file:///c:/PROJETOS/01v96-remote-web/server_rust/src/api/macros.rs)
* **O que fazer**:
  Endpoint leve para validar se a sincronização/Git está operacional, retornando `{ "online": true }` ou status de erro HTTP se não houver acesso ao repositório remoto.

---

### PASSO 2: Interface HTML e Estilos CSS (`public/index.html` e `public/style.css`)

#### 2.1. Adicionar o Modal `#macroSyncDiffModal` no HTML
* **Local do arquivo**: [public/index.html](file:///c:/PROJETOS/01v96-remote-web/public/index.html#L940-L945) (junto aos demais modais de macros)
* **O que fazer**:
  Inserir a estrutura do modal de comparação com duas colunas flexíveis:

```html
<!-- Modal de Comparação de Perfis Local vs. Nuvem -->
<div class="modal-overlay styled-macroSyncDiffModal" id="macroSyncDiffModal" style="display: none;">
    <div class="modal-content diff-modal-content">
        <h3>☁️ Conflito de Perfil Detectado</h3>
        <p>A versão salva na nuvem difere da versão salva localmente. Escolha como deseja prosseguir:</p>
        
        <div class="diff-columns-container">
            <!-- Coluna Local -->
            <div class="diff-column">
                <h4>💻 Perfil Local</h4>
                <div class="diff-summary-list" id="diffLocalSummary"></div>
            </div>
            
            <!-- Coluna Nuvem -->
            <div class="diff-column">
                <h4>☁️ Perfil na Nuvem</h4>
                <div class="diff-summary-list" id="diffSharedSummary"></div>
            </div>
        </div>

        <div class="diff-actions">
            <button class="btn-connect" id="btnUploadLocalToCloud">📤 Enviar Perfil Local</button>
            <button class="btn-connect" id="btnDownloadCloudToLocal">📥 Baixar Perfil da Nuvem</button>
            <button class="btn-close" id="btnCancelSyncDiff">CANCELAR</button>
        </div>
    </div>
</div>
```

#### 2.2. Adicionar Estilos no CSS
* **Local do arquivo**: [public/style.css](file:///c:/PROJETOS/01v96-remote-web/public/style.css)
* **O que fazer**:
  Estilizar o container `.diff-columns-container` com `display: flex; gap: 16px;` e scrollbar estilizado para as listas `.diff-summary-list`, mantendo visual glassmorphism condizente com a interface do projeto.

---

### PASSO 3: Frontend JavaScript (`public/modules/macros.js`)

#### 3.1. Atualizar `loadGlobalSlotsManifest()`
* **Local do arquivo**: [public/modules/macros.js](file:///c:/PROJETOS/01v96-remote-web/public/modules/macros.js#L266-L285)
* **O que fazer**:
  Passar o parâmetro `syncShared` na requisição `GET`:
  ```javascript
  const syncState = localStorage.getItem(`macro_sync_shared_${currentPreset}`) === 'true';
  const res = await fetch(`/api/macros/slots?preset=${currentPreset}&syncShared=${syncState}`);
  ```

#### 3.2. Reescrever `window.toggleSharedSync(enabled)`
* **Local do arquivo**: [public/modules/macros.js](file:///c:/PROJETOS/01v96-remote-web/public/modules/macros.js#L61-L111)
* **Fluxo no código ao ativar (`enabled === true`)**:
  1. **Testar Conexão**:
     ```javascript
     const checkResp = await fetch('/api/macros/sync/check').catch(() => null);
     if (!checkResp || !checkResp.ok) {
         alert('⚠️ Não foi possível conectar ao serviço de nuvem/Git. A sincronização permanece desativada.');
         document.getElementById('chkSharedSync').checked = false;
         localStorage.setItem(`macro_sync_shared_${currentPreset}`, 'false');
         return;
     }
     ```
  2. **Consultar Comparação**:
     ```javascript
     const compResp = await fetch(`/api/macros/compare?preset=${encodeURIComponent(currentPreset)}`);
     const compData = await compResp.json();
     ```
  3. **Tratar os Cenários**:
     * **Se `!compData.exists_shared`** (Primeiro upload):
       Chama `saveGlobalSlotsManifest()`, salva `macro_sync_shared_<preset> = true`, e exibe toast de confirmação.
     * **Se `compData.is_identical`** (Sem diferenças):
       Define `localStorage.setItem('macro_sync_shared_' + currentPreset, 'true')` e exibe toast.
     * **Se `compData.exists_shared && !compData.is_identical`** (Conflito):
       Preenche os resumos das colunas local e nuvem no modal `#macroSyncDiffModal` e exibe o modal (`style.display = 'flex'`).

#### 3.3. Implementar Handlers de Ação do Modal
* **Local do arquivo**: [public/modules/macros.js](file:///c:/PROJETOS/01v96-remote-web/public/modules/macros.js)
* **Botão 📤 Enviar Perfil Local (`btnUploadLocalToCloud`)**:
  1. Fecha o modal.
  2. Salva a preferência no `localStorage`: `macro_sync_shared_<preset> = true`.
  3. Executa `saveGlobalSlotsManifest()`, forçando envio para o diretório `shared/`.

* **Botão 📥 Baixar Perfil da Nuvem (`btnDownloadCloudToLocal`)**:
  1. Requisita o perfil da nuvem: `fetch('/api/macros/slots?preset=' + currentPreset + '&syncShared=true')`.
  2. Atualiza a memória global (`assignedMacros` e `globalMacroConfig`) com os dados baixados.
  3. Sobrescreve o arquivo local via `POST /api/macros/slots?preset=` + currentPreset + `&syncShared=false`.
  4. Salva a preferência no `localStorage`: `macro_sync_shared_<preset> = true`.
  5. Fecha o modal e recarrega a grid com `renderMacros()`.

* **Botão CANCELAR (`btnCancelSyncDiff`)**:
  1. Reseta o checkbox `chkSharedSync.checked = false`.
  2. Garante `localStorage.setItem('macro_sync_shared_' + currentPreset, 'false')`.
  3. Fecha o modal sem alterar arquivos.

---

## 4. Plano de Testes e Validação

1. **Validação de Leitura de Perfil Completo**:
   * Abrir o preset `pcfavela` com a flag `macro_sync_shared_pcfavela = true` definida.
   * Verificar se o sistema carrega o perfil de **9 macros** da pasta `shared/` em vez da versão truncada local de **1 macro**.

2. **Validação de Ativação com Conflito**:
   * Apagar o localStorage da máquina.
   * Selecionar o preset `pcfavela` (que tem divergência entre local e shared).
   * Clicar no checkbox de sincronização.
   * **Resultado esperado**: Exibição do modal `#macroSyncDiffModal` listando 1 macro na coluna local e 9 macros na coluna nuvem.

3. **Validação do Botão "Baixar Perfil da Nuvem"**:
   * No modal de conflito, clicar em "Baixar Perfil da Nuvem".
   * **Resultado esperado**: As 9 macros aparecem na tela, o arquivo local é atualizado para conter as 9 macros e a sincronização permanece ligada.

4. **Validação do Teste Offline**:
   * Desativar a rede ou derrubar a API de sync.
   * Tentar clicar em "Sincronizar com a nuvem".
   * **Resultado esperado**: Mensagem de erro informando a ausência de conexão e o checkbox é desmarcado automaticamente.
