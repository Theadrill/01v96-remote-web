# Agent Rules

## Regras Críticas

### Push
- NUNCA faça push sem pedido explícito do usuário
- Mesmo após commit, NÃO faça push automaticamente — espere o usuário pedir
- Se continuar a conversa após push, NÃO repita push a cada alteração — espere novo pedido

## Build Commands
- Use `cargo check` instead of `cargo build --release` to verify code compiles. Only use `cargo build --release` when the user explicitly asks to build a binary.
