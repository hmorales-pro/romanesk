-- 0002 — Cloisonnement des embeddings par univers + index de recherche.
--
-- Deux problèmes sur la même table.
--
-- 1. `embeddings` ne portait aucune trace de l'univers. La recherche
--    vectorielle filtrait sur `dim`, `model` et `source_type`, jamais sur
--    l'univers : un auteur travaillant sur deux mondes obtenait, en
--    posant une question sur l'un, des passages tirés de l'autre. Pour un
--    outil qui promet des univers étanches, c'est une fuite.
--
-- 2. Aucun index ne couvrait les colonnes de filtrage. Chaque question
--    balayait la table entière et décodait tous les vecteurs.
--
-- La colonne est nullable : les lignes antérieures à cette migration sont
-- rattachées par le backfill ci-dessous quand leur source est une entité.
-- Ce qui reste à NULL (source orpheline, type non encore rattaché) est
-- traité comme « hors périmètre » par la recherche filtrée.

ALTER TABLE embeddings ADD COLUMN universe_id TEXT;

-- Backfill : les embeddings d'entités connaissent leur univers par
-- jointure. Les entités soft-deleted sont incluses volontairement — leur
-- embedding sera purgé à la prochaine réindexation, pas ici.
UPDATE embeddings
SET universe_id = (
    SELECT e.universe_id
    FROM lore_entities e
    WHERE e.id = embeddings.source_id
)
WHERE source_type = 'entity'
  AND universe_id IS NULL;

-- Index de recherche : l'ordre des colonnes suit celui du WHERE de
-- `search_topk` (universe_id, dim, puis model en filtre optionnel).
CREATE INDEX IF NOT EXISTS idx_emb_scope
    ON embeddings(universe_id, dim, model);
