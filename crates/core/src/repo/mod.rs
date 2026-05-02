//! Repository pattern : seul point d'accès en écriture/lecture aux entités.
//!
//! Convention : un seul struct [`Repo`] qui détient un [`Database`] et
//! expose des sous-handles thématiques (`universes()`, `entities()`).
//! Aucune méthode ne prend `&mut self` — la concurrence est gérée par le
//! pool sqlx, donc `Repo: Send + Sync + Clone` (à condition que `Database`
//! le soit, ce qui est le cas).

pub mod entity;
pub mod error;
pub mod relation;
pub mod tag;
pub mod universe;

pub use entity::EntityRepo;
pub use error::{RepoError, RepoResult};
pub use relation::RelationRepo;
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

    /// Accès direct au [`Database`] sous-jacent. Utile pour les tests ou
    /// pour des requêtes ad-hoc qu'on ne veut pas (encore) figer en repo.
    #[must_use]
    pub fn db(&self) -> &Database {
        &self.db
    }
}
