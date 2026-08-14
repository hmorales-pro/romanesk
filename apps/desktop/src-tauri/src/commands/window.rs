//! Fermeture différée de la fenêtre (P16.3).
//!
//! L'éditeur de chapitre enregistre en différé (debounce). Fermer la
//! fenêtre pendant ce délai perdait la frappe : rien n'interceptait la
//! fermeture, ni côté WebView ni côté Tauri.
//!
//! Le protocole est en trois temps :
//!
//! 1. `WindowEvent::CloseRequested` (posé dans `lib.rs`) appelle
//!    `api.prevent_close()` et émet [`CLOSE_REQUESTED_EVENT`] au front.
//! 2. Le front vide ses sauvegardes en attente, puis invoque
//!    [`close_confirmed`].
//! 3. La commande appelle `window.destroy()`, qui ferme sans repasser
//!    par `CloseRequested` — pas de boucle.
//!
//! Un filet de sécurité vit dans `lib.rs` : si le front ne répond pas
//! sous [`CLOSE_GRACE_MS`], la fenêtre est détruite quand même. Une
//! fenêtre qu'on ne peut plus fermer serait un défaut pire que celui
//! qu'on corrige.

use tauri::{Manager, Window};

/// Event émis au front quand l'utilisateur demande la fermeture.
pub const CLOSE_REQUESTED_EVENT: &str = "app-close-requested";

/// Délai maximum accordé au front pour vider ses sauvegardes avant
/// fermeture forcée. Généreux au regard d'un `INSERT` SQLite local
/// (quelques millisecondes), assez court pour ne pas donner l'impression
/// que l'app est figée.
pub const CLOSE_GRACE_MS: u64 = 3_000;

/// Le front a fini de vider ses sauvegardes : on peut fermer.
///
/// `destroy()` plutôt que `close()` — `close()` réémettrait
/// `CloseRequested` et on tournerait en rond.
#[tauri::command]
pub fn close_confirmed(window: Window) {
    tracing::info!("Fermeture confirmée par le front, destruction de la fenêtre");
    for (label, w) in window.app_handle().webview_windows() {
        if let Err(e) = w.destroy() {
            tracing::warn!(%label, error = %e, "échec destruction de la fenêtre");
        }
    }
}
