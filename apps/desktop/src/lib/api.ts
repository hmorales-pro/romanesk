/**
 * Wrappers typés autour des commandes Tauri exposées par
 * `apps/desktop/src-tauri/src/commands/`.
 *
 * Chaque fonction est nommée comme la commande Rust pour faciliter le
 * grep. Toutes les erreurs côté Rust sont sérialisées en string par
 * `CommandError`, donc ce qui remonte dans le `catch` est un string.
 */

import { invoke } from "@tauri-apps/api/core";
import type { Entity, Universe, Uuid } from "./types";

// --- Universe ---------------------------------------------------------------

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

// --- Entity -----------------------------------------------------------------

export function entityListInUniverse(universeId: Uuid): Promise<Entity[]> {
  return invoke<Entity[]>("entity_list_in_universe", { universeId });
}

export interface CreateEntityArgs {
  universeId: Uuid;
  name: string;
  summary?: string;
  archetype?: string;
  traits?: string[];
  biography?: string;
}

export function entityCreate(args: CreateEntityArgs): Promise<Entity> {
  // Tauri 2 sérialise les arguments d'`invoke` en JSON et matche les noms
  // selon la convention serde (`#[serde(rename_all = "camelCase")]`
  // côté Rust pour `CreateEntityPayload`). Le wrapper attend donc bien
  // `payload: { universeId, name, ... }`.
  return invoke<Entity>("entity_create", {
    payload: {
      universeId: args.universeId,
      name: args.name,
      summary: args.summary ?? null,
      archetype: args.archetype ?? null,
      traits: args.traits ?? [],
      biography: args.biography ?? null,
    },
  });
}

export function entityGet(id: Uuid): Promise<Entity | null> {
  return invoke<Entity | null>("entity_get", { id });
}

export function entityDelete(id: Uuid): Promise<void> {
  return invoke<void>("entity_delete", { id });
}

// --- Healthcheck ------------------------------------------------------------

export interface PingResult {
  message: string;
  echoed_at: string;
}

export function ping(): Promise<PingResult> {
  return invoke<PingResult>("ping");
}
