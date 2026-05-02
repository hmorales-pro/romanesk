//! Romanesk core — logique métier réutilisable.
//!
//! Modules:
//! - [`ai`] : abstraction provider IA (trait `Provider` + impls Ollama, Anthropic, OpenAI…)
//! - [`repo`] : repository pattern pour les entités SQLite (TODO)
//! - [`rag`] : chunking + embeddings + recherche vectorielle (TODO)
//! - [`reality`] : `RealityAnchor`, `WorldBrief`, `DivergencePoint` (TODO)

pub mod ai;
// pub mod repo;     // Phase 0 — J3
// pub mod rag;      // Phase 0 — J4
// pub mod reality;  // Phase 3
