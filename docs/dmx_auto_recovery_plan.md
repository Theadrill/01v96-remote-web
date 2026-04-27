# Plano de Ação: Integração Art-Net DMX com Auto-Recovery

Este projeto utiliza o motor de DMX baseado no projeto original [ArtNetDMX](https://github.com/nt2ds/ArtNetDMX) de **nt2ds**. O sistema foi adaptado para integrar-se ao ecossistema da Yamaha 01V96 com foco em estabilidade e recuperação automática.

Este documento detalha a estratégia para integrar o projeto `ArtNetToDMX` (.NET) ao `01v96-remote-web` (Node.js), focando na estabilidade do hardware DMX e recuperação automática de falhas (EMI/Picos de energia).

## 1. Modificação no Projeto .NET (O Heartbeat)

O ponto mais crítico é fazer o motor de DMX avisar que está "vivo" e que a comunicação com a placa USB está funcionando.

### Arquivo: `FTDI.cs`
**Objetivo:** Criar um arquivo de log temporário (`dmx_heartbeat.txt`) que só é atualizado se a escrita no chip FTDI for bem-sucedida.

**Alteração Sugerida:**
No método `writeData()`, após a chamada de `write`, verificar o status da transação.

```csharp
// Localização: ArtNetToDMX/ArtDmx/FTDI.cs -> método writeData()
public static void writeData()
{
    while (!done)
    {
        FT_SetBreakOn(handle);
        FT_SetBreakOff(handle);
        bytesWritten = write(handle, buffer, buffer.Length);
        
        // --- ADICIONAR ESTE BLOCO ---
        if (status == FT_STATUS.FT_OK) {
            try {
                // Escreve o timestamp atual em um arquivo na pasta do executável
                System.IO.File.WriteAllText("dmx_heartbeat.txt", DateTime.Now.Ticks.ToString());
            } catch { /* Ignora erros de escrita de arquivo para não travar o DMX */ }
        }
        // ----------------------------

        Thread.Sleep(20);
    }
}
```

## 2. Orquestrador no Node.js (O Vigia)

O servidor Node.js será responsável por gerenciar o ciclo de vida do executável .NET.

### Responsabilidades:
1.  **Spawn do Processo:** Iniciar o `ArtNetToDMX.exe` em modo oculto.
2.  **Monitoramento:** Checar a cada 2 segundos se o arquivo `dmx_heartbeat.txt` foi modificado.
3.  **Detecção de Falha:** Se o arquivo não mudar por mais de 5 segundos, iniciar o protocolo de emergência.

### Protocolo de Emergência (Auto-Recovery):
1.  **Kill:** Encerrar o processo `ArtNetToDMX.exe`.
2.  **USB Reset:** Executar comando PowerShell para desativar/ativar o dispositivo USB.
3.  **Restart:** Iniciar o `ArtNetToDMX.exe` novamente.

## 3. Reset de Hardware via PowerShell

Para simular o "tirar e colocar o cabo", usaremos o ID de instância do dispositivo.

**Comando Base:**
```powershell
$deviceId = "INSIRA_O_ID_AQUI" # Ex: USB\VID_0403&PID_6001\...
Disable-PnpDevice -InstanceId $deviceId -Confirm:$false
Start-Sleep -Seconds 1
Enable-PnpDevice -InstanceId $deviceId -Confirm:$false
```

## 4. Integração com a Interface Web (01v96-remote-web)

### UI/UX:
- **Indicador de Status:** Um pequeno LED virtual na barra lateral (Verde: OK, Vermelho: Falha, Amarelo: Resetando).
- **Botão de Pânico:** Localizado no menu de configurações ou sidebar: `[ REINICIAR SISTEMA DMX ]`.

### Comunicação (Socket.io):
- O servidor envia eventos `dmxStatus` para o frontend.
- O frontend pode emitir um evento `requestDmxReset` para forçar o processo manualmente.

## 5. Requisitos de Implementação

1.  **Identificar o Device ID:** Rodar `Get-PnpDevice | Where-Object {$_.FriendlyName -like "*FT232*"}` para achar o ID correto da placa.
2.  **Permissões:** O Node.js precisa ser executado com privilégios de Administrador para que o comando `Disable-PnpDevice` funcione.
3.  **Caminhos:** Configurar no `config.json` o caminho absoluto para o executável do DMX.

## 6. Checklist para o Desenvolvedor (Agente)

- [ ] Compilar o `ArtNetToDMX` com a modificação do heartbeat.
- [ ] Criar módulo `dmx-manager.js` no Node.js.
- [ ] Implementar lógica de monitoramento de arquivo (`fs.statSync`).
- [ ] Implementar função de reset via `child_process.exec`.
- [ ] Adicionar botão e status na UI do `01v96-remote-web`.
- [ ] Testar simulando falha (desconectando o cabo ou travando o processo).
