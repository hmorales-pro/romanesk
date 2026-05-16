//! `ai_pull_model` — téléchargement streamé d'un modèle depuis le registry Ollama.

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
// ai_pull_model — télécharge un modèle depuis le registry Ollama
// ---------------------------------------------------------------------------
//
// Streame les events JSON `{status, completed, total, ...}` que Ollama
// renvoie sur `POST /api/pull`, et les remonte au front via Tauri events
// `model-pull-progress` pour qu'on puisse afficher une vraie progress bar
// au lieu d'un spinner aveugle.
//
// La commande retourne `()` quand le stream est terminé (success: true ou
// erreur). Le front s'abonne en parallèle à l'event pour le progrès.

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiPullModelPayload {
    pub base_url: String,
    pub model: String,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ModelPullProgress {
    pub model: String,
    pub status: String,
    pub completed: Option<u64>,
    pub total: Option<u64>,
    pub done: bool,
}

#[tauri::command]
pub async fn ai_pull_model(
    app: tauri::AppHandle,
    payload: AiPullModelPayload,
) -> CommandResult<()> {
    use futures_util::StreamExt;
    use tauri::Emitter;

    let base = payload.base_url.trim_end_matches('/');
    let url = format!("{base}/api/pull");
    let body = serde_json::json!({
        "model": &payload.model,
        "stream": true,
    });

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(60 * 30))
        .build()
        .map_err(|e| CommandError::Other(format!("client: {e}")))?;
    let resp = client
        .post(&url)
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

    #[derive(Deserialize)]
    struct OllamaPullEvent {
        status: String,
        #[serde(default)]
        completed: Option<u64>,
        #[serde(default)]
        total: Option<u64>,
        #[serde(default)]
        error: Option<String>,
    }

    let mut stream = resp.bytes_stream();
    let mut buf: Vec<u8> = Vec::new();

    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| CommandError::Other(format!("stream: {e}")))?;
        buf.extend_from_slice(&chunk);

        while let Some(pos) = buf.iter().position(|&b| b == b'\n') {
            let line: Vec<u8> = buf.drain(..=pos).collect();
            let text = std::str::from_utf8(&line[..line.len() - 1])
                .map_err(|e| CommandError::Other(format!("utf8: {e}")))?
                .trim();
            if text.is_empty() {
                continue;
            }
            let event: OllamaPullEvent = serde_json::from_str(text)
                .map_err(|e| CommandError::Other(format!("parse pull event: {e}")))?;

            if let Some(err) = event.error {
                return Err(CommandError::Other(format!("ollama: {err}")));
            }

            let progress = ModelPullProgress {
                model: payload.model.clone(),
                status: event.status.clone(),
                completed: event.completed,
                total: event.total,
                done: event.status == "success",
            };
            // Best effort : on n'échoue pas si l'event ne peut pas être émis
            // (window fermée par exemple).
            let _ = app.emit("model-pull-progress", progress);

            if event.status == "success" {
                return Ok(());
            }
        }
    }

    Ok(())
}
