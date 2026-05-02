//! CRUD `Era` (époque dans la timeline d'un univers).

use chrono::NaiveDateTime;
use sqlx::sqlite::SqliteRow;
use sqlx::Row;
use uuid::Uuid;

use crate::db::Database;
use crate::domain::{Era, NewEra, UpdateEra};
use crate::repo::error::{RepoError, RepoResult};

pub struct EraRepo<'a> {
    db: &'a Database,
}

impl<'a> EraRepo<'a> {
    #[must_use]
    pub fn new(db: &'a Database) -> Self {
        Self { db }
    }

    pub async fn create(&self, new: NewEra) -> RepoResult<Era> {
        if new.name.trim().is_empty() {
            return Err(RepoError::Invalid("era name must not be empty".into()));
        }
        if let (Some(s), Some(e)) = (new.start_year, new.end_year) {
            if e < s {
                return Err(RepoError::Invalid(
                    "end_year must be >= start_year".into(),
                ));
            }
        }

        let id = Uuid::now_v7();
        sqlx::query(
            "INSERT INTO timeline_eras \
                (id, universe_id, name, start_year, end_year, description, color, sort_order) \
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        )
        .bind(id.to_string())
        .bind(new.universe_id.to_string())
        .bind(new.name.trim())
        .bind(new.start_year)
        .bind(new.end_year)
        .bind(new.description.as_deref())
        .bind(new.color.as_deref())
        .bind(new.sort_order)
        .execute(self.db.pool())
        .await?;

        self.get(id).await?.ok_or(RepoError::NotFound)
    }

    pub async fn get(&self, id: Uuid) -> RepoResult<Option<Era>> {
        let row = sqlx::query(
            "SELECT id, universe_id, name, start_year, end_year, description, color, sort_order, created_at \
             FROM timeline_eras WHERE id = ?",
        )
        .bind(id.to_string())
        .fetch_optional(self.db.pool())
        .await?;

        row.map(row_to_era).transpose()
    }

    /// Liste les époques d'un univers, triées par `sort_order` puis
    /// `start_year` puis `name` (tri stable et déterministe).
    pub async fn list_in_universe(&self, universe_id: Uuid) -> RepoResult<Vec<Era>> {
        let rows = sqlx::query(
            "SELECT id, universe_id, name, start_year, end_year, description, color, sort_order, created_at \
             FROM timeline_eras \
             WHERE universe_id = ? \
             ORDER BY sort_order ASC, start_year ASC NULLS LAST, name COLLATE NOCASE ASC",
        )
        .bind(universe_id.to_string())
        .fetch_all(self.db.pool())
        .await?;

        rows.into_iter().map(row_to_era).collect()
    }

    pub async fn update(&self, id: Uuid, update: UpdateEra) -> RepoResult<Era> {
        if update.name.trim().is_empty() {
            return Err(RepoError::Invalid("era name must not be empty".into()));
        }
        if let (Some(s), Some(e)) = (update.start_year, update.end_year) {
            if e < s {
                return Err(RepoError::Invalid(
                    "end_year must be >= start_year".into(),
                ));
            }
        }

        let res = sqlx::query(
            "UPDATE timeline_eras \
             SET name = ?, start_year = ?, end_year = ?, description = ?, color = ?, sort_order = ? \
             WHERE id = ?",
        )
        .bind(update.name.trim())
        .bind(update.start_year)
        .bind(update.end_year)
        .bind(update.description.as_deref())
        .bind(update.color.as_deref())
        .bind(update.sort_order)
        .bind(id.to_string())
        .execute(self.db.pool())
        .await?;

        if res.rows_affected() == 0 {
            return Err(RepoError::NotFound);
        }
        self.get(id).await?.ok_or(RepoError::NotFound)
    }

    /// Suppression hard. Les events / snapshots / relations qui pointaient
    /// sur cette ère perdent leur référence (FK ON DELETE SET NULL).
    pub async fn delete(&self, id: Uuid) -> RepoResult<()> {
        let res = sqlx::query("DELETE FROM timeline_eras WHERE id = ?")
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
fn row_to_era(row: SqliteRow) -> RepoResult<Era> {
    let id_str: String = row.try_get("id")?;
    let universe_id_str: String = row.try_get("universe_id")?;
    let created_at: NaiveDateTime = row.try_get("created_at")?;
    Ok(Era {
        id: Uuid::parse_str(&id_str)?,
        universe_id: Uuid::parse_str(&universe_id_str)?,
        name: row.try_get("name")?,
        start_year: row.try_get("start_year")?,
        end_year: row.try_get("end_year")?,
        description: row.try_get("description")?,
        color: row.try_get("color")?,
        sort_order: row.try_get("sort_order")?,
        created_at: created_at.and_utc(),
    })
}
