//! `ai_delete_model` — suppression d'un modèle local.

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

// ---------------------------------------------------------------------------
// ai_delete_model — supprime un modèle local
// ---------------------------------------------------------------------------

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiDeleteModelPayload {
    pub base_url: String,
    pub model: String,
}

#[tauri::command]
pub async fn ai_delete_model(payload: AiDeleteModelPayload) -> CommandResult<()> {
    let base = payload.base_url.trim_end_matches('/');
    let url = format!("{base}/api/delete");
    let body = serde_json::json!({ "model": &payload.model });

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(|e| CommandError::Other(format!("client: {e}")))?;
    let resp = client
        .delete(&url)
        .json(&body)
        .send()
        .await
        .map_err(|e| CommandError::Other(format!("ollama unreachable: {e}")))?;
    if !resp.status().is_success() {
        return Err(CommandError::Other(format!(
            "ollama HTTP {}",
            resp.status()
        )));
    }
    Ok(())
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiCompletePayload {
    pub system: Option<String>,
    pub user: String,
    #[serde(default)]
    pub temperature: Option<f32>,
    #[serde(default)]
    pub max_tokens: Option<u32>,
    /// Si vide, utilise le `default_model` du provider.
    #[serde(default)]
    pub model: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AiCompleteResult {
    pub model: String,
    pub content: String,
    pub finish_reason: Option<String>,
    pub prompt_tokens: Option<u32>,
    pub completion_tokens: Option<u32>,
}

