use crate::config::AppConfig;
use midi_common::framing::{HEARTBEAT_TIMEOUT, is_heartbeat, read_frame, write_frame};
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;
use tokio::net::TcpStream;
use tokio::sync::{Mutex, mpsc};
use tokio::time::timeout;
use tracing::{error, info, warn};

pub struct RemoteClient {
    config: AppConfig,
    midi_in_tx: mpsc::Sender<Vec<u8>>,
    midi_out_tx: mpsc::Sender<Vec<u8>>,
    midi_out_rx: Arc<Mutex<mpsc::Receiver<Vec<u8>>>>,
    connected: Arc<AtomicBool>,
}

impl RemoteClient {
    pub fn new(config: AppConfig, midi_in_tx: mpsc::Sender<Vec<u8>>) -> Self {
        let (midi_out_tx, midi_out_rx) = mpsc::channel::<Vec<u8>>(4096);
        Self {
            config,
            midi_in_tx,
            midi_out_tx,
            midi_out_rx: Arc::new(Mutex::new(midi_out_rx)),
            connected: Arc::new(AtomicBool::new(false)),
        }
    }

    pub fn send(&self, data: &[u8]) {
        let _ = self.midi_out_tx.try_send(data.to_vec());
    }

    pub fn is_connected(&self) -> bool {
        self.connected.load(Ordering::SeqCst)
    }

    pub fn start(self: &Arc<Self>) {
        let this = self.clone();
        tokio::spawn(async move {
            loop {
                info!("🌐 Tentando conectar ao Remote MIDI Server...");
                match this.try_connect().await {
                    Ok(stream) => {
                        info!("🌐 Conectado ao Remote MIDI Server!");
                        this.connected.store(true, Ordering::SeqCst);
                        this.run_bridge(stream).await;
                        this.connected.store(false, Ordering::SeqCst);
                        warn!(
                            "🌐 Conexão com o Remote MIDI Server perdida. Tentando reconectar em 2s..."
                        );
                    }
                    Err(e) => {
                        error!(
                            "❌ Falha ao conectar ao Remote MIDI Server: {}. Nova tentativa em 2s...",
                            e
                        );
                    }
                }
                tokio::time::sleep(Duration::from_secs(2)).await;
            }
        });
    }

    async fn try_connect(&self) -> Result<TcpStream, String> {
        let port = self.config.remote_midi_port;

        // 1. Tenta o último host conhecido
        let last_host = self.config.remote_midi_last_host.clone();
        if !last_host.is_empty() {
            let addr = format!("{}:{}", last_host, port);
            info!("🌐 Tentando último host conhecido: {}", addr);
            if let Ok(Ok(stream)) = timeout(Duration::from_secs(3), TcpStream::connect(&addr)).await
            {
                return Ok(stream);
            }
            warn!("🌐 Último host conhecido ({}) falhou.", addr);
        }

        // 2. Tenta a lista de redes configuradas
        for host in &self.config.remote_midi_networks {
            let addr = format!("{}:{}", host, port);
            info!("🌐 Tentando host da lista: {}", addr);
            if let Ok(Ok(stream)) = timeout(Duration::from_secs(3), TcpStream::connect(&addr)).await
            {
                // Atualiza e salva como último host de sucesso
                let mut cfg = AppConfig::load();
                cfg.save_last_remote_host(host);
                return Ok(stream);
            }
        }

        // 3. Fallback para localhost caso a lista esteja vazia
        if self.config.remote_midi_networks.is_empty() && last_host.is_empty() {
            let addr = format!("127.0.0.1:{}", port);
            info!("🌐 Lista de redes vazia. Tentando localhost: {}", addr);
            if let Ok(Ok(stream)) = timeout(Duration::from_secs(3), TcpStream::connect(&addr)).await
            {
                return Ok(stream);
            }
        }

        Err("Nenhum host disponível ou respondendo.".to_string())
    }

    async fn run_bridge(&self, stream: TcpStream) {
        let (mut rx, mut tx) = stream.into_split();

        // Task 1: Enviar MIDI do Server para a Mesa Remota
        let midi_out_rx_clone = self.midi_out_rx.clone();
        let tx_task = tokio::spawn(async move {
            let mut rx_guard = midi_out_rx_clone.lock().await;
            while let Some(data) = rx_guard.recv().await {
                if let Err(e) = write_frame(&mut tx, &data).await {
                    error!("❌ Erro ao enviar frame MIDI via TCP: {}", e);
                    break;
                }
            }
            let _ = tokio::io::AsyncWriteExt::shutdown(&mut tx).await;
        });

        // Task 2: Receber MIDI da Mesa Remota (com Timeout de Heartbeat)
        let midi_in_tx_clone = self.midi_in_tx.clone();
        let rx_task = tokio::spawn(async move {
            loop {
                // Se ficarmos 10 segundos sem receber frames, assumimos que a conexão caiu
                match timeout(HEARTBEAT_TIMEOUT, read_frame(&mut rx)).await {
                    Ok(Ok(data)) => {
                        if is_heartbeat(&data) {
                            // Ignora heartbeat
                            continue;
                        }
                        if let Err(e) = midi_in_tx_clone.send(data).await {
                            error!("❌ Erro ao repassar MIDI recebido internamente: {}", e);
                            break;
                        }
                    }
                    Ok(Err(e)) => {
                        error!("❌ Erro ao ler frame TCP: {}", e);
                        break;
                    }
                    Err(_) => {
                        warn!("⚠️ Timeout de Heartbeat excedido (10s sem dados).");
                        break;
                    }
                }
            }
        });

        // Espera qualquer uma das tasks falhar
        tokio::select! {
            _ = tx_task => {}
            _ = rx_task => {}
        }
    }
}
