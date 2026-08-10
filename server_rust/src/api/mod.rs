pub mod custom_scene_history;
pub mod macros;
pub mod names;
pub mod system;

use std::sync::Arc;
use tokio::sync::RwLock;

pub fn router(
    state: Arc<RwLock<crate::state::GlobalState>>,
    csm: Arc<RwLock<crate::custom_scenes::CustomSceneManager>>,
    io: socketioxide::SocketIo,
) -> axum::Router {
    axum::Router::new()
        .merge(macros::router(state.clone(), csm.clone(), io))
        .merge(system::router(state.clone()))
        .merge(names::router(state, csm))
}
