@echo off
title Build Release 01V96 (Rust Workspace)
echo.
echo ==============================================
echo Compilando projetos Rust em modo Release...
echo ==============================================
echo.

cargo build --release

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [ERRO] Falha ao compilar os projetos Rust.
    pause
    exit /b %ERRORLEVEL%
)

echo.
echo ==============================================
echo Compilacao concluida com sucesso!
echo ==============================================
echo Os executaveis estao disponiveis em target\release\
echo e acessiveis via links simbolicos na raiz do projeto.
echo.
pause
