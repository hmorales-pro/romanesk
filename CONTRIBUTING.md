# Contribuer à Romanesk

> **Statut** : le repository est **privé pendant la Phase 0**. Les contributions externes ne sont pas encore ouvertes. Ce document décrit les conventions et le workflow qui s'appliqueront à l'ouverture du repo (au plus tôt à la fin de la Phase 0).

Merci de l'intérêt. Le projet est en `pre-alpha` (Phase 0). Les changements sont volatils et la stack peut bouger jusqu'à la sortie de Phase 1. Si vous voulez signaler un bug ou suggérer une feature en attendant l'ouverture du repo, contactez l'auteur directement.

---

## Setup local

### Prérequis
- **Rust stable** (1.78+) — `rustup` recommandé
- **Node 20+** et **pnpm 9+**
- **SQLite 3.40+** (généralement préinstallé)
- (Recommandé) **Ollama** + un modèle Gemma local : `ollama pull gemma:latest`

### Cloner
```bash
git clone https://github.com/hmorales-pro/romanesk.git
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

Romanesk est distribué sous **Elastic License 2.0** (voir `LICENSE` et `docs/LICENSE-CHOICE.md`). C'est une licence **propriétaire et source-available**, pas une licence open-source au sens OSI.

Conséquence importante pour les contributions :

- **Toute PR externe acceptée à l'ouverture du repo nécessitera la signature d'un Contributor License Agreement (CLA)** qui assigne le copyright à Hugo Morales (l'auteur). Cette assignation est ce qui permet de continuer à pouvoir vendre des licences commerciales d'exception ou de relicencier le projet plus tard.
- Le mécanisme exact (DCO simple ou CLA via CLA Assistant / EasyCLA) sera fixé *avant* la première PR externe acceptée.
- Tant que le repo est privé, le sujet ne se pose pas — seul Hugo écrit du code.

Si ce modèle ne vous convient pas, ne contribuez pas. C'est un choix conscient pour préserver la viabilité économique long terme du projet (qui restera gratuit pour ses utilisateurs finaux).
