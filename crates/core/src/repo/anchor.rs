//! CRUD `RealityAnchor` + `DivergencePoint` + `WorldBrief`.

use chrono::NaiveDateTime;
use sqlx::sqlite::SqliteRow;
use sqlx::Row;
use uuid::Uuid;

use crate::db::Database;
use crate::domain::{
    BriefSource, DivergenceAxis, DivergencePoint, NewDivergencePoint, NewRealityAnchor,
    NewWorldBrief, RealityAnchor, RealityMode, UpdateRealityAnchor, WorldBrief,
};
use crate::repo::error::{RepoError, RepoResult};

pub struct AnchorRepo<'a> {
    db: &'a Database,
}

impl<'a> AnchorRepo<'a> {
    #[must_use]
    pub fn new(db: &'a Database) -> Self {
        Self { db }
    }

    // -- RealityAnchor ------------------------------------------------------

    /// Récupère l'anchor d'un univers (un univers a 0 ou 1 anchor).
    pub async fn get_for_universe(&self, universe_id: Uuid) -> RepoResult<Option<RealityAnchor>> {
        let row = sqlx::query(
            "SELECT id, universe_id, mode, pivot_date, base_world, notes, created_at, updated_at \
             FROM reality_anchors WHERE universe_id = ?",
        )
        .bind(universe_id.to_string())
        .fetch_optional(self.db.pool())
        .await?;
        row.map(row_to_anchor).transpose()
    }

    pub async fn get(&self, id: Uuid) -> RepoResult<Option<RealityAnchor>> {
        let row = sqlx::query(
            "SELECT id, universe_id, mode, pivot_date, base_world, notes, created_at, updated_at \
             FROM reality_anchors WHERE id = ?",
        )
        .bind(id.to_string())
        .fetch_optional(self.db.pool())
        .await?;
        row.map(row_to_anchor).transpose()
    }

    /// Crée ou met à jour l'anchor d'un univers (UNIQUE universe_id côté SQL).
    pub async fn upsert(&self, new: NewRealityAnchor) -> RepoResult<RealityAnchor> {
        let existing = self.get_for_universe(new.universe_id).await?;
        if let Some(a) = existing {
            return self
                .update(
                    a.id,
                    UpdateRealityAnchor {
                        mode: new.mode,
                        pivot_date: new.pivot_date,
                        base_world: new.base_world,
                        notes: new.notes,
                    },
                )
                .await;
        }

        let id = Uuid::now_v7();
        sqlx::query(
            "INSERT INTO reality_anchors (id, universe_id, mode, pivot_date, base_world, notes) \
             VALUES (?, ?, ?, ?, ?, ?)",
        )
        .bind(id.to_string())
        .bind(new.universe_id.to_string())
        .bind(new.mode.as_str())
        .bind(new.pivot_date.as_deref())
        .bind(&new.base_world)
        .bind(new.notes.as_deref())
        .execute(self.db.pool())
        .await?;

        self.get(id).await?.ok_or(RepoError::NotFound)
    }

    pub async fn update(
        &self,
        id: Uuid,
        update: UpdateRealityAnchor,
    ) -> RepoResult<RealityAnchor> {
        let res = sqlx::query(
            "UPDATE reality_anchors \
             SET mode = ?, pivot_date = ?, base_world = ?, notes = ? \
             WHERE id = ?",
        )
        .bind(update.mode.as_str())
        .bind(update.pivot_date.as_deref())
        .bind(&update.base_world)
        .bind(update.notes.as_deref())
        .bind(id.to_string())
        .execute(self.db.pool())
        .await?;

        if res.rows_affected() == 0 {
            return Err(RepoError::NotFound);
        }
        self.get(id).await?.ok_or(RepoError::NotFound)
    }

    pub async fn delete(&self, id: Uuid) -> RepoResult<()> {
        let res = sqlx::query("DELETE FROM reality_anchors WHERE id = ?")
            .bind(id.to_string())
            .execute(self.db.pool())
            .await?;
        if res.rows_affected() == 0 {
            return Err(RepoError::NotFound);
        }
        Ok(())
    }

    // -- DivergencePoint ----------------------------------------------------

    pub async fn divergence_create(
        &self,
        new: NewDivergencePoint,
    ) -> RepoResult<DivergencePoint> {
        if new.title.trim().is_empty() {
            return Err(RepoError::Invalid("divergence title must not be empty".into()));
        }
        let id = Uuid::now_v7();
        sqlx::query(
            "INSERT INTO divergence_points (id, anchor_id, when_iso, axis, title, description) \
             VALUES (?, ?, ?, ?, ?, ?)",
        )
        .bind(id.to_string())
        .bind(new.anchor_id.to_string())
        .bind(&new.when_iso)
        .bind(new.axis.as_str())
        .bind(new.title.trim())
        .bind(new.description.as_deref())
        .execute(self.db.pool())
        .await?;
        self.divergence_get(id).await?.ok_or(RepoError::NotFound)
    }

    pub async fn divergence_get(&self, id: Uuid) -> RepoResult<Option<DivergencePoint>> {
        let row = sqlx::query(
            "SELECT id, anchor_id, when_iso, axis, title, description, created_at \
             FROM divergence_points WHERE id = ?",
        )
        .bind(id.to_string())
        .fetch_optional(self.db.pool())
        .await?;
        row.map(row_to_divergence).transpose()
    }

    pub async fn divergence_list(&self, anchor_id: Uuid) -> RepoResult<Vec<DivergencePoint>> {
        let rows = sqlx::query(
            "SELECT id, anchor_id, when_iso, axis, title, description, created_at \
             FROM divergence_points WHERE anchor_id = ? \
             ORDER BY when_iso ASC, title COLLATE NOCASE",
        )
        .bind(anchor_id.to_string())
        .fetch_all(self.db.pool())
        .await?;
        rows.into_iter().map(row_to_divergence).collect()
    }

    pub async fn divergence_delete(&self, id: Uuid) -> RepoResult<()> {
        let res = sqlx::query("DELETE FROM divergence_points WHERE id = ?")
            .bind(id.to_string())
            .execute(self.db.pool())
            .await?;
        if res.rows_affected() == 0 {
            return Err(RepoError::NotFound);
        }
        Ok(())
    }

    // -- WorldBrief --------------------------------------------------------

    pub async fn brief_create(&self, new: NewWorldBrief) -> RepoResult<WorldBrief> {
        let id = Uuid::now_v7();
        let content_str = serde_json::to_string(&new.content_json)?;
        sqlx::query(
            "INSERT INTO world_briefs (id, anchor_id, snapshot_date, content_json, source, pinned) \
             VALUES (?, ?, ?, ?, ?, ?)",
        )
        .bind(id.to_string())
        .bind(new.anchor_id.to_string())
        .bind(&new.snapshot_date)
        .bind(&content_str)
        .bind(new.source.as_str())
        .bind(i64::from(new.pinned))
        .execute(self.db.pool())
        .await?;
        self.brief_get(id).await?.ok_or(RepoError::NotFound)
    }

    pub async fn brief_get(&self, id: Uuid) -> RepoResult<Option<WorldBrief>> {
        let row = sqlx::query(
            "SELECT id, anchor_id, snapshot_date, content_json, source, pinned, created_at, updated_at \
             FROM world_briefs WHERE id = ?",
        )
        .bind(id.to_string())
        .fetch_optional(self.db.pool())
        .await?;
        row.map(row_to_brief).transpose()
    }

    pub async fn brief_list(&self, anchor_id: Uuid) -> RepoResult<Vec<WorldBrief>> {
        let rows = sqlx::query(
            "SELECT id, anchor_id, snapshot_date, content_json, source, pinned, created_at, updated_at \
             FROM world_briefs WHERE anchor_id = ? \
             ORDER BY snapshot_date DESC, id DESC",
        )
        .bind(anchor_id.to_string())
        .fetch_all(self.db.pool())
        .await?;
        rows.into_iter().map(row_to_brief).collect()
    }

    pub async fn brief_delete(&self, id: Uuid) -> RepoResult<()> {
        let res = sqlx::query("DELETE FROM world_briefs WHERE id = ?")
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
fn row_to_anchor(row: SqliteRow) -> RepoResult<RealityAnchor> {
    let id_str: String = row.try_get("id")?;
    let universe_id_str: String = row.try_get("universe_id")?;
    let mode_str: String = row.try_get("mode")?;
    let mode = RealityMode::parse(&mode_str)
        .ok_or_else(|| RepoError::Inconsistent(format!("unknown reality mode: {mode_str}")))?;
    let created_at: NaiveDateTime = row.try_get("created_at")?;
    let updated_at: NaiveDateTime = row.try_get("updated_at")?;
    Ok(RealityAnchor {
        id: Uuid::parse_str(&id_str)?,
        universe_id: Uuid::parse_str(&universe_id_str)?,
        mode,
        pivot_date: row.try_get("pivot_date")?,
        base_world: row.try_get("base_world")?,
        notes: row.try_get("notes")?,
        created_at: created_at.and_utc(),
        updated_at: updated_at.and_utc(),
    })
}

#[allow(clippy::needless_pass_by_value)]
fn row_to_divergence(row: SqliteRow) -> RepoResult<DivergencePoint> {
    let id_str: String = row.try_get("id")?;
    let anchor_id_str: String = row.try_get("anchor_id")?;
    let axis_str: String = row.try_get("axis")?;
    let axis = DivergenceAxis::parse(&axis_str)
        .ok_or_else(|| RepoError::Inconsistent(format!("unknown divergence axis: {axis_str}")))?;
    let created_at: NaiveDateTime = row.try_get("created_at")?;
    Ok(DivergencePoint {
        id: Uuid::parse_str(&id_str)?,
        anchor_id: Uuid::parse_str(&anchor_id_str)?,
        when_iso: row.try_get("when_iso")?,
        axis,
        title: row.try_get("title")?,
        description: row.try_get("description")?,
        created_at: created_at.and_utc(),
    })
}

#[allow(clippy::needless_pass_by_value)]
fn row_to_brief(row: SqliteRow) -> RepoResult<WorldBrief> {
    let id_str: String = row.try_get("id")?;
    let anchor_id_str: String = row.try_get("anchor_id")?;
    let source_str: String = row.try_get("source")?;
    let source = BriefSource::parse(&source_str)
        .ok_or_else(|| RepoError::Inconsistent(format!("unknown brief source: {source_str}")))?;
    let content_str: String = row.try_get("content_json")?;
    let content_json: serde_json::Value = serde_json::from_str(&content_str)?;
    let pinned_int: i64 = row.try_get("pinned")?;
    let created_at: NaiveDateTime = row.try_get("created_at")?;
    let updated_at: NaiveDateTime = row.try_get("updated_at")?;
    Ok(WorldBrief {
        id: Uuid::parse_str(&id_str)?,
        anchor_id: Uuid::parse_str(&anchor_id_str)?,
        snapshot_date: row.try_get("snapshot_date")?,
        content_json,
        source,
        pinned: pinned_int != 0,
        created_at: created_at.and_utc(),
        updated_at: updated_at.and_utc(),
    })
}
