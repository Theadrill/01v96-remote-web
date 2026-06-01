@echo off
title 01V96 Remote MIDI Server - Bridge
echo ==============================================
echo Iniciando 01V96 Remote MIDI Server (Bridge)...
echo ==============================================

if exist "D:\RustDev\iniciar_rust.bat" (
    echo [INFO] Detectado ambiente customizado D:\RustDev.
    call "D:\RustDev\iniciar_rust.bat"
)

cd /d "%~dp0remote_midi_server"
cargo run --release

pause
