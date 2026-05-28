use std::sync::atomic::{AtomicUsize, Ordering};

pub struct SyncCounter {
    counter: AtomicUsize,
}

impl SyncCounter {
    pub fn new() -> Self {
        Self {
            counter: AtomicUsize::new(0),
        }
    }

    pub fn begin_sync(&self) {
        self.counter.fetch_add(1, Ordering::SeqCst);
    }

    pub fn should_ignore(&self) -> bool {
        if self.counter.load(Ordering::SeqCst) > 0 {
            self.counter.fetch_sub(1, Ordering::SeqCst);
            return true;
        }
        false
    }

    pub fn reset(&self) {
        self.counter.store(0, Ordering::SeqCst);
    }
}
