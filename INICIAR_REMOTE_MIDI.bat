@echo off
title 01V96 Remote MIDI Server - Bridge
echo ==============================================
echo Iniciando 01V96 Remote MIDI Server (Bridge)...
echo ==============================================

if exist "D:\RustDev\iniciar_rust.bat" (
    echo [INFO] Detectado ambiente customizado D:\RustDev.
    call "D:\RustDev\iniciar_rust.bat"
)

cd /d "%~dp0"
if exist remote_midi_server.exe (
    remote_midi_server.exe
) else (
    echo [AVISO] Executavel remote_midi_server.exe nao encontrado na raiz.
    echo Compilando e iniciando via Cargo...
    cargo run -p remote_midi_server --release
)

pause
