use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use rustfft::{num_complex::Complex, FftPlanner};
use socketioxide::SocketIo;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use tokio::sync::mpsc;

pub struct RtaManager {
    is_active: Arc<Mutex<bool>>,
    last_heartbeat: Arc<Mutex<Option<Instant>>>,
    stop_tx: Arc<Mutex<Option<tokio::sync::oneshot::Sender<()>>>>,
    current_device: Option<String>,
    current_is_output: bool,
    current_fft_size: usize,
    current_sample_rate: Arc<Mutex<u32>>,
}

impl RtaManager {
    pub fn new() -> Self {
        Self {
            is_active: Arc::new(Mutex::new(false)),
            last_heartbeat: Arc::new(Mutex::new(None)),
            stop_tx: Arc::new(Mutex::new(None)),
            current_device: None,
            current_is_output: false,
            current_fft_size: 4096,
            current_sample_rate: Arc::new(Mutex::new(48000)),
        }
    }

    pub fn receive_heartbeat(&self) {
        if *self.is_active.lock().unwrap() {
            *self.last_heartbeat.lock().unwrap() = Some(Instant::now());
        }
    }

    pub fn start(&mut self, io: SocketIo, device_name: Option<String>, is_output: bool, fft_size: usize) {
        // Sempre reinicia a stream para garantir a saúde da captura e nova task tokio.
        tracing::info!("🎤 [RTA] Solicitado start. Reiniciando stream para garantir saúde da captura.");
        self.stop();

        *self.is_active.lock().unwrap() = true;
        *self.last_heartbeat.lock().unwrap() = Some(Instant::now());
        self.current_device = device_name.clone();
        self.current_is_output = is_output;
        self.current_fft_size = fft_size;
        
        let is_active_clone = self.is_active.clone();
        let sample_rate_arc = self.current_sample_rate.clone();

        // Canal para o worker enviar os dados ao websocket
        let (tx, mut rx) = mpsc::channel::<Vec<f32>>(10);
        let (stop_tx, mut stop_rx) = tokio::sync::oneshot::channel::<()>();
        *self.stop_tx.lock().unwrap() = Some(stop_tx);

        let io_for_tokio = io.clone();
        
        // Task assíncrona para encaminhar dados ao socket
        tokio::spawn(async move {
            loop {
                tokio::select! {
                    Some(magnitudes) = rx.recv() => {
                        // tracing::info!("Enviando pacote RTA... tamanho: {}", magnitudes.len());
                        let res = io_for_tokio.emit("rtaData", &magnitudes).await;
                        if let Err(e) = res {
                            tracing::error!("Erro ao emitir rtaData: {:?}", e);
                        }
                    }
                    _ = &mut stop_rx => {
                        tracing::info!("Parando RTA loop.");
                        break;
                    }
                }
            }
        });

        // Watchdog: monitora heartbeats e para a captura se ficar 5s sem heartbeat
        let wd_is_active = self.is_active.clone();
        let wd_last_hb = self.last_heartbeat.clone();
        let wd_stop_tx = self.stop_tx.clone();
        let io_watchdog = io.clone();
        tokio::spawn(async move {
            loop {
                tokio::time::sleep(Duration::from_millis(1000)).await;
                if !*wd_is_active.lock().unwrap() {
                    break;
                }
                let now = Instant::now();
                let expired = {
                    let guard = wd_last_hb.lock().unwrap();
                    match *guard {
                        Some(t) => now.duration_since(t) >= Duration::from_secs(5),
                        None => {
                            tracing::warn!("🎤 [RTA] Watchdog: last_heartbeat é None (aguardando primeiro heartbeat)");
                            false
                        }
                    }
                };
                if expired {
                    tracing::info!("🎤 [RTA] Watchdog: sem heartbeat há 5s, parando captura.");
                    *wd_is_active.lock().unwrap() = false;
                    if let Some(tx) = wd_stop_tx.lock().unwrap().take() {
                        let _ = tx.send(());
                    }
                    let _ = io_watchdog.emit("rtaControl", &serde_json::json!({"status": "stopped"})).await;
                    break;
                }
            }
        });

        // Captura o Handle do tokio para spawnar futures da thread nativa
        let rt = tokio::runtime::Handle::current();

        // Thread nativa para Captura de Áudio (Core Isolado)
        std::thread::spawn(move || {
            let host = cpal::default_host();

            let device = if let Some(name) = &device_name {
                let mut found_device = None;
                if is_output {
                    if let Ok(devices) = host.output_devices() {
                        for d in devices {
                            if let Ok(d_name) = d.name() {
                                if &d_name == name {
                                    found_device = Some(d);
                                    break;
                                }
                            }
                        }
                    }
                } else {
                    if let Ok(devices) = host.input_devices() {
                        for d in devices {
                            if let Ok(d_name) = d.name() {
                                if &d_name == name {
                                    found_device = Some(d);
                                    break;
                                }
                            }
                        }
                    }
                }
                
                if found_device.is_none() {
                    tracing::error!("🎤 [RTA] Dispositivo especificado '{}' não encontrado.", name);
                    return;
                }
                found_device.unwrap()
            } else {
                match host.default_input_device() {
                    Some(d) => d,
                    None => {
                        tracing::error!("🎤 [RTA] Nenhum dispositivo de entrada default encontrado.");
                        return;
                    }
                }
            };

            let dev_name = device.name().unwrap_or_else(|_| "Desconhecido".to_string());
            tracing::info!("🎤 [RTA] Usando dispositivo de {}: '{}'", if is_output { "saída" } else { "entrada" }, dev_name);

            let config = if is_output {
                match device.default_output_config() {
                    Ok(c) => c,
                    Err(e) => {
                        tracing::error!("🎤 [RTA] Falha ao obter config de saída: {}", e);
                        return;
                    }
                }
            } else {
                match device.default_input_config() {
                    Ok(c) => c,
                    Err(e) => {
                        tracing::error!("🎤 [RTA] Falha ao obter config de entrada: {}", e);
                        return;
                    }
                }
            };

            tracing::info!(
                "🎤 [RTA] Iniciando captura de áudio. Sample Rate: {}",
                config.sample_rate().0
            );
            
            *sample_rate_arc.lock().unwrap() = config.sample_rate().0;

            // Envia a sample rate para o front-end sincronizar a tela
            let sr = config.sample_rate().0;
            let io_clone2 = io.clone();
            rt.spawn(async move {
                let _ = io_clone2.emit("rtaConfig", &serde_json::json!({ "sampleRate": sr })).await;
            });

            let err_fn = |err| tracing::error!("🎤 [RTA] Erro na stream: {}", err);
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
        *self.is_active.lock().unwrap() = false;
        *self.last_heartbeat.lock().unwrap() = None;
        self.current_device = None;
        if let Some(tx) = self.stop_tx.lock().unwrap().take() {
            let _ = tx.send(());
        }
    }
}
