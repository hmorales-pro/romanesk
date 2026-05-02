//! Implémentation `Provider` pour Ollama (local).
//!
//! Ollama expose une API HTTP locale (par défaut `http://localhost:11434`).
//! Cible Phase 0 : `complete()` et `ping()` fonctionnels avec Gemma 4.
//! Cible Phase 3 : `embed()` (via `nomic-embed-text` ou `bge-m3`) et
//! `describe_image()` (modèles vision Gemma / Llama 3.2 Vision).

use async_trait::async_trait;
use serde::{Deserialize, Serialize};

use super::provider::{
    Capabilities, CompletionRequest, CompletionResponse, ImageInput, Message, Provider,
    ProviderError, ProviderId, Role, TokenUsage,
};

/// Configuration d'une instance Ollama.
#[derive(Debug, Clone)]
pub struct OllamaConfig {
    pub base_url: String,
    pub default_model: String,
    /// Capacités du modèle actuellement sélectionné (Gemma 4 supportera vision selon variante).
    pub capabilities: Capabilities,
}

impl Default for OllamaConfig {
    fn default() -> Self {
        Self {
            base_url: "http://localhost:11434".to_string(),
            default_model: "gemma4:e2b".to_string(),
            capabilities: Capabilities {
                text: true,
                vision: false, // à override selon le modèle chargé
                embeddings: false,
                tool_use: false,
                long_context: true,
            },
        }
    }
}

pub struct OllamaProvider {
    cfg: OllamaConfig,
    http: reqwest::Client,
}

impl OllamaProvider {
    pub fn new(cfg: OllamaConfig) -> Self {
        let http = reqwest::Client::builder()
            .user_agent("romanesk/0.0")
            .build()
            .expect("reqwest client");
        Self { cfg, http }
    }
}

#[derive(Serialize)]
struct OllamaChatRequest<'a> {
    model: &'a str,
    messages: Vec<OllamaMessage<'a>>,
    stream: bool,
    options: OllamaOptions,
}

#[derive(Serialize)]
struct OllamaMessage<'a> {
    role: &'a str,
    content: &'a str,
}

#[derive(Serialize, Default)]
struct OllamaOptions {
    #[serde(skip_serializing_if = "Option::is_none")]
    temperature: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    num_predict: Option<u32>,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    stop: Vec<String>,
}

#[derive(Deserialize)]
struct OllamaChatResponse {
    model: String,
    message: OllamaResponseMessage,
    #[serde(default)]
    prompt_eval_count: Option<u32>,
    #[serde(default)]
    eval_count: Option<u32>,
    #[serde(default)]
    done_reason: Option<String>,
}

#[derive(Deserialize)]
struct OllamaResponseMessage {
    #[allow(dead_code)]
    role: String,
    content: String,
}

fn role_str(r: Role) -> &'static str {
    match r {
        Role::System => "system",
        Role::User => "user",
        Role::Assistant => "assistant",
    }
}

#[async_trait]
impl Provider for OllamaProvider {
    fn id(&self) -> ProviderId {
        ProviderId::Ollama
    }

    fn capabilities(&self) -> Capabilities {
        self.cfg.capabilities
    }

    async fn complete(&self, req: CompletionRequest) -> Result<CompletionResponse, ProviderError> {
        let model = if req.model.is_empty() || req.model == "ping" {
            &self.cfg.default_model
        } else {
            &req.model
        };

        let body_messages: Vec<OllamaMessage> = req
            .messages
            .iter()
            .map(|m: &Message| OllamaMessage {
                role: role_str(m.role),
                content: &m.content,
            })
            .collect();

        let payload = OllamaChatRequest {
            model,
            messages: body_messages,
            stream: false,
            options: OllamaOptions {
                temperature: req.temperature,
                num_predict: req.max_tokens,
                stop: req.stop.clone(),
            },
        };

        let url = format!("{}/api/chat", self.cfg.base_url.trim_end_matches('/'));

        let resp = self
            .http
            .post(&url)
            .json(&payload)
            .send()
            .await
            .map_err(|e| ProviderError::Transport(e.to_string()))?;

        if !resp.status().is_success() {
            return Err(ProviderError::Unavailable(format!(
                "Ollama HTTP {}",
                resp.status()
            )));
        }

        let parsed: OllamaChatResponse = resp
            .json()
            .await
            .map_err(|e| ProviderError::MalformedResponse(e.to_string()))?;

        let prompt_tokens = parsed.prompt_eval_count.unwrap_or(0);
        let completion_tokens = parsed.eval_count.unwrap_or(0);

        Ok(CompletionResponse {
            content: parsed.message.content,
            model: parsed.model,
            usage: Some(TokenUsage {
                prompt_tokens,
                completion_tokens,
                total_tokens: prompt_tokens + completion_tokens,
            }),
            finish_reason: parsed.done_reason,
        })
    }

    async fn ping(&self) -> Result<(), ProviderError> {
        // Ollama expose `/api/tags` pour lister les modèles : healthcheck léger.
        let url = format!("{}/api/tags", self.cfg.base_url.trim_end_matches('/'));
        let resp = self
            .http
            .get(&url)
            .send()
            .await
            .map_err(|e| ProviderError::Transport(e.to_string()))?;

        if resp.status().is_success() {
            Ok(())
        } else {
            Err(ProviderError::Unavailable(format!(
                "Ollama unreachable, HTTP {}",
                resp.status()
            )))
        }
    }

    async fn describe_image(
        &self,
        _img: ImageInput,
        _prompt: &str,
    ) -> Result<String, ProviderError> {
        // TODO Phase 3 : encoder l'image en base64 et l'attacher au champ `images`
        // de la requête `/api/chat`. Ne fonctionne qu'avec un modèle vision-capable.
        Err(ProviderError::CapabilityMissing("vision"))
    }

    async fn embed(&self, _texts: Vec<String>) -> Result<Vec<Vec<f32>>, ProviderError> {
        // TODO Phase 3 : appeler `/api/embeddings` avec un modèle dédié
        // (`nomic-embed-text` ou `bge-m3`) en parallèle du modèle de chat.
        Err(ProviderError::CapabilityMissing("embeddings"))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_config_targets_localhost() {
        let cfg = OllamaConfig::default();
        assert_eq!(cfg.base_url, "http://localhost:11434");
        assert!(cfg.capabilities.text);
        assert!(!cfg.capabilities.vision);
    }

    #[test]
    fn provider_id_is_ollama() {
        let p = OllamaProvider::new(OllamaConfig::default());
        assert_eq!(p.id(), ProviderId::Ollama);
    }
}
