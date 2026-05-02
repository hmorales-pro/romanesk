//! Commandes Tauri pour les fiches d'entités.
//!
//! Depuis la Phase 1, ces commandes sont **génériques** sur le type
//! (`EntityType`) : Character, Location, Faction, Object, Concept, RealEntity.
//! Le contenu typé spécifique à chaque type est porté par `content_json`,
//! côté front (lib/types.ts), via des builders dédiés (`characterCreate`,
//! `locationCreate`, …) qui construisent le JSON adapté.

use romanesk_core::{Database, Entity, EntityType, NewEntity, Repo, UpdateEntity};
use serde::Deserialize;
use serde_json::Value;
use tauri::State;
use uuid::Uuid;

use super::{CommandError, CommandResult};

/// Payload générique de création. Le `kind` détermine le `EntityType`,
/// le `content` est un JSON libre dont la forme est imposée côté front
/// (`CharacterContent`, `LocationContent`, etc. dans lib/types.ts).
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateEntityPayload {
    pub universe_id: String,
    pub kind: EntityType,
    pub name: String,
    #[serde(default)]
    pub summary: Option<String>,
    #[serde(default = "default_empty_object")]
    pub content: Value,
    #[serde(default)]
    pub cover_image: Option<String>,
    #[serde(default)]
    pub is_real: bool,
}

fn default_empty_object() -> Value {
    Value::Object(serde_json::Map::new())
}

/// Liste les entités d'un univers. Si `kind` est `None` (envoyé `null`
/// côté JS), tous les types sont renvoyés. Sinon, filtre sur le type donné.
#[tauri::command]
pub async fn entity_list_in_universe(
    db: State<'_, Database>,
    universe_id: String,
    kind: Option<EntityType>,
) -> CommandResult<Vec<Entity>> {
    let uid = Uuid::parse_str(&universe_id)?;
    let entities = Repo::new(db.inner().clone())
        .entities()
        .list_in_universe(uid, kind)
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

    let new = NewEntity {
        universe_id,
        kind: payload.kind,
        name: payload.name.trim().to_string(),
        summary: payload.summary.filter(|s| !s.trim().is_empty()),
        content: payload.content,
        cover_image: payload.cover_image.filter(|s| !s.trim().is_empty()),
        is_real: payload.is_real,
    };

    let created = Repo::new(db.inner().clone())
        .entities()
        .create(new)
        .await?;
    Ok(created)
}

/// Payload générique de mise à jour. Mêmes conventions que pour la création.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateEntityPayload {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub summary: Option<String>,
    #[serde(default = "default_empty_object")]
    pub content: Value,
    #[serde(default)]
    pub cover_image: Option<String>,
    #[serde(default)]
    pub is_real: bool,
}

#[tauri::command]
pub async fn entity_update(
    db: State<'_, Database>,
    payload: UpdateEntityPayload,
) -> CommandResult<Entity> {
    if payload.name.trim().is_empty() {
        return Err(CommandError::Other("name must not be empty".into()));
    }
    let id = Uuid::parse_str(&payload.id)?;

    let update = UpdateEntity {
        name: payload.name.trim().to_string(),
        summary: payload.summary.filter(|s| !s.trim().is_empty()),
        content: payload.content,
        cover_image: payload.cover_image.filter(|s| !s.trim().is_empty()),
        is_real: payload.is_real,
    };

    let updated = Repo::new(db.inner().clone())
        .entities()
        .update(id, update)
        .await?;
    Ok(updated)
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
