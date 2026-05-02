//! Commandes Tauri pour les époques (timeline_eras).

use romanesk_core::{Database, Era, NewEra, Repo, UpdateEra};
use serde::Deserialize;
use tauri::State;
use uuid::Uuid;

use super::CommandResult;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateEraPayload {
    pub universe_id: String,
    pub name: String,
    #[serde(default)]
    pub start_year: Option<i64>,
    #[serde(default)]
    pub end_year: Option<i64>,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default)]
    pub color: Option<String>,
    #[serde(default)]
    pub sort_order: Option<i64>,
}

#[tauri::command]
pub async fn era_create(
    db: State<'_, Database>,
    payload: CreateEraPayload,
) -> CommandResult<Era> {
    let universe_id = Uuid::parse_str(&payload.universe_id)?;
    let new = NewEra {
        universe_id,
        name: payload.name,
        start_year: payload.start_year,
        end_year: payload.end_year,
        description: payload
            .description
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty()),
        color: payload.color.filter(|c| !c.trim().is_empty()),
        sort_order: payload.sort_order.unwrap_or(0),
    };
    Ok(Repo::new(db.inner().clone()).eras().create(new).await?)
}

#[tauri::command]
pub async fn era_list_in_universe(
    db: State<'_, Database>,
    universe_id: String,
) -> CommandResult<Vec<Era>> {
    let id = Uuid::parse_str(&universe_id)?;
    Ok(Repo::new(db.inner().clone())
        .eras()
        .list_in_universe(id)
        .await?)
}

#[tauri::command]
pub async fn era_get(db: State<'_, Database>, id: String) -> CommandResult<Option<Era>> {
    let id = Uuid::parse_str(&id)?;
    Ok(Repo::new(db.inner().clone()).eras().get(id).await?)
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateEraPayload {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub start_year: Option<i64>,
    #[serde(default)]
    pub end_year: Option<i64>,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default)]
    pub color: Option<String>,
    #[serde(default)]
    pub sort_order: Option<i64>,
}

#[tauri::command]
pub async fn era_update(
    db: State<'_, Database>,
    payload: UpdateEraPayload,
) -> CommandResult<Era> {
    let id = Uuid::parse_str(&payload.id)?;
    let update = UpdateEra {
        name: payload.name,
        start_year: payload.start_year,
        end_year: payload.end_year,
        description: payload
            .description
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty()),
        color: payload.color.filter(|c| !c.trim().is_empty()),
        sort_order: payload.sort_order.unwrap_or(0),
    };
    Ok(Repo::new(db.inner().clone()).eras().update(id, update).await?)
}

#[tauri::command]
pub async fn era_delete(db: State<'_, Database>, id: String) -> CommandResult<()> {
    let id = Uuid::parse_str(&id)?;
    Repo::new(db.inner().clone()).eras().delete(id).await?;
    Ok(())
}
