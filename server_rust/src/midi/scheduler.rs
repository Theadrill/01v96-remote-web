use std::sync::Arc;
use std::time::Duration;
use tokio::sync::Mutex;

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
    engine: Arc<Mutex<super::MidiEngine>>,
    sync_counter: Arc<super::SyncCounter>,
}

impl MidiScheduler {
    pub fn new(
        tick_ms: u64,
        engine: Arc<Mutex<super::MidiEngine>>,
        sync_counter: Arc<super::SyncCounter>,
    ) -> Self {
        Self {
            state: Arc::new(Mutex::new(SchedulerState::new(tick_ms))),
            engine,
            sync_counter,
        }
    }

    pub async fn enqueue_batch(&self, items: Vec<Vec<u8>>, priority: u8) {
        if items.is_empty() { return; }
        let mut state = self.state.lock().await;
        match priority {
            0 => {
                for bytes in items {
                    if let Some(addr) = Self::extract_address(&bytes) {
                        if let Some(idx) = state.q0.iter().position(|i| Self::extract_address(i) == Some(addr.clone())) {
                            state.q0[idx] = bytes;
                            continue;
                        }
                    }
                    state.q0.push(bytes);
                }
            }
            1 => { state.q1.extend(items); }
            2 => {
                if state.q0.is_empty() && state.q1.is_empty() {
                    state.q2.extend(items);
                }
            }
            _ => {}
        }
    }

    pub async fn enqueue(&self, bytes: Vec<u8>, priority: u8) -> bool {
        if bytes.is_empty() { return false; }
        let mut state = self.state.lock().await;
        match priority {
            0 => {
                if let Some(addr) = Self::extract_address(&bytes) {
                    if let Some(idx) = state.q0.iter().position(|i| Self::extract_address(i) == Some(addr.clone())) {
                        state.q0[idx] = bytes;
                        return true;
                    }
                }
                state.q0.push(bytes);
                true
            }
            1 => { state.q1.push(bytes); true }
            2 => {
                if !state.q0.is_empty() || !state.q1.is_empty() { return false; }
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
            if (sub_status == 0x10 || sub_status == 0x30) && bytes.len() >= 9 {
                let addr = &bytes[4..9];
                return Some(format!("P-{}-{:?}", dev, addr));
            }
            let addr = &bytes[4..7];
            return Some(format!("O-{}-{:?}", dev, addr));
        }
        None
    }

    pub async fn start(&self) {
        let mut state_lock = self.state.lock().await;
        if state_lock.is_running { return; }
        state_lock.is_running = true;
        let tick_ms = state_lock.tick_ms;
        drop(state_lock);

        let state_clone = Arc::clone(&self.state);
        let engine = Arc::clone(&self.engine);
        let sync_counter = Arc::clone(&self.sync_counter);

        tokio::spawn(async move {
            let mut interval = tokio::time::interval(Duration::from_millis(tick_ms));

            loop {
                interval.tick().await;
                let mut state = state_clone.lock().await;
                if !state.is_running { break; }

                let packet = if !state.q0.is_empty() { Some(state.q0.remove(0)) }
                else if !state.q1.is_empty() { Some(state.q1.remove(0)) }
                else if !state.q2.is_empty() { Some(state.q2.remove(0)) }
                else { None };

                match packet {
                    Some(p) => {
                        drop(state);
                        if p.len() >= 3 && p[0] == 0xF0 && p[1] == 0x43 && p[2] == 0x10 {
                            sync_counter.begin_sync();
                        }
                        engine.lock().await.send(&p);
                        let mut st = state_clone.lock().await;
                        st.total_processed += 1;
                        if st.total_processed % 100 == 0 {
                            // tracing::info!("📤 [Scheduler] {} processados (Q0:{}, Q1:{}, Q2:{})",
                            //    st.total_processed, st.q0.len(), st.q1.len(), st.q2.len());
                        }
                    }
                    None => {}
                }
            }
        });
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
        let engine = Arc::new(Mutex::new(super::super::MidiEngine::new()));
        let sync_counter = Arc::new(super::super::SyncCounter::new());
        let scheduler = MidiScheduler::new(10, engine, sync_counter);

        scheduler.enqueue(vec![0x02], 2).await;
        scheduler.enqueue(vec![0x01], 1).await;
        scheduler.enqueue(vec![0xF0, 0x43, 0x10, 0x3E, 0x01, 0x02, 0x03, 0x04, 0x05, 0xF7], 0).await;

        scheduler.start().await;
        tokio::time::sleep(Duration::from_millis(100)).await;
        {
            let mut st = scheduler.state.lock().await;
            st.is_running = false;
        }
    }
}
