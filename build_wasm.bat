@echo off
echo ==============================================
echo 🚀 Compilando client_wasm para public/wasm...
echo ==============================================

cd client_wasm
wasm-pack build --target web --no-typescript --out-dir ../public/wasm

if %errorlevel% neq 0 (
    echo.
    echo ❌ Erro ao compilar o WASM! Certifique-se de ter o wasm-pack instalado.
    echo Para instalar, rode: cargo install wasm-pack
    echo.
) else (
    echo.
    echo ✅ WASM compilado com sucesso!
    echo.
    if exist "..\public\wasm\.gitignore" del /Q "..\public\wasm\.gitignore"
)

cd ..
pause
