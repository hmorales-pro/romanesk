//! Commandes Tauri pour les fiches d'entités (Phase 0 : Personnage uniquement).

use romanesk_core::{Database, Entity, EntityType, NewEntity, Repo, UpdateEntity};
use serde::Deserialize;
use serde_json::{json, Value};
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

/// Payload accepté par `entity_update`. La biographie est typée `Value`
/// (opaque pour Rust) parce que côté front elle peut être :
/// - `null` : la fiche n'a pas encore de biographie
/// - une **string** : ancienne fiche créée pré-J8 avant Tiptap
/// - un **objet ProseMirror** : `{ type: 'doc', content: [...] }` produit
///   par Tiptap (cas standard depuis J8).
/// Aucune validation ProseMirror côté Rust — ce serait plus de complexité
/// pour pas grand gain en Phase 0.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateEntityPayload {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub summary: Option<String>,
    #[serde(default)]
    pub archetype: Option<String>,
    #[serde(default)]
    pub traits: Vec<String>,
    #[serde(default)]
    pub biography: Option<Value>,
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

    let traits: Vec<String> = payload
        .traits
        .into_iter()
        .map(|t| t.trim().to_string())
        .filter(|t| !t.is_empty())
        .collect();

    let biography = payload
        .biography
        .filter(|v| !is_empty_biography(v));

    let content = json!({
        "archetype": payload.archetype.as_ref().filter(|s| !s.trim().is_empty()),
        "traits": traits,
        "biography": biography,
    });

    let update = UpdateEntity {
        name: payload.name.trim().to_string(),
        summary: payload.summary.filter(|s| !s.trim().is_empty()),
        content,
        cover_image: None,
        is_real: false,
    };

    let updated = Repo::new(db.inner().clone())
        .entities()
        .update(id, update)
        .await?;
    Ok(updated)
}

/// Considère une biographie comme vide si c'est `null`, une string vide,
/// ou un doc ProseMirror dont aucun nœud feuille ne porte de texte.
///
/// Important : un doc Tiptap par défaut produit
/// `{ type: "doc", content: [{ type: "paragraph" }] }` — `content` non vide,
/// mais visuellement vide. Une comparaison superficielle laisserait passer
/// ce cas, d'où la récursion via [`is_empty_node`].
fn is_empty_biography(v: &Value) -> bool {
    match v {
        Value::Null => true,
        Value::String(s) => s.trim().is_empty(),
        Value::Object(_) => is_empty_node(v),
        _ => false,
    }
}

fn is_empty_node(v: &Value) -> bool {
    let Value::Object(map) = v else {
        return true;
    };
    if let Some(text) = map.get("text").and_then(|t| t.as_str()) {
        return text.trim().is_empty();
    }
    map.get("content")
        .and_then(|c| c.as_array())
        .map_or(true, |arr| arr.iter().all(is_empty_node))
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
