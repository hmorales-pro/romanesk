//! CRUD `Tag` (transversal, par univers) + association entity ↔ tag.

use sqlx::sqlite::SqliteRow;
use sqlx::Row;
use uuid::Uuid;

use crate::db::Database;
use crate::domain::{NewTag, Tag};
use crate::repo::error::{RepoError, RepoResult};

pub struct TagRepo<'a> {
    db: &'a Database,
}

impl<'a> TagRepo<'a> {
    #[must_use]
    pub fn new(db: &'a Database) -> Self {
        Self { db }
    }

    /// Crée un tag dans un univers. La contrainte SQL `UNIQUE (universe_id, name)`
    /// rejette les doublons → renvoie une erreur sqlx que l'appelant peut
    /// filtrer s'il veut un comportement « find or create ».
    pub async fn create_in_universe(&self, new: NewTag) -> RepoResult<Tag> {
        let trimmed = new.name.trim().to_string();
        if trimmed.is_empty() {
            return Err(RepoError::Invalid("tag name must not be empty".into()));
        }

        let id = Uuid::now_v7();
        sqlx::query("INSERT INTO tags (id, universe_id, name, color) VALUES (?, ?, ?, ?)")
            .bind(id.to_string())
            .bind(new.universe_id.to_string())
            .bind(&trimmed)
            .bind(new.color.as_deref())
            .execute(self.db.pool())
            .await?;

        self.get(id).await?.ok_or(RepoError::NotFound)
    }

    /// Variante « find or create » : renvoie le tag existant s'il y en a déjà
    /// un avec ce nom dans cet univers, sinon le crée.
    pub async fn find_or_create(&self, new: NewTag) -> RepoResult<Tag> {
        let trimmed = new.name.trim().to_string();
        if trimmed.is_empty() {
            return Err(RepoError::Invalid("tag name must not be empty".into()));
        }

        let existing: Option<SqliteRow> = sqlx::query(
            "SELECT id, universe_id, name, color FROM tags \
             WHERE universe_id = ? AND name = ?",
        )
        .bind(new.universe_id.to_string())
        .bind(&trimmed)
        .fetch_optional(self.db.pool())
        .await?;

        if let Some(row) = existing {
            return row_to_tag(row);
        }

        self.create_in_universe(NewTag {
            universe_id: new.universe_id,
            name: trimmed,
            color: new.color,
        })
        .await
    }

    pub async fn get(&self, id: Uuid) -> RepoResult<Option<Tag>> {
        let row = sqlx::query("SELECT id, universe_id, name, color FROM tags WHERE id = ?")
            .bind(id.to_string())
            .fetch_optional(self.db.pool())
            .await?;
        row.map(row_to_tag).transpose()
    }

    /// Liste les tags d'un univers, triés par nom (ordre alphabétique).
    pub async fn list_in_universe(&self, universe_id: Uuid) -> RepoResult<Vec<Tag>> {
        let rows = sqlx::query(
            "SELECT id, universe_id, name, color FROM tags \
             WHERE universe_id = ? ORDER BY name COLLATE NOCASE",
        )
        .bind(universe_id.to_string())
        .fetch_all(self.db.pool())
        .await?;
        rows.into_iter().map(row_to_tag).collect()
    }

    /// Liste les couples (entity_id, tag_id) pour toutes les entités actives
    /// d'un univers. Utile pour filtrer côté client sans N+1.
    pub async fn associations_in_universe(
        &self,
        universe_id: Uuid,
    ) -> RepoResult<Vec<(Uuid, Uuid)>> {
        let rows = sqlx::query(
            "SELECT et.entity_id, et.tag_id \
             FROM entity_tags et \
             JOIN lore_entities e ON e.id = et.entity_id \
             WHERE e.universe_id = ? AND e.deleted_at IS NULL",
        )
        .bind(universe_id.to_string())
        .fetch_all(self.db.pool())
        .await?;

        rows.into_iter()
            .map(|row| -> RepoResult<(Uuid, Uuid)> {
                let entity_str: String = row.try_get("entity_id")?;
                let tag_str: String = row.try_get("tag_id")?;
                Ok((Uuid::parse_str(&entity_str)?, Uuid::parse_str(&tag_str)?))
            })
            .collect()
    }

    /// Liste les tags actuellement assignés à une entité.
    pub async fn get_for_entity(&self, entity_id: Uuid) -> RepoResult<Vec<Tag>> {
        let rows = sqlx::query(
            "SELECT t.id, t.universe_id, t.name, t.color \
             FROM tags t \
             JOIN entity_tags et ON et.tag_id = t.id \
             WHERE et.entity_id = ? \
             ORDER BY t.name COLLATE NOCASE",
        )
        .bind(entity_id.to_string())
        .fetch_all(self.db.pool())
        .await?;
        rows.into_iter().map(row_to_tag).collect()
    }

    /// Remplace en bloc l'ensemble des tags d'une entité (set difference
    /// implicite : ce qui n'est pas dans `tag_ids` est désassigné).
    /// Atomique via transaction.
    pub async fn set_for_entity(&self, entity_id: Uuid, tag_ids: &[Uuid]) -> RepoResult<()> {
        let mut tx = self.db.pool().begin().await?;

        sqlx::query("DELETE FROM entity_tags WHERE entity_id = ?")
            .bind(entity_id.to_string())
            .execute(&mut *tx)
            .await?;

        for tag_id in tag_ids {
            sqlx::query("INSERT INTO entity_tags (entity_id, tag_id) VALUES (?, ?)")
                .bind(entity_id.to_string())
                .bind(tag_id.to_string())
                .execute(&mut *tx)
                .await?;
        }

        tx.commit().await?;
        Ok(())
    }

    /// Supprime un tag de l'univers. Les associations entity_tags seront
    /// supprimées en cascade (FK ON DELETE CASCADE dans la migration).
    pub async fn delete(&self, id: Uuid) -> RepoResult<()> {
        let res = sqlx::query("DELETE FROM tags WHERE id = ?")
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
fn row_to_tag(row: SqliteRow) -> RepoResult<Tag> {
    let id_str: String = row.try_get("id")?;
    let universe_id_str: String = row.try_get("universe_id")?;
    Ok(Tag {
        id: Uuid::parse_str(&id_str)?,
        universe_id: Uuid::parse_str(&universe_id_str)?,
        name: row.try_get("name")?,
        color: row.try_get("color")?,
    })
}
