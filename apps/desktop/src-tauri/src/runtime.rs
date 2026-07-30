//! Runtime Ollama managé (P17) — « tout packagé en un seul endroit ».
//!
//! Jusqu'ici, Romanesk exigeait un Ollama installé et démarré par
//! l'utilisateur. Ce module supprime cette marche : l'app peut
//! télécharger le binaire Ollama officiel, le ranger dans son propre
//! répertoire de données, le lancer en processus enfant sur un port
//! privé et l'arrêter proprement à la fermeture — le tout sans que
//! l'utilisateur ouvre un terminal (modèle « Jan »).
//!
//! Trois modes, configurés via `AppSettings::ollama_mode` :
//! - `auto` (défaut) : utilise l'Ollama système s'il répond, sinon
//!   démarre le runtime managé s'il est installé.
//! - `system` : ne touche à rien, utilise `ollama_base_url` (comportement
//!   historique).
//! - `managed` : utilise toujours le runtime managé.
//!
//! Arborescence dans `app_data_dir` :
//! - `runtime/ollama/` : binaire + libs décompressés depuis l'archive
//!   officielle (GitHub Releases, fallback ollama.com).
//! - `models/` : `OLLAMA_MODELS` du runtime managé — les modèles vivent
//!   avec les données Romanesk, une désinstallation efface tout.
//!
//! Le processus enfant est lié à la vie de l'app : spawn au setup (selon
//! mode), kill sur `RunEvent::Exit`. Si un runtime managé orphelin d'une
//! session précédente répond déjà sur le port privé, on l'adopte au lieu
//! d'en lancer un deuxième.

use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::time::Duration;

use serde::Serialize;
use tauri::{Emitter, Manager};
use tokio::sync::Mutex;

/// Port privé du runtime managé — distinct du 11434 standard pour
/// cohabiter avec un Ollama système installé plus tard sans collision.
pub const MANAGED_PORT: u16 = 11540;

/// Event Tauri émis pendant `runtime_download` (front : barre de progression).
pub const DOWNLOAD_PROGRESS_EVENT: &str = "runtime-download-progress";

/// Event Tauri émis quand l'état du runtime change (démarré, arrêté…).
/// Le front invalide sa query `runtime-status` en le recevant.
pub const CHANGED_EVENT: &str = "runtime-changed";

#[must_use]
pub fn managed_base_url() -> String {
    format!("http://127.0.0.1:{MANAGED_PORT}")
}

/// Progrès de téléchargement/installation du runtime, streamé au front.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeDownloadProgress {
    /// "download" | "verify" | "unpack" | "done"
    pub phase: &'static str,
    pub completed: Option<u64>,
    pub total: Option<u64>,
    pub message: String,
}

/// Gestionnaire du processus Ollama managé. Stocké en `tauri::State`.
pub struct RuntimeManager {
    app_data_dir: PathBuf,
    child: Mutex<Option<Child>>,
}

impl RuntimeManager {
    #[must_use]
    pub fn new(app_data_dir: PathBuf) -> Self {
        Self {
            app_data_dir,
            child: Mutex::new(None),
        }
    }

    /// Répertoire d'installation du runtime (binaire + libs).
    #[must_use]
    pub fn runtime_dir(&self) -> PathBuf {
        self.app_data_dir.join("runtime").join("ollama")
    }

    /// `OLLAMA_MODELS` du runtime managé — les modèles vivent avec les
    /// données Romanesk.
    #[must_use]
    pub fn models_dir(&self) -> PathBuf {
        self.app_data_dir.join("models")
    }

    /// Localise le binaire ollama dans le répertoire runtime, quel que
    /// soit le layout de l'archive (racine ou `bin/`).
    #[must_use]
    pub fn binary_path(&self) -> Option<PathBuf> {
        let dir = self.runtime_dir();
        let candidates: &[&str] = if cfg!(windows) {
            &["ollama.exe", "bin/ollama.exe"]
        } else {
            &["bin/ollama", "ollama"]
        };
        candidates.iter().map(|c| dir.join(c)).find(|p| p.is_file())
    }

    #[must_use]
    pub fn is_installed(&self) -> bool {
        self.binary_path().is_some()
    }

    /// Vrai si on détient un processus enfant encore vivant.
    pub async fn owns_running_child(&self) -> bool {
        let mut guard = self.child.lock().await;
        match guard.as_mut() {
            Some(child) => match child.try_wait() {
                Ok(None) => true,
                // Exited (ou erreur d'inspection) : on nettoie le handle.
                _ => {
                    *guard = None;
                    false
                }
            },
            None => false,
        }
    }

    /// Démarre le runtime managé s'il ne tourne pas déjà, et attend
    /// qu'il réponde. Adopte un runtime orphelin qui répondrait déjà
    /// sur le port privé (session précédente crashée).
    pub async fn start(&self) -> Result<(), String> {
        if self.owns_running_child().await || probe(&managed_base_url()).await {
            return Ok(());
        }

        let bin = self
            .binary_path()
            .ok_or_else(|| "runtime Ollama non installé".to_string())?;

        let models_dir = self.models_dir();
        std::fs::create_dir_all(&models_dir)
            .map_err(|e| format!("création du dossier modèles: {e}"))?;

        tracing::info!(?bin, port = MANAGED_PORT, "Démarrage du runtime Ollama managé");

        let mut cmd = Command::new(&bin);
        cmd.arg("serve")
            .env("OLLAMA_HOST", format!("127.0.0.1:{MANAGED_PORT}"))
            .env("OLLAMA_MODELS", &models_dir)
            // Le WebView Tauri a une origine tauri:// — sans ça, les
            // requêtes directes du front seraient refusées par CORS.
            // Le serveur n'écoute que sur 127.0.0.1, pas de risque réseau.
            .env("OLLAMA_ORIGINS", "*")
            .current_dir(bin.parent().unwrap_or(Path::new(".")))
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null());

        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            const CREATE_NO_WINDOW: u32 = 0x0800_0000;
            cmd.creation_flags(CREATE_NO_WINDOW);
        }

        let child = cmd
            .spawn()
            .map_err(|e| format!("impossible de lancer {}: {e}", bin.display()))?;
        *self.child.lock().await = Some(child);

        // Attente active : jusqu'à 30 s pour laisser le serveur binder
        // (premier lancement Windows = scan antivirus parfois lent).
        let url = managed_base_url();
        for _ in 0..60 {
            if probe(&url).await {
                tracing::info!("Runtime Ollama managé prêt sur {url}");
                return Ok(());
            }
            // Le process est-il mort pendant le boot ? (binaire corrompu,
            // port pris par un non-HTTP, etc.)
            if !self.owns_running_child().await {
                return Err("le runtime Ollama s'est arrêté pendant le démarrage".into());
            }
            tokio::time::sleep(Duration::from_millis(500)).await;
        }
        Err("le runtime Ollama ne répond pas après 30 s".into())
    }

    /// Arrête le processus enfant si on en détient un. Best-effort.
    pub async fn stop(&self) {
        let mut guard = self.child.lock().await;
        if let Some(mut child) = guard.take() {
            tracing::info!("Arrêt du runtime Ollama managé");
            let _ = child.kill();
            let _ = child.wait();
        }
    }
}

/// Healthcheck HTTP rapide (2 s) sur `/api/version`.
pub async fn probe(base_url: &str) -> bool {
    let url = format!("{}/api/version", base_url.trim_end_matches('/'));
    let client = match reqwest::Client::builder()
        .timeout(Duration::from_secs(2))
        .build()
    {
        Ok(c) => c,
        Err(_) => return false,
    };
    matches!(client.get(&url).send().await, Ok(r) if r.status().is_success())
}

// ---------------------------------------------------------------------------
// Téléchargement du runtime
// ---------------------------------------------------------------------------

/// Nom de l'asset officiel Ollama pour la plateforme courante.
/// Mêmes noms que ceux utilisés par l'install.sh officiel.
fn asset_name() -> Result<&'static str, String> {
    match (std::env::consts::OS, std::env::consts::ARCH) {
        ("macos", _) => Ok("ollama-darwin.tgz"), // binaire universel
        ("linux", "x86_64") => Ok("ollama-linux-amd64.tgz"),
        ("linux", "aarch64") => Ok("ollama-linux-arm64.tgz"),
        ("windows", "x86_64") => Ok("ollama-windows-amd64.zip"),
        ("windows", "aarch64") => Ok("ollama-windows-arm64.zip"),
        (os, arch) => Err(format!("plateforme non supportée: {os}/{arch}")),
    }
}

/// Sources de téléchargement, dans l'ordre d'essai. La première est
/// surchargeable par env (`ROMANESK_OLLAMA_DOWNLOAD_BASE`) pour les tests
/// ou un miroir d'entreprise.
fn download_bases() -> Vec<String> {
    let mut bases = Vec::new();
    if let Ok(custom) = std::env::var("ROMANESK_OLLAMA_DOWNLOAD_BASE") {
        bases.push(custom.trim_end_matches('/').to_string());
    }
    bases.push("https://github.com/ollama/ollama/releases/latest/download".into());
    bases.push("https://ollama.com/download".into());
    bases
}

fn emit_progress(app: &tauri::AppHandle, p: &RuntimeDownloadProgress) {
    if let Err(e) = app.emit(DOWNLOAD_PROGRESS_EVENT, p) {
        tracing::warn!(error = %e, "échec emit runtime-download-progress");
    }
}

/// Télécharge, vérifie et installe le runtime Ollama dans
/// `app_data_dir/runtime/ollama/`. Streame le progrès via l'event
/// `runtime-download-progress`.
pub async fn download_runtime(app: &tauri::AppHandle) -> Result<(), String> {
    let mgr = app.state::<RuntimeManager>();
    let asset = asset_name()?;
    let runtime_dir = mgr.runtime_dir();
    std::fs::create_dir_all(&runtime_dir).map_err(|e| format!("création {runtime_dir:?}: {e}"))?;

    let client = reqwest::Client::builder()
        .user_agent("romanesk-desktop")
        .connect_timeout(Duration::from_secs(15))
        .build()
        .map_err(|e| e.to_string())?;

    // Essaie chaque source dans l'ordre ; garde la dernière erreur pour
    // le message final si tout échoue.
    let mut last_err = String::new();
    for base in download_bases() {
        let url = format!("{base}/{asset}");
        tracing::info!(%url, "Téléchargement du runtime Ollama");
        match try_download_from(app, &client, &base, asset, &runtime_dir).await {
            Ok(()) => {
                let bin = mgr
                    .binary_path()
                    .ok_or_else(|| "archive décompressée mais binaire ollama introuvable".to_string())?;
                #[cfg(unix)]
                {
                    use std::os::unix::fs::PermissionsExt;
                    let _ = std::fs::set_permissions(&bin, std::fs::Permissions::from_mode(0o755));
                }
                emit_progress(
                    app,
                    &RuntimeDownloadProgress {
                        phase: "done",
                        completed: None,
                        total: None,
                        message: format!("runtime installé: {}", bin.display()),
                    },
                );
                return Ok(());
            }
            Err(e) => {
                tracing::warn!(%url, error = %e, "source de téléchargement en échec, essai suivant");
                last_err = e;
            }
        }
    }
    Err(format!("téléchargement du runtime impossible: {last_err}"))
}

async fn try_download_from(
    app: &tauri::AppHandle,
    client: &reqwest::Client,
    base: &str,
    asset: &str,
    runtime_dir: &Path,
) -> Result<(), String> {
    use futures_util::StreamExt;
    use sha2::Digest;

    let url = format!("{base}/{asset}");
    let resp = client
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("requête {url}: {e}"))?;
    if !resp.status().is_success() {
        return Err(format!("HTTP {} sur {url}", resp.status()));
    }

    let total = resp.content_length();
    let part_path = runtime_dir.join(format!("{asset}.part"));
    let mut file = std::fs::File::create(&part_path)
        .map_err(|e| format!("création {part_path:?}: {e}"))?;

    let mut hasher = sha2::Sha256::new();
    let mut completed: u64 = 0;
    let mut last_emit = std::time::Instant::now();
    let mut stream = resp.bytes_stream();
    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| format!("téléchargement interrompu: {e}"))?;
        std::io::Write::write_all(&mut file, &chunk)
            .map_err(|e| format!("écriture {part_path:?}: {e}"))?;
        hasher.update(&chunk);
        completed += chunk.len() as u64;
        // Throttle des events : ~5/s suffisent pour une barre fluide.
        if last_emit.elapsed() >= Duration::from_millis(200) {
            last_emit = std::time::Instant::now();
            emit_progress(
                app,
                &RuntimeDownloadProgress {
                    phase: "download",
                    completed: Some(completed),
                    total,
                    message: "téléchargement du moteur IA".into(),
                },
            );
        }
    }
    drop(file);

    // Vérification d'intégrité best-effort : GitHub publie un
    // sha256sum.txt à côté des assets. S'il est introuvable (miroir,
    // ollama.com), on s'appuie sur TLS — même modèle de confiance que
    // l'install.sh officiel d'Ollama.
    emit_progress(
        app,
        &RuntimeDownloadProgress {
            phase: "verify",
            completed: None,
            total: None,
            message: "vérification de l'archive".into(),
        },
    );
    let digest = format!("{:x}", hasher.finalize());
    match fetch_expected_sha256(client, base, asset).await {
        Some(expected) if expected != digest => {
            let _ = std::fs::remove_file(&part_path);
            return Err(format!(
                "checksum SHA-256 invalide (attendu {expected}, obtenu {digest})"
            ));
        }
        Some(_) => tracing::info!("Checksum SHA-256 du runtime vérifié"),
        None => tracing::warn!("sha256sum.txt indisponible — vérification par TLS uniquement"),
    }

    emit_progress(
        app,
        &RuntimeDownloadProgress {
            phase: "unpack",
            completed: None,
            total: None,
            message: "décompression du moteur IA".into(),
        },
    );
    let unpack_result = if asset.ends_with(".zip") {
        unpack_zip(&part_path, runtime_dir)
    } else {
        unpack_tgz(&part_path, runtime_dir)
    };
    let _ = std::fs::remove_file(&part_path);
    unpack_result
}

/// Récupère le SHA-256 attendu depuis le `sha256sum.txt` publié à côté
/// de l'asset. `None` si indisponible (source sans checksum).
async fn fetch_expected_sha256(
    client: &reqwest::Client,
    base: &str,
    asset: &str,
) -> Option<String> {
    let url = format!("{base}/sha256sum.txt");
    let text = client
        .get(&url)
        .send()
        .await
        .ok()?
        .error_for_status()
        .ok()?
        .text()
        .await
        .ok()?;
    // Format sha256sum classique : "<hex>  <fichier>" ligne par ligne.
    text.lines()
        .filter_map(|line| {
            let mut parts = line.split_whitespace();
            let hash = parts.next()?;
            let name = parts.next()?;
            (name.trim_start_matches('*') == asset).then(|| hash.to_lowercase())
        })
        .next()
}

fn unpack_tgz(archive: &Path, dest: &Path) -> Result<(), String> {
    let file = std::fs::File::open(archive).map_err(|e| format!("ouverture {archive:?}: {e}"))?;
    let gz = flate2::read::GzDecoder::new(file);
    let mut tar = tar::Archive::new(gz);
    tar.unpack(dest)
        .map_err(|e| format!("décompression tgz: {e}"))
}

fn unpack_zip(archive: &Path, dest: &Path) -> Result<(), String> {
    let file = std::fs::File::open(archive).map_err(|e| format!("ouverture {archive:?}: {e}"))?;
    let mut zip = zip::ZipArchive::new(file).map_err(|e| format!("lecture zip: {e}"))?;
    zip.extract(dest).map_err(|e| format!("décompression zip: {e}"))
}

// ---------------------------------------------------------------------------
// Recommandation de modèle selon le matériel
// ---------------------------------------------------------------------------

/// RAM totale de la machine en Go (arrondi), ou `None` si indétectable.
#[must_use]
pub fn total_memory_gb() -> Option<u64> {
    let mut sys = sysinfo::System::new();
    sys.refresh_memory();
    let bytes = sys.total_memory();
    (bytes > 0).then_some(bytes / (1024 * 1024 * 1024))
}

/// Choix par défaut du modèle de chat selon la RAM : l'écrivain n'a pas
/// à savoir ce qu'est une quantisation. Seuils volontairement prudents —
/// le modèle doit tenir en mémoire à côté de l'app et du système.
#[must_use]
pub fn recommended_chat_model() -> String {
    match total_memory_gb() {
        Some(gb) if gb >= 24 => "gemma3:12b".to_string(),
        Some(gb) if gb >= 8 => "gemma3:4b".to_string(),
        Some(_) => "gemma3:1b".to_string(),
        None => "gemma3:4b".to_string(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn managed_url_uses_private_port() {
        assert_eq!(managed_base_url(), "http://127.0.0.1:11540");
    }

    #[test]
    fn asset_name_matches_current_platform() {
        // Sur les plateformes CI supportées, un asset doit exister.
        let asset = asset_name().expect("plateforme supportée");
        assert!(asset.starts_with("ollama-"));
    }

    #[test]
    fn recommended_model_is_gemma() {
        assert!(recommended_chat_model().starts_with("gemma3:"));
    }

    #[test]
    fn sha256sum_parsing_finds_asset() {
        // Vérifie le parsing du format sha256sum via le filtre inline.
        let text = "abc123  ollama-darwin.tgz\ndef456  ollama-linux-amd64.tgz\n";
        let found = text
            .lines()
            .filter_map(|line| {
                let mut parts = line.split_whitespace();
                let hash = parts.next()?;
                let name = parts.next()?;
                (name == "ollama-linux-amd64.tgz").then(|| hash.to_string())
            })
            .next();
        assert_eq!(found.as_deref(), Some("def456"));
    }
}
