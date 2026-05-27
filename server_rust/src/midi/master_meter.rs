use std::collections::HashMap;

#[derive(Debug, Clone, Default)]
pub struct MasterMeter {
    steps: HashMap<usize, f64>,
}

impl MasterMeter {
    pub fn new() -> Self {
        Self {
            steps: HashMap::new(),
        }
    }

    pub fn set_steps(&mut self, steps: &serde_json::Value) {
        if let Some(obj) = steps.as_object() {
            self.steps.clear();
            for (k, v) in obj {
                if let (Ok(step), Some(db)) = (k.parse::<usize>(), v.as_f64()) {
                    self.steps.insert(step, db);
                }
            }
            tracing::info!(
                "📊 [MASTER-METER] Tabela de steps carregada ({} entradas)",
                self.steps.len()
            );
        }
    }

    pub fn build_request() -> Vec<u8> {
        vec![240, 67, 48, 62, 13, 33, 4, 0, 127, 0, 1, 247]
    }

    pub fn build_stop_request() -> Vec<u8> {
        vec![240, 67, 48, 62, 13, 33, 127, 0, 0, 0, 0, 247]
    }

    fn unstuff(high: u8, low: u8) -> u16 {
        ((high & 0x7f) as u16) << 7 | ((low & 0x7f) as u16)
    }

    fn convert_value(&self, raw: u16) -> u8 {
        if raw <= 37 {
            return 0;
        }

        let db = (raw as f64 - 4493.0) / 63.66;

        if self.steps.is_empty() {
            return ((raw >> 7) as u8).min(32);
        }

        let mut best_step: u8 = 0;
        let mut min_diff = f64::INFINITY;
        for (&s, &step_db) in &self.steps {
            let diff = (db - step_db).abs();
            if diff < min_diff {
                min_diff = diff;
                best_step = s as u8;
            }
        }
        best_step
    }

    pub fn parse(&self, message: &[u8]) -> Option<u8> {
        if message.len() < 13 {
            return None;
        }
        if message[4] != 13 || message[5] != 33 || message[6] != 4 {
            return None;
        }

        let left_raw = Self::unstuff(message[9], message[10]);
        let right_raw = Self::unstuff(message[11], message[12]);

        let left = self.convert_value(left_raw);
        let right = self.convert_value(right_raw);

        Some(left.max(right))
    }
}
