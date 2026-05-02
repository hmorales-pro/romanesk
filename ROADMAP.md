# Roadmap

Reflète le phasing du PRD (`PRD.md` §14). Mis à jour à chaque clôture de milestone.

---

## Now (Phase 0 — fondations)

**Sortie visée** : 2 semaines après le kick-off.

- [ ] Stack figée : Tauri 2 + React + Tiptap + SQLite + sqlite-vec
- [ ] Repo scaffolding monorepo (apps/desktop, crates/core, db/migrations)
- [ ] Schéma DB initial avec toutes les tables du PRD (lore, timeline, reality anchor)
- [ ] Trait `Provider` IA + impl Ollama smoke-tested
- [ ] CI GitHub Actions offline-only verte
- [ ] Démo : créer un univers + une fiche personnage, fermer/rouvrir, persister

---

## Next (Phase 1 — Lore MVP)

**Sortie visée** : ~10 semaines après Phase 0.

- [ ] Module Univers & Bibliothèque (CRUD)
- [ ] Fiches Personnage et Lieu (P0) avec éditeur Tiptap, tags, images
- [ ] Relations entre entités (graphe basique)
- [ ] Recherche / filtrage par type, tags, faction, lieu
- [ ] Export Markdown d'un univers
- [ ] Premier release publique (`v0.1.0`)

---

## Later

### Phase 2 — Temporalité (4-6 sem)
- Époques, événements, snapshots temporels, frise visuelle
- Relations datables

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
