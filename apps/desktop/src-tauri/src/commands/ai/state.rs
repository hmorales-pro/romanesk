//! Types partagés `AiProvider` et `AiEmbedder` (State Tauri).
//!
//! `AiProvider` est instancié au setup de l'app et stocké en
//! `tauri::State`. Les deux structs sont interior-mutable (RwLock)
//! pour permettre le hot-reload après `settings_save` (P5.3).

use std::sync::Arc;

use romanesk_core::ai::{OllamaProvider, Provider};
use tokio::sync::RwLock;

/// Wrapper qui donne un nom typable à la State partagée.
///
/// Phase 5 (P5.3) : interior-mutable pour permettre le hot-reload des
/// providers IA depuis Settings sans redémarrer l'app. Les commandes
/// snapshotent la valeur courante en début d'exécution (`snapshot().await`)
/// puis travaillent sur l'`Arc` cloné — la mutation est visible au
/// prochain appel sans toucher au call-site.
#[derive(Clone)]
pub struct AiProvider(pub Arc<RwLock<Arc<dyn Provider>>>);

impl AiProvider {
    #[must_use]
    pub fn from_provider(p: Arc<dyn Provider>) -> Self {
        Self(Arc::new(RwLock::new(p)))
    }

    /// Clone l'`Arc` courant. Tient le read lock le temps minimal — l'`Arc`
    /// retourné peut être utilisé sans bloquer d'autres lecteurs ni un
    /// futur swap.
    pub async fn snapshot(&self) -> Arc<dyn Provider> {
        self.0.read().await.clone()
    }

    pub async fn replace(&self, p: Arc<dyn Provider>) {
        *self.0.write().await = p;
    }
}

/// Provider spécifique pour les embeddings (modèle distinct du chat).
/// Phase 3.3 : Ollama avec `nomic-embed-text:latest` par défaut.
/// Phase 5 (P5.3) : interior-mutable comme `AiProvider`.
#[derive(Clone)]
pub struct AiEmbedder(pub Arc<RwLock<AiEmbedderInner>>);

#[derive(Clone)]
pub struct AiEmbedderInner {
    pub provider: Arc<OllamaProvider>,
    pub model: String,
}

impl AiEmbedder {
    #[must_use]
    pub fn from_parts(provider: Arc<OllamaProvider>, model: String) -> Self {
        Self(Arc::new(RwLock::new(AiEmbedderInner { provider, model })))
    }

    pub async fn snapshot(&self) -> AiEmbedderInner {
        self.0.read().await.clone()
    }

    pub async fn replace(&self, provider: Arc<OllamaProvider>, model: String) {
        *self.0.write().await = AiEmbedderInner { provider, model };
    }
}
