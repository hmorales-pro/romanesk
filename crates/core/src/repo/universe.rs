//! CRUD `Universe` (root du graphe de lore).

use chrono::NaiveDateTime;
use sqlx::sqlite::SqliteRow;
use sqlx::Row;
use uuid::Uuid;

use crate::db::Database;
use crate::domain::{NewUniverse, Universe};
use crate::repo::error::{RepoError, RepoResult};

pub struct UniverseRepo<'a> {
    db: &'a Database,
}

impl<'a> UniverseRepo<'a> {
    #[must_use]
    pub fn new(db: &'a Database) -> Self {
        Self { db }
    }

    /// Crée un nouvel univers et renvoie la ligne fraîchement insérée
    /// (avec son `id` UUIDv7 et les timestamps remplis par SQLite).
    pub async fn create(&self, new: NewUniverse) -> RepoResult<Universe> {
        if new.name.trim().is_empty() {
            return Err(RepoError::Invalid("name must not be empty".into()));
        }

        let id = Uuid::now_v7();
        let settings_str = serde_json::to_string(&new.settings)?;

        sqlx::query(
            "INSERT INTO universes (id, name, description, settings_json) \
             VALUES (?, ?, ?, ?)",
        )
        .bind(id.to_string())
        .bind(&new.name)
        .bind(new.description.as_deref())
        .bind(&settings_str)
        .execute(self.db.pool())
        .await?;

        // Re-fetch pour récupérer created_at / updated_at remplis par SQLite.
        self.get(id).await?.ok_or(RepoError::NotFound)
    }

    /// Récupère un univers par id (renvoie `None` s'il n'existe pas ou est
    /// soft-deleted).
    pub async fn get(&self, id: Uuid) -> RepoResult<Option<Universe>> {
        let row = sqlx::query(
            "SELECT id, name, description, settings_json, created_at, updated_at \
             FROM universes WHERE id = ? AND deleted_at IS NULL",
        )
        .bind(id.to_string())
        .fetch_optional(self.db.pool())
        .await?;

        row.map(row_to_universe).transpose()
    }

    /// Liste les univers actifs, du plus récent au plus ancien.
    ///
    /// Tri sur `id` (UUID v7) plutôt que `created_at` : v7 est monotone
    /// temporellement (les 48 bits de poids fort sont un timestamp ms),
    /// l'ordre lexicographique de la string hex correspond à l'ordre
    /// chronologique. Bonus : pas d'index supplémentaire requis (id = PK).
    pub async fn list(&self) -> RepoResult<Vec<Universe>> {
        let rows = sqlx::query(
            "SELECT id, name, description, settings_json, created_at, updated_at \
             FROM universes WHERE deleted_at IS NULL \
             ORDER BY id DESC",
        )
        .fetch_all(self.db.pool())
        .await?;

        rows.into_iter().map(row_to_universe).collect()
    }

    /// Met à jour les champs éditables (`name`, `description`).
    /// Les champs `None` ne sont pas touchés.
    /// Pour `description`, une chaîne vide (après trim) est traitée comme
    /// "effacer" (NULL en base) — le caller front utilise `""` pour clear.
    pub async fn update(
        &self,
        id: Uuid,
        name: Option<String>,
        description: Option<String>,
    ) -> RepoResult<Universe> {
        if name.is_none() && description.is_none() {
            return self.get(id).await?.ok_or(RepoError::NotFound);
        }

        if let Some(ref n) = name {
            if n.trim().is_empty() {
                return Err(RepoError::Invalid("name must not be empty".into()));
            }
        }

        let mut sets: Vec<&'static str> = Vec::new();
        if name.is_some() {
            sets.push("name = ?");
        }
        if description.is_some() {
            sets.push("description = ?");
        }
        sets.push("updated_at = datetime('now')");

        let sql = format!(
            "UPDATE universes SET {} WHERE id = ? AND deleted_at IS NULL",
            sets.join(", ")
        );

        let mut q = sqlx::query(&sql);
        if let Some(n) = name.as_ref() {
            q = q.bind(n.trim().to_string());
        }
        if let Some(d) = description.as_ref() {
            // "" / whitespace-only = clear (NULL en base).
            let trimmed = d.trim();
            q = q.bind(if trimmed.is_empty() {
                None::<String>
            } else {
                Some(trimmed.to_string())
            });
        }
        q = q.bind(id.to_string());

        let res = q.execute(self.db.pool()).await?;
        if res.rows_affected() == 0 {
            return Err(RepoError::NotFound);
        }
        self.get(id).await?.ok_or(RepoError::NotFound)
    }

    /// Suppression **hard** : supprime physiquement la ligne.
    /// Le `ON DELETE CASCADE` des FK efface en cascade tout le contenu
    /// rattaché (entities, relations, snapshots, briefs, etc.).
    ///
    /// Pour une suppression réversible, voir [`soft_delete`].
    pub async fn hard_delete(&self, id: Uuid) -> RepoResult<()> {
        let res = sqlx::query("DELETE FROM universes WHERE id = ?")
            .bind(id.to_string())
            .execute(self.db.pool())
            .await?;

        if res.rows_affected() == 0 {
            return Err(RepoError::NotFound);
        }
        Ok(())
    }

    /// Suppression **soft** : positionne `deleted_at`, l'univers disparaît
    /// des `list()` / `get()` mais ses lignes restent en DB.
    pub async fn soft_delete(&self, id: Uuid) -> RepoResult<()> {
        let res = sqlx::query(
            "UPDATE universes SET deleted_at = datetime('now') \
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

fn row_to_universe(row: SqliteRow) -> RepoResult<Universe> {
    let id_str: String = row.try_get("id")?;
    let id = Uuid::parse_str(&id_str)?;

    let settings_str: String = row.try_get("settings_json")?;
    let settings: serde_json::Value = serde_json::from_str(&settings_str)?;

    // SQLite `datetime('now')` produit "YYYY-MM-DD HH:MM:SS" (sans T, sans Z) ;
    // on décode en NaiveDateTime puis on l'attache à UTC explicitement, plus
    // robuste qu'un décodage direct vers DateTime<Utc> qui dépend des formats
    // exacts reconnus par sqlx.
    let created_at: NaiveDateTime = row.try_get("created_at")?;
    let updated_at: NaiveDateTime = row.try_get("updated_at")?;
    let created_at = created_at.and_utc();
    let updated_at = updated_at.and_utc();

    Ok(Universe {
        id,
        name: row.try_get("name")?,
        description: row.try_get("description")?,
        settings,
        created_at,
        updated_at,
    })
}
