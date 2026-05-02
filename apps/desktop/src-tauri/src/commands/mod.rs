//! Commandes Tauri exposées au front (`invoke('universe_list')`, etc.).
//!
//! Chaque commande est un thin wrapper sur `romanesk_core::Repo`.
//! Toutes prennent une `tauri::State<Database>` en paramètre — la base
//! est initialisée au `setup()` de l'app et partagée par cloning d'`Arc`
//! interne au pool sqlx.

// Les noms de fonctions répètent volontairement le nom du module
// (`universe::universe_create`) pour matcher exactement le nom invoqué
// côté front (`invoke('universe_create')`). Plus lisible.
#![allow(clippy::module_name_repetitions)]

pub mod ai;
pub mod entity;
pub mod era;
pub mod error;
pub mod event;
pub mod relation;
pub mod snapshot;
pub mod tag;
pub mod universe;

pub use error::{CommandError, CommandResult};
