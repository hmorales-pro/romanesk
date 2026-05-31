//! Filets de sécurité données (P16).
//!
//! Deux mécanismes complémentaires pour protéger les univers et chapitres
//! des utilisateurs contre les pertes accidentelles :
//!
//! 1. **Single-instance lock** (P16.1) → géré par
//!    `tauri-plugin-single-instance` directement dans `lib.rs`. Empêche
//!    deux instances de Romanesk d'écrire concurremment sur la même DB
//!    SQLite (cas classique : l'utilisateur double-clique l'app pendant
//!    qu'une autre est déjà ouverte, ou lance `pnpm tauri dev` en
//!    parallèle d'une release installée).
//!
//! 2. **Backup auto rotatif** (P16.2) → fonction `backup_database` ici.
//!    À chaque démarrage de l'app, copie la DB vers
//!    `~/Documents/Romanesk-backups/romanesk-YYYY-MM-DD_HH-mm-ss.db`
//!    et supprime les backups au-delà de `MAX_BACKUPS`. Visible dans
//!    le Finder, sauvegardé par Time Machine, indépendant des
//!    manipulations dev.
//!
//! Ces deux mécanismes ensemble n'éliminent pas 100 % du risque de perte
//! (une suppression utilisateur volontaire reste possible), mais ils
//! couvrent les scénarios accidentels les plus fréquents : double
//! instance, MAJ pendant que l'app tourne, migration ratée.

use std::path::{Path, PathBuf};

/// Nombre maximum de backups à garder dans `~/Documents/Romanesk-backups/`.
/// Au-delà, les plus vieux sont supprimés. ~14 backups ≈ 2 semaines à un
/// lancement/jour. Chaque backup pèse comme la DB live (qq Mo dans la
/// plupart des cas, qq dizaines pour les très gros univers).
pub const MAX_BACKUPS: usize = 14;

/// Sous-dossier dans `~/Documents/` où vivent les backups.
pub const BACKUPS_SUBDIR: &str = "Romanesk-backups";

/// Seuil minimum (en octets) pour qu'une DB soit considérée comme
/// « contenant des données » et donc digne d'un backup. Une DB SQLite
/// vide (juste le schéma) fait ~270 Ko en pratique sur Romanesk ; ce
/// seuil est calé un peu plus haut pour éviter de backupper des DBs
/// fraîchement créées qui ne contiennent rien.
const MIN_BACKUP_SIZE_BYTES: u64 = 300 * 1024; // ~300 Ko

/// Crée un backup de la DB live vers `~/Documents/Romanesk-backups/` si
/// elle existe et qu'elle est suffisamment grosse. Best-effort : si le
/// backup échoue (permissions, disque plein, etc.), on log un warning et
/// on continue. Le démarrage de l'app ne doit jamais être bloqué par un
/// échec de backup.
///
/// Le path `documents_dir` doit être le résultat de
/// `app.path().document_dir()` (Tauri).
///
/// Aussi : on **ne fait pas de checkpoint WAL** ici parce qu'on est
/// appelé avant `Database::open`, donc la DB n'est pas ouverte par sqlx
/// — le `.db` est dans un état cohérent (les écritures précédentes ont
/// été flushed par l'instance précédente au shutdown).
pub fn backup_database(db_path: &Path, documents_dir: &Path) {
    if !db_path.exists() {
        tracing::debug!("backup: pas de DB existante, skip");
        return;
    }

    let size = match std::fs::metadata(db_path) {
        Ok(m) => m.len(),
        Err(e) => {
            tracing::warn!(err = %e, "backup: impossible de lire la taille de la DB");
            return;
        }
    };

    if size < MIN_BACKUP_SIZE_BYTES {
        tracing::debug!(size, "backup: DB trop petite, probablement vide, skip");
        return;
    }

    let backups_dir = documents_dir.join(BACKUPS_SUBDIR);
    if let Err(e) = std::fs::create_dir_all(&backups_dir) {
        tracing::warn!(err = %e, ?backups_dir, "backup: impossible de créer le dossier");
        return;
    }

    let timestamp = chrono::Local::now().format("%Y-%m-%d_%H-%M-%S");
    let backup_path = backups_dir.join(format!("romanesk-{timestamp}.db"));

    match std::fs::copy(db_path, &backup_path) {
        Ok(bytes) => {
            tracing::info!(
                ?backup_path,
                bytes,
                "backup: snapshot de la DB créé au démarrage"
            );
        }
        Err(e) => {
            tracing::warn!(err = %e, ?backup_path, "backup: copy échouée");
            return;
        }
    }

    // Rotation : on garde les MAX_BACKUPS plus récents, on supprime
    // les autres. Best-effort sur la suppression.
    rotate_backups(&backups_dir, MAX_BACKUPS);
}

/// Supprime les backups les plus anciens si leur nombre dépasse `keep`.
/// Tri lexicographique sur le nom de fichier qui inclut le timestamp
/// ISO-like → équivalent à un tri chronologique tant qu'on respecte le
/// format `romanesk-YYYY-MM-DD_HH-MM-SS.db`.
fn rotate_backups(backups_dir: &Path, keep: usize) {
    let entries = match std::fs::read_dir(backups_dir) {
        Ok(e) => e,
        Err(e) => {
            tracing::warn!(err = %e, "rotate: read_dir échoué");
            return;
        }
    };

    let mut backups: Vec<PathBuf> = entries
        .filter_map(|res| res.ok())
        .map(|entry| entry.path())
        .filter(|p| {
            p.extension().is_some_and(|e| e == "db")
                && p.file_name()
                    .and_then(|n| n.to_str())
                    .is_some_and(|n| n.starts_with("romanesk-"))
        })
        .collect();

    if backups.len() <= keep {
        return;
    }

    // Tri descendant : les plus récents en premier (timestamp dans le
    // nom → tri lexicographique).
    backups.sort_by(|a, b| b.file_name().cmp(&a.file_name()));

    // Supprime tout ce qui dépasse `keep`.
    for old in &backups[keep..] {
        if let Err(e) = std::fs::remove_file(old) {
            tracing::warn!(err = %e, ?old, "rotate: suppression échouée");
        } else {
            tracing::debug!(?old, "rotate: backup ancien supprimé");
        }
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::io::Write;

    /// Crée un fichier `.db` factice de la taille demandée (rempli de
    /// zéros) dans un dossier temporaire.
    fn make_fake_db(dir: &Path, name: &str, size: u64) -> PathBuf {
        let path = dir.join(name);
        let mut f = fs::File::create(&path).unwrap();
        let buf = vec![0u8; size as usize];
        f.write_all(&buf).unwrap();
        path
    }

    #[test]
    fn skip_backup_if_db_missing() {
        let tmp = tempfile::tempdir().unwrap();
        let docs = tempfile::tempdir().unwrap();
        // Aucune DB → ne plante pas, log warning et passe.
        backup_database(&tmp.path().join("nope.db"), docs.path());
        // Pas de backup créé.
        let backups_dir = docs.path().join(BACKUPS_SUBDIR);
        assert!(!backups_dir.exists());
    }

    #[test]
    fn skip_backup_if_db_too_small() {
        let tmp = tempfile::tempdir().unwrap();
        let docs = tempfile::tempdir().unwrap();
        // 100 Ko < MIN_BACKUP_SIZE_BYTES → considéré vide.
        let db = make_fake_db(tmp.path(), "romanesk.db", 100 * 1024);
        backup_database(&db, docs.path());
        let backups_dir = docs.path().join(BACKUPS_SUBDIR);
        assert!(!backups_dir.exists());
    }

    #[test]
    fn backup_created_when_db_has_data() {
        let tmp = tempfile::tempdir().unwrap();
        let docs = tempfile::tempdir().unwrap();
        let db = make_fake_db(tmp.path(), "romanesk.db", 500 * 1024); // > 300 Ko
        backup_database(&db, docs.path());
        let backups_dir = docs.path().join(BACKUPS_SUBDIR);
        assert!(backups_dir.exists());
        let backups: Vec<_> = fs::read_dir(&backups_dir).unwrap().collect();
        assert_eq!(backups.len(), 1);
    }

    #[test]
    fn rotation_keeps_only_n_most_recent() {
        let tmp = tempfile::tempdir().unwrap();
        let backups_dir = tmp.path();
        // Crée 20 fichiers fake romanesk-YYYY-...db avec des dates
        // décroissantes pour que le tri lexicographique soit clair.
        for i in 0..20 {
            let day = format!("2026-01-{:02}", i + 1);
            let name = format!("romanesk-{}_00-00-00.db", day);
            fs::write(backups_dir.join(&name), b"x").unwrap();
        }
        rotate_backups(backups_dir, 5);
        let remaining: Vec<_> = fs::read_dir(backups_dir)
            .unwrap()
            .map(|e| e.unwrap().file_name().to_string_lossy().to_string())
            .collect();
        assert_eq!(remaining.len(), 5);
        // Les 5 plus récents (jours 16..20).
        assert!(remaining.iter().any(|n| n.contains("2026-01-20")));
        assert!(remaining.iter().any(|n| n.contains("2026-01-16")));
        assert!(!remaining.iter().any(|n| n.contains("2026-01-15")));
    }

    #[test]
    fn rotation_no_op_when_under_keep() {
        let tmp = tempfile::tempdir().unwrap();
        let backups_dir = tmp.path();
        for i in 0..3 {
            let name = format!("romanesk-2026-01-0{}_00-00-00.db", i + 1);
            fs::write(backups_dir.join(&name), b"x").unwrap();
        }
        rotate_backups(backups_dir, 14);
        let remaining: Vec<_> = fs::read_dir(backups_dir).unwrap().collect();
        assert_eq!(remaining.len(), 3);
    }
}
