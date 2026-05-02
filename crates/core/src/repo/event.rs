//! CRUD `Event` (événement narratif daté).

use chrono::NaiveDateTime;
use sqlx::sqlite::SqliteRow;
use sqlx::Row;
use uuid::Uuid;

use crate::db::Database;
use crate::domain::{Event, NewEvent, UpdateEvent};
use crate::repo::error::{RepoError, RepoResult};

pub struct EventRepo<'a> {
    db: &'a Database,
}

impl<'a> EventRepo<'a> {
    #[must_use]
    pub fn new(db: &'a Database) -> Self {
        Self { db }
    }

    pub async fn create(&self, new: NewEvent) -> RepoResult<Event> {
        if new.name.trim().is_empty() {
            return Err(RepoError::Invalid("event name must not be empty".into()));
        }

        let id = Uuid::now_v7();
        sqlx::query(
            "INSERT INTO events (id, universe_id, era_id, name, year, description) \
             VALUES (?, ?, ?, ?, ?, ?)",
        )
        .bind(id.to_string())
        .bind(new.universe_id.to_string())
        .bind(new.era_id.map(|u| u.to_string()))
        .bind(new.name.trim())
        .bind(new.year)
        .bind(new.description.as_deref())
        .execute(self.db.pool())
        .await?;

        self.get(id).await?.ok_or(RepoError::NotFound)
    }

    pub async fn get(&self, id: Uuid) -> RepoResult<Option<Event>> {
        let row = sqlx::query(
            "SELECT id, universe_id, era_id, name, year, description, created_at \
             FROM events WHERE id = ?",
        )
        .bind(id.to_string())
        .fetch_optional(self.db.pool())
        .await?;

        row.map(row_to_event).transpose()
    }

    /// Liste les événements d'un univers, triés par année (NULL en dernier).
    pub async fn list_in_universe(&self, universe_id: Uuid) -> RepoResult<Vec<Event>> {
        let rows = sqlx::query(
            "SELECT id, universe_id, era_id, name, year, description, created_at \
             FROM events \
             WHERE universe_id = ? \
             ORDER BY year ASC NULLS LAST, name COLLATE NOCASE ASC",
        )
        .bind(universe_id.to_string())
        .fetch_all(self.db.pool())
        .await?;

        rows.into_iter().map(row_to_event).collect()
    }

    /// Liste les événements d'une époque (même universe_id implicite via la FK).
    pub async fn list_in_era(&self, era_id: Uuid) -> RepoResult<Vec<Event>> {
        let rows = sqlx::query(
            "SELECT id, universe_id, era_id, name, year, description, created_at \
             FROM events \
             WHERE era_id = ? \
             ORDER BY year ASC NULLS LAST, name COLLATE NOCASE ASC",
        )
        .bind(era_id.to_string())
        .fetch_all(self.db.pool())
        .await?;

        rows.into_iter().map(row_to_event).collect()
    }

    pub async fn update(&self, id: Uuid, update: UpdateEvent) -> RepoResult<Event> {
        if update.name.trim().is_empty() {
            return Err(RepoError::Invalid("event name must not be empty".into()));
        }

        let res = sqlx::query(
            "UPDATE events \
             SET era_id = ?, name = ?, year = ?, description = ? \
             WHERE id = ?",
        )
        .bind(update.era_id.map(|u| u.to_string()))
        .bind(update.name.trim())
        .bind(update.year)
        .bind(update.description.as_deref())
        .bind(id.to_string())
        .execute(self.db.pool())
        .await?;

        if res.rows_affected() == 0 {
            return Err(RepoError::NotFound);
        }
        self.get(id).await?.ok_or(RepoError::NotFound)
    }

    pub async fn delete(&self, id: Uuid) -> RepoResult<()> {
        let res = sqlx::query("DELETE FROM events WHERE id = ?")
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
fn row_to_event(row: SqliteRow) -> RepoResult<Event> {
    let id_str: String = row.try_get("id")?;
    let universe_id_str: String = row.try_get("universe_id")?;
    let era_id_str: Option<String> = row.try_get("era_id")?;
    let created_at: NaiveDateTime = row.try_get("created_at")?;
    Ok(Event {
        id: Uuid::parse_str(&id_str)?,
        universe_id: Uuid::parse_str(&universe_id_str)?,
        era_id: era_id_str.map(|s| Uuid::parse_str(&s)).transpose()?,
        name: row.try_get("name")?,
        year: row.try_get("year")?,
        description: row.try_get("description")?,
        created_at: created_at.and_utc(),
    })
}
