//! `ai_universe_reindex` + `ai_rag_query` — embeddings + Q&A (P3.3).

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
