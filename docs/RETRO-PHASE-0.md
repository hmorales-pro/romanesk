# Rétrospective — Phase 0 (fondations)

> **Période** : kick-off → tag `v0.0.1-phase0`.
> **Objectif initial** : poser un *walking skeleton* — l'app démarre, écrit en SQLite, on lit le résultat, le routeur IA répond à un ping local, la CI tourne offline. Pas de feature utilisateur, juste les fondations.
> **Critère de sortie** : démo « créer univers vide → fiche personnage minimale → fermer/rouvrir → la fiche est là → ping Ollama → réponse affichée ».

---

## Ce qui est livré

| Bloc | Statut | Détail |
|------|--------|--------|
| Repo bootstrap (PRD, ROADMAP, ADR 0001) | ✅ | Commit `32bf9f8` |
| Licence Elastic 2.0 + ADR 0002/0003/0004/0005 | ✅ | Commit `6a5f033` puis ADR 0004/0005 ajoutées dans J3/J4 |
| Scaffold Tauri 2 + React 18 + Vite 6 + Tailwind 4 + shadcn/ui | ✅ | Commit `043cdf2` |
| Couche DB SQLite + migrations sqlx::migrate! + Repo CRUD | ✅ | Commit `16c684c` — 11 tests d'intégration in-memory |
| Stockage vectoriel BLOB f32 + cosine pur Rust | ✅ | Commit `be564d9` — 5 tests unitaires + 10 tests d'intégration |
| MockProvider + example binary `ping_ollama` | ✅ | Commit `b16d742` — 8 tests unitaires |
| Commandes Tauri universe + entity + init DB par OS | ✅ | Commit `c011bb3` |
| 3 pages front (Bibliothèque, Univers, Fiche) + routing | ✅ | Commit `c179fd9` |
| Édition fiche personnage avec Tiptap (StarterKit + Placeholder) | ✅ | Commit `7737f6a` — 3 tests d'intégration update |
| CI GitHub Actions 5 jobs offline-only + badge README | ✅ | Commit `3906ef8` |
| Logging structuré tracing + panic hook + ErrorBoundary React | ✅ | Commit J10 |
| Tag `v0.0.1-phase0` | ✅ | Tag annoté local — push à la discrétion |

Tous les critères d'acceptation Phase 0 du `PHASE-0-PLAN.md` sont passés, à l'exception de :

- **`pnpm tauri dev` testé sur les 3 OS** : non vérifié dans la session de dev (sandbox Linux sans GUI ni Rust). À valider chez Hugo localement.
- **Capture vidéo de la démo** : reportée, à filmer sur la machine de Hugo une fois le flow validé.

---

## Ce qui a marché

### Découpage J1-J10 du plan
Le plan est tenu jour par jour. Chaque commit est petit, atteignable, et se lit comme une étape. Le pattern « 1 jour = 1 commit » a survécu à la fatigue de fin de phase.

### Relecture par agent indépendant à chaque commit Rust
Sans `cargo` dans le sandbox de dev, impossible de faire `cargo check` localement. La parade : un agent Claude indépendant relit chaque PR Rust avant commit, en cherchant explicitement les bugs sqlx 0.8, les warnings clippy promus en errors, et les pièges Tauri 2. **Bilan : 12 bugs réels attrapés et fixés avant commit** sur J3 (2), J4 (5), J5 (2), J6 (2), J8 (3) — la plupart auraient explosé en CI ou en runtime de test.

### Décision de licence claire et documentée
Pivoter d'AGPL-3.0 vers Elastic License 2.0 a pris ~30 min, mais la note `LICENSE-CHOICE.md` qui acte la décision et explique le raisonnement (free use total + protection SaaS + pas de conversion) est ce qui permettra de tenir le cap quand un contributeur posera la question.

### Format BLOB f32 pour les embeddings
Choix de format binaire identique à `sqlite-vec` dès la J4, sans dépendre de l'extension. La migration future (Phase 1) sera juste un index virtuel — pas de re-encodage. Décision documentée dans ADR 0005.

### Hash router Tauri
`createHashRouter` de react-router-dom marche sans aucune config serveur, survit aux reloads Vite, et est cohérent avec le modèle URL `tauri://` en prod. Évité un faux problème.

---

## Ce qui a coincé

### Pas de Rust dans le sandbox de dev
Bloquant pour valider la compilation localement. La parade « agent indépendant » a marché, mais reste plus fragile qu'un `cargo check` réel. **Action Phase 1** : si on continue en Cowork mode, demander un sandbox avec rustup pré-installé OU ouvrir un sous-script qui pousse vers un build CI éphémère pour pré-validation.

### Tauri 2 versioning fragile
Plusieurs frictions pendant J6/J8 :
- `app.path().app_data_dir()` requiert `tauri::Manager` en scope (pas évident depuis la doc).
- `editor.commands.setContent(content, emitUpdate)` : signature `(content, boolean)` en Tiptap 2.x, `(content, { emitUpdate })` en Tiptap 3. L'agent de relecture a inversé. Le typecheck a tranché.
- Schema des capabilities Tauri 2 (`core:default` + `shell:allow-open`) : implicite, peu documenté. Pas de problème *à ce stade*.

### Tailwind 4 + shadcn/ui sans CLI
Tailwind 4 est CSS-first (plugin Vite, pas de `tailwind.config.ts` requis). shadcn/ui CLI ne tourne pas pendant un build sandbox. → composants UI hand-écrits dans `apps/desktop/src/components/ui/` (Button, Input, Textarea, Label, Card). 5 fichiers, ~150 lignes au total, mais au moins on contrôle.

### sqlx 0.8 + sqlite avec UUID stocké en TEXT
Les conversions `Uuid` ↔ `TEXT` se font à la main (`.to_string()` / `Uuid::parse_str`). La feature `uuid` de sqlx-sqlite simplifierait, mais ajoute de la magie qu'on évite en Phase 0. À reconsidérer Phase 1.

### Lints clippy::pedantic + RUSTFLAGS=-D warnings
Le combo est strict. Plusieurs lints (`missing_errors_doc`, `missing_panics_doc`, `module_name_repetitions`, `needless_pass_by_value`, `float_cmp`, `cast_precision_loss`) ont nécessité soit des fixes soit des `#[allow]` ciblés. Pour Phase 0 on a accepté quelques `#[allow]` au niveau crate ou module, à durcir en Phase 1.

---

## Décisions reportées en Phase 1

- **`sqlite-vec` extension** (ADR 0005) : à activer si N ≥ 50 000 vecteurs ou dim ≥ 1024 sur un dataset réel. Backfill = simple `INSERT INTO vec_embeddings_<dim> SELECT id, vector FROM embeddings WHERE dim = <DIM>` puisque le format BLOB f32 LE est identique.
- **Bundle Tauri activé + icônes** (`bundle.active = false` dans `tauri.conf.json`) : activer dès qu'on a un jeu d'icônes Romanesk décent. Sans ça, `pnpm tauri build` plante.
- **Update partiel d'entity** : actuellement `EntityRepo::update` remplace tous les champs modifiables en bloc. Phase 1 : `UpdateEntity` avec `Option<T>` par champ pour patch partiel quand la collaboration multi-tab arrivera.
- **CLA pour contributions externes** (`LICENSE-CHOICE.md`) : à mettre en place avant la première PR externe acceptée si le repo s'ouvre.
- **Tests Vitest côté front** : 0 test pour l'instant. Phase 1 = ajouter au moins un test sur `characterContent()` (helper de décodage), `cn` helper, et un test d'intégration React Testing Library sur `LibraryPage`.
- **Dialog shadcn pour les confirmations de suppression** : remplace les `window.confirm` natifs.
- **Update entity avec optimistic UI** : actuellement le bouton « Enregistrer » désactive le form pendant la mutation. Optimistic update pour ressentir l'instantanéité.
- **`@tailwindcss/typography`** pour le rendu Tiptap : remplacer les styles `.ProseMirror` à la main de `index.css`.
- **Logging structuré côté front** : `pino` ou un wrapper minimaliste qui synchronise avec le `tracing` Rust côté Tauri (via une commande `log`).

---

## Métriques

| Indicateur | Valeur |
|------------|--------|
| Commits Phase 0 | 11 (du bootstrap au tag) |
| Lignes de code Rust | ~2 200 (hors tests) |
| Lignes de tests Rust | ~1 000 (28 tests d'intégration + 16 tests unitaires) |
| Lignes de code TypeScript / React | ~1 800 |
| ADR rédigées | 5 (stack, éditeur, relations, migrations, vector search) |
| Bugs attrapés en relecture (avant commit) | 12 |
| Décisions stratégiques tranchées | 6 (licence, éditeur, relations, migrations, vector search, modèle distribution) |
| Critères d'acceptation Phase 0 atteints | 9/11 (manque : `pnpm tauri dev` 3 OS + capture vidéo, à valider/produire chez Hugo) |

---

## Conditions d'entrée Phase 1

Phase 1 (Lore MVP : fiches Personnage / Lieu, relations, vue graphe) peut démarrer dès que :

- [ ] Hugo a fait passer `cargo check --workspace` + `cargo test --workspace` + `pnpm tauri dev` en local (Mac).
- [ ] La CI GitHub Actions est verte sur le premier push.
- [ ] La capture vidéo de démo Phase 0 est faite (5 min).
- [ ] La rétro est relue et discutée si Hugo travaille avec quelqu'un.

Estimation Phase 1 : ~10 semaines selon le PRD. Premier livrable : `v0.1.0` avec un univers + fiches Personnage + Lieu + relations + export Markdown.
