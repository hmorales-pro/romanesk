//! Wrapper sur un pool sqlx-sqlite + helper pour ouvrir une DB en mémoire
//! ou sur disque, avec migrations automatiques au démarrage.
//!
//! ## Pourquoi le pool est limité à 1 pour `new_in_memory()`
//!
//! En SQLite, une DB `:memory:` est **par-connexion** : deux connexions
//! distinctes ouvrent deux bases différentes. Pour partager l'état entre
//! les requêtes d'un même test, on force `max_connections = 1`.
//!
//! Pour la version sur disque, on garde le pool par défaut de sqlx
//! (typiquement 10 connexions max).

use std::path::Path;
use std::str::FromStr;

use sqlx::sqlite::{SqliteConnectOptions, SqliteJournalMode, SqlitePool, SqlitePoolOptions};
use thiserror::Error;

use super::migrations::MIGRATOR;

#[derive(Debug, Error)]
pub enum DbError {
    #[error("database connection error: {0}")]
    Connect(#[from] sqlx::Error),

    #[error("migration error: {0}")]
    Migrate(#[from] sqlx::migrate::MigrateError),

    #[error("invalid database path or url: {0}")]
    InvalidPath(String),
}

/// Handle persistant sur la base de données Romanesk.
///
/// Cloner un `Database` partage le même pool (cheap : `Arc` interne).
#[derive(Debug, Clone)]
pub struct Database {
    pool: SqlitePool,
}

impl Database {
    /// Ouvre (ou crée) une base sur disque, applique les migrations.
    ///
    /// Le mode WAL est activé pour permettre les lectures concurrentes
    /// pendant qu'une écriture est en cours. `foreign_keys = ON` est
    /// activé pour faire respecter les FK ON DELETE CASCADE des migrations.
    pub async fn open(path: impl AsRef<Path>) -> Result<Self, DbError> {
        let opts = SqliteConnectOptions::new()
            .filename(path.as_ref())
            .create_if_missing(true)
            .foreign_keys(true)
            .journal_mode(SqliteJournalMode::Wal);

        let pool = SqlitePoolOptions::new().connect_with(opts).await?;
        MIGRATOR.run(&pool).await?;
        Ok(Self { pool })
    }

    /// Crée une base SQLite **en mémoire**, applique les migrations.
    ///
    /// Idéal pour les tests : pas de fichier à nettoyer, pas de collision
    /// entre tests qui tournent en parallèle (chaque appel à `new_in_memory`
    /// crée sa propre base).
    pub async fn new_in_memory() -> Result<Self, DbError> {
        let opts = SqliteConnectOptions::from_str("sqlite::memory:")
            .map_err(|e| DbError::InvalidPath(e.to_string()))?
            .foreign_keys(true);

        let pool = SqlitePoolOptions::new()
            .max_connections(1)
            .connect_with(opts)
            .await?;
        MIGRATOR.run(&pool).await?;
        Ok(Self { pool })
    }

    /// Accès au pool sqlx pour les modules `repo::*`.
    #[must_use]
    pub fn pool(&self) -> &SqlitePool {
        &self.pool
    }

    /// Ferme proprement le pool (drainage des connexions actives).
    /// Utile en fin de programme pour s'assurer que les WAL sont commités.
    pub async fn close(self) {
        self.pool.close().await;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn in_memory_opens_and_migrates() {
        let db = Database::new_in_memory().await.expect("open in-memory");
        // Vérifie qu'au moins une table de la migration 0001 existe.
        let row: (i64,) = sqlx::query_as(
            "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='universes'",
        )
        .fetch_one(db.pool())
        .await
        .expect("query sqlite_master");
        assert_eq!(row.0, 1, "table `universes` doit exister après migration");
    }

    #[tokio::test]
    async fn foreign_keys_pragma_is_on() {
        let db = Database::new_in_memory().await.expect("open in-memory");
        let row: (i64,) = sqlx::query_as("PRAGMA foreign_keys")
            .fetch_one(db.pool())
            .await
            .expect("query pragma");
        assert_eq!(row.0, 1, "PRAGMA foreign_keys doit être ON");
    }
}
