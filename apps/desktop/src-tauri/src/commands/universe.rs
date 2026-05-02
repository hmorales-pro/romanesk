//! Commandes Tauri pour les univers.

use romanesk_core::export::render_universe_markdown;
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

/// Exporte un univers entier (univers + fiches + relations) en Markdown.
/// Le contenu est renvoyé tel quel ; le front s'occupe de copier dans le
/// presse-papier ou de proposer un téléchargement.
#[tauri::command]
pub async fn universe_export_markdown(
    db: State<'_, Database>,
    id: String,
) -> CommandResult<String> {
    let id = Uuid::parse_str(&id)?;
    let repo = Repo::new(db.inner().clone());

    let universe = repo
        .universes()
        .get(id)
        .await?
        .ok_or(CommandError::Other(format!("universe {id} not found")))?;
    let entities = repo.entities().list_in_universe(id, None).await?;
    let relations = repo.relations().list_in_universe(id).await?;

    Ok(render_universe_markdown(&universe, &entities, &relations))
}
