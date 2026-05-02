//! Recherche vectorielle pour la couche RAG.
//!
//! Phase 0 : implémentation BLOB + cosine pur Rust (cf. ADR 0005).
//! L'API publique exposée ici (`EmbeddingRepo`, `SearchFilter`) sera
//! stable lors de la migration future vers `sqlite-vec` en Phase 1.
//!
//! ## Format binaire
//!
//! Les vecteurs sont sérialisés en `f32` little-endian concaténés
//! (`dim × 4` octets). C'est le même layout que celui utilisé par
//! `sqlite-vec` pour ses colonnes `float[N]`, ce qui garantit qu'un
//! backfill futur n'aura **aucune transformation** à faire sur les
//! données déjà stockées.

pub mod vec;

pub use vec::{EmbeddingRepo, SearchFilter};
