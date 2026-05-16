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
    let safe_start = (0..=start_byte).rev().find(|i| text.is_char_boundary(*i)).unwrap_or(0);
    let safe_end = (end_byte..=text.len()).find(|i| text.is_char_boundary(*i)).unwrap_or(text.len());
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
