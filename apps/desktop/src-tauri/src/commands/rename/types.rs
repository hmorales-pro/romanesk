//! Types DTO du module `rename` — exposés au front via les commandes
//! Tauri `entity_find_mentions` et `entity_rename_in_universe`.

use romanesk_core::Entity;
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(
    tag = "kind",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub enum MentionLocationKey {
    /// body_json du chapitre identifié par son id.
    Chapter { chapter_id: String },
    /// Champ `summary` (string brute) d'une autre entité.
    EntitySummary { entity_id: String },
    /// Champ riche dans `content_json` d'une entité — `field` peut être
    /// "description" (Tiptap doc) ou "biographyText" / "descriptionText"
    /// (string brute).
    EntityField { entity_id: String, field: String },
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Mention {
    pub key: MentionLocationKey,
    /// Label humain de l'emplacement, ex. « Chapitre 5 — La forêt »
    /// ou « Personnage Aldwen · biographie ».
    pub label: String,
    /// Court extrait avec [...] autour de la première occurrence.
    pub excerpt: String,
    /// Nombre d'occurrences dans cette location.
    pub count: usize,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct FindMentionsResult {
    /// Le nom actuel de l'entité (utile pour le front qui affiche
    /// « Renommer "Aldwen" en … »).
    pub current_name: String,
    /// La liste agrégée des mentions. Vide si aucune occurrence
    /// (l'auteur peut quand même renommer la fiche elle-même).
    pub mentions: Vec<Mention>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RenamePayload {
    pub entity_id: String,
    pub new_name: String,
    /// Sous-ensemble des MentionLocationKey retournés par
    /// `entity_find_mentions` que l'auteur veut effectivement modifier.
    pub locations: Vec<MentionLocationKey>,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct RenameResult {
    pub renamed_entity: Entity,
    pub chapters_updated: usize,
    pub entities_updated: usize,
}
