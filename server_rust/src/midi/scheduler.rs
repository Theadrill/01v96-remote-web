use std::sync::Arc;
use std::time::Duration;
use tokio::sync::{Mutex, mpsc};
use tracing::{error, info};

pub struct SchedulerState {
    pub q0: Vec<Vec<u8>>,
    pub q1: Vec<Vec<u8>>,
    pub q2: Vec<Vec<u8>>,
    pub is_running: bool,
    pub total_processed: usize,
    pub tick_ms: u64,
}

impl SchedulerState {
    pub fn new(tick_ms: u64) -> Self {
        Self {
            q0: Vec::new(),
            q1: Vec::new(),
            q2: Vec::new(),
            is_running: false,
            total_processed: 0,
            tick_ms,
        }
    }
}

pub struct MidiScheduler {
    pub state: Arc<Mutex<SchedulerState>>,
    midi_out_tx: mpsc::Sender<Vec<u8>>,
    // Quando Q1 esvazia, envia um sinal (usado para calibração de motorização)
    q1_empty_tx: Option<mpsc::Sender<()>>,
}

impl MidiScheduler {
    pub fn new(tick_ms: u64, midi_out_tx: mpsc::Sender<Vec<u8>>) -> Self {
        Self {
            state: Arc::new(Mutex::new(SchedulerState::new(tick_ms))),
            midi_out_tx,
            q1_empty_tx: None,
        }
    }

    pub fn set_q1_empty_callback(&mut self, tx: mpsc::Sender<()>) {
        self.q1_empty_tx = Some(tx);
    }

    pub async fn enqueue(&self, bytes: Vec<u8>, priority: u8) -> bool {
        if bytes.is_empty() {
            return false;
        }

        let mut state = self.state.lock().await;
        match priority {
            0 => {
                if let Some(addr) = Self::extract_address(&bytes) {
                    if let Some(idx) = state.q0.iter().position(|item| Self::extract_address(item) == Some(addr.clone())) {
                        state.q0[idx] = bytes;
                        return true;
                    }
                }
                state.q0.push(bytes);
                true
            }
            1 => {
                state.q1.push(bytes);
                true
            }
            2 => {
                if !state.q0.is_empty() || !state.q1.is_empty() {
                    return false;
                }
                state.q2.push(bytes);
                true
            }
            _ => false,
        }
    }

    fn extract_address(bytes: &[u8]) -> Option<String> {
        if bytes.len() >= 6 && bytes[0] == 0xF0 && bytes[1] == 0x43 {
            let sub_status = bytes[2] & 0xF0;
            let dev = bytes[3] & 0x0F;

            // Parameter Change (0x10) e Parameter Request (0x30)
            if (sub_status == 0x10 || sub_status == 0x30) && bytes.len() >= 9 {
                let addr = &bytes[4..9];
                return Some(format!("P-{}-{:?}", dev, addr));
            }

            // Fallback para outros tipos de SysEx
            let addr = &bytes[4..7];
            return Some(format!("O-{}-{:?}", dev, addr));
        }
        None
    }

    pub async fn start(&self) {
        let mut state_lock = self.state.lock().await;
        if state_lock.is_running {
            return;
        }
        state_lock.is_running = true;
        let tick_ms = state_lock.tick_ms;
        drop(state_lock);

        let state_clone = Arc::clone(&self.state);
        let midi_out_tx = self.midi_out_tx.clone();
        let q1_empty_tx = self.q1_empty_tx.clone();

        tokio::spawn(async move {
            let mut interval = tokio::time::interval(Duration::from_millis(tick_ms));
            let mut q1_was_processing = false;

            loop {
                interval.tick().await;

                let mut state = state_clone.lock().await;
                if !state.is_running {
                    break;
                }

                let mut packet = None;

                if !state.q0.is_empty() {
                    packet = Some(state.q0.remove(0));
                } else if !state.q1.is_empty() {
                    packet = Some(state.q1.remove(0));
                    q1_was_processing = true;
                } else if !state.q2.is_empty() {
                    packet = Some(state.q2.remove(0));
                }

                if let Some(p) = packet {
                    if let Err(e) = midi_out_tx.send(p).await {
                        error!("MidiScheduler send error: {:?}", e);
                    }
                    state.total_processed += 1;
                } else if q1_was_processing {
                    if let Some(ref tx) = q1_empty_tx {
                        let _ = tx.send(()).await;
                    }
                    q1_was_processing = false;
                }
            }
        });
    }

    pub async fn stop(&self) {
        let mut state = self.state.lock().await;
        state.is_running = false;
    }

    pub async fn clear(&self, priority: Option<u8>) {
        let mut state = self.state.lock().await;
        match priority {
            Some(0) => state.q0.clear(),
            Some(1) => state.q1.clear(),
            Some(2) => state.q2.clear(),
            _ => {
                state.q0.clear();
                state.q1.clear();
                state.q2.clear();
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_scheduler_priority() {
        let (tx, mut rx) = mpsc::channel(10);
        let scheduler = MidiScheduler::new(10, tx);

        // Fill Q2, Q1, Q0
        scheduler.enqueue(vec![0x02], 2).await;
        scheduler.enqueue(vec![0x01], 1).await;
        
        // Mock a P0 message that can be deduplicated: F0 43 10 3E 01 02 03 04 05 F7
        let p0_msg = vec![0xF0, 0x43, 0x10, 0x3E, 0x01, 0x02, 0x03, 0x04, 0x05, 0xF7];
        scheduler.enqueue(p0_msg.clone(), 0).await;
        
        // Start processing
        scheduler.start().await;
        
        // Expected order: Q0, Q1, Q2
        assert_eq!(rx.recv().await.unwrap(), p0_msg);
        assert_eq!(rx.recv().await.unwrap(), vec![0x01]);
        assert_eq!(rx.recv().await.unwrap(), vec![0x02]);
        
        scheduler.stop().await;
    }
}
