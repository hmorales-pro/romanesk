//! Provider IA mocké pour les tests.
//!
//! Conçu pour deux usages :
//! 1. **Tests unitaires** : staging de réponses prédéterminées (texte,
//!    embeddings, descriptions d'image, ping) avec compteurs d'appels.
//! 2. **CI offline** : remplacer `OllamaProvider` partout où un test
//!    a besoin de la couche IA mais ne doit pas dépendre d'un serveur
//!    Ollama qui tourne.
//!
//! Le design reste volontairement minimaliste — on n'assertit pas sur les
//! arguments des appels (à l'inverse de `mockall`), on stage juste les
//! réponses dans l'ordre. Suffisant pour Phase 0 ; on évoluera vers
//! `mockall` si on a besoin de matching plus fin.
//!
//! ## Exemple
//!
//! ```ignore
//! use romanesk_core::ai::{MockProvider, Provider, CompletionRequest};
//!
//! let mock = MockProvider::new();
//! mock.stage_completion("Bonjour !");
//!
//! let res = mock.complete(CompletionRequest::default()).await.unwrap();
//! assert_eq!(res.content, "Bonjour !");
//! assert_eq!(mock.completion_calls(), 1);
//! ```

use std::collections::VecDeque;
use std::sync::{Arc, Mutex};

use async_trait::async_trait;

use super::provider::{
    Capabilities, CompletionRequest, CompletionResponse, ImageInput, Provider, ProviderError,
    ProviderId,
};

#[derive(Default)]
struct MockState {
    canned_completions: VecDeque<Result<CompletionResponse, ProviderError>>,
    canned_embeddings: VecDeque<Result<Vec<Vec<f32>>, ProviderError>>,
    canned_image_descriptions: VecDeque<Result<String, ProviderError>>,
    canned_pings: VecDeque<Result<(), ProviderError>>,
    completion_calls: usize,
    embedding_calls: usize,
    image_calls: usize,
    ping_calls: usize,
}

#[derive(Clone)]
pub struct MockProvider {
    id: ProviderId,
    capabilities: Capabilities,
    state: Arc<Mutex<MockState>>,
}

impl Default for MockProvider {
    fn default() -> Self {
        Self::new()
    }
}

impl MockProvider {
    /// Construit un mock avec `ProviderId::Custom("mock")` et toutes les
    /// capacités activées (text, vision, embeddings, tool_use, long_context).
    /// Surcharger via [`Self::with_id`] et [`Self::with_capabilities`].
    #[must_use]
    pub fn new() -> Self {
        Self {
            id: ProviderId::Custom("mock".into()),
            capabilities: Capabilities {
                text: true,
                vision: true,
                embeddings: true,
                tool_use: true,
                long_context: true,
            },
            state: Arc::new(Mutex::new(MockState::default())),
        }
    }

    #[must_use]
    pub fn with_id(mut self, id: ProviderId) -> Self {
        self.id = id;
        self
    }

    #[must_use]
    pub fn with_capabilities(mut self, caps: Capabilities) -> Self {
        self.capabilities = caps;
        self
    }

    // ---- Stages ----------------------------------------------------------

    /// Stage une réponse texte simple. Le prochain appel à `complete` la
    /// renverra. Si plusieurs sont stagées, elles sont servies dans l'ordre.
    pub fn stage_completion(&self, content: impl Into<String>) -> &Self {
        self.stage_completion_full(CompletionResponse {
            content: content.into(),
            model: "mock".into(),
            usage: None,
            finish_reason: Some("stop".into()),
        })
    }

    /// Stage une réponse texte complète (avec usage, finish_reason custom).
    pub fn stage_completion_full(&self, response: CompletionResponse) -> &Self {
        self.lock().canned_completions.push_back(Ok(response));
        self
    }

    /// Stage une erreur pour le prochain `complete`.
    pub fn stage_completion_error(&self, err: ProviderError) -> &Self {
        self.lock().canned_completions.push_back(Err(err));
        self
    }

    /// Stage des embeddings pour le prochain `embed`.
    pub fn stage_embedding(&self, vectors: Vec<Vec<f32>>) -> &Self {
        self.lock().canned_embeddings.push_back(Ok(vectors));
        self
    }

    pub fn stage_embedding_error(&self, err: ProviderError) -> &Self {
        self.lock().canned_embeddings.push_back(Err(err));
        self
    }

    /// Stage une description d'image pour le prochain `describe_image`.
    pub fn stage_image_description(&self, desc: impl Into<String>) -> &Self {
        self.lock()
            .canned_image_descriptions
            .push_back(Ok(desc.into()));
        self
    }

    pub fn stage_image_description_error(&self, err: ProviderError) -> &Self {
        self.lock()
            .canned_image_descriptions
            .push_back(Err(err));
        self
    }

    /// Stage le résultat du prochain `ping` (par défaut `Ok(())` si rien stagé).
    pub fn stage_ping(&self, result: Result<(), ProviderError>) -> &Self {
        self.lock().canned_pings.push_back(result);
        self
    }

    // ---- Compteurs --------------------------------------------------------

    #[must_use]
    pub fn completion_calls(&self) -> usize {
        self.lock().completion_calls
    }

    #[must_use]
    pub fn embedding_calls(&self) -> usize {
        self.lock().embedding_calls
    }

    #[must_use]
    pub fn image_calls(&self) -> usize {
        self.lock().image_calls
    }

    #[must_use]
    pub fn ping_calls(&self) -> usize {
        self.lock().ping_calls
    }

    // ---- Internal ---------------------------------------------------------

    fn lock(&self) -> std::sync::MutexGuard<'_, MockState> {
        self.state.lock().expect("MockProvider mutex poisoned")
    }
}

#[async_trait]
impl Provider for MockProvider {
    fn id(&self) -> ProviderId {
        self.id.clone()
    }

    fn capabilities(&self) -> Capabilities {
        self.capabilities
    }

    async fn complete(
        &self,
        _req: CompletionRequest,
    ) -> Result<CompletionResponse, ProviderError> {
        // On enferme le verrou dans un bloc pour ne JAMAIS le tenir au-delà
        // d'un point de yield (même s'il n'y en a pas ici, c'est le pattern safe).
        let staged = {
            let mut state = self.lock();
            state.completion_calls += 1;
            state.canned_completions.pop_front()
        };
        staged.unwrap_or_else(|| {
            Ok(CompletionResponse {
                content: "(mock default)".into(),
                model: "mock".into(),
                usage: None,
                finish_reason: Some("stop".into()),
            })
        })
    }

    async fn embed(&self, texts: Vec<String>) -> Result<Vec<Vec<f32>>, ProviderError> {
        let staged = {
            let mut state = self.lock();
            state.embedding_calls += 1;
            state.canned_embeddings.pop_front()
        };
        staged.unwrap_or_else(|| {
            // Réponse par défaut : un vecteur de 384 zéros par texte d'entrée
            // (taille canonique d'un petit modèle d'embedding).
            Ok((0..texts.len()).map(|_| vec![0.0_f32; 384]).collect())
        })
    }

    async fn describe_image(
        &self,
        _img: ImageInput,
        _prompt: &str,
    ) -> Result<String, ProviderError> {
        let staged = {
            let mut state = self.lock();
            state.image_calls += 1;
            state.canned_image_descriptions.pop_front()
        };
        staged.unwrap_or_else(|| Ok("(mock image description)".into()))
    }

    async fn ping(&self) -> Result<(), ProviderError> {
        let staged = {
            let mut state = self.lock();
            state.ping_calls += 1;
            state.canned_pings.pop_front()
        };
        staged.unwrap_or(Ok(()))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn returns_staged_completion_in_order() {
        let mock = MockProvider::new();
        mock.stage_completion("first").stage_completion("second");

        let r1 = mock.complete(CompletionRequest::default()).await.unwrap();
        let r2 = mock.complete(CompletionRequest::default()).await.unwrap();
        assert_eq!(r1.content, "first");
        assert_eq!(r2.content, "second");
        assert_eq!(mock.completion_calls(), 2);
    }

    #[tokio::test]
    async fn returns_default_when_no_stage() {
        let mock = MockProvider::new();
        let res = mock.complete(CompletionRequest::default()).await.unwrap();
        assert_eq!(res.content, "(mock default)");
        assert_eq!(mock.completion_calls(), 1);
    }

    #[tokio::test]
    async fn propagates_staged_errors() {
        let mock = MockProvider::new();
        mock.stage_completion_error(ProviderError::Unavailable("down".into()));
        mock.stage_completion("recovered");

        let err = mock
            .complete(CompletionRequest::default())
            .await
            .expect_err("first call should fail");
        assert!(matches!(err, ProviderError::Unavailable(_)));

        let ok = mock.complete(CompletionRequest::default()).await.unwrap();
        assert_eq!(ok.content, "recovered");
        assert_eq!(mock.completion_calls(), 2);
    }

    #[tokio::test]
    async fn embed_default_returns_zeros_per_text() {
        let mock = MockProvider::new();
        let vecs = mock
            .embed(vec!["a".into(), "b".into(), "c".into()])
            .await
            .unwrap();
        assert_eq!(vecs.len(), 3);
        // Comparaison bit-à-bit pour éviter `clippy::float_cmp` :
        // un f32 vraiment égal à 0.0 a tous ses bits à zéro.
        assert!(vecs
            .iter()
            .all(|v| v.len() == 384 && v.iter().all(|x| x.to_bits() == 0)));
        assert_eq!(mock.embedding_calls(), 1);
    }

    #[tokio::test]
    async fn embed_returns_staged_vectors() {
        let mock = MockProvider::new();
        mock.stage_embedding(vec![vec![1.0_f32, 2.0], vec![3.0, 4.0]]);
        let v = mock
            .embed(vec!["x".into(), "y".into()])
            .await
            .unwrap();
        assert_eq!(v, vec![vec![1.0_f32, 2.0], vec![3.0, 4.0]]);
    }

    #[tokio::test]
    async fn ping_defaults_to_ok() {
        let mock = MockProvider::new();
        assert!(mock.ping().await.is_ok());
        assert_eq!(mock.ping_calls(), 1);
    }

    #[tokio::test]
    async fn ping_can_be_staged_to_fail() {
        let mock = MockProvider::new();
        mock.stage_ping(Err(ProviderError::Unavailable("nope".into())));
        let err = mock.ping().await.expect_err("staged failure");
        assert!(matches!(err, ProviderError::Unavailable(_)));
    }

    #[tokio::test]
    async fn capabilities_can_be_overridden() {
        let mock = MockProvider::new().with_capabilities(Capabilities {
            text: true,
            vision: false,
            embeddings: false,
            tool_use: false,
            long_context: false,
        });
        let caps = mock.capabilities();
        assert!(caps.text);
        assert!(!caps.vision);
    }

    #[tokio::test]
    async fn id_can_be_overridden() {
        let mock = MockProvider::new().with_id(ProviderId::Anthropic);
        assert_eq!(mock.id(), ProviderId::Anthropic);
    }
}
