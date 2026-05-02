# Changelog

Format inspiré de [Keep a Changelog](https://keepachangelog.com/) ; le projet suit (à terme) [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added
- `LICENSE` à la racine — texte intégral de l'**Elastic License 2.0**.
- ADR `0002-editor.md` (Tiptap vs Lexical — décision Tiptap par défaut).
- ADR `0003-relations.md` (set figé en v1, extensible en Phase 1+).
- **Phase 0 — J2** : scaffolding `apps/desktop` (Tauri 2 + React 18 + TypeScript + Vite 6).
  - Structure monorepo : `package.json` racine, `apps/desktop/` (front + `src-tauri/`).
  - Tailwind 4 + shadcn/ui (components.json, lib/utils.ts), tokens CSS dans `src/index.css`.
  - Page d'accueil React minimale + commande Tauri `ping` qui renvoie `{ message: "pong", echoed_at: ISO8601 }`.
  - ESLint 9 flat config + typescript-eslint.
  - Workspace Cargo : ajout de `apps/desktop/src-tauri` en membre.
  - `pnpm install`, `pnpm typecheck`, `pnpm lint` verts.
- **Phase 0 — J3** : couche données SQLite + repository pattern dans `crates/core`.
  - Module `db/` : `Database` wrapper (in-memory + on-disk WAL), `PRAGMA foreign_keys = ON`, migrations embarquées via `sqlx::migrate!("../../db/migrations")`.
  - Module `domain/` : types `Universe`, `Entity`, `EntityType`, `NewUniverse`, `NewEntity`.
  - Module `repo/` : `Repo` avec `UniverseRepo` (create / get / list / hard_delete / soft_delete) et `EntityRepo` (create / get / list_in_universe / count_in_universe / hard_delete / soft_delete) + `RepoError` typé.
  - Tri sur `id` (UUID v7 monotone temporellement) plutôt que `created_at` — pas d'index supplémentaire requis.
  - 11 tests d'intégration in-memory : CRUD, FK ON DELETE CASCADE, soft-delete, FK violation, round-trip JSON Unicode, `PRAGMA foreign_keys` actif.
  - ADR `0004-migrations.md` : abandon de `refinery` au profit de `sqlx::migrate!` (évite le double driver SQLite).
- **Phase 0 — J4** : stockage vectoriel + recherche cosine dans `crates/core/src/rag/`.
  - Module `rag/vec.rs` : `EmbeddingRepo` (insert, get, search_topk, delete_for) + helpers `encode_vector` / `decode_vector` (BLOB f32 little-endian) + `cosine`.
  - Domain : `SourceType` (entity, snapshot, chapter, brief, note), `Embedding`, `NewEmbedding`, `EmbeddingHit`, `SearchFilter` (model + source_type optionnels).
  - Filtre obligatoire par `dim` côté SQL avant le calcul cosine — vecteurs incompatibles automatiquement exclus.
  - 5 tests unitaires (encode/decode bit-exact, cosine identique/orthogonal/opposite/zero) + 10 tests d'intégration (smoke top-k, filtres dim/model/source, delete_for, validation inputs).
  - ADR `0005-vector-search.md` : report explicite de `sqlite-vec` à Phase 1, format BLOB choisi pour migration future à coût constant (compatibilité binaire avec `sqlite-vec`).

### Changed
- **Pivot du modèle de distribution** : open-source AGPL → **propriétaire source-available, free-use** sous Elastic License 2.0.
- `Cargo.toml` (workspace + `crates/core`) : `license = "LicenseRef-Elastic-2.0"`, `repository = "https://github.com/hmorales-pro/romanesk"`.
- `docs/LICENSE-CHOICE.md` réécrit pour acter la décision ELv2 et expliquer le raisonnement.
- `README.md`, `PRD.md` (§15 entière), `CONTRIBUTING.md` : retrait des mentions « open-source » au sens OSI ; positionnement clarifié en source-available free-use ; note CLA pour les contributions futures.
- `PHASE-0-PLAN.md` (J1) : objectif licence remis à jour vers ELv2.

### En cours
- Phase 0 : scaffolding Tauri, schéma DB initial, trait `Provider` IA, CI offline-only.

## [0.0.0] — 2026-05-02

### Added
- PRD v0.3 (vision, modèle de données, ancrage réel, distribution).
- Plan détaillé Phase 0 (`PHASE-0-PLAN.md`).
- Note de décision sur la licence (`docs/LICENSE-CHOICE.md`).
- Structure initiale du repo (README, CONTRIBUTING, CODE_OF_CONDUCT, .gitignore).

[Unreleased]: https://github.com/hmorales-pro/romanesk/compare/v0.0.0...HEAD
[0.0.0]: https://github.com/hmorales-pro/romanesk/releases/tag/v0.0.0
