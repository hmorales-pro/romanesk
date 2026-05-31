# Changelog

Format inspiré de [Keep a Changelog](https://keepachangelog.com/) ; le projet suit (à terme) [Semantic Versioning](https://semver.org/).

## [Unreleased]

_Rien pour l'instant — Phase 7 démarre au prochain commit._

## [0.6.0] — 2026-05-02

Tag de fin de Phase 6 (Vision, multi-modèles, exports avancés).
Romanesk gagne 5 modèles IA configurables, le mode image (vision
Ollama), une sortie JSON typée pour la cohérence, l'export Markdown
des stories et le drag-and-drop des chapitres.

### Added — Phase 6
- **P6.1** : AI draft pour Faction / Object / Concept. Étend
  `ai_generate_entity_draft` (P3.2 ne couvrait que Character /
  Location). 9 nouveaux champs dans `EntityDraft` (faction_kind,
  ideology, founded, leader, object_kind, origin, owner, properties[],
  concept_kind, domain). Composant `<AiDraftPanel>` couplage minimal
  intégré dans les 3 fiches en mode édition.
- **P6.2** : Override modèle par action IA + Tauri event broadcast.
  `AppSettings` gagne `creative_model` et `literal_model`. Hook
  `useSettings()` partagé avec helper `pickModel(kind)` qui résout le
  fallback. 4 panels câblés (Continue/Brainstorm/Description = creative,
  Actions/rewrite/summarize = literal). `settings_save` émet
  `app.emit("settings-changed", ...)` ; `<AIStatusBadge>` écoute via
  `@tauri-apps/api/event.listen()` et invalide les queries instantanément.
- **P6.3** : Sortie JSON structurée pour `<AiConsistencyPanel>`. Prompt
  strict JSON + parser robuste (isole `{` ... `}` puis JSON.parse) +
  fallback gracieux sur le texte brut. Liste typée d'incohérences
  (kind: lore/anachronism/other × severity: minor/major/blocker) avec
  badges colorés et suggestions de correction.
- **P6.4** : Drag-and-drop natif HTML5 pour réordonner les chapitres.
  ~50 lignes, 0 dépendance externe. Boutons ▲/▼ gardés en fallback.
  Affordance visuelle : icône `GripVertical` + cursor-grab + opacity-40
  sur le dragged + dashed border sur la drop zone.
- **P6.5** : Export d'une story en Markdown. Fonction Rust
  `render_story_markdown(story, chapters)` qui utilise `render_tiptap_doc`
  (P1.6) pour les bodys. Commande Tauri `story_export_markdown` +
  bouton « Exporter MD » dans le header de StoryPage. Copie dans le
  presse-papier (cohérent avec le pattern UniversePage).
- **P6.6** : Atelier description en mode image (vision Ollama).
  `OllamaProvider.describe_image()` implémenté (était TODO depuis P3) :
  encode l'image en base64, POST sur `/api/chat` avec
  `messages.images=[b64]`. Nouvelle commande Tauri `ai_describe_image`.
  `AppSettings.vision_model` opt-in. Si configuré, bouton « Image » dans
  `<AiDescriptionPanel>` qui ouvre le dialog Tauri pour choisir une
  image et appelle le modèle vision avec un prompt qui respecte les
  champs structurés déjà remplis.

### Changed — Phase 6
- `EntityDraft` (Rust + TS) étendu avec 9 nouveaux champs (Faction +
  Object + Concept).
- `AppSettings` (Rust + TS) gagne 3 champs optionnels :
  `creative_model`, `literal_model`, `vision_model`. Tous fallback sur
  `chat_model` (compat ascendante totale).
- `AiConsistencyPanel` : prompt JSON strict + fallback texte gracieux.
  Verdict header passe à 3 états (Cohérent / À vérifier / Incohérences
  majeures).
- Helper TS factorisé : `apps/desktop/src/lib/use-settings.ts`
  (déduplication react-query + helper `pickModel`).

### Dependencies
- `crates/core/Cargo.toml` : ajout `base64 = "0.22"` (pour vision).

### Versions
- 0.5.0 → **0.6.0** sur Cargo.toml workspace + crates/core +
  apps/desktop/src-tauri + tauri.conf.json + apps/desktop/package.json
  + Layout.tsx (badge version) + Cargo.lock (deps internes).
- Rétro complète : voir [`docs/RETRO-PHASE-6.md`](./docs/RETRO-PHASE-6.md).

[0.6.0]: https://github.com/hmorales-pro/romanesk/releases/tag/v0.6.0

## [0.5.0] — 2026-05-02

Tag de fin de Phase 5 (Atelier description + multi-types + IA augmentée).
Romanesk gagne 3 types d'entités (Faction / Object / Concept), un
auto-save, le hot-reload des providers IA, un brainstorm transversal,
un atelier description sur fiches, et l'extension anachronismes du panel
cohérence.

### Added — Phase 5
- **P5.1** : Fiches **Faction** (gouvernement / guilde / secte / clan /
  compagnie), **Object** (artefact / arme / armure / livre / relique /
  outil), **Concept** (magie / religion / technologie / philosophie /
  langue). 3 helpers TS, 3 builders API, 3 composants Detail, 1 composant
  générique `<SimpleEntitySection>` paramétrable. **Zéro changement
  backend** — l'archi polymorphe d'EntityType (P1) couvrait déjà tout.
- **P5.2** : **Auto-save** debounced 3s sur les chapitres. Plante un
  setTimeout à chaque changement de body/title/status, le clear si
  nouvelle modif arrive, n'écrase jamais une mutation en cours.
  Indicateurs visuels « modifié » (amber) / « sauvegarde… » (bleu) /
  « ✓ enregistré » (emerald). Ctrl/Cmd-S explicite reste prioritaire.
- **P5.3** : **Hot-reload des providers IA** après `settings_save`.
  Refactor minimal : `AiProvider` et `AiEmbedder` deviennent
  `Arc<RwLock<...>>`, chaque commande IA snapshote en début d'exécution
  via `provider.snapshot().await`. `settings_save` reconstruit les
  providers et les swap en place. Plus besoin de redémarrer Romanesk.
- **P5.4** : **Brainstorm panel** transversal sur UniversePage. 3 modes :
  5 idées de scènes (variées : intime / action / révélation / suspense
  / contemplation), 3 dilemmes moraux (choix entre 2 valeurs
  incompatibles), 3 twists narratifs. Sélecteur de story optionnel.
  Pas de RAG volontairement — divergence créative.
- **P5.5** : **Détection d'anachronismes** dans `<AiConsistencyPanel>`.
  Si l'univers a un RealityAnchor (mode historical / divergent + pivot
  date), le panel demande aussi de signaler les anachronismes (objets,
  technologies, expressions, références hors période). Badge bleu
  visible dans le header quand le mode est actif.
- **P5.6** : **Atelier description** sur fiches Personnage / Lieu /
  Objet. Nouveau composant `<AiDescriptionPanel>` paramétrable par
  `targetKind` (system prompt dédié à chaque type). Construit le
  contexte à partir des champs structurés déjà remplis + une indication
  facultative. 4 actions sur la sortie : Remplacer / Ajouter à la suite
  / Copier / Fermer.

### Changed — Phase 5
- `AiProvider` et `AiEmbedder` deviennent interior-mutable (cf. P5.3).
- Les commandes IA (ai_ping, ai_complete, ai_generate_entity_draft,
  ai_universe_reindex, ai_rag_query) ajoutent `let snap =
  state.snapshot().await;` en début d'exécution. Aucun changement de
  call-site côté front.
- Helper `apps/desktop/src/lib/tiptap-utils.ts` factorisé : 3 helpers
  purs (paragraphsToDoc, appendParagraphsToDoc, collectTextFromDoc).
  StoryPage utilise les helpers factorisés ; les copies inline supprimées.
- SettingsPage : bandeau post-save passe de amber « Redémarre Romanesk »
  à emerald « Les providers IA ont été rechargés à chaud ».

### Versions
- 0.4.0 → **0.5.0** sur Cargo.toml workspace + crates/core +
  apps/desktop/src-tauri + tauri.conf.json + apps/desktop/package.json
  + Layout.tsx (badge version) + Cargo.lock (deps internes).
- Rétro complète : voir [`docs/RETRO-PHASE-5.md`](./docs/RETRO-PHASE-5.md).

[0.5.0]: https://github.com/hmorales-pro/romanesk/releases/tag/v0.5.0

## [0.4.0] — 2026-05-02

Tag de fin de Phase 4 (Histoires + chapitrage + IA en édition). Romanesk
passe de « gestionnaire de lore + Q&A » à **logiciel d'écriture local-first
avec IA en sparring partner**.

### Added — Phase 4
- **P3.x (post-3.0)** : page Settings (`/settings`) pour configurer le
  provider IA (URL Ollama + modèles chat/embed) sans toucher aux env vars.
  Stockage `~/Library/Application Support/.../settings.json`. Bouton
  Tester Ollama qui appelle `ai_ping`. Redémarrage de l'app requis pour
  appliquer (les providers IA sont construits une seule fois au boot —
  hot-reload réservé à Phase 5+).
- **P4.1** : Module Histoires. Domain `Story` + `StoryType`
  (Novel / Novella / ShortStory / Series), `StoryRepo` (CRUD + soft-delete).
  Section « Histoires » dans UniversePage avec form de création + cards
  éditables inline (type, statut libre, target word count, synopsis).
  6 tests unitaires.
- **P4.2** : Module Chapitres. Domain `Chapter` + `ChapterStatus`
  (Draft / Reviewed / Final), `ChapterRepo` (CRUD + reorder transactionnel
  + auto sort_order = MAX+1). 7 tests unitaires.
- **P4.3** : Surface d'écriture multi-chapitres (`/u/:universeId/s/:storyId`).
  Layout 2 colonnes : sidebar liste chapitres (▲/▼ pour réordonner) +
  centre éditeur Tiptap pleine largeur. Titre éditable, select status,
  word count live, Ctrl/Cmd-S pour sauver, indicateurs visuels
  « non enregistré » (amber) / « enregistré ✓ » (emerald).
- **P4.4** : Continuation IA in-editor. Composant `<AiContinuePanel>` :
  bouton « Continuer avec l'IA » qui prend les ~600 derniers mots du
  chapitre + synopsis + titre, prompt cadré (1-3 paragraphes, pas de
  meta-commentaire, ne pas répéter la dernière phrase), affiche la
  suggestion en gris/italique, boutons Accepter / Rejeter / Régénérer.
  L'IA n'écrit jamais directement en DB — l'utilisateur garde la main
  via Save.
- **P4.5** : Actions IA sur chapitre. Composant `<AiActionsPanel>` avec
  3 actions : **Résumer** (3-5 phrases), **Réécrire** (avec instruction
  libre → bouton Remplacer le chapitre disponible), **Brainstormer**
  (3 directions narratives, température 0.9). Toutes non-destructives,
  affichées en encart grisé italique, bouton Copier dans le presse-papier.
- **P4.6** : Détection d'incohérences via RAG sur le lore. Composant
  `<AiConsistencyPanel>` qui réutilise `ai_rag_query` (déjà branché à
  l'index embeddings en P3.3). Verdict heuristique côté front
  (Cohérent / À vérifier) + sources cliquables (Link vers la fiche
  entité). Pas de nouveau backend.

### Architecture — Phase 4
- 3 nouvelles tables activées : `stories`, `chapters`, `chapter_entity_refs`
  (cette dernière réservée à P5).
- 11 nouvelles commandes Tauri : 5 stories + 6 chapters.
- 3 panels IA distincts (Continue / Actions / Consistency), tous autonomes.
  Le helper `collectText` est dupliqué 3 fois — règle de 3 atteinte au pire
  endroit, à factoriser en P4.x si une 4e occurrence apparaît.
- Toutes les fonctions IA reposent sur `ai_complete` ou `ai_rag_query`,
  posés en P3.1 / P3.3. Pas de nouveau type de provider.

### Versions
- 0.3.0 → **0.4.0** sur Cargo.toml workspace + crates/core +
  apps/desktop/src-tauri + tauri.conf.json + apps/desktop/package.json
  + Layout.tsx (badge version).
- Rétro complète : voir [`docs/RETRO-PHASE-4.md`](./docs/RETRO-PHASE-4.md).

[0.4.0]: https://github.com/hmorales-pro/romanesk/releases/tag/v0.4.0

## [0.3.0] — 2026-05-02

Tag de fin de Phase 3 (IA + RAG + Ancrage réel). Romanesk passe de
« base de données structurée » à **outil augmenté par IA** :
génération de fiches assistée, Q&A naturelle sur le lore via RAG
(embeddings + cosine + chat), ancrage à la réalité historique avec
WorldBrief généré par IA.

### Added — Phase 3
- **P3.1** : Service AI (`OllamaProvider`) en `tauri::State`. Commandes
  `ai_ping` / `ai_complete`. Composant `<AIStatusBadge>` qui ping
  toutes les 30s et affiche reachable/hors ligne. Default model
  `gemma4:e2b` (variante existante chez Hugo).
- **P3.2** : Génération de fiche assistée par IA. Bouton « Générer avec IA »
  sur les forms perso/lieu, prompts JSON-stricts, le résultat pré-remplit
  les champs. Mode JSON forcé d'Ollama via `format: "json"` quand
  `req.json_schema.is_some()`.
- **P3.3** : `OllamaProvider::embed()` (était TODO depuis J5) implémenté
  via `/api/embed` batch. `AiEmbedder` State séparée avec
  `nomic-embed-text:latest` par défaut. Commande `ai_universe_reindex`
  qui chunke 1 entité = 1 chunk + indexe via `EmbeddingRepo` (J4).
  Commande `ai_rag_query` : embed question → search_topk cosine →
  prompt avec contexte → réponse + sources cliquables.
  `<RagChatPanel>` sur la page univers, historique en mémoire.
- **P3.4** : RealityAnchor (mode none/historical/divergent), DivergencePoint
  (axe tech/politics/culture/event/nature), WorldBrief (généré IA en JSON
  {politics, tech, culture, daily_life, geopolitics}). Page `/u/:id/anchor`
  avec UI complète. Lien depuis UniversePage header.
- **Édition d'époque et d'événement** (P2.x oublié) : bouton crayon sur
  chaque ligne de la TimelineSection.

### Fixed — build
- macOS deployment target : `MACOSX_DEPLOYMENT_TARGET = "13.0"` dans
  `.cargo/config.toml` pour aligner les libs C précompilées (ring,
  libsqlite3-sys) sur ARM64 macOS récent.
- Désactive `CARGO_INCREMENTAL` : les artefacts incrémentaux divergeaient
  entre rebuilds successifs sur rustc 1.95+.
- Profile dev : `opt-level = 0` (était 1) pour éviter une monomorphisation
  agressive qui interagissait mal avec le point précédent.
- Default model `gemma:latest` → `gemma4:e2b` partout (la variante
  effectivement disponible chez Hugo).

### Versions
- 0.2.0 → **0.3.0** sur Cargo.toml workspace + crates/core +
  apps/desktop/src-tauri + tauri.conf.json + 2 package.json.
- Rétro complète : voir [`docs/RETRO-PHASE-3.md`](./docs/RETRO-PHASE-3.md).

[0.3.0]: https://github.com/hmorales-pro/romanesk/releases/tag/v0.3.0

## [0.2.0] — 2026-05-02

Tag de fin de Phase 2 (Temporalité). Romanesk acquiert une **couche
temporelle native** : un univers se découpe en époques colorées,
hébergeant des événements datés ; les fiches peuvent capturer leur
état à différents moments narratifs ; les relations sont datables ;
une frise visuelle SVG synthétise tout ça.

### Added — Phase 2
- **Backend timeline** : `Era`, `Event`, `Snapshot` domain types + 3 Repos
  (`EraRepo`, `EventRepo`, `SnapshotRepo`) avec validation, tri chronologique
  stable, FK CASCADE pour snapshots et SET NULL pour les références aux eras.
  15 nouvelles commandes Tauri (era_*, event_*, snapshot_*).
- 9 tests d'intégration `tests/timeline_integration.rs` (CRUD, dates inversées
  rejetées, FK cascade/set null, tri NULLS LAST, era_id sur Relation).
- **UI Eras + Events** : `<TimelineSection>` intégrée en bas de UniversePage.
  Color picker, era picker pour les événements, tri chronologique.
- **Relations datables** : `<RelationsSection>` accepte un select Era au form
  de création. Affichage d'un badge era coloré dans la liste.
- **Snapshots** : `<SnapshotsSection>` sur Character/LocationDetail. Capture
  l'état complet (name + summary + content + cover_image) à une époque/year.
- **Frise visuelle** : page `/u/:universeId/timeline` (`<TimelinePage>`).
  SVG hand-coded : bandes colorées par era, marqueurs pour événements,
  axe X gradué, légende. Lien depuis `<TimelineSection>`.

### Versions
- 0.1.0 → **0.2.0** sur Cargo.toml workspace + crates/core +
  apps/desktop/src-tauri + tauri.conf.json + 2 package.json.
- Rétro complète : voir [`docs/RETRO-PHASE-2.md`](./docs/RETRO-PHASE-2.md).

[0.2.0]: https://github.com/hmorales-pro/romanesk/releases/tag/v0.2.0

## [0.1.0] — 2026-05-02

Tag de fin de Phase 1 (Lore MVP). Romanesk est désormais un **outil
de worldbuilding utilisable bout-en-bout** : créer un univers,
peupler de Personnages et de Lieux avec biographies riches Tiptap,
les tagger, les relier sémantiquement (graphe interactif), leur
attacher une image de couverture, exporter le tout en Markdown
portable. Tout en local, sous Elastic License 2.0, gratuit, sans
télémétrie ni cloud obligatoire.

### Added — Phase 1
- **P1.5** : **Images de couverture** sur les fiches Personnage et Lieu.
  - Plugin Tauri `tauri-plugin-dialog` v2 (Cargo + npm) + capability `dialog:default`. Plugin enregistré dans `lib.rs::run()`.
  - `EntityRepo::set_cover_image(id, Option<&str>)` : UPDATE chirurgical sur la seule colonne `cover_image`. 2 nouveaux tests d'intégration (round-trip set/clear, NotFound sur id inconnu).
  - 3 commandes Tauri :
    - `entity_set_cover_image(entityId, sourcePath)` : copie le fichier source dans `<app_data_dir>/media/<universeId>/<entityId>/cover_<timestamp>.<ext>`, supprime l'ancienne image si existe, met à jour la DB. Validation : extensions jpg/jpeg/png/gif/webp uniquement.
    - `entity_get_cover_image_data(entityId) → { mime, dataBase64 } | null` : lit le fichier et le renvoie en base64 (auto-clean DB si fichier physique disparu).
    - `entity_clear_cover_image(entityId)` : supprime DB + fichier physique.
  - `<CoverImage>` composant front : aspect 16/9, prévisualisation via data URL, bouton « Ajouter/Changer » qui ouvre le picker système Tauri (filtré sur les extensions image), bouton « Retirer ». Intégré dans `CharacterDetail` et `LocationDetail` au-dessus des cartes archétype/climat.
  - Stockage sous le répertoire de données par OS (`~/Library/Application Support/fr.romanesk.desktop/media/...` sur Mac) → portable, sauvegardable, exportable.
- **P1.3** : **Vue graphe interactive** des relations d'un univers.
  - Dep `@xyflow/react` v12 (anciennement react-flow), CSS importé.
  - Nouvelle route `/u/:universeId/graph` + page `GraphPage`.
  - Conversion entities → nodes (couleur par EntityType : Character indigo, Location emerald, Faction amber, Object violet, Concept cyan, RealEntity slate) + relations → edges (label = libellé actif, flèche directionnelle pour les asymétriques, sans flèche pour les symétriques).
  - Layout circulaire initial déterministe (rayon proportionnel au nombre de nœuds), nodes draggables ensuite.
  - Click sur un nœud → navigation vers la fiche.
  - MiniMap + Background grille + Controls (zoom/fit) intégrés.
  - Bouton « Voir le graphe » sur la page univers (header).
- **P1.4** : **Tags + filtres + recherche**.
  - Domain `Tag` + `NewTag` + `TagRepo` (create_in_universe / find_or_create / list_in_universe / get_for_entity / set_for_entity / associations_in_universe / delete). 8 tests d'intégration.
  - 6 commandes Tauri (`tag_*`).
  - Composant `<TagsSection>` sur Character/LocationDetail : chips actuels (avec couleur custom optionnelle), input « ajouter un tag » avec auto-création si le nom n'existe pas, suggestions au fur et à mesure de la frappe (filter incrémental sur les tags existants de l'univers), Backspace sur input vide retire le dernier tag.
  - `set_for_entity` atomique en transaction (DELETE + INSERT en bulk).
  - UniversePage : barre de recherche par nom (filtre client live) + chips tags cliquables pour filtrer (intersection : entité doit avoir tous les tags actifs), bouton « effacer ».
  - Composant `<TagChip>` réutilisable (chip + close button optionnel + état actif/cliquable).
- **P1.6** : **Export Markdown** d'un univers complet.
  - Module `crates/core/src/export/markdown.rs` : converter Tiptap JSON → Markdown (paragraphes, titres, listes puces/ordonnées, blockquote, code block, marks bold/italic/code/strike/link, hardBreak), tolérant aux entrées legacy string ou null.
  - `render_universe_markdown(universe, entities, relations)` assemble entête + sections Personnages / Lieux / Autres + section Relations en un seul `.md` portable.
  - Commande Tauri `universe_export_markdown` qui charge tout (entities + relations) et renvoie la string.
  - Bouton « Exporter MD » sur chaque carte univers de LibraryPage : copie le résultat dans le presse-papier + alert de confirmation.
  - 6 tests unitaires sur le converter Tiptap → MD.
- **P1.2** : **Relations entre entités** (Aldric *mentor de* Lyra, Aldric *situé dans* Bren, etc.).
  - Domain Rust : `RelationType` enum (14 variants conformes à ADR 0003) avec `as_str()`, `parse()`, `is_symmetric()`. `Relation` et `NewRelation`.
  - `RelationRepo` (create / get / list_for_entity / list_in_universe / delete). `list_in_universe` JOIN bidirectionnel (source OR target) avec DISTINCT pour ne pas rater les arcs cross-univers.
  - 8 tests d'intégration + 2 unit (round-trip + symétrie). Self-relation rejetée par CHECK SQL + validation Rust, FK violation détectée, cascade vérifiée à la suppression d'une entité.
  - 4 commandes Tauri : `relation_create / list_for_entity / list_in_universe / delete`.
  - Front : types TS, helpers `relationTypeLabel(type, direction)` (active/passive selon le côté), `isSymmetric`, `RELATION_TYPES` exportée.
  - `<RelationsSection>` intégré dans `CharacterDetail` et `LocationDetail` : liste les relations entrantes/sortantes (avec libellé directionnel), bouton « + » qui ouvre un form (select type + select cible parmi les autres entités de l'univers) + suppression inline.
  - Bug attrapé en relecture : `list_in_universe` ne JOIN que sur source_id (raterait les relations entrantes vers cet univers depuis un autre). Corrigé.
  - Typo française corrigée : « à inspiré » → « a inspiré ».
- **P1.1** : Fiches **Lieu** (EntityType::Location), symétriques aux Personnages.
  - Refactor backend : commandes `entity_create` / `entity_update` génériques sur `EntityType` (kind paramétrable + content JSON libre).
  - Côté front : nouveaux types `LocationKind` + `LocationContent` (city/region/building/naturalFeature/celestial/other), helpers `locationContent`, `entityTypeLabel`, `locationKindLabel`.
  - 4 builders API typés : `characterCreate/Update`, `locationCreate/Update`.
  - `UniversePage` réécrite avec 2 sections empilées (Personnages + Lieux), chacune avec son form inline et sa queryKey.
  - `EntityPage` devenu un dispatcher minimal qui route vers `CharacterDetail` ou `LocationDetail` (factorisés dans `pages/details/`).
  - Fix : le summary d'un Personnage n'était pas inclus dans `characterUpdate` (perte silencieuse). Corrigé.
- Hotfix Phase 0 : icônes placeholder dans `apps/desktop/src-tauri/icons/` (32, 128, 256, 512) pour débloquer `pnpm tauri dev` (Tauri 2 `generate_context!()` cherche `icons/icon.png` même avec `bundle.active = false`).
- Hotfix Phase 0 : port dev 1420 → 1430 (HMR 1431) pour cohabiter avec d'autres projets Tauri locaux.

### Versions
- Workspace Cargo + crates/core + apps/desktop/src-tauri + tauri.conf.json + 2 package.json : 0.0.1 → **0.1.0**.
- Rétro complète : voir [`docs/RETRO-PHASE-1.md`](./docs/RETRO-PHASE-1.md).

[0.1.0]: https://github.com/hmorales-pro/romanesk/releases/tag/v0.1.0

## [0.0.1-phase0] — 2026-05-02

Tag de fin de Phase 0 (fondations). Walking skeleton complet : app
Tauri qui démarre, écrit/lit en SQLite, expose un trait Provider IA
avec impl Ollama réelle + MockProvider pour tests, indexe et cherche
des vecteurs (cosine), affiche une vraie UI bibliothèque/univers/
fiche avec Tiptap, et tout ça testé par CI offline-only sur 5 jobs.

### Added
- `LICENSE` à la racine — texte intégral de l'**Elastic License 2.0**.
- ADR `0002-editor.md` (Tiptap vs Lexical — décision Tiptap par défaut).
- ADR `0003-relations.md` (set figé en v1, extensible en Phase 1+).
- **Phase 0 — J2** : scaffolding `apps/desktop` (Tauri 2 + React 18 + TypeScript + Vite 6).
  - Structure monorepo : `package.json` racine, `apps/desktop/` (front + `src-tauri/`).
  - Tailwind 4 + shadcn/ui (components.json, lib/utils.ts), tokens CSS dans `src/index.css`.
  - Page d'accueil React minimale + commande Tauri `ping` qui renvoie `{ message: "pong", echoed_at: ISO8601 }`.
  - ESLint 9 flat config + typescript-eslint.
  - Workspace Cargo : ajout de `apps/desktop/src-tauri` en membre.
  - `pnpm install`, `pnpm typecheck`, `pnpm lint` verts.
- **Phase 0 — J3** : couche données SQLite + repository pattern dans `crates/core`.
  - Module `db/` : `Database` wrapper (in-memory + on-disk WAL), `PRAGMA foreign_keys = ON`, migrations embarquées via `sqlx::migrate!("../../db/migrations")`.
  - Module `domain/` : types `Universe`, `Entity`, `EntityType`, `NewUniverse`, `NewEntity`.
  - Module `repo/` : `Repo` avec `UniverseRepo` (create / get / list / hard_delete / soft_delete) et `EntityRepo` (create / get / list_in_universe / count_in_universe / hard_delete / soft_delete) + `RepoError` typé.
  - Tri sur `id` (UUID v7 monotone temporellement) plutôt que `created_at` — pas d'index supplémentaire requis.
  - 11 tests d'intégration in-memory : CRUD, FK ON DELETE CASCADE, soft-delete, FK violation, round-trip JSON Unicode, `PRAGMA foreign_keys` actif.
  - ADR `0004-migrations.md` : abandon de `refinery` au profit de `sqlx::migrate!` (évite le double driver SQLite).
- **Phase 0 — J4** : stockage vectoriel + recherche cosine dans `crates/core/src/rag/`.
  - Module `rag/vec.rs` : `EmbeddingRepo` (insert, get, search_topk, delete_for) + helpers `encode_vector` / `decode_vector` (BLOB f32 little-endian) + `cosine`.
  - Domain : `SourceType` (entity, snapshot, chapter, brief, note), `Embedding`, `NewEmbedding`, `EmbeddingHit`, `SearchFilter` (model + source_type optionnels).
  - Filtre obligatoire par `dim` côté SQL avant le calcul cosine — vecteurs incompatibles automatiquement exclus.
  - 5 tests unitaires (encode/decode bit-exact, cosine identique/orthogonal/opposite/zero) + 10 tests d'intégration (smoke top-k, filtres dim/model/source, delete_for, validation inputs).
  - ADR `0005-vector-search.md` : report explicite de `sqlite-vec` à Phase 1, format BLOB choisi pour migration future à coût constant (compatibilité binaire avec `sqlite-vec`).
- **Phase 0 — J5** : `MockProvider` + example binary `ping_ollama`.
  - `crates/core/src/ai/mock.rs` : impl `Provider` avec staging de réponses (texte, embeddings, descriptions d'image, ping), compteurs d'appels par méthode, capabilities et id surchargeables. 8 tests unitaires.
  - `crates/core/examples/ping_ollama.rs` : binaire qui ping Ollama local et demande « Bonjour » à Gemma. Codes de sortie distincts pour healthcheck KO (1) et complétion KO (2). Surchargeable via `OLLAMA_MODEL` et `OLLAMA_BASE_URL`.
  - `ai/mod.rs` : re-exporte `MockProvider`, `OllamaConfig`, `OllamaProvider`, `TokenUsage`.
- **Phase 0 — J6** : commandes Tauri pour universe + entity, init DB au démarrage.
  - `apps/desktop/src-tauri/src/lib.rs` : setup callback qui ouvre la base SQLite dans `<app_data_dir>/romanesk.db` (par OS) et la `manage()` en `tauri::State`.
  - `apps/desktop/src-tauri/src/commands/`: 8 commandes (`universe_list/create/get/delete`, `entity_list_in_universe/create/get/delete`) + `CommandError` sérialisable + `CreateEntityPayload` typé pour les fiches Personnage.
- **Phase 0 — J7** : flow front end-to-end (3 pages + routing + persistance).
  - Deps : `@tanstack/react-query` 5 (state serveur), `react-router-dom` 7 (routing).
  - `src/lib/types.ts` : types TS qui miroitent `crates/core/src/domain.rs` (Universe, Entity, EntityType, CharacterContent + helper `characterContent(entity)`).
  - `src/lib/api.ts` : wrappers typés autour d'`invoke<T>(...)` pour les 8 commandes Tauri + `ping`.
  - `src/components/ui/{button,input,textarea,label,card}.tsx` : composants minimalistes shadcn-style avec `cn` helper et `forwardRef`.
  - `src/components/Layout.tsx` + `src/router.tsx` : `createHashRouter` (compatible Tauri sans config serveur), header nav, 3 routes.
  - `src/pages/{LibraryPage, UniversePage, EntityPage}.tsx` : Bibliothèque (liste univers + form inline), Univers (liste personnages + form), Fiche Personnage (read-only ; édition Tiptap arrive en J8).
  - `main.tsx` réécrit : `QueryClientProvider` + `RouterProvider` ; ancien `App.tsx` réduit à un re-export du Layout.
  - `pnpm typecheck` + `pnpm lint` verts.
- **Phase 0 — J9** : CI GitHub Actions offline-only sur 5 jobs.
  - `rust-fmt` (rustfmt --check), `rust-clippy` (clippy -D warnings avec deps Linux Tauri), `rust-test` (matrix Linux/Mac/Windows + feature offline-tests), `desktop-build` (build release Tauri Linux : pnpm build → cargo build), `front-checks` (pnpm typecheck + lint).
  - pnpm version bumpée à 10 (matches le lockfile).
  - Suppression de `pnpm test` du CI (pas de tests Vitest en Phase 0 ; à ré-activer en Phase 1).
  - Badge CI ajouté en haut du README.
- **Phase 0 — J10** : hardening + rétro + tag.
  - `tracing` + `tracing-subscriber` côté Rust : logs structurés contrôlés par `RUST_LOG`, panic hook qui logue avant que le process meure.
  - Côté React : `<ErrorBoundary>` qui catche les erreurs de rendu et affiche un fallback explicite avec bouton « Recharger ». Handlers globaux `window.error` et `unhandledrejection` qui logent dans la console.
  - Versions bumpées 0.0.0 → 0.0.1 (workspace Cargo + crates/core + apps/desktop/src-tauri + tauri.conf.json + 2 package.json).
  - `docs/RETRO-PHASE-0.md` : rétrospective complète (livré, marché, coincé, reporté).
  - Tag annoté `v0.0.1-phase0`.

[0.0.1-phase0]: https://github.com/hmorales-pro/romanesk/releases/tag/v0.0.1-phase0
- **Phase 0 — J8** : édition de la fiche personnage avec Tiptap.
  - `crates/core` : `UpdateEntity` (champs modifiables : name, summary, content, cover_image, is_real) + `EntityRepo::update(id, UpdateEntity)`. Trigger SQL `trg_entities_updated` met à jour `updated_at` automatiquement. 3 nouveaux tests d'intégration (replace, blank name, NotFound).
  - `apps/desktop/src-tauri` : commande `entity_update` + `UpdateEntityPayload` (biography typée `Value` opaque pour roundtripper le doc Tiptap bit-pour-bit). Helper `is_empty_biography` récursif qui détecte un doc avec uniquement des nœuds vides.
  - Front deps : `@tiptap/react`, `@tiptap/starter-kit`, `@tiptap/extension-placeholder` (v2.10).
  - `src/components/TiptapEditor.tsx` : composant React avec `useEditor`, accept `value: TiptapDoc | string | null` (legacy strings pré-J8 wrappées dans un paragraphe), placeholder configurable, prop `editable` pour le mode read-only.
  - `src/pages/EntityPage.tsx` réécrite : mode View (rendu Tiptap read-only) + bouton « Modifier » qui bascule en mode Edit (form complet : nom, archétype, traits, TiptapEditor pour biographie). Hydratation du form uniquement à la transition `false→true` via `useRef` (évite l'écrasement de la saisie après invalidation de query).
  - `src/index.css` : styles `.ProseMirror` minimaux pour Tiptap (paragraphes, titres, listes, blockquote, code, placeholder).

### Changed
- **Pivot du modèle de distribution** : open-source AGPL → **propriétaire source-available, free-use** sous Elastic License 2.0.
- `Cargo.toml` (workspace + `crates/core`) : `license = "LicenseRef-Elastic-2.0"`, `repository = "https://github.com/hmorales-pro/romanesk"`.
- `docs/LICENSE-CHOICE.md` réécrit pour acter la décision ELv2 et expliquer le raisonnement.
- `README.md`, `PRD.md` (§15 entière), `CONTRIBUTING.md` : retrait des mentions « open-source » au sens OSI ; positionnement clarifié en source-available free-use ; note CLA pour les contributions futures.
- `PHASE-0-PLAN.md` (J1) : objectif licence remis à jour vers ELv2.

### En cours
- Phase 0 : scaffolding Tauri, schéma DB initial, trait `Provider` IA, CI offline-only.

## [0.0.0] — 2026-05-02

### Added
- PRD v0.3 (vision, modèle de données, ancrage réel, distribution).
- Plan détaillé Phase 0 (`PHASE-0-PLAN.md`).
- Note de décision sur la licence (`docs/LICENSE-CHOICE.md`).
- Structure initiale du repo (README, CONTRIBUTING, CODE_OF_CONDUCT, .gitignore).

[Unreleased]: https://github.com/hmorales-pro/romanesk/compare/v0.3.0...HEAD
[0.0.0]: https://github.com/hmorales-pro/romanesk/releases/tag/v0.0.0
