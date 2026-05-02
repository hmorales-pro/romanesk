# Contribuer à Romanesk

Merci de l'intérêt. Le projet est en `pre-alpha` (Phase 0). Les changements sont volatils et la stack peut bouger jusqu'à la sortie de Phase 1. Si vous voulez contribuer maintenant : focus sur les issues étiquetées `good-first-issue` ou venez parler dans une Discussion GitHub avant d'ouvrir une grosse PR.

---

## Setup local

### Prérequis
- **Rust stable** (1.78+) — `rustup` recommandé
- **Node 20+** et **pnpm 9+**
- **SQLite 3.40+** (généralement préinstallé)
- (Recommandé) **Ollama** + un modèle Gemma local : `ollama pull gemma:latest`

### Cloner
```bash
git clone https://github.com/<org>/romanesk.git
cd romanesk
pnpm install
```

### Lancer en dev
```bash
pnpm tauri dev
```

### Tests
```bash
cargo test --workspace
pnpm test
```

---

## Conventions de code

### Rust
- `cargo fmt` (rustfmt par défaut)
- `cargo clippy --all-targets --all-features -- -D warnings`
- Modules courts, fichiers < 500 lignes idéalement
- Erreurs : `thiserror` côté lib, `anyhow` côté binaires

### TypeScript / React
- ESLint + Prettier (config dans le repo)
- Composants fonctionnels uniquement, pas de classes
- État : Zustand pour l'état global, TanStack Query pour les remote-like (Tauri commands)
- Pas de `any` non justifié

### SQL
- Migrations versionnées, jamais éditer une migration mergée — toujours en créer une nouvelle
- Noms de tables au pluriel snake_case (`lore_entities`, `temporal_snapshots`)
- Une transaction par opération métier

### Commits
- [Conventional Commits](https://www.conventionalcommits.org/) : `feat:`, `fix:`, `docs:`, `refactor:`, `chore:`, `test:`
- Sujet en français OU anglais — soyez cohérent dans une PR
- Sujet ≤ 72 caractères

---

## Workflow PR

1. Forkez (ou branche directe si membre du repo).
2. Branche : `feat/<court-descriptif>`, `fix/<...>`, `docs/<...>`.
3. Faites des commits atomiques.
4. Avant de pousser : `cargo test`, `pnpm test`, `cargo clippy`, `pnpm lint`.
5. Ouvrez une PR avec un description claire (problème résolu, comment vérifier).
6. Une review minimum (l'auteur en v1).
7. Merge en *squash and merge* sauf cas particulier.

---

## Architecture Decision Records (ADR)

Les décisions techniques structurantes sont documentées dans `docs/ADR/`. Avant de proposer un changement majeur (nouveau framework, refonte du modèle de données, changement de provider IA…), ouvrez une issue *« ADR proposal »* pour discussion.

---

## Tests

- Toute nouvelle fonction publique côté `crates/core` doit avoir au moins un test unitaire.
- Tout nouveau composant React qui contient de la logique métier doit avoir un test (Vitest + Testing Library).
- Les flows end-to-end critiques (création univers → fiche → persistance) ont des tests Tauri (à mettre en place en Phase 1).
- La CI **doit rester offline-only**. Si un test exige un appel réseau, mockez-le.

---

## Code of Conduct

Le projet suit le [Contributor Covenant 2.1](./CODE_OF_CONDUCT.md). Soyez respectueux, en bref.

---

## Licence des contributions

En contribuant, vous acceptez que vos contributions soient distribuées sous la même licence que le projet (voir `LICENSE`). Pas de CLA en v1.
