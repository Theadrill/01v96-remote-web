use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use socketioxide::SocketIo;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use tokio::sync::mpsc;

#[derive(Debug, Clone, Copy, PartialEq)]
pub enum MonitoringFormat {
    Pcm,
    Opus,
}

impl MonitoringFormat {
    pub fn as_str(&self) -> &'static str {
        match self {
            MonitoringFormat::Pcm => "pcm",
            MonitoringFormat::Opus => "opus",
        }
    }

    pub fn from_str(s: &str) -> Self {
        match s {
            "opus" => MonitoringFormat::Opus,
            _ => MonitoringFormat::Pcm,
        }
    }
}

#[derive(Debug, Clone)]
pub struct MonitoringConfig {
    pub buffer_size: usize,
    pub format: MonitoringFormat,
}

pub enum MonitoringMessage {
    Pcm(Vec<f32>),
    Opus(Vec<u8>),
    Stop,
}

pub struct Inner {
    pub active: bool,
    pub config: Option<MonitoringConfig>,
    pub tx: Option<mpsc::Sender<MonitoringMessage>>,
    pub buffer: Vec<f32>,
    pub last_heartbeat: Option<Instant>,
    pub stop_tx: Option<tokio::sync::oneshot::Sender<()>>,
    pub opus_encoder: Option<opus_rs::OpusEncoder>,
    pub sample_rate: u32,
}

pub struct MonitoringManager {
    inner: Arc<Mutex<Inner>>,
}

impl MonitoringManager {
    pub fn new() -> Self {
        Self {
            inner: Arc::new(Mutex::new(Inner {
                active: false,
                config: None,
                tx: None,
                buffer: Vec::new(),
                last_heartbeat: None,
                stop_tx: None,
                opus_encoder: None,
                sample_rate: 48000,
            })),
        }
    }

    pub fn inner_arc(&self) -> Arc<Mutex<Inner>> {
        self.inner.clone()
    }

    pub fn is_active(&self) -> bool {
        self.inner.lock().unwrap().active
    }

    pub fn receive_heartbeat(&self) {
        let mut inner = self.inner.lock().unwrap();
        if inner.active {
            inner.last_heartbeat = Some(Instant::now());
        }
    }

    pub fn attach(&self, format: MonitoringFormat, buffer_size: usize, io: SocketIo) {
        self.stop_inner();

        let (mon_tx, mon_rx) = mpsc::channel::<MonitoringMessage>(256);
        let (stop_fwd_tx, stop_fwd_rx) = tokio::sync::oneshot::channel::<()>();

        {
            let mut inner = self.inner.lock().unwrap();
            inner.active = true;
            inner.last_heartbeat = Some(Instant::now());
            inner.tx = Some(mon_tx);
            inner.config = Some(MonitoringConfig { buffer_size, format });

            if format == MonitoringFormat::Opus {
                if let Ok(encoder) = opus_rs::OpusEncoder::new(inner.sample_rate as i32, 1, opus_rs::Application::Audio) {
                    inner.opus_encoder = Some(encoder);
                }
            }

            inner.buffer.clear();
            inner.stop_tx = Some(stop_fwd_tx);
        }

        let io_fwd = io.clone();
        let io_fwd2 = io.clone();
        tokio::spawn(async move {
            let mut stop_fwd_rx = stop_fwd_rx;
            let mut mon_rx = mon_rx;
            loop {
                tokio::select! {
                    Some(msg) = mon_rx.recv() => {
                        match msg {
                            MonitoringMessage::Pcm(data) => {
                                let _ = io_fwd.emit("rtaAudio", &serde_json::json!({"label": "pcm", "data": data})).await;
                            }
                            MonitoringMessage::Opus(data) => {
                                tracing::info!("[MONITORING] Fwd opus {} bytes", data.len());
                                let _ = io_fwd.emit("rtaAudio", &serde_json::json!({"label": "opus", "data": data})).await;
                            }
                            MonitoringMessage::Stop => {
                                break;
                            }
                        }
                    }
                    _ = &mut stop_fwd_rx => {
                        break;
                    }
                }
            }
        });

        let inner_wd = self.inner.clone();
        let io_wd = io.clone();
        tokio::spawn(async move {
            loop {
                tokio::time::sleep(Duration::from_millis(1000)).await;
                let expired = {
                    let inner = inner_wd.lock().unwrap();
                    if !inner.active {
                        return;
                    }
                    match inner.last_heartbeat {
                        Some(t) => Instant::now().duration_since(t) >= Duration::from_secs(5),
                        None => false,
                    }
                };
                if expired {
                    tracing::info!("[MONITORING] Watchdog: no heartbeat for 5s, stopping.");
                    {
                        let mut inner = inner_wd.lock().unwrap();
                        inner.active = false;
                        if let Some(tx) = inner.stop_tx.take() {
                            let _ = tx.send(());
                        }
                    }
                    let _ = io_wd.emit("rtaAudioControl", &serde_json::json!({"status": "stopped"})).await;
                    break;
                }
            }
        });
    }

    fn stop_inner(&self) {
        let mut inner = self.inner.lock().unwrap();
        inner.active = false;
        inner.last_heartbeat = None;
        inner.config = None;
        inner.opus_encoder = None;
        if let Some(tx) = inner.stop_tx.take() {
            let _ = tx.send(());
        }
        if let Some(tx) = inner.tx.take() {
            let _ = tx.try_send(MonitoringMessage::Stop);
        }
        inner.buffer.clear();
    }

    pub fn stop(&self) {
        self.stop_inner();
    }

    pub fn reconfigure(&self, format: MonitoringFormat, buffer_size: usize) {
        let mut inner = self.inner.lock().unwrap();
        inner.config = Some(MonitoringConfig { buffer_size, format });

        if format == MonitoringFormat::Opus {
            if let Ok(encoder) = opus_rs::OpusEncoder::new(inner.sample_rate as i32, 1, opus_rs::Application::Audio) {
                inner.opus_encoder = Some(encoder);
            }
        } else {
            inner.opus_encoder = None;
        }
        inner.buffer.clear();
    }

    pub fn start_standalone(&self, device_name: Option<String>, format: MonitoringFormat, buffer_size: usize, io: SocketIo) {
        self.stop_inner();

        let (mon_tx, mon_rx) = mpsc::channel::<MonitoringMessage>(256);
        let (stop_fwd_tx, stop_fwd_rx) = tokio::sync::oneshot::channel::<()>();

        {
            let mut inner = self.inner.lock().unwrap();
            inner.active = true;
            inner.last_heartbeat = Some(Instant::now());
            inner.tx = Some(mon_tx);
            inner.config = Some(MonitoringConfig { buffer_size, format });
            inner.buffer.clear();

            if format == MonitoringFormat::Opus {
                if let Ok(encoder) = opus_rs::OpusEncoder::new(48000i32, 1, opus_rs::Application::Audio) {
                    inner.opus_encoder = Some(encoder);
                }
            }

            inner.stop_tx = Some(stop_fwd_tx);
        }

        let io_fwd = io.clone();
        tokio::spawn(async move {
            let mut stop_fwd_rx = stop_fwd_rx;
            let mut mon_rx = mon_rx;
            loop {
                tokio::select! {
                    Some(msg) = mon_rx.recv() => {
                        match msg {
                            MonitoringMessage::Pcm(data) => {
                                let _ = io_fwd.emit("rtaAudio", &serde_json::json!({"label": "pcm", "data": data})).await;
                            }
                            MonitoringMessage::Opus(data) => {
                                tracing::info!("[MONITORING] Fwd opus {} bytes (standalone)", data.len());
                                let _ = io_fwd.emit("rtaAudio", &serde_json::json!({"label": "opus", "data": data})).await;
                            }
                            MonitoringMessage::Stop => {
                                break;
                            }
                        }
                    }
                    _ = &mut stop_fwd_rx => {
                        break;
                    }
                }
            }
        });

        let inner_wd = self.inner.clone();
        let io_wd = io.clone();
        tokio::spawn(async move {
            loop {
                tokio::time::sleep(Duration::from_millis(1000)).await;
                let expired = {
                    let inner = inner_wd.lock().unwrap();
                    if !inner.active {
                        return;
                    }
                    match inner.last_heartbeat {
                        Some(t) => Instant::now().duration_since(t) >= Duration::from_secs(5),
                        None => false,
                    }
                };
                if expired {
                    tracing::info!("[MONITORING] Watchdog: no heartbeat for 5s, stopping.");
                    {
                        let mut inner = inner_wd.lock().unwrap();
                        inner.active = false;
                        if let Some(tx) = inner.stop_tx.take() {
                            let _ = tx.send(());
                        }
                    }
                    let _ = io_wd.emit("rtaAudioControl", &serde_json::json!({"status": "stopped"})).await;
                    break;
                }
            }
        });

        // Native thread for cpal capture (separate device)
        let mon_inner = self.inner.clone();
        std::thread::spawn(move || {
            let host = cpal::default_host();
            let device = if let Some(name) = &device_name {
                let mut found = None;
                if let Ok(devices) = host.input_devices() {
                    for d in devices {
                        if let Ok(d_name) = d.name() {
                            if &d_name == name {
                                found = Some(d);
                                break;
                            }
                        }
                    }
                }
                match found {
                    Some(d) => d,
                    None => {
                        tracing::error!("[MONITORING] Device '{}' not found.", name);
                        return;
                    }
                }
            } else {
                match host.default_input_device() {
                    Some(d) => d,
                    None => {
                        tracing::error!("[MONITORING] No default input device.");
                        return;
                    }
                }
            };

            let dev_name = device.name().unwrap_or_else(|_| "Unknown".to_string());
            tracing::info!("[MONITORING] Using device: {}", dev_name);

            let config = match device.default_input_config() {
                Ok(c) => c,
                Err(e) => {
                    tracing::error!("[MONITORING] Failed to get config: {}", e);
                    return;
                }
            };

            let sr = config.sample_rate().0;
            tracing::info!("[MONITORING] Sample rate: {}", sr);

            // Update sample rate and recreate Opus encoder if needed
            {
                let mut inner = mon_inner.lock().unwrap();
                inner.sample_rate = sr;
                let needs_opus = inner.config.as_ref().map(|c| c.format == MonitoringFormat::Opus).unwrap_or(false);
                if needs_opus {
                    if let Ok(encoder) = opus_rs::OpusEncoder::new(sr as i32, 1, opus_rs::Application::Audio) {
                        inner.opus_encoder = Some(encoder);
                    }
                }
            }

            let channels = config.channels() as usize;
            let err_fn = |err| tracing::error!("[MONITORING] Stream error: {}", err);

            let stream_result = match config.sample_format() {
                cpal::SampleFormat::F32 => {
                    let inner_cb = mon_inner.clone();
                    device.build_input_stream(
                        &config.into(),
                        move |data: &[f32], _: &cpal::InputCallbackInfo| {
                            let mut inner = match inner_cb.lock() {
                                Ok(g) => g,
                                Err(_) => return,
                            };
                            if !inner.active {
                                return;
                            }
                            let cfg = match inner.config.clone() {
                                Some(c) => c,
                                None => return,
                            };
                            let mono_data: Vec<f32> = data.chunks(channels).map(|c| c[0]).collect();
                            inner.buffer.extend_from_slice(&mono_data);
                            while inner.buffer.len() >= cfg.buffer_size {
                                let chunk: Vec<f32> = inner.buffer.drain(..cfg.buffer_size).collect();
                                let tx_opt = inner.tx.clone();
                                if let Some(tx) = tx_opt {
                                    match cfg.format {
                                        MonitoringFormat::Pcm => {
                                            let _ = tx.try_send(MonitoringMessage::Pcm(chunk));
                                        }
                                        MonitoringFormat::Opus => {
                                            let mut opus_out = vec![0u8; 1500];
                                            if let Some(ref mut encoder) = inner.opus_encoder {
                                                let frame_size = chunk.len();
                                                match encoder.encode(&chunk, frame_size, &mut opus_out) {
                                                    Ok(n) => {
                                                        tracing::info!("[MONITORING] Opus encoded {} frames -> {} bytes", frame_size, n);
                                                        opus_out.truncate(n);
                                                        let _ = tx.try_send(MonitoringMessage::Opus(opus_out));
                                                    }
                                                    Err(e) => tracing::error!("[MONITORING] Opus encode error: {}", e),
                                                }
                                            } else {
                                                tracing::warn!("[MONITORING] Opus format but no encoder");
                                            }
                                        }
                                    }
                                }
                            }
                        },
                        err_fn,
                        None,
                    )
                }
                _ => {
                    tracing::error!("[MONITORING] Unsupported sample format");
                    return;
                }
            };

            let stream = match stream_result {
                Ok(s) => s,
                Err(e) => {
                    tracing::error!("[MONITORING] Failed to create stream: {}", e);
                    return;
                }
            };
            if let Err(e) = stream.play() {
                tracing::error!("[MONITORING] Failed to play stream: {}", e);
            }

            loop {
                let active = mon_inner.lock().map(|g| g.active).unwrap_or(false);
                if !active {
                    break;
                }
                std::thread::sleep(std::time::Duration::from_millis(100));
            }

            tracing::info!("[MONITORING] Capture ended.");
        });
    }
}
