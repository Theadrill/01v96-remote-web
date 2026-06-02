@echo off
title Build Release Server Rust
echo Compilando Server Rust em modo Release...
cd server_rust
cargo build --release
pause
