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
                embeddings: true,
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

    async fn describe_image(&self, img: ImageInput, prompt: &str) -> Result<String, ProviderError> {
        // P6.6 : encode l'image en base64 et l'attache au champ `images` de
        // la requête `/api/chat`. Ne fonctionne qu'avec un modèle
        // vision-capable côté Ollama (llava, qwen2.5vl, gemma3:4b avec vision…).
        // Le modèle utilisé = self.cfg.default_model — le caller passe
        // `vision_model` via une instance OllamaProvider dédiée.
        let bytes = match img {
            ImageInput::Bytes { data, .. } => data,
            ImageInput::Path(path) => std::fs::read(&path)
                .map_err(|e| ProviderError::BadRequest(format!("read image {path:?}: {e}")))?,
            ImageInput::Url(_) => {
                return Err(ProviderError::BadRequest(
                    "Ollama vision local : URL non supportée, fournis Path ou Bytes".into(),
                ));
            }
        };
        use base64::{engine::general_purpose, Engine as _};
        let b64 = general_purpose::STANDARD.encode(&bytes);

        let url = format!("{}/api/chat", self.cfg.base_url.trim_end_matches('/'));
        let payload = serde_json::json!({
            "model": &self.cfg.default_model,
            "stream": false,
            "messages": [{
                "role": "user",
                "content": prompt,
                "images": [b64],
            }],
            "options": { "temperature": 0.7 }
        });

        let resp = self
            .http
            .post(&url)
            .json(&payload)
            .send()
            .await
            .map_err(|e| ProviderError::Transport(e.to_string()))?;
        if !resp.status().is_success() {
            return Err(ProviderError::Unavailable(format!(
                "Ollama HTTP {} : {}",
                resp.status(),
                resp.text().await.unwrap_or_default()
            )));
        }
        let body: serde_json::Value = resp
            .json()
            .await
            .map_err(|e| ProviderError::Transport(e.to_string()))?;
        let content = body
            .get("message")
            .and_then(|m| m.get("content"))
            .and_then(|c| c.as_str())
            .ok_or_else(|| {
                ProviderError::MalformedResponse(format!(
                    "Ollama vision: réponse sans content : {body}"
                ))
            })?
            .trim()
            .to_string();
        Ok(content)
    }

    async fn embed(&self, texts: Vec<String>) -> Result<Vec<Vec<f32>>, ProviderError> {
        // Ollama 0.1.31+ expose `/api/embed` qui accepte une liste de textes
        // et renvoie une liste de vecteurs. Fallback via `default_model` si
        // aucun modèle d'embedding spécifique n'est configuré.
        // En pratique, l'appelant override via `embedding_model` (cf.
        // commands/ai.rs).
        let url = format!("{}/api/embed", self.cfg.base_url.trim_end_matches('/'));
        let payload = serde_json::json!({
            "model": &self.cfg.default_model,
            "input": texts,
        });

        let resp = self
            .http
            .post(&url)
            .json(&payload)
            .send()
            .await
            .map_err(|e| ProviderError::Transport(e.to_string()))?;

        if !resp.status().is_success() {
            return Err(ProviderError::Unavailable(format!(
                "Ollama embed HTTP {}",
                resp.status()
            )));
        }

        #[derive(serde::Deserialize)]
        struct OllamaEmbedResponse {
            embeddings: Vec<Vec<f32>>,
        }

        let parsed: OllamaEmbedResponse = resp
            .json()
            .await
            .map_err(|e| ProviderError::MalformedResponse(e.to_string()))?;

        Ok(parsed.embeddings)
    }
}

/// Variante de `OllamaProvider::embed` qui permet de spécifier un modèle
/// d'embedding différent du `default_model` (chat). Utile parce que les
/// modèles de chat (gemma, llama) et les modèles d'embedding
/// (nomic-embed-text, bge) sont en général distincts.
impl OllamaProvider {
    /// Embed une liste de textes avec un modèle donné, par exemple
    /// `"nomic-embed-text:latest"`. Renvoie un `Vec<Vec<f32>>` aligné
    /// avec l'ordre d'entrée.
    pub async fn embed_with_model(
        &self,
        texts: Vec<String>,
        model: &str,
    ) -> Result<Vec<Vec<f32>>, ProviderError> {
        let url = format!("{}/api/embed", self.cfg.base_url.trim_end_matches('/'));
        let payload = serde_json::json!({
            "model": model,
            "input": texts,
        });

        let resp = self
            .http
            .post(&url)
            .json(&payload)
            .send()
            .await
            .map_err(|e| ProviderError::Transport(e.to_string()))?;

        if !resp.status().is_success() {
            return Err(ProviderError::Unavailable(format!(
                "Ollama embed HTTP {}",
                resp.status()
            )));
        }

        #[derive(serde::Deserialize)]
        struct OllamaEmbedResponse {
            embeddings: Vec<Vec<f32>>,
        }

        let parsed: OllamaEmbedResponse = resp
            .json()
            .await
            .map_err(|e| ProviderError::MalformedResponse(e.to_string()))?;

        Ok(parsed.embeddings)
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
