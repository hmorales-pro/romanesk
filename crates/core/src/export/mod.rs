//! Export d'un univers vers des formats portables.
//!
//! Phase 1 : Markdown uniquement. EPUB / PDF reportés en Phase 6+.
//!
//! Le but principal est de matérialiser le positionnement « free-use,
//! pas de lock-in données » du PRD §15 : à tout moment, un utilisateur
//! peut récupérer son univers complet sous une forme lisible par
//! n'importe quel outil texte (Obsidian, Word, GitHub, etc.).

pub mod markdown;

pub use markdown::{render_universe_markdown, render_tiptap_doc};
