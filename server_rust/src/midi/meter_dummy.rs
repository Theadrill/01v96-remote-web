use rand::RngExt;
use socketioxide::SocketIo;
use std::time::Duration;
use tokio::time::interval;
use tracing::info;

pub fn start_meter_simulation(io: SocketIo) -> tokio::task::JoinHandle<()> {
    info!("🚀 [DEMO] Simulacao de Meters iniciada (32ch + Master @ 30fps)");

    tokio::spawn(async move {
        let (phases, phases2, speeds) = {
            let mut rng = rand::rng();
            let p1: Vec<f64> = (0..32)
                .map(|_| rng.random_range(0.0..std::f64::consts::PI * 2.0))
                .collect();
            let p2: Vec<f64> = (0..32)
                .map(|_| rng.random_range(0.0..std::f64::consts::PI * 2.0))
                .collect();
            let sp: Vec<f64> = (0..32).map(|_| 0.8 + rng.random_range(0.0..4.0)).collect();
            (p1, p2, sp)
        };

        let bases = [
            26.0, 24.0, 22.0, 23.0, 25.0, 23.0, 21.0, 20.0, 26.0, 24.0, 19.0, 18.0, 20.0, 21.0,
            17.0, 18.0, 22.0, 19.0, 20.0, 18.0, 18.0, 20.0, 17.0, 21.0, 22.0, 19.0, 20.0, 18.0,
            16.0, 21.0, 19.0, 17.0,
        ];

        let mut t: f64 = 0.0;
        let mut energy: f64 = 0.9;
        let mut energy_target: f64 = 0.9;
        let mut ticker = interval(Duration::from_millis(33));
        let mut last_emit_time = std::time::Instant::now();
        let mut meter_buffer: Vec<f64> = vec![0.0; 64];

        loop {
            ticker.tick().await;
            t += 0.15;

            {
                let mut rng = rand::rng();
                if rng.random::<f64>() < 0.008 {
                    energy_target = 0.7 + rng.random_range(0.0..0.3);
                }
                energy += (energy_target - energy) * 0.03;

                for i in 0..32 {
                    let s = speeds[i];
                    let w1 = (t * s + phases[i]).sin();
                    let w2 = (t * s * 2.3 + phases2[i]).sin() * 0.35;
                    let w3 = (t * s * 0.4 + phases[i] * 0.7).sin() * 0.25;
                    let noise = (rng.random::<f64>() - 0.5) * 3.0;
                    let level = (bases[i] * energy) + ((w1 + w2 + w3) * 9.0 * energy) + noise;
                    meter_buffer[i] = (level.min(31.0).max(0.0)).round();
                }

                let mw = (t * 0.9).sin() * 2.5 + (t * 1.7).sin() * 2.0;
                let master_level = (26.0 * energy + mw + (rng.random::<f64>() - 0.5) * 2.0)
                    .min(31.0)
                    .max(0.0);
                meter_buffer[32] = master_level.round();
            }

            let now = std::time::Instant::now();
            if now.duration_since(last_emit_time).as_millis() >= 30 {
                if let Err(e) = io.emit("meterData", &meter_buffer[..33]).await {
                    tracing::error!("Erro ao emitir meterData: {:?}", e);
                }
                last_emit_time = now;
            }
        }
    })
}
