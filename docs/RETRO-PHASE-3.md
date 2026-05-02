# Rétrospective — Phase 3 (IA + RAG + Ancrage réel)

> **Période** : tag `v0.2.0` → tag `v0.3.0`.
> **Objectif initial** : connecter Romanesk à un provider IA (Ollama local), exploiter les embeddings pour un Q&A RAG sur le lore, et permettre d'ancrer un univers à la réalité historique avec génération de WorldBrief.
> **Critère de sortie** : pouvoir poser une question naturelle sur son univers et obtenir une réponse contextualisée + sources, et configurer un ancrage historique avec génération assistée d'un brief.

---

## Ce qui est livré

| Sprint | Statut | Commit |
|--------|--------|--------|
| P3.1 Service AI + badge statut | ✅ | (commit P3.1) |
| P3.2 Génération de fiche assistée | ✅ | `19e112f` |
| P3.3 Embeddings réels Ollama + Q&A RAG | ✅ | `5eb7471` |
| P3.4 RealityAnchor + WorldBrief + DivergencePoint | ✅ | (commit P3.4) |
| P3.5 Release v0.3.0 | ✅ | (release commit) |

---

## Ce qui a marché

### Trait `Provider` payant
L'abstraction posée en J5 (trait `Provider` + `OllamaProvider` + `MockProvider`) a tenu sans modification structurelle. Implémenter `OllamaProvider::embed()` (TODO depuis J5) a été 30 lignes. Ajouter une 2e State Tauri (`AiEmbedder` distinct du `AiProvider` chat) est trivial parce que les deux types de modèles sont des `OllamaProvider` configurés différemment.

### Mode JSON forcé d'Ollama
`req.json_schema.is_some()` → `format: "json"` côté HTTP. L'IA produit alors un JSON syntaxiquement valide qu'on peut parser sans `extract_json_object` la plupart du temps. Très utile pour P3.2 (drafts d'entités) et P3.4 (WorldBrief).

### Le format BLOB f32 LE de J4 est compatible direct
L'`EmbeddingRepo` posé en J4 (avec ADR 0005) a accepté les vecteurs de `nomic-embed-text` (768 dim) sans aucune modification. Pas de conversion, pas de migration. Le `search_topk` cosine pur Rust fait le job en quelques ms sur 50 fiches.

### RAG en 1 commit
P3.3 a livré le pipeline complet (indexation + Q&A + UI) en un seul commit cohérent. Possible parce que toutes les briques (embeddings repo, search_topk, provider IA, prompt templates) étaient déjà posées.

---

## Ce qui a coincé

### Linker errors macOS récent + rustc 1.95
Le gros caillou de cette phase. Hugo a un Mac qui tourne sur **macOS 26** (très récent) avec **rustc 1.95** (très récent). Les libs C précompilées (`ring`, `libsqlite3-sys`) génèrent des objets pour macOS 26.x mais Tauri par défaut linke pour macOS 11.0 → mismatch ABI sur ARM64 → `undefined symbol`. En plus, `[profile.dev] opt-level = 1` qu'on avait posé au bootstrap génère du code monomorphisé qui ne survit pas aux rebuilds incrémentaux. Fix appliqué : `MACOSX_DEPLOYMENT_TARGET = "13.0"` + `CARGO_INCREMENTAL = "0"` + `opt-level = 0` en dev. À documenter dans la rétro pour tout futur dev sur Mac.

### Téléchargement et choix du modèle
`gemma:latest` (default au bootstrap) puis `gemma3:latest` (mon guess en P3.1) ont tous les deux raté chez Hugo qui a `gemma4:e2b`. À régler proprement Phase 4+ par une page Settings où l'utilisateur configure l'URL Ollama et le modèle, persisté en DB ou settings.json.

### Pas de relecture indépendante
Les commits Phase 3 n'ont pas eu de relecture par agent (cf. Phase 0/1 où c'était systématique). Pour économiser des tokens vu la longueur de la session. Risque acceptable parce que les patterns Repo / commandes sont maintenant standardisés.

### Conversation longue → fenêtre saturée
La conversation Phase 3 commence à être longue. Si on doit continuer en Phase 4+, prévoir de l'archivage régulier des décisions importantes dans les ADR / RETRO pour pouvoir les retrouver.

---

## Décisions reportées en Phase 4

- **Page Settings d'app** : URL Ollama + modèle chat + modèle embed configurables (au lieu de hardcoded + env vars).
- **Settings d'univers** : language + tone + autres paramètres `universe.settings` éditables via UI (pour l'instant éditable seulement via SQLite à la main).
- **Streaming des réponses IA** : actuellement on attend la réponse complète. Pour les questions RAG longues, le streaming améliorerait l'UX.
- **Mémoire conversationnelle RAG** : actuellement chaque question est indépendante. Un mode « conversation » garderait l'historique comme contexte.
- **Chunking par paragraphe** des biographies / descriptions longues (Phase 3.3 = 1 chunk par entité, OK jusqu'à ~50 fiches).
- **Restauration d'un Snapshot vers l'état canonique** d'une entité (UI à mûrir).
- **Édition d'une RealityAnchor avec UI complète** : actuellement on édite via le même form qu'à la création. OK parce qu'il n'y a qu'1 anchor par univers (UNIQUE).
- **Édition / restauration d'un WorldBrief** : actuellement read-only après génération. Permettre d'éditer le JSON manuellement (`source` passe à `merged`).
- **Injection automatique du WorldBrief dans les prompts RAG** : actuellement on n'utilise pas le WorldBrief comme contexte additionnel pour les questions RAG. À ajouter Phase 4.

---

## Métriques Phase 3

| Indicateur | Valeur |
|------------|--------|
| Sprints livrés | 5 (P3.1 à P3.5) |
| Commits Phase 3 | 4 features + 1 release + ~5 fix de build = ~10 |
| Lignes ajoutées | ~3 500 (hors fix build) |
| Tests Rust ajoutés | 0 (relecture par agent skipped, focus sur livrer) |
| Tests TS | 0 (toujours 0 — dette qui s'accumule) |
| Bugs attrapés en relecture | N/A (pas de relecture cette phase) |
| ADR rédigées | 0 |
| Plugins Tauri ajoutés | 0 (juste réutilisation de tauri-plugin-shell, dialog déjà ajoutés en P1.5) |
| Crates Rust ajoutés | 0 |
| Modules Rust nouveaux | 1 (`repo/anchor`) + extension de `commands/ai.rs` |
| Composants React nouveaux | 4 (AIStatusBadge, RagChatPanel, AnchorPage, et l'extension de UniversePage forms) |

---

## Conditions d'entrée Phase 4

Phase 4 (Histoires + chapitrage + IA en édition) peut démarrer dès que :

- [ ] Build Tauri stable chez Hugo (cf. fixes macOS deployment target + opt-level).
- [ ] `cargo test --workspace --features offline-tests` reste vert (~80 tests).
- [ ] CI GitHub Actions verte sur `v0.3.0` après push.
- [ ] Capture vidéo de démo Phase 3 (ancrage + RAG + génération).
- [ ] Décision sur le scope Phase 4 :
  - **4a** : Module Histoires + chapitrage Tiptap multi-document
  - **4b** : Continuation IA in-editor (preview gris non-validé), réécriture, résumé
  - **4c** : Détection d'incohérences IA (utilise RAG pour vérifier qu'un nouveau paragraphe matche le lore existant)

Estimation Phase 4 : 6-8 semaines selon le PRD §14. Premier livrable : `v0.4.0` avec une vraie surface d'écriture de manuscrit + IA en édition.
