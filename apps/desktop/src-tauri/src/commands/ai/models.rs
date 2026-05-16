//! `ai_list_models` — liste les modèles Ollama installés.

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
// ai_list_models — liste les modèles installés sur Ollama
// ---------------------------------------------------------------------------
//
// Permet à Settings d'afficher des dropdowns au lieu de champs texte libres
// pour le choix des modèles chat / embed / créatif / littéral / vision.
// Le front passe la base_url courante (settings.ollamaBaseUrl) — comme ça
// on peut tester un nouveau serveur Ollama sans avoir à hot-reload les
// providers d'abord.

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AiModel {
    pub name: String,
    pub size_bytes: u64,
    pub modified_at: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiListModelsPayload {
    pub base_url: String,
}

#[tauri::command]
pub async fn ai_list_models(payload: AiListModelsPayload) -> CommandResult<Vec<AiModel>> {
    let base = payload.base_url.trim_end_matches('/');
    let url = format!("{base}/api/tags");
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(8))
        .build()
        .map_err(|e| CommandError::Other(format!("client: {e}")))?;
    let resp = client
        .get(&url)
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
    struct OllamaTagsResponse {
        models: Vec<OllamaModelEntry>,
    }
    #[derive(Deserialize)]
    struct OllamaModelEntry {
        name: String,
        #[serde(default)]
        size: u64,
        #[serde(default)]
        modified_at: Option<String>,
    }

    let parsed: OllamaTagsResponse = resp
        .json()
        .await
        .map_err(|e| CommandError::Other(format!("parse: {e}")))?;

    Ok(parsed
        .models
        .into_iter()
        .map(|m| AiModel {
            name: m.name,
            size_bytes: m.size,
            modified_at: m.modified_at,
        })
        .collect())
}
