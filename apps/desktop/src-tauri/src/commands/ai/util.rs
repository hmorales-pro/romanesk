//! Helpers de bas niveau utilisés par plusieurs sous-modules :
//! libellés provider, normalisation, troncature, préfixes embed.

use std::sync::Arc;

use romanesk_core::ai::{Provider, ProviderId};

fn with_embed_prefix(model: &str, text: &str, is_query: bool) -> String {
    let m = model.to_lowercase();
    if m.starts_with("nomic-embed") {
        if is_query {
            format!("search_query: {text}")
        } else {
            format!("search_document: {text}")
        }
    } else {
        text.to_string()
    }
}

fn truncate(s: &str, n: usize) -> String {
    if s.chars().count() <= n {
        s.to_string()
    } else {
        let mut out: String = s.chars().take(n).collect();
        out.push('…');
        out
    }
}

fn provider_id_label(id: &ProviderId) -> String {
    match id {
        ProviderId::Ollama => "ollama".into(),
        ProviderId::Anthropic => "anthropic".into(),
        ProviderId::OpenAi => "openai".into(),
        ProviderId::Gemini => "gemini".into(),
        ProviderId::Mistral => "mistral".into(),
        ProviderId::Custom(name) => name.clone(),
    }
}

/// Le trait `Provider` n'expose pas le default_model directement (ce n'est
/// pas dans son contrat). On fait du best-effort : on tente une complétion
/// vide pour récupérer le `model` retourné. En P3.2+ on stockera
/// explicitement le default_model dans la State.
fn default_model_label(_provider: &Arc<dyn Provider>) -> String {
    // Compromis : on ne déclenche pas de requête réseau ici (le caller
    // appelle ai_ping qui peut être hors-ligne). On affiche juste l'id.
    "default".into()
}
