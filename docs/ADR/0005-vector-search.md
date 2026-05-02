# ADR 0005 — Recherche vectorielle (fallback BLOB + cosine pur Rust en Phase 0)

- **Statut** : Accepté pour Phase 0 — révise temporairement l'ADR 0001
- **Date** : 2026-05-02
- **Décideurs** : Hugo Morales

## Contexte

L'ADR 0001 a sélectionné `sqlite-vec` comme moteur de recherche vectorielle pour Romanesk, raison principale : « pas de service séparé, vit dans la même DB ». La table `embeddings` (migration `0001_init.sql`) prévoit déjà un BLOB `vector` + un INTEGER `dim` pour supporter plusieurs modèles et dimensions.

Au moment d'implémenter J4 (smoke test cosine), trois frictions concrètes apparaissent pour activer `sqlite-vec` côté `sqlx-sqlite` :

1. **Le chargement de l'extension** se fait via `sqlite3_auto_extension()` (FFI C) avant la première connexion. Aucun équivalent safe et idiomatique dans `sqlx 0.8`.
2. **Doublon FFI possible** : `libsqlite3-sys` (déjà tiré transitivement par `sqlx-sqlite`) doit avoir la même version exacte que celle linkée par le crate `sqlite-vec`. Une divergence donne deux libsqlite3 dans le binaire — comportement imprévisible.
3. **Lint workspace** : `unsafe_code = "forbid"` dans `Cargo.toml` interdit toute initialisation `unsafe { sqlite3_auto_extension(...) }` dans `crates/core`. Il faudrait soit relaxer le lint global, soit isoler dans une crate dédiée (`crates/sqlite-vec-bridge`).

Pour un walking skeleton J4 (livrable : un test qui prouve qu'on insère un vecteur et qu'on retrouve le top-k cosine), c'est un investissement disproportionné, et impossible à valider depuis le sandbox de développement actuel (Rust absent).

Le PHASE-0-PLAN.md prévoit explicitement ce cas dans sa section *Risques* :

> `sqlite-vec` build cross-platform (Windows surtout) → Avoir un *fallback* en BLOB + cosine custom Rust si nécessaire

## Décision

**Phase 0** : implémenter la recherche vectorielle en pur Rust, sans `sqlite-vec`.

- Stockage : la table `embeddings` existante, `vector BLOB NOT NULL` rempli avec les bytes des `f32` en little-endian (pas de format binaire custom).
- Recherche : pour une requête `q` de dimension `d`, on `SELECT` toutes les lignes où `dim = d` (et optionnellement `model = ?`), on désérialise les BLOBs en `Vec<f32>`, on calcule la **similarité cosine** en Rust, on trie décroissant, on prend les `k` premiers.
- API publique : un module `rag::vec` qui expose `EmbeddingRepo::insert(NewEmbedding)` et `EmbeddingRepo::search_topk(query: &[f32], k: usize, filter: SearchFilter) -> Vec<EmbeddingHit>`.

**Phase 1** : migration vers `sqlite-vec`, sans changement d'API publique côté `EmbeddingRepo`. Conditions de déclenchement :

- (a) On a un dataset de référence (≥ 5 000 vecteurs représentatifs sur ≥ 2 univers) qui permet de mesurer le gain de `sqlite-vec` vs naive cosine — sinon on optimise sans données.
- (b) On a un budget de 1 à 2 jours-dev pour gérer le doublon FFI proprement (probablement isolation dans `crates/sqlite-vec-bridge` qui est la seule crate à `#![allow(unsafe_code)]`).
- (c) Le test d'intégration vectoriel actuel (J4) sert de filet de sécurité — ses résultats doivent être identiques avant/après migration sur le même dataset.

## Conséquences

### Performances

Cosine naïf en Rust est `O(N × d)` par requête, avec :
- `N` = nombre de vecteurs candidats (filtrés par `dim` et `model`).
- `d` = dimension (typiquement 384 pour `nomic-embed-text`, 768 pour `bge-base`, 1024 pour `bge-large`).

Ordre de grandeur attendu sur Apple Silicon en mode release :
- `N=1 000`, `d=384` → ~0.4 ms par requête.
- `N=10 000`, `d=384` → ~4 ms.
- `N=100 000`, `d=384` → ~40 ms.

Pour Romanesk, un univers typique aura `N` entre `100` et `10 000` vecteurs. Cosine pur Rust est donc largement suffisant pour le confort d'usage. Le seuil de bascule vers `sqlite-vec` se situe vraisemblablement vers `N ≥ 50 000` ou des dimensions ≥ 1 024.

### Compatibilité binaire des BLOBs

Le format choisi — `f32` little-endian concaténés, longueur `dim × 4` octets — est trivial à relire par `sqlite-vec` (qui utilise lui-même ce layout pour ses colonnes `float[N]`). La migration future sera donc :

1. Activer `sqlite-vec`, créer un index virtuel `vec_embeddings_<dim> USING vec0(vector float[<DIM>])`.
2. Backfill : `INSERT INTO vec_embeddings_<dim> SELECT id, vector FROM embeddings WHERE dim = <DIM>`.
3. Switch `EmbeddingRepo::search_topk` pour requêter l'index virtuel à la place du `SELECT` plein.

Pas de re-encodage des données, pas de changement schéma autre que l'index.

### Tests Phase 0

Les tests J4 valident :
- Round-trip BLOB → `Vec<f32>` (encode + decode bit-exact).
- Cosine sur 3 vecteurs synthétiques (rang correct, score attendu).
- Filtre dimension (rejette les vecteurs de dim incompatible avec la query).
- Détection d'un BLOB corrompu (taille en octets incompatible avec `dim × 4`).

Ces tests resteront valides Phase 1, et serviront de **régression test** pour valider que la migration `sqlite-vec` ne change pas les résultats fonctionnels.

### Note sur la limite

Si le dataset Romanesk d'un utilisateur dépassait `100 000` vecteurs et que les requêtes RAG devenaient sensiblement lentes, on a deux leviers avant même `sqlite-vec` :
- Pré-filtrage métier (ne chercher que dans les entités de l'univers actif, pas tout).
- Quantization int8 : 4× moins de RAM, 4× plus rapide en pratique. Compatibilité conservée.

## Alternatives écartées

- **`sqlite-vec` dès Phase 0** : voir ci-dessus.
- **`lance` / `qdrant-client`** : services séparés ou crates lourds, contraires à l'esprit local-first single-file.
- **`hnsw_rs`** : index HNSW pur Rust, intéressant à `N` élevé mais ajoute de la complexité (index à reconstruire, état séparé du SQLite). À reconsidérer Phase 1 en alternative à `sqlite-vec`.
- **Stocker les vecteurs en TEXT JSON** : 4× plus volumineux, parsing JSON à chaque lecture. Rejeté.
