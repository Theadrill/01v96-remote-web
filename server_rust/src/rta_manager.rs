use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use rustfft::{num_complex::Complex, FftPlanner};
use socketioxide::extract::SocketRef;
use std::sync::{Arc, Mutex};
use tokio::sync::mpsc;

pub struct RtaManager {
    is_active: Arc<Mutex<bool>>,
    stop_tx: Option<tokio::sync::oneshot::Sender<()>>,
}

impl RtaManager {
    pub fn new() -> Self {
        Self {
            is_active: Arc::new(Mutex::new(false)),
            stop_tx: None,
        }
    }

    pub fn start(&mut self, socket: SocketRef) {
        // Se a thread está viva de uma sessão passada/recarregada, mata ela para o novo Socket e SampleRate serem injetados.
        self.stop();

        *self.is_active.lock().unwrap() = true;
        let is_active_clone = self.is_active.clone();

        // Canal para o worker enviar os dados ao websocket
        let (tx, mut rx) = mpsc::channel::<Vec<f32>>(10);
        let (stop_tx, mut stop_rx) = tokio::sync::oneshot::channel::<()>();
        self.stop_tx = Some(stop_tx);

        let socket_for_tokio = socket.clone();
        
        // Task assíncrona para encaminhar dados ao socket
        tokio::spawn(async move {
            loop {
                tokio::select! {
                    Some(magnitudes) = rx.recv() => {
                        let _ = socket_for_tokio.emit("rtaData", &magnitudes);
                    }
                    _ = &mut stop_rx => {
                        break;
                    }
                }
            }
        });

        // Thread nativa para Captura de Áudio (Core Isolado)
        std::thread::spawn(move || {
            let host = cpal::default_host();
            
            // Log de todos os devices (DEBUG)
            if let Ok(devices) = host.input_devices() {
                let mut found_any = false;
                tracing::info!("--- Dispositivos de Gravação Disponíveis no SO ---");
                for d in devices {
                    if let Ok(name) = d.name() {
                        tracing::info!("   -> {}", name);
                        found_any = true;
                    }
                }
                if !found_any {
                    tracing::info!("   (Nenhum dispositivo encontrado na lista)");
                }
                tracing::info!("--------------------------------------------------");
            }

            let device = match host.default_input_device() {
                Some(d) => d,
                None => {
                    tracing::error!("🎤 [RTA] Nenhum dispositivo de entrada default encontrado.");
                    return;
                }
            };

            let dev_name = device.name().unwrap_or_else(|_| "Desconhecido".to_string());
            tracing::info!("🎤 [RTA] O Windows selecionou o dispositivo default: '{}'", dev_name);

            let config = match device.default_input_config() {
                Ok(c) => c,
                Err(e) => {
                    tracing::error!("🎤 [RTA] Falha ao obter config padrão: {}", e);
                    return;
                }
            };

            tracing::info!(
                "🎤 [RTA] Iniciando captura de áudio. Sample Rate: {}",
                config.sample_rate().0
            );
            
            // Envia a sample rate para o front-end sincronizar a tela
            let _ = socket.emit("rtaConfig", &serde_json::json!({ "sampleRate": config.sample_rate().0 }));

            let err_fn = |err| tracing::error!("🎤 [RTA] Erro na stream: {}", err);
            let fft_size = 4096;
            let mut planner = FftPlanner::new();
            let fft = planner.plan_fft_forward(fft_size);
            let buffer = Arc::new(Mutex::new(Vec::new()));
            let buffer_clone = buffer.clone();
            let is_active_stream = is_active_clone.clone();
            let channels = config.channels() as usize;
            
            let stream_result = match config.sample_format() {
                cpal::SampleFormat::F32 => device.build_input_stream(
                    &config.into(),
                    move |data: &[f32], _: &cpal::InputCallbackInfo| {
                        if let Ok(mut buffer) = buffer_clone.lock() {
                            if !*is_active_stream.lock().unwrap() {
                                return;
                            }
                            // Ignorar os canais extras (Right, Surround) extraindo apenas a amostra Left (Index 0)
                            let mono_data: Vec<f32> = data.chunks(channels).map(|c| c[0]).collect();
                            buffer.extend_from_slice(&mono_data);

                            // Processa janelas do tamanho exato da FFT
                            while buffer.len() >= fft_size {
                                let mut fft_buffer: Vec<Complex<f32>> = buffer
                                    .drain(0..fft_size)
                                    .enumerate()
                                    .map(|(i, v)| {
                                        // Hanning Window para mitigar Spectral Leakage
                                        let window = 0.5 * (1.0 - (2.0 * std::f32::consts::PI * i as f32 / (fft_size as f32 - 1.0)).cos());
                                        Complex { re: v * window, im: 0.0 }
                                    })
                                    .collect();

                                fft.process(&mut fft_buffer);

                            // Pega as primeiras metades das bandas (Nyquist)
                            let magnitudes: Vec<f32> = fft_buffer
                                .iter()
                                .take(fft_size / 2)
                                .map(|c| c.norm())
                                .collect();

                            // Envia pelo canal pro tokio sem bloquear a stream
                            let _ = tx.try_send(magnitudes);
                        }
                    }
                    },
                    err_fn,
                    None,
                ),
                _ => {
                    tracing::error!("🎤 [RTA] Formato de sample não suportado");
                    return;
                }
            };

            let stream = match stream_result {
                Ok(s) => s,
                Err(e) => {
                    tracing::error!("🎤 [RTA] Falha ao iniciar stream: {}", e);
                    return;
                }
            };

            if let Err(e) = stream.play() {
                tracing::error!("🎤 [RTA] Erro ao dar play na stream: {}", e);
            }

            // Segura a thread viva enquanto o RTA está ativo
            while *is_active_clone.lock().unwrap() {
                std::thread::sleep(std::time::Duration::from_millis(100));
            }

            tracing::info!("🎤 [RTA] Captura encerrada.");
            // `stream` sai de escopo e é destruída
        });
    }

    pub fn stop(&mut self) {
        let mut active = self.is_active.lock().unwrap();
        *active = false;
        if let Some(tx) = self.stop_tx.take() {
            let _ = tx.send(());
        }
    }
}
