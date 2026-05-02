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
