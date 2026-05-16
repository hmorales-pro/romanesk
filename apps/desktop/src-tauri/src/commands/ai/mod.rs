//! Commandes Tauri pour la couche IA (Phase 3+).
//!
//! Le `Provider` est instancié au setup de l'app et stocké en `tauri::State`
//! sous la forme `AiProvider` (alias `Arc<RwLock<Arc<dyn Provider>>>`).
//! En P3.1 c'est systématiquement un `OllamaProvider` pointant sur
//! `localhost:11434` ; en P3.2+ l'URL et le modèle sont configurables
//! via `settings.json`. P5.3 a rendu les providers hot-reloadables.
//!
//! Ce module a été éclaté en sous-modules en P15.3 — la façade `mod.rs`
//! re-expose tous les types et toutes les commandes pour que les
//! call-sites (`commands::ai::ai_ping`, etc.) continuent de fonctionner.


mod complete;
mod delete;
mod describe;
mod draft;
mod import;
mod models;
mod pull;
mod rag;
mod state;
mod status;
mod util;

pub use complete::*;
pub use delete::*;
pub use describe::*;
pub use draft::*;
pub use import::*;
pub use models::*;
pub use pull::*;
pub use rag::*;
pub use state::*;
pub use status::*;
