## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

When the user types `/graphify`, invoke the `skill` tool with `skill: "graphify"` before doing anything else.

Rules:
- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- Dirty graphify-out/ files are expected after hooks or incremental updates; dirty graph files are not a reason to skip graphify. Only skip graphify if the task is about stale or incorrect graph output, or the user explicitly says not to use it.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).

## Architecture context (for graphify extraction agents)

When extracting nodes/edges from this codebase, apply these classifications:

- `server_rust/` — the current production backend. Treat as the main system.
- `src/` (root) — legacy Node.js server, OBSOLETE. Excluded by `.graphifyignore`; do not extract.
- `remote_midi_server/` — standalone TCP bridge binary that runs on the PC where the 01V96 is physically connected via USB. Exposes the mixer over TCP:4200 so the main server can run anywhere on the network.
- `midi_common/` — shared crate (MidiAssembler for SysEx re-fragmentation, TCP length-prefixed framing, heartbeat protocol) used by both `server_rust` and `remote_midi_server`.
- `monitor.js` — debug-only SysEx sniffer connecting the server to Yamaha Studio Manager for reverse-engineering new features. NOT part of the production data path. When extracting, tag it with `file_type: "code"` AND attach the rationale: "debug-only RE sniffer between Studio Manager and 01V96; captures SysEx round-trips for protocol discovery, not production traffic". Do not connect it to the production data flow edges (server_rust → socket.js → UI).
- `tmp/working_version/01v96-remote-web-main/` — historical snapshot of the project. Tag edges from these nodes as AMBIGUOUS (low confidence) unless they are structural mirrors of the current code.
- `reverse_dll_project/` — Ghidra/decompile output of the Yamaha 01V96 Studio Manager DLLs. Source of truth for property offsets and SysEx formats. Edges from these nodes to README/protocol concepts are EXTRACTED (high confidence).
- `.agent/skills/`, `.claude/skills/`, `.cline/skills/`, etc. — duplicated skills across agent platforms. Only `.agent/` is canonical; the others are mirrors for IDE integration and contain the same content.
