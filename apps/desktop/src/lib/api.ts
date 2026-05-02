/**
 * Wrappers typés autour des commandes Tauri exposées par
 * `apps/desktop/src-tauri/src/commands/`.
 *
 * Convention :
 * - Les commandes Rust sont génériques sur `EntityType`.
 * - Les builders TS (`characterCreate`, `locationCreate`, …) construisent
 *   le `content` JSON typé selon le sous-type avant d'appeler la commande
 *   générique.
 */

import { invoke } from "@tauri-apps/api/core";
import type {
  Entity,
  EntityType,
  LocationKind,
  Relation,
  RelationType,
  Universe,
  Uuid,
} from "./types";

// ---------------------------------------------------------------------------
// Universe
// ---------------------------------------------------------------------------

export function universeList(): Promise<Universe[]> {
  return invoke<Universe[]>("universe_list");
}

export function universeCreate(args: {
  name: string;
  description?: string;
}): Promise<Universe> {
  return invoke<Universe>("universe_create", {
    name: args.name,
    description: args.description ?? null,
  });
}

export function universeGet(id: Uuid): Promise<Universe | null> {
  return invoke<Universe | null>("universe_get", { id });
}

export function universeDelete(id: Uuid): Promise<void> {
  return invoke<void>("universe_delete", { id });
}

export function universeExportMarkdown(id: Uuid): Promise<string> {
  return invoke<string>("universe_export_markdown", { id });
}

// ---------------------------------------------------------------------------
// Entity — bas niveau (générique sur EntityType)
// ---------------------------------------------------------------------------

interface CreateEntityPayload {
  universeId: Uuid;
  kind: EntityType;
  name: string;
  summary: string | null;
  content: Record<string, unknown>;
  coverImage: string | null;
  isReal: boolean;
}

interface UpdateEntityPayload {
  id: Uuid;
  name: string;
  summary: string | null;
  content: Record<string, unknown>;
  coverImage: string | null;
  isReal: boolean;
}

function entityCreateRaw(payload: CreateEntityPayload): Promise<Entity> {
  return invoke<Entity>("entity_create", { payload });
}

function entityUpdateRaw(payload: UpdateEntityPayload): Promise<Entity> {
  return invoke<Entity>("entity_update", { payload });
}

/**
 * Liste les entités d'un univers, optionnellement filtrées par type.
 * Pas de filtre = tous types confondus.
 */
export function entityListInUniverse(
  universeId: Uuid,
  kind?: EntityType,
): Promise<Entity[]> {
  return invoke<Entity[]>("entity_list_in_universe", {
    universeId,
    kind: kind ?? null,
  });
}

export function entityGet(id: Uuid): Promise<Entity | null> {
  return invoke<Entity | null>("entity_get", { id });
}

export function entityDelete(id: Uuid): Promise<void> {
  return invoke<void>("entity_delete", { id });
}

// ---------------------------------------------------------------------------
// Builders typés par EntityType
// ---------------------------------------------------------------------------

// --- Character --------------------------------------------------------------

export interface CreateCharacterArgs {
  universeId: Uuid;
  name: string;
  summary?: string;
  archetype?: string;
  traits?: string[];
  /** Doc ProseMirror, string (legacy) ou null. */
  biography?: unknown;
}

export function characterCreate(args: CreateCharacterArgs): Promise<Entity> {
  return entityCreateRaw({
    universeId: args.universeId,
    kind: "Character",
    name: args.name,
    summary: args.summary?.trim() ? args.summary : null,
    content: {
      archetype: args.archetype?.trim() ? args.archetype : null,
      traits: (args.traits ?? []).map((t) => t.trim()).filter(Boolean),
      biography: args.biography ?? null,
    },
    coverImage: null,
    isReal: false,
  });
}

export interface UpdateCharacterArgs {
  id: Uuid;
  name: string;
  summary?: string;
  archetype?: string;
  traits?: string[];
  biography?: unknown;
}

export function characterUpdate(args: UpdateCharacterArgs): Promise<Entity> {
  return entityUpdateRaw({
    id: args.id,
    name: args.name,
    summary: args.summary?.trim() ? args.summary : null,
    content: {
      archetype: args.archetype?.trim() ? args.archetype : null,
      traits: (args.traits ?? []).map((t) => t.trim()).filter(Boolean),
      biography: args.biography ?? null,
    },
    coverImage: null,
    isReal: false,
  });
}

// --- Location ---------------------------------------------------------------

export interface CreateLocationArgs {
  universeId: Uuid;
  name: string;
  summary?: string;
  kind?: LocationKind;
  climate?: string;
  population?: string;
  /** Doc ProseMirror ou null. */
  description?: unknown;
}

export function locationCreate(args: CreateLocationArgs): Promise<Entity> {
  return entityCreateRaw({
    universeId: args.universeId,
    kind: "Location",
    name: args.name,
    summary: args.summary?.trim() ? args.summary : null,
    content: {
      kind: args.kind ?? "other",
      climate: args.climate?.trim() ? args.climate : null,
      population: args.population?.trim() ? args.population : null,
      description: args.description ?? null,
    },
    coverImage: null,
    isReal: false,
  });
}

export interface UpdateLocationArgs {
  id: Uuid;
  name: string;
  summary?: string;
  kind?: LocationKind;
  climate?: string;
  population?: string;
  description?: unknown;
}

export function locationUpdate(args: UpdateLocationArgs): Promise<Entity> {
  return entityUpdateRaw({
    id: args.id,
    name: args.name,
    summary: args.summary?.trim() ? args.summary : null,
    content: {
      kind: args.kind ?? "other",
      climate: args.climate?.trim() ? args.climate : null,
      population: args.population?.trim() ? args.population : null,
      description: args.description ?? null,
    },
    coverImage: null,
    isReal: false,
  });
}

// ---------------------------------------------------------------------------
// Relation
// ---------------------------------------------------------------------------

export interface CreateRelationArgs {
  sourceId: Uuid;
  targetId: Uuid;
  type: RelationType;
  description?: string;
  /** Optionnel — Phase 2+ avec les époques. */
  eraId?: Uuid;
}

export function relationCreate(args: CreateRelationArgs): Promise<Relation> {
  return invoke<Relation>("relation_create", {
    payload: {
      sourceId: args.sourceId,
      targetId: args.targetId,
      type: args.type,
      description: args.description ?? null,
      eraId: args.eraId ?? null,
    },
  });
}

export function relationListForEntity(entityId: Uuid): Promise<Relation[]> {
  return invoke<Relation[]>("relation_list_for_entity", { entityId });
}

export function relationListInUniverse(universeId: Uuid): Promise<Relation[]> {
  return invoke<Relation[]>("relation_list_in_universe", { universeId });
}

export function relationDelete(id: Uuid): Promise<void> {
  return invoke<void>("relation_delete", { id });
}

// ---------------------------------------------------------------------------
// Healthcheck
// ---------------------------------------------------------------------------

export interface PingResult {
  message: string;
  echoed_at: string;
}

export function ping(): Promise<PingResult> {
  return invoke<PingResult>("ping");
}
