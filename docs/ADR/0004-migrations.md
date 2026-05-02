# ADR 0004 — Outil de migrations DB : `sqlx::migrate!` (révise ADR 0001)

- **Statut** : Accepté — révise une décision de l'ADR 0001
- **Date** : 2026-05-02
- **Décideurs** : Hugo Morales

## Contexte

L'ADR 0001 listait deux outils pour la couche DB : `sqlx` pour les requêtes et `refinery` pour les migrations. Au moment d'implémenter J3, ce duo s'avère redondant.

Le runner SQLite officiel de `refinery` est **`refinery-rusqlite`**. Or `sqlx-sqlite` (déjà dans les dépendances) embarque déjà la libsqlite3 statiquement (via `libsqlite3-sys`). Ajouter `rusqlite` à côté revient à :

- Compiler **deux fois** la même libsqlite3 (un binding C par crate).
- Avoir **deux drivers** SQLite à entretenir, qui peuvent diverger en version, en flags de compilation, et en options de connexion (PRAGMA).
- Doubler le temps de compilation Rust pour zéro feature gagnée.

`sqlx` propose son propre système de migrations : la macro `sqlx::migrate!()` lit un répertoire de migrations à la **compilation** et embarque le SQL dans le binaire. Aucun fichier à shipper en runtime, et l'API est intégrée à la connexion `sqlx`.

## Décision

**Utiliser `sqlx::migrate!("../../db/migrations")` côté `crates/core` et abandonner `refinery`.**

Le pipeline devient :

1. Les fichiers SQL versionnés vivent dans `db/migrations/0001_init.sql`, `0002_*.sql`, etc.
2. `crates/core/src/db/migrations.rs` expose `pub static MIGRATOR: Migrator = sqlx::migrate!("../../db/migrations");`.
3. `Database::new_in_memory()` et `Database::open(path)` exécutent `MIGRATOR.run(&pool).await?` à l'ouverture.
4. La table `_sqlx_migrations` (créée automatiquement par sqlx) trace les migrations appliquées avec leur checksum SHA-384 — toute modif d'une migration déjà appliquée échoue à l'ouverture suivante (intentionnel).

## Conséquences

### Positives
- **Une seule lib SQLite** dans le binaire (`libsqlite3-sys` via `sqlx-sqlite`).
- Compile-time : sqlx vérifie que les fichiers de migrations existent et sont valides au moment de la compilation. Si on supprime une migration, le build casse.
- Migrations embarquées dans l'exécutable : pas besoin de shipper le dossier `db/migrations/` à côté du binaire.
- Convention sqlx alignée avec le reste du repo (`sqlx::query` partout pour les requêtes).

### Négatives / à surveiller
- Si on voulait un jour supporter Postgres en plus de SQLite (ex. backend Sync optionnel en Phase 5+), `sqlx::migrate!` reste fine — sqlx gère les migrations multi-driver. Mais on devrait dupliquer les fichiers (`db/migrations-pg/` séparé) parce que la syntaxe SQLite ≠ Postgres. Pas un problème pour Phase 0.
- Pas de **migrations down** (rollbacks) intégrées en sqlx. C'est un choix volontaire amont (« forward-only migrations »). Pour Romanesk c'est OK : pas de service mutualisé à reverter sous pression.

### Conventions
- Format des fichiers : `NNNN_short_name.sql` (ex. `0002_add_world_brief_pinning.sql`).
- **Une migration ne se modifie jamais après merge.** Toute correction = nouvelle migration.
- Les migrations qui touchent au schéma doivent être testées par un test d'intégration qui (a) part d'une DB vide, (b) applique tout, (c) insère un échantillon, (d) lit, (e) supprime, (f) check FK cascade.

## Alternatives écartées

- **Refinery + rusqlite** : redondant avec sqlx-sqlite, doublement du driver SQLite, plus de surface de bugs.
- **Migrations à la main au démarrage** (un seul fichier `init.sql` exécuté inconditionnellement) : impossible de versionner les changements de schéma une fois en prod.
- **Atlas / Diesel CLI / dbmate** : outils externes, ajoutent une dépendance hors du build Rust, friction CI.

## Action de mise à jour

L'ADR 0001 reste valide sauf pour la ligne « Migrations : refinery ». Cette présente ADR la remplace. `Cargo.toml` (workspace + `crates/core`) est nettoyé : aucune mention `refinery` ou `rusqlite` ajoutée.
