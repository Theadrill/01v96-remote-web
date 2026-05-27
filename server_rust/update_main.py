import sys
import re

with open('src/main.rs', 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Add api and scene_manager to mods
content = content.replace('mod state;', 'mod state;\nmod api;\nmod scene_manager;')

# 2. Add global_state_api before io.ns
content = content.replace('io.ns(\"/\", move |socket: socketioxide::extract::SocketRef| async move {', 
                          'let global_state_api = global_state.clone();\n    let global_state_socket = global_state.clone();\n    io.ns(\"/\", move |socket: socketioxide::extract::SocketRef| async move {')

# 3. Inside io.ns, clone from global_state_socket
content = content.replace('let state_arc_connect = global_state.clone();', 'let state_arc_connect = global_state_socket.clone();')

# 4. Insert raw midi loop
midi_loop = '''        let mut assembler = midi::MidiAssembler::new();
        while let Some(msg) = midi_in_rx.recv().await {
            let packets = assembler.process_input(&msg);
            for packet in packets {
                let mut state = state_arc_in.write().await;
                
                if state.handle_raw_midi(&packet) {
                    let _ = io_clone.emit("scenesUpdated", &state.scene_manager.get_state());
                    if let Some(ref cs) = state.scene_manager.current_scene {
                        let _ = io_clone.emit("currentScene", cs);
                    }
                    continue;
                }
                
                if let Some(parsed) = midi::protocol::parse_message(&packet) {
                    state.apply_midi(&parsed);'''
content = re.sub(r'let mut assembler = midi::MidiAssembler::new\(\);.*?if let Some\(parsed\) = midi::protocol::parse_message\(&packet\) \{.*?let mut state = state_arc_in\.write\(\)\.await;.*?state\.apply_midi\(&parsed\);', midi_loop, content, flags=re.DOTALL)

# 5. Insert Scene handlers
scene_handlers = '''        let scheduler_scene = scheduler_socket.clone();
        let state_scene = global_state_socket.clone();
        socket.on("recallScene", move |_socket: socketioxide::extract::SocketRef, data: socketioxide::extract::Data<serde_json::Value>| async move {
            if let Some(index) = data.get("index").and_then(|v| v.as_u64()) {
                tracing::info!("SCENE Comando recebido: RECALL Cena {}", index);
                let sysex = vec![0xF0, 0x43, 0x10, 0x3E, 0x7F, 0x10, 0x00, 0x00, index as u8, 0x02, 0x00, 0xF7];
                scheduler_scene.enqueue(sysex, 1).await;

                let mut state = state_scene.write().await;
                state.scene_manager.set_active_scene(index as u8);
            }
        });

        let scheduler_save = scheduler_socket.clone();
        let state_save = global_state_socket.clone();
        socket.on("saveScene", move |_socket: socketioxide::extract::SocketRef, data: socketioxide::extract::Data<serde_json::Value>| async move {
            if let Some(index) = data.get("index").and_then(|v| v.as_u64()) {
                let sysex = vec![0xF0, 0x43, 0x10, 0x3E, 0x7F, 0x10, 0x20, 0x00, index as u8, 0x02, 0x00, 0xF7];
                scheduler_save.enqueue(sysex, 1).await;
                
                let mut state = state_save.write().await;
                if let Some(new_name) = data.get("newName").and_then(|v| v.as_str()) {
                    let mut name_bytes = new_name.as_bytes().to_vec();
                    name_bytes.resize(16, 32);
                    let mut rename_sysex = vec![0xF0, 0x43, 0x10, 0x3E, 0x7F, 0x10, 0x00, 0x00, index as u8, 0x02, 0x00];
                    rename_sysex.extend_from_slice(&name_bytes);
                    rename_sysex.push(0xF7);
                    
                    let name_str = String::from_utf8_lossy(&name_bytes).into_owned();
                    state.scene_manager.scenes[index as usize] = Some(crate::scene_manager::SceneData { index: index as u8, name: name_str });
                }
            }
        });

        socket.on("disconnect"'''
content = content.replace('socket.on("disconnect"', scene_handlers)

# 6. Replace axum Router
content = re.sub(r'let app = Router::new\(\).*?\.layer\(layer\);', 'let app = Router::new().nest("/api", api::macros::router(global_state_api.clone())).fallback_service(tower_http::services::ServeDir::new("../public")).layer(layer);', content, flags=re.DOTALL)


with open('src/main.rs', 'w', encoding='utf-8') as f:
    f.write(content)

