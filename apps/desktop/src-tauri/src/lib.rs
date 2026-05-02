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

use chrono::Utc;
use romanesk_core::Database;
use serde::Serialize;
use tauri::Manager;
use tracing_subscriber::{fmt, prelude::*, EnvFilter};

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
            tracing::info!("Setup terminé, base prête");
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            ping,
            commands::universe::universe_list,
            commands::universe::universe_create,
            commands::universe::universe_get,
            commands::universe::universe_delete,
            commands::universe::universe_export_markdown,
            commands::entity::entity_list_in_universe,
            commands::entity::entity_create,
            commands::entity::entity_update,
            commands::entity::entity_get,
            commands::entity::entity_delete,
            commands::relation::relation_create,
            commands::relation::relation_list_for_entity,
            commands::relation::relation_list_in_universe,
            commands::relation::relation_delete,
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
