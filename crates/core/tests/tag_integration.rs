//! Tests d'intégration `TagRepo`.

use romanesk_core::domain::{NewEntity, NewTag, NewUniverse};
use romanesk_core::{Database, Repo, RepoError};

async fn setup() -> (Repo, romanesk_core::Universe, romanesk_core::Entity) {
    let db = Database::new_in_memory().await.unwrap();
    let repo = Repo::new(db);
    let u = repo.universes().create(NewUniverse::named("Aether")).await.unwrap();
    let e = repo
        .entities()
        .create(NewEntity::character(u.id, "Aldric"))
        .await
        .unwrap();
    (repo, u, e)
}

#[tokio::test]
async fn create_and_list_tags() {
    let (repo, u, _) = setup().await;

    let t1 = repo
        .tags()
        .create_in_universe(NewTag {
            universe_id: u.id,
            name: "magie".into(),
            color: Some("#a78bfa".into()),
        })
        .await
        .unwrap();
    let _t2 = repo
        .tags()
        .create_in_universe(NewTag {
            universe_id: u.id,
            name: "exilé".into(),
            color: None,
        })
        .await
        .unwrap();

    let listed = repo.tags().list_in_universe(u.id).await.unwrap();
    assert_eq!(listed.len(), 2);
    // Ordre alphabétique COLLATE NOCASE : "exilé" < "magie".
    assert_eq!(listed[0].name, "exilé");
    assert_eq!(listed[1].name, "magie");
    assert_eq!(listed[1].color.as_deref(), Some("#a78bfa"));

    let fetched = repo.tags().get(t1.id).await.unwrap().unwrap();
    assert_eq!(fetched, t1);
}

#[tokio::test]
async fn duplicate_name_is_rejected() {
    let (repo, u, _) = setup().await;
    repo.tags()
        .create_in_universe(NewTag {
            universe_id: u.id,
            name: "magie".into(),
            color: None,
        })
        .await
        .unwrap();

    let err = repo
        .tags()
        .create_in_universe(NewTag {
            universe_id: u.id,
            name: "magie".into(),
            color: None,
        })
        .await
        .expect_err("UNIQUE violation");
    assert!(matches!(err, RepoError::Sqlx(_)));
}

#[tokio::test]
async fn find_or_create_returns_existing() {
    let (repo, u, _) = setup().await;
    let original = repo
        .tags()
        .create_in_universe(NewTag {
            universe_id: u.id,
            name: "magie".into(),
            color: Some("#abc".into()),
        })
        .await
        .unwrap();

    let same = repo
        .tags()
        .find_or_create(NewTag {
            universe_id: u.id,
            name: "magie".into(),
            color: Some("#xyz".into()),
        })
        .await
        .unwrap();
    assert_eq!(same.id, original.id, "must return existing, not create new");
    assert_eq!(same.color.as_deref(), Some("#abc"));
}

#[tokio::test]
async fn find_or_create_creates_new() {
    let (repo, u, _) = setup().await;
    let _ = repo
        .tags()
        .create_in_universe(NewTag {
            universe_id: u.id,
            name: "magie".into(),
            color: None,
        })
        .await
        .unwrap();

    let new = repo
        .tags()
        .find_or_create(NewTag {
            universe_id: u.id,
            name: "diplomate".into(),
            color: None,
        })
        .await
        .unwrap();
    assert_eq!(new.name, "diplomate");
    assert_eq!(repo.tags().list_in_universe(u.id).await.unwrap().len(), 2);
}

#[tokio::test]
async fn rejects_empty_name() {
    let (repo, u, _) = setup().await;
    let err = repo
        .tags()
        .create_in_universe(NewTag {
            universe_id: u.id,
            name: "   ".into(),
            color: None,
        })
        .await
        .expect_err("blank rejected");
    assert!(matches!(err, RepoError::Invalid(_)));
}

#[tokio::test]
async fn set_for_entity_replaces_in_bulk() {
    let (repo, u, e) = setup().await;
    let t1 = repo.tags().create_in_universe(NewTag {
        universe_id: u.id, name: "a".into(), color: None,
    }).await.unwrap();
    let t2 = repo.tags().create_in_universe(NewTag {
        universe_id: u.id, name: "b".into(), color: None,
    }).await.unwrap();
    let t3 = repo.tags().create_in_universe(NewTag {
        universe_id: u.id, name: "c".into(), color: None,
    }).await.unwrap();

    // Première assignation : t1 + t2
    repo.tags().set_for_entity(e.id, &[t1.id, t2.id]).await.unwrap();
    let assigned = repo.tags().get_for_entity(e.id).await.unwrap();
    assert_eq!(assigned.len(), 2);

    // Re-assignation : on remplace par t2 + t3 → t1 doit disparaître
    repo.tags().set_for_entity(e.id, &[t2.id, t3.id]).await.unwrap();
    let assigned = repo.tags().get_for_entity(e.id).await.unwrap();
    assert_eq!(assigned.len(), 2);
    let names: Vec<&str> = assigned.iter().map(|t| t.name.as_str()).collect();
    assert!(names.contains(&"b"));
    assert!(names.contains(&"c"));
    assert!(!names.contains(&"a"));

    // Reset complet : []
    repo.tags().set_for_entity(e.id, &[]).await.unwrap();
    assert_eq!(repo.tags().get_for_entity(e.id).await.unwrap().len(), 0);
}

#[tokio::test]
async fn deleting_tag_removes_assignments() {
    let (repo, u, e) = setup().await;
    let t = repo.tags().create_in_universe(NewTag {
        universe_id: u.id, name: "magie".into(), color: None,
    }).await.unwrap();

    repo.tags().set_for_entity(e.id, &[t.id]).await.unwrap();
    assert_eq!(repo.tags().get_for_entity(e.id).await.unwrap().len(), 1);

    repo.tags().delete(t.id).await.unwrap();

    // L'association entity_tags a été cascade-deleted via FK
    assert_eq!(repo.tags().get_for_entity(e.id).await.unwrap().len(), 0);
}

#[tokio::test]
async fn tags_isolated_per_universe() {
    let db = Database::new_in_memory().await.unwrap();
    let repo = Repo::new(db);
    let u1 = repo.universes().create(NewUniverse::named("U1")).await.unwrap();
    let u2 = repo.universes().create(NewUniverse::named("U2")).await.unwrap();

    repo.tags().create_in_universe(NewTag {
        universe_id: u1.id, name: "magie".into(), color: None,
    }).await.unwrap();
    repo.tags().create_in_universe(NewTag {
        universe_id: u2.id, name: "magie".into(), color: None,
    }).await.unwrap();

    // Même nom dans 2 univers : pas de conflit
    assert_eq!(repo.tags().list_in_universe(u1.id).await.unwrap().len(), 1);
    assert_eq!(repo.tags().list_in_universe(u2.id).await.unwrap().len(), 1);
}
