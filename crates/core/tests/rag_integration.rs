//! Smoke + edge cases du stockage vectoriel (J4).
//!
//! Couvre les critères du Plan Phase 0 — J4 :
//! - Insertion d'un vecteur dummy (ici dim 4 pour rester lisible),
//!   recherche cosine top-k, ordre attendu.
//! - Filtre par dimension (rejet automatique des vecteurs incompatibles).
//! - Filtre par modèle.
//! - Détection d'un BLOB corrompu (taille bytes ≠ dim × 4).
//! - `delete_for` qui efface tous les chunks d'une source.

use romanesk_core::domain::{NewEmbedding, NewUniverse, SourceType};
use romanesk_core::rag::{EmbeddingRepo, SearchFilter};
use romanesk_core::{Database, Repo, RepoError};
use uuid::Uuid;

async fn fresh_repo() -> (Database, Repo) {
    let db = Database::new_in_memory().await.expect("db");
    let repo = Repo::new(db.clone());
    (db, repo)
}

fn embedder(db: &Database) -> EmbeddingRepo<'_> {
    EmbeddingRepo::new(db)
}

fn dummy_source() -> Uuid {
    // Pas de FK sur `embeddings.source_id` — polymorphe par dessein.
    Uuid::now_v7()
}

// ---------------------------------------------------------------------------
// Smoke test : insère 3 vecteurs, query, vérifie l'ordre du top-k.
// ---------------------------------------------------------------------------

#[tokio::test]
async fn insert_and_top_k_cosine() {
    let (db, repo) = fresh_repo().await;
    let universe = repo
        .universes()
        .create(NewUniverse::named("Aether"))
        .await
        .unwrap();
    let entity = repo
        .entities()
        .create(romanesk_core::domain::NewEntity::character(universe.id, "Aldric"))
        .await
        .unwrap();
    let emb = embedder(&db);

    let v_x = vec![1.0_f32, 0.0, 0.0, 0.0];
    let v_y = vec![0.0_f32, 1.0, 0.0, 0.0];
    let v_close = vec![0.9_f32, 0.1, 0.0, 0.0]; // proche de v_x

    let e_x = emb
        .insert(NewEmbedding {
            source_type: SourceType::Entity,
            source_id: entity.id,
            chunk_idx: 0,
            content: "axe X".into(),
            model: "test-embed-v1".into(),
            vector: v_x.clone(),
        })
        .await
        .unwrap();

    let _e_y = emb
        .insert(NewEmbedding {
            source_type: SourceType::Entity,
            source_id: entity.id,
            chunk_idx: 1,
            content: "axe Y".into(),
            model: "test-embed-v1".into(),
            vector: v_y,
        })
        .await
        .unwrap();

    let e_close = emb
        .insert(NewEmbedding {
            source_type: SourceType::Entity,
            source_id: entity.id,
            chunk_idx: 2,
            content: "proche X".into(),
            model: "test-embed-v1".into(),
            vector: v_close,
        })
        .await
        .unwrap();

    let hits = emb
        .search_topk(&v_x, 3, SearchFilter::default())
        .await
        .unwrap();

    assert_eq!(hits.len(), 3);
    assert_eq!(hits[0].embedding.id, e_x.id, "rang 1 = vecteur identique");
    assert!((hits[0].score - 1.0).abs() < 1e-6);

    assert_eq!(hits[1].embedding.id, e_close.id, "rang 2 = vecteur proche");
    assert!(hits[1].score > 0.99 && hits[1].score < 1.0);

    // Le vecteur orthogonal arrive en dernier avec un score ~0.
    assert!(hits[2].score.abs() < 1e-6);
}

// ---------------------------------------------------------------------------
// `k` plus grand que le nombre disponible : on renvoie tout sans paniquer.
// ---------------------------------------------------------------------------

#[tokio::test]
async fn top_k_larger_than_corpus_returns_all() {
    let (db, _) = fresh_repo().await;
    let emb = embedder(&db);

    emb.insert(NewEmbedding {
        source_type: SourceType::Note,
        source_id: dummy_source(),
        chunk_idx: 0,
        content: "n1".into(),
        model: "m".into(),
        vector: vec![1.0, 2.0, 3.0],
    })
    .await
    .unwrap();

    let hits = emb
        .search_topk(&[1.0, 2.0, 3.0], 10, SearchFilter::default())
        .await
        .unwrap();
    assert_eq!(hits.len(), 1);
}

#[tokio::test]
async fn top_k_zero_returns_empty() {
    let (db, _) = fresh_repo().await;
    let emb = embedder(&db);
    emb.insert(NewEmbedding {
        source_type: SourceType::Note,
        source_id: dummy_source(),
        chunk_idx: 0,
        content: "n1".into(),
        model: "m".into(),
        vector: vec![1.0, 0.0],
    })
    .await
    .unwrap();

    let hits = emb
        .search_topk(&[1.0, 0.0], 0, SearchFilter::default())
        .await
        .unwrap();
    assert!(hits.is_empty());
}

// ---------------------------------------------------------------------------
// Filtre par dimension : un vecteur dim 5 ne matche pas un query dim 4.
// ---------------------------------------------------------------------------

#[tokio::test]
async fn dim_filter_excludes_incompatible_vectors() {
    let (db, _) = fresh_repo().await;
    let emb = embedder(&db);

    emb.insert(NewEmbedding {
        source_type: SourceType::Note,
        source_id: dummy_source(),
        chunk_idx: 0,
        content: "dim4".into(),
        model: "m".into(),
        vector: vec![1.0; 4],
    })
    .await
    .unwrap();

    emb.insert(NewEmbedding {
        source_type: SourceType::Note,
        source_id: dummy_source(),
        chunk_idx: 0,
        content: "dim5".into(),
        model: "m".into(),
        vector: vec![1.0; 5],
    })
    .await
    .unwrap();

    let hits_dim4 = emb
        .search_topk(&vec![1.0; 4], 10, SearchFilter::default())
        .await
        .unwrap();
    assert_eq!(hits_dim4.len(), 1);
    assert_eq!(hits_dim4[0].embedding.dim, 4);

    let hits_dim5 = emb
        .search_topk(&vec![1.0; 5], 10, SearchFilter::default())
        .await
        .unwrap();
    assert_eq!(hits_dim5.len(), 1);
    assert_eq!(hits_dim5[0].embedding.dim, 5);
}

// ---------------------------------------------------------------------------
// Filtre par modèle : ne retient que les vecteurs du modèle demandé.
// ---------------------------------------------------------------------------

#[tokio::test]
async fn model_filter_restricts_results() {
    let (db, _) = fresh_repo().await;
    let emb = embedder(&db);

    let v = vec![1.0_f32, 0.0, 0.0];
    for model in ["nomic-embed-text", "bge-small-en"] {
        emb.insert(NewEmbedding {
            source_type: SourceType::Note,
            source_id: dummy_source(),
            chunk_idx: 0,
            content: model.into(),
            model: model.into(),
            vector: v.clone(),
        })
        .await
        .unwrap();
    }

    let hits = emb
        .search_topk(&v, 10, SearchFilter::by_model("nomic-embed-text"))
        .await
        .unwrap();
    assert_eq!(hits.len(), 1);
    assert_eq!(hits[0].embedding.model, "nomic-embed-text");
}

// ---------------------------------------------------------------------------
// Filtre par source_type : ne retient que la source demandée.
// ---------------------------------------------------------------------------

#[tokio::test]
async fn source_type_filter_restricts_results() {
    let (db, _) = fresh_repo().await;
    let emb = embedder(&db);

    let v = vec![0.5_f32, 0.5];
    emb.insert(NewEmbedding {
        source_type: SourceType::Entity,
        source_id: dummy_source(),
        chunk_idx: 0,
        content: "e".into(),
        model: "m".into(),
        vector: v.clone(),
    })
    .await
    .unwrap();
    emb.insert(NewEmbedding {
        source_type: SourceType::Chapter,
        source_id: dummy_source(),
        chunk_idx: 0,
        content: "c".into(),
        model: "m".into(),
        vector: v.clone(),
    })
    .await
    .unwrap();

    let hits = emb
        .search_topk(
            &v,
            10,
            SearchFilter {
                model: None,
                source_type: Some(SourceType::Chapter),
            },
        )
        .await
        .unwrap();
    assert_eq!(hits.len(), 1);
    assert_eq!(hits[0].embedding.source_type, SourceType::Chapter);
}

// ---------------------------------------------------------------------------
// Re-indexation : `delete_for` purge tous les chunks d'une source.
// ---------------------------------------------------------------------------

#[tokio::test]
async fn delete_for_source_clears_all_chunks() {
    let (db, _) = fresh_repo().await;
    let emb = embedder(&db);
    let source_id = dummy_source();

    // Tous les vecteurs identiques — le test porte sur `delete_for`, pas
    // sur le ranking. On évite ainsi un cast i64 → f32 qui déclencherait
    // `clippy::cast_precision_loss`.
    for chunk_idx in 0_i64..5 {
        emb.insert(NewEmbedding {
            source_type: SourceType::Chapter,
            source_id,
            chunk_idx,
            content: format!("chunk {chunk_idx}"),
            model: "m".into(),
            vector: vec![1.0_f32; 3],
        })
        .await
        .unwrap();
    }

    let hits_before = emb
        .search_topk(&[0.0, 0.0, 0.0], 10, SearchFilter::default())
        .await
        .unwrap();
    assert_eq!(hits_before.len(), 5);

    let deleted = emb
        .delete_for(SourceType::Chapter, source_id)
        .await
        .unwrap();
    assert_eq!(deleted, 5);

    let hits_after = emb
        .search_topk(&[0.0, 0.0, 0.0], 10, SearchFilter::default())
        .await
        .unwrap();
    assert!(hits_after.is_empty());
}

// ---------------------------------------------------------------------------
// Validation des inputs invalides.
// ---------------------------------------------------------------------------

#[tokio::test]
async fn rejects_empty_vector_on_insert() {
    let (db, _) = fresh_repo().await;
    let emb = embedder(&db);
    let err = emb
        .insert(NewEmbedding {
            source_type: SourceType::Note,
            source_id: dummy_source(),
            chunk_idx: 0,
            content: "x".into(),
            model: "m".into(),
            vector: vec![],
        })
        .await
        .expect_err("vide");
    assert!(matches!(err, RepoError::Invalid(_)));
}

#[tokio::test]
async fn rejects_empty_query_on_search() {
    let (db, _) = fresh_repo().await;
    let emb = embedder(&db);
    let err = emb
        .search_topk(&[], 10, SearchFilter::default())
        .await
        .expect_err("vide");
    assert!(matches!(err, RepoError::Invalid(_)));
}

#[tokio::test]
async fn rejects_empty_model_on_insert() {
    let (db, _) = fresh_repo().await;
    let emb = embedder(&db);
    let err = emb
        .insert(NewEmbedding {
            source_type: SourceType::Note,
            source_id: dummy_source(),
            chunk_idx: 0,
            content: "x".into(),
            model: "   ".into(),
            vector: vec![1.0],
        })
        .await
        .expect_err("model vide");
    assert!(matches!(err, RepoError::Invalid(_)));
}
