# Graph Report - .  (2026-06-03)

## Corpus Check
- 250 files · ~473,241 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 428 nodes · 553 edges · 66 communities (29 shown, 37 thin omitted)
- Extraction: 88% EXTRACTED · 12% INFERRED · 0% AMBIGUOUS · INFERRED: 66 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Mixer UI Client Modules (channel strip, EQ, gate, aux, routing)|Mixer UI Client Modules (channel strip, EQ, gate, aux, routing)]]
- [[_COMMUNITY_Web Frontend Utility Functions|Web Frontend Utility Functions]]
- [[_COMMUNITY_Migration Audit (RustNode.js Dead Code)|Migration Audit (Rust/Node.js Dead Code)]]
- [[_COMMUNITY_Server Rust Core (boot, config, DMX, MIDI, state)|Server Rust Core (boot, config, DMX, MIDI, state)]]
- [[_COMMUNITY_CLI Tools & MIDI Bridge Utils|CLI Tools & MIDI Bridge Utils]]
- [[_COMMUNITY_MIDI Engine & Protocol (server_rust)|MIDI Engine & Protocol (server_rust)]]
- [[_COMMUNITY_Graphify Knowledge Graph Tool|Graphify Knowledge Graph Tool]]
- [[_COMMUNITY_Reverse DLL Categorized Properties|Reverse DLL Categorized Properties]]
- [[_COMMUNITY_Architecture Refactor Plan|Architecture Refactor Plan]]
- [[_COMMUNITY_Macros Engine & Host Profiles|Macros Engine & Host Profiles]]
- [[_COMMUNITY_Node.js Legacy MIDI Functions|Node.js Legacy MIDI Functions]]
- [[_COMMUNITY_Rust Migration Governance Rules|Rust Migration Governance Rules]]
- [[_COMMUNITY_Project README Highlights|Project README Highlights]]
- [[_COMMUNITY_Channel Pair SysEx & 01V96 Mixer|Channel Pair SysEx & 01V96 Mixer]]
- [[_COMMUNITY_MIDI Common Crate & Remote MIDI Bridge|MIDI Common Crate & Remote MIDI Bridge]]
- [[_COMMUNITY_Reverse DLL SceneSync Properties|Reverse DLL Scene/Sync Properties]]
- [[_COMMUNITY_UIUX Pro Max Design System Skills|UI/UX Pro Max Design System Skills]]
- [[_COMMUNITY_GitHub Address Comments Skill|GitHub Address Comments Skill]]
- [[_COMMUNITY_Monitor Log & Legacy Config Snapshots|Monitor Log & Legacy Config Snapshots]]
- [[_COMMUNITY_Reverse DLL Property Maps|Reverse DLL Property Maps]]
- [[_COMMUNITY_DMX Art-Net Auto-Recovery|DMX Art-Net Auto-Recovery]]
- [[_COMMUNITY_Backend & Testing Pattern Skills|Backend & Testing Pattern Skills]]
- [[_COMMUNITY_Features Plan (Custom Scenes, Server Name)|Features Plan (Custom Scenes, Server Name)]]
- [[_COMMUNITY_Remote MIDI Implementation Plan|Remote MIDI Implementation Plan]]
- [[_COMMUNITY_Legacy Project Package Snapshot|Legacy Project Package Snapshot]]
- [[_COMMUNITY_ArtNet-to-DMX Bridge (.NET 6)|ArtNet-to-DMX Bridge (.NET 6)]]
- [[_COMMUNITY_Karpathy Coding Guidelines Skill|Karpathy Coding Guidelines Skill]]
- [[_COMMUNITY_Docs Writer Skill & Style Guide|Docs Writer Skill & Style Guide]]
- [[_COMMUNITY_Performance Optimization Plan|Performance Optimization Plan]]
- [[_COMMUNITY_Docs Writer & Style Guide|Docs Writer & Style Guide]]
- [[_COMMUNITY_Splash Screen Authentication|Splash Screen Authentication]]
- [[_COMMUNITY_GitHub Comment Fetcher|GitHub Comment Fetcher]]
- [[_COMMUNITY_FX Slot Scanner & Elevation Test|FX Slot Scanner & Elevation Test]]
- [[_COMMUNITY_Design System Generator|Design System Generator]]
- [[_COMMUNITY_UIUX Pro Max BM25 Search|UI/UX Pro Max BM25 Search]]
- [[_COMMUNITY_MIDI Filter Config (legacy)|MIDI Filter Config (legacy)]]
- [[_COMMUNITY_VSCode Editor Settings|VSCode Editor Settings]]
- [[_COMMUNITY_Legacy App.js Snapshot|Legacy App.js Snapshot]]
- [[_COMMUNITY_ESLint Config|ESLint Config]]
- [[_COMMUNITY_OpenCode TUI Config|OpenCode TUI Config]]
- [[_COMMUNITY_Agent Skill Lock|Agent Skill Lock]]
- [[_COMMUNITY_Chat Scraping Capture HTML|Chat Scraping Capture HTML]]
- [[_COMMUNITY_Coding Guidelines (Karpathy)|Coding Guidelines (Karpathy)]]
- [[_COMMUNITY_Socket Listeners Init|Socket Listeners Init]]
- [[_COMMUNITY_JavaScript Mastery Skill|JavaScript Mastery Skill]]
- [[_COMMUNITY_JavaScript Pro Skill|JavaScript Pro Skill]]
- [[_COMMUNITY_Compressor Module|Compressor Module]]
- [[_COMMUNITY_Slider Restriction Handler|Slider Restriction Handler]]
- [[_COMMUNITY_Gate Module|Gate Module]]
- [[_COMMUNITY_Globals Module|Globals Module]]
- [[_COMMUNITY_Mixer State Structure|Mixer State Structure]]
- [[_COMMUNITY_Bus Assignment Toggle|Bus Assignment Toggle]]
- [[_COMMUNITY_Node.js Best Practices Skill|Node.js Best Practices Skill]]
- [[_COMMUNITY_Index HTML|Index HTML]]
- [[_COMMUNITY_Channel Pair SysEx Offset 18|Channel Pair SysEx Offset 18]]
- [[_COMMUNITY_Reverse DLL Title Properties|Reverse DLL Title Properties]]
- [[_COMMUNITY_Graphify Rules|Graphify Rules]]
- [[_COMMUNITY_BM25 Script|BM25 Script]]
- [[_COMMUNITY_Git Sync (Rust)|Git Sync (Rust)]]
- [[_COMMUNITY_Proxy UDP Macro|Proxy UDP Macro]]
- [[_COMMUNITY_Test Scheduler|Test Scheduler]]
- [[_COMMUNITY_UI Visual Validator|UI Visual Validator]]
- [[_COMMUNITY_Graphify Workflows|Graphify Workflows]]
- [[_COMMUNITY_Find Patch Script (legacy)|Find Patch Script (legacy)]]
- [[_COMMUNITY_List MIDI Script (legacy)|List MIDI Script (legacy)]]
- [[_COMMUNITY_Monitor Script (legacy)|Monitor Script (legacy)]]

## God Nodes (most connected - your core abstractions)
1. `Global Socket.IO Instance` - 18 edges
2. `socket.js - Socket.IO event listeners and meter rendering` - 16 edges
3. `getChannelStateById Universal State Resolver` - 15 edges
4. `01V96 categorized property definitions` - 15 edges
5. `async_main - application entry point: wires GlobalState, MidiScheduler, SocketIO, ConnectionManager, axum HTTP` - 15 edges
6. `channel_strip.js - Fader channel strip UI rendering` - 15 edges
7. `ConnectionManager - manages MIDI connection lifecycle, watchdog, meter polling, demo mode` - 13 edges
8. `channelStates array - per-channel client state` - 13 edges
9. `initUI Full UI Renderer` - 12 edges
10. `NPM package definition (01v96-remote-web)` - 11 edges

## Surprising Connections (you probably didn't know these)
- `MIDI ports mapeados: 8× Yamaha 01V96-1..8 IN/OUT, SMC-PAD-bt-2, monitor (IN:9/OUT:10)` --semantically_similar_to--> `MIDI ports: inIdx=0 Yamaha 01V96-1, outIdx=1`  [INFERRED] [semantically similar]
  log/monitor_log(sincronização inicial).txt → tmp/working_version/01v96-remote-web-main/config.json
- `METER properties (VU, GR, CR, Surr, Osc)` --conceptually_related_to--> `MIDI SysEx Protocol`  [INFERRED]
  reverse_dll_project/categorized_properties.json → README.md
- `Bulk transfer protocol properties` --conceptually_related_to--> `MIDI SysEx Protocol`  [INFERRED]
  reverse_dll_project/sync_properties.json → README.md
- `Sends on Faders mixing mode` --conceptually_related_to--> `AUX property category`  [INFERRED]
  README.md → reverse_dll_project/categorized_properties.json
- `MIDI bridge with SysEx fragment reassembly for Yamaha 01V96` --semantically_similar_to--> `MIDI port discovery utility`  [INFERRED] [semantically similar]
  monitor.js → list-midi.js

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Yamaha 01V96 MIDI integration via loopMIDI with SysEx reassembly** — _monitor_midi_bridge, concept_yamaha_01v96, concept_studio_manager, concept_loopmidi, concept_sysex_reassembly [INFERRED]
- **01V96 reverse-engineered DLL property set** — reverse_dll_property_map, reverse_dll_categorized_properties, reverse_dll_detailed_prop_map, reverse_dll_sync_properties [INFERRED 0.95]
- **** — public_vendor_socketio_socketio, concept_websocket_realtime_communication, serverrust_midi_meterdummy_meterdummy, external_socketioxide_crate [EXTRACTED 1.00]
- **Tab switching dispatches to modal content renderers (EQ, Dynamics, AUX, Routing)** — fn_switcheb, fn_rendereq, fn_renderdynamics, fn_renderauxs, fn_renderrouting [INFERRED]
- **Socket update dispatcher fan-out to per-module state sync functions** — modules_socket, fn_updateui, fn_update_aux_from_socket, fn_update_comp_from_socket, fn_update_gate_from_socket, fn_update_eq_param [INFERRED]
- **Server-side MIDI bridge pipeline: server -> midi-engine -> protocol -> SysEx** — src_server, src_midi_engine, src_protocol, concept_midi_sysex [INFERRED]
- **JavaScript Education & Best Practice Skills** — javascript_mastery_skill, javascript_pro_skill, javascript_testing_patterns_skill [INFERRED 0.85]
- **Node.js → Rust migration audit & gaps** —  [EXTRACTED 1.00]
- **Yamaha 01V96 FX parameters (HOLD/DECAY/Rev Time) via SysEx F0 43 10 3E 7F 01 58** —  [INFERRED 0.85]
- **Migration governance rules for AI agents** — docs_migration_no_commit_rule, docs_migration_preserve_features_rule, docs_migration_update_doc_rule, docs_migration_detailed_for_continuity_rule, docs_migration_test_after_code_rule [EXTRACTED 1.00]
- **14-bit Master Meter via native 0x21 with steps.json calibration (dB = (raw - 4493) / 63.66)** —  [INFERRED 0.90]

## Communities (66 total, 37 thin omitted)

### Community 0 - "Mixer UI Client Modules (channel strip, EQ, gate, aux, routing)"
Cohesion: 0.05
Nodes (67): renderAuxs Aux Sends UI Renderer, updateAuxFromSocket Aux Sync Handler, clearAllSolos Master Solo Clear, createDesktopStrip / createMobileStrip Universal Fader Components, createOutputStrip / createDesktopOutputStrip, initUI Full UI Renderer, updatePanIndicator Desktop Pan Visual, updateUI Fader/On/Solo UI Sync (+59 more)

### Community 1 - "Web Frontend Utility Functions"
Cohesion: 0.10
Nodes (41): calibrateStep() - meter step to fill percent, dbToRaw() - dB to fader value conversion, enableDragScroll() - drag-to-scroll utility, enterMusicianMode() - activates musician view, faderInput() - commits fader change, initUI() - rebuilds all channel strips, mapDynDbToPercent() - dynamics dB to UI percent, rawToDb() - fader value to dB conversion (+33 more)

### Community 2 - "Migration Audit (Rust/Node.js Dead Code)"
Cohesion: 0.06
Nodes (34): Critical gaps: SyncCounter inativo / MasterMeter sem calibração / Lumikit IP stub / config socket não persiste, 11 warnings de código morto (AppConfig::save, SyncCounter::begin_sync, MasterMeter::parse, etc.), MIGRATION_AUDIT.md (root), Migração Rust ~95% completa em 28/Mai/2026, 16 funções Rust definidas mas nunca chamadas: macros_*_handler, MidiAssembler::reset, MidiScheduler::stop/clear/set_q1_empty_callback, Converter::Signed14/DynOn, bytes_to_dyn_on, ParsedMidi::SceneNumber/UpdateSceneChar, SceneManager::build_bulk_request, dmx::*, docs/MIGRATION_AUDIT.md (Node.js→Rust audit), Problemas adicionais: stereo_link.rs não existe, porta Rust 3001 vs Node 4000, saveScene usa 0x00 em vez de 0x40, requestDynamics não retorna state local, dead handlers no main.rs, rt.block_on unused Result, Module mapping Node.js → Rust: state-manager/protocol/midi-engine/scheduler/assembler/scene_manager/meter_dummy/master-meter/pair/sync-manager/connection/config/dictionary/systray/logger/platform/dmx (+26 more)

### Community 3 - "Server Rust Core (boot, config, DMX, MIDI, state)"
Cohesion: 0.15
Nodes (32): ArtNetToDMX.exe - FTDI USB bridge converting ArtNet to DMX512 for lighting control, axum Router - HTTP server serving static files and API routes, LumikitSHOW.exe - professional lighting control software, api module - exports macros submodule, initialize_dmx - boot sequence: delayed launch of ArtNetToDMX for lighting system, initialize_midi - boot sequence: connects MIDI ports, launches radar/search, starts demo simulation, AppConfig - centralized configuration loaded from config.json, names.json, steps.json, save_names_to_disk - debounced names.json persistence from GlobalState snapshot (+24 more)

### Community 4 - "CLI Tools & MIDI Bridge Utils"
Cohesion: 0.11
Nodes (22): Screenshot capture script via PowerShell CopyFromScreen, Application configuration (MIDI, meters, networking, timing), MIDI message filter configuration (prefix-based), MIDI port discovery utility, MIDI bridge with SysEx fragment reassembly for Yamaha 01V96, NPM package definition (01v96-remote-web), Lumikit lighting device integration, MIDI bridge pattern (Yamaha <-> Studio Manager) (+14 more)

### Community 5 - "MIDI Engine & Protocol (server_rust)"
Cohesion: 0.18
Nodes (17): Socket.IO v4.7.4 client, MidiAssembler, MIDI parameter dictionary, MidiEngine, MidiOutput, MasterMeter, Meter dummy simulation, MIDI module declarations (+9 more)

### Community 6 - "Graphify Knowledge Graph Tool"
Cohesion: 0.14
Nodes (16): graphify explain - focused concept explanation command, graphify-out/graph.json - persisted knowledge graph, graphify knowledge graph ecosystem (graph.json, query, path, explain, update, skill), graphify path - relationship tracing command, graphify query - scoped subgraph search command, GRAPH_REPORT.md - broad architecture report, graphify skill - specialized skill for knowledge graph operations, graphify update - AST-only incremental graph update (+8 more)

### Community 7 - "Reverse DLL Categorized Properties"
Cohesion: 0.15
Nodes (13): 01V96 categorized property definitions, DAW routing properties (Phase, Insert, Routing, Pan), METER properties (VU, GR, CR, Surr, Osc), Studio Manager window control properties, AUX property category, BUS property category, COMP compressor property category, EFFECT property category (+5 more)

### Community 8 - "Architecture Refactor Plan"
Cohesion: 0.20
Nodes (12): ARCHITECTURE_REFACTOR_PLAN.md (01v96-Bridge refactor), server.js God Object (+1100 linhas) — extrair para src/midi-assembler, midi-scheduler, sync-manager, api/macros, Macros API router: /api/macros/hosts, /macros, /macros/slots (GET/POST/DELETE), /macros/swap, /macros/config/:modId, /macros/proxy/{http,udp} + Ninja GitSync debounce 10s, MidiAssembler: descarta 0xFE/0xFD/0xF8 Active Sensing/Clock, monta SysEx F0...F7, MidiScheduler: 3 filas q0/q1/q2, tickMs=5ms, coalescência em q0, drop silencioso em q2, SyncManager: enfileira fire() com stopMeters, kStereoFader, 32 inputs (fader/on/solo/phase/att + EQ + AUX + Gate + Comp + Patch), 8 AUX/Bus, Stereo master, Nomes, Ninja Sync Wizard: auto-check Git, Fork/Auth/Config/Vínculo flow, git remote set-url https://<TOKEN>@github.com/<USER>/repo, git push origin main --dry-run, github_sync_implementation_plan.md (Ninja Sync) (+4 more)

### Community 9 - "Macros Engine & Host Profiles"
Cohesion: 0.30
Nodes (12): assignedMacros Slot Assignments Map, Channel Toggler Macro Mod (ON/OFF Multi-Channel), MixerAPI (mixer/network/utils) Modder Contract, Macro Engine (Multi-Preset, Slots, Plugin Registry), Host-to-Preset Mapping Configuration, Lumikit Macro Mod (Lighting Scene+Extra Control), macroDatabase Plugin Registry, registerMacro Plugin Registration Function (+4 more)

### Community 10 - "Node.js Legacy MIDI Functions"
Cohesion: 0.24
Nodes (11): buildChange() - constructs MIDI change SysEx, connectPorts() - MIDI port binding, parseIncoming() - decodes incoming SysEx, triggerSync() - full state sync from mixer, updateState() - server state mutation, dictionary.js - COMMAND_BYTES mapping, meter_dummy.js - Simulated meter SysEx generator, midi-engine.js - MIDI I/O wrapper (midi npm lib) (+3 more)

### Community 11 - "Rust Migration Governance Rules"
Cohesion: 0.22
Nodes (10): Detailed logs for AI continuity rule, Fase 16 - Cleanup (warnings, clippy), Rust must serve ../public/ frontend rule, No auto-commit rule for migration, Preserve all Node.js features rule, Compile and test after changes rule, Update migration plan doc after each step rule, Rust migration plan v4.0 (~90% complete) (+2 more)

### Community 12 - "Project README Highlights"
Cohesion: 0.20
Nodes (10): Git integration for Ninja Sync auto-save, 01V96 Remote Web Interface, Lumikit lighting control integration, Ninja Sync macro system, Remote MIDI over Network Bridge, TCP port 4200 for MIDI bridge, Sends on Faders mixing mode, Windows Tray Application (+2 more)

### Community 13 - "Channel Pair SysEx & 01V96 Mixer"
Cohesion: 0.22
Nodes (9): Channel Pair implementation plan, Channel pair SysEx message format (14-byte), MIDI SysEx Protocol, Yamaha 01V96 Digital Mixer, Channel fader and fader group properties, 01V96 detailed property offset map, kFader channel fader property, CHANNEL property category (+1 more)

### Community 14 - "MIDI Common Crate & Remote MIDI Bridge"
Cohesion: 0.31
Nodes (9): MidiAssembler, Heartbeat protocol (3s/10s + magic 0xFFFE00), write_frame / read_frame (TCP framing), midi_common Rust crate, establish_midi (MIDI connection setup), MiniConfig (server JSON config), Remote MIDI Server (Rust binary), try_connect_midi (MIDI port autodiscovery) (+1 more)

### Community 15 - "Reverse DLL Scene/Sync Properties"
Cohesion: 0.25
Nodes (8): Automix sync and SMPTE/MTC properties, Bulk transfer protocol properties, Library edit properties (EQ, Gate, Comp, Eff, GEQ, Ch), SCENE property category, Recall Safe memory protection properties, Scene memory / undo system properties, kSceneSelection property, 01V96 sync/bulk transfer properties

### Community 16 - "UI/UX Pro Max Design System Skills"
Cohesion: 0.53
Nodes (6): BM25 ranking algorithm for text search, UI design system with style/color/typography recommendations, BM25 search engine for UI/UX style guides, Design system generator with reasoning rules, UI/UX Pro Max search CLI, UI/UX Pro Max design system skill definition

### Community 17 - "GitHub Address Comments Skill"
Cohesion: 0.47
Nodes (6): GitHub CLI (gh) command-line tool, GitHub GraphQL API, Apache License 2.0 for gh-address-comments skill, GitHub PR comment handler skill definition, GH address comments skill metadata, GitHub GraphQL PR comment fetcher script

### Community 18 - "Monitor Log & Legacy Config Snapshots"
Cohesion: 0.33
Nodes (6): log/monitor_log(sincronização inicial).txt, MIDI ports mapeados: 8× Yamaha 01V96-1..8 IN/OUT, SMC-PAD-bt-2, monitor (IN:9/OUT:10), Tráfego: Y→S 394 / S→Y 11 / Meters 397 / Loopback filtrado 391, dump de cena 282 bytes, dump de cena 625 bytes, MIDI ports: inIdx=0 Yamaha 01V96-1, outIdx=1, config.json (legacy working version), loopmidi-monitor=true, demo_mode=false

### Community 19 - "Reverse DLL Property Maps"
Cohesion: 0.33
Nodes (6): 01V96 categorized properties (SCENE/CHANNEL/GATE/COMP/EQ/AUX), 01V96 detailed property map (with m1/m2/m3 calibration), 01V96 property map (offset->kConstant mapping), 01V96 sync properties (BULK/recall/memory snapshot), 01V96 Bridge Server (Express+Socket.IO orchestrator), Legacy server (monolithic Node.js server_old.js)

### Community 20 - "DMX Art-Net Auto-Recovery"
Cohesion: 0.50
Nodes (5): DMX Art-Net auto-recovery integration plan, FTDI USB DMX hardware interface, dmx_heartbeat.txt health check mechanism, PowerShell USB device reset for DMX recovery, ArtNetDMX open source DMX project

### Community 21 - "Backend & Testing Pattern Skills"
Cohesion: 0.50
Nodes (4): Node.js Backend Patterns Implementation Playbook, JavaScript Testing Patterns, Node.js Backend Patterns, JS Testing Patterns Implementation Playbook

### Community 22 - "Features Plan (Custom Scenes, Server Name)"
Cohesion: 0.67
Nodes (3): Feature 1 — Custom Scene Names: JSON registry custom_names_scenes-{mesa}.json + arquivos custom_names_scene-{name}-{mesa}.json; 4 chars mesa / 10 chars app; canais 1-32 mono, 33-40 ST IN L/R, master, renameServer handler propaga SERVER_NAME para todos custom_names_*.json + atualiza .env, Feature 2 — Server Name via .env: SERVER_NAME (3-30 chars, [a-z0-9-]), SERVER_PASSWORD (4 dígitos)

### Community 23 - "Remote MIDI Implementation Plan"
Cohesion: 0.50
Nodes (3): Arquitetura Remote MIDI: midi_common (assembler + framing) + remote_midi_server (TCP:4200) + RemoteClient + MidiOutput enum (Local/Remote), Ambiente Rust portátil D:\RustDev\ (RUSTUP_HOME/CARGO_HOME); INICIAR_REMOTE_MIDI.bat, Remote MIDI protocol: 4-byte LE len + payload; HEARTBEAT_MAGIC=[0xFF,0xFE,0x00]; HEARTBEAT_INTERVAL=3s, HEARTBEAT_TIMEOUT=10s; remote_midi_port=4200

### Community 24 - "Legacy Project Package Snapshot"
Cohesion: 0.50
Nodes (4): Dependencies: express, midi, socket.io, uiohook-napi, systray2, screenshot-desktop, node-global-key-listener, package.json (legacy Node.js root), Repo: github.com/Theadrill/01v96-remote-web (ISC, commonjs), npm start → node server.js; main=sniffer.js

### Community 25 - "ArtNet-to-DMX Bridge (.NET 6)"
Cohesion: 0.67
Nodes (3): ArtNetToDMX .NET 6.0 runtime configuration, ArtNet to DMX conversion via FTDI, .NET 6.0 runtime

### Community 26 - "Karpathy Coding Guidelines Skill"
Cohesion: 0.67
Nodes (3): Coding guidelines skill definition, Coding guidelines skill metadata, Karpathy coding guidelines

### Community 27 - "Docs Writer Skill & Style Guide"
Cohesion: 0.67
Nodes (3): Documentation writer skill definition, Documentation writer skill metadata, Documentation style guide reference

### Community 28 - "Performance Optimization Plan"
Cohesion: 0.67
Nodes (3): plano_de_otimizacao.md (Chrome Performance Trace), Otimizações A-K (FEITO): meter cache, EQ throttle 20fps, meter throttle 30fps, Date.now fora do loop, remover backdrop-filter, box-shadow→border, transition:none, text-shadow simples, contain: layout, will-change:transform, Chrome Performance Trace 2026-05-05: 6.761 nós DOM, INP 141,3ms, Layerize 8.496ms, Recálculo 1.729ms

## Ambiguous Edges - Review These
- `FX slot deep scanner (SysEx monitor for effects)` → `PowerShell UAC elevation test`  [AMBIGUOUS]
  scratch/test_sudo.js · relation: conceptually_related_to
- `Capture Steps — Screenshot capture tool using PowerShell CopyFromScreen, triggered by mouse wheel scroll with F6/F7 hotkeys via uiohook-napi` → `Frontend Bootstrap — Initializes UI and Socket.IO connection, sets appReady flag after stabilization delay`  [AMBIGUOUS]
  tmp/working_version/01v96-remote-web-main/capture-steps.js · relation: conceptually_related_to

## Knowledge Gaps
- **179 isolated node(s):** `fetch_comments.py (GitHub GraphQL PR Comment Fetcher)`, `BM25 (BM25 Ranking Algorithm)`, `DesignSystemGenerator`, `generate_design_system`, `format_output (CLI search formatter)` (+174 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **37 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **What is the exact relationship between `FX slot deep scanner (SysEx monitor for effects)` and `PowerShell UAC elevation test`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **What is the exact relationship between `Capture Steps — Screenshot capture tool using PowerShell CopyFromScreen, triggered by mouse wheel scroll with F6/F7 hotkeys via uiohook-napi` and `Frontend Bootstrap — Initializes UI and Socket.IO connection, sets appReady flag after stabilization delay`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **Why does `socket.js - Socket.IO event listeners and meter rendering` connect `Web Frontend Utility Functions` to `Mixer UI Client Modules (channel strip, EQ, gate, aux, routing)`?**
  _High betweenness centrality (0.049) - this node is a cross-community bridge._
- **Why does `Meter Calibration Steps Data` connect `Mixer UI Client Modules (channel strip, EQ, gate, aux, routing)` to `Web Frontend Utility Functions`?**
  _High betweenness centrality (0.045) - this node is a cross-community bridge._
- **Are the 2 inferred relationships involving `socket.js - Socket.IO event listeners and meter rendering` (e.g. with `initUI() - rebuilds all channel strips` and `Meter Calibration Steps Data`) actually correct?**
  _`socket.js - Socket.IO event listeners and meter rendering` has 2 INFERRED edges - model-reasoned connections that need verification._
- **Are the 2 inferred relationships involving `01V96 categorized property definitions` (e.g. with `01V96 reverse-engineered property map` and `01V96 sync/bulk transfer properties`) actually correct?**
  _`01V96 categorized property definitions` has 2 INFERRED edges - model-reasoned connections that need verification._
- **What connects `fetch_comments.py (GitHub GraphQL PR Comment Fetcher)`, `BM25 (BM25 Ranking Algorithm)`, `DesignSystemGenerator` to the rest of the system?**
  _185 weakly-connected nodes found - possible documentation gaps or missing edges._