//! Type d'erreur unique côté commandes Tauri.
//!
//! Tauri exige que `Result<T, E>` retourné par une commande ait un `E`
//! sérialisable via serde. `RepoError` ne dérive pas Serialize parce qu'il
//! contient des erreurs sqlx non-Serialize. On enveloppe donc dans un
//! `CommandError` qui sérialise vers une simple string lisible pour le front.

use serde::{Serialize, Serializer};

#[derive(Debug, thiserror::Error)]
pub enum CommandError {
    #[error("{0}")]
    Repo(#[from] romanesk_core::RepoError),

    #[error("{0}")]
    Db(#[from] romanesk_core::DbError),

    #[error("invalid uuid: {0}")]
    InvalidUuid(#[from] uuid::Error),

    #[error("{0}")]
    Other(String),
}

impl Serialize for CommandError {
    fn serialize<S: Serializer>(&self, s: S) -> Result<S::Ok, S::Error> {
        s.serialize_str(&self.to_string())
    }
}

pub type CommandResult<T> = Result<T, CommandError>;
