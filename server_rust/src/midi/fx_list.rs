use std::collections::HashMap;

use lazy_static::lazy_static;
use serde::Deserialize;

#[derive(Debug, Deserialize)]
struct FxEntry {
    id: u32,
    name: String,
    #[serde(default)]
    _read_only: bool,
}

#[derive(Debug, Deserialize)]
struct FxList {
    builtin: Vec<FxEntry>,
    #[serde(default)]
    custom: Vec<FxEntry>,
}

lazy_static! {
    static ref FX_MAP: HashMap<u32, String> = {
        let data = include_str!("../../../fx_list.json");
        match serde_json::from_str::<FxList>(data) {
            Ok(list) => {
                let mut m = HashMap::new();
                for e in list.builtin {
                    m.insert(e.id, e.name);
                }
                for e in list.custom {
                    m.insert(e.id, e.name);
                }
                m
            }
            Err(e) => {
                tracing::error!("Failed to load fx_list.json: {}", e);
                HashMap::new()
            }
        }
    };
}

pub fn resolve_fx_name(fx_id: u32) -> String {
    FX_MAP
        .get(&fx_id)
        .cloned()
        .unwrap_or_else(|| format!("Unknown (id={})", fx_id))
}
