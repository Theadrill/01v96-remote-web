mod api;
mod boot;
mod config;
pub mod custom_scenes;
pub mod dmx;
mod env_config;
mod midi;
mod midi_receiver;
pub mod name_resolver;
mod network;
mod scene_manager;
mod socket_handlers;
mod state;
mod rta_manager;
mod tailscale_http;

use axum::Router;
use socketioxide::SocketIo;
use std::sync::Arc;
use tokio::sync::RwLock;
use tracing::info;

mod tray;
fn main() -> Result<(), Box<dyn std::error::Error>> {
    let (shutdown_tx, shutdown_rx) = tokio::sync::mpsc::channel::<()>(1);
    let config = config::AppConfig::load();
    let tray_app = tray::TrayApp::new(config.port, config.remote_midi)?;
    *tray_app.shutdown_tx.lock().unwrap() = Some(shutdown_tx.clone());
    std::thread::spawn(move || {
        let rt = tokio::runtime::Runtime::new().unwrap();
        let _ = rt.block_on(async_main(shutdown_rx, shutdown_tx));
    });
    tray_app.run_message_loop();
    Ok(())
}

async fn async_main(
    mut shutdown_rx: tokio::sync::mpsc::Receiver<()>,
    shutdown_tx: tokio::sync::mpsc::Sender<()>,
) -> Result<(), Box<dyn std::error::Error>> {
    use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt, EnvFilter};
    
    let root = config::get_project_root();
    let log_dir = root.join("log");
    let _ = std::fs::create_dir_all(&log_dir);
    let log_file = std::fs::File::create(log_dir.join("server_rust_log.txt"))
        .expect("Nao foi possivel criar o arquivo de log do servidor");

    let env_filter = EnvFilter::try_from_default_env()
        .unwrap_or_else(|_| EnvFilter::new("info"));

    tracing_subscriber::registry()
        .with(env_filter)
        .with(tracing_subscriber::fmt::layer())
        .with(tracing_subscriber::fmt::layer().with_writer(log_file).with_ansi(false))
        .init();
    let global_state = Arc::new(RwLock::new(state::GlobalState::new()));

    let app_config = config::AppConfig::load();
    info!(
        "🎧 Configuracoes carregadas: MIDI In: {}, MIDI Out: {}",
        app_config.in_idx, app_config.out_idx
    );

    // inject_names foi removido — nomes físicos chegam via MIDI dump no sync

    let master_meter = Arc::new(RwLock::new(midi::master_meter::MasterMeter::new()));
    {
        let mut mm = master_meter.write().await;
        if let Some(steps) = app_config.steps.get("master") {
            mm.set_steps(steps);
        }
    }

    let sync_counter = Arc::new(midi::SyncCounter::new());

    let (midi_in_tx, midi_in_rx) = tokio::sync::mpsc::channel::<Vec<u8>>(4096);

    let engine: Option<Arc<tokio::sync::Mutex<midi::MidiEngine>>>;
    let remote_client: Option<Arc<midi::RemoteClient>>;
    let midi_output: midi::MidiOutput;

    if app_config.remote_midi {
        info!("🌐 Inicializando cliente MIDI remoto...");
        let client = Arc::new(midi::RemoteClient::new(
            app_config.clone(),
            midi_in_tx.clone(),
        ));
        client.start();
        midi_output = midi::MidiOutput::Remote(client.clone());
        remote_client = Some(client);
        engine = None;
    } else {
        info!("🔌 Inicializando motor MIDI local...");
        let local_engine = Arc::new(tokio::sync::Mutex::new(midi::MidiEngine::new()));
        midi_output = midi::MidiOutput::Local(local_engine.clone());
        engine = Some(local_engine);
        remote_client = None;
    }

    let scheduler = Arc::new(midi::MidiScheduler::new(
        app_config.scheduler_tick_ms,
        midi_output,
        sync_counter.clone(),
    ));
    scheduler.start().await;

    let (layer, io) = SocketIo::new_layer();

    // --- CUSTOM SCENES (precisa ser antes do SyncManager) ---
    let data_dir = {
        let root = config::get_project_root();
        let dir = root.join("data").join("custom_scenes");
        let _ = std::fs::create_dir_all(&dir);
        dir
    };
    let mesa_nome = crate::env_config::load_server_name().unwrap_or_else(|| "default".to_string());
    tracing::info!(
        "[CUSTOM] mesa_nome={:?}, data_dir={:?}",
        mesa_nome,
        data_dir
    );
    let custom_scene_manager = Arc::new(RwLock::new(custom_scenes::CustomSceneManager::load_all(
        &data_dir, &mesa_nome,
    )));

    let sync_manager = Arc::new(network::SyncManager::new(
        scheduler.clone(), 
        io.clone(), 
        custom_scene_manager.clone(),
        app_config.sync_chunk_size,
        app_config.sync_chunk_delay_ms,
    ));
    let sync_manager_socket = sync_manager.clone();

    let conn_mgr = network::ConnectionManager::new(
        app_config.clone(),
        io.clone(),
        scheduler.clone(),
        global_state.clone(),
        sync_counter.clone(),
        sync_manager,
        engine,
        remote_client,
        midi_in_tx.clone(),
        shutdown_tx.clone(),
    );

    let global_state_api = global_state.clone();
    let rta_manager = Arc::new(tokio::sync::Mutex::new(crate::rta_manager::RtaManager::new()));

    socket_handlers::register_handlers(
        io.clone(),
        scheduler.clone(),
        global_state.clone(),
        conn_mgr.clone(),
        sync_manager_socket,
        custom_scene_manager.clone(),
        rta_manager,
    );

    // --- LOCALIZAR PASTA PUBLIC ---
    let mut public_dir = std::path::PathBuf::from("../public");
    if let Ok(exe_path) = std::env::current_exe()
        && let Some(exe_dir) = exe_path.parent()
    {
        // Candidato 1: exe na raiz do projeto ou pasta de deploy com 'public' ao lado
        let path1 = exe_dir.join("public");
        if path1.is_dir() {
            public_dir = path1;
        } else {
            // Candidato 2: exe dentro de target/release/ ou server_rust/target/release/
            let mut current = exe_dir.to_path_buf();
            for _ in 0..4 {
                if let Some(parent) = current.parent() {
                    current = parent.to_path_buf();
                    let candidate = current.join("public");
                    if candidate.is_dir() {
                        public_dir = candidate;
                        break;
                    }
                } else {
                    break;
                }
            }
        }
    }
    info!(
        "📂 Servindo arquivos estáticos de: {:?}",
        public_dir.canonicalize().unwrap_or(public_dir.clone())
    );

    let canvas_dir = public_dir.parent().unwrap().join("canvas_frontend").join("public");

    // --- SERVIDOR HTTP SOBE PRIMEIRO (antes de conectar MIDI) ---
    let app = Router::new()
        .nest("/api", api::macros::router(global_state_api.clone(), custom_scene_manager.clone()))
        .nest_service("/canvas", tower_http::services::ServeDir::new(canvas_dir))
        .fallback_service(tower_http::services::ServeDir::new(public_dir.clone()))
        .layer(layer);

    let port = app_config.port;
    let listener = tokio::net::TcpListener::bind(format!("0.0.0.0:{}", port)).await?;

    info!(
        "🎧 Servidor estatico e WebSocket rodando em http://localhost:{}",
        port
    );

    tailscale_http::setup_tailscale_serve(port, global_state.clone(), io.clone());

    if app_config.open_browser_startup {
        let url = format!("http://localhost:{}", port);
        tokio::spawn(async move {
            tokio::time::sleep(std::time::Duration::from_secs(1)).await;
            let _ = std::process::Command::new("cmd")
                .args(["/C", "start", &url])
                .spawn();
        });
    }

    // --- INITIALIZE MIDI AND DMX ---
    boot::initialize_midi(&app_config, &conn_mgr, io.clone()).await;
    boot::initialize_dmx(&app_config);

    // --- START RECEIVE LOOP ---
    midi_receiver::start_rx_loop(
        midi_in_rx,
        io.clone(),
        global_state.clone(),
        sync_counter.clone(),
        conn_mgr.clone(),
        master_meter.clone(),
        custom_scene_manager.clone(),
        app_config.meter_fps_desktop,
        app_config.remote_midi,
    );

    axum::serve(listener, app)
        .with_graceful_shutdown(async move {
            let _ = shutdown_rx.recv().await;
            tracing::info!("🔁 Shutdown graceful recebido — liberando porta e reiniciando...");
        })
        .await?;

    // Shutdown: spawna novo processo e sai (porta ja liberada)
    let _ = std::process::Command::new(std::env::current_exe().unwrap()).spawn();
    std::process::exit(0);
}
