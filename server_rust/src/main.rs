mod config;
mod midi;


use axum::Router;
use socketioxide::SocketIo;
use tower_http::services::ServeDir;
use tracing::info;
use tracing_subscriber::FmtSubscriber;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    // Configura o sistema de log
    let subscriber = FmtSubscriber::builder()
        .with_max_level(tracing::Level::INFO)
        .finish();
    tracing::subscriber::set_global_default(subscriber)?;

    info!("🚀 Iniciando servidor Rust (Fase 2)");

    // Carrega configurações dinâmicas
    let app_config = config::AppConfig::load();
    info!("⚙️  Configurações carregadas: MIDI In: {}, MIDI Out: {}", app_config.in_idx, app_config.out_idx);
    // Inicializa a camada do Socket.IO
    let (layer, io) = SocketIo::new_layer();

    // Configura os handlers básicos (apenas mock para a Fase 1)
    io.ns("/", |socket: socketioxide::extract::SocketRef| async move {
        info!("🔌 Cliente conectado (Socket.IO): {}", socket.id);
        
        socket.on("requestConnect", |socket: socketioxide::extract::SocketRef, _data: socketioxide::extract::Data<serde_json::Value>| async move {
            info!("Solicitação de conexão MIDI recebida!");
            // socket.emit("connectResult", ...); // Será implementado na Fase 4
        });
    });

    // Cria a rota Axum que serve os arquivos estáticos de `../public`
    // e inclui a camada do Socket.IO
    let app = Router::new()
        .fallback_service(ServeDir::new("../public"))
        .layer(layer);

    // TODO: Ler config.json para pegar a porta, mas para teste vamos usar 3001
    // (O NodeJS original deve estar na 3000)
    let port = 3001;
    let listener = tokio::net::TcpListener::bind(format!("0.0.0.0:{}", port)).await?;
    
    info!("✅ Servidor estático e WebSocket rodando em http://localhost:{}", port);

    axum::serve(listener, app).await?;

    Ok(())
}
