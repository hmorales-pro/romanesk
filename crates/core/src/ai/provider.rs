//! Trait `Provider` : interface uniforme pour tous les backends IA.
//!
//! Cf. PRD §10.1.

use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use thiserror::Error;

/// Identifiant logique d'un provider (clé de configuration utilisateur).
#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ProviderId {
    Ollama,
    Anthropic,
    OpenAi,
    Gemini,
    Mistral,
    /// Provider personnalisé (clé/host fournis par l'utilisateur).
    Custom(String),
}

/// Capacités d'un provider donné. Un même provider peut exposer plusieurs
/// modèles aux capacités différentes ; on travaille au niveau modèle effectif.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, Default)]
pub struct Capabilities {
    pub text: bool,
    pub vision: bool,
    pub embeddings: bool,
    pub tool_use: bool,
    pub long_context: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Role {
    System,
    User,
    Assistant,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Message {
    pub role: Role,
    pub content: String,
}

/// Image fournie en entrée pour un usage multimodal.
#[derive(Debug, Clone)]
pub enum ImageInput {
    /// Bytes bruts + mime type.
    Bytes { data: Vec<u8>, mime: String },
    /// URL accessible par le provider (pour les providers cloud qui acceptent les URLs).
    Url(String),
    /// Chemin local ; le provider ouvrira le fichier (utile pour Ollama local).
    Path(std::path::PathBuf),
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct CompletionRequest {
    /// Nom du modèle effectif côté provider (ex. "gemma:7b", "claude-sonnet-4-6").
    pub model: String,
    pub messages: Vec<Message>,
    pub temperature: Option<f32>,
    pub max_tokens: Option<u32>,
    pub stop: Vec<String>,
    /// Réponse attendue en JSON conforme à un schéma (si supporté).
    pub json_schema: Option<serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CompletionResponse {
    pub content: String,
    pub model: String,
    pub usage: Option<TokenUsage>,
    pub finish_reason: Option<String>,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, Default)]
pub struct TokenUsage {
    pub prompt_tokens: u32,
    pub completion_tokens: u32,
    pub total_tokens: u32,
}

#[derive(Debug, Error)]
pub enum ProviderError {
    #[error("provider unavailable: {0}")]
    Unavailable(String),

    #[error("authentication failed")]
    AuthFailed,

    #[error("rate limited; retry after {retry_after_ms} ms")]
    RateLimited { retry_after_ms: u64 },

    #[error("capability `{0}` not supported by this provider/model")]
    CapabilityMissing(&'static str),

    #[error("invalid request: {0}")]
    BadRequest(String),

    #[error("transport error: {0}")]
    Transport(String),

    #[error("provider returned malformed response: {0}")]
    MalformedResponse(String),

    #[error(transparent)]
    Other(#[from] anyhow_like::AnyError),
}

// Petit alias pour ne pas dépendre directement de `anyhow` ici.
pub mod anyhow_like {
    pub type AnyError = Box<dyn std::error::Error + Send + Sync + 'static>;
}

/// Interface uniforme. Toutes les méthodes sont `async` ; les implémentations
/// doivent rester `Send + Sync` pour pouvoir être stockées dans un router.
#[async_trait]
pub trait Provider: Send + Sync {
    fn id(&self) -> ProviderId;
    fn capabilities(&self) -> Capabilities;

    /// Une complétion textuelle (chat-style).
    async fn complete(&self, req: CompletionRequest) -> Result<CompletionResponse, ProviderError>;

    /// Génération d'embeddings. Renvoie `CapabilityMissing("embeddings")` si non supporté.
    async fn embed(&self, _texts: Vec<String>) -> Result<Vec<Vec<f32>>, ProviderError> {
        Err(ProviderError::CapabilityMissing("embeddings"))
    }

    /// Description / analyse d'une image. Renvoie `CapabilityMissing("vision")` si non supporté.
    async fn describe_image(
        &self,
        _img: ImageInput,
        _prompt: &str,
    ) -> Result<String, ProviderError> {
        Err(ProviderError::CapabilityMissing("vision"))
    }

    /// Healthcheck rapide (ping). Implémentation par défaut : tente une complétion vide.
    async fn ping(&self) -> Result<(), ProviderError> {
        let req = CompletionRequest {
            model: "ping".to_string(),
            messages: vec![Message {
                role: Role::User,
                content: "ping".to_string(),
            }],
            max_tokens: Some(1),
            ..Default::default()
        };
        self.complete(req).await.map(|_| ())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn capabilities_default_is_all_false() {
        let c = Capabilities::default();
        assert!(!c.text);
        assert!(!c.vision);
        assert!(!c.embeddings);
        assert!(!c.tool_use);
        assert!(!c.long_context);
    }

    #[test]
    fn provider_id_serializes_snake_case() {
        let id = ProviderId::OpenAi;
        let s = serde_json::to_string(&id).unwrap();
        assert_eq!(s, "\"open_ai\"");
    }
}
