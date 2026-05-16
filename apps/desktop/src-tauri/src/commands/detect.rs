//! Détection passive de noms propres absents du lore (P11.2).
//!
//! Pendant la rédaction d'un chapitre, l'auteur introduit naturellement
//! de nouveaux noms propres (personnages mentionnés en passant, lieux,
//! factions évoquées). L'app les détecte et propose à l'auteur, dans
//! le panneau sparring, de créer la fiche correspondante — sans
//! interrompre l'écriture.
//!
//! Heuristique :
//!   1. Extraire le texte plat du `body_json` (Tiptap).
//!   2. Tokeniser et détecter les mots capitalisés (unicode-aware).
//!   3. Ignorer les premiers mots de phrase (souvent un article ou
//!      le sujet d'attaque), les stop-words FR/EN courants, les
//!      acronymes très courts (< 3 lettres).
//!   4. Comparer avec la liste des entités de l'univers — match
//!      normalisé NFD + lowercase pour ne pas dépendre des accents.
//!   5. Renvoyer la liste des noms inconnus avec leur fréquence et
//!      un extrait de contexte.

use std::collections::{HashMap, HashSet};

use regex::Regex;
use romanesk_core::{Database, Repo};
use serde::Serialize;
use tauri::State;
use uuid::Uuid;

use super::rename::{collect_text_nodes, first_excerpt};
use super::{CommandError, CommandResult};

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct UnknownName {
    /// Le nom propre tel qu'il apparaît dans le texte (forme canonique :
    /// la plus fréquente parmi les variantes accentuées ou non).
    pub name: String,
    /// Nombre d'occurrences dans le chapitre.
    pub occurrences: usize,
    /// Court extrait avec [...] autour de la première occurrence.
    pub excerpt: String,
}

/// Détecte les noms propres présents dans le chapitre mais absents
/// du lore de l'univers correspondant.
#[tauri::command]
pub async fn chapter_detect_unknown_names(
    db: State<'_, Database>,
    chapter_id: String,
) -> CommandResult<Vec<UnknownName>> {
    let chapter_uuid = Uuid::parse_str(&chapter_id).map_err(CommandError::InvalidUuid)?;

    let repo = Repo::new(db.inner().clone());
    let chapter = repo
        .chapters()
        .get(chapter_uuid)
        .await?
        .ok_or_else(|| CommandError::Other("chapter introuvable".into()))?;

    // Remonter à l'univers via la story.
    let story = repo
        .stories()
        .get(chapter.story_id)
        .await?
        .ok_or_else(|| CommandError::Other("story introuvable".into()))?;
    // Story.universe_id est Option<Uuid> (une story peut exister sans
    // univers attaché — cas legacy ou stand-alone). Sans univers, on
    // ne peut pas matcher les noms contre un lore → on renvoie une
    // liste vide silencieusement plutôt que de planter.
    let Some(universe_id) = story.universe_id else {
        return Ok(Vec::new());
    };
    let entities = repo.entities().list_in_universe(universe_id, None).await?;

    // Index des noms d'entités, normalisés pour matching tolérant.
    let mut known: HashSet<String> = HashSet::new();
    for ent in &entities {
        known.insert(normalize_for_match(&ent.name));
    }

    // Texte plat du chapitre.
    let mut texts = Vec::new();
    collect_text_nodes(&chapter.body_json, &mut texts);
    let body_text = texts.join("\n");

    let candidates = extract_proper_noun_candidates(&body_text);

    // Agrégation : pour chaque candidat, on garde la forme la plus
    // fréquente (la première rencontrée en cas d'égalité), le total
    // d'occurrences et l'extrait du premier match.
    let mut acc: HashMap<String, (String, usize)> = HashMap::new();
    for cand in &candidates {
        let key = normalize_for_match(cand);
        if known.contains(&key) {
            continue;
        }
        // Filtre supplémentaire : on saute les stop-words connus.
        if is_stop_word(cand) {
            continue;
        }
        let entry = acc.entry(key).or_insert_with(|| (cand.clone(), 0));
        entry.1 += 1;
    }

    let mut out: Vec<UnknownName> = acc
        .into_iter()
        .map(|(_key, (name, occurrences))| {
            // Regex échappée pour l'excerpt — `name` peut contenir des
            // caractères spéciaux mais c'est rare ici.
            let re = Regex::new(&format!(r"(?u)\b{}\b", regex::escape(&name)))
                .expect("valid regex from name");
            let excerpt = first_excerpt(&body_text, &re);
            UnknownName {
                name,
                occurrences,
                excerpt,
            }
        })
        .collect();

    // Tri : par fréquence décroissante, puis par nom (stable).
    out.sort_by(|a, b| {
        b.occurrences
            .cmp(&a.occurrences)
            .then_with(|| a.name.cmp(&b.name))
    });

    Ok(out)
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/// Extrait les candidats noms propres : mots commençant par une majuscule
/// (unicode), filtrés pour ignorer le premier mot de chaque phrase.
fn extract_proper_noun_candidates(text: &str) -> Vec<String> {
    // Token : suite de lettres unicode (majuscules + minuscules + accents),
    // possiblement avec apostrophes ou tirets internes. On capture aussi
    // les acronymes ("IA", "ONU").
    let token_re = Regex::new(r"(?u)\b[\p{L}][\p{L}\p{M}'\-]*\b").expect("token regex");
    // Détecteur de fin de phrase — point, point d'exclamation, point
    // d'interrogation, points de suspension.
    let sentence_end = Regex::new(r"[.!?…]").expect("sentence regex");

    let mut out = Vec::new();
    let mut at_sentence_start = true;
    let mut last_end = 0usize;

    for m in token_re.find_iter(text) {
        // Toute ponctuation entre last_end et m.start() qui contient un
        // marqueur de fin de phrase repositionne at_sentence_start.
        let between = &text[last_end..m.start()];
        if sentence_end.is_match(between) {
            at_sentence_start = true;
        }

        let tok = m.as_str();
        let first = tok.chars().next().expect("non-empty token");
        let is_capitalized = first.is_uppercase();

        if is_capitalized && !at_sentence_start && tok.chars().count() >= 3 {
            out.push(tok.to_string());
        }

        // Tout token consomme l'état "début de phrase".
        at_sentence_start = false;
        last_end = m.end();
    }

    out
}

/// Normalisation : lowercase + strip accents (NFD) pour comparer
/// « Élodie » et « elodie ».
///
/// On décompose en NFD (chaque caractère accentué devient base + diacritique
/// combinant) puis on supprime tous les diacritiques combinants Unicode
/// (range U+0300..U+036F, qui couvre les Combining Diacritical Marks). Ça
/// gère le français, l'espagnol, l'allemand, les langues romanes — pas le
/// vietnamien (combining marks au-delà) mais suffisant pour l'usage actuel.
fn normalize_for_match(s: &str) -> String {
    use unicode_normalization::UnicodeNormalization;
    s.nfd()
        .filter(|c| !matches!(*c, '\u{0300}'..='\u{036F}'))
        .collect::<String>()
        .to_lowercase()
}

/// Stop-words à exclure même s'ils passent le filtre "capitalisé pas
/// en début de phrase". Inclut les titres courants et quelques connecteurs
/// que les auteurs capitalisent parfois.
fn is_stop_word(s: &str) -> bool {
    const STOPS: &[&str] = &[
        // Titres / formes d'adresse
        "Monsieur",
        "Madame",
        "Mademoiselle",
        "Mister",
        "Mrs",
        "Miss",
        "Doctor",
        "Docteur",
        "Maitre",
        "Maître",
        "Sire",
        "Lord",
        "Lady",
        // Jours / mois (rarement des noms de fiches)
        "Lundi",
        "Mardi",
        "Mercredi",
        "Jeudi",
        "Vendredi",
        "Samedi",
        "Dimanche",
        "Janvier",
        "Février",
        "Mars",
        "Avril",
        "Mai",
        "Juin",
        "Juillet",
        "Août",
        "Septembre",
        "Octobre",
        "Novembre",
        "Décembre",
        "January",
        "February",
        "March",
        "April",
        "May",
        "June",
        "July",
        "August",
        "September",
        "October",
        "November",
        "December",
        "Monday",
        "Tuesday",
        "Wednesday",
        "Thursday",
        "Friday",
        "Saturday",
        "Sunday",
        // Connecteurs / interjections fréquemment capitalisés en dialogue
        "Oui",
        "Non",
        "Bien",
        "Bon",
        "Yes",
        "No",
        "Well",
        "Right",
    ];
    let lower = s.to_lowercase();
    STOPS.iter().any(|w| w.to_lowercase() == lower)
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extracts_capitalized_words_not_at_sentence_start() {
        let cands = extract_proper_noun_candidates(
            "Aldwen marche dans la forêt. Élodie l'attend près du Cratère.",
        );
        // « Aldwen » et « Élodie » sont en début de phrase → ignorés.
        // « Cratère » est milieu de phrase, capitalisé → gardé.
        assert_eq!(cands, vec!["Cratère".to_string()]);
    }

    #[test]
    fn extracts_capitalized_in_middle_after_comma() {
        let cands = extract_proper_noun_candidates(
            "Le matin venu, Aldwen rencontra Élodie au bord du fleuve.",
        );
        // « Le » est en début de phrase, donc ignoré.
        // « Aldwen » et « Élodie » sont en milieu de phrase → gardés.
        assert!(cands.contains(&"Aldwen".to_string()));
        assert!(cands.contains(&"Élodie".to_string()));
    }

    #[test]
    fn ignores_short_acronyms_under_3_chars() {
        let cands = extract_proper_noun_candidates("Ils utilisent IA et UE pour gouverner.");
        // Filtre minimum 3 chars → IA et UE exclus.
        assert!(!cands.contains(&"IA".to_string()));
        assert!(!cands.contains(&"UE".to_string()));
    }

    #[test]
    fn stop_words_filter() {
        assert!(is_stop_word("Monsieur"));
        assert!(is_stop_word("Lundi"));
        assert!(is_stop_word("Avril"));
        assert!(!is_stop_word("Aldwen"));
    }

    #[test]
    fn normalize_strips_accents() {
        assert_eq!(normalize_for_match("Élodie"), "elodie");
        assert_eq!(normalize_for_match("Saint-Pierre"), "saint-pierre");
        assert_eq!(normalize_for_match("ALDWEN"), "aldwen");
    }
}
