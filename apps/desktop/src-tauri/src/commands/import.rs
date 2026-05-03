//! Application d'un draft d'import sur la base (P7.3).
//!
//! Prend une `ImportAnalysis` filtrée par les choix utilisateur (cocher /
//! décocher) + une cible (nouvel univers ou univers existant), et crée
//! tout en cascade dans une transaction logique. Pour le merge dans un
//! univers existant : on skippe par défaut les entités dont le nom existe
//! déjà (case-insensitive). Le front aura un toggle pour forcer la
//! duplication ou le merge plus avancé en P7.x.

use std::collections::HashMap;

use romanesk_core::{
    Database, EntityType, NewEntity, NewEra, NewEvent, NewStory, NewUniverse, Repo, StoryType,
};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tauri::State;
use uuid::Uuid;

use super::{CommandError, CommandResult};

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportApplyPayload {
    /// L'analyse renvoyée par `ai_analyze_import`. Le front filtre les
    /// entités décochées AVANT d'envoyer (les listes ici sont déjà
    /// celles à créer).
    pub analysis: ImportAnalysisInput,
    /// Cible : nouvel univers (avec nom + description) ou univers existant.
    pub target: ImportTarget,
    /// Si true et univers existant, force la création même quand un nom
    /// existe déjà. Sinon les doublons sont skippés.
    #[serde(default)]
    pub force_duplicates: bool,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", tag = "kind")]
pub enum ImportTarget {
    /// Crée un nouvel univers avec ce nom et cette description optionnelle.
    NewUniverse {
        name: String,
        #[serde(default)]
        description: Option<String>,
    },
    /// Importe dans un univers existant identifié par son UUID.
    ExistingUniverse { id: String },
}

#[derive(Debug, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ImportAnalysisInput {
    #[serde(default)]
    pub characters: Vec<ImportCharacter>,
    #[serde(default)]
    pub locations: Vec<ImportLocation>,
    #[serde(default)]
    pub factions: Vec<ImportFaction>,
    #[serde(default)]
    pub objects: Vec<ImportObjectItem>,
    #[serde(default)]
    pub concepts: Vec<ImportConcept>,
    #[serde(default)]
    pub eras: Vec<ImportEra>,
    #[serde(default)]
    pub events: Vec<ImportEvent>,
    #[serde(default)]
    pub chapters: Vec<ImportChapter>,
    #[serde(default)]
    pub story_title: Option<String>,
    #[serde(default)]
    pub is_narrative: bool,
}

// Sous-types — miroir partiel des structs de commands/ai.rs (déduplication
// volontairement évitée : ces structs reçoivent les snake_case clés
// renvoyées par le front qui a re-typé en camelCase, on garde la même
// stack ici).

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportCharacter {
    pub name: String,
    #[serde(default)]
    pub summary: Option<String>,
    #[serde(default)]
    pub archetype: Option<String>,
    #[serde(default)]
    pub traits: Vec<String>,
    #[serde(default)]
    pub biography_text: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportLocation {
    pub name: String,
    #[serde(default)]
    pub summary: Option<String>,
    #[serde(default)]
    pub kind: Option<String>,
    #[serde(default)]
    pub climate: Option<String>,
    #[serde(default)]
    pub population: Option<String>,
    #[serde(default)]
    pub description_text: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportFaction {
    pub name: String,
    #[serde(default)]
    pub summary: Option<String>,
    #[serde(default)]
    pub kind: Option<String>,
    #[serde(default)]
    pub ideology: Option<String>,
    #[serde(default)]
    pub founded: Option<String>,
    #[serde(default)]
    pub leader: Option<String>,
    #[serde(default)]
    pub description_text: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportObjectItem {
    pub name: String,
    #[serde(default)]
    pub summary: Option<String>,
    #[serde(default)]
    pub kind: Option<String>,
    #[serde(default)]
    pub origin: Option<String>,
    #[serde(default)]
    pub owner: Option<String>,
    #[serde(default)]
    pub properties: Vec<String>,
    #[serde(default)]
    pub description_text: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportConcept {
    pub name: String,
    #[serde(default)]
    pub summary: Option<String>,
    #[serde(default)]
    pub kind: Option<String>,
    #[serde(default)]
    pub domain: Option<String>,
    #[serde(default)]
    pub description_text: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportEra {
    pub name: String,
    #[serde(default)]
    pub start_year: Option<i64>,
    #[serde(default)]
    pub end_year: Option<i64>,
    #[serde(default)]
    pub description: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportEvent {
    pub name: String,
    #[serde(default)]
    pub year: Option<i64>,
    #[serde(default)]
    pub era_name: Option<String>,
    #[serde(default)]
    pub description: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportChapter {
    pub title: String,
    pub body_text: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportResult {
    /// UUID de l'univers (nouvel ou existant) où a eu lieu l'import.
    pub universe_id: Uuid,
    /// UUID de la story créée si l'analyse était narrative et avait des
    /// chapitres. `None` sinon.
    pub story_id: Option<Uuid>,
    pub created_characters: usize,
    pub created_locations: usize,
    pub created_factions: usize,
    pub created_objects: usize,
    pub created_concepts: usize,
    pub created_eras: usize,
    pub created_events: usize,
    pub created_chapters: usize,
    /// Noms d'entités skippées parce que déjà présentes dans l'univers
    /// (cas merge sur univers existant, force_duplicates = false).
    pub skipped: Vec<String>,
}

#[tauri::command]
pub async fn import_apply(
    db: State<'_, Database>,
    payload: ImportApplyPayload,
) -> CommandResult<ImportResult> {
    let repo = Repo::new(db.inner().clone());

    // 1) Résoudre l'univers cible (créer si nouvel, vérifier si existant).
    let universe_id = match payload.target {
        ImportTarget::NewUniverse { name, description } => {
            let trimmed = name.trim();
            if trimmed.is_empty() {
                return Err(CommandError::Other(
                    "Nouvel univers : le nom est requis".into(),
                ));
            }
            let new = NewUniverse {
                name: trimmed.to_string(),
                description: description
                    .map(|s| s.trim().to_string())
                    .filter(|s| !s.is_empty()),
                settings: json!({}),
            };
            let u = repo.universes().create(new).await?;
            u.id
        }
        ImportTarget::ExistingUniverse { id } => {
            let uid = Uuid::parse_str(&id)?;
            // Vérifie qu'il existe (sinon erreur claire au lieu de FK violation).
            repo.universes()
                .get(uid)
                .await?
                .ok_or_else(|| CommandError::Other(format!("Univers {uid} introuvable")))?;
            uid
        }
    };

    // 2) Index des noms existants pour le skip-doublons (univers existant).
    //    Construit aussi la map name → era_id pour rattacher les events.
    let existing_entities = repo.entities().list_in_universe(universe_id, None).await?;
    let existing_eras = repo.eras().list_in_universe(universe_id).await?;
    let mut existing_entity_names: std::collections::HashSet<String> = existing_entities
        .iter()
        .map(|e| e.name.to_lowercase())
        .collect();
    let mut era_by_name: HashMap<String, Uuid> = existing_eras
        .iter()
        .map(|e| (e.name.to_lowercase(), e.id))
        .collect();
    let mut existing_era_names: std::collections::HashSet<String> =
        existing_eras.iter().map(|e| e.name.to_lowercase()).collect();

    let mut skipped: Vec<String> = Vec::new();
    let mut created_chars = 0;
    let mut created_locs = 0;
    let mut created_factions = 0;
    let mut created_objs = 0;
    let mut created_concepts = 0;

    // 3) Création des entités (5 types) avec skip si nom déjà présent.
    for c in payload.analysis.characters {
        if !payload.force_duplicates && existing_entity_names.contains(&c.name.to_lowercase()) {
            skipped.push(format!("Personnage : {}", c.name));
            continue;
        }
        let content = json!({
            "archetype": c.archetype,
            "traits": c.traits,
            "biography": c.biography_text.as_ref().map(text_to_tiptap_doc),
        });
        repo.entities()
            .create(NewEntity {
                universe_id,
                kind: EntityType::Character,
                name: c.name.clone(),
                summary: c.summary,
                content,
                cover_image: None,
                is_real: false,
            })
            .await?;
        existing_entity_names.insert(c.name.to_lowercase());
        created_chars += 1;
    }

    for l in payload.analysis.locations {
        if !payload.force_duplicates && existing_entity_names.contains(&l.name.to_lowercase()) {
            skipped.push(format!("Lieu : {}", l.name));
            continue;
        }
        let content = json!({
            "kind": normalize_kind(l.kind.as_deref(), &["city","region","building","naturalFeature","celestial","other"]),
            "climate": l.climate,
            "population": l.population,
            "description": l.description_text.as_ref().map(text_to_tiptap_doc),
        });
        repo.entities()
            .create(NewEntity {
                universe_id,
                kind: EntityType::Location,
                name: l.name.clone(),
                summary: l.summary,
                content,
                cover_image: None,
                is_real: false,
            })
            .await?;
        existing_entity_names.insert(l.name.to_lowercase());
        created_locs += 1;
    }

    for f in payload.analysis.factions {
        if !payload.force_duplicates && existing_entity_names.contains(&f.name.to_lowercase()) {
            skipped.push(format!("Faction : {}", f.name));
            continue;
        }
        let content = json!({
            "kind": normalize_kind(f.kind.as_deref(), &["government","guild","sect","clan","company","other"]),
            "ideology": f.ideology,
            "founded": f.founded,
            "leader": f.leader,
            "description": f.description_text.as_ref().map(text_to_tiptap_doc),
        });
        repo.entities()
            .create(NewEntity {
                universe_id,
                kind: EntityType::Faction,
                name: f.name.clone(),
                summary: f.summary,
                content,
                cover_image: None,
                is_real: false,
            })
            .await?;
        existing_entity_names.insert(f.name.to_lowercase());
        created_factions += 1;
    }

    for o in payload.analysis.objects {
        if !payload.force_duplicates && existing_entity_names.contains(&o.name.to_lowercase()) {
            skipped.push(format!("Objet : {}", o.name));
            continue;
        }
        let content = json!({
            "kind": normalize_kind(o.kind.as_deref(), &["artifact","weapon","armor","book","relic","tool","other"]),
            "origin": o.origin,
            "owner": o.owner,
            "properties": o.properties,
            "description": o.description_text.as_ref().map(text_to_tiptap_doc),
        });
        repo.entities()
            .create(NewEntity {
                universe_id,
                kind: EntityType::Object,
                name: o.name.clone(),
                summary: o.summary,
                content,
                cover_image: None,
                is_real: false,
            })
            .await?;
        existing_entity_names.insert(o.name.to_lowercase());
        created_objs += 1;
    }

    for c in payload.analysis.concepts {
        if !payload.force_duplicates && existing_entity_names.contains(&c.name.to_lowercase()) {
            skipped.push(format!("Concept : {}", c.name));
            continue;
        }
        let content = json!({
            "kind": normalize_kind(c.kind.as_deref(), &["magic","religion","technology","philosophy","language","other"]),
            "domain": c.domain,
            "description": c.description_text.as_ref().map(text_to_tiptap_doc),
        });
        repo.entities()
            .create(NewEntity {
                universe_id,
                kind: EntityType::Concept,
                name: c.name.clone(),
                summary: c.summary,
                content,
                cover_image: None,
                is_real: false,
            })
            .await?;
        existing_entity_names.insert(c.name.to_lowercase());
        created_concepts += 1;
    }

    // 4) Époques.
    let mut created_eras = 0;
    for (idx, era) in payload.analysis.eras.into_iter().enumerate() {
        if !payload.force_duplicates && existing_era_names.contains(&era.name.to_lowercase()) {
            skipped.push(format!("Époque : {}", era.name));
            // Garde l'era_id existante dans la map pour qu'un event qui s'y
            // rattache trouve son lien.
            continue;
        }
        let new_era = NewEra {
            universe_id,
            name: era.name.clone(),
            start_year: era.start_year,
            end_year: era.end_year,
            description: era.description,
            color: None,
            sort_order: idx as i64,
        };
        let created = repo.eras().create(new_era).await?;
        era_by_name.insert(era.name.to_lowercase(), created.id);
        existing_era_names.insert(era.name.to_lowercase());
        created_eras += 1;
    }

    // 5) Événements (rattachés à l'era par nom si possible).
    let mut created_events = 0;
    for ev in payload.analysis.events {
        let era_id = ev
            .era_name
            .as_ref()
            .and_then(|n| era_by_name.get(&n.to_lowercase()).copied());
        let new_ev = NewEvent {
            universe_id,
            era_id,
            name: ev.name,
            year: ev.year,
            description: ev.description,
        };
        repo.events().create(new_ev).await?;
        created_events += 1;
    }

    // 6) Story + chapitres si l'analyse était narrative ET qu'il y a des chapitres.
    let mut story_id_out: Option<Uuid> = None;
    let mut created_chapters = 0;
    if payload.analysis.is_narrative && !payload.analysis.chapters.is_empty() {
        let title = payload
            .analysis
            .story_title
            .as_deref()
            .filter(|s| !s.trim().is_empty())
            .unwrap_or("Récit importé")
            .to_string();
        let story = repo
            .stories()
            .create(NewStory {
                universe_id: Some(universe_id),
                title,
                kind: StoryType::Novel,
                synopsis: None,
                status: Some("drafting".into()),
                target_word_count: None,
                pivot_era_id: None,
            })
            .await?;
        let story_id = story.id;
        story_id_out = Some(story_id);

        for (i, ch) in payload.analysis.chapters.into_iter().enumerate() {
            let body_json = text_to_tiptap_doc(&ch.body_text);
            let new_chapter = romanesk_core::NewChapter {
                story_id,
                title: Some(ch.title),
                body_json: Some(body_json),
                sort_order: Some(i as i64),
                era_id: None,
            };
            repo.chapters().create(new_chapter).await?;
            created_chapters += 1;
        }
    }

    Ok(ImportResult {
        universe_id,
        story_id: story_id_out,
        created_characters: created_chars,
        created_locations: created_locs,
        created_factions,
        created_objects: created_objs,
        created_concepts,
        created_eras,
        created_events,
        created_chapters,
        skipped,
    })
}

/// Convertit un texte plein (paragraphes séparés par double-newline) en
/// doc Tiptap minimal (paragraphes simples). Les sauts de ligne uniques
/// sont traités comme des `hard_break`.
fn text_to_tiptap_doc(text: &str) -> Value {
    let paragraphs: Vec<Value> = text
        .split("\n\n")
        .map(|p| p.trim())
        .filter(|p| !p.is_empty())
        .map(|p| {
            // Hard breaks pour les sauts de ligne internes au paragraphe.
            let mut content: Vec<Value> = Vec::new();
            let lines: Vec<&str> = p.split('\n').collect();
            for (i, line) in lines.iter().enumerate() {
                if i > 0 {
                    content.push(json!({"type": "hardBreak"}));
                }
                content.push(json!({"type": "text", "text": line}));
            }
            json!({"type": "paragraph", "content": content})
        })
        .collect();
    if paragraphs.is_empty() {
        json!({"type": "doc", "content": [{"type": "paragraph"}]})
    } else {
        json!({"type": "doc", "content": paragraphs})
    }
}

/// Normalise un `kind` reçu de l'IA contre la liste des valeurs valides.
/// Retourne `"other"` si la valeur reçue n'est pas reconnue (et `"other"`
/// est dans la liste — sinon le premier element de la liste comme fallback).
fn normalize_kind(input: Option<&str>, valid: &[&str]) -> String {
    let v = input.unwrap_or("").trim();
    if v.is_empty() {
        return "other".to_string();
    }
    let lower = v.to_lowercase();
    for k in valid {
        if k.eq_ignore_ascii_case(&lower) {
            return (*k).to_string();
        }
    }
    "other".to_string()
}
