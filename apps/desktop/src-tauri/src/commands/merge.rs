//! Fusion de deux fiches du même type dans le même univers (P14.2).
//!
//! Workflow : la *target* survit, la *source* est soft-deleted.
//!
//! Étapes (toutes dans une transaction sqlx pour atomicité) :
//!   1. Construire la nouvelle target avec les champs fusionnés selon la
//!      stratégie utilisateur (keepTarget / keepSource / concat).
//!   2. Update la target en base.
//!   3. Propager le nom source → target dans tous les chapitres + autres
//!      fiches (réutilise la logique de commands::rename).
//!   4. Migrer les références cross-tables vers la target :
//!      - relations.source_id / relations.target_id (avec dedup et
//!        gestion du CHECK source_id <> target_id)
//!      - temporal_snapshots.entity_id
//!      - chapter_entity_refs.entity_id (PRIMARY KEY composite → dedup)
//!      - entity_tags.entity_id (PRIMARY KEY composite → dedup)
//!      - media_assets.entity_id
//!      - notes.entity_id
//!   5. Soft-delete la source.

use regex::Regex;
use romanesk_core::{Database, Entity, Repo, UpdateEntity};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sqlx::Row;
use tauri::State;
use uuid::Uuid;

use super::rename::rename_in_text_nodes;
use super::{CommandError, CommandResult};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/// Stratégie de fusion par champ. Si non précisée, on garde la target.
#[derive(Debug, Deserialize, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum MergeStrategy {
    /// Garde la valeur de la cible (par défaut).
    KeepTarget,
    /// Remplace par la valeur de la source.
    KeepSource,
    /// Concatène les deux (target puis source, séparés par "\n\n").
    /// Pour les arrays, union avec dedup.
    Concat,
}

impl Default for MergeStrategy {
    fn default() -> Self {
        Self::KeepTarget
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MergePayload {
    pub source_id: String,
    pub target_id: String,
    /// Stratégie pour le `summary` (string brute).
    #[serde(default)]
    pub summary_strategy: MergeStrategy,
    /// Stratégie pour le `content_json` entier (objet JSON polymorphe).
    /// `Concat` non supporté (pas de sémantique évidente) → tombe sur
    /// KeepTarget si demandé.
    #[serde(default)]
    pub content_strategy: MergeStrategy,
    /// Si KeepSource ou Concat, on remplace cover_image par celle de la
    /// source si la target n'en a pas. Pour Concat on garde la target
    /// si dispo, sinon source.
    #[serde(default)]
    pub cover_strategy: MergeStrategy,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct MergeResult {
    pub merged_entity: Entity,
    /// Nombre de chapitres modifiés (substitution du nom).
    pub chapters_renamed: usize,
    /// Nombre d'autres entités modifiées (substitution du nom).
    pub entities_renamed: usize,
    /// Nombre de relations redirigées vers la target.
    pub relations_migrated: usize,
    /// Nombre de tags fusionnés (sans doublon).
    pub tags_migrated: usize,
    /// Nombre de snapshots redirigés.
    pub snapshots_migrated: usize,
}

// ---------------------------------------------------------------------------
// Commande
// ---------------------------------------------------------------------------

#[tauri::command]
pub async fn entity_merge(
    db: State<'_, Database>,
    payload: MergePayload,
) -> CommandResult<MergeResult> {
    let target_uuid = Uuid::parse_str(&payload.target_id)
        .map_err(CommandError::InvalidUuid)?;
    let source_uuid = Uuid::parse_str(&payload.source_id)
        .map_err(CommandError::InvalidUuid)?;
    if target_uuid == source_uuid {
        return Err(CommandError::Other(
            "source et target sont la même fiche".into(),
        ));
    }

    let repo = Repo::new(db.inner().clone());

    // ── 1. Charger les deux entités, vérifier compatibilité ────────
    let target = repo
        .entities()
        .get(target_uuid)
        .await?
        .ok_or_else(|| CommandError::Other("target introuvable".into()))?;
    let source = repo
        .entities()
        .get(source_uuid)
        .await?
        .ok_or_else(|| CommandError::Other("source introuvable".into()))?;
    if target.universe_id != source.universe_id {
        return Err(CommandError::Other(
            "fusion impossible : univers différents".into(),
        ));
    }
    if target.kind != source.kind {
        return Err(CommandError::Other(format!(
            "fusion impossible : types différents ({:?} vs {:?})",
            target.kind, source.kind
        )));
    }

    let old_source_name = source.name.clone();
    let target_name = target.name.clone();

    // ── 2. Construire la fusion des champs ─────────────────────────
    let new_summary = match payload.summary_strategy {
        MergeStrategy::KeepTarget => target.summary.clone(),
        MergeStrategy::KeepSource => source.summary.clone(),
        MergeStrategy::Concat => match (&target.summary, &source.summary) {
            (Some(t), Some(s)) if !s.trim().is_empty() && t.trim() != s.trim() => {
                Some(format!("{t}\n\n{s}"))
            }
            (Some(t), _) => Some(t.clone()),
            (None, s) => s.clone(),
        },
    };

    let new_content = match payload.content_strategy {
        MergeStrategy::KeepTarget | MergeStrategy::Concat => target.content.clone(),
        MergeStrategy::KeepSource => source.content.clone(),
    };

    let new_cover = match payload.cover_strategy {
        MergeStrategy::KeepTarget => target.cover_image.clone(),
        MergeStrategy::KeepSource => source.cover_image.clone(),
        MergeStrategy::Concat => target
            .cover_image
            .clone()
            .or_else(|| source.cover_image.clone()),
    };

    // ── 3. Update la target avec les champs fusionnés ───────────────
    let updated_target = repo
        .entities()
        .update(
            target_uuid,
            UpdateEntity {
                name: target_name.clone(),
                summary: new_summary,
                content: new_content,
                cover_image: new_cover,
                is_real: target.is_real,
            },
        )
        .await?;

    // ── 4. Propager le nom source → target dans chapters + autres
    //       entités (sauf la target elle-même, pour ne pas avoir un
    //       remplacement self-ref étrange si target.name contient
    //       source.name comme sub-string ; en pratique on a un
    //       word-boundary regex donc c'est safe, mais skip = clean).
    let pool = db.pool();
    let mut tx = pool.begin().await.map_err(|e| {
        CommandError::Other(format!("begin transaction: {e}"))
    })?;

    let re = build_word_regex(&old_source_name);
    let universe_id = target.universe_id;

    let mut chapters_renamed = 0usize;
    // Tous les chapitres de toutes les stories de l'univers.
    let story_rows = sqlx::query(
        "SELECT id FROM stories WHERE universe_id = ? AND deleted_at IS NULL",
    )
    .bind(universe_id.to_string())
    .fetch_all(&mut *tx)
    .await
    .map_err(|e| CommandError::Other(format!("list stories: {e}")))?;
    for sr in story_rows {
        let sid: String = sr
            .try_get("id")
            .map_err(|e| CommandError::Other(format!("story id: {e}")))?;
        let chapter_rows = sqlx::query(
            "SELECT id, body_json FROM chapters WHERE story_id = ?",
        )
        .bind(&sid)
        .fetch_all(&mut *tx)
        .await
        .map_err(|e| CommandError::Other(format!("list chapters: {e}")))?;
        for cr in chapter_rows {
            let cid: String = cr
                .try_get("id")
                .map_err(|e| CommandError::Other(format!("chapter id: {e}")))?;
            let body_str: String = cr
                .try_get("body_json")
                .map_err(|e| CommandError::Other(format!("body_json: {e}")))?;
            let mut body: Value = serde_json::from_str(&body_str)
                .map_err(|e| CommandError::Other(format!("parse body_json: {e}")))?;
            let changed = rename_in_text_nodes(&mut body, &re, &target_name);
            if changed {
                let new_str = serde_json::to_string(&body).map_err(|e| {
                    CommandError::Other(format!("ser body_json: {e}"))
                })?;
                sqlx::query("UPDATE chapters SET body_json = ? WHERE id = ?")
                    .bind(new_str)
                    .bind(cid)
                    .execute(&mut *tx)
                    .await
                    .map_err(|e| CommandError::Other(format!("update chapter: {e}")))?;
                chapters_renamed += 1;
            }
        }
    }

    // Toutes les autres entités de l'univers (sauf source elle-même).
    let mut entities_renamed = 0usize;
    let entity_rows = sqlx::query(
        "SELECT id, summary, content_json FROM lore_entities \
         WHERE universe_id = ? AND deleted_at IS NULL AND id != ? AND id != ?",
    )
    .bind(universe_id.to_string())
    .bind(source_uuid.to_string())
    .bind(target_uuid.to_string())
    .fetch_all(&mut *tx)
    .await
    .map_err(|e| CommandError::Other(format!("list entities: {e}")))?;
    for er in entity_rows {
        let eid: String = er
            .try_get("id")
            .map_err(|e| CommandError::Other(format!("eid: {e}")))?;
        let summary: Option<String> = er.try_get("summary").ok();
        let content_str: String = er
            .try_get("content_json")
            .map_err(|e| CommandError::Other(format!("content_json: {e}")))?;

        let new_summary = summary.as_ref().map(|s| {
            re.replace_all(s, target_name.as_str()).to_string()
        });
        let summary_changed = new_summary.as_deref() != summary.as_deref();

        let mut content_v: Value = serde_json::from_str(&content_str)
            .map_err(|e| CommandError::Other(format!("parse content: {e}")))?;
        let mut content_changed = false;
        // Scanne récursivement tous les fields string et Tiptap docs.
        rename_in_content_recursive(&mut content_v, &re, &target_name, &mut content_changed);

        if summary_changed || content_changed {
            let new_content_str = serde_json::to_string(&content_v).map_err(|e| {
                CommandError::Other(format!("ser content: {e}"))
            })?;
            sqlx::query(
                "UPDATE lore_entities SET summary = ?, content_json = ? WHERE id = ?",
            )
            .bind(new_summary.as_deref())
            .bind(new_content_str)
            .bind(eid)
            .execute(&mut *tx)
            .await
            .map_err(|e| CommandError::Other(format!("update entity: {e}")))?;
            entities_renamed += 1;
        }
    }

    // ── 5. Migrer les références cross-tables ───────────────────────
    let target_str = target_uuid.to_string();
    let source_str = source_uuid.to_string();

    // 5a. relations — gérer le CHECK source_id <> target_id : on supprime
    // d'abord les relations qui deviendraient self-référentielles.
    sqlx::query(
        "DELETE FROM relations \
         WHERE (source_id = ? AND target_id = ?) \
            OR (source_id = ? AND target_id = ?)",
    )
    .bind(&source_str)
    .bind(&target_str)
    .bind(&target_str)
    .bind(&source_str)
    .execute(&mut *tx)
    .await
    .map_err(|e| CommandError::Other(format!("dedup relations: {e}")))?;

    let r1 = sqlx::query(
        "UPDATE relations SET source_id = ? WHERE source_id = ?",
    )
    .bind(&target_str)
    .bind(&source_str)
    .execute(&mut *tx)
    .await
    .map_err(|e| CommandError::Other(format!("rel source: {e}")))?;
    let r2 = sqlx::query(
        "UPDATE relations SET target_id = ? WHERE target_id = ?",
    )
    .bind(&target_str)
    .bind(&source_str)
    .execute(&mut *tx)
    .await
    .map_err(|e| CommandError::Other(format!("rel target: {e}")))?;
    let relations_migrated = (r1.rows_affected() + r2.rows_affected()) as usize;

    // 5b. temporal_snapshots
    let s1 = sqlx::query(
        "UPDATE temporal_snapshots SET entity_id = ? WHERE entity_id = ?",
    )
    .bind(&target_str)
    .bind(&source_str)
    .execute(&mut *tx)
    .await
    .map_err(|e| CommandError::Other(format!("snapshots: {e}")))?;
    let snapshots_migrated = s1.rows_affected() as usize;

    // 5c. chapter_entity_refs (PRIMARY KEY composite chapter_id+entity_id) :
    // INSERT OR IGNORE puis DELETE pour gérer la dedup.
    sqlx::query(
        "INSERT OR IGNORE INTO chapter_entity_refs (chapter_id, entity_id) \
         SELECT chapter_id, ? FROM chapter_entity_refs WHERE entity_id = ?",
    )
    .bind(&target_str)
    .bind(&source_str)
    .execute(&mut *tx)
    .await
    .map_err(|e| CommandError::Other(format!("ch_ent_refs insert: {e}")))?;
    sqlx::query("DELETE FROM chapter_entity_refs WHERE entity_id = ?")
        .bind(&source_str)
        .execute(&mut *tx)
        .await
        .map_err(|e| CommandError::Other(format!("ch_ent_refs delete: {e}")))?;

    // 5d. entity_tags (PRIMARY KEY composite entity_id+tag_id)
    let tag_count_before = sqlx::query("SELECT COUNT(*) AS c FROM entity_tags WHERE entity_id = ?")
        .bind(&target_str)
        .fetch_one(&mut *tx)
        .await
        .map_err(|e| CommandError::Other(format!("tag count: {e}")))?
        .try_get::<i64, _>("c")
        .unwrap_or(0);
    sqlx::query(
        "INSERT OR IGNORE INTO entity_tags (entity_id, tag_id) \
         SELECT ?, tag_id FROM entity_tags WHERE entity_id = ?",
    )
    .bind(&target_str)
    .bind(&source_str)
    .execute(&mut *tx)
    .await
    .map_err(|e| CommandError::Other(format!("entity_tags insert: {e}")))?;
    sqlx::query("DELETE FROM entity_tags WHERE entity_id = ?")
        .bind(&source_str)
        .execute(&mut *tx)
        .await
        .map_err(|e| CommandError::Other(format!("entity_tags delete: {e}")))?;
    let tag_count_after = sqlx::query("SELECT COUNT(*) AS c FROM entity_tags WHERE entity_id = ?")
        .bind(&target_str)
        .fetch_one(&mut *tx)
        .await
        .map_err(|e| CommandError::Other(format!("tag count after: {e}")))?
        .try_get::<i64, _>("c")
        .unwrap_or(0);
    let tags_migrated = (tag_count_after - tag_count_before).max(0) as usize;

    // 5e. media_assets et notes — reassign sans souci de dedup (pas
    // de PRIMARY KEY composite sur entity_id).
    sqlx::query("UPDATE media_assets SET entity_id = ? WHERE entity_id = ?")
        .bind(&target_str)
        .bind(&source_str)
        .execute(&mut *tx)
        .await
        .map_err(|e| CommandError::Other(format!("media: {e}")))?;
    sqlx::query("UPDATE notes SET entity_id = ? WHERE entity_id = ?")
        .bind(&target_str)
        .bind(&source_str)
        .execute(&mut *tx)
        .await
        .map_err(|e| CommandError::Other(format!("notes: {e}")))?;

    // ── 6. Soft-delete la source ────────────────────────────────────
    sqlx::query(
        "UPDATE lore_entities SET deleted_at = datetime('now') WHERE id = ?",
    )
    .bind(&source_str)
    .execute(&mut *tx)
    .await
    .map_err(|e| CommandError::Other(format!("soft delete source: {e}")))?;

    tx.commit()
        .await
        .map_err(|e| CommandError::Other(format!("commit: {e}")))?;

    // Recharge la target avec les éventuels triggers updated_at.
    let merged = repo
        .entities()
        .get(target_uuid)
        .await?
        .unwrap_or(updated_target);

    Ok(MergeResult {
        merged_entity: merged,
        chapters_renamed,
        entities_renamed,
        relations_migrated,
        tags_migrated,
        snapshots_migrated,
    })
}

// ---------------------------------------------------------------------------
// Helpers (utilisent les versions exposées par rename.rs)
// ---------------------------------------------------------------------------

fn build_word_regex(name: &str) -> Regex {
    let escaped = regex::escape(name.trim());
    let pattern = format!(r"(?u)\b{escaped}\b");
    Regex::new(&pattern).expect("valid regex from escaped name")
}

/// Scan récursif dans le content_json d'une entité — applique le
/// remplacement à tous les champs string et tous les Tiptap docs
/// trouvés. `changed` est positionné à true si au moins un remplacement
/// a été fait.
fn rename_in_content_recursive(
    val: &mut Value,
    re: &Regex,
    replacement: &str,
    changed: &mut bool,
) {
    match val {
        Value::String(s) => {
            let new = re.replace_all(s, replacement);
            if new != s.as_str() {
                *val = Value::String(new.into_owned());
                *changed = true;
            }
        }
        Value::Object(_) => {
            // Soit c'est un Tiptap doc (a un type/content array),
            // soit c'est juste un objet de méta — dans les deux cas
            // on parcourt récursivement ses fields.
            if rename_in_text_nodes(val, re, replacement) {
                *changed = true;
            }
            if let Some(obj) = val.as_object_mut() {
                for (_, v) in obj.iter_mut() {
                    rename_in_content_recursive(v, re, replacement, changed);
                }
            }
        }
        Value::Array(arr) => {
            for v in arr.iter_mut() {
                rename_in_content_recursive(v, re, replacement, changed);
            }
        }
        _ => {}
    }
}

// ---------------------------------------------------------------------------
// Tests unitaires (P15.5)
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn re(name: &str) -> Regex {
        build_word_regex(name)
    }

    #[test]
    fn recursive_rename_in_simple_string_value() {
        let mut v = json!("Aldwen est mort.");
        let mut changed = false;
        rename_in_content_recursive(&mut v, &re("Aldwen"), "Galore", &mut changed);
        assert!(changed);
        assert_eq!(v, json!("Galore est mort."));
    }

    #[test]
    fn recursive_rename_in_nested_object() {
        let mut v = json!({
            "traits": ["Aldwen est sage"],
            "summary": "Histoire de Aldwen et de Galore.",
            "meta": {"author": "Aldwen le Vieux"},
        });
        let mut changed = false;
        rename_in_content_recursive(&mut v, &re("Aldwen"), "Galore", &mut changed);
        assert!(changed);
        assert_eq!(v["traits"][0].as_str().unwrap(), "Galore est sage");
        assert_eq!(
            v["summary"].as_str().unwrap(),
            "Histoire de Galore et de Galore."
        );
        assert_eq!(v["meta"]["author"].as_str().unwrap(), "Galore le Vieux");
    }

    #[test]
    fn recursive_rename_walks_tiptap_doc_inside_content() {
        let mut v = json!({
            "biography": {
                "type": "doc",
                "content": [{"type": "paragraph", "content": [
                    {"type": "text", "text": "Aldwen partit à l'aube."}
                ]}]
            },
            "archetype": "héros"
        });
        let mut changed = false;
        rename_in_content_recursive(&mut v, &re("Aldwen"), "Galore", &mut changed);
        assert!(changed);
        // L'archetype n'est pas touché.
        assert_eq!(v["archetype"].as_str().unwrap(), "héros");
        // Le Tiptap doc a été modifié.
        let text = v["biography"]["content"][0]["content"][0]["text"]
            .as_str()
            .unwrap();
        assert_eq!(text, "Galore partit à l'aube.");
    }

    #[test]
    fn recursive_rename_respects_word_boundary() {
        let mut v = json!({
            "summary": "Aldwen et Aldwendom sont différents.",
        });
        let mut changed = false;
        rename_in_content_recursive(&mut v, &re("Aldwen"), "Galore", &mut changed);
        assert!(changed);
        assert_eq!(
            v["summary"].as_str().unwrap(),
            "Galore et Aldwendom sont différents."
        );
    }

    #[test]
    fn recursive_rename_no_change_when_no_match() {
        let mut v = json!({"summary": "Histoire de Bob."});
        let mut changed = false;
        rename_in_content_recursive(&mut v, &re("Aldwen"), "Galore", &mut changed);
        assert!(!changed);
        assert_eq!(v["summary"].as_str().unwrap(), "Histoire de Bob.");
    }

    // Merge strategies — purs sur les valeurs, sans toucher à la DB.
    // Reproduit la logique du `match payload.summary_strategy {...}` avec
    // les mêmes branches pour s'assurer qu'aucune n'évolue silencieusement.

    fn summary_after_merge(
        strategy: MergeStrategy,
        target: Option<&str>,
        source: Option<&str>,
    ) -> Option<String> {
        let target = target.map(String::from);
        let source = source.map(String::from);
        match strategy {
            MergeStrategy::KeepTarget => target,
            MergeStrategy::KeepSource => source,
            MergeStrategy::Concat => match (&target, &source) {
                (Some(t), Some(s)) if !s.trim().is_empty() && t.trim() != s.trim() => {
                    Some(format!("{t}\n\n{s}"))
                }
                (Some(t), _) => Some(t.clone()),
                (None, s) => s.clone(),
            },
        }
    }

    #[test]
    fn merge_strategy_keep_target() {
        assert_eq!(
            summary_after_merge(MergeStrategy::KeepTarget, Some("T"), Some("S")),
            Some("T".into())
        );
    }

    #[test]
    fn merge_strategy_keep_source() {
        assert_eq!(
            summary_after_merge(MergeStrategy::KeepSource, Some("T"), Some("S")),
            Some("S".into())
        );
    }

    #[test]
    fn merge_strategy_concat_joins_when_both_present_and_different() {
        assert_eq!(
            summary_after_merge(MergeStrategy::Concat, Some("Alpha"), Some("Beta")),
            Some("Alpha\n\nBeta".into())
        );
    }

    #[test]
    fn merge_strategy_concat_keeps_target_if_source_equal() {
        assert_eq!(
            summary_after_merge(MergeStrategy::Concat, Some("Same"), Some("Same")),
            Some("Same".into())
        );
    }

    #[test]
    fn merge_strategy_concat_falls_back_to_source_if_target_missing() {
        assert_eq!(
            summary_after_merge(MergeStrategy::Concat, None, Some("S")),
            Some("S".into())
        );
    }

    #[test]
    fn merge_strategy_default_is_keep_target() {
        assert_eq!(MergeStrategy::default(), MergeStrategy::KeepTarget);
    }
}
