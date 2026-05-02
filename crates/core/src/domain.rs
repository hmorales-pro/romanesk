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

// ---------------------------------------------------------------------------
// Relation (graphe de lore)
// ---------------------------------------------------------------------------

/// Set figé des types de relations en v1, conformément à l'ADR 0003.
///
/// Stocké en TEXT côté DB sous la forme snake_case via `as_str()`. Les types
/// marqués comme « symétriques » (ally_of, enemy_of, sibling_of, married_to)
/// ne sont stockés qu'une fois — la lecture doit considérer l'arc des deux
/// côtés (cf. PRD ADR 0003).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Hash)]
#[serde(rename_all = "snake_case")]
pub enum RelationType {
    /// Alliance déclarée (symétrique).
    AllyOf,
    /// Inimitié (symétrique).
    EnemyOf,
    /// A formé / a guidé.
    MentorOf,
    /// Parent biologique ou adoptif.
    ParentOf,
    /// Fratrie (symétrique).
    SiblingOf,
    /// Conjoint (symétrique).
    MarriedTo,
    /// Appartenance à une faction.
    MemberOf,
    /// Dirige une faction.
    LeaderOf,
    /// A gouverné un lieu.
    RuledOver,
    /// Contenu géographiquement.
    LocatedIn,
    /// Possession.
    Owns,
    /// A créé / fondé.
    Created,
    /// Dérive de / inspiré de.
    DerivedFrom,
    /// Référence narrative faible (pour le RAG).
    Mentions,
}

impl RelationType {
    /// Représentation textuelle stockée en DB (colonne `type`). Snake_case.
    #[must_use]
    pub const fn as_str(&self) -> &'static str {
        match self {
            Self::AllyOf => "ally_of",
            Self::EnemyOf => "enemy_of",
            Self::MentorOf => "mentor_of",
            Self::ParentOf => "parent_of",
            Self::SiblingOf => "sibling_of",
            Self::MarriedTo => "married_to",
            Self::MemberOf => "member_of",
            Self::LeaderOf => "leader_of",
            Self::RuledOver => "ruled_over",
            Self::LocatedIn => "located_in",
            Self::Owns => "owns",
            Self::Created => "created",
            Self::DerivedFrom => "derived_from",
            Self::Mentions => "mentions",
        }
    }

    /// Parse une valeur lue en DB. `None` si la string est inconnue
    /// (donnée corrompue ou ajoutée à la main hors du code Rust).
    #[must_use]
    pub fn parse(s: &str) -> Option<Self> {
        match s {
            "ally_of" => Some(Self::AllyOf),
            "enemy_of" => Some(Self::EnemyOf),
            "mentor_of" => Some(Self::MentorOf),
            "parent_of" => Some(Self::ParentOf),
            "sibling_of" => Some(Self::SiblingOf),
            "married_to" => Some(Self::MarriedTo),
            "member_of" => Some(Self::MemberOf),
            "leader_of" => Some(Self::LeaderOf),
            "ruled_over" => Some(Self::RuledOver),
            "located_in" => Some(Self::LocatedIn),
            "owns" => Some(Self::Owns),
            "created" => Some(Self::Created),
            "derived_from" => Some(Self::DerivedFrom),
            "mentions" => Some(Self::Mentions),
            _ => None,
        }
    }

    /// `true` si la relation est sémantiquement symétrique (peu importe le
    /// sens de l'arc en DB, on la considère valide dans les deux sens).
    #[must_use]
    pub const fn is_symmetric(&self) -> bool {
        matches!(
            self,
            Self::AllyOf | Self::EnemyOf | Self::SiblingOf | Self::MarriedTo
        )
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct Relation {
    pub id: Uuid,
    pub source_id: Uuid,
    pub target_id: Uuid,
    /// Sérialisé sous le nom JSON `type` (mot-clé Rust → renommé).
    #[serde(rename = "type")]
    pub kind: RelationType,
    pub era_id: Option<Uuid>,
    pub description: Option<String>,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone)]
pub struct NewRelation {
    pub source_id: Uuid,
    pub target_id: Uuid,
    pub kind: RelationType,
    pub era_id: Option<Uuid>,
    pub description: Option<String>,
}

// ---------------------------------------------------------------------------
// Tag (transversal, par univers)
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct Tag {
    pub id: Uuid,
    pub universe_id: Uuid,
    pub name: String,
    /// Couleur hex CSS (ex. `"#94a3b8"`) ou `None` (couleur par défaut).
    pub color: Option<String>,
}

#[derive(Debug, Clone)]
pub struct NewTag {
    pub universe_id: Uuid,
    pub name: String,
    pub color: Option<String>,
}

// ---------------------------------------------------------------------------
// Era (époque dans la timeline d'un univers)
// ---------------------------------------------------------------------------

/// Une période dans le temps narratif d'un univers (ex. « Âge des dragons »,
/// « Ère post-apo », « Restauration de Bren »). Sert de référentiel pour
/// dater les événements, les snapshots d'entités, et les relations.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct Era {
    pub id: Uuid,
    pub universe_id: Uuid,
    pub name: String,
    /// Année de début dans le calendrier de l'univers (signé pour avant Z.0).
    pub start_year: Option<i64>,
    pub end_year: Option<i64>,
    pub description: Option<String>,
    /// Couleur hex CSS pour l'affichage (frise, badges).
    pub color: Option<String>,
    /// Position d'affichage explicite (avant tri par start_year).
    pub sort_order: i64,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone)]
pub struct NewEra {
    pub universe_id: Uuid,
    pub name: String,
    pub start_year: Option<i64>,
    pub end_year: Option<i64>,
    pub description: Option<String>,
    pub color: Option<String>,
    pub sort_order: i64,
}

#[derive(Debug, Clone)]
pub struct UpdateEra {
    pub name: String,
    pub start_year: Option<i64>,
    pub end_year: Option<i64>,
    pub description: Option<String>,
    pub color: Option<String>,
    pub sort_order: i64,
}

// ---------------------------------------------------------------------------
// Event (événement narratif daté)
// ---------------------------------------------------------------------------

/// Événement ponctuel dans le temps narratif. Peut être rattaché à une
/// époque pour la classification. Le `year` est dans le calendrier de
/// l'univers (cf. `Era::start_year`).
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct Event {
    pub id: Uuid,
    pub universe_id: Uuid,
    pub era_id: Option<Uuid>,
    pub name: String,
    pub year: Option<i64>,
    pub description: Option<String>,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone)]
pub struct NewEvent {
    pub universe_id: Uuid,
    pub era_id: Option<Uuid>,
    pub name: String,
    pub year: Option<i64>,
    pub description: Option<String>,
}

#[derive(Debug, Clone)]
pub struct UpdateEvent {
    pub era_id: Option<Uuid>,
    pub name: String,
    pub year: Option<i64>,
    pub description: Option<String>,
}

// ---------------------------------------------------------------------------
// TemporalSnapshot (override d'une entité à une époque ou événement donné)
// ---------------------------------------------------------------------------

/// Capture l'état d'une entité (Personnage, Lieu…) à un moment précis du
/// temps narratif. Le `snapshot_json` contient les overrides : on lit la
/// fiche canonique et on applique le delta du snapshot pour reconstruire
/// l'état à cette époque.
///
/// Phase 2 minimaliste : `snapshot_json` est un dump complet du `content`
/// au moment de la capture (snapshot = clone du contenu + name + summary).
/// Phase 3+ : vrais deltas / patches pour réduire la taille.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Snapshot {
    pub id: Uuid,
    pub entity_id: Uuid,
    pub era_id: Option<Uuid>,
    pub event_id: Option<Uuid>,
    pub year_in_universe: Option<i64>,
    pub snapshot_json: serde_json::Value,
    pub note: Option<String>,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone)]
pub struct NewSnapshot {
    pub entity_id: Uuid,
    pub era_id: Option<Uuid>,
    pub event_id: Option<Uuid>,
    pub year_in_universe: Option<i64>,
    pub snapshot_json: serde_json::Value,
    pub note: Option<String>,
}

// ---------------------------------------------------------------------------
// Reality anchor — ancrage d'un univers à la réalité historique
// ---------------------------------------------------------------------------

/// Mode d'ancrage à la réalité (cf. PRD §6).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum RealityMode {
    /// Univers de fiction pur, aucun ancrage.
    None,
    /// Récit historique respectant le réel (ex. France 1850).
    Historical,
    /// Uchronie : la réalité diverge à un point précis (ex. Fallout, post-apo).
    Divergent,
}

impl RealityMode {
    #[must_use]
    pub const fn as_str(&self) -> &'static str {
        match self {
            Self::None => "none",
            Self::Historical => "historical",
            Self::Divergent => "divergent",
        }
    }

    #[must_use]
    pub fn parse(s: &str) -> Option<Self> {
        match s {
            "none" => Some(Self::None),
            "historical" => Some(Self::Historical),
            "divergent" => Some(Self::Divergent),
            _ => None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct RealityAnchor {
    pub id: Uuid,
    pub universe_id: Uuid,
    pub mode: RealityMode,
    /// Date pivot dans le calendrier réel (ISO YYYY-MM-DD). Pertinent pour
    /// `historical` et `divergent`. `None` si mode = `none`.
    pub pivot_date: Option<String>,
    pub base_world: String,
    pub notes: Option<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone)]
pub struct NewRealityAnchor {
    pub universe_id: Uuid,
    pub mode: RealityMode,
    pub pivot_date: Option<String>,
    pub base_world: String,
    pub notes: Option<String>,
}

#[derive(Debug, Clone)]
pub struct UpdateRealityAnchor {
    pub mode: RealityMode,
    pub pivot_date: Option<String>,
    pub base_world: String,
    pub notes: Option<String>,
}

/// Axe d'une divergence : sur quelle dimension de la réalité s'écarte-t-on ?
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum DivergenceAxis {
    Tech,
    Politics,
    Culture,
    Event,
    Nature,
}

impl DivergenceAxis {
    #[must_use]
    pub const fn as_str(&self) -> &'static str {
        match self {
            Self::Tech => "tech",
            Self::Politics => "politics",
            Self::Culture => "culture",
            Self::Event => "event",
            Self::Nature => "nature",
        }
    }

    #[must_use]
    pub fn parse(s: &str) -> Option<Self> {
        match s {
            "tech" => Some(Self::Tech),
            "politics" => Some(Self::Politics),
            "culture" => Some(Self::Culture),
            "event" => Some(Self::Event),
            "nature" => Some(Self::Nature),
            _ => None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct DivergencePoint {
    pub id: Uuid,
    pub anchor_id: Uuid,
    pub when_iso: String,
    pub axis: DivergenceAxis,
    pub title: String,
    pub description: Option<String>,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone)]
pub struct NewDivergencePoint {
    pub anchor_id: Uuid,
    pub when_iso: String,
    pub axis: DivergenceAxis,
    pub title: String,
    pub description: Option<String>,
}

/// Source d'un WorldBrief : généré par IA, manuel, ou édité (ai puis manuel).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum BriefSource {
    AiGenerated,
    Manual,
    Merged,
}

impl BriefSource {
    #[must_use]
    pub const fn as_str(&self) -> &'static str {
        match self {
            Self::AiGenerated => "ai_generated",
            Self::Manual => "manual",
            Self::Merged => "merged",
        }
    }

    #[must_use]
    pub fn parse(s: &str) -> Option<Self> {
        match s {
            "ai_generated" => Some(Self::AiGenerated),
            "manual" => Some(Self::Manual),
            "merged" => Some(Self::Merged),
            _ => None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct WorldBrief {
    pub id: Uuid,
    pub anchor_id: Uuid,
    pub snapshot_date: String,
    pub content_json: serde_json::Value,
    pub source: BriefSource,
    pub pinned: bool,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone)]
pub struct NewWorldBrief {
    pub anchor_id: Uuid,
    pub snapshot_date: String,
    pub content_json: serde_json::Value,
    pub source: BriefSource,
    pub pinned: bool,
}

// ---------------------------------------------------------------------------
// Story (récit : roman, novella, nouvelle, série)
// ---------------------------------------------------------------------------

/// Type narratif d'une histoire. Doit rester aligné avec la contrainte CHECK
/// de la table `stories` (`db/migrations/0001_init.sql`).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum StoryType {
    Novel,
    Novella,
    ShortStory,
    Series,
}

impl StoryType {
    /// Représentation textuelle stockée en DB (colonne `type`). Snake_case.
    #[must_use]
    pub const fn as_str(&self) -> &'static str {
        match self {
            Self::Novel => "novel",
            Self::Novella => "novella",
            Self::ShortStory => "short_story",
            Self::Series => "series",
        }
    }

    /// Parse une valeur lue en DB.
    #[must_use]
    pub fn parse(s: &str) -> Option<Self> {
        match s {
            "novel" => Some(Self::Novel),
            "novella" => Some(Self::Novella),
            "short_story" => Some(Self::ShortStory),
            "series" => Some(Self::Series),
            _ => None,
        }
    }
}

/// Une histoire (récit) : roman, novella, nouvelle, série. Optionnellement
/// rattachée à un univers (peut être orpheline pour l'écriture libre).
///
/// `status` est une chaîne libre (pas de CHECK en DB) pour permettre des
/// statuts custom côté UI (drafting, writing, paused, done, archived…).
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct Story {
    pub id: Uuid,
    pub universe_id: Option<Uuid>,
    pub title: String,
    /// Sérialisé sous le nom JSON `type` (mot-clé Rust → renommé).
    #[serde(rename = "type")]
    pub kind: StoryType,
    pub synopsis: Option<String>,
    pub status: String,
    pub target_word_count: Option<i64>,
    pub pivot_era_id: Option<Uuid>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone)]
pub struct NewStory {
    pub universe_id: Option<Uuid>,
    pub title: String,
    pub kind: StoryType,
    pub synopsis: Option<String>,
    pub status: Option<String>,
    pub target_word_count: Option<i64>,
    pub pivot_era_id: Option<Uuid>,
}

#[derive(Debug, Clone)]
pub struct UpdateStory {
    pub title: String,
    pub kind: StoryType,
    pub synopsis: Option<String>,
    pub status: String,
    pub target_word_count: Option<i64>,
    pub pivot_era_id: Option<Uuid>,
}

// ---------------------------------------------------------------------------
// Chapter (chapitre d'une story)
// ---------------------------------------------------------------------------

/// Statut éditorial d'un chapitre. Aligné avec la contrainte CHECK SQL.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ChapterStatus {
    Draft,
    Reviewed,
    Final,
}

impl ChapterStatus {
    #[must_use]
    pub const fn as_str(&self) -> &'static str {
        match self {
            Self::Draft => "draft",
            Self::Reviewed => "reviewed",
            Self::Final => "final",
        }
    }

    #[must_use]
    pub fn parse(s: &str) -> Option<Self> {
        match s {
            "draft" => Some(Self::Draft),
            "reviewed" => Some(Self::Reviewed),
            "final" => Some(Self::Final),
            _ => None,
        }
    }
}

/// Un chapitre d'une story. `body_json` contient le doc Tiptap/ProseMirror
/// sérialisé, `word_count` est calculé/maintenu par l'app (côté Rust ou
/// côté front — Phase 4.x).
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Chapter {
    pub id: Uuid,
    pub story_id: Uuid,
    pub sort_order: i64,
    pub title: Option<String>,
    pub body_json: serde_json::Value,
    pub word_count: i64,
    pub status: ChapterStatus,
    pub era_id: Option<Uuid>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone)]
pub struct NewChapter {
    pub story_id: Uuid,
    pub title: Option<String>,
    pub body_json: Option<serde_json::Value>,
    /// `None` = on auto-attribue `MAX(sort_order)+1` à l'insert.
    pub sort_order: Option<i64>,
    pub era_id: Option<Uuid>,
}

#[derive(Debug, Clone)]
pub struct UpdateChapter {
    pub title: Option<String>,
    pub body_json: serde_json::Value,
    pub word_count: i64,
    pub status: ChapterStatus,
    pub era_id: Option<Uuid>,
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

    #[test]
    fn story_type_round_trip() {
        for t in [
            StoryType::Novel,
            StoryType::Novella,
            StoryType::ShortStory,
            StoryType::Series,
        ] {
            assert_eq!(StoryType::parse(t.as_str()), Some(t));
        }
    }

    #[test]
    fn story_type_parse_unknown_returns_none() {
        assert_eq!(StoryType::parse("essay"), None);
        assert_eq!(StoryType::parse(""), None);
    }

    #[test]
    fn chapter_status_round_trip() {
        for s in [
            ChapterStatus::Draft,
            ChapterStatus::Reviewed,
            ChapterStatus::Final,
        ] {
            assert_eq!(ChapterStatus::parse(s.as_str()), Some(s));
        }
    }

    #[test]
    fn chapter_status_parse_unknown_returns_none() {
        assert_eq!(ChapterStatus::parse("published"), None);
    }
}
