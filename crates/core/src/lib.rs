//! Romanesk core — logique métier réutilisable.
//!
//! Modules:
//! - [`ai`] : abstraction provider IA (trait `Provider` + impls Ollama, Anthropic, OpenAI…)
//! - [`db`] : connexion SQLite + migrations versionnées (`sqlx::migrate!`)
//! - [`domain`] : types métier persistés (Universe, Entity…)
//! - [`repo`] : repository pattern pour les entités SQLite
//! - [`rag`] : chunking + embeddings + recherche vectorielle (Phase 0 — J4, à venir)
//! - [`reality`] : `RealityAnchor`, `WorldBrief`, `DivergencePoint` (Phase 3, à venir)
//!
//! Phase 0 : on assouplit volontairement quelques lints pedantic le temps
//! que la surface API se stabilise. À durcir en Phase 1.

#![allow(clippy::missing_errors_doc)]
#![allow(clippy::missing_panics_doc)]
// `must_use` sur `&self` qui renvoie un futur : sqlx renvoie déjà un futur,
// l'appelant est forcé de l'await. Annotation redondante.
#![allow(clippy::future_not_send)]

pub mod ai;
pub mod db;
pub mod domain;
pub mod export;
pub mod rag;
pub mod repo;
// pub mod reality;  // Phase 3

// Re-exports stratégiques pour les consommateurs (apps/desktop notamment).
pub use db::{Database, DbError};
pub use domain::{
    Embedding, EmbeddingHit, Entity, EntityType, Era, Event, NewEmbedding, NewEntity,
    NewEra, NewEvent, NewRelation, NewSnapshot, NewTag, NewUniverse, Relation,
    RelationType, Snapshot, SourceType, Tag, UpdateEntity, UpdateEra, UpdateEvent, Universe,
};
pub use rag::{EmbeddingRepo, SearchFilter};
pub use repo::{Repo, RepoError, RepoResult};
pub use repo::{EntityRepo, EraRepo, EventRepo, RelationRepo, SnapshotRepo, TagRepo, UniverseRepo};
