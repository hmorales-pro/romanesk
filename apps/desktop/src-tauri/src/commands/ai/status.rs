//! `ai_ping` — healthcheck du provider IA.

#![allow(unused_imports)]

use romanesk_core::ai::{
    Capabilities, CompletionRequest, CompletionResponse, ImageInput, Message, OllamaConfig,
    OllamaProvider, Provider, ProviderId, Role,
};
use romanesk_core::domain::SourceType;
use romanesk_core::{Database, Entity, EntityType, NewEmbedding, Repo};
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::sync::Arc;
use tauri::State;
use tokio::sync::RwLock;
use uuid::Uuid;

use super::super::{CommandError, CommandResult};
use super::state::{AiEmbedder, AiEmbedderInner, AiProvider};
use super::util::{default_model_label, provider_id_label};

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AiStatus {
    pub provider_id: String,
    pub default_model: String,
    pub reachable: bool,
    pub error: Option<String>,
}

#[tauri::command]
pub async fn ai_ping(provider: State<'_, AiProvider>) -> CommandResult<AiStatus> {
    let provider = provider.snapshot().await;
    let provider_id = provider_id_label(&provider.id());
    let default_model = default_model_label(&provider);
    match provider.ping().await {
        Ok(()) => Ok(AiStatus {
            provider_id,
            default_model,
            reachable: true,
            error: None,
        }),
        Err(e) => Ok(AiStatus {
            provider_id,
            default_model,
            reachable: false,
            error: Some(e.to_string()),
        }),
    }
}
