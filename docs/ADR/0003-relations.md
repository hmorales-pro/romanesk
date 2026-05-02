# ADR 0003 — Types de relations entre entités de lore

- **Statut** : Accepté
- **Date** : 2026-05-02
- **Décideurs** : Hugo Morales

## Contexte

La table `relations` (`db/migrations/0001_init.sql`) connecte deux `lore_entities` (Personnage, Lieu, Faction, Objet, Concept, RealEntity) avec une colonne `type TEXT NOT NULL`. La question (OQ5 du PRD) : faut-il livrer en v1 :

- (a) un **set figé** de types de relation, validé par contrainte CHECK ou par une enum côté Rust ;
- (b) un schéma **extensible par l'utilisateur**, qui peut créer ses propres types (`disciple_de`, `vassal_de`, `créateur_de`, etc.) directement depuis l'UI.

Trade-off : simplicité + cohérence + qualité du graphe en (a) ; flexibilité créative en (b).

## Décision

**Set figé en v1** (Phase 0 → Phase 1) avec environ 12-15 types de relation prédéfinis qui couvrent les cas universels de la fiction. Extensibilité utilisateur reportée en **Phase 2+**, *si* le besoin se confirme à l'usage réel.

Le set v1 retenu :

| Type | Sens | Domaines (source → cible) |
|------|------|---------------------------|
| `ally_of` | Alliance déclarée, symétrique | Character ↔ Character, Faction ↔ Faction |
| `enemy_of` | Inimitié, symétrique | Character ↔ Character, Faction ↔ Faction |
| `mentor_of` | A formé / a guidé | Character → Character |
| `parent_of` | Parent biologique ou adoptif | Character → Character |
| `sibling_of` | Fratrie, symétrique | Character ↔ Character |
| `married_to` | Conjoint, symétrique | Character ↔ Character |
| `member_of` | Appartenance à une faction | Character → Faction |
| `leader_of` | Dirige une faction | Character → Faction |
| `ruled_over` | A gouverné un lieu | Character → Location, Faction → Location |
| `located_in` | Contenu géographiquement | Location → Location, Character → Location |
| `owns` | Possession | Character → Object, Faction → Object, Faction → Location |
| `created` | A créé / fondé | Character → Faction, Character → Object, Character → Concept |
| `derived_from` | Dérive de / inspiré de | Concept → Concept, Object → Object |
| `mentions` | Référence narrative faible (pour le RAG) | * → * |

Note : `relations.era_id` (déjà dans le schéma) permet de **dater** chaque relation. `Aldric mentor_of Lyra` peut n'être vrai qu'à l'ère « Académie de Bren », pas à l'ère « Exil ».

## Pourquoi figé en v1

1. **Cohérence du graphe.** Si l'utilisateur peut écrire `disciple_de`, `eleve_de`, `formé_par`, `apprend_avec`, on obtient 4 arcs sémantiquement équivalents que ni le filtrage ni le RAG ne sauront recoller. Un set figé garantit qu'une requête « qui est le mentor de Lyra ? » trouve **toujours** la réponse, quel que soit l'utilisateur.
2. **UX au démarrage.** Un picker à 14 entrées avec icône et description bat un champ texte libre sur la rapidité de saisie. Surface zéro confusion : pas de doute « j'ai déjà créé ce type ? Avec quel nom déjà ? ».
3. **Les modèles IA (cloud + local) connaissent ces verbes.** `mentor_of`, `ally_of`, `parent_of` sont des relations canoniques en knowledge graphs. Toute génération assistée (suggestion de relations, détection d'incohérence) sera plus fiable.
4. **Coût d'extension futur faible.** Quand un utilisateur réclamera `vassal_of` ou `tutor_of`, on l'ajoute à la liste en une PR de 5 lignes (Rust enum + label UI + migration optionnelle de l'icône). Pas besoin d'introduire un mécanisme de schéma dynamique pour si peu.
5. **Validation côté Rust.** L'enum `RelationType` côté `crates/core` permettra du `match` exhaustif (clippy::missing_enum_arms) — tout nouveau code qui itère sur les types est forcé de gérer chaque cas. Un schéma libre perd ce filet.

## Conséquences

### Implémentation
- Côté Rust (`crates/core/src/repo/relation.rs`, à venir J3) : `enum RelationType { AllyOf, EnemyOf, MentorOf, … }` avec `serde(rename_all = "snake_case")`.
- Côté SQL : pas de CHECK constraint dans la migration `0001_init.sql` (volontairement laissée libre pour ne pas bloquer une migration de schéma plus tard) ; la validation est faite côté Rust à l'insertion.
- Côté UI : un `<RelationTypePicker />` qui liste les 14 types avec icône Lucide + libellé court. Pas de saisie libre.

### Symétrie
Les types `ally_of`, `enemy_of`, `sibling_of`, `married_to` sont **symétriques sémantiquement** mais stockés en un seul arc orienté `source → target`. Le repository et l'UI doivent considérer la relation comme valable dans les deux sens :
- À la lecture : *« qui sont les alliés de X ? »* = `WHERE (source = X OR target = X) AND type = 'ally_of'`.
- À l'écriture : on ne crée qu'un seul arc, peu importe l'ordre de `(source, target)`.
- Tests unitaires obligatoires sur ce point dès que `Repo::list_relations_for_entity` existe.

### Validation
- `CHECK (source_id <> target_id)` est déjà dans la migration → pas d'auto-relation.
- Un test unitaire vérifie qu'une `Relation` avec un `type` inconnu côté Rust panique à la désérialisation. Si on lit une vieille DB où un humain a inséré un type orphelin à la main, on doit le détecter, pas l'avaler silencieusement.

### Extensibilité Phase 2+
Quand on ouvrira l'extensibilité (si on l'ouvre), trois options déjà identifiées :
- Garder l'enum, ajouter une variante `Custom(String)` qui ne brise pas les `match` exhaustifs.
- Introduire une table `relation_types` avec un nom canonique + un libellé i18n + une icône.
- Mode hybride : enum pour les 14 canoniques, table custom pour le reste.

À trancher quand on aura le signal réel d'usage. Pas avant.

## Alternatives écartées

- **Schéma libre dès la v1.** Risque de prolifération de synonymes, dégradation du graphe, RAG plus difficile, UX plus floue.
- **Set encore plus restreint (5-6 types).** Couvre mal les histoires politiques (factions, alliances) et familiales (parent, sibling, conjoint).
- **Laisser l'utilisateur définir le set au démarrage de l'univers.** Ajoute une étape de friction, et la plupart des utilisateurs garderont le défaut anyway.

## Ce qui reste à trancher (hors scope ADR)

- Faut-il un type **`opposed_to`** distinct de **`enemy_of`** (l'un idéologique, l'autre actif) ? Ou suffit-il du champ `description` libre sur la relation pour nuancer ? → trancher en P1.
- Faut-il **pondérer** une relation (intensité 1-5) ? → reporté en P2 si besoin.
