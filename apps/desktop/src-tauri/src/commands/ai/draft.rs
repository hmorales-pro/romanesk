//! `ai_generate_entity_draft` — génération assistée de fiche (P3.2).

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
// Génération de fiche assistée par IA (P3.2)
// ---------------------------------------------------------------------------

/// Brouillon retourné par `ai_generate_entity_draft`.
/// Tous les champs sont optionnels : le front utilise ceux qui s'appliquent
/// au type demandé. Le modèle est encouragé à produire un objet JSON
/// conforme au schéma fourni dans le prompt.
///
/// Phase 6 (P6.1) : étendu aux types Faction / Object / Concept (l'enum
/// `EntityType` a 6 variants depuis P1, on couvre maintenant tout sauf
/// `RealEntity` qui reste géré via la page d'ancrage).
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EntityDraft {
    pub name: Option<String>,
    pub summary: Option<String>,
    // Character
    pub archetype: Option<String>,
    pub traits: Option<Vec<String>>,
    pub biography_text: Option<String>,
    // Location
    pub location_kind: Option<String>,
    pub climate: Option<String>,
    pub population: Option<String>,
    // Faction
    pub faction_kind: Option<String>,
    pub ideology: Option<String>,
    pub founded: Option<String>,
    pub leader: Option<String>,
    // Object
    pub object_kind: Option<String>,
    pub origin: Option<String>,
    pub owner: Option<String>,
    pub properties: Option<Vec<String>>,
    // Concept
    pub concept_kind: Option<String>,
    pub domain: Option<String>,
    // Description riche partagée (Location / Faction / Object / Concept)
    pub description_text: Option<String>,
    // Métadonnées de débogage
    pub raw_response: String,
    pub parse_warning: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GenerateEntityDraftPayload {
    pub universe_id: String,
    pub kind: EntityType,
    pub name: String,
    /// Quelques mots-clés / pistes que l'utilisateur veut suggérer à l'IA.
    #[serde(default)]
    pub hint: Option<String>,
}

#[tauri::command]
pub async fn ai_generate_entity_draft(
    db: State<'_, Database>,
    provider: State<'_, AiProvider>,
    payload: GenerateEntityDraftPayload,
) -> CommandResult<EntityDraft> {
    let universe_id = Uuid::parse_str(&payload.universe_id)?;
    let universe = Repo::new(db.inner().clone())
        .universes()
        .get(universe_id)
        .await?
        .ok_or_else(|| CommandError::Other(format!("universe {universe_id} not found")))?;

    // Langue / ton lus depuis universe.settings (configurable par univers).
    let language = universe
        .settings
        .get("language")
        .and_then(|v| v.as_str())
        .unwrap_or("fr");
    let tone = universe
        .settings
        .get("tone")
        .and_then(|v| v.as_str())
        .unwrap_or("literary");

    let (system_prompt, user_prompt) = build_draft_prompt(
        &payload.kind,
        &payload.name,
        payload.hint.as_deref().unwrap_or(""),
        &universe.name,
        universe.description.as_deref().unwrap_or(""),
        language,
        tone,
    );

    let req = CompletionRequest {
        model: String::new(),
        messages: vec![
            Message {
                role: Role::System,
                content: system_prompt,
            },
            Message {
                role: Role::User,
                content: user_prompt,
            },
        ],
        temperature: Some(0.8),
        max_tokens: Some(2048),
        stop: Vec::new(),
        // Active le mode JSON forcé d'Ollama (cf. ollama.rs).
        json_schema: Some(json!({ "type": "object" })),
    };

    let provider = provider.snapshot().await;
    let res = provider
        .complete(req)
        .await
        .map_err(|e| CommandError::Other(e.to_string()))?;

    Ok(parse_draft(&res.content, payload.kind))
}

fn build_draft_prompt(
    kind: &EntityType,
    name: &str,
    hint: &str,
    universe_name: &str,
    universe_description: &str,
    language: &str,
    tone: &str,
) -> (String, String) {
    let lang_label = match language {
        "en" => "English",
        "fr" => "français",
        other => other,
    };
    let tone_label = match tone {
        "literary" => "littéraire et soigné, vocabulaire précis",
        "casual" => "courant, accessible",
        other => other,
    };

    let kind_section = match kind {
        EntityType::Character => {
            r#"Tu génères une **fiche de personnage** pour un univers fictionnel.
Réponds STRICTEMENT en JSON valide avec ces clés exactes :

{
  "name": "<nom du personnage, identique à celui demandé sauf si tu proposes un raffinement>",
  "summary": "<une phrase de 10-20 mots qui capture l'essence du personnage>",
  "archetype": "<un seul mot ou très court terme : mentor, exilé, héritière, traître, alchimiste…>",
  "traits": ["<5 à 8 traits de caractère, un ou deux mots chacun>"],
  "biographyText": "<3 à 6 paragraphes qui racontent son parcours, ses motivations, son ou ses secrets. Texte simple, séparé par des sauts de ligne. Ne mets PAS de markdown.>"
}

Aucun texte autour du JSON. Pas d'explication. Juste l'objet JSON."#
        }
        EntityType::Location => {
            r#"Tu génères une **fiche de lieu** pour un univers fictionnel.
Réponds STRICTEMENT en JSON valide avec ces clés exactes :

{
  "name": "<nom du lieu>",
  "summary": "<une phrase de 10-20 mots qui capture l'atmosphère et la fonction du lieu>",
  "locationKind": "<un seul de: city, region, building, naturalFeature, celestial, other>",
  "climate": "<en quelques mots : tempéré, polaire, brumeux…>",
  "population": "<en quelques mots : 30 000 hab. humains, peuplé d'elfes…>",
  "descriptionText": "<3 à 6 paragraphes : géographie, atmosphère, histoire, particularités. Texte simple, sauts de ligne. Pas de markdown.>"
}

Aucun texte autour du JSON. Pas d'explication. Juste l'objet JSON."#
        }
        EntityType::Faction => {
            r#"Tu génères une **fiche de faction** (groupe organisé) pour un univers fictionnel.
Réponds STRICTEMENT en JSON valide avec ces clés exactes :

{
  "name": "<nom de la faction>",
  "summary": "<une phrase de 10-20 mots qui capture la nature et le rôle de la faction>",
  "factionKind": "<un seul de: government, guild, sect, clan, company, other>",
  "ideology": "<en quelques mots : ordre, liberté, savoir, vengeance…>",
  "founded": "<en quelques mots : an 312, ère pré-glaciaire, fondée après la Chute…>",
  "leader": "<nom ou titre du dirigeant actuel : Reine Lyra, Conseil des Sept, Anonyme…>",
  "descriptionText": "<3 à 6 paragraphes : histoire, structure, alliances, ennemis, signes distinctifs. Texte simple, sauts de ligne. Pas de markdown.>"
}

Aucun texte autour du JSON. Pas d'explication. Juste l'objet JSON."#
        }
        EntityType::Object => {
            r#"Tu génères une **fiche d'objet** (artefact, arme, livre, relique…) pour un univers fictionnel.
Réponds STRICTEMENT en JSON valide avec ces clés exactes :

{
  "name": "<nom de l'objet>",
  "summary": "<une phrase de 10-20 mots qui capture sa nature et son importance>",
  "objectKind": "<un seul de: artifact, weapon, armor, book, relic, tool, other>",
  "origin": "<en quelques mots : forgé par les Nains, ramené d'Aëlis, écrit en l'an 412…>",
  "owner": "<nom du propriétaire actuel ou \"perdu\", \"inconnu\"…>",
  "properties": ["<3 à 6 propriétés courtes : incassable, brûle au contact des morts, vibre près de la Faille…>"],
  "descriptionText": "<3 à 6 paragraphes : apparence, matière, marques d'usure, légendes, effet sur ceux qui le manipulent. Texte simple, sauts de ligne. Pas de markdown.>"
}

Aucun texte autour du JSON. Pas d'explication. Juste l'objet JSON."#
        }
        EntityType::Concept => {
            r#"Tu génères une **fiche de concept** (système de magie, religion, technologie, philosophie, langue…) pour un univers fictionnel.
Réponds STRICTEMENT en JSON valide avec ces clés exactes :

{
  "name": "<nom du concept>",
  "summary": "<une phrase de 10-20 mots qui capture son essence>",
  "conceptKind": "<un seul de: magic, religion, technology, philosophy, language, other>",
  "domain": "<en quelques mots : élémentaire, pan-galactique, monastique, populaire…>",
  "descriptionText": "<4 à 8 paragraphes : règles, dogmes, principes, exemples concrets, qui le pratique, ses limites. Texte simple, sauts de ligne. Pas de markdown.>"
}

Aucun texte autour du JSON. Pas d'explication. Juste l'objet JSON."#
        }
        _ => {
            r#"Réponds en JSON avec les clés "name" et "summary"."#
        }
    };

    let system = format!(
        "Tu es un assistant de worldbuilding pour un auteur de fiction. \
         Tu écris en {lang_label}, ton {tone_label}. \
         Tu connais l'univers : « {universe_name} »{}. \
         {kind_section}",
        if universe_description.is_empty() {
            String::new()
        } else {
            format!(" — {universe_description}")
        }
    );

    let user = if hint.trim().is_empty() {
        format!("Crée une fiche pour : {name}")
    } else {
        format!("Crée une fiche pour : {name}\n\nPiste / contexte : {hint}")
    };

    (system, user)
}

fn parse_draft(raw: &str, kind: EntityType) -> EntityDraft {
    // Le mode JSON d'Ollama garantit normalement un JSON valide, mais on
    // garde une parade : on tente de localiser le premier { et le dernier }.
    let trimmed = extract_json_object(raw);
    let parsed: Result<serde_json::Value, _> = serde_json::from_str(&trimmed);

    let mut draft = EntityDraft {
        name: None,
        summary: None,
        archetype: None,
        traits: None,
        biography_text: None,
        location_kind: None,
        climate: None,
        population: None,
        faction_kind: None,
        ideology: None,
        founded: None,
        leader: None,
        object_kind: None,
        origin: None,
        owner: None,
        properties: None,
        concept_kind: None,
        domain: None,
        description_text: None,
        raw_response: raw.to_string(),
        parse_warning: None,
    };

    let v = match parsed {
        Ok(v) => v,
        Err(e) => {
            draft.parse_warning = Some(format!(
                "Réponse non-JSON parsable ({}). Le contenu brut est dans `rawResponse`.",
                e
            ));
            return draft;
        }
    };

    let s = |k: &str| v.get(k).and_then(|x| x.as_str()).map(str::to_string);
    let arr_s = |k: &str| {
        v.get(k).and_then(|x| x.as_array()).map(|arr| {
            arr.iter()
                .filter_map(|i| i.as_str().map(str::to_string))
                .collect::<Vec<_>>()
        })
    };

    draft.name = s("name");
    draft.summary = s("summary");
    match kind {
        EntityType::Character => {
            draft.archetype = s("archetype");
            draft.traits = arr_s("traits");
            draft.biography_text = s("biographyText");
        }
        EntityType::Location => {
            draft.location_kind = s("locationKind");
            draft.climate = s("climate");
            draft.population = s("population");
            draft.description_text = s("descriptionText");
        }
        EntityType::Faction => {
            draft.faction_kind = s("factionKind");
            draft.ideology = s("ideology");
            draft.founded = s("founded");
            draft.leader = s("leader");
            draft.description_text = s("descriptionText");
        }
        EntityType::Object => {
            draft.object_kind = s("objectKind");
            draft.origin = s("origin");
            draft.owner = s("owner");
            draft.properties = arr_s("properties");
            draft.description_text = s("descriptionText");
        }
        EntityType::Concept => {
            draft.concept_kind = s("conceptKind");
            draft.domain = s("domain");
            draft.description_text = s("descriptionText");
        }
        EntityType::RealEntity => {}
    }

    draft
}

fn extract_json_object(s: &str) -> String {
    let bytes = s.as_bytes();
    let start = bytes.iter().position(|&b| b == b'{');
    let end = bytes.iter().rposition(|&b| b == b'}');
    match (start, end) {
        (Some(a), Some(b)) if b >= a => s[a..=b].to_string(),
        _ => s.to_string(),
    }
}

