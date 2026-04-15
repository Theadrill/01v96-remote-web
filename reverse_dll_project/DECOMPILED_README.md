# 📂 Engenharia Reversa - Studio Manager & AirFader

## Status: Extraído e pronto para análise

### Studio Manager (Yamaha)
- **SM2.exe** (548KB): Executável principal (PE32, Visual C++)
- **SM2DLL.dll** (507KB): Transport Engine (MIDI, sync, threading)
- **01V96.dll** (507KB): Data Engine (parâmetros, estado, protocolo)

### AirFader (iConnectivity)
- **AirFader.exe** (1.9MB): .NET/WinForms app
- **AirControls.dll** (581KB): Controles Custom (faders, meters)
- **Sanford.Multimedia.Midi.dll**: Biblioteca MIDI .NET

---

## 📄 Arquivos Extraídos

### Studio Manager Strings
| Arquivo | Strings Relevantes |
|---------|-------------------|
| `studio_manager_dec/SM2DLL_strings.txt` | 92 (GUI, groups, ports) |
| `studio_manager_dec/01V96/01V96_strings.txt` | 1412 (FE paths, meter, stereo) |

### AirFader Strings
| Arquivo | Strings Relevantes |
|---------|-------------------|
| `airfader_dec/AirControls_strings.txt` | 95 (AirMeter, AirFader, meter) |
| `airfader_dec/AirFader_strings.txt` | 463 (server mode, network) |

---

## 🔍 Principais Descobertas (da Bible Técnica)

### Stereo Meter (01V96)
- **FE Path**: `kMeterStereoRaw/kMeterChannel` (index 0=L, 1=R)
- **Grupo**: 0x02 (Stereo)
- **Stereo Comp GR**: `;02FEkMeterStereoRaw/kMeterCompGR`

### Funções Identificadas
- `postMeterRequest()` → Inicia polling
- `meterUpdate()` → Atualiza UI
- `postMeterStopRequest()` → Para polling

---

## 📊 O que falta descobrir

1. **Como pedir Stereo Meter especificamente** - O protocolo de request
2. **Diferença entre Group 32 vs 33** - Input vs Output channels
3. **Por que não há resposta de outros grupos** - Limitação do protocolo ou da mesa?

---

## 🛠️ Próximos Passos

1. Analisar os strings em detalhes para encontrar o padrão de request
2. Testar request com Device=0x02 (Stereo) diferente do Device=0x7F
3. Comparar com logs do monitor quando Stereo Meter ativo no SM