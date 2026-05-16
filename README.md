# Romanesk

[![CI](https://github.com/hmorales-pro/romanesk/actions/workflows/ci.yml/badge.svg)](https://github.com/hmorales-pro/romanesk/actions/workflows/ci.yml)

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
- **Free-use, formats ouverts.** Romanesk est gratuit pour tous (particuliers et entreprises), sans abonnement obligatoire. Pas de télémétrie cachée, pas de format de fichier exotique, pas de lock-in : tout exportable en Markdown/JSON.

---

## Documentation produit

- [`PRD.md`](./PRD.md) — Product Requirements Document complet (vision, modèle de données, architecture, phasing).
- [`PHASE-0-PLAN.md`](./PHASE-0-PLAN.md) — Plan détaillé de la phase de fondations (2 semaines).
- [`docs/LICENSE-CHOICE.md`](./docs/LICENSE-CHOICE.md) — Note de décision sur la licence (Elastic License 2.0).
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
git clone https://github.com/hmorales-pro/romanesk.git
cd romanesk
pnpm install
```

### Lancer l'app en dev
```bash
pnpm tauri dev
```

### Construire un bundle local (.dmg, .msi, .AppImage, .deb)
```bash
# Une seule fois — génère .icns macOS + Square*.png Windows à partir
# de src-tauri/icons/icon.png (1024×1024). Le chemin est relatif au
# crate desktop : pnpm --filter exécute la commande dans apps/desktop/.
pnpm --filter @romanesk/desktop tauri icon src-tauri/icons/icon.png

# Bundle pour l'OS courant
pnpm tauri build
```

Les bundles sortent dans `apps/desktop/src-tauri/target/release/bundle/`.
Les releases publiques sont produites par le workflow `release.yml` sur
push d'un tag `v*`.

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

Le repository est **privé pendant la Phase 0**. Les contributions externes seront ouvertes au plus tôt à la fin de la Phase 0, sous réserve d'un Contributor License Agreement. Lire [`CONTRIBUTING.md`](./CONTRIBUTING.md) pour le setup, les conventions, et le workflow PR.

---

## Licence

Romanesk est distribué sous **[Elastic License 2.0](./LICENSE)** — une licence propriétaire et source-available qui autorise l'usage gratuit, illimité, perso comme professionnel, mais interdit la redistribution sous forme d'un service hébergé concurrent. Détails dans [`docs/LICENSE-CHOICE.md`](./docs/LICENSE-CHOICE.md).

Romanesk **n'est pas un projet open-source au sens OSI** : c'est un projet propriétaire, source-available (à terme), free-use.

---

## Crédits & inspirations

- **Scrivener** pour avoir prouvé qu'un éditeur de manuscrit professionnel a sa place hors Word.
- **World Anvil**, **Campfire** pour avoir popularisé le worldbuilding outillé.
- **Obsidian** pour le local-first et le respect du format Markdown.
- **NovelCrafter**, **Sudowrite** pour avoir démontré que l'IA peut servir l'auteur, pas le remplacer.

Romanesk vise à combiner ces qualités dans un seul outil, **sans cloud obligatoire et sans abonnement**.
