//! Commandes Tauri pour les relations entre entités du lore.

use romanesk_core::{Database, NewRelation, Relation, RelationType, Repo};
use serde::Deserialize;
use tauri::State;
use uuid::Uuid;

use super::{CommandError, CommandResult};

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateRelationPayload {
    pub source_id: String,
    pub target_id: String,
    /// Sérialisé sous le nom JSON `type` pour matcher le wrapper TS.
    #[serde(rename = "type")]
    pub kind: RelationType,
    #[serde(default)]
    pub era_id: Option<String>,
    #[serde(default)]
    pub description: Option<String>,
}

#[tauri::command]
pub async fn relation_create(
    db: State<'_, Database>,
    payload: CreateRelationPayload,
) -> CommandResult<Relation> {
    let source_id = Uuid::parse_str(&payload.source_id)?;
    let target_id = Uuid::parse_str(&payload.target_id)?;
    let era_id = payload
        .era_id
        .as_deref()
        .filter(|s| !s.is_empty())
        .map(Uuid::parse_str)
        .transpose()?;

    let new = NewRelation {
        source_id,
        target_id,
        kind: payload.kind,
        era_id,
        description: payload
            .description
            .map(|d| d.trim().to_string())
            .filter(|d| !d.is_empty()),
    };

    let created = Repo::new(db.inner().clone())
        .relations()
        .create(new)
        .await?;
    Ok(created)
}

/// Liste les relations qui touchent une entité (source OU target).
#[tauri::command]
pub async fn relation_list_for_entity(
    db: State<'_, Database>,
    entity_id: String,
) -> CommandResult<Vec<Relation>> {
    let id = Uuid::parse_str(&entity_id)?;
    let rels = Repo::new(db.inner().clone())
        .relations()
        .list_for_entity(id)
        .await?;
    Ok(rels)
}

/// Liste toutes les relations d'un univers (vue graphe globale).
#[tauri::command]
pub async fn relation_list_in_universe(
    db: State<'_, Database>,
    universe_id: String,
) -> CommandResult<Vec<Relation>> {
    let id = Uuid::parse_str(&universe_id)?;
    let rels = Repo::new(db.inner().clone())
        .relations()
        .list_in_universe(id)
        .await?;
    Ok(rels)
}

#[tauri::command]
pub async fn relation_delete(db: State<'_, Database>, id: String) -> CommandResult<()> {
    let id = Uuid::parse_str(&id)?;
    Repo::new(db.inner().clone()).relations().delete(id).await?;
    Ok(())
}
