//! Romanesk desktop — entry point Tauri 2.
//!
//! La séparation `main.rs` / `lib.rs` est la convention Tauri 2 :
//! - `main.rs` est l'entrée du binaire desktop ;
//! - `lib.rs` (ce fichier) expose `run()`, qui est aussi l'entrée mobile
//!   (via `#[cfg_attr(mobile, tauri::mobile_entry_point)]`) — utile en P5+
//!   pour la *companion app* lecture-seule mentionnée dans le PRD §15.
//!
//! Phase 0 — J2 : on n'expose qu'une commande `ping` qui prouve l'aller-retour
//! Rust ↔ TypeScript. Les vraies commandes métier (`universe_create`,
//! `entity_create`…) viendront en J6-7 via `crates/core::Repo`.

use chrono::Utc;
use serde::Serialize;

#[derive(Debug, Serialize)]
pub struct PingResult {
    pub message: &'static str,
    pub echoed_at: String,
}

/// Healthcheck minimal : prouve que le pont Tauri (commands) fonctionne.
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
        .invoke_handler(tauri::generate_handler![ping])
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
