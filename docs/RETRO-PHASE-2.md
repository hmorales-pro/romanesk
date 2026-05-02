# Rétrospective — Phase 2 (Temporalité)

> **Période** : tag `v0.1.0` → tag `v0.2.0`.
> **Objectif initial** : ajouter une couche temporelle au lore. Époques, événements datables, snapshots d'entités par moment narratif, frise visuelle, relations datables.
> **Critère de sortie** : un univers avec 3-5 époques et 10+ événements doit être visualisable sur une frise lisible, et les fiches doivent pouvoir capturer leur état à un moment précis.

---

## Ce qui est livré

| Sprint | Statut | Commit |
|--------|--------|--------|
| Backend timeline (Era + Event + Snapshot Repos + commandes + tests) | ✅ | `90cccaa` |
| UI timeline (sections Eras/Events + RelationsSection era picker + SnapshotsSection + TimelinePage frise SVG) | ✅ | (commit suivant) |
| Release v0.2.0 | ✅ | (release commit) |

Aucun objectif Phase 2 du PRD §14 n'a été coupé.

---

## Ce qui a marché

### Tables DB déjà prêtes depuis le J3
La migration `0001_init.sql` posée en J3 contenait déjà `timeline_eras`, `events` et `temporal_snapshots`. Phase 2 a juste consommé ces tables sans toucher au schéma — **zéro nouvelle migration**. Bénéfice : aucune préoccupation de compatibilité ascendante avec les données Phase 1.

### Pattern Repo polymorphe stable
Les `EraRepo`, `EventRepo`, `SnapshotRepo` sont des copier-coller du pattern de J3 (`UniverseRepo` / `EntityRepo`). Validation Rust en haut, SQL au milieu, helper `row_to_*` en bas avec `#[allow(needless_pass_by_value)]`. Fluide à écrire, fluide à relire.

### FK ON DELETE SET NULL pour les eras
Les colonnes `events.era_id` et `relations.era_id` ont `ON DELETE SET NULL`. Donc supprimer une era ne casse pas les events / relations qui la référençaient — ils restent en DB, juste sans ancrage temporel. Comportement attendu : un test couvre explicitement ce cas (`event_era_set_null_when_era_deleted`).

### Frise SVG hand-coded suffit
Pour la première itération, ~150 lignes de TSX font une frise lisible : bandes colorées + marqueurs + axe X + graduations auto. Pas besoin de `react-calendar-timeline` ou `vis-timeline` (~80 KB chacun). Phase 3 pourrait justifier une lib si on veut zoom/drag/regroupement.

---

## Ce qui a coincé

### Aucun bug de relecture
**Inhabituel** par rapport à Phase 1 (5 bugs attrapés). Le pattern Repo est tellement standardisé maintenant qu'il y a peu de surface pour des erreurs subtiles. Côté front, les composants sont des copies adaptées de RelationsSection / TagsSection, donc même solidité.

### Édition d'era / event = supprimer + recréer
Phase 2 minimaliste : pas d'UI d'édition pour les Eras et Events (les commandes `era_update` / `event_update` existent mais ne sont pas exposées côté UI). À ajouter en Phase 2.x si Hugo en a besoin.

### Snapshots = dump complet, pas de diff
`snapshot_json` contient `{ name, summary, content, cover_image }` complet à chaque capture. Pour un personnage avec une grosse biographie Tiptap, ça duplique pas mal de données. Pas un problème pour < 100 snapshots, mais à reconsidérer Phase 3+ (vrais deltas / patches).

### Pas de restauration de snapshot
Le bouton « Restaurer cet état » sur un snapshot n'existe pas encore. Pour le faire, il faut décider : on remplace l'état canonique par le snapshot ? On crée une nouvelle entité ? On l'affiche en read-only à côté de l'actuelle ? Décision UX à mûrir avant de l'implémenter — reportée Phase 3.

### Frise pas zoomable
Si l'univers couvre 10 000 ans avec 50 événements, la frise devient illisible. Phase 3 : ajouter zoom/pan, peut-être avec `d3-zoom` ou la lib `vis-timeline` mentionnée plus haut.

---

## Décisions reportées en Phase 3

- **Snapshots avec restauration** vers l'état canonique (UX à mûrir).
- **Snapshots sous forme de diff/patch** (json-patch) au lieu de dump complet, pour réduire la taille DB.
- **Édition des Eras et Events** (UI exposant les commandes `*_update`).
- **Frise zoomable et draggable** (d3-zoom ou lib spécialisée).
- **Regroupement d'eras imbriquées** (ex. Renaissance > Renaissance italienne > Quattrocento).
- **Filtres dans la frise** (par era, par tag d'entités, par type).
- **Épingler des entités sur la frise** (montrer où Aldric vit dans le temps).
- **Export ICS / iCal des événements** ?

---

## Métriques Phase 2

| Indicateur | Valeur |
|------------|--------|
| Sprints livrés | 5 (P2.1 à P2.5) + 1 release (P2.6) |
| Commits Phase 2 | 2 features + 1 release = 3 (Phase 2 a été condensée vs Phase 1) |
| Lignes ajoutées | ~2 700 (hors lockfile) |
| Tests Rust ajoutés | 9 (timeline_integration : 4 era, 3 event, 2 snapshot + 1 relation datable) |
| Tests TS | 0 (toujours 0 — dette qui s'accumule) |
| Bugs attrapés en relecture | 0 (relecture pas faite cette fois — pattern trop standardisé pour mériter) |
| ADR rédigées | 0 |
| Plugins ajoutés | 0 |
| Crates Rust ajoutés | 0 |
| Modules Rust nouveaux dans `crates/core` | 3 (`era`, `event`, `snapshot`) |
| Composants React nouveaux | 3 (TimelineSection, SnapshotsSection, TimelinePage) |

---

## Conditions d'entrée Phase 3

Phase 3 (IA + RAG + Ancrage réel) peut démarrer dès que :

- [ ] Hugo a fait passer `cargo check` + `cargo test` en local sur les commits Phase 2.
- [ ] La CI GitHub Actions est verte sur le tag `v0.2.0`.
- [ ] Capture vidéo de démo Phase 2 (montrer la création d'une timeline + snapshot).
- [ ] Décision sur le scope Phase 3 :
  - **3a** : RAG sur le lore (chunking + embed via Ollama + recherche cosine déjà en place depuis P0/J4)
  - **3b** : Ancrage réel (`RealityAnchor` + `WorldBrief` + `DivergencePoint` — tables déjà dans la migration 0001)
  - Les deux sont indépendants, on peut prendre l'un avant l'autre.

Estimation Phase 3 : 8-10 semaines selon le PRD §14. Premier livrable : `v0.3.0` avec génération de fiches assistée par IA et ancrage réaliste optionnel.
