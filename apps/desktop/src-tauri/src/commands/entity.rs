//! Commandes Tauri pour les fiches d'entités (Phase 0 : Personnage uniquement).

use romanesk_core::{Database, Entity, EntityType, NewEntity, Repo};
use serde::Deserialize;
use serde_json::json;
use tauri::State;
use uuid::Uuid;

use super::{CommandError, CommandResult};

/// Payload accepté par `entity_create` côté front.
///
/// Phase 0 cible uniquement les `Character`. Le contenu typé (archétype,
/// traits, biographie) est replié dans `lore_entities.content_json`
/// par `entity_create`.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateEntityPayload {
    pub universe_id: String,
    pub name: String,
    #[serde(default)]
    pub summary: Option<String>,
    #[serde(default)]
    pub archetype: Option<String>,
    #[serde(default)]
    pub traits: Vec<String>,
    #[serde(default)]
    pub biography: Option<String>,
}

#[tauri::command]
pub async fn entity_list_in_universe(
    db: State<'_, Database>,
    universe_id: String,
) -> CommandResult<Vec<Entity>> {
    let uid = Uuid::parse_str(&universe_id)?;
    let entities = Repo::new(db.inner().clone())
        .entities()
        .list_in_universe(uid, Some(EntityType::Character))
        .await?;
    Ok(entities)
}

#[tauri::command]
pub async fn entity_create(
    db: State<'_, Database>,
    payload: CreateEntityPayload,
) -> CommandResult<Entity> {
    if payload.name.trim().is_empty() {
        return Err(CommandError::Other("name must not be empty".into()));
    }
    let universe_id = Uuid::parse_str(&payload.universe_id)?;

    let traits: Vec<String> = payload
        .traits
        .into_iter()
        .map(|t| t.trim().to_string())
        .filter(|t| !t.is_empty())
        .collect();

    let content = json!({
        "archetype": payload.archetype.as_ref().filter(|s| !s.trim().is_empty()),
        "traits": traits,
        "biography": payload.biography.as_ref().filter(|s| !s.trim().is_empty()),
    });

    let new = NewEntity {
        universe_id,
        kind: EntityType::Character,
        name: payload.name.trim().to_string(),
        summary: payload.summary.filter(|s| !s.trim().is_empty()),
        content,
        cover_image: None,
        is_real: false,
    };

    let created = Repo::new(db.inner().clone())
        .entities()
        .create(new)
        .await?;
    Ok(created)
}

#[tauri::command]
pub async fn entity_get(
    db: State<'_, Database>,
    id: String,
) -> CommandResult<Option<Entity>> {
    let id = Uuid::parse_str(&id)?;
    let res = Repo::new(db.inner().clone()).entities().get(id).await?;
    Ok(res)
}

#[tauri::command]
pub async fn entity_delete(db: State<'_, Database>, id: String) -> CommandResult<()> {
    let id = Uuid::parse_str(&id)?;
    Repo::new(db.inner().clone())
        .entities()
        .soft_delete(id)
        .await?;
    Ok(())
}
