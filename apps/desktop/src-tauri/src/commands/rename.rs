//! Rename propagé d'une entité dans tout l'univers (P14.1).
//!
//! Deux commandes :
//!
//!  1. `entity_find_mentions(entity_id)` — scanne tout l'univers et
//!     retourne la liste structurée des occurrences du nom courant. Le
//!     front affiche cette liste avec preview + checkboxes pour que
//!     l'auteur exclue manuellement les faux positifs.
//!
//!  2. `entity_rename_in_universe(entity_id, new_name, locations)` —
//!     applique le rename sur les locations validées par l'auteur, et
//!     met à jour le `name` de l'entité elle-même. Atomique via
//!     transaction sqlx.
//!
//! Sources scannées :
//!   - chapters.body_json (Tiptap doc — text nodes)
//!   - entities.summary (string brute, autres entités)
//!   - entities.content_json (champs `description` Tiptap doc et
//!     `biographyText` / `descriptionText` string brute selon le type)
//!
//! Word boundary unicode (regex `\b`) pour ne pas matcher les
//! sub-strings : « Aldwen » ne doit pas attraper « Aldwendom ».

use regex::Regex;
use romanesk_core::{Database, Entity, Repo};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::State;
use uuid::Uuid;

use super::{CommandError, CommandResult};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(
    tag = "kind",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub enum MentionLocationKey {
    /// body_json du chapitre identifié par son id.
    Chapter { chapter_id: String },
    /// Champ `summary` (string brute) d'une autre entité.
    EntitySummary { entity_id: String },
    /// Champ riche dans `content_json` d'une entité — `field` peut être
    /// "description" (Tiptap doc) ou "biographyText" / "descriptionText"
    /// (string brute).
    EntityField { entity_id: String, field: String },
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Mention {
    pub key: MentionLocationKey,
    /// Label humain de l'emplacement, ex. « Chapitre 5 — La forêt »
    /// ou « Personnage Aldwen · biographie ».
    pub label: String,
    /// Court extrait avec [...] autour de la première occurrence.
    pub excerpt: String,
    /// Nombre d'occurrences dans cette location.
    pub count: usize,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct FindMentionsResult {
    /// Le nom actuel de l'entité (utile pour le front qui affiche
    /// « Renommer "Aldwen" en … »).
    pub current_name: String,
    /// La liste agrégée des mentions. Vide si aucune occurrence
    /// (l'auteur peut quand même renommer la fiche elle-même).
    pub mentions: Vec<Mention>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RenamePayload {
    pub entity_id: String,
    pub new_name: String,
    /// Sous-ensemble des MentionLocationKey retournés par
    /// `entity_find_mentions` que l'auteur veut effectivement modifier.
    pub locations: Vec<MentionLocationKey>,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct RenameResult {
    pub renamed_entity: Entity,
    pub chapters_updated: usize,
    pub entities_updated: usize,
}

// ---------------------------------------------------------------------------
// entity_find_mentions
// ---------------------------------------------------------------------------

#[tauri::command]
pub async fn entity_find_mentions(
    db: State<'_, Database>,
    entity_id: String,
) -> CommandResult<FindMentionsResult> {
    let entity_uuid =
        Uuid::parse_str(&entity_id).map_err(CommandError::InvalidUuid)?;

    let repo = Repo::new(db.inner().clone());

    let target = repo
        .entities()
        .get(entity_uuid)
        .await?
        .ok_or_else(|| CommandError::Other("entity introuvable".into()))?;
    let universe_id = target.universe_id;
    let name = target.name.clone();
    let re = build_word_regex(&name);

    let mut mentions: Vec<Mention> = Vec::new();

    // ── Source 1 : chapitres ────────────────────────────────────────
    let stories = repo.stories().list_in_universe(universe_id).await?;
    for story in &stories {
        let chapters = repo.chapters().list_for_story(story.id).await?;
        for (idx, chapter) in chapters.iter().enumerate() {
            let mut texts: Vec<String> = Vec::new();
            collect_text_nodes(&chapter.body_json, &mut texts);
            let combined = texts.join("\n");
            let count = re.find_iter(&combined).count();
            if count == 0 {
                continue;
            }
            let excerpt = first_excerpt(&combined, &re);
            let chapter_label = chapter
                .title
                .clone()
                .unwrap_or_else(|| format!("Chapitre {}", idx + 1));
            mentions.push(Mention {
                key: MentionLocationKey::Chapter {
                    chapter_id: chapter.id.to_string(),
                },
                label: format!("« {} » · {}", story.title, chapter_label),
                excerpt,
                count,
            });
        }
    }

    // ── Source 2 + 3 : autres entités ───────────────────────────────
    let all_entities = repo.entities().list_in_universe(universe_id, None).await?;
    for ent in &all_entities {
        if ent.id == entity_uuid {
            continue; // pas de self-reference
        }

        // Champ `summary` (string brute)
        if let Some(summary) = &ent.summary {
            let count = re.find_iter(summary).count();
            if count > 0 {
                mentions.push(Mention {
                    key: MentionLocationKey::EntitySummary {
                        entity_id: ent.id.to_string(),
                    },
                    label: format!("{} · résumé", ent.name),
                    excerpt: first_excerpt(summary, &re),
                    count,
                });
            }
        }

        // Champs riches dans `content_json` : on parcourt récursivement
        // toutes les valeurs string et tous les Tiptap docs reconnus
        // (objets ayant un `type` "doc" ou contenant un `content` array).
        scan_content_for_field_mentions(
            &ent.content,
            &re,
            &mut |field_path, count, excerpt| {
                mentions.push(Mention {
                    key: MentionLocationKey::EntityField {
                        entity_id: ent.id.to_string(),
                        field: field_path.clone(),
                    },
                    label: format!("{} · {}", ent.name, friendly_field(&field_path)),
                    excerpt,
                    count,
                });
            },
        );
    }

    // Tri stable : chapitres d'abord (plus impactants), puis entités.
    mentions.sort_by(|a, b| {
        let priority = |m: &Mention| match m.key {
            MentionLocationKey::Chapter { .. } => 0,
            MentionLocationKey::EntitySummary { .. } => 1,
            MentionLocationKey::EntityField { .. } => 2,
        };
        priority(a)
            .cmp(&priority(b))
            .then_with(|| b.count.cmp(&a.count))
    });

    Ok(FindMentionsResult {
        current_name: name,
        mentions,
    })
}

// ---------------------------------------------------------------------------
// entity_rename_in_universe
// ---------------------------------------------------------------------------

#[tauri::command]
pub async fn entity_rename_in_universe(
    db: State<'_, Database>,
    payload: RenamePayload,
) -> CommandResult<RenameResult> {
    let entity_uuid =
        Uuid::parse_str(&payload.entity_id).map_err(CommandError::InvalidUuid)?;
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
    use std::collections::HashSet;
    let mut entity_uuids_to_update: HashSet<Uuid> = HashSet::new();
    for eid in &entity_summary_ids {
        entity_uuids_to_update
            .insert(Uuid::parse_str(eid).map_err(CommandError::InvalidUuid)?);
    }
    for (eid, _) in &entity_field_ids {
        entity_uuids_to_update
            .insert(Uuid::parse_str(eid).map_err(CommandError::InvalidUuid)?);
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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/// Construit une regex word-boundary pour un nom propre.
/// `\b` en Rust est unicode-aware par défaut donc « Élodie » marche.
/// On échappe les méta-caractères regex au cas où le nom contient des
/// caractères spéciaux (rare mais pas impossible : « Saint-Pierre »).
fn build_word_regex(name: &str) -> Regex {
    let escaped = regex::escape(name.trim());
    // (?u) force le unicode flag (déjà par défaut mais explicite).
    let pattern = format!(r"(?u)\b{escaped}\b");
    Regex::new(&pattern).expect("valid regex from escaped name")
}

/// Visiteur récursif qui collecte tous les `text` strings dans un node
/// Tiptap/ProseMirror sérialisé en JSON.
fn collect_text_nodes(node: &Value, out: &mut Vec<String>) {
    if let Some(text) = node.get("text").and_then(|v| v.as_str()) {
        out.push(text.to_string());
    }
    if let Some(content) = node.get("content").and_then(|v| v.as_array()) {
        for child in content {
            collect_text_nodes(child, out);
        }
    }
}

/// Remplace tous les matches dans les `text` strings d'un node Tiptap
/// (mutation in-place). Renvoie true si au moins un remplacement a été fait.
fn rename_in_text_nodes(node: &mut Value, re: &Regex, replacement: &str) -> bool {
    let mut changed = false;
    if let Some(text_val) = node.get_mut("text") {
        if let Some(s) = text_val.as_str() {
            let new = re.replace_all(s, replacement);
            if new != s {
                *text_val = Value::String(new.into_owned());
                changed = true;
            }
        }
    }
    if let Some(content) = node.get_mut("content").and_then(|v| v.as_array_mut()) {
        for child in content {
            if rename_in_text_nodes(child, re, replacement) {
                changed = true;
            }
        }
    }
    changed
}

/// Scanne récursivement un objet JSON `content` et appelle `cb` pour
/// chaque champ string ou Tiptap doc qui contient au moins une mention.
/// `cb(field_path, count, excerpt)`.
fn scan_content_for_field_mentions<F: FnMut(String, usize, String)>(
    content: &Value,
    re: &Regex,
    cb: &mut F,
) {
    let Some(obj) = content.as_object() else {
        return;
    };
    for (key, val) in obj {
        match val {
            Value::String(s) => {
                let count = re.find_iter(s).count();
                if count > 0 {
                    cb(key.clone(), count, first_excerpt(s, re));
                }
            }
            Value::Object(inner) => {
                // Hypothèse : c'est un Tiptap doc (a un champ content array).
                if inner.contains_key("type") || inner.contains_key("content") {
                    let mut texts: Vec<String> = Vec::new();
                    collect_text_nodes(val, &mut texts);
                    let combined = texts.join("\n");
                    let count = re.find_iter(&combined).count();
                    if count > 0 {
                        cb(key.clone(), count, first_excerpt(&combined, re));
                    }
                }
            }
            _ => {}
        }
    }
}

/// Idem `rename_in_text_nodes` mais sur des champs ciblés du content.
fn rename_in_content_fields(
    content: &mut Value,
    fields: &[String],
    re: &Regex,
    replacement: &str,
) -> bool {
    let Some(obj) = content.as_object_mut() else {
        return false;
    };
    let mut changed = false;
    for field in fields {
        let Some(val) = obj.get_mut(field) else {
            continue;
        };
        match val {
            Value::String(s) => {
                let new = re.replace_all(s, replacement);
                if new != s.as_str() {
                    *val = Value::String(new.into_owned());
                    changed = true;
                }
            }
            Value::Object(_) => {
                if rename_in_text_nodes(val, re, replacement) {
                    changed = true;
                }
            }
            _ => {}
        }
    }
    changed
}

/// Extrait ~80 chars de contexte autour de la première occurrence,
/// avec « […] » aux bords si on coupe.
fn first_excerpt(text: &str, re: &Regex) -> String {
    let Some(m) = re.find(text) else {
        return String::new();
    };
    const RADIUS: usize = 60;
    // Travaille sur les bytes mais respecte les frontières char via
    // floor/ceil_char_boundary si nécessaire.
    let start_byte = m.start().saturating_sub(RADIUS);
    let end_byte = (m.end() + RADIUS).min(text.len());
    // Snap aux frontières char pour ne pas couper un caractère UTF-8.
    let safe_start = (0..=start_byte).rev().find(|i| text.is_char_boundary(*i)).unwrap_or(0);
    let safe_end = (end_byte..=text.len()).find(|i| text.is_char_boundary(*i)).unwrap_or(text.len());
    let mut out = String::new();
    if safe_start > 0 {
        out.push_str("[…] ");
    }
    out.push_str(&text[safe_start..safe_end]);
    if safe_end < text.len() {
        out.push_str(" […]");
    }
    out
}

/// Libellé humain pour un nom de field (ex. "biographyText" → "biographie").
fn friendly_field(field: &str) -> String {
    match field {
        "biographyText" => "biographie".into(),
        "descriptionText" => "description".into(),
        "description" => "description".into(),
        "summary" => "résumé".into(),
        "ideology" => "idéologie".into(),
        "origin" => "origine".into(),
        "owner" => "possesseur".into(),
        "leader" => "chef".into(),
        "domain" => "domaine".into(),
        "climate" => "climat".into(),
        "population" => "population".into(),
        "founded" => "fondation".into(),
        other => other.to_string(),
    }
}
