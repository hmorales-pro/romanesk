# Romanesk — Plan Phase 0 (2 semaines)

> **But de la Phase 0** : poser un *walking skeleton* — l'application démarre, écrit en SQLite, on lit le résultat, le routeur IA répond à un ping local, la CI tourne offline. Pas de feature utilisateur, juste les fondations sur lesquelles tout le reste s'empile sans dette.

> **Critère de sortie** : démo de 5 min montrant `Création d'un univers vide → création d'une fiche personnage minimale → fermeture de l'app → réouverture → la fiche est toujours là → l'app envoie un prompt à Ollama et affiche la réponse`.

---

## Stack figée pour la Phase 0

Décisions verrouillées ici pour ne pas y revenir avant la Phase 1.

| Couche | Choix | Raison de figer |
|--------|-------|-----------------|
| Runtime desktop | **Tauri 2** | Rust + WebView système ; ~10× plus léger qu'Electron ; accès filesystem natif |
| Frontend | **React 18 + TypeScript + Vite** | Écosystème massif, courbe maîtrisée |
| UI | **Tailwind 4 + shadcn/ui** | Components Radix-based, accessibles, OSS, pas de lock-in |
| Éditeur de texte | **Tiptap 2** *(à confirmer en POC OQ3)* | ProseMirror solide, extensions par lots, doc OSS-friendly |
| State front | **Zustand + TanStack Query 5** | Léger, suffisant ; pas de Redux |
| DB locale | **SQLite via `sqlx` (Rust)** | Robust, transactions ACID, single-file |
| Vecteurs | **`sqlite-vec` extension** | Pas de service séparé, vit dans la même DB |
| ORM/migrations | **`sqlx` macros + `refinery`** | Migrations versionnées, compat avec build offline |
| Couche IA | **Trait `Provider` Rust + impl Ollama d'abord** | Découpe nette, mocking facile en test |
| Tests | **`cargo test` côté Rust + Vitest côté front** | Standards |
| CI | **GitHub Actions, jobs offline-only** | Pas de fetch externe pendant le build |
| Lint/format | **`rustfmt` + `clippy` + `eslint` + `prettier`** | Auto en pre-commit |
| Pre-commit | **lefthook** | Léger, multi-langage |

Tout le reste (sync, vision providers, autres providers cloud) attendra explicitement les phases ultérieures.

---

## Layout du repo (à créer)

```
romanesk/
├── apps/
│   └── desktop/              # Tauri app (front + glue Tauri)
│       ├── src/              # Code React/TS
│       ├── src-tauri/        # Code Rust spécifique à l'app
│       │   ├── src/main.rs
│       │   └── Cargo.toml
│       ├── index.html
│       ├── package.json
│       ├── vite.config.ts
│       ├── tailwind.config.ts
│       └── tsconfig.json
├── crates/
│   └── core/                 # Logique métier (réutilisable)
│       ├── src/
│       │   ├── lib.rs
│       │   ├── repo/         # Repository pattern (CRUD lore)
│       │   ├── ai/           # Trait Provider + impls
│       │   │   └── provider.rs
│       │   ├── rag/          # Chunking + embedding
│       │   └── reality/      # RealityAnchor + WorldBrief
│       └── Cargo.toml
├── db/
│   └── migrations/
│       └── 0001_init.sql
├── docs/
│   ├── PRD.md                # → racine pour visibilité, lien ici
│   ├── PHASE-0-PLAN.md       # ← ce fichier
│   ├── LICENSE-CHOICE.md
│   └── ADR/                  # Architecture Decision Records
│       └── 0001-tauri-vs-electron.md
├── .github/
│   ├── workflows/
│   │   └── ci.yml
│   ├── ISSUE_TEMPLATE/
│   └── PULL_REQUEST_TEMPLATE.md
├── Cargo.toml                # Workspace racine
├── package.json              # Workspace pnpm
├── pnpm-workspace.yaml
├── README.md
├── LICENSE
├── CONTRIBUTING.md
├── CODE_OF_CONDUCT.md
├── CHANGELOG.md
├── ROADMAP.md
├── .gitignore
├── .editorconfig
└── lefthook.yml
```

---

## Semaine 1 — Décisions & infrastructure

### Jour 1 — Décisions & branding
- [ ] Trancher **OQ8** (vérifier `romanesk` libre : domaine, GitHub org, package npm/cargo)
- [x] ~~Trancher **OQ8b** (licence)~~ → ✅ **Elastic License 2.0** posée, voir `LICENSE` et `docs/LICENSE-CHOICE.md` (2026-05-02)
- [ ] Trancher **OQ3** (Tiptap vs Lexical) — POC parallèle de 2 h chaque, garder le gagnant
- [ ] Trancher **OQ5** (relations extensibles ou figées) — décision : **set figé en v1**, extensible en P1
- [ ] Créer le repo GitHub `romanesk/romanesk` (privé jusqu'à fin Phase 0)

**Livrable J1** : `docs/ADR/0001-stack.md`, `docs/ADR/0002-editor.md`, `docs/ADR/0003-relations.md`, `LICENSE` posé.

### Jour 2 — Scaffolding Tauri
- [ ] `pnpm create tauri-app@latest` → choisir React + TS + Vite, dans `apps/desktop`
- [ ] Restructurer en monorepo (workspace pnpm racine)
- [ ] Ajouter Tailwind + shadcn/ui (init, theme par défaut)
- [ ] Page d'accueil minimale : titre « Romanesk », un bouton qui appelle un command Tauri `ping` → renvoie « pong »
- [ ] `pnpm tauri dev` doit lancer l'app sur les 3 OS

**Livrable J2** : app Tauri qui démarre, ping/pong commande Rust ↔ TS fonctionnel.

### Jour 3 — Couche données
- [ ] Créer `crates/core` (workspace Cargo)
- [ ] Ajouter `sqlx` + `refinery` ; configurer en mode offline (compile-time check sur DB de référence checked-in)
- [ ] Créer `db/migrations/0001_init.sql` avec :
  - `universes`, `lore_entities`, `relations`, `temporal_snapshots`, `timeline_eras`, `events`
  - `reality_anchors`, `divergence_points`, `world_briefs`
  - `media_assets`, `tags`, `ai_sessions`, `notes`
- [ ] Repository pattern : `Repo::create_universe`, `Repo::create_entity`, `Repo::list_entities`
- [ ] Tests unitaires sur Repo (in-memory SQLite)

**Livrable J3** : tests verts sur Repo, migrations qui passent, schéma reflète le PRD §7.

### Jour 4 — sqlite-vec & embeddings
- [ ] Compiler / linker `sqlite-vec` extension dans `crates/core`
- [ ] Ajouter table `embeddings` (source_type, source_id, content, vector_blob, model, dim)
- [ ] Smoke test : insertion d'un vecteur dummy 384-dim, recherche cosine top-k

**Livrable J4** : `cargo test -p core test_vec_roundtrip` vert.

### Jour 5 — Trait Provider IA + Ollama stub
- [ ] Définir le trait `Provider` (cf. PRD §10.1)
- [ ] Implémenter `OllamaProvider` (HTTP local sur `localhost:11434`, support `/api/chat` et `/api/embeddings`)
- [ ] Définir `Capabilities` (text, vision, embeddings, tool_use)
- [ ] Smoke test (manuel d'abord) : `cargo run --example ping_ollama` → demande à Gemma « Bonjour » → renvoie réponse
- [ ] Mocking : `MockProvider` pour les tests

**Livrable J5** : un example binary qui prouve l'aller-retour avec Gemma 4 local.

---

## Semaine 2 — Walking skeleton & CI

### Jour 6-7 — Premier flow end-to-end
- [ ] UI : page « Bibliothèque » → liste les univers, bouton « Nouvel univers »
- [ ] UI : page « Univers » → liste les fiches personnages, bouton « Nouveau personnage »
- [ ] UI : page « Fiche personnage » → champs nom, archétype, traits[], texte libre (Tiptap minimal)
- [ ] Tauri commands `universe_*`, `entity_*` qui wrappent le Repo
- [ ] Persistance vérifiée : fermer l'app, rouvrir, données toujours là

**Livrable J7** : démo « créer univers → fiche perso → fermer/rouvrir » fonctionnelle.

### Jour 8 — Éditeur Tiptap intégré
- [ ] Tiptap dans la fiche personnage (StarterKit + `@tiptap/extension-placeholder`)
- [ ] Sauvegarde en JSON dans la colonne `content`
- [ ] Restauration au reload

**Livrable J8** : champ riche pour la biographie d'un personnage.

### Jour 9 — CI offline-only
- [ ] `.github/workflows/ci.yml` :
  - Job 1 : `cargo build --workspace --offline` (cache des deps)
  - Job 2 : `cargo test --workspace --offline`
  - Job 3 : `pnpm install --frozen-lockfile && pnpm test`
  - Job 4 : `pnpm tauri build` smoke (mac+linux+win)
- [ ] Vérifier qu'**aucun** job ne fetch quoi que ce soit hors deps
- [ ] Badge CI dans le README

**Livrable J9** : 4 jobs verts sur GitHub Actions, build offline prouvé.

### Jour 10 — Hardening & démo
- [ ] Logging structuré (`tracing` côté Rust, `pino` ou équivalent côté TS)
- [ ] Crash handler (panic → toast UI)
- [ ] `CHANGELOG.md` initial
- [ ] Capture vidéo de la démo Phase 0
- [ ] Rétro : *qu'est-ce qui a coincé, qu'est-ce qu'on rectifie pour Phase 1*

**Livrable J10** : tag `v0.0.1-phase0`, repo public si licence + branding OK, sinon on garde privé.

---

## Critères d'acceptation Phase 0

Phase 0 est *done* si **tous** ces points sont vrais :

- ✅ `pnpm tauri dev` lance l'app sur macOS, Linux, Windows
- ✅ `cargo test --workspace --offline` vert
- ✅ Création + persistance d'un univers et d'une fiche personnage
- ✅ Tiptap édite un champ riche, sauvegarde, recharge
- ✅ Ollama répond à un ping via le trait `Provider`
- ✅ `sqlite-vec` insère et retrouve un vecteur
- ✅ CI GitHub Actions offline-only verte
- ✅ Migrations versionnées (`refinery`) tournent fresh + idempotentes
- ✅ Repo public (ou prêt à le devenir) avec README, LICENSE, CONTRIBUTING, CODE_OF_CONDUCT
- ✅ ADR `0001-stack.md`, `0002-editor.md`, `0003-relations.md` rédigées

---

## Risques identifiés

| Risque | Mitigation |
|--------|------------|
| `sqlx` offline mode capricieux avec migrations dynamiques | Checker la DB de référence (`.sqlx/`) en CI |
| `sqlite-vec` build cross-platform (Windows surtout) | Avoir un *fallback* en BLOB + cosine custom Rust si nécessaire |
| Tauri 2 encore jeune sur certaines features (auto-updater, file system V2 API) | Stick au stable, attendre 2.x.y patch si bug bloquant |
| Ollama pas installé chez les contributeurs | Mock provider en CI ; doc d'install claire dans CONTRIBUTING |
| OQ3 (Tiptap vs Lexical) plus longue que 2 h | Time-box dur ; si non tranché, défaut Tiptap, on revisite en Phase 4 |

---

## Hors scope Phase 0

Pour qu'aucun PR ne dérive :

- ❌ Aucune fiche autre que Personnage (Lieu, Faction… → Phase 1)
- ❌ Aucune timeline ni snapshot (→ Phase 2)
- ❌ Aucune Q&A RAG ni génération de fiche (→ Phase 3)
- ❌ Aucune sync (→ Phase 5+)
- ❌ Aucun export EPUB/PDF (→ Phase 6)
- ❌ Pas de packaging signé / store

Toute envie de scope creep → ouvrir une issue, *pas* un commit.
