//! Repository pattern : seul point d'accès en écriture/lecture aux entités.
//!
//! Convention : un seul struct [`Repo`] qui détient un [`Database`] et
//! expose des sous-handles thématiques (`universes()`, `entities()`).
//! Aucune méthode ne prend `&mut self` — la concurrence est gérée par le
//! pool sqlx, donc `Repo: Send + Sync + Clone` (à condition que `Database`
//! le soit, ce qui est le cas).

pub mod anchor;
pub mod entity;
pub mod era;
pub mod error;
pub mod event;
pub mod relation;
pub mod snapshot;
pub mod tag;
pub mod universe;

pub use anchor::AnchorRepo;
pub use entity::EntityRepo;
pub use era::EraRepo;
pub use error::{RepoError, RepoResult};
pub use event::EventRepo;
pub use relation::RelationRepo;
pub use snapshot::SnapshotRepo;
pub use tag::TagRepo;
pub use universe::UniverseRepo;

use crate::db::Database;

#[derive(Debug, Clone)]
pub struct Repo {
    db: Database,
}

impl Repo {
    #[must_use]
    pub fn new(db: Database) -> Self {
        Self { db }
    }

    #[must_use]
    pub fn universes(&self) -> UniverseRepo<'_> {
        UniverseRepo::new(&self.db)
    }

    #[must_use]
    pub fn entities(&self) -> EntityRepo<'_> {
        EntityRepo::new(&self.db)
    }

    #[must_use]
    pub fn relations(&self) -> RelationRepo<'_> {
        RelationRepo::new(&self.db)
    }

    #[must_use]
    pub fn tags(&self) -> TagRepo<'_> {
        TagRepo::new(&self.db)
    }

    #[must_use]
    pub fn eras(&self) -> EraRepo<'_> {
        EraRepo::new(&self.db)
    }

    #[must_use]
    pub fn events(&self) -> EventRepo<'_> {
        EventRepo::new(&self.db)
    }

    #[must_use]
    pub fn snapshots(&self) -> SnapshotRepo<'_> {
        SnapshotRepo::new(&self.db)
    }

    #[must_use]
    pub fn embeddings(&self) -> crate::rag::EmbeddingRepo<'_> {
        crate::rag::EmbeddingRepo::new(&self.db)
    }

    #[must_use]
    pub fn anchors(&self) -> AnchorRepo<'_> {
        AnchorRepo::new(&self.db)
    }

    /// Accès direct au [`Database`] sous-jacent. Utile pour les tests ou
    /// pour des requêtes ad-hoc qu'on ne veut pas (encore) figer en repo.
    #[must_use]
    pub fn db(&self) -> &Database {
        &self.db
    }
}
