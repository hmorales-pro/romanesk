# Rétrospective — Phase 6 (Vision, multi-modèles, exports avancés)

> **Période** : tag `v0.5.0` → tag `v0.6.0`.
> **Objectif initial** : finir d'industrialiser la couche IA — vision, override de modèle par action, sortie JSON typée, broadcast d'event après save Settings — et fluidifier l'UX d'écriture (DnD chapitres, export Story).
> **Critère de sortie** : pouvoir choisir un modèle dédié pour chaque type d'action IA, décrire une fiche depuis une image, exporter une histoire en Markdown, et réordonner les chapitres au clic-glisser.

---

## Ce qui est livré

| Sprint | Statut | Commit |
|--------|--------|--------|
| P6.1 AI draft pour Faction / Object / Concept | ✅ | `033ef52` |
| P6.2 Override modèle par action + Tauri event broadcast | ✅ | `7486356` |
| P6.3 Sortie JSON structurée pour Cohérence | ✅ | `371d0c5` |
| P6.4 Drag-and-drop pour réordonner les chapitres | ✅ | `b3e474a` |
| P6.5 Export d'une story en Markdown | ✅ | `086bf93` |
| P6.6 Atelier description en mode image (vision Ollama) | ✅ | `93fa322` |
| P6.7 Release v0.6.0 | ✅ | (release commit) |

---

## Ce qui a marché

### Réutilisation max de l'infra IA posée en P3 / P5
- P6.1 = juste 3 nouveaux schémas JSON dans `build_draft_prompt` + 9 nouveaux champs dans `EntityDraft`. Le pipeline `ai_complete` + JSON forcé Ollama + parser tolérant n'a pas bougé.
- P6.2 = 2 nouveaux champs optionnels dans AppSettings + 1 hook `useSettings` côté front. Les commandes IA acceptaient déjà `model: Option<String>` depuis P3.1.
- P6.3 = 0 backend, juste un nouveau prompt JSON-strict côté front + un parser robuste (isole `{` ... `}` puis JSON.parse) avec fallback gracieux sur l'affichage texte de P4.6.
- P6.5 = `render_tiptap_doc` (P1.6) réutilisé tel quel pour les bodys des chapitres. Juste une nouvelle fonction `render_story_markdown` qui orchestre.

### Pattern `snapshot()` pour les States Tauri
Le refactor de P5.3 (interior-mutable) a payé en P6.6 : la nouvelle commande `ai_describe_image` snapshot le `chat_state` pour récupérer la base_url courante, sans devoir ajouter une 3e State `vision_state`. Une seule source de vérité (l'URL Ollama configurée), réutilisée par 3 modèles différents (chat / embed / vision).

### DnD HTML5 natif = 50 lignes, 0 dépendance
Pas besoin de `react-dnd`, `dnd-kit`, ou autre lib. 5 handlers (start, over, leave, drop, end), 2 states locaux (draggedId, overId), un calcul splice + reorder. Bouton ▲/▼ gardés comme fallback accessible (et pour le keyboard-only). UX fluide, opacity-40 sur le dragged + dashed border sur la drop zone.

### `useSettings()` mutualisé via react-query
N panels qui appellent `useSettings()` = 1 seul fetch réseau (react-query déduplique sur queryKey). Le hook expose un helper `pickModel("creative" | "literal" | "default")` qui résout le fallback. 4 panels utilisent ce hook après P6.2 sans aucune coordination explicite.

### Tauri event = invalidation immédiate côté front
P6.2 a ajouté `app.emit("settings-changed", ...)` après le hot-reload des providers. AIStatusBadge écoute via `@tauri-apps/api/event.listen()` et invalide les queryKey `["ai-status"]` + `["settings"]`. L'UX devient instantanée : l'utilisateur sauve les Settings, le badge re-ping immédiatement, et tous les `useSettings` consumers refetch — pas d'attente de 30s.

### Export MD = bouton et c'est tout
L'utilisateur clique « Exporter MD » dans le header de StoryPage, le Markdown est dans le presse-papier. Pas de dialog de save (pour rester simple), pas de configuration. Si Hugo veut sauver dans un fichier, il colle dans son éditeur préféré. Cohérent avec le pattern de UniversePage.exportMD posé en P1.6.

---

## Ce qui a moins bien marché

### `ai_describe_image` instancie un nouveau OllamaProvider à chaque appel
La commande crée un `OllamaProvider` Rust à la volée plutôt que de maintenir une 3e State `vision_state` interior-mutable. Trade-off : moins de plumbing, mais petit overhead à chaque appel (création d'un nouveau `reqwest::Client`). Pour 1 appel toutes les 30s c'est négligeable, pour un usage massif on pourrait maintenir un pool.

### `ai_rag_query` ne supporte pas le model override
Le panel Cohérence aimerait utiliser `literal_model` quand il est configuré. `ai_rag_query` (P3.3) ne prend pas de `model` paramétrable — il utilise toujours le `chat_state` snapshoté. Pour étendre il faudrait ajouter un `model: Option<String>` au payload. Réservé à P6.x si Hugo veut vraiment.

### Pas d'infrastructure pour tester les modèles vision
Comme pour le RAG en P3.3, c'est testé manuellement chez Hugo. Le sandbox CI n'a pas Ollama. La logique pure (encode base64, build payload) est testable mais l'intégration end-to-end nécessite un modèle vision-capable installé.

### Le parser JSON de Cohérence (P6.3) reste tolérant mais pas strict
Si le modèle invente un nouveau `kind` ou `severity`, on coerce vers `other` / `minor` au lieu de rejeter. Choix d'UX (pas faire planter l'affichage) qui peut masquer des bugs de prompt si on n'inspecte pas les valeurs reçues.

### Configurations modèles = 5 inputs dans Settings maintenant
L'utilisateur voit 5 modèles à configurer (chat, embed, creative, literal, vision). Ça commence à faire beaucoup pour quelqu'un qui découvre. Tous les non-defaults sont optionnels, mais l'écran Settings devient dense. À terme : un mode « simple » qui cache les options avancées.

---

## Décisions notables

### Le mode image est strictement opt-in
Si `visionModel` n'est pas configuré dans Settings, le bouton « Image » ne s'affiche même pas dans `AiDescriptionPanel`. Pas de feature flag complexe, juste un check sur la prop dérivée de `useSettings`. Cohérent avec « ne montre pas ce qui ne marche pas chez l'utilisateur ».

### L'export Markdown copie dans le presse-papier (pas de save dialog)
On reste sur le pattern de P1.6 (UniversePage). Le presse-papier marche partout, pas de permission à demander, pas de path à choisir. L'utilisateur colle où il veut. Pour des exports plus lourds (EPUB / PDF binaire), il faudra le dialog + écriture fichier — pas P6.

### Le DnD ne chevauche pas (insertion before)
Quand on drop sur un chapitre, on insère le dragged AVANT le target (pas avant ou après selon la position du curseur). C'est plus simple et déterministe. Pour les longues listes ça peut être moins ergo (faut drop sur l'élément qui sera juste après), mais ça évite la zone d'incertitude au milieu de chaque target.

### Les schémas JSON Faction / Object / Concept sont en français inline dans le prompt
Pas de fichier de templates externalisé. Les prompts vivent dans `build_draft_prompt` à côté du parse. Quand on ajoute un nouveau type (en P7+), on copie un bloc, on adapte les champs. Plus lisible que d'aller chercher un YAML / JSON externe.

---

## Métriques

- **6 sprints livrés** (P6.1 à P6.6 + P6.7 release).
- **~2 100 lignes ajoutées** sur la phase, équilibré ~50/50 backend/front.
- **3 nouveaux EntityType couverts par AI draft** (Faction / Object / Concept).
- **3 nouvelles commandes Tauri** : `ai_describe_image`, `story_export_markdown` (et `chapter_reorder` qui existait déjà mais est maintenant câblé au DnD).
- **1 nouvelle dépendance crate** : `base64 = "0.22"` (pour encoder les images vision).
- **1 nouvelle dépendance front** : `@tauri-apps/api/event.listen` (déjà installé via le SDK Tauri 2 — pas de nouveau package).
- **5 modèles configurables** dans Settings : chat, embed, creative, literal, vision (chacun fallback gracieux sur chat).

---

## Ce qu'on garde pour Phase 7+

- **Sélection de modèle pour `ai_rag_query`** (Cohérence avec literal_model).
- **Mode simple / avancé** dans Settings pour réduire la densité.
- **Pool de OllamaProvider** pour vision (si l'usage devient massif).
- **Découpage en passes** pour la détection d'incohérences sur des chapitres > 600 mots.
- **Auto-save sur les fiches** (pour l'instant que sur chapitres).
- **Export EPUB / DOCX** d'une story (avec save dialog Tauri).
- **Drag-and-drop** pour réordonner aussi les époques / events / autres listes.
- **Templates par genre** (fantasy / polar / SF) qui pré-remplissent l'univers + quelques fiches.

---

## Verdict

✅ **Phase réussie.** Romanesk a maintenant une couche IA complète et configurable : 5 modèles dédiés par usage, vision activée si dispo, JSON typé pour la cohérence, hot-reload partout, broadcast d'events. Côté écriture, drag-and-drop des chapitres + export Markdown ferment la boucle. Phase 7 sera le moment de raffiner (modes UX, exports binaires) plutôt que d'ajouter des moteurs.
