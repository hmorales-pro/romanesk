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

/**
 * Contenu typé attendu pour un Personnage.
 * Stocké dans `lore_entities.content_json` côté DB.
 *
 * `biography` est typé `unknown` parce qu'il peut être :
 * - `null` : pas de biographie
 * - une **string** (fiches legacy pré-J8, pré-Tiptap)
 * - un **doc ProseMirror** `{ type: "doc", content: [...] }` (J8+).
 *
 * Le composant `<TiptapEditor>` accepte les trois formats en input.
 */
export interface CharacterContent {
  archetype: string | null;
  traits: string[];
  biography: unknown;
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

/**
 * Lit un `Entity` typé Personnage et renvoie son contenu décodé,
 * tolérant aux champs manquants (par sécurité face à des fiches
 * créées avant un changement de schéma).
 */
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
