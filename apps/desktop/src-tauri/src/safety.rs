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
//!    À chaque démarrage de l'app, snapshote la DB vers
//!    `<app_data_dir>/backups/romanesk-YYYY-MM-DD_HH-mm-ss.db`
//!    et supprime les backups au-delà de `MAX_BACKUPS`.
//!
//! Ces deux mécanismes ensemble n'éliminent pas 100 % du risque de perte
//! (une suppression utilisateur volontaire reste possible), mais ils
//! couvrent les scénarios accidentels les plus fréquents : double
//! instance, MAJ pendant que l'app tourne, migration ratée.
//!
//! ## Pourquoi `VACUUM INTO` et pas `fs::copy`
//!
//! La base tourne en `journal_mode = WAL` (cf. `db/connection.rs`). En
//! WAL, une transaction validée vit dans le fichier `-wal` jusqu'au
//! prochain checkpoint : le `.db` seul est en retard. Une copie fichier
//! du seul `.db` produit donc un backup **périmé** dès que l'instance
//! précédente ne s'est pas arrêtée proprement — crash, « Forcer à
//! quitter », coupure de courant. C'est-à-dire exactement les scénarios
//! qui justifient un backup.
//!
//! `VACUUM INTO` demande à SQLite d'écrire un fichier unique, compacté
//! et cohérent, WAL replayé compris. On ouvre donc la base juste le
//! temps du snapshot, avant `Database::open` pour que le backup soit
//! antérieur aux migrations.
//!
//! ## Pourquoi plus dans `~/Documents`
//!
//! Sur macOS et Windows, `~/Documents` est fréquemment synchronisé par
//! iCloud Drive ou OneDrive. Y déposer 14 copies intégrales de la base
//! revenait à pousser tout l'univers de l'auteur chez un tiers, ce qui
//! contredit la promesse « aucun cloud par défaut ». Les backups vivent
//! donc avec les données, sous `app_data_dir`.

use std::path::{Path, PathBuf};

use sqlx::sqlite::SqliteConnectOptions;
use sqlx::{ConnectOptions, Connection, SqliteConnection};

/// Nombre maximum de backups à garder dans `<app_data_dir>/backups/`.
/// Au-delà, les plus vieux sont supprimés. ~14 backups ≈ 2 semaines à un
/// lancement/jour. Un backup `VACUUM INTO` est compacté, donc au plus
/// de la taille de la DB live.
pub const MAX_BACKUPS: usize = 14;

/// Sous-dossier de `app_data_dir` où vivent les backups.
pub const BACKUPS_SUBDIR: &str = "backups";

/// Seuil minimum (en octets) pour qu'une DB soit considérée comme
/// « contenant des données » et donc digne d'un backup. Une DB SQLite
/// vide (juste le schéma) fait ~270 Ko en pratique sur Romanesk ; ce
/// seuil est calé un peu plus haut pour éviter de backupper des DBs
/// fraîchement créées qui ne contiennent rien.
const MIN_BACKUP_SIZE_BYTES: u64 = 300 * 1024; // ~300 Ko

/// Taille cumulée de la base et de son journal WAL. En WAL, une base
/// dont le `.db` est encore minuscule peut déjà contenir plusieurs
/// chapitres restés dans le `-wal` : ne regarder que le `.db` ferait
/// sauter le backup au moment où il devient utile.
fn database_footprint(db_path: &Path) -> u64 {
    let mut total = std::fs::metadata(db_path).map(|m| m.len()).unwrap_or(0);
    // SQLite nomme son journal `<chemin complet>-wal`, extension comprise.
    let mut wal = db_path.as_os_str().to_owned();
    wal.push("-wal");
    if let Ok(m) = std::fs::metadata(PathBuf::from(wal)) {
        total += m.len();
    }
    total
}

/// Crée un backup de la DB live vers `<app_data_dir>/backups/` si elle
/// existe et qu'elle est suffisamment grosse. Best-effort : si le backup
/// échoue (permissions, disque plein, etc.), on log un warning et on
/// continue. Le démarrage de l'app ne doit jamais être bloqué par un
/// échec de backup.
///
/// Le snapshot passe par `VACUUM INTO`, pas par une copie de fichier :
/// voir la note « Pourquoi `VACUUM INTO` » en tête de module. On ouvre
/// la base le temps du snapshot — l'ouverture rejoue au passage le WAL
/// laissé par une session précédente qui se serait mal terminée.
///
/// Appelée **avant** `Database::open` pour que le backup soit antérieur
/// aux migrations : si une migration casse la base, le fichier de
/// secours est dans l'état d'avant.
pub async fn backup_database(db_path: &Path, app_data_dir: &Path) {
    if !db_path.exists() {
        tracing::debug!("backup: pas de DB existante, skip");
        return;
    }

    let size = database_footprint(db_path);
    if size < MIN_BACKUP_SIZE_BYTES {
        tracing::debug!(size, "backup: DB trop petite, probablement vide, skip");
        return;
    }

    let backups_dir = app_data_dir.join(BACKUPS_SUBDIR);
    if let Err(e) = std::fs::create_dir_all(&backups_dir) {
        tracing::warn!(err = %e, ?backups_dir, "backup: impossible de créer le dossier");
        return;
    }

    let timestamp = chrono::Local::now().format("%Y-%m-%d_%H-%M-%S");
    let backup_path = backups_dir.join(format!("romanesk-{timestamp}.db"));

    match snapshot_to(db_path, &backup_path).await {
        Ok(()) => {
            let bytes = std::fs::metadata(&backup_path)
                .map(|m| m.len())
                .unwrap_or(0);
            tracing::info!(
                ?backup_path,
                bytes,
                "backup: snapshot de la DB créé au démarrage"
            );
        }
        Err(e) => {
            tracing::warn!(err = %e, ?backup_path, "backup: snapshot échoué");
            // Un fichier partiel ne doit pas passer pour un backup valide.
            let _ = std::fs::remove_file(&backup_path);
            return;
        }
    }

    // Rotation : on garde les MAX_BACKUPS plus récents, on supprime
    // les autres. Best-effort sur la suppression.
    rotate_backups(&backups_dir, MAX_BACKUPS);
}

/// Écrit un snapshot cohérent de `db_path` dans `dest` via `VACUUM INTO`.
///
/// `dest` ne doit pas exister : SQLite refuse d'écraser. C'est voulu —
/// on préfère échouer que corrompre un backup antérieur.
async fn snapshot_to(db_path: &Path, dest: &Path) -> Result<(), String> {
    let opts = SqliteConnectOptions::new()
        .filename(db_path)
        // Ne jamais fabriquer une base ici : si le chemin est faux, on
        // veut une erreur, pas un backup vide qui inspire confiance.
        .create_if_missing(false)
        // Le snapshot est bruyant en log et sans intérêt au niveau info.
        .disable_statement_logging();

    let mut conn = SqliteConnection::connect_with(&opts)
        .await
        .map_err(|e| format!("ouverture de la base pour snapshot: {e}"))?;

    // `VACUUM INTO` n'accepte pas de paramètre lié : le chemin est
    // interpolé, donc échappé à la mode SQL (une quote simple se double).
    // Le chemin vient de `app_data_dir`, pas d'une saisie utilisateur.
    let dest_sql = dest.to_string_lossy().replace('\'', "''");
    let res = sqlx::query(&format!("VACUUM INTO '{dest_sql}'"))
        .execute(&mut conn)
        .await
        .map(|_| ())
        .map_err(|e| format!("VACUUM INTO: {e}"));

    let _ = conn.close().await;
    res
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
    use sqlx::Row;
    use std::fs;

    /// Crée une vraie base SQLite en mode WAL, avec `wal_autocheckpoint`
    /// désactivé et `rows` lignes de garnissage. Renvoie le chemin et la
    /// connexion **encore ouverte** : tant qu'elle vit, SQLite ne
    /// checkpointe pas, donc les données restent dans le `-wal` — ce qui
    /// reproduit fidèlement l'état d'une base après un arrêt brutal.
    async fn make_wal_db(dir: &Path, rows: usize) -> (PathBuf, SqliteConnection) {
        let path = dir.join("romanesk.db");
        let opts = SqliteConnectOptions::new()
            .filename(&path)
            .create_if_missing(true);
        let mut conn = SqliteConnection::connect_with(&opts).await.unwrap();

        sqlx::query("PRAGMA journal_mode = WAL")
            .execute(&mut conn)
            .await
            .unwrap();
        sqlx::query("PRAGMA wal_autocheckpoint = 0")
            .execute(&mut conn)
            .await
            .unwrap();
        sqlx::query("CREATE TABLE chapitres (id INTEGER PRIMARY KEY, texte TEXT)")
            .execute(&mut conn)
            .await
            .unwrap();

        let filler = "a".repeat(1024);
        for i in 0..rows {
            sqlx::query("INSERT INTO chapitres (id, texte) VALUES (?, ?)")
                .bind(i as i64)
                .bind(&filler)
                .execute(&mut conn)
                .await
                .unwrap();
        }

        (path, conn)
    }

    /// Nombre de lignes lisibles dans `db`. Renvoie 0 si la base est
    /// inutilisable ou si la table n'y est même pas : sur une copie
    /// tronquée, « illisible » et « vide » sont le même échec.
    async fn count_rows(db: &Path) -> i64 {
        let opts = SqliteConnectOptions::new()
            .filename(db)
            .create_if_missing(false);
        let Ok(mut conn) = SqliteConnection::connect_with(&opts).await else {
            return 0;
        };
        sqlx::query("SELECT COUNT(*) AS n FROM chapitres")
            .fetch_one(&mut conn)
            .await
            .map_or(0, |row| row.get::<i64, _>("n"))
    }

    fn only_backup(backups_dir: &Path) -> PathBuf {
        let mut entries: Vec<PathBuf> = fs::read_dir(backups_dir)
            .unwrap()
            .map(|e| e.unwrap().path())
            .collect();
        assert_eq!(entries.len(), 1, "un seul backup attendu");
        entries.pop().unwrap()
    }

    #[tokio::test]
    async fn skip_backup_if_db_missing() {
        let tmp = tempfile::tempdir().unwrap();
        let data = tempfile::tempdir().unwrap();
        // Aucune DB → ne plante pas, log warning et passe.
        backup_database(&tmp.path().join("nope.db"), data.path()).await;
        assert!(!data.path().join(BACKUPS_SUBDIR).exists());
    }

    #[tokio::test]
    async fn skip_backup_if_db_too_small() {
        let tmp = tempfile::tempdir().unwrap();
        let data = tempfile::tempdir().unwrap();
        // Une poignée de lignes → bien en dessous de MIN_BACKUP_SIZE_BYTES.
        let (db, _conn) = make_wal_db(tmp.path(), 5).await;
        backup_database(&db, data.path()).await;
        assert!(!data.path().join(BACKUPS_SUBDIR).exists());
    }

    #[tokio::test]
    async fn backup_created_when_db_has_data() {
        let tmp = tempfile::tempdir().unwrap();
        let data = tempfile::tempdir().unwrap();
        let (db, _conn) = make_wal_db(tmp.path(), 400).await;
        backup_database(&db, data.path()).await;

        let backups_dir = data.path().join(BACKUPS_SUBDIR);
        assert!(backups_dir.exists());
        let backup = only_backup(&backups_dir);
        assert_eq!(count_rows(&backup).await, 400);
    }

    /// Régression : le backup doit contenir les transactions restées dans
    /// le WAL. C'est le défaut que `std::fs::copy` avait — après un crash,
    /// le `.db` seul est en retard et la sauvegarde perdait le travail le
    /// plus récent, c'est-à-dire celui qu'on voulait justement protéger.
    #[tokio::test]
    async fn backup_captures_uncheckpointed_wal() {
        let tmp = tempfile::tempdir().unwrap();
        let data = tempfile::tempdir().unwrap();
        let (db, _conn) = make_wal_db(tmp.path(), 400).await;

        // Le WAL porte bien les données, le `.db` ne les a pas encore.
        let mut wal = db.as_os_str().to_owned();
        wal.push("-wal");
        let wal_len = fs::metadata(PathBuf::from(wal)).map(|m| m.len()).unwrap();
        assert!(
            wal_len > 300 * 1024,
            "le WAL doit contenir le gros des données pour que le test ait un sens (taille {wal_len})"
        );

        // Ce que faisait l'ancien code : copier le seul `.db`.
        let naive = tmp.path().join("copie-naive.db");
        fs::copy(&db, &naive).unwrap();
        let naive_rows = count_rows(&naive).await;

        backup_database(&db, data.path()).await;
        let backup = only_backup(&data.path().join(BACKUPS_SUBDIR));

        assert_eq!(
            count_rows(&backup).await,
            400,
            "VACUUM INTO doit rejouer le WAL"
        );
        assert!(
            naive_rows < 400,
            "la copie fichier devait être incomplète — sinon le test ne prouve rien"
        );
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
