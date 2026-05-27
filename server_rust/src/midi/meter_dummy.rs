use rand::RngExt;
use std::time::Duration;
use tokio::time::interval;

pub async fn start_meter_simulation<F>(mut callback: F)
where
    F: FnMut(Vec<u8>) + Send + 'static,
{
    println!("Ys? [DEMO] Simulaǜo de Meters Iniciada (Stress Mode - 32ch + Master @ 30fps)");

    let mut rng = rand::rng();
    let phases: Vec<f64> = (0..32)
        .map(|_| rng.random_range(0.0..std::f64::consts::PI * 2.0))
        .collect();
    let phases2: Vec<f64> = (0..32)
        .map(|_| rng.random_range(0.0..std::f64::consts::PI * 2.0))
        .collect();
    let speeds: Vec<f64> = (0..32).map(|_| 0.8 + rng.random_range(0.0..4.0)).collect();

    let bases = [
        26.0, 24.0, 22.0, 23.0, 25.0, 23.0, 21.0, 20.0, 26.0, 24.0, 19.0, 18.0, 20.0, 21.0, 17.0,
        18.0, 22.0, 19.0, 20.0, 18.0, 18.0, 20.0, 17.0, 21.0, 22.0, 19.0, 20.0, 18.0, 16.0, 21.0,
        19.0, 17.0,
    ];

    let mut t: f64 = 0.0;
    let mut energy: f64 = 0.9;
    let mut energy_target: f64 = 0.9;

    let mut ticker = interval(Duration::from_millis(33));

    tokio::spawn(async move {
        loop {
            ticker.tick().await;
            t += 0.15;

            let mut rng = rand::rng();
            if rng.random::<f64>() < 0.008 {
                energy_target = 0.7 + rng.random_range(0.0..0.3);
            }
            energy += (energy_target - energy) * 0.03;

            let mut sysex: Vec<u8> = vec![0xF0, 0x43, 0x10, 0x3E, 13, 33, 0, 0, 0];
            for i in 0..32 {
                let s = speeds[i];
                let w1 = (t * s + phases[i]).sin();
                let w2 = (t * s * 2.3 + phases2[i]).sin() * 0.35;
                let w3 = (t * s * 0.4 + phases[i] * 0.7).sin() * 0.25;
                let noise = (rng.random::<f64>() - 0.5) * 3.0;

                let level = (bases[i] * energy) + ((w1 + w2 + w3) * 9.0 * energy) + noise;
                let clamped = level.min(31.0).max(0.0) as u8;

                sysex.push(clamped);
                sysex.push(0x7F);
            }
            sysex.push(0xF7);
            callback(sysex);

            let mw = (t * 0.9).sin() * 2.5 + (t * 1.7).sin() * 2.0;
            let master_level = (26.0 * energy + mw + (rng.random::<f64>() - 0.5) * 2.0)
                .min(31.0)
                .max(0.0) as f64;
            let raw_m = ((master_level * 3.96875 / 0.031170805879371516) + 37.0) as u16;
            let high_m = ((raw_m >> 7) & 0x7F) as u8;
            let low_m = (raw_m & 0x7F) as u8;

            let master_sysex: Vec<u8> = vec![
                0xF0, 0x43, 0x10, 0x3E, 13, 33, 4, 0, 0, high_m, low_m, high_m, low_m, 0xF7,
            ];
            callback(master_sysex);
        }
    });
}
