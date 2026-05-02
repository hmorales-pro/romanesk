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
- [x] ~~`pnpm create tauri-app@latest`~~ → scaffold hand-écrit (Tauri 2 + React 18 + TS + Vite 6) dans `apps/desktop` — équivalent au template officiel, adapté au monorepo
- [x] Monorepo activé : `package.json` racine + `pnpm-workspace.yaml` (déjà présent) + `apps/desktop/src-tauri` ajouté au `[workspace] members` Cargo
- [x] Tailwind 4 (CSS-first via `@tailwindcss/vite`) + base shadcn/ui (`components.json`, `lib/utils.ts`, tokens CSS HSL dans `src/index.css`)
- [x] Page d'accueil minimale : titre « Romanesk », bouton « Pinger le runtime Rust » qui invoque la commande Tauri `ping` → renvoie `{ message: "pong", echoed_at: ISO8601 }` ; affichage de la réponse + horodatage
- [ ] **Validation chez Hugo** : `pnpm tauri dev` doit lancer l'app sur les 3 OS — non vérifiable depuis le sandbox (pas de display, Rust absent)

**Livrable J2** : pnpm install, pnpm typecheck, pnpm lint verts dans le sandbox. `pnpm tauri dev` à valider en local sur Mac/Linux/Windows.

### Jour 3 — Couche données
- [x] `crates/core` créé (déjà fait au bootstrap)
- [x] ~~`sqlx` + `refinery`~~ → **`sqlx::migrate!`** seul (voir ADR 0004) ; migrations embarquées au compile-time, pas besoin de `DATABASE_URL` à la build
- [x] `db/migrations/0001_init.sql` couvre toutes les tables du PRD §7 (déjà fait au bootstrap)
- [x] Repository pattern : `Repo::universes()` (create / get / list / hard_delete / soft_delete) et `Repo::entities()` (create / get / list_in_universe / count_in_universe / hard_delete / soft_delete)
- [x] Tests unitaires Repo en in-memory SQLite : 11 tests couvrant CRUD, FK CASCADE, soft-delete, round-trip JSON, FK violation
- [ ] **Validation chez Hugo** : `cargo test --workspace` (Rust absent du sandbox)

**Livrable J3** : code écrit + relu par un agent indépendant + 2 bugs corrigés (DateTime decoding fragile, lints pedantic). Compilation et tests à valider en local.

### Jour 4 — sqlite-vec & embeddings
- [x] ~~`sqlite-vec` extension~~ → **report en Phase 1** : fallback BLOB + cosine pur Rust pour Phase 0 (cf. ADR 0005). Migration future à coût constant (format binaire identique à `sqlite-vec`).
- [x] Table `embeddings` (déjà créée dans la migration 0001 au bootstrap)
- [x] Smoke test : insertion de vecteurs dim 4, recherche cosine top-k, filtre par dimension/modèle/source — 5 tests unitaires + 10 tests d'intégration
- [ ] **Validation chez Hugo** : `cargo test -p romanesk-core --test rag_integration`

**Livrable J4** : code écrit + relu par un agent indépendant + 5 warnings clippy fixés. Tests à valider en local.

### Jour 5 — Trait Provider IA + Ollama stub
- [x] Trait `Provider` défini (déjà fait au bootstrap)
- [x] `OllamaProvider` implémenté pour `/api/chat` (déjà fait au bootstrap) ; `/api/embeddings` reste TODO Phase 3
- [x] `Capabilities` (text, vision, embeddings, tool_use, long_context) (déjà fait au bootstrap)
- [x] Smoke test : `cargo run -p romanesk-core --example ping_ollama` → ping puis demande « Bonjour » à Gemma local
- [x] `MockProvider` avec staging de réponses + compteurs d'appels — 8 tests unitaires
- [ ] **Validation chez Hugo** : `cargo run -p romanesk-core --example ping_ollama` (avec Ollama démarré + un modèle Gemma chargé)

**Livrable J5** : MockProvider prêt pour les tests CI offline + binaire d'aller-retour avec Gemma local.

---

## Semaine 2 — Walking skeleton & CI

### Jour 6-7 — Premier flow end-to-end
- [x] UI : page « Bibliothèque » → liste univers, form inline « Nouvel univers »
- [x] UI : page « Univers » → liste personnages, form inline « Nouveau personnage » avec champs nom + archétype + traits + biographie
- [x] UI : page « Fiche personnage » → affichage read-only (édition + Tiptap arrivent en J8)
- [x] Tauri commands `universe_*` et `entity_*` qui wrappent le Repo (J6)
- [ ] **Validation chez Hugo** : `pnpm tauri dev`, créer univers + perso, fermer/rouvrir, vérifier persistance

**Livrable J7** : démo « créer univers → fiche perso → fermer/rouvrir » assemblable. Compilation Rust/Tauri à valider en local.

### Jour 8 — Éditeur Tiptap intégré
- [x] Tiptap dans la fiche personnage (`@tiptap/starter-kit` + `@tiptap/extension-placeholder`)
- [x] Sauvegarde en JSON dans `content_json.biography` via `entity_update` (Repo::entities().update + UpdateEntityPayload)
- [x] Restauration au reload : doc ProseMirror roundtrippé bit-pour-bit, mode read-only utilise le même éditeur Tiptap (cohérence visuelle)
- [ ] **Validation chez Hugo** : ouvrir une fiche, cliquer Modifier, écrire avec mise en forme, Enregistrer, fermer/rouvrir l'app, vérifier que tout est restauré

**Livrable J8** : édition riche complète pour la biographie d'un personnage. Format binaire compatible avec une migration future vers un éditeur tiers (Lexical, ADR 0002 conditionnellement déclenchable).

### Jour 9 — CI offline-only
- [x] `.github/workflows/ci.yml` réécrit en 5 jobs :
  - `rust-fmt` : rustfmt --check
  - `rust-clippy` : clippy -D warnings (avec deps Linux Tauri installées)
  - `rust-test` : matrix Linux + Mac + Windows, feature `offline-tests`
  - `desktop-build` : build release Tauri Linux (smoke build, pas de packaging)
  - `front-checks` : pnpm typecheck + lint
- [x] `Swatinem/rust-cache` + `pnpm install --frozen-lockfile` garantissent qu'aucun fetch surprise n'a lieu hors des deps lockées
- [x] Badge CI ajouté en haut du README
- [ ] **Validation chez Hugo** : push de la branche, vérifier que les 5 jobs passent vert sur GitHub Actions

**Livrable J9** : 5 jobs CI offline-only en place. Validation visuelle au premier push.

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
