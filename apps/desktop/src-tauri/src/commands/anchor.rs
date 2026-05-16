//! Commandes Tauri pour RealityAnchor + DivergencePoint + WorldBrief.

use romanesk_core::{
    BriefSource, Database, DivergenceAxis, DivergencePoint, NewDivergencePoint, NewRealityAnchor,
    NewWorldBrief, RealityAnchor, RealityMode, Repo, WorldBrief,
};
use serde::Deserialize;
use serde_json::Value;
use tauri::State;
use uuid::Uuid;

use super::CommandResult;

// -- RealityAnchor ----------------------------------------------------------

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpsertAnchorPayload {
    pub universe_id: String,
    pub mode: RealityMode,
    #[serde(default)]
    pub pivot_date: Option<String>,
    #[serde(default)]
    pub base_world: Option<String>,
    #[serde(default)]
    pub notes: Option<String>,
}

#[tauri::command]
pub async fn anchor_get_for_universe(
    db: State<'_, Database>,
    universe_id: String,
) -> CommandResult<Option<RealityAnchor>> {
    let id = Uuid::parse_str(&universe_id)?;
    Ok(Repo::new(db.inner().clone())
        .anchors()
        .get_for_universe(id)
        .await?)
}

#[tauri::command]
pub async fn anchor_upsert(
    db: State<'_, Database>,
    payload: UpsertAnchorPayload,
) -> CommandResult<RealityAnchor> {
    let universe_id = Uuid::parse_str(&payload.universe_id)?;
    let new = NewRealityAnchor {
        universe_id,
        mode: payload.mode,
        pivot_date: payload
            .pivot_date
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty()),
        base_world: payload
            .base_world
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty())
            .unwrap_or_else(|| "earth_real".into()),
        notes: payload
            .notes
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty()),
    };
    Ok(Repo::new(db.inner().clone()).anchors().upsert(new).await?)
}

#[tauri::command]
pub async fn anchor_delete(db: State<'_, Database>, id: String) -> CommandResult<()> {
    let id = Uuid::parse_str(&id)?;
    Repo::new(db.inner().clone()).anchors().delete(id).await?;
    Ok(())
}

// -- DivergencePoint --------------------------------------------------------

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateDivergencePayload {
    pub anchor_id: String,
    pub when_iso: String,
    pub axis: DivergenceAxis,
    pub title: String,
    #[serde(default)]
    pub description: Option<String>,
}

#[tauri::command]
pub async fn divergence_create(
    db: State<'_, Database>,
    payload: CreateDivergencePayload,
) -> CommandResult<DivergencePoint> {
    let anchor_id = Uuid::parse_str(&payload.anchor_id)?;
    let new = NewDivergencePoint {
        anchor_id,
        when_iso: payload.when_iso,
        axis: payload.axis,
        title: payload.title,
        description: payload
            .description
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty()),
    };
    Ok(Repo::new(db.inner().clone())
        .anchors()
        .divergence_create(new)
        .await?)
}

#[tauri::command]
pub async fn divergence_list(
    db: State<'_, Database>,
    anchor_id: String,
) -> CommandResult<Vec<DivergencePoint>> {
    let id = Uuid::parse_str(&anchor_id)?;
    Ok(Repo::new(db.inner().clone())
        .anchors()
        .divergence_list(id)
        .await?)
}

#[tauri::command]
pub async fn divergence_delete(db: State<'_, Database>, id: String) -> CommandResult<()> {
    let id = Uuid::parse_str(&id)?;
    Repo::new(db.inner().clone())
        .anchors()
        .divergence_delete(id)
        .await?;
    Ok(())
}

// -- WorldBrief -------------------------------------------------------------

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateBriefPayload {
    pub anchor_id: String,
    pub snapshot_date: String,
    pub content_json: Value,
    #[serde(default = "default_brief_source")]
    pub source: BriefSource,
    #[serde(default = "default_true")]
    pub pinned: bool,
}

const fn default_true() -> bool {
    true
}
const fn default_brief_source() -> BriefSource {
    BriefSource::Manual
}

#[tauri::command]
pub async fn brief_create(
    db: State<'_, Database>,
    payload: CreateBriefPayload,
) -> CommandResult<WorldBrief> {
    let anchor_id = Uuid::parse_str(&payload.anchor_id)?;
    let new = NewWorldBrief {
        anchor_id,
        snapshot_date: payload.snapshot_date,
        content_json: payload.content_json,
        source: payload.source,
        pinned: payload.pinned,
    };
    Ok(Repo::new(db.inner().clone())
        .anchors()
        .brief_create(new)
        .await?)
}

#[tauri::command]
pub async fn brief_list(
    db: State<'_, Database>,
    anchor_id: String,
) -> CommandResult<Vec<WorldBrief>> {
    let id = Uuid::parse_str(&anchor_id)?;
    Ok(Repo::new(db.inner().clone())
        .anchors()
        .brief_list(id)
        .await?)
}

#[tauri::command]
pub async fn brief_delete(db: State<'_, Database>, id: String) -> CommandResult<()> {
    let id = Uuid::parse_str(&id)?;
    Repo::new(db.inner().clone())
        .anchors()
        .brief_delete(id)
        .await?;
    Ok(())
}
