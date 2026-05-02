//! Commandes Tauri pour la couche IA (Phase 3).
//!
//! Le `Provider` est instancié au setup de l'app et stocké en `tauri::State`
//! sous la forme `AiProvider` (alias `Arc<dyn Provider>`). En P3.1 c'est
//! systématiquement un `OllamaProvider` pointant sur `localhost:11434`.
//! En P3.2+ on rendra l'URL et le modèle configurables via un settings.json.

use romanesk_core::ai::{
    CompletionRequest, CompletionResponse, Message, Provider, ProviderId, Role,
};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tauri::State;

use super::{CommandError, CommandResult};

/// Wrapper qui donne un nom typable à la State partagée.
#[derive(Clone)]
pub struct AiProvider(pub Arc<dyn Provider>);

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
    let provider_id = provider_id_label(&provider.0.id());
    let default_model = default_model_label(&provider.0);
    match provider.0.ping().await {
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

    let res: CompletionResponse = provider
        .0
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

fn provider_id_label(id: &ProviderId) -> String {
    match id {
        ProviderId::Ollama => "ollama".into(),
        ProviderId::Anthropic => "anthropic".into(),
        ProviderId::OpenAi => "openai".into(),
        ProviderId::Gemini => "gemini".into(),
        ProviderId::Mistral => "mistral".into(),
        ProviderId::Custom(name) => name.clone(),
    }
}

/// Le trait `Provider` n'expose pas le default_model directement (ce n'est
/// pas dans son contrat). On fait du best-effort : on tente une complétion
/// vide pour récupérer le `model` retourné. En P3.2+ on stockera
/// explicitement le default_model dans la State.
fn default_model_label(_provider: &Arc<dyn Provider>) -> String {
    // Compromis : on ne déclenche pas de requête réseau ici (le caller
    // appelle ai_ping qui peut être hors-ligne). On affiche juste l'id.
    "default".into()
}
