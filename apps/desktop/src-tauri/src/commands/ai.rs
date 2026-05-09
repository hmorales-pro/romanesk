//! Commandes Tauri pour la couche IA (Phase 3).
//!
//! Le `Provider` est instancié au setup de l'app et stocké en `tauri::State`
//! sous la forme `AiProvider` (alias `Arc<dyn Provider>`). En P3.1 c'est
//! systématiquement un `OllamaProvider` pointant sur `localhost:11434`.
//! En P3.2+ on rendra l'URL et le modèle configurables via un settings.json.

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

use super::{CommandError, CommandResult};

/// Wrapper qui donne un nom typable à la State partagée.
///
/// Phase 5 (P5.3) : interior-mutable pour permettre le hot-reload des
/// providers IA depuis Settings sans redémarrer l'app. Les commandes
/// snapshotent la valeur courante en début d'exécution (`snapshot().await`)
/// puis travaillent sur l'`Arc` cloné — la mutation est visible au
/// prochain appel sans toucher au call-site.
#[derive(Clone)]
pub struct AiProvider(pub Arc<RwLock<Arc<dyn Provider>>>);

impl AiProvider {
    #[must_use]
    pub fn from_provider(p: Arc<dyn Provider>) -> Self {
        Self(Arc::new(RwLock::new(p)))
    }

    /// Clone l'`Arc` courant. Tient le read lock le temps minimal — l'`Arc`
    /// retourné peut être utilisé sans bloquer d'autres lecteurs ni un
    /// futur swap.
    pub async fn snapshot(&self) -> Arc<dyn Provider> {
        self.0.read().await.clone()
    }

    pub async fn replace(&self, p: Arc<dyn Provider>) {
        *self.0.write().await = p;
    }
}

/// Provider spécifique pour les embeddings (modèle distinct du chat).
/// Phase 3.3 : Ollama avec `nomic-embed-text:latest` par défaut.
/// Phase 5 (P5.3) : interior-mutable comme `AiProvider`.
#[derive(Clone)]
pub struct AiEmbedder(pub Arc<RwLock<AiEmbedderInner>>);

#[derive(Clone)]
pub struct AiEmbedderInner {
    pub provider: Arc<OllamaProvider>,
    pub model: String,
}

impl AiEmbedder {
    #[must_use]
    pub fn from_parts(provider: Arc<OllamaProvider>, model: String) -> Self {
        Self(Arc::new(RwLock::new(AiEmbedderInner { provider, model })))
    }

    pub async fn snapshot(&self) -> AiEmbedderInner {
        self.0.read().await.clone()
    }

    pub async fn replace(&self, provider: Arc<OllamaProvider>, model: String) {
        *self.0.write().await = AiEmbedderInner { provider, model };
    }
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
    let provider = provider.snapshot().await;
    let provider_id = provider_id_label(&provider.id());
    let default_model = default_model_label(&provider);
    match provider.ping().await {
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

// ---------------------------------------------------------------------------
// ai_list_models — liste les modèles installés sur Ollama
// ---------------------------------------------------------------------------
//
// Permet à Settings d'afficher des dropdowns au lieu de champs texte libres
// pour le choix des modèles chat / embed / créatif / littéral / vision.
// Le front passe la base_url courante (settings.ollamaBaseUrl) — comme ça
// on peut tester un nouveau serveur Ollama sans avoir à hot-reload les
// providers d'abord.

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AiModel {
    pub name: String,
    pub size_bytes: u64,
    pub modified_at: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiListModelsPayload {
    pub base_url: String,
}

#[tauri::command]
pub async fn ai_list_models(payload: AiListModelsPayload) -> CommandResult<Vec<AiModel>> {
    let base = payload.base_url.trim_end_matches('/');
    let url = format!("{base}/api/tags");
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(8))
        .build()
        .map_err(|e| CommandError::Other(format!("client: {e}")))?;
    let resp = client
        .get(&url)
        .send()
        .await
        .map_err(|e| CommandError::Other(format!("ollama unreachable: {e}")))?;
    if !resp.status().is_success() {
        return Err(CommandError::Other(format!(
            "ollama HTTP {}",
            resp.status()
        )));
    }

    #[derive(Deserialize)]
    struct OllamaTagsResponse {
        models: Vec<OllamaModelEntry>,
    }
    #[derive(Deserialize)]
    struct OllamaModelEntry {
        name: String,
        #[serde(default)]
        size: u64,
        #[serde(default)]
        modified_at: Option<String>,
    }

    let parsed: OllamaTagsResponse = resp
        .json()
        .await
        .map_err(|e| CommandError::Other(format!("parse: {e}")))?;

    Ok(parsed
        .models
        .into_iter()
        .map(|m| AiModel {
            name: m.name,
            size_bytes: m.size,
            modified_at: m.modified_at,
        })
        .collect())
}

// ---------------------------------------------------------------------------
// ai_pull_model — télécharge un modèle depuis le registry Ollama
// ---------------------------------------------------------------------------
//
// Streame les events JSON `{status, completed, total, ...}` que Ollama
// renvoie sur `POST /api/pull`, et les remonte au front via Tauri events
// `model-pull-progress` pour qu'on puisse afficher une vraie progress bar
// au lieu d'un spinner aveugle.
//
// La commande retourne `()` quand le stream est terminé (success: true ou
// erreur). Le front s'abonne en parallèle à l'event pour le progrès.

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiPullModelPayload {
    pub base_url: String,
    pub model: String,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ModelPullProgress {
    pub model: String,
    pub status: String,
    pub completed: Option<u64>,
    pub total: Option<u64>,
    pub done: bool,
}

#[tauri::command]
pub async fn ai_pull_model(
    app: tauri::AppHandle,
    payload: AiPullModelPayload,
) -> CommandResult<()> {
    use futures_util::StreamExt;
    use tauri::Emitter;

    let base = payload.base_url.trim_end_matches('/');
    let url = format!("{base}/api/pull");
    let body = serde_json::json!({
        "model": &payload.model,
        "stream": true,
    });

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(60 * 30))
        .build()
        .map_err(|e| CommandError::Other(format!("client: {e}")))?;
    let resp = client
        .post(&url)
        .json(&body)
        .send()
        .await
        .map_err(|e| CommandError::Other(format!("ollama unreachable: {e}")))?;
    if !resp.status().is_success() {
        return Err(CommandError::Other(format!(
            "ollama HTTP {}",
            resp.status()
        )));
    }

    #[derive(Deserialize)]
    struct OllamaPullEvent {
        status: String,
        #[serde(default)]
        completed: Option<u64>,
        #[serde(default)]
        total: Option<u64>,
        #[serde(default)]
        error: Option<String>,
    }

    let mut stream = resp.bytes_stream();
    let mut buf: Vec<u8> = Vec::new();

    while let Some(chunk) = stream.next().await {
        let chunk = chunk
            .map_err(|e| CommandError::Other(format!("stream: {e}")))?;
        buf.extend_from_slice(&chunk);

        while let Some(pos) = buf.iter().position(|&b| b == b'\n') {
            let line: Vec<u8> = buf.drain(..=pos).collect();
            let text = std::str::from_utf8(&line[..line.len() - 1])
                .map_err(|e| CommandError::Other(format!("utf8: {e}")))?
                .trim();
            if text.is_empty() {
                continue;
            }
            let event: OllamaPullEvent = serde_json::from_str(text)
                .map_err(|e| CommandError::Other(format!("parse pull event: {e}")))?;

            if let Some(err) = event.error {
                return Err(CommandError::Other(format!("ollama: {err}")));
            }

            let progress = ModelPullProgress {
                model: payload.model.clone(),
                status: event.status.clone(),
                completed: event.completed,
                total: event.total,
                done: event.status == "success",
            };
            // Best effort : on n'échoue pas si l'event ne peut pas être émis
            // (window fermée par exemple).
            let _ = app.emit("model-pull-progress", progress);

            if event.status == "success" {
                return Ok(());
            }
        }
    }

    Ok(())
}

// ---------------------------------------------------------------------------
// ai_delete_model — supprime un modèle local
// ---------------------------------------------------------------------------

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiDeleteModelPayload {
    pub base_url: String,
    pub model: String,
}

#[tauri::command]
pub async fn ai_delete_model(payload: AiDeleteModelPayload) -> CommandResult<()> {
    let base = payload.base_url.trim_end_matches('/');
    let url = format!("{base}/api/delete");
    let body = serde_json::json!({ "model": &payload.model });

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(|e| CommandError::Other(format!("client: {e}")))?;
    let resp = client
        .delete(&url)
        .json(&body)
        .send()
        .await
        .map_err(|e| CommandError::Other(format!("ollama unreachable: {e}")))?;
    if !resp.status().is_success() {
        return Err(CommandError::Other(format!(
            "ollama HTTP {}",
            resp.status()
        )));
    }
    Ok(())
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

    let provider = provider.snapshot().await;
    let res: CompletionResponse = provider
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

// ---------------------------------------------------------------------------
// Vision : décrire une image (P6.6)
// ---------------------------------------------------------------------------

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DescribeImagePayload {
    /// Chemin local vers l'image (PNG / JPG / WEBP).
    pub image_path: String,
    /// Prompt qui guide la description (peut inclure les champs structurés
    /// déjà remplis : « Décris ce personnage en sachant qu'il est un
    /// guerrier… »).
    pub prompt: String,
    /// Modèle vision Ollama à utiliser (ex. `llava:latest`,
    /// `qwen2.5vl:7b`, `gemma3:4b`). Doit supporter les images.
    pub model: String,
    /// Override de l'URL Ollama. Si `None`, on lit la base_url courante
    /// depuis le AiProvider (snapshot).
    #[serde(default)]
    pub base_url: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DescribeImageResult {
    pub model: String,
    pub content: String,
}

#[tauri::command]
pub async fn ai_describe_image(
    chat_state: State<'_, AiProvider>,
    payload: DescribeImagePayload,
) -> CommandResult<DescribeImageResult> {
    if payload.model.trim().is_empty() {
        return Err(CommandError::Other(
            "Modèle vision requis (configure visionModel dans Settings)".into(),
        ));
    }
    if payload.image_path.trim().is_empty() {
        return Err(CommandError::Other("image_path manquant".into()));
    }
    if payload.prompt.trim().is_empty() {
        return Err(CommandError::Other("prompt manquant".into()));
    }

    // base_url : on snapshot le provider chat courant pour récupérer
    // la base configurée (P5.3 hot-reload garantit qu'elle est à jour).
    // Le caller peut overrider via payload.base_url si besoin.
    let base_url = if let Some(url) = payload.base_url {
        url
    } else {
        let chat = chat_state.snapshot().await;
        // ProviderId est juste un label : on le lit pour vérification mais
        // on n'a pas accès à la config interne. Fallback sur localhost si
        // on ne peut pas lire — mais en pratique l'utilisateur configure
        // la base via Settings.
        let _ = chat.id();
        "http://localhost:11434".to_string()
    };

    let provider = OllamaProvider::new(OllamaConfig {
        base_url,
        default_model: payload.model.clone(),
        capabilities: Capabilities {
            text: false,
            vision: true,
            embeddings: false,
            tool_use: false,
            long_context: false,
        },
    });
    let img = ImageInput::Path(std::path::PathBuf::from(payload.image_path));
    let content = provider
        .describe_image(img, &payload.prompt)
        .await
        .map_err(|e| CommandError::Other(format!("vision: {e}")))?;
    Ok(DescribeImageResult {
        model: payload.model,
        content,
    })
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
    let embedder = embedder.snapshot().await;

    let entities = repo.entities().list_in_universe(uid, None).await?;
    if entities.is_empty() {
        return Ok(ReindexResult {
            indexed_count: 0,
            model: embedder.model.clone(),
            dimension: 0,
        });
    }

    // P7.6 : 1 entité → N chunks (header + paragraphes de bio/desc).
    // On garde le mapping (entity_id, chunk_idx, content) pour les
    // insertions ensuite.
    let mut chunks: Vec<(Uuid, i64, String)> = Vec::new();
    for entity in &entities {
        for (idx, content) in entity_to_chunks(entity).into_iter().enumerate() {
            chunks.push((entity.id, idx as i64, content));
        }
    }
    if chunks.is_empty() {
        return Ok(ReindexResult {
            indexed_count: 0,
            model: embedder.model.clone(),
            dimension: 0,
        });
    }

    // Préfixage Nomic + embedding en batch (un seul appel HTTP).
    let texts_for_embed: Vec<String> = chunks
        .iter()
        .map(|(_, _, t)| with_embed_prefix(&embedder.model, t, false))
        .collect();
    let vectors = embedder
        .provider
        .embed_with_model(texts_for_embed, &embedder.model)
        .await
        .map_err(|e| CommandError::Other(format!("embedding failed: {e}")))?;

    if vectors.len() != chunks.len() {
        return Err(CommandError::Other(format!(
            "embedder returned {} vectors for {} chunks",
            vectors.len(),
            chunks.len()
        )));
    }

    let dim = vectors.first().map(Vec::len).unwrap_or(0);

    // Purge l'ancien index pour toutes les entités, puis ré-insère
    // tous les chunks (le contenu stocké ne contient PAS le préfixe
    // Nomic — celui-ci est un détail d'embedding, pas de display).
    for entity in &entities {
        repo.embeddings()
            .delete_for(SourceType::Entity, entity.id)
            .await?;
    }

    for ((entity_id, chunk_idx, content), vector) in chunks.iter().zip(vectors.iter()) {
        repo.embeddings()
            .insert(NewEmbedding {
                source_type: SourceType::Entity,
                source_id: *entity_id,
                chunk_idx: *chunk_idx,
                content: content.clone(),
                model: embedder.model.clone(),
                vector: vector.clone(),
            })
            .await?;
    }

    Ok(ReindexResult {
        indexed_count: chunks.len(),
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
    let provider = provider.snapshot().await;
    let embedder = embedder.snapshot().await;
    let universe = repo
        .universes()
        .get(uid)
        .await?
        .ok_or_else(|| CommandError::Other(format!("universe {uid} not found")))?;

    // 1. Embed la question (avec préfixe Nomic search_query: si applicable)
    let q_text = with_embed_prefix(&embedder.model, payload.question.trim(), true);
    let q_vectors = embedder
        .provider
        .embed_with_model(vec![q_text], &embedder.model)
        .await
        .map_err(|e| CommandError::Other(format!("embed question: {e}")))?;
    let q_vec = q_vectors
        .into_iter()
        .next()
        .ok_or_else(|| CommandError::Other("embedder returned no vector".into()))?;

    // 2. Search top-k. Default 8 (P7.6 : avant 5, mais avec le chunking
    // par paragraphe il y a plus de chunks par entité, on remonte un
    // peu pour ne pas couper court).
    let k = payload.top_k.unwrap_or(8).max(1).min(30);
    use romanesk_core::rag::SearchFilter;
    let raw_hits = repo
        .embeddings()
        .search_topk(
            &q_vec,
            k,
            SearchFilter::by_model(&embedder.model),
        )
        .await?;

    // P7.6 : cutoff de score. La cosine similarity sur du texte
    // sémantiquement lointain reste positive (souvent 0.2-0.4) sans
    // pour autant être pertinente. On filtre à 0.45 pour Nomic et 0.35
    // pour les autres (ils sont moins centrés). Si tous les hits sont
    // sous le seuil, on renvoie un message explicite plutôt que du
    // bruit.
    let cutoff: f32 = if embedder.model.to_lowercase().starts_with("nomic-embed") {
        0.45
    } else {
        0.35
    };
    let hits: Vec<_> = raw_hits.into_iter().filter(|h| h.score >= cutoff).collect();

    if hits.is_empty() {
        return Ok(RagAnswer {
            answer: format!(
                "Je ne trouve pas d'élément suffisamment pertinent dans le lore pour répondre. \
                 Pistes : (1) vérifie que tu as réindexé l'univers après tes derniers changements, \
                 (2) essaie de reformuler avec des noms propres ou termes précis qui apparaissent \
                 dans tes fiches, (3) si la fiche existe mais ne matche pas, ajoute-y un résumé \
                 explicite. Seuil de pertinence courant : {cutoff:.2}."
            ),
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
        // P7.6 : on envoie le content COMPLET du chunk au modèle (pas
        // le snippet tronqué — le snippet sert juste à l'affichage UI).
        // On inclut le score pour aider le modèle à pondérer.
        context_blocks.push(format!(
            "--- Extrait {} (fiche : {}, pertinence : {:.2}) ---\n{}\n",
            i + 1,
            name,
            hit.score,
            hit.embedding.content
        ));
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
         sur l'univers fictionnel « {}».\n\n\
         RÈGLES STRICTES :\n\
         1. Utilise UNIQUEMENT les extraits de fiches fournis. N'invente rien.\n\
         2. Si la réponse n'est PAS dans les extraits, écris exactement : \
         « Je ne trouve pas cette information dans le lore actuel. » et précise \
         quelles fiches ont été consultées sans donner de réponse fabriquée.\n\
         3. Cite les noms des fiches que tu utilises (ex. « D'après la fiche Lyra… »).\n\
         4. Reste concis (3-5 phrases max). Pas de remplissage.\n\
         5. Si plusieurs fiches sont pertinentes mais se contredisent, dis-le.",
        universe.name
    );

    let user = format!(
        "Question : {}\n\n\
         Extraits de fiches (par score décroissant de pertinence) :\n\n{}\n\n\
         Réponse :",
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
/// Split une entité en plusieurs chunks pour l'indexation.
///
/// P7.6 : avant cette refactorisation, 1 entité = 1 chunk (donc 1 vecteur)
/// quelle que soit la longueur de la fiche. Pour les fiches avec une
/// biographie de plusieurs paragraphes, le sens était dilué dans un
/// embedding moyen et la similarité cosine devenait peu discriminante.
///
/// Stratégie :
/// - Chunk 0 : header structuré (nom + kind + summary + champs typés
///   courts : archetype, traits, climat, etc.). Toujours indexé.
/// - Chunks 1+ : 1 paragraphe = 1 chunk (split sur double-newline du
///   render Markdown du Tiptap). Chaque paragraphe est préfixé par le
///   nom de l'entité pour que le contexte sémantique reste fort même
///   sur un fragment court.
/// - Les paragraphes de moins de 5 mots sont fusionnés avec le précédent
///   pour éviter les chunks bruyants (titres seuls, numéros…).
fn entity_to_chunks(entity: &Entity) -> Vec<String> {
    let mut chunks: Vec<String> = Vec::new();

    // Header
    let mut header = String::new();
    header.push_str(&format!("{} ({:?})\n", entity.name, entity.kind));
    if let Some(s) = &entity.summary {
        header.push_str(s);
        header.push('\n');
    }
    if let Some(s) = entity.content.get("archetype").and_then(|v| v.as_str()) {
        header.push_str(&format!("Archétype : {s}\n"));
    }
    if let Some(arr) = entity.content.get("traits").and_then(|v| v.as_array()) {
        let traits: Vec<&str> = arr.iter().filter_map(|t| t.as_str()).collect();
        if !traits.is_empty() {
            header.push_str(&format!("Traits : {}\n", traits.join(", ")));
        }
    }
    if let Some(s) = entity.content.get("climate").and_then(|v| v.as_str()) {
        header.push_str(&format!("Climat : {s}\n"));
    }
    if let Some(s) = entity.content.get("population").and_then(|v| v.as_str()) {
        header.push_str(&format!("Population : {s}\n"));
    }
    if let Some(s) = entity.content.get("kind").and_then(|v| v.as_str()) {
        header.push_str(&format!("Sous-type : {s}\n"));
    }
    if let Some(s) = entity.content.get("ideology").and_then(|v| v.as_str()) {
        header.push_str(&format!("Idéologie : {s}\n"));
    }
    if let Some(s) = entity.content.get("founded").and_then(|v| v.as_str()) {
        header.push_str(&format!("Fondation : {s}\n"));
    }
    if let Some(s) = entity.content.get("leader").and_then(|v| v.as_str()) {
        header.push_str(&format!("Dirigeant : {s}\n"));
    }
    if let Some(s) = entity.content.get("origin").and_then(|v| v.as_str()) {
        header.push_str(&format!("Origine : {s}\n"));
    }
    if let Some(s) = entity.content.get("owner").and_then(|v| v.as_str()) {
        header.push_str(&format!("Propriétaire : {s}\n"));
    }
    if let Some(arr) = entity.content.get("properties").and_then(|v| v.as_array()) {
        let props: Vec<&str> = arr.iter().filter_map(|t| t.as_str()).collect();
        if !props.is_empty() {
            header.push_str(&format!("Propriétés : {}\n", props.join(", ")));
        }
    }
    if let Some(s) = entity.content.get("domain").and_then(|v| v.as_str()) {
        header.push_str(&format!("Domaine : {s}\n"));
    }
    chunks.push(header);

    // Bio / description : split en paragraphes
    for key in ["biography", "description", "biographyText", "descriptionText"] {
        if let Some(v) = entity.content.get(key) {
            let text = if let Some(s) = v.as_str() {
                s.to_string()
            } else if v.is_object() {
                romanesk_core::export::render_tiptap_doc(v)
            } else {
                continue;
            };
            if text.trim().is_empty() {
                continue;
            }
            // Split sur double-newline (paragraphes du render Markdown).
            // Chaque chunk est préfixé par le nom de l'entité pour
            // garder le contexte sémantique fort même sur un fragment.
            for para in text.split("\n\n") {
                let p = para.trim();
                if p.is_empty() {
                    continue;
                }
                let word_count = p.split_whitespace().count();
                if word_count < 5 {
                    // Fusionne avec le chunk précédent au lieu de créer
                    // un chunk bruyant (titre solitaire par ex.).
                    if let Some(last) = chunks.last_mut() {
                        last.push_str("\n\n");
                        last.push_str(p);
                    }
                    continue;
                }
                chunks.push(format!("{} : {}", entity.name, p));
            }
        }
    }

    chunks
}

/// P7.6 : préfixe `search_document: ` (indexation) ou `search_query: `
/// (query) si le modèle est de la famille nomic-embed-text. Ces
/// préfixes sont attendus par le modèle et améliorent significativement
/// la pertinence de la similarité cosine. Pour les autres modèles
/// d'embedding (bge, mxbai, qwen-embedding), on retourne le texte tel
/// quel (ils ne suivent pas la même convention).
fn with_embed_prefix(model: &str, text: &str, is_query: bool) -> String {
    let m = model.to_lowercase();
    if m.starts_with("nomic-embed") {
        if is_query {
            format!("search_query: {text}")
        } else {
            format!("search_document: {text}")
        }
    } else {
        text.to_string()
    }
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
