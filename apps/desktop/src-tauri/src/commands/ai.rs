//! Commandes Tauri pour la couche IA (Phase 3).
//!
//! Le `Provider` est instancié au setup de l'app et stocké en `tauri::State`
//! sous la forme `AiProvider` (alias `Arc<dyn Provider>`). En P3.1 c'est
//! systématiquement un `OllamaProvider` pointant sur `localhost:11434`.
//! En P3.2+ on rendra l'URL et le modèle configurables via un settings.json.

use romanesk_core::ai::{
    CompletionRequest, CompletionResponse, Message, OllamaProvider, Provider, ProviderId, Role,
};
use romanesk_core::domain::SourceType;
use romanesk_core::{Database, Entity, EntityType, NewEmbedding, Repo};
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::sync::Arc;
use tauri::State;
use uuid::Uuid;

use super::{CommandError, CommandResult};

/// Wrapper qui donne un nom typable à la State partagée.
#[derive(Clone)]
pub struct AiProvider(pub Arc<dyn Provider>);

/// Provider spécifique pour les embeddings (modèle distinct du chat).
/// Phase 3.3 : Ollama avec `nomic-embed-text:latest` par défaut.
#[derive(Clone)]
pub struct AiEmbedder {
    pub provider: Arc<OllamaProvider>,
    pub model: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AiStatus {
    pub provider_id: String,
    pub default_model: String,
    pub reachable: bool,
    pub error: Option<String>,
}

#[tauri::command]
pub async fn ai_ping(provider: State<'_, AiProvider>) -> CommandResult<AiStatus> {
    let provider_id = provider_id_label(&provider.0.id());
    let default_model = default_model_label(&provider.0);
    match provider.0.ping().await {
        Ok(()) => Ok(AiStatus {
            provider_id,
            default_model,
            reachable: true,
            error: None,
        }),
        Err(e) => Ok(AiStatus {
            provider_id,
            default_model,
            reachable: false,
            error: Some(e.to_string()),
        }),
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiCompletePayload {
    pub system: Option<String>,
    pub user: String,
    #[serde(default)]
    pub temperature: Option<f32>,
    #[serde(default)]
    pub max_tokens: Option<u32>,
    /// Si vide, utilise le `default_model` du provider.
    #[serde(default)]
    pub model: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AiCompleteResult {
    pub model: String,
    pub content: String,
    pub finish_reason: Option<String>,
    pub prompt_tokens: Option<u32>,
    pub completion_tokens: Option<u32>,
}

#[tauri::command]
pub async fn ai_complete(
    provider: State<'_, AiProvider>,
    payload: AiCompletePayload,
) -> CommandResult<AiCompleteResult> {
    let mut messages = Vec::new();
    if let Some(system) = payload.system.filter(|s| !s.trim().is_empty()) {
        messages.push(Message {
            role: Role::System,
            content: system,
        });
    }
    messages.push(Message {
        role: Role::User,
        content: payload.user,
    });

    let req = CompletionRequest {
        model: payload.model.unwrap_or_default(),
        messages,
        temperature: payload.temperature,
        max_tokens: payload.max_tokens,
        stop: Vec::new(),
        json_schema: None,
    };

    let res: CompletionResponse = provider
        .0
        .complete(req)
        .await
        .map_err(|e| CommandError::Other(e.to_string()))?;

    Ok(AiCompleteResult {
        model: res.model,
        content: res.content,
        finish_reason: res.finish_reason,
        prompt_tokens: res.usage.as_ref().map(|u| u.prompt_tokens),
        completion_tokens: res.usage.as_ref().map(|u| u.completion_tokens),
    })
}

// ---------------------------------------------------------------------------
// Génération de fiche assistée par IA (P3.2)
// ---------------------------------------------------------------------------

/// Brouillon retourné par `ai_generate_entity_draft`.
/// Tous les champs sont optionnels : le front utilise ceux qui s'appliquent
/// au type demandé (Character ou Location). Le modèle est encouragé à
/// produire un objet JSON conforme au schéma fourni dans le prompt.
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

    let res = provider
        .0
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
        _ => {}
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

// ---------------------------------------------------------------------------
// Indexation + Q&A RAG (P3.3)
// ---------------------------------------------------------------------------

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReindexResult {
    pub indexed_count: usize,
    pub model: String,
    pub dimension: usize,
}

/// (Re)indexe toutes les entités d'un univers. Pour chaque entité, on
/// produit UN chunk = texte plat extrait de (name + summary + content).
/// On purge d'abord les embeddings existants pour cette source pour éviter
/// les doublons.
///
/// Phase 3.3 minimaliste : 1 chunk par entité. Phase 4+ : chunking
/// par paragraphe pour les biographies longues.
#[tauri::command]
pub async fn ai_universe_reindex(
    db: State<'_, Database>,
    embedder: State<'_, AiEmbedder>,
    universe_id: String,
) -> CommandResult<ReindexResult> {
    let uid = Uuid::parse_str(&universe_id)?;
    let repo = Repo::new(db.inner().clone());

    let entities = repo.entities().list_in_universe(uid, None).await?;
    if entities.is_empty() {
        return Ok(ReindexResult {
            indexed_count: 0,
            model: embedder.model.clone(),
            dimension: 0,
        });
    }

    // Texte par entité.
    let texts: Vec<String> = entities.iter().map(entity_to_text).collect();

    // Embeddings en batch (un seul appel HTTP).
    let vectors = embedder
        .provider
        .embed_with_model(texts.clone(), &embedder.model)
        .await
        .map_err(|e| CommandError::Other(format!("embedding failed: {e}")))?;

    if vectors.len() != entities.len() {
        return Err(CommandError::Other(format!(
            "embedder returned {} vectors for {} entities",
            vectors.len(),
            entities.len()
        )));
    }

    let dim = vectors.first().map(Vec::len).unwrap_or(0);

    // Purge l'ancien index puis ré-insère.
    for entity in &entities {
        repo.embeddings()
            .delete_for(SourceType::Entity, entity.id)
            .await?;
    }

    for ((entity, text), vector) in entities.iter().zip(texts.iter()).zip(vectors.iter()) {
        repo.embeddings()
            .insert(NewEmbedding {
                source_type: SourceType::Entity,
                source_id: entity.id,
                chunk_idx: 0,
                content: text.clone(),
                model: embedder.model.clone(),
                vector: vector.clone(),
            })
            .await?;
    }

    Ok(ReindexResult {
        indexed_count: entities.len(),
        model: embedder.model.clone(),
        dimension: dim,
    })
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RagSource {
    pub entity_id: Uuid,
    pub entity_name: String,
    pub entity_type: EntityType,
    pub score: f32,
    pub snippet: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RagAnswer {
    pub answer: String,
    pub sources: Vec<RagSource>,
    pub used_model_chat: String,
    pub used_model_embed: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RagQueryPayload {
    pub universe_id: String,
    pub question: String,
    /// Nombre de chunks à récupérer en contexte (défaut 5).
    #[serde(default)]
    pub top_k: Option<usize>,
}

#[tauri::command]
pub async fn ai_rag_query(
    db: State<'_, Database>,
    provider: State<'_, AiProvider>,
    embedder: State<'_, AiEmbedder>,
    payload: RagQueryPayload,
) -> CommandResult<RagAnswer> {
    let uid = Uuid::parse_str(&payload.universe_id)?;
    if payload.question.trim().is_empty() {
        return Err(CommandError::Other("question must not be empty".into()));
    }

    let repo = Repo::new(db.inner().clone());
    let universe = repo
        .universes()
        .get(uid)
        .await?
        .ok_or_else(|| CommandError::Other(format!("universe {uid} not found")))?;

    // 1. Embed la question
    let q_vectors = embedder
        .provider
        .embed_with_model(vec![payload.question.clone()], &embedder.model)
        .await
        .map_err(|e| CommandError::Other(format!("embed question: {e}")))?;
    let q_vec = q_vectors
        .into_iter()
        .next()
        .ok_or_else(|| CommandError::Other("embedder returned no vector".into()))?;

    // 2. Search top-k
    let k = payload.top_k.unwrap_or(5).max(1).min(20);
    use romanesk_core::rag::SearchFilter;
    let hits = repo
        .embeddings()
        .search_topk(
            &q_vec,
            k,
            SearchFilter::by_model(&embedder.model),
        )
        .await?;

    if hits.is_empty() {
        return Ok(RagAnswer {
            answer: "Je n'ai trouvé aucune fiche correspondante. As-tu indexé l'univers ? (bouton « Réindexer »)".into(),
            sources: Vec::new(),
            used_model_chat: "none".into(),
            used_model_embed: embedder.model.clone(),
        });
    }

    // 3. Récupère les entités sources pour leurs noms
    let mut sources = Vec::new();
    let mut context_blocks = Vec::new();
    for (i, hit) in hits.iter().enumerate() {
        let entity_opt = repo
            .entities()
            .get(hit.embedding.source_id)
            .await
            .ok()
            .flatten();
        let (name, ty) = entity_opt
            .as_ref()
            .map(|e| (e.name.clone(), e.kind))
            .unwrap_or_else(|| ("(entité supprimée)".into(), EntityType::Character));
        let snippet = truncate(&hit.embedding.content, 280);
        sources.push(RagSource {
            entity_id: hit.embedding.source_id,
            entity_name: name.clone(),
            entity_type: ty,
            score: hit.score,
            snippet: snippet.clone(),
        });
        context_blocks.push(format!("--- Fiche {} : {} ---\n{}\n", i + 1, name, snippet));
    }

    // 4. Construit le prompt
    let language = universe
        .settings
        .get("language")
        .and_then(|v| v.as_str())
        .unwrap_or("fr");
    let lang_label = if language == "en" { "English" } else { "français" };

    let system = format!(
        "Tu es un assistant de worldbuilding qui répond en {lang_label} aux questions \
         sur l'univers fictionnel « {}». Utilise UNIQUEMENT les extraits de fiches \
         fournis ci-dessous pour répondre. Si tu ne sais pas, dis-le honnêtement. \
         Cite les noms des fiches que tu utilises. Sois concis (3-5 phrases).",
        universe.name
    );

    let user = format!(
        "Question : {}\n\nExtraits de fiches :\n\n{}\n\nRéponse :",
        payload.question.trim(),
        context_blocks.join("\n")
    );

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
        max_tokens: Some(800),
        stop: Vec::new(),
        json_schema: None,
    };

    let res = provider
        .0
        .complete(req)
        .await
        .map_err(|e| CommandError::Other(format!("chat completion: {e}")))?;

    Ok(RagAnswer {
        answer: res.content,
        sources,
        used_model_chat: res.model,
        used_model_embed: embedder.model.clone(),
    })
}

/// Convertit une entité en texte plat indexable.
fn entity_to_text(entity: &Entity) -> String {
    let mut out = String::new();
    out.push_str(&format!(
        "{} ({:?})\n",
        entity.name,
        entity.kind
    ));
    if let Some(s) = &entity.summary {
        out.push_str(s);
        out.push_str("\n\n");
    }

    // Champs courants typés (Character, Location)
    if let Some(s) = entity.content.get("archetype").and_then(|v| v.as_str()) {
        out.push_str(&format!("Archétype : {s}\n"));
    }
    if let Some(arr) = entity.content.get("traits").and_then(|v| v.as_array()) {
        let traits: Vec<&str> = arr.iter().filter_map(|t| t.as_str()).collect();
        if !traits.is_empty() {
            out.push_str(&format!("Traits : {}\n", traits.join(", ")));
        }
    }
    if let Some(s) = entity.content.get("climate").and_then(|v| v.as_str()) {
        out.push_str(&format!("Climat : {s}\n"));
    }
    if let Some(s) = entity.content.get("population").and_then(|v| v.as_str()) {
        out.push_str(&format!("Population : {s}\n"));
    }
    if let Some(s) = entity.content.get("kind").and_then(|v| v.as_str()) {
        out.push_str(&format!("Type de lieu : {s}\n"));
    }

    // Bio / description : Tiptap doc ou string legacy
    for key in ["biography", "description", "biographyText", "descriptionText"] {
        if let Some(v) = entity.content.get(key) {
            let text = if let Some(s) = v.as_str() {
                s.to_string()
            } else if v.is_object() {
                romanesk_core::export::render_tiptap_doc(v)
            } else {
                continue;
            };
            if !text.trim().is_empty() {
                out.push_str(&format!("\n{}", text));
            }
        }
    }

    out
}

fn truncate(s: &str, n: usize) -> String {
    if s.chars().count() <= n {
        s.to_string()
    } else {
        let mut out: String = s.chars().take(n).collect();
        out.push('…');
        out
    }
}

fn provider_id_label(id: &ProviderId) -> String {
    match id {
        ProviderId::Ollama => "ollama".into(),
        ProviderId::Anthropic => "anthropic".into(),
        ProviderId::OpenAi => "openai".into(),
        ProviderId::Gemini => "gemini".into(),
        ProviderId::Mistral => "mistral".into(),
        ProviderId::Custom(name) => name.clone(),
    }
}

/// Le trait `Provider` n'expose pas le default_model directement (ce n'est
/// pas dans son contrat). On fait du best-effort : on tente une complétion
/// vide pour récupérer le `model` retourné. En P3.2+ on stockera
/// explicitement le default_model dans la State.
fn default_model_label(_provider: &Arc<dyn Provider>) -> String {
    // Compromis : on ne déclenche pas de requête réseau ici (le caller
    // appelle ai_ping qui peut être hors-ligne). On affiche juste l'id.
    "default".into()
}
