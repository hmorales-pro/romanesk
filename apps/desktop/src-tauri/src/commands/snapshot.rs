//! Commandes Tauri pour les snapshots temporels d'entités.

use romanesk_core::{Database, NewSnapshot, Repo, Snapshot};
use serde::Deserialize;
use serde_json::Value;
use tauri::State;
use uuid::Uuid;

use super::CommandResult;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateSnapshotPayload {
    pub entity_id: String,
    #[serde(default)]
    pub era_id: Option<String>,
    #[serde(default)]
    pub event_id: Option<String>,
    #[serde(default)]
    pub year_in_universe: Option<i64>,
    pub snapshot_json: Value,
    #[serde(default)]
    pub note: Option<String>,
}

#[tauri::command]
pub async fn snapshot_create(
    db: State<'_, Database>,
    payload: CreateSnapshotPayload,
) -> CommandResult<Snapshot> {
    let entity_id = Uuid::parse_str(&payload.entity_id)?;
    let era_id = payload
        .era_id
        .as_deref()
        .filter(|s| !s.is_empty())
        .map(Uuid::parse_str)
        .transpose()?;
    let event_id = payload
        .event_id
        .as_deref()
        .filter(|s| !s.is_empty())
        .map(Uuid::parse_str)
        .transpose()?;
    let new = NewSnapshot {
        entity_id,
        era_id,
        event_id,
        year_in_universe: payload.year_in_universe,
        snapshot_json: payload.snapshot_json,
        note: payload
            .note
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty()),
    };
    Ok(Repo::new(db.inner().clone())
        .snapshots()
        .create(new)
        .await?)
}

#[tauri::command]
pub async fn snapshot_list_for_entity(
    db: State<'_, Database>,
    entity_id: String,
) -> CommandResult<Vec<Snapshot>> {
    let id = Uuid::parse_str(&entity_id)?;
    Ok(Repo::new(db.inner().clone())
        .snapshots()
        .list_for_entity(id)
        .await?)
}

#[tauri::command]
pub async fn snapshot_get(
    db: State<'_, Database>,
    id: String,
) -> CommandResult<Option<Snapshot>> {
    let id = Uuid::parse_str(&id)?;
    Ok(Repo::new(db.inner().clone()).snapshots().get(id).await?)
}

#[tauri::command]
pub async fn snapshot_delete(db: State<'_, Database>, id: String) -> CommandResult<()> {
    let id = Uuid::parse_str(&id)?;
    Repo::new(db.inner().clone()).snapshots().delete(id).await?;
    Ok(())
}
