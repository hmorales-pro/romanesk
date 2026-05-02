/**
 * Types domain TS — miroir de `crates/core/src/domain.rs`.
 *
 * Convention : tous les UUID sont des strings hyphenated (ex. UUIDv7).
 * Les timestamps sont des strings ISO-8601 UTC (sortie de `serde::Serialize`
 * sur `chrono::DateTime<Utc>`).
 */

export type Uuid = string;
export type Timestamp = string;

export type EntityType =
  | "Character"
  | "Location"
  | "Faction"
  | "Object"
  | "Concept"
  | "RealEntity";

export interface Universe {
  id: Uuid;
  name: string;
  description: string | null;
  /** JSON libre — langue, genres, calendrier, etc. */
  settings: Record<string, unknown>;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface Entity {
  id: Uuid;
  universe_id: Uuid;
  /** Sérialisé sous le nom JSON `type` (mot-clé Rust → renommé). */
  type: EntityType;
  name: string;
  summary: string | null;
  content: Record<string, unknown>;
  cover_image: string | null;
  is_real: boolean;
  created_at: Timestamp;
  updated_at: Timestamp;
}

// ---------------------------------------------------------------------------
// Contenus typés par EntityType (vivent dans `entity.content`)
// ---------------------------------------------------------------------------

/**
 * Contenu typé d'un Personnage. Stocké dans `lore_entities.content_json`.
 *
 * `biography` est typé `unknown` parce qu'il peut être :
 * - `null` : pas de biographie
 * - une **string** (fiches legacy pré-J8, pré-Tiptap)
 * - un **doc ProseMirror** `{ type: "doc", content: [...] }` (J8+).
 */
export interface CharacterContent {
  archetype: string | null;
  traits: string[];
  biography: unknown;
}

/** Sous-type d'un Lieu (pour le rendu — pas de logique métier liée). */
export type LocationKind =
  | "city"
  | "region"
  | "building"
  | "naturalFeature"
  | "celestial"
  | "other";

/**
 * Contenu typé d'un Lieu. Stocké dans `lore_entities.content_json`.
 * `description` est un doc Tiptap (riche) ou `null`.
 */
export interface LocationContent {
  kind: LocationKind;
  climate: string | null;
  population: string | null;
  description: unknown;
}

// ---------------------------------------------------------------------------
// Helpers de décodage (tolérants aux fields manquants)
// ---------------------------------------------------------------------------

export function characterContent(entity: Entity): CharacterContent {
  const c = entity.content as Partial<CharacterContent>;
  return {
    archetype: typeof c.archetype === "string" ? c.archetype : null,
    traits: Array.isArray(c.traits)
      ? c.traits.filter((t): t is string => typeof t === "string")
      : [],
    biography: c.biography ?? null,
  };
}

const VALID_LOCATION_KINDS: LocationKind[] = [
  "city",
  "region",
  "building",
  "naturalFeature",
  "celestial",
  "other",
];

export function locationContent(entity: Entity): LocationContent {
  const c = entity.content as Partial<LocationContent>;
  const kind: LocationKind =
    typeof c.kind === "string" && (VALID_LOCATION_KINDS as string[]).includes(c.kind)
      ? (c.kind as LocationKind)
      : "other";
  return {
    kind,
    climate: typeof c.climate === "string" ? c.climate : null,
    population: typeof c.population === "string" ? c.population : null,
    description: c.description ?? null,
  };
}

/** Libellé humain pour un EntityType (UI). */
export function entityTypeLabel(type: EntityType): string {
  switch (type) {
    case "Character":
      return "Personnage";
    case "Location":
      return "Lieu";
    case "Faction":
      return "Faction";
    case "Object":
      return "Objet";
    case "Concept":
      return "Concept";
    case "RealEntity":
      return "Entité réelle";
  }
}

/** Libellé humain pour un sous-type de Lieu. */
export function locationKindLabel(kind: LocationKind): string {
  switch (kind) {
    case "city":
      return "Ville";
    case "region":
      return "Région";
    case "building":
      return "Bâtiment";
    case "naturalFeature":
      return "Élément naturel";
    case "celestial":
      return "Corps céleste";
    case "other":
      return "Autre";
  }
}

// ---------------------------------------------------------------------------
// Relation (graphe de lore)
// ---------------------------------------------------------------------------

/**
 * Set figé des 14 types de relations en v1 (cf. ADR 0003).
 * Sérialisé en snake_case côté Rust → on reflète les mêmes strings ici.
 */
export type RelationType =
  | "ally_of"
  | "enemy_of"
  | "mentor_of"
  | "parent_of"
  | "sibling_of"
  | "married_to"
  | "member_of"
  | "leader_of"
  | "ruled_over"
  | "located_in"
  | "owns"
  | "created"
  | "derived_from"
  | "mentions";

export const RELATION_TYPES: RelationType[] = [
  "ally_of",
  "enemy_of",
  "mentor_of",
  "parent_of",
  "sibling_of",
  "married_to",
  "member_of",
  "leader_of",
  "ruled_over",
  "located_in",
  "owns",
  "created",
  "derived_from",
  "mentions",
];

const SYMMETRIC_RELATIONS: Set<RelationType> = new Set([
  "ally_of",
  "enemy_of",
  "sibling_of",
  "married_to",
]);

export function isSymmetric(type: RelationType): boolean {
  return SYMMETRIC_RELATIONS.has(type);
}

/**
 * Libellé humain pour un type de relation, sous deux formes :
 * - active : « est mentor de » (utilisée quand l'entité est SOURCE)
 * - passive : « a pour mentor » (utilisée quand l'entité est TARGET)
 *
 * Pour les types symétriques (ally_of…), les deux formes sont identiques.
 */
export function relationTypeLabel(
  type: RelationType,
  direction: "active" | "passive" = "active",
): string {
  switch (type) {
    case "ally_of":
      return "allié de";
    case "enemy_of":
      return "ennemi de";
    case "mentor_of":
      return direction === "active" ? "mentor de" : "a pour mentor";
    case "parent_of":
      return direction === "active" ? "parent de" : "enfant de";
    case "sibling_of":
      return "frère/sœur de";
    case "married_to":
      return "marié(e) à";
    case "member_of":
      return direction === "active" ? "membre de" : "compte parmi ses membres";
    case "leader_of":
      return direction === "active" ? "dirige" : "est dirigé par";
    case "ruled_over":
      return direction === "active" ? "a régné sur" : "a été gouverné par";
    case "located_in":
      return direction === "active" ? "situé dans" : "contient";
    case "owns":
      return direction === "active" ? "possède" : "appartient à";
    case "created":
      return direction === "active" ? "a créé" : "créé par";
    case "derived_from":
      return direction === "active" ? "dérive de" : "a inspiré";
    case "mentions":
      return direction === "active" ? "mentionne" : "mentionné par";
  }
}

export interface Relation {
  id: Uuid;
  source_id: Uuid;
  target_id: Uuid;
  /** Sérialisé sous le nom JSON `type`. */
  type: RelationType;
  era_id: Uuid | null;
  description: string | null;
  created_at: Timestamp;
}

// ---------------------------------------------------------------------------
// Tag (transversal, par univers)
// ---------------------------------------------------------------------------

export interface Tag {
  id: Uuid;
  universe_id: Uuid;
  name: string;
  /** Couleur hex CSS (ex. "#94a3b8") ou null (couleur par défaut). */
  color: string | null;
}

// ---------------------------------------------------------------------------
// Timeline (Era / Event / Snapshot)
// ---------------------------------------------------------------------------

export interface Era {
  id: Uuid;
  universe_id: Uuid;
  name: string;
  start_year: number | null;
  end_year: number | null;
  description: string | null;
  color: string | null;
  sort_order: number;
  created_at: Timestamp;
}

export interface Event {
  id: Uuid;
  universe_id: Uuid;
  era_id: Uuid | null;
  name: string;
  year: number | null;
  description: string | null;
  created_at: Timestamp;
}

export interface Snapshot {
  id: Uuid;
  entity_id: Uuid;
  era_id: Uuid | null;
  event_id: Uuid | null;
  year_in_universe: number | null;
  snapshot_json: Record<string, unknown>;
  note: string | null;
  created_at: Timestamp;
}

/** Format compact pour afficher la plage d'années d'une era. */
export function eraYearsLabel(era: Era): string {
  if (era.start_year == null && era.end_year == null) return "—";
  const fmt = (y: number) => (y < 0 ? `${-y} av.` : `${y}`);
  if (era.start_year != null && era.end_year != null) {
    return `${fmt(era.start_year)} → ${fmt(era.end_year)}`;
  }
  if (era.start_year != null) return `dès ${fmt(era.start_year)}`;
  return `jusqu'à ${fmt(era.end_year!)}`;
}
