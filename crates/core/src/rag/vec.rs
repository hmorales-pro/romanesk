//! Stockage et recherche vectorielle naïve (cosine pur Rust).

use chrono::NaiveDateTime;
use sqlx::sqlite::SqliteRow;
use sqlx::Row;
use uuid::Uuid;

use crate::db::Database;
use crate::domain::{Embedding, EmbeddingHit, NewEmbedding, SourceType};
use crate::repo::error::{RepoError, RepoResult};

// ---------------------------------------------------------------------------
// Encodage / décodage BLOB
// ---------------------------------------------------------------------------

/// Sérialise un `&[f32]` en bytes little-endian (`len * 4` octets).
#[must_use]
pub fn encode_vector(v: &[f32]) -> Vec<u8> {
    let mut bytes = Vec::with_capacity(v.len() * 4);
    for x in v {
        bytes.extend_from_slice(&x.to_le_bytes());
    }
    bytes
}

/// Décode un BLOB en `Vec<f32>` selon une dimension attendue.
///
/// Renvoie `Inconsistent` si la taille du BLOB ne matche pas `dim * 4`.
pub fn decode_vector(bytes: &[u8], dim: usize) -> RepoResult<Vec<f32>> {
    let expected = dim
        .checked_mul(4)
        .ok_or_else(|| RepoError::Inconsistent(format!("dim {dim} overflows usize")))?;
    if bytes.len() != expected {
        return Err(RepoError::Inconsistent(format!(
            "embedding blob size mismatch: expected {expected} bytes for dim={dim}, got {got}",
            got = bytes.len()
        )));
    }
    let mut out = Vec::with_capacity(dim);
    for chunk in bytes.chunks_exact(4) {
        let mut buf = [0_u8; 4];
        buf.copy_from_slice(chunk);
        out.push(f32::from_le_bytes(buf));
    }
    Ok(out)
}

// ---------------------------------------------------------------------------
// Cosine
// ---------------------------------------------------------------------------

/// Similarité cosine entre deux vecteurs de même longueur.
///
/// Renvoie 0.0 si l'un des deux vecteurs est nul (norme = 0) ou si les
/// dimensions diffèrent (sécurité — en pratique `search_topk` filtre déjà
/// par dimension côté SQL avant d'appeler `cosine`).
#[must_use]
pub fn cosine(a: &[f32], b: &[f32]) -> f32 {
    if a.len() != b.len() {
        return 0.0;
    }
    let mut dot = 0.0_f32;
    let mut norm_a = 0.0_f32;
    let mut norm_b = 0.0_f32;
    for (x, y) in a.iter().zip(b.iter()) {
        dot += x * y;
        norm_a += x * x;
        norm_b += y * y;
    }
    // Les normes sont des sommes de carrés, donc toujours ≥ 0. `<= 0.0`
    // évite la comparaison directe d'égalité floating-point (clippy::float_cmp).
    if norm_a <= 0.0 || norm_b <= 0.0 {
        return 0.0;
    }
    dot / (norm_a.sqrt() * norm_b.sqrt())
}

// ---------------------------------------------------------------------------
// Repository
// ---------------------------------------------------------------------------

/// Filtre optionnel appliqué côté SQL avant le calcul cosine.
#[derive(Debug, Clone, Default)]
pub struct SearchFilter {
    /// Restreindre aux embeddings produits par ce modèle exact (ex. `nomic-embed-text:v1.5`).
    pub model: Option<String>,
    /// Restreindre à ce type de source.
    pub source_type: Option<SourceType>,
}

impl SearchFilter {
    #[must_use]
    pub fn by_model(model: impl Into<String>) -> Self {
        Self {
            model: Some(model.into()),
            source_type: None,
        }
    }
}

pub struct EmbeddingRepo<'a> {
    db: &'a Database,
}

impl<'a> EmbeddingRepo<'a> {
    #[must_use]
    pub fn new(db: &'a Database) -> Self {
        Self { db }
    }

    /// Insère un nouvel embedding.
    pub async fn insert(&self, new: NewEmbedding) -> RepoResult<Embedding> {
        if new.vector.is_empty() {
            return Err(RepoError::Invalid("vector must not be empty".into()));
        }
        if new.model.trim().is_empty() {
            return Err(RepoError::Invalid("model must not be empty".into()));
        }

        let id = Uuid::now_v7();
        let dim = new.vector.len();
        let blob = encode_vector(&new.vector);

        sqlx::query(
            "INSERT INTO embeddings \
                (id, source_type, source_id, chunk_idx, content, model, dim, vector) \
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        )
        .bind(id.to_string())
        .bind(new.source_type.as_str())
        .bind(new.source_id.to_string())
        .bind(new.chunk_idx)
        .bind(&new.content)
        .bind(&new.model)
        // SQLite stocke INTEGER en i64 ; dim est usize, fits sans problème.
        .bind(i64::try_from(dim).map_err(|_| RepoError::Invalid("dim too large".into()))?)
        .bind(&blob)
        .execute(self.db.pool())
        .await?;

        self.get(id).await?.ok_or(RepoError::NotFound)
    }

    pub async fn get(&self, id: Uuid) -> RepoResult<Option<Embedding>> {
        let row = sqlx::query(
            "SELECT id, source_type, source_id, chunk_idx, content, model, dim, vector, created_at \
             FROM embeddings WHERE id = ?",
        )
        .bind(id.to_string())
        .fetch_optional(self.db.pool())
        .await?;

        row.map(row_to_embedding).transpose()
    }

    /// Recherche top-k par similarité cosine.
    ///
    /// Filtre obligatoire côté SQL : `dim = query.len()` (les vecteurs de
    /// dimensions différentes ne sont jamais comparables). Filtres optionnels
    /// supplémentaires via `SearchFilter`.
    ///
    /// L'algorithme : load all matching rows → décode chaque BLOB → cosine
    /// → tri décroissant → `take(k)`. Voir ADR 0005 pour la justification.
    #[allow(clippy::needless_pass_by_value)] // SearchFilter est petit, prise par valeur idiomatique côté API.
    pub async fn search_topk(
        &self,
        query: &[f32],
        k: usize,
        filter: SearchFilter,
    ) -> RepoResult<Vec<EmbeddingHit>> {
        if query.is_empty() {
            return Err(RepoError::Invalid("query vector must not be empty".into()));
        }
        if k == 0 {
            return Ok(Vec::new());
        }

        let query_dim = i64::try_from(query.len())
            .map_err(|_| RepoError::Invalid("query dim too large".into()))?;

        // Construction de la requête en fonction des filtres présents.
        // On reste sur du SQL string concaténé (sans risque d'injection : pas
        // d'input utilisateur dans la structure, seulement les valeurs bindées).
        let mut sql = String::from(
            "SELECT id, source_type, source_id, chunk_idx, content, model, dim, vector, created_at \
             FROM embeddings WHERE dim = ?",
        );
        if filter.model.is_some() {
            sql.push_str(" AND model = ?");
        }
        if filter.source_type.is_some() {
            sql.push_str(" AND source_type = ?");
        }

        let mut q = sqlx::query(&sql).bind(query_dim);
        if let Some(model) = &filter.model {
            q = q.bind(model);
        }
        if let Some(st) = filter.source_type {
            q = q.bind(st.as_str());
        }

        let rows = q.fetch_all(self.db.pool()).await?;

        // Décode + score chaque candidat.
        let mut scored: Vec<EmbeddingHit> = rows
            .into_iter()
            .map(row_to_embedding)
            .collect::<RepoResult<Vec<_>>>()?
            .into_iter()
            .map(|e| {
                let s = cosine(query, &e.vector);
                EmbeddingHit {
                    embedding: e,
                    score: s,
                }
            })
            .collect();

        // Tri décroissant par score. NaN comparé arbitrairement (last).
        scored.sort_by(|a, b| {
            b.score
                .partial_cmp(&a.score)
                .unwrap_or(std::cmp::Ordering::Equal)
        });
        scored.truncate(k);
        Ok(scored)
    }

    /// Supprime tous les embeddings rattachés à une source (ex. pour
    /// réindexer une fiche dont le contenu a changé).
    pub async fn delete_for(&self, source_type: SourceType, source_id: Uuid) -> RepoResult<u64> {
        let res = sqlx::query("DELETE FROM embeddings WHERE source_type = ? AND source_id = ?")
            .bind(source_type.as_str())
            .bind(source_id.to_string())
            .execute(self.db.pool())
            .await?;
        Ok(res.rows_affected())
    }
}

// ---------------------------------------------------------------------------
// Row → Embedding
// ---------------------------------------------------------------------------

// Cohérent avec repo::universe::row_to_universe et repo::entity::row_to_entity :
// `SqliteRow` est consommée pour permettre l'usage direct dans `.map()`.
#[allow(clippy::needless_pass_by_value)]
fn row_to_embedding(row: SqliteRow) -> RepoResult<Embedding> {
    let id_str: String = row.try_get("id")?;
    let id = Uuid::parse_str(&id_str)?;

    let source_type_str: String = row.try_get("source_type")?;
    let source_type = SourceType::parse(&source_type_str).ok_or_else(|| {
        RepoError::Inconsistent(format!("unknown source_type in DB: `{source_type_str}`"))
    })?;

    let source_id_str: String = row.try_get("source_id")?;
    let source_id = Uuid::parse_str(&source_id_str)?;

    let dim_i64: i64 = row.try_get("dim")?;
    let dim = usize::try_from(dim_i64)
        .map_err(|_| RepoError::Inconsistent(format!("negative or overflowing dim: {dim_i64}")))?;

    let blob: Vec<u8> = row.try_get("vector")?;
    let vector = decode_vector(&blob, dim)?;

    let created_at: NaiveDateTime = row.try_get("created_at")?;
    let created_at = created_at.and_utc();

    Ok(Embedding {
        id,
        source_type,
        source_id,
        chunk_idx: row.try_get("chunk_idx")?,
        content: row.try_get("content")?,
        model: row.try_get("model")?,
        dim,
        vector,
        created_at,
    })
}

// ---------------------------------------------------------------------------
// Tests unitaires (encodage + cosine, sans DB)
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn encode_decode_round_trip() {
        let v = vec![0.0_f32, 1.5, -2.25, std::f32::consts::PI, f32::MIN_POSITIVE];
        let bytes = encode_vector(&v);
        assert_eq!(bytes.len(), v.len() * 4);
        let back = decode_vector(&bytes, v.len()).unwrap();
        assert_eq!(back, v);
    }

    #[test]
    fn decode_rejects_size_mismatch() {
        let v = vec![1.0_f32, 2.0, 3.0];
        let bytes = encode_vector(&v);
        let err = decode_vector(&bytes, 4).expect_err("dim mismatch");
        assert!(matches!(err, RepoError::Inconsistent(_)));
    }

    #[test]
    fn cosine_same_vector_is_one() {
        let v = vec![1.0_f32, 2.0, 3.0, 4.0];
        let s = cosine(&v, &v);
        assert!((s - 1.0).abs() < 1e-6, "got {s}");
    }

    #[test]
    fn cosine_orthogonal_is_zero() {
        let a = vec![1.0_f32, 0.0];
        let b = vec![0.0_f32, 1.0];
        let s = cosine(&a, &b);
        assert!(s.abs() < 1e-6, "got {s}");
    }

    #[test]
    fn cosine_opposite_is_minus_one() {
        let a = vec![1.0_f32, 0.0];
        let b = vec![-1.0_f32, 0.0];
        let s = cosine(&a, &b);
        assert!((s + 1.0).abs() < 1e-6, "got {s}");
    }

    #[test]
    fn cosine_zero_vector_returns_zero() {
        let a = vec![0.0_f32, 0.0, 0.0];
        let b = vec![1.0_f32, 2.0, 3.0];
        assert_eq!(cosine(&a, &b), 0.0);
        assert_eq!(cosine(&b, &a), 0.0);
    }
}
