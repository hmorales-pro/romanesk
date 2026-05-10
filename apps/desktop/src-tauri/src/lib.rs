//! Romanesk desktop — entry point Tauri 2.
//!
//! Au démarrage :
//! 1. Initialise le subscriber `tracing` (verbosité contrôlée par `RUST_LOG`).
//! 2. Pose un panic hook qui logue avant de laisser le process mourir.
//! 3. Résout le répertoire de données par OS (`Manager::path().app_data_dir()`).
//! 4. Crée le dossier si absent.
//! 5. Ouvre la base SQLite (avec migrations) via `romanesk_core::Database::open`.
//! 6. Stocke la `Database` en `tauri::State` partagée par toutes les commandes.
//!
//! Les commandes elles-mêmes vivent dans le module `commands::*` ; ce
//! fichier les enregistre via `tauri::generate_handler!`.
//!
//! Phase 0 : assouplissement de quelques lints pedantic, à durcir en Phase 1.

#![allow(clippy::missing_errors_doc)]
#![allow(clippy::missing_panics_doc)]
#![allow(clippy::future_not_send)]

mod commands;

use std::sync::Arc;

use chrono::Utc;
use romanesk_core::ai::{OllamaConfig, OllamaProvider};
use romanesk_core::Database;
use serde::Serialize;
use tauri::Manager;
use tracing_subscriber::{fmt, prelude::*, EnvFilter};

use commands::ai::{AiEmbedder, AiProvider};
use commands::settings::AppSettings;

#[derive(Debug, Serialize)]
pub struct PingResult {
    pub message: &'static str,
    pub echoed_at: String,
}

/// Healthcheck minimal du pont Rust ↔ TypeScript. Conservé depuis J2.
#[tauri::command]
fn ping() -> PingResult {
    PingResult {
        message: "pong",
        echoed_at: Utc::now().to_rfc3339(),
    }
}

/// Initialise le système de logging structuré.
///
/// La verbosité par défaut est `info` ; surchargeable via la variable
/// `RUST_LOG` (ex. `RUST_LOG=debug` pour voir tout, `RUST_LOG=romanesk_core=trace`
/// pour cibler un module). Format compact, lisible côté terminal de dev
/// et côté logs Tauri en production.
fn init_tracing() {
    let env_filter = EnvFilter::try_from_default_env()
        .unwrap_or_else(|_| EnvFilter::new("info,romanesk_core=info,romanesk_desktop_lib=info"));

    tracing_subscriber::registry()
        .with(env_filter)
        .with(fmt::layer().with_target(true).compact())
        .init();
}

/// Pose un panic hook qui logue le panic via `tracing::error` avant que
/// le process meure. Préserve le hook par défaut pour garder le backtrace
/// stderr habituel.
fn install_panic_hook() {
    let prev = std::panic::take_hook();
    std::panic::set_hook(Box::new(move |info| {
        let location = info
            .location()
            .map(|l| format!("{}:{}:{}", l.file(), l.line(), l.column()));
        tracing::error!(
            location = location.as_deref().unwrap_or("<unknown>"),
            payload = %panic_payload_message(info),
            "Romanesk panicked"
        );
        prev(info);
    }));
}

fn panic_payload_message(info: &std::panic::PanicHookInfo<'_>) -> String {
    if let Some(s) = info.payload().downcast_ref::<&str>() {
        (*s).to_string()
    } else if let Some(s) = info.payload().downcast_ref::<String>() {
        s.clone()
    } else {
        "(non-string panic payload)".to_string()
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    init_tracing();
    install_panic_hook();
    tracing::info!("Romanesk desktop démarre");

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .setup(|app| {
            // Résolution du répertoire de données par OS :
            // - macOS  : ~/Library/Application Support/app.romanesk.desktop/
            // - Linux  : ~/.local/share/app.romanesk.desktop/
            // - Windows: %APPDATA%\app.romanesk.desktop\
            let app_data_dir = app
                .path()
                .app_data_dir()
                .expect("plateforme sans répertoire de données disponible");

            std::fs::create_dir_all(&app_data_dir)
                .expect("impossible de créer le répertoire de données Romanesk");

            let db_path = app_data_dir.join("romanesk.db");
            tracing::info!(?db_path, "Ouverture de la base SQLite");

            // Ouverture synchrone : on bloque le setup jusqu'à ce que la DB
            // soit prête, sinon une commande pourrait s'exécuter avant que
            // `app.manage(db)` ait posé la State.
            let db = tauri::async_runtime::block_on(Database::open(&db_path))
                .expect("impossible d'ouvrir la base SQLite Romanesk");

            app.manage(db);

            // Provider IA — Phase 3.1 : Ollama hardcoded sur localhost:11434
            // avec modèle gemma3:latest. Configuration dynamique en P3.2+.
            // Settings IA chargées depuis app_data_dir/settings.json,
            // env vars overridables. Priorité : env > settings.json > defaults.
            let settings = AppSettings::load(&app_data_dir);
            tracing::info!(
                ollama = %settings.ollama_base_url,
                chat = %settings.chat_model,
                embed = %settings.embed_model,
                "AI settings chargés"
            );

            let chat_provider = OllamaProvider::new(OllamaConfig {
                base_url: settings.ollama_base_url.clone(),
                default_model: settings.chat_model.clone(),
                capabilities: romanesk_core::ai::Capabilities {
                    text: true,
                    vision: false,
                    embeddings: false,
                    tool_use: false,
                    long_context: true,
                },
            });
            let embed_provider = OllamaProvider::new(OllamaConfig {
                base_url: settings.ollama_base_url.clone(),
                default_model: settings.embed_model.clone(),
                capabilities: romanesk_core::ai::Capabilities {
                    text: false,
                    vision: false,
                    embeddings: true,
                    tool_use: false,
                    long_context: false,
                },
            });

            app.manage(AiProvider::from_provider(Arc::new(chat_provider)));
            app.manage(AiEmbedder::from_parts(
                Arc::new(embed_provider),
                settings.embed_model.clone(),
            ));
            tracing::info!("Setup terminé, base prête, providers IA initialisés");
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            ping,
            commands::universe::universe_list,
            commands::universe::universe_create,
            commands::universe::universe_update,
            commands::universe::universe_get,
            commands::universe::universe_delete,
            commands::universe::universe_export_markdown,
            commands::entity::entity_list_in_universe,
            commands::entity::entity_create,
            commands::entity::entity_update,
            commands::entity::entity_get,
            commands::entity::entity_delete,
            commands::entity::entity_set_cover_image,
            commands::entity::entity_get_cover_image_data,
            commands::entity::entity_clear_cover_image,
            commands::rename::entity_find_mentions,
            commands::rename::entity_rename_in_universe,
            commands::merge::entity_merge,
            commands::relation::relation_create,
            commands::relation::relation_list_for_entity,
            commands::relation::relation_list_in_universe,
            commands::relation::relation_delete,
            commands::tag::tag_create_in_universe,
            commands::tag::tag_list_in_universe,
            commands::tag::tag_associations_in_universe,
            commands::tag::tag_get_for_entity,
            commands::tag::tag_set_for_entity,
            commands::tag::tag_delete,
            commands::era::era_create,
            commands::era::era_list_in_universe,
            commands::era::era_get,
            commands::era::era_update,
            commands::era::era_delete,
            commands::event::event_create,
            commands::event::event_list_in_universe,
            commands::event::event_list_in_era,
            commands::event::event_get,
            commands::event::event_update,
            commands::event::event_delete,
            commands::snapshot::snapshot_create,
            commands::snapshot::snapshot_list_for_entity,
            commands::snapshot::snapshot_get,
            commands::snapshot::snapshot_delete,
            commands::ai::ai_ping,
            commands::ai::ai_list_models,
            commands::ai::ai_pull_model,
            commands::ai::ai_delete_model,
            commands::ai::ai_complete,
            commands::ai::ai_generate_entity_draft,
            commands::ai::ai_describe_image,
            commands::ai::ai_analyze_import,
            commands::ai::ai_analyze_import_stream,
            commands::ai::ai_universe_reindex,
            commands::ai::ai_rag_query,
            commands::anchor::anchor_get_for_universe,
            commands::anchor::anchor_upsert,
            commands::anchor::anchor_delete,
            commands::anchor::divergence_create,
            commands::anchor::divergence_list,
            commands::anchor::divergence_delete,
            commands::anchor::brief_create,
            commands::anchor::brief_list,
            commands::anchor::brief_delete,
            commands::settings::settings_get,
            commands::settings::settings_save,
            commands::story::story_create,
            commands::story::story_list_in_universe,
            commands::story::story_get,
            commands::story::story_update,
            commands::story::story_delete,
            commands::story::story_export_markdown,
            commands::import::import_apply,
            commands::chapter::chapter_create,
            commands::chapter::chapter_list_for_story,
            commands::chapter::chapter_get,
            commands::chapter::chapter_update,
            commands::chapter::chapter_reorder,
            commands::chapter::chapter_delete,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ping_returns_pong() {
        let p = ping();
        assert_eq!(p.message, "pong");
        // ISO-8601 round-trip basique : doit contenir un T (séparateur date/heure).
        assert!(p.echoed_at.contains('T'));
    }
}
