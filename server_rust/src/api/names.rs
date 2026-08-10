use axum::{
    Json,
    extract::State,
    Extension,
};
use serde_json::Value;
use std::sync::Arc;
use tokio::sync::RwLock;

pub fn router(
    state: Arc<RwLock<crate::state::GlobalState>>,
    csm: Arc<RwLock<crate::custom_scenes::CustomSceneManager>>,
) -> axum::Router {
    axum::Router::new()
        .route("/names", axum::routing::get(get_names))
        .with_state(state)
        .layer(Extension(csm))
}

async fn get_names(
    State(state): State<Arc<RwLock<crate::state::GlobalState>>>,
    Extension(csm): Extension<Arc<RwLock<crate::custom_scenes::CustomSceneManager>>>,
) -> Json<Value> {
    let resolved = crate::name_resolver::resolve_all(&state, &csm).await;
    let mut names = serde_json::Map::new();

    for entry in &resolved {
        names.insert(entry.ch.to_string(), Value::String(entry.name.clone()));
    }

    Json(Value::Object(names))
}
