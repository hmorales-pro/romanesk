# Roadmap

Reflète le phasing du PRD (`PRD.md` §14). Mis à jour à chaque clôture de milestone.

---

## Done

### Phase 0 — Fondations · `v0.0.1-phase0` (2026-05-02)
- ✅ Stack figée : Tauri 2 + React + Tiptap + SQLite (sqlite-vec reporté en Phase 2+, fallback BLOB+cosine en place)
- ✅ Repo scaffolding monorepo (apps/desktop, crates/core, db/migrations)
- ✅ Schéma DB initial avec toutes les tables du PRD §7
- ✅ Trait `Provider` IA + impl Ollama smoke-testée + MockProvider
- ✅ CI GitHub Actions offline-only sur 5 jobs
- ✅ Démo : créer univers + fiche personnage, fermer/rouvrir, persister
- ✅ Logging tracing + ErrorBoundary React + panic hook
- 📄 Rétro : [`docs/RETRO-PHASE-0.md`](./docs/RETRO-PHASE-0.md)

### Phase 1 — Lore MVP · `v0.1.0` (2026-05-02)
- ✅ Fiches Personnage et Lieu (polymorphes), édition complète Tiptap
- ✅ Relations entre entités avec 14 types figés (cf. ADR 0003), libellés directionnels
- ✅ Vue graphe interactive (`@xyflow/react`)
- ✅ Tags transversaux + filtres + recherche
- ✅ Images de couverture (Tauri dialog plugin, stockage app_data_dir)
- ✅ Export Markdown d'un univers (Tiptap → MD complet)
- 📄 Rétro : [`docs/RETRO-PHASE-1.md`](./docs/RETRO-PHASE-1.md)

### Phase 2 — Temporalité · `v0.2.0` (2026-05-02)
- ✅ Époques (`timeline_eras`) avec couleur, dates, sort_order
- ✅ Événements (`events`) datables, rattachables à une époque
- ✅ Snapshots temporels (`temporal_snapshots`) : capture d'état d'entité
- ✅ Frise visuelle SVG (`/u/:universeId/timeline`)
- ✅ Relations datables (era picker dans RelationsSection)
- 📄 Rétro : [`docs/RETRO-PHASE-2.md`](./docs/RETRO-PHASE-2.md)

### Phase 3 — IA + RAG + Ancrage réel · `v0.3.0` (2026-05-02)
- ✅ Provider IA Ollama branché à l'app (badge statut, `ai_complete`, `ai_ping`)
- ✅ Génération de fiche assistée (perso + lieu) via JSON forcé Ollama
- ✅ Embeddings via `nomic-embed-text` + indexation + Q&A RAG complet (`<RagChatPanel>`)
- ✅ RealityAnchor + DivergencePoints + WorldBrief généré par IA (`/u/:id/anchor`)
- ✅ Édition d'époque et d'événement (P2.x oublié, fix en P3)
- 📄 Rétro : [`docs/RETRO-PHASE-3.md`](./docs/RETRO-PHASE-3.md)

---

## Now (Phase 4 — Histoires + chapitrage + IA en édition)

**Sortie visée** : ~6-8 semaines après Phase 3 selon PRD §14.

- [ ] Module Histoires (table `stories`) avec type novel/novella/short_story/series
- [ ] Module Chapitres (table `chapters`) avec body_json Tiptap
- [ ] Surface d'écriture multi-chapitres (sidebar + éditeur central)
- [ ] Continuation IA in-editor : preview gris non-validé
- [ ] Réécriture, résumé, brainstorming via IA
- [ ] Détection d'incohérences via RAG sur le lore
- [ ] Premier release `v0.4.0`

---

## Later

### Phase 1 bonus (à intercaler si besoin)
- Fiches Faction / Object / Concept (architecture `EntityType` polymorphe déjà prête)
- Galerie media multi-images par fiche
- Dialog shadcn pour remplacer `window.confirm`
- Tests Vitest sur les helpers TS

### Phase 3 — IA + RAG + Ancrage réel (8-10 sem)
- Couche provider IA réelle (Ollama + cloud)
- Indexation embeddings (sqlite-vec)
- Q&A RAG sur le lore
- `RealityAnchor` + `WorldBrief` + `DivergencePoint`
- Atelier de description (mode brief texte)

### Phase 4 — Histoires & rédaction (6-8 sem)
- Module Histoires + chapitrage + éditeur riche
- Continuation in-editor, réécriture, résumés
- Détection d'incohérences

### Phase 5 — Avancées (4-6 sem)
- Atelier description mode image (vision)
- Brainstorm panel
- Fiches Faction / Objet / Concept
- Détection d'anachronismes

---

## Future (P2 — à discuter)

- Sync optionnelle multi-device (CRDT + backend privé)
- Export EPUB / PDF / DOCX
- Templates par genre (fantasy, polar, SF…)
- Companion mobile lecture-seule
