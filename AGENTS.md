# Agent Rules

## Regras Críticas

### Push
- NUNCA faça push sem pedido explícito do usuário
- Quando pedido: 1) `graphify update .` e aguardar, 2) commit, 3) push
- Se continuar a conversa após push, NÃO repita push a cada alteração — espere novo pedido

### Graphify
- Update SÓ quando usuário pedir push
- NÃO rodar update após cada modificação de código

## Build Commands
- Use `cargo check` instead of `cargo build --release` to verify code compiles. Only use `cargo build --release` when the user explicitly asks to build a binary.
