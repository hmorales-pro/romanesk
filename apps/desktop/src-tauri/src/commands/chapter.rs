//! Commandes Tauri pour les chapitres (Phase 4).
//!
//! Le `body_json` est un doc Tiptap/ProseMirror passé tel quel par le front.
//! Le `word_count` est calculé côté front (l'éditeur a la source de vérité)
//! et envoyé avec chaque update — éviter de re-parser le doc côté Rust.

use romanesk_core::{Chapter, ChapterStatus, Database, NewChapter, Repo, UpdateChapter};
use serde::Deserialize;
use serde_json::Value;
use tauri::State;
use uuid::Uuid;

use super::{CommandError, CommandResult};

fn parse_chapter_status(s: &str) -> Result<ChapterStatus, CommandError> {
    ChapterStatus::parse(s)
        .ok_or_else(|| CommandError::Other(format!("unknown chapter status: {s:?}")))
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateChapterPayload {
    pub story_id: String,
    #[serde(default)]
    pub title: Option<String>,
    /// Doc Tiptap (objet JSON). `None` = doc vide auto-créé.
    #[serde(default)]
    pub body_json: Option<Value>,
    /// `None` = auto MAX(sort_order)+1.
    #[serde(default)]
    pub sort_order: Option<i64>,
    #[serde(default)]
    pub era_id: Option<String>,
}

#[tauri::command]
pub async fn chapter_create(
    db: State<'_, Database>,
    payload: CreateChapterPayload,
) -> CommandResult<Chapter> {
    let story_id = Uuid::parse_str(&payload.story_id)?;
    let era_id = payload
        .era_id
        .as_deref()
        .filter(|s| !s.is_empty())
        .map(Uuid::parse_str)
        .transpose()?;
    let new = NewChapter {
        story_id,
        title: payload
            .title
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty()),
        body_json: payload.body_json,
        sort_order: payload.sort_order,
        era_id,
    };
    Ok(Repo::new(db.inner().clone()).chapters().create(new).await?)
}

#[tauri::command]
pub async fn chapter_list_for_story(
    db: State<'_, Database>,
    story_id: String,
) -> CommandResult<Vec<Chapter>> {
    let id = Uuid::parse_str(&story_id)?;
    Ok(Repo::new(db.inner().clone())
        .chapters()
        .list_for_story(id)
        .await?)
}

#[tauri::command]
pub async fn chapter_get(db: State<'_, Database>, id: String) -> CommandResult<Option<Chapter>> {
    let id = Uuid::parse_str(&id)?;
    Ok(Repo::new(db.inner().clone()).chapters().get(id).await?)
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateChapterPayload {
    pub id: String,
    #[serde(default)]
    pub title: Option<String>,
    pub body_json: Value,
    pub word_count: i64,
    pub status: String,
    #[serde(default)]
    pub era_id: Option<String>,
}

#[tauri::command]
pub async fn chapter_update(
    db: State<'_, Database>,
    payload: UpdateChapterPayload,
) -> CommandResult<Chapter> {
    let id = Uuid::parse_str(&payload.id)?;
    let era_id = payload
        .era_id
        .as_deref()
        .filter(|s| !s.is_empty())
        .map(Uuid::parse_str)
        .transpose()?;
    let status = parse_chapter_status(&payload.status)?;
    let update = UpdateChapter {
        title: payload
            .title
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty()),
        body_json: payload.body_json,
        word_count: payload.word_count,
        status,
        era_id,
    };
    Ok(Repo::new(db.inner().clone())
        .chapters()
        .update(id, update)
        .await?)
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReorderChaptersItem {
    pub id: String,
    pub sort_order: i64,
}

#[tauri::command]
pub async fn chapter_reorder(
    db: State<'_, Database>,
    order: Vec<ReorderChaptersItem>,
) -> CommandResult<()> {
    let parsed: Result<Vec<(Uuid, i64)>, _> = order
        .into_iter()
        .map(|i| Uuid::parse_str(&i.id).map(|u| (u, i.sort_order)))
        .collect();
    Repo::new(db.inner().clone())
        .chapters()
        .reorder(&parsed?)
        .await?;
    Ok(())
}

#[tauri::command]
pub async fn chapter_delete(db: State<'_, Database>, id: String) -> CommandResult<()> {
    let id = Uuid::parse_str(&id)?;
    Repo::new(db.inner().clone()).chapters().delete(id).await?;
    Ok(())
}
