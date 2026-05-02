//! Smoke test manuel : ping un serveur Ollama local et lui demande
//! « Bonjour ». Prouve que la chaîne `crates/core::ai::OllamaProvider`
//! tient debout côté HTTP.
//!
//! Pré-requis :
//! - Ollama tourne sur `http://localhost:11434` (commande : `ollama serve`).
//! - Un modèle est chargé (par défaut `gemma:latest`, surchargeable via
//!   la variable d'environnement `OLLAMA_MODEL`).
//!
//! Lancer :
//!
//! ```bash
//! cargo run -p romanesk-core --example ping_ollama
//! # ou avec un modèle custom :
//! OLLAMA_MODEL=llama3.2:latest cargo run -p romanesk-core --example ping_ollama
//! ```
//!
//! Codes de sortie :
//! - 0 : tout va bien.
//! - 1 : Ollama injoignable (pas démarré, mauvais port).
//! - 2 : Ollama joint mais la complétion a échoué (modèle absent, etc.).

use std::env;
use std::process::ExitCode;

use romanesk_core::ai::{
    CompletionRequest, Message, OllamaConfig, OllamaProvider, Provider, Role,
};

#[tokio::main(flavor = "current_thread")]
async fn main() -> ExitCode {
    let model = env::var("OLLAMA_MODEL").unwrap_or_else(|_| "gemma:latest".into());
    let base_url =
        env::var("OLLAMA_BASE_URL").unwrap_or_else(|_| "http://localhost:11434".into());

    println!("Romanesk · ping Ollama");
    println!("  base_url = {base_url}");
    println!("  model    = {model}");
    println!();

    let provider = OllamaProvider::new(OllamaConfig {
        base_url: base_url.clone(),
        default_model: model.clone(),
        ..Default::default()
    });

    // 1. Healthcheck (GET /api/tags).
    print!("[1/2] Healthcheck... ");
    match provider.ping().await {
        Ok(()) => println!("OK"),
        Err(err) => {
            println!("ECHEC");
            eprintln!();
            eprintln!("Ollama ne répond pas sur {base_url}.");
            eprintln!("  Détail : {err}");
            eprintln!();
            eprintln!("Vérifie que `ollama serve` tourne et que le port est bien 11434.");
            return ExitCode::from(1);
        }
    }

    // 2. Complétion réelle.
    print!("[2/2] Complétion (« Bonjour »)... ");
    let req = CompletionRequest {
        // model vide → le provider utilise default_model.
        model: String::new(),
        messages: vec![Message {
            role: Role::User,
            content: "Bonjour ! Présente-toi en une seule phrase, en français.".into(),
        }],
        max_tokens: Some(150),
        temperature: Some(0.7),
        stop: Vec::new(),
        json_schema: None,
    };

    match provider.complete(req).await {
        Ok(res) => {
            println!("OK");
            println!();
            println!("Réponse de `{}` :", res.model);
            println!("{}", textwrap_indent(&res.content, "  "));
            if let Some(usage) = res.usage {
                println!();
                println!(
                    "  → {} prompt + {} completion = {} tokens",
                    usage.prompt_tokens, usage.completion_tokens, usage.total_tokens
                );
            }
            if let Some(reason) = res.finish_reason {
                println!("  → finish_reason = {reason}");
            }
            ExitCode::SUCCESS
        }
        Err(err) => {
            println!("ECHEC");
            eprintln!();
            eprintln!("La complétion a échoué.");
            eprintln!("  Détail : {err}");
            eprintln!();
            eprintln!("Suggestions :");
            eprintln!("  - vérifier que le modèle `{model}` est bien tiré : `ollama pull {model}`");
            eprintln!("  - lister les modèles dispos : `ollama list`");
            ExitCode::from(2)
        }
    }
}

/// Indente chaque ligne d'un texte multilignes par un préfixe.
#[must_use]
fn textwrap_indent(text: &str, prefix: &str) -> String {
    text.lines()
        .map(|l| format!("{prefix}{l}"))
        .collect::<Vec<_>>()
        .join("\n")
}
