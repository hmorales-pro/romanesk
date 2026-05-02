//! CRUD `Relation` (graphe entre `lore_entities`).

use chrono::NaiveDateTime;
use sqlx::sqlite::SqliteRow;
use sqlx::Row;
use uuid::Uuid;

use crate::db::Database;
use crate::domain::{NewRelation, Relation, RelationType};
use crate::repo::error::{RepoError, RepoResult};

pub struct RelationRepo<'a> {
    db: &'a Database,
}

impl<'a> RelationRepo<'a> {
    #[must_use]
    pub fn new(db: &'a Database) -> Self {
        Self { db }
    }

    /// Crée une nouvelle relation entre deux entités.
    ///
    /// La contrainte `CHECK (source_id <> target_id)` de la migration
    /// `0001_init.sql` rejette automatiquement une auto-relation.
    /// Les FK ON DELETE CASCADE supprimeront cet arc si l'une des deux
    /// entités est hard-deleted.
    pub async fn create(&self, new: NewRelation) -> RepoResult<Relation> {
        if new.source_id == new.target_id {
            return Err(RepoError::Invalid(
                "source and target must be different entities".into(),
            ));
        }

        let id = Uuid::now_v7();

        sqlx::query(
            "INSERT INTO relations \
                (id, source_id, target_id, type, era_id, description) \
             VALUES (?, ?, ?, ?, ?, ?)",
        )
        .bind(id.to_string())
        .bind(new.source_id.to_string())
        .bind(new.target_id.to_string())
        .bind(new.kind.as_str())
        .bind(new.era_id.map(|u| u.to_string()))
        .bind(new.description.as_deref())
        .execute(self.db.pool())
        .await?;

        self.get(id).await?.ok_or(RepoError::NotFound)
    }

    pub async fn get(&self, id: Uuid) -> RepoResult<Option<Relation>> {
        let row = sqlx::query(
            "SELECT id, source_id, target_id, type, era_id, description, created_at \
             FROM relations WHERE id = ?",
        )
        .bind(id.to_string())
        .fetch_optional(self.db.pool())
        .await?;

        row.map(row_to_relation).transpose()
    }

    /// Liste toutes les relations qui touchent une entité (source OU target).
    /// Tri par id descendant (UUID v7 monotone temporellement, cf. J3).
    ///
    /// Note : une relation symétrique (`ally_of`, etc.) n'est stockée qu'une
    /// fois — elle apparaît dans le résultat avec un `source_id` ou `target_id`
    /// qui peut être l'entité demandée. Le code consommateur doit traiter
    /// la symétrie sémantiquement (cf. ADR 0003).
    pub async fn list_for_entity(&self, entity_id: Uuid) -> RepoResult<Vec<Relation>> {
        let rows = sqlx::query(
            "SELECT id, source_id, target_id, type, era_id, description, created_at \
             FROM relations \
             WHERE source_id = ? OR target_id = ? \
             ORDER BY id DESC",
        )
        .bind(entity_id.to_string())
        .bind(entity_id.to_string())
        .fetch_all(self.db.pool())
        .await?;

        rows.into_iter().map(row_to_relation).collect()
    }

    /// Liste toutes les relations d'un univers donné. Coûteux sur un gros
    /// univers — n'utiliser que pour la vue graphe globale (P1.3+).
    ///
    /// Le JOIN couvre les deux extrémités (`source_id` OR `target_id`)
    /// pour ne pas rater les relations cross-univers (théoriquement
    /// possibles — pas de contrainte SQL qui force source.universe_id
    /// = target.universe_id, même si notre code applicatif n'en crée pas).
    /// Le `DISTINCT` évite de doubler les arcs intra-univers où les deux
    /// extrémités matchent.
    pub async fn list_in_universe(&self, universe_id: Uuid) -> RepoResult<Vec<Relation>> {
        let rows = sqlx::query(
            "SELECT DISTINCT r.id, r.source_id, r.target_id, r.type, r.era_id, r.description, r.created_at \
             FROM relations r \
             JOIN lore_entities e ON (e.id = r.source_id OR e.id = r.target_id) \
             WHERE e.universe_id = ? AND e.deleted_at IS NULL \
             ORDER BY r.id DESC",
        )
        .bind(universe_id.to_string())
        .fetch_all(self.db.pool())
        .await?;

        rows.into_iter().map(row_to_relation).collect()
    }

    /// Suppression hard. Pas de soft-delete sur les relations en Phase 0/1
    /// — une relation est trop atomique pour mériter un état « supprimée
    /// mais récupérable ». Si on en a besoin un jour, ajouter `deleted_at`.
    pub async fn delete(&self, id: Uuid) -> RepoResult<()> {
        let res = sqlx::query("DELETE FROM relations WHERE id = ?")
            .bind(id.to_string())
            .execute(self.db.pool())
            .await?;

        if res.rows_affected() == 0 {
            return Err(RepoError::NotFound);
        }
        Ok(())
    }
}

fn row_to_relation(row: SqliteRow) -> RepoResult<Relation> {
    let id_str: String = row.try_get("id")?;
    let id = Uuid::parse_str(&id_str)?;

    let source_id_str: String = row.try_get("source_id")?;
    let target_id_str: String = row.try_get("target_id")?;
    let source_id = Uuid::parse_str(&source_id_str)?;
    let target_id = Uuid::parse_str(&target_id_str)?;

    let kind_str: String = row.try_get("type")?;
    let kind = RelationType::parse(&kind_str).ok_or_else(|| {
        RepoError::Inconsistent(format!("unknown relation type in DB: `{kind_str}`"))
    })?;

    let era_id_str: Option<String> = row.try_get("era_id")?;
    let era_id = match era_id_str {
        Some(s) => Some(Uuid::parse_str(&s)?),
        None => None,
    };

    let created_at: NaiveDateTime = row.try_get("created_at")?;
    let created_at = created_at.and_utc();

    Ok(Relation {
        id,
        source_id,
        target_id,
        kind,
        era_id,
        description: row.try_get("description")?,
        created_at,
    })
}
