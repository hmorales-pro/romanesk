//! Rename propagé d'une entité dans tout l'univers (P14.1).
//!
//! Deux commandes :
//!
//!  1. `entity_find_mentions(entity_id)` — scanne tout l'univers et
//!     retourne la liste structurée des occurrences du nom courant. Le
//!     front affiche cette liste avec preview + checkboxes pour que
//!     l'auteur exclue manuellement les faux positifs.
//!
//!  2. `entity_rename_in_universe(entity_id, new_name, locations)` —
//!     applique le rename sur les locations validées par l'auteur, et
//!     met à jour le `name` de l'entité elle-même.
//!
//! Sources scannées :
//!   - chapters.body_json (Tiptap doc — text nodes)
//!   - entities.summary (string brute, autres entités)
//!   - entities.content_json (champs `description` Tiptap doc et
//!     `biographyText` / `descriptionText` string brute selon le type)
//!
//! Word boundary unicode (regex `\b`) pour ne pas matcher les
//! sub-strings : « Aldwen » ne doit pas attraper « Aldwendom ».
//!
//! P15.4 a éclaté ce module en sous-modules : `types`, `text_walker`,
//! `scan`, `apply`. Les helpers de `text_walker` sont réutilisés par
//! `commands::merge` pour la fusion de fiches.

mod apply;
mod scan;
mod text_walker;
mod types;

pub use apply::*;
pub use scan::*;
pub use types::*;

// Re-export des helpers Tiptap pour que `commands::merge` puisse les
// importer sans dupliquer la logique.
pub use text_walker::{
    build_word_regex, collect_text_nodes, first_excerpt, friendly_field,
    rename_in_content_fields, rename_in_text_nodes, scan_content_for_field_mentions,
};
