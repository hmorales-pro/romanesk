//! CRUD `Snapshot` (override d'une entité à une époque).

use chrono::NaiveDateTime;
use sqlx::sqlite::SqliteRow;
use sqlx::Row;
use uuid::Uuid;

use crate::db::Database;
use crate::domain::{NewSnapshot, Snapshot};
use crate::repo::error::{RepoError, RepoResult};

pub struct SnapshotRepo<'a> {
    db: &'a Database,
}

impl<'a> SnapshotRepo<'a> {
    #[must_use]
    pub fn new(db: &'a Database) -> Self {
        Self { db }
    }

    pub async fn create(&self, new: NewSnapshot) -> RepoResult<Snapshot> {
        let id = Uuid::now_v7();
        let snapshot_str = serde_json::to_string(&new.snapshot_json)?;
        sqlx::query(
            "INSERT INTO temporal_snapshots \
                (id, entity_id, era_id, event_id, year_in_universe, snapshot_json, note) \
             VALUES (?, ?, ?, ?, ?, ?, ?)",
        )
        .bind(id.to_string())
        .bind(new.entity_id.to_string())
        .bind(new.era_id.map(|u| u.to_string()))
        .bind(new.event_id.map(|u| u.to_string()))
        .bind(new.year_in_universe)
        .bind(&snapshot_str)
        .bind(new.note.as_deref())
        .execute(self.db.pool())
        .await?;

        self.get(id).await?.ok_or(RepoError::NotFound)
    }

    pub async fn get(&self, id: Uuid) -> RepoResult<Option<Snapshot>> {
        let row = sqlx::query(
            "SELECT id, entity_id, era_id, event_id, year_in_universe, snapshot_json, note, created_at \
             FROM temporal_snapshots WHERE id = ?",
        )
        .bind(id.to_string())
        .fetch_optional(self.db.pool())
        .await?;

        row.map(row_to_snapshot).transpose()
    }

    /// Liste les snapshots d'une entité, triés par `year_in_universe` ASC
    /// (NULL en dernier), puis par `id` (UUID v7 monotone temporellement).
    pub async fn list_for_entity(&self, entity_id: Uuid) -> RepoResult<Vec<Snapshot>> {
        let rows = sqlx::query(
            "SELECT id, entity_id, era_id, event_id, year_in_universe, snapshot_json, note, created_at \
             FROM temporal_snapshots \
             WHERE entity_id = ? \
             ORDER BY year_in_universe ASC NULLS LAST, id DESC",
        )
        .bind(entity_id.to_string())
        .fetch_all(self.db.pool())
        .await?;

        rows.into_iter().map(row_to_snapshot).collect()
    }

    pub async fn delete(&self, id: Uuid) -> RepoResult<()> {
        let res = sqlx::query("DELETE FROM temporal_snapshots WHERE id = ?")
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
fn row_to_snapshot(row: SqliteRow) -> RepoResult<Snapshot> {
    let id_str: String = row.try_get("id")?;
    let entity_id_str: String = row.try_get("entity_id")?;
    let era_id_str: Option<String> = row.try_get("era_id")?;
    let event_id_str: Option<String> = row.try_get("event_id")?;
    let snapshot_str: String = row.try_get("snapshot_json")?;
    let snapshot_json: serde_json::Value = serde_json::from_str(&snapshot_str)?;
    let created_at: NaiveDateTime = row.try_get("created_at")?;
    Ok(Snapshot {
        id: Uuid::parse_str(&id_str)?,
        entity_id: Uuid::parse_str(&entity_id_str)?,
        era_id: era_id_str.map(|s| Uuid::parse_str(&s)).transpose()?,
        event_id: event_id_str.map(|s| Uuid::parse_str(&s)).transpose()?,
        year_in_universe: row.try_get("year_in_universe")?,
        snapshot_json,
        note: row.try_get("note")?,
        created_at: created_at.and_utc(),
    })
}
