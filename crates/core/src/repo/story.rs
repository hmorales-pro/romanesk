//! CRUD `Story` (récit appartenant à un univers — ou orphelin).
//!
//! Les stories sont la racine du module Phase 4 (chapitrage + édition assistée
//! IA). Une story peut être rattachée à un univers (le cas standard) ou
//! orpheline pour l'écriture libre / les brouillons.

use chrono::NaiveDateTime;
use sqlx::sqlite::SqliteRow;
use sqlx::Row;
use uuid::Uuid;

use crate::db::Database;
use crate::domain::{NewStory, Story, StoryType, UpdateStory};
use crate::repo::error::{RepoError, RepoResult};

pub struct StoryRepo<'a> {
    db: &'a Database,
}

impl<'a> StoryRepo<'a> {
    #[must_use]
    pub fn new(db: &'a Database) -> Self {
        Self { db }
    }

    pub async fn create(&self, new: NewStory) -> RepoResult<Story> {
        if new.title.trim().is_empty() {
            return Err(RepoError::Invalid("story title must not be empty".into()));
        }
        if let Some(target) = new.target_word_count {
            if target < 0 {
                return Err(RepoError::Invalid(
                    "target_word_count must be >= 0".into(),
                ));
            }
        }

        let id = Uuid::now_v7();
        let status = new.status.unwrap_or_else(|| "drafting".to_string());

        sqlx::query(
            "INSERT INTO stories \
                (id, universe_id, title, type, synopsis, status, target_word_count, pivot_era_id) \
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        )
        .bind(id.to_string())
        .bind(new.universe_id.map(|u| u.to_string()))
        .bind(new.title.trim())
        .bind(new.kind.as_str())
        .bind(new.synopsis.as_deref())
        .bind(&status)
        .bind(new.target_word_count)
        .bind(new.pivot_era_id.map(|u| u.to_string()))
        .execute(self.db.pool())
        .await?;

        self.get(id).await?.ok_or(RepoError::NotFound)
    }

    pub async fn get(&self, id: Uuid) -> RepoResult<Option<Story>> {
        let row = sqlx::query(
            "SELECT id, universe_id, title, type, synopsis, status, target_word_count, \
                    pivot_era_id, created_at, updated_at \
             FROM stories \
             WHERE id = ? AND deleted_at IS NULL",
        )
        .bind(id.to_string())
        .fetch_optional(self.db.pool())
        .await?;

        row.map(row_to_story).transpose()
    }

    /// Liste les stories d'un univers, triées par `updated_at DESC` (les
    /// plus récemment modifiées d'abord — c'est ce qu'on attend dans une
    /// bibliothèque d'écriture).
    pub async fn list_in_universe(&self, universe_id: Uuid) -> RepoResult<Vec<Story>> {
        let rows = sqlx::query(
            "SELECT id, universe_id, title, type, synopsis, status, target_word_count, \
                    pivot_era_id, created_at, updated_at \
             FROM stories \
             WHERE universe_id = ? AND deleted_at IS NULL \
             ORDER BY updated_at DESC, title COLLATE NOCASE ASC",
        )
        .bind(universe_id.to_string())
        .fetch_all(self.db.pool())
        .await?;

        rows.into_iter().map(row_to_story).collect()
    }

    pub async fn update(&self, id: Uuid, update: UpdateStory) -> RepoResult<Story> {
        if update.title.trim().is_empty() {
            return Err(RepoError::Invalid("story title must not be empty".into()));
        }
        if let Some(target) = update.target_word_count {
            if target < 0 {
                return Err(RepoError::Invalid(
                    "target_word_count must be >= 0".into(),
                ));
            }
        }

        let res = sqlx::query(
            "UPDATE stories \
             SET title = ?, type = ?, synopsis = ?, status = ?, target_word_count = ?, \
                 pivot_era_id = ?, updated_at = datetime('now') \
             WHERE id = ? AND deleted_at IS NULL",
        )
        .bind(update.title.trim())
        .bind(update.kind.as_str())
        .bind(update.synopsis.as_deref())
        .bind(update.status.trim())
        .bind(update.target_word_count)
        .bind(update.pivot_era_id.map(|u| u.to_string()))
        .bind(id.to_string())
        .execute(self.db.pool())
        .await?;

        if res.rows_affected() == 0 {
            return Err(RepoError::NotFound);
        }
        self.get(id).await?.ok_or(RepoError::NotFound)
    }

    /// Soft-delete : positionne `deleted_at`. Les chapters liés ont
    /// `ON DELETE CASCADE` mais sur la suppression hard ; le soft-delete
    /// les rend simplement invisibles via la story (qui ne sera plus
    /// listée). Le hard-delete via DB direct cascade comme attendu.
    pub async fn delete(&self, id: Uuid) -> RepoResult<()> {
        let res = sqlx::query(
            "UPDATE stories SET deleted_at = datetime('now') \
             WHERE id = ? AND deleted_at IS NULL",
        )
        .bind(id.to_string())
        .execute(self.db.pool())
        .await?;
        if res.rows_affected() == 0 {
            return Err(RepoError::NotFound);
        }
        Ok(())
    }
}

#[allow(clippy::needless_pass_by_value)]
fn row_to_story(row: SqliteRow) -> RepoResult<Story> {
    let id_str: String = row.try_get("id")?;
    let universe_id_opt: Option<String> = row.try_get("universe_id")?;
    let pivot_era_id_opt: Option<String> = row.try_get("pivot_era_id")?;
    let kind_str: String = row.try_get("type")?;
    let kind = StoryType::parse(&kind_str).ok_or_else(|| {
        RepoError::Invalid(format!("unknown story type in db: {kind_str:?}"))
    })?;
    let created_at: NaiveDateTime = row.try_get("created_at")?;
    let updated_at: NaiveDateTime = row.try_get("updated_at")?;

    Ok(Story {
        id: Uuid::parse_str(&id_str)?,
        universe_id: universe_id_opt
            .as_deref()
            .map(Uuid::parse_str)
            .transpose()?,
        title: row.try_get("title")?,
        kind,
        synopsis: row.try_get("synopsis")?,
        status: row.try_get("status")?,
        target_word_count: row.try_get("target_word_count")?,
        pivot_era_id: pivot_era_id_opt
            .as_deref()
            .map(Uuid::parse_str)
            .transpose()?,
        created_at: created_at.and_utc(),
        updated_at: updated_at.and_utc(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::Database;
    use crate::domain::NewUniverse;
    use crate::repo::Repo;

    async fn fresh_repo() -> Repo {
        let db = Database::open_in_memory().await.expect("open in-memory db");
        Repo::new(db)
    }

    #[tokio::test]
    async fn create_and_get_story() {
        let repo = fresh_repo().await;
        let u = repo
            .universes()
            .create(NewUniverse::named("Aether"))
            .await
            .unwrap();

        let s = repo
            .stories()
            .create(NewStory {
                universe_id: Some(u.id),
                title: "  La Chute des Quatre  ".into(),
                kind: StoryType::Novel,
                synopsis: Some("Quatre rois, un trône, zéro héritier.".into()),
                status: None,
                target_word_count: Some(90_000),
                pivot_era_id: None,
            })
            .await
            .unwrap();

        // Trim auto sur le titre, status par défaut, kind correctement persisté.
        assert_eq!(s.title, "La Chute des Quatre");
        assert_eq!(s.status, "drafting");
        assert_eq!(s.kind, StoryType::Novel);
        assert_eq!(s.universe_id, Some(u.id));
        assert_eq!(s.target_word_count, Some(90_000));

        let fetched = repo.stories().get(s.id).await.unwrap().unwrap();
        assert_eq!(fetched, s);
    }

    #[tokio::test]
    async fn create_rejects_empty_title() {
        let repo = fresh_repo().await;
        let u = repo
            .universes()
            .create(NewUniverse::named("Aether"))
            .await
            .unwrap();

        let err = repo
            .stories()
            .create(NewStory {
                universe_id: Some(u.id),
                title: "   ".into(),
                kind: StoryType::Novel,
                synopsis: None,
                status: None,
                target_word_count: None,
                pivot_era_id: None,
            })
            .await
            .unwrap_err();
        assert!(matches!(err, RepoError::Invalid(_)));
    }

    #[tokio::test]
    async fn create_rejects_negative_target() {
        let repo = fresh_repo().await;
        let u = repo
            .universes()
            .create(NewUniverse::named("Aether"))
            .await
            .unwrap();

        let err = repo
            .stories()
            .create(NewStory {
                universe_id: Some(u.id),
                title: "Test".into(),
                kind: StoryType::ShortStory,
                synopsis: None,
                status: None,
                target_word_count: Some(-1),
                pivot_era_id: None,
            })
            .await
            .unwrap_err();
        assert!(matches!(err, RepoError::Invalid(_)));
    }

    #[tokio::test]
    async fn list_in_universe_orders_by_updated_at_desc() {
        let repo = fresh_repo().await;
        let u = repo
            .universes()
            .create(NewUniverse::named("Aether"))
            .await
            .unwrap();

        let s1 = repo
            .stories()
            .create(NewStory {
                universe_id: Some(u.id),
                title: "Premier".into(),
                kind: StoryType::Novel,
                synopsis: None,
                status: None,
                target_word_count: None,
                pivot_era_id: None,
            })
            .await
            .unwrap();
        // Petit sleep pour différencier les timestamps (datetime() a la
        // résolution seconde en SQLite).
        tokio::time::sleep(std::time::Duration::from_millis(1100)).await;
        let s2 = repo
            .stories()
            .create(NewStory {
                universe_id: Some(u.id),
                title: "Deuxième".into(),
                kind: StoryType::Novella,
                synopsis: None,
                status: None,
                target_word_count: None,
                pivot_era_id: None,
            })
            .await
            .unwrap();

        let list = repo.stories().list_in_universe(u.id).await.unwrap();
        assert_eq!(list.len(), 2);
        // Le plus récent en premier.
        assert_eq!(list[0].id, s2.id);
        assert_eq!(list[1].id, s1.id);
    }

    #[tokio::test]
    async fn update_story_persists_changes() {
        let repo = fresh_repo().await;
        let u = repo
            .universes()
            .create(NewUniverse::named("Aether"))
            .await
            .unwrap();
        let s = repo
            .stories()
            .create(NewStory {
                universe_id: Some(u.id),
                title: "Brouillon".into(),
                kind: StoryType::Novella,
                synopsis: None,
                status: None,
                target_word_count: None,
                pivot_era_id: None,
            })
            .await
            .unwrap();

        let updated = repo
            .stories()
            .update(
                s.id,
                UpdateStory {
                    title: "Final".into(),
                    kind: StoryType::Novel,
                    synopsis: Some("Pitch raffiné.".into()),
                    status: "writing".into(),
                    target_word_count: Some(120_000),
                    pivot_era_id: None,
                },
            )
            .await
            .unwrap();

        assert_eq!(updated.title, "Final");
        assert_eq!(updated.kind, StoryType::Novel);
        assert_eq!(updated.synopsis.as_deref(), Some("Pitch raffiné."));
        assert_eq!(updated.status, "writing");
        assert_eq!(updated.target_word_count, Some(120_000));
    }

    #[tokio::test]
    async fn delete_soft_hides_story_from_list() {
        let repo = fresh_repo().await;
        let u = repo
            .universes()
            .create(NewUniverse::named("Aether"))
            .await
            .unwrap();
        let s = repo
            .stories()
            .create(NewStory {
                universe_id: Some(u.id),
                title: "À supprimer".into(),
                kind: StoryType::ShortStory,
                synopsis: None,
                status: None,
                target_word_count: None,
                pivot_era_id: None,
            })
            .await
            .unwrap();

        repo.stories().delete(s.id).await.unwrap();

        // Le get filtre les soft-deleted.
        assert!(repo.stories().get(s.id).await.unwrap().is_none());
        assert!(repo.stories().list_in_universe(u.id).await.unwrap().is_empty());

        // Re-delete renvoie NotFound.
        assert!(matches!(
            repo.stories().delete(s.id).await,
            Err(RepoError::NotFound)
        ));
    }

    #[tokio::test]
    async fn create_orphan_story_works() {
        let repo = fresh_repo().await;
        let s = repo
            .stories()
            .create(NewStory {
                universe_id: None,
                title: "Brouillon libre".into(),
                kind: StoryType::ShortStory,
                synopsis: None,
                status: None,
                target_word_count: None,
                pivot_era_id: None,
            })
            .await
            .unwrap();
        assert_eq!(s.universe_id, None);
        assert_eq!(s.kind, StoryType::ShortStory);
    }
}
