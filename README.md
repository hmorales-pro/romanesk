# Romanesk

> Un environnement d'écriture local-first pour bâtir des univers fictionnels cohérents — et pour les habiter de récits.

**Statut** : `pre-alpha` — Phase 0 (fondations). N'utilisez pas pour un projet d'écriture sérieux avant la version 1.0.

---

## Pourquoi Romanesk

Les outils d'écriture actuels traitent le *worldbuilding* comme un appendice. Romanesk inverse la priorité : votre univers — ses personnages, lieux, factions, époques — est un objet de premier rang, vivant, indexé, interrogeable, **versionné dans le temps narratif**. La fiction se déploie ensuite par-dessus, et l'IA navigue ce socle plutôt que d'inventer à chaque prompt.

Trois partis pris :

1. **Lore-first.** L'éditeur de manuscrit est important, mais il vient *après* la modélisation du monde.
2. **Cohérence temporelle native.** Une entité (personnage, lieu, faction) a une histoire de versions, pas un état figé. Aldric en 1200 et Aldric en 1850 ne sont pas la même fiche.
3. **Ancrage réel optionnel.** Un univers peut être ancré à la réalité (récit historique, post-apo daté, uchronie type Fallout). L'IA respecte un *World Brief* validé par l'auteur, pas sa propre mémoire approximative.

Et trois engagements :

- **Local-first.** Vos données vivent sur votre machine, en SQLite lisible par n'importe quel outil. Aucun cloud par défaut.
- **IA pluggable.** Anthropic, OpenAI, Google, Mistral, **Ollama / Gemma 4 en local**. Vous choisissez votre provider, vous fournissez vos clés.
- **Open-source.** Pas de télémétrie cachée, pas de format propriétaire, pas de lock-in.

---

## Documentation produit

- [`PRD.md`](./PRD.md) — Product Requirements Document complet (vision, modèle de données, architecture, phasing).
- [`PHASE-0-PLAN.md`](./PHASE-0-PLAN.md) — Plan détaillé de la phase de fondations (2 semaines).
- [`docs/LICENSE-CHOICE.md`](./docs/LICENSE-CHOICE.md) — Note de décision sur la licence open-source.
- [`docs/ADR/`](./docs/ADR/) — Architecture Decision Records.

---

## Stack

| Couche | Choix |
|--------|-------|
| Runtime desktop | Tauri 2 (Rust + WebView) |
| Frontend | React 18 + TypeScript + Vite + Tailwind 4 + shadcn/ui |
| Éditeur | Tiptap 2 |
| DB locale | SQLite + `sqlite-vec` (vecteurs RAG) |
| Couche IA | Trait `Provider` Rust → Ollama / Anthropic / OpenAI / Gemini / Mistral |
| Tests | `cargo test` + Vitest |
| CI | GitHub Actions, build offline-only |

---

## Démarrage rapide (dev)

> ⚠️ Phase 0 en cours — le scaffolding initial arrive. Cette section sera fonctionnelle à la fin de la Semaine 1.

### Prérequis
- Rust stable (`rustup`) — 1.78+
- Node 20+ et **pnpm** 9+
- (Optionnel mais recommandé) [Ollama](https://ollama.com) avec un modèle Gemma installé : `ollama pull gemma:latest`

### Installer
```bash
git clone https://github.com/<org>/romanesk.git
cd romanesk
pnpm install
```

### Lancer l'app en dev
```bash
pnpm tauri dev
```

### Tester
```bash
cargo test --workspace
pnpm test
```

---

## Roadmap (résumé)

| Phase | Objectif | Statut |
|-------|----------|--------|
| **Phase 0** | Fondations — walking skeleton (Tauri + DB + provider IA stub + CI) | 🛠 en cours |
| Phase 1 | Lore MVP — fiches Personnage / Lieu, relations, vue graphe | ⏳ |
| Phase 2 | Temporalité — époques, événements, snapshots, frise | ⏳ |
| Phase 3 | Couche IA + RAG + Ancrage réel | ⏳ |
| Phase 4 | Histoires + chapitrage + IA en édition | ⏳ |
| Phase 5 | Atelier description vision, fiches Faction / Objet / Concept | ⏳ |
| Phase 6+ | Sync multi-device, exports EPUB/PDF, templates par genre | 🔮 |

Le détail vit dans `PRD.md` (section 14).

---

## Contribuer

Toute aide bienvenue à partir de la Phase 1. D'ici là, le projet est en stabilisation rapide et les changements sont volatils. Lire [`CONTRIBUTING.md`](./CONTRIBUTING.md) pour le setup, les conventions, et le workflow PR.

Les issues étiquetées [`good-first-issue`](https://github.com/<org>/romanesk/issues?q=label%3Agood-first-issue) sont les meilleurs points d'entrée.

---

## Licence

À trancher en Phase 0 — voir [`docs/LICENSE-CHOICE.md`](./docs/LICENSE-CHOICE.md). Recommandation par défaut : **AGPL-3.0** (alignée avec l'esprit local-first et privacy-first).

---

## Crédits & inspirations

- **Scrivener** pour avoir prouvé qu'un éditeur de manuscrit professionnel a sa place hors Word.
- **World Anvil**, **Campfire** pour avoir popularisé le worldbuilding outillé.
- **Obsidian** pour le local-first et le respect du format Markdown.
- **NovelCrafter**, **Sudowrite** pour avoir démontré que l'IA peut servir l'auteur, pas le remplacer.

Romanesk vise à combiner ces qualités dans un seul outil, **sans cloud obligatoire et sans abonnement**.
