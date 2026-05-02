//! Abstraction des providers IA pour Romanesk.
//!
//! Le trait [`Provider`] est l'interface unique qu'implémentent tous les
//! backends (Ollama local, Anthropic Claude, OpenAI, Google Gemini, Mistral...).
//! Le routeur (`AiRouter`, à venir) sélectionne le bon provider en fonction
//! des [`Capabilities`] requises et de la préférence utilisateur.

pub mod mock;
pub mod ollama;
pub mod provider;

pub use mock::MockProvider;
pub use ollama::{OllamaConfig, OllamaProvider};
pub use provider::{
    Capabilities, CompletionRequest, CompletionResponse, ImageInput, Message, Provider,
    ProviderError, ProviderId, Role, TokenUsage,
};
