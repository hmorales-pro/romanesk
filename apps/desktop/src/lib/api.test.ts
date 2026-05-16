/**
 * Tests Vitest des wrappers de `lib/api.ts` (P15.6).
 *
 * On teste les **builders polymorphes** par kind d'entité plus les
 * wrappers à payload non trivial (rename propagé, fusion de fiches).
 * Le `invoke` Tauri est mocké globalement par `tests/setup.ts` — chaque
 * test contrôle son retour et inspecte l'appel.
 *
 * Ce qu'on vérifie :
 *   - le nom de la commande Tauri appelée est correct (snake_case)
 *   - la shape du payload côté Rust (camelCase + structure)
 *   - les transformations métier (trim, filter Boolean, fallback null)
 *   - les valeurs par défaut des stratégies de merge
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";

import {
  characterCreate,
  conceptCreate,
  entityFindMentions,
  entityMerge,
  entityRenameInUniverse,
  factionCreate,
  locationCreate,
  objectCreate,
  universeCreate,
  universeUpdate,
} from "./api";

const invokeMock = vi.mocked(invoke);

beforeEach(() => {
  invokeMock.mockReset();
  invokeMock.mockResolvedValue({} as never);
});

// ---------------------------------------------------------------------------
// Universe
// ---------------------------------------------------------------------------

describe("universeCreate", () => {
  it("convertit description undefined en null", async () => {
    await universeCreate({ name: "Tara" });
    expect(invokeMock).toHaveBeenCalledWith("universe_create", {
      name: "Tara",
      description: null,
    });
  });

  it("préserve une description fournie", async () => {
    await universeCreate({ name: "Tara", description: "univers steampunk" });
    expect(invokeMock).toHaveBeenCalledWith("universe_create", {
      name: "Tara",
      description: "univers steampunk",
    });
  });
});

describe("universeUpdate", () => {
  it("permet de passer name seul sans toucher description", async () => {
    await universeUpdate({ id: "abc", name: "Tara v2" });
    expect(invokeMock).toHaveBeenCalledWith("universe_update", {
      id: "abc",
      name: "Tara v2",
      description: null,
    });
  });
});

// ---------------------------------------------------------------------------
// Builders polymorphes par EntityType
// ---------------------------------------------------------------------------

describe("characterCreate", () => {
  it("envoie kind=Character et nettoie les traits", async () => {
    await characterCreate({
      universeId: "u1",
      name: "Aldwen",
      summary: "  héros déchu  ",
      archetype: "  héros  ",
      traits: ["  noble  ", "", "loyal", "   "],
      biography: { type: "doc", content: [] },
    });
    expect(invokeMock).toHaveBeenCalledTimes(1);
    const [cmd, args] = invokeMock.mock.calls[0]!;
    expect(cmd).toBe("entity_create");
    expect(args).toEqual({
      payload: {
        universeId: "u1",
        kind: "Character",
        name: "Aldwen",
        summary: "  héros déchu  ", // le summary garde son whitespace original
        content: {
          archetype: "  héros  ", // l'archetype aussi
          traits: ["noble", "loyal"], // trim + filter Boolean appliqués
          biography: { type: "doc", content: [] },
        },
        coverImage: null,
        isReal: false,
      },
    });
  });

  it("convertit summary vide en null", async () => {
    await characterCreate({ universeId: "u1", name: "Bob", summary: "   " });
    const [, args] = invokeMock.mock.calls[0]!;
    expect((args as { payload: { summary: unknown } }).payload.summary).toBeNull();
  });

  it("convertit archetype vide en null", async () => {
    await characterCreate({ universeId: "u1", name: "Bob", archetype: "" });
    const [, args] = invokeMock.mock.calls[0]!;
    expect(
      (args as { payload: { content: { archetype: unknown } } }).payload.content
        .archetype,
    ).toBeNull();
  });
});

describe("locationCreate", () => {
  it("envoie kind=Location avec kind par défaut 'other'", async () => {
    await locationCreate({ universeId: "u1", name: "Le Cratère" });
    const [cmd, args] = invokeMock.mock.calls[0]!;
    expect(cmd).toBe("entity_create");
    expect(
      (args as { payload: { kind: string; content: { kind: string } } }).payload
        .kind,
    ).toBe("Location");
    expect(
      (args as { payload: { kind: string; content: { kind: string } } }).payload
        .content.kind,
    ).toBe("other");
  });
});

describe("factionCreate", () => {
  it("envoie kind=Faction", async () => {
    await factionCreate({ universeId: "u1", name: "Les Cendres" });
    const [, args] = invokeMock.mock.calls[0]!;
    expect((args as { payload: { kind: string } }).payload.kind).toBe("Faction");
  });
});

describe("objectCreate", () => {
  it("envoie kind=Object", async () => {
    await objectCreate({ universeId: "u1", name: "L'Anneau" });
    const [, args] = invokeMock.mock.calls[0]!;
    expect((args as { payload: { kind: string } }).payload.kind).toBe("Object");
  });
});

describe("conceptCreate", () => {
  it("envoie kind=Concept", async () => {
    await conceptCreate({ universeId: "u1", name: "L'Équilibre" });
    const [, args] = invokeMock.mock.calls[0]!;
    expect((args as { payload: { kind: string } }).payload.kind).toBe("Concept");
  });
});

// ---------------------------------------------------------------------------
// Rename propagé (P14.1)
// ---------------------------------------------------------------------------

describe("entityFindMentions", () => {
  it("appelle entity_find_mentions avec l'id passé en camelCase", async () => {
    invokeMock.mockResolvedValueOnce({ currentName: "Aldwen", mentions: [] });
    const res = await entityFindMentions("abc-123");
    expect(invokeMock).toHaveBeenCalledWith("entity_find_mentions", {
      entityId: "abc-123",
    });
    expect(res.currentName).toBe("Aldwen");
  });
});

describe("entityRenameInUniverse", () => {
  it("wrap les args dans { payload: ... } en camelCase", async () => {
    invokeMock.mockResolvedValueOnce({
      renamedEntity: { id: "x" },
      chaptersUpdated: 0,
      entitiesUpdated: 0,
    });
    await entityRenameInUniverse({
      entityId: "abc",
      newName: "Galore",
      locations: [
        { kind: "chapter", chapterId: "c1" },
        { kind: "entityField", entityId: "e1", field: "biographyText" },
      ],
    });
    expect(invokeMock).toHaveBeenCalledWith("entity_rename_in_universe", {
      payload: {
        entityId: "abc",
        newName: "Galore",
        locations: [
          { kind: "chapter", chapterId: "c1" },
          { kind: "entityField", entityId: "e1", field: "biographyText" },
        ],
      },
    });
  });
});

// ---------------------------------------------------------------------------
// Fusion de fiches (P14.2)
// ---------------------------------------------------------------------------

describe("entityMerge", () => {
  it("applique les stratégies par défaut quand non précisées", async () => {
    invokeMock.mockResolvedValueOnce({
      mergedEntity: { id: "t" },
      chaptersRenamed: 0,
      entitiesRenamed: 0,
      relationsMigrated: 0,
      tagsMigrated: 0,
      snapshotsMigrated: 0,
    });
    await entityMerge({ sourceId: "s", targetId: "t" });
    expect(invokeMock).toHaveBeenCalledWith("entity_merge", {
      payload: {
        sourceId: "s",
        targetId: "t",
        summaryStrategy: "keepTarget",
        contentStrategy: "keepTarget",
        coverStrategy: "keepTarget",
      },
    });
  });

  it("respecte les stratégies fournies", async () => {
    invokeMock.mockResolvedValueOnce({
      mergedEntity: { id: "t" },
      chaptersRenamed: 0,
      entitiesRenamed: 0,
      relationsMigrated: 0,
      tagsMigrated: 0,
      snapshotsMigrated: 0,
    });
    await entityMerge({
      sourceId: "s",
      targetId: "t",
      summaryStrategy: "concat",
      contentStrategy: "keepSource",
      coverStrategy: "keepSource",
    });
    expect(invokeMock).toHaveBeenCalledWith("entity_merge", {
      payload: {
        sourceId: "s",
        targetId: "t",
        summaryStrategy: "concat",
        contentStrategy: "keepSource",
        coverStrategy: "keepSource",
      },
    });
  });
});
