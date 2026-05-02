//! Romanesk desktop — entry point Tauri 2.
//!
//! Au démarrage :
//! 1. Résout le répertoire de données par OS (`Manager::path().app_data_dir()`).
//! 2. Crée le dossier si absent.
//! 3. Ouvre la base SQLite (avec migrations) via `romanesk_core::Database::open`.
//! 4. Stocke la `Database` en `tauri::State` partagée par toutes les commandes.
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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
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

            // Ouverture synchrone : on bloque le setup jusqu'à ce que la DB
            // soit prête, sinon une commande pourrait s'exécuter avant que
            // `app.manage(db)` ait posé la State.
            let db = tauri::async_runtime::block_on(Database::open(&db_path))
                .expect("impossible d'ouvrir la base SQLite Romanesk");

            app.manage(db);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            ping,
            commands::universe::universe_list,
            commands::universe::universe_create,
            commands::universe::universe_get,
            commands::universe::universe_delete,
            commands::entity::entity_list_in_universe,
            commands::entity::entity_create,
            commands::entity::entity_update,
            commands::entity::entity_get,
            commands::entity::entity_delete,
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
