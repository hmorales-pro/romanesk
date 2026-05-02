//! Tests d'intégration pour Era / Event / Snapshot (Phase 2).

use romanesk_core::domain::{
    NewEntity, NewEra, NewEvent, NewRelation, NewSnapshot, NewUniverse, RelationType,
    UpdateEra, UpdateEvent,
};
use romanesk_core::{Database, Repo, RepoError};
use serde_json::json;

async fn fresh() -> Repo {
    let db = Database::new_in_memory().await.unwrap();
    Repo::new(db)
}

// ---------------------------------------------------------------------------
// Era
// ---------------------------------------------------------------------------

#[tokio::test]
async fn era_crud_round_trip() {
    let repo = fresh().await;
    let u = repo.universes().create(NewUniverse::named("Aether")).await.unwrap();

    let e1 = repo.eras().create(NewEra {
        universe_id: u.id, name: "Âge des dragons".into(),
        start_year: Some(0), end_year: Some(500),
        description: Some("Avant la chute".into()),
        color: Some("#a78bfa".into()),
        sort_order: 0,
    }).await.unwrap();
    let e2 = repo.eras().create(NewEra {
        universe_id: u.id, name: "Restauration".into(),
        start_year: Some(500), end_year: Some(800),
        description: None, color: None, sort_order: 1,
    }).await.unwrap();

    let listed = repo.eras().list_in_universe(u.id).await.unwrap();
    assert_eq!(listed.len(), 2);
    assert_eq!(listed[0].id, e1.id);
    assert_eq!(listed[1].id, e2.id);

    let updated = repo.eras().update(e1.id, UpdateEra {
        name: "Âge des Dragons (révisé)".into(),
        start_year: Some(-100), end_year: Some(500),
        description: Some("Mise à jour".into()),
        color: Some("#dc2626".into()),
        sort_order: 0,
    }).await.unwrap();
    assert_eq!(updated.name, "Âge des Dragons (révisé)");
    assert_eq!(updated.start_year, Some(-100));

    repo.eras().delete(e2.id).await.unwrap();
    assert_eq!(repo.eras().list_in_universe(u.id).await.unwrap().len(), 1);
}

#[tokio::test]
async fn era_rejects_inverted_dates() {
    let repo = fresh().await;
    let u = repo.universes().create(NewUniverse::named("Aether")).await.unwrap();
    let err = repo.eras().create(NewEra {
        universe_id: u.id, name: "Bug".into(),
        start_year: Some(500), end_year: Some(100),
        description: None, color: None, sort_order: 0,
    }).await.expect_err("inverted dates");
    assert!(matches!(err, RepoError::Invalid(_)));
}

#[tokio::test]
async fn era_rejects_empty_name() {
    let repo = fresh().await;
    let u = repo.universes().create(NewUniverse::named("Aether")).await.unwrap();
    let err = repo.eras().create(NewEra {
        universe_id: u.id, name: "   ".into(),
        start_year: None, end_year: None,
        description: None, color: None, sort_order: 0,
    }).await.expect_err("blank name");
    assert!(matches!(err, RepoError::Invalid(_)));
}

// ---------------------------------------------------------------------------
// Event
// ---------------------------------------------------------------------------

#[tokio::test]
async fn event_crud_and_filter_by_era() {
    let repo = fresh().await;
    let u = repo.universes().create(NewUniverse::named("Aether")).await.unwrap();
    let era1 = repo.eras().create(NewEra {
        universe_id: u.id, name: "Avant".into(),
        start_year: Some(0), end_year: Some(100),
        description: None, color: None, sort_order: 0,
    }).await.unwrap();
    let era2 = repo.eras().create(NewEra {
        universe_id: u.id, name: "Après".into(),
        start_year: Some(100), end_year: Some(200),
        description: None, color: None, sort_order: 1,
    }).await.unwrap();

    repo.events().create(NewEvent {
        universe_id: u.id, era_id: Some(era1.id),
        name: "Fondation".into(), year: Some(50),
        description: None,
    }).await.unwrap();
    repo.events().create(NewEvent {
        universe_id: u.id, era_id: Some(era2.id),
        name: "Bataille".into(), year: Some(150),
        description: None,
    }).await.unwrap();
    repo.events().create(NewEvent {
        universe_id: u.id, era_id: None,
        name: "Inconnu".into(), year: None,
        description: None,
    }).await.unwrap();

    let all = repo.events().list_in_universe(u.id).await.unwrap();
    assert_eq!(all.len(), 3);
    // Tri par year ASC NULLS LAST → Fondation (50), Bataille (150), Inconnu (NULL)
    assert_eq!(all[0].name, "Fondation");
    assert_eq!(all[1].name, "Bataille");
    assert_eq!(all[2].name, "Inconnu");

    let in_era1 = repo.events().list_in_era(era1.id).await.unwrap();
    assert_eq!(in_era1.len(), 1);
    assert_eq!(in_era1[0].name, "Fondation");
}

#[tokio::test]
async fn event_update_can_change_era() {
    let repo = fresh().await;
    let u = repo.universes().create(NewUniverse::named("U")).await.unwrap();
    let era = repo.eras().create(NewEra {
        universe_id: u.id, name: "E1".into(),
        start_year: None, end_year: None,
        description: None, color: None, sort_order: 0,
    }).await.unwrap();
    let event = repo.events().create(NewEvent {
        universe_id: u.id, era_id: None,
        name: "Floating".into(), year: Some(42),
        description: None,
    }).await.unwrap();

    let updated = repo.events().update(event.id, UpdateEvent {
        era_id: Some(era.id), name: "Anchored".into(),
        year: Some(43), description: Some("Now in era".into()),
    }).await.unwrap();
    assert_eq!(updated.era_id, Some(era.id));
    assert_eq!(updated.name, "Anchored");
}

#[tokio::test]
async fn event_era_set_null_when_era_deleted() {
    let repo = fresh().await;
    let u = repo.universes().create(NewUniverse::named("U")).await.unwrap();
    let era = repo.eras().create(NewEra {
        universe_id: u.id, name: "E1".into(),
        start_year: None, end_year: None,
        description: None, color: None, sort_order: 0,
    }).await.unwrap();
    let event = repo.events().create(NewEvent {
        universe_id: u.id, era_id: Some(era.id),
        name: "Linked".into(), year: Some(10),
        description: None,
    }).await.unwrap();

    repo.eras().delete(era.id).await.unwrap();
    let refetched = repo.events().get(event.id).await.unwrap().unwrap();
    assert!(refetched.era_id.is_none(), "FK ON DELETE SET NULL");
}

// ---------------------------------------------------------------------------
// Snapshot
// ---------------------------------------------------------------------------

#[tokio::test]
async fn snapshot_create_and_list() {
    let repo = fresh().await;
    let u = repo.universes().create(NewUniverse::named("U")).await.unwrap();
    let entity = repo.entities().create(NewEntity::character(u.id, "Aldric")).await.unwrap();
    let era = repo.eras().create(NewEra {
        universe_id: u.id, name: "Jeunesse".into(),
        start_year: Some(0), end_year: Some(20),
        description: None, color: None, sort_order: 0,
    }).await.unwrap();

    let s1 = repo.snapshots().create(NewSnapshot {
        entity_id: entity.id, era_id: Some(era.id), event_id: None,
        year_in_universe: Some(15),
        snapshot_json: json!({"name": "Aldric jeune", "archetype": "apprenti"}),
        note: Some("Avant l'exil".into()),
    }).await.unwrap();
    repo.snapshots().create(NewSnapshot {
        entity_id: entity.id, era_id: None, event_id: None,
        year_in_universe: Some(40),
        snapshot_json: json!({"name": "Aldric mage", "archetype": "mentor"}),
        note: None,
    }).await.unwrap();

    let listed = repo.snapshots().list_for_entity(entity.id).await.unwrap();
    assert_eq!(listed.len(), 2);
    // Tri par year_in_universe ASC NULLS LAST → 15, 40
    assert_eq!(listed[0].year_in_universe, Some(15));
    assert_eq!(listed[1].year_in_universe, Some(40));

    let fetched = repo.snapshots().get(s1.id).await.unwrap().unwrap();
    assert_eq!(fetched.note.as_deref(), Some("Avant l'exil"));
    assert_eq!(fetched.snapshot_json["archetype"], "apprenti");
}

#[tokio::test]
async fn snapshot_cascade_when_entity_hard_deleted() {
    let repo = fresh().await;
    let u = repo.universes().create(NewUniverse::named("U")).await.unwrap();
    let entity = repo.entities().create(NewEntity::character(u.id, "Aldric")).await.unwrap();

    repo.snapshots().create(NewSnapshot {
        entity_id: entity.id, era_id: None, event_id: None,
        year_in_universe: Some(10),
        snapshot_json: json!({"x": 1}), note: None,
    }).await.unwrap();
    assert_eq!(repo.snapshots().list_for_entity(entity.id).await.unwrap().len(), 1);

    repo.entities().hard_delete(entity.id).await.unwrap();
    // FK ON DELETE CASCADE doit avoir effacé le snapshot.
    assert_eq!(repo.snapshots().list_for_entity(entity.id).await.unwrap().len(), 0);
}

// ---------------------------------------------------------------------------
// Relation datable (era_id existe depuis P1.2 mais on revérifie le wiring)
// ---------------------------------------------------------------------------

#[tokio::test]
async fn relation_can_carry_era_id() {
    let repo = fresh().await;
    let u = repo.universes().create(NewUniverse::named("U")).await.unwrap();
    let era = repo.eras().create(NewEra {
        universe_id: u.id, name: "Académie".into(),
        start_year: Some(0), end_year: Some(50),
        description: None, color: None, sort_order: 0,
    }).await.unwrap();
    let aldric = repo.entities().create(NewEntity::character(u.id, "Aldric")).await.unwrap();
    let lyra = repo.entities().create(NewEntity::character(u.id, "Lyra")).await.unwrap();

    let r = repo.relations().create(NewRelation {
        source_id: aldric.id, target_id: lyra.id,
        kind: RelationType::MentorOf,
        era_id: Some(era.id),
        description: None,
    }).await.unwrap();

    let fetched = repo.relations().get(r.id).await.unwrap().unwrap();
    assert_eq!(fetched.era_id, Some(era.id));

    // FK ON DELETE SET NULL : si l'era disparaît, l'arc reste mais era_id devient None.
    repo.eras().delete(era.id).await.unwrap();
    let after = repo.relations().get(r.id).await.unwrap().unwrap();
    assert!(after.era_id.is_none());
}
