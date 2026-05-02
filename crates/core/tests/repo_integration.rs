//! Tests d'intégration `Repo` ↔ DB SQLite in-memory.
//!
//! Couvre les critères du Plan Phase 0 — J3 :
//! - Création + lecture d'un univers et d'une entité.
//! - Filtrage par type d'entité.
//! - Soft-delete invisible dans `list()`.
//! - FK ON DELETE CASCADE actif (suppression univers → entités effacées).
//! - PRAGMA foreign_keys=ON propagé.
//! - Round-trip JSON pour `settings_json` / `content_json`.

use romanesk_core::domain::{EntityType, NewEntity, NewUniverse, UpdateEntity};
use romanesk_core::{Database, Repo, RepoError};
use serde_json::json;

async fn fresh_repo() -> Repo {
    let db = Database::new_in_memory()
        .await
        .expect("init in-memory database");
    Repo::new(db)
}

#[tokio::test]
async fn create_and_get_universe() {
    let repo = fresh_repo().await;

    let u = repo
        .universes()
        .create(NewUniverse {
            name: "Aether".into(),
            description: Some("monde haute fantaisie".into()),
            settings: json!({ "language": "fr", "calendar": "custom" }),
        })
        .await
        .expect("create universe");

    assert_eq!(u.name, "Aether");
    assert_eq!(u.description.as_deref(), Some("monde haute fantaisie"));
    assert_eq!(u.settings, json!({ "language": "fr", "calendar": "custom" }));

    let fetched = repo
        .universes()
        .get(u.id)
        .await
        .expect("fetch universe")
        .expect("universe should exist");
    assert_eq!(fetched, u);
}

#[tokio::test]
async fn list_universes_orders_by_recency() {
    let repo = fresh_repo().await;

    // UUID v7 est monotone temporellement, l'ordre de création se reflète
    // dans l'ordre lexicographique des id. Pas besoin de sleep.
    let u1 = repo.universes().create(NewUniverse::named("Alpha")).await.unwrap();
    let u2 = repo.universes().create(NewUniverse::named("Beta")).await.unwrap();
    let u3 = repo.universes().create(NewUniverse::named("Gamma")).await.unwrap();

    let listed = repo.universes().list().await.unwrap();
    assert_eq!(listed.len(), 3);
    assert_eq!(listed[0].id, u3.id, "le plus récent doit être en tête");
    assert_eq!(listed[1].id, u2.id);
    assert_eq!(listed[2].id, u1.id);
}

#[tokio::test]
async fn rejects_empty_universe_name() {
    let repo = fresh_repo().await;
    let err = repo
        .universes()
        .create(NewUniverse::named("   "))
        .await
        .expect_err("should reject blank name");
    assert!(matches!(err, RepoError::Invalid(_)));
}

#[tokio::test]
async fn create_entity_in_universe() {
    let repo = fresh_repo().await;

    let u = repo
        .universes()
        .create(NewUniverse::named("Aether"))
        .await
        .unwrap();

    let aldric = repo
        .entities()
        .create(NewEntity {
            universe_id: u.id,
            kind: EntityType::Character,
            name: "Aldric".into(),
            summary: Some("Mage exilé.".into()),
            content: json!({ "archetype": "mentor", "traits": ["calme", "rancunier"] }),
            cover_image: None,
            is_real: false,
        })
        .await
        .expect("create entity");

    assert_eq!(aldric.universe_id, u.id);
    assert_eq!(aldric.kind, EntityType::Character);
    assert_eq!(aldric.name, "Aldric");
    assert_eq!(
        aldric.content,
        json!({ "archetype": "mentor", "traits": ["calme", "rancunier"] })
    );
    assert!(!aldric.is_real);

    let fetched = repo.entities().get(aldric.id).await.unwrap().unwrap();
    assert_eq!(fetched, aldric);
}

#[tokio::test]
async fn list_entities_filters_by_type() {
    let repo = fresh_repo().await;
    let u = repo.universes().create(NewUniverse::named("Aether")).await.unwrap();

    repo.entities()
        .create(NewEntity::character(u.id, "Aldric"))
        .await
        .unwrap();
    repo.entities()
        .create(NewEntity::character(u.id, "Lyra"))
        .await
        .unwrap();
    repo.entities()
        .create(NewEntity {
            universe_id: u.id,
            kind: EntityType::Location,
            name: "Académie de Bren".into(),
            summary: None,
            content: json!({}),
            cover_image: None,
            is_real: false,
        })
        .await
        .unwrap();

    let all = repo.entities().list_in_universe(u.id, None).await.unwrap();
    assert_eq!(all.len(), 3);

    let chars = repo
        .entities()
        .list_in_universe(u.id, Some(EntityType::Character))
        .await
        .unwrap();
    assert_eq!(chars.len(), 2);
    assert!(chars.iter().all(|e| e.kind == EntityType::Character));

    let count_locations = repo
        .entities()
        .count_in_universe(u.id, Some(EntityType::Location))
        .await
        .unwrap();
    assert_eq!(count_locations, 1);
}

#[tokio::test]
async fn soft_delete_universe_hides_it_from_list() {
    let repo = fresh_repo().await;
    let u = repo.universes().create(NewUniverse::named("Aether")).await.unwrap();

    assert_eq!(repo.universes().list().await.unwrap().len(), 1);

    repo.universes().soft_delete(u.id).await.unwrap();

    assert_eq!(repo.universes().list().await.unwrap().len(), 0);
    assert!(repo.universes().get(u.id).await.unwrap().is_none());
}

#[tokio::test]
async fn hard_delete_universe_cascades_entities() {
    let repo = fresh_repo().await;
    let u = repo.universes().create(NewUniverse::named("Aether")).await.unwrap();

    let aldric = repo
        .entities()
        .create(NewEntity::character(u.id, "Aldric"))
        .await
        .unwrap();

    // Sanity: l'entité est bien là.
    assert!(repo.entities().get(aldric.id).await.unwrap().is_some());

    repo.universes().hard_delete(u.id).await.unwrap();

    // L'univers est physiquement supprimé.
    assert!(repo.universes().get(u.id).await.unwrap().is_none());

    // Et l'entité aussi (FK ON DELETE CASCADE) — c'est l'invariant clé,
    // qui prouve que `PRAGMA foreign_keys = ON` est bien actif.
    assert!(
        repo.entities().get(aldric.id).await.unwrap().is_none(),
        "FK ON DELETE CASCADE should have erased the entity"
    );
}

#[tokio::test]
async fn delete_unknown_id_returns_not_found() {
    let repo = fresh_repo().await;
    let bogus = uuid::Uuid::now_v7();
    let err = repo
        .universes()
        .hard_delete(bogus)
        .await
        .expect_err("should be NotFound");
    assert!(matches!(err, RepoError::NotFound));
}

#[tokio::test]
async fn rejects_empty_entity_name() {
    let repo = fresh_repo().await;
    let u = repo.universes().create(NewUniverse::named("Aether")).await.unwrap();

    let err = repo
        .entities()
        .create(NewEntity::character(u.id, ""))
        .await
        .expect_err("should reject empty name");
    assert!(matches!(err, RepoError::Invalid(_)));
}

#[tokio::test]
async fn update_entity_replaces_modifiable_fields() {
    let repo = fresh_repo().await;
    let u = repo.universes().create(NewUniverse::named("Aether")).await.unwrap();

    let original = repo
        .entities()
        .create(NewEntity::character(u.id, "Aldric"))
        .await
        .unwrap();

    // Doc ProseMirror nested (typique Tiptap) à round-tripper.
    let bio_doc = json!({
        "type": "doc",
        "content": [
            {
                "type": "paragraph",
                "content": [
                    { "type": "text", "text": "Mage exilé du conseil de Bren." }
                ]
            },
            {
                "type": "bulletList",
                "content": [
                    {
                        "type": "listItem",
                        "content": [{
                            "type": "paragraph",
                            "content": [{ "type": "text", "text": "Maîtrise des sorts de feu" }]
                        }]
                    }
                ]
            }
        ]
    });

    let new_content = json!({
        "archetype": "mentor",
        "traits": ["calme", "rancunier"],
        "biography": bio_doc.clone(),
    });

    let updated = repo
        .entities()
        .update(
            original.id,
            UpdateEntity {
                name: "Aldric le Sombre".into(),
                summary: Some("Mage exilé.".into()),
                content: new_content.clone(),
                cover_image: None,
                is_real: false,
            },
        )
        .await
        .unwrap();

    // Champs modifiés
    assert_eq!(updated.name, "Aldric le Sombre");
    assert_eq!(updated.summary.as_deref(), Some("Mage exilé."));
    assert_eq!(updated.content, new_content);
    // Champs préservés
    assert_eq!(updated.id, original.id);
    assert_eq!(updated.universe_id, original.universe_id);
    assert_eq!(updated.kind, EntityType::Character);
    assert_eq!(updated.created_at, original.created_at);

    // Re-fetch pour confirmer la persistance
    let refetched = repo.entities().get(original.id).await.unwrap().unwrap();
    assert_eq!(refetched, updated);
    // Le doc Tiptap nested doit ressortir bit-pour-bit.
    assert_eq!(refetched.content["biography"], bio_doc);
}

#[tokio::test]
async fn update_entity_rejects_empty_name() {
    let repo = fresh_repo().await;
    let u = repo.universes().create(NewUniverse::named("Aether")).await.unwrap();
    let e = repo
        .entities()
        .create(NewEntity::character(u.id, "Aldric"))
        .await
        .unwrap();

    let err = repo
        .entities()
        .update(
            e.id,
            UpdateEntity {
                name: "   ".into(),
                summary: None,
                content: json!({}),
                cover_image: None,
                is_real: false,
            },
        )
        .await
        .expect_err("blank name should be rejected");
    assert!(matches!(err, RepoError::Invalid(_)));
}

#[tokio::test]
async fn set_cover_image_round_trip() {
    let repo = fresh_repo().await;
    let u = repo.universes().create(NewUniverse::named("Aether")).await.unwrap();
    let e = repo.entities().create(NewEntity::character(u.id, "Aldric")).await.unwrap();
    assert!(e.cover_image.is_none());

    repo.entities()
        .set_cover_image(e.id, Some("media/aether/aldric/cover.png"))
        .await
        .unwrap();
    let refetched = repo.entities().get(e.id).await.unwrap().unwrap();
    assert_eq!(
        refetched.cover_image.as_deref(),
        Some("media/aether/aldric/cover.png"),
    );

    repo.entities().set_cover_image(e.id, None).await.unwrap();
    let refetched = repo.entities().get(e.id).await.unwrap().unwrap();
    assert!(refetched.cover_image.is_none());
}

#[tokio::test]
async fn set_cover_image_unknown_id_not_found() {
    let repo = fresh_repo().await;
    let bogus = uuid::Uuid::now_v7();
    let err = repo
        .entities()
        .set_cover_image(bogus, Some("x.png"))
        .await
        .expect_err("not found");
    assert!(matches!(err, RepoError::NotFound));
}

#[tokio::test]
async fn update_unknown_entity_returns_not_found() {
    let repo = fresh_repo().await;
    let bogus = uuid::Uuid::now_v7();
    let err = repo
        .entities()
        .update(
            bogus,
            UpdateEntity {
                name: "x".into(),
                summary: None,
                content: json!({}),
                cover_image: None,
                is_real: false,
            },
        )
        .await
        .expect_err("non-existent id should fail");
    assert!(matches!(err, RepoError::NotFound));
}

#[tokio::test]
async fn entity_without_universe_fails() {
    let repo = fresh_repo().await;
    let phantom = uuid::Uuid::now_v7();

    let err = repo
        .entities()
        .create(NewEntity::character(phantom, "Aldric"))
        .await
        .expect_err("FK violation expected");
    // L'erreur est portée par sqlx (FK constraint failed).
    assert!(matches!(err, RepoError::Sqlx(_)));
}

#[tokio::test]
async fn json_round_trip_preserves_unicode_and_nested_objects() {
    let repo = fresh_repo().await;

    let payload = json!({
        "fr": "héritage du clan",
        "nested": { "year_born": -212, "tags": ["ancien", "épée", "🗡"] }
    });

    let u = repo
        .universes()
        .create(NewUniverse {
            name: "Aether".into(),
            description: None,
            settings: payload.clone(),
        })
        .await
        .unwrap();

    let fetched = repo.universes().get(u.id).await.unwrap().unwrap();
    assert_eq!(fetched.settings, payload);
}
