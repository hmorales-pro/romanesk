# Rétrospective — Phase 1 (Lore MVP)

> **Période** : tag `v0.0.1-phase0` → tag `v0.1.0`.
> **Objectif initial** : transformer le walking skeleton de Phase 0 en un véritable outil de worldbuilding utilisable. Fiches Personnage et Lieu, relations entre entités, vue graphe, tags, images, export Markdown.
> **Critère de sortie** : un univers complet (10+ entités, 5+ relations, tags, images) doit pouvoir être créé, navigué, exporté et restauré au reload sur une machine de tous les jours.

---

## Ce qui est livré

| Sprint | Statut | Commit | Effort approximatif |
|--------|--------|--------|---------------------|
| P1.1 Fiches Lieu (`Location` polymorphe) | ✅ | `25f4188` | ~1100 lignes (~600 perso comprises) |
| P1.2 Relations entre entités + 14 types figés | ✅ | `214fef0` | ~1060 lignes (220 tests) |
| P1.3 Vue graphe interactive (`@xyflow/react`) | ✅ | `f8d13e6` | ~430 lignes |
| P1.4 Tags + filtres + recherche | ✅ | `8b487a8` | ~800 lignes (160 tests) |
| P1.5 Images de couverture (Tauri dialog plugin) | ✅ | `d8f4f0f` | ~494 lignes (35 tests) |
| P1.6 Export Markdown (Tiptap → MD complet) | ✅ | `e312067` | ~568 lignes (120 tests) |
| **Total Phase 1** | ✅ | du `25f4188` au `d8f4f0f` | **~4 450 lignes (sans le release commit)** |

Aucun objectif Phase 1 du `PRD.md` §14 n'a été coupé. Tous les commits passent `pnpm typecheck` et `pnpm lint`. Les tests Rust ont été ajoutés au fil de l'eau (now ~70 tests d'intégration au total sur Phase 0+1).

---

## Ce qui a marché

### Polymorphisme propre sur `EntityType`

Le refactor P1.1 (commande `entity_create` générique sur kind + content libre) a payé : ajouter Location en P1.1 puis pouvoir réutiliser exactement la même architecture pour les futurs Faction/Object/Concept en P2 demande zéro nouveau code Rust côté commandes/repo. Tout est dans le builder TS.

### Le pattern « ADR avant l'implem »

L'ADR 0003 (set figé de 14 relations) a été écrite *avant* P1.2. Au moment d'implémenter, zéro hésitation : la table `RelationType` enum était directement dérivée de l'ADR, le set des labels en français était évident, le wiring back-front s'est fait en 2-3 commits propres. L'ADR a aussi évité un faux problème (« faut-il rendre les types extensibles ? »).

### Relectures par agent indépendant

Continué depuis Phase 0 — chaque commit important est passé chez un agent qui cherche les bugs sans biais d'auteur. Bilan Phase 1 : **5 vrais bugs attrapés avant commit** (perte silencieuse du `summary` Character en P1.1, JOIN unidirectionnel dans `list_in_universe` en P1.2, typo française « à inspiré » en P1.2, useEffect d'hydratation qui écrasait la saisie en P1.5). Sans ce filet, ils auraient explosé en prod ou pire, en silence.

### Composants réutilisables

`<TagChip>` exporté depuis `TagsSection` est utilisé à 2 endroits (fiche + filtre). `<TiptapEditor>` est utilisé en mode read-only (View) ET edit (Edit) — pas de duplication CSS. `EntityList` dans UniversePage prend `renderIcon` et `renderMeta` en props pour partager la logique entre Personnages et Lieux. À continuer en Phase 2.

### Stockage portable des images

P1.5 a posé le bon précédent : tout vit sous `<app_data_dir>/media/`, les paths stockés en DB sont **relatifs**. L'utilisateur peut zipper son répertoire de données, le restaurer ailleurs, l'app fonctionne. Cohérent avec le positionnement « no lock-in ».

---

## Ce qui a coincé

### `useEffect` + invalidation de query = piège récurrent

Vu en J8 puis ré-vu en P1.5 : un `useEffect` qui hydrate le state d'un form depuis `query.data` réécrit la saisie utilisateur quand la query est invalidée par une mutation. Pattern correctif : `useRef<boolean>` pour guard la transition `false → true` du mode édition. À standardiser ou abstraire en hook custom (`useFormHydration`?) en Phase 2.

### Tauri 2 plugins = capabilities à n'oublier

P1.5 a échoué une fois en silence parce que `dialog:default` n'était pas dans `capabilities/default.json`. Le plugin chargé côté Rust ne suffit pas — il faut autoriser le frontend à appeler ses commandes via la capability. Bonne checklist pour Phase 2 : *toute* nouvelle dep `tauri-plugin-*` doit ajouter sa capability le même commit.

### Le doc-comment sur un paramètre Rust

Première compilation de P1.1 a planté avec « allow, cfg, cfg_attr… are the only allowed built-in attributes in function parameters ». Le `///` que j'avais mis sur un paramètre de commande Tauri n'est pas autorisé en Rust — seulement les attributs (allow/cfg…). Hotfix immédiat (`35f0f36`) mais la friction valait le coup de noter.

### CI pas encore validée par un push

Phase 0 a posé le workflow `ci.yml` avec 5 jobs. **Aucun push GitHub n'a encore été fait** depuis Phase 0. Toute la Phase 1 a été compilée et testée chez Hugo en local, mais le premier push révélera peut-être des warnings clippy spécifiques aux versions exactes de la toolchain CI vs locale. À traiter dès le push v0.1.0.

### Pas de tests front

Toujours 0 test Vitest. Les helpers (`characterContent`, `cn`, `relationTypeLabel`…) seraient simples à couvrir. Reporté Phase 2 (encore).

### Confirmation native via `window.confirm`

`LibraryPage` utilise toujours un `window.confirm` natif pour la suppression. Décidé en Phase 0 mais devient gênant — le style Tauri dégage quand on est habitué au reste de l'UI shadcn-style. Première chose à faire en P2.0 : un Dialog shadcn.

---

## Décisions reportées en Phase 2

- **Fiches Faction / Object / Concept** : EntityType existe déjà côté Rust, il « suffit » d'ajouter les builders TS et les composants Detail. Probablement P2.1 à P2.3.
- **Galerie media multi-images** par fiche (table `media_assets` déjà dans la migration 0001 mais pas exploitée). Utile pour les Lieux.
- **Asset protocol Tauri** (`asset://`) à la place du base64 pour les images — performance critique si une fiche a 10+ images.
- **GC des fichiers orphelins** quand une entité est hard-deleted (les fichiers physiques restent actuellement).
- **Hook `useFormHydration`** abstrait pour le pattern useRef + transition.
- **Dialog shadcn** pour remplacer `window.confirm`.
- **Tests Vitest** sur les helpers et un test d'intégration React Testing Library sur `LibraryPage`.
- **CLA + ouverture du repo** : encore privé. À ouvrir si on veut les premières contributions.
- **Layout auto** dans la vue graphe (dagre ou elkjs) — pour le moment c'est un cercle initial, ce qui devient illisible >20 nœuds.
- **Filtres dans la vue graphe** (par EntityType, par tag).
- **Tag color picker** : actuellement la couleur est `null` à la création (couleur par défaut). UI pour customiser.
- **Update partiel d'entity** (`UpdateEntity` avec `Option<T>` par champ). Évite de devoir relire avant chaque update.
- **CI verte sur GitHub** au premier push.
- **Tag color picker** + édition de l'icône d'un type dans la barre de filtres.

---

## Métriques Phase 1

| Indicateur | Valeur |
|------------|--------|
| Sprints livrés | 6 (P1.1 à P1.6) + 1 release (P1.7) |
| Commits Phase 1 | 7 features + 1 hotfix + 1 chore-port + 1 release = 10 |
| Lignes ajoutées | ~4 450 (hors lockfile et docs auto-générés) |
| Tests Rust ajoutés | ~30 (relations 8, tags 8, repo update 4, vec 0, etc.) |
| Tests TS | 0 (toujours 0 — dette Phase 2) |
| Bugs attrapés en relecture | 5 |
| Décisions stratégiques tranchées | 0 (Phase 1 = exécution sur les ADR posées en Phase 0) |
| Plugins Tauri ajoutés | 1 (`tauri-plugin-dialog`) |
| Crates Rust ajoutés | 1 (`base64`) |
| Crates Rust supprimés | 0 |
| Modules Rust nouveaux dans `crates/core` | 1 (`export`) |
| Composants React nouveaux | 5 (TiptapEditor refactoré, RelationsSection, TagsSection/TagChip, CoverImage, GraphPage) |

---

## Conditions d'entrée Phase 2

Phase 2 (Temporalité — époques, événements, snapshots, frise) peut démarrer dès que :

- [ ] Hugo a fait passer `cargo check --workspace` + `cargo test --workspace` en local sur tous les commits Phase 1.
- [ ] La CI GitHub Actions est verte sur le tag `v0.1.0` après push.
- [ ] La capture vidéo de démo Phase 1 (5-10 min) est faite.
- [ ] Décision : extension du scope `EntityType` (Faction/Object/Concept) en Phase 1 bonus, ou directement Phase 2 (Temporalité) ?
- [ ] Le Dialog shadcn est ajouté pour remplacer les `window.confirm`.

Estimation Phase 2 : ~6-8 semaines selon le PRD §14. Premier livrable : `v0.2.0` avec époques, événements datables, frise visuelle, snapshots temporels.
