//! `ai_analyze_import` + `ai_analyze_import_stream` — pipeline d'analyse
//! IA d'un texte arbitraire en draft d'univers.
//!
//! Mode synchrone (P7.1) : un seul appel pour les textes courts.
//! Mode streaming map-reduce (P13.1) : chunks 10 K + overlap 500 +
//! agrégation finale, avec progress events Tauri.
//! Les deux modes partagent les mêmes types `Import*` et le parser JSON.

#![allow(unused_imports)]

use romanesk_core::ai::{
    Capabilities, CompletionRequest, CompletionResponse, ImageInput, Message, OllamaConfig,
    OllamaProvider, Provider, ProviderId, Role,
};
use romanesk_core::domain::SourceType;
use romanesk_core::{Database, Entity, EntityType, NewEmbedding, Repo};
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::sync::Arc;
use tauri::State;
use tokio::sync::RwLock;
use uuid::Uuid;

use super::super::{CommandError, CommandResult};
use super::state::{AiEmbedder, AiEmbedderInner, AiProvider};
use super::util::{default_model_label, provider_id_label};

// ---------------------------------------------------------------------------
// Import : analyse d'un texte arbitraire en draft d'univers (P7.1)
// ---------------------------------------------------------------------------

const IMPORT_MAX_CHARS: usize = 24_000;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AnalyzeImportPayload {
    /// Texte à analyser. Tronqué à IMPORT_MAX_CHARS si plus long (le
    /// front affichera un avertissement).
    pub text: String,
    /// Indique au modèle à quel univers existant (par nom) le texte est
    /// censé se rattacher, pour qu'il essaie de réutiliser les noms
    /// existants quand pertinent. `None` = analyse libre.
    #[serde(default)]
    pub target_universe_name: Option<String>,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ImportCharacter {
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub summary: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub archetype: Option<String>,
    #[serde(default)]
    pub traits: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub biography_text: Option<String>,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ImportLocation {
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub summary: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub kind: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub climate: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub population: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description_text: Option<String>,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ImportFaction {
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub summary: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub kind: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ideology: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub founded: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub leader: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description_text: Option<String>,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ImportObject {
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub summary: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub kind: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub origin: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub owner: Option<String>,
    #[serde(default)]
    pub properties: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description_text: Option<String>,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ImportConcept {
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub summary: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub kind: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub domain: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description_text: Option<String>,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ImportEra {
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub start_year: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub end_year: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ImportEvent {
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub year: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub era_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ImportChapter {
    pub title: String,
    pub body_text: String,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ImportUniverseHeader {
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub language: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tone: Option<String>,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ImportAnalysis {
    pub universe: ImportUniverseHeader,
    /// True si le texte semble être une fiction narrative (chapitres
    /// extractibles), false si c'est un document de worldbuilding pur.
    pub is_narrative: bool,
    /// Story title proposé si is_narrative ; sinon `None`.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub story_title: Option<String>,
    pub characters: Vec<ImportCharacter>,
    pub locations: Vec<ImportLocation>,
    pub factions: Vec<ImportFaction>,
    pub objects: Vec<ImportObject>,
    pub concepts: Vec<ImportConcept>,
    pub eras: Vec<ImportEra>,
    pub events: Vec<ImportEvent>,
    pub chapters: Vec<ImportChapter>,
    /// Avertissement si on a tronqué le texte.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub truncation_warning: Option<String>,
    /// Avertissement si le parse JSON a échoué (raw_response inclus).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub parse_warning: Option<String>,
    pub raw_response: String,
}

#[tauri::command]
pub async fn ai_analyze_import(
    provider: State<'_, AiProvider>,
    payload: AnalyzeImportPayload,
) -> CommandResult<ImportAnalysis> {
    let provider = provider.snapshot().await;

    let raw_text = payload.text.trim();
    if raw_text.is_empty() {
        return Err(CommandError::Other("text vide".into()));
    }
    let (text, truncated) = if raw_text.chars().count() > IMPORT_MAX_CHARS {
        let mut s: String = raw_text.chars().take(IMPORT_MAX_CHARS).collect();
        s.push_str("\n\n[…tronqué]");
        (s, true)
    } else {
        (raw_text.to_string(), false)
    };

    let target_block = payload
        .target_universe_name
        .filter(|s| !s.trim().is_empty())
        .map(|n| format!("\nL'univers cible existant s'appelle « {n} ». Réutilise les noms cohérents avec lui quand pertinent."))
        .unwrap_or_default();

    let system = format!(
        r#"Tu es un assistant de worldbuilding qui aide à importer un écrit existant dans Romanesk. On te donne un texte (récit, brouillon, notes…). Tu produis STRICTEMENT un objet JSON unique avec le schéma suivant. Pas de texte autour. Pas d'explication.{target_block}

{{
  "universe": {{
    "name": "<titre court 2-4 mots qui capture l'univers>",
    "description": "<1-2 phrases qui résument l'univers>",
    "language": "fr",
    "tone": "literary"
  }},
  "isNarrative": true | false,
  "storyTitle": "<titre du récit si isNarrative>",
  "characters": [
    {{ "name": "...", "summary": "1 phrase", "archetype": "1-2 mots", "traits": ["..."], "biographyText": "2-4 phrases" }}
  ],
  "locations": [
    {{ "name": "...", "summary": "1 phrase", "kind": "city|region|building|naturalFeature|celestial|other", "climate": "...", "population": "...", "descriptionText": "2-4 phrases" }}
  ],
  "factions": [
    {{ "name": "...", "summary": "1 phrase", "kind": "government|guild|sect|clan|company|other", "ideology": "...", "founded": "...", "leader": "...", "descriptionText": "..." }}
  ],
  "objects": [
    {{ "name": "...", "summary": "1 phrase", "kind": "artifact|weapon|armor|book|relic|tool|other", "origin": "...", "owner": "...", "properties": ["..."], "descriptionText": "..." }}
  ],
  "concepts": [
    {{ "name": "...", "summary": "1 phrase", "kind": "magic|religion|technology|philosophy|language|other", "domain": "...", "descriptionText": "..." }}
  ],
  "eras": [
    {{ "name": "...", "startYear": -100, "endYear": 50, "description": "..." }}
  ],
  "events": [
    {{ "name": "...", "year": 312, "eraName": "...", "description": "..." }}
  ],
  "chapters": [
    {{ "title": "...", "bodyText": "<texte plein du chapitre>" }}
  ]
}}

Règles :
- Si une catégorie n'a aucune entrée, mets un tableau vide [].
- Pour les chapitres : extrais SEULEMENT si le texte est narratif et clairement découpable (titres, sauts visibles). Sinon chapters = [].
- Pour les époques : déduis-les si le texte mentionne des dates / périodes ; sinon eras = [].
- Pour les `kind` enum : utilise EXACTEMENT une des valeurs listées (other par défaut).
- Pas de doublons : ne mets pas le même personnage deux fois.
- bodyText des chapitres : utilise le texte original sans le résumer.
- Reste fidèle au texte. N'invente pas de personnages ou de lieux qui n'apparaissent pas.

Aucun texte autour du JSON."#,
    );

    let user = format!("TEXTE À ANALYSER :\n\n{text}");

    let req = CompletionRequest {
        model: String::new(),
        messages: vec![
            Message {
                role: Role::System,
                content: system,
            },
            Message {
                role: Role::User,
                content: user,
            },
        ],
        temperature: Some(0.3),
        max_tokens: Some(8_192),
        stop: Vec::new(),
        json_schema: Some(json!({ "type": "object" })),
    };

    let res = provider
        .complete(req)
        .await
        .map_err(|e| CommandError::Other(format!("import analysis: {e}")))?;

    let mut analysis = parse_import_analysis(&res.content);
    if truncated {
        analysis.truncation_warning = Some(format!(
            "Texte tronqué à {IMPORT_MAX_CHARS} caractères. Pour analyser un texte plus long, découpe-le en plusieurs imports."
        ));
    }
    Ok(analysis)
}

// ---------------------------------------------------------------------------
// Import map-reduce (P13.1) — pipeline streaming pour les longs textes
// ---------------------------------------------------------------------------
//
// Découpe le texte en chunks de IMPORT_CHUNK_CHARS caractères (avec un
// overlap léger pour ne pas couper une mention en plein milieu), analyse
// chaque chunk en parallèle (map), puis agrège (reduce) :
//   - dedup des entités par nom normalisé (lowercase + NFD)
//   - méta-résumé à partir des résumés de chunks
//   - seconde passe optionnelle pour structurer en ImportAnalysis complet
//
// Émet des events tauri "import-progress" tout au long pour que le front
// affiche un feed live (cf. ImportProgressOverlay).

const IMPORT_CHUNK_CHARS: usize = 10_000;
const IMPORT_CHUNK_OVERLAP: usize = 500;

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct DiscoveredItem {
    pub name: String,
    /// "character" | "location" | "faction" | "object" | "concept"
    pub kind: String,
    /// Court extrait de contexte (60-120 chars) pour faire vivre le feed.
    #[serde(default)]
    pub mention: String,
}

#[derive(Debug, Serialize, Clone)]
#[serde(
    tag = "stage",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub enum ImportProgressEvent {
    Started {
        total_chunks: usize,
        total_chars: usize,
    },
    ChunkStarted {
        index: usize,
        total: usize,
    },
    ChunkAnalyzed {
        index: usize,
        total: usize,
        discovered: Vec<DiscoveredItem>,
        chunk_summary: String,
    },
    Reducing,
    Done {
        analysis: ImportAnalysis,
    },
    Error {
        message: String,
    },
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AnalyzeImportStreamPayload {
    pub text: String,
    #[serde(default)]
    pub target_universe_name: Option<String>,
}

#[tauri::command]
pub async fn ai_analyze_import_stream(
    app: tauri::AppHandle,
    provider: State<'_, AiProvider>,
    payload: AnalyzeImportStreamPayload,
) -> CommandResult<ImportAnalysis> {
    use tauri::Emitter;

    let provider = provider.snapshot().await;

    let raw = payload.text.trim();
    if raw.is_empty() {
        return Err(CommandError::Other("text vide".into()));
    }

    // Split en chunks par chars (UTF-8 safe via .chars()).
    let chars: Vec<char> = raw.chars().collect();
    let total_chars = chars.len();
    let mut chunks: Vec<String> = Vec::new();
    let mut start = 0;
    while start < total_chars {
        let end = (start + IMPORT_CHUNK_CHARS).min(total_chars);
        let chunk: String = chars[start..end].iter().collect();
        chunks.push(chunk);
        if end == total_chars {
            break;
        }
        // Avance de chunk_chars - overlap, pour garder un peu de contexte
        // entre chunks (évite de couper une phrase en plein milieu).
        start = end - IMPORT_CHUNK_OVERLAP;
    }
    let total_chunks = chunks.len();

    let _ = app.emit(
        "import-progress",
        ImportProgressEvent::Started {
            total_chunks,
            total_chars,
        },
    );

    // ── Phase MAP ──────────────────────────────────────────────────────
    // Pour chaque chunk : extraction d'entités + résumé court via prompt
    // simplifié JSON-only. On stocke pour la phase reduce.

    let chunk_system = r#"Tu analyses un fragment de récit ou d'écrit. Tu extrais STRICTEMENT en JSON les entités saillantes et un résumé très court du fragment. Pas de texte autour.

{
  "discovered": [
    { "name": "...", "kind": "character|location|faction|object|concept", "mention": "<extrait court 60-120 chars de contexte>" }
  ],
  "chunkSummary": "<2-3 phrases qui résument ce fragment>"
}

Règles :
- Reste fidèle au fragment, n'invente rien.
- Une entité = une mention claire (un nom propre récurrent, un lieu nommé, une faction nommée, un objet ou concept clé).
- mention = un extrait court qui montre où l'entité apparaît (utile pour la suite).
- Pas de doublons dans `discovered` (un personnage = une seule entrée).
- Pas plus de 15 items au total dans `discovered`.

Aucun texte autour du JSON."#;

    #[derive(Deserialize)]
    struct ChunkResult {
        #[serde(default)]
        discovered: Vec<DiscoveredItem>,
        #[serde(default)]
        #[serde(rename = "chunkSummary")]
        chunk_summary: String,
    }

    let mut all_discovered: Vec<DiscoveredItem> = Vec::new();
    let mut chunk_summaries: Vec<String> = Vec::new();

    for (idx, chunk) in chunks.iter().enumerate() {
        let _ = app.emit(
            "import-progress",
            ImportProgressEvent::ChunkStarted {
                index: idx,
                total: total_chunks,
            },
        );

        let req = CompletionRequest {
            model: String::new(),
            messages: vec![
                Message {
                    role: Role::System,
                    content: chunk_system.to_string(),
                },
                Message {
                    role: Role::User,
                    content: format!("FRAGMENT {}/{} :\n\n{}", idx + 1, total_chunks, chunk),
                },
            ],
            temperature: Some(0.3),
            max_tokens: Some(2_048),
            stop: Vec::new(),
            json_schema: Some(json!({ "type": "object" })),
        };

        let chunk_text = match provider.complete(req).await {
            Ok(r) => r.content,
            Err(e) => {
                // On n'arrête pas le pipeline pour un chunk raté ; on log
                // et on passe au suivant. Mieux vaut une analyse partielle
                // qu'un échec complet.
                let _ = app.emit(
                    "import-progress",
                    ImportProgressEvent::Error {
                        message: format!("chunk {} : {e}", idx + 1),
                    },
                );
                continue;
            }
        };

        let json_str = extract_json_object(&chunk_text);
        let parsed: ChunkResult =
            serde_json::from_str(&json_str).unwrap_or(ChunkResult {
                discovered: Vec::new(),
                chunk_summary: String::new(),
            });

        all_discovered.extend(parsed.discovered.clone());
        if !parsed.chunk_summary.trim().is_empty() {
            chunk_summaries.push(parsed.chunk_summary.clone());
        }

        let _ = app.emit(
            "import-progress",
            ImportProgressEvent::ChunkAnalyzed {
                index: idx,
                total: total_chunks,
                discovered: parsed.discovered,
                chunk_summary: parsed.chunk_summary,
            },
        );
    }

    // ── Phase REDUCE ───────────────────────────────────────────────────
    // Dédup entités par nom normalisé (case-insensitive + NFD).

    let _ = app.emit("import-progress", ImportProgressEvent::Reducing);

    let mut seen_names: std::collections::HashSet<String> =
        std::collections::HashSet::new();
    let mut deduped: Vec<DiscoveredItem> = Vec::new();
    for item in all_discovered.iter() {
        let key = normalize_for_dedup(&item.name);
        if seen_names.insert(key) {
            deduped.push(item.clone());
        }
    }

    // Construit un récap qu'on file au modèle pour produire l'ImportAnalysis
    // structuré final. On ne lui repasse PAS le texte original (trop long) —
    // on lui passe les résumés de chunks + la liste dédupliquée d'entités.
    let target_block = payload
        .target_universe_name
        .filter(|s| !s.trim().is_empty())
        .map(|n| format!("\nL'univers cible existant s'appelle « {n} ».", ))
        .unwrap_or_default();

    let entities_recap = deduped
        .iter()
        .map(|d| format!("- {} ({}) — {}", d.name, d.kind, d.mention))
        .collect::<Vec<_>>()
        .join("\n");
    let summaries_block = chunk_summaries
        .iter()
        .enumerate()
        .map(|(i, s)| format!("Fragment {}/{} : {}", i + 1, total_chunks, s))
        .collect::<Vec<_>>()
        .join("\n\n");

    let final_system = format!(
        r#"Tu reçois la synthèse de l'analyse fragmentée d'un texte long. À partir des entités déjà repérées et des résumés de fragments, tu produis l'objet JSON ImportAnalysis final pour Romanesk. Pas de texte autour.{target_block}

Schéma : (mêmes règles que pour ai_analyze_import — si tu connais le format ImportAnalysis, conserve-le)

{{
  "universe": {{ "name": "...", "description": "...", "language": "fr", "tone": "literary" }},
  "isNarrative": true | false,
  "storyTitle": "...",
  "characters": [{{ "name": "...", "summary": "...", "archetype": "...", "traits": [], "biographyText": "..." }}],
  "locations": [{{ "name": "...", "summary": "...", "kind": "city|region|building|naturalFeature|celestial|other", "climate": "...", "population": "...", "descriptionText": "..." }}],
  "factions": [{{ "name": "...", "summary": "...", "kind": "government|guild|sect|clan|company|other", "ideology": "...", "founded": "...", "leader": "...", "descriptionText": "..." }}],
  "objects": [{{ "name": "...", "summary": "...", "kind": "artifact|weapon|armor|book|relic|tool|other", "origin": "...", "owner": "...", "properties": [], "descriptionText": "..." }}],
  "concepts": [{{ "name": "...", "summary": "...", "kind": "magic|religion|technology|philosophy|language|other", "domain": "...", "descriptionText": "..." }}],
  "eras": [{{ "name": "...", "startYear": -100, "endYear": 50, "description": "..." }}],
  "events": [{{ "name": "...", "year": 312, "eraName": "...", "description": "..." }}],
  "chapters": []
}}

Règles :
- Pour les chapters, laisse [] dans cette commande (pipeline stream — les chapitres complets ne tiennent pas dans le contexte du reduce).
- Fonde-toi sur les entités déjà repérées : ne réinventes pas, complète/détaille.
- Reste sobre : 1-2 phrases par summary, 2-4 par descriptionText.

Aucun texte autour du JSON."#,
    );

    let final_user = format!(
        "ENTITÉS REPÉRÉES :\n{entities_recap}\n\nRÉSUMÉS DES FRAGMENTS :\n{summaries_block}"
    );

    let req = CompletionRequest {
        model: String::new(),
        messages: vec![
            Message {
                role: Role::System,
                content: final_system,
            },
            Message {
                role: Role::User,
                content: final_user,
            },
        ],
        temperature: Some(0.3),
        max_tokens: Some(8_192),
        stop: Vec::new(),
        json_schema: Some(json!({ "type": "object" })),
    };

    let res = provider
        .complete(req)
        .await
        .map_err(|e| CommandError::Other(format!("reduce phase: {e}")))?;

    let analysis = parse_import_analysis(&res.content);

    let _ = app.emit(
        "import-progress",
        ImportProgressEvent::Done {
            analysis: ImportAnalysis {
                universe: analysis.universe.clone(),
                is_narrative: analysis.is_narrative,
                story_title: analysis.story_title.clone(),
                characters: analysis.characters.clone(),
                locations: analysis.locations.clone(),
                factions: analysis.factions.clone(),
                objects: analysis.objects.clone(),
                concepts: analysis.concepts.clone(),
                eras: analysis.eras.clone(),
                events: analysis.events.clone(),
                chapters: analysis.chapters.clone(),
                truncation_warning: None,
                parse_warning: analysis.parse_warning.clone(),
                raw_response: analysis.raw_response.clone(),
            },
        },
    );

    Ok(analysis)
}

fn normalize_for_dedup(s: &str) -> String {
    s.trim().to_lowercase()
}

fn parse_import_analysis(raw: &str) -> ImportAnalysis {
    let trimmed = extract_json_object(raw);
    let parsed: Result<serde_json::Value, _> = serde_json::from_str(&trimmed);

    let empty = || ImportAnalysis {
        universe: ImportUniverseHeader {
            name: "Univers importé".into(),
            description: None,
            language: Some("fr".into()),
            tone: Some("literary".into()),
        },
        is_narrative: false,
        story_title: None,
        characters: Vec::new(),
        locations: Vec::new(),
        factions: Vec::new(),
        objects: Vec::new(),
        concepts: Vec::new(),
        eras: Vec::new(),
        events: Vec::new(),
        chapters: Vec::new(),
        truncation_warning: None,
        parse_warning: None,
        raw_response: raw.to_string(),
    };

    let v = match parsed {
        Ok(v) => v,
        Err(e) => {
            let mut a = empty();
            a.parse_warning = Some(format!(
                "Réponse non-JSON parsable ({e}). Le contenu brut est dans rawResponse."
            ));
            return a;
        }
    };

    let mut a = empty();

    if let Some(uni) = v.get("universe").and_then(|x| x.as_object()) {
        a.universe.name = uni
            .get("name")
            .and_then(|x| x.as_str())
            .filter(|s| !s.trim().is_empty())
            .unwrap_or("Univers importé")
            .to_string();
        a.universe.description = uni
            .get("description")
            .and_then(|x| x.as_str())
            .map(str::to_string);
        a.universe.language = uni
            .get("language")
            .and_then(|x| x.as_str())
            .map(str::to_string);
        a.universe.tone = uni
            .get("tone")
            .and_then(|x| x.as_str())
            .map(str::to_string);
    }
    a.is_narrative = v
        .get("isNarrative")
        .and_then(|x| x.as_bool())
        .unwrap_or(false);
    a.story_title = v
        .get("storyTitle")
        .and_then(|x| x.as_str())
        .filter(|s| !s.trim().is_empty())
        .map(str::to_string);

    a.characters = parse_arr(&v, "characters", parse_character);
    a.locations = parse_arr(&v, "locations", parse_location);
    a.factions = parse_arr(&v, "factions", parse_faction);
    a.objects = parse_arr(&v, "objects", parse_object);
    a.concepts = parse_arr(&v, "concepts", parse_concept);
    a.eras = parse_arr(&v, "eras", parse_era);
    a.events = parse_arr(&v, "events", parse_event);
    a.chapters = parse_arr(&v, "chapters", parse_chapter);

    a
}

fn parse_arr<T>(
    v: &serde_json::Value,
    key: &str,
    item_parser: fn(&serde_json::Value) -> Option<T>,
) -> Vec<T> {
    v.get(key)
        .and_then(|x| x.as_array())
        .map(|arr| arr.iter().filter_map(item_parser).collect())
        .unwrap_or_default()
}

fn s_field(v: &serde_json::Value, k: &str) -> Option<String> {
    v.get(k)
        .and_then(|x| x.as_str())
        .filter(|s| !s.trim().is_empty())
        .map(str::to_string)
}
fn arr_s(v: &serde_json::Value, k: &str) -> Vec<String> {
    v.get(k)
        .and_then(|x| x.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|i| i.as_str().filter(|s| !s.trim().is_empty()).map(str::to_string))
                .collect()
        })
        .unwrap_or_default()
}
fn i_field(v: &serde_json::Value, k: &str) -> Option<i64> {
    v.get(k).and_then(|x| x.as_i64())
}

fn parse_character(v: &serde_json::Value) -> Option<ImportCharacter> {
    let name = s_field(v, "name")?;
    Some(ImportCharacter {
        name,
        summary: s_field(v, "summary"),
        archetype: s_field(v, "archetype"),
        traits: arr_s(v, "traits"),
        biography_text: s_field(v, "biographyText"),
    })
}
fn parse_location(v: &serde_json::Value) -> Option<ImportLocation> {
    let name = s_field(v, "name")?;
    Some(ImportLocation {
        name,
        summary: s_field(v, "summary"),
        kind: s_field(v, "kind"),
        climate: s_field(v, "climate"),
        population: s_field(v, "population"),
        description_text: s_field(v, "descriptionText"),
    })
}
fn parse_faction(v: &serde_json::Value) -> Option<ImportFaction> {
    let name = s_field(v, "name")?;
    Some(ImportFaction {
        name,
        summary: s_field(v, "summary"),
        kind: s_field(v, "kind"),
        ideology: s_field(v, "ideology"),
        founded: s_field(v, "founded"),
        leader: s_field(v, "leader"),
        description_text: s_field(v, "descriptionText"),
    })
}
fn parse_object(v: &serde_json::Value) -> Option<ImportObject> {
    let name = s_field(v, "name")?;
    Some(ImportObject {
        name,
        summary: s_field(v, "summary"),
        kind: s_field(v, "kind"),
        origin: s_field(v, "origin"),
        owner: s_field(v, "owner"),
        properties: arr_s(v, "properties"),
        description_text: s_field(v, "descriptionText"),
    })
}
fn parse_concept(v: &serde_json::Value) -> Option<ImportConcept> {
    let name = s_field(v, "name")?;
    Some(ImportConcept {
        name,
        summary: s_field(v, "summary"),
        kind: s_field(v, "kind"),
        domain: s_field(v, "domain"),
        description_text: s_field(v, "descriptionText"),
    })
}
fn parse_era(v: &serde_json::Value) -> Option<ImportEra> {
    let name = s_field(v, "name")?;
    Some(ImportEra {
        name,
        start_year: i_field(v, "startYear"),
        end_year: i_field(v, "endYear"),
        description: s_field(v, "description"),
    })
}
fn parse_event(v: &serde_json::Value) -> Option<ImportEvent> {
    let name = s_field(v, "name")?;
    Some(ImportEvent {
        name,
        year: i_field(v, "year"),
        era_name: s_field(v, "eraName"),
        description: s_field(v, "description"),
    })
}
fn parse_chapter(v: &serde_json::Value) -> Option<ImportChapter> {
    let title = s_field(v, "title")?;
    let body_text = s_field(v, "bodyText")?;
    Some(ImportChapter { title, body_text })
}

