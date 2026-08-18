# Instruções de Build dos Binários

## O que fazer

Compile os binários do servidor em modo release e commit-os no repositório.

## Passos

```bash
# 1. Compilar em modo release
cargo build --release

# 2. Adicionar os binários compilados ao staging
git add target/release/server_rust.exe target/release/remote_midi_server.exe

# 3. Verificar o status (confirme que os .exe estão staged)
git status

# 4. Commit com mensagem padrão
git commit -m "build: atualização dos binários compilados do servidor (release)"

# 5. Push
git push
```

## Notas

- Os binários ficam em `target/release/` e já estão configurados no `.gitignore` para serem versionados.
- O `iniciar_server_rust.bat` executa `target\release\server_rust.exe` diretamente.
- Não crie GitHub release — o padrão é baixar o repositório e rodar o `.bat` localmente.
- Se apenas o `server_rust.exe` mudou, o `git add` do `remote_midi_server.exe` será ignorado silenciosamente.

