//! Migrator sqlx, embarque le SQL des migrations à la compilation.
//!
//! Le chemin `../../db/migrations` est résolu relativement au `Cargo.toml`
//! de `crates/core`, donc pointe sur `<workspace>/db/migrations/`.

use sqlx::migrate::Migrator;

pub static MIGRATOR: Migrator = sqlx::migrate!("../../db/migrations");
