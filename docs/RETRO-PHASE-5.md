# Rétrospective — Phase 5 (Atelier description + multi-types + IA augmentée)

> **Période** : tag `v0.4.0` → tag `v0.5.0`.
> **Objectif initial** : étendre la palette d'entités (Faction / Object / Concept), enrichir l'expérience d'écriture (auto-save, hot-reload des providers, brainstorm transversal, atelier description), durcir la cohérence (anachronismes via Reality Anchor).
> **Critère de sortie** : pouvoir créer un univers complet (6 types d'entités), écrire dedans avec auto-save, sparrer avec l'IA pour brainstormer/décrire/vérifier — sans jamais redémarrer l'app pour changer un modèle.

---

## Ce qui est livré

| Sprint | Statut | Commit |
|--------|--------|--------|
| P5.1 Fiches Faction + Object + Concept | ✅ | `6fc7b73` |
| P5.2 Auto-save debounced sur chapitres | ✅ | `1b4789e` |
| P5.3 Hot-reload des providers IA après Settings save | ✅ | `41f0ba4` |
| P5.4 Brainstorm panel transversal | ✅ | `f5e8e5e` |
| P5.5 Détection d'anachronismes (Reality Anchor) | ✅ | `22bbc9c` |
| P5.6 Atelier description (Personnage / Lieu / Objet) | ✅ | `d3be513` |
| P5.7 Release v0.5.0 | ✅ | (release commit) |

---

## Ce qui a marché

### Polymorphisme `EntityType` payant à 100%
Les 3 nouveaux types (Faction / Object / Concept) ont nécessité **zéro changement backend**. L'enum `EntityType` à 6 variants posé en P1, le content_json libre, les commandes `entity_*` génériques — tout était déjà là. Le sprint P5.1 a été 100% front : 3 helpers TS, 3 builders API, 3 composants Detail, 1 composant générique `SimpleEntitySection` paramétrable. ROI énorme sur l'investissement archi du début.

### Refactor minimal pour le hot-reload (P5.3)
Plutôt que de réécrire toutes les commandes IA, on a ajouté une seule ligne en début de chaque fonction : `let provider = provider.snapshot().await;`. Le wrapper `Arc<RwLock<Arc<dyn Provider>>>` clone l'Arc interne sous read lock minimal, et le call-site continue à utiliser `provider.complete(req)` comme avant. settings_save fait juste `state.replace(new_provider).await;` et tout est transparent.

### Auto-save = 12 lignes de useEffect
Pas de hook custom, pas de bibliothèque. Un useEffect qui watch `[dirty, saving, body, title, status, save]`, plante un setTimeout de 3s, le clear si nouvelle modif arrive. Cleanup propre au unmount + au switch de chapitre via la prop `key`. Le réflexe Ctrl/Cmd-S explicite reste prioritaire et désactive le timer pendant la mutation. UX finale parfaitement lisible avec 3 indicateurs visuels (sauvegarde / modifié / ✓ enregistré).

### Reality Anchor branché en 1 prop sur Consistency
P5.5 = juste une nouvelle useQuery sur `anchor_get_for_universe` + un bloc dans `buildQuestion` qui s'ajoute au prompt RAG quand `anchor.mode !== 'none'`. Aucun changement backend. Le badge bleu « + anachronismes (Historique, 1850-03-15) » dans le header rend la fonctionnalité visible sans cliquer.

### Helper `tiptap-utils.ts` factorisé au bon moment
Règle de 3 atteinte en P5.6 : `paragraphsToDoc` et `appendParagraphsToDoc` étaient utilisés dans StoryPage et 3 nouveaux usages arrivaient (CharacterDetail, LocationDetail, ObjectDetail). Factorisation = 1 fichier, 3 helpers purs, 0 surcoût d'abstraction. Le code est plus court globalement après refactor que les 3 copies inline.

### Brainstorm sans RAG = bonne décision
Le `BrainstormPanel` pourrait utiliser RAG pour s'aligner sur le lore — mais on cherche la **divergence créative**. Pas de RAG, température 0.95, focus sur le contexte minimal (univers + story optionnelle). Résultat : suggestions qui ouvrent des pistes nouvelles plutôt que de paraphraser les fiches.

---

## Ce qui a moins bien marché

### Pas d'AI draft sur Faction / Object / Concept (encore)
La commande `ai_generate_entity_draft` (P3.2) ne couvre que Character et Location. Pour les 3 nouveaux types, l'utilisateur doit remplir à la main puis utiliser l'atelier description. C'est cohérent comme expérience mais il faudra étendre le draft Tauri en P5.x si Hugo le veut.

### `Layout.tsx` continue à tracker la version à la main
Chaque release on patche `<span>v0.X.0 · pre-alpha</span>`. Devrait être lu depuis `package.json` au build via une variable d'env Vite. Petit ticket pour P5.x.

### Le format JSON forcé d'Ollama n'est pas exploité par le brainstorm / atelier
Les 3 nouveaux panels IA (Brainstorm, Description) reçoivent du texte libre et s'en sortent avec du strip de boilerplate. Si on voulait des sorties parsables (genre liste structurée d'incohérences au lieu d'un paragraphe), il faudrait passer par `json_schema: Some(...)` comme P3.2/P3.4. Pas urgent pour l'usage actuel.

### Le hot-reload n'expose pas un événement vers le front
Si l'utilisateur a un `<AIStatusBadge>` ouvert sur une autre page pendant qu'il save les Settings, le badge ne se rafraîchit pas tout seul (il faut attendre le prochain ping de 30s). Évolution possible : Tauri event broadcast quand `settings_save` swap les providers, et le badge invalide sa query.

---

## Décisions notables

### Description = `unknown` côté TS, géré uniformément
Tous les `*Content` interfaces (Faction, Object, Concept, etc.) typent leur champ description comme `unknown` (peut être `null`, string legacy, ou doc Tiptap JSONContent). Volontaire — ça rend les helpers polymorphes (TiptapEditor accepte les 3 formes via `normalize()`). Évite des refactors coûteux quand on rajoute un type.

### Le panel Atelier description est sous le TiptapEditor en mode édition
Pas dans une page séparée, pas dans un modal. Adjacent à l'éditeur, l'utilisateur le voit, l'utilise, et le résultat va directement dans l'éditeur d'à côté. UX fluide, pas de context-switching.

### Pas de sélection de modèle alternatif par action (encore)
Toutes les actions IA passent par `chat_model` configuré dans Settings. On pourrait imaginer un modèle « créatif » pour Brainstorm et un modèle « littéral » pour Cohérence. Décision : pas en P5, parce que ça complique le contrat d'API et que `gemma4:e2b` (le défaut) gère bien les deux. À reconsidérer si Hugo veut câbler un modèle plus gros pour la création.

### `RwLock<Arc<...>>` plutôt que `Arc<RwLock<...>>` pour les States Tauri
Choix subtil mais important. Le wrapper externe doit être `Arc` parce que `tauri::State` exige Clone via cloning d'Arc. Le wrapper interne doit être `RwLock` pour permettre le swap. D'où `pub struct AiProvider(pub Arc<RwLock<Arc<dyn Provider>>>);`. Le `RwLock` extérieur ne marcherait pas avec le State Tauri.

---

## Métriques

- **6 sprints livrés** (P5.1 à P5.6 + P5.7 release).
- **~2 700 lignes ajoutées** sur la phase, surtout front (3 nouveaux composants Detail + 4 nouveaux panels IA + helper factorisé).
- **3 nouveaux EntityType activés** sans toucher au backend (polymorphisme P1 confirmé).
- **0 nouvelle commande Tauri** (refactor `settings_save` étendu, pas nouvelle).
- **4 nouveaux panels IA** : BrainstormPanel + AiDescriptionPanel + extension AiConsistencyPanel (+ AiActionsPanel/AiContinuePanel de P4).
- **Hot-reload providers IA** : la friction « redémarre Romanesk après save » disparaît.

---

## Ce qu'on garde pour Phase 6+

- **Vision Ollama** (mode image) pour l'atelier description : l'utilisateur upload une image de référence, le modèle décrit. Demande au moins `llava` ou équivalent côté Ollama.
- **AI draft pour Faction / Object / Concept** : étendre `ai_generate_entity_draft` avec les 3 nouveaux schémas JSON.
- **Tauri event broadcast** sur settings_save → front rafraîchit le badge IA.
- **Sélection de modèle par action** : ajouter un override optionnel `model` dans chaque appel ai_complete (déjà supporté backend, juste à exposer côté UI).
- **Auto-save sur les fiches** (pas que les chapitres). Pour l'instant les fiches restent en save manuel via le bouton Enregistrer.
- **Sortie JSON structurée pour Cohérence** : liste typée d'incohérences (champ + fiche source + sévérité) au lieu d'un paragraphe.
- **Drag-and-drop pour réordonner les chapitres** (toujours bouton ▲/▼).
- **Export d'une story** en Markdown / EPUB / DOCX.

---

## Verdict

✅ **Phase réussie.** Romanesk est passé de « 2 types d'entités + 3 panels IA » à « 6 types + 7 panels IA + hot-reload + auto-save ». La boucle d'écriture est désormais sans friction technique : on configure les modèles depuis l'UI sans redémarrage, on écrit avec auto-save, on demande à l'IA de continuer/réécrire/vérifier/brainstormer/décrire à 4 endroits différents de l'app. La fondation est prête pour Phase 6 (vision, modèles multi-providers, exports avancés).
