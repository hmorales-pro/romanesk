//! Commandes Tauri pour les tags (transversaux par univers).

use romanesk_core::{Database, NewTag, Repo, Tag};
use serde::{Deserialize, Serialize};
use tauri::State;
use uuid::Uuid;

use super::CommandResult;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateTagPayload {
    pub universe_id: String,
    pub name: String,
    #[serde(default)]
    pub color: Option<String>,
}

#[tauri::command]
pub async fn tag_create_in_universe(
    db: State<'_, Database>,
    payload: CreateTagPayload,
) -> CommandResult<Tag> {
    let universe_id = Uuid::parse_str(&payload.universe_id)?;
    let new = NewTag {
        universe_id,
        name: payload.name,
        color: payload.color.filter(|c| !c.trim().is_empty()),
    };
    Ok(Repo::new(db.inner().clone())
        .tags()
        .find_or_create(new)
        .await?)
}

#[tauri::command]
pub async fn tag_list_in_universe(
    db: State<'_, Database>,
    universe_id: String,
) -> CommandResult<Vec<Tag>> {
    let id = Uuid::parse_str(&universe_id)?;
    Ok(Repo::new(db.inner().clone())
        .tags()
        .list_in_universe(id)
        .await?)
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EntityTagAssociation {
    pub entity_id: String,
    pub tag_id: String,
}

#[tauri::command]
pub async fn tag_associations_in_universe(
    db: State<'_, Database>,
    universe_id: String,
) -> CommandResult<Vec<EntityTagAssociation>> {
    let id = Uuid::parse_str(&universe_id)?;
    let pairs = Repo::new(db.inner().clone())
        .tags()
        .associations_in_universe(id)
        .await?;
    Ok(pairs
        .into_iter()
        .map(|(e, t)| EntityTagAssociation {
            entity_id: e.to_string(),
            tag_id: t.to_string(),
        })
        .collect())
}

#[tauri::command]
pub async fn tag_get_for_entity(
    db: State<'_, Database>,
    entity_id: String,
) -> CommandResult<Vec<Tag>> {
    let id = Uuid::parse_str(&entity_id)?;
    Ok(Repo::new(db.inner().clone())
        .tags()
        .get_for_entity(id)
        .await?)
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SetTagsForEntityPayload {
    pub entity_id: String,
    pub tag_ids: Vec<String>,
}

#[tauri::command]
pub async fn tag_set_for_entity(
    db: State<'_, Database>,
    payload: SetTagsForEntityPayload,
) -> CommandResult<()> {
    let entity_id = Uuid::parse_str(&payload.entity_id)?;
    let tag_ids: Result<Vec<Uuid>, _> =
        payload.tag_ids.iter().map(|s| Uuid::parse_str(s)).collect();
    let tag_ids = tag_ids?;
    Repo::new(db.inner().clone())
        .tags()
        .set_for_entity(entity_id, &tag_ids)
        .await?;
    Ok(())
}

#[tauri::command]
pub async fn tag_delete(db: State<'_, Database>, id: String) -> CommandResult<()> {
    let id = Uuid::parse_str(&id)?;
    Repo::new(db.inner().clone()).tags().delete(id).await?;
    Ok(())
}
