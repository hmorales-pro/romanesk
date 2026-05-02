# ADR 0001 — Stack technique de base

- **Statut** : Accepté
- **Date** : 2026-05-02
- **Décideurs** : Hugo Morales

## Contexte

Romanesk est une application desktop local-first qui doit fonctionner sur macOS, Linux et Windows, gérer une DB locale, intégrer un éditeur de texte riche, et orchestrer des appels IA (cloud + local). Choix de stack à figer pour la Phase 0.

## Décision

| Couche | Choix | Alternative considérée |
|--------|-------|------------------------|
| Runtime desktop | **Tauri 2** (Rust + WebView système) | Electron (rejeté : ~10× plus lourd, RAM/binaire) |
| Frontend | **React 18 + TypeScript + Vite** | Solid (écosystème UI plus pauvre) |
| UI | **Tailwind 4 + shadcn/ui** | Mantine (plus opinionated, moins flexible) |
| Éditeur | **Tiptap 2** (pendant un POC, sinon Lexical) | Lexical (à benchmarker en POC OQ3) |
| State | **Zustand + TanStack Query** | Redux (verbeux), Jotai (moins établi) |
| DB | **SQLite via `sqlx`** | DuckDB (overkill), LMDB (trop bas niveau) |
| Vecteurs | **`sqlite-vec`** | LanceDB / Qdrant (services séparés, contre l'esprit local-first) |
| Migrations | **`refinery`** | `sqlx migrate` (suffisant mais moins ergonomique) |

## Raisons clés

- **Tauri** : binaire ~10 Mo vs ~150 Mo pour Electron. Vital pour un outil personnel local-first qui doit s'installer sans friction.
- **SQLite + sqlite-vec** : un seul fichier de stockage par univers, lisible avec un simple `sqlite3`, vecteurs collés aux données. Aucun service à installer.
- **React + TS** : maturité, écosystème, recrutement de contributeurs OSS plus simple qu'avec Solid/Svelte.
- **Tailwind + shadcn/ui** : composants Radix-based accessibles, sans lock-in. shadcn = code copié dans le repo, donc forkable à 100%.

## Conséquences

- L'équipe (= l'auteur) doit maîtriser Rust *et* TypeScript. C'est le prix d'un local-first sérieux.
- L'éditeur (Tiptap vs Lexical) reste un point ouvert (OQ3) ; à trancher en POC court avant la Semaine 2 de Phase 0.
- Les contributeurs doivent installer la chaîne Rust ET pnpm. Documenté dans `CONTRIBUTING.md`.
- Pas de support web direct — Tauri produit du desktop uniquement. Si un jour besoin de web, séparer le `core` Rust en service WASM ou backend.

## Alternatives écartées

- **Electron** : trop gourmand pour l'esprit du projet.
- **Native (Swift/Kotlin/Win32)** : multi-plateforme triple coût, pas viable solo.
- **Web pur (PWA)** : pas de vrai accès filesystem, pas de SQLite local fiable, pas de bindings Rust natifs.
- **Flutter** : écosystème côté éditeur de texte riche très pauvre.
