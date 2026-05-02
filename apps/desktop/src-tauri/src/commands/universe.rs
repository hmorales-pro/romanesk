//! Commandes Tauri pour les univers.

use romanesk_core::{Database, NewUniverse, Repo, Universe};
use tauri::State;
use uuid::Uuid;

use super::{CommandError, CommandResult};

#[tauri::command]
pub async fn universe_list(db: State<'_, Database>) -> CommandResult<Vec<Universe>> {
    let universes = Repo::new(db.inner().clone()).universes().list().await?;
    Ok(universes)
}

#[tauri::command]
pub async fn universe_create(
    db: State<'_, Database>,
    name: String,
    description: Option<String>,
) -> CommandResult<Universe> {
    if name.trim().is_empty() {
        return Err(CommandError::Other("name must not be empty".into()));
    }
    let new = NewUniverse {
        name: name.trim().to_string(),
        description: description
            .map(|d| d.trim().to_string())
            .filter(|d| !d.is_empty()),
        settings: serde_json::json!({}),
    };
    let created = Repo::new(db.inner().clone())
        .universes()
        .create(new)
        .await?;
    Ok(created)
}

#[tauri::command]
pub async fn universe_get(
    db: State<'_, Database>,
    id: String,
) -> CommandResult<Option<Universe>> {
    let id = Uuid::parse_str(&id)?;
    let res = Repo::new(db.inner().clone()).universes().get(id).await?;
    Ok(res)
}

#[tauri::command]
pub async fn universe_delete(db: State<'_, Database>, id: String) -> CommandResult<()> {
    let id = Uuid::parse_str(&id)?;
    Repo::new(db.inner().clone())
        .universes()
        .soft_delete(id)
        .await?;
    Ok(())
}
