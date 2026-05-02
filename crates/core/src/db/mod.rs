//! Couche DB : connexion SQLite + migrations.
//!
//! Voir l'ADR `0004-migrations.md` pour le choix de `sqlx::migrate!` plutôt
//! que `refinery`.

pub mod connection;
pub mod migrations;

pub use connection::{Database, DbError};
pub use migrations::MIGRATOR;
