//! Erreurs typées pour la couche [`crate::repo`].

use thiserror::Error;

#[derive(Debug, Error)]
pub enum RepoError {
    #[error("entity not found")]
    NotFound,

    #[error("invalid input: {0}")]
    Invalid(String),

    #[error("inconsistent data in row: {0}")]
    Inconsistent(String),

    #[error("database error: {0}")]
    Sqlx(#[from] sqlx::Error),

    #[error("json serialization error: {0}")]
    Json(#[from] serde_json::Error),

    #[error("uuid parse error: {0}")]
    Uuid(#[from] uuid::Error),
}

pub type RepoResult<T> = Result<T, RepoError>;
