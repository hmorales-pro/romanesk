//! Tests d'intégration `RelationRepo` ↔ DB SQLite in-memory.

use romanesk_core::domain::{NewEntity, NewRelation, NewUniverse, RelationType};
use romanesk_core::{Database, Repo, RepoError};
use uuid::Uuid;

async fn fresh_repo_with_two_chars() -> (Repo, Uuid, Uuid) {
    let db = Database::new_in_memory().await.expect("db");
    let repo = Repo::new(db);

    let u = repo
        .universes()
        .create(NewUniverse::named("Aether"))
        .await
        .unwrap();

    let aldric = repo
        .entities()
        .create(NewEntity::character(u.id, "Aldric"))
        .await
        .unwrap();

    let lyra = repo
        .entities()
        .create(NewEntity::character(u.id, "Lyra"))
        .await
        .unwrap();

    (repo, aldric.id, lyra.id)
}

#[tokio::test]
async fn create_and_get_relation() {
    let (repo, aldric, lyra) = fresh_repo_with_two_chars().await;

    let r = repo
        .relations()
        .create(NewRelation {
            source_id: aldric,
            target_id: lyra,
            kind: RelationType::MentorOf,
            era_id: None,
            description: Some("Aldric a formé Lyra à l'Académie de Bren.".into()),
        })
        .await
        .unwrap();

    assert_eq!(r.source_id, aldric);
    assert_eq!(r.target_id, lyra);
    assert_eq!(r.kind, RelationType::MentorOf);
    assert!(r.description.is_some());

    let fetched = repo.relations().get(r.id).await.unwrap().unwrap();
    assert_eq!(fetched, r);
}

#[tokio::test]
async fn rejects_self_relation() {
    let (repo, aldric, _) = fresh_repo_with_two_chars().await;

    let err = repo
        .relations()
        .create(NewRelation {
            source_id: aldric,
            target_id: aldric,
            kind: RelationType::AllyOf,
            era_id: None,
            description: None,
        })
        .await
        .expect_err("self-relation must be rejected");
    assert!(matches!(err, RepoError::Invalid(_)));
}

#[tokio::test]
async fn list_for_entity_includes_both_directions() {
    let (repo, aldric, lyra) = fresh_repo_with_two_chars().await;

    // Aldric -> Lyra (mentor)
    let r1 = repo
        .relations()
        .create(NewRelation {
            source_id: aldric,
            target_id: lyra,
            kind: RelationType::MentorOf,
            era_id: None,
            description: None,
        })
        .await
        .unwrap();

    // Lyra -> Aldric (allié, symétrique)
    let r2 = repo
        .relations()
        .create(NewRelation {
            source_id: lyra,
            target_id: aldric,
            kind: RelationType::AllyOf,
            era_id: None,
            description: None,
        })
        .await
        .unwrap();

    let aldric_rels = repo.relations().list_for_entity(aldric).await.unwrap();
    assert_eq!(aldric_rels.len(), 2);
    let ids: Vec<_> = aldric_rels.iter().map(|r| r.id).collect();
    assert!(ids.contains(&r1.id));
    assert!(ids.contains(&r2.id));

    let lyra_rels = repo.relations().list_for_entity(lyra).await.unwrap();
    assert_eq!(lyra_rels.len(), 2);
}

#[tokio::test]
async fn delete_unknown_returns_not_found() {
    let (repo, _, _) = fresh_repo_with_two_chars().await;
    let bogus = Uuid::now_v7();
    let err = repo.relations().delete(bogus).await.expect_err("not found");
    assert!(matches!(err, RepoError::NotFound));
}

#[tokio::test]
async fn fk_violation_on_unknown_target() {
    let (repo, aldric, _) = fresh_repo_with_two_chars().await;
    let phantom = Uuid::now_v7();

    let err = repo
        .relations()
        .create(NewRelation {
            source_id: aldric,
            target_id: phantom,
            kind: RelationType::MentorOf,
            era_id: None,
            description: None,
        })
        .await
        .expect_err("FK violation expected");
    // L'erreur est portée par sqlx (FK constraint failed).
    assert!(matches!(err, RepoError::Sqlx(_)));
}

#[tokio::test]
async fn relations_cascade_when_entity_hard_deleted() {
    let (repo, aldric, lyra) = fresh_repo_with_two_chars().await;

    repo.relations()
        .create(NewRelation {
            source_id: aldric,
            target_id: lyra,
            kind: RelationType::MentorOf,
            era_id: None,
            description: None,
        })
        .await
        .unwrap();

    assert_eq!(repo.relations().list_for_entity(aldric).await.unwrap().len(), 1);

    repo.entities().hard_delete(lyra).await.unwrap();

    // L'arc doit avoir été effacé en cascade (FK ON DELETE CASCADE).
    assert_eq!(repo.relations().list_for_entity(aldric).await.unwrap().len(), 0);
}

#[tokio::test]
async fn list_in_universe_returns_only_that_universe() {
    let db = Database::new_in_memory().await.unwrap();
    let repo = Repo::new(db);

    let u1 = repo.universes().create(NewUniverse::named("U1")).await.unwrap();
    let u2 = repo.universes().create(NewUniverse::named("U2")).await.unwrap();

    let a1 = repo.entities().create(NewEntity::character(u1.id, "A1")).await.unwrap();
    let b1 = repo.entities().create(NewEntity::character(u1.id, "B1")).await.unwrap();
    let a2 = repo.entities().create(NewEntity::character(u2.id, "A2")).await.unwrap();
    let b2 = repo.entities().create(NewEntity::character(u2.id, "B2")).await.unwrap();

    repo.relations().create(NewRelation {
        source_id: a1.id, target_id: b1.id, kind: RelationType::AllyOf,
        era_id: None, description: None,
    }).await.unwrap();
    repo.relations().create(NewRelation {
        source_id: a2.id, target_id: b2.id, kind: RelationType::EnemyOf,
        era_id: None, description: None,
    }).await.unwrap();

    let u1_rels = repo.relations().list_in_universe(u1.id).await.unwrap();
    assert_eq!(u1_rels.len(), 1);
    assert_eq!(u1_rels[0].kind, RelationType::AllyOf);

    let u2_rels = repo.relations().list_in_universe(u2.id).await.unwrap();
    assert_eq!(u2_rels.len(), 1);
    assert_eq!(u2_rels[0].kind, RelationType::EnemyOf);
}

#[test]
fn relation_type_round_trip() {
    use RelationType::*;
    let all = [
        AllyOf, EnemyOf, MentorOf, ParentOf, SiblingOf, MarriedTo,
        MemberOf, LeaderOf, RuledOver, LocatedIn, Owns, Created,
        DerivedFrom, Mentions,
    ];
    for t in all {
        assert_eq!(RelationType::parse(t.as_str()), Some(t), "{:?}", t);
    }
    assert_eq!(RelationType::parse("unknown_thing"), None);
}

#[test]
fn relation_type_symmetry_flags() {
    use RelationType::*;
    assert!(AllyOf.is_symmetric());
    assert!(EnemyOf.is_symmetric());
    assert!(SiblingOf.is_symmetric());
    assert!(MarriedTo.is_symmetric());
    assert!(!MentorOf.is_symmetric());
    assert!(!LocatedIn.is_symmetric());
    assert!(!Owns.is_symmetric());
}
