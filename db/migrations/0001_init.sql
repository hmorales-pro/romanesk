-- Romanesk — initial schema
-- Reflète le PRD §7. Toutes les FK ont ON DELETE CASCADE par défaut, soft-delete via deleted_at.
-- À exécuter via refinery (versionnée).

PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;

------------------------------------------------------------
-- Univers (root)
------------------------------------------------------------
CREATE TABLE universes (
    id              TEXT PRIMARY KEY NOT NULL,            -- UUID v7
    name            TEXT NOT NULL,
    description     TEXT,
    settings_json   TEXT NOT NULL DEFAULT '{}',           -- langue, genres, calendrier, etc.
    created_at      TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at      TEXT NOT NULL DEFAULT (datetime('now')),
    deleted_at      TEXT
);

CREATE INDEX idx_universes_deleted ON universes(deleted_at);

------------------------------------------------------------
-- Reality Anchor (1 par univers, optionnel)
------------------------------------------------------------
CREATE TABLE reality_anchors (
    id              TEXT PRIMARY KEY NOT NULL,
    universe_id     TEXT NOT NULL UNIQUE REFERENCES universes(id) ON DELETE CASCADE,
    mode            TEXT NOT NULL CHECK (mode IN ('none','historical','divergent')),
    pivot_date      TEXT,                                 -- ISO date dans le calendrier réel
    base_world      TEXT NOT NULL DEFAULT 'earth_real',
    notes           TEXT,
    created_at      TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE divergence_points (
    id              TEXT PRIMARY KEY NOT NULL,
    anchor_id       TEXT NOT NULL REFERENCES reality_anchors(id) ON DELETE CASCADE,
    when_iso        TEXT NOT NULL,                        -- ISO date réelle
    axis            TEXT NOT NULL CHECK (axis IN ('tech','politics','culture','event','nature')),
    title           TEXT NOT NULL,
    description     TEXT,
    created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_divergence_anchor ON divergence_points(anchor_id);
CREATE INDEX idx_divergence_when   ON divergence_points(when_iso);

CREATE TABLE world_briefs (
    id              TEXT PRIMARY KEY NOT NULL,
    anchor_id       TEXT NOT NULL REFERENCES reality_anchors(id) ON DELETE CASCADE,
    snapshot_date   TEXT NOT NULL,                        -- ISO date couverte
    content_json    TEXT NOT NULL,                        -- {politics, tech, culture, daily_life, ...}
    source          TEXT NOT NULL CHECK (source IN ('ai_generated','manual','merged')),
    pinned          INTEGER NOT NULL DEFAULT 1,           -- 1 = indexé en RAG
    created_at      TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_briefs_anchor ON world_briefs(anchor_id);

------------------------------------------------------------
-- Timeline : époques + événements
------------------------------------------------------------
CREATE TABLE timeline_eras (
    id              TEXT PRIMARY KEY NOT NULL,
    universe_id     TEXT NOT NULL REFERENCES universes(id) ON DELETE CASCADE,
    name            TEXT NOT NULL,
    start_year      INTEGER,                              -- année dans le calendrier de l'univers
    end_year        INTEGER,
    description     TEXT,
    color           TEXT,
    sort_order      INTEGER NOT NULL DEFAULT 0,
    created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_eras_universe ON timeline_eras(universe_id);

CREATE TABLE events (
    id              TEXT PRIMARY KEY NOT NULL,
    universe_id     TEXT NOT NULL REFERENCES universes(id) ON DELETE CASCADE,
    era_id          TEXT REFERENCES timeline_eras(id) ON DELETE SET NULL,
    name            TEXT NOT NULL,
    year            INTEGER,
    description     TEXT,
    created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_events_universe ON events(universe_id);
CREATE INDEX idx_events_era      ON events(era_id);

------------------------------------------------------------
-- Lore Entities (polymorphes)
------------------------------------------------------------
CREATE TABLE lore_entities (
    id              TEXT PRIMARY KEY NOT NULL,
    universe_id     TEXT NOT NULL REFERENCES universes(id) ON DELETE CASCADE,
    type            TEXT NOT NULL CHECK (type IN ('Character','Location','Faction','Object','Concept','RealEntity')),
    name            TEXT NOT NULL,
    summary         TEXT,
    content_json    TEXT NOT NULL DEFAULT '{}',           -- champs spécifiques au type
    cover_image     TEXT,                                 -- chemin relatif dans media/
    is_real         INTEGER NOT NULL DEFAULT 0,           -- 1 si épinglé depuis la réalité
    created_at      TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at      TEXT NOT NULL DEFAULT (datetime('now')),
    deleted_at      TEXT
);

CREATE INDEX idx_entities_universe   ON lore_entities(universe_id);
CREATE INDEX idx_entities_type       ON lore_entities(type);
CREATE INDEX idx_entities_deleted    ON lore_entities(deleted_at);
CREATE INDEX idx_entities_name_low   ON lore_entities(LOWER(name));

------------------------------------------------------------
-- Snapshots temporels (overrides par époque)
------------------------------------------------------------
CREATE TABLE temporal_snapshots (
    id                  TEXT PRIMARY KEY NOT NULL,
    entity_id           TEXT NOT NULL REFERENCES lore_entities(id) ON DELETE CASCADE,
    era_id              TEXT REFERENCES timeline_eras(id) ON DELETE SET NULL,
    event_id            TEXT REFERENCES events(id) ON DELETE SET NULL,
    year_in_universe    INTEGER,
    snapshot_json       TEXT NOT NULL,                    -- overrides du contenu canonique
    note                TEXT,
    created_at          TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_snapshots_entity ON temporal_snapshots(entity_id);
CREATE INDEX idx_snapshots_era    ON temporal_snapshots(era_id);

------------------------------------------------------------
-- Relations entre entités (graphe)
------------------------------------------------------------
CREATE TABLE relations (
    id              TEXT PRIMARY KEY NOT NULL,
    source_id       TEXT NOT NULL REFERENCES lore_entities(id) ON DELETE CASCADE,
    target_id       TEXT NOT NULL REFERENCES lore_entities(id) ON DELETE CASCADE,
    type            TEXT NOT NULL,                        -- ally_of, mentor_of, ruled_over, located_in...
    era_id          TEXT REFERENCES timeline_eras(id) ON DELETE SET NULL,
    description     TEXT,
    created_at      TEXT NOT NULL DEFAULT (datetime('now')),
    CHECK (source_id <> target_id)
);

CREATE INDEX idx_relations_source ON relations(source_id);
CREATE INDEX idx_relations_target ON relations(target_id);
CREATE INDEX idx_relations_type   ON relations(type);

------------------------------------------------------------
-- Stories & Chapters
------------------------------------------------------------
CREATE TABLE stories (
    id              TEXT PRIMARY KEY NOT NULL,
    universe_id     TEXT REFERENCES universes(id) ON DELETE CASCADE,  -- nullable : stories orphelines OK
    title           TEXT NOT NULL,
    type            TEXT NOT NULL CHECK (type IN ('novel','novella','short_story','series')),
    synopsis        TEXT,
    status          TEXT NOT NULL DEFAULT 'drafting',
    target_word_count INTEGER,
    pivot_era_id    TEXT REFERENCES timeline_eras(id) ON DELETE SET NULL,
    created_at      TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at      TEXT NOT NULL DEFAULT (datetime('now')),
    deleted_at      TEXT
);

CREATE INDEX idx_stories_universe ON stories(universe_id);

CREATE TABLE chapters (
    id              TEXT PRIMARY KEY NOT NULL,
    story_id        TEXT NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
    sort_order      INTEGER NOT NULL DEFAULT 0,
    title           TEXT,
    body_json       TEXT NOT NULL DEFAULT '{}',           -- ProseMirror/Tiptap JSON
    word_count      INTEGER NOT NULL DEFAULT 0,
    status          TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','reviewed','final')),
    era_id          TEXT REFERENCES timeline_eras(id) ON DELETE SET NULL,
    created_at      TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_chapters_story ON chapters(story_id);

CREATE TABLE chapter_entity_refs (                        -- M:N entre chapters et lore_entities
    chapter_id      TEXT NOT NULL REFERENCES chapters(id) ON DELETE CASCADE,
    entity_id       TEXT NOT NULL REFERENCES lore_entities(id) ON DELETE CASCADE,
    PRIMARY KEY (chapter_id, entity_id)
);

------------------------------------------------------------
-- Tags (transversaux)
------------------------------------------------------------
CREATE TABLE tags (
    id              TEXT PRIMARY KEY NOT NULL,
    universe_id     TEXT NOT NULL REFERENCES universes(id) ON DELETE CASCADE,
    name            TEXT NOT NULL,
    color           TEXT,
    UNIQUE (universe_id, name)
);

CREATE TABLE entity_tags (
    entity_id       TEXT NOT NULL REFERENCES lore_entities(id) ON DELETE CASCADE,
    tag_id          TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
    PRIMARY KEY (entity_id, tag_id)
);

------------------------------------------------------------
-- Médias attachés
------------------------------------------------------------
CREATE TABLE media_assets (
    id              TEXT PRIMARY KEY NOT NULL,
    entity_id       TEXT REFERENCES lore_entities(id) ON DELETE CASCADE,
    chapter_id      TEXT REFERENCES chapters(id) ON DELETE CASCADE,
    path            TEXT NOT NULL,
    kind            TEXT NOT NULL,                        -- image|audio|other
    alt_text        TEXT,
    created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

------------------------------------------------------------
-- Notes libres
------------------------------------------------------------
CREATE TABLE notes (
    id              TEXT PRIMARY KEY NOT NULL,
    entity_id       TEXT REFERENCES lore_entities(id) ON DELETE CASCADE,
    body            TEXT NOT NULL,
    created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

------------------------------------------------------------
-- AI sessions (traçabilité)
------------------------------------------------------------
CREATE TABLE ai_sessions (
    id              TEXT PRIMARY KEY NOT NULL,
    universe_id     TEXT REFERENCES universes(id) ON DELETE SET NULL,
    provider        TEXT NOT NULL,                        -- ollama|anthropic|openai|gemini|mistral
    model           TEXT NOT NULL,
    task            TEXT NOT NULL,                        -- continuation|coherence|rag_qa|generation|rewrite|brainstorm|summary|description
    prompt          TEXT NOT NULL,
    response        TEXT,
    context_refs    TEXT,                                 -- JSON: ids des entités/chunks cités
    cost_estimate   REAL,
    duration_ms     INTEGER,
    created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_ai_sessions_universe ON ai_sessions(universe_id);
CREATE INDEX idx_ai_sessions_task     ON ai_sessions(task);

------------------------------------------------------------
-- Embeddings (RAG) — la table data ; sqlite-vec ajoutera l'index virtuel
------------------------------------------------------------
CREATE TABLE embeddings (
    id              TEXT PRIMARY KEY NOT NULL,
    source_type     TEXT NOT NULL,                        -- entity|snapshot|chapter|brief|note
    source_id       TEXT NOT NULL,
    chunk_idx       INTEGER NOT NULL DEFAULT 0,
    content         TEXT NOT NULL,
    model           TEXT NOT NULL,                        -- nom du modèle d'embedding
    dim             INTEGER NOT NULL,
    vector          BLOB NOT NULL,                        -- f32[dim] little-endian
    created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_emb_source ON embeddings(source_type, source_id);

-- Index virtuel sqlite-vec — créé en code Rust à l'init pour pouvoir choisir la dimension dynamiquement
-- CREATE VIRTUAL TABLE vec_embeddings USING vec0(vector float[<DIM>]);

------------------------------------------------------------
-- Triggers updated_at automatiques
------------------------------------------------------------
CREATE TRIGGER trg_universes_updated AFTER UPDATE ON universes
BEGIN
    UPDATE universes SET updated_at = datetime('now') WHERE id = NEW.id;
END;

CREATE TRIGGER trg_entities_updated AFTER UPDATE ON lore_entities
BEGIN
    UPDATE lore_entities SET updated_at = datetime('now') WHERE id = NEW.id;
END;

CREATE TRIGGER trg_chapters_updated AFTER UPDATE ON chapters
BEGIN
    UPDATE chapters SET updated_at = datetime('now') WHERE id = NEW.id;
END;

CREATE TRIGGER trg_stories_updated AFTER UPDATE ON stories
BEGIN
    UPDATE stories SET updated_at = datetime('now') WHERE id = NEW.id;
END;

CREATE TRIGGER trg_anchors_updated AFTER UPDATE ON reality_anchors
BEGIN
    UPDATE reality_anchors SET updated_at = datetime('now') WHERE id = NEW.id;
END;

CREATE TRIGGER trg_briefs_updated AFTER UPDATE ON world_briefs
BEGIN
    UPDATE world_briefs SET updated_at = datetime('now') WHERE id = NEW.id;
END;
