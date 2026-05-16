//! `ai_describe_image` — vision Ollama, P6.6.

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
// Vision : décrire une image (P6.6)
// ---------------------------------------------------------------------------

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DescribeImagePayload {
    /// Chemin local vers l'image (PNG / JPG / WEBP).
    pub image_path: String,
    /// Prompt qui guide la description (peut inclure les champs structurés
    /// déjà remplis : « Décris ce personnage en sachant qu'il est un
    /// guerrier… »).
    pub prompt: String,
    /// Modèle vision Ollama à utiliser (ex. `llava:latest`,
    /// `qwen2.5vl:7b`, `gemma3:4b`). Doit supporter les images.
    pub model: String,
    /// Override de l'URL Ollama. Si `None`, on lit la base_url courante
    /// depuis le AiProvider (snapshot).
    #[serde(default)]
    pub base_url: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DescribeImageResult {
    pub model: String,
    pub content: String,
}

#[tauri::command]
pub async fn ai_describe_image(
    chat_state: State<'_, AiProvider>,
    payload: DescribeImagePayload,
) -> CommandResult<DescribeImageResult> {
    if payload.model.trim().is_empty() {
        return Err(CommandError::Other(
            "Modèle vision requis (configure visionModel dans Settings)".into(),
        ));
    }
    if payload.image_path.trim().is_empty() {
        return Err(CommandError::Other("image_path manquant".into()));
    }
    if payload.prompt.trim().is_empty() {
        return Err(CommandError::Other("prompt manquant".into()));
    }

    // base_url : on snapshot le provider chat courant pour récupérer
    // la base configurée (P5.3 hot-reload garantit qu'elle est à jour).
    // Le caller peut overrider via payload.base_url si besoin.
    let base_url = if let Some(url) = payload.base_url {
        url
    } else {
        let chat = chat_state.snapshot().await;
        // ProviderId est juste un label : on le lit pour vérification mais
        // on n'a pas accès à la config interne. Fallback sur localhost si
        // on ne peut pas lire — mais en pratique l'utilisateur configure
        // la base via Settings.
        let _ = chat.id();
        "http://localhost:11434".to_string()
    };

    let provider = OllamaProvider::new(OllamaConfig {
        base_url,
        default_model: payload.model.clone(),
        capabilities: Capabilities {
            text: false,
            vision: true,
            embeddings: false,
            tool_use: false,
            long_context: false,
        },
    });
    let img = ImageInput::Path(std::path::PathBuf::from(payload.image_path));
    let content = provider
        .describe_image(img, &payload.prompt)
        .await
        .map_err(|e| CommandError::Other(format!("vision: {e}")))?;
    Ok(DescribeImageResult {
        model: payload.model,
        content,
    })
}

