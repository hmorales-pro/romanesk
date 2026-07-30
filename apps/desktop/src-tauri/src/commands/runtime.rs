//! Commandes Tauri du runtime Ollama managé (P17).
//!
//! Le front interroge `runtime_status` pour connaître l'URL effective du
//! serveur IA (Ollama système ou runtime managé) et l'état d'installation,
//! déclenche `runtime_download` (progrès via l'event
//! `runtime-download-progress`) puis `runtime_start`. Les providers IA
//! sont rebasculés sur l'URL effective à chaque changement d'état.

use serde::Serialize;
use tauri::{Emitter, Manager, State};

use super::ai::{AiEmbedder, AiProvider};
use super::settings::{rebuild_providers, AppSettings, OllamaMode};
use super::{CommandError, CommandResult};
use crate::runtime::{self, RuntimeManager};

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeStatus {
    /// Mode configuré : "auto" | "system" | "managed".
    pub mode: OllamaMode,
    /// Le binaire managé est présent sur le disque.
    pub managed_installed: bool,
    /// Version du runtime managé installé (manifest.json, backfill via
    /// `ollama --version` pour les installations pré-manifest). `None`
    /// si non installé ou version indéterminable.
    pub managed_version: Option<String>,
    /// Le runtime managé répond sur son port privé.
    pub managed_running: bool,
    /// L'Ollama système (URL des settings) répond.
    pub system_reachable: bool,
    /// L'URL effectivement utilisée par les providers IA.
    pub effective_base_url: String,
    /// Vrai si l'URL effective est celle du runtime managé.
    pub managed_active: bool,
    /// Modèle de chat conseillé pour cette machine (selon la RAM).
    pub recommended_chat_model: String,
    /// RAM totale détectée, pour affichage ("16 Go détectés").
    pub total_mem_gb: Option<u64>,
}

/// Résout l'URL effective du serveur IA selon le mode et l'état réel.
pub async fn effective_base_url(settings: &AppSettings, mgr: &RuntimeManager) -> String {
    match settings.ollama_mode {
        OllamaMode::System => settings.ollama_base_url.clone(),
        OllamaMode::Managed => runtime::managed_base_url(),
        OllamaMode::Auto => {
            if runtime::probe(&settings.ollama_base_url).await {
                settings.ollama_base_url.clone()
            } else if mgr.owns_running_child().await
                || runtime::probe(&runtime::managed_base_url()).await
            {
                runtime::managed_base_url()
            } else {
                settings.ollama_base_url.clone()
            }
        }
    }
}

/// Applique la politique du mode courant (démarre/arrête le runtime
/// managé si nécessaire) et retourne l'URL effective. Appelé au setup,
/// après `settings_save` et après `runtime_start`.
pub async fn apply_runtime_policy(app: &tauri::AppHandle, settings: &AppSettings) -> String {
    let mgr = app.state::<RuntimeManager>();
    match settings.ollama_mode {
        OllamaMode::System => {
            // L'utilisateur gère son Ollama : on libère le nôtre.
            mgr.stop().await;
        }
        OllamaMode::Managed => {
            if mgr.is_installed() {
                if let Err(e) = mgr.start().await {
                    tracing::warn!(error = %e, "démarrage du runtime managé impossible");
                }
            }
        }
        OllamaMode::Auto => {
            // On ne démarre le managé que si l'Ollama système ne répond pas.
            if !runtime::probe(&settings.ollama_base_url).await && mgr.is_installed() {
                if let Err(e) = mgr.start().await {
                    tracing::warn!(error = %e, "démarrage auto du runtime managé impossible");
                }
            }
        }
    }
    effective_base_url(settings, &mgr).await
}

/// Séquence de démarrage IA de l'app : applique la politique du mode,
/// pointe les providers sur l'URL effective, notifie le front. Lancée en
/// tâche async depuis le `setup()` Tauri pour ne pas bloquer l'ouverture
/// de la fenêtre.
pub async fn startup(app: tauri::AppHandle) {
    let Ok(dir) = app.path().app_data_dir() else {
        tracing::warn!("app_data_dir indisponible — startup runtime IA sauté");
        return;
    };
    let settings = AppSettings::load(&dir);
    let effective = apply_runtime_policy(&app, &settings).await;

    let chat_state = app.state::<AiProvider>();
    let embed_state = app.state::<AiEmbedder>();
    rebuild_providers(&chat_state, &embed_state, &settings, &effective).await;
    tracing::info!(%effective, mode = ?settings.ollama_mode, "Runtime IA résolu au démarrage");

    if let Err(e) = app.emit(runtime::CHANGED_EVENT, ()) {
        tracing::warn!(error = %e, "échec emit runtime-changed");
    }
}

async fn build_status(app: &tauri::AppHandle) -> CommandResult<RuntimeStatus> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| CommandError::Other(format!("app_data_dir unavailable: {e}")))?;
    let settings = AppSettings::load(&dir);
    let mgr = app.state::<RuntimeManager>();

    let managed_running =
        mgr.owns_running_child().await || runtime::probe(&runtime::managed_base_url()).await;
    let system_reachable = runtime::probe(&settings.ollama_base_url).await;
    let effective = effective_base_url(&settings, &mgr).await;
    let managed_active = effective == runtime::managed_base_url();

    Ok(RuntimeStatus {
        mode: settings.ollama_mode,
        managed_installed: mgr.is_installed(),
        managed_version: mgr.installed_version(),
        managed_running,
        system_reachable,
        effective_base_url: effective,
        managed_active,
        recommended_chat_model: runtime::recommended_chat_model(),
        total_mem_gb: runtime::total_memory_gb(),
    })
}

#[tauri::command]
pub async fn runtime_status(app: tauri::AppHandle) -> CommandResult<RuntimeStatus> {
    build_status(&app).await
}

/// Télécharge et installe le runtime Ollama managé. Le progrès est
/// diffusé via l'event `runtime-download-progress`.
#[tauri::command]
pub async fn runtime_download(app: tauri::AppHandle) -> CommandResult<()> {
    runtime::download_runtime(&app).await.map_err(CommandError::Other)
}

/// Démarre le runtime managé et rebascule les providers IA dessus.
#[tauri::command]
pub async fn runtime_start(
    app: tauri::AppHandle,
    chat_state: State<'_, AiProvider>,
    embed_state: State<'_, AiEmbedder>,
) -> CommandResult<RuntimeStatus> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| CommandError::Other(format!("app_data_dir unavailable: {e}")))?;
    let settings = AppSettings::load(&dir);

    {
        let mgr = app.state::<RuntimeManager>();
        mgr.start().await.map_err(CommandError::Other)?;
    }

    let effective = {
        let mgr = app.state::<RuntimeManager>();
        effective_base_url(&settings, &mgr).await
    };
    rebuild_providers(&chat_state, &embed_state, &settings, &effective).await;
    if let Err(e) = app.emit(runtime::CHANGED_EVENT, ()) {
        tracing::warn!(error = %e, "échec emit runtime-changed");
    }
    build_status(&app).await
}
