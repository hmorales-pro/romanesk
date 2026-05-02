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
- **Phase 0 — J5** : `MockProvider` + example binary `ping_ollama`.
  - `crates/core/src/ai/mock.rs` : impl `Provider` avec staging de réponses (texte, embeddings, descriptions d'image, ping), compteurs d'appels par méthode, capabilities et id surchargeables. 8 tests unitaires.
  - `crates/core/examples/ping_ollama.rs` : binaire qui ping Ollama local et demande « Bonjour » à Gemma. Codes de sortie distincts pour healthcheck KO (1) et complétion KO (2). Surchargeable via `OLLAMA_MODEL` et `OLLAMA_BASE_URL`.
  - `ai/mod.rs` : re-exporte `MockProvider`, `OllamaConfig`, `OllamaProvider`, `TokenUsage`.
- **Phase 0 — J6** : commandes Tauri pour universe + entity, init DB au démarrage.
  - `apps/desktop/src-tauri/src/lib.rs` : setup callback qui ouvre la base SQLite dans `<app_data_dir>/romanesk.db` (par OS) et la `manage()` en `tauri::State`.
  - `apps/desktop/src-tauri/src/commands/`: 8 commandes (`universe_list/create/get/delete`, `entity_list_in_universe/create/get/delete`) + `CommandError` sérialisable + `CreateEntityPayload` typé pour les fiches Personnage.
- **Phase 0 — J7** : flow front end-to-end (3 pages + routing + persistance).
  - Deps : `@tanstack/react-query` 5 (state serveur), `react-router-dom` 7 (routing).
  - `src/lib/types.ts` : types TS qui miroitent `crates/core/src/domain.rs` (Universe, Entity, EntityType, CharacterContent + helper `characterContent(entity)`).
  - `src/lib/api.ts` : wrappers typés autour d'`invoke<T>(...)` pour les 8 commandes Tauri + `ping`.
  - `src/components/ui/{button,input,textarea,label,card}.tsx` : composants minimalistes shadcn-style avec `cn` helper et `forwardRef`.
  - `src/components/Layout.tsx` + `src/router.tsx` : `createHashRouter` (compatible Tauri sans config serveur), header nav, 3 routes.
  - `src/pages/{LibraryPage, UniversePage, EntityPage}.tsx` : Bibliothèque (liste univers + form inline), Univers (liste personnages + form), Fiche Personnage (read-only ; édition Tiptap arrive en J8).
  - `main.tsx` réécrit : `QueryClientProvider` + `RouterProvider` ; ancien `App.tsx` réduit à un re-export du Layout.
  - `pnpm typecheck` + `pnpm lint` verts.
- **Phase 0 — J9** : CI GitHub Actions offline-only sur 5 jobs.
  - `rust-fmt` (rustfmt --check), `rust-clippy` (clippy -D warnings avec deps Linux Tauri), `rust-test` (matrix Linux/Mac/Windows + feature offline-tests), `desktop-build` (build release Tauri Linux : pnpm build → cargo build), `front-checks` (pnpm typecheck + lint).
  - pnpm version bumpée à 10 (matches le lockfile).
  - Suppression de `pnpm test` du CI (pas de tests Vitest en Phase 0 ; à ré-activer en Phase 1).
  - Badge CI ajouté en haut du README.
- **Phase 0 — J8** : édition de la fiche personnage avec Tiptap.
  - `crates/core` : `UpdateEntity` (champs modifiables : name, summary, content, cover_image, is_real) + `EntityRepo::update(id, UpdateEntity)`. Trigger SQL `trg_entities_updated` met à jour `updated_at` automatiquement. 3 nouveaux tests d'intégration (replace, blank name, NotFound).
  - `apps/desktop/src-tauri` : commande `entity_update` + `UpdateEntityPayload` (biography typée `Value` opaque pour roundtripper le doc Tiptap bit-pour-bit). Helper `is_empty_biography` récursif qui détecte un doc avec uniquement des nœuds vides.
  - Front deps : `@tiptap/react`, `@tiptap/starter-kit`, `@tiptap/extension-placeholder` (v2.10).
  - `src/components/TiptapEditor.tsx` : composant React avec `useEditor`, accept `value: TiptapDoc | string | null` (legacy strings pré-J8 wrappées dans un paragraphe), placeholder configurable, prop `editable` pour le mode read-only.
  - `src/pages/EntityPage.tsx` réécrite : mode View (rendu Tiptap read-only) + bouton « Modifier » qui bascule en mode Edit (form complet : nom, archétype, traits, TiptapEditor pour biographie). Hydratation du form uniquement à la transition `false→true` via `useRef` (évite l'écrasement de la saisie après invalidation de query).
  - `src/index.css` : styles `.ProseMirror` minimaux pour Tiptap (paragraphes, titres, listes, blockquote, code, placeholder).

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
