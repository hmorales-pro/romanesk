//! `entity_find_mentions` — scanne tout l'univers et retourne la liste
//! structurée des occurrences du nom courant de l'entité ciblée.
//!
//! Sources scannées :
//!   - chapters.body_json (Tiptap doc — text nodes)
//!   - entities.summary (string brute, autres entités)
//!   - entities.content_json (champs `description` Tiptap doc et
//!     `biographyText` / `descriptionText` string brute selon le type)

use romanesk_core::{Database, Repo};
use tauri::State;
use uuid::Uuid;

use super::super::{CommandError, CommandResult};
use super::text_walker::{
    build_word_regex, collect_text_nodes, first_excerpt, friendly_field,
    scan_content_for_field_mentions,
};
use super::types::{FindMentionsResult, Mention, MentionLocationKey};

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
