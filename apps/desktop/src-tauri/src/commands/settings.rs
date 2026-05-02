//! Settings application : config Ollama (URL + modèles).
//!
//! Stockage dans `<app_data_dir>/settings.json` (pas de table SQL,
//! évite une migration et c'est trivial à inspecter / éditer à la main).
//!
//! Phase 5 (P5.3) : sauvegarde reconstruit les providers IA dans les
//! States Tauri (`AiProvider`, `AiEmbedder`) sans redémarrer l'app.
//! Les commandes IA snapshotent la valeur courante au début de leur
//! exécution, donc le hot-swap est transparent côté call-site.

use std::path::PathBuf;
use std::sync::Arc;

use romanesk_core::ai::{Capabilities, OllamaConfig, OllamaProvider};
use serde::{Deserialize, Serialize};
use tauri::{Manager, State};

use super::ai::{AiEmbedder, AiProvider};
use super::{CommandError, CommandResult};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppSettings {
    pub ollama_base_url: String,
    pub chat_model: String,
    pub embed_model: String,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            ollama_base_url: "http://localhost:11434".into(),
            chat_model: "gemma4:e2b".into(),
            embed_model: "nomic-embed-text:latest".into(),
        }
    }
}

impl AppSettings {
    /// Charge les settings depuis `<app_data_dir>/settings.json` ou retourne
    /// les défauts si le fichier n'existe pas. Les variables d'env ont
    /// priorité (utile pour CI / scripts) :
    /// `OLLAMA_BASE_URL`, `OLLAMA_MODEL`, `OLLAMA_EMBED_MODEL`.
    pub fn load(app_data_dir: &std::path::Path) -> Self {
        let path = settings_path(app_data_dir);
        let from_disk = std::fs::read_to_string(&path)
            .ok()
            .and_then(|s| serde_json::from_str::<Self>(&s).ok())
            .unwrap_or_default();

        Self {
            ollama_base_url: std::env::var("OLLAMA_BASE_URL")
                .unwrap_or(from_disk.ollama_base_url),
            chat_model: std::env::var("OLLAMA_MODEL").unwrap_or(from_disk.chat_model),
            embed_model: std::env::var("OLLAMA_EMBED_MODEL")
                .unwrap_or(from_disk.embed_model),
        }
    }

    pub fn save(&self, app_data_dir: &std::path::Path) -> std::io::Result<()> {
        std::fs::create_dir_all(app_data_dir)?;
        let path = settings_path(app_data_dir);
        let json = serde_json::to_string_pretty(self)
            .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e))?;
        std::fs::write(path, json)
    }
}

fn settings_path(app_data_dir: &std::path::Path) -> PathBuf {
    app_data_dir.join("settings.json")
}

#[tauri::command]
pub async fn settings_get(app: tauri::AppHandle) -> CommandResult<AppSettings> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| CommandError::Other(format!("app_data_dir unavailable: {e}")))?;
    Ok(AppSettings::load(&dir))
}

#[tauri::command]
pub async fn settings_save(
    app: tauri::AppHandle,
    chat_state: State<'_, AiProvider>,
    embed_state: State<'_, AiEmbedder>,
    settings: AppSettings,
) -> CommandResult<AppSettings> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| CommandError::Other(format!("app_data_dir unavailable: {e}")))?;
    settings
        .save(&dir)
        .map_err(|e| CommandError::Other(format!("write settings.json: {e}")))?;

    // Hot-reload des providers IA : on reconstruit les `OllamaProvider`
    // avec les nouveaux URL + modèles, et on swap la valeur dans les
    // States Tauri. Les commandes IA snapshot leur State au début de
    // leur exécution, donc le swap est visible au prochain appel sans
    // toucher au code des commandes.
    let chat_provider = OllamaProvider::new(OllamaConfig {
        base_url: settings.ollama_base_url.clone(),
        default_model: settings.chat_model.clone(),
        capabilities: Capabilities {
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
        capabilities: Capabilities {
            text: false,
            vision: false,
            embeddings: true,
            tool_use: false,
            long_context: false,
        },
    });

    chat_state.replace(Arc::new(chat_provider)).await;
    embed_state
        .replace(Arc::new(embed_provider), settings.embed_model.clone())
        .await;
    tracing::info!(
        ollama = %settings.ollama_base_url,
        chat = %settings.chat_model,
        embed = %settings.embed_model,
        "Providers IA hot-reloaded depuis settings_save"
    );

    Ok(settings)
}
