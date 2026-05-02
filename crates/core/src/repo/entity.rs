//! CRUD `Entity` (Personnage, Lieu, Faction, Objet, Concept, RealEntity).

use chrono::NaiveDateTime;
use sqlx::sqlite::SqliteRow;
use sqlx::Row;
use uuid::Uuid;

use crate::db::Database;
use crate::domain::{Entity, EntityType, NewEntity, UpdateEntity};
use crate::repo::error::{RepoError, RepoResult};

pub struct EntityRepo<'a> {
    db: &'a Database,
}

impl<'a> EntityRepo<'a> {
    #[must_use]
    pub fn new(db: &'a Database) -> Self {
        Self { db }
    }

    /// Crée une nouvelle fiche d'entité dans un univers donné.
    pub async fn create(&self, new: NewEntity) -> RepoResult<Entity> {
        if new.name.trim().is_empty() {
            return Err(RepoError::Invalid("name must not be empty".into()));
        }

        let id = Uuid::now_v7();
        let content_str = serde_json::to_string(&new.content)?;

        sqlx::query(
            "INSERT INTO lore_entities \
                (id, universe_id, type, name, summary, content_json, cover_image, is_real) \
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        )
        .bind(id.to_string())
        .bind(new.universe_id.to_string())
        .bind(new.kind.as_str())
        .bind(&new.name)
        .bind(new.summary.as_deref())
        .bind(&content_str)
        .bind(new.cover_image.as_deref())
        .bind(new.is_real)
        .execute(self.db.pool())
        .await?;

        self.get(id).await?.ok_or(RepoError::NotFound)
    }

    /// Récupère une entité par id (active uniquement).
    pub async fn get(&self, id: Uuid) -> RepoResult<Option<Entity>> {
        let row = sqlx::query(
            "SELECT id, universe_id, type, name, summary, content_json, \
                    cover_image, is_real, created_at, updated_at \
             FROM lore_entities WHERE id = ? AND deleted_at IS NULL",
        )
        .bind(id.to_string())
        .fetch_optional(self.db.pool())
        .await?;

        row.map(row_to_entity).transpose()
    }

    /// Liste toutes les entités actives d'un univers, du plus récent au
    /// plus ancien. Filtrable par type optionnel.
    pub async fn list_in_universe(
        &self,
        universe_id: Uuid,
        kind: Option<EntityType>,
    ) -> RepoResult<Vec<Entity>> {
        let rows = if let Some(k) = kind {
            sqlx::query(
                "SELECT id, universe_id, type, name, summary, content_json, \
                        cover_image, is_real, created_at, updated_at \
                 FROM lore_entities \
                 WHERE universe_id = ? AND type = ? AND deleted_at IS NULL \
                 ORDER BY id DESC",
            )
            .bind(universe_id.to_string())
            .bind(k.as_str())
            .fetch_all(self.db.pool())
            .await?
        } else {
            sqlx::query(
                "SELECT id, universe_id, type, name, summary, content_json, \
                        cover_image, is_real, created_at, updated_at \
                 FROM lore_entities \
                 WHERE universe_id = ? AND deleted_at IS NULL \
                 ORDER BY id DESC",
            )
            .bind(universe_id.to_string())
            .fetch_all(self.db.pool())
            .await?
        };

        rows.into_iter().map(row_to_entity).collect()
    }

    /// Compte les entités actives d'un univers (par type optionnel).
    pub async fn count_in_universe(
        &self,
        universe_id: Uuid,
        kind: Option<EntityType>,
    ) -> RepoResult<i64> {
        let row: (i64,) = if let Some(k) = kind {
            sqlx::query_as(
                "SELECT COUNT(*) FROM lore_entities \
                 WHERE universe_id = ? AND type = ? AND deleted_at IS NULL",
            )
            .bind(universe_id.to_string())
            .bind(k.as_str())
            .fetch_one(self.db.pool())
            .await?
        } else {
            sqlx::query_as(
                "SELECT COUNT(*) FROM lore_entities \
                 WHERE universe_id = ? AND deleted_at IS NULL",
            )
            .bind(universe_id.to_string())
            .fetch_one(self.db.pool())
            .await?
        };
        Ok(row.0)
    }

    /// Met à jour une entité existante. Tous les champs modifiables
    /// (cf. [`UpdateEntity`]) sont remplacés en bloc — pas de patch
    /// partiel. `id`, `universe_id`, `kind`, `created_at` restent inchangés.
    /// Le trigger SQL `trg_entities_updated` met à jour `updated_at`.
    pub async fn update(&self, id: Uuid, update: UpdateEntity) -> RepoResult<Entity> {
        if update.name.trim().is_empty() {
            return Err(RepoError::Invalid("name must not be empty".into()));
        }

        let content_str = serde_json::to_string(&update.content)?;

        let res = sqlx::query(
            "UPDATE lore_entities \
             SET name = ?, summary = ?, content_json = ?, cover_image = ?, is_real = ? \
             WHERE id = ? AND deleted_at IS NULL",
        )
        .bind(&update.name)
        .bind(update.summary.as_deref())
        .bind(&content_str)
        .bind(update.cover_image.as_deref())
        .bind(update.is_real)
        .bind(id.to_string())
        .execute(self.db.pool())
        .await?;

        if res.rows_affected() == 0 {
            return Err(RepoError::NotFound);
        }

        self.get(id).await?.ok_or(RepoError::NotFound)
    }

    /// Met à jour uniquement la colonne `cover_image` d'une entité.
    /// Plus économique qu'un `update()` complet quand on change juste
    /// l'image (et évite d'avoir à reconstruire le `UpdateEntity`).
    pub async fn set_cover_image(
        &self,
        id: Uuid,
        cover_image: Option<&str>,
    ) -> RepoResult<()> {
        let res = sqlx::query(
            "UPDATE lore_entities SET cover_image = ? \
             WHERE id = ? AND deleted_at IS NULL",
        )
        .bind(cover_image)
        .bind(id.to_string())
        .execute(self.db.pool())
        .await?;

        if res.rows_affected() == 0 {
            return Err(RepoError::NotFound);
        }
        Ok(())
    }

    /// Suppression **hard**. Les relations / snapshots / refs sont
    /// supprimés en cascade.
    pub async fn hard_delete(&self, id: Uuid) -> RepoResult<()> {
        let res = sqlx::query("DELETE FROM lore_entities WHERE id = ?")
            .bind(id.to_string())
            .execute(self.db.pool())
            .await?;

        if res.rows_affected() == 0 {
            return Err(RepoError::NotFound);
        }
        Ok(())
    }

    /// Suppression **soft**.
    pub async fn soft_delete(&self, id: Uuid) -> RepoResult<()> {
        let res = sqlx::query(
            "UPDATE lore_entities SET deleted_at = datetime('now') \
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

fn row_to_entity(row: SqliteRow) -> RepoResult<Entity> {
    let id_str: String = row.try_get("id")?;
    let universe_id_str: String = row.try_get("universe_id")?;
    let id = Uuid::parse_str(&id_str)?;
    let universe_id = Uuid::parse_str(&universe_id_str)?;

    let kind_str: String = row.try_get("type")?;
    let kind = EntityType::parse(&kind_str).ok_or_else(|| {
        RepoError::Inconsistent(format!("unknown entity type in DB: `{kind_str}`"))
    })?;

    let content_str: String = row.try_get("content_json")?;
    let content: serde_json::Value = serde_json::from_str(&content_str)?;

    // Voir le commentaire dans `universe::row_to_universe`.
    let created_at: NaiveDateTime = row.try_get("created_at")?;
    let updated_at: NaiveDateTime = row.try_get("updated_at")?;
    let created_at = created_at.and_utc();
    let updated_at = updated_at.and_utc();

    Ok(Entity {
        id,
        universe_id,
        kind,
        name: row.try_get("name")?,
        summary: row.try_get("summary")?,
        content,
        cover_image: row.try_get("cover_image")?,
        is_real: row.try_get("is_real")?,
        created_at,
        updated_at,
    })
}
