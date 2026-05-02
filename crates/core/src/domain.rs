//! Types métier persistés en SQLite (cf. PRD §7).
//!
//! Convention : les structs `Universe`, `Entity`… représentent des lignes
//! lues depuis la DB (avec `id`, `created_at`, `updated_at`). Les structs
//! `NewUniverse`, `NewEntity`… représentent les paramètres d'insertion
//! (sans champs auto-générés).

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

// ---------------------------------------------------------------------------
// Universe
// ---------------------------------------------------------------------------

/// `Eq` n'est pas dérivé : `serde_json::Value::Number` peut contenir un f64
/// qui n'implémente pas `Eq` (NaN). On garde `PartialEq` qui suffit pour
/// les assertions de test.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Universe {
    pub id: Uuid,
    pub name: String,
    pub description: Option<String>,
    /// JSON libre : langue, genres, calendrier custom, etc.
    pub settings: serde_json::Value,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone)]
pub struct NewUniverse {
    pub name: String,
    pub description: Option<String>,
    pub settings: serde_json::Value,
}

impl NewUniverse {
    /// Constructeur ergonomique pour le cas le plus commun : juste un nom,
    /// settings vides (`{}`), pas de description.
    #[must_use]
    pub fn named(name: impl Into<String>) -> Self {
        Self {
            name: name.into(),
            description: None,
            settings: serde_json::json!({}),
        }
    }
}

// ---------------------------------------------------------------------------
// Entity (polymorphe : Personnage, Lieu, Faction, Objet, Concept, RealEntity)
// ---------------------------------------------------------------------------

/// Type de fiche de lore. Doit rester aligné avec la contrainte CHECK de la
/// table `lore_entities` dans `db/migrations/0001_init.sql`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum EntityType {
    Character,
    Location,
    Faction,
    Object,
    Concept,
    RealEntity,
}

impl EntityType {
    /// Représentation textuelle stockée en DB (colonne `type`).
    #[must_use]
    pub const fn as_str(&self) -> &'static str {
        match self {
            Self::Character => "Character",
            Self::Location => "Location",
            Self::Faction => "Faction",
            Self::Object => "Object",
            Self::Concept => "Concept",
            Self::RealEntity => "RealEntity",
        }
    }

    /// Parse une valeur lue en DB. Renvoie `None` si la valeur est inconnue
    /// (donnée corrompue ou ajoutée à la main hors du code Rust).
    #[must_use]
    pub fn parse(s: &str) -> Option<Self> {
        match s {
            "Character" => Some(Self::Character),
            "Location" => Some(Self::Location),
            "Faction" => Some(Self::Faction),
            "Object" => Some(Self::Object),
            "Concept" => Some(Self::Concept),
            "RealEntity" => Some(Self::RealEntity),
            _ => None,
        }
    }
}

/// `Eq` non dérivé pour la même raison que [`Universe`].
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Entity {
    pub id: Uuid,
    pub universe_id: Uuid,
    /// Sérialisé en JSON sous le nom canonique `type` (réservé en Rust).
    #[serde(rename = "type")]
    pub kind: EntityType,
    pub name: String,
    pub summary: Option<String>,
    /// JSON libre : champs spécifiques au `kind` (traits d'un personnage,
    /// climat d'un lieu, idéologie d'une faction…).
    pub content: serde_json::Value,
    pub cover_image: Option<String>,
    pub is_real: bool,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone)]
pub struct NewEntity {
    pub universe_id: Uuid,
    pub kind: EntityType,
    pub name: String,
    pub summary: Option<String>,
    pub content: serde_json::Value,
    pub cover_image: Option<String>,
    pub is_real: bool,
}

impl NewEntity {
    /// Constructeur ergonomique pour le cas le plus commun : un personnage
    /// avec juste un nom, content vide, pas réel.
    #[must_use]
    pub fn character(universe_id: Uuid, name: impl Into<String>) -> Self {
        Self {
            universe_id,
            kind: EntityType::Character,
            name: name.into(),
            summary: None,
            content: serde_json::json!({}),
            cover_image: None,
            is_real: false,
        }
    }
}

/// Champs d'une entité modifiables après création. Le `kind` et l'`universe_id`
/// ne sont pas modifiables (un personnage ne devient pas un lieu, et il ne
/// déménage pas d'univers — sa duplication est une opération distincte).
#[derive(Debug, Clone)]
pub struct UpdateEntity {
    pub name: String,
    pub summary: Option<String>,
    /// Contenu typé (archétype, traits, biographie Tiptap…) sérialisé en JSON.
    pub content: serde_json::Value,
    pub cover_image: Option<String>,
    pub is_real: bool,
}

// ---------------------------------------------------------------------------
// Embedding (RAG)
// ---------------------------------------------------------------------------

/// Type d'origine d'un chunk indexé. Aligné avec la colonne `source_type`
/// de la table `embeddings` (cf. `db/migrations/0001_init.sql`).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SourceType {
    Entity,
    Snapshot,
    Chapter,
    Brief,
    Note,
}

impl SourceType {
    /// Représentation textuelle stockée en DB (colonne `source_type`).
    #[must_use]
    pub const fn as_str(&self) -> &'static str {
        match self {
            Self::Entity => "entity",
            Self::Snapshot => "snapshot",
            Self::Chapter => "chapter",
            Self::Brief => "brief",
            Self::Note => "note",
        }
    }

    /// Parse une valeur lue en DB.
    #[must_use]
    pub fn parse(s: &str) -> Option<Self> {
        match s {
            "entity" => Some(Self::Entity),
            "snapshot" => Some(Self::Snapshot),
            "chapter" => Some(Self::Chapter),
            "brief" => Some(Self::Brief),
            "note" => Some(Self::Note),
            _ => None,
        }
    }
}

/// Une ligne `embeddings` en DB : un chunk de texte + son vecteur.
///
/// `Eq` non dérivé : `Vec<f32>` ne l'implémente pas (NaN).
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Embedding {
    pub id: Uuid,
    pub source_type: SourceType,
    pub source_id: Uuid,
    /// Index du chunk dans le contenu source (0 si pas de chunking).
    pub chunk_idx: i64,
    pub content: String,
    pub model: String,
    pub dim: usize,
    pub vector: Vec<f32>,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone)]
pub struct NewEmbedding {
    pub source_type: SourceType,
    pub source_id: Uuid,
    pub chunk_idx: i64,
    pub content: String,
    pub model: String,
    pub vector: Vec<f32>,
}

/// Résultat d'une recherche top-k : un embedding + son score cosine.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct EmbeddingHit {
    pub embedding: Embedding,
    /// Similarité cosine ∈ [-1, 1] ; 1 = identique en direction.
    pub score: f32,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn entity_type_round_trip() {
        for t in [
            EntityType::Character,
            EntityType::Location,
            EntityType::Faction,
            EntityType::Object,
            EntityType::Concept,
            EntityType::RealEntity,
        ] {
            assert_eq!(EntityType::parse(t.as_str()), Some(t));
        }
    }

    #[test]
    fn entity_type_parse_unknown_returns_none() {
        assert_eq!(EntityType::parse("Vehicle"), None);
        assert_eq!(EntityType::parse(""), None);
    }

    #[test]
    fn new_universe_named_defaults_to_empty_settings() {
        let u = NewUniverse::named("Aether");
        assert_eq!(u.name, "Aether");
        assert!(u.description.is_none());
        assert_eq!(u.settings, serde_json::json!({}));
    }
}
