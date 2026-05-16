//! Commandes Tauri pour les fiches d'entités.
//!
//! Depuis la Phase 1, ces commandes sont **génériques** sur le type
//! (`EntityType`) : Character, Location, Faction, Object, Concept, RealEntity.
//! Le contenu typé spécifique à chaque type est porté par `content_json`,
//! côté front (lib/types.ts), via des builders dédiés (`characterCreate`,
//! `locationCreate`, …) qui construisent le JSON adapté.

use std::path::{Path, PathBuf};

use base64::Engine;
use romanesk_core::{Database, Entity, EntityType, NewEntity, Repo, UpdateEntity};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::{Manager, State};
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

    let created = Repo::new(db.inner().clone()).entities().create(new).await?;
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
pub async fn entity_get(db: State<'_, Database>, id: String) -> CommandResult<Option<Entity>> {
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

// ---------------------------------------------------------------------------
// Cover image — stockée physiquement dans <app_data_dir>/media/<universe>/<entity>/
// ---------------------------------------------------------------------------

/// Réponse de `entity_get_cover_image_data` : l'image décodée en base64
/// avec son type MIME, prête à être affichée via `<img src="data:..." />`.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CoverImageData {
    pub mime: String,
    pub data_base64: String,
}

/// Copie un fichier image source dans le répertoire de données Romanesk
/// et associe son chemin relatif à l'entité. Si une image existe déjà,
/// elle est supprimée avant la copie.
///
/// `source_path` est un chemin absolu vers le fichier choisi par
/// l'utilisateur (typiquement obtenu via `tauri-plugin-dialog`).
#[tauri::command]
pub async fn entity_set_cover_image(
    app: tauri::AppHandle,
    db: State<'_, Database>,
    entity_id: String,
    source_path: String,
) -> CommandResult<String> {
    let id = Uuid::parse_str(&entity_id)?;
    let repo = Repo::new(db.inner().clone());

    let entity = repo
        .entities()
        .get(id)
        .await?
        .ok_or(CommandError::Other(format!("entity {id} not found")))?;

    let source = PathBuf::from(&source_path);
    if !source.is_file() {
        return Err(CommandError::Other(format!(
            "source file not found: {source_path}",
        )));
    }
    let ext = source
        .extension()
        .and_then(|e| e.to_str())
        .map(str::to_lowercase)
        .unwrap_or_else(|| "bin".into());
    if !is_supported_image_ext(&ext) {
        return Err(CommandError::Other(format!(
            "unsupported image extension: .{ext} (jpg/jpeg/png/gif/webp uniquement)",
        )));
    }

    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| CommandError::Other(format!("app_data_dir unavailable: {e}")))?;

    let target_dir = app_data_dir
        .join("media")
        .join(entity.universe_id.to_string())
        .join(entity.id.to_string());
    std::fs::create_dir_all(&target_dir)
        .map_err(|e| CommandError::Other(format!("create media dir: {e}")))?;

    // Supprime l'ancienne image si elle existe et qu'elle est dans notre arbo.
    if let Some(old_rel) = entity.cover_image.as_deref() {
        let old_abs = app_data_dir.join(old_rel);
        if old_abs.starts_with(&app_data_dir) && old_abs.is_file() {
            let _ = std::fs::remove_file(&old_abs);
        }
    }

    // Nom de fichier horodaté pour éviter le cache navigateur sur le même path.
    let ts = chrono::Utc::now().timestamp_millis();
    let filename = format!("cover_{ts}.{ext}");
    let target_abs = target_dir.join(&filename);
    std::fs::copy(&source, &target_abs)
        .map_err(|e| CommandError::Other(format!("copy file: {e}")))?;

    // On stocke le chemin RELATIF à app_data_dir pour rester portable
    // (ex. si l'utilisateur déplace son répertoire de données).
    let rel_path: PathBuf = [
        "media",
        &entity.universe_id.to_string(),
        &entity.id.to_string(),
        &filename,
    ]
    .iter()
    .collect();
    let rel_str = rel_path.to_string_lossy().to_string();

    repo.entities().set_cover_image(id, Some(&rel_str)).await?;

    Ok(rel_str)
}

/// Lit le fichier image associé à une entité et le renvoie en base64.
/// Renvoie `None` si l'entité n'a pas d'image (ou si le fichier a disparu).
#[tauri::command]
pub async fn entity_get_cover_image_data(
    app: tauri::AppHandle,
    db: State<'_, Database>,
    entity_id: String,
) -> CommandResult<Option<CoverImageData>> {
    let id = Uuid::parse_str(&entity_id)?;
    let entity = Repo::new(db.inner().clone())
        .entities()
        .get(id)
        .await?
        .ok_or(CommandError::Other(format!("entity {id} not found")))?;

    let Some(rel) = entity.cover_image.as_deref() else {
        return Ok(None);
    };

    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| CommandError::Other(format!("app_data_dir unavailable: {e}")))?;
    let abs = app_data_dir.join(rel);
    if !abs.is_file() {
        // Le fichier a été supprimé manuellement ; on nettoie la DB.
        Repo::new(db.inner().clone())
            .entities()
            .set_cover_image(id, None)
            .await?;
        return Ok(None);
    }

    let bytes = std::fs::read(&abs).map_err(|e| CommandError::Other(format!("read image: {e}")))?;
    let mime = mime_for_path(&abs);
    let b64 = base64::engine::general_purpose::STANDARD.encode(&bytes);

    Ok(Some(CoverImageData {
        mime,
        data_base64: b64,
    }))
}

/// Supprime l'image de couverture (DB + fichier physique).
#[tauri::command]
pub async fn entity_clear_cover_image(
    app: tauri::AppHandle,
    db: State<'_, Database>,
    entity_id: String,
) -> CommandResult<()> {
    let id = Uuid::parse_str(&entity_id)?;
    let repo = Repo::new(db.inner().clone());

    let entity = repo
        .entities()
        .get(id)
        .await?
        .ok_or(CommandError::Other(format!("entity {id} not found")))?;

    if let Some(rel) = entity.cover_image.as_deref() {
        if let Ok(app_data_dir) = app.path().app_data_dir() {
            let abs = app_data_dir.join(rel);
            if abs.starts_with(&app_data_dir) && abs.is_file() {
                let _ = std::fs::remove_file(&abs);
            }
        }
    }

    repo.entities().set_cover_image(id, None).await?;
    Ok(())
}

fn is_supported_image_ext(ext: &str) -> bool {
    matches!(ext, "jpg" | "jpeg" | "png" | "gif" | "webp")
}

fn mime_for_path(path: &Path) -> String {
    match path
        .extension()
        .and_then(|e| e.to_str())
        .map(str::to_lowercase)
        .as_deref()
    {
        Some("jpg" | "jpeg") => "image/jpeg",
        Some("png") => "image/png",
        Some("gif") => "image/gif",
        Some("webp") => "image/webp",
        _ => "application/octet-stream",
    }
    .to_string()
}
