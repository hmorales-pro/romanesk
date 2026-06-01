//! CRUD `Chapter` (chapitre d'une story — Phase 4).
//!
//! Le `body_json` est un doc Tiptap/ProseMirror sérialisé. Le `word_count`
//! est maintenu côté client (l'éditeur a la source de vérité et c'est moins
//! coûteux que de re-parser le doc à chaque écriture).
//!
//! La création auto-attribue `sort_order = MAX+1` quand le payload n'en
//! fournit pas, pour que les nouveaux chapitres atterrissent toujours en
//! fin de liste.

use chrono::NaiveDateTime;
use sqlx::sqlite::SqliteRow;
use sqlx::Row;
use uuid::Uuid;

use crate::db::Database;
use crate::domain::{Chapter, ChapterStatus, NewChapter, UpdateChapter};
use crate::repo::error::{RepoError, RepoResult};

pub struct ChapterRepo<'a> {
    db: &'a Database,
}

impl<'a> ChapterRepo<'a> {
    #[must_use]
    pub fn new(db: &'a Database) -> Self {
        Self { db }
    }

    pub async fn create(&self, new: NewChapter) -> RepoResult<Chapter> {
        let id = Uuid::now_v7();
        let body = new
            .body_json
            .unwrap_or_else(|| serde_json::json!({"type": "doc", "content": []}));
        let body_str = serde_json::to_string(&body)
            .map_err(|e| RepoError::Invalid(format!("invalid body_json: {e}")))?;

        // Auto sort_order = MAX(sort_order)+1 si pas fourni.
        let sort_order = if let Some(s) = new.sort_order {
            s
        } else {
            let row = sqlx::query(
                "SELECT COALESCE(MAX(sort_order), -1) AS m FROM chapters WHERE story_id = ?",
            )
            .bind(new.story_id.to_string())
            .fetch_one(self.db.pool())
            .await?;
            let max: i64 = row.try_get("m")?;
            max + 1
        };

        sqlx::query(
            "INSERT INTO chapters \
                (id, story_id, sort_order, title, body_json, word_count, status, era_id) \
             VALUES (?, ?, ?, ?, ?, 0, 'draft', ?)",
        )
        .bind(id.to_string())
        .bind(new.story_id.to_string())
        .bind(sort_order)
        .bind(new.title.as_deref())
        .bind(&body_str)
        .bind(new.era_id.map(|u| u.to_string()))
        .execute(self.db.pool())
        .await?;

        self.get(id).await?.ok_or(RepoError::NotFound)
    }

    pub async fn get(&self, id: Uuid) -> RepoResult<Option<Chapter>> {
        let row = sqlx::query(
            "SELECT id, story_id, sort_order, title, body_json, word_count, status, era_id, \
                    created_at, updated_at \
             FROM chapters WHERE id = ?",
        )
        .bind(id.to_string())
        .fetch_optional(self.db.pool())
        .await?;
        row.map(row_to_chapter).transpose()
    }

    /// Liste les chapitres d'une story, triés par `sort_order` croissant.
    pub async fn list_for_story(&self, story_id: Uuid) -> RepoResult<Vec<Chapter>> {
        let rows = sqlx::query(
            "SELECT id, story_id, sort_order, title, body_json, word_count, status, era_id, \
                    created_at, updated_at \
             FROM chapters \
             WHERE story_id = ? \
             ORDER BY sort_order ASC, created_at ASC",
        )
        .bind(story_id.to_string())
        .fetch_all(self.db.pool())
        .await?;
        rows.into_iter().map(row_to_chapter).collect()
    }

    pub async fn update(&self, id: Uuid, update: UpdateChapter) -> RepoResult<Chapter> {
        if update.word_count < 0 {
            return Err(RepoError::Invalid("word_count must be >= 0".into()));
        }
        let body_str = serde_json::to_string(&update.body_json)
            .map_err(|e| RepoError::Invalid(format!("invalid body_json: {e}")))?;

        let res = sqlx::query(
            "UPDATE chapters \
             SET title = ?, body_json = ?, word_count = ?, status = ?, era_id = ? \
             WHERE id = ?",
        )
        .bind(update.title.as_deref())
        .bind(&body_str)
        .bind(update.word_count)
        .bind(update.status.as_str())
        .bind(update.era_id.map(|u| u.to_string()))
        .bind(id.to_string())
        .execute(self.db.pool())
        .await?;
        if res.rows_affected() == 0 {
            return Err(RepoError::NotFound);
        }
        self.get(id).await?.ok_or(RepoError::NotFound)
    }

    /// Réordonne les chapitres d'une story. `order` doit contenir TOUS les
    /// chapitres existants — on ne valide pas l'exhaustivité côté repo
    /// (responsabilité de l'appelant) mais on applique chaque update
    /// dans une transaction pour garantir l'atomicité.
    pub async fn reorder(&self, order: &[(Uuid, i64)]) -> RepoResult<()> {
        let mut tx = self.db.pool().begin().await?;
        for (id, new_sort) in order {
            sqlx::query("UPDATE chapters SET sort_order = ? WHERE id = ?")
                .bind(new_sort)
                .bind(id.to_string())
                .execute(&mut *tx)
                .await?;
        }
        tx.commit().await?;
        Ok(())
    }

    pub async fn delete(&self, id: Uuid) -> RepoResult<()> {
        let res = sqlx::query("DELETE FROM chapters WHERE id = ?")
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
fn row_to_chapter(row: SqliteRow) -> RepoResult<Chapter> {
    let id_str: String = row.try_get("id")?;
    let story_id_str: String = row.try_get("story_id")?;
    let era_id_opt: Option<String> = row.try_get("era_id")?;
    let body_str: String = row.try_get("body_json")?;
    let body_json: serde_json::Value = serde_json::from_str(&body_str)
        .map_err(|e| RepoError::Invalid(format!("corrupt body_json in db: {e}")))?;
    let status_str: String = row.try_get("status")?;
    let status = ChapterStatus::parse(&status_str).ok_or_else(|| {
        RepoError::Invalid(format!("unknown chapter status in db: {status_str:?}"))
    })?;
    let created_at: NaiveDateTime = row.try_get("created_at")?;
    let updated_at: NaiveDateTime = row.try_get("updated_at")?;

    Ok(Chapter {
        id: Uuid::parse_str(&id_str)?,
        story_id: Uuid::parse_str(&story_id_str)?,
        sort_order: row.try_get("sort_order")?,
        title: row.try_get("title")?,
        body_json,
        word_count: row.try_get("word_count")?,
        status,
        era_id: era_id_opt.as_deref().map(Uuid::parse_str).transpose()?,
        created_at: created_at.and_utc(),
        updated_at: updated_at.and_utc(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::Database;
    use crate::domain::{NewStory, NewUniverse, StoryType};
    use crate::repo::Repo;

    async fn fresh_repo_with_story() -> (Repo, Uuid) {
        let db = Database::new_in_memory().await.expect("open in-memory db");
        let repo = Repo::new(db);
        let u = repo
            .universes()
            .create(NewUniverse::named("Aether"))
            .await
            .unwrap();
        let s = repo
            .stories()
            .create(NewStory {
                universe_id: Some(u.id),
                title: "Récit".into(),
                kind: StoryType::Novel,
                synopsis: None,
                status: None,
                target_word_count: None,
                pivot_era_id: None,
            })
            .await
            .unwrap();
        (repo, s.id)
    }

    #[tokio::test]
    async fn create_first_chapter_gets_sort_order_zero() {
        let (repo, story_id) = fresh_repo_with_story().await;
        let c = repo
            .chapters()
            .create(NewChapter {
                story_id,
                title: Some("Prologue".into()),
                body_json: None,
                sort_order: None,
                era_id: None,
            })
            .await
            .unwrap();
        assert_eq!(c.sort_order, 0);
        assert_eq!(c.story_id, story_id);
        assert_eq!(c.status, ChapterStatus::Draft);
        assert_eq!(c.word_count, 0);
        // body par défaut = doc Tiptap vide.
        assert_eq!(c.body_json["type"], "doc");
    }

    #[tokio::test]
    async fn create_subsequent_chapters_increment_sort_order() {
        let (repo, story_id) = fresh_repo_with_story().await;
        let c1 = repo
            .chapters()
            .create(NewChapter {
                story_id,
                title: Some("I".into()),
                body_json: None,
                sort_order: None,
                era_id: None,
            })
            .await
            .unwrap();
        let c2 = repo
            .chapters()
            .create(NewChapter {
                story_id,
                title: Some("II".into()),
                body_json: None,
                sort_order: None,
                era_id: None,
            })
            .await
            .unwrap();
        let c3 = repo
            .chapters()
            .create(NewChapter {
                story_id,
                title: Some("III".into()),
                body_json: None,
                sort_order: None,
                era_id: None,
            })
            .await
            .unwrap();
        assert_eq!(c1.sort_order, 0);
        assert_eq!(c2.sort_order, 1);
        assert_eq!(c3.sort_order, 2);
    }

    #[tokio::test]
    async fn list_orders_by_sort_order() {
        let (repo, story_id) = fresh_repo_with_story().await;
        for i in [2, 0, 1] {
            repo.chapters()
                .create(NewChapter {
                    story_id,
                    title: Some(format!("Ch {i}")),
                    body_json: None,
                    sort_order: Some(i),
                    era_id: None,
                })
                .await
                .unwrap();
        }
        let list = repo.chapters().list_for_story(story_id).await.unwrap();
        assert_eq!(list.len(), 3);
        assert_eq!(list[0].sort_order, 0);
        assert_eq!(list[1].sort_order, 1);
        assert_eq!(list[2].sort_order, 2);
    }

    #[tokio::test]
    async fn update_persists_body_and_status() {
        let (repo, story_id) = fresh_repo_with_story().await;
        let c = repo
            .chapters()
            .create(NewChapter {
                story_id,
                title: None,
                body_json: None,
                sort_order: None,
                era_id: None,
            })
            .await
            .unwrap();

        let new_body = serde_json::json!({
            "type": "doc",
            "content": [
                { "type": "paragraph", "content": [{ "type": "text", "text": "Hello." }] }
            ]
        });
        let updated = repo
            .chapters()
            .update(
                c.id,
                UpdateChapter {
                    title: Some("Premier jour".into()),
                    body_json: new_body.clone(),
                    word_count: 1,
                    status: ChapterStatus::Reviewed,
                    era_id: None,
                },
            )
            .await
            .unwrap();
        assert_eq!(updated.title.as_deref(), Some("Premier jour"));
        assert_eq!(updated.word_count, 1);
        assert_eq!(updated.status, ChapterStatus::Reviewed);
        assert_eq!(updated.body_json, new_body);
    }

    #[tokio::test]
    async fn reorder_swaps_chapters() {
        let (repo, story_id) = fresh_repo_with_story().await;
        let c1 = repo
            .chapters()
            .create(NewChapter {
                story_id,
                title: Some("A".into()),
                body_json: None,
                sort_order: Some(0),
                era_id: None,
            })
            .await
            .unwrap();
        let c2 = repo
            .chapters()
            .create(NewChapter {
                story_id,
                title: Some("B".into()),
                body_json: None,
                sort_order: Some(1),
                era_id: None,
            })
            .await
            .unwrap();

        repo.chapters()
            .reorder(&[(c1.id, 1), (c2.id, 0)])
            .await
            .unwrap();
        let list = repo.chapters().list_for_story(story_id).await.unwrap();
        assert_eq!(list[0].id, c2.id);
        assert_eq!(list[1].id, c1.id);
    }

    #[tokio::test]
    async fn delete_chapter_removes_it() {
        let (repo, story_id) = fresh_repo_with_story().await;
        let c = repo
            .chapters()
            .create(NewChapter {
                story_id,
                title: None,
                body_json: None,
                sort_order: None,
                era_id: None,
            })
            .await
            .unwrap();
        repo.chapters().delete(c.id).await.unwrap();
        assert!(repo.chapters().get(c.id).await.unwrap().is_none());
        assert!(matches!(
            repo.chapters().delete(c.id).await,
            Err(RepoError::NotFound)
        ));
    }

    #[tokio::test]
    async fn cascade_delete_when_story_deleted_hard() {
        // soft-delete d'une story laisse les chapitres en place ; on teste le
        // hard cascade SQL pour valider que la FK est correctement posée.
        let (repo, story_id) = fresh_repo_with_story().await;
        let _c = repo
            .chapters()
            .create(NewChapter {
                story_id,
                title: None,
                body_json: None,
                sort_order: None,
                era_id: None,
            })
            .await
            .unwrap();

        // Hard delete de la story (bypass du soft-delete).
        sqlx::query("DELETE FROM stories WHERE id = ?")
            .bind(story_id.to_string())
            .execute(repo.db().pool())
            .await
            .unwrap();

        assert!(repo
            .chapters()
            .list_for_story(story_id)
            .await
            .unwrap()
            .is_empty());
    }
}
