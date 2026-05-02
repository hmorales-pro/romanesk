# Rétrospective — Phase 4 (Histoires + chapitrage + IA en édition)

> **Période** : tag `v0.3.0` → tag `v0.4.0`.
> **Objectif initial** : passer du « gestionnaire de lore » (univers + fiches + timeline + RAG) au « logiciel d'écriture » : organiser des récits en chapitres, écrire dedans avec un éditeur riche, et avoir l'IA en sparring partner direct dans l'éditeur (continuation, réécriture, vérification de cohérence).
> **Critère de sortie** : pouvoir créer une histoire, la découper en chapitres, écrire avec Tiptap, demander à l'IA de continuer / réécrire / vérifier la cohérence avec le lore, et tout sauvegarder localement.

---

## Ce qui est livré

| Sprint | Statut | Commit |
|--------|--------|--------|
| P4.1 Module Histoires (stories) — backend + UI CRUD | ✅ | `fc39a0b` |
| P4.2 Module Chapitres (chapters) — backend + sidebar | ✅ | `a168f4f` |
| P4.3 Surface d'écriture multi-chapitres (page Story) | ✅ | `a168f4f` |
| P4.4 Continuation IA in-editor | ✅ | `f0a430d` |
| P4.5 Actions IA sur chapitre (résumer / réécrire / brainstorm) | ✅ | `4ff845a` |
| P4.6 Détection d'incohérences via RAG sur le lore | ✅ | `c7143c7` |
| P4.7 Release v0.4.0 | ✅ | (release commit) |

---

## Ce qui a marché

### Tables `stories` et `chapters` déjà dans la migration init
Aucune migration à écrire — le schéma SQL initial (PRD §7) avait déjà prévu les deux tables avec FK + CHECK + index. Ça a permis de focaliser P4.1 et P4.2 sur le domain Rust + le repo + l'UI sans toucher à `db/migrations/`. La règle « le schéma est figé en migration 0001, on ajoute des migrations seulement pour les évolutions » paie.

### Pattern Repo + commande Tauri + types front + composant React
Le rythme « domain → repo + tests → commande Tauri → wrappers API → composant » est devenu mécanique. P4.1 (Story) a pris ~30 minutes de réflexion + ~1h de code, P4.2 (Chapter) plus rapide encore parce qu'on copie-colle la structure et on adapte. Investir dans un workflow stable sur les 4 phases précédentes paie maintenant en vélocité.

### `ai_complete` réutilisé tel quel pour P4.4 + P4.5
La commande Tauri posée en P3.1 (ai_complete) a accepté les 4 nouveaux usages (continuation, résumé, réécriture, brainstorm) sans modification. Chaque action n'est qu'un couple `(system_prompt, user_prompt)` côté front + un appel. Toute la complexité (mode JSON, températures, tokens) est gérée côté Rust.

### `ai_rag_query` payant en P4.6
Aucun nouveau backend pour la détection d'incohérences. `aiRagQuery({universeId, question, topK: 6})` (déjà branché à l'index embeddings) accepte une « question » qui est en fait un passage de chapitre — le retrieval ramène les fiches similaires, le modèle compare, et nous on affiche le verdict + les sources cliquables. Réutiliser au lieu de réécrire.

### Tiptap doc model = JSON Tiptap injectable
Le doc Tiptap est un objet JSON pur (pas de classes, pas d'instance). Conséquence : « accepter une suggestion IA » = juste pousser des nodes `{ type: "paragraph", content: [{ type: "text", text }] }` dans `doc.content`, et le `setContent(next, false)` du composant TiptapEditor met l'éditeur à jour sans déclencher d'onUpdate (loop). 15 lignes pour `appendParagraphs` et `replaceWithParagraphs`.

### Ctrl/Cmd-S réflexe d'écriture
Petit détail mais énorme pour l'UX. Un useEffect sur `keydown` qui intercepte Ctrl/Cmd-S et appelle save si dirty, puis flash « ✓ enregistré » 1.5s. Coût : 12 lignes. Bénéfice : la sensation de « vrai logiciel d'écriture ».

---

## Ce qui a moins bien marché

### Pas de support `asChild` dans notre Button
Pour faire un Link stylé comme un bouton (ouvrir une story), j'ai voulu écrire `<Button asChild><Link to="...">…</Link></Button>` (pattern Radix/shadcn). Notre Button hand-écrit ne le supporte pas. Workaround : Link stylé manuellement avec les classes Tailwind du Button primary. Pas grave, mais à factoriser quand on aura 3 occurrences (règle de 3).

### Helper `collectText` dupliqué 3 fois
Les trois panels IA (Continue, Actions, Consistency) ont chacun leur copie de `collectText` qui extrait le texte d'un doc Tiptap. C'est volontaire (la règle de 3 est franchie au pire endroit) — à factoriser dans `lib/tiptap-utils.ts` en P4.x si on ajoute un 4e usage. Pour l'instant chaque panel reste autonome.

### Pas d'auto-save
Le save reste manuel (bouton ou Ctrl-S). Le risque : un utilisateur qui écrit pendant 30min sans sauver et qui perd tout sur un crash Tauri. Pour P4.x : auto-save debounced (3-5s après la dernière touche), avec indicateur visuel.

### Le `word_count` est calculé côté front
Le backend ne touche pas au word_count, il le stocke tel que envoyé. Conséquence : un script tiers qui écrit dans la DB peut planter cette colonne. Trade-off accepté pour éviter de re-parser le doc Tiptap à chaque update — mais à durcir si on ajoute des opérations bulk.

### La détection d'incohérences est tronquée à 600 mots
Pour les chapitres longs (>2 000 mots), on ne vérifie que la fin. Une vérification complète nécessiterait un découpage en passes (sliding window) ou un mode « passe entière » plus lent. Réservé à P4.x.

---

## Décisions notables

### Le RAG du lore ne dépend pas de la story
On envoie `universeId` + un texte arbitraire à `aiRagQuery`. Pas de scoping « cherche seulement dans les entités liées à cette story ». Volontaire — l'utilisateur peut écrire un chapitre qui touche n'importe quelle partie du lore, on ne veut pas le contraindre. Si besoin un jour, on rajoutera un filtre `storyId?` côté backend.

### Le `word_count` est `i64` côté Rust et `number` côté TS
Pas de validation supplémentaire (juste >= 0). Un roman a < 1M de mots, on est très en dessous des limites JS Number. RAS.

### L'IA n'écrit jamais directement en DB
Toutes les sorties IA passent par le state local (TiptapDoc dans React) et n'atteignent la DB qu'après un Save explicite (bouton ou Ctrl-S). Cohérent avec la philosophie « auteur garde la main ». Évolution possible : un mode « auto-merge » pour les sessions longues, mais opt-in.

### Pas d'extraction d'entités dans P4.6
J'ai envisagé une étape de NER (extraction de noms propres dans le chapitre) avant le RAG. Décision : laisser le retrieval embeddings + le modèle faire le boulot. Plus simple, et le résultat reste contextuel parce que les fiches retrouvées sont par similarité sémantique. Si le faux-positifs explose, on ajoutera une étape NER en P5.

---

## Métriques

- **6 sprints livrés** (P4.1 à P4.6 + P4.7 release).
- **~3 200 lignes ajoutées** sur la phase (estimation rapide), réparties grosso modo : 700 backend (domain + repos + tests + commandes), 2 500 front (page d'écriture, 3 panels IA, types, api).
- **3 nouvelles tables** activées (`stories`, `chapters`, `chapter_entity_refs` — cette dernière pas encore exploitée, réservée à P5).
- **11 nouvelles commandes Tauri** : 5 stories + 6 chapters.
- **13 tests unitaires** ajoutés (6 stories + 7 chapters).
- **0 nouveau type de provider IA** : tout repose sur l'existant (`ai_complete` + `ai_rag_query`).

---

## Ce qu'on garde pour Phase 5+

- **Auto-save** debounced sur les chapitres.
- **Drag-and-drop** réel pour réordonner les chapitres (actuellement boutons ▲/▼).
- **chapter_entity_refs** : panel « Personnages présents dans ce chapitre » + filtres dans la frise.
- **Fact-check par passes** : découper un chapitre long et croiser chaque passe avec le RAG (pour la détection d'incohérences complète).
- **Mode brouillon → relu → final** vraiment exploité (filtres, badges sur la sidebar, blocage du Save en mode final, etc.).
- **Export d'une story** en Markdown / EPUB / DOCX (l'export `universe_export_markdown` couvre les fiches mais pas les chapitres pour l'instant).
- **Continuation IA inline avec preview gris dans l'éditeur** (vrai marker de range Tiptap, pas juste un panel séparé). Plus immersif, mais demande une extension Tiptap dédiée.
- **Sélection de modèle alternatif par action** : peut-être qu'on veut un modèle « créatif » pour la continuation et un modèle « littéral » pour la réécriture. Aujourd'hui c'est le même `chat_model` partout.

---

## Verdict

✅ **Phase réussie.** Romanesk est passé de « gestionnaire de lore + Q&A » à « logiciel d'écriture local-first avec IA en sparring partner ». La boucle d'écriture (créer une histoire → ouvrir → écrire → demander à l'IA → vérifier la cohérence) est complète et utilisable de bout en bout. La fondation est solide pour Phase 5 (vision, multi-modèles, atelier de description) sans devoir refactorer la base.
