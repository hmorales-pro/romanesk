//! Export Markdown d'un univers complet.
//!
//! Convention : un seul fichier `.md` qui contient toutes les fiches
//! et les relations, organisé en sections. Format compatible avec
//! Obsidian, GitHub, Pandoc, etc.

use serde_json::Value;

use crate::domain::{Chapter, Entity, EntityType, Relation, RelationType, Story, Universe};

/// Rend un univers entier en Markdown : entête + sections par type d'entité
/// + section relations.
///
/// L'argument `entity_name_by_id` permet d'afficher les noms des cibles dans
/// les relations sans refaire de lookup ; en pratique on construit cette map
/// à partir de la liste `entities`.
#[must_use]
pub fn render_universe_markdown(
    universe: &Universe,
    entities: &[Entity],
    relations: &[Relation],
) -> String {
    let mut out = String::new();

    // Entête univers
    out.push_str(&format!("# {}\n\n", universe.name));
    if let Some(desc) = &universe.description {
        out.push_str(desc);
        out.push_str("\n\n");
    }
    out.push_str(&format!(
        "*Exporté depuis Romanesk · créé le {} · {} entité(s), {} relation(s).*\n\n",
        universe.created_at.format("%Y-%m-%d"),
        entities.len(),
        relations.len(),
    ));
    out.push_str("---\n\n");

    // Sections par type
    let characters: Vec<&Entity> = entities
        .iter()
        .filter(|e| e.kind == EntityType::Character)
        .collect();
    let locations: Vec<&Entity> = entities
        .iter()
        .filter(|e| e.kind == EntityType::Location)
        .collect();
    let others: Vec<&Entity> = entities
        .iter()
        .filter(|e| e.kind != EntityType::Character && e.kind != EntityType::Location)
        .collect();

    if !characters.is_empty() {
        out.push_str("## Personnages\n\n");
        for c in &characters {
            render_character(c, &mut out);
        }
    }

    if !locations.is_empty() {
        out.push_str("## Lieux\n\n");
        for l in &locations {
            render_location(l, &mut out);
        }
    }

    if !others.is_empty() {
        out.push_str("## Autres entités\n\n");
        for e in &others {
            render_generic(e, &mut out);
        }
    }

    // Section relations
    if !relations.is_empty() {
        out.push_str("## Relations\n\n");
        for r in relations {
            let source = entities.iter().find(|e| e.id == r.source_id);
            let target = entities.iter().find(|e| e.id == r.target_id);
            let source_name = source.map(|e| e.name.as_str()).unwrap_or("?");
            let target_name = target.map(|e| e.name.as_str()).unwrap_or("?");
            out.push_str(&format!(
                "- **{}** {} **{}**",
                source_name,
                relation_label_active(r.kind),
                target_name,
            ));
            if let Some(desc) = &r.description {
                out.push_str(" — ");
                out.push_str(desc);
            }
            out.push('\n');
        }
        out.push('\n');
    }

    out
}

/// Rend une story (récit) entière en Markdown : entête + synopsis + chaque
/// chapitre en H2 (titre + body Tiptap converti).
///
/// Les chapitres doivent déjà être triés par `sort_order` (la commande Tauri
/// le fait via `chapter_list_for_story`). Pas de table des matières
/// auto-générée — Markdown laisse les outils consommateurs (Obsidian,
/// Pandoc) la construire à la volée.
#[must_use]
pub fn render_story_markdown(story: &Story, chapters: &[Chapter]) -> String {
    let mut out = String::new();

    // Entête story
    out.push_str(&format!("# {}\n\n", story.title));
    if let Some(syn) = &story.synopsis {
        out.push_str(syn);
        out.push_str("\n\n");
    }
    let total_words: i64 = chapters.iter().map(|c| c.word_count).sum();
    out.push_str(&format!(
        "*Exporté depuis Romanesk · type {} · {} chapitre(s) · {} mots écrits.*\n\n",
        story.kind.as_str(),
        chapters.len(),
        total_words,
    ));
    out.push_str("---\n\n");

    if chapters.is_empty() {
        out.push_str("_Aucun chapitre pour l'instant._\n");
        return out;
    }

    for (i, ch) in chapters.iter().enumerate() {
        let title = ch
            .title
            .as_deref()
            .filter(|s| !s.trim().is_empty())
            .map_or_else(|| format!("Chapitre {}", i + 1), str::to_string);
        out.push_str(&format!("## {title}\n\n"));
        let body = render_tiptap_doc(&ch.body_json);
        if body.trim().is_empty() {
            out.push_str("_(chapitre vide)_\n\n");
        } else {
            out.push_str(&body);
            if !body.ends_with('\n') {
                out.push('\n');
            }
            out.push('\n');
        }
    }

    out
}

fn render_character(c: &Entity, out: &mut String) {
    out.push_str(&format!("### {}\n\n", c.name));
    if let Some(s) = &c.summary {
        out.push_str(&format!("*{}*\n\n", s));
    }
    if let Some(archetype) = c.content.get("archetype").and_then(|v| v.as_str()) {
        out.push_str(&format!("- **Archétype** : {}\n", archetype));
    }
    if let Some(traits) = c.content.get("traits").and_then(|v| v.as_array()) {
        let names: Vec<&str> = traits.iter().filter_map(|t| t.as_str()).collect();
        if !names.is_empty() {
            out.push_str(&format!("- **Traits** : {}\n", names.join(", ")));
        }
    }
    out.push('\n');
    if let Some(bio) = c.content.get("biography") {
        let md = render_tiptap_doc(bio);
        if !md.trim().is_empty() {
            out.push_str(&md);
            out.push_str("\n\n");
        }
    }
    out.push_str("---\n\n");
}

fn render_location(l: &Entity, out: &mut String) {
    out.push_str(&format!("### {}\n\n", l.name));
    if let Some(s) = &l.summary {
        out.push_str(&format!("*{}*\n\n", s));
    }
    if let Some(kind) = l.content.get("kind").and_then(|v| v.as_str()) {
        out.push_str(&format!("- **Type** : {}\n", location_kind_label(kind)));
    }
    if let Some(climate) = l.content.get("climate").and_then(|v| v.as_str()) {
        out.push_str(&format!("- **Climat** : {}\n", climate));
    }
    if let Some(pop) = l.content.get("population").and_then(|v| v.as_str()) {
        out.push_str(&format!("- **Population** : {}\n", pop));
    }
    out.push('\n');
    if let Some(desc) = l.content.get("description") {
        let md = render_tiptap_doc(desc);
        if !md.trim().is_empty() {
            out.push_str(&md);
            out.push_str("\n\n");
        }
    }
    out.push_str("---\n\n");
}

fn render_generic(e: &Entity, out: &mut String) {
    out.push_str(&format!("### {} ({:?})\n\n", e.name, e.kind));
    if let Some(s) = &e.summary {
        out.push_str(&format!("*{}*\n\n", s));
    }
    out.push_str(&format!(
        "```json\n{}\n```\n\n",
        serde_json::to_string_pretty(&e.content).unwrap_or_default()
    ));
    out.push_str("---\n\n");
}

/// Libellé humain pour un sous-type de Lieu (cf. `lib/types.ts` côté front
/// pour la même table de correspondance).
fn location_kind_label(kind: &str) -> &'static str {
    match kind {
        "city" => "Ville",
        "region" => "Région",
        "building" => "Bâtiment",
        "naturalFeature" => "Élément naturel",
        "celestial" => "Corps céleste",
        _ => "Lieu",
    }
}

fn relation_label_active(kind: RelationType) -> &'static str {
    match kind {
        RelationType::AllyOf => "allié de",
        RelationType::EnemyOf => "ennemi de",
        RelationType::MentorOf => "mentor de",
        RelationType::ParentOf => "parent de",
        RelationType::SiblingOf => "frère/sœur de",
        RelationType::MarriedTo => "marié(e) à",
        RelationType::MemberOf => "membre de",
        RelationType::LeaderOf => "dirige",
        RelationType::RuledOver => "a régné sur",
        RelationType::LocatedIn => "situé dans",
        RelationType::Owns => "possède",
        RelationType::Created => "a créé",
        RelationType::DerivedFrom => "dérive de",
        RelationType::Mentions => "mentionne",
    }
}

// ---------------------------------------------------------------------------
// Tiptap → Markdown (parcours minimaliste du JSON ProseMirror)
// ---------------------------------------------------------------------------

/// Rend un doc ProseMirror (Tiptap) en Markdown. Couvre les éléments
/// produits par `StarterKit` : paragraphes, titres (1-6), listes
/// (puces + ordonnées), citations, code blocks, hard-breaks, et marks
/// inline (gras, italique, code, lien).
///
/// Tolérant aux entrées non-objet : si `doc` est `null`, renvoie une
/// string vide ; si c'est une string (legacy pré-J8), la renvoie tel quel.
#[must_use]
pub fn render_tiptap_doc(doc: &Value) -> String {
    if doc.is_null() {
        return String::new();
    }
    if let Some(s) = doc.as_str() {
        return s.to_string();
    }
    let mut out = String::new();
    if let Some(content) = doc.get("content").and_then(|c| c.as_array()) {
        for node in content {
            render_block(node, &mut out, 0);
        }
    }
    // Trim trailing blank lines
    while out.ends_with("\n\n") {
        out.pop();
    }
    out
}

fn render_block(node: &Value, out: &mut String, indent: usize) {
    let node_type = node.get("type").and_then(|t| t.as_str()).unwrap_or("");
    match node_type {
        "paragraph" => {
            push_indent(out, indent);
            render_inline(node.get("content"), out);
            out.push_str("\n\n");
        }
        "heading" => {
            let level = node
                .get("attrs")
                .and_then(|a| a.get("level"))
                .and_then(|l| l.as_u64())
                .unwrap_or(1)
                .clamp(1, 6) as usize;
            for _ in 0..level {
                out.push('#');
            }
            out.push(' ');
            render_inline(node.get("content"), out);
            out.push_str("\n\n");
        }
        "bulletList" | "orderedList" => {
            let ordered = node_type == "orderedList";
            if let Some(items) = node.get("content").and_then(|c| c.as_array()) {
                for (i, item) in items.iter().enumerate() {
                    if let Some(item_content) = item.get("content").and_then(|c| c.as_array()) {
                        for (j, sub) in item_content.iter().enumerate() {
                            push_indent(out, indent);
                            if j == 0 {
                                if ordered {
                                    out.push_str(&format!("{}. ", i + 1));
                                } else {
                                    out.push_str("- ");
                                }
                            } else {
                                out.push_str("  ");
                            }
                            // Le sub est typiquement un paragraph, on en sort le contenu inline.
                            if sub.get("type").and_then(|t| t.as_str()) == Some("paragraph") {
                                render_inline(sub.get("content"), out);
                                out.push('\n');
                            } else {
                                render_block(sub, out, indent + 1);
                            }
                        }
                    }
                }
                out.push('\n');
            }
        }
        "blockquote" => {
            if let Some(content) = node.get("content").and_then(|c| c.as_array()) {
                for sub in content {
                    let mut buf = String::new();
                    render_block(sub, &mut buf, 0);
                    for line in buf.lines() {
                        out.push_str("> ");
                        out.push_str(line);
                        out.push('\n');
                    }
                }
                out.push('\n');
            }
        }
        "codeBlock" => {
            let lang = node
                .get("attrs")
                .and_then(|a| a.get("language"))
                .and_then(|l| l.as_str())
                .unwrap_or("");
            out.push_str("```");
            out.push_str(lang);
            out.push('\n');
            if let Some(content) = node.get("content").and_then(|c| c.as_array()) {
                for sub in content {
                    if let Some(text) = sub.get("text").and_then(|t| t.as_str()) {
                        out.push_str(text);
                    }
                }
            }
            out.push_str("\n```\n\n");
        }
        "horizontalRule" => out.push_str("---\n\n"),
        _ => {
            // Type inconnu : on essaie de récupérer son content si présent.
            if let Some(content) = node.get("content").and_then(|c| c.as_array()) {
                for sub in content {
                    render_block(sub, out, indent);
                }
            }
        }
    }
}

fn render_inline(content: Option<&Value>, out: &mut String) {
    let Some(content) = content.and_then(|c| c.as_array()) else {
        return;
    };
    for inline in content {
        let inline_type = inline.get("type").and_then(|t| t.as_str()).unwrap_or("");
        match inline_type {
            "text" => {
                let text = inline.get("text").and_then(|t| t.as_str()).unwrap_or("");
                let marks = inline.get("marks").and_then(|m| m.as_array());
                let mut prefix = String::new();
                let mut suffix = String::new();
                let mut link_href: Option<String> = None;
                if let Some(marks) = marks {
                    for mark in marks {
                        let mark_type = mark.get("type").and_then(|t| t.as_str()).unwrap_or("");
                        match mark_type {
                            "bold" | "strong" => {
                                prefix.push_str("**");
                                suffix.insert_str(0, "**");
                            }
                            "italic" | "em" => {
                                prefix.push('*');
                                suffix.insert(0, '*');
                            }
                            "code" => {
                                prefix.push('`');
                                suffix.insert(0, '`');
                            }
                            "strike" => {
                                prefix.push_str("~~");
                                suffix.insert_str(0, "~~");
                            }
                            "link" => {
                                link_href = mark
                                    .get("attrs")
                                    .and_then(|a| a.get("href"))
                                    .and_then(|h| h.as_str())
                                    .map(String::from);
                            }
                            _ => {}
                        }
                    }
                }
                out.push_str(&prefix);
                if let Some(href) = link_href {
                    out.push('[');
                    out.push_str(text);
                    out.push_str("](");
                    out.push_str(&href);
                    out.push(')');
                } else {
                    out.push_str(text);
                }
                out.push_str(&suffix);
            }
            "hardBreak" => out.push_str("  \n"),
            _ => {}
        }
    }
}

fn push_indent(out: &mut String, level: usize) {
    for _ in 0..level {
        out.push_str("  ");
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn empty_doc() {
        assert_eq!(render_tiptap_doc(&Value::Null), "");
        assert_eq!(render_tiptap_doc(&json!({"type": "doc"})), "");
    }

    #[test]
    fn legacy_string_returned_as_is() {
        assert_eq!(
            render_tiptap_doc(&json!("plain text legacy")),
            "plain text legacy"
        );
    }

    #[test]
    fn paragraph_with_text() {
        let doc = json!({
            "type": "doc",
            "content": [
                { "type": "paragraph", "content": [
                    { "type": "text", "text": "Hello world." }
                ]}
            ]
        });
        assert_eq!(render_tiptap_doc(&doc), "Hello world.");
    }

    #[test]
    fn bold_italic_marks() {
        let doc = json!({
            "type": "doc",
            "content": [
                { "type": "paragraph", "content": [
                    { "type": "text", "text": "le ", "marks": [] },
                    { "type": "text", "text": "gras", "marks": [{"type": "bold"}] },
                    { "type": "text", "text": " et l'", "marks": [] },
                    { "type": "text", "text": "italique", "marks": [{"type": "italic"}] },
                    { "type": "text", "text": ".", "marks": [] }
                ]}
            ]
        });
        let md = render_tiptap_doc(&doc);
        assert!(md.contains("**gras**"), "got: {md}");
        assert!(md.contains("*italique*"), "got: {md}");
    }

    #[test]
    fn heading_levels() {
        let doc = json!({
            "type": "doc",
            "content": [
                { "type": "heading", "attrs": {"level": 2},
                  "content": [{"type": "text", "text": "Titre"}] }
            ]
        });
        assert_eq!(render_tiptap_doc(&doc), "## Titre");
    }

    #[test]
    fn bullet_list() {
        let doc = json!({
            "type": "doc",
            "content": [
                { "type": "bulletList", "content": [
                    { "type": "listItem", "content": [
                        { "type": "paragraph", "content": [{"type": "text", "text": "un"}]}
                    ]},
                    { "type": "listItem", "content": [
                        { "type": "paragraph", "content": [{"type": "text", "text": "deux"}]}
                    ]}
                ]}
            ]
        });
        let md = render_tiptap_doc(&doc);
        assert!(md.contains("- un"), "got: {md}");
        assert!(md.contains("- deux"), "got: {md}");
    }

    #[test]
    fn link_mark() {
        let doc = json!({
            "type": "doc",
            "content": [
                { "type": "paragraph", "content": [
                    { "type": "text", "text": "voir ici",
                      "marks": [{"type": "link", "attrs": {"href": "https://example.com"}}] }
                ]}
            ]
        });
        let md = render_tiptap_doc(&doc);
        assert!(md.contains("[voir ici](https://example.com)"), "got: {md}");
    }
}
