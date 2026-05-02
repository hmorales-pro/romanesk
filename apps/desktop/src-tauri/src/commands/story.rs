//! Commandes Tauri pour les stories (récits — Phase 4).
//!
//! Une story est rattachée à un univers (cas standard) ou orpheline (brouillon
//! libre). Elle sert de racine au module chapitres / écriture assistée IA.

use romanesk_core::export::render_story_markdown;
use romanesk_core::{Database, NewStory, Repo, Story, StoryType, UpdateStory};
use serde::Deserialize;
use tauri::State;
use uuid::Uuid;

use super::{CommandError, CommandResult};

fn parse_story_type(s: &str) -> Result<StoryType, CommandError> {
    StoryType::parse(s).ok_or_else(|| CommandError::Other(format!("unknown story type: {s:?}")))
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateStoryPayload {
    /// `None` = story orpheline (pas rattachée à un univers).
    #[serde(default)]
    pub universe_id: Option<String>,
    pub title: String,
    /// Sérialisé en snake_case côté front : `"novel"`, `"novella"`,
    /// `"short_story"`, `"series"`.
    #[serde(rename = "type")]
    pub kind: String,
    #[serde(default)]
    pub synopsis: Option<String>,
    #[serde(default)]
    pub status: Option<String>,
    #[serde(default)]
    pub target_word_count: Option<i64>,
    #[serde(default)]
    pub pivot_era_id: Option<String>,
}

#[tauri::command]
pub async fn story_create(
    db: State<'_, Database>,
    payload: CreateStoryPayload,
) -> CommandResult<Story> {
    let universe_id = payload
        .universe_id
        .as_deref()
        .map(Uuid::parse_str)
        .transpose()?;
    let pivot_era_id = payload
        .pivot_era_id
        .as_deref()
        .filter(|s| !s.is_empty())
        .map(Uuid::parse_str)
        .transpose()?;
    let kind = parse_story_type(&payload.kind)?;

    let new = NewStory {
        universe_id,
        title: payload.title,
        kind,
        synopsis: payload
            .synopsis
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty()),
        status: payload
            .status
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty()),
        target_word_count: payload.target_word_count,
        pivot_era_id,
    };
    Ok(Repo::new(db.inner().clone()).stories().create(new).await?)
}

#[tauri::command]
pub async fn story_list_in_universe(
    db: State<'_, Database>,
    universe_id: String,
) -> CommandResult<Vec<Story>> {
    let id = Uuid::parse_str(&universe_id)?;
    Ok(Repo::new(db.inner().clone())
        .stories()
        .list_in_universe(id)
        .await?)
}

#[tauri::command]
pub async fn story_get(db: State<'_, Database>, id: String) -> CommandResult<Option<Story>> {
    let id = Uuid::parse_str(&id)?;
    Ok(Repo::new(db.inner().clone()).stories().get(id).await?)
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateStoryPayload {
    pub id: String,
    pub title: String,
    #[serde(rename = "type")]
    pub kind: String,
    #[serde(default)]
    pub synopsis: Option<String>,
    pub status: String,
    #[serde(default)]
    pub target_word_count: Option<i64>,
    #[serde(default)]
    pub pivot_era_id: Option<String>,
}

#[tauri::command]
pub async fn story_update(
    db: State<'_, Database>,
    payload: UpdateStoryPayload,
) -> CommandResult<Story> {
    let id = Uuid::parse_str(&payload.id)?;
    let pivot_era_id = payload
        .pivot_era_id
        .as_deref()
        .filter(|s| !s.is_empty())
        .map(Uuid::parse_str)
        .transpose()?;
    let kind = parse_story_type(&payload.kind)?;

    let update = UpdateStory {
        title: payload.title,
        kind,
        synopsis: payload
            .synopsis
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty()),
        status: payload.status,
        target_word_count: payload.target_word_count,
        pivot_era_id,
    };
    Ok(Repo::new(db.inner().clone())
        .stories()
        .update(id, update)
        .await?)
}

#[tauri::command]
pub async fn story_delete(db: State<'_, Database>, id: String) -> CommandResult<()> {
    let id = Uuid::parse_str(&id)?;
    Repo::new(db.inner().clone()).stories().delete(id).await?;
    Ok(())
}

/// Exporte une story complète (titre + synopsis + chapitres) en Markdown.
/// Le rendu inclut les chapitres dans l'ordre `sort_order` et convertit le
/// `body_json` Tiptap via `render_tiptap_doc`. Phase 6 (P6.5).
#[tauri::command]
pub async fn story_export_markdown(
    db: State<'_, Database>,
    id: String,
) -> CommandResult<String> {
    let story_id = Uuid::parse_str(&id)?;
    let repo = Repo::new(db.inner().clone());
    let story = repo
        .stories()
        .get(story_id)
        .await?
        .ok_or_else(|| CommandError::Other(format!("story {story_id} not found")))?;
    let chapters = repo.chapters().list_for_story(story_id).await?;
    Ok(render_story_markdown(&story, &chapters))
}
