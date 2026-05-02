//! Commandes Tauri pour les événements (events).

use romanesk_core::{Database, Event, NewEvent, Repo, UpdateEvent};
use serde::Deserialize;
use tauri::State;
use uuid::Uuid;

use super::{CommandError, CommandResult};

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateEventPayload {
    pub universe_id: String,
    #[serde(default)]
    pub era_id: Option<String>,
    pub name: String,
    #[serde(default)]
    pub year: Option<i64>,
    #[serde(default)]
    pub description: Option<String>,
}

#[tauri::command]
pub async fn event_create(
    db: State<'_, Database>,
    payload: CreateEventPayload,
) -> CommandResult<Event> {
    let universe_id = Uuid::parse_str(&payload.universe_id)?;
    let era_id = payload
        .era_id
        .as_deref()
        .filter(|s| !s.is_empty())
        .map(Uuid::parse_str)
        .transpose()?;
    let new = NewEvent {
        universe_id,
        era_id,
        name: payload.name,
        year: payload.year,
        description: payload
            .description
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty()),
    };
    Ok(Repo::new(db.inner().clone()).events().create(new).await?)
}

#[tauri::command]
pub async fn event_list_in_universe(
    db: State<'_, Database>,
    universe_id: String,
) -> CommandResult<Vec<Event>> {
    let id = Uuid::parse_str(&universe_id)?;
    Ok(Repo::new(db.inner().clone())
        .events()
        .list_in_universe(id)
        .await?)
}

#[tauri::command]
pub async fn event_list_in_era(
    db: State<'_, Database>,
    era_id: String,
) -> CommandResult<Vec<Event>> {
    let id = Uuid::parse_str(&era_id)?;
    Ok(Repo::new(db.inner().clone()).events().list_in_era(id).await?)
}

#[tauri::command]
pub async fn event_get(
    db: State<'_, Database>,
    id: String,
) -> CommandResult<Option<Event>> {
    let id = Uuid::parse_str(&id)?;
    Ok(Repo::new(db.inner().clone()).events().get(id).await?)
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateEventPayload {
    pub id: String,
    #[serde(default)]
    pub era_id: Option<String>,
    pub name: String,
    #[serde(default)]
    pub year: Option<i64>,
    #[serde(default)]
    pub description: Option<String>,
}

#[tauri::command]
pub async fn event_update(
    db: State<'_, Database>,
    payload: UpdateEventPayload,
) -> CommandResult<Event> {
    let id = Uuid::parse_str(&payload.id)?;
    let era_id = payload
        .era_id
        .as_deref()
        .filter(|s| !s.is_empty())
        .map(Uuid::parse_str)
        .transpose()?;
    let update = UpdateEvent {
        era_id,
        name: payload.name,
        year: payload.year,
        description: payload
            .description
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty()),
    };
    Ok(Repo::new(db.inner().clone())
        .events()
        .update(id, update)
        .await?)
}

#[tauri::command]
pub async fn event_delete(db: State<'_, Database>, id: String) -> CommandResult<()> {
    let id = Uuid::parse_str(&id)?;
    Repo::new(db.inner().clone()).events().delete(id).await?;
    Ok(())
}
