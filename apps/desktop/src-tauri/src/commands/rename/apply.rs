//! `entity_rename_in_universe` — applique le rename sur les locations
//! validées par l'auteur, et met à jour le `name` de l'entité elle-même.
//! Atomique via les transactions implicites des updates Repo.

use std::collections::HashSet;

use romanesk_core::{Database, Repo};
use tauri::State;
use uuid::Uuid;

use super::super::{CommandError, CommandResult};
use super::text_walker::{build_word_regex, rename_in_content_fields, rename_in_text_nodes};
use super::types::{MentionLocationKey, RenamePayload, RenameResult};

#[tauri::command]
pub async fn entity_rename_in_universe(
    db: State<'_, Database>,
    payload: RenamePayload,
) -> CommandResult<RenameResult> {
    let entity_uuid = Uuid::parse_str(&payload.entity_id).map_err(CommandError::InvalidUuid)?;
    let new_name = payload.new_name.trim();
    if new_name.is_empty() {
        return Err(CommandError::Other("nouveau nom vide".into()));
    }

    let repo = Repo::new(db.inner().clone());
    let target = repo
        .entities()
        .get(entity_uuid)
        .await?
        .ok_or_else(|| CommandError::Other("entity introuvable".into()))?;
    let old_name = target.name.clone();
    if old_name == new_name {
        // Pas de changement de nom — on ne fait rien sur les locations
        // non plus (la regex n'aurait rien à substituer).
        return Ok(RenameResult {
            renamed_entity: target,
            chapters_updated: 0,
            entities_updated: 0,
        });
    }

    let re = build_word_regex(&old_name);

    // Index par type pour appliquer les remplacements groupés.
    let mut chapter_ids: Vec<String> = Vec::new();
    let mut entity_summary_ids: Vec<String> = Vec::new();
    let mut entity_field_ids: Vec<(String, String)> = Vec::new();
    for loc in &payload.locations {
        match loc {
            MentionLocationKey::Chapter { chapter_id } => {
                chapter_ids.push(chapter_id.clone());
            }
            MentionLocationKey::EntitySummary { entity_id } => {
                entity_summary_ids.push(entity_id.clone());
            }
            MentionLocationKey::EntityField { entity_id, field } => {
                entity_field_ids.push((entity_id.clone(), field.clone()));
            }
        }
    }

    let mut chapters_updated = 0usize;
    let mut entities_updated = 0usize;

    // ── Chapitres ──────────────────────────────────────────────────
    for cid in &chapter_ids {
        let cuuid = Uuid::parse_str(cid).map_err(CommandError::InvalidUuid)?;
        let chapter = repo
            .chapters()
            .get(cuuid)
            .await?
            .ok_or_else(|| CommandError::Other(format!("chapter {cid} not found")))?;

        let mut new_body = chapter.body_json.clone();
        let changed = rename_in_text_nodes(&mut new_body, &re, new_name);
        if !changed {
            continue;
        }

        let update = romanesk_core::UpdateChapter {
            title: chapter.title.clone(),
            body_json: new_body,
            word_count: chapter.word_count,
            status: chapter.status,
            era_id: chapter.era_id,
        };
        repo.chapters().update(cuuid, update).await?;
        chapters_updated += 1;
    }

    // ── Entities (summary + champs content) ────────────────────────
    let mut entity_uuids_to_update: HashSet<Uuid> = HashSet::new();
    for eid in &entity_summary_ids {
        entity_uuids_to_update.insert(Uuid::parse_str(eid).map_err(CommandError::InvalidUuid)?);
    }
    for (eid, _) in &entity_field_ids {
        entity_uuids_to_update.insert(Uuid::parse_str(eid).map_err(CommandError::InvalidUuid)?);
    }

    for euuid in entity_uuids_to_update {
        let ent = repo
            .entities()
            .get(euuid)
            .await?
            .ok_or_else(|| CommandError::Other(format!("entity {euuid} not found")))?;

        let mut new_summary = ent.summary.clone();
        let mut new_content = ent.content.clone();
        let mut changed = false;

        // summary
        if entity_summary_ids.contains(&euuid.to_string()) {
            if let Some(s) = &new_summary {
                let replaced = re.replace_all(s, new_name).to_string();
                if &replaced != s {
                    new_summary = Some(replaced);
                    changed = true;
                }
            }
        }

        // champs ciblés du content
        let fields_for_this: Vec<String> = entity_field_ids
            .iter()
            .filter(|(eid, _)| eid == &euuid.to_string())
            .map(|(_, f)| f.clone())
            .collect();
        if !fields_for_this.is_empty()
            && rename_in_content_fields(&mut new_content, &fields_for_this, &re, new_name)
        {
            changed = true;
        }

        if !changed {
            continue;
        }

        let update = romanesk_core::UpdateEntity {
            name: ent.name.clone(),
            summary: new_summary,
            content: new_content,
            cover_image: ent.cover_image.clone(),
            is_real: ent.is_real,
        };
        repo.entities().update(euuid, update).await?;
        entities_updated += 1;
    }

    // ── Update du nom de l'entité elle-même ─────────────────────────
    let renamed_entity = repo
        .entities()
        .update(
            entity_uuid,
            romanesk_core::UpdateEntity {
                name: new_name.to_string(),
                summary: target.summary.clone(),
                content: target.content.clone(),
                cover_image: target.cover_image.clone(),
                is_real: target.is_real,
            },
        )
        .await?;

    Ok(RenameResult {
        renamed_entity,
        chapters_updated,
        entities_updated,
    })
}
