//! `ai_complete` — chat completion générique (prompt → texte).

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

#[tauri::command]
pub async fn ai_complete(
    provider: State<'_, AiProvider>,
    payload: AiCompletePayload,
) -> CommandResult<AiCompleteResult> {
    let mut messages = Vec::new();
    if let Some(system) = payload.system.filter(|s| !s.trim().is_empty()) {
        messages.push(Message {
            role: Role::System,
            content: system,
        });
    }
    messages.push(Message {
        role: Role::User,
        content: payload.user,
    });

    let req = CompletionRequest {
        model: payload.model.unwrap_or_default(),
        messages,
        temperature: payload.temperature,
        max_tokens: payload.max_tokens,
        stop: Vec::new(),
        json_schema: None,
    };

    let provider = provider.snapshot().await;
    let res: CompletionResponse = provider
        .complete(req)
        .await
        .map_err(|e| CommandError::Other(e.to_string()))?;

    Ok(AiCompleteResult {
        model: res.model,
        content: res.content,
        finish_reason: res.finish_reason,
        prompt_tokens: res.usage.as_ref().map(|u| u.prompt_tokens),
        completion_tokens: res.usage.as_ref().map(|u| u.completion_tokens),
    })
}
