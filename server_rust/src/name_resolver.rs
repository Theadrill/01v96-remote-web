//! # Name Resolver
//!
//! Módulo responsável por resolver os nomes dos canais aplicando a hierarquia:
//!   1. Nome Global (prioridade máxima — persiste entre cenas)
//!   2. Nome Custom Scene (por cena — ligado à cena física ativa)
//!   3. Nome Físico da mesa (proveniente do MIDI dump)
//!
//! Este módulo é a ÚNICA fonte de verdade para exibição de nomes no frontend.
//! O frontend não precisa mais fazer lógica de prioridade — apenas consome
//! o evento `resolvedNamesUpdated` emitido por `broadcast`.

use crate::custom_scenes::{ChannelId, ChannelNameEntry, CustomSceneManager};
use crate::state::GlobalState;
use socketioxide::SocketIo;
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::RwLock;

/// Origem de um nome resolvido (para debugging/UI informativa).
#[derive(Debug, Clone, PartialEq, serde::Serialize)]
pub enum NameSource {
    #[serde(rename = "global")]
    Global,
    #[serde(rename = "custom")]
    Custom,
    #[serde(rename = "physical")]
    Physical,
}

/// Um nome resolvido para um canal específico.
#[derive(Debug, Clone, serde::Serialize)]
pub struct ResolvedName {
    /// ID global do canal (0-31 inputs, 36-43 AUX, 44-51 BUS, 52 master, 60-67 ST IN)
    pub ch: u8,
    /// Nome longo (até 10 chars para global/custom, até 16 chars para físico)
    pub name: String,
    /// Nome curto (4 chars — o que aparece no visor da mesa)
    pub short: String,
    /// Origem do nome resolvido
    pub source: NameSource,
}

/// Resolve os nomes de TODOS os canais aplicando a hierarquia correta.
///
/// # Parâmetros
/// - `state`  : estado global (contém nomes físicos vindos do MIDI)
/// - `csm`    : gerenciador de custom scenes (contém global names e custom scene ativa)
pub async fn resolve_all(
    state: &Arc<RwLock<GlobalState>>,
    csm: &Arc<RwLock<CustomSceneManager>>,
) -> Vec<ResolvedName> {
    let state_guard = state.read().await;

    // Descobre a cena física atual para localizar a custom scene correta
    let (scene_number, scene_name) = {
        let sn = state_guard.scene_manager.active_scene_index;
        let sname = state_guard
            .scene_manager
            .current_scene
            .as_ref()
            .map(|s| s.name.clone())
            .unwrap_or_default();
        (sn, sname)
    };


    // Captura snapshot do estado físico (sem manter o lock durante acesso ao CSM)
    let phys = PhysicalSnapshot::from_state(&state_guard);
    drop(state_guard);

    // Acessa o CSM com write (find_scene_for_physical faz cache check internamente)
    let (global_names, custom_channels) = {
        let mut csm_guard = csm.write().await;
        let custom = csm_guard
            .find_scene_for_physical(scene_number, &scene_name)
            .map(|s| s.channels.clone())
            .unwrap_or_default();

        let global = csm_guard.get_global_names().clone();
        (global, custom)
    };

    let _ = scene_number;
    build_resolved(phys, &global_names, &custom_channels)
}

// ---------------------------------------------------------------------------
// Snapshot do estado físico (sem locks pendentes)
// ---------------------------------------------------------------------------
struct PhysicalSnapshot {
    channels: Vec<(u8, String)>,     // (global_ch, nome físico)
    st_ins: Vec<(u8, u8, String)>,   // (global_ch_l, global_ch_r, nome físico)
    mixes: Vec<(u8, String)>,        // (global_ch, nome físico)
    buses: Vec<(u8, String)>,        // (global_ch, nome físico)
    master: String,
}

impl PhysicalSnapshot {
    fn from_state(state: &GlobalState) -> Self {
        let mut channels = Vec::with_capacity(32);
        for local_idx in 0usize..32 {
            let name = state
                .channels
                .get(&local_idx)
                .map(|c| c.name.clone())
                .unwrap_or_default();
            channels.push((local_idx as u8, name));
        }

        let mut st_ins = Vec::with_capacity(4);
        for st_idx in 0usize..4 {
            let local_idx = 32 + st_idx;
            let global_l = 60u8 + (st_idx as u8 * 2);
            let global_r = global_l + 1;
            let name = state
                .channels
                .get(&local_idx)
                .map(|c| c.name.clone())
                .unwrap_or_default();
            st_ins.push((global_l, global_r, name));
        }

        let mut mixes = Vec::with_capacity(8);
        for i in 0usize..8 {
            let name = state
                .mixes
                .get(&i)
                .map(|m| m.name.clone())
                .unwrap_or_default();
            mixes.push((36u8 + i as u8, name));
        }

        let mut buses = Vec::with_capacity(8);
        for i in 0usize..8 {
            let name = state
                .buses
                .get(&i)
                .map(|b| b.name.clone())
                .unwrap_or_default();
            buses.push((44u8 + i as u8, name));
        }

        Self {
            channels,
            st_ins,
            mixes,
            buses,
            master: state.master.name.clone(),
        }
    }
}

// ---------------------------------------------------------------------------
// Constrói o Vec<ResolvedName> a partir dos snapshots
// ---------------------------------------------------------------------------
fn build_resolved(
    phys: PhysicalSnapshot,
    global_names: &HashMap<ChannelId, ChannelNameEntry>,
    custom_channels: &HashMap<ChannelId, ChannelNameEntry>,
) -> Vec<ResolvedName> {
    let mut resolved = Vec::new();

    for (global_ch, physical_name) in &phys.channels {
        let ch_id = ChannelId::from_global_channel(*global_ch);
        let short = crate::custom_scenes::to_short_name(physical_name);
        resolved.push(resolve_one(*global_ch, physical_name, &short, &ch_id, global_names, custom_channels));
    }

    for (global_ch_l, global_ch_r, physical_name) in &phys.st_ins {
        let short = crate::custom_scenes::to_short_name(physical_name);
        let ch_id_l = ChannelId::from_global_channel(*global_ch_l);
        let ch_id_r = ChannelId::from_global_channel(*global_ch_r);
        resolved.push(resolve_one(*global_ch_l, physical_name, &short, &ch_id_l, global_names, custom_channels));
        resolved.push(resolve_one(*global_ch_r, physical_name, &short, &ch_id_r, global_names, custom_channels));
    }

    for (global_ch, physical_name) in &phys.mixes {
        let ch_id = ChannelId::from_global_channel(*global_ch);
        let short = crate::custom_scenes::to_short_name(physical_name);
        resolved.push(resolve_one(*global_ch, physical_name, &short, &ch_id, global_names, custom_channels));
    }

    for (global_ch, physical_name) in &phys.buses {
        let ch_id = ChannelId::from_global_channel(*global_ch);
        let short = crate::custom_scenes::to_short_name(physical_name);
        resolved.push(resolve_one(*global_ch, physical_name, &short, &ch_id, global_names, custom_channels));
    }

    // Master
    {
        let ch_id = ChannelId::from_global_channel(52);
        let short = crate::custom_scenes::to_short_name(&phys.master);
        resolved.push(resolve_one(52, &phys.master, &short, &ch_id, global_names, custom_channels));
    }

    resolved
}

/// Resolve o nome de um canal individual, aplicando a hierarquia.
fn resolve_one(
    global_ch: u8,
    physical_name: &str,
    physical_short: &str,
    ch_id: &Option<ChannelId>,
    global_names: &HashMap<ChannelId, ChannelNameEntry>,
    custom_channels: &HashMap<ChannelId, ChannelNameEntry>,
) -> ResolvedName {
    // Prioridade 1: Nome Global
    if let Some(id) = ch_id {
        if let Some(entry) = global_names.get(id) {
            return ResolvedName {
                ch: global_ch,
                name: entry.name.clone(),
                short: entry.short.clone(),
                source: NameSource::Global,
            };
        }
    }

    // Prioridade 2: Nome Custom Scene
    if let Some(id) = ch_id {
        if let Some(entry) = custom_channels.get(id) {
            return ResolvedName {
                ch: global_ch,
                name: entry.name.clone(),
                short: entry.short.clone(),
                source: NameSource::Custom,
            };
        }
    }

    // Prioridade 3: Nome Físico
    ResolvedName {
        ch: global_ch,
        name: physical_name.to_string(),
        short: physical_short.to_string(),
        source: NameSource::Physical,
    }
}

/// Emite o evento `resolvedNamesUpdated` para todos os clientes conectados.
/// Esta função é o único ponto de emissão de nomes para o frontend.
pub async fn broadcast(
    io: &SocketIo,
    state: &Arc<RwLock<GlobalState>>,
    csm: &Arc<RwLock<CustomSceneManager>>,
) {
    let resolved = resolve_all(state, csm).await;

    let payload: Vec<serde_json::Value> = resolved
        .iter()
        .map(|r| {
            serde_json::json!({
                "ch":     r.ch,
                "name":   r.name,
                "short":  r.short,
                "source": r.source,
            })
        })
        .collect();

    let _ = io
        .emit(
            "resolvedNamesUpdated",
            &serde_json::json!({ "channels": payload }),
        )
        .await;

    tracing::debug!(
        "[NameResolver] broadcast: {} canais resolvidos",
        payload.len()
    );
}
