//! Walker récursif sur les nodes Tiptap/ProseMirror sérialisés en JSON,
//! plus les helpers de regex word-boundary et de scan des champs `content`.
//!
//! Ces helpers sont aussi consommés par `commands::merge` (fusion de
//! fiches), d'où le `pub` sur les deux fonctions de base.

use regex::Regex;
use serde_json::Value;

// ---------------------------------------------------------------------------
// Regex word-boundary unicode
// ---------------------------------------------------------------------------

/// Construit une regex word-boundary pour un nom propre.
/// `\b` en Rust est unicode-aware par défaut donc « Élodie » marche.
/// On échappe les méta-caractères regex au cas où le nom contient des
/// caractères spéciaux (rare mais pas impossible : « Saint-Pierre »).
pub fn build_word_regex(name: &str) -> Regex {
    let escaped = regex::escape(name.trim());
    // (?u) force le unicode flag (déjà par défaut mais explicite).
    let pattern = format!(r"(?u)\b{escaped}\b");
    Regex::new(&pattern).expect("valid regex from escaped name")
}

// ---------------------------------------------------------------------------
// Walkers Tiptap
// ---------------------------------------------------------------------------

/// Visiteur récursif qui collecte tous les `text` strings dans un node
/// Tiptap/ProseMirror sérialisé en JSON.
pub fn collect_text_nodes(node: &Value, out: &mut Vec<String>) {
    if let Some(text) = node.get("text").and_then(|v| v.as_str()) {
        out.push(text.to_string());
    }
    if let Some(content) = node.get("content").and_then(|v| v.as_array()) {
        for child in content {
            collect_text_nodes(child, out);
        }
    }
}

/// Remplace tous les matches dans les `text` strings d'un node Tiptap
/// (mutation in-place). Renvoie true si au moins un remplacement a été fait.
pub fn rename_in_text_nodes(node: &mut Value, re: &Regex, replacement: &str) -> bool {
    let mut changed = false;
    if let Some(text_val) = node.get_mut("text") {
        if let Some(s) = text_val.as_str() {
            let new = re.replace_all(s, replacement);
            if new != s {
                *text_val = Value::String(new.into_owned());
                changed = true;
            }
        }
    }
    if let Some(content) = node.get_mut("content").and_then(|v| v.as_array_mut()) {
        for child in content {
            if rename_in_text_nodes(child, re, replacement) {
                changed = true;
            }
        }
    }
    changed
}

// ---------------------------------------------------------------------------
// Scan/rename ciblé dans les champs d'un `content_json`
// ---------------------------------------------------------------------------

/// Scanne récursivement un objet JSON `content` et appelle `cb` pour
/// chaque champ string ou Tiptap doc qui contient au moins une mention.
/// `cb(field_path, count, excerpt)`.
pub fn scan_content_for_field_mentions<F: FnMut(String, usize, String)>(
    content: &Value,
    re: &Regex,
    cb: &mut F,
) {
    let Some(obj) = content.as_object() else {
        return;
    };
    for (key, val) in obj {
        match val {
            Value::String(s) => {
                let count = re.find_iter(s).count();
                if count > 0 {
                    cb(key.clone(), count, first_excerpt(s, re));
                }
            }
            Value::Object(inner) => {
                // Hypothèse : c'est un Tiptap doc (a un champ content array).
                if inner.contains_key("type") || inner.contains_key("content") {
                    let mut texts: Vec<String> = Vec::new();
                    collect_text_nodes(val, &mut texts);
                    let combined = texts.join("\n");
                    let count = re.find_iter(&combined).count();
                    if count > 0 {
                        cb(key.clone(), count, first_excerpt(&combined, re));
                    }
                }
            }
            _ => {}
        }
    }
}

/// Idem `rename_in_text_nodes` mais sur des champs ciblés du content.
pub fn rename_in_content_fields(
    content: &mut Value,
    fields: &[String],
    re: &Regex,
    replacement: &str,
) -> bool {
    let Some(obj) = content.as_object_mut() else {
        return false;
    };
    let mut changed = false;
    for field in fields {
        let Some(val) = obj.get_mut(field) else {
            continue;
        };
        match val {
            Value::String(s) => {
                let new = re.replace_all(s, replacement);
                if new != s.as_str() {
                    *val = Value::String(new.into_owned());
                    changed = true;
                }
            }
            Value::Object(_) => {
                if rename_in_text_nodes(val, re, replacement) {
                    changed = true;
                }
            }
            _ => {}
        }
    }
    changed
}

// ---------------------------------------------------------------------------
// Excerpts et libellés humains
// ---------------------------------------------------------------------------

/// Extrait ~80 chars de contexte autour de la première occurrence,
/// avec « […] » aux bords si on coupe.
pub fn first_excerpt(text: &str, re: &Regex) -> String {
    let Some(m) = re.find(text) else {
        return String::new();
    };
    const RADIUS: usize = 60;
    // Travaille sur les bytes mais respecte les frontières char via
    // floor/ceil_char_boundary si nécessaire.
    let start_byte = m.start().saturating_sub(RADIUS);
    let end_byte = (m.end() + RADIUS).min(text.len());
    // Snap aux frontières char pour ne pas couper un caractère UTF-8.
    let safe_start = (0..=start_byte)
        .rev()
        .find(|i| text.is_char_boundary(*i))
        .unwrap_or(0);
    let safe_end = (end_byte..=text.len())
        .find(|i| text.is_char_boundary(*i))
        .unwrap_or(text.len());
    let mut out = String::new();
    if safe_start > 0 {
        out.push_str("[…] ");
    }
    out.push_str(&text[safe_start..safe_end]);
    if safe_end < text.len() {
        out.push_str(" […]");
    }
    out
}

/// Libellé humain pour un nom de field (ex. "biographyText" → "biographie").
pub fn friendly_field(field: &str) -> String {
    match field {
        "biographyText" => "biographie".into(),
        "descriptionText" => "description".into(),
        "description" => "description".into(),
        "summary" => "résumé".into(),
        "ideology" => "idéologie".into(),
        "origin" => "origine".into(),
        "owner" => "possesseur".into(),
        "leader" => "chef".into(),
        "domain" => "domaine".into(),
        "climate" => "climat".into(),
        "population" => "population".into(),
        "founded" => "fondation".into(),
        other => other.to_string(),
    }
}

// ---------------------------------------------------------------------------
// Tests unitaires (P15.5)
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    // ── build_word_regex ────────────────────────────────────────────

    #[test]
    fn word_regex_matches_exact_word() {
        let re = build_word_regex("Aldwen");
        assert!(re.is_match("Aldwen marche."));
        assert!(re.is_match("Le grand Aldwen sourit."));
        assert!(re.is_match("Aldwen,"));
    }

    #[test]
    fn word_regex_does_not_match_substring() {
        let re = build_word_regex("Aldwen");
        assert!(!re.is_match("Aldwendom est vaste."));
        assert!(!re.is_match("PreAldwenPost"));
    }

    #[test]
    fn word_regex_handles_unicode_accents() {
        let re = build_word_regex("Élodie");
        assert!(re.is_match("Élodie souffle."));
        assert!(!re.is_match("Élodien"));
    }

    #[test]
    fn word_regex_escapes_metacharacters() {
        // « Saint-Pierre » contient un tiret qui n'est pas un méta-char
        // mais on teste un cas plus piégeux : un nom avec un point.
        let re = build_word_regex("M. Aldwen");
        assert!(re.is_match("M. Aldwen"));
        // Le `.` ne doit PAS matcher n'importe quel caractère.
        assert!(!re.is_match("M, Aldwen"));
    }

    // ── collect_text_nodes ──────────────────────────────────────────

    #[test]
    fn collect_text_nodes_flattens_tiptap_doc() {
        let doc = json!({
            "type": "doc",
            "content": [
                {"type": "paragraph", "content": [
                    {"type": "text", "text": "Aldwen marche."},
                    {"type": "text", "text": " Puis il s'arrête."}
                ]},
                {"type": "paragraph", "content": [
                    {"type": "text", "text": "Élodie le suit."}
                ]}
            ]
        });
        let mut out = Vec::new();
        collect_text_nodes(&doc, &mut out);
        assert_eq!(
            out,
            vec![
                "Aldwen marche.".to_string(),
                " Puis il s'arrête.".to_string(),
                "Élodie le suit.".to_string(),
            ]
        );
    }

    #[test]
    fn collect_text_nodes_handles_empty_doc() {
        let doc = json!({"type": "doc", "content": []});
        let mut out = Vec::new();
        collect_text_nodes(&doc, &mut out);
        assert!(out.is_empty());
    }

    // ── rename_in_text_nodes ────────────────────────────────────────

    #[test]
    fn rename_in_text_nodes_replaces_all_occurrences() {
        let re = build_word_regex("Aldwen");
        let mut doc = json!({
            "type": "doc",
            "content": [
                {"type": "paragraph", "content": [
                    {"type": "text", "text": "Aldwen et Aldwen partent."},
                ]}
            ]
        });
        let changed = rename_in_text_nodes(&mut doc, &re, "Galore");
        assert!(changed);
        let mut texts = Vec::new();
        collect_text_nodes(&doc, &mut texts);
        assert_eq!(texts.join(""), "Galore et Galore partent.");
    }

    #[test]
    fn rename_in_text_nodes_is_idempotent() {
        let re = build_word_regex("Aldwen");
        let mut doc = json!({
            "type": "doc",
            "content": [{"type": "paragraph", "content": [
                {"type": "text", "text": "Pas de mention."},
            ]}]
        });
        let changed = rename_in_text_nodes(&mut doc, &re, "Galore");
        assert!(!changed);
    }

    #[test]
    fn rename_in_text_nodes_respects_word_boundary() {
        let re = build_word_regex("Aldwen");
        let mut doc = json!({
            "type": "doc",
            "content": [{"type": "paragraph", "content": [
                {"type": "text", "text": "Aldwen va à Aldwendom."},
            ]}]
        });
        rename_in_text_nodes(&mut doc, &re, "Galore");
        let mut texts = Vec::new();
        collect_text_nodes(&doc, &mut texts);
        assert_eq!(texts.join(""), "Galore va à Aldwendom.");
    }

    // ── rename_in_content_fields ────────────────────────────────────

    #[test]
    fn rename_in_content_fields_updates_string_field() {
        let re = build_word_regex("Aldwen");
        let mut content = json!({
            "biographyText": "Aldwen est né en 1200.",
            "archetype": "héros",
        });
        let changed =
            rename_in_content_fields(&mut content, &["biographyText".to_string()], &re, "Galore");
        assert!(changed);
        assert_eq!(
            content["biographyText"].as_str().unwrap(),
            "Galore est né en 1200."
        );
        // Le field non sélectionné est intact.
        assert_eq!(content["archetype"].as_str().unwrap(), "héros");
    }

    #[test]
    fn rename_in_content_fields_updates_tiptap_doc_field() {
        let re = build_word_regex("Aldwen");
        let mut content = json!({
            "description": {
                "type": "doc",
                "content": [{"type": "paragraph", "content": [
                    {"type": "text", "text": "Aldwen est puissant."}
                ]}]
            }
        });
        let changed =
            rename_in_content_fields(&mut content, &["description".to_string()], &re, "Galore");
        assert!(changed);
        let mut texts = Vec::new();
        collect_text_nodes(&content["description"], &mut texts);
        assert_eq!(texts.join(""), "Galore est puissant.");
    }

    #[test]
    fn rename_in_content_fields_skips_missing_field() {
        let re = build_word_regex("Aldwen");
        let mut content = json!({"archetype": "héros"});
        let changed =
            rename_in_content_fields(&mut content, &["biographyText".to_string()], &re, "Galore");
        assert!(!changed);
    }

    // ── first_excerpt ──────────────────────────────────────────────

    #[test]
    fn excerpt_returns_context_around_match() {
        let re = build_word_regex("Aldwen");
        let text =
            "Il était une fois, dans un royaume lointain, un prince nommé Aldwen qui parcourait les terres.";
        let ex = first_excerpt(text, &re);
        assert!(ex.contains("Aldwen"));
        // Doit contenir du contexte autour.
        assert!(ex.len() > "Aldwen".len());
    }

    #[test]
    fn excerpt_handles_utf8_boundaries() {
        let re = build_word_regex("Élodie");
        // « Élodie » contient des caractères multi-bytes.
        let text = "Avant Élodie, après Élodie, encore Élodie.";
        let ex = first_excerpt(text, &re);
        // Pas de panic, et l'excerpt contient au moins une occurrence.
        assert!(ex.contains("Élodie"));
    }

    #[test]
    fn excerpt_empty_when_no_match() {
        let re = build_word_regex("Inconnu");
        let text = "Aldwen marche.";
        let ex = first_excerpt(text, &re);
        assert!(ex.is_empty());
    }

    // ── friendly_field ──────────────────────────────────────────────

    #[test]
    fn friendly_field_translates_known_keys() {
        assert_eq!(friendly_field("biographyText"), "biographie");
        assert_eq!(friendly_field("ideology"), "idéologie");
        assert_eq!(friendly_field("climate"), "climat");
    }

    #[test]
    fn friendly_field_passes_through_unknown() {
        assert_eq!(friendly_field("customField"), "customField");
    }
}
